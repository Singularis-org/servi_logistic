import { randomUUID } from "node:crypto";
import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { ErrorDeConfirmacion } from "@/lib/db/errores-pago-plataforma";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IPagoPlataformaConfirmacionRepository } from "@/lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository";
import type { IWalletComprobanteRepository } from "@/lib/interfaces/repositories/IWalletComprobanteRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPagoPlataformaConfirmacionService } from "@/lib/interfaces/services/IPagoPlataformaConfirmacionService";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { ComprobanteRecibido, IWalletComprobanteService } from "@/lib/interfaces/services/IWalletComprobanteService";
import { aCentimos, aTexto } from "@/lib/planes/centimos";
import { registrarConComprobante } from "@/lib/services/registro-con-comprobante";
import { zonaDeLaEmpresa } from "@/lib/services/zona-de-la-empresa";
import { MENSAJE_TOPE_PAGO_PLATAFORMA } from "@/lib/types/cobro-plataforma";
import {
  anularPagoConfirmadoSchema,
  claveDeFactura,
  confirmarPagoSchema,
  registrarPagoPorFueraSchema,
  TEXTOS_CONFIRMACION,
  verComprobantePagoSchema,
  verPagosDeEmpresaSchema,
  type AnularPagoConfirmadoResult,
  type ConfirmarPagoResult,
  type RegistrarPagoPorFueraResult,
  type VerComprobantePagoResult,
  type VerPagosDeEmpresaResult,
} from "@/lib/types/pago-plataforma";
import { fechaMovimientoSchema } from "@/lib/types/wallet";
import { instanteDelMovimientoManual } from "@/lib/utils/fecha-movimiento-manual";

// SLT-60 (design §4.5) — el orden es parte del contrato: primero quién (R24: ningún rol de empresa llega a la
// base, ni para un error de validación), luego qué (zod), y al final el repositorio. La suma y los saldos los
// decide la base bajo el candado de la empresa, no este servicio: entre la lectura del superadmin y su
// confirmación otra confirmación pudo bajar un saldo.
//
// El comprobante (design §4.8; R33, R34) reutiliza el lateral de la caja de la ficha 458-B, pero no su servicio:
// `WalletComprobanteService.ver` pide acceso total y la empresa de la sesión, y el superadmin no tiene ninguna
// de las dos. Aquí la empresa la fija el servidor con `conEmpresa` (molde `ReportesBugPlataformaService`): la
// lectura del pago y del comprobante pasan por la RLS de esa empresa, y el adaptador firma dentro de su carpeta.
//
// SLT-143 (design §4.3) — registrar un pago hecho por fuera y anular uno confirmado siguen el mismo orden. El
// registro corre dentro de `conEmpresa` de la empresa pedida por dos razones: la zona del país para la fecha
// (SLT-42) y la carpeta del comprobante, que el adaptador toma de la empresa del contexto (SL-19). El
// comprobante es el molde 458-B (`registrarConComprobante`): se sube antes de escribir y se retira si el
// registro no quedó (R9). La fila del comprobante la escribe la función de la base, en la misma sentencia.

const FORBIDDEN = { estado: "forbidden" } as const;
const CERO = BigInt(0);

function esSuperadmin(actor: Actor | null): actor is Actor {
  return actor !== null && esPlataforma(actor.rol);
}

/**
 * Los errores de zod, uno por clave. El de un monto de una factura va a `aplicaciones.<facturaId>`, la misma
 * clave que usa la base, para que la pantalla lo pinte bajo su fila venga de donde venga.
 */
function erroresDeCampo(error: z.ZodError, input: unknown): Record<string, string> {
  const aplicaciones =
    input !== null && typeof input === "object" && Array.isArray((input as { aplicaciones?: unknown }).aplicaciones)
      ? ((input as { aplicaciones: unknown[] }).aplicaciones)
      : [];
  const errores: Record<string, string> = {};
  for (const issue of error.issues) {
    const [primero, indice] = issue.path;
    let clave = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (primero === "aplicaciones" && typeof indice === "number") {
      const facturaId = (aplicaciones[indice] as { facturaId?: unknown } | undefined)?.facturaId;
      if (typeof facturaId === "string" && facturaId !== "") clave = claveDeFactura(facturaId);
    }
    errores[clave] ??= issue.message;
  }
  return errores;
}

