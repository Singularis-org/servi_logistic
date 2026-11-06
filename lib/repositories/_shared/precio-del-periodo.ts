import { z } from "zod";

import type { PendienteDeEmpresa } from "@/lib/types/consumo-plan";
import { descuentoPeriodoSchema, type PrecioPlan, tipoCobroSchema } from "@/lib/types/planes";
import { fechaCalendarioPlataforma } from "@/lib/planes/ciclo";

// SLT-86 (design §1.2, §3.3; R15, R26, R32) — lo que comparten «Mi plan» (`MiPlanRepository`, por
// `plan_de_la_empresa`) y el detalle de empresa del superadmin (`PlanesRepository.planDeEmpresa`): el
// precio de una fila de `plan_precio_historial` y el cambio pendiente de la empresa, sin el actor. Los dos
// leen lo mismo de la base y lo tienen que pintar igual.

/** `descuentos` de una fila del historial: un `jsonb` sin tipar que se valida antes de usarlo. */
const descuentosDelHistorialSchema = z.partialRecord(tipoCobroSchema, descuentoPeriodoSchema);

/**
 * R15: el precio de una fila de `plan_precio_historial` (la que rige al empezar el período en curso).
 * `precio_mensual` NULL es «sin precio» (R11: sin descuentos). Un `descuentos` que no pasa el esquema es
 * un dato roto y se rechaza aquí, no se pinta a medias.
 */
export function precioDelHistorial(precioMensual: string | null, descuentos: unknown): PrecioPlan {
  if (precioMensual === null) return { tipo: "sin_precio" };
  return { tipo: "monto", mensual: precioMensual, descuentos: descuentosDelHistorialSchema.parse(descuentos) };
}

/**
 * R26, R32: el cambio pendiente de la empresa como lo pintan las pantallas: el plan que entra, el tipo y
 * el día (`AAAA-MM-DD`, hora de la plataforma) desde cuyas 00:00 rige. Nunca el actor.
 */
export function pendienteDeEmpresa(planNombre: string, tipoCobro: string, desde: Date): PendienteDeEmpresa {
  return { planNombre, tipo: tipoCobroSchema.parse(tipoCobro), desde: fechaCalendarioPlataforma(desde) };
}
