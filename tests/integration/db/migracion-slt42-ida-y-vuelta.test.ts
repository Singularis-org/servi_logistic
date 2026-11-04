import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  ErrorDeScript,
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
 * SLT-42 (T1.4; R1, R3, R7, R8) — las tres migraciones de la ficha, de ida y vuelta, contra Postgres.
 *
 * - En una base NUEVA (a esta altura solo existe el tipo «cedula») la subida deja los cinco tipos de CR.
 * - Sobre una base como la de producción (cedula, ruc y pasaporte, usuarios de los tres) la subida no
 *   cambia el valor de ninguna columna que existía en `usuario`, `organizacion`, `pais`,
 *   `tipo_identificacion` ni `orden` (las tiendas son filas de `usuario`), y el usuario que tenía
 *   «cedula»/«ruc»/«pasaporte» queda con cédula física / jurídica / pasaporte (R7).
 * - Los `down.sql` abortan sin tocar nada con un usuario en DIMEX y con un documento repetido dentro
 *   de una empresa; sin ellos, en orden inverso, dejan el esquema EXACTO de antes (columnas,
 *   constraints, índices, políticas) y las mismas filas.
 * - Reaplicadas, todo vuelve igual que la primera vez.
 *
 * BASE PROPIA (prefijo `slt42_`), construida aplicando las migraciones anteriores (patrón SLT-68):
 * los down sueltan columnas de catálogos que la base compartida usa en paralelo.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La última de `origin/dev` al empezar la ficha: las de SLT-42 van detrás. */
const ULTIMA_ANTERIOR = "20261102090100_slt76_retirar_respaldos";
const M_PAIS = "20261103120000_slt42_pais_telefono_y_zona";
const M_TIPOS = "20261103120100_slt42_tipo_documento_por_pais";
const M_UNICO = "20261103120200_slt42_usuario_documento_unico_por_tipo";
const DE_SLT42 = [M_PAIS, M_TIPOS, M_UNICO];

const BASE = `slt42_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** Los cinco tipos de CR que exige R3, en el orden del catálogo. */
const TIPOS_CR = [
  { value: "cedula", clave: "cedula_fisica", caracteres: "digitos", largo_min: 9, largo_max: 9, orden: 1, activo: true },
  { value: "ruc", clave: "cedula_juridica", caracteres: "digitos", largo_min: 10, largo_max: 10, orden: 2, activo: true },
  { value: "dimex", clave: "dimex", caracteres: "digitos", largo_min: 11, largo_max: 12, orden: 3, activo: true },
  { value: "nite", clave: "nite", caracteres: "digitos", largo_min: 10, largo_max: 10, orden: 4, activo: true },
  { value: "pasaporte", clave: "pasaporte", caracteres: "alfanumerico", largo_min: 6, largo_max: 20, orden: 5, activo: true },
];

/** Columnas que nacen en SLT-42: se quitan de la foto de filas para comparar solo las de antes. */
const NUEVAS: Record<string, string[]> = {
  pais: ["prefijo_telefonico", "telefono_digitos_nacionales", "zona_horaria"],
  tipo_identificacion: ["pais_id", "clave", "nombre", "caracteres", "largo_min", "largo_max", "orden", "activo"],
};
const TABLAS_R8 = ["usuario", "organizacion", "pais", "tipo_identificacion", "orden"] as const;

describe("SLT-42 R8 — las tres migraciones en disco", () => {
  it("cada una trae su down.sql y van en orden detrás de la última anterior", () => {
    const carpetas = carpetasDeMigracion();
    const posiciones = [ULTIMA_ANTERIOR, ...DE_SLT42].map((c) => carpetas.indexOf(c));
    expect(posiciones.every((p) => p >= 0), "falta alguna migración").toBe(true);
    for (let i = 1; i < posiciones.length; i++) {
      expect(posiciones[i], `${carpetas[posiciones[i]]} fuera de orden`).toBeGreaterThan(posiciones[i - 1]);
    }
    for (const c of DE_SLT42) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });
});

let db: Conexion;
let admin: Conexion;
let antes: Foto;
let con: Foto;
let filasAntes: Record<string, string[]>;
let politicasAntes: string[];
let organizacionA: string;
let organizacionB: string;
const usuarioPorTipo: Record<string, string> = {};

/** Las políticas de RLS de `public`: la foto de `ida-y-vuelta-32` no las mira. */
async function politicas(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT concat_ws(' | ', tablename, policyname, permissive, roles::text, cmd, qual, with_check) AS l
       FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`,
  );
  return rows.map((r) => String(r.l));
}

