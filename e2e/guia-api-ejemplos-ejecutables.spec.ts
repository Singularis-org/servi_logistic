import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { firmarWebhook } from "../lib/crypto/webhook-firma";
import { hashApiKey } from "../lib/utils/api-key-hash";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { altaDeEmpresa, clienteDueno, sembrarDatos, type DatosSembrados, type Empresa } from "./_dos-empresas-fixture";

// SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte».
//
// La guía de integración y la colección de Postman se EJECUTAN contra la aplicación real
// (`next start` + el doble de Storage del E2E), con una base local y claves sembradas aquí:
//
// 1. Cada `curl` de la guía se parsea del `.md`, se cambia la URL de producción por la del servidor
//    local y la clave de ejemplo por una real, y se compara la respuesta con el bloque `json` que la
//    guía pone debajo: el mismo código HTTP y la misma forma (cada clave documentada existe con el
//    mismo tipo y no llega ninguna clave sin documentar).
// 2. Cada petición de la colección de Postman se arma desde el JSON (variables, query activa, cuerpo,
//    `Authorization` de la colección) y corre con sus propios scripts de test, con un `pm` mínimo.
// 3. Dos empresas con su clave cada una contra la MISMA URL: la B no ve, no cancela, no borra, no
//    imprime y no cuenta en su analítica lo que creó la A (sección 3.7 de la guía).
// 4. El ejemplo de firma de webhook de la sección 6.3 se recalcula con el firmador real.
//
// Los identificadores de ejemplo de la guía (guía 100234 y 100235, el `cargaId`) se sustituyen por
// los reales que devuelve la carga. Los estados que un ejemplo necesita (una orden en reparto para el
// listado, en bodega para eliminar, en ruta a bodega para cancelar) se fijan en la base justo antes de
// ese ejemplo: el canal por API no tiene forma de mover el paquete físicamente.

const RAIZ = path.join(__dirname, "..");
const GUIA = path.join(RAIZ, "docs", "ayuda", "oficina", "guia-integracion-api.md");
const POSTMAN = path.join(RAIZ, "docs", "api", "servi-logistic-api-key.postman_collection.json");

/** La base que escriben los tres artefactos. Literal: es lo que se sustituye por el servidor local. */
const URL_PRODUCCION = "https://www.servilogistic.co";
/** La clave de ejemplo de la guía. */
const CLAVE_EJEMPLO = "svl_XXXXXXXXXXXX";
const GUIA_EJEMPLO_1 = "100234";
const GUIA_EJEMPLO_2 = "100235";
const CARGA_EJEMPLO = "9c2b7f10-5d3a-4e21-9a4b-77c8e0f1a2b3";

/* -------------------------------------------------------------------------- */
/* Parseo de la guía                                                           */
/* -------------------------------------------------------------------------- */

interface Bloque {
  lenguaje: string;
  texto: string;
  /** Línea de apertura (1-based), para los mensajes. */
  linea: number;
}

function bloquesDeCodigo(md: string): { bloques: Bloque[]; lineas: string[] } {
  const lineas = md.split(/\r?\n/);
  const bloques: Bloque[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const apertura = /^```\s*(\S*)\s*$/.exec(lineas[i]);
    if (!apertura) continue;
    const inicio = i;
    const cuerpo: string[] = [];
    i++;
    while (i < lineas.length && !/^```\s*$/.test(lineas[i])) cuerpo.push(lineas[i++]);
    bloques.push({ lenguaje: apertura[1], texto: cuerpo.join("\n"), linea: inicio + 1 });
  }
  return { bloques, lineas };
}

interface Curl {
  metodo: string;
  url: string;
  headers: Record<string, string>;
  cuerpo?: string;
}

/** Tokeniza una línea de shell con comillas simples y dobles, sin expansión. */
function tokens(linea: string): string[] {
  const out: string[] = [];
  let actual = "";
  let comilla: "'" | '"' | null = null;
  let hay = false;
  for (const c of linea) {
    if (comilla) {
      if (c === comilla) comilla = null;
      else actual += c;
    } else if (c === "'" || c === '"') {
      comilla = c;
      hay = true;
    } else if (/\s/.test(c)) {
      if (hay || actual) out.push(actual);
      actual = "";
      hay = false;
    } else {
      actual += c;
      hay = true;
    }
  }
  if (comilla) throw new Error(`comilla sin cerrar en: ${linea}`);
  if (hay || actual) out.push(actual);
  return out;
}

