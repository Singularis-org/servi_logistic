import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import {
  CierreDiaRepository,
  SNAPSHOT_SELECT,
  leerDescriptivosDeOrdenes,
} from "@/lib/repositories/CierreDiaRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import * as hoy from "@/scripts/geo-equivalencia/consultas-de-hoy";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo65, type EmpresaGeo65, type EscenarioGeo65 } from "./_fixtures/geo-65";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { crearPrismaContado, type PrismaContado } from "./_consultas-en-vuelo";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-65 (T3.2; R5, R6, R7, R17; design §4, §14) — LO QUE CONGELA UN CIERRE NUEVO SALE DEL CATALOGO,
// contra la copia congelada de hoy (`scripts/geo-equivalencia/consultas-de-hoy.ts`) y sobre Postgres
// real.
//
// `crearCierre` corre como la app: `servi_app` con la empresa fijada (`comoApp`) y en el contexto
// (`conEmpresa`), sobre la transaccion revertida del test (`clienteConSavepoint`: su `$transaction`
// es un SAVEPOINT, asi que un cierre que falla se revierte de verdad).
//
// La herencia (marca en un canton) y el catalogo sin un nodo no se pueden escribir en la base: se
// prueban cambiando la ENTRADA, con un cliente que retoca lo que devuelve un modelo (como
// `conAsignacionEnCanton` en SLT-44).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** Lo que `cierre_detail` congela de la geografia, la zona y la tienda. */
const SELECT_CONGELADO = {
  ordenId: true,
  esCentral: true,
  esZonaEspecial: true,
  tiendaNombre: true,
  zonaNombre: true,
  provinciaNombre: true,
  cantonNombre: true,
  distritoNombre: true,
} as const;

/**
 * El cliente con lo que devuelve `modelo.findMany` retocado por `retocar`. Envuelve tambien el
 * cliente que el `$transaction` entrega, que es el que lee `crearCierre`.
 */
