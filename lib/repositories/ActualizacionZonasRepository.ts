import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  IActualizacionZonasRepository,
  ResultadoActualizacionRepo,
} from "@/lib/interfaces/repositories/IActualizacionZonasRepository";
import { reconciliarZonaDeOrdenes } from "@/lib/repositories/_shared/reconciliar-zona-ordenes";
import type { FilaZonaErrada } from "@/lib/types/actualizacion-zonas";
import { ESTADOS_DEVOLUCION_SIN_RECONCILIAR } from "@/lib/utils/estados-bodega-satelite";

type Tx = Prisma.TransactionClient;

/**
 * SLT-224 (design §3b.2) — LAS ORDENES CON ZONA ERRADA DE LA EMPRESA, en UNA consulta.
 *
 * La regla de «zona errada» es la de la migracion de SLT-224 (design §5.1), sin filtro de estado ni
 * corte: el JOIN a `zona_distrito` por (organizacion_id, distrito_id) devuelve como mucho una fila
 * (indice unico de SLT-75), asi que equivale al colapso `zonaUnicaDeDistrito`, y un distrito sin zona
 * no aparece (R1719). `o.zona_id <> zd.zona_id` deja fuera las alineadas.
 *
 * ⭑ EL FILTRO DE EMPRESA ES EXPLICITO, ademas de la RLS: `o.organizacion_id` = la empresa que fijo la
 * transaccion (`app.organizacion_id`). Sin contexto de empresa no devuelve nada (falla cerrado). Mismo
 * patron que `CierresBodegaAdminRepository`.
 *
 * Solo nombres de zona y la guia (o remision): ningun dato del destinatario.
 */
function sqlZonaErrada(): Prisma.Sql {
  return Prisma.sql`
    SELECT o.id AS "ordenId",
           o.distrito_id AS "distritoId",
           COALESCE(NULLIF(btrim(o.num_guia::text), ''), NULLIF(btrim(o.num_remision), ''), '(sin guía)') AS guia,
           s.value AS estado,
           za.nombre AS "zonaActual",
           zn.nombre AS "zonaNueva",
           EXISTS (SELECT 1 FROM cierre_detail cd WHERE cd.orden_id = o.id) AS "conCierre",
           EXISTS (
             SELECT 1 FROM gestion_orden g
             WHERE g.orden_id = o.id
               AND g.anulada_at IS NULL
               AND g.resultado IN ('entregado', 'devolucion_a_origen_por_rechazo', 'incidente')
           ) AS "conGestion"
    FROM orden o
    JOIN order_status s ON s.id = o.estatus_id
    JOIN zona_distrito zd ON zd.organizacion_id = o.organizacion_id AND zd.distrito_id = o.distrito_id
    JOIN zona zn ON zn.id = zd.zona_id
    JOIN zona za ON za.id = o.zona_id
    WHERE o.deleted_at IS NULL
      AND o.organizacion_id = NULLIF(current_setting('app.organizacion_id', true), '')
      AND o.zona_id <> zd.zona_id
    ORDER BY o.num_guia NULLS LAST, o.num_remision, o.id
  `;
}

async function leer(tx: Tx): Promise<FilaZonaErrada[]> {
  return tx.$queryRaw<FilaZonaErrada[]>(sqlZonaErrada());
}

export class ActualizacionZonasRepository implements IActualizacionZonasRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Dentro de una transaccion de empresa a proposito: es la que fija `app.organizacion_id` (y la
   * RLS) para el SQL crudo. Solo lectura.
   */
  async leerZonaErrada(): Promise<FilaZonaErrada[]> {
    return this.prisma.$transaction(async (tx) => leer(tx));
  }

  /**
   * ⭑ R1717 — UNA transaccion, y la regla se re-evalua DENTRO:
   *   1. relee las ordenes con zona errada de la empresa (no se fia de la vista previa);
   *   2. reconcilia sus distritos con el helper compartido, excluyendo ademas las devoluciones. El
   *      helper vuelve a aplicar el corte de la 366/377 en su propio `WHERE` (estante, cierre,
   *      gestion que decidio dinero), asi que decide la base en ESE instante. Un solo lote;
   *   3. relee: lo que sigue errado son las saltadas que se informan (R1718).
   * Una saltada nunca hace fallar la transaccion: simplemente no la elige el `WHERE`.
   */
  async actualizar(actorUsuarioId: string): Promise<ResultadoActualizacionRepo> {
    return this.prisma.$transaction(async (tx) => {
      const erradas = await leer(tx);
      const distritoIds = [...new Set(erradas.map((f) => f.distritoId))];
      const { ordenesReconciliadas } = await reconciliarZonaDeOrdenes(
        tx,
        { distritoIds, excluirEstados: ESTADOS_DEVOLUCION_SIN_RECONCILIAR },
        actorUsuarioId,
      );
      const restantes = await leer(tx);
      return { actualizadas: ordenesReconciliadas, restantes };
    });
  }
}
