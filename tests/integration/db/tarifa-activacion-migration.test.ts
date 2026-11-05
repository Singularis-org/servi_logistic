import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS, SQL_ETIQUETAS_DE_ENUM } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  MIGRACIONES,
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
 * SLT-54 / T1.1 (design §2, R8, R11, R12) — las migraciones de la activacion contra Postgres REAL.
 *
 * BASE PROPIA (`slt54_ta_<rand>`): el down recrea los enums del historial y suelta la tabla, y en la base
 * compartida chocaria con los archivos que corren en paralelo. Ademas, asi el «antes del up» es de verdad
 * el esquema anterior, leido de `db/migrations`, y el relleno corre sobre datos de verdad.
 *
 * 1. Se aplican las migraciones anteriores y se siembran con SQL a mano tres empresas: A con valores en
 *    `tarifa_valor`, B solo con el modelo viejo, y C sin nada.
 * 2. Se aplican las dos de SLT-54 sentencia a sentencia, como `migrate deploy`.
 * 3. Los casos de RLS y privilegios bajan a `servi_app` con `SET LOCAL ROLE`, en transacciones revertidas.
 * 4. El ultimo caso hace bajada y subida, y compara la foto de catalogos y los conteos.
 */

const HISTORIAL = "20261104140000_historial_tarifa_activacion";
const TABLA = "20261104140100_tarifa_activacion";
const DE_SLT54 = [HISTORIAL, TABLA] as const;
const ULTIMA_PREVIA = "20261104130100_historial_accion_plan_tipo_cobro_cambiado";

const TABLAS_QUE_NO_CAMBIAN = [
  "organizacion",
  "zona",
  "usuario",
  "tarifa_valor",
  "tarifas",
  "tarifa_zona_mensajero",
  "historial_accion",
] as const;

const BASE = `slt54_ta_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-54 — las migraciones de la activacion, en disco", () => {
  it("existen, traen down.sql y van detras de la ultima migracion previa", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas).toContain(ULTIMA_PREVIA);
    for (const m of DE_SLT54) {
      expect(carpetas).toContain(m);
      expect(m > ULTIMA_PREVIA).toBe(true);
      expect(existsSync(path.join(MIGRACIONES, m, "down.sql")), `${m} sin down.sql`).toBe(true);
    }
    expect(HISTORIAL < TABLA).toBe(true);
  });
});

type Resultado = { ok: true } | { ok: false; code: string | undefined; constraint: string | undefined };

interface ClienteFijo {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(): void;
}

interface Empresa {
  id: string;
  zonaId: string;
  usuarioId: string;
}

let admin: Conexion;
let pool: Conexion;
/** Cliente fijo: `pool.query` destruye la conexion al primer error y se perderia la transaccion del caso. */
let db: Conexion;
let a: Empresa;
let b: Empresa;
let c: Empresa;
let antes: Foto;
let conteosAntes: Record<string, number>;
let filasAntes: Record<string, unknown[]>;

async function contar(tabla: string, where = "TRUE", params: unknown[] = []): Promise<number> {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM "${tabla}" WHERE ${where}`, params);
  return Number(rows[0].n);
}

async function enTxRevertida<T>(fn: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    return await fn();
  } finally {
    await db.query("ROLLBACK");
  }
}

async function intento(sql: string, params: unknown[] = []): Promise<Resultado & { filas?: number | null }> {
  await db.query("SAVEPOINT intento");
  try {
    const r = await db.query(sql, params);
    await db.query("RELEASE SAVEPOINT intento");
    return { ok: true, filas: (r as { rowCount?: number | null }).rowCount };
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT intento");
    const e = error as { code?: string; constraint?: string };
    return { ok: false, code: e.code, constraint: e.constraint };
  }
}

async function comoApp(organizacionId: string): Promise<void> {
  await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [organizacionId]);
  await db.query(`SET LOCAL ROLE servi_app`);
}

