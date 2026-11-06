import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { handleConsultaOrdenApi } from "@/app/api/ordenes/api-key/orden/[id]/route";
import { handleConsultaOrdenV2 } from "@/app/api/v2/ordenes/[id]/route";
import type { AutenticadorApiKey } from "@/lib/api/api-key-request";
import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "../db/_postgres-real";
import {
  conEscenario,
  crearTienda,
  depsDeCarga,
  depsDeConsulta,
  geografiaServiceDe,
  get,
  nodoPorRuta,
  post,
  rutaEsperada,
  type Contexto,
} from "./_v2-escenario";

// SLT-45 T5.5 (design §4.3; R20, R21) — LA CONSULTA DE UNA ORDEN EN v2 = LA DE v1 + `ubicacion`.
//
// Contra Postgres real, con el rol de la app (`servi_app`, RLS) y en una transaccion que siempre se
// revierte, sobre la misma siembra que el contrato de v1 (`_v2-escenario.ts`). Las ordenes se crean
// por la carga de v2 real; despues se leen por v1 (`handleConsultaOrdenApi`) y por v2
// (`handleConsultaOrdenV2`) con la resolucion, la lectura del detalle, la tarifa vigente y el
// catalogo reales. Solo se sustituyen la autenticacion de la key y la firma de URLs.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const OCCIDENTAL = ["Cartago", "Cartago", "Occidental"];
const OROSI = ["Cartago", "Paraíso", "Orosi"];

interface Respuesta {
  status: number;
  texto: string;
}

async function consultar(c: Contexto, version: "v1" | "v2", id: string, autenticar: AutenticadorApiKey = c.autenticar): Promise<Respuesta> {
  const deps = depsDeConsulta(c.cli, autenticar);
  const res =
    version === "v1"
      ? await handleConsultaOrdenApi(get(`/api/ordenes/api-key/orden/${id}`), id, deps)
      : await handleConsultaOrdenV2(get(`/api/v2/ordenes/${id}`), id, { ...deps, geografiaService: geografiaServiceDe(c.cli) });
  return { status: res.status, texto: await res.text() };
}

/** Crea las ordenes por la carga de v2 real (con el actor dado) y devuelve su guia por remision. */
async function crearOrdenes(
  c: Contexto,
  filas: { num_remision: string; ubicacion: string[] }[],
  autenticar: AutenticadorApiKey = c.autenticar,
): Promise<Map<string, number>> {
  const ordenes = filas.map((f, i) => ({
    destinatario: `Destinatario ${i + 1}`,
    telefono: "80000001",
    direccion: `Direccion ${i + 1}`,
    producto: `Producto ${i + 1}`,
    peso: "1",
    monto_cobrar: "25900",
    ...f,
  }));
  const res = await handleCargaApi(post("/api/v2/ordenes/carga", { ordenes }), depsDeCarga(c.cli, autenticar), "v2");
  const cuerpo = (await res.json()) as { creadas: number; ordenes: { numRemision: string; numGuia: number }[] };
  expect(cuerpo.creadas).toBe(filas.length);
  return new Map(cuerpo.ordenes.map((o) => [o.numRemision, o.numGuia]));
}

/** Corre `cambio` como dueño (la app no escribe ahi) y vuelve al rol de la app. */
async function comoDueño(c: Contexto, cambio: () => Promise<unknown>): Promise<void> {
  await c.tx.$executeRawUnsafe("RESET ROLE");
  await cambio();
  await comoApp(c.tx, c.organizacionId);
}

