import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

/**
 * SLT-46 (T2.4; design §3, §11) — las tres migraciones de SLT-46, de ida y vuelta, contra Postgres (R9).
 *
 * - Ida: las tres sobre una base con datos de antes de SLT-46 (geografía vieja con su nodo, un nodo de
 *   profundidad 4, historial de plataforma). No mueven ningún dato (R8) y dejan puesta la copia
 *   nodo → geografía vieja y la función nueva de `pais_tipos_de_nivel`.
 * - Vuelta: los tres `down.sql` en orden inverso dejan el esquema como antes salvo los tres valores de
 *   enum añadidos (dos tipos), los datos sin cambios, y `pg_get_functiondef('pais_tipos_de_nivel')` es
 *   el de SLT-43. La sincronía vieja → nodo de SLT-43 sigue (un UPDATE de `provincia` llega al nodo) y
 *   escribir el nodo ya no toca la geografía vieja.
 * - Reaplicar las tres deja lo mismo que la primera vez.
 *
 * BASE PROPIA (prefijo `slt46_`), construida con todas las migraciones SALVO las tres de SLT-46, como
 * `migracion-slt43-ida-y-vuelta.test.ts`: los downs sueltan un trigger de `nodo_geografico` y
 * reemplazan una función de `pais`; en la base compartida romperían a los archivos que corren a la vez.
 * Las de dev posteriores a SLT-46, si las hubiera, se aplican antes de la ida y se quedan puestas.
 * Los datos se siembran por SQL, como el dueño, con la geografía vieja como fuente (el camino de antes
 * de SLT-46: la sincronía de SLT-43 crea los nodos).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ENUMS = "20261106120000_slt46_historial_tipos_de_nivel";
const M_COPIA = "20261106120100_slt46_nodo_copia_a_geografia_vieja";
const M_TIPOS = "20261106120200_slt46_pais_tipos_de_nivel_opcional";
const DE_SLT46 = [M_ENUMS, M_COPIA, M_TIPOS];
/** La última de la rama antes de SLT-46. */
const PREVIA = "20261104150200_cobro_plataforma_porcentual_funciones";

const BASE = `slt46_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const ENUMS_QUE_SE_QUEDAN = ["historial_plataforma_accion", "historial_plataforma_entidad"];

describe("SLT-46 — las tres migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detrás de la última de la rama", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [PREVIA, ...DE_SLT46].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migracion").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBe(posiciones[i - 1] + 1);
    }
    for (const c of DE_SLT46) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let admin: Conexion;
let db: Conexion;
let antes: Foto;
let con: Foto;
let datosAntes: Foto;
let funcionDeSlt43: string;
const ids = { provincia: randomUUID(), canton: randomUUID(), distrito: randomUUID(), sector: randomUUID() };

/** Lo que la foto del fixture no mira y estas migraciones sí tocan (mismo juego que SLT-43). */
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

/** Las filas que SLT-46 no debe mover (R8, R9), enteras. */
const CONSULTAS_DE_DATOS: Record<string, string> = {
  pais: `SELECT to_jsonb(t)::text AS l FROM pais t`,
  tipo_nivel_geografico: `SELECT to_jsonb(t)::text AS l FROM tipo_nivel_geografico t`,
  nodo_geografico: `SELECT to_jsonb(t)::text AS l FROM nodo_geografico t`,
  provincia: `SELECT to_jsonb(t)::text AS l FROM provincia t`,
  canton: `SELECT to_jsonb(t)::text AS l FROM canton t`,
  distrito: `SELECT to_jsonb(t)::text AS l FROM distrito t`,
  historial_plataforma: `SELECT to_jsonb(t)::text AS l FROM historial_plataforma t`,
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

async function definicionDePaisTiposDeNivel(): Promise<string> {
  return String(await uno(`SELECT pg_get_functiondef('pais_tipos_de_nivel'::regproc)`)).replace(/\r/g, "");
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

/** Escribe un nodo de profundidad 1 por SQL y devuelve si nació su provincia (la copia de SLT-46). */
async function nodoNuevoLlegaAProvincia(): Promise<boolean> {
  return revertidaEnDb(async () => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado)
       VALUES ($1, 'XA', (SELECT id FROM tipo_nivel_geografico WHERE pais_id = 'XA' AND clave = 'nivel_1'), NULL, 1, $2, '')`,
      [id, `Región nueva ${id.slice(0, 8)}`],
    );
    return (await uno(`SELECT count(*)::int FROM provincia WHERE id = $1`, [id])) === 1;
  });
}

/** Un UPDATE de `provincia` por SQL y el nombre que queda en su nodo (la sincronía de SLT-43). */
async function provinciaLlegaAlNodo(): Promise<unknown> {
  return revertidaEnDb(async () => {
    await db.query(`UPDATE provincia SET nombre = 'Región por SQL' WHERE id = $1`, [ids.provincia]);
    return uno(`SELECT nombre FROM nodo_geografico WHERE id = $1`, [ids.provincia]);
  });
}

/** Tipos que deja el alta de un país con '' en el nivel 3. */
async function tiposDeUnPaisDeDosNiveles(): Promise<unknown> {
  return revertidaEnDb(async () => {
    await db.query(
      `INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular, nivel_2_plural, nivel_3_singular, nivel_3_plural)
       VALUES ('XB', 'País de 2 niveles', 'Departamento', 'Departamentos', 'Municipio', 'Municipios', '', '')`,
    );
    return uno(`SELECT string_agg(clave, ',' ORDER BY clave) FROM tipo_nivel_geografico WHERE pais_id = 'XB'`);
  });
}

