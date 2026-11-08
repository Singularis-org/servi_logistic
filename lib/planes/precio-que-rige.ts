import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import type { PrecioDesde, PrecioPlan } from "@/lib/types/planes";

// SLT-86 (R15, R25; review m4) — la vista previa de un cambio de empresa usa el precio que regirá el día del
// cambio, no el vigente hoy: el plan puede tener una edición de precio programada antes de esa fecha. Es la
// misma regla que `plan_de_la_empresa` (design §1.2) en TS, para el modal, donde la fecha la elige el
// superadmin después de que la página se pintó. Pura y sin directiva: la usan servidor y cliente.

/** Las 00:00 de la plataforma como milisegundos; `null` (desde siempre) va antes que cualquier fecha. */
function instante(desde: string | null): number {
  return desde === null ? Number.NEGATIVE_INFINITY : Date.parse(desde);
}

/**
 * El precio que rige un período o tramo que empieza a las 00:00 (hora de la plataforma) de `fecha`
 * (`AAAA-MM-DD`): el del mayor `desde` que no pase de ese instante. Si dos empatan, el último de la lista
 * (el programado va detrás del historial). `null` si ninguno rige aún: el que llama cae al vigente.
 */
export function precioQueRigeEn(historial: readonly PrecioDesde[], fecha: string): PrecioPlan | null {
  const entrada = inicioDelDiaPlataforma(fecha).getTime();
  let elegido: PrecioDesde | null = null;
  for (const fila of historial) {
    const desde = instante(fila.desde);
    if (desde > entrada) continue;
    if (elegido === null || desde >= instante(elegido.desde)) elegido = fila;
  }
  return elegido?.precio ?? null;
}
