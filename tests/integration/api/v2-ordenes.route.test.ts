import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { handleCrearOrdenV2 } from "@/app/api/v2/ordenes/route";
import type { AutenticadorApiKey } from "@/lib/api/api-key-request";
import { MSG_PAIS_NO_HABILITADO, MSG_UBICACION_UNA_DE_LAS_DOS } from "@/lib/services/geo-ubicacion";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "../db/_postgres-real";
import {
  conEscenario,
  crearTienda,
  depsDeCarga,
  nodoPorRuta,
  normalizarVolatiles,
  post,
  rutaEsperada,
  sinUbicacion,
  type Contexto,
} from "./_v2-escenario";

// SLT-45 T5.3 (design §4; R10, R11, R12, R13–R16, R17, R18) — CREAR UNA ORDEN Y CARGA POR LOTE DE v2.
//
// Contra Postgres real, con el rol de la app (`servi_app`, RLS) y en una transaccion que siempre se
// revierte, sobre la misma siembra que el contrato de v1 (`_v2-escenario.ts`). Corren reales los
// bordes (`handleCrearOrdenV2`, `handleCargaApi(…, "v2")`), el servicio, el motor de ubicacion, el
// catalogo de la empresa, la tarifa, las etiquetas y el manifiesto. Se sustituyen la autenticacion
// de la key (salvo en los 401, que usan el autenticador real), el Storage y la firma de URLs.
//
// «Ambiguo por nombre» (R13) no se alcanza contra la base: los unicos de `nodo_geografico`
// (`padre_id` + `nombre_normalizado`, y el de raices por pais) impiden dos hermanos con el mismo
// nombre normalizado, y el motor compara con ese `nombre_normalizado`. Ese mensaje lo prueba
// `tests/unit/services/geo-ubicacion.test.ts`; aqui va el ambiguo por codigo, que si es alcanzable.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URL_CREAR = "/api/v2/ordenes";
const URL_LOTE = "/api/v2/ordenes/carga";

type Fila = Record<string, unknown>;

let secuencia = 0;
function fila(ubicacion: Fila, extra: Fila = {}): Fila {
  secuencia += 1;
  return {
    num_remision: `V2-${secuencia}`,
    destinatario: `Destinatario ${secuencia}`,
    telefono: "80000001",
    direccion: `Direccion ${secuencia}`,
    producto: `Producto ${secuencia}`,
    peso: "1",
    monto_cobrar: "25900",
    ...ubicacion,
    ...extra,
  };
}

