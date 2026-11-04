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
 * SLT-52 / T1.6 (design §2, §3) — el esquema del modelo nuevo de tarifas contra Postgres REAL.
 *
 * BASE PROPIA (`slt52_tf_<rand>`), como SLT-76: el down recrea `historial_accion_tipo` y suelta
 * tablas, y en la base compartida chocaria con los archivos que corren en paralelo. Ademas, asi el
 * «antes del up» es de verdad el esquema anterior, leido de `db/migrations`.
 *
 * 1. Se aplican todas las migraciones anteriores a SLT-52 y se siembran, con SQL a mano, filas en
 *    `tarifas`, `tarifa_zona_mensajero`, `distrito_zona_especial` y `cierre_detail` (dos empresas).
 * 2. Se aplican las cuatro de SLT-52 sentencia a sentencia, como `migrate deploy`.
 * 3. Cada caso escribe en una transaccion que SIEMPRE se revierte y afirma primero lo que sembro.
 *    Los de RLS y privilegios bajan a `servi_app` con `SET LOCAL ROLE`, como la extension.
 * 4. El ultimo caso baja las cuatro y compara la foto de catalogos y conteos con la de antes.
 *
 * Se apoya en lo que el SQL de la migracion hace, no en el service (T6): los CHECK, los unicos, las
 * FK compuestas, la RLS y el REVOKE son la ultima red para lo que entra por debajo de la app.
 */

const ENUMS = "20261103120000_tarifas_flexibles_enums";
const TABLAS = "20261103120100_tarifas_flexibles_tablas";
const MISMA_EMPRESA = "20261103120200_tarifas_flexibles_misma_empresa";
const HISTORIAL = "20261103120300_historial_tarifas_flexibles";
const DE_SLT52 = [ENUMS, TABLAS, MISMA_EMPRESA, HISTORIAL] as const;
/** La ultima migracion del arbol antes de SLT-52 (SLT-76). */
const ULTIMA_PREVIA = "20261102090100_slt76_retirar_respaldos";

const TABLAS_VIEJAS = ["tarifas", "tarifa_zona_mensajero", "distrito_zona_especial", "cierre_detail"] as const;
const TABLAS_NUEVAS = [
  "grupo_distritos",
  "grupo_distritos_distrito",
  "tarifa_valor",
  "cierre_detail_concepto",
  "gestion_pago_congelado",
] as const;

const BASE = `slt52_tf_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-52 — las migraciones del modelo nuevo de tarifas, en disco", () => {
  it("las cuatro existen, traen down.sql y van detras de la ultima migracion previa", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas).toContain(ULTIMA_PREVIA);
    for (const m of DE_SLT52) {
      expect(carpetas).toContain(m);
      expect(m > ULTIMA_PREVIA).toBe(true);
      expect(existsSync(path.join(MIGRACIONES, m, "down.sql")), `${m} sin down.sql`).toBe(true);
    }
  });

  it("R44: ninguna escribe filas en las tablas del modelo viejo ni en cierre_detail", () => {
    const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");
    for (const m of DE_SLT52) {
      const up = sinComentarios(sqlDe(m, "migration.sql"));
      for (const t of TABLAS_VIEJAS) {
        expect(up, `${m} escribe en ${t}`).not.toMatch(new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?${t}"?\\b`, "i"));
      }
    }
  });

  it("R34/R45: `gestion_pago_congelado` no declara ninguna columna de IVA", () => {
    const up = sqlDe(TABLAS, "migration.sql");
    const tabla = /CREATE TABLE "gestion_pago_congelado" \(([\s\S]*?)\n\);/.exec(up);
    expect(tabla, "no se encontro el CREATE TABLE").not.toBeNull();
    expect((tabla as RegExpExecArray)[1]).not.toMatch(/"[^"]*iva[^"]*"\s/i);
  });
});

// ── La base propia ──────────────────────────────────────────────────────────────────────────────

type Resultado = { ok: true } | { ok: false; code: string | undefined; constraint: string | undefined };

interface Empresa {
  id: string;
  zonaId: string;
  tiendaId: string;
  mensajeroId: string;
  gestionId: string;
  cierreDetailId: string;
}

interface Semillas {
  a: Empresa;
  b: Empresa;
  /** Segunda zona de A, con un distrito propio que NO esta en `a.zonaId`. */
  zonaA2: string;
  /** d1..d3 en la zona de A (d1 tambien en la de B); d4 solo en `zonaA2`. */
  distritos: [string, string, string, string];
  vehiculos: [string, string];
}

let admin: Conexion;
/** El pool de UNA conexion de la base propia. */
let pool: Conexion;
/**
 * Un cliente FIJO sacado de ese pool, y todo pasa por el. `pool.query` devuelve la conexion con el
 * error cuando una sentencia falla, y pg-pool la DESTRUYE: la transaccion del caso se perderia en el
 * primer rechazo esperado (medido: `ROLLBACK TO SAVEPOINT` respondia 25P01).
 */
let db: Conexion;

interface ClienteFijo {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(): void;
}
let s: Semillas;
let antes: Foto;
let conteosAntes: Record<string, number>;

async function uno<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (rows.length !== 1) throw new Error(`se esperaba UNA fila de «${sql.slice(0, 80)}» y llegaron ${rows.length}`);
  return Object.values(rows[0])[0] as T;
}

async function contar(tabla: string, where = "TRUE", params: unknown[] = []): Promise<number> {
  return Number(await uno(`SELECT count(*)::int AS n FROM "${tabla}" WHERE ${where}`, params));
}

/** Corre `fn` en una transaccion que SIEMPRE se revierte: ningun caso deja filas. */
async function enTxRevertida<T>(fn: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    return await fn();
  } finally {
    await db.query("ROLLBACK");
  }
}

/** Una sentencia dentro de un SAVEPOINT: el fallo no aborta la transaccion del caso. */
async function intento(sql: string, params: unknown[] = []): Promise<Resultado> {
  await db.query("SAVEPOINT intento");
  try {
    await db.query(sql, params);
    await db.query("RELEASE SAVEPOINT intento");
    return { ok: true };
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT intento");
    const e = error as { code?: string; constraint?: string };
    return { ok: false, code: e.code, constraint: e.constraint };
  }
}