async function comoDuenio(): Promise<void> {
  await db.query(`RESET ROLE`);
}

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const id = randomUUID();
  const sufijo = id.slice(0, 8);
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    id,
    `SLT54 ${etiqueta} ${sufijo}`,
    `slt54-${etiqueta.toLowerCase()}-${sufijo}`,
  ]);
  const zonaId = randomUUID();
  await db.query(
    `INSERT INTO "zona" ("id", "organizacion_id", "nombre", "sinpe_numero", "sinpe_nombre") VALUES ($1, $2, $3, '80000000', 'Titular de Prueba')`,
    [zonaId, id, `Zona ${etiqueta} ${sufijo}`],
  );
  const { rows: rol } = await db.query(`SELECT "id" FROM "rol" WHERE "value" = 'maestro'`);
  const { rows: tipo } = await db.query(`SELECT "id" FROM "tipo_identificacion" WHERE "value" = 'cedula'`);
  const usuarioId = randomUUID();
  await db.query(
    `INSERT INTO "usuario" ("id", "organizacion_id", "nombre", "email", "telefono", "password_hash", "cedula",
       "tipo_identificacion_id", "rol_id", "updated_at")
     VALUES ($1, $2, $3, $4, '88880000', 'x', $5, $6, $7, now())`,
    [usuarioId, id, `Maestro ${etiqueta}`, `m-${usuarioId.slice(0, 12)}@example.test`, `slt54-${usuarioId.slice(0, 12)}`, tipo[0].id, rol[0].id],
  );
  return { id, zonaId, usuarioId };
}

async function sembrarValor(e: Empresa, concepto: string, valor: string): Promise<void> {
  await db.query(
    `INSERT INTO "tarifa_valor" ("id", "organizacion_id", "concepto", "modo", "valor", "iva_pct", "zona_id")
     VALUES ($1, $2, $3::"tarifa_concepto", 'monto', $4::numeric, 13, $5)`,
    [randomUUID(), e.id, concepto, valor, e.zonaId],
  );
}

async function sembrarViejo(e: Empresa): Promise<void> {
  await db.query(
    `INSERT INTO "tarifas" ("id", "organizacion_id", "valor_flete", "valor_flete_devuelto", "valor_flete_gam",
       "valor_flete_devuelto_gam", "comision_cod", "iva_flete", "iva_comision_cod", "zona_id", "updated_at")
     VALUES ($1, $2, 2500, 1200, 2000, 1000, 3, 13, 13, $3, now())`,
    [randomUUID(), e.id, e.zonaId],
  );
  await db.query(
    `INSERT INTO "tarifa_zona_mensajero" ("id", "organizacion_id", "cobro_entregado", "cobro_rechazado", "zona_id")
     VALUES ($1, $2, 1500, 700, $3)`,
    [randomUUID(), e.id, e.zonaId],
  );
}

async function conteos(): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  for (const t of TABLAS_QUE_NO_CAMBIAN) r[t] = await contar(t);
  return r;
}

async function filas(): Promise<Record<string, unknown[]>> {
  const r: Record<string, unknown[]> = {};
  for (const t of ["tarifa_valor", "tarifas", "tarifa_zona_mensajero"]) {
    const { rows } = await db.query(`SELECT row_to_json(x)::text AS f FROM "${t}" x ORDER BY x."id"`);
    r[t] = rows.map((f) => f.f);
  }
  return r;
}

async function etiquetas(tipo: string): Promise<string[]> {
  const { rows } = await db.query(SQL_ETIQUETAS_DE_ENUM, [tipo]);
  return rows.map((r) => String(r.etiqueta));
}

async function subir(): Promise<void> {
  for (const m of DE_SLT54) await ejecutar(db, sqlDe(m, "migration.sql"), `${m} (up)`);
}

async function bajar(): Promise<void> {
  for (const m of [...DE_SLT54].reverse()) await ejecutar(db, sqlDe(m, "down.sql"), `${m} (down)`);
}

const SQL_ACTIVAR = `INSERT INTO "tarifa_activacion" ("id", "organizacion_id", "activada_por") VALUES ($1, $2, $3)`;

