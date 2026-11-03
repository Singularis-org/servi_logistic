import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { RechazoTiendaCobroRepository } from "@/lib/repositories/RechazoTiendaCobroRepository";

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
  sentenciasDe,
  sqlDe,
  urlDe,
  type Conexion,
  type Foto,
} from "./_fixtures/ida-y-vuelta-32";

/**
 * SLT-52 / T4.6 (design §12.2, R48-R50) — la traza del `tarifa_valor` en `rechazo_tienda_cobro`,
 * contra Postgres REAL.
 *
 * BASE PROPIA (`slt52_rtc_<rand>`), como T1.6: asi el «antes del up» es de verdad el esquema
 * anterior leido de `db/migrations`, con cobros historicos sembrados ANTES de que exista la columna,
 * y el `down` se puede ejercer sin tocar la base compartida.
 *
 * 1. Se aplican las migraciones anteriores a T4.6 y se siembran, con SQL a mano, dos empresas y
 *    tres cobros historicos (uno con `tarifa_id`, dos sin ella).
 * 2. Se aplican las dos de T4.6 sentencia a sentencia, como `migrate deploy`.
 * 3. Cada caso escribe en una transaccion que SIEMPRE se revierte y afirma primero lo que sembro.
 *    El del `down` tambien: el DDL de Postgres es transaccional, asi que el down se ejecuta, se
 *    compara la foto y se revierte.
 * 4. Un caso pasa por `RechazoTiendaCobroRepository.crearPendiente` con un cliente Prisma de la base
 *    propia: un test de service con dobles no ve el INSERT real (lo que escribe o deja de escribir).
 */

const COLUMNA = "20261103140000_rechazo_tienda_cobro_tarifa_valor";
const MISMA_EMPRESA = "20261103140100_rechazo_tienda_cobro_tarifa_valor_misma_empresa";
const DE_T46 = [COLUMNA, MISMA_EMPRESA] as const;
/** La ultima migracion de T1 (SLT-52), sobre la que van estas dos. */
const ULTIMA_PREVIA = "20261103120300_historial_tarifas_flexibles";

const BASE = `slt52_rtc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

describe("SLT-52 T4.6 — las migraciones de la traza del valor en el cobro, en disco", () => {
  it("las dos existen, traen down.sql y van detras de las de T1", () => {
    const carpetas = carpetasDeMigracion();
    expect(carpetas).toContain(ULTIMA_PREVIA);
    for (const m of DE_T46) {
      expect(carpetas).toContain(m);
      expect(m > ULTIMA_PREVIA).toBe(true);
      expect(existsSync(path.join(MIGRACIONES, m, "down.sql")), `${m} sin down.sql`).toBe(true);
    }
  });

  it("R44/R50: ninguna escribe filas (sin backfill: solo esquema)", () => {
    const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");
    for (const m of DE_T46) {
      expect(sinComentarios(sqlDe(m, "migration.sql")), m).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM)\b/i);
    }
  });
});

// ── La base propia ──────────────────────────────────────────────────────────────────────────────

type Resultado = { ok: true } | { ok: false; code: string | undefined; constraint: string | undefined };

interface Empresa {
  id: string;
  zonaId: string;
  tiendaId: string;
  mensajeroId: string;
  tarifaId: string;
}

interface Catalogo {
  rolTienda: string;
  rolMensajero: string;
  cedula: string;
  estatus: string;
  provinciaId: string;
  cantonId: string;
  distritoId: string;
}

/** Una consulta parametrizada: la usan igual el cliente `pg` del test y el `tx` de Prisma. */
type Q = (sql: string, params: unknown[]) => Promise<unknown>;

interface ClienteFijo {
  query(texto: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(): void;
}

let admin: Conexion;
let pool: Conexion;
/**
 * Un cliente FIJO del pool: `pool.query` devuelve la conexion con el error cuando una sentencia
 * falla y pg-pool la destruye, con lo que la transaccion del caso se perderia (medido en T1.6).
 */
let db: Conexion;
let prisma: PrismaClient;
let cat: Catalogo;
let a: Empresa;
let b: Empresa;
let antes: Foto;
let triggersAntes: string[];
/** Los cobros historicos, fila entera en JSON, ANTES del up. */
let cobrosAntes: Record<string, unknown>[];

async function uno<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (rows.length !== 1) throw new Error(`se esperaba UNA fila de «${sql.slice(0, 80)}» y llegaron ${rows.length}`);
  return Object.values(rows[0])[0] as T;
}

const qDb: Q = (sql, params) => db.query(sql, params);

/** Corre `fn` en una transaccion que SIEMPRE se revierte: ningun caso deja filas ni DDL. */
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

async function triggersDelCobro(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = 'rechazo_tienda_cobro'::regclass AND NOT tgisinternal ORDER BY tgname`,
  );
  return rows.map((r) => String(r.tgname));
}

