import type { PrismaClient } from "@prisma/client";

import type { SenalesColaCierre } from "@/lib/interfaces/services/ICierresAdminService";
import { RESULTADOS_QUE_VUELVEN } from "@/lib/types/gestion-retorno";

/**
 * SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (R70, R109) — las tres señales de
 * la cola para los cierres de una página, con UNA consulta.
 *
 * Archivo aparte de `CierresAdminRepository.ts` porque ese está en `EXCEPCIONES_SQL_A_MANO` (su
 * `UPDATE "orden"` lo cubre la RLS) y la guardia `sql-a-mano-por-empresa` mira el archivo entero:
 * este SQL sí filtra por empresa y no debe tapar al otro.
 *
 * La regla es la del detalle, gestión por gestión (`detalle-cierre-vista.ts`, `fila-gestion-vista.ts`):
 *  - las gestiones del cierre son las de `gestion_orden.cierre_id` (la misma lista «Gestiones»);
 *  - «pago ajustado» = la gestión tiene al menos una fila en `gestion_pago_mensajero_ajuste`, sea cual
 *    sea el cierre en que se ajustó: dos ajustes de la misma gestión cuentan uno;
 *  - «vuelve a bodega» = `RESULTADOS_QUE_VUELVEN`, importado y no copiado.
 *
 * La empresa sale de `app.organizacion_id`, la que fija la extensión del cliente (o el test). Sin
 * empresa no casa ninguna fila: falla cerrado, con el mapa vacío.
 */
export async function contarSenalesPorCierreCon(
  cliente: Pick<PrismaClient, "$queryRaw">,
  cierreIds: readonly string[],
): Promise<Map<string, SenalesColaCierre>> {
  const senales = new Map<string, SenalesColaCierre>();
  if (cierreIds.length === 0) return senales;

  const filas = await cliente.$queryRaw<
    { cierre_id: string; incidentes: number; ajustados: number; vuelven: number }[]
  >`
    SELECT g."cierre_id",
           (COUNT(*) FILTER (WHERE g."resultado" = 'incidente' AND g."indemnizacion" IS NULL))::int AS "incidentes",
           (COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM "gestion_pago_mensajero_ajuste" a
               WHERE a."gestion_id" = g."id"
                 AND a."organizacion_id" = g."organizacion_id"
           )))::int AS "ajustados",
           (COUNT(*) FILTER (WHERE g."resultado"::text = ANY(${[...RESULTADOS_QUE_VUELVEN]}::text[])))::int AS "vuelven"
      FROM "gestion_orden" g
     WHERE g."cierre_id" = ANY(${[...cierreIds]}::text[])
       AND g."organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), '')
     GROUP BY g."cierre_id"`;

  for (const f of filas) {
    senales.set(f.cierre_id, {
      incidentesSinIndemnizar: f.incidentes,
      pagosAjustados: f.ajustados,
      vuelvenABodega: f.vuelven,
    });
  }
  return senales;
}
