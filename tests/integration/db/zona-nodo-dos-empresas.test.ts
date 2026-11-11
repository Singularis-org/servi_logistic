import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais } from "@/tests/fabricas/paises";

import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { gruposDeDistritos } from "@/lib/repositories/_shared/resolver-tarifas";
import { zonaQueCubre } from "@/lib/services/geografia-dominio";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";

import { crearEscenarioGeo43, insertarNodo, type EscenarioGeo43 } from "./_fixtures/geo-43";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { comoLaEmpresa, guardado, nodosDeZona, repoDeZonas } from "./_fixtures/slt89-zonas";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R34 (T1.6, parte de base; design §2.1, §2.2) — LAS DOS TABLAS NUEVAS SON DE LA EMPRESA Y
 * DE SU PAÍS.
 *
 * Contra Postgres real, con SQL directo y dentro de una transacción que siempre se revierte:
 *   · RLS: con el rol de la app, cada empresa ve y escribe solo sus filas de `zona_nodo` y
 *     `grupo_distritos_nodo` (42501 al escribir una de otra);
 *   · misma empresa: una fila no apunta a la zona de otra empresa (SL017);
 *   · país: un nodo de otro país se rechaza (SL021);
 *   · `zona_nodo` no acepta distritos (profundidad 3 → 23514), sí provincia, cantón y profundidad 4;
 *   · los únicos empiezan por la empresa: el mismo nodo en dos zonas de una empresa choca (23505), en
 *     dos empresas no;
 *   · un miembro de grupo no está en las dos tablas: un distrito asignado a la zona no entra en
 *     `grupo_distritos_nodo` (23514) y uno de `grupo_distritos_nodo` no entra en
 *     `grupo_distritos_distrito` (23505).
 * Cada rechazo se comprueba además «sin escribir»: la cuenta de filas no cambia.
 *
 * R35 (T6.1): el mismo canton asignado en zonas de las dos empresas se guarda en las dos; cobertura,
 * aviso de impacto y grupo de tarifas se resuelven para cada una con lo suyo, sin ver a la otra.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Escenario extends EscenarioGeo43 {
  empresaB: string;
  zonaB: string;
  otraZonaA: string;
  grupoA: string;
  sectorId: string;
  /** Un cantón de Costa Rica: geografía de otro país para las dos empresas de `XA`. */
  nodoCR: string;
}

async function crearZona(tx: TxDeTest, empresaId: string): Promise<string> {
  await fijarEmpresa(tx, empresaId);
  const zona = await tx.zona.create({
    data: { nombre: `Zona SLT-89 ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
    select: { id: true },
  });
  return zona.id;
}

async function escenario(tx: TxDeTest): Promise<Escenario> {
  const e = await crearEscenarioGeo43(tx);
  await comoDueno(tx);
  const { id: empresaB } = await crearOrganizacionEnPais(tx, "XA");
  const zonaB = await crearZona(tx, empresaB);
  const otraZonaA = await crearZona(tx, e.empresaId);
  const grupoA = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO grupo_distritos (id, organizacion_id, zona_id, nombre) VALUES ($1, $2, $3, 'Grupo SLT-89')`,
    grupoA,
    e.empresaId,
    e.zonaId,
  );
  const tipo4 = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural) VALUES ($1, 'XA', 'nivel_4', 'Sector', 'Sectores')`,
    tipo4,
  );
  const sectorId = await insertarNodo(tx, {
    paisId: "XA",
    tipoId: tipo4,
    padreId: e.geo.distritoId,
    profundidad: 4,
    nombre: `Sector ${randomUUID().slice(0, 8)}`,
  });
  const [cr] = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM nodo_geografico WHERE pais_id = 'CR' AND profundidad = 2 ORDER BY id LIMIT 1`,
  );
  if (cr === undefined) throw new Error("falta la geografía de Costa Rica: ¿faltan migraciones?");
  return { ...e, empresaB, zonaB, otraZonaA, grupoA, sectorId, nodoCR: cr.id };
}

const SQL_ZONA_NODO = `INSERT INTO zona_nodo (id, organizacion_id, zona_id, nodo_geografico_id)
  VALUES ($1, COALESCE($2, NULLIF(current_setting('app.organizacion_id', true), '')), $3, $4)`;
