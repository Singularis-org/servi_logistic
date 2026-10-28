import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

import { crearOrganizacion } from "../../fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  crearPrismaDeTestConEspia,
  parametrosDe,
  type EventoSqlDeTest,
} from "./_postgres-real";
import { consultaDe, D, D_MAS_2, rangoDe, repositorioSobre } from "./_cohorte-carga";
import type { TxDeTest } from "./_semilla-rollup";

/**
 * ⭑⭑ FICHA 411 / T6.1 — R36: LA COHORTE SE RESUELVE CON LOS INDICES QUE YA EXISTEN.
 *
 * Molde literal de `analitica-operativa-indices.test.ts`, y por las mismas razones.
 *
 * ─── LOS DOS INDICES, Y POR QUE NO HACE FALTA UNA MIGRACION ─────────────────────────────
 *
 * | que resuelve                                     | indice                                        |
 * | ------------------------------------------------ | --------------------------------------------- |
 * | la ventana de carga sobre `orden.created_at`      | `orden_created_at_idx`                        |
 * | la ULTIMA transicion terminal POR ORDEN           | uno de los dos que empiezan por `orden_id`     |
 *
 * Lo que hace aplicable cualquiera de los dos es haber recortado la cohorte PRIMERO: el CTE
 * `cierre` solo visita las ordenes ya seleccionadas —una busqueda por `orden_id` por cada una—
 * en vez de deduplicar el historial entero para tirar casi todo.
 *
 * ⚠ LO QUE LA MEDICION DESMINTIO, Y SE ESCRIBE AQUI EN VEZ DE AJUSTAR EL DISENO EN SILENCIO.
 * `design.md §1.2` daba por hecho que el plan nombraria
 * `orden_historial_estado_orden_id_created_at_idx`, «exactamente la forma del `DISTINCT ON`». El
 * `EXPLAIN` de la consulta REAL (2026-09-10, base local) dice otra cosa: el planificador entra
 * por `orden_historial_estado_orden_id_estatus_destino_id_idx` —`Bitmap Index Scan`, con
 * `Index Cond: (orden_id = c_1.orden_id)`— y ORDENA despues. Tiene sentido: al JOINear el
 * historial CONTRA la cohorte, el acceso es por igualdad de `orden_id` (donde los dos indices
 * empatan, porque los dos lo llevan de primera columna) y el orden del `DISTINCT ON` se resuelve
 * con un `Sort` sobre las pocas filas que quedan.
 *
 * QUE SIGNIFICA PARA R36 Y R37: **R36 se cumple y R37 NO se dispara**. Lo que R36 exige es que
 * el plan no recurra a un recorrido secuencial de `orden_historial_estado` teniendo alternativa,
 * y no lo hace; y el indice por el que entra **ya existe** (feature 67, R24: conteo de intentos).
 * No hace falta ninguna migracion. Por eso este archivo afirma lo que el requisito dice —«entra
 * por un indice de esa tabla, y no por un Seq Scan»— y no el NOMBRE que el diseno supuso: un test
 * atado a la eleccion concreta del planificador se pondria rojo el dia que cambien las
 * estadisticas de la tabla, sin que nada estuviera mal.
 *
 * ─── POR QUE SE DESACTIVA EL SEQ SCAN, Y POR QUE ESO NO ES HACER TRAMPA ─────────────────
 *
 * Medido en la base de desarrollo: `orden` tiene ~70 filas y `orden_historial_estado` ~200. El
 * plan mas barato ahi es leerlas enteras, y lo seguiria siendo aunque el indice fuera perfecto.
 * Un test que exigiera «no hay Seq Scan» estaria midiendo el TAMANO de la base de desarrollo, no
 * la existencia del indice, y saldria rojo o verde por razones ajenas a R36.
 *
 * Lo que R36 necesita demostrar es otra cosa y SI es comprobable: que existe un indice APLICABLE
 * a este predicado, de modo que cuando la tabla crezca el planificador tenga a que agarrarse. Con
 * el seq scan desactivado, si el indice existe y sirve, el plan lo NOMBRA; si no existiera,
 * Postgres volveria al seq scan pese a la penalizacion y el caso saldria rojo.
 *
 * ⚠ Y SE MIDE LA CONSULTA REAL, no una copia escrita a mano: se ejecuta el repositorio con un
 * cliente que APUNTA el SQL que emite, y se le hace `EXPLAIN` a ese texto con sus parametros. Un
 * test que reescribiera la consulta demostraria que un SQL inventado usa el indice, no que lo use
 * el que corre en produccion — que es el que puede cambiar sin avisar al actualizar Prisma.
 */

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
/** El que `design.md §1.2` daba por seguro: sigue existiendo y sigue siendo aplicable. */
const INDICE_HISTORIAL = "orden_historial_estado_orden_id_created_at_idx";
/** El que el planificador elige de verdad (medido). Tambien PREEXISTENTE (feature 67/R24). */
const INDICE_HISTORIAL_ALTERNO = "orden_historial_estado_orden_id_estatus_destino_id_idx";
/** Los dos que sirven al acceso por `orden_id`. Cualquiera de ellos cumple R36. */
const INDICES_HISTORIAL_APLICABLES = [INDICE_HISTORIAL, INDICE_HISTORIAL_ALTERNO];
const INDICE_ORDEN = "orden_created_at_idx";

