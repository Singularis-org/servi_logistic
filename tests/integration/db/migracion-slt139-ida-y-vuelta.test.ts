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
 * SLT-139 (R330, R337, R318; design §3 y §13.2) — las dos migraciones de `pago_satelite`, de ida y
 * vuelta, contra Postgres, en una base PROPIA (`slt139_iv_<rand>`) construida con las migraciones
 * anteriores: el `down.sql` del enum recrea `pago_mensajero_movimiento_categoria` y en la base
 * compartida chocaria con los archivos que escriben en el libro a la vez.
 *
 * - Subir no mueve un centimo: cuenta, Σ y md5 de cada tabla de dinero iguales antes y despues.
 * - Tras subir, la base rechaza un `pago_satelite` de `devengo`, de origen `manual` o sin `origen_id`
 *   (23514), acepta uno valido y un segundo del mismo (cierre, mensajero) choca con el unico parcial.
 * - Con una fila `pago_satelite`, los dos `down.sql` abortan con su RAISE (P0001) y no cambian nada.
 * - Sin filas, los dos `down.sql` en orden inverso dejan el esquema EXACTAMENTE como antes (el CHECK de
 *   SLT-68 por `pg_get_constraintdef`, sin el CHECK de origen, sin el valor en `pg_enum`).
 * - Reaplicadas, todo vuelve igual que la primera vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La ultima de `origin/dev` medida en T1.2 (2026-11-12): las de SLT-139 van detras (ver `fallosDeOrden`). */
const ULTIMA_DE_DEV = "20261114120000_pago_independiente_efectivo";
const M_ENUM = "20261115120000_pago_satelite_enum";
const M_CHECKS = "20261115120100_pago_satelite_checks";
const DE_SLT139 = [M_ENUM, M_CHECKS];

/** El CHECK tipo<->categoria que dejo SLT-68 (`pg_get_constraintdef`, medido en T0.1). */
const CHECK_DE_SLT68 =
  "CHECK ((((tipo = 'devengo'::pago_mensajero_movimiento_tipo) AND (categoria = ANY (ARRAY['pago_devengado'::pago_mensajero_movimiento_categoria, 'ajuste_devengo'::pago_mensajero_movimiento_categoria, 'premio_ranking'::pago_mensajero_movimiento_categoria, 'incentivo'::pago_mensajero_movimiento_categoria]))) OR ((tipo = 'pago'::pago_mensajero_movimiento_tipo) AND (categoria = ANY (ARRAY['pago_efectivo'::pago_mensajero_movimiento_categoria, 'liquidacion'::pago_mensajero_movimiento_categoria, 'ajuste_pago'::pago_mensajero_movimiento_categoria, 'reverso_incentivo'::pago_mensajero_movimiento_categoria])))))";

