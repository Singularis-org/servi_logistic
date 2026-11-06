import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleCargaApi, type CargaApiDeps } from "@/app/api/ordenes/api-key/carga/route";
import { handleCotizacionApi } from "@/app/api/ordenes/api-key/cotizacion/route";
import { etiquetasConfig } from "@/lib/config/etiquetas";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { AutenticadorApiKey } from "@/lib/api/api-key-request";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { CupoPlanRepository } from "@/lib/repositories/CupoPlanRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { CotizacionOrdenService } from "@/lib/services/CotizacionOrdenService";
import { EtiquetaGuiaService } from "@/lib/services/EtiquetaGuiaService";
import { EtiquetasDescargaService } from "@/lib/services/EtiquetasDescargaService";
import { EtiquetasLotePdfService } from "@/lib/services/EtiquetasLotePdfService";
import { ManifiestoService } from "@/lib/services/ManifiestoService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { comoApp, datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "../db/_postgres-real";

// SLT-45 T1.3 (design §7.3; R2, R9) — EL CONTRATO DE v1 CONGELADO.
//
// Por cada payload de `tests/fixtures/contrato-v1/` se llama a `handleCargaApi` y a
// `handleCotizacionApi` REALES contra Postgres, y se compara el status y el cuerpo con la respuesta
// grabada en `respuestas/<id>.json`, byte a byte tras normalizar SOLO la lista cerrada de volatiles.
// Las respuestas se grabaron con el codigo del commit de `BASE`, antes de tocar codigo de SLT-45: lo
// que esta suite prueba es que v1 sigue respondiendo lo mismo que entonces. Si se regrabaran con el
// codigo de la rama, quedaria verde siempre y no probaria nada (design §11, alternativa 6).
//
// QUE ES REAL Y QUE NO. Corren reales los dos bordes, sus servicios y repositorios, el catalogo
// geografico, la tarifa, el cupo del plan, el PDF de etiquetas y el manifiesto, todo con el rol de la
// app (`servi_app`, con RLS) y dentro de una transaccion que siempre se revierte. Se sustituye lo que
// no es de la base: la autenticacion de la key (devuelve la empresa y el actor sembrados, por el mismo
// `conEmpresaDeLaKey` de produccion), el Storage y la firma de URLs (las URLs son volatiles) y el aviso
// de «carga terminada» (best-effort, fuera de la respuesta).
//
// FORMATO DE UN PAYLOAD (los dos fixtures son listas de estos):
//   { id, descripcion, escenario?, pasos: [{ ruta: "carga" | "cotizacion", cuerpo? | cuerpoTexto? |
//     ordenesRepetidas?: { veces, fila } }] }
// `escenario` cambia la siembra base (ESCENARIO_BASE) clave a clave: `zonas`, `especiales`,
// `sinTarifas`, `retirados` (rutas de nombres exactos de nodos de CR que se marcan inactivos) y
// `nodosNuevos` (nodos de CR que se insertan bajo la ruta `padre`). Los pasos corren en orden en la
// misma empresa, y sus respuestas comparten la numeracion de volatiles.
//
// GRABAR (solo sobre el commit de `BASE`, nunca con el codigo de la rama):
//   git worktree add ../contrato-v1-base "$(cat tests/fixtures/contrato-v1/BASE)"
//   copiar los payloads nuevos a ese worktree, y alli:
//   CONTRATO_V1_GRABAR=1 pnpm exec vitest run tests/integration/api/contrato-v1.route.test.ts
//   y subir el fixture y sus `respuestas/` a esta rama.

const DIR = path.resolve(__dirname, "..", "..", "fixtures", "contrato-v1");
const DIR_RESPUESTAS = path.join(DIR, "respuestas");
const GRABAR = process.env.CONTRATO_V1_GRABAR === "1";
const PAIS = "CR";

type RutaNombres = string[];

interface ZonaDelEscenario {
  nombre: string;
  esCentral: boolean;
  distritos: RutaNombres[];
}

interface Escenario {
  zonas: ZonaDelEscenario[];
  especiales: RutaNombres[];
  sinTarifas: boolean;
  retirados: RutaNombres[];
  nodosNuevos: { padre: RutaNombres; nombre: string; activo: boolean }[];
}

