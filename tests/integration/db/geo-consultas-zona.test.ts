import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { UpdateZonaResult } from "@/lib/interfaces/repositories/IZonaRepository";
import { planificarReconciliacion, type PlanDeReconciliacion } from "@/lib/repositories/ZonaRepository";
import { planDeHoy, type PlanDeHoy } from "@/scripts/geo-equivalencia/consultas-de-hoy";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo65, type EmpresaGeo65, type EscenarioGeo65 } from "./_fixtures/geo-65";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { ZonaRepositoryConAntes } from "./_fixtures/antes-de-zona";

// SLT-65 (T4.2; R13–R15, R17; design §6, §14) — LA ZONA DE LAS ORDENES AL GUARDAR UNA ZONA, DEL
// CATALOGO, contra la copia congelada de hoy (`planDeHoy`) y sobre Postgres real.
//
// Todo corre como la app: `servi_app` con la empresa fijada (`comoApp`) y la empresa en el contexto
// (`conEmpresa`), sobre la transaccion revertida del test (`clienteConSavepoint`).
//
// La herencia (una asignacion en un canton) no se puede escribir en la base: la FK de `zona_distrito`
// es a `distrito`. Se prueba cambiando la ENTRADA, como `conAsignacionEnCanton` en SLT-44: la carga
// del catalogo ve una fila mas de `zonaDistrito.findMany`, con el id del canton.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface ZonaAsignada {
  id: string;
  nombre: string;
  esCentral: boolean;
}

/** Envuelve el cliente (y el de sus transacciones) cambiando un delegado. */
function envolverDelegado(
  cliente: PrismaClient,
  delegado: "zonaDistrito" | "nodoGeografico",
  findMany: (real: (args: unknown) => Promise<unknown[]>, args: unknown) => Promise<unknown[]>,
): PrismaClient {
  const envolver = (objetivo: object): PrismaClient => {
    const proxy: unknown = new Proxy(objetivo, {
      get(o, prop) {
        if (prop === delegado) {
          const real = Reflect.get(o, prop) as { findMany: (args: unknown) => Promise<unknown[]> };
          return { ...real, findMany: (args: unknown) => findMany((a) => real.findMany(a), args) };
        }
        if (prop === "$transaction") {
          const real = Reflect.get(o, prop) as (fn: (t: object) => unknown, op?: unknown) => Promise<unknown>;
          return (fn: (t: unknown) => unknown, op?: unknown) => real.call(o, (t: object) => fn(envolver(t)), op);
        }
        const valor = Reflect.get(o, prop) as unknown;
        return typeof valor === "function" ? valor.bind(o) : valor;
      },
    });
    return proxy as PrismaClient;
  };
  return envolver(cliente as unknown as object);
}

