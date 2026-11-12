import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ESTADOS_BODEGA_SATELITE } from "@/lib/utils/estados-bodega-satelite";
import { contextoActual } from "@/lib/db/contexto-empresa";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, enTransaccionRevertida } from "./_postgres-real";

/**
 * Feature 184 — Tanda A: las dos consultas NUEVAS de la bodega satélite se EJECUTAN contra un
 * Postgres de verdad.
 *
 * QUÉ PRUEBA ESTE ARCHIVO Y QUÉ NO, que es lo que importa.
 *
 * SÍ prueba que el SQL crudo que emiten `findRecepcionSateliteCompleta` y
 * `findIdsVigentesEnBodega` es SQL válido contra el esquema real: los nombres de tabla y
 * columna (`os."value"`, `c."nombre"`, `o."prioridad"`, `o."created_at"`), los tres JOINs, el
 * `array_position(...)::text[]` y el `IN` de identificadores. Ese es el fallo que ningún test
 * de arriba puede ver: el doble de `$queryRaw` acepta cualquier texto, así que una columna mal
 * escrita pasa verde en los 23 casos de `satelite-paginado-where.test.ts` y revienta la primera
 * vez que alguien descarga o poda en producción.
 *
 * NO prueba el conjunto de filas: es una lectura de SOLO LECTURA, con un `zonaId` que no
 * existe, así que el resultado correcto es vacío. Qué filas devuelve cada filtro está probado
 * con dobles (servicio) y sobre los argumentos de la consulta (repositorio); sembrar aquí una
 * bodega entera —tienda, zona, provincia, cantón, distrito, estatus— para volver a comprobar lo
 * mismo dejaría bloat en la base de quien corre la suite sin añadir una sola afirmación nueva.
 *
 * Sin base alcanzable se SALTA (no falla): la suite tiene que seguir verde en una máquina sin
 * Postgres levantado.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/**
 * SLT-47 (R37): el filtro de lugar carga el catalogo del pais de la EMPRESA del contexto, asi que la
 * lectura con lugar corre dentro de una empresa de prueba (transaccion revertida) y con un nodo real
 * de su pais: asi se ejecuta de verdad la condicion de `sqlLugarEn`.
 */
async function conLugarDeEmpresa<T>(
  prisma: PrismaClient,
  fn: (repo: OrdenRepository, lugarId: string) => Promise<T>,
): Promise<T> {
  return enTransaccionRevertida(prisma, async (tx) => {
    const ctx = contextoActual();
    if (ctx?.tipo !== "empresa") throw new Error("sin empresa en el contexto del test");
    const [nodo] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT n.id FROM nodo_geografico n JOIN organizacion o ON o.pais_id = n.pais_id
        WHERE o.id = $1 ORDER BY n.profundidad DESC, n.id LIMIT 1`,
      ctx.organizacionId,
    );
    if (nodo === undefined) throw new Error("el pais de la empresa de prueba no tiene nodos");
    return fn(new OrdenRepository(tx as unknown as PrismaClient), nodo.id);
  });
}

/** No existe ninguna zona con este id: la lectura es real pero no puede devolver filas. */
const ZONA_INEXISTENTE = "z-inexistente-184-tanda-a";

describeSiHayBase("SQL real de la bodega satélite (feature 184, T A.1/T A.2)", () => {
  let prisma: PrismaClient;
  let repo: OrdenRepository;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
    repo = new OrdenRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("el conjunto completo se ejecuta contra el esquema real, con y sin filtros de geografía", async () => {
    // Sin geografía: el `WHERE` mínimo más el `ORDER BY` con `array_position`.
    await expect(
      repo.findRecepcionSateliteCompleta({
        zonaId: ZONA_INEXISTENTE,
        estatusValues: [...ESTADOS_BODEGA_SATELITE],
      }),
    ).resolves.toEqual([]);

    // Con el filtro de lugar (SLT-47): se añade la condicion de `sqlLugarEn`.
    await expect(
      conLugarDeEmpresa(prisma, (r, lugarId) =>
        r.findRecepcionSateliteCompleta({
          zonaId: ZONA_INEXISTENTE,
          estatusValues: ["novedad"],
          lugarIds: [lugarId], // SLT-47
        }),
      ),
    ).resolves.toEqual([]);
  });

  it("los filtros heredados de `/ordenes` también son SQL válido contra el esquema real", async () => {
    // Pedido humano (2026-08-19): la barra ganó buscador y filtro de creación, y los dos
    // añaden condiciones al MISMO SQL crudo. `o."busqueda_texto"` es una columna GENERADA
    // —existe solo desde su migración— y el `LIKE` va con su patrón ya construido: si el
    // nombre o el tipo no casaran, ningún test con dobles lo vería y reventaría en la primera
    // búsqueda de la bodega.
    await expect(
      conLugarDeEmpresa(prisma, (r, lugarId) => r.findRecepcionSatelitePaginada(
        {
          zonaId: ZONA_INEXISTENTE,
          estatusValues: [...ESTADOS_BODEGA_SATELITE],
          lugarIds: [lugarId], // SLT-47
          // Pedido humano (2026-08-25): con la columna REAL. Un nombre mal escrito aqui no lo
          // ve ningun doble; revienta en la primera consulta de la bodega.
          mensajeroIds: ["m-inexistente"],
          creadaDesde: new Date("2026-08-01T06:00:00.000Z"),
          creadaHasta: new Date("2026-08-11T06:00:00.000Z"),
          busqueda: "8888-0000",
          busquedaDigitos: "88880000",
        },
        { skip: 0, take: 5 },
      )),
    ).resolves.toEqual({ items: [], total: 0 });

    // Y el conjunto de la descarga, que comparte el fragmento: una forma sola del término
    // (sin el `OR`) tiene que ser igual de válida.
    await expect(
      repo.findRecepcionSateliteCompleta({
        zonaId: ZONA_INEXISTENTE,
        estatusValues: ["novedad"],
        busqueda: "guapiles",
      }),
    ).resolves.toEqual([]);
  });

  it("la vigencia de identificadores se ejecuta contra el esquema real", async () => {
    await expect(
      repo.findIdsVigentesEnBodega(
        { zonaId: ZONA_INEXISTENTE, estatusValues: [...ESTADOS_BODEGA_SATELITE] },
        ["3f1c7c2e-9a1a-4f0e-9d4a-2b6a1c9e5d33", "3f1c7c2e-9a1a-4f0e-9d4a-2b6a1c9e5d34"],
      ),
    ).resolves.toEqual([]);
  });

  it("la página sigue ejecutándose igual tras compartir el criterio con las dos nuevas", async () => {
    // El refactor de T A.1 sacó el `WHERE` y el `ORDER BY` de este método a dos helpers. Si esa
    // extracción hubiera roto el SQL de la página —el único de los tres que ya estaba en
    // producción—, se vería aquí y no en la pantalla.
    await expect(
      repo.findRecepcionSatelitePaginada(
        { zonaId: ZONA_INEXISTENTE, estatusValues: [...ESTADOS_BODEGA_SATELITE] },
        { skip: 0, take: 25 },
      ),
    ).resolves.toEqual({ items: [], total: 0 });
  });
});
