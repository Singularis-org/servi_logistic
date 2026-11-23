import { formatearMontoEn, MONEDA_DE_LOS_PLANES, SIN_MONTO_RAYA } from "@/lib/config/moneda";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { fechaLegible } from "@/lib/planes/mora";
import { componerCorreo, type Bloque } from "@/lib/services/email/plantillas/plantilla-marca";

// SLT-121 (design §4.2; R26, R27, R28) — los tres correos de la mora a cada maestro activo: el recordatorio de la
// víspera, el aviso de congelamiento y el de operación activa de nuevo. Los envía `mora_aviso_correo`
// (`lib/planes/jobs-mora.ts`) después de releer el estado, así que la plantilla no decide nada: pinta lo que recibe.
// Todo dato variable lo escapa `componerCorreo`. El botón lleva a «Mi plan», como el de la factura emitida (SLT-136):
// esta plantilla está en la lista de `mi-plan-solo-maestro.guardia` porque solo va a maestros.
// SLT-255 (design §4.3; R16, R17, R18, R22) suma los tres correos de la prórroga y el recordatorio durante el plazo,
// que dice hasta cuándo corre en lugar de «se congela». Los preheaders de la prórroga repiten la primera frase del
// cuerpo: el spec no fija otros.

/** Los importes de la mora son de facturas de la plataforma: la moneda de los planes, sea cual sea la empresa. */
function importeDelCorreo(valor: string): string {
  return formatearMontoEn(MONEDA_DE_LOS_PLANES, valor, SIN_MONTO_RAYA);
}

/** Los literales del correo, en un sitio para cuando llegue la i18n. */
export const MORA_AVISO_TEXTOS = {
  saludo: (nombre: string) => `Hola, ${nombre}:`,
  boton: "Ver facturas",
  sinUrl: "Encuentra tus facturas en Mi plan, dentro de la app.",
  recordatorio: {
    asunto: (numero: number) => `Tu factura N.º ${numero} vence mañana`,
    preheader: (fechaLimite: string) => `Fecha límite ${fechaLegible(fechaLimite)}`,
    cuerpo: (numero: number, empresa: string, fechaLimite: string) =>
      `La factura N.º ${numero} de la plataforma de ${empresa} vence mañana, ${fechaLegible(fechaLimite)}.`,
    saldo: "Saldo por pagar",
    consecuencia: "Si no se paga a tiempo, la operación de la empresa se congela la madrugada siguiente a la fecha límite.",
    conPlazo: (hasta: string) => `Tienes prórroga de pago hasta el ${fechaLegible(hasta)}.`,
  },
  congelada: {
    asunto: (empresa: string) => `La operación de ${empresa} está congelada por falta de pago`,
    preheader: (saldo: string) => `Saldo vencido ${saldo}`,
    cuerpo: (empresa: string) => `La operación de ${empresa} está congelada porque tiene facturas de la plataforma vencidas.`,
    factura: (numero: number, saldo: string) => `Factura N.º ${numero}: ${saldo}`,
    saldo: "Saldo vencido",
    queHacer:
      "Puedes seguir entrando y ver tus datos, cambiar tu cuenta y pagar a la plataforma desde la wallet. " +
      "Cuando se confirme el pago de las facturas vencidas, la operación vuelve a estar activa.",
  },
  descongelada: {
    asunto: (empresa: string) => `La operación de ${empresa} está activa de nuevo`,
    preheader: "Tu operación está activa de nuevo",
    cuerpo: (empresa: string) => `La operación de ${empresa} está activa de nuevo.`,
    pago: "Se registró el pago de las facturas vencidas.",
    gracia: "El plazo de pago cambió y ya no hay facturas vencidas.",
    aMano: (hasta: string) => `La plataforma habilitó la operación hasta el ${fechaLegible(hasta)}.`,
  },
  prorroga: {
    asuntoDada: (hasta: string) => `Tienes prórroga de pago hasta el ${fechaLegible(hasta)}`,
    asuntoCambiada: (hasta: string) => `Tu prórroga de pago cambió: ahora vence el ${fechaLegible(hasta)}`,
    cuerpo: (empresa: string, hasta: string) =>
      `La plataforma dio a ${empresa} plazo para pagar las facturas pendientes hasta el ${fechaLegible(hasta)}.`,
    consecuencia: "Si para entonces no se pagan las facturas vencidas, la operación se congela la madrugada siguiente.",
  },
  prorrogaQuitada: {
    asunto: "Tu prórroga de pago se quitó",
    cuerpo: (empresa: string) => `La plataforma quitó la prórroga de pago de ${empresa}.`,
    conVencidas: "Como hay facturas vencidas sin pagar, la operación se congela la madrugada siguiente.",
  },
  prorrogaVence: {
    asunto: "Tu prórroga de pago vence mañana",
    cuerpo: (empresa: string, hasta: string) =>
      `La prórroga de pago de ${empresa} vence mañana, ${fechaLegible(hasta)}. Si no se pagan las facturas ` +
      "vencidas, la operación se congela la madrugada siguiente.",
  },
} as const;

