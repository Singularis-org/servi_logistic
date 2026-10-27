import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { comoApp, crearOrganizacion } from "../../fabricas/organizaciones";

// Feature 126 / T7.3 — R25 (T0-Q1 = B del 2026-08-02). Reescrito por SL-18 (T5.4, R24).
//
// EL RIESGO QUE ESTE ARCHIVO CUBRE, tal como lo dimensiona `design.md §8`: el camino intradia
// hace un `GROUP BY` POR REQUEST sobre `gestion_orden`, acotado por ventana y alcance. Es
// aceptable **porque** el indice existe y el recorte va en el `WHERE`. Sin cualquiera de las
// dos cosas el coste vuelve a ser proporcional a la compania y no al inquilino, y entonces
// «el intradia deja de ser viable y hay que volver a la opcion A de Q1».
//
// HECHO VERIFICADO antes de la migracion de la 126: `gestion_orden` tenia CUATRO indices
// —`orden_id`, `mensajero_id`, `cierre_id`, `anulada_por`— mas el parcial de la feature 67
// `(mensajero_id) WHERE cierre_id IS NULL AND anulada_at IS NULL`. Ninguno empieza por
// `created_at`, y la consulta intradia filtra por `created_at` SIN `orden_id` ni
// `mensajero_id` por delante.
//
// SL-18 (decision de Camilo, 2026-10-26): desde SL-17 la consulta corre SIEMPRE con la empresa
// fijada (la RLS de `servi_app` añade `organizacion_id = ...`), y con `(created_at)` a secas el
// plan recorria las gestiones del dia de TODAS las empresas. La migracion
// `20261026090200_indices_ordenes_gestiones_historial` sustituye `gestion_orden_created_at_idx`
// por `(organizacion_id, created_at)`. La protección de R25 se conserva: la ventana sigue
// teniendo indice —la fecha es la segunda columna, detras de la igualdad de empresa— y el plan
// lo nombra con el rango dentro del `Index Cond`.
//
// Tres afirmaciones, y las tres hacen falta:
//   1. una migracion CREA el indice y su `down.sql` lo revierte (contrato del repo);
//   2. `db/schema.prisma` lo DECLARA —si no, el siguiente `prisma migrate dev` propone
//      borrarlo y el indice desaparece sin que nadie toque el `.sql`—;
//   3. contra Postgres real, el plan de la consulta intradia, con la empresa fijada como en la
//      app, NO hace `Seq Scan` sobre `gestion_orden` y lleva el rango de fechas al indice.

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
/** La migracion original de la 126: es historia aplicada y no cambia. */
const MIGRACION_126 = "db/migrations/20260803090000_gestion_orden_idx_created_at";
const INDICE_126 = "gestion_orden_created_at_idx";
/** SL-18 M3: el indice vigente, con la empresa delante. */
const MIGRACION = "db/migrations/20261026090200_indices_ordenes_gestiones_historial";
const INDICE = "gestion_orden_organizacion_id_created_at_idx";

function leer(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, ...rel.split("/")), "utf8");
}

function sentencias(sql: string): string[] {
  return sql
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("--"))
    .join(" ")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

