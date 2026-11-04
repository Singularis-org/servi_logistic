import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import {
  codigoDeSalida,
  compararConteosDeLaEmpresa,
  compararConteosDelPaisEnPlataforma,
  compararEmpresaConsultas,
  esBaseLocal,
  hayDiferencias,
  hayDiferenciasDePais,
  lineasDeInforme,
  lineasDeInformeDePais,
  type InformeDeEmpresa,
  type InformeDePais,
} from "@/scripts/geo-equivalencia-consultas";
import { crearClienteDeSoloLectura, MUESTRA_POR_DEFECTO } from "@/scripts/geo-equivalencia-dinero";
import { comoApp } from "@/tests/fabricas/organizaciones";
import {
  crearEscenarioGeo65,
  DATOS_PERSONALES_GEO65,
  sembrarOrdenIncoherente,
  type EmpresaGeo65,
  type EscenarioGeo65,
} from "./_fixtures/geo-65";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// SLT-65 (T5.3; R22, R23, R24; design §9) — EL SCRIPT DE EQUIVALENCIA DE LAS CONSULTAS, contra
// Postgres real y con el escenario de `geo-65.ts` (una empresa en Costa Rica y otra en `XA`).
//
// Las comparaciones corren sobre la transaccion del test (que se revierte), como `servi_app` con la
// empresa fijada: la lectura de hoy y la nueva ven la misma foto y la misma RLS. La barrera de solo
// lectura del cliente del script se prueba aparte, con su propio cliente (R24).
//
// La marca en un canton no se puede escribir en la base (las marcas son de distrito): la contraprueba
// la inyecta en la lectura NUEVA, con un cliente que añade la fila a lo que devuelve
// `distritoZonaEspecial.findMany` (como `conMarcaEn` en `geo-consultas-ordenes.test.ts`).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** El cliente de la lectura NUEVA con una marca de zona especial de mas, en el nodo `nodoId`. */
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

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion. */
async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo65, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.empresaId);
  try {
    return await fn();
  } finally {
    await comoDueno(tx);
  }
}

async function contarFilas(tx: TxDeTest) {
  await comoDueno(tx);
  return {
    orden: await tx.orden.count(),
    cierreDetail: await tx.cierreDetail.count(),
    gestionOrden: await tx.gestionOrden.count(),
    zonaDistrito: await tx.zonaDistrito.count(),
    marcas: await tx.distritoZonaEspecial.count(),
    historial: await tx.historialAccion.count(),
  };
}

const BLOQUES = ["cierres", "cierres-ingreso", "cobro-devolucion", "correccion", "listados", "reconciliacion"];