type CodigoDeReparto = Exclude<ErrorDeConfirmacion["codigo"], "pago_no_encontrado" | "pago_no_confirmado" | "motivo_vacio">;
const CODIGOS_DE_REPARTO: ReadonlySet<string> = new Set<CodigoDeReparto>([
  "factura_no_valida",
  "monto_no_positivo",
  "factura_repetida",
  "supera_saldo",
  "suma_distinta",
]);

type ErrorDeValidacion = { estado: "validation_error"; errores: Record<string, string> };

/** R15, R17: un rechazo de la base, bajo su factura si lo nombra, o en el reparto entero. */
function errorDeReparto(error: ErrorDeConfirmacion): ErrorDeValidacion {
  const texto = TEXTOS_CONFIRMACION[error.codigo as CodigoDeReparto];
  const clave = error.facturaId !== undefined ? claveDeFactura(error.facturaId) : "aplicaciones";
  return { estado: "validation_error", errores: { [clave]: texto } };
}

/** R17: los montos 0 no se guardan; los demás, normalizados a dos decimales (lo que valida la base se guarda). */
function sinCeros(aplicaciones: readonly { facturaId: string; monto: string }[]) {
  return aplicaciones
    .map((a) => ({ facturaId: a.facturaId, centimos: aCentimos(a.monto) }))
    .filter((a) => a.centimos > CERO)
    .map((a) => ({ facturaId: a.facturaId, monto: aTexto(a.centimos) }));
}

export class PagoPlataformaConfirmacionService implements IPagoPlataformaConfirmacionService {
  constructor(
    private readonly repo: IPagoPlataformaConfirmacionRepository,
    /** Construido con el cliente extendido: dentro de `conEmpresa` lee solo los de esa empresa. */
    private readonly comprobantes: Pick<IWalletComprobanteRepository, "lateralDe">,
    /** Con el bucket de los comprobantes de la wallet. */
    private readonly urls: Pick<ISignedUrlProvider, "createSignedUrl">,
    /** La duración del enlace: la misma que en la wallet (R33). */
    private readonly ttlSegundos: number,
    private readonly ahora: () => Date = () => new Date(),
    /** SLT-143 (R8, R9): el comprobante lateral de la wallet. Sin él, registrar CON comprobante lanza. */
    private readonly puertoComprobantes?: IWalletComprobanteService,
    /** SLT-143 (R7): la zona del país de la empresa, para la fecha elegida. Sin ella, registrar con fecha lanza. */
    private readonly reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
  ) {}

