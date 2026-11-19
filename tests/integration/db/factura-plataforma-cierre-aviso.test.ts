import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { FacturaPlataformaRepository, dedupeAvisoFactura } from "@/lib/repositories/FacturaPlataformaRepository";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { cero } from "./_fixtures/periodo-calendario";
import { revertida } from "./_fixtures/planes";

// SLT-136 · T5.3 (design §7.1; R21, R25) — el cierre de las facturas de la plataforma encola, en SU transacción,
// un trabajo `factura_plataforma_aviso` por factura cerrada, con la empresa de la factura y su `dedupe_key`.
// Cada caso corre en una transacción que se revierte; el reloj va por `p_ahora`, como en
// `factura-plataforma-cierre.test.ts`. Las horas son las de la plataforma (−06:00): `cero(D)` = 00:00 de D.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** La corrida de las 00:10 de la plataforma del día `fecha` (margen de cierre ya pasado). */
const corrida = (fecha: string) => new Date(new Date(cero(fecha)).getTime() + 10 * 60_000).toISOString();

interface TrabajoDeAviso {
  organizacion_id: string | null;
  dedupe_key: string | null;
  factura_id: string;
  estado: string;
}

async function avisosEncolados(tx: TxDeTest, organizacionId: string): Promise<TrabajoDeAviso[]> {
  return tx.$queryRawUnsafe<TrabajoDeAviso[]>(
    `SELECT "organizacion_id", "dedupe_key", "payload"->>'facturaId' AS factura_id, "estado"::text AS estado
       FROM "jobs" WHERE "tipo" = 'factura_plataforma_aviso' AND "organizacion_id" = $1 ORDER BY "dedupe_key"`,
    organizacionId,
  );
}

async function todosLosAvisos(tx: TxDeTest): Promise<number> {
  const [f] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "jobs" WHERE "tipo" = 'factura_plataforma_aviso'`,
  );
  return f.n;
}

async function cerradas(tx: TxDeTest, organizacionId: string): Promise<{ id: string; numero: number; total: string }[]> {
  return tx.$queryRawUnsafe(
    `SELECT "id", "numero", "total"::text AS total FROM "factura_plataforma"
      WHERE "organizacion_id" = $1 AND "estado" = 'cerrada' ORDER BY "numero"`,
    organizacionId,
  );
}

async function empresaDesde(tx: TxDeTest, alta: string): Promise<EmpresaPorcentual> {
  const e = await crearEmpresa(tx);
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "created_at" = $2::timestamp WHERE "id" = $1`, e.id, alta);
  return e;
}

async function empresaDelContexto(tx: TxDeTest): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ v: string | null }[]>(`SELECT current_setting('app.organizacion_id', true) AS v`);
  return f.v ?? "";
}

function cerrar(cliente: TxDeTest, organizacionId: string, ahora: string): Promise<number> {
  return new FacturaPlataformaRepository(cliente).cerrar(organizacionId, new Date(ahora));
}

