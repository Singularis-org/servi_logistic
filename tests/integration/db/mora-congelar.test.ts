import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import {
  GRACIA_GLOBAL,
  aLas,
  cero,
  congelar,
  empresa,
  estadoDe,
  facturaCerrada,
  fijarGracia,
} from "./_fixtures/mora-121";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { revertida } from "./_fixtures/planes";

// SLT-121 · T1.4 (design §2.2-§2.4, §4.3; R7, R8, R9, R18, R21, R23, R34) — congelar y descongelar en la base, con
// las funciones del dueño. Cada caso en una transacción que se revierte.
//
// La empresa de casi todos los casos tiene una factura cerrada de 1000 con `hasta` = 16 nov a las 00:00 de la
// plataforma. Con la gracia global de 7 días paga hasta el 23 y está vencida desde las 00:00 del 24 (R1, R6).
//
//   · R7, R8: congela en la madrugada (00:00-05:59 de la plataforma), no a las 06:00 ni a las 14:00;
//   · R9: repetir la corrida no cambia nada (`ya_congelada`);
//   · R23: con un descongelamiento a mano vigente no congela; al día siguiente de su fecha hasta, sí;
//   · R18: de dos empresas, solo congela la que debe;
//   · R21: anular un pago confirmado no congela en el acto; la madrugada siguiente sí;
//   · R34 (la pieza SQL): `organizacion_mora_descongelar_si_pagada` descongela solo sin vencidas y nunca congela.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const HASTA = cero("2026-11-16");
const MADRUGADA = aLas("2026-11-24", "00:30");

/** Una empresa con la factura vencida del 16 nov (1000). Devuelve la empresa y la factura. */
async function empresaVencida(tx: TxDeTest, total = "1000.00"): Promise<{ org: string; factura: string }> {
  const org = await empresa(tx);
  const factura = await facturaCerrada(tx, org, { numero: 1, hasta: HASTA, total });
  return { org, factura };
}

/** Un maestro de la empresa: quien registra y anula los pagos de los casos. */
async function maestroDe(tx: TxDeTest, org: string): Promise<string> {
  await fijarEmpresa(tx, org);
  const { id } = await crearUsuarioDePrueba(tx, "maestro");
  await fijarEmpresa(tx, "");
  return id;
}

