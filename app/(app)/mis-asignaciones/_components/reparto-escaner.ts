import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

// SLT-156 (R514, R515; design §7): qué orden de Reparto corresponde a la guía que el mensajero
// escaneó o escribió en «Escanear o escribir guía». Pura, para probarla sin pantalla.
//
// Solo cuentan las órdenes POR GESTIONAR. Las que tienen ayuda solicitada llegan del servidor en
// su propia lista (feature 235) y no se gestionan desde Reparto: su «Gestionar» se retiró y
// abrirlas en modo foco sería un botón que siempre falla. Si una orden figurara en las dos listas,
// manda la de ayuda.

/** La orden por gestionar con esa guía, o `null` si no es de ninguna de ellas. */
export function ordenPorGuia(
  porGestionar: readonly MiAsignacionDTO[],
  conAyuda: readonly MiAsignacionDTO[],
  numGuia: number,
): MiAsignacionDTO | null {
  const enAyuda = new Set(conAyuda.map((o) => o.id));
  return porGestionar.find((o) => o.numGuia === numGuia && !enAyuda.has(o.id)) ?? null;
}
