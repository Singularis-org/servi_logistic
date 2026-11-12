import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { prepararConteoEntregas, type ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { prepararConsultaProductos } from "@/lib/analytics/productos-consulta";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import {
  CierreDiaRepository,
  SNAPSHOT_SELECT,
  leerDescriptivosDeOrdenes,
} from "@/lib/repositories/CierreDiaRepository";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CicloVidaRepository } from "@/lib/repositories/CicloVidaRepository";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { CohorteCargaRepository } from "@/lib/repositories/CohorteCargaRepository";
import { ConteoCargadasPorDiaRepository } from "@/lib/repositories/ConteoCargadasPorDiaRepository";
import { ConteoDevolucionesRepository } from "@/lib/repositories/ConteoDevolucionesRepository";
import { ConteoEntregasRepository } from "@/lib/repositories/ConteoEntregasRepository";
import { ConteoHoyGestionRepository } from "@/lib/repositories/ConteoHoyGestionRepository";
import { ConteoPorStatusRepository } from "@/lib/repositories/ConteoPorStatusRepository";
import { ConteoProductosRepository } from "@/lib/repositories/ConteoProductosRepository";
import { DineroProductosRepository } from "@/lib/repositories/DineroProductosRepository";
import { InformeTransitoRepository } from "@/lib/repositories/InformeTransitoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { planificarReconciliacion } from "@/lib/repositories/ZonaRepository";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";
import { estadosIncluidos, PARAMETROS_POR_DEFECTO } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { ConsultaTransito } from "@/lib/whatsapp-envios/informes/transito/tipos";
import { rawConLugar } from "@/scripts/geo-equivalencia/filtros-de-hoy";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearBasePropia43, type BasePropia43 } from "./_fixtures/base-propia-43";
import { TRIGGERS_DE_COLUMNAS_NUEVAS, vaciarColumnasNuevas } from "./_fixtures/geo-43";
import { crearEscenarioGeo44, type EmpresaGeo44 } from "./_fixtures/geo-44";
import { crearEscenarioGeo65, type EmpresaGeo65, type EscenarioGeo65 } from "./_fixtures/geo-65";
import { crearEscenarioGeo71, type EmpresaGeo71, type EscenarioGeo71 } from "./_fixtures/geo-71";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, type TxDeTest } from "./_postgres-real";
import { ZonaRepositoryConAntes } from "./_fixtures/antes-de-zona";

// SLT-44 (T4.6; R12; design §10) — LAS LECTURAS DE R18 Y R20 NO DEPENDEN DEL BACKFILL DE SLT-43.
//
// Se leen dos veces sobre el mismo escenario: con `nodo_geografico_id` lleno (lo llenan los triggers
// de SLT-43 al sembrar) y despues con la columna en NULL en `zona_distrito` y
// `distrito_zona_especial`, como estaria una base en la que el script de datos no corrio. El
// resultado tiene que ser el mismo: el nodo de cada asignacion y de cada marca sale de su
// `distrito_id`. Un tercer paso desvia la columna de `zona_distrito` a otro distrito: si alguna
// lectura la usara, la zona saltaria de distrito.
//
// BASE PROPIA (`slt43_nb_…`, `_fixtures/base-propia-43.ts`): vaciar la columna exige apagar los
// triggers que la llenan, y `ALTER TABLE … DISABLE TRIGGER` toma AccessExclusiveLock hasta el final
// de la transaccion; en la base compartida bloquearia a los archivos que corren a la vez.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let propia: BasePropia43 | undefined;

/** R18 (las tres lecturas de la resolucion por nombres) y R20 (el Excel), como la app. */
async function leerComoLaApp(tx: TxDeTest, empresa: EmpresaGeo44) {
  await comoApp(tx, empresa.empresaId);
  try {
    return await conEmpresa(empresa.empresaId, async () => {
      // Repositorios nuevos en cada lectura: la memoria del catalogo es por instancia (design §4).
      const ordenes = new OrdenRepository(clienteConSavepoint(tx));
      const provincias = await ordenes.findAllProvincias();
      const cantones = await ordenes.findCantonesByProvinciaIds(provincias.map((p) => p.id));
      const distritos = await ordenes.findDistritosByCantonIds(cantones.map((c) => c.id));
      const cobertura = await new CoberturaRepository(clienteConSavepoint(tx)).listDistritos();
      const ordenar = <T>(filas: T[]) => [...filas].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return {
        provincias: ordenar(provincias),
        cantones: ordenar(cantones),
        distritos: ordenar(distritos),
        cobertura: ordenar(cobertura.map((f) => ({ ...f, zonas: [...f.zonas].sort((a, b) => a.id.localeCompare(b.id)) }))),
      };
    });
  } finally {
    await comoDueno(tx);
  }
}