describe.skipIf(!HAY_BASE_DE_DATOS)("SLT-54 — la tabla de la activacion (Postgres real, base propia)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    pool = await conectar(urlDe(BASE));
    const cliente = await (pool as unknown as { connect(): Promise<ClienteFijo> }).connect();
    db = { query: (t, v) => cliente.query(t, v), end: async () => cliente.release() };
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, HISTORIAL);

    a = await sembrarEmpresa("A");
    b = await sembrarEmpresa("B");
    c = await sembrarEmpresa("C");
    await sembrarViejo(a);
    await sembrarViejo(b);
    // Dos valores en A: el relleno es una fila por EMPRESA, no por valor.
    await sembrarValor(a, "tienda_flete_entregado", "1500.00");
    await sembrarValor(a, "tienda_flete_rechazo", "900.00");

    antes = await foto(db);
    conteosAntes = await conteos();
    filasAntes = await filas();
    await subir();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R11 — relleno: la empresa con valores queda activada sin actor; las demas, no", async () => {
    expect(conteosAntes.tarifa_valor).toBe(2);
    const { rows } = await db.query(`SELECT "organizacion_id", "activada_por", "activada_at" FROM "tarifa_activacion"`);
    expect(rows).toHaveLength(1);
    expect(rows[0].organizacion_id).toBe(a.id);
    expect(rows[0].activada_por).toBeNull();
    expect(rows[0].activada_at).toBeInstanceOf(Date);
  });

  it("R11 — el relleno no deja historial ni cambia ninguna otra fila", async () => {
    expect(await conteos()).toEqual(conteosAntes);
    expect(await filas()).toEqual(filasAntes);
    expect(await contar("historial_accion", `"accion"::text = 'tarifas_activadas'`)).toBe(0);
  });

  it("R8 — la app no modifica ni borra una activacion: 42501, incluida la suya", async () => {
    await enTxRevertida(async () => {
      await comoApp(a.id);
      const propia = await contar("tarifa_activacion");
      expect(propia).toBe(1);
      expect(await intento(`UPDATE "tarifa_activacion" SET "activada_at" = now()`)).toMatchObject({ ok: false, code: "42501" });
      expect(await intento(`UPDATE "tarifa_activacion" SET "activada_por" = $1`, [a.usuarioId])).toMatchObject({
        ok: false,
        code: "42501",
      });
      expect(await intento(`DELETE FROM "tarifa_activacion"`)).toMatchObject({ ok: false, code: "42501" });
      expect(await contar("tarifa_activacion")).toBe(1);
    });
  });

  it("R7 — el unico por empresa: una segunda fila de la misma empresa choca", async () => {
    await enTxRevertida(async () => {
      await comoApp(a.id);
      expect(await intento(SQL_ACTIVAR, [randomUUID(), a.id, a.usuarioId])).toEqual({
        ok: false,
        code: "23505",
        constraint: "tarifa_activacion_organizacion_id_key",
      });
    });
  });

  it("R12 — RLS: cada empresa ve solo su fila y no crea la de otra", async () => {
    await enTxRevertida(async () => {
      await comoApp(b.id);
      expect(await contar("tarifa_activacion")).toBe(0);
      expect(await contar("tarifa_activacion", `"organizacion_id" = $1`, [a.id])).toBe(0);
      expect(await intento(SQL_ACTIVAR, [randomUUID(), c.id, null])).toMatchObject({ ok: false, code: "42501" });
      // Sin empresa en el contexto, tampoco: el `NULLIF` de la politica no deja pasar nada.
      await db.query(`SELECT set_config('app.organizacion_id', '', true)`);
      expect(await contar("tarifa_activacion")).toBe(0);
    });
    await enTxRevertida(async () => {
      await comoApp(a.id);
      expect(await contar("tarifa_activacion")).toBe(1);
    });
  });

  it("R4 — la app crea la suya, con el DEFAULT de la empresa de la transaccion y sin decirla", async () => {
    await enTxRevertida(async () => {
      await comoApp(b.id);
      const id = randomUUID();
      expect(
        await intento(`INSERT INTO "tarifa_activacion" ("id", "activada_por") VALUES ($1, $2)`, [id, b.usuarioId]),
      ).toMatchObject({ ok: true, filas: 1 });
      const { rows } = await db.query(`SELECT "organizacion_id", "activada_por" FROM "tarifa_activacion" WHERE "id" = $1`, [id]);
      expect(rows).toEqual([{ organizacion_id: b.id, activada_por: b.usuarioId }]);
    });
  });

  it("trigger de misma empresa: el actor no puede ser de otra empresa (SL017)", async () => {
    await enTxRevertida(async () => {
      await comoApp(b.id);
      const r = await intento(SQL_ACTIVAR, [randomUUID(), b.id, c.usuarioId]);
      expect(r).toMatchObject({ ok: false, code: "SL017" });
    });
  });

  it("trigger de sin cambio de empresa: ni el dueño mueve una fila a otra empresa (SL017)", async () => {
    await enTxRevertida(async () => {
      const r = await intento(`UPDATE "tarifa_activacion" SET "organizacion_id" = $1`, [b.id]);
      expect(r).toMatchObject({ ok: false, code: "SL017" });
    });
  });

  it("borrar al usuario que activo deja la fila con actor NULL: la empresa sigue activada", async () => {
    await enTxRevertida(async () => {
      const empresa = await sembrarEmpresa("D");
      await db.query(SQL_ACTIVAR, [randomUUID(), empresa.id, empresa.usuarioId]);
      await comoApp(empresa.id);
      expect(await intento(`DELETE FROM "usuario" WHERE "id" = $1`, [empresa.usuarioId])).toMatchObject({ ok: true, filas: 1 });
      await comoDuenio();
      const { rows } = await db.query(`SELECT "activada_por" FROM "tarifa_activacion" WHERE "organizacion_id" = $1`, [empresa.id]);
      expect(rows).toEqual([{ activada_por: null }]);
    });
  });

  it("los valores del historial existen tras el up", async () => {
    expect(await etiquetas("historial_accion_tipo")).toContain("tarifas_activadas");
    expect(await etiquetas("historial_accion_entidad")).toContain("tarifa_activacion");
  });

  it("R11 — relleno y bajada: el down deja el esquema como estaba y el up vuelve a activar lo que toca", async () => {
    // Con la empresa activada y una fila de historial del tipo nuevo, que el down tiene que llevarse.
    await db.query(
      `INSERT INTO "historial_accion" ("id", "organizacion_id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta", "lote_id",
         "actor_usuario_id", "actor_nombre", "actor_rol", "valor_nuevo")
       VALUES ($1, $2, 'tarifas_activadas', 'tarifa_activacion', $3, 'Tarifas nuevas', $4, $5, 'Maestro', 'maestro', 'faltantes: 0')`,
      [randomUUID(), a.id, randomUUID(), randomUUID(), a.usuarioId],
    );
    // Una fila de otra accion, que el down no debe tocar.
    const ajena = randomUUID();
    await db.query(
      `INSERT INTO "historial_accion" ("id", "organizacion_id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta", "lote_id",
         "actor_usuario_id", "actor_nombre", "actor_rol", "valor_nuevo")
       VALUES ($1, $2, 'tarifa_valor_fijado', 'tarifa_valor', $3, 'Otra', $4, $5, 'Maestro', 'maestro', 'monto 1.00')`,
      [ajena, a.id, randomUUID(), randomUUID(), a.usuarioId],
    );
    expect(await contar("historial_accion")).toBe(conteosAntes.historial_accion + 2);

    await bajar();

    const { rows: tabla } = await db.query(`SELECT to_regclass('public.tarifa_activacion') AS t`);
    expect(tabla[0].t).toBeNull();
    expect(await etiquetas("historial_accion_tipo")).not.toContain("tarifas_activadas");
    expect(await etiquetas("historial_accion_entidad")).not.toContain("tarifa_activacion");
    // El down se lleva lo del tipo nuevo y nada mas.
    expect(await contar("historial_accion", `"id" = $1`, [ajena])).toBe(1);
    await db.query(`DELETE FROM "historial_accion" WHERE "id" = $1`, [ajena]);
    expect(diferencias(await foto(db), antes)).toEqual([]);
    expect(await conteos()).toEqual(conteosAntes);
    expect(await filas()).toEqual(filasAntes);

    // Una empresa que ganó valores mientras tanto: la regla se aplica sobre lo que haya al subir.
    await sembrarValor(c, "tienda_flete_entregado", "700.00");
    await subir();

    const { rows } = await db.query(`SELECT "organizacion_id", "activada_por" FROM "tarifa_activacion"`);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { organizacion_id: a.id, activada_por: null },
        { organizacion_id: c.id, activada_por: null },
      ]),
    );
  }, 120_000);
});
