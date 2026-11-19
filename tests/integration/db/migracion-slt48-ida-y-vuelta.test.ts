import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { HAY_BASE_DE_DATOS } from "./_postgres-real";
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
import { crearFksDeOrden } from "./_fixtures/orden-minima";

/**
 * SLT-48 (T1.3; design §2.1) — las tablas viejas pasan a vistas, de ida y vuelta, contra Postgres.
 *
 * - R6: con un nodo en NULL (también en una orden borrada) la ida aborta con las cuentas y sin cambiar
 *   nada.
 * - R4, R20 (y R1 por la forma): la ida quita las 5 FK y el NOT NULL de dos FK de la orden, no borra
 *   columnas, no cambia ninguna fila vieja, y las vistas devuelven las mismas filas que las tablas.
 * - R12: una orden en un nodo que la geografía vieja no sabe guardar aborta la vuelta con la cuenta.
 * - R11: la vuelta deja el esquema como antes y rellena las 3 FK de las órdenes nuevas desde la ruta de
 *   su nodo; la sincronía de antes vuelve a funcionar; reaplicar la ida deja el esquema de la primera.
 *
 * BASE PROPIA (prefijo `slt48_iv_`), con todas las migraciones salvo la de las vistas, como
 * `migracion-slt46-ida-y-vuelta.test.ts`: la vuelta recrea tablas y triggers de `orden`, y en la base
 * compartida rompería a los archivos que corren a la vez. Los datos de antes se siembran por SQL, como
 * el dueño, con la geografía vieja como fuente (la sincronía de SLT-43 crea los nodos).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_HISTORIAL = "20261117120000_slt48_historial_nodo_movido";
const M_VISTAS = "20261117120100_slt48_geografia_vieja_a_vistas";
const DE_SLT48 = [M_HISTORIAL, M_VISTAS];
/** La última de la rama antes de SLT-48. */
const PREVIA = "20261110130100_slt89_historial_zona_nodo";

const BASE = `slt48_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-48 — las dos migraciones en disco", () => {
  it("R13: cada una trae su down.sql y van en orden detrás de la última de la rama", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SLT48].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of DE_SLT48) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let admin: Conexion;
let db: Conexion;
let prisma: PrismaClient;

/** El esquema, sin el recuento de filas: las órdenes nuevas lo cambian a propósito. */
const CONSULTAS_EXTRA: Record<string, string> = {
  relaciones: `SELECT c.relname || ' ' || c.relkind::text AS l FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')`,
  funciones: `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) AS l
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
  triggers: `SELECT c.relname || '.' || t.tgname || ' | ' || t.tgenabled::text || ' | ' || pg_get_triggerdef(t.oid) AS l
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  politicas: `SELECT tablename || '.' || policyname || ' | ' || cmd || ' | ' || array_to_string(roles, ',') || ' | ' ||
      coalesce(qual, '') || ' | ' || coalesce(with_check, '') AS l FROM pg_policies WHERE schemaname = 'public'`,
  rls: `SELECT c.relname || ' ' || c.relrowsecurity::text || ' ' || c.relforcerowsecurity::text AS l
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  privilegios: `SELECT table_name || ' ' || privilege_type AS l FROM information_schema.role_table_grants
    WHERE grantee = 'servi_app' AND table_schema = 'public'`,
};

async function esquema(): Promise<Foto> {
  const resultado = await foto(db);
  delete resultado.filas;
  for (const [seccion, consulta] of Object.entries(CONSULTAS_EXTRA)) {
    const { rows } = await db.query(consulta);
    resultado[seccion] = new Set(rows.map((r) => String(r.l)));
  }
  return resultado;
}

/** Las filas que la ida no debe mover (R20) y las que las vistas tienen que repetir (R1), enteras. */
async function datos(ordenes: readonly string[]): Promise<Record<string, string[]>> {
  const consultas: Record<string, string> = {
    orden: `SELECT to_jsonb(t)::text AS l FROM orden t WHERE id = ANY($1::text[]) ORDER BY id`,
    zona_distrito: `SELECT to_jsonb(t)::text AS l FROM zona_distrito t ORDER BY id`,
    distrito_zona_especial: `SELECT to_jsonb(t)::text AS l FROM distrito_zona_especial t ORDER BY id`,
    nodo_geografico: `SELECT to_jsonb(t)::text AS l FROM nodo_geografico t ORDER BY id`,
    provincia: `SELECT to_jsonb(t)::text AS l FROM provincia t ORDER BY id`,
    canton: `SELECT to_jsonb(t)::text AS l FROM canton t ORDER BY id`,
    distrito: `SELECT to_jsonb(t)::text AS l FROM distrito t ORDER BY id`,
  };
  const resultado: Record<string, string[]> = {};
  for (const [seccion, consulta] of Object.entries(consultas)) {
    const { rows } = await db.query(consulta, consulta.includes("$1") ? [ordenes] : []);
    resultado[seccion] = rows.map((r) => String(r.l));
  }
  return resultado;
}

async function uno(consulta: string, valores: unknown[] = []): Promise<unknown> {
  const { rows } = await db.query(consulta, valores);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

async function fallo(carpeta: string, archivo: "migration.sql" | "down.sql"): Promise<string> {
  return ejecutar(db, sqlDe(carpeta, archivo), `${carpeta}/${archivo}`).then(
    () => "pasó",
    (e: unknown) => (e as Error).message,
  );
}

const SQL_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, nodo_geografico_id, producto, created_at, updated_at, deleted_at, organizacion_id)
  VALUES ($1, $2, $3, 'Destinatario SLT-48', '88880000', $4, $5, $6, $7, $8, $9, 'caja', now(), now(), $10, $11)`;