/** Baja la transaccion en curso a `servi_app` con la empresa dada, como la extension del cliente. */
async function comoApp(organizacionId: string): Promise<void> {
  await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [organizacionId]);
  await db.query(`SET LOCAL ROLE servi_app`);
}

interface Valor {
  org: string;
  concepto: string;
  modo?: "monto" | "porcentaje";
  valor?: string;
  iva?: string | null;
  zona?: string | null;
  grupo?: string | null;
  tienda?: string | null;
  mensajero?: string | null;
  vehiculo?: string | null;
  id?: string;
}

const SQL_VALOR = `INSERT INTO "tarifa_valor"
  ("id", "organizacion_id", "concepto", "modo", "valor", "iva_pct", "zona_id", "grupo_id", "tienda_id", "mensajero_id", "vehiculo_id")
  VALUES ($1, $2, $3::"tarifa_concepto", $4::"tarifa_modo", $5::numeric, $6::numeric, $7, $8, $9, $10, $11)`;

function paramsValor(v: Valor): unknown[] {
  return [
    v.id ?? randomUUID(),
    v.org,
    v.concepto,
    v.modo ?? "monto",
    v.valor ?? "1500.00",
    v.iva === undefined ? null : v.iva,
    v.zona ?? null,
    v.grupo ?? null,
    v.tienda ?? null,
    v.mensajero ?? null,
    v.vehiculo ?? null,
  ];
}

const insertarValor = (v: Valor) => intento(SQL_VALOR, paramsValor(v));

