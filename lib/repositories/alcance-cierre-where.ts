import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";

/**
 * Feature 38 (R2/R13) — el WHERE del alcance de un cierre del dia: siempre por `destino_tipo`; por
 * `destino_zona_id` SOLO si el alcance lo acota (adminSatelite). El acceso total (`destinoZonaId`
 * null) ve todos los `bodega_central`.
 *
 * SLT-122 (R6): vive aqui, y no dentro de `CierresAdminRepository`, para que el pago al mensajero
 * (`LiquidacionPagoRepository`) filtre con el MISMO WHERE que las escrituras de `/cierres-admin`.
 * La empresa no va aqui: la pone la extension del cliente y la RLS de `cierre_dia`.
 */
export function alcanceWhere(
  alcance: Alcance,
): { destinoTipo: Alcance["destinoTipo"]; destinoZonaId?: string } {
  return {
    destinoTipo: alcance.destinoTipo,
    ...(alcance.destinoZonaId !== null ? { destinoZonaId: alcance.destinoZonaId } : {}),
  };
}
