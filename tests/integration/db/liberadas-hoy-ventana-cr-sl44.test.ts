import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { LiberacionReprogramadaRepository } from "@/lib/repositories/LiberacionReprogramadaRepository";
import { startOfDayCR } from "@/lib/utils/fecha-cr";
import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";
import { crearFksDeOrden } from "./_fixtures/orden-minima";

/**
 * SL-44 (A2) — LA VENTANA DE «LIBERADAS HOY», EJECUTADA CONTRA POSTGRES.
 *
 * `liberada_reprogramada_at` es un `timestamp`: el dia CR va de `T06:00Z` a `T06:00Z` del dia
 * siguiente (`inicioDelDiaCREnUtc`). Con la ventana de medianoche UTC (`startOfDayCR`, la
 * convencion `@db.Date`) lo liberado entre las 18:00 y las 24:00 de CR no salia en el aviso;
 * `e2e/reprogramacion-liberacion.spec.ts:69` lo destapo en rojo a las 18:45 CR.
 *
 * El reloj se fija igual que el action (`deps.hoyCR = startOfDayCR(now)`): 19:00 CR del 15.
 * Los datos los crea el test (app vacia, SL-11) dentro de una transaccion que se revierte.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** 19:00 CR del 15 de julio = 01:00Z del 16. */
const RELOJ = new Date("2026-07-16T01:00:00.000Z");

const LIBERACIONES = {
  /** La del momento del reloj: 19:00 CR del 15. DEBE salir. */
  tarde: new Date("2026-07-16T01:00:00.000Z"),
  /** 00:00 CR del 15, la hora de la corrida del cron. DEBE salir. */
  cron: new Date("2026-07-15T06:00:00.000Z"),
  /** 23:59 CR del 14, el dia anterior. NO debe salir. */
  ayer: new Date("2026-07-15T05:59:00.000Z"),
  /** 00:00 CR del 16, el dia siguiente (cota superior exclusiva). NO debe salir. */
  manana: new Date("2026-07-16T06:00:00.000Z"),
} as const;

const ESTATUS = "en_bodega_satelite";

describeSiHayBase("SL-44 — `findLiberadasHoy` usa el dia de CR (Postgres real)", () => {
  let prisma: PrismaClient;
  let visibles: string[];

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    visibles = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const fks = await crearFksDeOrden(tx);
      const estatus = await tx.orderStatus.findUnique({ where: { value: ESTATUS }, select: { id: true } });
      if (estatus === null) throw new Error(`falta el estado «${ESTATUS}»: aplica las migraciones`);

      const nombres = new Map<string, string>();
      let n = 0;
      for (const [clave, instante] of Object.entries(LIBERACIONES)) {
        n += 1;
        const o = await tx.orden.create({
          data: {
            numGuia: 944_000_000 + (Date.now() % 40_000_000) + n,
            numRemision: `R-SL44-${clave}-${Date.now().toString(36)}`,
            destinatario: `Dest ${clave}`,
            telefonoDest: "88880000",
            producto: `Prod ${clave}`,
            estatusId: estatus.id,
            liberadaReprogramadaAt: instante,
            tiendaId: fks.tiendaId,
            zonaId: fks.zonaId,
            provinciaId: fks.provinciaId,
            cantonId: fks.cantonId,
          },
          select: { id: true },
        });
        nombres.set(o.id, clave);
      }

      const repo = new LiberacionReprogramadaRepository(clienteConTransaccionAnidada(tx));
      const filas = await repo.findLiberadasHoy({ zonaId: fks.zonaId, estatusValue: ESTATUS }, startOfDayCR(RELOJ));
      return filas.map((f) => nombres.get(f.id) ?? `ajena:${f.id}`);
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("a las 19:00 CR sale la liberacion de las 19:00 CR y la del cron de las 00:00 CR", () => {
    expect(visibles).toContain("tarde");
    expect(visibles).toContain("cron");
  });

  it("no entra la de las 23:59 CR del dia anterior ni la de las 00:00 CR del siguiente", () => {
    expect(visibles).not.toContain("ayer");
    expect(visibles).not.toContain("manana");
  });

  it("devuelve exactamente las dos del dia, la mas reciente primero", () => {
    expect(visibles).toEqual(["tarde", "cron"]);
  });
});