/** Cuantas filas de las dos tablas tienen la columna llena y cuantas en NULL. */
async function estadoDeLaColumna(tx: TxDeTest): Promise<{ llenas: number; vacias: number }> {
  const [fila] = await tx.$queryRawUnsafe<{ llenas: number; vacias: number }[]>(
    `SELECT
       (SELECT count(*) FROM zona_distrito WHERE nodo_geografico_id IS NOT NULL)::int
       + (SELECT count(*) FROM distrito_zona_especial WHERE nodo_geografico_id IS NOT NULL)::int AS llenas,
       (SELECT count(*) FROM zona_distrito WHERE nodo_geografico_id IS NULL)::int
       + (SELECT count(*) FROM distrito_zona_especial WHERE nodo_geografico_id IS NULL)::int AS vacias`,
  );
  return fila;
}

async function idsDe(tx: TxDeTest, tabla: "zona_distrito" | "distrito_zona_especial"): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${tabla}`);
  return filas.map((f) => f.id);
}

describeSiHayBase("SLT-44 R12 — las lecturas no leen `nodo_geografico_id` (base propia)", () => {
  beforeAll(async () => {
    propia = await crearBasePropia43("nb");
  }, 600_000);
  afterAll(async () => {
    await propia?.cerrar();
  }, 60_000);

  it("con la columna en NULL y con ella desviada, R18 y R20 dan lo mismo que con la columna llena", async () => {
    const base: PrismaClient = propia!.prisma;
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo44(tx);
      const antes = await estadoDeLaColumna(tx);
      const llena = { cr: await leerComoLaApp(tx, e.cr), xa: await leerComoLaApp(tx, e.xa) };

      await vaciarColumnasNuevas(tx, {
        zonaDistrito: await idsDe(tx, "zona_distrito"),
        distritoZonaEspecial: await idsDe(tx, "distrito_zona_especial"),
      });
      // Y la lectura con los triggers de columna APAGADOS, como pide el diseño: si una lectura
      // escribiera la columna de paso, no la rellenarian ellos.
      for (const { tabla, trigger } of TRIGGERS_DE_COLUMNAS_NUEVAS) {
        await tx.$executeRawUnsafe(`ALTER TABLE ${tabla} DISABLE TRIGGER ${trigger}`);
      }
      const trasVaciar = await estadoDeLaColumna(tx);
      const enNull = { cr: await leerComoLaApp(tx, e.cr), xa: await leerComoLaApp(tx, e.xa) };

      // Desviada: cada fila de zona de CR apunta al distrito «sin zona».
      await tx.$executeRawUnsafe(
        `UPDATE zona_distrito SET nodo_geografico_id = $1 WHERE organizacion_id = $2`,
        e.cr.geo.distritoSinZonaId,
        e.cr.empresaId,
      );
      const desviada = { cr: await leerComoLaApp(tx, e.cr) };
      return { e, antes, trasVaciar, llena, enNull, desviada };
    });

    // Anti-vacuidad: antes habia filas llenas, despues ninguna; y el escenario esta en las lecturas.
    expect(r.antes.llenas).toBeGreaterThanOrEqual(14);
    expect(r.trasVaciar).toEqual({ llenas: 0, vacias: r.antes.llenas + r.antes.vacias });
    const central = r.llena.cr.distritos.find((d) => d.id === r.e.cr.geo.distritoCentralId);
    expect(central).toMatchObject({ zonaId: r.e.cr.zonas.centralId, esZonaEspecial: true });
    expect(r.llena.xa.cobertura.some((f) => f.distrito.zonaEspecial)).toBe(true);

    expect(r.enNull.cr).toEqual(r.llena.cr);
    expect(r.enNull.xa).toEqual(r.llena.xa);
    expect(r.desviada.cr).toEqual(r.llena.cr);
  }, 120_000);

  // SLT-65 (T7.2; R19; design §14) — LAS LECTURAS 1–7 DE SLT-65 (design §2.1) TAMPOCO DEPENDEN DEL
  // BACKFILL. Mismo metodo, sobre el escenario de `geo-65.ts`, y ahora tambien con
  // `orden.nodo_geografico_id`: llena, en NULL (triggers apagados) y desviada a otro nodo.
  describe("SLT-65 R19 — las lecturas 1–7 dan lo mismo con `nodo_geografico_id` en NULL o desviado", () => {
    it("API, listado, cobro, correccion, conteo, cierre y zona: llena = en NULL = desviada", async () => {
      const base: PrismaClient = propia!.prisma;
      const r = await revertida(base, async (tx) => {
        const e = await crearEscenarioGeo65(tx);
        const antes = await estadoDeLas3Columnas(tx);
        const llena = await leerLas7(tx, e);

        await vaciarColumnasNuevas(tx, {
          orden: await idsDe65(tx, "orden"),
          zonaDistrito: await idsDe65(tx, "zona_distrito"),
          distritoZonaEspecial: await idsDe65(tx, "distrito_zona_especial"),
        });
        // Con los triggers APAGADOS: ni una lectura ni una escritura de las lecturas 6 y 7 rellenan la
        // columna de paso.
        for (const { tabla, trigger } of TRIGGERS_DE_COLUMNAS_NUEVAS) {
          await tx.$executeRawUnsafe(`ALTER TABLE ${tabla} DISABLE TRIGGER ${trigger}`);
        }
        const trasVaciar = await estadoDeLas3Columnas(tx);
        const enNull = await leerLas7(tx, e);

        // Desviada: cada orden del fixture apunta al canton retirado de su empresa, y cada asignacion
        // y cada marca al distrito «sin zona». Si una lectura usara la columna, la marca, la zona, el
        // conteo y el congelado cambiarian.
        for (const empresa of [e.cr, e.xa]) {
          const g = empresa.base.geo;
          await tx.$executeRawUnsafe(
            `UPDATE orden SET nodo_geografico_id = $1 WHERE id = ANY($2::text[])`,
            g.cantonRetiradoId,
            Object.values(empresa.ordenes),
          );
          await tx.$executeRawUnsafe(
            `UPDATE zona_distrito SET nodo_geografico_id = $1 WHERE organizacion_id = $2`,
            g.distritoSinZonaId,
            empresa.base.empresaId,
          );
          await tx.$executeRawUnsafe(
            `UPDATE distrito_zona_especial SET nodo_geografico_id = $1 WHERE organizacion_id = $2`,
            g.distritoSinZonaId,
            empresa.base.empresaId,
          );
        }
        const desviada = await leerLas7(tx, e);
        return { e, antes, trasVaciar, llena, enNull, desviada };
      });

      // Anti-vacuidad: las tres columnas estaban llenas y despues ninguna; y cada lectura lee algo.
      expect(r.antes.orden.llenas).toBeGreaterThanOrEqual(22);
      expect(r.antes.zonaDistrito.llenas).toBeGreaterThan(0);
      expect(r.antes.distritoZonaEspecial.llenas).toBeGreaterThan(0);
      for (const tabla of ["orden", "zonaDistrito", "distritoZonaEspecial"] as const) {
        expect(r.trasVaciar[tabla], tabla).toEqual({ llenas: 0, vacias: r.antes[tabla].llenas + r.antes[tabla].vacias });
      }
      for (const empresa of ["cr", "xa"] as const) {
        const l = r.llena[empresa];
        const o = r.e[empresa].ordenes;
        const n = Object.values(o).length;
        expect(l.api.items, `${empresa}: lectura 1`).toHaveLength(n);
        expect(l.api.items.filter((f) => f.costeo.esZonaEspecial)).toHaveLength(5);
        expect(l.detalles).toHaveLength(n);
        expect(l.porIds, `${empresa}: lectura 2`).toHaveLength(n);
        expect(l.listado.items.map((i) => i.id)).toEqual(expect.arrayContaining(Object.values(o)));
        expect(l.cobro.filter((c) => c?.esZonaEspecial), `${empresa}: lectura 3`).toHaveLength(5);
        expect(l.correccion.filter((c) => c?.distritoNombre === null), `${empresa}: lectura 4`).toHaveLength(3);
        expect(l.conteo[0], `${empresa}: lectura 5 (provincia)`).toBeGreaterThan(0);
        expect(l.descriptivos.distritos.get(r.e[empresa].base.geo.distritoCentralId)?.zonaEspecial, `${empresa}: lectura 6`).toBe(true);
        expect(l.congelado.get(o.conDistritoConMarcaId)?.esZonaEspecial).toBe(true);
        expect(l.congelado.size).toBe(r.e[empresa].gestionesSinCierreIds.length);
        expect(l.plan.porZona.length, `${empresa}: lectura 7`).toBeGreaterThan(0);
        expect(l.zona.res).toEqual({ ordenesReconciliadas: 1, ordenesRetenidasEnBodegaSatelite: 0 });
        expect(l.zona.enDistritoSinZona).toBe(r.e[empresa].base.zonas.norteId);
      }

      expect(r.enNull).toEqual(r.llena);
      expect(r.desviada).toEqual(r.llena);
    }, 300_000);
  });

  // SLT-71 (T7.1; R14; design §6, §11) — LAS LECTURAS DE ANALITICA (CON FACETA GEOGRAFICA), LAS QUE
  // COMPARTEN SU RECORTE Y LAS FILAS EN ALERTA DE TRANSITO TAMPOCO DEPENDEN DEL BACKFILL. Mismo metodo,
  // sobre el escenario de `geo-71.ts`: `orden.nodo_geografico_id` llena, en NULL (triggers apagados) y
  // desviada al canton retirado.
  describe("SLT-71 R14 — analitica con faceta y transito dan lo mismo con `nodo_geografico_id` en NULL o desviado", () => {
    it("las nueve lecturas de analitica por provincia, canton, distrito y combinacion, y transito: llena = en NULL = desviada", async () => {
      const base: PrismaClient = propia!.prisma;
      const r = await revertida(base, async (tx) => {
        const e = await crearEscenarioGeo71(tx);
        const antes = await estadoDeLas3Columnas(tx);
        const ahora = new Date();
        const llena = await leerLasDe71(tx, e, ahora);

        await vaciarColumnasNuevas(tx, {
          orden: await idsDe65(tx, "orden"),
          zonaDistrito: await idsDe65(tx, "zona_distrito"),
          distritoZonaEspecial: await idsDe65(tx, "distrito_zona_especial"),
        });
        for (const { tabla, trigger } of TRIGGERS_DE_COLUMNAS_NUEVAS) {
          await tx.$executeRawUnsafe(`ALTER TABLE ${tabla} DISABLE TRIGGER ${trigger}`);
        }
        const trasVaciar = await estadoDeLas3Columnas(tx);
        const enNull = await leerLasDe71(tx, e, ahora);

        // Desviada: cada orden de cada empresa apunta al canton retirado de su empresa. Si una lectura
        // filtrara o nombrara por la columna, las facetas y los nombres de transito cambiarian.
        for (const empresa of [e.cr, e.xa]) {
          await tx.$executeRawUnsafe(
            `UPDATE orden SET nodo_geografico_id = $1 WHERE organizacion_id = $2`,
            empresa.base.base.geo.cantonRetiradoId,
            empresa.base.base.empresaId,
          );
        }
        const desviada = await leerLasDe71(tx, e, ahora);
        return { antes, trasVaciar, llena, enNull, desviada };
      });

      // Anti-vacuidad: la columna de `orden` estaba llena y despues no; cada empresa lee algo.
      expect(r.antes.orden.llenas).toBeGreaterThanOrEqual(30);
      expect(r.trasVaciar.orden).toEqual({ llenas: 0, vacias: r.antes.orden.llenas + r.antes.orden.vacias });
      for (const empresa of ["cr", "xa"] as const) {
        const l = r.llena[empresa];
        expect(l.transito, `${empresa}: transito`).toHaveLength(2);
        expect(l.transito.every((f) => f.canton.length > 0)).toBe(true);
        expect(l.analitica.length).toBeGreaterThan(40);
        expect(l.totalPorStatus, `${empresa}: desglose por estado con faceta`).toBeGreaterThan(0);
      }

      expect(r.enNull).toEqual(r.llena);
      expect(r.desviada).toEqual(r.llena);
    }, 300_000);
  });
});

/** Cuantas filas de cada tabla tienen la columna llena y cuantas en NULL. */
async function estadoDeLas3Columnas(tx: TxDeTest) {
  const contar = async (tabla: string) => {
    const [f] = await tx.$queryRawUnsafe<{ llenas: number; vacias: number }[]>(
      `SELECT count(*) FILTER (WHERE nodo_geografico_id IS NOT NULL)::int AS llenas,
              count(*) FILTER (WHERE nodo_geografico_id IS NULL)::int AS vacias
         FROM ${tabla}`,
    );
    return f;
  };
  return {
    orden: await contar("orden"),
    zonaDistrito: await contar("zona_distrito"),
    distritoZonaEspecial: await contar("distrito_zona_especial"),
  };
}

async function idsDe65(tx: TxDeTest, tabla: "orden" | "zona_distrito" | "distrito_zona_especial"): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${tabla}`);
  return filas.map((f) => f.id);
}

