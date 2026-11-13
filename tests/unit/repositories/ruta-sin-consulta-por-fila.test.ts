import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { OrdenEnvioReader } from "@/lib/repositories/OrdenEnvioReader";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import { ESTADOS_BODEGA_SATELITE } from "@/lib/utils/estados-bodega-satelite";
import { sembrarCatalogoEstados, idEstado } from "@/tests/fixtures/catalogo-estados";
import { delegadosDelCatalogo } from "@/tests/fixtures/doble-catalogo-geografico";

// SLT-125 (T2.3; R20; design §4.2) — NINGUNA LECTURA NOMBRA LUGARES CON UNA CONSULTA POR FILA.
//
// Cada superficie de design §4.2 se corre sobre un doble de Prisma que cuenta TODAS las consultas, con 1
// fila y con 50. Lo que se afirma:
//   - `deLaEmpresa` se llama a lo sumo una vez por repositorio y peticion, y el catalogo se lee una vez
//     (una sola llamada a `nodoGeografico.findMany`);
//   - el numero total de consultas no depende del numero de filas (50 filas = las mismas consultas que 1);
//   - y, para que el recuento no sea vacuo, las 50 filas salen nombradas con la ruta del catalogo.

const N = 50;

/** El catalogo del doble: dos provincias, un canton en cada una y un distrito por fila. */
function cadena(n: number) {
  return [
    { id: "p1", nombre: "Provincia uno" },
    { id: "c1", padreId: "p1", nombre: "Canton uno" },
    ...Array.from({ length: n }, (_, i) => ({ id: `d${i}`, padreId: "c1", nombre: `Distrito ${i}` })),
  ];
}

/**
 * Un doble de Prisma que cuenta cada llamada a un metodo de modelo (y a `$queryRaw`). Los modelos del
 * catalogo son los de `delegadosDelCatalogo`; el resto responde con `respuestas` o con un vacio.
 */
function prismaQueCuenta(respuestas: Record<string, unknown>, n: number) {
  const llamadas: string[] = [];
  const catalogo = delegadosDelCatalogo({ nodos: cadena(n) }) as Record<string, Record<string, (...a: unknown[]) => unknown>>;
  const vacio = (metodo: string): unknown => (metodo === "count" ? 0 : metodo.startsWith("findMany") ? [] : null);
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get(_o, metodo: string) {
          return async (...args: unknown[]) => {
            llamadas.push(`${nombre}.${metodo}`);
            const delCatalogo = catalogo[nombre]?.[metodo];
            if (delCatalogo) return delCatalogo(...args);
            const clave = `${nombre}.${metodo}`;
            return clave in respuestas ? respuestas[clave] : vacio(metodo);
          };
        },
      },
    );
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get(_o, prop: string) {
        if (prop === "then") return undefined;
        if (prop === "$transaction") {
          return async (fn: unknown) => {
            llamadas.push("$transaction");
            return typeof fn === "function" ? (fn as (t: unknown) => unknown)(prisma) : Promise.all(fn as unknown[]);
          };
        }
        if (prop === "$queryRaw") {
          return async () => {
            llamadas.push("$queryRaw");
            return [];
          };
        }
        return modelo(prop);
      },
    },
  );
  return { prisma: prisma as unknown as PrismaClient, llamadas };
}

const TARIFAS: ITarifaVigenteRepository = {
  resolveTarifa: vi.fn(async () => null),
  resolveTarifas: vi.fn(async () => new Map()),
} as unknown as ITarifaVigenteRepository;

