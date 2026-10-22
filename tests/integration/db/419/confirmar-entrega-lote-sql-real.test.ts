import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "../_postgres-real";
import {
  EnlaceCaido,
  FOTO,
  clienteConSavepoint419,
  conEscenario419,
  crearPersonas419,
  lecturas419,
  limpiar419,
  montarServicio419,
  prepararMundo419,
  type Mundo419,
} from "./_escenario-419";

/**
 * FICHA 419 (B5/B7; R6-R11, R13, R23) — el lote CENTRAL de entrega a la tienda contra Postgres
 * REAL: el `UPDATE ... RETURNING` y su `WHERE`, el historial, el enlace al comprobante, la
 * reversion sin transiciones y ante un fallo de escritura, y la concurrencia con otro lote y con
 * el escaner de la tienda. Mutaciones registradas en `progress/impl_419.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const RUTA_R23 = /^devolucion-tienda\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const DOS_FOTOS = [FOTO[0], { contentType: "image/png", bytes: new Uint8Array([4, 5, 6]) }];

describeSiHayBase("419 — lote central de entrega a la tienda (Postgres real)", () => {
  let mundo: Mundo419;

  beforeAll(async () => {
    mundo = await prepararMundo419();
  }, 60_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  describe("lote mixto: 2 elegibles + ya_devuelta + estado_invalido + tienda_distinta + borrada + inexistente", () => {
    let r: Awaited<ReturnType<typeof correr>>;

    function correr() {
      return conEscenario419(mundo, async (tx) => {
        const p = await crearPersonas419(mundo, tx);
        const leer = lecturas419(mundo, tx);
        const e1 = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
        const e2 = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
        const ya = await p.sembrarOrden({ estatus: "devuelta_a_tienda" });
        const inv = await p.sembrarOrden({ estatus: "por_devolver_a_tienda" });
        const otra = await p.sembrarOrden({ estatus: "devolviendo_a_tienda", tiendaId: p.tiendaB });
        const borrada = await p.sembrarOrden({ estatus: "devolviendo_a_tienda", borrada: true });
        const inexistente = randomUUID();
        const noElegibles = [ya, inv, otra, borrada];
        const historialAntes = await Promise.all(noElegibles.map((o) => leer.historialTotal(o.ordenId)));

        const m = montarServicio419(clienteConSavepoint419(tx));
        const pedidas = [e1, e2, ya, inv, otra, borrada].map((o) => o.ordenId).concat(inexistente);
        const res = await m.service.confirmarEntrega(
          { tiendaId: p.tiendaA, ordenIds: pedidas, evidencias: DOS_FOTOS },
          p.actorAdmin,
        );

        return {
          p,
          res,
          ids: { e1, e2, ya, inv, otra, borrada, inexistente },
          estados: {
            e1: await leer.estadoDe(e1.ordenId),
            e2: await leer.estadoDe(e2.ordenId),
            ya: await leer.estadoDe(ya.ordenId),
            inv: await leer.estadoDe(inv.ordenId),
            otra: await leer.estadoDe(otra.ordenId),
            borrada: await leer.estadoDe(borrada.ordenId),
          },
          historialE1: await leer.historialDevuelta(e1.ordenId),
          historialE2: await leer.historialDevuelta(e2.ordenId),
          historialAntes,
          historialDespues: await Promise.all(noElegibles.map((o) => leer.historialTotal(o.ordenId))),
          enlaceE1: await leer.enlaceDe(e1.ordenId),
          enlaceE2: await leer.enlaceDe(e2.ordenId),
          enlacesNoElegibles: await Promise.all(noElegibles.map((o) => leer.enlaceDe(o.ordenId))),
          comprobantesA: await leer.comprobantesDe(p.tiendaA),
          comprobantesB: await leer.comprobantesDe(p.tiendaB),
          subidos: m.subidos,
          retirados: m.retirados,
        };
      });
    }

    beforeAll(async () => {
      r = await correr();
    }, 120_000);

    it("R6: pasan a devuelta_a_tienda EXACTAMENTE las elegibles; el resto no se mueve", () => {
      expect(r.res.status).toBe("ok");
      expect(r.estados).toEqual({
        e1: "devuelta_a_tienda",
        e2: "devuelta_a_tienda",
        ya: "devuelta_a_tienda",
        inv: "por_devolver_a_tienda",
        otra: "devolviendo_a_tienda",
        borrada: "devolviendo_a_tienda",
      });
    });

    it("R7: un desenlace por cada orden pedida, en su orden, y la no elegible no bloquea", () => {
      if (r.res.status !== "ok") throw new Error(JSON.stringify(r.res));
      expect(r.res.devueltas).toBe(2);
      expect(r.res.desenlaces).toEqual([
        { ordenId: r.ids.e1.ordenId, numGuia: r.ids.e1.numGuia, desenlace: "devuelta_a_tienda" },
        { ordenId: r.ids.e2.ordenId, numGuia: r.ids.e2.numGuia, desenlace: "devuelta_a_tienda" },
        { ordenId: r.ids.ya.ordenId, numGuia: r.ids.ya.numGuia, desenlace: "ya_devuelta" },
        {
          ordenId: r.ids.inv.ordenId,
          numGuia: r.ids.inv.numGuia,
          desenlace: "estado_invalido",
          estado: "por_devolver_a_tienda",
        },
        { ordenId: r.ids.otra.ordenId, numGuia: r.ids.otra.numGuia, desenlace: "tienda_distinta" },
        { ordenId: r.ids.borrada.ordenId, numGuia: null, desenlace: "no_encontrada" },
        { ordenId: r.ids.inexistente, numGuia: null, desenlace: "no_encontrada" },
      ]);
    });

    it("R9: una fila de historial por transicionada (actor = quien confirmo, ajuste_estado); ninguna para el resto", () => {
      const esperado = [{ actorUsuarioId: r.p.adminId, origenTipo: "ajuste_estado" }];
      expect(r.historialE1).toEqual(esperado);
      expect(r.historialE2).toEqual(esperado);
      expect(r.historialDespues).toEqual(r.historialAntes);
    });

    it("R10: las transicionadas quedan enlazadas al MISMO comprobante (tienda del lote, quien subio); el resto no", () => {
      expect(r.enlaceE1).not.toBeNull();
      expect(r.enlaceE1?.comprobanteId).toBe(r.enlaceE2?.comprobanteId);
      expect(r.enlaceE1?.comprobante.tiendaId).toBe(r.p.tiendaA);
      expect(r.enlaceE1?.comprobante.subidoPor).toBe(r.p.adminId);
      expect(r.enlacesNoElegibles).toEqual([null, null, null, null]);
      expect(r.comprobantesA).toHaveLength(1);
      expect(r.comprobantesA[0].ordenes.map((o) => o.ordenId).sort()).toEqual(
        [r.ids.e1.ordenId, r.ids.e2.ordenId].sort(),
      );
      expect(r.comprobantesB).toHaveLength(0);
    });

    it("R23: los archivos se guardan con ruta sin ids y en orden; nada se retira si el lote fue bien", () => {
      const ev = [...r.comprobantesA[0].evidencias].sort((a, b) => a.indice - b.indice);
      expect(ev.map((e) => e.indice)).toEqual([0, 1]);
      expect(ev.map((e) => e.contentType)).toEqual(["image/jpeg", "image/png"]);
      for (const e of ev) expect(e.storagePath).toMatch(RUTA_R23);
      expect(ev.map((e) => e.storagePath)).toEqual(r.subidos);
      expect(r.retirados).toEqual([]);
      const texto = JSON.stringify(r.res);
      for (const s of r.subidos) expect(texto).not.toContain(s);
    });
  });

  describe("R11 — ninguna elegible: no se guarda el comprobante", () => {
    let r: Awaited<ReturnType<typeof correr>>;

    function correr() {
      return conEscenario419(mundo, async (tx) => {
        const p = await crearPersonas419(mundo, tx);
        const leer = lecturas419(mundo, tx);
        const ya = await p.sembrarOrden({ estatus: "devuelta_a_tienda" });
        const otra = await p.sembrarOrden({ estatus: "devolviendo_a_tienda", tiendaId: p.tiendaB });
        const m = montarServicio419(clienteConSavepoint419(tx));
        const res = await m.service.confirmarEntrega(
          { tiendaId: p.tiendaA, ordenIds: [ya.ordenId, otra.ordenId], evidencias: DOS_FOTOS },
          p.actorMaestro,
        );
        const evidencias = await tx.devolucionTiendaEvidencia.count({
          where: { storagePath: { in: m.subidos } },
        });
        return {
          res,
          ya,
          otra,
          comprobantes: await leer.comprobantesDe(p.tiendaA),
          evidencias,
          enlaces: [await leer.enlaceDe(ya.ordenId), await leer.enlaceDe(otra.ordenId)],
          estadoOtra: await leer.estadoDe(otra.ordenId),
          subidos: m.subidos,
          retirados: m.retirados,
        };
      });
    }

    beforeAll(async () => {
      r = await correr();
    }, 120_000);

    it("devuelve el reporte por orden con `ninguna_devuelta`", () => {
      expect(r.res).toEqual({
        status: "ninguna_devuelta",
        desenlaces: [
          { ordenId: r.ya.ordenId, numGuia: r.ya.numGuia, desenlace: "ya_devuelta" },
          { ordenId: r.otra.ordenId, numGuia: r.otra.numGuia, desenlace: "tienda_distinta" },
        ],
      });
      expect(r.estadoOtra).toBe("devolviendo_a_tienda");
    });

    it("cero filas en las tres tablas y los archivos subidos se retiran", () => {
      expect(r.comprobantes).toHaveLength(0);
      expect(r.evidencias).toBe(0);
      expect(r.enlaces).toEqual([null, null]);
      expect(r.subidos).toHaveLength(2);
      expect(r.retirados).toEqual(r.subidos);
    });
  });

  describe("R13 — la escritura falla despues de subir: nada transiciona y se retiran los archivos", () => {
    let r: Awaited<ReturnType<typeof correr>>;

    function correr() {
      return conEscenario419(mundo, async (tx) => {
        const p = await crearPersonas419(mundo, tx);
        const leer = lecturas419(mundo, tx);
        const o = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
        const m = montarServicio419(clienteConSavepoint419(tx, "enlace"));
        let error: unknown = null;
        try {
          await m.service.confirmarEntrega(
            { tiendaId: p.tiendaA, ordenIds: [o.ordenId], evidencias: FOTO },
            p.actorMaestro,
          );
        } catch (e) {
          error = e;
        }
        return {
          error,
          estado: await leer.estadoDe(o.ordenId),
          historial: await leer.historialDevuelta(o.ordenId),
          comprobantes: await leer.comprobantesDe(p.tiendaA),
          jobs: await tx.job.count({
            where: { tipo: "webhook_estado", payload: { path: ["ordenId"], equals: o.ordenId } },
          }),
          subidos: m.subidos,
          retirados: m.retirados,
        };
      });
    }

    beforeAll(async () => {
      r = await correr();
    }, 120_000);

    it("el error se propaga y no queda orden transicionada, historial ni comprobante", () => {
      expect(r.error).toBeInstanceOf(EnlaceCaido);
      expect(r.estado).toBe("devolviendo_a_tienda");
      expect(r.historial).toEqual([]);
      expect(r.comprobantes).toHaveLength(0);
      expect(r.jobs).toBe(0);
    });

    it("los archivos subidos se retiran", () => {
      expect(r.subidos).toHaveLength(1);
      expect(r.retirados).toEqual(r.subidos);
    });
  });

  describe("R8 — concurrencia real (dos conexiones, datos confirmados)", () => {
    const REPETICIONES = 4;
    let c1: PrismaClient;
    let c2: PrismaClient;
    const ordenIds: string[] = [];
    let usuarios: string[] = [];
    const dosLotes: { estados: string[]; historial: number; enlace: boolean }[] = [];
    const loteVsEscaner: { lote: string; escaner: boolean; historial: number; enlace: boolean }[] = [];

    beforeAll(async () => {
      c1 = crearPrismaDeTest();
      c2 = crearPrismaDeTest();
      const p = await crearPersonas419(mundo, mundo.prisma);
      usuarios = p.usuarios;
      const leer = lecturas419(mundo, mundo.prisma);
      const devueltaId = p.id("devuelta_a_tienda");
      const lote = (c: PrismaClient, ordenId: string) =>
        montarServicio419(c).service.confirmarEntrega(
          { tiendaId: p.tiendaA, ordenIds: [ordenId], evidencias: FOTO },
          p.actorMaestro,
        );

      for (let i = 0; i < REPETICIONES; i++) {
        const a = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
        ordenIds.push(a.ordenId);
        const res = await Promise.all([lote(c1, a.ordenId), lote(c2, a.ordenId)]);
        dosLotes.push({
          estados: res.map((x) => x.status).sort(),
          historial: (await leer.historialDevuelta(a.ordenId)).length,
          enlace: (await leer.enlaceDe(a.ordenId)) !== null,
        });

        const b = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
        ordenIds.push(b.ordenId);
        const [rl, re] = await Promise.all([
          lote(c1, b.ordenId),
          new OrdenRepository(c2).recibirEnOrigen(b.ordenId, p.tiendaA, devueltaId, {
            actorUsuarioId: p.tiendaA,
            origenTipo: "ajuste_estado",
          }),
        ]);
        loteVsEscaner.push({
          lote: rl.status,
          escaner: re,
          historial: (await leer.historialDevuelta(b.ordenId)).length,
          enlace: (await leer.enlaceDe(b.ordenId)) !== null,
        });
      }
    }, 300_000);

    afterAll(async () => {
      await limpiar419(mundo.prisma, { usuarios, ordenIds });
      await c1?.$disconnect();
      await c2?.$disconnect();
    }, 120_000);

    it(`dos lotes a la vez sobre la misma orden (${REPETICIONES}x): uno ok, otro ninguna_devuelta; 1 historial, 1 enlace`, () => {
      expect(dosLotes).toHaveLength(REPETICIONES);
      for (const m of dosLotes) {
        expect(m).toEqual({ estados: ["ninguna_devuelta", "ok"], historial: 1, enlace: true });
      }
    });

    it(`lote contra escaner de la tienda (${REPETICIONES}x): gana exactamente uno y queda 1 historial`, () => {
      expect(loteVsEscaner).toHaveLength(REPETICIONES);
      for (const m of loteVsEscaner) {
        const ganoLote = m.lote === "ok";
        expect(ganoLote !== m.escaner).toBe(true);
        expect(["ok", "ninguna_devuelta"]).toContain(m.lote);
        expect(m.historial).toBe(1);
        expect(m.enlace).toBe(ganoLote);
      }
    });
  });
});
