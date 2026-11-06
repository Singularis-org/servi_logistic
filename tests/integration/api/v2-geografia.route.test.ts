import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleGeografiaApi } from "@/app/api/v2/geografia/route";
import { crearGeografiaDePrueba, crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "../db/_postgres-real";
import { PAIS, conEscenario, geografiaServiceDe, get, nodoPorRuta, type Contexto } from "./_v2-escenario";

// SLT-45 T5.6 (design §6; R22, R23) — EL CATALOGO GEOGRAFICO DE v2: `GET /api/v2/geografia?pais=`.
//
// Contra Postgres real, con el rol de la app (`servi_app`, RLS) y en una transaccion que siempre se
// revierte, sobre la siembra de las suites de v2 (`_v2-escenario.ts`, empresa de Costa Rica). Corren
// reales el borde (`handleGeografiaApi`), el servicio, el catalogo de la empresa y la lectura del
// pais; solo se sustituye la autenticacion de la key. Los paises de 2 y 4 niveles (R22, «igual para
// 2, 3 y 4 niveles») estan en `v2-paises-de-prueba.route.test.ts`.
//
// Lo esperado se lee de la base con consultas propias de esta suite (no con el repositorio que se
// prueba), y el activo en cascada se calcula aqui recorriendo los padres.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Pais de prueba ajeno: existe, tiene nodos y una empresa, y no es el de la key. */
const PAIS_AJENO = "XQ";
/** Ningun pais tiene este id (se comprueba). */
const PAIS_INEXISTENTE = "ZZ";

interface Respuesta {
  status: number;
  texto: string;
  cuerpo: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function catalogo(c: Contexto, query: string): Promise<Respuesta> {
  const res = await handleGeografiaApi(get(`/api/v2/geografia${query}`), {
    autenticar: c.autenticar,
    geografiaService: geografiaServiceDe(c.cli),
  });
  const texto = await res.text();
  return { status: res.status, texto, cuerpo: JSON.parse(texto) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Los nodos de `paisId` como los debe publicar el catalogo, leidos de la base. */
async function nodosEsperados(tx: TxDeTest, paisId: string) {
  const filas = await tx.nodoGeografico.findMany({
    where: { paisId },
    select: {
      id: true,
      padreId: true,
      profundidad: true,
      nombre: true,
      codigoOficial: true,
      activo: true,
      tipo: { select: { clave: true } },
    },
  });
  const porId = new Map(filas.map((f) => [f.id, f]));
  const enCascada = (id: string | null): boolean => {
    if (id === null) return true;
    const f = porId.get(id);
    if (f === undefined) throw new Error(`nodo ${id} sin fila`);
    return f.activo && enCascada(f.padreId);
  };
  return filas.map((f) => ({
    id: f.id,
    padreId: f.padreId,
    profundidad: f.profundidad,
    tipo: f.tipo.clave,
    nombre: f.nombre,
    codigoOficial: f.codigoOficial,
    activo: enCascada(f.id),
  }));
}

const porId = <T extends { id: string }>(xs: T[]): T[] => [...xs].sort((a, b) => a.id.localeCompare(b.id));

describeSiHayBase("SLT-45 R22, R23 — catalogo geografico de v2 (Postgres real)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R22: con el pais de la empresa (CR) responde el pais, sus tipos y TODOS sus nodos con id, padre, profundidad, tipo, nombre, codigo y activo en cascada", async () => {
    const PARAISO = ["Cartago", "Paraíso"];
    await conEscenario(base, { retirados: [PARAISO] }, async (c) => {
      const r = await catalogo(c, `?pais=${PAIS}`);
      expect(r.status).toBe(200);
      expect(Object.keys(r.cuerpo).sort()).toEqual(["nodos", "pais", "tipos"]);

      const pais = await c.tx.pais.findUniqueOrThrow({ where: { id: PAIS }, select: { id: true, nombre: true } });
      expect(r.cuerpo.pais).toEqual(pais);

      const tipos = await c.tx.tipoNivelGeografico.findMany({
        where: { paisId: PAIS },
        select: { clave: true, nombreSingular: true, nombrePlural: true },
        orderBy: { clave: "asc" },
      });
      expect(r.cuerpo.tipos).toEqual(tipos);
      expect(tipos.map((t) => t.clave)).toEqual(["nivel_1", "nivel_2", "nivel_3"]);

      const esperados = await nodosEsperados(c.tx, PAIS);
      expect(esperados.length).toBeGreaterThan(400);
      expect(r.cuerpo.nodos).toHaveLength(esperados.length);
      expect(porId(r.cuerpo.nodos)).toEqual(porId(esperados));
      for (const n of r.cuerpo.nodos) {
        expect(Object.keys(n).sort()).toEqual(["activo", "codigoOficial", "id", "nombre", "padreId", "profundidad", "tipo"]);
      }

      // Un distrito concreto, de la raiz al nodo, con sus valores.
      const occidental = await nodoPorRuta(c.tx, ["Cartago", "Cartago", "Occidental"]);
      const canton = await nodoPorRuta(c.tx, ["Cartago", "Cartago"]);
      expect(r.cuerpo.nodos.find((n: { id: string }) => n.id === occidental)).toEqual({
        id: occidental,
        padreId: canton,
        profundidad: 3,
        tipo: "nivel_3",
        nombre: "Occidental",
        codigoOficial: "30102",
        activo: true,
      });

      // Activo EN CASCADA: el canton retirado y su distrito (activo propio) salen `activo: false`;
      // se listan, no se recortan.
      const paraiso = await nodoPorRuta(c.tx, PARAISO);
      const orosi = await nodoPorRuta(c.tx, [...PARAISO, "Orosi"]);
      expect(await c.tx.nodoGeografico.findUniqueOrThrow({ where: { id: orosi }, select: { activo: true } })).toEqual({ activo: true });
      const activoDe = (id: string) => r.cuerpo.nodos.find((n: { id: string }) => n.id === id)?.activo;
      expect([activoDe(paraiso), activoDe(orosi)]).toEqual([false, false]);
    });
  }, 120_000);

  it("R23: sin `pais`, vacio o con un id mal formado responde 422 con el error en `pais`", async () => {
    await conEscenario(base, {}, async (c) => {
      for (const query of ["", "?otra=CR", "?pais=", "?pais=cr", "?pais=C", "?pais=CRCR", "?pais=C1", "?pais=%20CR"]) {
        const r = await catalogo(c, query);
        expect(r.status, query).toBe(422);
        expect(r.cuerpo, query).toMatchObject({ status: "error", code: "VALIDATION_ERROR" });
        expect(Object.keys(r.cuerpo.details.fieldErrors), query).toEqual(["pais"]);
        expect(r.texto, query).not.toContain("nodos");
      }
    });
  }, 120_000);

  it("R23: un pais ajeno (que existe y tiene nodos) y uno inexistente dan el MISMO 404, byte a byte", async () => {
    let nodosAjenos: string[] = [];
    await conEscenario(
      base,
      {},
      async (c) => {
        // Como dueño: el ajeno existe y tiene nodos; el inexistente no esta.
        await c.tx.$executeRawUnsafe("RESET ROLE");
        expect(await c.tx.nodoGeografico.count({ where: { paisId: PAIS_AJENO } })).toBe(3);
        expect(await c.tx.pais.count({ where: { id: PAIS_INEXISTENTE } })).toBe(0);
        await c.tx.$executeRawUnsafe(`SELECT set_config('role', 'servi_app', true)`);

        const ajeno = await catalogo(c, `?pais=${PAIS_AJENO}`);
        const inexistente = await catalogo(c, `?pais=${PAIS_INEXISTENTE}`);
        expect(ajeno.status).toBe(404);
        expect(ajeno.cuerpo).toMatchObject({ status: "error", code: "NOT_FOUND" });
        expect(ajeno.texto).toBe(inexistente.texto);
        expect(ajeno.texto).not.toContain(PAIS_AJENO);

        // Y el propio sigue respondiendo, sin un solo nodo del ajeno.
        const propio = await catalogo(c, `?pais=${PAIS}`);
        expect(propio.status).toBe(200);
        const ids = new Set(propio.cuerpo.nodos.map((n: { id: string }) => n.id));
        expect(nodosAjenos).toHaveLength(3);
        for (const id of nodosAjenos) expect(ids.has(id)).toBe(false);
      },
      async (tx) => {
        await crearPaisDePrueba(tx, PAIS_AJENO);
        const geo = await crearGeografiaDePrueba(tx, PAIS_AJENO);
        nodosAjenos = [geo.provinciaId, geo.cantonId, geo.distritoId];
        await crearOrganizacionEnPais(tx, PAIS_AJENO);
      },
    );
  }, 120_000);
});