describe("R36 · los dos indices estan DECLARADOS en el datamodel", () => {
  // Si solo vivieran en el `.sql`, el siguiente `prisma migrate dev` propondria borrarlos y
  // desaparecerian sin que nadie tocara una migracion. El rojo tiene que aparecer aqui.
  const schema = fs.readFileSync(path.join(REPO_ROOT, "db", "schema.prisma"), "utf8");

  it("`orden` declara `@@index([createdAt])`", () => {
    const modelo = /model Orden \{[\s\S]*?\n\}/.exec(schema);
    expect(modelo, "no se localizo el modelo `Orden`").not.toBeNull();
    expect(modelo![0]).toContain("@@index([createdAt])");
  });

  it("`orden_historial_estado` declara `@@index([ordenId, createdAt])`", () => {
    const modelo = /model OrdenHistorialEstado \{[\s\S]*?\n\}/.exec(schema);
    expect(modelo, "no se localizo el modelo `OrdenHistorialEstado`").not.toBeNull();
    expect(modelo![0]).toContain("@@index([ordenId, createdAt])");
  });
});

/**
 * ─── VOLUMEN PROPIO (SL-18, decision humana 2026-10-26) ───────────────────────────────────
 *
 * La app nace vacia (SL-11): en la base de test `orden` no tiene filas. Con la tabla vacia y el
 * seq scan desactivado, el planificador elige por coste el compuesto por empresa de SL-18
 * (`Index Only Scan`, `created_at` como filtro) en vez de `orden_created_at_idx`: mide el tamano
 * de la base, no el indice. Con volumen, la ventana va por `orden_created_at_idx` (medido en
 * `progress/impl_SL-18.md`, Tanda 5).
 *
 * Por eso el plan se calcula con ordenes propias, sembradas en una transaccion que SIEMPRE se
 * revierte (patron de `indices-rutas-calientes.test.ts`): nada queda en la base aunque el proceso
 * muera. Las filas son sinteticas y van en modo replica (sin FK ni triggers, que no cambian el
 * plan). Las fechas cubren de 2000-06 a 2001-07, a 15 minutos: la ventana D..D+2 es ~0,5 % de la
 * tabla. Despues `ANALYZE`, que tambien se revierte.
 */
const ORDENES_SEMBRADAS = 40_000;
const PREFIJO = "sl18-coh411";

class Revertir extends Error {
  constructor() {
    super("rollback deliberado del test");
  }
}

async function sembrarOrdenes(tx: TxDeTest, empresa: string): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
  await tx.$executeRawUnsafe(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id, provincia_id,
       canton_id, producto, updated_at, created_at, prioridad, deleted_at, organizacion_id)
     SELECT '${PREFIJO}-o-' || g, 'r' || g, 'e', 'd', '8', '${PREFIJO}-t-' || (g % 50), '${PREFIJO}-z-' || (g % 30),
       'p', 'c', 'x', now(), timestamp '2000-06-01' + g * interval '15 minutes', g % 20 = 0,
       CASE WHEN g % 25 = 0 THEN now() END, $1
     FROM generate_series(1, $2::int) g`,
    empresa,
    ORDENES_SEMBRADAS,
  );
  // Una transicion por orden: el CTE `cierre` tiene historial que recorrer.
  await tx.$executeRawUnsafe(
    `INSERT INTO orden_historial_estado (id, orden_id, estatus_destino_id, origen_tipo, created_at, organizacion_id)
     SELECT '${PREFIJO}-h-' || o.id, o.id, o.estatus_id, (enum_range(NULL::orden_historial_origen_tipo))[1],
       o.created_at, o.organizacion_id
     FROM orden o WHERE o.organizacion_id = $1`,
    empresa,
  );
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = origin`);
  // Sin estadisticas frescas el planificador cree que la tabla tiene el tamano de antes.
  await tx.$executeRawUnsafe(`ANALYZE orden`);
  await tx.$executeRawUnsafe(`ANALYZE orden_historial_estado`);
}