interface Paso {
  ruta: "carga" | "cotizacion";
  cuerpo?: unknown;
  cuerpoTexto?: string;
  ordenesRepetidas?: { veces: number; fila: Record<string, unknown> };
}

interface Payload {
  id: string;
  descripcion: string;
  escenario?: Partial<Escenario>;
  pasos: Paso[];
}

interface RespuestaDePaso {
  ruta: Paso["ruta"];
  status: number;
  cuerpo: unknown;
}

// La siembra de todos los payloads que no digan otra cosa. Cartago/Cartago/Carmen queda sin zona a
// proposito, y Orosi lleva la marca de zona especial.
const ESCENARIO_BASE: Escenario = {
  zonas: [
    {
      nombre: "zona_1",
      esCentral: true,
      distritos: [
        ["Cartago", "Cartago", "Occidental"],
        ["Cartago", "Cartago", "Oriental"],
        ["San José", "San José", "Carmen"],
      ],
    },
    {
      nombre: "zona_2",
      esCentral: false,
      distritos: [
        ["Cartago", "Paraíso", "Paraíso"],
        ["Cartago", "Paraíso", "Orosi"],
        ["Cartago", "Cartago", "San Nicolás"],
        ["Limón", "Limón", "Río Blanco"],
      ],
    },
  ],
  especiales: [["Cartago", "Paraíso", "Orosi"]],
  sinTarifas: false,
  retirados: [],
  nodosNuevos: [],
};

// Tarifas fijas, una por zona y sin tienda (nivel 3 de la cascada del modelo viejo).
const TARIFA_FIJA = {
  valorFlete: "2500.00",
  valorFleteDevuelto: "1250.00",
  valorFleteGam: "2000.00",
  valorFleteDevueltoGam: "1000.00",
  comisionCod: "2.00",
  ivaFlete: "13.00",
  ivaComisionCod: "13.00",
  tarifaEspecial: "4000.00",
  tarifaEspecialDevuelta: "1500.00",
} as const;

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────

function leerPayloads(archivo: string): Payload[] {
  const contenido = JSON.parse(fs.readFileSync(path.join(DIR, archivo), "utf8")) as unknown;
  if (!Array.isArray(contenido)) throw new Error(`${archivo} no es una lista de payloads`);
  return contenido as Payload[];
}

const SINTETICOS = leerPayloads("payloads-sinteticos.json");
const REALES = leerPayloads("payloads-reales.json");
const TODOS = [...SINTETICOS, ...REALES];

function archivoDeRespuesta(id: string): string {
  return path.join(DIR_RESPUESTAS, `${id}.json`);
}

// ── normalizacion de volatiles (lista cerrada, design §7.3) ────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const CLAVES_VOLATILES = new Set(["numGuia", "cargaId", "url", "downloadUrl"]);

/**
 * Sustituye cada valor volatil distinto por `<tipo#k>`, con `k` por orden de aparicion. El mapa se
 * comparte entre los pasos de un payload: dos apariciones del mismo valor dan el mismo token, asi que
 * se sigue comprobando que valores son iguales entre si. Nada fuera de la lista se toca.
 */
class Normalizador {
  private readonly tokens = new Map<string, string>();
  private readonly contadores = new Map<string, number>();

  normalizar(valor: unknown, clave?: string): unknown {
    if (Array.isArray(valor)) return valor.map((v) => this.normalizar(v));
    if (valor !== null && typeof valor === "object") {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, this.normalizar(v, k)]));
    }
    if (valor === null || valor === undefined) return valor;
    if (clave !== undefined && CLAVES_VOLATILES.has(clave)) return this.token(clave, valor);
    if (typeof valor === "string" && UUID.test(valor)) return this.token("uuid", valor);
    if (typeof valor === "string" && FECHA_ISO.test(valor)) return this.token("fecha", valor);
    return valor;
  }

  private token(tipo: string, valor: unknown): string {
    const clave = JSON.stringify(valor);
    const existente = this.tokens.get(clave);
    if (existente !== undefined) return existente;
    const k = (this.contadores.get(tipo) ?? 0) + 1;
    this.contadores.set(tipo, k);
    const token = `<${tipo}#${k}>`;
    this.tokens.set(clave, token);
    return token;
  }
}

