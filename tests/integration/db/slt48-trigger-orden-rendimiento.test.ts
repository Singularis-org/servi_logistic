import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import {
  CREAR_TABLA_DE_CONTROL,
  aplicarMigracionesHasta,
  conectar,
  urlDe,
  type Conexion,
} from "./_fixtures/ida-y-vuelta-32";

// SLT-48 (T1.7; R10, decisión heredada de SLT-43) — lo que cuestan por fila los dos triggers de `orden`
// que SLT-48 reescribe: `orden_nodo_geografico` (R9) y `orden_geografia_del_pais_de_la_empresa` (R7),
// que ahora lee `nodo_geografico`.
//
// Mismo método que `geo-trigger-orden-rendimiento.test.ts` (SLT-43 R22): 5 000 órdenes con los dos
// triggers y 5 000 con los dos apagados, tres rondas tras un calentamiento descartado, alternando qué
// variante va primero; la mediana de (con − sin) / 5 000 debe ser ≤ 1 ms. Se mide en las dos formas de
// escribir una orden:
//   · «nodo»: la de la app desde SLT-48 (solo `nodo_geografico_id`, las 3 FK en NULL, R15);
//   · «fk»: SQL a mano y fixtures (las 3 FK sin nodo, R9).
// Con los triggers apagados, en «fk» el nodo queda NULL: así se comprueba que se apagaron de verdad.
//
// BASE PROPIA: apagar un trigger es DDL sobre `orden` (AccessExclusiveLock). Cada medida va en su
// transacción y se revierte. Las cifras salen por stdout (líneas `[SLT-48 R10]`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const FILAS = 5_000;
const RONDAS = 3;
const TOPE_MS_POR_FILA = 1;
const TRIGGERS = ["orden_nodo_geografico", "orden_geografia_del_pais_de_la_empresa"] as const;