describeSiHayBase("SLT-45 R20, R21 — consulta de una orden en v2 (Postgres real)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R20/R21: por guia y por remision, el detalle de v2 es el de v1 mas `ubicacion` de la raiz al nodo, con su tipo", async () => {
    await conEscenario(base, {}, async (c) => {
      const guias = await crearOrdenes(c, [
        { num_remision: "R20-1", ubicacion: OCCIDENTAL },
        { num_remision: "R20-2", ubicacion: OROSI },
      ]);
      const casos: [string, string[]][] = [
        [String(guias.get("R20-1")), OCCIDENTAL],
        ["R20-2", OROSI],
      ];
      for (const [id, ruta] of casos) {
        const v1 = await consultar(c, "v1", id);
        const v2 = await consultar(c, "v2", id);
        expect(v1.status, id).toBe(200);
        expect(v2.status, id).toBe(200);

        const { ubicacion, ...resto } = JSON.parse(v2.texto) as Record<string, unknown>;
        // Quitando `ubicacion`, el detalle de v1 tal cual: claves, orden y valores.
        expect(JSON.stringify(resto)).toBe(v1.texto);

        const esperada = await rutaEsperada(c.tx, ruta);
        expect(ubicacion).toEqual(esperada);
        // R21: cinco claves por eslabon, profundidades 1..3 y el tipo con clave y nombre singular.
        expect(esperada.map((e) => [e.profundidad, e.tipo])).toEqual([
          [1, { clave: "nivel_1", nombre: "Provincia" }],
          [2, { clave: "nivel_2", nombre: "Cantón" }],
          [3, { clave: "nivel_3", nombre: "Distrito" }],
        ]);
        for (const e of ubicacion as Record<string, unknown>[]) {
          expect(Object.keys(e).sort()).toEqual(["codigoOficial", "id", "nombre", "profundidad", "tipo"]);
        }
      }
    });
  }, 120_000);

  it("R21: `ubicacion` trae el nombre ACTUAL del nodo, no una foto del momento de crear la orden", async () => {
    await conEscenario(base, {}, async (c) => {
      const guias = await crearOrdenes(c, [{ num_remision: "R21-1", ubicacion: OCCIDENTAL }]);
      const distrito = await nodoPorRuta(c.tx, OCCIDENTAL);
      await comoDueño(c, () =>
        c.tx.nodoGeografico.update({ where: { id: distrito }, data: { nombre: "Occidental Renombrado" } }),
      );

      const v2 = await consultar(c, "v2", String(guias.get("R21-1")));
      expect(v2.status).toBe(200);
      const { ubicacion } = JSON.parse(v2.texto) as { ubicacion: { id: string; nombre: string }[] };
      expect(ubicacion.map((e) => e.nombre)).toEqual(["Cartago", "Cartago", "Occidental Renombrado"]);
      expect(ubicacion[2].id).toBe(distrito);
    });
  }, 120_000);

  it("R20: inexistente, borrada y de otra tienda dan el MISMO 404 en v2, byte a byte el de v1", async () => {
    let otraTienda = "";
    await conEscenario(
      base,
      {},
      async (c) => {
        const propias = await crearOrdenes(c, [{ num_remision: "R20-BORRADA", ubicacion: OCCIDENTAL }]);
        const deOtra: AutenticadorApiKey = async () => ({
          status: "ok",
          actor: { usuarioId: otraTienda, rol: "apiKey" },
          apiKeyId: "slt45-v2-otra",
          organizacionId: c.organizacionId,
        });
        const ajenas = await crearOrdenes(c, [{ num_remision: "R20-AJENA", ubicacion: OCCIDENTAL }], deOtra);
        // La ajena existe y su dueña la ve: el 404 de abajo es por dueño, no por falta de la orden.
        expect((await consultar(c, "v2", "R20-AJENA", deOtra)).status).toBe(200);

        await comoDueño(c, () => c.tx.orden.updateMany({ where: { numRemision: "R20-BORRADA" }, data: { deletedAt: new Date() } }));

        const ids = ["NO-EXISTE-R20", String(propias.get("R20-BORRADA")), "R20-BORRADA", String(ajenas.get("R20-AJENA")), "R20-AJENA"];
        const v1De404 = await consultar(c, "v1", "NO-EXISTE-R20");
        expect(v1De404.status).toBe(404);
        expect(JSON.parse(v1De404.texto)).toMatchObject({ status: "error", code: "NOT_FOUND" });
        for (const id of ids) {
          const v1 = await consultar(c, "v1", id);
          const v2 = await consultar(c, "v2", id);
          expect(v2.status, id).toBe(404);
          expect(v2.texto, id).toBe(v1De404.texto);
          expect(v1.texto, id).toBe(v1De404.texto);
          expect(v2.texto).not.toContain("ubicacion");
        }
      },
      async (tx) => {
        otraTienda = await crearTienda(tx, "Tienda Ajena");
      },
    );
  }, 120_000);

  it("R20 (+R11): 401, 403 y el 422 de un `{id}` vacio son los de v1", async () => {
    await conEscenario(base, {}, async (c) => {
      const guias = await crearOrdenes(c, [{ num_remision: "R20-AUTH", ubicacion: OCCIDENTAL }]);
      const guia = String(guias.get("R20-AUTH"));
      const casos: [AutenticadorApiKey, string, number][] = [
        [async () => ({ status: "unauthenticated" }), guia, 401],
        [async () => ({ status: "forbidden" }), guia, 403],
        [c.autenticar, "   ", 422],
      ];
      for (const [auth, id, status] of casos) {
        const v1 = await consultar(c, "v1", id, auth);
        const v2 = await consultar(c, "v2", id, auth);
        expect(v2.status).toBe(status);
        expect(v2.texto).toBe(v1.texto);
      }
    });
  }, 120_000);
});