function serializar(id: string, pasos: RespuestaDePaso[]): string {
  return `${JSON.stringify({ payload: id, pasos }, null, 2)}\n`;
}

// ── siembra ────────────────────────────────────────────────────────────────────────────────────

function escenarioDe(p: Payload): Escenario {
  return { ...ESCENARIO_BASE, ...p.escenario };
}

/** El nodo de CR al final de la ruta de nombres exactos, desde la raiz. Lanza si no existe. */
async function nodoPorRuta(tx: TxDeTest, ruta: RutaNombres): Promise<string> {
  let padreId: string | null = null;
  for (const nombre of ruta) {
    const nodo: { id: string } | null = await tx.nodoGeografico.findFirst({
      where: { paisId: PAIS, padreId, nombre },
      select: { id: true },
    });
    if (nodo === null) throw new Error(`la siembra no encuentra el nodo ${ruta.join(" / ")} en ${PAIS}`);
    padreId = nodo.id;
  }
  if (padreId === null) throw new Error("ruta vacia");
  return padreId;
}

interface Sembrado {
  organizacionId: string;
  tiendaId: string;
}

async function crearTienda(tx: TxDeTest): Promise<string> {
  const rol = await tx.rol.findUniqueOrThrow({ where: { value: "apiKey" }, select: { id: true } });
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  // Nombre fijo: es lo que el manifiesto imprime como origen y responsable.
  const tienda = await tx.usuario.create({
    data: {
      nombre: "Tienda Contrato",
      primerApellido: "V1",
      email: `contrato-v1-${sufijo}@example.com`,
      telefono: "80000000",
      passwordHash: "x",
      cedula: `cv1-${sufijo}`,
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      estado: "activo",
    },
    select: { id: true },
  });
  return tienda.id;
}

async function sembrar(tx: TxDeTest, e: Escenario): Promise<Sembrado> {
  await serializarEscriturasReales(tx);
  const org = await tx.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
  await tx.organizacionModulo.createMany({
    data: ORDEN_MODULOS.map((modulo) => ({ organizacionId: org.id, modulo })),
  });
  await fijarEmpresa(tx, org.id);
  const tiendaId = await crearTienda(tx);

  for (const z of e.zonas) {
    const zona = await tx.zona.create({
      data: { nombre: z.nombre, esCentral: z.esCentral, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    });
    for (const ruta of z.distritos) {
      await tx.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: await nodoPorRuta(tx, ruta) } });
    }
    if (!e.sinTarifas) await tx.tarifa.create({ data: { ...TARIFA_FIJA, zonaId: zona.id, tiendaId: null } });
  }
  for (const ruta of e.especiales) {
    await tx.distritoZonaEspecial.create({ data: { distritoId: await nodoPorRuta(tx, ruta) } });
  }

  // La geografia es de plataforma: se toca como dueño y la transaccion revertida se lo lleva.
  const tipos = await tx.tipoNivelGeografico.findMany({ where: { paisId: PAIS }, select: { id: true, clave: true } });
  for (const n of e.nodosNuevos) {
    const padreId = n.padre.length === 0 ? null : await nodoPorRuta(tx, n.padre);
    const profundidad = n.padre.length + 1;
    const tipo = tipos.find((t) => t.clave === `nivel_${profundidad}`);
    if (tipo === undefined) throw new Error(`${PAIS} no tiene el tipo nivel_${profundidad}`);
    await tx.nodoGeografico.create({
      data: { paisId: PAIS, tipoId: tipo.id, padreId, profundidad, nombre: n.nombre, nombreNormalizado: "", activo: n.activo },
    });
  }
  for (const ruta of e.retirados) {
    await tx.nodoGeografico.update({ where: { id: await nodoPorRuta(tx, ruta) }, data: { activo: false } });
  }
  return { organizacionId: org.id, tiendaId };
}

// ── los bordes, compuestos como en produccion ──────────────────────────────────────────────────

const storageEnMemoria: IFileStorage = {
  upload: async (input) => input.path,
  remove: async () => undefined,
};

