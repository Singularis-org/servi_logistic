// El CICLO DE VIDA de una orden: de su creacion a su GESTION FINAL vigente.
//
// ─── QUE ES «CERRADA» AQUI (SLT-64, D1 y D3) ────────────────────────────────────────────
//
// El reloj arranca en `orden.created_at` y para en el `created_at` de la ULTIMA gestion vigente
// de la orden, si su resultado es uno de `RESULTADOS_DE_CIERRE`. No lee
// `orden_historial_estado`: desde la ficha 454 la transicion terminal solo se escribe al APROBAR
// el cierre, y la pantalla decia «0 cerradas» al lado de «Entregado 11» mientras nadie aprobara.
//
// Tres decisiones que sostienen la consulta:
//
//   - `NOT EXISTS` con la tupla `(created_at, id)`: es el mismo orden que el
//     `ORDER BY created_at DESC, id DESC` de `ConteoPorStatusRepository`, para que esta cifra y el
//     «Entregado N» elijan la misma gestion. Da ademas UNA contribucion por orden. El desempate
//     por `id` no sobra: dos gestiones pueden compartir `created_at`.
//   - la VENTANA cae sobre la gestion final, no sobre la creacion de la orden: lo que cerro en el
//     periodo, con su duracion. Una orden creada en enero y cerrada en agosto cuenta en agosto.
//     El `NOT EXISTS` NO lleva ventana: la ultima gestion se elige entre TODAS las vigentes, y un
//     `reprogramado` posterior al periodo tambien la desmiente (R5).
//   - `resultado::text`: la columna es un enum y Prisma manda los parametros como texto; sin el
//     cast Postgres no encuentra el operador `enum = text`.
//
// ⚠ NO ES LA METRICA `tiempo_ciclo` del rollup (Q5 de `AnaliticaRollupRepository`), que se publica
// por API key y sigue parando en la transicion terminal. Son dos «tiempos de ciclo» con definicion
// distinta, decision aceptada en SLT-64 (Q3).
//
// ─── COSTE DECLARADO ────────────────────────────────────────────────────────────────────
//
// Es la QUINTA escritura del recorte por facetas de esta vertical. Igual que en las otras: el
// recorte por ROL se REUSA —`condicionDeAlcance` se importa—, las condiciones se construyen en
// `condicionesDeCiclo`, funcion PURA y exportada, y el alcance es SIEMPRE la primera. La
// condicion de FECHA es distinta a proposito y no debe converger nunca: aqui cae sobre la
// gestion final, que es el evento que se esta fechando.

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { condicionDeAlcance } from "@/lib/repositories/ConteoPorStatusRepository";
import {
  CatalogoGeograficoRepository,
  type CatalogoPrismaClient,
} from "@/lib/repositories/CatalogoGeograficoRepository";
import {
  condicionesDeLugar,
  lugaresDelFiltro,
  type LugaresDelFiltro,
} from "@/lib/repositories/_shared/lugares-del-filtro";
import type { ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";
import type {
  CicloCrudo,
  ICicloVidaRepository,
} from "@/lib/interfaces/repositories/ICicloVidaRepository";
import { RESULTADOS_DE_CIERRE } from "@/lib/types/conteo-ciclo-vida";

/** Cliente MINIMO consumido (patron del resto de la vertical): una sola consulta cruda. */
type CicloVidaPrismaClient = Pick<PrismaClient, "$queryRaw"> & CatalogoPrismaClient; // SLT-71: mas el catalogo, solo con faceta geografica

interface FilaCiclo {
  readonly seg: string | number | null;
  readonly n: number;
}

/** Los resultados que cierran una orden, como lista SQL. Se importan: la lista vive en un solo sitio (R10). */
const RESULTADOS = Prisma.join([...RESULTADOS_DE_CIERRE]);

/** Lista de ids como parametros, nunca interpolada: cada uno entra como `$n`. */
function comoParametros(ids: readonly string[]): Prisma.Sql {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}`));
}

/** `col IN (...)` solo si la dimension se filtro. `null` = sin recorte por esa faceta. */
function enLista(columna: Prisma.Sql, ids: readonly string[] | undefined): Prisma.Sql | null {
  if (ids === undefined || ids.length === 0) return null;
  return Prisma.sql`${columna} IN (${comoParametros(ids)})`;
}

/**
 * Las condiciones que se aplican sobre la ORDEN ya emparejada con su gestion final. Funcion PURA
 * y exportada: es donde vive la semantica y se comprueba sin base de datos.
 *
 * La ventana NO esta aqui porque fecha la gestion, no la orden: ver
 * `condicionDeVentanaDeCierre`.
 */
export function condicionesDeCiclo(consulta: ConsultaConteoEntregas, lugares: LugaresDelFiltro): Prisma.Sql[] {
  const { filtro, alcance } = consulta;

  const condiciones: Prisma.Sql[] = [
    // El recorte por ROL, primero y siempre. Frontera multi-tenant.
    condicionDeAlcance(alcance),
    Prisma.sql`o."deleted_at" IS NULL`,
  ];

  // SLT-71 (design §3.3; R1, R2): las tres facetas geograficas ya no filtran por su columna sino por
  // el LUGAR de la orden, con los ids que resolvio el dominio (`lugares`), en el mismo sitio que antes
  // (entre la zona y la tienda). `lugares` es obligatorio: ninguna lectura filtra por columna en silencio.
  const zona = enLista(Prisma.sql`o."zona_id"`, filtro.zona_id);
  if (zona) condiciones.push(zona);
  condiciones.push(...condicionesDeLugar(lugares));
  const tienda = enLista(Prisma.sql`o."tienda_id"`, filtro.tienda_id);
  if (tienda) condiciones.push(tienda);

  // Mensajero: quien REGISTRO alguna gestion vigente de la orden, igual que en las lecturas
  // cuyo universo es la orden. `orden.mensajero_asignado_id` seria el asignado ACTUAL, que
  // pudo cambiar despues del cierre.
  if (filtro.mensajero_id !== undefined && filtro.mensajero_id.length > 0) {
    condiciones.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "gestion_orden" gm
      WHERE gm."orden_id" = o."id"
        AND gm."anulada_at" IS NULL
        AND gm."mensajero_id" IN (${comoParametros(filtro.mensajero_id)})
    )`);
  }

  return condiciones;
}

