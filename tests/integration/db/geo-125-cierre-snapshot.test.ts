import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { ubicacionSnapshotV1Schema } from "@/lib/types/ubicacion-snapshot";
import { aplicar } from "@/scripts/geo-backfill-nodo";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo125, type EmpresaGeo125, type EscenarioGeo125 } from "./_fixtures/geo-125";
import { vaciarColumnasNuevas } from "./_fixtures/geo-43";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-125 T2.2 (design §2.1, §4.3; R18, R21, R22, R23) — EL `ubicacion_snapshot` QUE ESCRIBE UN CIERRE
// NUEVO, sobre Postgres real y el fixture `geo-125` (CR y `XA`, que tiene un nivel 4 solo en el catalogo).
//
// `crearCierre` corre como la app (`comoApp` + `conEmpresa`) sobre la transaccion revertida del test;
// `clienteConSavepoint` hace de su `$transaction` un SAVEPOINT, asi que un cierre que falla se revierte
// de verdad (R23). Lo esperado se mide como dueño, sin RLS, directamente de las tablas.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

type Modelo = "tipoNivelGeografico" | "nodoGeografico";

/**
 * El cliente con lo que devuelve `modelo.findMany` retocado. Envuelve tambien el cliente que entrega el
 * `$transaction`, que es el que lee `crearCierre`. Mismo patron que `geo-consultas-cierre.test.ts`:
 * un catalogo sin tipos o sin un nodo no se puede escribir en la base, asi que se cambia la ENTRADA.
 */