describeSiHayBase("SLT-65 T5.3 — geo:equivalencia-consultas (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo65) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioGeo65(tx)));
  }

  describe("R22 — sobre el fixture (asignaciones y marcas solo a distritos) todo coincide", () => {
    it("0 diferencias en los seis bloques de las dos empresas y en el conteo de sus nodos", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida: { empresa: EmpresaGeo65; informe: InformeDeEmpresa; pais: InformeDePais }[] = [];
        for (const empresa of [e.cr, e.xa]) {
          const informe = await comoLaEmpresa(tx, empresa, () =>
            compararEmpresaConsultas(clienteConSavepoint(tx), empresa.base.empresaId, { muestra: MUESTRA_POR_DEFECTO }),
          );
          const pais = await comoLaEmpresa(tx, empresa, () =>
            compararConteosDeLaEmpresa(clienteConSavepoint(tx), empresa.base.empresaId),
          );
          salida.push({ empresa, informe, pais });
        }
        return salida;
      });

      for (const { empresa, informe, pais } of r) {
        const texto = [...lineasDeInforme(informe), ...lineasDeInformeDePais(pais)].join("\n");
        expect(informe.diferencias, texto).toEqual([]);
        expect(pais.diferencias, texto).toEqual([]);
        expect(hayDiferencias(informe)).toBe(false);
        expect(hayDiferenciasDePais(pais)).toBe(false);
        expect(informe.organizacionId).toBe(empresa.base.empresaId);
        expect(pais.paisId).toBe(empresa.base.paisId);
        // Antivacio. Cierres: las 4 ordenes de gestiones vigentes sin cierre y la del detalle.
        expect(informe.cierres.comparados).toBeGreaterThanOrEqual(5);
        // La gestion del detalle del cierre del fixture.
        expect(informe.cierresIngreso.comparados).toBeGreaterThanOrEqual(1);
        // Las 11 ordenes del fixture, con y sin distrito, con y sin marca.
        expect(informe.cobroDevolucion.comparados).toBeGreaterThanOrEqual(11);
        expect(informe.correccion.comparados).toBeGreaterThanOrEqual(11);
        expect(informe.listados.comparados).toBeGreaterThanOrEqual(11);
        // Zonas central, norte y sur.
        expect(informe.reconciliacion.comparados).toBeGreaterThanOrEqual(3);
        // Provincia, 2 cantones y 4 distritos con ordenes.
        expect(pais.conteoSinEntregar.comparados).toBeGreaterThanOrEqual(7);
        expect(pais.cadenaIncoherente).toEqual([]);
      }
      expect(
        codigoDeSalida(
          r.map((x) => x.informe),
          r.map((x) => x.pais),
          0,
        ),
      ).toBe(0);
    });
  });

  describe("R22 — el conteo del pais, una vez por pais en plataforma (como el superadmin)", () => {
    it("0 diferencias en los nodos del pais; ve las ordenes de todas las empresas y no las de otro pais", async () => {
      const r = await conEscenario(async (tx, e) => {
        // Plataforma no fija empresa: la transaccion queda como el dueno, sin `servi_app`.
        await comoDueno(tx);
        const cr = await compararConteosDelPaisEnPlataforma(clienteConSavepoint(tx), e.cr.base.paisId);
        // La orden incoherente se siembra despues: con las FK viejas cuenta en otro canton que con el
        // lugar, y esa diferencia es la que §5 deja informativa, no la de este caso.
        const incoherente = await sembrarOrdenIncoherente(tx, e.cr.base);
        await comoDueno(tx);
        const conIncoherente = await compararConteosDelPaisEnPlataforma(clienteConSavepoint(tx), e.cr.base.paisId);
        const xa = await compararConteosDelPaisEnPlataforma(clienteConSavepoint(tx), e.xa.base.paisId);
        return { incoherente, cr, conIncoherente, xa, paises: [e.cr.base.paisId, e.xa.base.paisId] };
      });
      for (const pais of [r.cr, r.xa]) {
        expect(pais.diferencias, lineasDeInformeDePais(pais).join("\n")).toEqual([]);
        expect(hayDiferenciasDePais(pais)).toBe(false);
        expect(pais.ambito).toBe("plataforma");
      }
      expect([r.cr.paisId, r.xa.paisId]).toEqual(r.paises);
      // Antivacio: provincia, 2 cantones y 4 distritos con ordenes en Costa Rica; al menos un nodo en XA.
      expect(r.cr.conteoSinEntregar.comparados).toBeGreaterThanOrEqual(7);
      expect(r.xa.conteoSinEntregar.comparados).toBeGreaterThanOrEqual(1);
      // La orden incoherente de la empresa de Costa Rica la ve el pais, no el otro.
      expect(r.cr.cadenaIncoherente).not.toContain(r.incoherente);
      expect(r.conIncoherente.cadenaIncoherente).toContain(r.incoherente);
      expect(r.xa.cadenaIncoherente).not.toContain(r.incoherente);
      expect(lineasDeInformeDePais(r.cr)[0]).toBe(
        `pais ${r.cr.paisId} (plataforma) conteo-sin-entregar: comparados=${r.cr.conteoSinEntregar.comparados} distintos=0`,
      );
      expect(codigoDeSalida([], [r.cr, r.xa], 0)).toBe(0);
    });
  });

  describe("R22 — contraprueba: una marca en un canton se ve y se nombra", () => {
    it("las ordenes del canton sin marca propia salen distintas en cierres, cobro, correccion y listados", async () => {
      const r = await conEscenario(async (tx, e) => {
        const empresa = e.cr;
        const informe = await comoLaEmpresa(tx, empresa, () => {
          const cliente = clienteConSavepoint(tx);
          return compararEmpresaConsultas(cliente, empresa.base.empresaId, {
            muestra: MUESTRA_POR_DEFECTO,
            clienteNuevo: conMarcaEn(cliente, empresa.base.geo.cantonId),
          });
        });
        return { empresa, informe };
      });

      const { empresa, informe } = r;
      const o = empresa.ordenes;
      expect(hayDiferencias(informe)).toBe(true);
      expect(codigoDeSalida([informe], [], 0)).toBe(1);

      const marcaDistinta = (bloque: string, campo: string) =>
        informe.diferencias.filter((d) => d.bloque === bloque && d.campo === campo && d.hoy === "false" && d.nuevo === "true").map((d) => d.id);

      // Cierres: las dos ordenes del canton con gestion vigente y sin marca propia.
      expect(marcaDistinta("cierres", "esZonaEspecial").sort()).toEqual(
        [o.sinDistritoGestionadaId, o.conDistritoSinMarcaId].sort(),
      );
      // Cobro y correccion: las ordenes vivas del canton sin marca propia, con y sin distrito.
      const delCanton = [
        o.sinDistritoId,
        o.conDistritoSinMarcaId,
        o.enDistritoSinZonaId,
        o.sinDistritoGestionadaId,
        o.entregadaId,
      ];
      for (const id of delCanton) {
        expect(marcaDistinta("cobro-devolucion", "esZonaEspecial")).toContain(id);
        expect(marcaDistinta("correccion", "esZonaEspecial")).toContain(id);
        expect(marcaDistinta("listados", "api costeo.esZonaEspecial")).toContain(id);
      }
      // Las del canton retirado no heredan la marca.
      for (const bloque of ["cobro-devolucion", "correccion"]) {
        const ids = marcaDistinta(bloque, "esZonaEspecial");
        expect(ids).not.toContain(o.sinDistritoCantonRetiradoId);
        expect(ids).not.toContain(o.bajoCantonRetiradoId);
      }
      // Los nombres no cambian: la marca no toca la geografia que se congela.
      expect(informe.diferencias.filter((d) => d.bloque === "cierres" && d.campo !== "esZonaEspecial")).toEqual([]);

      const salida = lineasDeInforme(informe).join("\n");
      expect(salida).toContain(o.sinDistritoGestionadaId);
      expect(salida).toMatch(/ cierres: comparados=\d+ distintos=2/);
    });
  });

  describe("R23 — muestra, cifras, cadena incoherente y codigo de salida", () => {
    it("la muestra respeta --muestra y suma las ordenes con distrito marcado; las cifras salen por bloque", async () => {
      const r = await conEscenario(async (tx, e) =>
        comoLaEmpresa(tx, e.cr, () => compararEmpresaConsultas(clienteConSavepoint(tx), e.cr.base.empresaId, { muestra: 1 })),
      );
      // 1 reciente + las vivas de distritos marcados (al menos las 4 del distrito central y la del
      // distrito bajo el canton retirado); nunca las 11.
      expect(r.cobroDevolucion.comparados).toBeGreaterThanOrEqual(5);
      expect(r.cobroDevolucion.comparados).toBeLessThan(11);
      // Un solo detalle de cierre en la muestra.
      expect(r.cierresIngreso.comparados).toBe(1);
      const salida = lineasDeInforme(r);
      for (const bloque of BLOQUES) {
        expect(salida.some((l) => l.includes(` ${bloque}: comparados=`) && l.includes(" distintos=0"))).toBe(true);
      }
      expect(salida[0]).toBe(`empresa ${r.organizacionId} cierres: comparados=${r.cierres.comparados} distintos=0`);
    });

    it("la orden con cadena incoherente se cuenta y se nombra, y no cambia la salida por si sola", async () => {
      const r = await conEscenario(async (tx, e) => {
        const incoherente = await sembrarOrdenIncoherente(tx, e.cr.base);
        const pais = await comoLaEmpresa(tx, e.cr, () => compararConteosDeLaEmpresa(clienteConSavepoint(tx), e.cr.base.empresaId));
        const otra = await comoLaEmpresa(tx, e.xa, () => compararConteosDeLaEmpresa(clienteConSavepoint(tx), e.xa.base.empresaId));
        return { incoherente, pais, otra };
      });
      expect(r.pais.cadenaIncoherente).toEqual([r.incoherente]);
      // La otra empresa no ve la orden de esta.
      expect(r.otra.cadenaIncoherente).toEqual([]);
      const salida = lineasDeInformeDePais(r.pais);
      expect(salida).toContain(`pais ${r.pais.paisId} (${r.pais.ambito}) cadena-incoherente: ordenes=1`);
      expect(salida.join("\n")).toContain(r.incoherente);
      // Informativa: sin diferencias de conteo, la salida seria 0.
      expect(codigoDeSalida([], [{ ...r.pais, conteoSinEntregar: { comparados: 1, distintos: 0 }, diferencias: [] }], 0)).toBe(0);
    });

    it("codigoDeSalida: 0 si coincide, 1 si difiere una empresa o un conteo, 2 si algo fallo", () => {
      const cero = { comparados: 3, distintos: 0 };
      const igual: InformeDeEmpresa = {
        organizacionId: "a",
        cierres: cero,
        cierresIngreso: cero,
        cobroDevolucion: cero,
        correccion: cero,
        listados: cero,
        listadosSinTarifa: 0,
        reconciliacion: cero,
        diferencias: [],
      };
      const distinta: InformeDeEmpresa = { ...igual, organizacionId: "b", cierresIngreso: { comparados: 3, distintos: 1 } };
      const pais: InformeDePais = { paisId: "CR", ambito: "a", conteoSinEntregar: cero, cadenaIncoherente: ["x"], diferencias: [] };
      const paisDistinto: InformeDePais = { ...pais, conteoSinEntregar: { comparados: 3, distintos: 1 } };
      expect(codigoDeSalida([igual], [pais], 0)).toBe(0);
      expect(codigoDeSalida([igual, distinta], [pais], 0)).toBe(1);
      expect(codigoDeSalida([igual], [paisDistinto], 0)).toBe(1);
      expect(codigoDeSalida([igual], [pais], 1)).toBe(2);
    });
  });

  describe("R24 — no escribe, solo contra localhost y no imprime datos personales", () => {
    it("con el cliente del script, un INSERT falla con 25006 (transaccion de solo lectura)", async () => {
      const cliente = crearClienteDeSoloLectura(urlDeBaseDeDatos());
      try {
        const error = await comoPlataforma("SLT-65", "test de la barrera de solo lectura", () =>
          cliente.$executeRawUnsafe(`INSERT INTO orden (id) VALUES ('${randomUUID()}')`),
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(error).not.toBeNull();
        expect(`${String((error as Error).message)} ${JSON.stringify(error)}`).toMatch(/25006|read-only transaction/);
      } finally {
        await cliente.$disconnect();
      }
    });

    it("esBaseLocal: solo localhost, 127.0.0.1 y ::1", () => {
      expect(esBaseLocal("postgresql://u:p@localhost:5432/db")).toBe(true);
      expect(esBaseLocal("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
      expect(esBaseLocal("postgresql://u:p@[::1]:5432/db")).toBe(true);
      expect(esBaseLocal("postgresql://u:p@db.ejemplo.supabase.co:5432/postgres")).toBe(false);
      expect(esBaseLocal("postgresql://u:p@localhost.ejemplo.com:5432/db")).toBe(false);
      expect(esBaseLocal(undefined)).toBe(false);
      expect(esBaseLocal("no es una url")).toBe(false);
    });

    it("las filas quedan iguales y la salida, tambien la de la contraprueba, no lleva datos personales", async () => {
      const r = await conEscenario(async (tx, e) => {
        await sembrarOrdenIncoherente(tx, e.cr.base);
        const antes = await contarFilas(tx);
        const informe = await comoLaEmpresa(tx, e.cr, () =>
          compararEmpresaConsultas(clienteConSavepoint(tx), e.cr.base.empresaId, { muestra: MUESTRA_POR_DEFECTO }),
        );
        const pais = await comoLaEmpresa(tx, e.cr, () => compararConteosDeLaEmpresa(clienteConSavepoint(tx), e.cr.base.empresaId));
        const conDiferencias = await comoLaEmpresa(tx, e.cr, () => {
          const cliente = clienteConSavepoint(tx);
          return compararEmpresaConsultas(cliente, e.cr.base.empresaId, {
            muestra: MUESTRA_POR_DEFECTO,
            clienteNuevo: conMarcaEn(cliente, e.cr.base.geo.cantonId),
          });
        });
        const despues = await contarFilas(tx);
        return { antes, despues, informe, pais, conDiferencias };
      });

      expect(r.despues).toEqual(r.antes);
      expect(hayDiferencias(r.conDiferencias)).toBe(true);
      const salida = [
        ...lineasDeInforme(r.informe),
        ...lineasDeInformeDePais(r.pais),
        ...lineasDeInforme(r.conDiferencias),
      ].join("\n");
      // Los datos personales del fixture (`geo-65.ts` y `geo-44.ts`).
      for (const pii of [...DATOS_PERSONALES_GEO65, "Destinatario SLT-44", "88880000"]) {
        expect(salida).not.toContain(pii);
      }
    });
  });
});
