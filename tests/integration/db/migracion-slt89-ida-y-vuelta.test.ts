import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { sembrarEscenarioGeo43, type EscenarioGeo43SinTipos } from "./_fixtures/geo-43";
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
 * SLT-89 (T1.4; design §2.5) — las dos migraciones de SLT-89, de ida y vuelta, contra Postgres (R33).
 *
 * Timestamps de la rama: `20261110130000_slt89_zona_nodo` y `20261110130100_slt89_historial_zona_nodo`
 * (el spec las llama `20261109120000`/`…120100`; chocaban con dev, ver progress/impl_SLT-89.md).
 *
 * - Ida: las dos sobre una base con datos de antes de SLT-89 (empresa en un país de prueba con su
 *   geografía, un nodo de profundidad 4, zona con su distrito, grupo con ese distrito, órdenes). No
 *   mueven ningún dato (R32), crean las dos tablas y cambian el cuerpo de `orden_nodo_geografico`: una
 *   orden escrita con un nodo que cuelga de su distrito lo conserva (R28).
 * - Vuelta: los dos `down.sql` en orden inverso dejan el esquema como antes salvo el valor de enum
 *   `zona_nodo_cambiado`, los datos sin cambios, y `pg_get_functiondef('orden_nodo_geografico')` es el
 *   de SLT-43: la misma orden vuelve a quedarse con su distrito.
 * - Reaplicar las dos deja lo mismo que la primera vez.
 *
 * BASE PROPIA (prefijo `slt89_`), construida con todas las migraciones SALVO las dos de SLT-89, como
 * `migracion-slt46-ida-y-vuelta.test.ts`: el down suelta tablas y reemplaza la función de trigger de
 * `orden`; en la base compartida rompería a los archivos que corren a la vez. Las de dev posteriores a
 * SLT-89, si las hubiera, se aplican antes de la ida y se quedan puestas. Los datos se siembran con el
 * fixture de SLT-43 por un Prisma propio de esta base (no toca las tablas nuevas).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_TABLAS = "20261110130000_slt89_zona_nodo";
const M_ENUM = "20261110130100_slt89_historial_zona_nodo";
const DE_SLT89 = [M_TABLAS, M_ENUM];

const BASE = `slt89_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const ENUM_QUE_SE_QUEDA = "historial_accion_tipo";

describe("SLT-89 — las dos migraciones en disco", () => {
  it("cada una trae su down.sql y van seguidas, la del enum detrás de la de las tablas", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = DE_SLT89.map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    expect(posiciones[1]).toBe(posiciones[0] + 1);
    for (const c of DE_SLT89) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let admin: Conexion;
let db: Conexion;
let prisma: PrismaClient | undefined;
let escenario: EscenarioGeo43SinTipos;
let antes: Foto;
let con: Foto;
let datosAntes: Foto;
let funcionDeSlt43: string;
const sectorId = randomUUID();

/** Lo que la foto del fixture no mira y estas migraciones sí tocan (mismo juego que SLT-43 y SLT-46). */
const CONSULTAS_EXTRA: Record<string, string> = {
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || t.tgenabled::text || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  politicas: `SELECT tablename || '.' || policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') || ' | ' ||
      coalesce(qual, '') || ' | ' || coalesce(with_check, '') AS l FROM pg_policies WHERE schemaname = 'public'`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
};

async function fotoCompleta(): Promise<Foto> {
  const resultado = await foto(db);
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

/** Las filas que SLT-89 no debe mover (R32, R33), enteras. */
const CONSULTAS_DE_DATOS: Record<string, string> = {
  orden: `SELECT to_jsonb(t)::text AS l FROM orden t`,
  zona: `SELECT to_jsonb(t)::text AS l FROM zona t`,
  zona_distrito: `SELECT to_jsonb(t)::text AS l FROM zona_distrito t`,
  grupo_distritos: `SELECT to_jsonb(t)::text AS l FROM grupo_distritos t`,
  grupo_distritos_distrito: `SELECT to_jsonb(t)::text AS l FROM grupo_distritos_distrito t`,
  nodo_geografico: `SELECT to_jsonb(t)::text AS l FROM nodo_geografico t`,
  historial_accion: `SELECT to_jsonb(t)::text AS l FROM historial_accion t`,
};

async function datos(): Promise<Foto> {
  const resultado: Foto = {};
  for (const [seccion, consulta] of Object.entries(CONSULTAS_DE_DATOS)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

async function uno(consulta: string, valores: unknown[] = []): Promise<unknown> {
  const { rows } = await db.query(consulta, valores);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

async function definicionDeOrdenNodo(): Promise<string> {
  return String(await uno(`SELECT pg_get_functiondef('orden_nodo_geografico'::regproc)`)).replace(/\r/g, "");
}

/** Corre `fn` en una transacción de `db` que siempre se revierte. */
async function revertidaEnDb<T>(fn: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    return await fn();
  } finally {
    await db.query("ROLLBACK");
  }
}

/** Escribe el sector (profundidad 4, bajo el distrito) como nodo de la orden; devuelve el que queda. */
async function nodoQueQuedaConElSector(): Promise<unknown> {
  return revertidaEnDb(async () => {
    await db.query(`UPDATE orden SET nodo_geografico_id = $1 WHERE id = $2`, [sectorId, escenario.ordenConDistritoId]);
    return uno(`SELECT nodo_geografico_id FROM orden WHERE id = $1`, [escenario.ordenConDistritoId]);
  });
}

async function tablaExiste(tabla: string): Promise<boolean> {
  return (await uno(`SELECT to_regclass($1) IS NOT NULL`, [`public.${tabla}`])) === true;
}

async function ida(sufijo = ""): Promise<void> {
  for (const carpeta of DE_SLT89) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}${sufijo}`);
}

