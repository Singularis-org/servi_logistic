import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { ErrorLogger } from "@/lib/errors/logger";
import type { IInformeTransitoRepository } from "@/lib/interfaces/repositories/IInformeTransitoRepository";
import {
  InformeTransitoRepository,
  PREFIJO_LOG_NODO_AUSENTE,
} from "@/lib/repositories/InformeTransitoRepository";
import { crearInformeTransito, seleccionarTransito } from "@/lib/whatsapp-envios/informes/transito/informe";
import {
  estadosIncluidos,
  PARAMETROS_POR_DEFECTO,
} from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { ConsultaTransito } from "@/lib/whatsapp-envios/informes/transito/tipos";
import * as hoy from "@/scripts/geo-equivalencia/analitica-de-hoy";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo71, type EmpresaGeo71 } from "./_fixtures/geo-71";
import { DATOS_PERSONALES_GEO65 } from "./_fixtures/geo-65";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-71 (T4.2; R8–R13; design §4, §11) — EL INFORME DE TRANSITO NOMBRA CANTON Y DISTRITO CON EL
// CATALOGO, contra la copia congelada de hoy (`filasEnAlertaDeHoy`) y sobre Postgres real, en el
// fixture `geo-71`.
//
// Se lee como la app (`servi_app` con la RLS de la empresa y `conEmpresa`, como el job de envios). Un
// nodo AUSENTE del catalogo no se puede escribir en la base (la FK de la orden es a `canton` y
// `distrito`, y los triggers de SLT-43 crean el nodo): se prueba cambiando la ENTRADA, con un cliente
// que quita nodos del resultado de `nodoGeografico.findMany`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const MODELOS_DEL_CATALOGO = new Set([
  "zonaDistrito",
  "organizacion",
  "tipoNivelGeografico",
  "nodoGeografico",
  "distritoZonaEspecial",
]);

interface Registro {
  /** Cada `$queryRaw`, reconstruido como lo manda Prisma. */
  sql: Prisma.Sql[];
  /** Cada lectura de un modelo del catalogo, por nombre (`nodoGeografico.findMany`, ...). */
  catalogo: string[];
  /** Los ids que devolvio cada `nodoGeografico.findMany`. */
  cargasDeNodos: string[][];
}

