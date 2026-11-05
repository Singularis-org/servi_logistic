import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { prepararConteoEntregas, type ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { prepararConsultaProductos, type ConsultaProductos } from "@/lib/analytics/productos-consulta";
import { CicloVidaRepository } from "@/lib/repositories/CicloVidaRepository";
import { CohorteCargaRepository } from "@/lib/repositories/CohorteCargaRepository";
import { ConteoCargadasPorDiaRepository } from "@/lib/repositories/ConteoCargadasPorDiaRepository";
import { ConteoDevolucionesRepository } from "@/lib/repositories/ConteoDevolucionesRepository";
import { ConteoEntregasRepository } from "@/lib/repositories/ConteoEntregasRepository";
import { ConteoHoyGestionRepository } from "@/lib/repositories/ConteoHoyGestionRepository";
import { ConteoPorStatusRepository } from "@/lib/repositories/ConteoPorStatusRepository";
import { ConteoProductosRepository } from "@/lib/repositories/ConteoProductosRepository";
import { DineroProductosRepository } from "@/lib/repositories/DineroProductosRepository";
import { InformeTransitoRepository } from "@/lib/repositories/InformeTransitoRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo71, type EmpresaGeo71 } from "./_fixtures/geo-71";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-71 (T0.2; design §11) — ANTIVACIO del fixture `geo-71.ts`. Corre cada lectura del alcance con
// el repositorio de HOY sobre cada empresa del fixture, como la app (RLS de la empresa, actor
// `maestro`, sin faceta), y exige al menos una fila en cada una. Un fixture roto no puede dejar en
// verde, por vacios, los tests de analitica, transito y los scripts.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

function actorMaestro() {
  return { usuarioId: randomUUID(), rol: "maestro" };
}

function consultaEntregas(raw: object): ConsultaConteoEntregas {
  const p = prepararConteoEntregas(raw, actorMaestro());
  if (p.status !== "ok") throw new Error(`consulta de prueba no concedida: ${JSON.stringify(p)}`);
  return p.consulta;
}

function consultaProductos(raw: object): ConsultaProductos {
  const p = prepararConsultaProductos(raw, actorMaestro());
  if (p.status !== "ok") throw new Error(`consulta de productos no concedida: ${JSON.stringify(p)}`);
  return p.consulta;
}

/** Filas que da cada lectura en la empresa `e`, leida como la app. */
async function contarLecturas(tx: TxDeTest, e: EmpresaGeo71) {
  await comoApp(tx, e.base.base.empresaId);
  const cliente = tx as unknown as PrismaClient;
  const todo = consultaEntregas({});
  const mes = consultaEntregas({ rango: "mes" });
  const dia = consultaEntregas({ rango: "dia" });
  const productos = consultaProductos({});
  if (dia.rango === null) throw new Error("el rango «dia» no se resolvio");

  const porStatus = await new ConteoPorStatusRepository(cliente).contarPorStatus(todo);
  const entregas = await new ConteoEntregasRepository(new ConteoPorStatusRepository(cliente)).contar(todo);
  const cargadas = await new ConteoCargadasPorDiaRepository(cliente).contarCargadasPorDia(todo);
  const devoluciones = await new ConteoDevolucionesRepository(cliente).contarDevolucionesPorCausa(todo);
  const ciclo = await new CicloVidaRepository(cliente).acumularCiclos(todo);
  const conteoProductos = await new ConteoProductosRepository(cliente).contarProductos(productos);
  const dinero = await new DineroProductosRepository(cliente).leerDineroPorOrden(productos);
  const cohortes = await new CohorteCargaRepository(cliente).contarCohortes(mes);
  const hoy = await new ConteoHoyGestionRepository(cliente).contarDeHoy(todo, dia.rango);
  const zonas = e.base.base.zonas;
  const corte = new Date();
  const transito = await new InformeTransitoRepository(cliente).filasEnAlerta({
    hito: "entrada_bodega_central",
    estados: ["en_bodega_central"],
    cortes: [zonas.centralId, zonas.norteId, zonas.surId].map((zonaId) => ({ zonaId, corte })),
  });
  await comoDueno(tx);

  return {
    porStatus: porStatus.reduce((s, f) => s + f.conteo, 0),
    entregas: Object.values(entregas.porDesenlace).reduce((s, n) => s + n, 0),
    cargadas: cargadas.reduce((s, f) => s + f.conteo, 0),
    devoluciones: devoluciones.reduce((s, f) => s + f.conteo, 0),
    ciclo: ciclo.n,
    productos: conteoProductos.length,
    dinero: dinero.estado === "ok" ? dinero.filas.length : -1,
    cohortes: cohortes.reduce((s, f) => s + f.n, 0),
    hoy: hoy.sinGestion + hoy.conGestion,
    transito: transito.length,
    transitoIds: transito.map((f) => f.ordenId).sort(),
  };
}

describeSiHayBase("SLT-71 T0.2 — fixture geo-71 (antivacio)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("cada lectura de analitica, las que comparten el recorte y transito tienen filas en cada empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const segundas = await tx.orden.count({
        where: { id: { in: Object.values(e.cr.ordenes) }, provinciaId: e.cr.segunda.provinciaId },
      });
      return {
        cr: await contarLecturas(tx, e.cr),
        xa: await contarLecturas(tx, e.xa),
        segundas,
        transitoCr: [e.cr.ordenes.transitoConDistritoId, e.cr.ordenes.transitoSinDistritoId].sort(),
        transitoXa: [e.xa.ordenes.transitoConDistritoId, e.xa.ordenes.transitoSinDistritoId].sort(),
      };
    });

    for (const cuenta of [r.cr, r.xa]) {
      expect(cuenta.porStatus).toBeGreaterThan(0);
      expect(cuenta.entregas).toBeGreaterThan(0);
      expect(cuenta.cargadas).toBeGreaterThan(0);
      expect(cuenta.devoluciones).toBe(2);
      expect(cuenta.ciclo).toBeGreaterThan(0);
      expect(cuenta.productos).toBeGreaterThan(0);
      expect(cuenta.dinero).toBeGreaterThan(0);
      expect(cuenta.cohortes).toBeGreaterThan(0);
      expect(cuenta.hoy).toBeGreaterThan(0);
    }
    // Las dos de transito, con y sin distrito, y solo ellas: la RLS deja fuera las de la otra empresa.
    expect(r.cr.transitoIds).toEqual(r.transitoCr);
    expect(r.xa.transitoIds).toEqual(r.transitoXa);
    // Tres ordenes en la segunda provincia (entregada, devuelta y la de transito sin distrito).
    expect(r.segundas).toBe(3);
  });
});
