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
 * SLT-123 (R312, design §3.2-SLT-123 y §11.2) — la marca `cierre_dia.pago_independiente_efectivo`, de
 * ida y vuelta, contra Postgres, en una base PROPIA (`slt123_iv_<rand>`) construida con las migraciones
 * anteriores. La base de `DATABASE_URL` no se toca.
 *
 * - Subir no escribe una sola fila: cuenta, Σ y md5 de cada tabla de dinero iguales antes y despues, y
 *   TODOS los cierres (aprobado, solicitado, rechazado) quedan en `false` (sin backfill, D5/D6).
 * - Con un cierre marcado, el `down.sql` aborta con su RAISE (P0001) y no cambia nada: bajar la columna
 *   devolveria ese cierre, en silencio, a la regla de la feature 44.
 * - Sin ninguno marcado, el `down.sql` deja el esquema EXACTAMENTE como antes (columna fuera).
 * - Reaplicada, todo vuelve igual que la primera vez.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const M_ANTERIOR = "20261113120000_cobro_plataforma_sin_valor_empresa";
const M = "20261114120000_pago_independiente_efectivo";

const BASE = `slt123_iv_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-123 R312 — la migracion en disco", () => {
  it("trae su down.sql y va justo detras de la ultima migracion de dev medida en T0", () => {
    const carpetas = carpetasDeMigracion();
    const anterior = carpetas.indexOf(M_ANTERIOR);
    const esta = carpetas.indexOf(M);
    expect(anterior, `falta ${M_ANTERIOR}`).toBeGreaterThanOrEqual(0);
    expect(esta, `falta ${M}`).toBe(anterior + 1);
    expect(existsSync(path.join(MIGRACIONES, M, "down.sql")), `${M} sin down.sql`).toBe(true);
  });
});

let db: Conexion;
let admin: Conexion | undefined;
let antes: Foto;
let con: Foto;
let dineroAntes: string[];
const cierres: Record<"aprobado" | "solicitado" | "rechazado", string> = {
  aprobado: "",
  solicitado: "",
  rechazado: "",
};

/**
 * Las tablas de dinero, fila a fila. `cierre_dia` por sus columnas de dinero y estado (su `row::text`
 * gana la columna nueva al subir, que es justo lo que se mide aparte); las demas, la fila entera.
 */
async function dinero(): Promise<string[]> {
  const consultas = [
    `SELECT 'cierre_dia ' || count(*)::text || ' ' || COALESCE(sum("total_pago_mensajero"), 0)::text || ' ' ||
            COALESCE(sum("total_efectivo"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(concat_ws('|', "id", "estado", "destino_tipo", "total_efectivo", "total_simpe",
              "total_transferencia", "total_general", "total_pago_mensajero", "total_ingreso_bodega_rechazos",
              "resuelto_at", "updated_at"), ';' ORDER BY "id"), '')) AS l FROM "cierre_dia"`,
    `SELECT 'pago_mensajero_movimiento ' || count(*)::text || ' ' || COALESCE(sum("monto"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "pago_mensajero_movimiento" t`,
    `SELECT 'wallet_movimiento ' || count(*)::text || ' ' || COALESCE(sum("monto"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "wallet_movimiento" t`,
    `SELECT 'liquidacion_pago ' || count(*)::text || ' ' || COALESCE(sum("monto"), 0)::text || ' ' ||
            md5(COALESCE(string_agg(t::text, ';' ORDER BY t."id"), '')) AS l FROM "liquidacion_pago" t`,
  ];
  const salida: string[] = [];
  for (const c of consultas) salida.push(String((await db.query(c)).rows[0].l));
  return salida;
}

async function marcas(): Promise<Record<string, boolean>> {
  const { rows } = await db.query(`SELECT "id", "pago_independiente_efectivo" AS m FROM "cierre_dia"`);
  return Object.fromEntries(rows.map((r) => [String(r.id), r.m as boolean]));
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

/** La foto sin las filas (el caso del down marca un cierre a mano y las mueve). */
async function fotoSinFilas(): Promise<Foto> {
  const { filas: _filas, ...resto } = await foto(db);
  void _filas;
  return resto;
}

describeSiHayBase("SLT-123 R312 — pago_independiente_efectivo de ida y vuelta", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, M);

    // Una empresa con tres cierres de dinero real: uno aprobado con su libro de la 44 (P 3 000,
    // E 1 000 -> devengo 3 000, pago_efectivo 1 000), uno solicitado y uno rechazado.
    const organizacionId = randomUUID();
    await db.query(`INSERT INTO "organizacion" ("id","nombre","slug") VALUES ($1,'SLT123 ida y vuelta',$2)`, [
      organizacionId,
      `slt123-iv-${organizacionId.slice(0, 8)}`,
    ]);
    const rol = await db.query(`SELECT "id" FROM "rol" WHERE "value" = 'mensajero'`);
    const tipo = await db.query(`SELECT "id" FROM "tipo_identificacion" LIMIT 1`);
    expect(rol.rows, "falta el rol mensajero en la base propia").toHaveLength(1);
    expect(tipo.rows.length, "falta un tipo de identificacion en la base propia").toBeGreaterThan(0);
    const mensajeroId = randomUUID();
    await db.query(
      `INSERT INTO "usuario" ("id","nombre","email","telefono","password_hash","cedula","tipo_identificacion_id","rol_id","organizacion_id","updated_at")
       VALUES ($1,'Mensajero SLT123',$2,'88880000','x',$3,$4,$5,$6,now())`,
      [mensajeroId, `slt123-${mensajeroId.slice(0, 8)}@example.test`, `SLT123-${mensajeroId.slice(0, 8)}`, tipo.rows[0].id, rol.rows[0].id, organizacionId],
    );
    const zonaId = randomUUID();
    await db.query(
      `INSERT INTO "zona" ("id","nombre","sinpe_numero","sinpe_nombre","organizacion_id") VALUES ($1,'Zona SLT123','80000000','Titular',$2)`,
      [zonaId, organizacionId],
    );
    for (const estado of ["aprobado", "solicitado", "rechazado"] as const) {
      cierres[estado] = randomUUID();
      await db.query(
        `INSERT INTO "cierre_dia" ("id","mensajero_id","estado","destino_tipo","destino_zona_id","organizacion_id",
                                   "total_pago_mensajero","total_efectivo","total_general","updated_at")
         VALUES ($1,$2,$3,'bodega_central',$4,$5,3000.00,1000.00,1000.00,now())`,
        [cierres[estado], mensajeroId, estado, zonaId, organizacionId],
      );
    }
    for (const [tipoMov, categoria, monto] of [
      ["devengo", "pago_devengado", "3000.00"],
      ["pago", "pago_efectivo", "1000.00"],
    ] as const) {
      await db.query(
        `INSERT INTO "pago_mensajero_movimiento" ("id","mensajero_id","tipo","categoria","monto","origen_tipo","origen_id","organizacion_id")
         VALUES ($1,$2,$3,$4,$5,'cierre_dia',$6,$7)`,
        [randomUUID(), mensajeroId, tipoMov, categoria, monto, cierres.aprobado, organizacionId],
      );
    }

    antes = await fotoSinFilas();
    const filasAntes = (await foto(db)).filas;
    dineroAntes = await dinero();
    // Sin datos sembrados el test seria verde sin medir nada.
    expect(dineroAntes[0]).toMatch(/^cierre_dia 3 9000\.00 3000\.00 /);
    expect(dineroAntes[1]).toMatch(/^pago_mensajero_movimiento 2 4000\.00 /);

    await ejecutar(db, sqlDe(M, "migration.sql"), M);
    con = await fotoSinFilas();
    // Aditiva: ni una fila se movio (R312).
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

  it("R312: la columna nueva es NOT NULL DEFAULT false y es lo UNICO que cambia el esquema", () => {
    // Postgres >= 18 registra el NOT NULL como constraint propio (`contype = 'n'`); las versiones
    // anteriores no. Es la misma columna, asi que se admite esa linea y solo esa.
    const notNullPg18 =
      "sobra en constraints: cierre_dia | cierre_dia_pago_independiente_efectivo_not_null | n | NOT NULL pago_independiente_efectivo";
    expect(diferencias(con, antes).filter((l) => l !== notNullPg18)).toEqual([
      "sobra en columnas: cierre_dia.pago_independiente_efectivo | boolean | bool | NO | false",
    ]);
  });

  it("R312: subir no cambia ni un centimo: cuenta, Σ y md5 de cada tabla de dinero iguales", async () => {
    expect(await dinero()).toEqual(dineroAntes);
  });

  it("R312 / D5: todos los cierres quedan en `false`, tambien el aprobado (sin backfill)", async () => {
    expect(await marcas()).toEqual({
      [cierres.aprobado]: false,
      [cierres.solicitado]: false,
      [cierres.rechazado]: false,
    });
  });

  it("R312: con un cierre marcado, el down aborta con su RAISE y no cambia nada", async () => {
    await db.query(`UPDATE "cierre_dia" SET "pago_independiente_efectivo" = true WHERE "id" = $1`, [cierres.aprobado]);
    const dineroMarcado = await dinero();

    const error = await fallaDe(ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`));

    expect(error, "el down no aborto").toBeInstanceOf(ErrorDeScript);
    expect(error?.sqlstate).toBe("P0001");
    expect(error?.message).toContain("se aborta sin borrar nada");
    expect(diferencias(await fotoSinFilas(), con), "tras el down abortado").toEqual([]);
    expect(await dinero()).toEqual(dineroMarcado);
    expect((await marcas())[cierres.aprobado]).toBe(true);
  }, 120_000);

  it("R312: sin ningun cierre marcado, el down deja el esquema exactamente como antes", async () => {
    await db.query(`UPDATE "cierre_dia" SET "pago_independiente_efectivo" = false`);

    await ejecutar(db, sqlDe(M, "down.sql"), `${M}/down.sql`);

    expect(diferencias(await fotoSinFilas(), antes), "tras el down").toEqual([]);
    expect(await dinero()).toEqual(dineroAntes);
  }, 120_000);

  it("reaplicada, todo vuelve igual que la primera vez", async () => {
    await ejecutar(db, sqlDe(M, "migration.sql"), `${M}/migration.sql (otra vez)`);
    expect(diferencias(await fotoSinFilas(), con), "tras reaplicar").toEqual([]);
    expect(await dinero()).toEqual(dineroAntes);
  }, 120_000);
});
