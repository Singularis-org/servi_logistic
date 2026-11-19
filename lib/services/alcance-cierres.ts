import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";

/**
 * Feature 38 (R1/R2) — el alcance de cierres del ACCESO TOTAL (maestro/admin): los cierres cuyo
 * destino es la bodega central, sin acotar por zona.
 *
 * SLT-122 (R6, D1): lo comparten `CierresAdminService.resolveAlcance` y el pago al mensajero de
 * `LiquidacionService`. La central solo paga los cierres de los que es duena; un cierre de satelite
 * lo paga la satelite fuera del sistema (PA1 = A).
 */
export const ALCANCE_ACCESO_TOTAL: Readonly<Alcance> = Object.freeze({
  destinoTipo: "bodega_central",
  destinoZonaId: null,
});