async function pagarPorFuera(tx: TxDeTest, org: string, por: string, facturaId: string, monto: string): Promise<string> {
  const pagoId = randomUUID();
  const [{ r }] = await tx.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pago_plataforma_registrar_por_fuera($1, $2, $3::numeric, NULL, 'Transferencia SLT121', NULL, $4::jsonb, $5,
                                               (now() AT TIME ZONE 'UTC')::timestamp, NULL, NULL) AS r`,
    org,
    pagoId,
    monto,
    JSON.stringify([{ factura_id: facturaId, monto }]),
    por,
  );
  if (r !== "ok") throw new Error(`el pago por fuera respondió ${r}`);
  return pagoId;
}

async function descongelarSiPagada(tx: TxDeTest, org: string, ahora: string): Promise<string> {
  const [{ r }] = await tx.$queryRawUnsafe<{ r: string }[]>(
    `SELECT organizacion_mora_descongelar_si_pagada($1, $2::timestamp, $3) AS r`,
    org,
    ahora,
    GRACIA_GLOBAL,
  );
  return r;
}

async function descongelarAMano(tx: TxDeTest, org: string, hasta: string, ahora: string): Promise<string> {
  const [{ r }] = await tx.$queryRawUnsafe<{ r: string }[]>(
    `SELECT organizacion_mora_descongelar_a_mano($1, $2::date, $3::timestamp) AS r`,
    org,
    hasta,
    ahora,
  );
  return r;
}

describeSiHayBase("SLT-121 — congelar y descongelar en la base (R7-R9, R18, R21, R23, R34)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R7: a las 00:30 del día siguiente a la fecha límite congela, con sus facturas vencidas y el saldo vencido", async () => {
    const r = await revertida(base, async (tx) => {
      const { org, factura } = await empresaVencida(tx);
      // Una segunda, aún en plazo, no entra en el congelamiento.
      await facturaCerrada(tx, org, { numero: 2, hasta: cero("2026-11-20"), total: "300.00" });
      const resultado = await congelar(tx, org, MADRUGADA);
      return { factura, resultado, estado: await estadoDe(tx, org) };
    });
    expect(r.resultado).toEqual({
      resultado: "congelada",
      facturas: [{ id: r.factura, numero: 1, saldo: "1000.00" }],
      saldo_vencido: "1000.00",
    });
    expect(r.estado).toEqual({ congeladaAt: MADRUGADA, descongeladaHasta: null });
  });

  it("R7: el día de la fecha límite todavía no congela, ni con la gracia propia más larga que la global", async () => {
    const r = await revertida(base, async (tx) => {
      const enPlazo = await empresaVencida(tx);
      const conGracia = await empresaVencida(tx);
      await fijarGracia(tx, conGracia.org, 15);
      return {
        enPlazo: await congelar(tx, enPlazo.org, aLas("2026-11-23", "00:30")),
        conGracia: await congelar(tx, conGracia.org, MADRUGADA),
        estados: [await estadoDe(tx, enPlazo.org), await estadoDe(tx, conGracia.org)],
      };
    });
    expect(r.enPlazo).toEqual({ resultado: "al_dia" });
    expect(r.conGracia).toEqual({ resultado: "al_dia" });
    expect(r.estados).toEqual([
      { congeladaAt: null, descongeladaHasta: null },
      { congeladaAt: null, descongeladaHasta: null },
    ]);
  });

  it("R8: solo de 00:00 a 05:59 de la plataforma; a las 06:00 y a las 14:00 no congela ni escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const salida: Record<string, unknown> = {};
      for (const hora of ["00:00", "05:59", "06:00", "14:00", "23:59"]) {
        const { org } = await empresaVencida(tx);
        const resultado = await congelar(tx, org, aLas("2026-11-25", hora));
        salida[hora] = { resultado: resultado.resultado, congelada: (await estadoDe(tx, org)).congeladaAt !== null };
      }
      return salida;
    });
    expect(r).toEqual({
      "00:00": { resultado: "congelada", congelada: true },
      "05:59": { resultado: "congelada", congelada: true },
      "06:00": { resultado: "fuera_de_franja", congelada: false },
      "14:00": { resultado: "fuera_de_franja", congelada: false },
      "23:59": { resultado: "fuera_de_franja", congelada: false },
    });
  });

  it("R9: repetir la corrida en la misma madrugada responde ya_congelada y no mueve la marca", async () => {
    const r = await revertida(base, async (tx) => {
      const { org } = await empresaVencida(tx);
      const primera = await congelar(tx, org, MADRUGADA);
      const segunda = await congelar(tx, org, aLas("2026-11-24", "01:30"));
      return { primera: primera.resultado, segunda, estado: await estadoDe(tx, org) };
    });
    expect(r.primera).toBe("congelada");
    expect(r.segunda).toEqual({ resultado: "ya_congelada" });
    expect(r.estado.congeladaAt).toBe(MADRUGADA);
  });

  it("congelar toma el candado de los pagos de la empresa, el mismo de la confirmación (design §4.3)", async () => {
    const r = await revertida(base, async (tx) => {
      const { org } = await empresaVencida(tx);
      await congelar(tx, org, MADRUGADA);
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_locks l
          WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted
            AND l.objid::bigint = (hashtext('pago_plataforma:' || $1)::bigint & 4294967295)`,
        org,
      );
      return n;
    });
    expect(r).toBe(1);
  });

  it("R23: con un descongelamiento a mano hasta hoy no congela; al día siguiente de la fecha hasta, sí", async () => {
    const r = await revertida(base, async (tx) => {
      const { org } = await empresaVencida(tx);
      const noCongelada = await descongelarAMano(tx, org, "2026-11-30", MADRUGADA);
      await congelar(tx, org, MADRUGADA);
      const aMano = await descongelarAMano(tx, org, "2026-11-25", aLas("2026-11-24", "10:00"));
      const trasAMano = await estadoDe(tx, org);
      const elDiaHasta = await congelar(tx, org, aLas("2026-11-25", "00:30"));
      const alDiaSiguiente = await congelar(tx, org, aLas("2026-11-26", "00:30"));
      return { noCongelada, aMano, trasAMano, elDiaHasta, alDiaSiguiente, final: await estadoDe(tx, org) };
    });
    expect(r.noCongelada).toBe("no_congelada");
    expect(r.aMano).toBe("ok");
    expect(r.trasAMano).toEqual({ congeladaAt: null, descongeladaHasta: "2026-11-25" });
    expect(r.elDiaHasta).toEqual({ resultado: "descongelada_a_mano" });
    expect(r.alDiaSiguiente.resultado).toBe("congelada");
    expect(r.final).toEqual({ congeladaAt: aLas("2026-11-26", "00:30"), descongeladaHasta: "2026-11-25" });
  });

  it("R18: de dos empresas, solo congela la que tiene facturas vencidas; la otra no cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const vencida = await empresaVencida(tx);
      const alDia = await empresa(tx);
      await facturaCerrada(tx, alDia, { numero: 1, hasta: cero("2026-11-20"), total: "1000.00" });
      return {
        vencida: (await congelar(tx, vencida.org, MADRUGADA)).resultado,
        alDia: await congelar(tx, alDia, MADRUGADA),
        estados: [await estadoDe(tx, vencida.org), await estadoDe(tx, alDia)],
      };
    });
    expect(r.vencida).toBe("congelada");
    expect(r.alDia).toEqual({ resultado: "al_dia" });
    expect(r.estados).toEqual([
      { congeladaAt: MADRUGADA, descongeladaHasta: null },
      { congeladaAt: null, descongeladaHasta: null },
    ]);
  });

  it("R21: anular un pago confirmado no congela en el acto; la madrugada siguiente sí", async () => {
    const r = await revertida(base, async (tx) => {
      const { org, factura } = await empresaVencida(tx);
      const maestro = await maestroDe(tx, org);
      const pago = await pagarPorFuera(tx, org, maestro, factura, "1000.00");
      const pagada = await congelar(tx, org, MADRUGADA);
      const [{ a }] = await tx.$queryRawUnsafe<{ a: string }[]>(
        `SELECT pago_plataforma_anular_confirmado($1, $2, 'Pago duplicado SLT121', $3, $4::timestamp) AS a`,
        org,
        pago,
        maestro,
        aLas("2026-11-24", "11:00"),
      );
      // El recálculo tras anular nunca congela (R21, R34).
      const recalculo = await descongelarSiPagada(tx, org, aLas("2026-11-24", "11:00"));
      const trasAnular = await estadoDe(tx, org);
      const siguiente = await congelar(tx, org, aLas("2026-11-25", "00:30"));
      return { pagada, a, recalculo, trasAnular, siguiente: siguiente.resultado };
    });
    expect(r.pagada).toEqual({ resultado: "al_dia" });
    expect(r.a).toBe("ok");
    expect(r.recalculo).toBe("sin_cambio");
    expect(r.trasAnular.congeladaAt).toBeNull();
    expect(r.siguiente).toBe("congelada");
  });

  it("R34 (SQL): descongelar_si_pagada solo descongela sin vencidas, nunca congela y no toca la fecha hasta", async () => {
    const r = await revertida(base, async (tx) => {
      const { org, factura } = await empresaVencida(tx);
      const maestro = await maestroDe(tx, org);
      const sinCongelar = await descongelarSiPagada(tx, org, MADRUGADA);
      const sinCongelarEstado = await estadoDe(tx, org);
      await congelar(tx, org, MADRUGADA);
      await pagarPorFuera(tx, org, maestro, factura, "400.00");
      const parcial = await descongelarSiPagada(tx, org, aLas("2026-11-24", "10:00"));
      await pagarPorFuera(tx, org, maestro, factura, "600.00");
      const saldada = await descongelarSiPagada(tx, org, aLas("2026-11-24", "11:00"));
      const otraVez = await descongelarSiPagada(tx, org, aLas("2026-11-24", "11:05"));
      return { sinCongelar, sinCongelarEstado, parcial, saldada, otraVez, final: await estadoDe(tx, org) };
    });
    expect(r.sinCongelar).toBe("sin_cambio");
    expect(r.sinCongelarEstado.congeladaAt).toBeNull();
    expect(r.parcial).toBe("sin_cambio");
    expect(r.saldada).toBe("descongelada");
    expect(r.otraVez).toBe("sin_cambio");
    expect(r.final).toEqual({ congeladaAt: null, descongeladaHasta: null });
  });

  it("R5 (SQL): con la empresa congelada, una gracia propia que deja la factura en plazo permite descongelar", async () => {
    const r = await revertida(base, async (tx) => {
      const { org } = await empresaVencida(tx);
      await congelar(tx, org, MADRUGADA);
      const conLaMisma = await descongelarSiPagada(tx, org, aLas("2026-11-24", "10:00"));
      await fijarGracia(tx, org, 15);
      const conMas = await descongelarSiPagada(tx, org, aLas("2026-11-24", "10:00"));
      return { conLaMisma, conMas, final: await estadoDe(tx, org) };
    });
    expect(r.conLaMisma).toBe("sin_cambio");
    expect(r.conMas).toBe("descongelada");
    expect(r.final.congeladaAt).toBeNull();
  });
});