describeSiHayBase("SLT-89 — zonas sobre el nodo, de ida y vuelta (R33)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, "99999999999999", DE_SLT89);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlDe(BASE), max: 1 }),
    }) as unknown as PrismaClient;

    // Datos de ANTES de SLT-89, confirmados: el escenario de SLT-43 (empresa en `XA`, zona con su
    // distrito, órdenes con y sin distrito), un grupo de esa zona con ese distrito, un nodo de
    // profundidad 4 bajo el distrito y una fila de historial del guardado de zona.
    escenario = await prisma.$transaction(async (tx) => sembrarEscenarioGeo43(tx, "XA"), { timeout: 60_000 });
    await prisma.$disconnect();
    prisma = undefined;
    const grupoId = randomUUID();
    await db.query(`INSERT INTO grupo_distritos (id, organizacion_id, zona_id, nombre) VALUES ($1, $2, $3, 'Grupo SLT-89')`, [
      grupoId,
      escenario.empresaId,
      escenario.zonaId,
    ]);
    await db.query(
      `INSERT INTO grupo_distritos_distrito (id, organizacion_id, grupo_id, zona_id, distrito_id) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), escenario.empresaId, grupoId, escenario.zonaId, escenario.geo.distritoId],
    );
    await db.query(
      `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural) VALUES ($1, 'XA', 'nivel_4', 'Sector', 'Sectores')`,
      [randomUUID()],
    );
    await db.query(
      `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado)
       VALUES ($1, 'XA', (SELECT id FROM tipo_nivel_geografico WHERE pais_id = 'XA' AND clave = 'nivel_4'), $2, 4, 'Sector Uno', '')`,
      [sectorId, escenario.geo.distritoId],
    );
    await db.query(
      `INSERT INTO historial_accion (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, lote_id, organizacion_id)
       VALUES ($1, 'zona_distrito_cambiado', 'zona', $2, 'Zona SLT-89', $3, $4)`,
      [randomUUID(), escenario.zonaId, randomUUID(), escenario.empresaId],
    );

    antes = await fotoCompleta();
    datosAntes = await datos();
    funcionDeSlt43 = await definicionDeOrdenNodo();
    expect(datosAntes.orden.size, "sin órdenes no se prueba nada").toBeGreaterThanOrEqual(2);
    expect(datosAntes.grupo_distritos_distrito.size, "sin miembros de grupo no se prueba nada").toBeGreaterThanOrEqual(1);
    // Antes de SLT-89: el nodo de la orden es siempre su lugar (SLT-43).
    expect(await nodoQueQuedaConElSector()).toBe(escenario.geo.distritoId);
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R32/R33: la ida crea las dos tablas y el cuerpo nuevo sin mover ningún dato", async () => {
    await ida();
    con = await fotoCompleta();
    expect(diferencias(con, antes).length, "las dos migraciones no cambiaron nada").toBeGreaterThan(0);
    expect(diferencias(await datos(), datosAntes), "la ida movió datos").toEqual([]);

    expect(await tablaExiste("zona_nodo")).toBe(true);
    expect(await tablaExiste("grupo_distritos_nodo")).toBe(true);
    expect(await definicionDeOrdenNodo()).not.toBe(funcionDeSlt43);
    expect(await nodoQueQuedaConElSector()).toBe(sectorId);
    expect(
      await uno(`SELECT count(*)::int FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1 AND e.enumlabel = 'zona_nodo_cambiado'`, [ENUM_QUE_SE_QUEDA]),
    ).toBe(1);
  }, 300_000);

  it("R33: los dos down.sql, en orden inverso, dejan el esquema como antes salvo el valor de enum, los datos sin cambios y orden_nodo_geografico de SLT-43", async () => {
    for (const carpeta of [...DE_SLT89].reverse()) {
      await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);
    }

    const d = diferencias(await fotoCompleta(), antes);
    const deEnum = d.filter((l) => l.includes(`en tipos: ${ENUM_QUE_SE_QUEDA} `));
    expect(
      d.filter((l) => !deEnum.includes(l)),
      "tras los dos downs",
    ).toEqual([]);
    // Un «sobra» y un «falta»: el enum que ganó `zona_nodo_cambiado`.
    expect(deEnum, "solo cambia el enum que se queda").toHaveLength(2);
    expect(diferencias(await datos(), datosAntes), "tras la vuelta").toEqual([]);

    expect(await definicionDeOrdenNodo()).toBe(funcionDeSlt43);
    expect(await tablaExiste("zona_nodo")).toBe(false);
    expect(await tablaExiste("grupo_distritos_nodo")).toBe(false);
    expect(await nodoQueQuedaConElSector()).toBe(escenario.geo.distritoId);
  }, 300_000);

  it("R33: reaplicadas las dos, todo queda igual que la primera vez", async () => {
    await ida(" (otra vez)");
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    expect(diferencias(await datos(), datosAntes), "tras reaplicar").toEqual([]);
    expect(await nodoQueQuedaConElSector()).toBe(sectorId);
  }, 300_000);
});