/** El cliente de la transaccion, con registro de lo que lee y, si se pide, sin algunos nodos. */
function clienteEspia(tx: TxDeTest, quitar: readonly string[] = []): { cliente: PrismaClient; reg: Registro } {
  const reg: Registro = { sql: [], catalogo: [], cargasDeNodos: [] };
  const fuera = new Set(quitar);
  const envolver = (objetivo: object): PrismaClient =>
    new Proxy(objetivo, {
      get(o, prop) {
        if (prop === "$transaction") {
          const real = Reflect.get(o, prop) as ((fn: (t: object) => unknown, op?: unknown) => Promise<unknown>) | undefined;
          if (typeof real !== "function") return real;
          return (fn: (t: object) => unknown, op?: unknown) => real.call(o, (t: object) => fn(envolver(t)), op);
        }
        if (prop === "$queryRaw") {
          const real = Reflect.get(o, prop) as (...a: unknown[]) => Promise<unknown>;
          return (plantilla: TemplateStringsArray, ...valores: unknown[]) => {
            reg.sql.push(Prisma.sql(plantilla, ...valores));
            return real.call(o, plantilla, ...valores);
          };
        }
        if (typeof prop === "string" && MODELOS_DEL_CATALOGO.has(prop)) {
          const delegado = Reflect.get(o, prop) as Record<string, (a: unknown) => Promise<unknown>>;
          return new Proxy(delegado, {
            get(d, metodo) {
              const fn = Reflect.get(d, metodo) as unknown;
              if (typeof fn !== "function") return fn;
              return async (args: unknown) => {
                reg.catalogo.push(`${prop}.${String(metodo)}`);
                const r = (await (fn as (a: unknown) => Promise<unknown>).call(d, args)) as unknown;
                if (prop !== "nodoGeografico" || !Array.isArray(r)) return r;
                const filas = (r as { id: string }[]).filter((n) => !fuera.has(n.id));
                reg.cargasDeNodos.push(filas.map((n) => n.id));
                return filas;
              };
            },
          });
        }
        const valor = Reflect.get(o, prop) as unknown;
        return typeof valor === "function" ? valor.bind(o) : valor;
      },
    }) as unknown as PrismaClient;
  return { cliente: envolver(tx as object), reg };
}

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
async function comoLaEmpresa<T>(tx: TxDeTest, empresaId: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, empresaId);
  try {
    return await conEmpresa(empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** Un logger doble que guarda lo que recibe. */
function loggerDoble(): ErrorLogger & { lineas: unknown[] } {
  const lineas: unknown[] = [];
  return { lineas, logError: (e: unknown) => void lineas.push(e) };
}

/** La consulta de una generacion con los parametros por defecto, para las zonas de la empresa. */
function consultaDe(e: EmpresaGeo71): ConsultaTransito {
  const z = e.base.base.zonas;
  const corte = new Date();
  return {
    hito: PARAMETROS_POR_DEFECTO.hito,
    estados: estadosIncluidos(PARAMETROS_POR_DEFECTO),
    cortes: [z.centralId, z.norteId, z.surId].map((zonaId) => ({ zonaId, corte })),
  };
}

/** El repositorio de hoy: el nuevo con `filasEnAlerta` de la copia congelada. */
function repoDeHoy(cliente: PrismaClient): IInformeTransitoRepository {
  const nuevo = new InformeTransitoRepository(cliente);
  return {
    zonas: () => nuevo.zonas(),
    filasEnAlerta: (c) => hoy.filasEnAlertaDeHoy(cliente, c),
    contarSinHito: (c) => nuevo.contarSinHito(c),
  };
}

const AHORA_FIJO = () => new Date();

/** `n` ordenes mas en transito vencidas, en la zona norte y el distrito central de la empresa. */
async function sembrarEnTransito(tx: TxDeTest, e: EmpresaGeo71, n: number): Promise<void> {
  await comoDueno(tx);
  const g = e.base.base.geo;
  const [destinatario, telefono, direccion] = DATOS_PERSONALES_GEO65;
  const estado = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_bodega_central" }, select: { id: true } });
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', $1, true)`, e.base.base.empresaId);
  for (let i = 0; i < n; i++) {
    const o = await tx.orden.create({
      data: {
        numRemision: `SLT71-T-${randomUUID().slice(0, 8)}`,
        destinatario,
        telefonoDest: telefono,
        direccion,
        producto: "caja",
        estatusId: estado.id,
        tiendaId: e.base.base.tiendaId,
        zonaId: e.base.base.zonas.norteId,
        provinciaId: g.provinciaId,
        cantonId: g.cantonId,
        distritoId: g.distritoCentralId,
        montoCobrar: "1000",
        createdAt: hace(40),
      },
      select: { id: true },
    });
    await tx.ordenHistorialEstado.create({
      data: { ordenId: o.id, estatusDestinoId: estado.id, origenTipo: "creacion_manual", createdAt: hace(30) },
    });
  }
}

// ---------------------------------------------------------------------------------------------

describeSiHayBase("SLT-71 T4.2 — transito nombra con el catalogo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R8, R9: las filas en alerta y el modelo de la seleccion son los de hoy, fila a fila, en las dos empresas", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const cliente = tx as unknown as PrismaClient;
      const salida = [];
      for (const emp of [e.cr, e.xa]) {
        salida.push(
          await comoLaEmpresa(tx, emp.base.base.empresaId, async () => {
            const q = consultaDe(emp);
            const ahora = AHORA_FIJO();
            const porId = <T extends { ordenId: string }>(xs: T[]) => [...xs].sort((a, b) => a.ordenId.localeCompare(b.ordenId));
            return {
              transito: [emp.ordenes.transitoConDistritoId, emp.ordenes.transitoSinDistritoId].sort(),
              nuevas: porId(await new InformeTransitoRepository(cliente).filasEnAlerta(q)),
              deHoy: porId(await hoy.filasEnAlertaDeHoy(cliente, q)),
              modeloNuevo: (await seleccionarTransito(new InformeTransitoRepository(cliente), PARAMETROS_POR_DEFECTO, ahora)).modelo,
              modeloDeHoy: (await seleccionarTransito(repoDeHoy(cliente), PARAMETROS_POR_DEFECTO, ahora)).modelo,
            };
          }),
        );
      }
      return salida;
    });
    for (const x of r) {
      expect(x.nuevas.map((f) => f.ordenId)).toEqual(x.transito);
      expect(x.nuevas).toEqual(x.deHoy);
      // R8: con distrito, su nombre; sin distrito, null. Nunca vacio.
      expect(x.nuevas.every((f) => f.canton.length > 0)).toBe(true);
      expect(x.nuevas.filter((f) => f.distrito === null)).toHaveLength(1);
      expect(x.modeloNuevo).toEqual(x.modeloDeHoy);
    }
  });

  it("R10: sin unir con canton ni distrito, y el numero de consultas no depende del de ordenes (1 y 40)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const emp = e.xa;
      // Una sola orden en alerta: la otra de transito se borra (soft delete).
      await tx.orden.update({ where: { id: emp.ordenes.transitoSinDistritoId }, data: { deletedAt: new Date() } });
      const medir = async () => {
        const { cliente, reg } = clienteEspia(tx);
        const filas = await comoLaEmpresa(tx, emp.base.base.empresaId, async () => {
          const sel = await seleccionarTransito(new InformeTransitoRepository(cliente), PARAMETROS_POR_DEFECTO, new Date());
          return sel.modelo;
        });
        return { consultas: reg.sql.length + reg.catalogo.length, sql: reg.sql.map((s) => s.text), filas };
      };
      const con1 = await medir();
      await sembrarEnTransito(tx, emp, 39);
      const con40 = await medir();
      const enAlerta = async () =>
        comoLaEmpresa(tx, emp.base.base.empresaId, async () =>
          (await new InformeTransitoRepository(tx as unknown as PrismaClient).filasEnAlerta(consultaDe(emp))).length,
        );
      return { con1, con40, n40: await enAlerta() };
    });
    expect(r.n40).toBe(40);
    expect(r.con40.consultas).toBe(r.con1.consultas);
    const filasSql = r.con1.sql.find((s) => s.includes('"cand"') && s.includes('"hito_at"'));
    expect(filasSql).toBeDefined();
    expect(filasSql).not.toMatch(/(FROM|JOIN)\s+"(canton|distrito)"/);
  });

  it("R11: sin ordenes en alerta, la generacion no carga el catalogo", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const { cliente, reg } = clienteEspia(tx);
      const filas = await comoLaEmpresa(tx, e.cr.base.base.empresaId, async () => {
        // Corte en el pasado lejano: ninguna orden entra.
        const q = { ...consultaDe(e.cr), cortes: consultaDe(e.cr).cortes.map((c) => ({ ...c, corte: new Date("2000-01-01") })) };
        return new InformeTransitoRepository(cliente).filasEnAlerta(q);
      });
      return { filas, catalogo: reg.catalogo };
    });
    expect(r.filas).toEqual([]);
    expect(r.catalogo).toEqual([]);
  });

  it("R12: un canton y un distrito ausentes del catalogo hacen fallar la generacion con una sola linea de log, solo con ids", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const emp = e.cr;
      const sinCanton = emp.segunda.cantonId; // canton de `transitoSinDistrito`
      const sinDistrito = emp.base.base.geo.distritoCentralId; // distrito de `transitoConDistrito`
      const { cliente } = clienteEspia(tx, [sinCanton, sinDistrito]);
      const logger = loggerDoble();
      const informe = crearInformeTransito({ repo: new InformeTransitoRepository(cliente, logger) });
      const resultado = await comoLaEmpresa(tx, emp.base.base.empresaId, () =>
        informe
          .generar({ parametros: PARAMETROS_POR_DEFECTO, ahora: new Date(), conDocumento: true })
          .then((x) => ({ ok: x as unknown, error: null as unknown }), (err: unknown) => ({ ok: null, error: err })),
      );
      // Los nombres de todos los nodos del fixture, para comprobar que ninguno sale en el log.
      const g = emp.base.base.geo;
      const ids = [...Object.values(g), ...Object.values(emp.segunda)];
      const nombres = (await tx.nodoGeografico.findMany({ where: { id: { in: ids } }, select: { nombre: true } })).map(
        (n) => n.nombre,
      );
      // Contraprueba: con el catalogo completo, el logger no recibe nada.
      const loggerCompleto = loggerDoble();
      const completo = await comoLaEmpresa(tx, emp.base.base.empresaId, () =>
        crearInformeTransito({ repo: new InformeTransitoRepository(tx as unknown as PrismaClient, loggerCompleto) }).generar({
          parametros: PARAMETROS_POR_DEFECTO,
          ahora: new Date(),
          conDocumento: false,
        }),
      );
      return {
        resultado,
        lineas: logger.lineas,
        nombres,
        nodos: [sinCanton, sinDistrito],
        ordenes: [emp.ordenes.transitoSinDistritoId, emp.ordenes.transitoConDistritoId],
        completo: completo.tipo,
        lineasCompleto: loggerCompleto.lineas,
      };
    });
    expect(r.resultado.ok).toBeNull();
    expect(String((r.resultado.error as Error).message)).toContain("informe transito: filasEnAlerta falló");
    expect(r.lineas).toHaveLength(1);
    const linea = r.lineas[0];
    expect(typeof linea).toBe("string");
    const texto = linea as string;
    expect(texto.startsWith(PREFIJO_LOG_NODO_AUSENTE)).toBe(true);
    expect(PREFIJO_LOG_NODO_AUSENTE).toBe("analitica - informe transito - error: ");
    for (const id of [...r.nodos, ...r.ordenes]) expect(texto).toContain(id);
    for (const dato of DATOS_PERSONALES_GEO65) expect(texto).not.toContain(dato);
    expect(r.nombres.length).toBeGreaterThan(5);
    for (const nombre of r.nombres) expect(texto).not.toContain(nombre);
    expect(r.completo).toBe("contenido");
    expect(r.lineasCompleto).toEqual([]);
  });

  it("R13: XA carga solo su catalogo, una vez por instancia; en plataforma falla con EmpresaNoResuelta", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const { cliente, reg } = clienteEspia(tx);
      const filas = await comoLaEmpresa(tx, e.xa.base.base.empresaId, async () => {
        const repo = new InformeTransitoRepository(cliente);
        await repo.filasEnAlerta(consultaDe(e.xa));
        return repo.filasEnAlerta(consultaDe(e.xa));
      });
      const enPlataforma = await comoPlataforma("SLT-71", "test: transito en plataforma", () =>
        new InformeTransitoRepository(tx as unknown as PrismaClient)
          .filasEnAlerta(consultaDe(e.cr))
          .then(() => null, (err: unknown) => err),
      );
      return { filas: filas.length, cargas: reg.cargasDeNodos, enPlataforma, xa: e.xa, cr: e.cr };
    });
    expect(r.filas).toBe(2);
    expect(r.cargas).toHaveLength(1);
    const ids = new Set(r.cargas[0]);
    expect(ids.has(r.xa.base.base.geo.cantonId)).toBe(true);
    expect(ids.has(r.cr.base.base.geo.cantonId)).toBe(false);
    expect(r.enPlataforma).toBeInstanceOf(EmpresaNoResuelta);
  });
});