describeSiHayBase("SLT-136 — el cierre encola el aviso de cada factura cerrada (outbox)", () => {
  let base: PrismaClient;
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R21, R25: un cierre de dos facturas pendientes deja dos trabajos con su empresa y su dedupe_key, aunque el total sea ₡0", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaDesde(tx, cero("2026-11-01"));
      const otra = await empresaDesde(tx, cero("2026-11-01"));
      await fijarEmpresa(tx, "");
      const n = await cerrar(tx, e.id, corrida("2026-12-01"));
      return {
        n,
        facturas: await cerradas(tx, e.id),
        avisos: await avisosEncolados(tx, e.id),
        deLaOtra: await avisosEncolados(tx, otra.id),
        contexto: await empresaDelContexto(tx),
      };
    });
    expect(r.n).toBe(2);
    // R25: sin plan ni órdenes, las dos facturas son de ₡0 y avisan igual.
    expect(r.facturas.map((f) => [f.numero, f.total])).toEqual([
      [1, "0.00"],
      [2, "0.00"],
    ]);
    const esperados = r.facturas
      .map((f) => ({ organizacion_id: expect.any(String), dedupe_key: dedupeAvisoFactura(f.id), factura_id: f.id, estado: "pending" }))
      .sort((a, b) => a.dedupe_key.localeCompare(b.dedupe_key));
    expect(r.avisos).toEqual(esperados);
    expect(r.avisos.every((a) => a.organizacion_id !== null)).toBe(true);
    expect(r.avisos.map((a) => a.dedupe_key)).toEqual(r.facturas.map((f) => `factura_plataforma_aviso:${f.id}`).sort());
    expect(r.deLaOtra).toEqual([]);
    // La empresa del contexto vuelve a la de antes (`encolarEnEmpresas`).
    expect(r.contexto).toBe("");
  });

  it("R21: repetir el cierre (mismo instante o más tarde) no añade trabajos; un cierre posterior solo encola la suya", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaDesde(tx, cero("2026-11-01"));
      const primera = await cerrar(tx, e.id, corrida("2026-11-16"));
      const trasPrimera = await avisosEncolados(tx, e.id);
      const otraVez = await cerrar(tx, e.id, corrida("2026-11-16"));
      const masTarde = await cerrar(tx, e.id, new Date(new Date(corrida("2026-11-16")).getTime() + 30 * 60_000).toISOString());
      const trasRepetir = await avisosEncolados(tx, e.id);
      const siguiente = await cerrar(tx, e.id, corrida("2026-12-01"));
      return { primera, trasPrimera, otraVez, masTarde, trasRepetir, siguiente, final: await avisosEncolados(tx, e.id), facturas: await cerradas(tx, e.id) };
    });
    expect([r.primera, r.otraVez, r.masTarde, r.siguiente]).toEqual([1, 0, 0, 1]);
    expect(r.trasPrimera).toHaveLength(1);
    expect(r.trasRepetir).toEqual(r.trasPrimera);
    expect(r.final).toHaveLength(2);
    expect(r.final.map((a) => a.factura_id).sort()).toEqual(r.facturas.map((f) => f.id).sort());
  });

  it("R21: un cierre que se deshace (su transacción aborta) no deja trabajos; su reintento deja uno por factura", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaDesde(tx, cero("2026-11-01"));
      const antes = await todosLosAvisos(tx);
      await tx.$executeRawUnsafe(`SAVEPOINT slt136_fallo`);
      const enElFallo = await cerrar(tx, e.id, corrida("2026-12-01"));
      const dentro = await avisosEncolados(tx, e.id);
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT slt136_fallo`);
      const trasFallo = { facturas: await cerradas(tx, e.id), avisos: await avisosEncolados(tx, e.id), total: await todosLosAvisos(tx) };
      const reintento = await cerrar(tx, e.id, corrida("2026-12-01"));
      return { antes, enElFallo, dentro, trasFallo, reintento, final: await avisosEncolados(tx, e.id) };
    });
    expect(r.enElFallo).toBe(2);
    expect(r.dentro).toHaveLength(2);
    expect(r.trasFallo).toEqual({ facturas: [], avisos: [], total: r.antes });
    expect(r.reintento).toBe(2);
    expect(r.final).toHaveLength(2);
  });

  it("R21: si el encolado falla, el cierre se pierde con él (misma transacción): ni facturas cerradas ni trabajos", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresaDesde(tx, cero("2026-11-01"));
      // Un cliente cuya `$transaction` corre sobre el `tx` del caso y cuyo INSERT en `jobs` falla.
      const conEncoladoRoto = new Proxy(tx as object, {
        get(objetivo, prop) {
          if (prop === "$transaction") {
            return async (fn: (t: unknown) => Promise<unknown>) => {
              await tx.$executeRawUnsafe(`SAVEPOINT slt136_tx`);
              try {
                const v = await fn(conEncoladoRoto);
                await tx.$executeRawUnsafe(`RELEASE SAVEPOINT slt136_tx`);
                return v;
              } catch (err) {
                await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT slt136_tx`);
                throw err;
              }
            };
          }
          if (prop === "$queryRaw") {
            return (q: TemplateStringsArray, ...v: unknown[]) => {
              if (q.join("?").includes(`INSERT INTO "jobs"`)) return Promise.reject(new Error("encolado roto"));
              return tx.$queryRaw(q, ...v);
            };
          }
          const valor = Reflect.get(objetivo, prop) as unknown;
          return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
        },
      }) as TxDeTest;
      let error = "NO FALLO";
      try {
        await cerrar(conEncoladoRoto, e.id, corrida("2026-12-01"));
      } catch (err) {
        error = (err as Error).message;
      }
      return { error, facturas: await cerradas(tx, e.id), avisos: await avisosEncolados(tx, e.id) };
    });
    expect(r.error).toBe("encolado roto");
    expect(r.facturas).toEqual([]);
    expect(r.avisos).toEqual([]);
  });
});