/** Prefijo `slt48_`: si un fallo deja la base viva, se reconoce de quién es. */
const BASE = `slt48_r10_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const TODAS = "99999999";

type Forma = "nodo" | "fk";

let admin: Conexion;
let db: Conexion;
let fks: { organizacionId: string; tiendaId: string; zonaId: string; estatusId: string };

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

async function unaFila<T>(sql: string, valores: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, valores);
  if (rows.length !== 1) throw new Error(`se esperaba una fila: ${sql}`);
  return rows[0] as T;
}

/** Una empresa de CR con la tienda y la zona que exige `orden`, commiteadas en la base propia. */
async function sembrar(): Promise<typeof fks> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const organizacionId = randomUUID();
  await db.query(`INSERT INTO organizacion (id, nombre, slug) VALUES ($1, $2, $3)`, [
    organizacionId,
    `Empresa R10 ${sufijo}`,
    `r10-${sufijo}`,
  ]);
  const tiendaId = randomUUID();
  await db.query(
    `INSERT INTO usuario (id, nombre, email, telefono, password_hash, cedula, tipo_identificacion_id,
         rol_id, estado, updated_at, organizacion_id)
       SELECT $1, 'Tienda R10', $2, '88880000', 'x', $3, t.id, r.id, 'activo', now(), $4
         FROM tipo_identificacion t, rol r
        WHERE t.value = 'cedula' AND r.value = 'Admin Tienda'`,
    [tiendaId, `tienda-r10-${sufijo}@example.com`, `r10-${sufijo}`, organizacionId],
  );
  const zonaId = randomUUID();
  await db.query(
    `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre, organizacion_id)
       VALUES ($1, $2, '80000000', 'Titular de Prueba', $3)`,
    [zonaId, `Zona R10 ${sufijo}`, organizacionId],
  );
  const { id: estatusId } = await unaFila<{ id: string }>(`SELECT id FROM order_status WHERE value = 'en_preparacion'`);
  return { organizacionId, tiendaId, zonaId, estatusId };
}

/**
 * Inserta `FILAS` órdenes en un solo `INSERT … SELECT`, repartidas por todos los distritos de CR, en la
 * forma pedida. Devuelve los ms del `INSERT` y cuántas quedaron con nodo. Todo se revierte.
 */
async function medir(forma: Forma, conTriggers: boolean, etiqueta: string): Promise<{ ms: number; conNodo: number }> {
  const columnas = forma === "nodo" ? "NULL, NULL, NULL, geo.distrito_id" : "geo.provincia_id, geo.canton_id, geo.distrito_id, NULL";
  await db.query("BEGIN");
  try {
    await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [fks.organizacionId]);
    if (!conTriggers) {
      for (const t of TRIGGERS) await db.query(`ALTER TABLE orden DISABLE TRIGGER ${t}`);
    }
    const inicio = performance.now();
    await db.query(
      `WITH geo AS (
         SELECT n.id AS distrito_id, n.padre_id AS canton_id, c.padre_id AS provincia_id,
                row_number() OVER (ORDER BY n.id) - 1 AS n, count(*) OVER () AS total
           FROM nodo_geografico n JOIN nodo_geografico c ON c.id = n.padre_id
          WHERE n.pais_id = 'CR' AND n.profundidad = 3)
       INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
           provincia_id, canton_id, distrito_id, nodo_geografico_id, producto, updated_at, organizacion_id)
       SELECT gen_random_uuid()::text, $1 || '-' || g, $2, 'Destinatario R10', '88880000', $3, $4,
              ${columnas}, 'caja', now(), $5
         FROM generate_series(1, $6::int) g
         JOIN geo ON geo.n = g % geo.total`,
      [`R10-${etiqueta}`, fks.estatusId, fks.tiendaId, fks.zonaId, fks.organizacionId, FILAS],
    );
    const ms = performance.now() - inicio;
    const { n } = await unaFila<{ n: number }>(
      `SELECT count(*)::int AS n FROM orden WHERE num_remision LIKE $1 AND nodo_geografico_id IS NOT NULL`,
      [`R10-${etiqueta}-%`],
    );
    return { ms, conNodo: Number(n) };
  } finally {
    await db.query("ROLLBACK");
  }
}

async function rondasDe(forma: Forma): Promise<{ con: number; sin: number; porFila: number }[]> {
  await medir(forma, true, `${forma}-calentamiento-con`);
  await medir(forma, false, `${forma}-calentamiento-sin`);
  const rondas: { con: number; sin: number; porFila: number }[] = [];
  for (let r = 0; r < RONDAS; r++) {
    const primeroCon = r % 2 === 0;
    const a = await medir(forma, primeroCon, `${forma}-r${r}-a`);
    const b = await medir(forma, !primeroCon, `${forma}-r${r}-b`);
    const con = primeroCon ? a : b;
    const sin = primeroCon ? b : a;
    expect(con.conNodo, `${forma} ronda ${r}: sin nodo con los triggers puestos`).toBe(FILAS);
    // En «fk» solo el trigger pone el nodo: si quedara alguno, el trigger no se apagó.
    expect(sin.conNodo, `${forma} ronda ${r}`).toBe(forma === "nodo" ? FILAS : 0);
    rondas.push({ con: con.ms, sin: sin.ms, porFila: (con.ms - sin.ms) / FILAS });
  }
  return rondas;
}

describeSiHayBase("SLT-48 R10 — coste por fila de los triggers de orden sobre el árbol", () => {
  beforeAll(async () => {
    admin = await conectar(urlDe("postgres"));
    await admin.query(`CREATE DATABASE "${BASE}"`);
    db = await conectar(urlDe(BASE));
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, TODAS);
    fks = await sembrar();
  }, 600_000);

  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);

  it(`R10: mediana de (con − sin) / ${FILAS} filas en ${RONDAS} rondas ≤ ${TOPE_MS_POR_FILA} ms, con solo nodo y con FK`, async () => {
    const porForma: Record<Forma, { con: number; sin: number; porFila: number }[]> = {
      nodo: await rondasDe("nodo"),
      fk: await rondasDe("fk"),
    };
    const { version } = await unaFila<{ version: string }>(`SELECT version()`);
    const lineas = [`[SLT-48 R10] ${version}`, `[SLT-48 R10] ${FILAS} filas × ${RONDAS} rondas por forma (INSERT … SELECT)`];
    const medianas: Record<Forma, number> = { nodo: 0, fk: 0 };
    for (const forma of ["nodo", "fk"] as const) {
      porForma[forma].forEach((r, i) =>
        lineas.push(
          `[SLT-48 R10] ${forma} ronda ${i + 1}: con ${r.con.toFixed(1)} ms, sin ${r.sin.toFixed(1)} ms, ` +
            `(con − sin) / filas = ${r.porFila.toFixed(5)} ms`,
        ),
      );
      medianas[forma] = mediana(porForma[forma].map((r) => r.porFila));
      lineas.push(`[SLT-48 R10] ${forma}: mediana por fila = ${medianas[forma].toFixed(5)} ms (tope ${TOPE_MS_POR_FILA} ms)`);
    }
    // `process.stdout.write`: el `console.log` de un test verde no sale en el reporter por defecto.
    process.stdout.write(`${lineas.join("\n")}\n`);
    expect(medianas.nodo).toBeLessThanOrEqual(TOPE_MS_POR_FILA);
    expect(medianas.fk).toBeLessThanOrEqual(TOPE_MS_POR_FILA);
  }, 600_000);
});