/**
 * La ventana: sobre la gestion final. Sin rango no se anade nada y entran todas las cerradas del
 * recorte — «sin filtrar» significa todo, tambien aqui.
 */
export function condicionDeVentanaDeCierre(consulta: ConsultaConteoEntregas): Prisma.Sql {
  const { rango } = consulta;
  if (rango === null) return Prisma.sql`TRUE`;
  // Semiabierta `[desde, hasta)`: `resolverRango` devuelve `hasta` como las 00:00 CR del dia
  // SIGUIENTE, para que `hastaFecha` sea inclusiva.
  return Prisma.sql`g."created_at" >= ${rango.desde} AND g."created_at" < ${rango.hasta}`;
}

export class CicloVidaRepository implements ICicloVidaRepository {
  // SLT-71 (R13, R16): el catalogo, uno por instancia y creado al primer uso.
  private catalogoRepo: CatalogoGeograficoRepository | null = null;

  constructor(private readonly prisma: CicloVidaPrismaClient) {}

  private catalogoGeografico(): CatalogoGeograficoRepository {
    return (this.catalogoRepo ??= new CatalogoGeograficoRepository(this.prisma));
  }

  async acumularCiclos(consulta: ConsultaConteoEntregas): Promise<CicloCrudo> {
    const lugares = await lugaresDelFiltro(() => this.catalogoGeografico(), consulta.filtro);
    const where = Prisma.join(condicionesDeCiclo(consulta, lugares), " AND ");
    const ventana = condicionDeVentanaDeCierre(consulta);

    // `SUM(...)::bigint` llega como STRING por el driver cuando el tipo es `bigint`, y como
    // `null` si no hubo ninguna fila. Las dos cosas se normalizan abajo: un `Number(null)` es
    // `0`, que aqui es correcto —cero filas, cero segundos— pero conviene que sea explicito y
    // no un accidente de coercion.
    const filas = await this.prisma.$queryRaw<FilaCiclo[]>`
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (g."created_at" - o."created_at"))::bigint), 0)::bigint AS seg,
             COUNT(*)::int AS n
      FROM "gestion_orden" g
      JOIN "orden" o ON o."id" = g."orden_id"
      WHERE g."anulada_at" IS NULL
        AND g."resultado"::text IN (${RESULTADOS})
        AND ${ventana}
        AND NOT EXISTS (
          SELECT 1 FROM "gestion_orden" g2
          WHERE g2."orden_id" = g."orden_id"
            AND g2."anulada_at" IS NULL
            AND (g2."created_at", g2."id") > (g."created_at", g."id")
        )
        AND ${where}`;

    const fila = filas[0];
    if (!fila) return { segundosAcum: 0, n: 0 };
    return { segundosAcum: Number(fila.seg ?? 0), n: Number(fila.n) };
  }
}