const urlsFirmadas: ISignedUrlProvider = {
  createSignedUrl: async (p) => `https://storage.test/${p}`,
  createSignedUrls: async (paths) => Object.fromEntries(paths.map((p) => [p, `https://storage.test/${p}`])),
};

function depsDeCarga(cli: PrismaClient, autenticar: AutenticadorApiKey): CargaApiDeps {
  const ordenRepo = new OrdenRepository(cli);
  const pdf = new EtiquetasLotePdfService(
    new EtiquetaGuiaService(ordenRepo),
    storageEnMemoria,
    urlsFirmadas,
    etiquetasConfig.SIGNED_URL_TTL_SECONDS,
    etiquetasConfig.MAX_ETIQUETAS_POR_PDF,
  );
  return {
    autenticar,
    bulkService: new BulkOrdenService(ordenRepo, new TarifaVigenteRepository(cli), undefined, new CupoPlanRepository(cli)),
    descargaService: new EtiquetasDescargaService(pdf, ordenRepo),
    manifiestoService: new ManifiestoService(
      ordenRepo,
      new ZonaRepository(cli),
      new OrdenHistorialService(
        ordenRepo,
        new OrdenHistorialRepository(cli),
        new OrdenDiaRepartoCambioRepository(cli),
        new OrdenTraspasoRepository(cli),
      ),
    ),
  };
}

