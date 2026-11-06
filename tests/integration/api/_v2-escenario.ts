import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import type { CargaApiDeps } from "@/app/api/ordenes/api-key/carga/route";
import type { ConsultaOrdenApiDeps } from "@/app/api/ordenes/api-key/orden/[id]/route";
import { etiquetasConfig } from "@/lib/config/etiquetas";
import type { AutenticadorApiKey } from "@/lib/api/api-key-request";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IGeografiaApiService } from "@/lib/interfaces/services/IGeografiaApiService";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CupoPlanRepository } from "@/lib/repositories/CupoPlanRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { ApiOrdenLecturaService } from "@/lib/services/ApiOrdenLecturaService";
import { ApiOrdenResolucionService } from "@/lib/services/ApiOrdenResolucionService";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { CotizacionOrdenService } from "@/lib/services/CotizacionOrdenService";
import { EtiquetaGuiaService } from "@/lib/services/EtiquetaGuiaService";
import { EtiquetasDescargaService } from "@/lib/services/EtiquetasDescargaService";
import { EtiquetasLotePdfService } from "@/lib/services/EtiquetasLotePdfService";
import { GeografiaApiService } from "@/lib/services/GeografiaApiService";
import { ManifiestoService } from "@/lib/services/ManifiestoService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { comoApp, datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  clienteConSavepoint,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "../db/_postgres-real";

// SLT-45 T5 — la siembra y los bordes compuestos de las suites de rutas de v2.
//
// NO es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.
//
// Es la MISMA siembra que `contrato-v1.route.test.ts` (empresa de CR con los modulos de ordenes,
// tienda `apiKey` de nombre fijo, `zona_1` central y `zona_2`, tarifas fijas sin tienda, la marca
// especial en Orosi y Cartago/Cartago/Carmen sin zona), para que v1 y v2 se comparen sobre la misma
// base. Aquel archivo no exporta sus helpers y esta congelado (R9), asi que se replican aqui y no se
// importan de alli. Lo real y lo sustituido es lo mismo que en el contrato: todo real con el rol de
// la app (`servi_app`, RLS) dentro de una transaccion que siempre se revierte, salvo la
// autenticacion de la key (devuelve la empresa y el actor sembrados, por el mismo
// `conEmpresaDeLaKey` de produccion), el Storage y la firma de URLs.

export const PAIS = "CR";

export type RutaNombres = string[];

export interface ZonaDelEscenario {
  nombre: string;
  esCentral: boolean;
  distritos: RutaNombres[];
}

export interface Escenario {
  zonas: ZonaDelEscenario[];
  especiales: RutaNombres[];
  /** Rutas de nombres exactos de nodos de CR que se marcan inactivos. */
  retirados: RutaNombres[];
  /** Nodos de CR que se insertan bajo la ruta `padre`. */
  nodosNuevos: { padre: RutaNombres; nombre: string; codigoOficial?: string; activo: boolean }[];
}

export const ESCENARIO_BASE: Escenario = {
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
  retirados: [],
  nodosNuevos: [],
};

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