function filaListado(i: number) {
  return {
    id: `o${i}`,
    numGuia: i + 1,
    numRemision: `REM-${i}`,
    estatusId: idEstado("en_bodega_central"),
    destinatario: "Ana",
    telefonoDest: "0990000000",
    tiendaId: "t1",
    zonaId: "z1",
    provinciaId: "p1",
    cantonId: "c1",
    distritoId: `d${i}`,
    producto: "Caja",
    peso: null,
    notas: null,
    direccion: "Av 1",
    montoCobrar: null,
    cobraComision: false,
    prioridad: false,
    mensajeroAsignadoId: null,
    fechaReparto: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    estatus: { id: idEstado("en_bodega_central"), value: "en_bodega_central" },
    tienda: { id: "t1", nombre: "Tienda", email: "t@e.test", telefono: "1" },
    zona: { id: "z1", nombre: "GAM", esCentral: true, sinpeNumero: null, sinpeNombre: null },
    mensajeroAsignado: null,
    gestiones: [],
    latitud: null,
    longitud: null,
    intentosContacto: 0,
  };
}

function filaGestion(i: number) {
  return {
    id: `g${i}`,
    ordenId: `o${i}`,
    createdAt: new Date("2026-01-01"),
    resultado: "entregado",
    montoRecibido: new Prisma.Decimal("1.00"),
    metodoPago: "efectivo",
    motivo: null,
    fechaReprogramacion: null,
    evidenciaStoragePath: null,
    evidencias: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    causaIncidente: null,
    pagos: [],
    orden: {
      numGuia: i + 1,
      numRemision: `REM-${i}`,
      destinatario: "Ana",
      direccion: "Av 1",
      producto: "Caja",
      tiendaId: "t1",
      tienda: { nombre: "Tienda" },
      zona: { nombre: "GAM" },
      cantonId: "c1",
      distritoId: `d${i}`,
      zonaId: "z1",
      montoCobrar: null,
      cobraComision: false,
    },
  };
}

interface Superficie {
  nombre: string;
  /** Respuestas del doble para `n` filas. */
  respuestas: (n: number) => Record<string, unknown>;
  /** Corre la lectura y devuelve los nombres de distrito de cada fila. */
  leer: (prisma: PrismaClient) => Promise<(string | null)[]>;
}

const filas = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i));

const SUPERFICIES: Superficie[] = [
  {
    nombre: "listado de /ordenes (`list`)",
    respuestas: (n) => ({ "orden.findMany": filas(n, filaListado), "orden.count": n }),
    leer: async (prisma) =>
      (
        await new OrdenRepository(prisma).list({
          where: {},
          sortBy: "created_at",
          sortDir: "desc",
          skip: 0,
          take: N,
        } as Parameters<OrdenRepository["list"]>[0])
      ).items.map((o) => o.relaciones?.distrito?.nombre ?? null),
  },
  {
    nombre: "recepcion satelite (`findRecepcionSateliteByZona`)",
    respuestas: (n) => ({ "orden.findMany": filas(n, filaListado) }),
    leer: async (prisma) =>
      (await new OrdenRepository(prisma).findRecepcionSateliteByZona("z1", [...ESTADOS_BODEGA_SATELITE])).map(
        (o) => o.distritoNombre,
      ),
  },
  {
    nombre: "etiqueta (`findEtiquetasByIds`)",
    respuestas: (n) => ({ "orden.findMany": filas(n, filaListado) }),
    leer: async (prisma) =>
      (await new OrdenRepository(prisma).findEtiquetasByIds(filas(N, (i) => `o${i}`) as string[], null)).map(
        (e) => e.distritoNombre,
      ),
  },
  {
    nombre: "novedades de la tienda (`findNovedadesByTienda`)",
    respuestas: (n) => ({ "orden.findMany": filas(n, filaListado) }),
    leer: async (prisma) =>
      (await new OrdenRepository(prisma).findNovedadesByTienda("t1", "devolucion", { skip: 0, take: N })).map(
        (o) => o.distritoNombre,
      ),
  },
  {
    nombre: "mis asignaciones (`GestionOrdenRepository.findMisAsignaciones`)",
    respuestas: (n) => ({ "orden.findMany": filas(n, filaListado) }),
    leer: async (prisma) =>
      (await new GestionOrdenRepository(prisma as never).findMisAsignaciones("m1", ["en_reparto"])).map(
        (o) => o.distritoNombre,
      ),
  },
  {
    nombre: "cierre de dia en vivo (`CierreDiaRepository.findGestionesPendientes`)",
    respuestas: (n) => ({ "gestionOrden.findMany": filas(n, filaGestion) }),
    leer: async (prisma) =>
      (await new CierreDiaRepository(prisma as never, TARIFAS).findGestionesPendientes("m1")).map(
        (g) => g.distritoNombre,
      ),
  },
];