async function crearGrupo(org: string, zonaId: string, nombre: string, distritos: string[] = []): Promise<string> {
  const id = randomUUID();
  await db.query(`INSERT INTO "grupo_distritos" ("id", "organizacion_id", "zona_id", "nombre") VALUES ($1, $2, $3, $4)`, [
    id,
    org,
    zonaId,
    nombre,
  ]);
  for (const d of distritos) {
    await db.query(
      `INSERT INTO "grupo_distritos_distrito" ("id", "organizacion_id", "grupo_id", "zona_id", "distrito_id")
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), org, id, zonaId, d],
    );
  }
  return id;
}

const SQL_DISTRITO_EN_GRUPO = `INSERT INTO "grupo_distritos_distrito" ("id", "organizacion_id", "grupo_id", "zona_id", "distrito_id")
  VALUES ($1, $2, $3, $4, $5)`;

const SQL_PAGO = `INSERT INTO "gestion_pago_congelado"
  ("id", "organizacion_id", "gestion_orden_id", "actor", "concepto", "modo", "valor", "nivel", "base", "importe")
  VALUES ($1, $2, $3, $4::"tarifa_actor", $5::"tarifa_concepto", $6::"tarifa_modo", $7::numeric, 'zona', $8::numeric, $9::numeric)`;

const SQL_CONCEPTO = `INSERT INTO "cierre_detail_concepto"
  ("id", "organizacion_id", "cierre_detail_id", "concepto", "modo", "valor", "iva_pct", "nivel", "tarifa_valor_id")
  VALUES ($1, $2, $3, $4::"tarifa_concepto", 'monto', 1500.00, $5::numeric, 'zona', $6)`;

function rechazadoPor(r: Resultado, constraint: string, code = "23514"): void {
  expect(r, `se esperaba rechazo por ${constraint}`).toEqual({ ok: false, code, constraint });
}

// ── Siembra del modelo VIEJO, antes del up (SQL a mano, dueño de las tablas) ────────────────────

async function catalogo(): Promise<{
  rolTienda: string;
  rolMensajero: string;
  cedula: string;
  estatus: string;
  provinciaId: string;
  cantonId: string;
  distritos: string[];
  vehiculos: string[];
}> {
  const canton = await db.query(
    `SELECT c."id", c."provincia_id" FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (canton.rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  const cantonId = String(canton.rows[0].id);
  const distritos = await db.query(`SELECT "id" FROM "distrito" WHERE "canton_id" = $1 ORDER BY "id" LIMIT 4`, [cantonId]);
  if (distritos.rows.length < 4) throw new Error("la base migrada no trae 4 distritos de Cartago: no se puede sembrar");
  // `vehiculos` es catalogo de plataforma y la base recien migrada no trae filas (las pone el seed):
  // se crean dos aqui, en la base propia.
  const vehiculos: string[] = [];
  for (const nombre of ["moto", "carro"]) {
    const id = randomUUID();
    await db.query(`INSERT INTO "vehiculos" ("id", "name") VALUES ($1, $2)`, [id, `slt52-${nombre}-${id.slice(0, 8)}`]);
    vehiculos.push(id);
  }
  return {
    rolTienda: String(await uno(`SELECT "id" FROM "rol" WHERE "value" = 'Admin Tienda'`)),
    rolMensajero: String(await uno(`SELECT "id" FROM "rol" WHERE "value" = 'mensajero'`)),
    cedula: String(await uno(`SELECT "id" FROM "tipo_identificacion" WHERE "value" = 'cedula'`)),
    estatus: String(await uno(`SELECT "id" FROM "order_status" WHERE "value" = 'en_preparacion'`)),
    provinciaId: String(canton.rows[0].provincia_id),
    cantonId,
    distritos: distritos.rows.map((r) => String(r.id)),
    vehiculos,
  };
}

async function sembrarEmpresa(
  cat: Awaited<ReturnType<typeof catalogo>>,
  etiqueta: string,
  distritosDeLaZona: string[],
): Promise<Empresa> {
  const id = randomUUID();
  const sufijo = id.slice(0, 8);
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    id,
    `SLT52 ${etiqueta} ${sufijo}`,
    `slt52-${etiqueta.toLowerCase()}-${sufijo}`,
  ]);
  const zonaId = randomUUID();
  await db.query(
    `INSERT INTO "zona" ("id", "organizacion_id", "nombre", "sinpe_numero", "sinpe_nombre") VALUES ($1, $2, $3, '80000000', 'Titular de Prueba')`,
    [zonaId, id, `Zona ${etiqueta} ${sufijo}`],
  );
  for (const d of distritosDeLaZona) {
    await db.query(`INSERT INTO "zona_distrito" ("id", "organizacion_id", "zona_id", "distrito_id") VALUES ($1, $2, $3, $4)`, [
      randomUUID(),
      id,
      zonaId,
      d,
    ]);
  }
  const usuario = async (rolId: string, rol: string): Promise<string> => {
    const uid = randomUUID();
    await db.query(
      `INSERT INTO "usuario" ("id", "organizacion_id", "nombre", "email", "telefono", "password_hash", "cedula",
         "tipo_identificacion_id", "rol_id", "updated_at")
       VALUES ($1, $2, $3, $4, '88880000', 'x', $5, $6, $7, now())`,
      [uid, id, `${rol} ${etiqueta}`, `${rol}-${uid.slice(0, 12)}@example.com`, `slt52-${uid.slice(0, 12)}`, cat.cedula, rolId],
    );
    return uid;
  };
  const tiendaId = await usuario(cat.rolTienda, "tienda");
  const mensajeroId = await usuario(cat.rolMensajero, "mensajero");

  // El modelo viejo, una fila de cada: lo que R44 dice que la migracion no puede tocar.
  await db.query(
    `INSERT INTO "tarifas" ("id", "organizacion_id", "valor_flete", "valor_flete_devuelto", "valor_flete_gam",
       "valor_flete_devuelto_gam", "comision_cod", "iva_flete", "iva_comision_cod", "zona_id", "updated_at")
     VALUES ($1, $2, 2500, 1200, 2000, 1000, 3, 13, 13, $3, now())`,
    [randomUUID(), id, zonaId],
  );
  await db.query(
    `INSERT INTO "tarifa_zona_mensajero" ("id", "organizacion_id", "cobro_entregado", "cobro_rechazado", "zona_id")
     VALUES ($1, $2, 1500, 700, $3)`,
    [randomUUID(), id, zonaId],
  );
  await db.query(`INSERT INTO "distrito_zona_especial" ("id", "organizacion_id", "distrito_id") VALUES ($1, $2, $3)`, [
    randomUUID(),
    id,
    distritosDeLaZona[0],
  ]);

  const ordenId = randomUUID();
  await db.query(
    `INSERT INTO "orden" ("id", "organizacion_id", "num_remision", "estatus_id", "destinatario", "telefono_dest",
       "tienda_id", "zona_id", "provincia_id", "canton_id", "distrito_id", "producto", "updated_at")
     VALUES ($1, $2, $3, $4, 'Destinataria SLT-52', '88880000', $5, $6, $7, $8, $9, 'Caja', now())`,
    [ordenId, id, `R-${sufijo}`, cat.estatus, tiendaId, zonaId, cat.provinciaId, cat.cantonId, distritosDeLaZona[0]],
  );
  const cierreId = randomUUID();
  await db.query(
    `INSERT INTO "cierre_dia" ("id", "organizacion_id", "mensajero_id", "destino_tipo", "destino_zona_id", "updated_at")
     VALUES ($1, $2, $3, 'bodega_central', $4, now())`,
    [cierreId, id, mensajeroId, zonaId],
  );
  const cierreDetailId = randomUUID();
  await db.query(
    `INSERT INTO "cierre_detail" ("id", "organizacion_id", "cierre_id", "orden_id", "cobra_comision", "zona_id",
       "tienda_id", "es_central", "num_remision", "destinatario", "producto", "tienda_nombre", "zona_nombre",
       "provincia_nombre", "canton_nombre", "tarifa_valor_flete")
     VALUES ($1, $2, $3, $4, false, $5, $6, false, $7, 'Destinataria SLT-52', 'Caja', 'Tienda', 'Zona', 'Cartago',
       'Cartago', 2500)`,
    [cierreDetailId, id, cierreId, ordenId, zonaId, tiendaId, `R-${sufijo}`],
  );
  const gestionId = randomUUID();
  await db.query(
    `INSERT INTO "gestion_orden" ("id", "organizacion_id", "orden_id", "mensajero_id", "resultado")
     VALUES ($1, $2, $3, $4, 'entregado')`,
    [gestionId, id, ordenId, mensajeroId],
  );
  return { id, zonaId, tiendaId, mensajeroId, gestionId, cierreDetailId };
}

async function contarViejas(): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  for (const t of TABLAS_VIEJAS) r[t] = await contar(t);
  return r;
}

async function subirSlt52(): Promise<void> {
  for (const m of DE_SLT52) await ejecutar(db, sqlDe(m, "migration.sql"), `${m} (up)`);
}

async function bajarSlt52(): Promise<void> {
  for (const m of [...DE_SLT52].reverse()) await ejecutar(db, sqlDe(m, "down.sql"), `${m} (down)`);
}