async function cobrosHistoricos(): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query(
    `SELECT to_jsonb(c) - 'tarifa_valor_id' AS fila FROM "rechazo_tienda_cobro" c ORDER BY "id"`,
  );
  return rows.map((r) => r.fila as Record<string, unknown>);
}

async function catalogo(): Promise<Catalogo> {
  const canton = await db.query(
    `SELECT c."id", c."provincia_id" FROM "canton" c JOIN "provincia" p ON p."id" = c."provincia_id"
      WHERE c."nombre" = 'Cartago' AND p."nombre" = 'Cartago'`,
  );
  if (canton.rows.length !== 1) throw new Error("falta la geografia Cartago/Cartago en la base migrada");
  const cantonId = String(canton.rows[0].id);
  return {
    rolTienda: String(await uno(`SELECT "id" FROM "rol" WHERE "value" = 'Admin Tienda'`)),
    rolMensajero: String(await uno(`SELECT "id" FROM "rol" WHERE "value" = 'mensajero'`)),
    cedula: String(await uno(`SELECT "id" FROM "tipo_identificacion" WHERE "value" = 'cedula'`)),
    estatus: String(await uno(`SELECT "id" FROM "order_status" WHERE "value" = 'en_preparacion'`)),
    provinciaId: String(canton.rows[0].provincia_id),
    cantonId,
    distritoId: String(await uno(`SELECT "id" FROM "distrito" WHERE "canton_id" = $1 ORDER BY "id" LIMIT 1`, [cantonId])),
  };
}

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const id = randomUUID();
  const sufijo = id.slice(0, 8);
  await db.query(`INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`, [
    id,
    `SLT52 RTC ${etiqueta} ${sufijo}`,
    `slt52-rtc-${etiqueta.toLowerCase()}-${sufijo}`,
  ]);
  const zonaId = randomUUID();
  await db.query(
    `INSERT INTO "zona" ("id", "organizacion_id", "nombre", "sinpe_numero", "sinpe_nombre") VALUES ($1, $2, $3, '80000000', 'Titular de Prueba')`,
    [zonaId, id, `Zona ${etiqueta} ${sufijo}`],
  );
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
  const tarifaId = randomUUID();
  await db.query(
    `INSERT INTO "tarifas" ("id", "organizacion_id", "valor_flete", "valor_flete_devuelto", "valor_flete_gam",
       "valor_flete_devuelto_gam", "comision_cod", "iva_flete", "iva_comision_cod", "zona_id", "updated_at")
     VALUES ($1, $2, 2500, 1200, 2000, 1000, 3, 13, 13, $3, now())`,
    [tarifaId, id, zonaId],
  );
  return { id, zonaId, tiendaId, mensajeroId, tarifaId };
}

/** Una orden con su gestion: el cobro es UNO por gestion (`rechazo_tienda_cobro_gestion_uq`). */
async function ordenYGestion(q: Q, e: Empresa): Promise<{ ordenId: string; gestionId: string }> {
  const ordenId = randomUUID();
  await q(
    `INSERT INTO "orden" ("id", "organizacion_id", "num_remision", "estatus_id", "destinatario", "telefono_dest",
       "tienda_id", "zona_id", "provincia_id", "canton_id", "distrito_id", "producto", "updated_at")
     VALUES ($1, $2, $3, $4, 'Destinataria SLT-52', '88880000', $5, $6, $7, $8, $9, 'Caja', now())`,
    [ordenId, e.id, `R-${ordenId.slice(0, 8)}`, cat.estatus, e.tiendaId, e.zonaId, cat.provinciaId, cat.cantonId, cat.distritoId],
  );
  const gestionId = randomUUID();
  await q(
    `INSERT INTO "gestion_orden" ("id", "organizacion_id", "orden_id", "mensajero_id", "resultado")
     VALUES ($1, $2, $3, $4, 'devolucion_a_origen_por_rechazo')`,
    [gestionId, e.id, ordenId, e.mensajeroId],
  );
  return { ordenId, gestionId };
}

const SQL_COBRO = `INSERT INTO "rechazo_tienda_cobro"
  ("id", "organizacion_id", "gestion_id", "orden_id", "tienda_id", "monto_flete", "monto_iva", "tarifa_id", "generado_el")
  VALUES ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, DATE '2026-10-30')`;

const SQL_COBRO_CON_VALOR = `INSERT INTO "rechazo_tienda_cobro"
  ("id", "organizacion_id", "gestion_id", "orden_id", "tienda_id", "monto_flete", "monto_iva", "tarifa_id",
   "tarifa_valor_id", "generado_el")
  VALUES ($1, $2, $3, $4, $5, 500.00, 65.00, $6, $7, DATE '2026-11-03')`;