const SQL_GRUPO_NODO = `INSERT INTO grupo_distritos_nodo (id, organizacion_id, grupo_id, zona_id, nodo_geografico_id)
  VALUES ($1, COALESCE($2, NULLIF(current_setting('app.organizacion_id', true), '')), $3, $4, $5)`;

/** Alta en `zona_nodo` (empresa explícita o, con `null`, la de la transacción). SQLSTATE o `null`. */
function zonaNodo(tx: TxDeTest, empresaId: string | null, zonaId: string, nodoId: string): Promise<string | null> {
  return intentar(tx, SQL_ZONA_NODO, randomUUID(), empresaId, zonaId, nodoId);
}

function grupoNodo(tx: TxDeTest, empresaId: string | null, grupoId: string, zonaId: string, nodoId: string): Promise<string | null> {
  return intentar(tx, SQL_GRUPO_NODO, randomUUID(), empresaId, grupoId, zonaId, nodoId);
}

async function filas(tx: TxDeTest, tabla: "zona_nodo" | "grupo_distritos_nodo" | "grupo_distritos_distrito"): Promise<number> {
  const [f] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${tabla}`);
  return f.n;
}

describeSiHayBase("SLT-89 · R34 — zona_nodo y grupo_distritos_nodo, por empresa y por país", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("RLS: cada empresa ve solo sus filas de las dos tablas y no escribe filas de otra (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await fijarEmpresa(tx, e.empresaId);
      const altas = [
        await zonaNodo(tx, null, e.zonaId, e.geo.cantonId),
        await grupoNodo(tx, null, e.grupoA, e.zonaId, e.geo.otroDistritoId),
      ];
      const cuenta = async (empresa: string) => {
        await comoApp(tx, empresa);
        const vistas = [await filas(tx, "zona_nodo"), await filas(tx, "grupo_distritos_nodo")];
        await comoDueno(tx);
        return vistas;
      };
      const veA = await cuenta(e.empresaId);
      const veB = await cuenta(e.empresaB);

      await comoApp(tx, e.empresaB);
      const escribeAjena = [
        await zonaNodo(tx, e.empresaId, e.otraZonaA, e.geo.provinciaId),
        await grupoNodo(tx, e.empresaId, e.grupoA, e.zonaId, e.sectorId),
      ];
      await comoDueno(tx);
      return { altas, veA, veB, escribeAjena, quedan: [await filas(tx, "zona_nodo"), await filas(tx, "grupo_distritos_nodo")] };
    });
    expect(r.altas).toEqual([null, null]);
    expect(r.veA).toEqual([1, 1]);
    expect(r.veB).toEqual([0, 0]);
    expect(r.escribeAjena).toEqual(["42501", "42501"]);
    // Como dueño (sin RLS) se ve todo: las dos de A y ninguna escrita por B.
    expect(r.quedan).toEqual([1, 1]);
  });

  it("misma empresa: una fila no apunta a la zona de otra empresa (SL017) y no se escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const antes = [await filas(tx, "zona_nodo"), await filas(tx, "grupo_distritos_nodo")];
      await fijarEmpresa(tx, e.empresaB);
      const intentos = [
        await zonaNodo(tx, null, e.zonaId, e.geo.cantonId),
        await grupoNodo(tx, null, e.grupoA, e.zonaId, e.geo.cantonId),
      ];
      return { intentos, antes, despues: [await filas(tx, "zona_nodo"), await filas(tx, "grupo_distritos_nodo")] };
    });
    expect(r.intentos).toEqual(["SL017", "SL017"]);
    expect(r.despues).toEqual(r.antes);
  });

  it("país: un nodo de otro país se rechaza en las dos tablas (SL021) y no se escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      const antes = [await filas(tx, "zona_nodo"), await filas(tx, "grupo_distritos_nodo")];
      await fijarEmpresa(tx, e.empresaId);
      const intentos = [
        await zonaNodo(tx, null, e.zonaId, e.nodoCR),
        await grupoNodo(tx, null, e.grupoA, e.zonaId, e.nodoCR),
      ];
      // Con el rol de la app, que no VE la geografía de otro país, el trigger la sigue viendo.
      await comoApp(tx, e.empresaId);
      const comoLaApp = await zonaNodo(tx, null, e.zonaId, e.nodoCR);
      await comoDueno(tx);
      return { intentos, comoLaApp, antes, despues: [await filas(tx, "zona_nodo"), await filas(tx, "grupo_distritos_nodo")] };
    });
    expect(r.intentos).toEqual(["SL021", "SL021"]);
    expect(r.comoLaApp).toBe("SL021");
    expect(r.despues).toEqual(r.antes);
  });

  it("zona_nodo acepta provincia, cantón y profundidad 4, y rechaza un distrito (23514) sin escribirlo", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await fijarEmpresa(tx, e.empresaId);
      const aceptados = [
        await zonaNodo(tx, null, e.zonaId, e.geo.provinciaId),
        await zonaNodo(tx, null, e.otraZonaA, e.geo.cantonId),
        await zonaNodo(tx, null, e.zonaId, e.sectorId),
      ];
      const antes = await filas(tx, "zona_nodo");
      const distrito = await zonaNodo(tx, null, e.zonaId, e.geo.otroDistritoId);
      return { aceptados, distrito, antes, despues: await filas(tx, "zona_nodo") };
    });
    expect(r.aceptados).toEqual([null, null, null]);
    expect(r.distrito).toBe("23514");
    expect(r.despues).toBe(r.antes);
  });

  it("único por empresa: el mismo nodo en dos zonas de una empresa choca (23505); en otra empresa, no", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await fijarEmpresa(tx, e.empresaId);
      const primera = await zonaNodo(tx, null, e.zonaId, e.geo.cantonId);
      const otraZonaMismaEmpresa = await zonaNodo(tx, null, e.otraZonaA, e.geo.cantonId);
      await fijarEmpresa(tx, e.empresaB);
      const otraEmpresa = await zonaNodo(tx, null, e.zonaB, e.geo.cantonId);
      return { primera, otraZonaMismaEmpresa, otraEmpresa };
    });
    expect(r).toEqual({ primera: null, otraZonaMismaEmpresa: "23505", otraEmpresa: null });
  });

  it("un miembro de grupo no queda en las dos tablas: distrito asignado → 23514; ya en grupo_distritos_nodo → 23505", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      await fijarEmpresa(tx, e.empresaId);
      // `geo.distritoId` tiene fila en `zona_distrito` de la zona (escenario de SLT-43): va en la tabla vieja.
      const asignado = await grupoNodo(tx, null, e.grupoA, e.zonaId, e.geo.distritoId);
      // El otro distrito no está asignado a la zona (la cubre por herencia): va en la tabla nueva, igual
      // que un cantón o un nodo de profundidad 4.
      const aceptados = [
        await grupoNodo(tx, null, e.grupoA, e.zonaId, e.geo.otroDistritoId),
        await grupoNodo(tx, null, e.grupoA, e.zonaId, e.geo.cantonId),
        await grupoNodo(tx, null, e.grupoA, e.zonaId, e.sectorId),
      ];
      // Si después se asigna a la zona, la tabla vieja no lo acepta mientras siga en la nueva.
      await tx.zonaDistrito.create({ data: { zonaId: e.zonaId, distritoId: e.geo.otroDistritoId } });
      const antes = await filas(tx, "grupo_distritos_distrito");
      const duplicado = await intentar(
        tx,
        `INSERT INTO grupo_distritos_distrito (id, grupo_id, zona_id, distrito_id) VALUES ($1, $2, $3, $4)`,
        randomUUID(),
        e.grupoA,
        e.zonaId,
        e.geo.otroDistritoId,
      );
      // El distrito asignado de siempre sigue entrando en la tabla vieja: el trigger nuevo no lo toca.
      const deSiempre = await intentar(
        tx,
        `INSERT INTO grupo_distritos_distrito (id, grupo_id, zona_id, distrito_id) VALUES ($1, $2, $3, $4)`,
        randomUUID(),
        e.grupoA,
        e.zonaId,
        e.geo.distritoId,
      );
      return { asignado, aceptados, duplicado, deSiempre, antes, despues: await filas(tx, "grupo_distritos_distrito") };
    });
    expect(r.asignado).toBe("23514");
    expect(r.aceptados).toEqual([null, null, null]);
    expect(r.duplicado).toBe("23505");
    expect(r.deSiempre).toBeNull();
    expect(r.despues).toBe(r.antes + 1);
  });

  it("⭑ R35: el mismo canton en zonas de dos empresas: cada una lo guarda, lo cubre, avisa y agrupa con lo suyo", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenario(tx);
      // A: el canton a su otra zona (el distrito sembrado sigue en su zona: excepcion). B: a su zona.
      const impactoA = await comoLaEmpresa(tx, e.empresaId, () =>
        repoDeZonas(tx).impactoDeAsignacion({ zonaId: e.otraZonaA, distritoIds: [], nodoIds: [e.geo.cantonId] }),
      );
      const impactoB = await comoLaEmpresa(tx, e.empresaB, () =>
        repoDeZonas(tx).impactoDeAsignacion({ zonaId: e.zonaB, distritoIds: [], nodoIds: [e.geo.cantonId] }),
      );
      const datosA = await guardado(tx, e.otraZonaA, { distritoIds: [], nodoIds: [e.geo.cantonId] });
      const guardaA = await comoLaEmpresa(tx, e.empresaId, () => repoDeZonas(tx).update(e.otraZonaA, datosA, null));
      const datosB = await guardado(tx, e.zonaB, { distritoIds: [], nodoIds: [e.geo.cantonId] });
      const guardaB = await comoLaEmpresa(tx, e.empresaB, () => repoDeZonas(tx).update(e.zonaB, datosB, null));

      const cubre = (empresa: string) =>
        comoLaEmpresa(tx, empresa, async () => {
          const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(clienteConSavepoint(tx)).deLaEmpresa();
          return {
            otroDistrito: zonaQueCubre(catalogo, asignaciones, e.geo.otroDistritoId)?.id ?? null,
            distrito: zonaQueCubre(catalogo, asignaciones, e.geo.distritoId)?.id ?? null,
          };
        });
      const cubreA = await cubre(e.empresaId);
      const cubreB = await cubre(e.empresaB);

      // Un grupo de A con el canton como miembro: B no lo ve al resolver el mismo distrito.
      await comoDueno(tx);
      await fijarEmpresa(tx, e.empresaId);
      const maestroA = await crearUsuarioDePrueba(tx, "maestro");
      await comoDueno(tx);
      const grupo = await comoLaEmpresa(tx, e.empresaId, () =>
        serviciosDeTarifas(clienteConSavepoint(tx)).grupoDistritos.crearGrupo(
          { zonaId: e.otraZonaA, nombre: "Canton A", distritoIds: [], nodoIds: [e.geo.cantonId] },
          { usuarioId: maestroA.id, rol: "maestro" },
        ),
      );
      const grupoDe = (empresa: string, zonaId: string) =>
        comoLaEmpresa(tx, empresa, async () =>
          (await gruposDeDistritos(clienteConSavepoint(tx), [{ zonaId, distritoId: e.geo.otroDistritoId }])).get(
            `${zonaId}|${e.geo.otroDistritoId}`,
          ) ?? null,
        );
      return {
        e,
        impactoA,
        impactoB,
        guardaA: guardaA.estado,
        guardaB: guardaB.estado,
        nodosA: await nodosDeZona(tx, e.otraZonaA),
        nodosB: await nodosDeZona(tx, e.zonaB),
        cubreA,
        cubreB,
        grupo,
        grupoDeA: await grupoDe(e.empresaId, e.otraZonaA),
        grupoDeB: await grupoDe(e.empresaB, e.zonaB),
      };
    });
    // Los dos guardados pasan: el unico de `zona_nodo` empieza por la empresa.
    expect([r.guardaA, r.guardaB]).toEqual(["ok", "ok"]);
    expect(r.nodosA).toEqual([r.e.geo.cantonId]);
    expect(r.nodosB).toEqual([r.e.geo.cantonId]);
    // Cobertura: cada una su zona; la excepcion de A (su distrito sembrado) no existe para B.
    expect(r.cubreA).toEqual({ otroDistrito: r.e.otraZonaA, distrito: r.e.zonaId });
    expect(r.cubreB).toEqual({ otroDistrito: r.e.zonaB, distrito: r.e.zonaB });
    // Impacto: A ve su orden del canton (ya en un cierre); B, con el mismo canton, no ve nada de A.
    expect(r.impactoA?.noSeMueven.enCierre).toBe(1);
    expect(r.impactoB).toEqual({
      cambianDeZona: 0,
      cambianDeTarifa: 0,
      noSeMueven: { enBodegaSatelite: 0, conGestionFinal: 0, enCierre: 0 },
    });
    // Grupo: el de A resuelve en A; en B el mismo distrito no tiene grupo.
    expect(r.grupo.status).toBe("ok");
    expect(r.grupoDeA).toBe(r.grupo.status === "ok" ? r.grupo.id : "sin grupo");
    expect(r.grupoDeB).toBeNull();
  });
});