interface Escenario {
  empresaId: string;
  estatusId: string;
  tiendaId: string;
  zonaId: string;
  provinciaId: string;
  cantonId: string;
  distritoId: string;
  otroDistritoId: string;
  /** Con distrito, sin distrito y borrada (con el otro distrito). */
  ordenesViejas: string[];
  ordenBorradaId: string;
  zonaDistritoId: string;
}

let e: Escenario;
let antes: Foto;
let con: Foto;
let datosAntes: Record<string, string[]>;
let datosCon: Record<string, string[]>;
/** Órdenes nuevas (solo nodo): en un distrito y en un cantón. */
const nuevas = { enDistrito: randomUUID(), enCanton: randomUUID() };

async function orden(o: {
  provinciaId: string | null;
  cantonId: string | null;
  distritoId: string | null;
  nodoId?: string | null;
  borrada?: boolean;
  id?: string;
}): Promise<string> {
  const id = o.id ?? randomUUID();
  await db.query(SQL_ORDEN, [
    id,
    `SLT48-${id.slice(0, 8)}`,
    e.estatusId,
    e.tiendaId,
    e.zonaId,
    o.provinciaId,
    o.cantonId,
    o.distritoId,
    o.nodoId ?? null,
    o.borrada ? new Date() : null,
    e.empresaId,
  ]);
  return id;
}