/** Lo que dice cada correo, ya releído del estado por el trabajo. Las fechas son `AAAA-MM-DD`. */
export type ContenidoAvisoMora =
  // SLT-255 R22: `plazoHasta`, si hay un plazo vigente que cubre la fecha límite.
  | { tipo: "recordatorio"; numero: number; saldo: string; fechaLimite: string; plazoHasta?: string }
  | { tipo: "congelada"; facturas: readonly { numero: number; saldo: string }[]; saldoVencido: string }
  | { tipo: "descongelada"; motivo: "pago" | "a_mano" | "gracia"; hasta?: string }
  | { tipo: "prorroga"; cambio: "dada" | "alargada" | "acortada"; hasta: string }
  | { tipo: "prorroga_quitada"; conVencidas: boolean }
  | { tipo: "prorroga_vence"; hasta: string };

export interface MoraAvisoParams {
  /** Email de un maestro activo de la empresa. */
  to: string;
  nombre: string;
  empresaNombre: string;
  contenido: ContenidoAvisoMora;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
  /** URL base de la app, o `null`: sin ella, sin botón. */
  urlApp: string | null;
}

function cuerpoYAsunto(
  c: ContenidoAvisoMora,
  empresa: string,
): { asunto: string; preheader: string; bloques: Bloque[] } {
  if (c.tipo === "recordatorio") {
    const T = MORA_AVISO_TEXTOS.recordatorio;
    return {
      asunto: T.asunto(c.numero),
      preheader: T.preheader(c.fechaLimite),
      bloques: [
        { tipo: "parrafo", texto: T.cuerpo(c.numero, empresa, c.fechaLimite) },
        { tipo: "parrafo", texto: `${T.saldo}: ${importeDelCorreo(c.saldo)}` },
        { tipo: "parrafo", texto: c.plazoHasta === undefined ? T.consecuencia : T.conPlazo(c.plazoHasta) },
      ],
    };
  }
  if (c.tipo === "prorroga") {
    const T = MORA_AVISO_TEXTOS.prorroga;
    const cuerpo = T.cuerpo(empresa, c.hasta);
    return {
      asunto: c.cambio === "dada" ? T.asuntoDada(c.hasta) : T.asuntoCambiada(c.hasta),
      preheader: cuerpo,
      bloques: [
        { tipo: "parrafo", texto: cuerpo },
        { tipo: "parrafo", texto: T.consecuencia },
      ],
    };
  }
  if (c.tipo === "prorroga_quitada") {
    const T = MORA_AVISO_TEXTOS.prorrogaQuitada;
    const cuerpo = T.cuerpo(empresa);
    return {
      asunto: T.asunto,
      preheader: cuerpo,
      bloques: [
        { tipo: "parrafo", texto: cuerpo },
        ...(c.conVencidas ? [{ tipo: "parrafo", texto: T.conVencidas } satisfies Bloque] : []),
      ],
    };
  }
  if (c.tipo === "prorroga_vence") {
    const T = MORA_AVISO_TEXTOS.prorrogaVence;
    const cuerpo = T.cuerpo(empresa, c.hasta);
    return { asunto: T.asunto, preheader: cuerpo, bloques: [{ tipo: "parrafo", texto: cuerpo }] };
  }
  if (c.tipo === "congelada") {
    const T = MORA_AVISO_TEXTOS.congelada;
    const saldo = importeDelCorreo(c.saldoVencido);
    return {
      asunto: T.asunto(empresa),
      preheader: T.preheader(saldo),
      bloques: [
        { tipo: "parrafo", texto: T.cuerpo(empresa) },
        ...c.facturas.map((f): Bloque => ({ tipo: "parrafo", texto: T.factura(f.numero, importeDelCorreo(f.saldo)) })),
        { tipo: "parrafo", texto: `${T.saldo}: ${saldo}` },
        { tipo: "parrafo", texto: T.queHacer },
      ],
    };
  }
  const T = MORA_AVISO_TEXTOS.descongelada;
  const porque =
    c.motivo === "pago" ? T.pago : c.motivo === "gracia" ? T.gracia : c.hasta !== undefined ? T.aMano(c.hasta) : null;
  return {
    asunto: T.asunto(empresa),
    preheader: T.preheader,
    bloques: [
      { tipo: "parrafo", texto: T.cuerpo(empresa) },
      ...(porque === null ? [] : [{ tipo: "parrafo", texto: porque } satisfies Bloque]),
    ],
  };
}

/** R26-R28 (SLT-255 R16-R18, R22): saludo, lo propio de cada tipo y el botón «Ver facturas» a «Mi plan», o la nota si no hay URL. */
export function plantillaMoraAviso(p: MoraAvisoParams): EmailMessage {
  const { asunto, preheader, bloques } = cuerpoYAsunto(p.contenido, p.empresaNombre);
  return componerCorreo({
    to: p.to,
    asunto,
    preheader,
    bloques: [
      { tipo: "parrafo", texto: MORA_AVISO_TEXTOS.saludo(p.nombre) },
      ...bloques,
      p.urlApp === null
        ? { tipo: "nota", texto: MORA_AVISO_TEXTOS.sinUrl }
        : { tipo: "boton", texto: MORA_AVISO_TEXTOS.boton, url: `${p.urlApp}/mi-plan` },
    ],
    contacto: p.contacto,
  });
}
