import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta, comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { ApiOrdenRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import { esZonaEspecialDeLaEmpresa } from "@/lib/repositories/_shared/zona-especial";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type { OrdenListItemDTO } from "@/lib/types/orden";
import type { TarifaDTO } from "@/lib/types/tarifa";
import { costosListadoOrden } from "@/lib/utils/ingreso-empresa";
import type { TarifaVigente } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import * as hoy from "@/scripts/geo-equivalencia/consultas-de-hoy";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo65, type EmpresaGeo65, type EscenarioGeo65 } from "./_fixtures/geo-65";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-65 (T2.4; R1–R4; design §3, §14) — LA MARCA DE LAS LECTURAS DE ORDENES, DEL CATALOGO, contra
// la copia congelada de hoy (`scripts/geo-equivalencia/consultas-de-hoy.ts`) y sobre Postgres real.
//
// Cada lectura corre como la app: `servi_app` con la empresa fijada (`comoApp`) y la empresa en el
// contexto (`conEmpresa`), sobre la transaccion revertida del test (`clienteConSavepoint`). La de hoy
// lee en la misma foto.
//
// La tarifa de la tienda gana un pacto especial: sin el, la marca no moveria ningun importe del
// listado y R3 pasaria aunque la marca saliera mal.
//
// La herencia (marca en un canton) no se puede escribir en la base: la FK de la marca es a
// `distrito`. Se prueba cambiando la ENTRADA, como `conAsignacionEnCanton` en SLT-44: el cliente
// de la lectura nueva anade una fila con el id de un canton a `distritoZonaEspecial.findMany`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const PAGINA = { skip: 0, take: 50 } as const;

