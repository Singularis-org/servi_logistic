import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";

// SLT-96 «Consolidación de ₡0 no se puede marcar recibida» · T1 · R1-R5, R7, R9 — EL 0 SOLO VALE CON
// LO DECLARADO EN 0, y lo declarado sale del SNAPSHOT guardado en `cierre_bodega`, no de la entrada.
//
// Dos siembras que difieren SOLO en el snapshot (R5):
//   - DECLARADO 0 POR LA CASCADA: total general 1.500,00 y pago a mensajeros 1.500,00 → 1.500 − 1.500
//     − 0 = 0. A proposito NO es un total en 0: leer `totalGeneral` (o `totalEfectivo`) en vez de lo
//     declarado daria 1.500 y este archivo se pondria rojo.
//   - DECLARADO 5.000,00: total general 5.000,00, sin pago a mensajeros ni ganancia de la satelite.
// Cifras ESCRITAS A MANO, nunca calculadas con `esperadoDe`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const INEXISTENTE = "00000000-0000-4000-8000-0000000096aa";

type Snapshot = { totalEfectivo: string; totalGeneral: string; totalPagoMensajero: string };
const DECLARADO_CERO: Snapshot = {
  totalEfectivo: "1500.00",
  totalGeneral: "1500.00",
  totalPagoMensajero: "1500.00",
};
const DECLARADO_5000: Snapshot = {
  totalEfectivo: "5000.00",
  totalGeneral: "5000.00",
  totalPagoMensajero: "0.00",
};

