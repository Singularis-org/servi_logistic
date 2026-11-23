import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { handleCotizacionApi } from "@/app/api/ordenes/api-key/cotizacion/route";
import { handleGeografiaApi } from "@/app/api/v2/geografia/route";
import { handleCrearOrdenV2 } from "@/app/api/v2/ordenes/route";
import { handleConsultaOrdenV2 } from "@/app/api/v2/ordenes/[id]/route";
import type { AutenticadorApiKey } from "@/lib/api/api-key-request";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { msgSinZona } from "@/lib/services/geo-ubicacion";
import { comoApp, datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearGeografiaDePrueba, crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "../db/_postgres-real";
import {
  autenticadorDe,
  conEscenario,
  cotizacionServiceDe,
  crearTienda,
  depsDeCarga,
  depsDeConsulta,
  geografiaServiceDe,
  get,
  nodoPorRuta,
  post,
  type Contexto,
} from "./_v2-escenario";

// SLT-45 T5.7 (design §10; R24) — AISLAMIENTO ENTRE EMPRESAS EN v2.
//
// Contra Postgres real, con el rol de la app (`servi_app`, RLS) y en una transaccion que siempre se
// revierte. Dos empresas de Costa Rica: A es la de `_v2-escenario.ts` (sus zonas cubren Occidental,
// Orosi, etc.) y B tiene su propia tienda y una sola zona, `zona_B`, que cubre Cartago/Cartago/Carmen,
// el distrito que A deja sin zona. Una tercera empresa, C, es de un pais de prueba (`XQ`), para el
// catalogo. Se actua como una u otra empresa como en produccion: el autenticador devuelve la empresa
// de la key (el borde la fija con `conEmpresaDeLaKey`) y la transaccion baja a `servi_app` con esa
// empresa (lo que en produccion hace la extension de Prisma). Corren reales los bordes de las cinco
// operaciones de v2, sus servicios, el motor de ubicacion, el catalogo, las zonas y la tarifa.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const OCCIDENTAL = ["Cartago", "Cartago", "Occidental"];
const OROSI = ["Cartago", "Paraíso", "Orosi"];
const CARMEN = ["Cartago", "Cartago", "Carmen"];
const PAIS_DE_C = "XQ";

interface Respuesta {
  status: number;
  texto: string;
  cuerpo: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function respuesta(res: Response): Promise<Respuesta> {
  const texto = await res.text();
  return { status: res.status, texto, cuerpo: JSON.parse(texto) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let secuencia = 0;
function fila(ubicacion: string[], numRemision?: string): Record<string, unknown> {
  secuencia += 1;
  return {
    num_remision: numRemision ?? `R24-${secuencia}`,
    destinatario: `Destinatario ${secuencia}`,
    telefono: "80000001",
    direccion: `Direccion ${secuencia}`,
    producto: `Producto ${secuencia}`,
    peso: "1",
    monto_cobrar: "25900",
    ubicacion,
  };
}

/** Lo que la siembra deja de las empresas B y C. */
interface Otras {
  b: { organizacionId: string; tiendaId: string; zonaId: string };
  c: { organizacionId: string };
  nodosDeC: string[];
}

async function sembrarOtras(tx: TxDeTest): Promise<Otras> {
  // B, en Costa Rica, con su tienda, su zona (con tarifa) y Carmen dentro.
  const orgB = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
  await tx.organizacionModulo.createMany({ data: ORDEN_MODULOS.map((modulo) => ({ organizacionId: orgB.id, modulo })) });
  await fijarEmpresa(tx, orgB.id);
  const tiendaB = await crearTienda(tx, "Tienda B");
  const zonaB = await tx.zona.create({
    data: { nombre: "zona_B", esCentral: true, sinpeNumero: "80000000", sinpeNombre: "Titular B" },
    select: { id: true },
  });
  await tx.zonaDistrito.create({ data: { zonaId: zonaB.id, distritoId: await nodoPorRuta(tx, CARMEN) } });
  await tx.tarifa.create({
    data: {
      zonaId: zonaB.id,
      tiendaId: null,
      valorFlete: "3100.00",
      valorFleteDevuelto: "1500.00",
      valorFleteGam: "3100.00",
      valorFleteDevueltoGam: "1500.00",
      comisionCod: "2.00",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
      tarifaEspecial: "4000.00",
      tarifaEspecialDevuelta: "1500.00",
    },
  });

  // C, de un pais de prueba con su geografia.
  await crearPaisDePrueba(tx, PAIS_DE_C);
  const geo = await crearGeografiaDePrueba(tx, PAIS_DE_C);
  const orgC = await crearOrganizacionEnPais(tx, PAIS_DE_C);
  return {
    b: { organizacionId: orgB.id, tiendaId: tiendaB, zonaId: zonaB.id },
    c: { organizacionId: orgC.id },
    nodosDeC: [geo.provinciaId, geo.cantonId, geo.distritoId],
  };
}

/** Pasa la transaccion a `servi_app` con `organizacionId`: desde aqui, la RLS es la de esa empresa. */
async function comoEmpresa(c: Contexto, organizacionId: string): Promise<void> {
  await c.tx.$executeRawUnsafe("RESET ROLE");
  await comoApp(c.tx, organizacionId);
}

/** Corre `fn` como dueño (sin RLS) y vuelve a la empresa dada. */
async function comoDueño<T>(c: Contexto, vuelveA: string, fn: () => Promise<T>): Promise<T> {
  await c.tx.$executeRawUnsafe("RESET ROLE");
  const salida = await fn();
  await comoApp(c.tx, vuelveA);
  return salida;
}

const crear = async (c: Contexto, auth: AutenticadorApiKey, orden: unknown) =>
  respuesta(await handleCrearOrdenV2(post("/api/v2/ordenes", { orden }), depsDeCarga(c.cli, auth)));

const lote = async (c: Contexto, auth: AutenticadorApiKey, ordenes: unknown[]) =>
  respuesta(await handleCargaApi(post("/api/v2/ordenes/carga", { ordenes }), depsDeCarga(c.cli, auth), "v2"));

const cotizar = async (c: Contexto, auth: AutenticadorApiKey, ordenes: unknown[]) =>
  respuesta(
    await handleCotizacionApi(
      post("/api/v2/ordenes/cotizacion", { ordenes }),
      { autenticar: auth, cotizacionService: cotizacionServiceDe(c.cli) },
      "v2",
    ),
  );

const consultar = async (c: Contexto, auth: AutenticadorApiKey, id: string) =>
  respuesta(
    await handleConsultaOrdenV2(get(`/api/v2/ordenes/${id}`), id, {
      ...depsDeConsulta(c.cli, auth),
      geografiaService: geografiaServiceDe(c.cli),
    }),
  );

const catalogo = async (c: Contexto, auth: AutenticadorApiKey, pais: string) =>
  respuesta(await handleGeografiaApi(get(`/api/v2/geografia?pais=${pais}`), { autenticar: auth, geografiaService: geografiaServiceDe(c.cli) }));

/** Ordenes de cada empresa, contadas como dueño (sin RLS). */
async function ordenesPorEmpresa(tx: TxDeTest, a: string, b: string): Promise<[number, number]> {
  return [await tx.orden.count({ where: { organizacionId: a } }), await tx.orden.count({ where: { organizacionId: b } })];
}

/** Escenario de dos empresas: `fn` recibe el contexto (como A) y lo de B y C. */
async function conDosEmpresas(base: PrismaClient, fn: (c: Contexto, o: Otras, authA: AutenticadorApiKey, authB: AutenticadorApiKey) => Promise<void>) {
  let otras: Otras | undefined;
  await conEscenario(
    base,
    {},
    async (c) => {
      if (otras === undefined) throw new Error("siembra incompleta");
      await fn(c, otras, c.autenticar, autenticadorDe(otras.b.organizacionId, otras.b.tiendaId, "slt45-v2-b"));
    },
    async (tx) => {
      otras = await sembrarOtras(tx);
    },
  );
}

describeSiHayBase("SLT-45 R24 — aislamiento entre empresas en v2 (Postgres real)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R24: las zonas de A no cubren ningun nodo con la key de B: crear, lote y cotizacion dan «sin zona» y B no crea nada", async () => {
    await conDosEmpresas(base, async (c, o, _authA, authB) => {
      // Control: con la key de A, Occidental y Orosi SI tienen zona.
      const deA = await cotizar(c, c.autenticar, [fila(OCCIDENTAL), fila(OROSI)]);
      expect(deA.cuerpo).toMatchObject({ total: 2, cotizadas: 2, conError: 0 });

      await comoEmpresa(c, o.b.organizacionId);
      const rCrear = await crear(c, authB, fila(OCCIDENTAL));
      const rLote = await lote(c, authB, [fila(OCCIDENTAL), fila(OROSI)]);
      const rCot = await cotizar(c, authB, [fila(OCCIDENTAL), fila(OROSI)]);
      for (const r of [rCrear, rLote, rCot]) expect(r.status).toBe(200);

      expect(rCrear.cuerpo).toMatchObject({ total: 1, creadas: 0, conError: 1, ordenes: [] });
      expect(rCrear.cuerpo.errores[0].errores).toEqual({ ubicacion: [msgSinZona("Occidental")] });
      expect(rLote.cuerpo).toMatchObject({ total: 2, creadas: 0, conError: 2, ordenes: [] });
      expect(rLote.cuerpo.errores.map((e: { errores: unknown }) => e.errores)).toEqual([
        { ubicacion: [msgSinZona("Occidental")] },
        { ubicacion: [msgSinZona("Orosi")] },
      ]);
      expect(rCot.cuerpo).toMatchObject({ total: 2, cotizadas: 0, conError: 2, filas: [] });
      expect(rCot.cuerpo.errores.map((e: { errores: unknown }) => e.errores)).toEqual([
        { ubicacion: [msgSinZona("Occidental")] },
        { ubicacion: [msgSinZona("Orosi")] },
      ]);
      // Nada de A en las respuestas de B: ni sus zonas ni sus importes.
      for (const r of [rCrear, rLote, rCot]) {
        expect(r.texto).not.toMatch(/zona_1|zona_2/);
      }

      expect(await comoDueño(c, o.b.organizacionId, () => ordenesPorEmpresa(c.tx, c.organizacionId, o.b.organizacionId))).toEqual([0, 0]);
    });
  }, 120_000);

  it("R24: cada empresa solo usa SUS zonas: B crea en Carmen con `zona_B` y A, en Carmen, sale «sin zona»", async () => {
    await conDosEmpresas(base, async (c, o, authA, authB) => {
      await comoEmpresa(c, o.b.organizacionId);
      const deB = await lote(c, authB, [fila(CARMEN, "R24-CARMEN")]);
      expect(deB.cuerpo).toMatchObject({ total: 1, creadas: 1, conError: 0 });
      const cotB = await cotizar(c, authB, [fila(CARMEN)]);
      expect(cotB.cuerpo).toMatchObject({ total: 1, cotizadas: 1, conError: 0 });

      await comoEmpresa(c, c.organizacionId);
      const deA = await lote(c, authA, [fila(CARMEN)]);
      expect(deA.cuerpo).toMatchObject({ total: 1, creadas: 0, conError: 1, ordenes: [] });
      expect(deA.cuerpo.errores[0].errores).toEqual({ ubicacion: [msgSinZona("Carmen")] });
      const cotA = await cotizar(c, authA, [fila(CARMEN)]);
      expect(cotA.cuerpo).toMatchObject({ total: 1, cotizadas: 0, conError: 1 });

      const ordenB = await comoDueño(c, c.organizacionId, () =>
        c.tx.orden.findFirstOrThrow({
          where: { numRemision: "R24-CARMEN" },
          select: { organizacionId: true, tiendaId: true, zonaId: true },
        }),
      );
      expect(ordenB).toEqual({ organizacionId: o.b.organizacionId, tiendaId: o.b.tiendaId, zonaId: o.b.zonaId });
      expect(await comoDueño(c, c.organizacionId, () => ordenesPorEmpresa(c.tx, c.organizacionId, o.b.organizacionId))).toEqual([0, 1]);
    });
  }, 120_000);

  it("R24: la consulta de una orden de A con la key de B da el mismo 404 que una inexistente, por guia y por remision", async () => {
    await conDosEmpresas(base, async (c, o, authA, authB) => {
      const creada = await lote(c, authA, [fila(OCCIDENTAL, "R24-DE-A")]);
      expect(creada.cuerpo.creadas).toBe(1);
      const guia = String(creada.cuerpo.ordenes[0].numGuia);
      expect((await consultar(c, authA, guia)).status).toBe(200);
      expect((await consultar(c, authA, "R24-DE-A")).status).toBe(200);

      await comoEmpresa(c, o.b.organizacionId);
      const inexistente = await consultar(c, authB, "NO-EXISTE-R24");
      expect(inexistente.status).toBe(404);
      for (const id of [guia, "R24-DE-A"]) {
        const r = await consultar(c, authB, id);
        expect(r.status, id).toBe(404);
        expect(r.texto, id).toBe(inexistente.texto);
      }
    });
  }, 120_000);

  it("R24: B carga la misma remision que una orden de A: no la ve como duplicada y la de A no cambia", async () => {
    await conDosEmpresas(base, async (c, o, authA, authB) => {
      expect((await lote(c, authA, [fila(OCCIDENTAL, "R24-MISMA")])).cuerpo.creadas).toBe(1);
      const leer = () =>
        comoDueño(c, o.b.organizacionId, () =>
          c.tx.orden.findMany({
            where: { numRemision: "R24-MISMA" },
            select: { id: true, organizacionId: true, zonaId: true, distritoId: true, estatusId: true, updatedAt: true },
            orderBy: { createdAt: "asc" },
          }),
        );

      await comoEmpresa(c, o.b.organizacionId);
      const antes = await leer();
      const r = await lote(c, authB, [fila(CARMEN, "R24-MISMA")]);
      expect(r.cuerpo).toMatchObject({ total: 1, creadas: 1, duplicadas: 0, conError: 0 });
      expect(r.texto).not.toContain(antes[0].id);

      const despues = await leer();
      expect(despues).toHaveLength(2);
      expect(despues[0]).toEqual(antes[0]);
      expect(despues[1].organizacionId).toBe(o.b.organizacionId);
    });
  }, 120_000);

  it("R24: el catalogo es el del pais de la empresa de la key: el de otra empresa de otro pais da 404, en los dos sentidos", async () => {
    await conDosEmpresas(base, async (c, o, authA, authB) => {
      const deA = await catalogo(c, authA, "CR");
      await comoEmpresa(c, o.b.organizacionId);
      const deB = await catalogo(c, authB, "CR");
      expect(deB.status).toBe(200);
      expect(deB.texto).toBe(deA.texto);

      const inexistente = await catalogo(c, authB, "ZZ");
      const ajenoDesdeB = await catalogo(c, authB, PAIS_DE_C);
      expect(ajenoDesdeB.status).toBe(404);
      expect(ajenoDesdeB.texto).toBe(inexistente.texto);

      // Desde C: su pais si, Costa Rica no; y en el suyo no hay un solo nodo de Costa Rica.
      const authC = autenticadorDe(o.c.organizacionId, o.b.tiendaId, "slt45-v2-c");
      await comoEmpresa(c, o.c.organizacionId);
      const crDesdeC = await catalogo(c, authC, "CR");
      expect(crDesdeC.status).toBe(404);
      expect(crDesdeC.texto).toBe(inexistente.texto);
      const deC = await catalogo(c, authC, PAIS_DE_C);
      expect(deC.status).toBe(200);
      expect(deC.cuerpo.nodos.map((n: { id: string }) => n.id).sort()).toEqual([...o.nodosDeC].sort());
      expect(deB.cuerpo.nodos.some((n: { id: string }) => o.nodosDeC.includes(n.id))).toBe(false);
    });
  }, 120_000);
});
