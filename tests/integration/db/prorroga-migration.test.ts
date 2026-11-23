import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
  aplicarMigracionesHasta,
  carpetasDeMigracion,
  conectar,
  diferencias,
  ejecutar,
  foto,
  sqlDe,
  urlDe,
  type Conexion,
  type Foto,
} from "./_fixtures/ida-y-vuelta-32";

/**
 * SLT-255 · T1.1 (design §1.2, §8) — la migración de enums de la prórroga del pago.
 *
 *   · en disco: va justo después de las dos de SLT-121, sola (55P04) y sin usar sus valores; su `down` va en
 *     `BEGIN … COMMIT` y es la función de SLT-136 byte a byte salvo el sufijo;
 *   · de ida y vuelta, en una base PROPIA (`slt255_iv_<rand>`): el `down` recrea `historial_accion_tipo`, y en la
 *     base compartida tomaría su lock bajo los demás archivos. Subir, ver que el `down` aborta si una fila usa un
 *     valor, bajar, bajar otra vez (idempotente) y volver a subir.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_121 = "20261126120100_mora_congelamiento";
const M = "20261127120000_prorroga_enums";
const BASE = `slt255_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const VALORES = ["empresa_prorroga_fijada", "empresa_prorroga_quitada"];

/** Lo único que la migración puede añadir a la foto: los valores del enum del historial. */
const LO_NUEVO = /^tipos: historial_accion_tipo /;

/** Las líneas de la función de quitar valores de enum de un `down.sql`, con el sufijo neutralizado. */
function funcionDeQuitar(sql: string, sufijo: string): string {
  const desde = sql.indexOf(`CREATE OR REPLACE FUNCTION pg_temp.quitar_valores_de_enum_${sufijo}`);
  const hasta = sql.indexOf("$fn$;", desde);
  return sql.slice(desde, hasta).replaceAll(`_${sufijo}`, "_X").replaceAll(`rollback ${sufijo}`, "rollback X");
}

describe("SLT-255 — la migración de enums en disco", () => {
  it("va justo después de la de SLT-121, sola y sin usar sus valores; añade los dos con IF NOT EXISTS", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M_121)).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M)).toBe(carpetas.indexOf(M_121) + 1);

    const subida = sqlDe(M, "migration.sql");
    for (const v of VALORES) {
      expect(subida).toContain(`ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS '${v}';`);
    }
    // Solo esos dos ALTER: ni otro tipo, ni tablas, ni datos.
    expect(subida.match(/^ALTER TYPE/gm)).toHaveLength(2);
    // Va sola: un valor de enum no se puede usar en la transacción que lo añade (55P04).
    expect(subida).not.toMatch(/^\s*(BEGIN|INSERT|UPDATE|DELETE|CREATE|DROP)\b/m);
  });

  it("el down va en BEGIN … COMMIT, usa la función de SLT-136 byte a byte salvo el sufijo y quita solo los dos", () => {
    const bajada = sqlDe(M, "down.sql");
    const slt136 = sqlDe("20261117120000_factura_plataforma_aviso_enums", "down.sql");
    expect(bajada).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(funcionDeQuitar(bajada, "255").length).toBeGreaterThan(1000);
    expect(funcionDeQuitar(bajada, "255")).toBe(funcionDeQuitar(slt136, "136"));

    const llamadas = [...bajada.matchAll(/SELECT pg_temp\.quitar_valores_de_enum_255\('public', '(\w+)', ARRAY\[([^\]]*)\]\)/g)];
    expect(llamadas.map((m) => m[1])).toEqual(["historial_accion_tipo"]);
    expect([...llamadas[0][2].matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual(VALORES);
  });
});

describeSiHayBase("SLT-255 — subir, bajar y volver a subir", () => {
  let db: Conexion;
  let admin: Conexion | undefined;
  let antes: Foto;
  let despues: Foto;
  let org = "";

  async function etiquetas(): Promise<string[]> {
    const { rows } = await db.query(
      `SELECT e.enumlabel::text AS k FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'historial_accion_tipo' AND e.enumlabel = ANY ($1::text[])`,
      [VALORES],
    );
    return rows.map((r) => String(r.k)).sort();
  }

  /** El último valor del enum, para afirmar que los dos van al final y en orden. */
  async function ultimos(n: number): Promise<string[]> {
    const { rows } = await db.query(
      `SELECT e.enumlabel::text AS k FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'historial_accion_tipo'
        ORDER BY e.enumsortorder DESC LIMIT $1`,
      [n],
    );
    return rows.map((r) => String(r.k)).reverse();
  }

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);
    org = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
      org,
      `SLT255 IV ${org.slice(0, 8)}`,
      `slt255-iv-${org.slice(0, 8)}`,
    ]);
    antes = await foto(db);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("subir añade solo los dos valores, al final del enum, y no toca filas", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    despues = await foto(db);

    const otras = diferencias(despues, antes).filter((l) => !LO_NUEVO.test(l.replace(/^(sobra|falta) en /, "")));
    expect(otras).toEqual([]);
    expect(await etiquetas()).toEqual([...VALORES].sort());
    expect(await ultimos(3)).toEqual(["factura_dias_gracia_cambiada", ...VALORES]);
  });

  it("el down aborta sin tocar nada si una fila del historial usa un valor de la prórroga", async () => {
    const fila = randomUUID();
    await db.query(
      `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta",
         "valor_anterior", "valor_nuevo", "lote_id", "organizacion_id")
       VALUES ($1, 'empresa_prorroga_fijada'::historial_accion_tipo, 'organizacion'::historial_accion_entidad, $2,
               'Plazo de pago y mora', NULL, 'hasta 2026-12-10 — prueba', $3, $2)`,
      [fila, org, randomUUID()],
    );

    const error = await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorDeScript);
    expect((error as ErrorDeScript).sqlstate).toBe("P0001");
    expect((error as Error).message).toContain(
      "rollback 255: 1 filas de historial_accion.accion usan {empresa_prorroga_fijada,empresa_prorroga_quitada}",
    );
    expect(await etiquetas()).toEqual([...VALORES].sort());
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "historial_accion" WHERE "id" = $1`, [fila]);
    expect(rows).toEqual([{ n: 1 }]);

    await db.query(`DELETE FROM "historial_accion" WHERE "id" = $1`, [fila]);
  });

  it("bajar deja el esquema y las filas como antes de subir", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(diferencias(await foto(db), antes)).toEqual([]);
    expect(await etiquetas()).toEqual([]);
  });

  it("bajar otra vez no hace nada (idempotente)", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);
    expect(diferencias(await foto(db), antes)).toEqual([]);
  });

  it("subir otra vez da el mismo esquema que la primera", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    expect(diferencias(await foto(db), despues)).toEqual([]);
  });
});
