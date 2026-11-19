import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
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
 * SLT-129 (design §1.2; R24) — la migración del borrador de planes, de ida y vuelta, en una base PROPIA
 * (`slt129_iv_<rand>`): la base de `DATABASE_URL` no se toca.
 *
 * 1. Con todo lo anterior aplicado y un plan sembrado, se sube: la tabla nace con sus CHECK, su UNIQUE, su FK,
 *    la RLS sin políticas y sin nada para `servi_app`.
 * 2. Con un borrador de cambio guardado, se baja: el esquema (columnas, constraints, índices, privilegios,
 *    políticas, RLS) y las filas de las demás tablas son los de antes de subir.
 * 3. Se sube otra vez: el esquema es el mismo que la primera vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

// Mismo timestamp que M; el orden alfabético de carpetas la pone justo delante ("factura_" < "plan_").
const M_ANTERIOR = "20261117120000_factura_plataforma_aviso_enums";
const M = "20261117120000_plan_borrador";
const BASE = `slt129_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** Lo que la foto del fixture no mira y la migración sí cambia: privilegios, políticas y RLS. */
const CONSULTAS_EXTRA: Record<string, string> = {
  privilegios: `SELECT table_name || ' ' || grantee || ' ' || privilege_type AS l FROM information_schema.table_privileges
    WHERE table_schema = 'public'`,
  politicas: `SELECT tablename || '.' || policyname AS l FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity::text AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`,
};

let db: Conexion;
let admin: Conexion | undefined;
let antesDeM: Foto;
let despuesDeM: Foto;
let planId: string;

/** La foto del esquema con privilegios, políticas y RLS; `conFilas` para comparar también los conteos. */
async function fotoCompleta(conFilas: boolean): Promise<Foto> {
  const { filas, ...resto } = await foto(db);
  const salida: Foto = conFilas ? { ...resto, filas } : resto;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    salida[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return salida;
}

async function existe(): Promise<boolean> {
  const { rows } = await db.query(`SELECT to_regclass('public.plan_borrador') IS NOT NULL AS e`);
  return rows[0].e === true;
}

/** SQLSTATE y constraint de una escritura, u `ok`. */
function intento(sql: string, valores: unknown[]): Promise<string> {
  return db.query(sql, valores).then(
    () => "ok",
    (e: { code?: string; constraint?: string }) => `${e.code} ${e.constraint ?? ""}`.trim(),
  );
}

const INSERTAR = `INSERT INTO "plan_borrador" ("id", "plan_id", "pasos", "iniciado_por_usuario_id", "iniciado_por_nombre")
  VALUES ($1, $2, $3::jsonb, 'u-slt129', 'Superadmin SLT129')`;

describe("SLT-129 — la migración en disco", () => {
  it("R24: va detrás de la anterior, es atómica y su down.sql quita la tabla", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas.indexOf(M_ANTERIOR)).toBeGreaterThanOrEqual(0);
    expect(carpetas.indexOf(M)).toBe(carpetas.indexOf(M_ANTERIOR) + 1);
    expect(sqlDe(M, "migration.sql")).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/m);
    expect(sqlDe(M, "down.sql")).toMatch(/DROP TABLE IF EXISTS "plan_borrador"/);
  });
});

describeSiHayBase("SLT-129 R24 — subir, bajar y volver a subir", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    planId = randomUUID();
    await db.query(`INSERT INTO "plan" ("id", "nombre", "visibilidad") VALUES ($1, $2, 'publico')`, [
      planId,
      `SLT129 IV ${planId.slice(0, 8)}`,
    ]);
    antesDeM = await fotoCompleta(true);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R24: subir crea la tabla de plataforma: RLS sin políticas, nada para servi_app y sin tocar otras filas", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    despuesDeM = await fotoCompleta(false);

    expect(await existe()).toBe(true);
    const { rows } = await db.query(
      `SELECT c.relrowsecurity AS rls,
              (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas,
              has_table_privilege('servi_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE') AS app
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'plan_borrador'`,
    );
    expect(rows).toEqual([{ rls: true, politicas: 0, app: false }]);

    // Lo único nuevo de la foto es la tabla: ni una columna, constraint o fila de otra tabla cambia.
    const { filas: _f, ...antesSinFilas } = antesDeM;
    void _f;
    const nuevas = diferencias(despuesDeM, antesSinFilas);
    expect(nuevas.length).toBeGreaterThan(0);
    expect(nuevas.filter((l) => !/plan_borrador/.test(l))).toEqual([]);
  });

  it("R24: los CHECK, el UNIQUE por plan y la FK con CASCADE cierran la forma del borrador", async () => {
    // Válidos: varios de creación (plan_id NULL) y uno de cambio con `vigencia`.
    expect(await intento(INSERTAR, [randomUUID(), null, JSON.stringify({ general: { nombre: "A" } })])).toBe("ok");
    expect(await intento(INSERTAR, [randomUUID(), null, "{}"])).toBe("ok");
    expect(
      await intento(INSERTAR, [randomUUID(), planId, JSON.stringify({ vigencia: { vigenteDesde: "2099-01-01" } })]),
    ).toBe("ok");

    expect(await intento(INSERTAR, [randomUUID(), planId, "{}"])).toBe("23505 plan_borrador_plan_id_key");
    // Un array lo rechazan los dos CHECK de forma; Postgres nombra el primero que evalúa.
    expect(await intento(INSERTAR, [randomUUID(), null, "[]"])).toMatch(
      /^23514 plan_borrador_pasos_(objeto|conocidos)$/,
    );
    expect(await intento(INSERTAR, [randomUUID(), null, JSON.stringify({ otro: {} })])).toBe(
      "23514 plan_borrador_pasos_conocidos",
    );
    expect(await intento(INSERTAR, [randomUUID(), null, JSON.stringify({ vigencia: {} })])).toBe(
      "23514 plan_borrador_vigencia_solo_cambio",
    );
    expect(await intento(INSERTAR, [randomUUID(), randomUUID(), "{}"])).toBe("23503 plan_borrador_plan_id_fkey");
  });

  it("R24: bajar con borradores guardados deja la base como estaba antes de subir", async () => {
    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    expect(await existe()).toBe(false);
    expect(diferencias(await fotoCompleta(true), antesDeM)).toEqual([]);
  });

  it("R24: subir otra vez da el mismo esquema que la primera", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), M);

    expect(diferencias(await fotoCompleta(false), despuesDeM)).toEqual([]);
  });
});