export function parsearCurl(texto: string): Curl {
  const unido = texto.replace(/\\\r?\n/g, " ");
  const t = tokens(unido);
  if (t[0] !== "curl") throw new Error(`no empieza por curl: ${texto}`);
  let metodo = "GET";
  let url = "";
  const headers: Record<string, string> = {};
  let cuerpo: string | undefined;
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    if (a === "-X") metodo = t[++i];
    else if (a === "-H") {
      const h = t[++i];
      const p = h.indexOf(":");
      headers[h.slice(0, p).trim()] = h.slice(p + 1).trim();
    } else if (a === "-d" || a === "--data" || a === "--data-raw") {
      cuerpo = t[++i];
      if (metodo === "GET") metodo = "POST";
    } else if (!a.startsWith("-")) url = a;
    else throw new Error(`opción de curl no soportada por el ejecutor: ${a}`);
  }
  return { metodo, url, headers, cuerpo };
}

interface Ejemplo {
  curl: Curl;
  /** La respuesta documentada; `undefined` si la guía no pone ninguna debajo. */
  respuesta?: unknown;
  status: number;
  linea: number;
}

/** Cada `curl` de la guía con el `json` que lo sigue antes del siguiente `curl` o del siguiente título. */
function ejemplosDeLaGuia(md: string): Ejemplo[] {
  const { bloques, lineas } = bloquesDeCodigo(md);
  const out: Ejemplo[] = [];
  bloques.forEach((b, i) => {
    if (b.lenguaje !== "bash" || !b.texto.trimStart().startsWith("curl")) return;
    const siguiente = bloques.slice(i + 1).find((x) => x.lenguaje === "bash" || x.lenguaje === "json");
    let respuesta: unknown;
    let status = 200;
    if (siguiente?.lenguaje === "json") {
      const entre = lineas.slice(b.linea, siguiente.linea - 1);
      if (!entre.some((l) => /^#{1,2} /.test(l))) {
        respuesta = JSON.parse(siguiente.texto);
        const titulo = entre.find((l) => /^### Response `\d{3}`/.test(l));
        if (titulo) status = Number(/`(\d{3})`/.exec(titulo)![1]);
      }
    }
    out.push({ curl: parsearCurl(b.texto), respuesta, status, linea: b.linea });
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* Comparación de forma                                                        */
/* -------------------------------------------------------------------------- */

function tipo(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Diferencias de FORMA entre lo documentado y lo recibido. `null` en cualquiera de los dos lados no
 * se compara (la guía documenta campos que pueden ser `null`); un objeto documentado con la clave
 * `"..."` es un marcador «aquí van más cosas» y no se compara por dentro.
 */
export function diferenciasDeForma(doc: unknown, real: unknown, ruta = "$"): string[] {
  if (doc === null || real === null) return [];
  if (tipo(doc) !== tipo(real)) return [`${ruta}: la guía dice ${tipo(doc)} y llega ${tipo(real)}`];
  if (Array.isArray(doc) && Array.isArray(real)) {
    if (doc.length === 0 || real.length === 0) return [];
    return diferenciasDeForma(doc[0], real[0], `${ruta}[0]`);
  }
  if (tipo(doc) !== "object") return [];
  const d = doc as Record<string, unknown>;
  const r = real as Record<string, unknown>;
  if ("..." in d) return [];
  const out: string[] = [];
  for (const k of Object.keys(d)) {
    if (!(k in r)) out.push(`${ruta}.${k}: documentada y no llega`);
    else out.push(...diferenciasDeForma(d[k], r[k], `${ruta}.${k}`));
  }
  for (const k of Object.keys(r)) if (!(k in d)) out.push(`${ruta}.${k}: llega y no está documentada`);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Datos                                                                       */
/* -------------------------------------------------------------------------- */

interface EmpresaConClave {
  empresa: Empresa;
  datos: DatosSembrados;
  clave: string;
}

async function conEmpresa<T>(dueno: PrismaClient, organizacionId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    return fn(tx as unknown as PrismaClient);
  });
}

/** Alta de una empresa con sus datos y una API key cuyo secreto conocemos. */
async function empresaConClave(
  dueno: PrismaClient,
  letra: "A" | "B",
  opciones: { fulfillment?: boolean } = {},
): Promise<EmpresaConClave> {
  const { empresa } = await altaDeEmpresa(letra, `slt208-${letra.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`);
  const datos = await sembrarDatos(dueno, empresa);
  if (opciones.fulfillment) {
    // SLT-94: sin la marca «se recoge en tienda», el paquete ya está en la bodega (fulfillment): la
    // orden nace en `en_preparacion` y sin guía.
    await conEmpresa(dueno, empresa.organizacionId, (tx) =>
      tx.usuario.update({ where: { id: datos.tiendaId }, data: { seRecogeEnTienda: false } }),
    );
  }
  const clave = `svl_${randomBytes(32).toString("base64url")}`;
  await conEmpresa(dueno, empresa.organizacionId, async (tx) => {
    const n = await tx.apiKey.updateMany({
      where: { identificador: datos.marcadores.apiKey },
      data: { keyHash: hashApiKey(clave), keyPrefix: clave.slice(0, 12) },
    });
    if (n.count !== 1) throw new Error(`SLT-208: no se pudo fijar la clave de ${letra}`);
  });
  return { empresa, datos, clave };
}

/** Enlaza distritos del catálogo a la zona sembrada, para que la carga los tarife. */
async function enlazarDistritos(dueno: PrismaClient, e: EmpresaConClave, geos: [string, string, string][]): Promise<void> {
  for (const [provincia, canton, nombre] of geos) {
    const d = await dueno.distrito.findFirst({
      where: { nombre, canton: { nombre: canton, provincia: { nombre: provincia } } },
      select: { id: true },
    });
    if (!d) throw new Error(`SLT-208: falta el distrito ${provincia}/${canton}/${nombre} en el catálogo`);
    await conEmpresa(dueno, e.empresa.organizacionId, (tx) =>
      tx.zonaDistrito.create({ data: { zonaId: e.datos.zonaId, distritoId: d.id } }),
    );
  }
}

/** Fija el estado de una orden (y opcionalmente su fecha de creación) por su remisión. */
async function fijarEstado(
  dueno: PrismaClient,
  e: EmpresaConClave,
  numRemision: string,
  estado: string,
  createdAt?: Date,
): Promise<void> {
  const estatus = await dueno.orderStatus.findUnique({ where: { value: estado }, select: { id: true } });
  if (!estatus) throw new Error(`SLT-208: no existe el estado ${estado}`);
  const n = await conEmpresa(dueno, e.empresa.organizacionId, (tx) =>
    tx.orden.updateMany({
      where: { numRemision, tiendaId: e.datos.tiendaId, deletedAt: null },
      data: { estatusId: estatus.id, ...(createdAt ? { createdAt } : {}) },
    }),
  );
  if (n.count !== 1) throw new Error(`SLT-208: no se pudo fijar ${estado} en ${numRemision} (${n.count} filas)`);
}

async function estadoDe(dueno: PrismaClient, e: EmpresaConClave, numRemision: string): Promise<string | undefined> {
  const o = await conEmpresa(dueno, e.empresa.organizacionId, (tx) =>
    tx.orden.findFirst({ where: { numRemision, tiendaId: e.datos.tiendaId }, select: { estatus: { select: { value: true } } } }),
  );
  return o?.estatus.value;
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                        */
/* -------------------------------------------------------------------------- */

interface Respuesta {
  status: number;
  json: unknown;
  texto: string;
}

async function llamar(
  base: string,
  metodo: string,
  ruta: string,
  clave: string | null,
  cuerpo?: unknown,
): Promise<Respuesta> {
  const headers: Record<string, string> = {};
  if (clave !== null) headers.Authorization = `Bearer ${clave}`;
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  return { status: r.status, json, texto };
}

/** La fecha de hoy en Costa Rica (las empresas del E2E viven allí), `YYYY-MM-DD`. */
function hoyCR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
}

async function ordenesCreadasHoy(base: string, clave: string): Promise<number> {
  const hoy = hoyCR();
  const r = await llamar(base, "GET", `/api/ordenes/api-key/analitica?metricas=ordenes_creadas&desde=${hoy}&hasta=${hoy}`, clave);
  expect(r.status, `analítica: ${r.texto}`).toBe(200);
  const serie = (r.json as { metricas: { metrica: string; data: { valor: number | null }[] }[] }).metricas[0];
  expect(serie.metrica).toBe("ordenes_creadas");
  return serie.data.reduce((s, p) => s + (p.valor ?? 0), 0);
}

/* -------------------------------------------------------------------------- */
/* Postman                                                                     */
/* -------------------------------------------------------------------------- */

interface ItemPostman {
  name: string;
  event?: { listen: string; script: { exec: string[] } }[];
  request: {
    method: string;
    header: { key: string; value: string }[];
    url: { host: string[]; path: string[]; query?: { key: string; value: string; disabled?: boolean }[] };
    body?: { mode: string; raw: string };
  };
}

interface ColeccionPostman {
  auth: { type: string; bearer: { key: string; value: string }[] };
  variable: { key: string; value: string }[];
  item: ItemPostman[];
}

/** Un `expect` de chai con lo justo que usan los scripts de la colección; lo demás lanza. */
function chaiMinimo(valor: unknown) {
  const fallo = (msg: string) => {
    throw new Error(msg);
  };
  const cadena = {
    eql: (otro: unknown) => {
      if (JSON.stringify(valor) !== JSON.stringify(otro)) fallo(`${JSON.stringify(valor)} no es igual a ${JSON.stringify(otro)}`);
    },
    include: (x: unknown) => {
      if (!Array.isArray(valor) || !valor.includes(x)) fallo(`${JSON.stringify(valor)} no incluye ${JSON.stringify(x)}`);
    },
    a: (t: string) => {
      if (typeof valor !== t) fallo(`${JSON.stringify(valor)} no es ${t}`);
    },
    an: (t: string) => {
      if (t === "array" ? !Array.isArray(valor) : typeof valor !== t) fallo(`${JSON.stringify(valor)} no es ${t}`);
    },
    at: {
      most: (n: unknown) => {
        if (typeof n !== "number" || typeof valor !== "number" || valor > n) fallo(`${String(valor)} no es como mucho ${String(n)}`);
      },
    },
    property: (k: string) => {
      if (valor === null || typeof valor !== "object" || !(k in valor)) fallo(`falta la propiedad ${k}`);
    },
    all: {
      keys: (...ks: string[]) => {
        const reales = Object.keys(valor as object).sort();
        if (JSON.stringify(reales) !== JSON.stringify([...ks].sort())) fallo(`claves ${reales.join(",")} y no ${ks.join(",")}`);
      },
    },
  };
  return { to: { ...cadena, be: cadena, have: cadena } };
}

interface Corrida {
  /** `true` si el script previo de la petición la omitió (`pm.execution.skipRequest()`). */
  omitida: boolean;
  status: number;
  json: unknown;
  pruebas: { nombre: string; error?: string }[];
}

async function correrItem(
  base: string,
  coleccion: ColeccionPostman,
  variables: Map<string, string>,
  item: ItemPostman,
  marca: string,
): Promise<Corrida> {
  const sustituir = (s: string) =>
    s.replace(/\{\{\$timestamp\}\}/g, marca).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
      if (!variables.has(k)) throw new Error(`variable de Postman sin definir: ${k}`);
      return variables.get(k)!;
    });
  // Script previo (`prerequest`): puede leer variables y omitir la petición, como en Postman.
  let omitida = false;
  const previo = item.event?.find((e) => e.listen === "prerequest")?.script.exec.join("\n");
  if (previo) {
    const pmPrevio = {
      collectionVariables: { get: (k: string) => variables.get(k) },
      execution: { skipRequest: () => (omitida = true) },
    };
    new Function("pm", "console", previo)(pmPrevio, { log: () => undefined });
  }
  if (omitida) return { omitida, status: 0, json: null, pruebas: [] };

  const req = item.request;
  const host = sustituir(req.url.host.join("."));
  const ruta = req.url.path.map((p) => encodeURIComponent(sustituir(p))).join("/");
  const query = (req.url.query ?? [])
    .filter((q) => !q.disabled)
    .map((q) => `${encodeURIComponent(q.key)}=${encodeURIComponent(sustituir(q.value))}`)
    .join("&");
  const url = `${host}/${ruta}${query ? `?${query}` : ""}`;
  expect(url.startsWith(base), `«${item.name}» no usa {{baseUrl}}`).toBe(true);
  const headers: Record<string, string> = {};
  for (const h of req.header) headers[h.key] = sustituir(h.value);
  expect(coleccion.auth.type).toBe("bearer");
  headers.Authorization = `Bearer ${sustituir(coleccion.auth.bearer.find((b) => b.key === "token")!.value)}`;
  const r = await fetch(url, {
    method: req.method,
    headers,
    body: req.body?.mode === "raw" ? sustituir(req.body.raw) : undefined,
  });
  const texto = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }

  const pruebas: Corrida["pruebas"] = [];
  const pm = {
    test: (nombre: string, fn: () => void) => {
      try {
        fn();
        pruebas.push({ nombre });
      } catch (e) {
        pruebas.push({ nombre, error: (e as Error).message });
      }
    },
    expect: chaiMinimo,
    response: {
      code: r.status,
      json: () => json,
      to: {
        have: {
          status: (n: number) => {
            if (r.status !== n) throw new Error(`status ${r.status} y no ${n}: ${texto.slice(0, 300)}`);
          },
        },
      },
    },
    collectionVariables: {
      get: (k: string) => variables.get(k),
      set: (k: string, v: string) => variables.set(k, String(v)),
    },
  };
  const script = item.event?.find((e) => e.listen === "test")?.script.exec.join("\n");
  if (script) {
    const consola = { log: () => undefined };
    new Function("pm", "console", script)(pm, consola);
  }
  return { omitida, status: r.status, json, pruebas };
}

/* -------------------------------------------------------------------------- */
/* Los casos                                                                   */
/* -------------------------------------------------------------------------- */

test.describe.serial("SLT-208 — la guía, Postman y el aislamiento entre empresas, contra la app real", () => {
  let dueno: PrismaClient;
  let a: EmpresaConClave;
  let b: EmpresaConClave;
  /** Tercera empresa, con fulfillment: la colección de Postman tiene que valerle igual. */
  let c: EmpresaConClave;
  let base: string;
  let creadasHoyB0 = 0;
  let creadasHoyA0 = 0;

  test.beforeAll(async ({ baseURL }) => {
    if (!baseURL) throw new Error("SLT-208: falta baseURL en playwright.config.ts");
    base = baseURL.replace(/\/$/, "");
    dueno = clienteDueno();
    a = await empresaConClave(dueno, "A");
    b = await empresaConClave(dueno, "B");
    c = await empresaConClave(dueno, "B", { fulfillment: true });
    for (const e of [a, c]) {
      await enlazarDistritos(dueno, e, [
        ["San José", "San José", "Carmen"],
        ["Alajuela", "Alajuela", "Alajuela"],
      ]);
    }
    creadasHoyA0 = await ordenesCreadasHoy(base, a.clave);
    creadasHoyB0 = await ordenesCreadasHoy(base, b.clave);
  });

  test.afterAll(async () => {
    await dueno?.$disconnect();
  });

  test("cada curl de la guía responde con el código y la forma que la guía documenta", async () => {
    test.setTimeout(240_000);
    const md = fs.readFileSync(GUIA, "utf8");
    const ejemplos = ejemplosDeLaGuia(md);
    // Control positivo: si el parser deja de ver los ejemplos, esto se pone rojo antes de dar nada por bueno.
    expect(ejemplos.length, "SLT-208: número de curl ejecutables de la guía").toBe(11);
    for (const ej of ejemplos) {
      expect(ej.curl.url.startsWith(`${URL_PRODUCCION}/`), `línea ${ej.linea}: la URL no es la de producción`).toBe(true);
      expect(ej.curl.headers.Authorization, `línea ${ej.linea}: sin Authorization`).toBe(`Bearer ${CLAVE_EJEMPLO}`);
      expect(ej.respuesta, `línea ${ej.linea}: el curl no tiene respuesta documentada debajo`).toBeDefined();
    }

    // La orden del ejemplo de cancelación (guía 100235) se crea aparte: la carga de la guía deja la
    // segunda fila en `errores` a propósito.
    const otra = await llamar(base, "POST", "/api/ordenes/api-key/carga", a.clave, {
      ordenes: [
        {
          num_remision: "REM-0003",
          destinatario: "Ana Mora",
          telefono: "88880003",
          provincia: "San José",
          canton: "San José",
          distrito: "Carmen",
          producto: "Libro",
        },
      ],
    });
    expect(otra.status, otra.texto).toBe(200);
    const guia2 = String((otra.json as { filas: { numGuia: number }[] }).filas[0].numGuia);

    const sustituciones = new Map<string, string>([[GUIA_EJEMPLO_2, guia2]]);
    const ejecutados: string[] = [];

    for (const ej of ejemplos) {
      const { curl } = ej;
      const reemplazar = (s: string) => {
        let out = s.split(URL_PRODUCCION).join(base).split(CLAVE_EJEMPLO).join(a.clave);
        for (const [de, a_] of sustituciones) out = out.split(de).join(a_);
        return out;
      };
      const ruta = new URL(curl.url).pathname;

      // Lo que el ejemplo necesita del mundo físico, fijado en la base.
      if (curl.metodo === "GET" && ruta === "/api/ordenes/api-key" && curl.url.includes("estado=en_reparto")) {
        await fijarEstado(dueno, a, "REM-0001", "en_reparto", new Date("2026-09-20T14:03:11.000Z"));
      }
      if (curl.metodo === "DELETE") await fijarEstado(dueno, a, "REM-0001", "en_bodega_central");
      if (curl.metodo === "PUT" && ruta.endsWith("/cancelar")) await fijarEstado(dueno, a, "REM-0003", "en_ruta_bodega_central");

      const headers = Object.fromEntries(Object.entries(curl.headers).map(([k, v]) => [k, reemplazar(v)]));
      const url = reemplazar(curl.url);
      const r = await fetch(url, {
        method: curl.metodo,
        headers,
        body: curl.cuerpo === undefined ? undefined : reemplazar(curl.cuerpo),
      });
      const texto = await r.text();
      const etiqueta = `línea ${ej.linea}: ${curl.metodo} ${ruta}`;
      expect(r.status, `${etiqueta}: ${texto.slice(0, 500)}`).toBe(ej.status);
      const json = JSON.parse(texto) as Record<string, unknown>;
      expect(diferenciasDeForma(ej.respuesta, json), `${etiqueta}: la respuesta no tiene la forma documentada`).toEqual([]);

      // Lo que la carga devuelve alimenta a los ejemplos siguientes.
      if (curl.metodo === "POST" && ruta === "/api/ordenes/api-key/carga") {
        const doc = ej.respuesta as { creadas: number; conError: number; errores: { errores: unknown }[] };
        expect(json.creadas).toBe(doc.creadas);
        expect(json.conError).toBe(doc.conError);
        // El mensaje de error de fila es el que dice la guía, literal.
        expect((json.errores as { errores: unknown }[])[0].errores).toEqual(doc.errores[0].errores);
        const fila = (json.filas as { numRemision: string; numGuia: number }[])[0];
        expect(fila.numRemision).toBe("REM-0001");
        sustituciones.set(GUIA_EJEMPLO_1, String(fila.numGuia));
        expect(json.cargaId, "la carga creó una orden: el lote tiene id").toEqual(expect.any(String));
        sustituciones.set(CARGA_EJEMPLO, json.cargaId as string);
      }
      if (curl.metodo === "POST" && ruta === "/api/ordenes/api-key/cotizacion") {
        const doc = ej.respuesta as { cotizadas: number; errores: { errores: unknown }[] };
        expect(json.cotizadas).toBe(doc.cotizadas);
        expect((json.errores as { errores: unknown }[])[0].errores).toEqual(doc.errores[0].errores);
      }
      if (curl.metodo === "GET" && ruta === "/api/ordenes/api-key") {
        expect((json.items as unknown[]).length, "el listado del ejemplo tiene la orden en reparto").toBe(1);
      }
      if (curl.metodo === "PUT") {
        expect(json).toMatchObject({ estadoAnterior: "en_ruta_bodega_central", estado: "devolviendo_a_tienda" });
      }
      ejecutados.push(etiqueta);
    }
    expect(ejecutados).toHaveLength(11);
  });

  test("el ejemplo de firma de la sección 6.3 sale igual con el firmador real", async () => {
    const { bloques, lineas } = bloquesDeCodigo(fs.readFileSync(GUIA, "utf8"));
    const textoTras = (rotulo: string): string => {
      const i = lineas.findIndex((l) => l.startsWith(rotulo));
      expect(i, `la guía no tiene «${rotulo}»`).toBeGreaterThan(-1);
      const bloque = bloques.find((x) => x.linea > i + 1 && x.lenguaje === "text");
      return bloque!.texto.trim();
    };
    const secreto = textoTras("Secreto de la suscripción:");
    const timestamp = Number(textoTras("Header `X-Servi-Logistic-Timestamp`:"));
    const cuerpo = textoTras("Cuerpo crudo recibido");
    const firma = textoTras("Header `X-Servi-Logistic-Signature` que debe obtener:");
    expect(firma).toBe(`sha256=${firmarWebhook(secreto, timestamp, cuerpo)}`);
    // El cuerpo es JSON de una línea, como el que se entrega.
    expect(JSON.stringify(JSON.parse(cuerpo))).toBe(cuerpo);
  });

  for (const escenario of ["sin fulfillment", "con fulfillment"] as const) {
    test(`cada petición de la colección de Postman responde y pasa sus propios tests (tienda ${escenario})`, async () => {
      test.setTimeout(240_000);
      const e = escenario === "sin fulfillment" ? a : c;
      const coleccion = JSON.parse(fs.readFileSync(POSTMAN, "utf8")) as ColeccionPostman;
      const variables = new Map(coleccion.variable.map((v) => [v.key, v.value]));
      expect(variables.get("baseUrl")).toBe(URL_PRODUCCION);
      variables.set("baseUrl", base);
      variables.set("apiKey", e.clave);
      const marca = String(Date.now());
      expect(coleccion.item.length, "SLT-208: una petición por endpoint").toBe(10);

      const resultados: string[] = [];
      for (const item of coleccion.item) {
        // La cancelación necesita que el paquete esté en la bodega (sección 5.9 de la guía); con
        // fulfillment la orden no tiene guía y el script previo de la colección la omite.
        if (/Cancelar/.test(item.name) && escenario === "sin fulfillment") {
          await fijarEstado(dueno, e, variables.get("numRemision")!, "en_bodega_central");
        }
        const r = await correrItem(base, coleccion, variables, item, marca);
        if (r.omitida) {
          expect(`${escenario}: ${item.name}`, "solo se omite la cancelación de una orden sin guía").toBe(
            "con fulfillment: 9. Cancelar una orden",
          );
          resultados.push(`${item.name}: omitida`);
          continue;
        }
        expect(r.pruebas.length, `«${item.name}» no ejecutó ningún test`).toBeGreaterThan(0);
        expect(r.pruebas.filter((x) => x.error), `«${item.name}» (${r.status}): ${JSON.stringify(r.json).slice(0, 400)}`).toEqual([]);
        if (item.name.includes("Cargar")) {
          if (escenario === "sin fulfillment") expect(variables.get("numGuia"), "la carga deja la guía en variables").toMatch(/^\d+$/);
          else expect(variables.get("numGuia"), "con fulfillment la orden nace sin guía").toBe("");
          expect(variables.get("numRemisionDesechable"), "la carga deja la segunda remisión").not.toBe("");
        }
        if (item.name.includes("Listar")) {
          expect((r.json as { items: unknown[] }).items.length, "el listado trae la orden recién creada").toBeGreaterThan(0);
        }
        if (/Cancelar/.test(item.name)) expect(r.status).toBe(200);
        resultados.push(`${item.name}: ${r.status}`);
      }
      expect(resultados).toHaveLength(10);
    });
  }

  test("una clave de fila ausente y una vacía dan los dos mensajes que documenta la sección 5.1", async () => {
    const guia = fs.readFileSync(GUIA, "utf8");
    expect(guia).toContain("`telefono es obligatorio`");
    expect(guia).toContain("`Este campo es obligatorio`");
    const fila = { num_remision: `H2-${randomUUID().slice(0, 8)}`, destinatario: "Ana", provincia: "San José", canton: "San José", distrito: "Carmen", producto: "Caja" };
    const r = await llamar(base, "POST", "/api/ordenes/api-key/carga", a.clave, {
      ordenes: [fila, { ...fila, num_remision: `${fila.num_remision}-b`, telefono: "" }],
    });
    expect(r.status, r.texto).toBe(200);
    const errores = (r.json as { errores: { fila: number; errores: Record<string, string[]> }[] }).errores;
    expect(errores.map((x) => [x.fila, x.errores])).toEqual([
      [1, { telefono: ["Este campo es obligatorio"] }],
      [2, { telefono: ["telefono es obligatorio"] }],
    ]);
  });

  test("dos empresas, una URL: la clave B no ve ni toca la orden de la A, y su analítica no la cuenta", async () => {
    const rem = `AISLA-${randomUUID().slice(0, 8)}`;
    const creada = await llamar(base, "POST", "/api/ordenes/api-key/carga", a.clave, {
      ordenes: [
        { num_remision: rem, destinatario: "Ana", telefono: "88881234", provincia: "San José", canton: "San José", distrito: "Carmen", producto: "Caja" },
      ],
    });
    expect(creada.status, creada.texto).toBe(200);
    const cuerpo = creada.json as { filas: { numGuia: number }[]; cargaId: string };
    const guiaA = cuerpo.filas[0].numGuia;
    await fijarEstado(dueno, a, rem, "en_bodega_central");

    // Control positivo: con SU clave, la A sí la ve por guía y por remisión.
    expect((await llamar(base, "GET", `/api/ordenes/api-key/orden/${guiaA}`, a.clave)).status).toBe(200);
    expect((await llamar(base, "GET", `/api/ordenes/api-key/orden/${rem}`, a.clave)).status).toBe(200);

    const noEncontrado = { status: "error", code: "NOT_FOUND", message: "El recurso solicitado no existe." };
    for (const [metodo, ruta] of [
      ["GET", `/api/ordenes/api-key/orden/${guiaA}`],
      ["GET", `/api/ordenes/api-key/orden/${rem}`],
      ["PUT", `/api/ordenes/api-key/${guiaA}/cancelar`],
      ["POST", `/api/ordenes/api-key/orden/${guiaA}/generate`],
      ["POST", `/api/ordenes/api-key/carga/${cuerpo.cargaId}/generate`],
      ["DELETE", `/api/ordenes/api-key/orden/${rem}`],
    ] as const) {
      const r = await llamar(base, metodo, ruta, b.clave);
      expect(r.status, `B ${metodo} ${ruta}: ${r.texto}`).toBe(404);
      expect(r.json).toEqual(noEncontrado);
    }
    // Nada de lo que intentó la B movió la orden.
    expect(await estadoDe(dueno, a, rem)).toBe("en_bodega_central");

    // El listado de la B no la trae, ni filtrando por su guía o su remisión; sí trae lo suyo.
    const listaB = await llamar(base, "GET", "/api/ordenes/api-key?limit=100", b.clave);
    expect(listaB.status).toBe(200);
    const remisionesB = (listaB.json as { items: { numRemision: string }[] }).items.map((i) => i.numRemision);
    expect(remisionesB, "control positivo: la B ve su propia orden sembrada").toContain(b.datos.marcadores.orden);
    expect(remisionesB).not.toContain(rem);
    for (const q of [`num_guia=${guiaA}`, `num_remision=${encodeURIComponent(rem)}`]) {
      const r = await llamar(base, "GET", `/api/ordenes/api-key?${q}`, b.clave);
      expect(r.json).toMatchObject({ items: [], pagination: { total: 0 } });
    }
    // Habilitarla desde la B: fila `no_encontrada`, sin tocarla.
    const hab = await llamar(base, "POST", "/api/ordenes/api-key/habilitar", b.clave, { ordenes: [{ num_guia: guiaA, nota: "prueba" }] });
    expect(hab.status).toBe(200);
    expect((hab.json as { resultados: { error: { codigo: string } }[] }).resultados[0].error.codigo).toBe("no_encontrada");

    // La analítica de la B no cuenta las órdenes que la A creó hoy; la de la A sí (control positivo).
    expect(await ordenesCreadasHoy(base, b.clave)).toBe(creadasHoyB0);
    expect(await ordenesCreadasHoy(base, a.clave)).toBeGreaterThan(creadasHoyA0);

    // Y con su propia clave, la A sí la cancela (control positivo del 404 de arriba).
    const cancelaA = await llamar(base, "PUT", `/api/ordenes/api-key/${guiaA}/cancelar`, a.clave);
    expect(cancelaA.status, cancelaA.texto).toBe(200);
  });

  test("sin clave, con dos espacios o con una clave inventada: 401, como dice la sección 4.4", async () => {
    const sinClave = await llamar(base, "GET", "/api/ordenes/api-key", null);
    expect(sinClave.status).toBe(401);
    expect(sinClave.json).toEqual({ status: "error", code: "UNAUTHORIZED", message: "No hay una sesion valida." });
    const dosEspacios = await fetch(`${base}/api/ordenes/api-key`, { headers: { Authorization: `Bearer  ${a.clave}` } });
    expect(dosEspacios.status).toBe(401);
    expect((await llamar(base, "GET", "/api/ordenes/api-key", `svl_${randomBytes(32).toString("base64url")}`)).status).toBe(401);
    // Control positivo: la misma petición con la clave bien puesta responde 200.
    expect((await llamar(base, "GET", "/api/ordenes/api-key", a.clave)).status).toBe(200);
  });

  test("el contrato que sirve /api/docs/openapi propone este servidor y producción", async () => {
    const r = await llamar(base, "GET", "/api/docs/openapi", null);
    expect(r.status).toBe(200);
    // Primero «este servidor» (Try it out usa el host donde se abre Swagger), después producción.
    expect((r.json as { servers: { url: string }[] }).servers.map((s) => s.url)).toEqual(["/", URL_PRODUCCION]);
  });
});