/**
 * Cada fila de las tablas de R8 como JSON, sin las columnas nuevas, ordenada por `id`. Comparar esto
 * antes y después es «ninguna columna existente cambió de valor y no se perdió ninguna fila».
 */
async function filasViejas(): Promise<Record<string, string[]>> {
  const salida: Record<string, string[]> = {};
  for (const tabla of TABLAS_R8) {
    const quitar = (NUEVAS[tabla] ?? []).map((c) => ` - '${c}'`).join("");
    const { rows } = await db.query(
      `SELECT (to_jsonb(t)${quitar})::text AS l FROM "${tabla}" t ORDER BY t."id"`,
    );
    salida[tabla] = rows.map((r) => String(r.l));
  }
  return salida;
}

/** Las filas de antes, con las que la subida pudo AÑADIR quitadas (dimex y nite). */
function sinFilasNuevas(filas: Record<string, string[]>, idsNuevos: Set<string>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(filas).map(([t, ls]) => [t, ls.filter((l) => !idsNuevos.has(String((JSON.parse(l) as { id: string }).id)))]),
  );
}

async function idsDe(values: string[]): Promise<Set<string>> {
  const { rows } = await db.query(`SELECT "id" FROM "tipo_identificacion" WHERE "value" = ANY($1::text[])`, [values]);
  return new Set(rows.map((r) => String(r.id)));
}

async function tiposDeCR(): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query(
    `SELECT "value", "clave", "caracteres", "largo_min", "largo_max", "orden", "activo"
       FROM "tipo_identificacion" WHERE "pais_id" = 'CR' ORDER BY "orden"`,
  );
  return rows;
}

async function indiceDelDocumento(): Promise<string> {
  const { rows } = await db.query(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'usuario_cedula_key'`,
  );
  return String(rows[0]?.indexdef ?? "");
}

async function fallaDe(promesa: Promise<unknown>): Promise<ErrorDeScript | null> {
  try {
    await promesa;
    return null;
  } catch (e) {
    if (e instanceof ErrorDeScript) return e;
    throw e;
  }
}

async function subir(etiqueta: string): Promise<void> {
  for (const c of DE_SLT42) await ejecutar(db, sqlDe(c, "migration.sql"), `${c}/migration.sql${etiqueta}`);
}

async function bajar(): Promise<void> {
  for (const c of [...DE_SLT42].reverse()) await ejecutar(db, sqlDe(c, "down.sql"), `${c}/down.sql`);
}

async function crearUsuario(o: {
  organizacionId: string;
  tipoValue: string;
  cedula: string;
  rol?: string;
}): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "usuario" ("id","nombre","email","telefono","password_hash","cedula","tipo_identificacion_id","rol_id","organizacion_id","updated_at")
     VALUES ($1, 'Persona SLT42', $2, '88880000', 'x', $3,
             (SELECT "id" FROM "tipo_identificacion" WHERE "value" = $4),
             (SELECT "id" FROM "rol" WHERE "value" = $5::rol_value), $6, now())`,
    [id, `slt42-${id.slice(0, 8)}@example.test`, o.cedula, o.tipoValue, o.rol ?? "mensajero", o.organizacionId],
  );
  return id;
}

