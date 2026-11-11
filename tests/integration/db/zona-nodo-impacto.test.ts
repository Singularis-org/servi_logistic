import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  comoLaEmpresa,
  crearEscenarioSlt89,
  guardado,
  repoDeZonas,
  zonasDeOrdenes,
  type EscenarioSlt89,
} from "./_fixtures/slt89-zonas";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R13, R14, R15 (T4.2; design §5.3) — EL AVISO DE IMPACTO, contra Postgres real
 * (`slt89-zonas.ts`, empresa `XA`, como la app):
 *
 *   · cifras por categoria al asignar el canton a la zona sur: cambian de zona 3 (las dos que heredan
 *     y la desalineada que la 366 realinea), en el estante 2, con gestion final 1, ya en un cierre 1;
 *   · aviso = guardado (R15): `ordenesReconciliadas` y `ordenesRetenidasEnBodegaSatelite` del guardado
 *     que sigue son «cambian de zona» y «en el estante»;
 *   · ninguna escritura: las filas de las tablas que el guardado toca no cambian, y la transaccion del
 *     test sigue pudiendo escribir despues (la de solo lectura se revierte);
 *   · «cambian de tarifa» (R14): sin activar = «cambian de zona»; activada, cuenta tambien la orden que
 *     no cambia de zona pero pierde su grupo (un miembro heredado que el guardado saca del grupo).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const TABLAS = [
  "orden",
  "zona",
  "zona_distrito",
  "zona_nodo",
  "grupo_distritos",
  "grupo_distritos_distrito",
  "grupo_distritos_nodo",
  "historial_accion",
] as const;

/** Cuantas filas tiene cada tabla que un guardado de zona toca. */
async function filas(tx: TxDeTest): Promise<Record<string, number>> {
  const salida: Record<string, number> = {};
  for (const t of TABLAS) {
    const [f] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${t}`);
    salida[t] = f.n;
  }
  return salida;
}

/** Activa las tarifas nuevas (SLT-54) de la empresa, como dueño. */
async function activar(tx: TxDeTest, empresaId: string): Promise<void> {
  await comoDueno(tx);
  await fijarEmpresa(tx, empresaId);
  await tx.$executeRawUnsafe(`INSERT INTO tarifa_activacion (id, organizacion_id) VALUES ($1, $2)`, randomUUID(), empresaId);
}

/** Un grupo de la zona con un miembro en `grupo_distritos_nodo` (un nodo que la zona hereda). */
async function grupoConMiembroHeredado(tx: TxDeTest, empresaId: string, zonaId: string, nodoId: string): Promise<string> {
  await comoDueno(tx);
  await fijarEmpresa(tx, empresaId);
  const grupoId = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO grupo_distritos (id, organizacion_id, zona_id, nombre) VALUES ($1, $2, $3, 'Grupo heredado SLT-89')`,
    grupoId,
    empresaId,
    zonaId,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO grupo_distritos_nodo (id, organizacion_id, grupo_id, zona_id, nodo_geografico_id) VALUES ($1, $2, $3, $4, $5)`,
    randomUUID(),
    empresaId,
    grupoId,
    zonaId,
    nodoId,
  );
  return grupoId;
}

describeSiHayBase("SLT-89 · R13/R14/R15 — el aviso de impacto de un guardado de nodos", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioSlt89) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioSlt89(tx)));
  }

  it("⭑ R13/R15: cifras por categoria, ninguna escritura, y el guardado que sigue da las mismas cifras", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      const ids = [...Object.values(e.emp.ordenes), e.ordenEstanteSinZonaId];
      const filasAntes = await filas(tx);
      const zonasAntes = await zonasDeOrdenes(tx, ids);
      const impacto = await comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).impactoDeAsignacion({
          zonaId: zonas.surId,
          distritoIds: [geo.distritoBajoCantonRetiradoId],
          nodoIds: [geo.cantonId],
        }),
      );
      const filasTrasAviso = await filas(tx);
      const zonasTrasAviso = await zonasDeOrdenes(tx, ids);
      // La transaccion del test sigue escribiendo: el modo de solo lectura no sobrevivio al aviso.
      const datos = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.cantonId] });
      const guardadoRes = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      return { impacto, filasAntes, filasTrasAviso, zonasAntes, zonasTrasAviso, guardadoRes };
    });
    expect(r.impacto).toEqual({
      cambianDeZona: 3,
      cambianDeTarifa: 3,
      noSeMueven: { enBodegaSatelite: 2, conGestionFinal: 1, enCierre: 1 },
    });
    expect(r.filasTrasAviso).toEqual(r.filasAntes);
    expect(r.zonasTrasAviso).toEqual(r.zonasAntes);
    expect(r.guardadoRes).toMatchObject({
      estado: "ok",
      ordenesReconciliadas: r.impacto?.cambianDeZona,
      ordenesRetenidasEnBodegaSatelite: r.impacto?.noSeMueven.enBodegaSatelite,
    });
  });

  it("una zona nueva (sin `zonaId`) con el canton: las mismas que heredan cambian de zona; la zona que no existe da `null`", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo } = e.emp.base;
      const nueva = await comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).impactoDeAsignacion({ zonaId: null, distritoIds: [], nodoIds: [geo.cantonId] }),
      );
      const inexistente = await comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).impactoDeAsignacion({ zonaId: "no-existe-slt89", distritoIds: [], nodoIds: [geo.cantonId] }),
      );
      return { nueva, inexistente };
    });
    // Las dos que heredan el canton, mas la desalineada (la realinea a central, su zona de siempre).
    expect(r.nueva?.cambianDeZona).toBe(3);
    expect(r.inexistente).toBeNull();
  });

  it("⭑ R14: activada, cuenta la orden que se queda en su zona pero pierde su grupo; sin activar, no", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      // El canton ya es de sur y el distrito «sin zona» (que lo hereda) es miembro de un grupo de sur.
      const datos = await guardado(tx, zonas.surId, { distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [geo.cantonId] });
      await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(zonas.surId, datos, e.maestroId));
      await grupoConMiembroHeredado(tx, e.empresaId, zonas.surId, geo.distritoSinZonaId);
      // El aviso de quitarle el canton a sur: «sin zona» se queda sin cobertura (0 zonas, no se mueve)
      // y su miembro sale del grupo.
      const quitar = { zonaId: zonas.surId, distritoIds: [geo.distritoBajoCantonRetiradoId], nodoIds: [] };
      const sinActivar = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).impactoDeAsignacion(quitar));
      await activar(tx, e.empresaId);
      const activada = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).impactoDeAsignacion(quitar));
      return { sinActivar, activada };
    });
    expect(r.sinActivar).toMatchObject({ cambianDeZona: 0, cambianDeTarifa: 0 });
    expect(r.activada).toMatchObject({ cambianDeZona: 0, cambianDeTarifa: 1 });
  });

  it("R14: activada y sin grupos, «cambian de tarifa» = «cambian de zona»", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { geo, zonas } = e.emp.base;
      await activar(tx, e.empresaId);
      return comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).impactoDeAsignacion({
          zonaId: zonas.surId,
          distritoIds: [geo.distritoBajoCantonRetiradoId],
          nodoIds: [geo.cantonId],
        }),
      );
    });
    expect(r).toMatchObject({ cambianDeZona: 3, cambianDeTarifa: 3 });
  });
});
