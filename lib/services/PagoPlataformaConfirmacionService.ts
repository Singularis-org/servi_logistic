import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import type { ErrorDeConfirmacion } from "@/lib/db/errores-pago-plataforma";
import type { IPagoPlataformaConfirmacionRepository } from "@/lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPagoPlataformaConfirmacionService } from "@/lib/interfaces/services/IPagoPlataformaConfirmacionService";
import { aCentimos, aTexto } from "@/lib/planes/centimos";
import {
  claveDeFactura,
  confirmarPagoSchema,
  TEXTOS_CONFIRMACION,
  verPagosDeEmpresaSchema,
  type ConfirmarPagoResult,
  type VerPagosDeEmpresaResult,
} from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.5) — el orden es parte del contrato: primero quién (R24: ningún rol de empresa llega a la
// base, ni para un error de validación), luego qué (zod), y al final el repositorio. La suma y los saldos los
// decide la base bajo el candado de la empresa, no este servicio: entre la lectura del superadmin y su
// confirmación otra confirmación pudo bajar un saldo.

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

/** R15, R17: un rechazo de la base, bajo su factura si lo nombra, o en el reparto entero. */
function errorDeReparto(error: ErrorDeConfirmacion): ConfirmarPagoResult {
  const texto = TEXTOS_CONFIRMACION[error.codigo as Exclude<ErrorDeConfirmacion["codigo"], "pago_no_encontrado">];
  const clave = error.facturaId !== undefined ? claveDeFactura(error.facturaId) : "aplicaciones";
  return { estado: "validation_error", errores: { [clave]: texto } };
}

export class PagoPlataformaConfirmacionService implements IPagoPlataformaConfirmacionService {
  constructor(
    private readonly repo: IPagoPlataformaConfirmacionRepository,
    private readonly ahora: () => Date = () => new Date(),
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

    // R17: los montos 0 no se guardan. Los demás van normalizados a dos decimales: lo que valida la base es
    // lo que se guarda.
    const aplicaciones = parsed.data.aplicaciones
      .map((a) => ({ facturaId: a.facturaId, centimos: aCentimos(a.monto) }))
      .filter((a) => a.centimos > CERO)
      .map((a) => ({ facturaId: a.facturaId, monto: aTexto(a.centimos) }));
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
}
