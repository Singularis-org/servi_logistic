import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { esZonaEspecial, nodosDeProfundidad, zonasCandidatas } from "@/lib/services/geografia-dominio";
import {
  codigoDeSalida,
  compararEmpresa,
  crearClienteDeSoloLectura,
  hayDiferencias,
  leerArgumentos,
  lineasDeInforme,
  MUESTRA_POR_DEFECTO,
  type InformeDeEmpresa,
} from "@/scripts/geo-equivalencia-dinero";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo44, type EmpresaGeo44, type EscenarioGeo44 } from "./_fixtures/geo-44";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  urlDeBaseDeDatos,
  type TxDeTest,
} from "./_postgres-real";

// SLT-44 (T5.3; R8, R21, R22, R23; design §6.2, §10) — EL SCRIPT DE EQUIVALENCIA DE DINERO, contra
// Postgres real y con el escenario de `geo-44.ts` (una empresa en Costa Rica y otra en `XA`).
//
// `compararEmpresa` corre sobre la transaccion del test (que se revierte), como `servi_app` con la
// empresa fijada: la lectura de hoy y la nueva ven la misma foto y la misma RLS. La barrera de solo
// lectura del cliente del script se prueba aparte, con su propio cliente (R23).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

// Datos personales de las ordenes que se anaden aqui: no pueden salir en el informe (R23).
const DESTINATARIO = "Destinatario Equivalencia SLT44";
const TELEFONO = "70707071";
const DIRECCION = "Calle de la equivalencia 4444";

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'caja', now(), now())`;

/** Una orden mas de la tienda de la empresa, en `distritoId`, con datos personales reconocibles. */
async function anadirOrden(tx: TxDeTest, empresa: EmpresaGeo44, distritoId: string, monto: string): Promise<string> {
  await comoDueno(tx);
  await fijarEmpresa(tx, empresa.empresaId);
  const estatus = await tx.orderStatus.findUnique({ where: { value: "en_preparacion" }, select: { id: true } });
  if (estatus === null) throw new Error("falta el estado «en_preparacion»: aplica las migraciones");
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    INSERTAR_ORDEN,
    id,
    `SLT44E-${id.slice(0, 8)}`,
    estatus.id,
    DESTINATARIO,
    TELEFONO,
    DIRECCION,
    empresa.tiendaId,
    empresa.zonas.centralId,
    empresa.geo.provinciaId,
    empresa.geo.cantonId,
    distritoId,
    monto,
  );
  return id;
}

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion. */
async function comoLaEmpresa<T>(tx: TxDeTest, empresa: EmpresaGeo44, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, empresa.empresaId);
  try {
    return await fn();
  } finally {
    await comoDueno(tx);
  }
}

/**
 * El cliente de la lectura NUEVA con una asignacion de zona de mas, en un CANTON: el catalogo la
 * recibe como cualquier fila de `zona_distrito` y el dominio la hereda a los distritos de debajo
 * que no tienen la suya (R6). Es la contraprueba de design §10 (R21).
 */
function conAsignacionEnCanton(
  cliente: PrismaClient,
  cantonId: string,
  zona: { id: string; nombre: string; esCentral: boolean },
): PrismaClient {
  const envolver = (objetivo: object): PrismaClient => {
    const proxy: unknown = new Proxy(objetivo, {
      get(o, prop) {
        if (prop === "zonaDistrito") {
          const real = Reflect.get(o, prop) as PrismaClient["zonaDistrito"];
          return {
            findMany: async (args: unknown) => [
              ...((await real.findMany(args as never)) as unknown[]),
              { distritoId: cantonId, zona },
            ],
          };
        }
        if (prop === "$transaction") {
          const real = Reflect.get(o, prop) as (fn: (t: object) => unknown, op?: unknown) => Promise<unknown>;
          return (fn: (t: unknown) => unknown, op?: unknown) =>
            real.call(o, (t: object) => fn(envolver(t)), op);
        }
        const valor = Reflect.get(o, prop) as unknown;
        return typeof valor === "function" ? valor.bind(o) : valor;
      },
    });
    return proxy as PrismaClient;
  };
  return envolver(cliente as unknown as object);
}

async function contarFilas(tx: TxDeTest) {
  await comoDueno(tx);
  return {
    orden: await tx.orden.count(),
    zonaDistrito: await tx.zonaDistrito.count(),
    marcas: await tx.distritoZonaEspecial.count(),
  };
}

describeSiHayBase("SLT-44 T5.3 — geo:equivalencia-dinero (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo44) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioGeo44(tx)));
  }

  describe("R21, R8 — sobre el fixture (asignaciones y marcas solo a distritos) no hay diferencias", () => {
    it("0 diferencias en distritos, cobertura y cotizaciones de las dos empresas", async () => {
      const r = await conEscenario(async (tx, e) => {
        const salida: { empresa: EmpresaGeo44; informe: InformeDeEmpresa }[] = [];
        for (const empresa of [e.cr, e.xa]) {
          // Una orden por distrito del escenario: la cotizacion pasa por todos los casos.
          for (const d of [empresa.geo.distritoDosZonasId, empresa.geo.distritoSinZonaId, empresa.geo.distritoRetiradoId]) {
            await anadirOrden(tx, empresa, d, "12000");
          }
          await anadirOrden(tx, empresa, empresa.geo.distritoBajoCantonRetiradoId, "9000");
          const informe = await comoLaEmpresa(tx, empresa, () =>
            compararEmpresa(clienteConSavepoint(tx), empresa.empresaId, { muestra: MUESTRA_POR_DEFECTO }),
          );
          salida.push({ empresa, informe });
        }
        return salida;
      });

      for (const { empresa, informe } of r) {
        expect(informe.diferencias, lineasDeInforme(informe).join("\n")).toEqual([]);
        expect(hayDiferencias(informe)).toBe(false);
        expect(informe.organizacionId).toBe(empresa.empresaId);
        // Anti-vacuidad: provincia, 2 cantones y 5 distritos del escenario como minimo.
        expect(informe.distritos.comparados).toBeGreaterThanOrEqual(8);
        expect(informe.cobertura.comparados).toBeGreaterThanOrEqual(5);
        // Las zonas central y sur cubren un distrito disponible cada una en el escenario.
        expect(informe.coberturaPorZona.comparados).toBeGreaterThanOrEqual(1);
        // La orden con distrito del fixture y las cuatro de aqui (las de `xa.geo43` pueden sumar).
        expect(informe.cotizaciones.comparados).toBeGreaterThanOrEqual(5);
      }
      expect(codigoDeSalida(r.map((x) => x.informe), 0)).toBe(0);
    });

    it("R8: con el catalogo nuevo, provincias y cantones no tienen zona ni marca", async () => {
      const r = await conEscenario(async (tx, e) =>
        comoLaEmpresa(tx, e.cr, () =>
          conEmpresa(e.cr.empresaId, async () => {
            const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(clienteConSavepoint(tx)).deLaEmpresa();
            const altos = [...nodosDeProfundidad(catalogo, 1), ...nodosDeProfundidad(catalogo, 2)];
            return {
              altos: altos.length,
              conZona: altos.filter((n) => zonasCandidatas(catalogo, asignaciones, n.id) !== null).map((n) => n.id),
              conMarca: altos.filter((n) => esZonaEspecial(catalogo, asignaciones, n.id)).map((n) => n.id),
              cantonDelEscenario: catalogo.porId.has(e.cr.geo.cantonId),
            };
          }),
        ),
      );
      expect(r.cantonDelEscenario).toBe(true);
      expect(r.altos).toBeGreaterThanOrEqual(3);
      expect(r.conZona).toEqual([]);
      expect(r.conMarca).toEqual([]);
    });
  });

  describe("R21 — contraprueba: una asignacion en un canton se ve y se nombra", () => {
    it("el distrito sin zona hereda la del canton: diferencias en los tres bloques, con sus ids", async () => {
      const r = await conEscenario(async (tx, e) => {
        const empresa = e.cr;
        const ordenSinZona = await anadirOrden(tx, empresa, empresa.geo.distritoSinZonaId, "12000");
        const zonaNorte = { id: empresa.zonas.norteId, nombre: "norte", esCentral: false };
        const informe = await comoLaEmpresa(tx, empresa, () => {
          const cliente = clienteConSavepoint(tx);
          return compararEmpresa(cliente, empresa.empresaId, {
            muestra: MUESTRA_POR_DEFECTO,
            clienteNuevo: conAsignacionEnCanton(cliente, empresa.geo.cantonId, zonaNorte),
          });
        });
        return { empresa, informe, ordenSinZona };
      });

      const { empresa, informe, ordenSinZona } = r;
      expect(hayDiferencias(informe)).toBe(true);
      expect(codigoDeSalida([informe], 0)).toBe(1);

      // Distritos: el «sin zona» pasa a la zona norte; los que tienen asignacion propia no cambian.
      expect(informe.distritos.distintos).toBe(1);
      expect(informe.diferencias).toContainEqual({
        bloque: "distritos",
        id: empresa.geo.distritoSinZonaId,
        campo: "zonaId",
        hoy: "null",
        nuevo: JSON.stringify(empresa.zonas.norteId),
      });
      // Cobertura: una fila distinta, y la zona norte cubre un distrito mas.
      expect(informe.cobertura.distintos).toBe(1);
      expect(informe.diferencias).toContainEqual({
        bloque: "cobertura-por-zona",
        id: empresa.zonas.norteId,
        campo: "distritos con cobertura",
        hoy: "0",
        nuevo: "1",
      });
      // Cotizaciones: la orden del distrito sin zona hoy da error y con la asignacion se cotiza.
      expect(informe.cotizaciones.distintos).toBe(1);
      const cotizacion = informe.diferencias.find((d) => d.bloque === "cotizaciones");
      expect(cotizacion).toMatchObject({ id: ordenSinZona, campo: "fila" });
      expect(cotizacion?.hoy).toMatch(/^error en /);
      expect(cotizacion?.nuevo).toMatch(/^cotizada monto=12000\.00 costos=/);

      const salida = lineasDeInforme(informe).join("\n");
      expect(salida).toContain(empresa.geo.distritoSinZonaId);
      expect(salida).toContain(ordenSinZona);
    });
  });

  describe("R22 — muestra, cifras y codigo de salida", () => {
    it("la muestra respeta --muestra y las cifras de cada bloque salen en la salida", async () => {
      const r = await conEscenario(async (tx, e) => {
        for (let i = 0; i < 3; i++) await anadirOrden(tx, e.cr, e.cr.geo.distritoCentralId, "10000");
        return comoLaEmpresa(tx, e.cr, () => compararEmpresa(clienteConSavepoint(tx), e.cr.empresaId, { muestra: 2 }));
      });
      expect(r.cotizaciones.comparados).toBe(2);
      const salida = lineasDeInforme(r);
      for (const bloque of ["distritos", "cobertura", "cobertura-por-zona", "cotizaciones"]) {
        expect(salida.some((l) => l.includes(` ${bloque}: comparados=`) && l.includes(" distintos=0"))).toBe(true);
      }
      expect(salida[3]).toBe(`empresa ${r.organizacionId} cotizaciones: comparados=2 distintos=0`);
    });

    it("leerArgumentos: valores por defecto, --muestra, --empresa y lo invalido", () => {
      expect(leerArgumentos([])).toEqual({ muestra: MUESTRA_POR_DEFECTO, empresa: null });
      expect(leerArgumentos(["--muestra", "5", "--empresa", "org-1"])).toEqual({ muestra: 5, empresa: "org-1" });
      expect(leerArgumentos(["--muestra", "0"])).toBeNull();
      expect(leerArgumentos(["--muestra", "abc"])).toBeNull();
      expect(leerArgumentos(["--empresa"])).toBeNull();
      expect(leerArgumentos(["--destino", "prod"])).toBeNull();
    });

    it("codigoDeSalida: 0 si coincide, 1 si difiere, 2 si una empresa fallo", () => {
      const cero = { comparados: 3, distintos: 0 };
      const igual: InformeDeEmpresa = {
        organizacionId: "a",
        distritos: cero,
        cobertura: cero,
        coberturaPorZona: cero,
        cotizaciones: cero,
        diferencias: [],
      };
      const distinto: InformeDeEmpresa = { ...igual, organizacionId: "b", cotizaciones: { comparados: 3, distintos: 1 } };
      expect(codigoDeSalida([igual], 0)).toBe(0);
      expect(codigoDeSalida([igual, distinto], 0)).toBe(1);
      expect(codigoDeSalida([igual], 1)).toBe(2);
      expect(codigoDeSalida([distinto], 1)).toBe(2);
    });
  });

  describe("R23 — no escribe y no imprime datos personales", () => {
    it("con el cliente del script, un INSERT falla con 25006 (transaccion de solo lectura)", async () => {
      const cliente = crearClienteDeSoloLectura(urlDeBaseDeDatos());
      try {
        // En plataforma la extension deja pasar el SQL a mano tal cual: el que lo para es Postgres.
        const error = await comoPlataforma("SLT-44", "test de la barrera de solo lectura", () =>
          cliente.$executeRawUnsafe(`INSERT INTO orden (id) VALUES ('${randomUUID()}')`),
        ).then(
          () => null,
          (e: unknown) => e,
        );
        expect(error).not.toBeNull();
        const detalle = `${String((error as Error).message)} ${JSON.stringify(error)}`;
        expect(detalle).toMatch(/25006|read-only transaction/);
        // La conexion sigue sirviendo para leer.
        const leido = await comoPlataforma("SLT-44", "test de la barrera de solo lectura", () =>
          cliente.$queryRawUnsafe<{ ro: string }[]>(`SHOW default_transaction_read_only`),
        );
        expect(leido[0].ro ?? Object.values(leido[0])[0]).toBe("on");
      } finally {
        await cliente.$disconnect();
      }
    });

    it("las filas de orden, zona_distrito y marcas quedan iguales y la salida no lleva datos personales", async () => {
      const r = await conEscenario(async (tx, e) => {
        await anadirOrden(tx, e.cr, e.cr.geo.distritoCentralId, "15000");
        await anadirOrden(tx, e.cr, e.cr.geo.distritoSinZonaId, "15000");
        const antes = await contarFilas(tx);
        const informe = await comoLaEmpresa(tx, e.cr, () =>
          compararEmpresa(clienteConSavepoint(tx), e.cr.empresaId, { muestra: MUESTRA_POR_DEFECTO }),
        );
        const despues = await contarFilas(tx);
        // La contraprueba tambien: sus diferencias son lo que mas imprime.
        const conDiferencias = await comoLaEmpresa(tx, e.cr, () => {
          const cliente = clienteConSavepoint(tx);
          return compararEmpresa(cliente, e.cr.empresaId, {
            muestra: MUESTRA_POR_DEFECTO,
            clienteNuevo: conAsignacionEnCanton(cliente, e.cr.geo.cantonId, {
              id: e.cr.zonas.norteId,
              nombre: "norte",
              esCentral: false,
            }),
          });
        });
        return { antes, despues, informe, conDiferencias };
      });

      expect(r.despues).toEqual(r.antes);
      expect(r.informe.cotizaciones.comparados).toBeGreaterThanOrEqual(2);
      expect(hayDiferencias(r.conDiferencias)).toBe(true);
      const salida = [...lineasDeInforme(r.informe), ...lineasDeInforme(r.conDiferencias)].join("\n");
      // Los datos personales del fixture (`geo-44.ts`) y los de aqui.
      for (const pii of [DESTINATARIO, TELEFONO, DIRECCION, "Destinatario SLT-44", "88880000"]) {
        expect(salida).not.toContain(pii);
      }
    });
  });
});