describe("R25 · la migracion del indice intradia y su down", () => {
  it("la migracion de la 126 creo el indice sobre `gestion_orden(created_at)` y nada mas", () => {
    const up = leer(`${MIGRACION_126}/migration.sql`);
    expect(up).toMatch(
      new RegExp(`CREATE INDEX (IF NOT EXISTS )?"${INDICE_126}" ON "gestion_orden"\\("created_at"\\)`),
    );
    // «y nada mas»: una migracion que arrastre drift ajeno no se puede revertir con un DROP.
    expect(sentencias(up).length).toBe(1);
    const down = leer(`${MIGRACION_126}/down.sql`);
    expect(down).toMatch(new RegExp(`DROP INDEX IF EXISTS "${INDICE_126}"`));
    expect(sentencias(down).length).toBe(1);
  });

  it("SL-18: la migracion vigente sustituye el indice por `(organizacion_id, created_at)`", () => {
    const up = sentencias(leer(`${MIGRACION}/migration.sql`));
    expect(up).toContain(`DROP INDEX "${INDICE_126}"`);
    expect(up).toContain(`CREATE INDEX "${INDICE}" ON "gestion_orden" ("organizacion_id", "created_at")`);
  });

  it("SL-18: su `down.sql` revierte EXACTAMENTE: borra el compuesto y restaura el de la 126", () => {
    const down = sentencias(leer(`${MIGRACION}/down.sql`));
    expect(down).toContain(`DROP INDEX "${INDICE}"`);
    expect(down).toContain(`CREATE INDEX "${INDICE_126}" ON "gestion_orden" ("created_at")`);
  });

  it("el indice esta DECLARADO en `db/schema.prisma`, no solo en el `.sql`", () => {
    // La mutacion: borrar el `@@index` del datamodel y dejar solo el SQL. El indice
    // sobrevive... hasta el siguiente `prisma migrate dev`, que propone BORRARLO porque el
    // datamodel no lo conoce. El rojo tiene que aparecer aqui y no en esa consola.
    // Se lee el bloque del modelo: `tarifas` declara el mismo `@@index` y no cuenta.
    const modelo = /model GestionOrden \{[\s\S]*?\n\}/.exec(leer("db/schema.prisma"))?.[0] ?? "";
    expect(modelo, "no se encontro el modelo GestionOrden").toContain('@@map("gestion_orden")');
    expect(modelo).toMatch(/@@index\(\[organizacionId, createdAt\]\)/);
    // Y el viejo ya no: si volviera, el planificador lo seguiria eligiendo (medido en SL-18 T5.1).
    expect(modelo).not.toMatch(/@@index\(\[createdAt\]/);
  });
});

describe.skipIf(!HAY_BASE_DE_DATOS)("R25 · la consulta intradia de gestiones usa indice", () => {
  /**
   * EXPLAIN de la ventana intradia, dentro de una transaccion que SIEMPRE se revierte y con
   * `enable_seqscan` desactivado. Corre como `servi_app` con una empresa fijada (`comoApp`), que
   * es como la corre la app desde SL-17: la empresa entra por la RLS.
   *
   * POR QUE SE DESACTIVA EL SEQ SCAN, y por que eso NO es hacer trampa. Medido en la base de
   * desarrollo: `gestion_orden` tiene ahi tan pocas filas que el plan mas barato es leerla
   * entera (`cost=0.00..2.46`), y lo seguiria siendo aunque el indice fuera perfecto. Un test
   * que exigiera «no hay Seq Scan» sobre esa tabla estaria midiendo el TAMANO de la base de
   * desarrollo, no la existencia del indice, y saldria rojo o verde por razones ajenas a R25.
   *
   * Lo que R25 necesita demostrar es otra cosa y es comprobable: que EXISTE un indice
   * APLICABLE a este predicado —la empresa por igualdad y `created_at` con el rango— de modo que
   * cuando la tabla crezca el planificador tenga a que agarrarse. Con el seq scan desactivado,
   * si el indice existe y sirve, el plan lo NOMBRA; si no existe (la mutacion de R25: borrarlo
   * de la migracion), Postgres vuelve al seq scan pese a la penalizacion, y el caso sale rojo.
   * Con dos empresas sembradas, el plan elegido por coste lo comprueba
   * `indices-rutas-calientes.test.ts` (SL-18 R24).
   */
  async function planIntradia(): Promise<string> {
    const prisma = crearPrismaDeTest();
    try {
      return await prisma
        .$transaction(async (tx) => {
          const empresa = (await crearOrganizacion(tx)).id;
          await comoApp(tx, empresa);
          await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
          const desde = new Date("2026-08-03T06:00:00.000Z");
          const hasta = new Date("2026-08-03T15:00:00.000Z");
          const plan = await tx.$queryRaw<{ "QUERY PLAN": string }[]>`
            EXPLAIN SELECT g."id"
            FROM "gestion_orden" g
            WHERE g."anulada_at" IS NULL
              AND g."created_at" >= ${desde}
              AND g."created_at" <  ${hasta}`;
          throw new PlanLeido(plan.map((f) => f["QUERY PLAN"]).join("\n"));
        })
        .catch((e: unknown) => {
          if (e instanceof PlanLeido) return e.plan;
          throw e;
        });
    } finally {
      await prisma.$disconnect();
    }
  }

  it("el indice esta aplicado en la base (si no, no hay nada que medir)", async () => {
    const prisma = crearPrismaDeTest();
    try {
      const filas = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'gestion_orden' AND indexname = ${INDICE}`;
      expect(
        filas.length,
        `${INDICE} no esta aplicado en esta base: corre las migraciones antes de medir`,
      ).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("la consulta intradia de gestiones usa indice, con el rango de fechas dentro", async () => {
    const texto = await planIntradia();
    expect(texto, `el plan no nombra ${INDICE}:\n${texto}`).toContain(INDICE);
    expect(/Seq Scan on gestion_orden/i.test(texto), texto).toBe(false);
    // La empresa (de la RLS) y la ventana van al indice: sin el rango, el indice solo acotaria
    // por empresa y la consulta leeria todas sus gestiones historicas.
    expect(texto, texto).toMatch(/Index Cond: \(\(organizacion_id = .*\) AND \(created_at >= .*\) AND \(created_at < /);
  });

  it("el caso DISCRIMINA: sin ningun indice aplicable el plan vuelve al Seq Scan", async () => {
    // La contracara. Se prueba con un predicado para el que NO hay indice —una columna de texto
    // sin indexar— y con el mismo seq scan desactivado: el planificador no tiene alternativa y
    // escanea igualmente. Eso demuestra que el verde de arriba lo produce el indice y no el
    // hecho de haber desactivado el seq scan.
    const prisma = crearPrismaDeTest();
    try {
      const texto = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
        const plan = await tx.$queryRaw<{ "QUERY PLAN": string }[]>`
          EXPLAIN SELECT g."id" FROM "gestion_orden" g WHERE g."motivo" = 'inexistente'`;
        return plan.map((f) => f["QUERY PLAN"]).join("\n");
      });
      expect(texto).toMatch(/Seq Scan on gestion_orden/i);
      expect(texto).not.toContain(INDICE);
    } finally {
      await prisma.$disconnect();
    }
  });
});

/** Lleva el plan fuera de la transaccion, que se revierte siempre: la empresa creada no queda. */
class PlanLeido extends Error {
  constructor(readonly plan: string) {
    super("rollback deliberado del test");
  }
}
