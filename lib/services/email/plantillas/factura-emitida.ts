import { sumaDeCuotas } from "@/components/shared/facturas/facturas-vista";
import { formatearMontoEn, MONEDA_DE_LOS_PLANES, SIN_MONTO_RAYA } from "@/lib/config/moneda";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { periodoDeFactura, textoFacturaEmitida } from "@/lib/notificaciones/emitir";
import { aCentimos, aTexto } from "@/lib/planes/centimos";
import { componerCorreo, type Bloque } from "@/lib/services/email/plantillas/plantilla-marca";
import type { FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";

// SLT-136 (design §7.4; R26, R29) — el correo a cada maestro activo cuando se cierra una factura de la plataforma.
// Lleva importes, a diferencia de la campanita (regla 146 §4.6): son los de la base, pintados con `importeDelCorreo()` y sin
// recalcular nada salvo la suma de las dos cuotas (`sumaDeCuotas`, en céntimos exactos). No lleva adjuntos (R26): la
// descarga está en «Mi plan». Todo dato variable lo escapa `componerCorreo`.

/**
 * SL-21 (R15): un importe de la factura con la moneda de los planes, la de la plataforma, sea cual sea el país de la
 * empresa (hasta SLT-237). Pinta lo mismo que el `money()` de antes.
 */
function importeDelCorreo(valor: string): string {
  return formatearMontoEn(MONEDA_DE_LOS_PLANES, valor, SIN_MONTO_RAYA);
}

/** Los literales del correo, en un sitio para cuando llegue la i18n. */
export const FACTURA_EMITIDA_TEXTOS = {
  asunto: (numero: number, empresa: string) => `Factura N.º ${numero} de la plataforma — ${empresa}`,
  preheader: (total: string) => `Total a pagar ${total}`,
  saludo: (nombre: string) => `Hola, ${nombre}:`,
  /**
   * La frase de la campanita, sin copia: el emisor central es el dueño del texto del aviso (146 §4.6), así que el
   * correo y la campanita no pueden divergir.
   */
  periodo: textoFacturaEmitida,
  cuota: "Cuota del plan",
  cargos: "Cargos por orden",
  reversos: "Reversos de cargos",
  total: "Total a pagar",
  boton: "Ver factura",
  /** R29: sin la URL de la app no hay botón; el correo dice dónde está la factura. */
  sinUrl: "Encuéntrala en Mi plan, dentro de la app.",
} as const;

export interface FacturaEmitidaParams {
  /** Email de un maestro activo de la empresa. */
  to: string;
  nombre: string;
  empresaNombre: string;
  /** La factura cerrada, tal como la lee `deLaEmpresa()`. */
  factura: Pick<
    FacturaPlataformaDTO,
    "numero" | "desde" | "hasta" | "cargos" | "reversos" | "cuota" | "primeraCuota" | "total"
  >;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
  /** URL base de la app (`baseUrlDeLaApp()`), o `null`: sin ella, sin botón (R29). */
  urlApp: string | null;
}

/**
 * R26, R29: asunto con número y empresa; saludo; período; cuota (la de la emisión más la primera cuota, o ₡0,00),
 * cargos, reversos en negativo y total de la base; y el botón «Ver factura» a «Mi plan», o la nota si no hay URL.
 * Lanza si la factura no tiene número: solo se avisa una cerrada.
 */
export function plantillaFacturaEmitida(p: FacturaEmitidaParams): EmailMessage {
  const T = FACTURA_EMITIDA_TEXTOS;
  const { factura } = p;
  if (factura.numero === null) throw new Error("plantillaFacturaEmitida: la factura no está cerrada (sin número)");

  const linea = (concepto: string, importe: string): Bloque => ({ tipo: "parrafo", texto: `${concepto}: ${importeDelCorreo(importe)}` });
  const bloques: Bloque[] = [
    { tipo: "parrafo", texto: T.saludo(p.nombre) },
    { tipo: "parrafo", texto: T.periodo(factura.numero, periodoDeFactura(factura.desde, factura.hasta)) },
    linea(T.cuota, sumaDeCuotas(factura) ?? "0.00"),
    linea(T.cargos, factura.cargos),
    linea(T.reversos, aTexto(-aCentimos(factura.reversos))),
    linea(T.total, factura.total),
    p.urlApp === null
      ? { tipo: "nota", texto: T.sinUrl }
      : { tipo: "boton", texto: T.boton, url: `${p.urlApp}/mi-plan` },
  ];

  return componerCorreo({
    to: p.to,
    asunto: T.asunto(factura.numero, p.empresaNombre),
    preheader: T.preheader(importeDelCorreo(factura.total)),
    bloques,
    contacto: p.contacto,
  });
}