function peticion(paso: Paso): Request {
  let cuerpo: string;
  if (paso.cuerpoTexto !== undefined) cuerpo = paso.cuerpoTexto;
  else if (paso.ordenesRepetidas !== undefined) {
    const { veces, fila } = paso.ordenesRepetidas;
    cuerpo = JSON.stringify({ ...(paso.cuerpo as object | undefined), ordenes: Array.from({ length: veces }, () => fila) });
  } else cuerpo = JSON.stringify(paso.cuerpo);
  return new Request(`http://localhost/api/ordenes/api-key/${paso.ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer svl_contratov1000000000000" },
    body: cuerpo,
  });
}

async function ejecutar(base: PrismaClient, p: Payload): Promise<RespuestaDePaso[]> {
  return enTransaccionRevertida(base, async (tx) => {
    const s = await sembrar(tx, escenarioDe(p));
    const autenticar: AutenticadorApiKey = async () => ({
      status: "ok",
      actor: { usuarioId: s.tiendaId, rol: "apiKey" },
      apiKeyId: "contrato-v1",
      organizacionId: s.organizacionId,
    });
    await comoApp(tx, s.organizacionId);
    try {
      const cli = clienteConSavepoint(tx);
      const salida: RespuestaDePaso[] = [];
      for (const paso of p.pasos) {
        const res =
          paso.ruta === "carga"
            ? await handleCargaApi(peticion(paso), depsDeCarga(cli, autenticar))
            : await handleCotizacionApi(peticion(paso), {
                autenticar,
                cotizacionService: new CotizacionOrdenService(new OrdenRepository(cli), new TarifaVigenteRepository(cli)),
              });
        salida.push({ ruta: paso.ruta, status: res.status, cuerpo: (await res.json()) as unknown });
      }
      return salida;
    } finally {
      await tx.$executeRawUnsafe("RESET ROLE");
    }
  });
}

// ── la suite ───────────────────────────────────────────────────────────────────────────────────

// Los 11 mensajes de `resolveGeo` (R3). Cada uno debe estar en el codigo de hoy y en al menos una
// respuesta grabada: si un payload deja de producir uno, la suite deja de cubrirlo y lo dice.
const MENSAJES_V1: { fuente: string; enRespuesta: RegExp }[] = [
  { fuente: '"provincia ambigua"', enRespuesta: /"provincia ambigua"/ },
  { fuente: '"provincia no encontrada"', enRespuesta: /"provincia no encontrada"/ },
  { fuente: '"la provincia esta retirada del catalogo"', enRespuesta: /"la provincia esta retirada del catalogo"/ },
  { fuente: '"canton ambiguo en la provincia"', enRespuesta: /"canton ambiguo en la provincia"/ },
  { fuente: '"canton no encontrado en la provincia"', enRespuesta: /"canton no encontrado en la provincia"/ },
  { fuente: '"el canton esta retirado del catalogo"', enRespuesta: /"el canton esta retirado del catalogo"/ },
  {
    fuente: '"distrito requerido: la zona de la orden se deriva del distrito"',
    enRespuesta: /"distrito requerido: la zona de la orden se deriva del distrito"/,
  },
  { fuente: '"distrito ambiguo en el canton"', enRespuesta: /"distrito ambiguo en el canton"/ },
  { fuente: '"distrito no encontrado en el canton"', enRespuesta: /"distrito no encontrado en el canton"/ },
  { fuente: "`el distrito '${nombre}' esta retirado del catalogo`", enRespuesta: /"el distrito '[^']+' esta retirado del catalogo"/ },
  {
    fuente: "`el distrito '${raw.distrito.trim()}' no tiene zona asignada`",
    enRespuesta: /"el distrito '[^']+' no tiene zona asignada"/,
  },
];

describe("SLT-45 R9 — los fixtures del contrato de v1", () => {
  it("BASE es el sha de un commit", () => {
    expect(fs.readFileSync(path.join(DIR, "BASE"), "utf8").trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it("los ids son unicos entre sinteticos y reales, y cada payload tiene al menos un paso", () => {
    expect(SINTETICOS.length).toBeGreaterThan(0);
    const ids = TODOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of TODOS) {
      expect(p.id, "id con caracteres de nombre de archivo").toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(p.pasos.length, `${p.id} sin pasos`).toBeGreaterThan(0);
    }
  });

  it("reporta cuantos payloads reales hay (0 hasta la puerta de release T9)", () => {
    console.info(`[contrato-v1] ${SINTETICOS.length} payloads sinteticos, ${REALES.length} payloads reales`);
    expect(Array.isArray(REALES)).toBe(true);
  });

  it.skipIf(GRABAR)("cada payload tiene su respuesta grabada y no hay respuestas huerfanas", () => {
    const grabadas = fs.existsSync(DIR_RESPUESTAS)
      ? fs.readdirSync(DIR_RESPUESTAS).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length))
      : [];
    const sinRespuesta = TODOS.map((p) => p.id).filter((id) => !grabadas.includes(id));
    const huerfanas = grabadas.filter((id) => !TODOS.some((p) => p.id === id));
    expect(sinRespuesta, "payloads sin respuesta grabada").toEqual([]);
    expect(huerfanas, "respuestas sin payload").toEqual([]);
  });

  it.skipIf(GRABAR)("R3: los 11 mensajes de resolveGeo estan en el codigo y en al menos una respuesta grabada", () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "lib", "services", "geo-resolucion.ts"), "utf8");
    const respuestas = SINTETICOS.filter((p) => fs.existsSync(archivoDeRespuesta(p.id)))
      .map((p) => fs.readFileSync(archivoDeRespuesta(p.id), "utf8"))
      .join("\n");
    expect(MENSAJES_V1).toHaveLength(11);
    for (const m of MENSAJES_V1) {
      expect(fuente, `geo-resolucion.ts ya no tiene ${m.fuente}`).toContain(m.fuente);
      expect(respuestas, `ninguna respuesta grabada trae ${m.fuente}`).toMatch(m.enRespuesta);
    }
  });
});

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("SLT-45 R2, R9 — v1 responde lo mismo que en BASE (Postgres real)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
    if (GRABAR) fs.mkdirSync(DIR_RESPUESTAS, { recursive: true });
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  for (const p of TODOS) {
    it(`${p.id}: mismo status y cuerpo que la respuesta grabada`, async () => {
      const normalizador = new Normalizador();
      const pasos = (await ejecutar(base, p)).map((r) => ({ ...r, cuerpo: normalizador.normalizar(r.cuerpo) }));
      const actual = serializar(p.id, pasos);
      const archivo = archivoDeRespuesta(p.id);
      if (GRABAR) {
        fs.writeFileSync(archivo, actual, "utf8");
        return;
      }
      expect(fs.existsSync(archivo), `${p.id} no tiene respuesta grabada en respuestas/ (R9)`).toBe(true);
      expect(actual).toBe(fs.readFileSync(archivo, "utf8"));
    }, 120_000);
  }
});