describe.skipIf(!HAY_BASE_DE_DATOS)("SLT-52 — el esquema del modelo nuevo de tarifas (Postgres real, base propia)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    pool = await conectar(urlDe(BASE));
    const cliente = await (pool as unknown as { connect(): Promise<ClienteFijo> }).connect();
    db = { query: (t, v) => cliente.query(t, v), end: async () => cliente.release() };
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, ENUMS);

    const cat = await catalogo();
    const [d1, d2, d3, d4] = cat.distritos;
    const a = await sembrarEmpresa(cat, "A", [d1, d2, d3]);
    const b = await sembrarEmpresa(cat, "B", [d1]);
    const zonaA2 = randomUUID();
    await db.query(
      `INSERT INTO "zona" ("id", "organizacion_id", "nombre", "sinpe_numero", "sinpe_nombre") VALUES ($1, $2, $3, '80000000', 'Titular de Prueba')`,
      [zonaA2, a.id, `Zona A2 ${zonaA2.slice(0, 8)}`],
    );
    await db.query(`INSERT INTO "zona_distrito" ("id", "organizacion_id", "zona_id", "distrito_id") VALUES ($1, $2, $3, $4)`, [
      randomUUID(),
      a.id,
      zonaA2,
      d4,
    ]);
    s = { a, b, zonaA2, distritos: [d1, d2, d3, d4], vehiculos: [cat.vehiculos[0], cat.vehiculos[1]] };

    antes = await foto(db);
    conteosAntes = await contarViejas();
    await subirSlt52();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  // ── R44 / R42 ─────────────────────────────────────────────────────────────────────────────────

  it("R44/R42: el up no mueve ninguna fila del modelo viejo y todo cierre_detail queda en `viejo`", async () => {
    // Premisa: se sembro de verdad (dos empresas, una fila de cada tabla por empresa).
    for (const t of TABLAS_VIEJAS) expect(conteosAntes[t], `sin filas sembradas en ${t}`).toBeGreaterThanOrEqual(2);
    expect(await contarViejas()).toEqual(conteosAntes);
    const total = await contar("cierre_detail");
    expect(await contar("cierre_detail", `"tarifa_modelo" = 'viejo'`)).toBe(total);
    // Las columnas congeladas del modelo viejo siguen ahi, intactas.
    expect(await contar("cierre_detail", `"tarifa_valor_flete" = 2500`)).toBe(total);
  });

  // ── R4 / R7 / R45: los CHECK de tarifa_valor ──────────────────────────────────────────────────

  it("R4: valor negativo se rechaza y 0 se acepta", async () => {
    const r = await enTxRevertida(async () => ({
      negativo: await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", valor: "-0.01", iva: "13", zona: s.a.zonaId }),
      cero: await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", valor: "0", iva: "13", zona: s.a.zonaId }),
      filas: await contar("tarifa_valor", `"organizacion_id" = $1`, [s.a.id]),
    }));
    rechazadoPor(r.negativo, "tarifa_valor_no_negativo");
    expect(r.cero).toEqual({ ok: true });
    expect(r.filas).toBe(1);
  });

  it("R4: un porcentaje sobre 100 se rechaza; 100 en porcentaje y 150 en monto se aceptan", async () => {
    const r = await enTxRevertida(async () => ({
      sobre100: await insertarValor({ org: s.a.id, concepto: "tienda_comision_cod", modo: "porcentaje", valor: "100.01", iva: "13", zona: s.a.zonaId }),
      cien: await insertarValor({ org: s.a.id, concepto: "tienda_comision_cod", modo: "porcentaje", valor: "100", iva: "13", zona: s.a.zonaId }),
      monto: await insertarValor({ org: s.a.id, concepto: "tienda_fulfillment", modo: "monto", valor: "150", iva: "13", zona: s.a.zonaId }),
    }));
    rechazadoPor(r.sobre100, "tarifa_valor_porcentaje_tope");
    expect(r.cien).toEqual({ ok: true });
    expect(r.monto).toEqual({ ok: true });
  });

  it("R4: un cobro a la tienda sin IVA, o con IVA fuera de 0..100, se rechaza; 0 y 13 se aceptan", async () => {
    const cobro = (iva: string | null, concepto = "tienda_flete_entregado") =>
      insertarValor({ org: s.a.id, concepto, iva, zona: s.a.zonaId });
    const r = await enTxRevertida(async () => ({
      sinIva: await cobro(null),
      ivaNegativo: await cobro("-1"),
      ivaSobre100: await cobro("100.01"),
      ivaCero: await cobro("0", "tienda_flete_novedad"),
      iva13: await cobro("13", "tienda_flete_rechazo"),
    }));
    rechazadoPor(r.sinIva, "tarifa_valor_iva_solo_tienda");
    rechazadoPor(r.ivaNegativo, "tarifa_valor_iva_solo_tienda");
    rechazadoPor(r.ivaSobre100, "tarifa_valor_iva_solo_tienda");
    expect(r.ivaCero).toEqual({ ok: true });
    expect(r.iva13).toEqual({ ok: true });
  });

  it("R45 (P4): un pago al mensajero o a la satelite con IVA 0 o 13 se rechaza; con IVA NULL se acepta", async () => {
    const pago = (concepto: string, iva: string | null) => insertarValor({ org: s.a.id, concepto, iva, zona: s.a.zonaId });
    const r = await enTxRevertida(async () => ({
      mensajeroCero: await pago("mensajero_entregado", "0"),
      mensajero13: await pago("mensajero_entregado", "13"),
      sateliteCero: await pago("satelite_rechazo", "0"),
      satelite13: await pago("satelite_rechazo", "13"),
      mensajeroNull: await pago("mensajero_entregado", null),
      sateliteNull: await pago("satelite_rechazo", null),
      conIva: await contar("tarifa_valor", `"iva_pct" IS NOT NULL AND "concepto"::text NOT LIKE 'tienda\\_%'`),
    }));
    rechazadoPor(r.mensajeroCero, "tarifa_valor_iva_solo_tienda");
    rechazadoPor(r.mensajero13, "tarifa_valor_iva_solo_tienda");
    rechazadoPor(r.sateliteCero, "tarifa_valor_iva_solo_tienda");
    rechazadoPor(r.satelite13, "tarifa_valor_iva_solo_tienda");
    expect(r.mensajeroNull).toEqual({ ok: true });
    expect(r.sateliteNull).toEqual({ ok: true });
    expect(r.conIva).toBe(0);
  });

  it("R7: cada nivel incompatible con su actor se rechaza, y cada nivel valido se acepta", async () => {
    const [v1] = s.vehiculos;
    const r = await enTxRevertida(async () => {
      const grupo = await crearGrupo(s.a.id, s.a.zonaId, "Centro", [s.distritos[1]]);
      const t = "tienda_flete_entregado";
      const m = "mensajero_entregado";
      const sat = "satelite_entregado";
      return {
        // Rechazos
        grupoSinZona: await insertarValor({ org: s.a.id, concepto: t, iva: "13", grupo }),
        tiendaConMensajero: await insertarValor({ org: s.a.id, concepto: t, iva: "13", zona: s.a.zonaId, mensajero: s.a.mensajeroId }),
        tiendaConVehiculo: await insertarValor({ org: s.a.id, concepto: t, iva: "13", zona: s.a.zonaId, vehiculo: v1 }),
        tiendaSinNivel: await insertarValor({ org: s.a.id, concepto: t, iva: "13" }),
        mensajeroConTienda: await insertarValor({ org: s.a.id, concepto: m, zona: s.a.zonaId, tienda: s.a.tiendaId }),
        propioConZona: await insertarValor({ org: s.a.id, concepto: m, zona: s.a.zonaId, mensajero: s.a.mensajeroId }),
        propioConVehiculo: await insertarValor({ org: s.a.id, concepto: m, mensajero: s.a.mensajeroId, vehiculo: v1 }),
        mensajeroSinNivel: await insertarValor({ org: s.a.id, concepto: m }),
        sateliteConMensajero: await insertarValor({ org: s.a.id, concepto: sat, zona: s.a.zonaId, mensajero: s.a.mensajeroId }),
        sateliteConTienda: await insertarValor({ org: s.a.id, concepto: sat, zona: s.a.zonaId, tienda: s.a.tiendaId }),
        sateliteSinZona: await insertarValor({ org: s.a.id, concepto: sat }),
        // Aceptados: los cinco niveles de la tienda (R5) y los del pago (R6)
        tiendaZona: await insertarValor({ org: s.a.id, concepto: t, iva: "13", zona: s.a.zonaId }),
        tiendaGrupo: await insertarValor({ org: s.a.id, concepto: t, iva: "13", zona: s.a.zonaId, grupo }),
        tiendaEnZona: await insertarValor({ org: s.a.id, concepto: t, iva: "13", zona: s.a.zonaId, tienda: s.a.tiendaId }),
        tiendaEnGrupo: await insertarValor({ org: s.a.id, concepto: t, iva: "13", zona: s.a.zonaId, grupo, tienda: s.a.tiendaId }),
        tiendaGeneral: await insertarValor({ org: s.a.id, concepto: t, iva: "13", tienda: s.a.tiendaId }),
        mensajeroZona: await insertarValor({ org: s.a.id, concepto: m, zona: s.a.zonaId }),
        mensajeroZonaVehiculo: await insertarValor({ org: s.a.id, concepto: m, zona: s.a.zonaId, vehiculo: v1 }),
        mensajeroGrupo: await insertarValor({ org: s.a.id, concepto: m, zona: s.a.zonaId, grupo }),
        mensajeroGrupoVehiculo: await insertarValor({ org: s.a.id, concepto: m, zona: s.a.zonaId, grupo, vehiculo: v1 }),
        mensajeroPropio: await insertarValor({ org: s.a.id, concepto: m, mensajero: s.a.mensajeroId }),
        sateliteZona: await insertarValor({ org: s.a.id, concepto: sat, zona: s.a.zonaId }),
        sateliteGrupoVehiculo: await insertarValor({ org: s.a.id, concepto: sat, zona: s.a.zonaId, grupo, vehiculo: v1 }),
        filas: await contar("tarifa_valor", `"organizacion_id" = $1`, [s.a.id]),
      };
    });
    rechazadoPor(r.grupoSinZona, "tarifa_valor_grupo_con_zona");
    rechazadoPor(r.tiendaConMensajero, "tarifa_valor_niveles_tienda");
    rechazadoPor(r.tiendaConVehiculo, "tarifa_valor_niveles_tienda");
    rechazadoPor(r.tiendaSinNivel, "tarifa_valor_niveles_tienda");
    rechazadoPor(r.mensajeroConTienda, "tarifa_valor_niveles_mensajero");
    rechazadoPor(r.propioConZona, "tarifa_valor_niveles_mensajero");
    rechazadoPor(r.propioConVehiculo, "tarifa_valor_niveles_mensajero");
    rechazadoPor(r.mensajeroSinNivel, "tarifa_valor_niveles_mensajero");
    rechazadoPor(r.sateliteConMensajero, "tarifa_valor_niveles_satelite");
    rechazadoPor(r.sateliteConTienda, "tarifa_valor_niveles_satelite");
    rechazadoPor(r.sateliteSinZona, "tarifa_valor_niveles_satelite");
    const aceptados = [
      r.tiendaZona, r.tiendaGrupo, r.tiendaEnZona, r.tiendaEnGrupo, r.tiendaGeneral, r.mensajeroZona,
      r.mensajeroZonaVehiculo, r.mensajeroGrupo, r.mensajeroGrupoVehiculo, r.mensajeroPropio, r.sateliteZona,
      r.sateliteGrupoVehiculo,
    ];
    expect(aceptados).toEqual(aceptados.map(() => ({ ok: true })));
    expect(r.filas).toBe(aceptados.length);
  });

  it("R7/R11: un valor con un grupo de OTRA zona se rechaza por la FK compuesta", async () => {
    const r = await enTxRevertida(async () => {
      const grupoDeA2 = await crearGrupo(s.a.id, s.zonaA2, "De A2", [s.distritos[3]]);
      return {
        sembrado: await contar("grupo_distritos", `"id" = $1`, [grupoDeA2]),
        cruzado: await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", iva: "13", zona: s.a.zonaId, grupo: grupoDeA2 }),
        propio: await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", iva: "13", zona: s.zonaA2, grupo: grupoDeA2 }),
      };
    });
    expect(r.sembrado).toBe(1);
    rechazadoPor(r.cruzado, "tarifa_valor_grupo_id_zona_id_fkey", "23503");
    expect(r.propio).toEqual({ ok: true });
  });

  // ── R8: el unico NULLS NOT DISTINCT ───────────────────────────────────────────────────────────

  it("R8: dos valores del MISMO nivel (con NULLs) se rechazan; niveles distintos del mismo concepto conviven", async () => {
    const [v1] = s.vehiculos;
    const r = await enTxRevertida(async () => ({
      zona1: await insertarValor({ org: s.a.id, concepto: "mensajero_entregado", zona: s.a.zonaId }),
      zona2: await insertarValor({ org: s.a.id, concepto: "mensajero_entregado", zona: s.a.zonaId, valor: "999" }),
      general1: await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", iva: "13", tienda: s.a.tiendaId }),
      general2: await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", iva: "13", tienda: s.a.tiendaId }),
      zonaVehiculo: await insertarValor({ org: s.a.id, concepto: "mensajero_entregado", zona: s.a.zonaId, vehiculo: v1 }),
      otroConcepto: await insertarValor({ org: s.a.id, concepto: "mensajero_rechazo", zona: s.a.zonaId }),
      otraEmpresa: await insertarValor({ org: s.b.id, concepto: "mensajero_entregado", zona: s.b.zonaId }),
      filas: await contar("tarifa_valor"),
    }));
    expect(r.zona1).toEqual({ ok: true });
    rechazadoPor(r.zona2, "tarifa_valor_nivel_key", "23505");
    expect(r.general1).toEqual({ ok: true });
    rechazadoPor(r.general2, "tarifa_valor_nivel_key", "23505");
    expect(r.zonaVehiculo).toEqual({ ok: true });
    expect(r.otroConcepto).toEqual({ ok: true });
    expect(r.otraEmpresa).toEqual({ ok: true });
    expect(r.filas).toBe(5);
  });

  // ── R10 / R11: grupos ─────────────────────────────────────────────────────────────────────────

  it("R10: el nombre es unico dentro de la zona, no vacio, y se repite en otra zona", async () => {
    const r = await enTxRevertida(async () => {
      await crearGrupo(s.a.id, s.a.zonaId, "Norte");
      const sql = `INSERT INTO "grupo_distritos" ("id", "organizacion_id", "zona_id", "nombre") VALUES ($1, $2, $3, $4)`;
      return {
        repetido: await intento(sql, [randomUUID(), s.a.id, s.a.zonaId, "Norte"]),
        enBlanco: await intento(sql, [randomUUID(), s.a.id, s.a.zonaId, " \t "]),
        otraZona: await intento(sql, [randomUUID(), s.a.id, s.zonaA2, "Norte"]),
        filas: await contar("grupo_distritos", `"nombre" = 'Norte'`),
      };
    });
    rechazadoPor(r.repetido, "grupo_distritos_organizacion_id_zona_id_nombre_key", "23505");
    rechazadoPor(r.enBlanco, "grupo_distritos_nombre_no_vacio");
    expect(r.otraZona).toEqual({ ok: true });
    expect(r.filas).toBe(2);
  });

  it("R11: un distrito en DOS grupos de la zona, o fuera de la zona, o con un grupo de otra zona, se rechaza", async () => {
    const [d1, , , d4] = s.distritos;
    const r = await enTxRevertida(async () => {
      const g1 = await crearGrupo(s.a.id, s.a.zonaId, "Uno", [d1]);
      const g2 = await crearGrupo(s.a.id, s.a.zonaId, "Dos");
      return {
        sembrado: await contar("grupo_distritos_distrito", `"grupo_id" = $1 AND "distrito_id" = $2`, [g1, d1]),
        // d1 ya esta en g1: la misma zona no admite un segundo grupo para el
        enDosGrupos: await intento(SQL_DISTRITO_EN_GRUPO, [randomUUID(), s.a.id, g2, s.a.zonaId, d1]),
        // d4 es de la zona A2, no de la del grupo
        fueraDeLaZona: await intento(SQL_DISTRITO_EN_GRUPO, [randomUUID(), s.a.id, g2, s.a.zonaId, d4]),
        // zona_id de A2 (donde d4 SI esta) con un grupo de la zona A: la otra FK compuesta lo para
        grupoDeOtraZona: await intento(SQL_DISTRITO_EN_GRUPO, [randomUUID(), s.a.id, g2, s.zonaA2, d4]),
      };
    });
    expect(r.sembrado).toBe(1);
    rechazadoPor(r.enDosGrupos, "grupo_distritos_distrito_organizacion_id_zona_id_distrito_i_key", "23505");
    rechazadoPor(r.fueraDeLaZona, "grupo_distritos_distrito_zona_id_distrito_id_fkey", "23503");
    rechazadoPor(r.grupoDeOtraZona, "grupo_distritos_distrito_grupo_id_zona_id_fkey", "23503");
  });

  // ── R12: cascadas ─────────────────────────────────────────────────────────────────────────────

  it("R12: sacar un distrito de la zona lo saca del grupo; borrar el grupo borra sus distritos y sus valores", async () => {
    const [d1, d2] = s.distritos;
    const r = await enTxRevertida(async () => {
      const g = await crearGrupo(s.a.id, s.a.zonaId, "Cascada", [d1, d2]);
      const valor = await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", iva: "13", zona: s.a.zonaId, grupo: g });
      const sembrado = {
        distritos: await contar("grupo_distritos_distrito", `"grupo_id" = $1`, [g]),
        valores: await contar("tarifa_valor", `"grupo_id" = $1`, [g]),
        valor,
      };
      await db.query(`DELETE FROM "zona_distrito" WHERE "zona_id" = $1 AND "distrito_id" = $2`, [s.a.zonaId, d1]);
      const trasSacarD1 = {
        d1: await contar("grupo_distritos_distrito", `"grupo_id" = $1 AND "distrito_id" = $2`, [g, d1]),
        d2: await contar("grupo_distritos_distrito", `"grupo_id" = $1 AND "distrito_id" = $2`, [g, d2]),
        grupo: await contar("grupo_distritos", `"id" = $1`, [g]),
      };
      await db.query(`DELETE FROM "grupo_distritos" WHERE "id" = $1`, [g]);
      const trasBorrarGrupo = {
        distritos: await contar("grupo_distritos_distrito", `"grupo_id" = $1`, [g]),
        valores: await contar("tarifa_valor", `"grupo_id" = $1`, [g]),
        zonaDistritoD2: await contar("zona_distrito", `"zona_id" = $1 AND "distrito_id" = $2`, [s.a.zonaId, d2]),
      };
      return { sembrado, trasSacarD1, trasBorrarGrupo };
    });
    expect(r.sembrado).toEqual({ distritos: 2, valores: 1, valor: { ok: true } });
    expect(r.trasSacarD1).toEqual({ d1: 0, d2: 1, grupo: 1 });
    // El distrito sigue en la zona: borrar el grupo no toca `zona_distrito`.
    expect(r.trasBorrarGrupo).toEqual({ distritos: 0, valores: 0, zonaDistritoD2: 1 });
  });

  // ── Los CHECK del congelado (R34, R40, R43) ───────────────────────────────────────────────────

  it("R34/R45: `gestion_pago_congelado` no tiene columna de IVA y sus CHECK rechazan lo que no es un pago", async () => {
    const columnas = await db.query(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gestion_pago_congelado'`,
    );
    const nombres = columnas.rows.map((x) => String(x.c));
    expect(nombres).toContain("importe");
    expect(nombres.filter((c) => /iva/i.test(c))).toEqual([]);

    const pago = (actor: string, concepto: string, modo: string, base: string | null) =>
      intento(SQL_PAGO, [randomUUID(), s.a.id, s.a.gestionId, actor, concepto, modo, "10", base, "250.00"]);
    const r = await enTxRevertida(async () => ({
      actorTienda: await pago("tienda", "tienda_flete_entregado", "monto", null),
      conceptoDeOtroActor: await pago("mensajero", "satelite_entregado", "monto", null),
      montoConBase: await pago("mensajero", "mensajero_entregado", "monto", "2500"),
      porcentajeSinBase: await pago("satelite", "satelite_entregado", "porcentaje", null),
      mensajeroMonto: await pago("mensajero", "mensajero_entregado", "monto", null),
      satelitePorcentaje: await pago("satelite", "satelite_entregado", "porcentaje", "2500"),
      repetido: await pago("mensajero", "mensajero_rechazo", "monto", null),
      filas: await contar("gestion_pago_congelado", `"gestion_orden_id" = $1`, [s.a.gestionId]),
    }));
    expect(r.actorTienda.ok).toBe(false);
    expect(["gestion_pago_congelado_actor_no_tienda", "gestion_pago_congelado_concepto_no_tienda"]).toContain(
      (r.actorTienda as { constraint: string }).constraint,
    );
    rechazadoPor(r.conceptoDeOtroActor, "gestion_pago_congelado_concepto_del_actor");
    rechazadoPor(r.montoConBase, "gestion_pago_congelado_base_solo_porcentaje");
    rechazadoPor(r.porcentajeSinBase, "gestion_pago_congelado_base_solo_porcentaje");
    expect(r.mensajeroMonto).toEqual({ ok: true });
    expect(r.satelitePorcentaje).toEqual({ ok: true });
    // Un pago por actor y gestion: el segundo del mensajero choca aunque sea otro concepto.
    rechazadoPor(r.repetido, "gestion_pago_congelado_gestion_orden_id_actor_key", "23505");
    expect(r.filas).toBe(2);
  });

  it("R40: `cierre_detail_concepto` solo admite cobros a la tienda, con IVA, uno por concepto y detalle", async () => {
    const concepto = (c: string, iva: string | null) => intento(SQL_CONCEPTO, [randomUUID(), s.a.id, s.a.cierreDetailId, c, iva, null]);
    const r = await enTxRevertida(async () => ({
      pago: await concepto("mensajero_entregado", null),
      sinIva: await concepto("tienda_flete_entregado", null),
      cobro: await concepto("tienda_flete_entregado", "13"),
      repetido: await concepto("tienda_flete_entregado", "13"),
      filas: await contar("cierre_detail_concepto", `"cierre_detail_id" = $1`, [s.a.cierreDetailId]),
    }));
    expect(r.pago.ok).toBe(false);
    expect(r.sinIva).toMatchObject({ ok: false, code: "23502" });
    expect(r.cobro).toEqual({ ok: true });
    rechazadoPor(r.repetido, "cierre_detail_concepto_cierre_detail_id_concepto_key", "23505");
    expect(r.filas).toBe(1);
  });

  // ── R15: aislamiento por empresa ──────────────────────────────────────────────────────────────

  it("R15: con `servi_app` y la empresa A no se ve, ni se escribe, ni se borra nada de B en las cinco tablas", async () => {
    const r = await enTxRevertida(async () => {
      // Siembra como dueño (sin RLS), una fila de cada tabla nueva en cada empresa.
      for (const e of [s.a, s.b]) {
        const g = await crearGrupo(e.id, e.zonaId, "Aislado", [s.distritos[0]]);
        const valorId = randomUUID();
        await db.query(SQL_VALOR, paramsValor({ id: valorId, org: e.id, concepto: "tienda_flete_entregado", iva: "13", zona: e.zonaId, grupo: g }));
        await db.query(SQL_CONCEPTO, [randomUUID(), e.id, e.cierreDetailId, "tienda_flete_entregado", "13", valorId]);
        await db.query(SQL_PAGO, [randomUUID(), e.id, e.gestionId, "mensajero", "mensajero_entregado", "monto", "10", null, "10.00"]);
      }
      const sembradoB: Record<string, number> = {};
      for (const t of TABLAS_NUEVAS) sembradoB[t] = await contar(t, `"organizacion_id" = $1`, [s.b.id]);

      await comoApp(s.a.id);
      const vistoComoA: Record<string, { propias: number; deB: number }> = {};
      for (const t of TABLAS_NUEVAS) {
        vistoComoA[t] = {
          propias: await contar(t, `"organizacion_id" = $1`, [s.a.id]),
          deB: await contar(t, `"organizacion_id" = $1`, [s.b.id]),
        };
      }
      const escribirEnB = await insertarValor({ org: s.b.id, concepto: "mensajero_entregado", zona: s.b.zonaId });
      const actualizarB = await db.query(`UPDATE "tarifa_valor" SET "valor" = 1 WHERE "organizacion_id" = $1`, [s.b.id]);
      const borrarB = await db.query(`DELETE FROM "grupo_distritos" WHERE "organizacion_id" = $1`, [s.b.id]);
      // Sin `organizacion_id` explicito, el DEFAULT pone la empresa del contexto.
      const porDefecto = await intento(
        `INSERT INTO "tarifa_valor" ("id", "concepto", "modo", "valor", "zona_id") VALUES ($1, 'mensajero_rechazo', 'monto', 5, $2)`,
        [randomUUID(), s.a.zonaId],
      );
      const propiasTrasDefecto = await contar("tarifa_valor", `"organizacion_id" = $1`, [s.a.id]);
      await db.query(`RESET ROLE`);
      const deBTrasIntentos = {
        valores: await contar("tarifa_valor", `"organizacion_id" = $1 AND "valor" <> 1`, [s.b.id]),
        grupos: await contar("grupo_distritos", `"organizacion_id" = $1`, [s.b.id]),
      };
      return {
        sembradoB,
        vistoComoA,
        escribirEnB,
        actualizadasB: (actualizarB as unknown as { rowCount: number }).rowCount,
        borradasB: (borrarB as unknown as { rowCount: number }).rowCount,
        porDefecto,
        propiasTrasDefecto,
        deBTrasIntentos,
      };
    });
    for (const t of TABLAS_NUEVAS) {
      expect(r.sembradoB[t], `sin filas de B en ${t}`).toBe(1);
      expect(r.vistoComoA[t], t).toEqual({ propias: 1, deB: 0 });
    }
    // 42501: la politica WITH CHECK rechaza la fila de otra empresa.
    expect(r.escribirEnB).toMatchObject({ ok: false, code: "42501" });
    expect(r.actualizadasB).toBe(0);
    expect(r.borradasB).toBe(0);
    expect(r.porDefecto).toEqual({ ok: true });
    expect(r.propiasTrasDefecto).toBe(2);
    expect(r.deBTrasIntentos).toEqual({ valores: 1, grupos: 1 });
  });

  it("R15: ni siquiera como dueño un valor de A puede apuntar a una zona, tienda o grupo de B (SL017)", async () => {
    const r = await enTxRevertida(async () => {
      const grupoB = await crearGrupo(s.b.id, s.b.zonaId, "De B", [s.distritos[0]]);
      return {
        zonaDeB: await insertarValor({ org: s.a.id, concepto: "mensajero_entregado", zona: s.b.zonaId }),
        tiendaDeB: await insertarValor({ org: s.a.id, concepto: "tienda_flete_entregado", iva: "13", tienda: s.b.tiendaId }),
        grupoDeB: await intento(SQL_DISTRITO_EN_GRUPO, [randomUUID(), s.a.id, grupoB, s.b.zonaId, s.distritos[0]]),
        pagoDeGestionB: await intento(SQL_PAGO, [randomUUID(), s.a.id, s.b.gestionId, "mensajero", "mensajero_entregado", "monto", "1", null, "1"]),
      };
    });
    for (const [caso, res] of Object.entries(r)) expect(res, caso).toMatchObject({ ok: false, code: "SL017" });
  });

  // ── R43: lo congelado del cobro es inmutable para la app ──────────────────────────────────────

  it("R43: con `servi_app`, UPDATE y DELETE de `cierre_detail_concepto` dan 42501; el INSERT y el re-congelado del pago, no", async () => {
    const r = await enTxRevertida(async () => {
      const valorId = randomUUID();
      await db.query(SQL_VALOR, paramsValor({ id: valorId, org: s.a.id, concepto: "tienda_flete_entregado", iva: "13", zona: s.a.zonaId }));
      await db.query(SQL_PAGO, [randomUUID(), s.a.id, s.a.gestionId, "mensajero", "mensajero_entregado", "monto", "10", null, "10.00"]);
      await comoApp(s.a.id);
      const insertar = await intento(SQL_CONCEPTO, [randomUUID(), s.a.id, s.a.cierreDetailId, "tienda_flete_entregado", "13", valorId]);
      const sembrado = await contar("cierre_detail_concepto", `"cierre_detail_id" = $1`, [s.a.cierreDetailId]);
      const actualizar = await intento(`UPDATE "cierre_detail_concepto" SET "valor" = 1 WHERE "cierre_detail_id" = $1`, [s.a.cierreDetailId]);
      const borrar = await intento(`DELETE FROM "cierre_detail_concepto" WHERE "cierre_detail_id" = $1`, [s.a.cierreDetailId]);
      // El pago SI se re-congela (398/477): UPDATE y DELETE permitidos a la app.
      const recongelar = await intento(`UPDATE "gestion_pago_congelado" SET "importe" = 12 WHERE "gestion_orden_id" = $1`, [s.a.gestionId]);
      // R9 + R43: borrar el valor de origen pone su traza a NULL (la accion corre como dueño de la tabla).
      const borrarValor = await intento(`DELETE FROM "tarifa_valor" WHERE "id" = $1`, [valorId]);
      const trazaNula = await contar("cierre_detail_concepto", `"cierre_detail_id" = $1 AND "tarifa_valor_id" IS NULL AND "valor" = 1500`, [s.a.cierreDetailId]);
      return { insertar, sembrado, actualizar, borrar, recongelar, borrarValor, trazaNula };
    });
    expect(r.insertar).toEqual({ ok: true });
    expect(r.sembrado).toBe(1);
    expect(r.actualizar).toMatchObject({ ok: false, code: "42501" });
    expect(r.borrar).toMatchObject({ ok: false, code: "42501" });
    expect(r.recongelar).toEqual({ ok: true });
    expect(r.borrarValor).toEqual({ ok: true });
    expect(r.trazaNula).toBe(1);
  });

  // ── R44: el down deja el esquema como estaba (va el ultimo) ───────────────────────────────────

  it("R44: el down de las cuatro deja catalogos y conteos como antes del up, y el up se puede repetir", async () => {
    // Premisa: el up de verdad cambio el esquema.
    expect(diferencias(await foto(db), antes).length).toBeGreaterThan(0);

    await bajarSlt52();
    expect(diferencias(await foto(db), antes)).toEqual([]);
    expect(await contarViejas()).toEqual(conteosAntes);

    await subirSlt52();
    expect(await contarViejas()).toEqual(conteosAntes);
    expect(await contar("cierre_detail", `"tarifa_modelo" = 'viejo'`)).toBe(conteosAntes.cierre_detail);
  });
});
