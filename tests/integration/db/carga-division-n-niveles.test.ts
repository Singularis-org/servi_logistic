import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { CargaDivisionService } from "@/lib/services/CargaDivisionService";
import { planificarDivision } from "@/lib/utils/division-csv";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import {
  PAIS_CUATRO_NIVELES,
  claveDeRuta,
  residuosDePaisesDePrueba,
  sembrarPaisDePruebaGeo,
} from "@/tests/fixtures/paises-de-prueba-geo";
import { errorEnSavepoint, revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-46 (T5.3; design §4.4, §5, §7; R30–R33, R36) — la carga CSV de la división a P niveles, contra
// Postgres. Lo que `carga-division.test.ts` prueba para tres niveles, aquí con un país de 4 niveles
// (`XP`, sembrado) y uno de 2 (`XT`, dado de alta por `PaisRepository.crear` con dos tipos, sin
// `nivel_3`): las columnas obligatorias son las de los P tipos (R30), cada nodo creado lleva el tipo de
// su profundidad (R33), los códigos vacíos se completan sin tocar nombre ni estado, `creados` va por
// profundidad también en `division_cargada` (R36), y todo o nada (R33): un error de línea o un fallo de
// la base a mitad no deja ningún nodo ni historial.
//
// Todo en una transacción del dueño que se revierte; el actor es un usuario creado en ella.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAIS_DOS = "XT";
const CABECERA_4 = "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3,nivel_4,codigo_nivel_4";
const CABECERA_2 = "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2";

let base: PrismaClient;

function csv(cabecera: string, ...lineas: string[]) {
  return { nombre: "division.csv", bytes: new TextEncoder().encode([cabecera, ...lineas, ""].join("\n")) };
}

interface Contexto {
  tx: TxDeTest;
  geo: GeoRepository;
  service: CargaDivisionService;
  actor: Actor;
}

async function conActor<T>(tx: TxDeTest, fn: (c: Contexto) => Promise<T>): Promise<T> {
  const org = await crearOrganizacion(tx);
  const u = await insertarUsuario(tx, await idDeRol(tx, "maestro"), org.id);
  if (!u.desenlace.ok) throw new Error(`no se sembró el actor: ${JSON.stringify(u.desenlace)}`);
  const geo = new GeoRepository(clienteConSavepoint(tx));
  return fn({ tx, geo, service: new CargaDivisionService(geo), actor: { usuarioId: u.id, rol: "superadmin" } });
}

/** `XP` (4 niveles) sembrado, con el actor y el service. */
async function conCuatro<T>(fn: (c: Contexto & { nodo: (ruta: string[]) => string }) => Promise<T>): Promise<T> {
  return revertida(base, (tx) =>
    conActor(tx, async (c) => {
      const { nodoPorRuta } = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
      return fn({ ...c, nodo: (ruta) => nodoPorRuta.get(claveDeRuta(ruta)) ?? "" });
    }),
  );
}

/** `XT` de 2 niveles por el alta de la app (sin `nivel_3`), vacío, con el actor y el service. */
async function conDos<T>(fn: (c: Contexto) => Promise<T>): Promise<T> {
  return revertida(base, (tx) =>
    conActor(tx, async (c) => {
      const alta = await new PaisRepository(clienteConSavepoint(tx)).crear(
        {
          id: PAIS_DOS,
          nombre: "País XT de 2 niveles",
          tipos: [
            { singular: "Departamento", plural: "Departamentos" },
            { singular: "Municipio", plural: "Municipios" },
          ],
        },
        { usuarioId: c.actor.usuarioId },
      );
      if (alta.estado !== "creado") throw new Error(`no se creó XT: ${JSON.stringify(alta)}`);
      return fn(c);
    }),
  );
}

/** Los nodos del país con su tipo por clave, la ruta de nombres como clave del mapa. */
async function nodosPorRuta(tx: TxDeTest, paisId: string) {
  const filas = await tx.nodoGeografico.findMany({
    where: { paisId },
    select: { id: true, padreId: true, profundidad: true, nombre: true, codigoOficial: true, activo: true, tipo: { select: { clave: true } } },
  });
  const porId = new Map(filas.map((f) => [f.id, f]));
  const ruta = (f: (typeof filas)[number]): string => {
    const padre = f.padreId === null ? undefined : porId.get(f.padreId);
    return padre === undefined ? f.nombre : `${ruta(padre)} / ${f.nombre}`;
  };
  return new Map(
    filas.map((f) => [
      ruta(f),
      { id: f.id, profundidad: f.profundidad, clave: f.tipo.clave, codigo: f.codigoOficial, activo: f.activo },
    ]),
  );
}

async function foto(tx: TxDeTest, paisId: string) {
  return {
    nodos: await tx.nodoGeografico.findMany({ where: { paisId }, orderBy: { id: "asc" } }),
    historial: await tx.historialPlataforma.count({ where: { paisId } }),
  };
}

describeSiHayBase("SLT-46 T5.3 — la carga CSV a P niveles (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = base === undefined ? null : await residuosDePaisesDePrueba(base);
    const xt = await base?.pais.count({ where: { id: PAIS_DOS } });
    await base?.$disconnect();
    expect(residuos).toEqual({ paises: 0, tipos: 0, nodos: 0, organizaciones: 0 });
    expect(xt).toBe(0);
  });

  // ===============================================================================================
  // País de 4 niveles
  // ===============================================================================================

  it("4 niveles: crea lo que falta a las cuatro profundidades, cada nodo con el tipo de la suya y bajo su padre", async () => {
    const r = await conCuatro(async ({ tx, service, actor, nodo }) => {
      const resumen = await service.cargar(
        "XP",
        csv(
          CABECERA_4,
          // Bajo nodos sembrados: un sector nuevo de Quilpué.
          "Valparaíso,05,Marga Marga,058,Quilpué,05801,Los Pinos,0580102",
          // Una rama entera nueva, de la raíz al sector.
          "Los Lagos,10,Osorno,103,Purranque,10303,Hueyusca,1030301",
          // Una fila que acaba en el nivel 3 (los niveles de abajo son opcionales).
          "Los Lagos,10,Osorno,103,Río Negro,10304,,",
        ),
        actor,
      );
      return { resumen, nodos: await nodosPorRuta(tx, "XP"), quilpue: nodo(["Valparaíso", "Marga Marga", "Quilpué"]) };
    });

    expect(r.resumen).toEqual({
      status: "ok",
      creados: { 1: 1, 2: 1, 3: 2, 4: 2 },
      existentes: 3,
      codigosCompletados: 0,
      avisos: [],
    });
    const esperado = {
      "Valparaíso / Marga Marga / Quilpué / Los Pinos": { profundidad: 4, clave: "nivel_4", codigo: "0580102", activo: true },
      "Los Lagos": { profundidad: 1, clave: "nivel_1", codigo: "10", activo: true },
      "Los Lagos / Osorno": { profundidad: 2, clave: "nivel_2", codigo: "103", activo: true },
      "Los Lagos / Osorno / Purranque": { profundidad: 3, clave: "nivel_3", codigo: "10303", activo: true },
      "Los Lagos / Osorno / Purranque / Hueyusca": { profundidad: 4, clave: "nivel_4", codigo: "1030301", activo: true },
      "Los Lagos / Osorno / Río Negro": { profundidad: 3, clave: "nivel_3", codigo: "10304", activo: true },
    };
    for (const [ruta, valor] of Object.entries(esperado)) {
      expect(r.nodos.get(ruta), ruta).toMatchObject(valor);
    }
    // 10 sembrados + 6 nuevos: nada más.
    expect(r.nodos.size).toBe(16);
  });

  it("4 niveles: `division_cargada` UNA vez, entidad `pais`, con `creados` por profundidad y el actor", async () => {
    const r = await conCuatro(async ({ tx, service, actor }) => {
      await service.cargar("XP", csv(CABECERA_4, "Los Lagos,10,Osorno,103,Purranque,10303,Hueyusca,1030301"), actor);
      const filas = await tx.historialPlataforma.findMany({ where: { paisId: "XP" } });
      return { filas, actor: actor.usuarioId };
    });

    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({
      accion: "division_cargada",
      entidadTipo: "pais",
      entidadId: "XP",
      actorUsuarioId: r.actor,
      detalle: { creados: { 1: 1, 2: 1, 3: 1, 4: 1 }, existentes: 0, codigosCompletados: 0 },
    });
  });

  it("4 niveles: completa el código vacío de un nodo 4 sin tocar su nombre ni su estado; la recarga no escribe", async () => {
    const r = await conCuatro(async ({ tx, service, actor, nodo }) => {
      const centro = nodo(["Ñuble", "Diguillín", "Chillán", "Centro"]);
      await tx.nodoGeografico.update({ where: { id: centro }, data: { activo: false } });
      const archivo = csv(CABECERA_4, "ÑUBLE,16,diguillin,161,Chillán,16101,CENTRO,1610101");
      const primera = await service.cargar("XP", archivo, actor);
      const fila = await tx.nodoGeografico.findUniqueOrThrow({ where: { id: centro }, select: { nombre: true, codigoOficial: true, activo: true } });
      const antes = await foto(tx, "XP");
      const segunda = await service.cargar("XP", archivo, actor);
      return { primera, fila, segunda, igual: JSON.stringify(await foto(tx, "XP")) === JSON.stringify(antes) };
    });

    expect(r.primera).toEqual({ status: "ok", creados: { 1: 0, 2: 0, 3: 0, 4: 0 }, existentes: 4, codigosCompletados: 1, avisos: [] });
    // La carga no renombra («CENTRO») ni reactiva.
    expect(r.fila).toEqual({ nombre: "Centro", codigoOficial: "1610101", activo: false });
    // R36: sin nada que escribir, ni nodos ni `division_cargada`.
    expect(r.segunda).toMatchObject({ status: "ok", creados: { 1: 0, 2: 0, 3: 0, 4: 0 }, existentes: 4, codigosCompletados: 0 });
    expect(r.igual).toBe(true);
  });

  it("4 niveles R30: sin `codigo_nivel_4` → `archivo_rechazado`, sin escribir", async () => {
    const r = await conCuatro(async ({ tx, service, actor }) => {
      const antes = await foto(tx, "XP");
      const res = await service.cargar(
        "XP",
        csv("nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3,nivel_4", "Los Lagos,10,Osorno,103,Purranque,10303,Hueyusca"),
        actor,
      );
      return { res, igual: JSON.stringify(await foto(tx, "XP")) === JSON.stringify(antes) };
    });

    expect(r).toEqual({ res: { status: "archivo_rechazado", motivo: "Faltan columnas obligatorias: codigo_nivel_4." }, igual: true });
  });

  it("4 niveles, todo o nada: una fila con un hueco entre filas buenas → `invalido` con su línea, cero nodos y cero historial", async () => {
    const r = await conCuatro(async ({ tx, service, actor }) => {
      const antes = await foto(tx, "XP");
      const res = await service.cargar(
        "XP",
        csv(
          CABECERA_4,
          "Los Lagos,10,Osorno,103,Purranque,10303,Hueyusca,1030301",
          "Los Lagos,10,Osorno,103,,,Crucero,",
        ),
        actor,
      );
      return { res, igual: JSON.stringify(await foto(tx, "XP")) === JSON.stringify(antes) };
    });

    expect(r.res.status).toBe("invalido");
    if (r.res.status !== "invalido") throw new Error("no fue invalido");
    expect(r.res.errores.map((e) => e.linea)).toEqual([3]);
    expect(r.igual).toBe(true);
  });

  it("4 niveles, todo o nada: un fallo de la base en el `createMany` de la profundidad 4 deshace también las de arriba", async () => {
    const r = await conCuatro(async ({ tx, geo, actor, nodo }) => {
      const division = await geo.leerDivisionDePais("XP");
      if (division === null) throw new Error("XP sin división");
      const plan = planificarDivision(
        [
          {
            linea: 2,
            niveles: [
              { nombre: "Los Lagos", codigo: "" },
              { nombre: "Osorno", codigo: "" },
              { nombre: "Purranque", codigo: "" },
              { nombre: "Hueyusca", codigo: "" },
            ],
          },
          {
            linea: 3,
            niveles: [
              { nombre: "Valparaíso", codigo: "" },
              { nombre: "Marga Marga", codigo: "" },
              { nombre: "Quilpué", codigo: "" },
              { nombre: "Choque", codigo: "" },
            ],
          },
        ],
        division.nodos,
        division.tipos,
      );
      if (!("plan" in plan)) throw new Error(`el plan de prueba tenía errores: ${JSON.stringify(plan)}`);
      // La carrera: otra escritura da de alta el mismo sector bajo Quilpué después de planificar.
      const tipo4 = division.tipos.find((t) => t.profundidad === 4);
      await tx.nodoGeografico.create({
        data: {
          paisId: "XP",
          tipoId: tipo4?.id ?? "",
          padreId: nodo(["Valparaíso", "Marga Marga", "Quilpué"]),
          profundidad: 4,
          nombre: "Choque",
          nombreNormalizado: "lo pisa el trigger",
        },
      });
      const antes = await foto(tx, "XP");
      const error = await errorEnSavepoint(tx, () => geo.importarDivision("XP", plan.plan, actor.usuarioId));
      return { error, losLagos: await tx.nodoGeografico.count({ where: { paisId: "XP", nombre: { in: ["Los Lagos", "Osorno", "Purranque", "Hueyusca"] } } }), igual: JSON.stringify(await foto(tx, "XP")) === JSON.stringify(antes) };
    });

    expect(r.error, "la carrera no llegó a fallar").not.toBeNull();
    expect(r.losLagos).toBe(0);
    expect(r.igual).toBe(true);
  });

  it("4 niveles: Costa Rica no cuenta como existente en XP (la lectura es por país)", async () => {
    const r = await conCuatro(async ({ service, actor }) =>
      service.cargar("XP", csv(CABECERA_4, "San José,,San José,,Carmen,,Centro,"), actor),
    );

    expect(r).toMatchObject({ status: "ok", creados: { 1: 1, 2: 1, 3: 1, 4: 1 }, existentes: 0 });
  });

  // ===============================================================================================
  // País de 2 niveles
  // ===============================================================================================

  it("2 niveles R30: cuatro columnas bastan; crea departamentos y municipios con el tipo de su profundidad", async () => {
    const r = await conDos(async ({ tx, service, actor }) => {
      const resumen = await service.cargar(
        PAIS_DOS,
        csv(CABECERA_2, "Alta Verapaz,16,Cobán,1601", "Alta Verapaz,16,Tactic,1603", "Petén,17,Flores,"),
        actor,
      );
      return { resumen, nodos: await nodosPorRuta(tx, PAIS_DOS) };
    });

    expect(r.resumen).toEqual({ status: "ok", creados: { 1: 2, 2: 3 }, existentes: 0, codigosCompletados: 0, avisos: [] });
    expect(Object.fromEntries(r.nodos)).toEqual({
      "Alta Verapaz": { id: expect.any(String), profundidad: 1, clave: "nivel_1", codigo: "16", activo: true },
      "Alta Verapaz / Cobán": { id: expect.any(String), profundidad: 2, clave: "nivel_2", codigo: "1601", activo: true },
      "Alta Verapaz / Tactic": { id: expect.any(String), profundidad: 2, clave: "nivel_2", codigo: "1603", activo: true },
      Petén: { id: expect.any(String), profundidad: 1, clave: "nivel_1", codigo: "17", activo: true },
      "Petén / Flores": { id: expect.any(String), profundidad: 2, clave: "nivel_2", codigo: null, activo: true },
    });
  });

  it("2 niveles R34: las columnas de un nivel 3 que el país no tiene se ignoran con aviso, y no crean nada", async () => {
    const r = await conDos(async ({ tx, service, actor }) => {
      const resumen = await service.cargar(
        PAIS_DOS,
        csv(`${CABECERA_2},nivel_3,codigo_nivel_3`, "Petén,17,Flores,1701,Santa Elena,170101"),
        actor,
      );
      return { resumen, profundidades: (await tx.nodoGeografico.findMany({ where: { paisId: PAIS_DOS }, select: { profundidad: true } })).map((n) => n.profundidad).sort() };
    });

    expect(r.resumen).toEqual({
      status: "ok",
      creados: { 1: 1, 2: 1 },
      existentes: 0,
      codigosCompletados: 0,
      avisos: ["La columna «nivel_3» no es del formato y se ignoró.", "La columna «codigo_nivel_3» no es del formato y se ignoró."],
    });
    expect(r.profundidades).toEqual([1, 2]);
  });

  it("2 niveles: completa el código vacío y deja UNA `division_cargada` con `creados` de sus dos profundidades", async () => {
    const r = await conDos(async ({ tx, service, actor }) => {
      await service.cargar(PAIS_DOS, csv(CABECERA_2, "Petén,,Flores,"), actor);
      const res = await service.cargar(PAIS_DOS, csv(CABECERA_2, "Petén,17,Flores,1701", "Petén,17,San Benito,1702"), actor);
      const nodos = await nodosPorRuta(tx, PAIS_DOS);
      const historial = await tx.historialPlataforma.findMany({
        where: { paisId: PAIS_DOS, accion: "division_cargada" },
        orderBy: { createdAt: "asc" },
        select: { detalle: true },
      });
      return { res, nodos: Object.fromEntries([...nodos].map(([k, v]) => [k, v.codigo])), historial: historial.map((h) => h.detalle) };
    });

    expect(r.res).toEqual({ status: "ok", creados: { 1: 0, 2: 1 }, existentes: 2, codigosCompletados: 2, avisos: [] });
    expect(r.nodos).toEqual({ Petén: "17", "Petén / Flores": "1701", "Petén / San Benito": "1702" });
    expect(r.historial).toEqual(
      expect.arrayContaining([
        { creados: { 1: 1, 2: 1 }, existentes: 0, codigosCompletados: 0 },
        { creados: { 1: 0, 2: 1 }, existentes: 2, codigosCompletados: 2 },
      ]),
    );
    expect(r.historial).toHaveLength(2);
  });

  it("2 niveles, todo o nada: un código que no cumple la regla entre filas buenas → `invalido`, sin escribir", async () => {
    const r = await conDos(async ({ tx, service, actor }) => {
      const antes = await foto(tx, PAIS_DOS);
      const res = await service.cargar(PAIS_DOS, csv(CABECERA_2, "Petén,17,Flores,1701", "Petén,17,San Benito,con espacio"), actor);
      return { res, igual: JSON.stringify(await foto(tx, PAIS_DOS)) === JSON.stringify(antes) };
    });

    expect(r.res.status).toBe("invalido");
    if (r.res.status !== "invalido") throw new Error("no fue invalido");
    expect(r.res.errores.map((e) => e.linea)).toEqual([3]);
    expect(r.igual).toBe(true);
  });
});