/** El nodo de CR al final de la ruta de nombres exactos, desde la raiz. Lanza si no existe. */
export async function nodoPorRuta(tx: TxDeTest, ruta: RutaNombres): Promise<string> {
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

/** Una tienda `apiKey` activa. El nombre fijo es lo que el manifiesto imprime como origen. */
export async function crearTienda(tx: TxDeTest, nombre = "Tienda Contrato"): Promise<string> {
  const rol = await tx.rol.findUniqueOrThrow({ where: { value: "apiKey" }, select: { id: true } });
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const tienda = await tx.usuario.create({
    data: {
      nombre,
      primerApellido: "V1",
      email: `slt45-v2-${sufijo}@example.com`,
      telefono: "80000000",
      passwordHash: "x",
      cedula: `v2-${sufijo}`,
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      estado: "activo",
    },
    select: { id: true },
  });
  return tienda.id;
}

export interface Sembrado {
  organizacionId: string;
  tiendaId: string;
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
    await tx.tarifa.create({ data: { ...TARIFA_FIJA, zonaId: zona.id, tiendaId: null } });
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
      data: {
        paisId: PAIS,
        tipoId: tipo.id,
        padreId,
        profundidad,
        nombre: n.nombre,
        nombreNormalizado: "",
        codigoOficial: n.codigoOficial ?? null,
        activo: n.activo,
      },
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

export const urlsFirmadas: ISignedUrlProvider = {
  createSignedUrl: async (p) => `https://storage.test/${p}`,
  createSignedUrls: async (paths) => Object.fromEntries(paths.map((p) => [p, `https://storage.test/${p}`])),
};

/** Las dependencias de la carga (v1 y v2 comparten pipeline), como las arma su composition root. */
export function depsDeCarga(cli: PrismaClient, autenticar: AutenticadorApiKey): CargaApiDeps {
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
    bulkService: new BulkOrdenService(
      ordenRepo,
      new TarifaVigenteRepository(cli),
      undefined,
      new CupoPlanRepository(cli),
      new CatalogoGeograficoRepository(cli),
    ),
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

/** El servicio de cotizacion como lo arma `buildCotizacionService`. */
export function cotizacionServiceDe(cli: PrismaClient): CotizacionOrdenService {
  return new CotizacionOrdenService(
    new OrdenRepository(cli),
    new TarifaVigenteRepository(cli),
    new CatalogoGeograficoRepository(cli),
  );
}

/** Las dependencias de la consulta de v1, como las arma su composition root (`buildDetallePorOrdenId`). */
export function depsDeConsulta(cli: PrismaClient, autenticar: AutenticadorApiKey): ConsultaOrdenApiDeps {
  const repo = new OrdenRepository(cli);
  const lectura = new ApiOrdenLecturaService(repo, urlsFirmadas, new TarifaVigenteRepository(cli));
  return {
    autenticar,
    resolucionService: new ApiOrdenResolucionService(repo),
    detallePorOrdenId: (actor, ordenId) => lectura.detallePorOrdenId(actor, ordenId),
  };
}

/** El servicio de geografia de v2 como lo arma la ruta `GET /api/v2/ordenes/{id}`. */
export function geografiaServiceDe(cli: PrismaClient): IGeografiaApiService {
  return new GeografiaApiService(new CatalogoGeograficoRepository(cli), new PaisRepository(cli), new OrdenRepository(cli));
}

// ── la transaccion de cada caso ────────────────────────────────────────────────────────────────

export interface Contexto extends Sembrado {
  tx: TxDeTest;
  cli: PrismaClient;
  /** El autenticador de la key: la empresa y la tienda sembradas. */
  autenticar: AutenticadorApiKey;
}

/**
 * Siembra el escenario (como dueño), baja al rol de la app con la empresa sembrada y corre `fn`.
 * `antesDeBajar` corre todavia como dueño, para sembrar lo que la app no puede escribir.
 */
export async function conEscenario<T>(
  base: PrismaClient,
  cambios: Partial<Escenario>,
  fn: (c: Contexto) => Promise<T>,
  antesDeBajar?: (tx: TxDeTest, s: Sembrado) => Promise<void>,
): Promise<T> {
  return enTransaccionRevertida(base, async (tx) => {
    const s = await sembrar(tx, { ...ESCENARIO_BASE, ...cambios });
    if (antesDeBajar) await antesDeBajar(tx, s);
    const autenticar: AutenticadorApiKey = async () => ({
      status: "ok",
      actor: { usuarioId: s.tiendaId, rol: "apiKey" },
      apiKeyId: "slt45-v2",
      organizacionId: s.organizacionId,
    });
    await comoApp(tx, s.organizacionId);
    try {
      return await fn({ ...s, tx, cli: clienteConSavepoint(tx), autenticar });
    } finally {
      await tx.$executeRawUnsafe("RESET ROLE");
    }
  });
}

/** El autenticador de una key de `organizacionId` cuyo dueño es `tiendaId`. */
export function autenticadorDe(organizacionId: string, tiendaId: string, apiKeyId = "slt45-v2"): AutenticadorApiKey {
  return async () => ({ status: "ok", actor: { usuarioId: tiendaId, rol: "apiKey" }, apiKeyId, organizacionId });
}

// ── peticiones y comparacion ───────────────────────────────────────────────────────────────────

export const BEARER = "svl_slt45v2000000000000000";

export function post(url: string, cuerpo: unknown, bearer: string | null = BEARER): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer !== null) headers.Authorization = `Bearer ${bearer}`;
  return new Request(`http://localhost${url}`, { method: "POST", headers, body: JSON.stringify(cuerpo) });
}

export function get(url: string, bearer: string | null = BEARER): Request {
  const headers: Record<string, string> = {};
  if (bearer !== null) headers.Authorization = `Bearer ${bearer}`;
  return new Request(`http://localhost${url}`, { method: "GET", headers });
}

/** Quita la clave `ubicacion` a cada elemento de `lista` (lo unico que v2 añade). */
export function sinUbicacion<T extends Record<string, unknown>>(lista: T[]): Omit<T, "ubicacion">[] {
  return lista.map((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "ubicacion")) as Omit<T, "ubicacion">);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const CLAVES_VOLATILES = new Set(["numGuia", "cargaId", "url", "downloadUrl"]);

/**
 * La misma lista cerrada de volatiles que el contrato de v1 (design §7.3): cada valor distinto pasa
 * a `<tipo#k>` por orden de aparicion, asi que dos respuestas de dos transacciones se comparan byte
 * a byte sin perder que valores son iguales entre si. Una instancia por respuesta.
 */
export function normalizarVolatiles(valor: unknown): unknown {
  const tokens = new Map<string, string>();
  const contadores = new Map<string, number>();
  const token = (tipo: string, v: unknown): string => {
    const clave = JSON.stringify(v);
    const existente = tokens.get(clave);
    if (existente !== undefined) return existente;
    const k = (contadores.get(tipo) ?? 0) + 1;
    contadores.set(tipo, k);
    const t = `<${tipo}#${k}>`;
    tokens.set(clave, t);
    return t;
  };
  const recorrer = (v: unknown, clave?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => recorrer(x));
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorrer(x, k)]));
    }
    if (v === null || v === undefined) return v;
    if (clave !== undefined && CLAVES_VOLATILES.has(clave)) return token(clave, v);
    if (typeof v === "string" && UUID.test(v)) return token("uuid", v);
    if (typeof v === "string" && FECHA_ISO.test(v)) return token("fecha", v);
    return v;
  };
  return recorrer(valor);
}

/** La ruta publica (R21) que se espera para una ruta de nombres de CR, leida de la base. */
export async function rutaEsperada(
  tx: TxDeTest,
  ruta: RutaNombres,
): Promise<{ profundidad: number; id: string; nombre: string; codigoOficial: string | null; tipo: { clave: string; nombre: string } }[]> {
  const salida = [];
  for (let i = 1; i <= ruta.length; i++) {
    const id = await nodoPorRuta(tx, ruta.slice(0, i));
    const n = await tx.nodoGeografico.findUniqueOrThrow({
      where: { id },
      select: { profundidad: true, nombre: true, codigoOficial: true, tipo: { select: { clave: true, nombreSingular: true } } },
    });
    salida.push({
      profundidad: n.profundidad,
      id,
      nombre: n.nombre,
      codigoOficial: n.codigoOficial,
      tipo: { clave: n.tipo.clave, nombre: n.tipo.nombreSingular },
    });
  }
  return salida;
}