describeSiHayBase("SLT-48 — geografía vieja a vistas, de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, "99999999999999", [M_VISTAS]);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlDe(BASE), max: 1 }),
      omit: PRISMA_OMIT,
    }) as unknown as PrismaClient;

    // Lo que no es geografía, por las fábricas de siempre; la geografía, por SQL sobre las tablas viejas.
    const base = await prisma.$transaction(
      async (tx) => {
        const { id: paisId } = await crearPaisDePrueba(tx, "XA");
        const { id: empresaId } = await crearOrganizacionEnPais(tx, paisId);
        await fijarEmpresa(tx, empresaId);
        const fks = await crearFksDeOrden(tx);
        return { empresaId, estatusId: fks.estatusId, tiendaId: fks.tiendaId, zonaId: fks.zonaId };
      },
      { timeout: 60_000 },
    );
    const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
    const geo = {
      provinciaId: randomUUID(),
      cantonId: randomUUID(),
      distritoId: randomUUID(),
      otroDistritoId: randomUUID(),
    };
    await db.query(`INSERT INTO provincia (id, nombre, pais_id, codigo_dta) VALUES ($1, $2, 'XA', '1')`, [
      geo.provinciaId,
      `Región ${sufijo}`,
    ]);
    await db.query(`INSERT INTO canton (id, nombre, provincia_id, codigo_dta) VALUES ($1, $2, $3, '1')`, [
      geo.cantonId,
      `Comuna ${sufijo}`,
      geo.provinciaId,
    ]);
    await db.query(
      `INSERT INTO distrito (id, nombre, canton_id, codigo_dta, activo) VALUES ($1, $2, $4, '1-1', true), ($3, $5, $4, '1-2', false)`,
      [geo.distritoId, `Barrio ${sufijo}`, geo.otroDistritoId, geo.cantonId, `Barrio otro ${sufijo}`],
    );
    e = { ...base, ...geo, ordenesViejas: [], ordenBorradaId: "", zonaDistritoId: randomUUID() };
    await db.query(`SELECT set_config('app.organizacion_id', $1, false)`, [e.empresaId]);
    const conDistrito = await orden({ provinciaId: e.provinciaId, cantonId: e.cantonId, distritoId: e.distritoId });
    const sinDistrito = await orden({ provinciaId: e.provinciaId, cantonId: e.cantonId, distritoId: null });
    e.ordenBorradaId = await orden({
      provinciaId: e.provinciaId,
      cantonId: e.cantonId,
      distritoId: e.otroDistritoId,
      borrada: true,
    });
    e.ordenesViejas = [conDistrito, sinDistrito, e.ordenBorradaId];
    await db.query(`INSERT INTO zona_distrito (id, zona_id, distrito_id) VALUES ($1, $2, $3)`, [
      e.zonaDistritoId,
      e.zonaId,
      e.distritoId,
    ]);
    await db.query(`INSERT INTO distrito_zona_especial (id, distrito_id) VALUES ($1, $2)`, [
      randomUUID(),
      e.otroDistritoId,
    ]);

    antes = await esquema();
    datosAntes = await datos(e.ordenesViejas);
    expect(datosAntes.orden, "sin órdenes no se prueba nada").toHaveLength(3);
    expect(datosAntes.orden.every((o) => (JSON.parse(o) as { nodo_geografico_id: unknown }).nodo_geografico_id)).toBe(true);
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R6: con nodos en NULL (también en una orden borrada) la ida aborta con las cuentas y sin cambiar nada", async () => {
    await db.query(`ALTER TABLE orden DISABLE TRIGGER orden_nodo_geografico`);
    await db.query(`ALTER TABLE zona_distrito DISABLE TRIGGER zona_distrito_nodo_geografico`);
    await db.query(`UPDATE orden SET nodo_geografico_id = NULL WHERE id = $1`, [e.ordenBorradaId]);
    await db.query(`UPDATE zona_distrito SET nodo_geografico_id = NULL WHERE id = $1`, [e.zonaDistritoId]);
    await db.query(`ALTER TABLE orden ENABLE TRIGGER orden_nodo_geografico`);
    await db.query(`ALTER TABLE zona_distrito ENABLE TRIGGER zona_distrito_nodo_geografico`);

    const mensaje = await fallo(M_VISTAS, "migration.sql");
    expect(mensaje).toMatch(/orden: 1, zona_distrito: 1, distrito_zona_especial: 0/);
    expect(diferencias(await esquema(), antes)).toEqual([]);

    // Se reponen con los triggers de antes (el nodo es el lugar de las FK), y todo queda como al sembrar.
    await db.query(`UPDATE orden SET nodo_geografico_id = NULL WHERE id = $1`, [e.ordenBorradaId]);
    await db.query(`UPDATE zona_distrito SET distrito_id = distrito_id WHERE id = $1`, [e.zonaDistritoId]);
    expect(await datos(e.ordenesViejas)).toEqual(datosAntes);
  }, 120_000);

  it("R4/R20/R1: la ida quita las 5 FK y dos NOT NULL, no borra columnas, no mueve filas y las vistas repiten las tablas", async () => {
    await ejecutar(db, sqlDe(M_VISTAS, "migration.sql"), M_VISTAS);
    con = await esquema();
    datosCon = await datos(e.ordenesViejas);

    const constraints = [...con.constraints].join("\n");
    for (const fk of [
      "orden_provincia_id_fkey",
      "orden_canton_id_fkey",
      "orden_distrito_id_fkey",
      "zona_distrito_distrito_id_fkey",
      "distrito_zona_especial_distrito_id_fkey",
    ]) {
      expect(constraints, fk).not.toContain(fk);
    }
    const nulable = async (columna: string) =>
      uno(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'orden' AND column_name = $1`,
        [columna],
      );
    expect([await nulable("provincia_id"), await nulable("canton_id"), await nulable("distrito_id")]).toEqual([
      "YES",
      "YES",
      "YES",
    ]);
    // Ninguna columna se borra: las de antes siguen, con su nombre.
    const columnas = (f: Foto) => new Set([...f.columnas].map((l) => l.split(" | ")[0]));
    const despues = columnas(con);
    expect([...columnas(antes)].filter((c) => !despues.has(c))).toEqual([]);
    expect(con.relaciones).toEqual(
      new Set([...antes.relaciones].map((l) => (/^(provincia|canton|distrito) r$/.test(l) ? l.replace(/ r$/, " v") : l))),
    );

    // R20 y R1: ninguna fila vieja cambia y las vistas devuelven exactamente lo que tenían las tablas.
    expect(datosCon).toEqual(datosAntes);
  }, 120_000);

  it("R12: una orden en un nodo de profundidad 1 aborta la vuelta con la cuenta y sin cambiar nada", async () => {
    const enProvincia = await orden({ provinciaId: null, cantonId: null, distritoId: null, nodoId: e.provinciaId });
    expect(await uno(`SELECT nodo_geografico_id FROM orden WHERE id = $1`, [enProvincia])).toBe(e.provinciaId);

    const mensaje = await fallo(M_VISTAS, "down.sql");
    expect(mensaje).toMatch(/SLT-48 down: 1 ordenes/);
    expect(diferencias(await esquema(), con)).toEqual([]);

    await db.query(`DELETE FROM orden WHERE id = $1`, [enProvincia]);
  }, 120_000);

  it("R12 (P5): una orden sin nodo ni FK, escrita a mano tras la ida, aborta la vuelta con la cuenta y sin cambiar nada", async () => {
    // Review SLT-48 vuelta 1: antes moría en el `SET NOT NULL` con un error que no decía cuántas eran.
    const sinLugar = await orden({ provinciaId: null, cantonId: null, distritoId: null, nodoId: null });
    expect(
      await uno(`SELECT row(nodo_geografico_id, provincia_id, canton_id, distrito_id)::text FROM orden WHERE id = $1`, [sinLugar]),
    ).toBe("(,,,)");

    const mensaje = await fallo(M_VISTAS, "down.sql");
    expect(mensaje).toMatch(/SLT-48 down: 1 ordenes no caben en la geografia vieja: 0 estan en un nodo .* y 1 no tienen nodo ni provincia y canton/);
    expect(mensaje).not.toMatch(/null value|not-null|23502/i);
    expect(diferencias(await esquema(), con)).toEqual([]);

    await db.query(`DELETE FROM orden WHERE id = $1`, [sinLugar]);
  }, 120_000);

  it("R11: la vuelta deja el esquema como antes, rellena las FK de las órdenes nuevas y la sincronía vuelve", async () => {
    await orden({ id: nuevas.enDistrito, provinciaId: null, cantonId: null, distritoId: null, nodoId: e.distritoId });
    await orden({ id: nuevas.enCanton, provinciaId: null, cantonId: null, distritoId: null, nodoId: e.cantonId });

    await ejecutar(db, sqlDe(M_VISTAS, "down.sql"), `${M_VISTAS}/down.sql`);

    expect(diferencias(await esquema(), antes)).toEqual([]);
    expect(await datos(e.ordenesViejas)).toEqual(datosAntes);
    const { rows } = await db.query(
      `SELECT id, provincia_id, canton_id, distrito_id, nodo_geografico_id FROM orden WHERE id = ANY($1::text[]) ORDER BY id`,
      [[nuevas.enDistrito, nuevas.enCanton]],
    );
    expect(Object.fromEntries(rows.map((r) => [String(r.id), r]))).toEqual({
      [nuevas.enDistrito]: {
        id: nuevas.enDistrito,
        provincia_id: e.provinciaId,
        canton_id: e.cantonId,
        distrito_id: e.distritoId,
        nodo_geografico_id: e.distritoId,
      },
      [nuevas.enCanton]: {
        id: nuevas.enCanton,
        provincia_id: e.provinciaId,
        canton_id: e.cantonId,
        distrito_id: null,
        nodo_geografico_id: e.cantonId,
      },
    });

    // La sincronía de los dos sentidos vuelve: dentro de una transacción que se revierte.
    await db.query("BEGIN");
    try {
      await db.query(`UPDATE provincia SET nombre = 'Región renombrada SLT-48' WHERE id = $1`, [e.provinciaId]);
      expect(await uno(`SELECT nombre FROM nodo_geografico WHERE id = $1`, [e.provinciaId])).toBe(
        "Región renombrada SLT-48",
      );
      await db.query(`UPDATE nodo_geografico SET activo = false WHERE id = $1`, [e.distritoId]);
      expect(await uno(`SELECT activo FROM distrito WHERE id = $1`, [e.distritoId])).toBe(false);
    } finally {
      await db.query("ROLLBACK");
    }
  }, 120_000);

  it("R11: reaplicar la ida deja el esquema de la primera vez y las filas viejas sin cambios", async () => {
    await ejecutar(db, sqlDe(M_VISTAS, "migration.sql"), `${M_VISTAS} (otra vez)`);
    expect(diferencias(await esquema(), con)).toEqual([]);
    expect(await datos(e.ordenesViejas)).toEqual(datosCon);
    // Las órdenes nuevas conservan su nodo; sus FK quedan como las dejó la vuelta.
    expect(
      await uno(`SELECT count(*)::int FROM orden WHERE id = ANY($1::text[]) AND provincia_id = $2`, [
        [nuevas.enDistrito, nuevas.enCanton],
        e.provinciaId,
      ]),
    ).toBe(2);
  }, 120_000);
});