describe("SLT-125 R20 — el catalogo se carga una vez y no hay consultas por fila", () => {
  let deLaEmpresa: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await sembrarCatalogoEstados();
    deLaEmpresa = vi.spyOn(CatalogoGeograficoRepository.prototype, "deLaEmpresa");
  });
  afterEach(() => {
    deLaEmpresa.mockRestore();
  });

  async function correr(s: Superficie, n: number) {
    deLaEmpresa.mockClear();
    const { prisma, llamadas } = prismaQueCuenta(s.respuestas(n), n);
    const nombres = await s.leer(prisma);
    return { nombres, llamadas, cargas: deLaEmpresa.mock.calls.length };
  }

  it.each(SUPERFICIES)("$nombre: con 50 filas, una carga del catalogo y las mismas consultas que con 1", async (s) => {
    const una = await correr(s, 1);
    const cincuenta = await correr(s, N);

    // Anti-vacuidad: las 50 filas salen, nombradas con la ruta del catalogo.
    expect(cincuenta.nombres).toHaveLength(N);
    expect(cincuenta.nombres).toEqual(filas(N, (i) => `Distrito ${i}`));

    // Una llamada a `deLaEmpresa` y una lectura de los nodos, con 1 o con 50 filas.
    expect(cincuenta.cargas).toBe(1);
    expect(cincuenta.llamadas.filter((l) => l === "nodoGeografico.findMany")).toHaveLength(1);
    // Ninguna consulta por fila: el recuento entero es el mismo.
    expect(cincuenta.llamadas.length).toBe(una.llamadas.length);
    expect([...cincuenta.llamadas].sort()).toEqual([...una.llamadas].sort());
  });

  it("sin filas no se carga el catalogo", async () => {
    for (const s of SUPERFICIES) {
      const cero = await correr(s, 0);
      expect(cero.nombres, s.nombre).toEqual([]);
      expect(cero.cargas, s.nombre).toBe(0);
      expect(cero.llamadas.filter((l) => l === "nodoGeografico.findMany"), s.nombre).toEqual([]);
    }
  });

  it("envio de WhatsApp (`OrdenEnvioReader`): una carga del catalogo para la orden, y la ruta llena `lugarRuta`", async () => {
    deLaEmpresa.mockClear();
    const { prisma, llamadas } = prismaQueCuenta({ "orden.findFirst": filaListado(7) }, 10);
    const datos = await new OrdenEnvioReader(prisma as never).findParaEnvio("o7", "m1");
    expect(datos?.orden.lugarRuta?.map((p) => p.nombre)).toEqual(["Provincia uno", "Canton uno", "Distrito 7"]);
    expect(deLaEmpresa.mock.calls.length).toBe(1);
    expect(llamadas.filter((l) => l === "nodoGeografico.findMany")).toHaveLength(1);
  });

  it("dos lecturas en el mismo repositorio comparten la carga (la memoria es por instancia)", async () => {
    const { prisma, llamadas } = prismaQueCuenta({ "orden.findMany": filas(N, filaListado) }, N);
    const repo = new OrdenRepository(prisma);
    await repo.findEtiquetasByIds(["o1"], null);
    await repo.findRecepcionSateliteByZona("z1", [...ESTADOS_BODEGA_SATELITE]);
    expect(llamadas.filter((l) => l === "nodoGeografico.findMany")).toHaveLength(1);
  });
});