  async verDeEmpresa(actor: Actor | null, input: unknown): Promise<VerPagosDeEmpresaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = verPagosDeEmpresaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error, input) };
    return { estado: "ok", datos: await this.repo.leer(parsed.data.organizacionId) };
  }

  async confirmar(actor: Actor | null, input: unknown): Promise<ConfirmarPagoResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = confirmarPagoSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error, input) };

    const aplicaciones = sinCeros(parsed.data.aplicaciones);
    // Todo en 0 no reparte nada: la suma nunca es el monto de un pago (> 0).
    if (aplicaciones.length === 0) {
      return { estado: "validation_error", errores: { aplicaciones: TEXTOS_CONFIRMACION.suma_distinta } };
    }

    const r = await this.repo.confirmar({
      organizacionId: parsed.data.organizacionId,
      pagoId: parsed.data.pagoId,
      aplicaciones,
      por: actor.usuarioId,
      ahora: this.ahora(),
    });
    if (r.estado !== "rechazado") return r;
    // R20, R21: anulado, inexistente, de otra empresa o anulado mientras tanto.
    if (r.error.codigo === "pago_no_encontrado") return { estado: "not_found" };
    return errorDeReparto(r.error);
  }

  async verComprobante(actor: Actor | null, input: unknown): Promise<VerComprobantePagoResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = verComprobantePagoSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error, input) };
    const { organizacionId, pagoId } = parsed.data;
    return conEmpresa(organizacionId, async (): Promise<VerComprobantePagoResult> => {
      const pago = await this.repo.pagoDeLaEmpresa(organizacionId, pagoId);
      if (pago === null) return { estado: "not_found" };
      const objeto = await this.comprobantes.lateralDe({ caja: pago.id });
      if (objeto === null) return { estado: "sin_comprobante" };
      // R33: solo el enlace y el tipo; la ruta en el bucket no sale del servidor.
      const url = await this.urls.createSignedUrl(objeto.storagePath, this.ttlSegundos);
      return { estado: "ok", url, contentType: objeto.contentType };
    });
  }

  async registrarPorFuera(
    actor: Actor | null,
    input: unknown,
    comprobante: ComprobanteRecibido | null,
  ): Promise<RegistrarPagoPorFueraResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN; // R31
    const parsed = registrarPagoPorFueraSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error, input) }; // R7
    const aplicaciones = sinCeros(parsed.data.aplicaciones);
    if (aplicaciones.length === 0) {
      return { estado: "validation_error", errores: { aplicaciones: TEXTOS_CONFIRMACION.suma_distinta } }; // R5
    }
    const { organizacionId, fecha: dia } = parsed.data;

    return conEmpresa(organizacionId, async (): Promise<RegistrarPagoPorFueraResult> => {
      const ahora = this.ahora();
      // R7: la fecha con las reglas del egreso manual (SL-45 R12), en la zona del país de la empresa (SLT-42).
      // Solo se lee la zona si hay fecha; sin fecha, la del servidor.
      let fecha: Date | null = null;
      if (dia !== undefined && dia !== "") {
        const zona = await zonaDeLaEmpresa(this.reglasPais, "PagoPlataformaConfirmacionService.registrarPorFuera");
        const valida = fechaMovimientoSchema(zona).safeParse(dia);
        if (!valida.success) {
          return { estado: "validation_error", errores: { fecha: valida.error.issues[0]?.message ?? "Fecha no válida." } };
        }
        fecha = instanteDelMovimientoManual(valida.data, zona, ahora) ?? null;
      }

      const r = await registrarConComprobante(this.puertoComprobantes, "wallet_movimiento", comprobante, async (guardado) => {
        const res = await this.repo.registrarPorFuera({
          organizacionId,
          pagoId: randomUUID(),
          monto: parsed.data.monto,
          fecha,
          referencia: parsed.data.referencia,
          claveIdempotencia: parsed.data.claveIdempotencia,
          aplicaciones,
          por: actor.usuarioId,
          ahora,
          comprobante: guardado,
        });
        // R9: solo un registro escrito conserva el archivo; `ya_registrado` también lo retira (no es de este envío).
        return { quedo: res.estado === "ok", resultado: res };
      });

      if ("status" in r) {
        if (r.status === "comprobante_no_guardado") return { estado: "comprobante_no_guardado" };
        return { estado: "validation_error", errores: { comprobante: r.fieldErrors.comprobante?.[0] ?? "Comprobante no válido." } };
      }
      switch (r.estado) {
        case "ok":
        case "ya_registrado":
          return r;
        case "tope_superado":
          return { estado: "validation_error", errores: { monto: MENSAJE_TOPE_PAGO_PLATAFORMA } }; // R6
        case "rechazado":
          if (CODIGOS_DE_REPARTO.has(r.error.codigo)) return errorDeReparto(r.error); // R5
          throw new Error(`pago_plataforma_registrar_por_fuera rechazó con un código inesperado: ${r.error.codigo}`);
      }
    });
  }

  async anularConfirmado(actor: Actor | null, input: unknown): Promise<AnularPagoConfirmadoResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN; // R31
    const parsed = anularPagoConfirmadoSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error, input) }; // R23

    const r = await this.repo.anularConfirmado({
      organizacionId: parsed.data.organizacionId,
      pagoId: parsed.data.pagoId,
      motivo: parsed.data.motivo,
      por: actor.usuarioId,
      ahora: this.ahora(),
    });
    if (r.estado !== "rechazado") return r; // ok, ya_anulado (R24, R27)
    switch (r.error.codigo) {
      case "pago_no_encontrado":
        return { estado: "not_found" }; // R25
      case "pago_no_confirmado":
        return { estado: "no_confirmado" }; // R25
      case "motivo_vacio":
        return { estado: "validation_error", errores: { motivo: TEXTOS_CONFIRMACION.motivo_vacio } }; // R23
      default:
        throw new Error(`pago_plataforma_anular_confirmado rechazó con un código inesperado: ${r.error.codigo}`);
    }
  }
}