async function ida(sufijo = ""): Promise<void> {
  for (const carpeta of DE_SLT46) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}${sufijo}`);
}

describeSiHayBase("SLT-46 — copia nodo → geografía vieja y tipos opcionales, de ida y vuelta (R9)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, "99999999999999", DE_SLT46);

    // Datos de ANTES de SLT-46, confirmados: un país de prueba con su geografía vieja (la sincronía
    // de SLT-43 le crea los nodos), un nodo de profundidad 4 y una fila de historial de plataforma.
    await db.query(
      `INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular, nivel_2_plural, nivel_3_singular, nivel_3_plural)
       VALUES ('XA', 'País de prueba XA', 'Región', 'Regiones', 'Comuna', 'Comunas', 'Barrio', 'Barrios')`,
    );
    await db.query(`INSERT INTO provincia (id, nombre, pais_id, codigo_dta) VALUES ($1, 'Región Norte', 'XA', '1')`, [ids.provincia]);
    await db.query(`INSERT INTO canton (id, nombre, provincia_id, codigo_dta) VALUES ($1, 'Comuna Uno', $2, '1')`, [ids.canton, ids.provincia]);
    await db.query(`INSERT INTO distrito (id, nombre, canton_id, activo) VALUES ($1, 'Barrio A', $2, false)`, [ids.distrito, ids.canton]);
    await db.query(
      `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural) VALUES ($1, 'XA', 'nivel_4', 'Sector', 'Sectores')`,
      [randomUUID()],
    );
    await db.query(
      `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado)
       VALUES ($1, 'XA', (SELECT id FROM tipo_nivel_geografico WHERE pais_id = 'XA' AND clave = 'nivel_4'), $2, 4, 'Sector Uno', '')`,
      [ids.sector, ids.distrito],
    );
    await db.query(
      `INSERT INTO historial_plataforma (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, pais_id)
       VALUES ($1, 'nodo_geografico_creado', 'nodo_geografico', $2, 'Región Norte', 'XA')`,
      [randomUUID(), ids.provincia],
    );

    antes = await fotoCompleta();
    datosAntes = await datos();
    funcionDeSlt43 = await definicionDePaisTiposDeNivel();
    expect(datosAntes.nodo_geografico.size, "sin nodos no se prueba nada").toBeGreaterThan(585);
    // Antes de SLT-46: escribir el nodo no llega a la geografía vieja, y un país '' gana un nivel_3.
    expect(await nodoNuevoLlegaAProvincia()).toBe(false);
    expect(await tiposDeUnPaisDeDosNiveles()).toBe("nivel_1,nivel_2,nivel_3");
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R8/R9: la ida pone la copia y la función nueva sin mover ningún dato", async () => {
    await ida();
    con = await fotoCompleta();
    expect(diferencias(con, antes).length, "las tres migraciones no cambiaron nada").toBeGreaterThan(0);
    expect(diferencias(await datos(), datosAntes), "la ida movió datos").toEqual([]);

    expect(await nodoNuevoLlegaAProvincia()).toBe(true);
    expect(await provinciaLlegaAlNodo()).toBe("Región por SQL");
    expect(await tiposDeUnPaisDeDosNiveles()).toBe("nivel_1,nivel_2");
    expect(await definicionDePaisTiposDeNivel()).not.toBe(funcionDeSlt43);
    expect(
      await uno(`SELECT count(*)::int FROM pg_trigger WHERE tgname = 'nodo_geografico_copia_a_geografia_vieja'`),
    ).toBe(1);
  }, 300_000);

  it("R9: los tres down.sql, en orden inverso, dejan el esquema como antes salvo los valores de enum, los datos sin cambios y pais_tipos_de_nivel de SLT-43", async () => {
    for (const carpeta of [...DE_SLT46].reverse()) {
      await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);
    }

    const d = diferencias(await fotoCompleta(), antes);
    const deEnum = d.filter((l) => ENUMS_QUE_SE_QUEDAN.some((e) => l.includes(`en tipos: ${e} `)));
    expect(
      d.filter((l) => !deEnum.includes(l)),
      "tras los tres downs",
    ).toEqual([]);
    // Un «sobra» y un «falta» por cada uno de los dos enums que ganaron valores.
    expect(deEnum, "solo cambian los dos enums que se quedan").toHaveLength(4);
    expect(diferencias(await datos(), datosAntes), "tras la vuelta").toEqual([]);

    expect(await definicionDePaisTiposDeNivel()).toBe(funcionDeSlt43);
    expect(await uno(`SELECT count(*)::int FROM pg_proc WHERE proname = 'geo_copiar_nodo_a_geografia_vieja'`)).toBe(0);
  }, 300_000);

  it("R9: tras la vuelta la sincronía vieja → nodo sigue y escribir el nodo ya no toca la geografía vieja", async () => {
    expect(await provinciaLlegaAlNodo()).toBe("Región por SQL");
    expect(await nodoNuevoLlegaAProvincia()).toBe(false);
    expect(await tiposDeUnPaisDeDosNiveles()).toBe("nivel_1,nivel_2,nivel_3");
  }, 120_000);

  it("R9: reaplicadas las tres, todo queda igual que la primera vez", async () => {
    await ida(" (otra vez)");
    expect(diferencias(await fotoCompleta(), con), "tras reaplicar").toEqual([]);
    expect(diferencias(await datos(), datosAntes), "tras reaplicar").toEqual([]);
    expect(await nodoNuevoLlegaAProvincia()).toBe(true);
    expect(await tiposDeUnPaisDeDosNiveles()).toBe("nivel_1,nivel_2");
  }, 300_000);
});