/** El cliente de la lectura nueva con una marca de mas, en `nodoId` (un canton). */
function conMarcaEn(cliente: PrismaClient, nodoId: string): PrismaClient {
  const envolver = (objetivo: object): PrismaClient => {
    const proxy: unknown = new Proxy(objetivo, {
      get(o, prop) {
        if (prop === "distritoZonaEspecial") {
          const real = Reflect.get(o, prop) as PrismaClient["distritoZonaEspecial"];
          return {
            findMany: async (args: unknown) => [
              ...((await real.findMany(args as never)) as unknown[]),
              { distritoId: nodoId },
            ],
          };
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

/** Un pacto especial en las tarifas de la tienda y de la zona norte, para que la marca mueva importes. */
async function conPactoEspecial(tx: TxDeTest, e: EmpresaGeo65): Promise<void> {
  await comoDueno(tx);
  await tx.tarifa.updateMany({
    where: { OR: [{ tiendaId: e.base.tiendaId }, { tiendaId: null, zonaId: e.base.zonas.norteId }] },
    data: { tarifaEspecial: "3100.00", tarifaEspecialDevuelta: "2700.00" },
  });
}

function ids(e: EmpresaGeo65): string[] {
  return Object.values(e.ordenes);
}

/** La tarifa que el listado ya resolvio, en la forma de la aritmetica de dinero. */
function vigenteDe(t: TarifaDTO | null | undefined): TarifaVigente | null {
  if (t === null || t === undefined) return null;
  const s = (n: number) => n.toFixed(2);
  return {
    valorFlete: s(t.valorFlete),
    valorFleteGam: s(t.valorFleteGam),
    valorFleteDevuelto: s(t.valorFleteDevuelto),
    valorFleteDevueltoGam: s(t.valorFleteDevueltoGam),
    comisionCod: s(t.comisionCod),
    ivaFlete: s(t.ivaFlete),
    ivaComisionCod: s(t.ivaComisionCod),
    tarifaEspecial: t.tarifaEspecial === null ? null : s(t.tarifaEspecial),
    tarifaEspecialDevuelta: t.tarifaEspecialDevuelta === null ? null : s(t.tarifaEspecialDevuelta),
  };
}

/** Los importes que la fila del listado daria con la marca de HOY (la misma tarifa, la misma formula). */
function importesConMarca(item: OrdenListItemDTO, marca: boolean) {
  const c = costosListadoOrden(vigenteDe(item.relaciones?.tienda?.tarifa), {
    esCentral: item.zonaEsGam ?? false,
    esZonaEspecial: marca,
    montoCobrar: item.montoCobrar === null || item.montoCobrar === undefined ? null : item.montoCobrar.toFixed(2),
    cobraComision: item.cobraComision ?? false,
  });
  return { fleteConIva: c.fleteConIva, comisionConIva: c.comisionConIva, fleteOrigen: c.fleteOrigen };
}

describeSiHayBase("SLT-65 T2.4 — la marca de las lecturas de ordenes sale del catalogo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo65) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => {
      const e = await crearEscenarioGeo65(tx);
      for (const empresa of [e.cr, e.xa]) await conPactoEspecial(tx, empresa);
      return fn(tx, e);
    });
  }

  describe("R1, R2, R3 — con marcas solo en distritos, cada lectura da lo de hoy", () => {
    it("API: listByOwner y findDetalleByOrdenIdForOwner dan el mismo costeo que la copia de hoy", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          const leido = await comoLaEmpresa(tx, empresa, async () => {
            const cliente = clienteConSavepoint(tx);
            const params = { ownerId: empresa.base.tiendaId, ...PAGINA };
            const deHoy = await hoy.paginaApiDeHoy(cliente, params);
            const nuevo = await new OrdenRepository(cliente).listByOwner(params);
            const detalles: ApiOrdenRow[] = [];
            for (const id of ids(empresa)) {
              const d = await new OrdenRepository(cliente).findDetalleByOrdenIdForOwner(id, empresa.base.tiendaId);
              if (d !== null) detalles.push(d);
            }
            return { deHoy, nuevo, detalles };
          });
          salida.push({ empresa, ...leido });
        }
        return salida;
      });

      for (const { empresa, deHoy, nuevo, detalles } of r) {
        // Antivacio: las 11 ordenes del fixture, con y sin marca.
        expect(nuevo.items).toHaveLength(ids(empresa).length);
        expect(deHoy).toHaveLength(nuevo.items.length);
        const costeoDeHoy = new Map(
          deHoy.map((f) => [
            f.numRemision,
            {
              zonaId: f.zonaId,
              esCentral: f.zona.esCentral,
              esZonaEspecial: esZonaEspecialDeLaEmpresa(f.distrito),
              montoCobrar: f.montoCobrar === null ? null : f.montoCobrar.toFixed(2),
              cobraComision: f.cobraComision,
              congelado: null,
            },
          ]),
        );
        for (const fila of [...nuevo.items, ...detalles]) {
          expect(fila.costeo).toEqual(costeoDeHoy.get(fila.numRemision));
        }
        expect(detalles).toHaveLength(ids(empresa).length);
        // Las dos marcas aparecen: la comparacion no es entre dos `false`.
        const marcas = nuevo.items.map((f) => f.costeo.esZonaEspecial);
        expect(marcas.filter(Boolean)).toHaveLength(5);
        expect(marcas.filter((m) => !m)).toHaveLength(6);
      }
    });

    it("/ordenes: list y findListItemsByIds dan la marca y los importes de hoy", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          const leido = await comoLaEmpresa(tx, empresa, async () => {
            const cliente = clienteConSavepoint(tx);
            const repo = new OrdenRepository(cliente);
            const listado = await repo.list({ where: {}, sortBy: "created_at", sortDir: "desc", ...PAGINA });
            const deHoy = await hoy.paginaListadoDeHoy(cliente, { sortBy: "created_at", sortDir: "desc", ...PAGINA });
            const porIds = await repo.findListItemsByIds(ids(empresa), { tipo: "global" });
            const marcasDeHoy = await hoy.marcasDeHoy(cliente, listado.items.map((i) => i.id));
            return { listado, deHoy, porIds, marcasDeHoy };
          });
          salida.push({ empresa, ...leido });
        }
        return salida;
      });

      for (const { empresa, listado, deHoy, porIds, marcasDeHoy } of r) {
        // La empresa del contexto solo ve sus ordenes: las 11 del fixture (en `XA`, tambien las de
        // `geo-43`, que tienen su propia marca).
        expect(listado.items.map((i) => i.id)).toEqual(expect.arrayContaining(ids(empresa)));
        expect(listado.items.length).toBeLessThan(PAGINA.take);
        // La misma pagina, en el mismo orden, que la consulta de hoy.
        expect(listado.items.map((i) => i.id)).toEqual(deHoy.map((f) => f.id));
        const marcaDeLaFilaDeHoy = new Map(deHoy.map((f) => [f.id, esZonaEspecialDeLaEmpresa(f.distrito)]));
        expect(porIds).toHaveLength(ids(empresa).length);
        for (const item of [...listado.items, ...porIds]) {
          const marca = marcasDeHoy.get(item.id);
          expect(marca).toBe(marcaDeLaFilaDeHoy.get(item.id));
          expect({
            fleteConIva: item.fleteConIva,
            comisionConIva: item.comisionConIva,
            fleteOrigen: item.fleteOrigen,
          }).toEqual(importesConMarca(item, marca as boolean));
        }
        // La marca mueve el flete en el fixture: la orden marcada sale del pacto especial.
        const marcada = listado.items.find((i) => i.id === empresa.ordenes.conDistritoConMarcaId);
        expect(marcada?.fleteOrigen).toBe("especial");
        const sinMarca = listado.items.find((i) => i.id === empresa.ordenes.conDistritoSinMarcaId);
        expect(sinMarca?.fleteOrigen).toBe("normal");
      }
    });

    it("cobro de la devolucion y correccion: la fila entera es la de hoy", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida = [];
        for (const empresa of [e.cr, e.xa]) {
          const leido = await comoLaEmpresa(tx, empresa, async () => {
            const cliente = clienteConSavepoint(tx);
            const repo = new OrdenRepository(cliente);
            const filas = [];
            for (const id of ids(empresa)) {
              filas.push({
                id,
                cobroHoy: await hoy.findBaseCobroDevolucion(cliente, id),
                cobroNuevo: await repo.findBaseCobroDevolucion(id),
                correccionHoy: await hoy.findParaCorreccion(cliente, id),
                correccionNueva: await repo.findParaCorreccion(id),
              });
            }
            return filas;
          });
          salida.push({ empresa, filas: leido });
        }
        return salida;
      });

      for (const { filas } of r) {
        expect(filas).toHaveLength(11);
        for (const f of filas) {
          expect(f.cobroHoy).not.toBeNull();
          expect(f.cobroNuevo).toEqual(f.cobroHoy);
          expect(f.correccionHoy).not.toBeNull();
          expect(f.correccionNueva).toEqual(f.correccionHoy);
        }
        // Las dos marcas y los dos casos del nombre del distrito estan cubiertos.
        expect(filas.filter((f) => f.cobroNuevo?.esZonaEspecial)).toHaveLength(5);
        expect(filas.filter((f) => f.correccionNueva?.distritoNombre === null)).toHaveLength(3);
      }
    });
  });

  describe("R1 — herencia: una marca en un canton la heredan sus distritos y sus ordenes sin distrito", () => {
    it("la orden de un distrito suyo y la sin distrito del canton quedan marcadas; la de otro canton no", async () => {
      const r = await conEscenario(async (tx, e) => {
        const empresa = e.cr;
        return comoLaEmpresa(tx, empresa, async () => {
          const cliente = conMarcaEn(clienteConSavepoint(tx), empresa.base.geo.cantonId);
          const repo = new OrdenRepository(cliente);
          const o = empresa.ordenes;
          const api = await repo.listByOwner({ ownerId: empresa.base.tiendaId, ...PAGINA });
          const listado = await repo.findListItemsByIds(ids(empresa), { tipo: "global" });
          const cobro = async (id: string) => (await repo.findBaseCobroDevolucion(id))?.esZonaEspecial;
          return {
            empresa,
            api: new Map(api.items.map((f) => [f.numRemision, f.costeo.esZonaEspecial])),
            remisiones: new Map(
              (await clienteConSavepoint(tx).orden.findMany({
                where: { id: { in: ids(empresa) } },
                select: { id: true, numRemision: true },
              })).map((f) => [f.id, f.numRemision]),
            ),
            listado: new Map(listado.map((i) => [i.id, i.fleteOrigen])),
            cobro: {
              enDistritoSinZona: await cobro(o.enDistritoSinZonaId),
              sinDistrito: await cobro(o.sinDistritoId),
              conDistritoSinMarca: await cobro(o.conDistritoSinMarcaId),
              sinDistritoCantonRetirado: await cobro(o.sinDistritoCantonRetiradoId),
            },
          };
        });
      });

      const o = r.empresa.ordenes;
      // Hoy las cuatro son «sin marca»; con la marca en su canton, las tres primeras la heredan.
      expect(r.cobro).toEqual({
        enDistritoSinZona: true,
        sinDistrito: true,
        conDistritoSinMarca: true,
        sinDistritoCantonRetirado: false,
      });
      const api = (id: string) => r.api.get(r.remisiones.get(id) ?? "");
      expect(api(o.enDistritoSinZonaId)).toBe(true);
      expect(api(o.sinDistritoId)).toBe(true);
      expect(api(o.sinDistritoCantonRetiradoId)).toBe(false);
      // Y el importe del listado lo sigue: el flete sale del pacto especial.
      expect(r.listado.get(o.sinDistritoId)).toBe("especial");
      expect(r.listado.get(o.sinDistritoCantonRetiradoId)).toBe("normal");
    });
  });

  describe("R4 — sin empresa no hay marca: EmpresaNoResuelta y ninguna fila", () => {
    it("en plataforma, listByOwner y findBaseCobroDevolucion lanzan EmpresaNoResuelta", async () => {
      const r = await conEscenario(async (tx, e) => {
        const repo = new OrdenRepository(clienteConSavepoint(tx));
        const enPlataforma = <T>(fn: () => Promise<T>) =>
          comoPlataforma("SLT-65", "test de R4", fn).then(
            (v) => ({ v, error: null as unknown }),
            (error: unknown) => ({ v: null, error }),
          );
        return {
          listado: await enPlataforma(() => repo.listByOwner({ ownerId: e.cr.base.tiendaId, ...PAGINA })),
          cobro: await enPlataforma(() => repo.findBaseCobroDevolucion(e.cr.ordenes.conDistritoConMarcaId)),
        };
      });
      expect(r.listado.error).toBeInstanceOf(EmpresaNoResuelta);
      expect(r.listado.v).toBeNull();
      expect(r.cobro.error).toBeInstanceOf(EmpresaNoResuelta);
      expect(r.cobro.v).toBeNull();
    });

    it("sin contexto, con la extension real, listByOwner y findBaseCobroDevolucion lanzan EmpresaNoResuelta", async () => {
      const app = conAislamientoPorEmpresa(crearPrismaDeTest(), async () => null);
      try {
        const repo = new OrdenRepository(app);
        await expect(repo.listByOwner({ ownerId: "00000000-0000-0000-0000-000000000000", ...PAGINA })).rejects.toBeInstanceOf(
          EmpresaNoResuelta,
        );
        await expect(repo.findBaseCobroDevolucion("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
          EmpresaNoResuelta,
        );
      } finally {
        await app.$disconnect();
      }
    });
  });
});
