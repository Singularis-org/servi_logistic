import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrganizacionRepository } from "@/lib/repositories/OrganizacionRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { OrganizacionService } from "@/lib/services/OrganizacionService";
import {
  HAY_BASE_DE_DATOS,
  SQL_ETIQUETAS_DE_ENUM,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";
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
 * SLT-77 / T1.4 (design §1.1, R2, R6, R38) — las migraciones del tope de intentos contra Postgres REAL.
 *
 * BASE PROPIA (`slt77_ti_<rand>`): el down recrea los enums del historial y suelta la columna, y en la base
 * compartida chocaria con los archivos que corren en paralelo. Ademas, asi las empresas «previas» existen de
 * verdad antes de que corra el `ALTER TABLE`, y el DEFAULT y el CHECK que se miden son los del archivo.
 *
 * El alta real (R2, empresa nueva) corre aparte, en la base del gate y en una transaccion revertida.
 *
 * Los numeros de cada caso (3, 1, 10, 0, 11, -1) y las listas de columnas y de privilegios van a mano: son el
 * contrato, y leerlos de la migracion los dejaria siempre verdes.
 */

const HISTORIAL = "20261107130000_historial_tope_intentos";
const COLUMNA = "20261107130100_organizacion_tope_intentos";
const DE_SLT77 = [HISTORIAL, COLUMNA] as const;
const ULTIMA_PREVIA = "20261107120200_slt42_usuario_documento_unico_por_tipo";

const CHECK = "organizacion_tope_intentos_entrega_check";
const POLITICA = "organizacion_propia_editar_tope";

/** Lo que el codigo anterior a SLT-77 lee de `organizacion`: las columnas de su modelo, sin el tope. */
const COLUMNAS_DEL_CODIGO_ANTERIOR = [
  "id",
  "nombre",
  "slug",
  "created_at",
  "updated_at",
  "cobro_plataforma_por_orden",
  "es_demo",
  "pais_id",
  "plan_id",
  "plan_ciclo_ancla_at",
  "plan_tipo_cobro",
  "plan_cambio_id",
  "plan_cambio_plan_id",
  "plan_cambio_tipo_cobro",
  "plan_cambio_desde_at",
  "plan_cambio_actor_id",
];

const BASE = `slt77_ti_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-77 — las migraciones del tope, en disco", () => {
  it("R38 — existen, traen down.sql y van detras de la ultima migracion previa", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas).toContain(ULTIMA_PREVIA);
    for (const m of DE_SLT77) {
      expect(carpetas).toContain(m);
      expect(m > ULTIMA_PREVIA).toBe(true);
      expect(existsSync(path.join(MIGRACIONES, m, "down.sql")), `${m} sin down.sql`).toBe(true);
    }
    expect(HISTORIAL < COLUMNA).toBe(true);
  });
});

interface ClienteFijo {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}

let admin: Conexion;
let pool: Conexion;
/** Cliente fijo: `pool.query` destruye la conexion al primer error y se perderia la transaccion del caso. */
let db: Conexion;
let empresaA: string;
let empresaB: string;
let antes: Foto;
let accesoAntes: AccesoDeLaApp;

interface AccesoDeLaApp {
  privilegios: string[];
  politicas: string[];
}

async function sembrarEmpresa(etiqueta: string): Promise<string> {
  const id = randomUUID();
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    id,
    `SLT77 ${etiqueta}`,
    `slt77-${etiqueta.toLowerCase()}-${id.slice(0, 8)}`,
  ]);
  return id;
}

async function topeDe(id: string): Promise<unknown> {
  const { rows } = await db.query(`SELECT "tope_intentos_entrega" AS tope FROM "organizacion" WHERE "id" = $1`, [id]);
  expect(rows).toHaveLength(1);
  return rows[0].tope;
}

async function subir(): Promise<void> {
  for (const m of DE_SLT77) await ejecutar(db, sqlDe(m, "migration.sql"), `${m} (up)`);
}

async function bajar(): Promise<void> {
  for (const m of [...DE_SLT77].reverse()) await ejecutar(db, sqlDe(m, "down.sql"), `${m} (down)`);
}

async function etiquetas(tipo: string): Promise<string[]> {
  const { rows } = await db.query(SQL_ETIQUETAS_DE_ENUM, [tipo]);
  return rows.map((r) => String(r.etiqueta));
}

/** Lo que la foto del fixture no mira y este down tiene que devolver: que puede tocar la app en la tabla. */
async function accesoDeLaApp(): Promise<AccesoDeLaApp> {
  const { rows: privilegios } = await db.query(
    `SELECT privilege_type || ' ' || column_name AS l FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'organizacion' AND grantee = 'servi_app'
        AND privilege_type <> 'SELECT'
      ORDER BY 1`,
  );
  const { rows: politicas } = await db.query(
    `SELECT policyname || ' ' || cmd AS l FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'organizacion' ORDER BY 1`,
  );
  return { privilegios: privilegios.map((r) => String(r.l)), politicas: politicas.map((r) => String(r.l)) };
}

/** La foto del fixture SIN el conteo de filas: el caso de la vuelta escribe filas entre fotos. */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  return resto;
}

async function historial(accion: string, entidadTipo: string, entidadId: string, empresa: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta",
       "valor_anterior", "valor_nuevo", "lote_id", "organizacion_id")
     VALUES ($1, $2::historial_accion_tipo, $3::historial_accion_entidad, $4, 'Intentos de entrega', '3', '7', $5, $6)`,
    [id, accion, entidadTipo, entidadId, randomUUID(), empresa],
  );
  return id;
}

