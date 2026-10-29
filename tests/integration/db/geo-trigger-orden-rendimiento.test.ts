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

// SLT-43 (T4.3; R22, design §2.4 y §7) — lo que cuesta por fila el trigger `orden_nodo_geografico`.
//
// Método del design: 5 000 órdenes con el trigger y 5 000 con el trigger apagado, tres rondas; la
// mediana de (con − sin) / 5 000 debe ser ≤ 1 ms. Con el trigger apagado `nodo_geografico_id` queda
// NULL y la FK nueva no se comprueba, así que la diferencia mide las dos cosas que añade SLT-43 a cada
// `INSERT`: la asignación del trigger y el acceso por índice a la PK de `nodo_geografico`.
//
// BASE PROPIA, como los tests de ida y vuelta: apagar un trigger es DDL sobre `orden` y toma un
// AccessExclusiveLock que, en la base compartida, bloquearía (o mediría) a los demás archivos. Aquí
// cada medida va en su transacción y se revierte: el `DISABLE TRIGGER` y las 5 000 filas se van con ella.
//
// Antes de las rondas medidas hay una de calentamiento que se descarta (caché de planes y de páginas),
// y dentro de cada ronda se alterna qué variante va primero para no regalarle la caché a una sola.
// Las cifras quedan en el log para `progress/impl_SLT-43.md`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const FILAS = 5_000;
const RONDAS = 3;
const TOPE_MS_POR_FILA = 1;

/** Prefijo `slt43_`: si un fallo deja la base viva, se reconoce de quién es. */
const BASE = `slt43_r22_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** Ordena después de cualquier carpeta de `db/migrations`: aplica todas. */
const TODAS = "99999999";

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
    `Empresa R22 ${sufijo}`,
    `r22-${sufijo}`,
  ]);
  const tiendaId = randomUUID();
  await db.query(
    `INSERT INTO usuario (id, nombre, email, telefono, password_hash, cedula, tipo_identificacion_id,
         rol_id, estado, updated_at, organizacion_id)
       SELECT $1, 'Tienda R22', $2, '88880000', 'x', $3, t.id, r.id, 'activo', now(), $4
         FROM tipo_identificacion t, rol r
        WHERE t.value = 'cedula' AND r.value = 'Admin Tienda'`,
    [tiendaId, `tienda-r22-${sufijo}@example.com`, `r22-${sufijo}`, organizacionId],
  );
  const zonaId = randomUUID();
  await db.query(
    `INSERT INTO zona (id, nombre, sinpe_numero, sinpe_nombre, organizacion_id)
       VALUES ($1, $2, '80000000', 'Titular de Prueba', $3)`,
    [zonaId, `Zona R22 ${sufijo}`, organizacionId],
  );
  const { id: estatusId } = await unaFila<{ id: string }>(`SELECT id FROM order_status WHERE value = 'en_preparacion'`);
  return { organizacionId, tiendaId, zonaId, estatusId };
}

/**
 * Inserta `FILAS` órdenes en un solo `INSERT … SELECT`, repartidas por todos los distritos del país
 * (cada una con su distrito, su cantón y su provincia), y devuelve los ms del `INSERT` y cuántas
 * quedaron con nodo. Todo se revierte.
 */
async function medir(conTrigger: boolean, etiqueta: string): Promise<{ ms: number; conNodo: number }> {
  await db.query("BEGIN");
  try {
    await db.query(`SELECT set_config('app.organizacion_id', $1, true)`, [fks.organizacionId]);
    if (!conTrigger) await db.query(`ALTER TABLE orden DISABLE TRIGGER orden_nodo_geografico`);
    const inicio = performance.now();
    await db.query(
      `WITH geo AS (
         SELECT d.id AS distrito_id, d.canton_id, c.provincia_id,
                row_number() OVER (ORDER BY d.id) - 1 AS n, count(*) OVER () AS total
           FROM distrito d JOIN canton c ON c.id = d.canton_id
          WHERE d.pais_id = 'CR')
       INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
           provincia_id, canton_id, distrito_id, producto, updated_at, organizacion_id)
       SELECT gen_random_uuid()::text, $1 || '-' || g, $2, 'Destinatario R22', '88880000', $3, $4,
              geo.provincia_id, geo.canton_id, geo.distrito_id, 'caja', now(), $5
         FROM generate_series(1, $6::int) g
         JOIN geo ON geo.n = g % geo.total`,
      [`R22-${etiqueta}`, fks.estatusId, fks.tiendaId, fks.zonaId, fks.organizacionId, FILAS],
    );
    const ms = performance.now() - inicio;
    const { n } = await unaFila<{ n: number }>(
      `SELECT count(*)::int AS n FROM orden WHERE num_remision LIKE $1 AND nodo_geografico_id IS NOT NULL`,
      [`R22-${etiqueta}-%`],
    );
    return { ms, conNodo: Number(n) };
  } finally {
    await db.query("ROLLBACK");
  }
}

describeSiHayBase("SLT-43 R22 — coste por fila del trigger orden_nodo_geografico", () => {
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

  it(`R22: mediana de (con − sin) / ${FILAS} filas en ${RONDAS} rondas ≤ ${TOPE_MS_POR_FILA} ms`, async () => {
    await medir(true, "calentamiento-con");
    await medir(false, "calentamiento-sin");

    const rondas: { con: number; sin: number; porFila: number }[] = [];
    for (let r = 0; r < RONDAS; r++) {
      const primeroCon = r % 2 === 0;
      const a = await medir(primeroCon, `r${r}-a`);
      const b = await medir(!primeroCon, `r${r}-b`);
      const con = primeroCon ? a : b;
      const sin = primeroCon ? b : a;
      // Sin esto la ronda sería verde con un trigger que no corre o que no se apaga.
      expect(con.conNodo, `ronda ${r}: el trigger no puso nodo`).toBe(FILAS);
      expect(sin.conNodo, `ronda ${r}: el trigger no se apagó`).toBe(0);
      rondas.push({ con: con.ms, sin: sin.ms, porFila: (con.ms - sin.ms) / FILAS });
    }

    const porFila = mediana(rondas.map((r) => r.porFila));
    const { version } = await unaFila<{ version: string }>(`SELECT version()`);
    console.log(
      `[SLT-43 R22] ${version}\n` +
        `[SLT-43 R22] ${FILAS} filas × ${RONDAS} rondas (INSERT … SELECT, 1 calentamiento descartado)\n` +
        rondas
          .map(
            (r, i) =>
              `[SLT-43 R22] ronda ${i + 1}: con ${r.con.toFixed(1)} ms, sin ${r.sin.toFixed(1)} ms, ` +
              `(con − sin) / filas = ${r.porFila.toFixed(5)} ms`,
          )
          .join("\n") +
        `\n[SLT-43 R22] mediana por fila = ${porFila.toFixed(5)} ms (tope ${TOPE_MS_POR_FILA} ms)`,
    );
    expect(porFila).toBeLessThanOrEqual(TOPE_MS_POR_FILA);
  }, 600_000);
});