function conFindManyRetocado(
  cliente: PrismaClient,
  modelo: Modelo,
  retocar: (filas: unknown[]) => unknown[],
): PrismaClient {
  const envolver = (objetivo: object): PrismaClient => {
    const proxy: unknown = new Proxy(objetivo, {
      get(o, prop) {
        if (prop === modelo) {
          const real = Reflect.get(o, prop) as { findMany: (a: unknown) => Promise<unknown[]> };
          return { findMany: async (args: unknown) => retocar(await real.findMany(args)) };
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

async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo125, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.empresaId);
  try {
    return await conEmpresa(e.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

function solicitar(cliente: PrismaClient, e: EmpresaGeo125): Promise<string | null> {
  return new CierreDiaRepository(cliente, new TarifaVigenteRepository(cliente)).crearCierre({
    ...e.paraSolicitarCierre,
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    pagoByGestionId: {},
    totalPagoMensajero: "0.00",
    ingresoByGestionId: {},
    totalIngresoBodegaRechazos: "0.00",
  });
}

interface FilaCongelada {
  id: string;
  ordenId: string;
  provinciaNombre: string;
  cantonNombre: string;
  distritoNombre: string | null;
  ubicacionSnapshot: unknown;
}

async function filasDelCierre(tx: TxDeTest, cierreId: string): Promise<FilaCongelada[]> {
  return tx.cierreDetail.findMany({
    where: { cierreId },
    orderBy: { ordenId: "asc" },
    select: {
      id: true,
      ordenId: true,
      provinciaNombre: true,
      cantonNombre: true,
      distritoNombre: true,
      ubicacionSnapshot: true,
    },
  });
}

/** Los FK de las ordenes y los tipos de nivel del pais de la empresa, medidos como dueño. */
async function lasOrdenesYSuPais(tx: TxDeTest, e: EmpresaGeo125) {
  const ordenes = await tx.orden.findMany({
    where: { id: { in: Object.values(e.ordenes) } },
    select: { id: true, provinciaId: true, cantonId: true, distritoId: true },
  });
  const org = await tx.organizacion.findUniqueOrThrow({ where: { id: e.empresaId }, select: { paisId: true } });
  const tipos = await tx.tipoNivelGeografico.findMany({
    where: { paisId: org.paisId },
    select: { clave: true, nombreSingular: true },
  });
  return {
    porOrden: new Map(ordenes.map((o) => [o.id, o])),
    tipoDe: new Map(tipos.map((t) => [t.clave, t.nombreSingular])),
    niveles: tipos.length,
  };
}

/** El cierre de la empresa por el repositorio, con sus filas y lo medido. */
async function cerrar(tx: TxDeTest, e: EmpresaGeo125) {
  const cierreId = await comoLaEmpresa(tx, e, () => solicitar(clienteConSavepoint(tx), e));
  if (cierreId === null) throw new Error("el cierre del fixture no vinculo ninguna gestion");
  return { cierreId, filas: await filasDelCierre(tx, cierreId), ...(await lasOrdenesYSuPais(tx, e)) };
}

/** Lo que el cierre deja en la base tras un intento: cierres del mensajero, vinculadas y filas. */
async function rastroDelIntento(tx: TxDeTest, e: EmpresaGeo125) {
  return {
    cierres: await tx.cierreDia.count({ where: { mensajeroId: e.mensajeroId } }),
    vinculadas: await tx.gestionOrden.count({ where: { id: { in: e.gestionesSinCierreIds }, cierreId: { not: null } } }),
    detalle: await tx.cierreDetail.count({ where: { ordenId: { in: Object.values(e.ordenes) } } }),
  };
}

describeSiHayBase("SLT-125 T2.2 — el cierre escribe ubicacion_snapshot (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo125) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioGeo125(tx)));
  }

  it("R21: cada fila nueva lleva {v:1, niveles} de la raiz a la hoja, con profundidad, tipo del pais, nombre e id, y sigue escribiendo las 3 columnas", async () => {
    const r = await conEscenario(async (tx, e) => ({ cr: await cerrar(tx, e.cr), xa: await cerrar(tx, e.xa) }));

    for (const [pais, c] of Object.entries(r)) {
      // Antivacio: las tres ordenes del mensajero, con y sin distrito.
      expect(c.filas, pais).toHaveLength(3);
      // XA tiene 4 niveles en el catalogo y CR 3: el tipo se lee del pais, no se supone.
      expect(c.niveles, pais).toBe(pais === "xa" ? 4 : 3);
      for (const f of c.filas) {
        const o = c.porOrden.get(f.ordenId);
        if (o === undefined) throw new Error(`orden ${f.ordenId} fuera del fixture`);
        const snapshot = ubicacionSnapshotV1Schema.parse(f.ubicacionSnapshot);
        const esperados = [
          { profundidad: 1, tipo: c.tipoDe.get("nivel_1"), nombre: f.provinciaNombre, id: o.provinciaId },
          { profundidad: 2, tipo: c.tipoDe.get("nivel_2"), nombre: f.cantonNombre, id: o.cantonId },
          ...(o.distritoId === null
            ? []
            : [{ profundidad: 3, tipo: c.tipoDe.get("nivel_3"), nombre: f.distritoNombre, id: o.distritoId }]),
        ];
        // Mismos nombres que las 3 columnas (salen del mismo congelado) y, en XA, sin nivel 4 (P1).
        expect(snapshot, `${pais} ${f.ordenId}`).toEqual({ v: 1, niveles: esperados });
        expect(f.provinciaNombre).not.toBe("");
      }
      const sinDistrito = c.filas.find((f) => f.distritoNombre === null);
      expect(ubicacionSnapshotV1Schema.parse(sinDistrito?.ubicacionSnapshot).niveles, pais).toHaveLength(2);
    }
  }, 120_000);

  it("R22: en Costa Rica el snapshot de una fila nueva es igual al que escribe geo:backfill para esa fila", async () => {
    const r = await conEscenario(async (tx, e) => {
      const { cierreId, filas } = await cerrar(tx, e.cr);
      const deLaApp = new Map(filas.map((f) => [f.id, f.ubicacionSnapshot]));
      await vaciarColumnasNuevas(tx, { cierreDetail: filas.map((f) => f.id) });
      const vaciadas = await filasDelCierre(tx, cierreId);
      const backfill = await aplicar(tx, { tabla: "cierre_detail" });
      const delBackfill = new Map((await filasDelCierre(tx, cierreId)).map((f) => [f.id, f.ubicacionSnapshot]));
      return { deLaApp, vaciadas, backfill, delBackfill };
    });

    expect(r.backfill.rechazado).toBe(false);
    // Antivacio: de verdad se vaciaron y el script las volvio a llenar.
    expect(r.vaciadas.every((f) => f.ubicacionSnapshot === null)).toBe(true);
    expect(r.backfill.escritas.cierre_detail).toBeGreaterThanOrEqual(3);
    expect(r.deLaApp.size).toBe(3);
    expect(r.delBackfill).toEqual(r.deLaApp);
  }, 120_000);

  it("R23: si el snapshot no puede armarse (el pais sin tipos de nivel), el cierre entero se revierte", async () => {
    const r = await conEscenario(async (tx, e) => {
      const intento = await comoLaEmpresa(tx, e.cr, async () => {
        const cliente = conFindManyRetocado(clienteConSavepoint(tx), "tipoNivelGeografico", () => []);
        return solicitar(cliente, e.cr).then(
          (cierreId) => ({ cierreId, error: null as unknown }),
          (error: unknown) => ({ cierreId: null, error }),
        );
      });
      return { intento, rastro: await rastroDelIntento(tx, e.cr) };
    });

    expect(r.intento.cierreId).toBeNull();
    expect((r.intento.error as Error).name).toBe("TipoDeNivelAusente");
    expect(r.rastro).toEqual({ cierres: 0, vinculadas: 0, detalle: 0 });
  }, 120_000);

  it("R18: si el lugar de una orden no esta en el catalogo, crear el cierre sigue revirtiendose entero", async () => {
    const r = await conEscenario(async (tx, e) => {
      const orden = await tx.orden.findUniqueOrThrow({
        where: { id: e.cr.ordenes.sinDistritoId },
        select: { cantonId: true },
      });
      // Sin el canton de la orden sin distrito ni lo que cuelga de el: el catalogo sigue siendo un arbol.
      const fuera = new Set(
        (await tx.nodoGeografico.findMany({ where: { padreId: orden.cantonId }, select: { id: true } }))
          .map((n) => n.id)
          .concat(orden.cantonId),
      );
      const intento = await comoLaEmpresa(tx, e.cr, async () => {
        const cliente = conFindManyRetocado(clienteConSavepoint(tx), "nodoGeografico", (filas) =>
          (filas as { id: string }[]).filter((n) => !fuera.has(n.id)),
        );
        return solicitar(cliente, e.cr).then(
          (cierreId) => ({ cierreId, error: null as unknown }),
          (error: unknown) => ({ cierreId: null, error }),
        );
      });
      return { intento, rastro: await rastroDelIntento(tx, e.cr) };
    });

    expect(r.intento.cierreId).toBeNull();
    expect((r.intento.error as Error).message).toMatch(/snapshot del cierre: falta la fila de `(canton|distrito|nodo_geografico)`/);
    expect(r.rastro).toEqual({ cierres: 0, vinculadas: 0, detalle: 0 });
  }, 120_000);
});