/** Corre `sql` en una transaccion revertida y devuelve las filas afectadas o el error. */
async function intentarRevertido(
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: true; filas: number } | { ok: false; code: string | undefined; constraint: string | undefined }> {
  await db.query("BEGIN");
  try {
    const r = (await db.query(sql, params)) as { rowCount?: number | null };
    return { ok: true, filas: Number(r.rowCount) };
  } catch (error) {
    const e = error as { code?: string; constraint?: string };
    return { ok: false, code: e.code, constraint: e.constraint };
  } finally {
    await db.query("ROLLBACK");
  }
}

describe.skipIf(!HAY_BASE_DE_DATOS)("SLT-77 — la columna del tope (Postgres real, base propia)", () => {
  let subida: Foto;

  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    pool = await conectar(urlDe(BASE));
    const cliente = await (pool as unknown as { connect(): Promise<ClienteFijo> }).connect();
    db = { query: (t, v) => cliente.query(t, v), end: async () => cliente.release() };
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, HISTORIAL);

    empresaA = await sembrarEmpresa("A");
    empresaB = await sembrarEmpresa("B");

    antes = await foto(db);
    accesoAntes = await accesoDeLaApp();
    await subir();
    subida = await fotoSinFilas();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R2 — toda empresa que ya existia queda en 3, sin que nadie lo fije", async () => {
    expect(await topeDe(empresaA)).toBe(3);
    expect(await topeDe(empresaB)).toBe(3);
  });

  it("R2 — una empresa creada despues, sin decir el tope, nace en 3", async () => {
    await db.query("BEGIN");
    try {
      expect(await topeDe(await sembrarEmpresa("Despues"))).toBe(3);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("R2 — no admite vacio: ninguna empresa puede quedar sin tope", async () => {
    expect(
      await intentarRevertido(`UPDATE "organizacion" SET "tope_intentos_entrega" = NULL WHERE "id" = $1`, [empresaA]),
    ).toMatchObject({ ok: false, code: "23502" });
  });

  it.each([1, 10])("R6 — el extremo %i se admite por SQL a mano", async (valor) => {
    expect(
      await intentarRevertido(`UPDATE "organizacion" SET "tope_intentos_entrega" = $1 WHERE "id" = $2`, [valor, empresaA]),
    ).toEqual({ ok: true, filas: 1 });
  });

  it.each([0, 11, -1])("R6 — la base rechaza %i por SQL a mano, en un UPDATE y en un INSERT", async (valor) => {
    const esperado = { ok: false, code: "23514", constraint: CHECK };
    expect(
      await intentarRevertido(`UPDATE "organizacion" SET "tope_intentos_entrega" = $1 WHERE "id" = $2`, [valor, empresaA]),
    ).toEqual(esperado);
    const id = randomUUID();
    expect(
      await intentarRevertido(
        `INSERT INTO "organizacion" ("id", "nombre", "slug", "tope_intentos_entrega") VALUES ($1, $2, $3, $4)`,
        [id, "SLT77 fuera de rango", `slt77-fuera-${id.slice(0, 8)}`, valor],
      ),
    ).toEqual(esperado);
  });

  it("control: la subida abre a la app justo lo del tope (si no, la vuelta no probaria nada)", async () => {
    expect(diferencias(subida, antes).length).toBeGreaterThan(0);
    expect(accesoAntes).toEqual({ privilegios: [], politicas: ["organizacion_propia SELECT"] });
    expect(await accesoDeLaApp()).toEqual({
      privilegios: ["UPDATE tope_intentos_entrega", "UPDATE updated_at"],
      politicas: ["organizacion_propia SELECT", `${POLITICA} UPDATE`],
    });
  });

  // El ultimo caso: deja la base bajada y vuelta a subir.
  it("R38 — el down deja la base como la lee el codigo anterior, y el up vuelve a dejarla igual", async () => {
    // Un valor elegido, y filas del historial con los valores que el down tiene que llevarse.
    await db.query(`UPDATE "organizacion" SET "tope_intentos_entrega" = 7 WHERE "id" = $1`, [empresaA]);
    await historial("tope_intentos_cambiado", "organizacion", empresaA, empresaA);
    // Una fila ajena, que el down no debe tocar.
    const ajena = await historial("tarifa_valor_fijado", "tarifa_valor", randomUUID(), empresaA);

    await bajar();

    // Ni la columna, ni el CHECK, ni los valores de enum.
    const { rows: columnas } = await db.query(
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizacion' ORDER BY ordinal_position`,
    );
    expect(columnas.map((r) => r.c)).toEqual(COLUMNAS_DEL_CODIGO_ANTERIOR);
    const { rows: checks } = await db.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1 AND connamespace = 'public'::regnamespace`,
      [CHECK],
    );
    expect(checks).toEqual([]);
    const tipos = await etiquetas("historial_accion_tipo");
    expect(tipos).not.toContain("tope_intentos_cambiado");
    expect(tipos.at(-1)).toBe("plan_cambio_empresa_cancelado");
    const entidades = await etiquetas("historial_accion_entidad");
    expect(entidades).not.toContain("organizacion");
    expect(entidades.at(-1)).toBe("tarifa_activacion");

    // La tabla vuelve a ser de solo lectura para la app, tambien en la columna que sobrevive al DROP.
    expect(await accesoDeLaApp()).toEqual({ privilegios: [], politicas: ["organizacion_propia SELECT"] });
    await db.query("BEGIN");
    try {
      await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [empresaA]);
      await db.query(`SET LOCAL ROLE servi_app`);
      // El codigo anterior lee sus columnas y ve su empresa; las filas del historial que quedan, tambien.
      const { rows: leida } = await db.query(`SELECT ${COLUMNAS_DEL_CODIGO_ANTERIOR.map((c) => `"${c}"`).join(", ")} FROM "organizacion"`);
      expect(leida.map((r) => r.id)).toEqual([empresaA]);
      const { rows: rastro } = await db.query(`SELECT "id", "accion"::text AS accion FROM "historial_accion"`);
      expect(rastro).toEqual([{ id: ajena, accion: "tarifa_valor_fijado" }]);
      await db.query("SAVEPOINT solo_lectura");
      const escritura = await db.query(`UPDATE "organizacion" SET "updated_at" = now()`).then(
        () => "escribio",
        (e: { code?: string }) => e.code,
      );
      expect(escritura).toBe("42501");
      await db.query("ROLLBACK TO SAVEPOINT solo_lectura");
    } finally {
      await db.query("ROLLBACK");
    }

    // El alta de antes, que no conocia la columna, sigue pudiendo insertar.
    expect(
      await intentarRevertido(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, 'SLT77 antes', $2)`, [
        randomUUID(),
        `slt77-antes-${randomUUID().slice(0, 8)}`,
      ]),
    ).toEqual({ ok: true, filas: 1 });

    // El esquema y los conteos son los de antes, salvo la fila ajena que sembro este caso.
    await db.query(`DELETE FROM "historial_accion" WHERE "id" = $1`, [ajena]);
    expect(diferencias(await foto(db), antes)).toEqual([]);
    expect(await accesoDeLaApp()).toEqual(accesoAntes);

    // Reaplicada, igual que la primera vez. Los valores elegidos se pierden, y lo dice `design §8`.
    await subir();
    expect(diferencias(await fotoSinFilas(), subida)).toEqual([]);
    expect(await topeDe(empresaA)).toBe(3);
  }, 180_000);
});