describe.skipIf(!HAY_BASE_DE_DATOS)("R36 · el plan de la consulta REAL de la cohorte", () => {
  let prisma: PrismaClient;
  let espia: { prisma: PrismaClient; eventos: EventoSqlDeTest[] };
  /** El plan de la consulta real, medido con el volumen sembrado y ya revertido. */
  let planConVolumen = "";

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    espia = crearPrismaDeTestConEspia();

    const { sql, params } = await consultaEmitida();
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
          const empresa = (await crearOrganizacion(tx)).id;
          await sembrarOrdenes(tx, empresa);
          planConVolumen = await planEn(tx, sql, params);
          throw new Revertir();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (e) {
      if (!(e instanceof Revertir)) throw e;
    }
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await espia.prisma.$disconnect();
  });

  /** El SQL que el repositorio EMITE de verdad, con sus parametros. */
  async function consultaEmitida(): Promise<{ sql: string; params: unknown[] }> {
    const consulta = consultaDe(rangoDe(D, D_MAS_2), { usuarioId: "u-maestro", rol: "maestro" });
    espia.eventos.length = 0;
    await repositorioSobre(espia.prisma as unknown as TxDeTest).contarCohortes(consulta);

    const evento = espia.eventos.find((e) => /WITH cohorte AS/i.test(e.query));
    if (evento === undefined) {
      throw new Error(
        `el espia no capturo la consulta de la cohorte; vio: ${espia.eventos
          .map((e) => e.query.slice(0, 60))
          .join(" | ")}`,
      );
    }
    return { sql: evento.query, params: parametrosDe(evento) };
  }

  async function planEn(tx: TxDeTest, sql: string, params: unknown[]): Promise<string> {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    const plan = await tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN ${sql}`, ...params);
    return plan.map((f) => f["QUERY PLAN"]).join("\n");
  }

  it("los dos indices estan aplicados en esta base (si no, no hay nada que medir)", async () => {
    const filas = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (${INDICE_ORDEN}, ${INDICE_HISTORIAL})`;

    expect(
      filas.map((f) => f.indexname).sort(),
      "faltan indices en esta base: corre las migraciones antes de medir",
    ).toEqual([INDICE_ORDEN, INDICE_HISTORIAL].sort());
  });

  it("el plan entra a `orden_historial_estado` POR INDICE, y no por un Seq Scan", () => {
    const texto = planConVolumen;
    expect(texto, "no se midio el plan").not.toBe("");

    // Lo que R36 exige, literal: nada de recorrido secuencial teniendo alternativa.
    expect(/Seq Scan on orden_historial_estado/i.test(texto), texto).toBe(false);
    // Y la alternativa que usa es uno de los dos indices que YA existen sobre esa tabla, los dos
    // con `orden_id` de primera columna. Cual de los dos lo decide el planificador con sus
    // estadisticas, y no es contrato (ver la cabecera).
    const usados = INDICES_HISTORIAL_APLICABLES.filter((i) => texto.includes(i));
    expect(
      usados,
      `el plan no nombra ninguno de los indices aplicables de orden_historial_estado:\n${texto}`,
    ).not.toEqual([]);
  });

  it("y tambien el de la ventana de carga sobre `orden(created_at)`", () => {
    const texto = planConVolumen;
    expect(texto, "no se midio el plan").not.toBe("");

    expect(texto, `el plan no nombra ${INDICE_ORDEN}:\n${texto}`).toContain(INDICE_ORDEN);
  });

  it("el caso DISCRIMINA: sin ningun indice aplicable el plan vuelve al Seq Scan", async () => {
    // La contracara, y sin ella el verde de arriba estaria por construccion. Se prueba con un
    // predicado para el que NO hay indice —una columna sin indexar de la MISMA tabla— y con el
    // mismo seq scan desactivado: el planificador no tiene alternativa y escanea igualmente. Eso
    // demuestra que el verde de arriba lo produce el indice y no el `enable_seqscan = off`.
    const texto = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      const plan = await tx.$queryRaw<{ "QUERY PLAN": string }[]>`
        EXPLAIN SELECT h."id" FROM "orden_historial_estado" h WHERE h."motivo" = 'inexistente'`;
      return plan.map((f) => f["QUERY PLAN"]).join("\n");
    });

    expect(texto).toMatch(/Seq Scan on orden_historial_estado/i);
    for (const indice of INDICES_HISTORIAL_APLICABLES) expect(texto).not.toContain(indice);
  });
});