/** Un `tarifa_valor` del flete por rechazo a la tienda, a nivel zona. */
async function valorFleteRechazo(q: Q, e: Empresa): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO "tarifa_valor" ("id", "organizacion_id", "concepto", "modo", "valor", "iva_pct", "zona_id")
     VALUES ($1, $2, 'tienda_flete_rechazo'::"tarifa_concepto", 'monto'::"tarifa_modo", 500.00, 13.00, $3)`,
    [id, e.id, e.zonaId],
  );
  return id;
}

async function contarCobros(): Promise<number> {
  return Number(await uno(`SELECT count(*)::int AS n FROM "rechazo_tienda_cobro"`));
}

describe.skipIf(!HAY_BASE_DE_DATOS)("SLT-52 T4.6 — la traza del valor en el cobro por rechazo (Postgres real, base propia)", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    pool = await conectar(urlDe(BASE));
    const cliente = await (pool as unknown as { connect(): Promise<ClienteFijo> }).connect();
    db = { query: (t, v) => cliente.query(t, v), end: async () => cliente.release() };
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, COLUMNA);

    cat = await catalogo();
    a = await sembrarEmpresa("A");
    b = await sembrarEmpresa("B");
    // Los cobros historicos, ANTES de que exista la columna: los dos modelos de cobro que hoy hay
    // en la base (con fila de `tarifas` y sin ella).
    const historicos: [Empresa, string, string, string | null][] = [
      [a, "1200.00", "156.00", a.tarifaId],
      [a, "1000.00", "0.00", null],
      [b, "1200.00", "156.00", b.tarifaId],
    ];
    for (const [e, flete, iva, tarifaId] of historicos) {
      const { ordenId, gestionId } = await ordenYGestion(qDb, e);
      await db.query(SQL_COBRO, [randomUUID(), e.id, gestionId, ordenId, e.tiendaId, flete, iva, tarifaId]);
    }

    antes = await foto(db);
    triggersAntes = await triggersDelCobro();
    cobrosAntes = await cobrosHistoricos();
    for (const m of DE_T46) await ejecutar(db, sqlDe(m, "migration.sql"), `${m} (up)`);

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlDe(BASE), max: 1 }),
      omit: PRISMA_OMIT,
    }) as unknown as PrismaClient;
  }, 600_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.end();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it("R50/R44: el up no mueve ningun cobro: mismo conteo, mismas columnas y la referencia nueva en NULL", async () => {
    // Lo sembrado: tres cobros historicos, uno con `tarifa_id`.
    expect(cobrosAntes).toHaveLength(3);
    expect(cobrosAntes.filter((c) => c.tarifa_id !== null)).toHaveLength(2);

    expect(await contarCobros()).toBe(3);
    expect(await cobrosHistoricos()).toEqual(cobrosAntes);
    expect(Number(await uno(`SELECT count(*)::int FROM "rechazo_tienda_cobro" WHERE "tarifa_valor_id" IS NOT NULL`))).toBe(0);
  });

  it("R49: un cobro con `tarifa_id` y `tarifa_valor_id` a la vez lo rechaza el CHECK", async () => {
    await enTxRevertida(async () => {
      const valorId = await valorFleteRechazo(qDb, a);
      const { ordenId, gestionId } = await ordenYGestion(qDb, a);
      expect(await uno(`SELECT "organizacion_id" FROM "tarifa_valor" WHERE "id" = $1`, [valorId])).toBe(a.id);
      expect(await uno(`SELECT count(*)::int FROM "tarifas" WHERE "id" = $1`, [a.tarifaId])).toBe(1);

      const r = await intento(SQL_COBRO_CON_VALOR, [randomUUID(), a.id, gestionId, ordenId, a.tiendaId, a.tarifaId, valorId]);
      expect(r).toEqual({ ok: false, code: "23514", constraint: "rechazo_tienda_cobro_una_tarifa" });

      // Contraste: con UNA sola referencia, la misma fila entra.
      expect(await intento(SQL_COBRO_CON_VALOR, [randomUUID(), a.id, gestionId, ordenId, a.tiendaId, null, valorId])).toEqual({
        ok: true,
      });
    });
  });

  it("R50: borrar el valor citado deja el cobro, su referencia en NULL y los importes intactos", async () => {
    await enTxRevertida(async () => {
      const valorId = await valorFleteRechazo(qDb, a);
      const { ordenId, gestionId } = await ordenYGestion(qDb, a);
      const cobroId = randomUUID();
      await db.query(SQL_COBRO_CON_VALOR, [cobroId, a.id, gestionId, ordenId, a.tiendaId, null, valorId]);
      const sembrado = await db.query(`SELECT to_jsonb(c) AS fila FROM "rechazo_tienda_cobro" c WHERE "id" = $1`, [cobroId]);
      const filaAntes = sembrado.rows[0].fila as Record<string, unknown>;
      expect(filaAntes.tarifa_valor_id).toBe(valorId);
      expect(filaAntes.monto_flete).toBe(500);
      expect(filaAntes.monto_iva).toBe(65);

      expect(await intento(`DELETE FROM "tarifa_valor" WHERE "id" = $1`, [valorId])).toEqual({ ok: true });

      expect(await uno(`SELECT count(*)::int FROM "tarifa_valor" WHERE "id" = $1`, [valorId])).toBe(0);
      const despues = await db.query(`SELECT to_jsonb(c) AS fila FROM "rechazo_tienda_cobro" c WHERE "id" = $1`, [cobroId]);
      expect(despues.rows).toHaveLength(1);
      // Todo igual salvo la referencia: ni importes, ni estado, ni fechas.
      expect(despues.rows[0].fila).toEqual({ ...filaAntes, tarifa_valor_id: null });
    });
  });

  it("multi-empresa: un cobro de A que cita un valor de B lo rechaza el trigger de misma empresa", async () => {
    await enTxRevertida(async () => {
      const valorDeB = await valorFleteRechazo(qDb, b);
      const { ordenId, gestionId } = await ordenYGestion(qDb, a);
      expect(await uno(`SELECT "organizacion_id" FROM "tarifa_valor" WHERE "id" = $1`, [valorDeB])).toBe(b.id);

      const r = await intento(SQL_COBRO_CON_VALOR, [randomUUID(), a.id, gestionId, ordenId, a.tiendaId, null, valorDeB]);
      expect(r).toMatchObject({ ok: false, code: "SL017" });
    });
  });

  it("R48: `RechazoTiendaCobroRepository.crearPendiente` escribe `tarifa_valor_id` en la fila real", async () => {
    const ROLLBACK = new Error("rollback del caso");
    let leido: { tarifa_valor_id: string | null; tarifa_id: string | null; monto_flete: string }[] = [];
    let valorId = "";
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SELECT set_config('app.organizacion_id', $1, true)`, a.id);
        const q: Q = (sql, params) => tx.$executeRawUnsafe(sql, ...params);
        valorId = await valorFleteRechazo(q, a);
        const { ordenId, gestionId } = await ordenYGestion(q, a);

        const insertadas = await new RechazoTiendaCobroRepository(tx).crearPendiente(tx, {
          gestionId,
          ordenId,
          tiendaId: a.tiendaId,
          montoFlete: "500.00",
          montoIva: "65.00",
          tarifaId: null,
          tarifaValorId: valorId,
          generadoEl: "2026-11-03",
        });
        expect(insertadas).toBe(1);
        leido = await tx.$queryRawUnsafe(
          `SELECT "tarifa_valor_id", "tarifa_id", "monto_flete"::text FROM "rechazo_tienda_cobro" WHERE "gestion_id" = $1`,
          gestionId,
        );
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

    expect(valorId).not.toBe("");
    expect(leido).toEqual([{ tarifa_valor_id: valorId, tarifa_id: null, monto_flete: "500.00" }]);
    // Y la transaccion revirtio: la base propia sigue con sus tres cobros historicos.
    expect(await contarCobros()).toBe(3);
  });

  it("down: las dos bajan y dejan esquema, triggers y filas como estaban antes del up", async () => {
    // Lo de antes del up es distinto de lo de ahora: si no, comparar no probaria nada.
    expect(diferencias(await foto(db), antes)).not.toEqual([]);
    expect(await triggersDelCobro()).not.toEqual(triggersAntes);

    await enTxRevertida(async () => {
      for (const m of [...DE_T46].reverse()) {
        // El down generado trae su propio BEGIN/COMMIT: se quitan para que corra DENTRO de la
        // transaccion del caso y el ROLLBACK final deje la base propia con las dos subidas.
        for (const sentencia of sentenciasDe(sqlDe(m, "down.sql"))) {
          if (/^\s*(BEGIN|COMMIT)\s*;?\s*$/i.test(sentencia)) continue;
          await db.query(sentencia);
        }
      }
      expect(diferencias(await foto(db), antes)).toEqual([]);
      expect(await triggersDelCobro()).toEqual(triggersAntes);
      expect(await cobrosHistoricos()).toEqual(cobrosAntes);
    });

    // El ROLLBACK devolvio la columna: el down no se escapo de la transaccion.
    expect(Number(await uno(`SELECT count(*)::int FROM information_schema.columns
      WHERE table_name = 'rechazo_tienda_cobro' AND column_name = 'tarifa_valor_id'`))).toBe(1);
  });
});
