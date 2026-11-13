import { llevaSqlstate, mensajesDeLaCadena } from "@/lib/db/sqlstate";

// SLT-60 (design §3.6) — los errores propios de la confirmación del pago a la plataforma, tal como los
// lanza la migración 20261116120000: SQLSTATE `SL060` y en MESSAGE solo el JSON, p. ej.
// `{"codigo": "supera_saldo", "factura_id": "…"}`. Según la forma en que llega por Prisma (lib/db/sqlstate.ts)
// el JSON viene solo (el `cause` del driver) o dentro del texto de P2010, así que se busca en cada mensaje.

export const SQLSTATE_PAGO_PLATAFORMA = "SL060";

/** Los códigos que lanza `pago_plataforma_confirmar` (design §3.4). */
export const CODIGOS_DE_CONFIRMACION = [
  "pago_no_encontrado",
  "factura_no_valida",
  "monto_no_positivo",
  "factura_repetida",
  "supera_saldo",
  "suma_distinta",
] as const;

export type CodigoDeConfirmacion = (typeof CODIGOS_DE_CONFIRMACION)[number];

export interface ErrorDeConfirmacion {
  codigo: CodigoDeConfirmacion;
  /** La factura del elemento que falló; solo en los códigos que la nombran. */
  facturaId?: string;
}

const CODIGOS: ReadonlySet<string> = new Set(CODIGOS_DE_CONFIRMACION);

/** Cada objeto JSON plano que aparece en los mensajes de un error `SL060`, en orden de recorrido. */
function jsonsDelError(e: unknown): Record<string, unknown>[] {
  if (!llevaSqlstate(e, SQLSTATE_PAGO_PLATAFORMA)) return [];
  const encontrados: Record<string, unknown>[] = [];
  for (const mensaje of mensajesDeLaCadena(e)) {
    for (const trozo of mensaje.match(/\{[^{}]*\}/g) ?? []) {
      try {
        const o: unknown = JSON.parse(trozo);
        if (o !== null && typeof o === "object" && !Array.isArray(o)) encontrados.push(o as Record<string, unknown>);
      } catch {
        // Un trozo entre llaves que no es JSON no es el mensaje del trigger.
      }
    }
  }
  return encontrados;
}

/**
 * El código de un rechazo de `pago_plataforma_confirmar`, o `null` si `e` no lo es (otro SQLSTATE, otro
 * código de `SL060` o un mensaje que no encaja). El servicio decide qué hacer con un `null`.
 */
export function traducirErrorDeConfirmacion(e: unknown): ErrorDeConfirmacion | null {
  for (const o of jsonsDelError(e)) {
    if (typeof o.codigo !== "string" || !CODIGOS.has(o.codigo)) continue;
    const codigo = o.codigo as CodigoDeConfirmacion;
    return typeof o.factura_id === "string" ? { codigo, facturaId: o.factura_id } : { codigo };
  }
  return null;
}

/**
 * ¿Es `e` el rechazo del contra-asiento de un pago ya confirmado (trigger `pago_plataforma_no_anular_confirmado`,
 * design §3.5)? `EgresoCajaAnulacionService` lo traduce a `forbidden` (R10).
 */
export function esPagoConfirmadoError(e: unknown): boolean {
  return jsonsDelError(e).some((o) => o.codigo === "pago_confirmado");
}
