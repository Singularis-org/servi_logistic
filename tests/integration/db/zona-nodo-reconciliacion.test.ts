import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  comoLaEmpresa,
  crearEscenarioSlt89,
  guardado,
  repoDeZonas,
  zonasDeOrdenes,
  type EscenarioSlt89,
} from "./_fixtures/slt89-zonas";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R10, R11 (T3.5; design §5.1 paso 8) — ASIGNAR UN CANTON MUEVE LAS ORDENES PENDIENTES DE
 * LO QUE HEREDA, CON TODAS LAS REGLAS DE SLT-65, contra Postgres real (`slt89-zonas.ts`, empresa
 * `XA`, como la app). Se asigna el canton a la zona sur:
 *
 *   orden (geo-65 / slt89)    lugar                 zona antes  esperado                       por que
 *   ────────────────────────  ────────────────────  ──────────  ─────────────────────────────  ─────────────────────────────
 *   enDistritoSinZona         d. sin zona           central     sur                            hereda el canton (R10)
 *   sinDistrito               canton                central     sur                            su lugar es el canton (R10)
 *   sinDistritoGestionada     canton                central     central                        gestion final vigente
 *   estanteSinZona (slt89)    d. sin zona           central     central, retenida              en el estante (377)
 *   conDistritoConMarca       d. central            central     central                        excepcion (R11)
 *   conDistritoSinMarca       d. dos zonas          norte       norte                          excepcion (R11)
 *   desalineada               d. central            norte       central (nunca sur)            la 366 la realinea a su zona
 *   desalineadaEnEstante      d. central            norte       norte, retenida                en el estante
 *   desalineadaEnCierre       d. central            norte       norte                          ya en un cierre
 *
 * Una fila `orden_zona_reconciliada` por orden movida, un solo lote, y la respuesta de siempre.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

describeSiHayBase("SLT-89 · R10/R11 — asignar un canton reconcilia las ordenes de lo que hereda", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioSlt89) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioSlt89(tx)));
  }

  function idsDe(e: EscenarioSlt89): string[] {
    return [...Object.values(e.emp.ordenes), e.ordenEstanteSinZonaId];
  }

  it("⭑ R10/R11: el canton asignado mueve lo que hereda; excepciones, estante, cierre y gestion final se quedan; un lote", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const antes = await zonasDeOrdenes(tx, idsDe(e));
      const datos = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.cantonId] });
      const res = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      const historial = await tx.historialAccion.findMany({
        where: { accion: "orden_zona_reconciliada", entidadId: { in: idsDe(e) } },
        select: { entidadId: true, loteId: true },
      });
      return { e, res, antes, despues: await zonasDeOrdenes(tx, idsDe(e)), historial };
    });
    const o = r.e.emp.ordenes;
    const z = r.e.emp.base.zonas;
    // PREMISA: lo sembrado esta donde dice la tabla de arriba.
    expect(r.antes[o.enDistritoSinZonaId]).toBe(z.centralId);
    expect(r.antes[o.sinDistritoId]).toBe(z.centralId);

    expect(r.res).toMatchObject({ estado: "ok", ordenesReconciliadas: 3, ordenesRetenidasEnBodegaSatelite: 2 });
    expect(Object.keys(r.res).sort()).toEqual(["estado", "ordenesReconciliadas", "ordenesRetenidasEnBodegaSatelite", "zona"]);

    expect(r.despues[o.enDistritoSinZonaId]).toBe(z.surId);
    expect(r.despues[o.sinDistritoId]).toBe(z.surId);
    expect(r.despues[o.sinDistritoGestionadaId]).toBe(z.centralId);
    expect(r.despues[r.e.ordenEstanteSinZonaId]).toBe(z.centralId);
    expect(r.despues[o.conDistritoConMarcaId]).toBe(z.centralId);
    expect(r.despues[o.conDistritoSinMarcaId]).toBe(z.norteId);
    expect(r.despues[o.desalineadaId]).toBe(z.centralId);
    expect(r.despues[o.desalineadaEnEstanteId]).toBe(z.norteId);
    expect(r.despues[o.desalineadaEnCierreId]).toBe(z.norteId);
    // Ninguna orden bajo una excepcion acaba en la zona del canton (R11).
    for (const id of [o.conDistritoConMarcaId, o.conDistritoSinMarcaId, o.desalineadaId, o.desalineadaEnEstanteId]) {
      expect(r.despues[id]).not.toBe(z.surId);
    }

    expect(r.historial.map((h) => h.entidadId).sort()).toEqual([o.enDistritoSinZonaId, o.sinDistritoId, o.desalineadaId].sort());
    expect(new Set(r.historial.map((h) => h.loteId)).size).toBe(1);
  });

  it("R10: el canton que SALE de una zona re-evalua lo que heredaba: sin zona no mueve nada; al entrar en otra, se van con ella", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const update = async (zonaId: string, distritoIds: string[], nodoIds: string[]) => {
        const datos = await guardado(tx, zonaId, { distritoIds, nodoIds });
        return comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonaId, datos, e.maestroId));
      };
      await update(zonas.surId, [geo.distritoBajoCantonRetiradoId], [geo.cantonId]);
      const sale = await update(zonas.surId, [geo.distritoBajoCantonRetiradoId], []);
      const trasSalir = await zonasDeOrdenes(tx, idsDe(e));
      const entra = await update(zonas.norteId, [geo.distritoDosZonasId, geo.distritoRetiradoId], [geo.cantonId]);
      return { e, sale, trasSalir, entra, despues: await zonasDeOrdenes(tx, idsDe(e)) };
    });
    const o = r.e.emp.ordenes;
    const z = r.e.emp.base.zonas;
    // Sin el canton, «sin zona» y el canton no tienen zona (0 zonas): nada se mueve y siguen en sur.
    expect(r.sale).toMatchObject({ estado: "ok", ordenesReconciliadas: 0 });
    expect(r.trasSalir[o.enDistritoSinZonaId]).toBe(z.surId);
    expect(r.trasSalir[o.sinDistritoId]).toBe(z.surId);
    // El canton entra en norte: lo que lo hereda se va con el.
    expect(r.entra).toMatchObject({ estado: "ok", ordenesReconciliadas: 2 });
    expect(r.despues[o.enDistritoSinZonaId]).toBe(z.norteId);
    expect(r.despues[o.sinDistritoId]).toBe(z.norteId);
  });

  it("R10: el mismo guardado repetido no reconcilia nada la segunda vez", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const una = async () => {
        const datos = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.cantonId] });
        return comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      };
      return { primera: await una(), segunda: await una() };
    });
    expect(r.primera).toMatchObject({ estado: "ok", ordenesReconciliadas: 3 });
    expect(r.segunda).toMatchObject({ estado: "ok", ordenesReconciliadas: 0 });
  });
});