function conFindManyRetocado(
  cliente: PrismaClient,
  modelo: "distritoZonaEspecial" | "nodoGeografico" | "zonaDistrito",
  retocar: (filas: unknown[], args: unknown) => unknown[],
): PrismaClient {
  const envolver = (objetivo: object): PrismaClient => {
    const proxy: unknown = new Proxy(objetivo, {
      get(o, prop) {
        if (prop === modelo) {
          const real = Reflect.get(o, prop) as { findMany: (a: unknown) => Promise<unknown[]> };
          return { findMany: async (args: unknown) => retocar(await real.findMany(args), args) };
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

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo65, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.empresaId);
  try {
    return await conEmpresa(e.base.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** `crearCierre` del mensajero del fixture, que se lleva sus cuatro gestiones vigentes sin cierre. */
function solicitar(cliente: PrismaClient, e: EmpresaGeo65): Promise<string | null> {
  return new CierreDiaRepository(cliente, new TarifaVigenteRepository(cliente)).crearCierre({
    mensajeroId: e.mensajeroId,
    destinoTipo: "bodega_central",
    destinoZonaId: e.base.zonas.centralId,
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    pagoByGestionId: {},
    totalPagoMensajero: "0.00",
    ingresoByGestionId: {},
    totalIngresoBodegaRechazos: "0.00",
  });
}

async function congeladoDelCierre(cliente: PrismaClient, cierreId: string) {
  const filas = await cliente.cierreDetail.findMany({ where: { cierreId }, select: SELECT_CONGELADO });
  return new Map(filas.map(({ ordenId, ...resto }) => [ordenId, resto]));
}

describeSiHayBase("SLT-65 T3.2 — el cierre congela nombres y marca del catalogo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo65) => Promise<T>, cliente = base): Promise<T> {
    return revertida(cliente, async (tx) => fn(tx, await crearEscenarioGeo65(tx)));
  }

  it("R5: con marcas solo en distritos, cada fila congela lo mismo que la copia de hoy", async () => {
    const r = await conEscenario(async (tx, e) => {
      const salida = [];
      for (const empresa of [e.cr, e.xa]) {
        const leido = await comoLaEmpresa(tx, empresa, async () => {
          const cliente = clienteConSavepoint(tx);
          // Lo de hoy se lee antes del cierre, en la misma foto: las gestiones aun no tienen cierre.
          const filas = await cliente.gestionOrden.findMany({
            where: { id: { in: empresa.gestionesSinCierreIds } },
            select: SNAPSHOT_SELECT,
          });
          const descriptivos = await hoy.leerDescriptivosDeOrdenes(filas, cliente);
          const deHoy = new Map(filas.map((f) => [f.ordenId, hoy.congeladoDeHoy(f, descriptivos)]));
          const cierreId = await solicitar(cliente, empresa);
          if (cierreId === null) throw new Error("el cierre del fixture no vinculo ninguna gestion");
          return { deHoy, nuevo: await congeladoDelCierre(cliente, cierreId) };
        });
        salida.push({ empresa, ...leido });
      }
      return salida;
    });

    for (const { empresa, deHoy, nuevo } of r) {
      // Antivacio: las cuatro ordenes con gestion vigente, con y sin marca, con y sin distrito.
      expect(nuevo.size).toBe(empresa.gestionesSinCierreIds.length);
      expect(nuevo).toEqual(deHoy);
      const o = empresa.ordenes;
      expect(nuevo.get(o.conDistritoConMarcaId)?.esZonaEspecial).toBe(true);
      expect(nuevo.get(o.bajoCantonRetiradoId)?.esZonaEspecial).toBe(true);
      expect(nuevo.get(o.conDistritoSinMarcaId)?.esZonaEspecial).toBe(false);
      expect(nuevo.get(o.sinDistritoGestionadaId)).toMatchObject({ esZonaEspecial: false, distritoNombre: null });
    }
  });

  it("R5: con una marca inyectada en el canton, la orden sin distrito de ese canton congela `true`", async () => {
    const r = await conEscenario(async (tx, e) =>
      comoLaEmpresa(tx, e.cr, async () => {
        const cliente = conFindManyRetocado(clienteConSavepoint(tx), "distritoZonaEspecial", (filas) => [
          ...filas,
          { distritoId: e.cr.base.geo.cantonId },
        ]);
        const cierreId = await solicitar(cliente, e.cr);
        if (cierreId === null) throw new Error("el cierre del fixture no vinculo ninguna gestion");
        return { empresa: e.cr, nuevo: await congeladoDelCierre(cliente, cierreId) };
      }),
    );

    const o = r.empresa.ordenes;
    // Hoy las dos son «sin marca»; con la marca en su canton, la heredan las dos.
    expect(r.nuevo.get(o.sinDistritoGestionadaId)?.esZonaEspecial).toBe(true);
    expect(r.nuevo.get(o.conDistritoSinMarcaId)?.esZonaEspecial).toBe(true);
    // La del otro canton conserva la suya: la de su distrito.
    expect(r.nuevo.get(o.bajoCantonRetiradoId)?.esZonaEspecial).toBe(true);
  });

  it("R6: si el canton de una orden no esta en el catalogo, el cierre no se crea y no queda ninguna fila", async () => {
    const r = await conEscenario(async (tx, e) => {
      const g = e.cr.base.geo;
      // El canton retirado y lo que cuelga de el: el catalogo inyectado sigue siendo un arbol.
      const fuera = new Set([g.cantonRetiradoId, g.distritoBajoCantonRetiradoId]);
      const intento = await comoLaEmpresa(tx, e.cr, async () => {
        const cliente = conFindManyRetocado(clienteConSavepoint(tx), "nodoGeografico", (filas) =>
          (filas as { id: string }[]).filter((n) => !fuera.has(n.id)),
        );
        return solicitar(cliente, e.cr).then(
          (cierreId) => ({ cierreId, error: null as unknown }),
          (error: unknown) => ({ cierreId: null, error }),
        );
      });
      const cierres = await tx.cierreDia.findMany({ where: { mensajeroId: e.cr.mensajeroId }, select: { id: true } });
      const vinculadas = await tx.gestionOrden.count({
        where: { id: { in: e.cr.gestionesSinCierreIds }, cierreId: { not: null } },
      });
      const detalle = await tx.cierreDetail.count({
        where: { ordenId: { in: Object.values(e.cr.ordenes) }, cierreId: { not: e.cr.cierreId } },
      });
      return { intento, cierres, vinculadas, detalle, cierreDelFixture: e.cr.cierreId };
    });

    expect(r.intento.cierreId).toBeNull();
    expect(r.intento.error).toBeInstanceOf(Error);
    expect((r.intento.error as Error).message).toMatch(/falta la fila de `(canton|distrito)`/);
    // Solo queda el cierre que ya traia el fixture; ninguna gestion vinculada ni fila de detalle nueva.
    expect(r.cierres).toEqual([{ id: r.cierreDelFixture }]);
    expect(r.vinculadas).toBe(0);
    expect(r.detalle).toBe(0);
  });

  it("R17: la empresa XA carga el catalogo de XA y sus asignaciones, y ve la marca que su transaccion escribio", async () => {
    const r = await conEscenario(async (tx, e) => {
      const xa = e.xa;
      // Una marca escrita en la MISMA transaccion, sin confirmar, antes del cierre.
      await comoDueno(tx);
      await fijarEmpresa(tx, xa.base.empresaId);
      await tx.distritoZonaEspecial.createMany({ data: [{ distritoId: xa.base.geo.distritoDosZonasId }] });

      const pedidos: { paisId?: string }[] = [];
      const nodosLeidos: string[] = [];
      const zonasLeidas: string[] = [];
      const nuevo = await comoLaEmpresa(tx, xa, async () => {
        const conNodos = conFindManyRetocado(clienteConSavepoint(tx), "nodoGeografico", (filas, args) => {
          pedidos.push((args as { where?: { paisId?: string } }).where ?? {});
          nodosLeidos.push(...(filas as { id: string }[]).map((n) => n.id));
          return filas;
        });
        const cliente = conFindManyRetocado(conNodos, "zonaDistrito", (filas) => {
          zonasLeidas.push(...(filas as { zona: { id: string } }[]).map((f) => f.zona.id));
          return filas;
        });
        const cierreId = await solicitar(cliente, xa);
        if (cierreId === null) throw new Error("el cierre del fixture no vinculo ninguna gestion");
        return congeladoDelCierre(cliente, cierreId);
      });
      // Como dueño, sin RLS: de que pais son los nodos y de que empresa las zonas que se leyeron.
      const paisesDeLosNodos = await tx.nodoGeografico.findMany({
        where: { id: { in: nodosLeidos } },
        distinct: ["paisId"],
        select: { paisId: true },
      });
      const empresasDeLasZonas = await tx.zona.findMany({
        where: { id: { in: zonasLeidas } },
        distinct: ["organizacionId"],
        select: { organizacionId: true },
      });
      return { xa, nuevo, pedidos, nodosLeidos, zonasLeidas, paisesDeLosNodos, empresasDeLasZonas };
    });

    // Antivacio: se leyeron nodos y asignaciones.
    expect(r.nodosLeidos.length).toBeGreaterThan(0);
    expect(r.zonasLeidas.length).toBeGreaterThan(0);
    expect(r.pedidos).toEqual([{ paisId: r.xa.base.paisId }]);
    expect(r.paisesDeLosNodos).toEqual([{ paisId: r.xa.base.paisId }]);
    expect(r.empresasDeLasZonas).toEqual([{ organizacionId: r.xa.base.empresaId }]);
    // La marca sin confirmar de esta transaccion ya cuenta en el congelado.
    expect(r.nuevo.get(r.xa.ordenes.conDistritoSinMarcaId)?.esZonaEspecial).toBe(true);
  });

  describe("R7 — las lecturas del congelado van de una en una sobre la conexion de la transaccion", () => {
    let contado: PrismaContado;
    beforeAll(() => {
      contado = crearPrismaContado();
    });
    afterAll(async () => {
      await contado?.cerrar();
    });

    it("leerDescriptivosDeOrdenes, con el catalogo, pone 1 consulta en vuelo y ninguna se solapa", async () => {
      const r = await conEscenario(async (tx, e) => {
        const cliente = clienteConSavepoint(tx);
        return comoLaEmpresa(tx, e.cr, async () => {
          const filas = await cliente.gestionOrden.findMany({
            where: { id: { in: e.cr.gestionesSinCierreIds } },
            select: SNAPSHOT_SELECT,
          });
          contado.sonda.limpiar(); // la siembra no es lo que se mide
          const descriptivos = await leerDescriptivosDeOrdenes(filas, cliente);
          return { filas, descriptivos };
        });
      }, contado.prisma);

      // Antivacio: cuatro filas y sus nombres, leidos del catalogo.
      expect(r.filas).toHaveLength(4);
      expect(r.descriptivos.distritos.size).toBe(3);
      expect(r.descriptivos.cantones.size).toBe(2);
      expect(contado.sonda.cuantasConteniendo('FROM "public"."nodo_geografico"')).toBe(1);
      // Las tablas viejas ya no se leen para congelar (R5).
      expect(contado.sonda.cuantasConteniendo('FROM "public"."provincia"')).toBe(0);
      expect(contado.sonda.cuantasConteniendo('FROM "public"."distrito"')).toBe(0);
      expect(contado.sonda.conexionesUsadas()).toBe(1);
      expect(contado.sonda.maximoEnVuelo()).toBe(1);
      expect(contado.sonda.solapes).toEqual([]);
    });
  });
});