interface Respuesta {
  status: number;
  cuerpo: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** `"real"`: sin autenticador inyectado, el borde usa el de produccion (`buildAutenticar`). */
type Autenticacion = AutenticadorApiKey | "real";

function autenticadorDe(c: Contexto, a: Autenticacion | undefined): AutenticadorApiKey | undefined {
  if (a === "real") return undefined;
  return a ?? c.autenticar;
}

async function lote(c: Contexto, cuerpo: unknown, autenticar?: Autenticacion, bearer?: string | null): Promise<Respuesta> {
  const res = await handleCargaApi(
    post(URL_LOTE, cuerpo, bearer),
    { ...depsDeCarga(c.cli, c.autenticar), autenticar: autenticadorDe(c, autenticar) },
    "v2",
  );
  return { status: res.status, cuerpo: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function crear(c: Contexto, cuerpo: unknown, autenticar?: Autenticacion, bearer?: string | null): Promise<Respuesta> {
  const res = await handleCrearOrdenV2(post(URL_CREAR, cuerpo, bearer), {
    ...depsDeCarga(c.cli, c.autenticar),
    autenticar: autenticadorDe(c, autenticar),
  });
  return { status: res.status, cuerpo: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function ordenesDeLaTienda(tx: TxDeTest, tiendaId: string): Promise<number> {
  return tx.orden.count({ where: { tiendaId } });
}

/** Un error de fila de ubicacion, tal como lo devuelve v2. */
function errorDeUbicacion(numFila: number, numRemision: unknown, mensaje: string) {
  return { fila: numFila, numRemision, resultado: "error", errores: { ubicacion: [mensaje] } };
}

const OCCIDENTAL = ["Cartago", "Cartago", "Occidental"];
const OROSI = ["Cartago", "Paraíso", "Orosi"];

describe("SLT-45 R10 — v2 ofrece exactamente cinco operaciones", () => {
  const RAIZ = path.resolve(__dirname, "..", "..", "..", "app", "api", "v2");

  function rutasBajo(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return rutasBajo(p);
      return e.name === "route.ts" ? [path.relative(RAIZ, p).split(path.sep).join("/")] : [];
    });
  }

  it("R10: bajo app/api/v2 solo hay crear, lote, cotizacion, consulta y catalogo, cada una con su unico metodo", async () => {
    expect(rutasBajo(RAIZ).sort()).toEqual([
      "geografia/route.ts",
      "ordenes/[id]/route.ts",
      "ordenes/carga/route.ts",
      "ordenes/cotizacion/route.ts",
      "ordenes/route.ts",
    ]);
    const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    const esperado: Record<string, string[]> = {
      "ordenes/route.ts": ["POST"],
      "ordenes/carga/route.ts": ["POST"],
      "ordenes/cotizacion/route.ts": ["POST"],
      "ordenes/[id]/route.ts": ["GET"],
      "geografia/route.ts": ["GET"],
    };
    const modulos: Record<string, Record<string, unknown>> = {
      "ordenes/route.ts": await import("@/app/api/v2/ordenes/route"),
      "ordenes/carga/route.ts": await import("@/app/api/v2/ordenes/carga/route"),
      "ordenes/cotizacion/route.ts": await import("@/app/api/v2/ordenes/cotizacion/route"),
      "ordenes/[id]/route.ts": await import("@/app/api/v2/ordenes/[id]/route"),
      "geografia/route.ts": await import("@/app/api/v2/geografia/route"),
    };
    for (const [ruta, mod] of Object.entries(modulos)) {
      expect(METODOS.filter((m) => typeof mod[m] === "function"), ruta).toEqual(esperado[ruta]);
    }
  });
});

describeSiHayBase("SLT-45 — crear una orden y carga por lote de v2 (Postgres real)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  // ── R11: autenticacion y empresa ───────────────────────────────────────────────────────────

  it("R11: sin Bearer o con una key desconocida, crear y lote responden 401 con el autenticador real y no crean nada", async () => {
    await conEscenario(base, {}, async (c) => {
      const cuerpoLote = { ordenes: [fila({ ubicacion: OCCIDENTAL })] };
      const cuerpoCrear = { orden: fila({ ubicacion: OCCIDENTAL }) };
      const respuestas = [
        await crear(c, cuerpoCrear, "real", null),
        await crear(c, cuerpoCrear, "real", "svl_estakeynoexiste0000000000"),
        await lote(c, cuerpoLote, "real", null),
        await lote(c, cuerpoLote, "real", "svl_estakeynoexiste0000000000"),
      ];
      for (const r of respuestas) {
        expect(r.status).toBe(401);
        expect(r.cuerpo).toMatchObject({ status: "error", code: "UNAUTHORIZED" });
      }
      expect(await ordenesDeLaTienda(c.tx, c.tiendaId)).toBe(0);
    });
  }, 120_000);

  it("R11: una key o un usuario no activos dan 403 en crear y lote, sin crear nada", async () => {
    await conEscenario(base, {}, async (c) => {
      const prohibida: AutenticadorApiKey = async () => ({ status: "forbidden" });
      const r1 = await crear(c, { orden: fila({ ubicacion: OCCIDENTAL }) }, prohibida);
      const r2 = await lote(c, { ordenes: [fila({ ubicacion: OCCIDENTAL })] }, prohibida);
      for (const r of [r1, r2]) {
        expect(r.status).toBe(403);
        expect(r.cuerpo).toMatchObject({ status: "error", code: "FORBIDDEN" });
      }
      expect(await ordenesDeLaTienda(c.tx, c.tiendaId)).toBe(0);
    });
  }, 120_000);

  it("R11: la orden queda en la empresa y la tienda de la key; los ids de empresa, tienda o dueño del cuerpo no se leen", async () => {
    let otraTienda = "";
    await conEscenario(
      base,
      {},
      async (c) => {
        const ajenos = { organizacion_id: randomUUID(), tienda_id: otraTienda, tiendaId: otraTienda, usuario_id: otraTienda, owner_id: otraTienda };
        const rCrear = await crear(c, { orden: fila({ ubicacion: OCCIDENTAL }, { num_remision: "V2-EMP-1", ...ajenos }) });
        const rLote = await lote(c, { ordenes: [fila({ ubicacion_codigo: "30102" }, { num_remision: "V2-EMP-2", ...ajenos })] });
        expect(rCrear.status).toBe(200);
        expect(rLote.status).toBe(200);
        expect(rCrear.cuerpo.creadas).toBe(1);
        expect(rLote.cuerpo.creadas).toBe(1);

        const ordenes = await c.tx.orden.findMany({
          where: { numRemision: { in: ["V2-EMP-1", "V2-EMP-2"] } },
          select: { tiendaId: true, organizacionId: true },
        });
        expect(ordenes).toHaveLength(2);
        for (const o of ordenes) expect(o).toEqual({ tiendaId: c.tiendaId, organizacionId: c.organizacionId });
        expect(await ordenesDeLaTienda(c.tx, otraTienda)).toBe(0);
      },
      async (tx) => {
        otraTienda = await crearTienda(tx, "Tienda Ajena");
      },
    );
  }, 120_000);

  // ── R12: exactamente una de las dos formas ─────────────────────────────────────────────────

  it("R12: sin ubicacion, con las dos, o con la terna de v1, la fila sale con su error bajo `ubicacion` y las demas se crean", async () => {
    await conEscenario(base, {}, async (c) => {
      const ninguna = fila({});
      const ambas = fila({ ubicacion: OCCIDENTAL, ubicacion_codigo: "30102" });
      const terna = fila({ provincia: "Cartago", canton: "Cartago", distrito: "Occidental" });
      const buena = fila({ ubicacion: OCCIDENTAL });
      const r = await lote(c, { ordenes: [ninguna, ambas, terna, buena] });

      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ total: 4, creadas: 1, duplicadas: 0, conError: 3 });
      expect(r.cuerpo.errores).toEqual([
        errorDeUbicacion(1, ninguna.num_remision, MSG_UBICACION_UNA_DE_LAS_DOS),
        errorDeUbicacion(2, ambas.num_remision, MSG_UBICACION_UNA_DE_LAS_DOS),
        errorDeUbicacion(3, terna.num_remision, MSG_UBICACION_UNA_DE_LAS_DOS),
      ]);
      expect(r.cuerpo.ordenes.map((o: { numRemision: string }) => o.numRemision)).toEqual([buena.num_remision]);

      const unica = await crear(c, { orden: fila({}) });
      expect(unica.status).toBe(200);
      expect(unica.cuerpo).toMatchObject({ total: 1, creadas: 0, conError: 1, ordenes: [] });
      expect(unica.cuerpo.errores[0].errores).toEqual({ ubicacion: [MSG_UBICACION_UNA_DE_LAS_DOS] });
      expect(await ordenesDeLaTienda(c.tx, c.tiendaId)).toBe(1);
    });
  }, 120_000);

  // ── R13–R16 extremo a extremo ──────────────────────────────────────────────────────────────

  it("R13: por nombre, normalizado nivel a nivel; vacio, no encontrado y retirado dicen el nivel y el nombre y paran en el primer fallo", async () => {
    await conEscenario(base, { retirados: [["Cartago", "Cartago", "Oriental"], ["Cartago", "Paraíso"]] }, async (c) => {
      const casos: [Fila, string | null][] = [
        [fila({ ubicacion: ["  cartago ", "CARTAGO", "occidental"] }), null],
        [fila({ ubicacion: ["Cartago", "   ", "Occidental"] }), "nivel 2: el nombre esta vacio"],
        [fila({ ubicacion: ["Atlantida"] }), "nivel 1: 'Atlantida' no encontrado"],
        [fila({ ubicacion: ["Cartago", "Cartago", "Nada"] }), "nivel 3: 'Nada' no encontrado en 'Cartago'"],
        [fila({ ubicacion: ["Atlantida", "   ", "Nada"] }), "nivel 1: 'Atlantida' no encontrado"],
        [fila({ ubicacion: ["Cartago", "Cartago", "Oriental"] }), "nivel 3: 'Oriental' esta retirado del catalogo"],
        // Activo en cascada (SLT-44 R5): Orosi esta activo, pero su canton no.
        [fila({ ubicacion: OROSI }), "nivel 2: 'Paraíso' esta retirado del catalogo"],
      ];
      const r = await lote(c, { ordenes: casos.map(([f]) => f) });
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ total: casos.length, creadas: 1, conError: casos.length - 1 });
      expect(r.cuerpo.errores).toEqual(
        casos.flatMap(([f, msg], i) => (msg === null ? [] : [errorDeUbicacion(i + 1, f.num_remision, msg)])),
      );
      expect(r.cuerpo.ordenes[0].ubicacion).toEqual(await rutaEsperada(c.tx, OCCIDENTAL));
      expect(await ordenesDeLaTienda(c.tx, c.tiendaId)).toBe(1);
    });
  }, 120_000);

  it("R14: por codigo oficial del pais; no encontrado, ambiguo entre niveles y retirado salen con su error de fila", async () => {
    await conEscenario(
      base,
      {
        retirados: [["Cartago", "Cartago", "Oriental"]],
        // Un canton nuevo con el codigo de Occidental (un distrito): el unico es por pais y TIPO.
        nodosNuevos: [{ padre: ["Cartago"], nombre: "Canton de Prueba SLT45", codigoOficial: "30102", activo: true }],
      },
      async (c) => {
        const codigoDe = async (ruta: string[]) =>
          (await c.tx.nodoGeografico.findUniqueOrThrow({ where: { id: await nodoPorRuta(c.tx, ruta) }, select: { codigoOficial: true } }))
            .codigoOficial as string;
        const occidental = await codigoDe(OCCIDENTAL);
        expect(occidental).toBe("30102");
        const oriental = await codigoDe(["Cartago", "Cartago", "Oriental"]);
        const orosi = await codigoDe(OROSI);

        const casos: [Fila, string | null][] = [
          [fila({ ubicacion_codigo: ` ${orosi} ` }), null],
          [fila({ ubicacion_codigo: "99999999" }), "ubicacion_codigo '99999999' no encontrado"],
          [fila({ ubicacion_codigo: occidental }), `ubicacion_codigo '${occidental}' es ambiguo: lo comparten varios niveles`],
          [fila({ ubicacion_codigo: oriental }), `ubicacion_codigo '${oriental}' esta retirado del catalogo`],
        ];
        const r = await lote(c, { ordenes: casos.map(([f]) => f) });
        expect(r.status).toBe(200);
        expect(r.cuerpo).toMatchObject({ total: 4, creadas: 1, conError: 3 });
        expect(r.cuerpo.errores).toEqual(
          casos.flatMap(([f, msg], i) => (msg === null ? [] : [errorDeUbicacion(i + 1, f.num_remision, msg)])),
        );
        expect(r.cuerpo.ordenes[0].ubicacion).toEqual(await rutaEsperada(c.tx, OROSI));
      },
    );
  }, 120_000);

  it("R15: una ubicacion que no cumple la regla de guardado (provincia de CR) da pais no habilitado en crear y lote, sin crear nada", async () => {
    await conEscenario(base, {}, async (c) => {
      const provincia = (
        await c.tx.nodoGeografico.findUniqueOrThrow({ where: { id: await nodoPorRuta(c.tx, ["Cartago"]) }, select: { codigoOficial: true } })
      ).codigoOficial as string;
      const porNombre = fila({ ubicacion: ["Cartago"] });
      const porCodigo = fila({ ubicacion_codigo: provincia });
      const r = await lote(c, { ordenes: [porNombre, porCodigo] });
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ total: 2, creadas: 0, conError: 2, ordenes: [] });
      expect(r.cuerpo.errores).toEqual([
        errorDeUbicacion(1, porNombre.num_remision, MSG_PAIS_NO_HABILITADO),
        errorDeUbicacion(2, porCodigo.num_remision, MSG_PAIS_NO_HABILITADO),
      ]);

      const unica = fila({ ubicacion: ["Cartago"] });
      const rc = await crear(c, { orden: unica });
      expect(rc.status).toBe(200);
      expect(rc.cuerpo.errores).toEqual([errorDeUbicacion(1, unica.num_remision, MSG_PAIS_NO_HABILITADO)]);
      expect(await ordenesDeLaTienda(c.tx, c.tiendaId)).toBe(0);
    });
  }, 120_000);

  it("R16: un canton de CR (las zonas cubren distritos) y un distrito sin zona salen con «sin zona», sin crearse", async () => {
    await conEscenario(base, {}, async (c) => {
      const canton = fila({ ubicacion: ["Cartago", "Paraíso"] });
      const distrito = fila({ ubicacion: ["Cartago", "Cartago", "Carmen"] });
      const r = await lote(c, { ordenes: [canton, distrito] });
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ total: 2, creadas: 0, conError: 2, ordenes: [] });
      expect(r.cuerpo.errores).toEqual([
        errorDeUbicacion(1, canton.num_remision, "la ubicacion 'Paraíso' no tiene zona asignada"),
        errorDeUbicacion(2, distrito.num_remision, "la ubicacion 'Carmen' no tiene zona asignada"),
      ]);

      const rc = await crear(c, { orden: fila({ ubicacion: ["Cartago", "Paraíso"] }) });
      expect(rc.cuerpo.errores[0].errores).toEqual({ ubicacion: ["la ubicacion 'Paraíso' no tiene zona asignada"] });
      expect(await ordenesDeLaTienda(c.tx, c.tiendaId)).toBe(0);
    });
  }, 120_000);

  // ── R17: la forma del lote es la de v1 + `ubicacion` ───────────────────────────────────────

  /** El mismo lote en v1 (terna) y en v2 (ruta o codigo), con duplicados, nombre y descarga individual. */
  function filasDelLote(version: "v1" | "v2"): Fila[] {
    const ubic = (ruta: string[], codigo?: string): Fila =>
      version === "v1"
        ? { provincia: ruta[0], canton: ruta[1], distrito: ruta[2] }
        : codigo !== undefined
          ? { ubicacion_codigo: codigo }
          : { ubicacion: ruta };
    const base = (n: number, ruta: string[], monto: string, codigo?: string): Fila => ({
      num_remision: `R17-${n}`,
      destinatario: `Destinatario ${n}`,
      telefono: "80000001",
      direccion: `Direccion ${n}`,
      producto: `Producto ${n}`,
      peso: "1",
      monto_cobrar: monto,
      ...ubic(ruta, codigo),
    });
    return [
      base(1, OCCIDENTAL, "25900"),
      base(2, OROSI, "0"), // zona_2, no central y con la marca especial
      base(3, ["Limón", "Limón", "Río Blanco"], "100", "70103"),
      base(1, OCCIDENTAL, "25900"), // remision repetida dentro del lote
    ];
  }

  async function correrLote(version: "v1" | "v2"): Promise<{ respuestas: Respuesta[]; c: { ubicaciones: unknown[] } }> {
    return conEscenario(base, {}, async (c) => {
      const cuerpo = { ordenes: filasDelLote(version), name: "Lote R17", download_type: "individual" };
      const respuestas: Respuesta[] = [];
      for (const cuerpoPaso of [cuerpo, { ordenes: filasDelLote(version) }]) {
        const res = await handleCargaApi(post(URL_LOTE, cuerpoPaso), depsDeCarga(c.cli, c.autenticar), version);
        respuestas.push({ status: res.status, cuerpo: (await res.json()) as Record<string, any> }); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      const ubicaciones = [
        await rutaEsperada(c.tx, OCCIDENTAL),
        await rutaEsperada(c.tx, OROSI),
        await rutaEsperada(c.tx, ["Limón", "Limón", "Río Blanco"]),
      ];
      return { respuestas, c: { ubicaciones } };
    });
  }

  it("R17: el lote de v2 responde lo mismo que el de v1 (resumen, filas, errores, duplicados, costo, nombre, descarga, etiquetas y manifiesto) + `ordenes[].ubicacion`", async () => {
    const v1 = await correrLote("v1");
    const v2 = await correrLote("v2");
    // Sanidad del codigo de Limon/Limon/Rio Blanco usado en v2.
    expect(v2.c.ubicaciones[2]).toMatchObject([{}, {}, { codigoOficial: "70103" }]);

    expect(v2.respuestas.map((r) => r.status)).toEqual([200, 200]);
    expect(v1.respuestas.map((r) => r.status)).toEqual([200, 200]);

    const [primero, segundo] = v2.respuestas.map((r) => r.cuerpo);
    // El primer envio: 3 creadas y la remision repetida como duplicada; el segundo, todas duplicadas.
    expect(primero).toMatchObject({ total: 4, creadas: 3, duplicadas: 1, conError: 0, downloadType: "individual" });
    expect(segundo).toMatchObject({ total: 4, creadas: 0, duplicadas: 4, ordenes: [] });
    // Cada orden creada lleva la ruta de su nodo (R17, R21).
    expect(primero.ordenes.map((o: { ubicacion: unknown }) => o.ubicacion)).toEqual(v2.c.ubicaciones);
    for (const o of primero.ordenes) expect(o.downloadUrl).toMatch(/^https:\/\/storage\.test\//);

    // Y quitando `ubicacion`, byte a byte lo de v1 (con la lista cerrada de volatiles del contrato).
    const comoV1 = v2.respuestas.map((r) => ({ ...r.cuerpo, ordenes: sinUbicacion(r.cuerpo.ordenes) }));
    expect(Object.keys(primero).sort()).toEqual(Object.keys(v1.respuestas[0].cuerpo).sort());
    expect(normalizarVolatiles(comoV1)).toEqual(normalizarVolatiles(v1.respuestas.map((r) => r.cuerpo)));
  }, 120_000);

  it("R17: la orden creada por v2 guarda su nodo y las FK de su ruta", async () => {
    await conEscenario(base, {}, async (c) => {
      const f = fila({ ubicacion: OCCIDENTAL });
      const r = await lote(c, { ordenes: [f] });
      expect(r.cuerpo.creadas).toBe(1);
      const orden = await c.tx.orden.findFirstOrThrow({
        where: { numRemision: f.num_remision as string },
        select: { id: true, provinciaId: true, cantonId: true, distritoId: true, nodoGeograficoId: true },
      });
      const ruta = await rutaEsperada(c.tx, OCCIDENTAL);
      expect(orden).toEqual({
        id: r.cuerpo.ordenes[0].id,
        provinciaId: ruta[0].id,
        cantonId: ruta[1].id,
        distritoId: ruta[2].id,
        nodoGeograficoId: ruta[2].id,
      });
    });
  }, 120_000);

  // ── R18: crear una orden = lote de v2 con esa unica orden ──────────────────────────────────

  it("R18: crear una orden responde lo mismo que el lote de v2 con esa unica orden (carga, etiquetas y manifiesto)", async () => {
    const orden = {
      num_remision: "R18-1",
      destinatario: "Destinatario R18",
      telefono: "80000001",
      direccion: "Direccion R18",
      producto: "Producto R18",
      peso: "1",
      monto_cobrar: "25900",
      ubicacion: OCCIDENTAL,
    };
    const porCrear = await conEscenario(base, {}, async (c) => {
      const r = await crear(c, { orden, name: "Una orden R18" });
      const cargas = await c.tx.carga.count({ where: { id: r.cuerpo.cargaId } });
      return { ...r, cargas, ruta: await rutaEsperada(c.tx, OCCIDENTAL) };
    });
    const porLote = await conEscenario(base, {}, (c) => lote(c, { ordenes: [orden], name: "Una orden R18" }));

    expect(porCrear.status).toBe(200);
    expect(porCrear.cuerpo).toMatchObject({ total: 1, creadas: 1, duplicadas: 0, conError: 0, downloadType: "consolidate" });
    expect(porCrear.cargas).toBe(1); // su propia `carga` de una orden
    expect(porCrear.cuerpo.etiquetasPdf).toMatchObject({ url: expect.stringMatching(/^https:\/\/storage\.test\//) });
    expect(porCrear.cuerpo.manifiesto.filas).toHaveLength(1);
    expect(porCrear.cuerpo.ordenes[0].ubicacion).toEqual(porCrear.ruta);
    expect(normalizarVolatiles(porCrear.cuerpo)).toEqual(normalizarVolatiles(porLote.cuerpo));
  }, 120_000);

  it("R18: crear una orden recibe UNA orden: `ordenes` en vez de `orden`, o una `ubicacion` que no es lista de textos, es 422 sin crear nada", async () => {
    await conEscenario(base, {}, async (c) => {
      const r1 = await crear(c, { ordenes: [fila({ ubicacion: OCCIDENTAL })] });
      const r2 = await crear(c, { orden: fila({ ubicacion: "Cartago/Cartago/Occidental" }) });
      for (const r of [r1, r2]) {
        expect(r.status).toBe(422);
        expect(r.cuerpo).toMatchObject({ status: "error", code: "VALIDATION_ERROR" });
      }
      expect(r1.cuerpo.details.fieldErrors.orden).toBeDefined();
      expect(await ordenesDeLaTienda(c.tx, c.tiendaId)).toBe(0);
    });
  }, 120_000);
});
