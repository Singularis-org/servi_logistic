import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { gruposDeDistritos } from "@/lib/repositories/_shared/resolver-tarifas";
import { planificarReconciliacion, type PlanDeReconciliacion } from "@/lib/repositories/ZonaRepository";
import { planDeHoy, type PlanDeHoy } from "@/scripts/geo-equivalencia/consultas-de-hoy";
import * as hoy from "@/scripts/geo-equivalencia/lecturas-de-hoy";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { crearEscenarioGeo65, type EmpresaGeo65 } from "./_fixtures/geo-65";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { comoLaEmpresa, guardado, repoDeZonas } from "./_fixtures/slt89-zonas";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest } from "./_postgres-real";

/**
 * SLT-89 · R38 (T6.2; design §9) — COSTA RICA IGUAL: con las tablas nuevas vacias (el estado de la
 * empresa de Costa Rica el dia del deploy), cada lectura y el plan del guardado dan exactamente lo que
 * da la lectura congelada de `scripts/geo-equivalencia/` (`lecturas-de-hoy.ts`, `consultas-de-hoy.ts`):
 *
 *   · zona por distrito de cada canton (la de la carga y la cotizacion v1);
 *   · cobertura (Excel) y arbol de zonas de 3 niveles;
 *   · plan de la reconciliacion de un guardado (mismas ordenes, zonas y retenidas);
 *   · grupo por par (zona, distrito): el de `grupo_distritos_distrito`, sin cargar nada mas;
 *   · un guardado de zona con solo distritos no escribe en `zona_nodo` ni en `grupo_distritos_nodo` ni
 *     deja `zona_nodo_cambiado`.
 *
 * Empresa de Costa Rica de `geo-65.ts` (zonas solo por distrito), leida como la app. Todo se revierte.
 * El cobro y el pago del resolver los fijan sus suites (`tarifas-flexibles-resolver`, cierres), que
 * pasan sin cambiar aserciones salvo el numero de consultas por lote (decision del 2026-11-10).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

function comparable(p: PlanDeReconciliacion | PlanDeHoy) {
  return {
    porZona: [...p.porZona.entries()]
      .map(([zonaId, ordenes]) => [zonaId, ordenes.map((o) => o.id).sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
    retenidas: p.retenidasEnBodegaSatelite,
  };
}

function distritos(e: EmpresaGeo65): string[] {
  const g = e.base.geo;
  return [g.distritoCentralId, g.distritoDosZonasId, g.distritoSinZonaId, g.distritoRetiradoId, g.distritoBajoCantonRetiradoId];
}

describeSiHayBase("SLT-89 · R38 — con las tablas nuevas vacias, Costa Rica da lo de antes", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("⭑ zona por distrito, cobertura, arbol y plan del guardado: iguales a la lectura congelada", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const cr = e.cr;
      const vacias = await tx.$queryRawUnsafe<{ zn: number; gn: number }[]>(
        `SELECT (SELECT count(*)::int FROM zona_nodo) AS zn, (SELECT count(*)::int FROM grupo_distritos_nodo) AS gn`,
      );
      return comoLaEmpresa(tx, cr.base.empresaId, async () => {
        const cliente = clienteConSavepoint(tx);
        const cantones = [cr.base.geo.cantonId, cr.base.geo.cantonRetiradoId];
        return {
          vacias: vacias[0],
          zonas: {
            nuevo: await new OrdenRepository(cliente).findDistritosByCantonIds(cantones),
            deHoy: await hoy.findDistritosByCantonIds(tx, cantones),
          },
          cobertura: { nuevo: await new CoberturaRepository(cliente).listDistritos(), deHoy: await hoy.listDistritos(tx) },
          arbol: { nuevo: await new GeoRepository(cliente).listArbol(), deHoy: await hoy.listArbol(tx) },
          plan: {
            nuevo: comparable(await planificarReconciliacion(cliente, distritos(cr))),
            deHoy: comparable(await planDeHoy(cliente, distritos(cr))),
          },
        };
      });
    });
    // PREMISA: el estado de Costa Rica el dia del deploy.
    expect(r.vacias).toEqual({ zn: 0, gn: 0 });
    // El orden de `findDistritosByCantonIds` no es contrato (la carga indexa por nombre): por id.
    const porId = <T extends { id: string }>(xs: T[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id));
    expect(porId(r.zonas.nuevo)).toEqual(porId(r.zonas.deHoy));
    // Como `geo-lecturas-catalogo`: ni las filas ni las zonas de una fila tienen orden garantizado.
    const normal = (filas: typeof r.cobertura.nuevo) =>
      filas
        .map((f) => ({ ...f, zonas: [...f.zonas].sort((a, b) => a.id.localeCompare(b.id)) }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    // SLT-125 (A12): todo menos `ruta` (P5), que la lectura de hoy no tiene.
    expect(normal(r.cobertura.nuevo.map((f) => ({ ...f, ruta: undefined })))).toEqual(normal(r.cobertura.deHoy));
    expect(r.arbol.nuevo).toEqual(r.arbol.deHoy);
    expect(r.plan.nuevo).toEqual(r.plan.deHoy);
    // Antivacio: hay algo que comparar.
    expect(r.zonas.deHoy.length).toBeGreaterThan(0);
    expect(r.plan.deHoy.porZona.length).toBeGreaterThan(0);
  });

  it("⭑ grupo por par: el de `grupo_distritos_distrito`, igual que antes", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const { base: b } = e.cr;
      await comoDueno(tx);
      await fijarEmpresa(tx, b.empresaId);
      const grupoId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO grupo_distritos (id, organizacion_id, zona_id, nombre) VALUES ($1, $2, $3, 'Grupo CR SLT-89')`,
        grupoId,
        b.empresaId,
        b.zonas.centralId,
      );
      await tx.grupoDistritosDistrito.create({
        data: { grupoId, zonaId: b.zonas.centralId, distritoId: b.geo.distritoCentralId },
      });
      const pares = [
        { zonaId: b.zonas.centralId, distritoId: b.geo.distritoCentralId },
        { zonaId: b.zonas.centralId, distritoId: b.geo.distritoSinZonaId },
        { zonaId: b.zonas.norteId, distritoId: b.geo.distritoDosZonasId },
        { zonaId: b.zonas.centralId, distritoId: null },
      ];
      // «Antes» de SLT-89: el grupo de un par es su fila en la tabla vieja, y nada mas.
      const deLaVieja = await tx.grupoDistritosDistrito.findMany({
        where: { OR: pares.flatMap((p) => (p.distritoId === null ? [] : [{ zonaId: p.zonaId, distritoId: p.distritoId }])) },
        select: { zonaId: true, distritoId: true, grupoId: true },
      });
      const nuevo = await comoLaEmpresa(tx, b.empresaId, () => gruposDeDistritos(clienteConSavepoint(tx), pares));
      return { grupoId, deHoy: new Map(deLaVieja.map((f) => [`${f.zonaId}|${f.distritoId}`, f.grupoId])), nuevo, b };
    });
    expect([...r.nuevo.entries()].sort()).toEqual([...r.deHoy.entries()].sort());
    expect(r.nuevo.get(`${r.b.zonas.centralId}|${r.b.geo.distritoCentralId}`)).toBe(r.grupoId);
  });

  it("un guardado de zona con solo distritos no escribe en las tablas nuevas ni deja `zona_nodo_cambiado`", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      const { base: b } = e.cr;
      const datos = await guardado(tx, b.zonas.norteId, {
        distritoIds: [b.geo.distritoDosZonasId, b.geo.distritoRetiradoId, b.geo.distritoSinZonaId],
        nodoIds: [],
      });
      const res = await comoLaEmpresa(tx, b.empresaId, () => repoDeZonas(tx).update(b.zonas.norteId, datos, null));
      const [cuentas] = await tx.$queryRawUnsafe<{ zn: number; gn: number; hn: number }[]>(
        `SELECT (SELECT count(*)::int FROM zona_nodo) AS zn,
                (SELECT count(*)::int FROM grupo_distritos_nodo) AS gn,
                (SELECT count(*)::int FROM historial_accion WHERE accion = 'zona_nodo_cambiado') AS hn`,
      );
      return { res, cuentas };
    });
    expect(r.res.estado).toBe("ok");
    expect(r.res.estado === "ok" && r.res.zona.nodosCount).toBe(0);
    expect(r.cuentas).toEqual({ zn: 0, gn: 0, hn: 0 });
  });
});