const BASE = `slt139_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/**
 * Los fallos de orden de las dos de SLT-139 respecto de `ULTIMA_DE_DEV`, o `[]` si estan bien.
 *
 * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (CI de #153): antes se exigia
 * adyacencia (`previa+1`, `previa+2`). Desde dev entro `20261114120000_plan_cambio_por_empresa`
 * (SLT-128), con el MISMO timestamp que `ULTIMA_DE_DEV`, y ordena entre medias: la adyacencia con
 * dev deja de ser algo que SLT-139 controle. Lo que R337 necesita se conserva: las dos van DESPUES
 * de `ULTIMA_DE_DEV` y `M_CHECKS` va JUSTO detras de `M_ENUM` (el down de checks antes que el del
 * enum, y nada de otra feature aplicandose entre las dos).
 */
function fallosDeOrden(carpetas: readonly string[]): string[] {
  const previa = carpetas.indexOf(ULTIMA_DE_DEV);
  const enumIdx = carpetas.indexOf(M_ENUM);
  const checksIdx = carpetas.indexOf(M_CHECKS);
  const fallos: string[] = [];
  if (previa < 0) fallos.push(`falta ${ULTIMA_DE_DEV}`);
  if (enumIdx < 0) fallos.push(`falta ${M_ENUM}`);
  if (checksIdx < 0) fallos.push(`falta ${M_CHECKS}`);
  if (fallos.length > 0) return fallos;
  if (enumIdx <= previa) fallos.push(`${M_ENUM} no va despues de ${ULTIMA_DE_DEV}`);
  if (checksIdx !== enumIdx + 1) fallos.push(`${M_CHECKS} no va justo detras de ${M_ENUM}`);
  return fallos;
}

describe("SLT-139 R337 — las dos migraciones en disco", () => {
  it("traen su down.sql y van, en orden, detras de la ultima migracion de dev medida en T1.2", () => {
    expect(fallosDeOrden(carpetasDeMigracion())).toEqual([]);
    for (const c of DE_SLT139) {
      expect(existsSync(path.join(MIGRACIONES, c, "down.sql")), `${c} sin down.sql`).toBe(true);
    }
  });

  it("la comprobacion de orden muerde: listas sinteticas fuera de orden dan fallo", () => {
    const OTRA = "20261114120000_plan_cambio_por_empresa";
    expect(fallosDeOrden([ULTIMA_DE_DEV, OTRA, M_ENUM, M_CHECKS])).toEqual([]);
    expect(fallosDeOrden([M_ENUM, ULTIMA_DE_DEV, M_CHECKS])).toContain(
      `${M_ENUM} no va despues de ${ULTIMA_DE_DEV}`,
    );
    expect(fallosDeOrden([ULTIMA_DE_DEV, M_ENUM, OTRA, M_CHECKS])).toContain(
      `${M_CHECKS} no va justo detras de ${M_ENUM}`,
    );
    expect(fallosDeOrden([ULTIMA_DE_DEV, M_CHECKS, M_ENUM])).toContain(
      `${M_CHECKS} no va justo detras de ${M_ENUM}`,
    );
    expect(fallosDeOrden([ULTIMA_DE_DEV, M_ENUM])).toEqual([`falta ${M_CHECKS}`]);
  });
});

let db: Conexion;
let admin: Conexion | undefined;
let antes: Foto;
let con: Foto;
let dineroAntes: string[];
let organizacionId = "";
let mensajeroId = "";
let cierreSatelite = "";
let cierreOtro = "";

/** Las tablas de dinero que R337 nombra, fila a fila: cuenta, Σ y md5. */
async function dinero(): Promise<string[]> {
  const consultas = [
    `SELECT 'cierre_dia ' || count(*)::text || ' ' || COALESCE(sum("total_pago_mensajero"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "cierre_dia" t`,
    `SELECT 'pago_mensajero_movimiento ' || count(*)::text || ' ' || COALESCE(sum("monto"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "pago_mensajero_movimiento" t`,
    `SELECT 'wallet_movimiento ' || count(*)::text || ' ' || COALESCE(sum("monto"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "wallet_movimiento" t`,
    `SELECT 'liquidacion_pago ' || count(*)::text || ' ' || COALESCE(sum("monto"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "liquidacion_pago" t`,
    `SELECT 'cierre_bodega ' || count(*)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "cierre_bodega" t`,
  ];
  const salida: string[] = [];
  for (const c of consultas) salida.push(String((await db.query(c)).rows[0].l));
  return salida;
}

async function etiquetas(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'pago_mensajero_movimiento_categoria' AND n.nspname = 'public' ORDER BY e.enumsortorder`,
  );
  return rows.map((r) => String(r.l));
}

async function checkTipoCategoria(): Promise<string> {
  const { rows } = await db.query(
    `SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.conname = 'pago_mensajero_movimiento_tipo_categoria_check'`,
  );
  return String(rows[0].d);
}

async function pagosSatelite(): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM "pago_mensajero_movimiento" WHERE "categoria"::text = 'pago_satelite'`,
  );
  return Number(rows[0].n);
}

/** Inserta un `pago_satelite` con lo que se le pase; devuelve el SQLSTATE si la base lo rechaza. */
async function insertar(
  fila: { tipo?: string; origenTipo?: string; origenId?: string | null; monto?: string } = {},
): Promise<string | null> {
  try {
    await db.query(
      `INSERT INTO "pago_mensajero_movimiento" ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","organizacion_id")
       VALUES ($1,$2,$3::pago_mensajero_movimiento_tipo,'pago_satelite',$4,$5,$6,$7)`,
      [
        randomUUID(),
        mensajeroId,
        fila.tipo ?? "pago",
        fila.monto ?? "2500.00",
        fila.origenTipo ?? "cierre_dia",
        fila.origenId === undefined ? cierreSatelite : fila.origenId,
        organizacionId,
      ],
    );
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "sin codigo";
  }
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

async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  return resto;
}

describeSiHayBase("SLT-139 R330/R337 — pago_satelite de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M_ENUM);

    // Una empresa con un cierre de satelite viejo ya asentado (P 3 000, E 1 000 -> devengo 3 000,
    // pago_efectivo 1 000) y un segundo cierre para el caso de unicidad.
    organizacionId = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id","nombre","slug") VALUES ($1,'SLT139 ida y vuelta',$2)`, [
      organizacionId,
      `slt139-iv-${organizacionId.slice(0, 8)}`,
    ]);
    const rol = await db.query(`SELECT "id" FROM "rol" WHERE "value" = 'mensajero'`);
    const tipo = await db.query(`SELECT "id" FROM "tipo_identificacion" LIMIT 1`);
    expect(rol.rows, "falta el rol mensajero en la base propia").toHaveLength(1);
    expect(tipo.rows.length, "falta un tipo de identificacion en la base propia").toBeGreaterThan(0);
    mensajeroId = randomUUID();
    await db.query(
      `INSERT INTO "usuario" ("id","nombre","email","telefono","password_hash","cedula","tipo_identificacion_id","rol_id","organizacion_id","updated_at")
       VALUES ($1,'Mensajero SLT139',$2,'88880000','x',$3,$4,$5,$6,now())`,
      [mensajeroId, `slt139-${mensajeroId.slice(0, 8)}@example.test`, `SLT139-${mensajeroId.slice(0, 8)}`, tipo.rows[0].id, rol.rows[0].id, organizacionId],
    );
    const zonaId = randomUUID();
    await db.query(
      `INSERT INTO "zona" ("id","nombre","sinpe_numero","sinpe_nombre","organizacion_id") VALUES ($1,'Zona SLT139','80000000','Titular',$2)`,
      [zonaId, organizacionId],
    );
    cierreSatelite = randomUUID();
    cierreOtro = randomUUID();
    for (const id of [cierreSatelite, cierreOtro]) {
      await db.query(
        `INSERT INTO "cierre_dia" ("id","mensajero_id","estado","destino_tipo","destino_zona_id","organizacion_id",
                                   "total_pago_mensajero","total_efectivo","total_general","updated_at")
         VALUES ($1,$2,'aprobado','bodega_satelite',$3,$4,3000.00,1000.00,1000.00,now())`,
        [id, mensajeroId, zonaId, organizacionId],
      );
    }
    for (const [tipoMov, categoria, monto] of [
      ["devengo", "pago_devengado", "3000.00"],
      ["pago", "pago_efectivo", "1000.00"],
    ] as const) {
      await db.query(
        `INSERT INTO "pago_mensajero_movimiento" ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","organizacion_id")
         VALUES ($1,$2,$3,$4,$5,'cierre_dia',$6,$7)`,
        [randomUUID(), mensajeroId, tipoMov, categoria, monto, cierreSatelite, organizacionId],
      );
    }

    antes = await fotoSinFilas();
    const filasAntes = (await foto(db)).filas;
    dineroAntes = await dinero();
    // Sin datos sembrados el test seria verde sin medir nada.
    expect(dineroAntes[0]).toMatch(/^cierre_dia 2 6000\.00 /);
    expect(dineroAntes[1]).toMatch(/^pago_mensajero_movimiento 2 4000\.00 /);
    expect(await etiquetas()).not.toContain("pago_satelite");
    expect(await checkTipoCategoria()).toBe(CHECK_DE_SLT68);

    for (const carpeta of DE_SLT139) await ejecutar(db, sqlDe(carpeta, "migration.sql"), carpeta);
    con = await fotoSinFilas();
    // Aditivas: ni una fila se movio (R337).
    expect(diferencias({ filas: (await foto(db)).filas }, { filas: filasAntes }), "filas movidas por la ida").toEqual([]);
    expect(diferencias(con, antes).length, "la ida no cambio el esquema").toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R337: subir no cambia ni un centimo: cuenta, Σ y md5 de cada tabla de dinero iguales", async () => {
    expect(await dinero()).toEqual(dineroAntes);
    expect(await etiquetas()).toContain("pago_satelite");
  });

  it("R330: la base rechaza pago_satelite como devengo, con origen manual o sin origen_id (23514)", async () => {
    expect(await insertar({ tipo: "devengo" }), "devengo").toBe("23514");
    expect(await insertar({ origenTipo: "manual" }), "origen manual").toBe("23514");
    expect(await insertar({ origenId: null }), "origen_id nulo").toBe("23514");
    expect(await pagosSatelite()).toBe(0);
  });

  it("R330/R318: acepta uno valido y el segundo del mismo (cierre, mensajero) choca con origen_uq", async () => {
    expect(await insertar()).toBeNull();
    expect(await insertar({ monto: "1.00" }), "segundo pago_satelite del mismo cierre").toBe("23505");
    expect(await insertar({ origenId: cierreOtro })).toBeNull();
    expect(await pagosSatelite()).toBe(2);
    await db.query(`DELETE FROM "pago_mensajero_movimiento" WHERE "origen_id" = $1 AND "categoria"::text = 'pago_satelite'`, [
      cierreOtro,
    ]);
    expect(await pagosSatelite()).toBe(1);
  });

  it("R337: con una fila pago_satelite, los dos down.sql abortan con su RAISE y no cambian nada", async () => {
    expect(await pagosSatelite(), "el caso necesita una fila pago_satelite").toBe(1);
    const dineroConFila = await dinero();

    const deChecks = await fallaDe(ejecutar(db, sqlDe(M_CHECKS, "down.sql"), `${M_CHECKS}/down.sql`));
    expect(deChecks, "el down de los checks no aborto").toBeInstanceOf(ErrorDeScript);
    expect(deChecks?.sqlstate).toBe("P0001");
    expect(deChecks?.message).toContain("hay filas pago_satelite");
    expect(diferencias(await fotoSinFilas(), con), "tras el down de los checks abortado").toEqual([]);
    expect(await checkTipoCategoria()).toContain("'pago_satelite'");

    const deEnum = await fallaDe(ejecutar(db, sqlDe(M_ENUM, "down.sql"), `${M_ENUM}/down.sql`));
    expect(deEnum, "el down del enum no aborto").toBeInstanceOf(ErrorDeScript);
    expect(deEnum?.sqlstate).toBe("P0001");
    expect(deEnum?.message).toContain("se aborta sin borrar nada");
    expect(diferencias(await fotoSinFilas(), con), "tras el down del enum abortado").toEqual([]);

    expect(await dinero()).toEqual(dineroConFila);
    expect(await pagosSatelite()).toBe(1);
  }, 120_000);

  it("R337: sin filas pago_satelite, los dos down.sql en orden inverso dejan el esquema como antes", async () => {
    await db.query(`DELETE FROM "pago_mensajero_movimiento" WHERE "categoria"::text = 'pago_satelite'`);
    expect(await pagosSatelite()).toBe(0);

    for (const carpeta of [...DE_SLT139].reverse()) await ejecutar(db, sqlDe(carpeta, "down.sql"), `${carpeta}/down.sql`);

    expect(diferencias(await fotoSinFilas(), antes), "tras los dos downs").toEqual([]);
    expect(await checkTipoCategoria()).toBe(CHECK_DE_SLT68);
    expect(await etiquetas()).not.toContain("pago_satelite");
    const origen = await db.query(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public' AND c.conname = 'pago_mensajero_movimiento_pago_satelite_origen_check'`,
    );
    expect(Number(origen.rows[0].n)).toBe(0);
    expect(await dinero()).toEqual(dineroAntes);
  }, 120_000);

  it("reaplicadas las dos, todo vuelve igual que la primera vez y un pago_satelite valido vuelve a entrar", async () => {
    for (const carpeta of DE_SLT139) await ejecutar(db, sqlDe(carpeta, "migration.sql"), `${carpeta}/migration.sql (otra vez)`);
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);
    expect(await dinero()).toEqual(dineroAntes);
    expect(await insertar()).toBeNull();
    expect(await pagosSatelite()).toBe(1);
  }, 120_000);
});