async function sembrar(tx: TxDeTest, snap: Snapshot) {
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const zona = await tx.zona.create({
    data: {
      nombre: `Zona SLT-96 ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      sinpeNumero: "80000000",
      sinpeNombre: "Titular de Prueba",
      esCentral: false,
    },
    select: { id: true },
  });
  const cb = await tx.cierreBodega.create({
    data: {
      zonaId: zona.id,
      solicitadoPor: maestro.id,
      estado: "solicitado",
      totalEfectivo: new Prisma.Decimal(snap.totalEfectivo),
      totalGeneral: new Prisma.Decimal(snap.totalGeneral),
      totalPagoMensajero: new Prisma.Decimal(snap.totalPagoMensajero),
    },
    select: { id: true },
  });
  return { id: cb.id, maestroId: maestro.id };
}

/** Todo lo que una marca o una correccion puede escribir de esta consolidacion. */
async function estadoDe(tx: TxDeTest, id: string) {
  const cb = await tx.cierreBodega.findUniqueOrThrow({
    where: { id },
    select: { estado: true, conciliadoAt: true, conciliadoPor: true, montoRecibido: true },
  });
  const historial = await tx.historialAccion.findMany({
    where: { entidadId: id, accion: "cierre_bodega_conciliado" },
    orderBy: { createdAt: "asc" },
    select: { monto: true, valorAnterior: true, valorNuevo: true },
  });
  const ajustes = await tx.conciliacionBodegaAjuste.findMany({
    where: { cierreBodegaId: id },
    select: { id: true, diferencia: true },
  });
  return {
    estado: cb.estado,
    conciliadoAt: cb.conciliadoAt,
    conciliadoPor: cb.conciliadoPor,
    montoRecibido: cb.montoRecibido?.toFixed(2) ?? null,
    historial: historial.map((h) => ({
      monto: h.monto?.toFixed(2) ?? null,
      valorAnterior: h.valorAnterior,
      valorNuevo: h.valorNuevo,
    })),
    ajustes: ajustes.length,
  };
}

/**
 * Movimientos de caja de ajuste de conciliacion de TODA la base vista por la transaccion. Se cuenta
 * global y no por los ids de los ajustes: si no hubiera ajustes, filtrar por sus ids daria 0 siempre.
 */
async function movimientosDeAjuste(tx: TxDeTest): Promise<number> {
  return tx.walletMovimiento.count({ where: { origenTipo: "conciliacion_bodega_ajuste" } });
}

function marcar(repo: CierresBodegaAdminRepository, id: string, monto: string, actor: string) {
  return repo.marcarConciliado({
    zonaHoraria: ZONA_DE_CR,
    id,
    montoRecibido: monto,
    nota: null,
    actorUsuarioId: actor,
  });
}

function corregir(repo: CierresBodegaAdminRepository, id: string, monto: string, actor: string) {
  return repo.corregirConciliacion({
    zonaHoraria: ZONA_DE_CR,
    id,
    montoRecibido: monto,
    nota: null,
    actorUsuarioId: actor,
  });
}

describeSiHayBase("SLT-96 T1 — marcar y corregir con 0, contra Postgres real", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R1/R7: declarado 0 (1500 − 1500) y marcar 0.00 → conciliada, monto 0, historial con monto 0, sin ajuste ni movimiento", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrar(tx, DECLARADO_CERO);
      const movsAntes = await movimientosDeAjuste(tx);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const res = await marcar(repo, s.id, "0.00", s.maestroId);
      return { s, res, despues: await estadoDe(tx, s.id), movsAntes, movsDespues: await movimientosDeAjuste(tx) };
    });

    expect(r.res).toBe("updated");
    expect(r.despues.estado).toBe("aprobado");
    expect(r.despues.conciliadoAt).toBeInstanceOf(Date);
    expect(r.despues.conciliadoPor).toBe(r.s.maestroId);
    expect(r.despues.montoRecibido).toBe("0.00");
    expect(r.despues.historial).toEqual([{ monto: "0.00", valorAnterior: null, valorNuevo: null }]);
    // R7: delta = 0 − 0 − 0 → ninguna fila de ajuste ni movimiento, y la transaccion no lanzo.
    expect(r.despues.ajustes).toBe(0);
    expect(r.movsDespues).toBe(r.movsAntes);
  });

  it("R2: declarado 5000 y marcar 0.00 → monto_cero_no_permitido, y no cambia NADA", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrar(tx, DECLARADO_5000);
      const movsAntes = await movimientosDeAjuste(tx);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const res = await marcar(repo, s.id, "0.00", s.maestroId);
      return { res, despues: await estadoDe(tx, s.id), movsAntes, movsDespues: await movimientosDeAjuste(tx) };
    });

    expect(r.res).toBe("monto_cero_no_permitido");
    expect(r.despues).toEqual({
      estado: "solicitado",
      conciliadoAt: null,
      conciliadoPor: null,
      montoRecibido: null,
      historial: [],
      ajustes: 0,
    });
    expect(r.movsDespues).toBe(r.movsAntes);
  });

  it("R5: la MISMA entrada (0.00) da desenlaces distintos solo por el snapshot sembrado", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const cero = await sembrar(tx, DECLARADO_CERO);
      const cinco = await sembrar(tx, DECLARADO_5000);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      return {
        cero: await marcar(repo, cero.id, "0.00", cero.maestroId),
        cinco: await marcar(repo, cinco.id, "0.00", cero.maestroId),
      };
    });
    expect(r).toEqual({ cero: "updated", cinco: "monto_cero_no_permitido" });
  });

  it("R6 (control): con declarado 5000, un monto > 0 se sigue aceptando", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrar(tx, DECLARADO_5000);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const res = await marcar(repo, s.id, "4000.00", s.maestroId);
      return { res, despues: await estadoDe(tx, s.id) };
    });
    expect(r.res).toBe("updated");
    expect(r.despues.montoRecibido).toBe("4000.00");
  });

  it("R3: declarado 0, marcar 10.00 y corregir a 0.00 → monto 0 y historial con valor_nuevo 0.00", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrar(tx, DECLARADO_CERO);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const m = await marcar(repo, s.id, "10.00", s.maestroId);
      const c = await corregir(repo, s.id, "0.00", s.maestroId);
      return { m, c, despues: await estadoDe(tx, s.id) };
    });

    expect([r.m, r.c]).toEqual(["updated", "updated"]);
    expect(r.despues.estado).toBe("aprobado");
    expect(r.despues.montoRecibido).toBe("0.00");
    expect(r.despues.historial).toEqual([
      { monto: "10.00", valorAnterior: null, valorNuevo: null },
      { monto: "0.00", valorAnterior: "10.00", valorNuevo: "0.00" },
    ]);
  });

  it("R4: declarado 5000, marcar 5000.00 y corregir a 0.00 → monto_cero_no_permitido, sin cambios", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const s = await sembrar(tx, DECLARADO_5000);
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      const m = await marcar(repo, s.id, "5000.00", s.maestroId);
      const antes = await estadoDe(tx, s.id);
      const movsAntes = await movimientosDeAjuste(tx);
      const c = await corregir(repo, s.id, "0.00", s.maestroId);
      return { m, c, antes, despues: await estadoDe(tx, s.id), movsAntes, movsDespues: await movimientosDeAjuste(tx) };
    });

    expect(r.m).toBe("updated");
    expect(r.c).toBe("monto_cero_no_permitido");
    expect(r.despues.montoRecibido).toBe("5000.00");
    expect(r.despues.historial).toEqual([{ monto: "5000.00", valorAnterior: null, valorNuevo: null }]);
    expect(r.despues).toEqual(r.antes);
    expect(r.movsDespues).toBe(r.movsAntes);
  });

  it("R9: con 0.00 sobre un id inexistente → fuera_de_alcance, en marcar y en corregir", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const repo = new CierresBodegaAdminRepository(clienteConSavepoint(tx));
      return {
        marca: await marcar(repo, INEXISTENTE, "0.00", maestro.id),
        correccion: await corregir(repo, INEXISTENTE, "0.00", maestro.id),
      };
    });
    expect(r).toEqual({ marca: "fuera_de_alcance", correccion: "fuera_de_alcance" });
  });
});