const PAGINA_65 = { skip: 0, take: 100 } as const;

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
async function comoLaEmpresa65<T>(tx: TxDeTest, e: EmpresaGeo65, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.base.empresaId);
  try {
    return await conEmpresa(e.base.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** Corre `fn` en un SAVEPOINT que SIEMPRE se deshace: la escritura de las lecturas 6 y 7 no queda. */
async function yDeshacer<T>(tx: TxDeTest, fn: () => Promise<T>): Promise<T> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
  }
}

/** Todos los nodos de la geografia de una empresa, con su nivel (lectura 5). */
function nodosDe65(e: EmpresaGeo65): { nivel: NivelGeografico; id: string }[] {
  const g = e.base.geo;
  return [
    { nivel: "provincia", id: g.provinciaId },
    { nivel: "canton", id: g.cantonId },
    { nivel: "canton", id: g.cantonRetiradoId },
    { nivel: "distrito", id: g.distritoCentralId },
    { nivel: "distrito", id: g.distritoDosZonasId },
    { nivel: "distrito", id: g.distritoSinZonaId },
    { nivel: "distrito", id: g.distritoRetiradoId },
    { nivel: "distrito", id: g.distritoBajoCantonRetiradoId },
  ];
}

/** Las lecturas 1–7 de design §2.1 para una empresa, como la app. Las escrituras se deshacen. */
async function leerLas7DeUna(tx: TxDeTest, e: EmpresaGeo65) {
  const ids = Object.values(e.ordenes);
  const g = e.base.geo;
  const comoApp65 = await comoLaEmpresa65(tx, e, async () => {
    const cliente = clienteConSavepoint(tx);
    // Repositorios nuevos en cada lectura: la memoria del catalogo es por instancia (R21).
    const nuevo = () => new OrdenRepository(cliente);
    // 1. API.
    const api = await nuevo().listByOwner({ ownerId: e.base.tiendaId, ...PAGINA_65 });
    const detalles = [];
    for (const id of ids) detalles.push(await nuevo().findDetalleByOrdenIdForOwner(id, e.base.tiendaId));
    // 2. /ordenes.
    const listado = await nuevo().list({ where: {}, sortBy: "created_at", sortDir: "desc", ...PAGINA_65 });
    const porIds = await nuevo().findListItemsByIds(ids, { tipo: "global" });
    // 3 y 4. Cobro de la devolucion y correccion.
    const cobro = [];
    const correccion = [];
    for (const id of ids) {
      cobro.push(await nuevo().findBaseCobroDevolucion(id));
      correccion.push(await nuevo().findParaCorreccion(id));
    }
    // 6. Lo que congela un cierre: la lectura y el cierre entero (deshecho).
    const filas = await cliente.gestionOrden.findMany({
      where: { id: { in: e.gestionesSinCierreIds } },
      select: SNAPSHOT_SELECT,
      orderBy: { id: "asc" },
    });
    const descriptivos = await leerDescriptivosDeOrdenes(filas, cliente);
    const congelado = await yDeshacer(tx, async () => {
      const cierreId = await new CierreDiaRepository(cliente, new TarifaVigenteRepository(cliente)).crearCierre({
        mensajeroId: e.mensajeroId,
        destinoTipo: "bodega_central",
        destinoZonaId: e.base.zonas.centralId,
        totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
        pagoByGestionId: {},
        totalPagoMensajero: "0.00",
        ingresoByGestionId: {},
        totalIngresoBodegaRechazos: "0.00",
      });
      if (cierreId === null) throw new Error("el cierre del fixture no vinculo ninguna gestion");
      const detalle = await cliente.cierreDetail.findMany({
        where: { cierreId },
        select: {
          ordenId: true,
          esCentral: true,
          esZonaEspecial: true,
          tiendaNombre: true,
          zonaNombre: true,
          provinciaNombre: true,
          cantonNombre: true,
          distritoNombre: true,
        },
      });
      return new Map(detalle.map(({ ordenId, ...resto }) => [ordenId, resto]));
    });
    // 7. La zona de las ordenes al guardar una zona: el plan y el guardado entero (deshecho). La zona
    // norte gana el distrito «sin zona», asignacion que el guardado escribe con los triggers como esten.
    const nodos = [g.cantonId, g.cantonRetiradoId, g.distritoCentralId, g.distritoDosZonasId, g.distritoSinZonaId, g.distritoRetiradoId, g.distritoBajoCantonRetiradoId];
    const p = await planificarReconciliacion(cliente, nodos);
    const plan = {
      porZona: [...p.porZona.entries()]
        .map(([zonaId, ordenes]) => [zonaId, ordenes.map((o) => o.id).sort()] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
      retenidas: p.retenidasEnBodegaSatelite,
    };
    const zona = await yDeshacer(tx, async () => {
      const res = await new ZonaRepositoryConAntes(tx, cliente).update(
        e.base.zonas.norteId,
        { nombre: "Zona norte SLT65 R19", distritoIds: [g.distritoDosZonasId, g.distritoRetiradoId, g.distritoSinZonaId] },
        null,
      );
      if (res.estado !== "ok") throw new Error(`se esperaba \`ok\` y llego \`${res.estado}\``);
      const o = await cliente.orden.findUniqueOrThrow({ where: { id: e.ordenes.enDistritoSinZonaId }, select: { zonaId: true } });
      return {
        res: { ordenesReconciliadas: res.ordenesReconciliadas, ordenesRetenidasEnBodegaSatelite: res.ordenesRetenidasEnBodegaSatelite },
        enDistritoSinZona: o.zonaId,
      };
    });
    // Las ordenes del fixture comparten `created_at` (las siembra un `now()` de la misma transaccion),
    // asi que el orden de la pagina entre ellas es el fisico de las filas, y el UPDATE de la columna lo
    // cambia. Se comparan las filas, no su orden de empate (que no es de esta regla).
    const porClave = <T>(filas: T[], clave: (f: T) => string) => [...filas].sort((a, b) => clave(a).localeCompare(clave(b)));
    return {
      api: { ...api, items: porClave(api.items, (f) => f.numRemision ?? "") },
      detalles,
      listado: { ...listado, items: porClave(listado.items, (f) => f.id) },
      porIds: porClave(porIds, (f) => f.id),
      cobro,
      correccion,
      descriptivos,
      congelado,
      plan,
      zona,
    };
  });
  // 5. El conteo sin entregar, en plataforma (como el superadmin), sin empresa.
  const cliente = clienteConSavepoint(tx);
  const conteo = await comoPlataforma("SLT-65", "test R19 sin backfill", async () => {
    const salida: number[] = [];
    for (const nodo of nodosDe65(e)) {
      salida.push(await new OrdenRepository(cliente).contarSinEntregarPorNodoGeografico(nodo.nivel, nodo.id));
    }
    return salida;
  });
  return { ...comoApp65, conteo };
}

async function leerLas7(tx: TxDeTest, e: EscenarioGeo65) {
  return { cr: await leerLas7DeUna(tx, e.cr), xa: await leerLas7DeUna(tx, e.xa) };
}

// ---------------------------------------------------------------------------------------------
// SLT-71 — las lecturas de analitica y de transito, como la app
// ---------------------------------------------------------------------------------------------

const MAESTRO_71 = { usuarioId: "geo-lecturas-sin-backfill", rol: "maestro" } as const;

function consulta71(raw: object): ConsultaConteoEntregas {
  const p = prepararConteoEntregas(raw, MAESTRO_71);
  if (p.status !== "ok") throw new Error(`consulta de prueba no concedida: ${p.status}`);
  return p.consulta;
}

/** Las facetas de una empresa de `geo-71`: un nodo de cada nivel, otra provincia y una combinacion. */
function facetasDe71(e: EmpresaGeo71): object[] {
  const g = e.base.base.geo;
  return [
    { provincia_id: [g.provinciaId] },
    { provincia_id: [e.segunda.provinciaId], rango: "mes" },
    { canton_id: [g.cantonId] },
    { canton_id: [g.cantonRetiradoId] },
    { distrito_id: [g.distritoCentralId, g.distritoBajoCantonRetiradoId] },
    { provincia_id: [g.provinciaId], canton_id: [g.cantonId], rango: "mes" },
  ];
}

/** Las nueve lecturas con cada faceta y las filas en alerta de transito, de una empresa. */
async function leerLasDe71DeUna(tx: TxDeTest, e: EmpresaGeo71, ahora: Date) {
  await comoApp(tx, e.base.base.empresaId);
  try {
    return await conEmpresa(e.base.base.empresaId, async () => {
      const c = clienteConSavepoint(tx);
      // Repositorios nuevos en cada lectura: la memoria del catalogo es por instancia (R13, R16).
      const analitica: unknown[] = [];
      let totalPorStatus = 0;
      // SLT-47 (R10): el borde solo acepta `lugar_id`. Las facetas de hoy se traducen como la barra
      // (`rawConLugar`), con el catalogo de la empresa del contexto. Cambio de ENTRADA, no de aserciones.
      const { catalogo } = await new CatalogoGeograficoRepository(c).deLaEmpresa();
      for (const rawDeHoy of facetasDe71(e)) {
        const raw = rawConLugar(catalogo, rawDeHoy);
        const q = consulta71(raw);
        const porStatus = await new ConteoPorStatusRepository(c).contarPorStatus(q);
        totalPorStatus += porStatus.reduce((s, f) => s + f.conteo, 0);
        analitica.push(
          porStatus,
          await new ConteoEntregasRepository(new ConteoPorStatusRepository(c)).contar(q),
          await new ConteoCargadasPorDiaRepository(c).contarCargadasPorDia(q),
          await new ConteoDevolucionesRepository(c).contarDevolucionesPorCausa(q),
          await new CicloVidaRepository(c).acumularCiclos(q),
        );
        const productos = prepararConsultaProductos(raw, MAESTRO_71);
        if (productos.status !== "ok") throw new Error(`consulta de productos no concedida: ${productos.status}`);
        analitica.push(
          await new ConteoProductosRepository(c).contarProductos(productos.consulta),
          await new DineroProductosRepository(c).leerDineroPorOrden(productos.consulta),
        );
        if ("rango" in raw) analitica.push(await new CohorteCargaRepository(c).contarCohortes(q));
        const dia = consulta71({ rango: "dia" }).rango;
        if (dia !== null) analitica.push(await new ConteoHoyGestionRepository(c).contarDeHoy(q, dia));
      }
      const z = e.base.base.zonas;
      const consulta: ConsultaTransito = {
        hito: PARAMETROS_POR_DEFECTO.hito,
        estados: estadosIncluidos(PARAMETROS_POR_DEFECTO),
        cortes: [z.centralId, z.norteId, z.surId].map((zonaId) => ({ zonaId, corte: ahora })),
      };
      const transito = [...(await new InformeTransitoRepository(c).filasEnAlerta(consulta))].sort((a, b) =>
        a.ordenId.localeCompare(b.ordenId),
      );
      return { analitica, totalPorStatus, transito };
    });
  } finally {
    await comoDueno(tx);
  }
}

async function leerLasDe71(tx: TxDeTest, e: EscenarioGeo71, ahora: Date) {
  return { cr: await leerLasDe71DeUna(tx, e.cr, ahora), xa: await leerLasDe71DeUna(tx, e.xa, ahora) };
}