describe.skipIf(!HAY_BASE_DE_DATOS)("SLT-77 — una empresa dada de alta (Postgres real, base del gate)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R2 — `altaEmpresa` no conoce el tope y la empresa nace con 3", async () => {
    await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const sufijo = randomUUID().slice(0, 8);
      const cliente = clienteConTransaccionAnidada(tx);
      const servicio = new OrganizacionService(new OrganizacionRepository(cliente), new PaisRepository(cliente));
      const r = await servicio.altaEmpresa({
        nombre: `Empresa tope ${sufijo}`,
        slug: `tope-${sufijo}`,
        paisId: "CR",
        maestro: {
          nombre: "Maestra de prueba",
          email: `tope-${sufijo}@example.test`,
          telefono: "88887777",
          // SLT-42 (R11): la cedula fisica de CR son 9 digitos; la empresa es nueva, asi que no choca.
          documento: String(100_000_000 + Math.floor(Math.random() * 900_000_000)),
          tipoDocumento: "cedula",
        },
      });
      if (r.estado !== "creada") throw new Error(`el alta no creo la empresa: ${JSON.stringify(r)}`);
      const fila = await tx.organizacion.findUniqueOrThrow({
        where: { id: r.organizacionId },
        select: { topeIntentosEntrega: true },
      });
      expect(fila.topeIntentosEntrega).toBe(3);
    });
  });
});