/** La carga del catalogo ve, ademas, `zona` asignada al canton `cantonId`. */
function conAsignacionEnCanton(cliente: PrismaClient, cantonId: string, zona: ZonaAsignada): PrismaClient {
  return envolverDelegado(cliente, "zonaDistrito", async (real, args) => [
    ...(await real(args)),
    { distritoId: cantonId, zona },
  ]);
}

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo65, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.empresaId);
  try {
    return await conEmpresa(e.base.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** El plan como valor comparable: zona → ids ordenados, por zona ordenada. */
function comparable(p: PlanDeReconciliacion | PlanDeHoy) {
  return {
    porZona: [...p.porZona.entries()]
      .map(([zonaId, ordenes]) => [zonaId, ordenes.map((o) => o.id).sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
    retenidas: p.retenidasEnBodegaSatelite,
  };
}

function idsDe(p: PlanDeReconciliacion, zonaId: string): string[] {
  return (p.porZona.get(zonaId) ?? []).map((o) => o.id);
}

function todosLosDistritos(e: EmpresaGeo65): string[] {
  const g = e.base.geo;
  return [g.distritoCentralId, g.distritoDosZonasId, g.distritoSinZonaId, g.distritoRetiradoId, g.distritoBajoCantonRetiradoId];
}

function soloOk(r: UpdateZonaResult): Extract<UpdateZonaResult, { estado: "ok" }> {
  if (r.estado !== "ok") throw new Error(`se esperaba \`ok\` y llego \`${r.estado}\``);
  return r;
}

describeSiHayBase("SLT-65 T4.2 — la reconciliacion al guardar una zona usa el catalogo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo65) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioGeo65(tx)));
  }

  async function zonaDe(tx: TxDeTest, id: string): Promise<string> {
    const o = await tx.orden.findUniqueOrThrow({ where: { id }, select: { zonaId: true } });
    return o.zonaId;
  }

  it("R13, R15: con asignaciones solo en distritos, el plan es el de hoy (mismas ordenes, zonas y retenidas)", async () => {
    const r = await conEscenario(async (tx, e) => {
      const salida = [];
      for (const empresa of [e.cr, e.xa]) {
        const planes = await comoLaEmpresa(tx, empresa, async () => {
          const cliente = clienteConSavepoint(tx);
          const nodos = todosLosDistritos(empresa);
          return { deHoy: await planDeHoy(cliente, nodos), nuevo: await planificarReconciliacion(cliente, nodos) };
        });
        salida.push({ empresa, ...planes });
      }
      return salida;
    });

    for (const { empresa, deHoy, nuevo } of r) {
      expect(comparable(nuevo)).toEqual(comparable(deHoy));
      // Antivacio: la comparacion no es entre dos planes vacios.
      const { ordenes, base: b } = empresa;
      expect(comparable(nuevo)).toEqual({ porZona: [[b.zonas.centralId, [ordenes.desalineadaId]]], retenidas: 1 });
      // R15: una orden sin distrito no se mueve (su lugar es un canton, que nunca esta entre los lugares).
      const movidas = [...nuevo.porZona.values()].flat().map((o) => o.id);
      expect(movidas).not.toContain(ordenes.sinDistritoId);
      expect(movidas).not.toContain(ordenes.sinDistritoCantonRetiradoId);
    }
  });

  it("R14: `update` mueve solo la zona de la desalineada, retiene la del estante, no toca la del cierre y firma un lote", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { base: b, ordenes } = e.xa;
      const res = await comoLaEmpresa(tx, e.xa, () =>
        new ZonaRepositoryConAntes(tx, clienteConSavepoint(tx)).update(
          b.zonas.centralId,
          { nombre: "Zona central SLT65", distritoIds: [b.geo.distritoCentralId] },
          null,
        ),
      );
      const historial = await tx.historialAccion.findMany({
        where: { accion: "orden_zona_reconciliada", entidadId: { in: Object.values(ordenes) } },
        select: { entidadId: true, loteId: true },
      });
      return {
        e,
        res,
        historial,
        desalineada: await zonaDe(tx, ordenes.desalineadaId),
        enEstante: await zonaDe(tx, ordenes.desalineadaEnEstanteId),
        enCierre: await zonaDe(tx, ordenes.desalineadaEnCierreId),
        crDesalineada: await zonaDe(tx, e.cr.ordenes.desalineadaId),
      };
    });

    const { zonas } = r.e.xa.base;
    expect(soloOk(r.res).ordenesReconciliadas).toBe(1);
    expect(soloOk(r.res).ordenesRetenidasEnBodegaSatelite).toBe(1);
    expect(r.desalineada).toBe(zonas.centralId);
    expect(r.enEstante).toBe(zonas.norteId);
    expect(r.enCierre).toBe(zonas.norteId);
    // La otra empresa no se toca.
    expect(r.crDesalineada).toBe(r.e.cr.base.zonas.norteId);
    expect(r.historial.map((h) => h.entidadId)).toEqual([r.e.xa.ordenes.desalineadaId]);
    expect(new Set(r.historial.map((h) => h.loteId)).size).toBe(1);
  });

  it("R17: el plan ve la asignacion que el guardado acaba de escribir, y el catalogo es solo del pais de la empresa", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { base: b, ordenes } = e.xa;
      const nodosLeidos = new Set<string>();
      const cliente = envolverDelegado(clienteConSavepoint(tx), "nodoGeografico", async (real, args) => {
        const filas = await real(args);
        for (const f of filas as { id: string }[]) nodosLeidos.add(f.id);
        return filas;
      });
      const antes = await zonaDe(tx, ordenes.enDistritoSinZonaId);
      // La zona norte gana el distrito «sin zona»: hasta este guardado no tenia ninguna asignacion.
      const res = await comoLaEmpresa(tx, e.xa, () =>
        new ZonaRepositoryConAntes(tx, cliente).update(
          b.zonas.norteId,
          {
            nombre: "Zona norte SLT65",
            distritoIds: [b.geo.distritoDosZonasId, b.geo.distritoRetiradoId, b.geo.distritoSinZonaId],
          },
          null,
        ),
      );
      return { e, res, antes, despues: await zonaDe(tx, ordenes.enDistritoSinZonaId), nodosLeidos };
    });

    const { xa, cr } = r.e;
    expect(r.antes).toBe(xa.base.zonas.centralId);
    expect(r.despues).toBe(xa.base.zonas.norteId);
    expect(soloOk(r.res).ordenesReconciliadas).toBe(1);
    // El catalogo cargado dentro del guardado es el de `XA`: tiene sus nodos y ninguno de Costa Rica.
    expect(r.nodosLeidos.has(xa.base.geo.distritoSinZonaId)).toBe(true);
    expect(r.nodosLeidos.has(xa.base.geo.cantonId)).toBe(true);
    expect(r.nodosLeidos.has(cr.base.geo.distritoSinZonaId)).toBe(false);
    expect(r.nodosLeidos.has(cr.base.geo.cantonId)).toBe(false);
  });

  it("R13: una asignacion en un canton mueve la orden sin distrito y la del distrito sin asignacion propia; gana la mas especifica", async () => {
    const r = await conEscenario(async (tx, e) => {
      const salida = [];
      for (const empresa of [e.cr, e.xa]) {
        const { base: b } = empresa;
        const sur = await tx.zona.findUniqueOrThrow({
          where: { id: b.zonas.surId },
          select: { id: true, nombre: true, esCentral: true },
        });
        const plan = await comoLaEmpresa(tx, empresa, () =>
          planificarReconciliacion(conAsignacionEnCanton(clienteConSavepoint(tx), b.geo.cantonId, sur), [b.geo.cantonId]),
        );
        salida.push({ empresa, plan });
      }
      return salida;
    });

    for (const { empresa, plan } of r) {
      const { ordenes, zonas } = { ordenes: empresa.ordenes, zonas: empresa.base.zonas };
      // El canton (su lugar) y el distrito sin asignacion propia heredan la zona sur del canton.
      expect(idsDe(plan, zonas.surId).sort()).toEqual([ordenes.sinDistritoId, ordenes.enDistritoSinZonaId].sort());
      // El distrito central tiene asignacion propia: sus ordenes van a la central, no a la sur.
      expect(idsDe(plan, zonas.centralId)).toEqual([ordenes.desalineadaId]);
      // El distrito de dos zonas tiene asignacion propia ambigua: no sube al canton, no se mueve.
      const movidas = [...plan.porZona.values()].flat().map((o) => o.id);
      expect(movidas).not.toContain(ordenes.conDistritoSinMarcaId);
      // La gestionada sigue fuera por el corte de siempre (R14), y la del estante se cuenta.
      expect(movidas).not.toContain(ordenes.sinDistritoGestionadaId);
      expect(plan.retenidasEnBodegaSatelite).toBe(1);
    }
  });
});