describeSiHayBase("SLT-42 — pais, tipos de documento y único del documento, de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M_PAIS);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R3: en una base nueva (solo «cedula») la subida deja los cinco tipos de CR; el down conserva cedula, ruc y pasaporte", async () => {
    const { rows } = await db.query(`SELECT "value" FROM "tipo_identificacion" ORDER BY 1`);
    expect(rows.map((r) => r.value), "el punto de partida de una base nueva").toEqual(["cedula"]);

    await subir(" (base nueva)");
    expect(await tiposDeCR()).toEqual(TIPOS_CR);

    await bajar();
    const tras = await db.query(`SELECT "value" FROM "tipo_identificacion" ORDER BY 1`);
    // Queda como la deja `db:seed` en producción: es el punto de partida del resto del archivo.
    expect(tras.rows.map((r) => r.value)).toEqual(["cedula", "pasaporte", "ruc"]);
  }, 120_000);

  it("R1, R3, R7, R8: sobre una base como la de producción, la subida no cambia ninguna columna existente", async () => {
    organizacionA = randomUUID();
    organizacionB = randomUUID();
    for (const [id, n] of [[organizacionA, "A"], [organizacionB, "B"]] as const) {
      await db.query(`INSERT INTO "organizacion" ("id","nombre","slug") VALUES ($1, $2, $3)`, [
        id,
        `SLT42 ida y vuelta ${n}`,
        `slt42-iv-${n.toLowerCase()}-${id.slice(0, 8)}`,
      ]);
    }
    // Un documento con el largo «equivocado» para su tipo nuevo (P3): igual queda como estaba.
    usuarioPorTipo.cedula = await crearUsuario({ organizacionId: organizacionA, tipoValue: "cedula", cedula: "1234567" });
    usuarioPorTipo.ruc = await crearUsuario({ organizacionId: organizacionA, tipoValue: "ruc", cedula: "3101123456" });
    usuarioPorTipo.pasaporte = await crearUsuario({ organizacionId: organizacionB, tipoValue: "pasaporte", cedula: "AB123456" });
    // Una tienda es un usuario con rol adminTienda.
    usuarioPorTipo.tienda = await crearUsuario({ organizacionId: organizacionB, tipoValue: "cedula", cedula: "3101999999", rol: "Admin Tienda" });

    antes = await foto(db);
    filasAntes = await filasViejas();
    politicasAntes = await politicas();

    await subir("");
    con = await foto(db);
    expect(diferencias(con, antes).length, "la subida no cambió el esquema").toBeGreaterThan(0);

    // R1, R3: Costa Rica con sus datos de teléfono y hora, y sus cinco tipos.
    const { rows: cr } = await db.query(
      `SELECT "prefijo_telefonico", "telefono_digitos_nacionales", "zona_horaria" FROM "pais" WHERE "id" = 'CR'`,
    );
    expect(cr).toEqual([{ prefijo_telefonico: "506", telefono_digitos_nacionales: 8, zona_horaria: "America/Costa_Rica" }]);
    expect(await tiposDeCR()).toEqual(TIPOS_CR);

    // R8: las columnas de antes de cada fila, idénticas; las únicas filas nuevas son dimex y nite.
    const nuevas = await idsDe(["dimex", "nite"]);
    expect(nuevas.size).toBe(2);
    expect(sinFilasNuevas(await filasViejas(), nuevas)).toEqual(filasAntes);

    // R7: cada usuario sigue apuntando a la misma fila, que ahora es el tipo de CR que le toca.
    const { rows: deUsuarios } = await db.query(
      `SELECT u."id", t."clave", t."pais_id" FROM "usuario" u JOIN "tipo_identificacion" t ON t."id" = u."tipo_identificacion_id"
        WHERE u."id" = ANY($1::text[])`,
      [[usuarioPorTipo.cedula, usuarioPorTipo.ruc, usuarioPorTipo.pasaporte]],
    );
    const clavePorUsuario = Object.fromEntries(deUsuarios.map((r) => [String(r.id), `${String(r.pais_id)}/${String(r.clave)}`]));
    expect(clavePorUsuario).toEqual({
      [usuarioPorTipo.cedula]: "CR/cedula_fisica",
      [usuarioPorTipo.ruc]: "CR/cedula_juridica",
      [usuarioPorTipo.pasaporte]: "CR/pasaporte",
    });

    // R13 (P4): el índice se recreó con el mismo nombre, por empresa y tipo.
    expect(await indiceDelDocumento()).toMatch(
      /ON public\.usuario USING btree \(organizacion_id, tipo_identificacion_id, cedula\) NULLS NOT DISTINCT/,
    );
    // R4: la política restrictiva existe y la permisiva de antes sigue.
    const pols = await politicas();
    expect(pols.some((p) => p.startsWith("tipo_identificacion | tipo_identificacion_del_pais | RESTRICTIVE"))).toBe(true);
    expect(pols.some((p) => p.startsWith("tipo_identificacion | tipo_identificacion_lectura | PERMISSIVE"))).toBe(true);
  }, 120_000);

  it("R8: con un usuario en DIMEX el down de los tipos aborta, y con un documento repetido el del único también, sin tocar nada", async () => {
    const enDimex = await crearUsuario({ organizacionId: organizacionA, tipoValue: "dimex", cedula: "155812345678" });
    // Mismo documento que la cédula física de A, con otro tipo: el índice nuevo lo admite (R13).
    const repetido = await crearUsuario({ organizacionId: organizacionA, tipoValue: "nite", cedula: "1234567" });
    const conCasos = await foto(db);
    const filasConCasos = await filasViejas();

    const deUnico = await fallaDe(ejecutar(db, sqlDe(M_UNICO, "down.sql"), `${M_UNICO}/down.sql`));
    expect(deUnico, "el down del único no abortó").toBeInstanceOf(ErrorDeScript);
    expect(deUnico?.sqlstate).toBe("P0001");
    expect(deUnico?.message).toContain("usuario_cedula_key");
    expect(diferencias(await foto(db), conCasos), "tras el down del único abortado").toEqual([]);

    const deTipos = await fallaDe(ejecutar(db, sqlDe(M_TIPOS, "down.sql"), `${M_TIPOS}/down.sql`));
    expect(deTipos, "el down de los tipos no abortó").toBeInstanceOf(ErrorDeScript);
    expect(deTipos?.sqlstate).toBe("P0001");
    expect(deTipos?.message).toContain("dimex o nite");
    expect(diferencias(await foto(db), conCasos), "tras el down de los tipos abortado").toEqual([]);
    expect(await filasViejas()).toEqual(filasConCasos);

    // Los dos casos son del test, no de «antes»: se quitan para la vuelta completa.
    await db.query(`DELETE FROM "usuario" WHERE "id" = ANY($1::text[])`, [[enDimex, repetido]]);
  }, 120_000);

  it("R8: sin esos casos, los tres down.sql en orden inverso dejan el esquema, las políticas y las filas de antes", async () => {
    await bajar();
    expect(diferencias(await foto(db), antes), "tras los tres down").toEqual([]);
    expect(await politicas()).toEqual(politicasAntes);
    expect(await filasViejas()).toEqual(filasAntes);
    expect(await indiceDelDocumento()).toMatch(/\(organizacion_id, cedula\) NULLS NOT DISTINCT/);
  }, 120_000);

  it("reaplicadas las tres, todo vuelve igual que la primera vez", async () => {
    await subir(" (otra vez)");
    expect(diferencias(await foto(db), con), "tras reaplicar").toEqual([]);
    expect(await tiposDeCR()).toEqual(TIPOS_CR);
    const nuevas = await idsDe(["dimex", "nite"]);
    expect(sinFilasNuevas(await filasViejas(), nuevas)).toEqual(filasAntes);
  }, 120_000);
});
