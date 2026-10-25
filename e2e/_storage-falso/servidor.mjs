// SL-44 D2 (R4, R5) — doble HTTP del API de Supabase Storage para el E2E.
//
// Por que existe: las ~25 composition roots construyen `SupabaseFileStorage` /
// `SupabaseSignedUrlProvider` / `SupabaseAlmacen*` directamente y todas acaban hablando con
// `${SUPABASE_URL}/storage/v1`. El unico punto comun es esa URL, asi que el E2E arranca este
// doble y le da a la app `SUPABASE_URL` apuntando aqui. `lib/storage/` y las composition roots no
// cambian (R6) y no hay un "almacen de pruebas" que pueda encenderse por error en produccion: este
// archivo solo vive en `e2e/` y solo lo arranca Playwright.
//
// Node puro (`node:http`), sin dependencias. Objetos en memoria por `bucket/path`: cada corrida del
// E2E empieza vacia, igual que su base (R27).
//
// Las rutas y las formas NO se adivinan: salen de `@supabase/storage-js` 2.110.1 instalado
// (`src/packages/StorageFileApi.ts`, `src/packages/StorageBucketApi.ts`, `src/lib/common/fetch.ts`).
// Si una version nueva cambia el protocolo, `tests/unit/e2e/storage-falso.test.ts` (que usa el
// cliente real) cae antes que el E2E.

import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const PUERTO_POR_DEFECTO = 54329;
const HOST = "127.0.0.1";
// supabase-js construye la URL de Storage como `new URL('storage/v1', SUPABASE_URL)`.
const PREFIJO = "/storage/v1";

// Errores con la MISMA forma que Storage real (HTTP 400 y el codigo real en `statusCode`):
// `SupabaseAlmacen*` deciden por `statusCode` / mensaje (`esBucketYaExistente`: /already exists/ o
// "409"; `esBucketInexistente`: /not found/ o "404"). Si el texto cambiase, el doble llevaria a la
// app por una rama que en produccion no pasa.
const DUPLICADO = { statusCode: "409", error: "Duplicate", message: "The resource already exists" };
const NO_EXISTE = { statusCode: "404", error: "not_found", message: "Object not found" };
const TOKEN_INVALIDO = { statusCode: "400", error: "InvalidJWT", message: "invalid signature" };
// Texto que Storage pone en la entrada de `createSignedUrls` que no pudo firmar.
const NO_FIRMABLE = "Either the object does not exist or you do not have access to it";

/**
 * @typedef {{ bytes: Buffer, contentType: string, id: string, creado: string }} Objeto
 * @typedef {{ clave: string, expira: number }} Firma
 * @typedef {{ url: string, puerto: number, cerrar: () => Promise<void> }} StorageFalso
 */

/** Estado en memoria de UNA instancia del doble (cada test levanta la suya). */
function crearEstado() {
  return {
    /** @type {Map<string, Objeto>} clave `bucket/path` */
    objetos: new Map(),
    /** @type {Set<string>} */
    buckets: new Set(),
    /** @type {Map<string, Firma>} token -> objeto firmado */
    firmas: new Map(),
  };
}

/** @param {http.ServerResponse} res @param {number} status @param {unknown} cuerpo */
function responderJson(res, status, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(texto) });
  res.end(texto);
}

/** @param {http.ServerResponse} res @param {Objeto} objeto */
function responderBytes(res, objeto) {
  res.writeHead(200, { "content-type": objeto.contentType, "content-length": objeto.bytes.length });
  res.end(objeto.bytes);
}

/** @param {http.IncomingMessage} req @returns {Promise<Buffer>} */
function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const trozos = [];
    req.on("data", (t) => trozos.push(t));
    req.on("end", () => resolve(Buffer.concat(trozos)));
    req.on("error", reject);
  });
}

/** @param {Buffer} cuerpo @returns {Record<string, unknown>} */
function comoJson(cuerpo) {
  if (cuerpo.length === 0) return {};
  return JSON.parse(cuerpo.toString("utf8"));
}

/** Separa `<bucket>/<path...>`; `path` es "" si solo viene el bucket. @param {string} resto */
function partir(resto) {
  const i = resto.indexOf("/");
  if (i === -1) return { bucket: resto, path: "" };
  return { bucket: resto.slice(0, i), path: resto.slice(i + 1) };
}

/** FileObject minimo que devuelven `list` y `remove`. @param {string} nombre @param {Objeto} o */
function aFileObject(nombre, o) {
  return {
    name: nombre,
    id: o.id,
    created_at: o.creado,
    updated_at: o.creado,
    last_accessed_at: o.creado,
    metadata: { size: o.bytes.length, mimetype: o.contentType },
  };
}

/**
 * Firma una clave existente. El `signedURL` es RELATIVO a `/storage/v1`, como Storage real:
 * storage-js le antepone su URL y hace `encodeURI` (StorageFileApi.ts:731-733 y :817-819).
 * @param {ReturnType<typeof crearEstado>} estado @param {string} clave @param {unknown} expiresIn
 */
function firmar(estado, clave, expiresIn) {
  const segundos = Number(expiresIn);
  const token = randomBytes(18).toString("base64url");
  estado.firmas.set(token, {
    clave,
    expira: Date.now() + (Number.isFinite(segundos) && segundos > 0 ? segundos : 60) * 1000,
  });
  return `/object/sign/${clave}?token=${token}`;
}

/** @param {ReturnType<typeof crearEstado>} estado */
function crearManejador(estado) {
  /** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
  return async function manejar(req, res) {
    const metodo = req.method ?? "GET";
    const url = new URL(req.url ?? "/", `http://${HOST}`);

    // Para el `webServer` de Playwright: sabe que el doble ya escucha.
    if (url.pathname === "/salud") return responderJson(res, 200, { ok: true });

    if (!url.pathname.startsWith(`${PREFIJO}/`)) return noAtendida(res, metodo, url.pathname);
    // fetch codifica el path (espacios, tildes); el almacen guarda la clave tal cual la paso la app.
    const ruta = decodeURIComponent(url.pathname.slice(PREFIJO.length));
    const cuerpo = await leerCuerpo(req);

    // createBucket — POST `${url}/bucket` con `{ id }` (StorageBucketApi.ts:215-227). Los buckets
    // del doble existen implicitamente al subir (la creacion perezosa de `SupabaseAlmacen*` ya
    // tiene sus tests de unidad); esto solo responde lo que espera el SDK si alguien la llama.
    if (metodo === "POST" && ruta === "/bucket") {
      const id = String(comoJson(cuerpo).id ?? "");
      if (estado.buckets.has(id)) return responderJson(res, 400, DUPLICADO);
      estado.buckets.add(id);
      return responderJson(res, 200, { name: id });
    }

    if (ruta.startsWith("/object/sign/")) {
      const { bucket, path } = partir(ruta.slice("/object/sign/".length));
      if (metodo === "GET") return servirFirmado(estado, res, `${bucket}/${path}`, url.searchParams.get("token"));
      if (metodo !== "POST") return noAtendida(res, metodo, ruta);
      const json = comoJson(cuerpo);

      // createSignedUrls — POST `${url}/object/sign/<bucket>` con `{ expiresIn, paths }`
      // (StorageFileApi.ts:800-805); responde un array `{ error, path, signedURL }`.
      if (path === "") {
        const paths = Array.isArray(json.paths) ? json.paths.map(String) : [];
        return responderJson(
          res,
          200,
          paths.map((p) => {
            const clave = `${bucket}/${p}`;
            return estado.objetos.has(clave)
              ? { error: null, path: p, signedURL: firmar(estado, clave, json.expiresIn) }
              : { error: NO_FIRMABLE, path: p, signedURL: null };
          }),
        );
      }

      // createSignedUrl — POST `${url}/object/sign/<bucket>/<path>` con `{ expiresIn }`
      // (StorageFileApi.ts:716-721); responde `{ signedURL }`. Ausente -> error (R5).
      const clave = `${bucket}/${path}`;
      if (!estado.objetos.has(clave)) return responderJson(res, 400, NO_EXISTE);
      return responderJson(res, 200, { signedURL: firmar(estado, clave, json.expiresIn) });
    }

    // list — POST `${url}/object/list/<bucket>` con `{ prefix, limit, offset, sortBy }`
    // (StorageFileApi.ts:1401-1408). Lo usa la purga de `SupabaseAlmacenDescargas`.
    if (metodo === "POST" && ruta.startsWith("/object/list/")) {
      return responderJson(res, 200, listar(estado, ruta.slice("/object/list/".length), comoJson(cuerpo)));
    }

    if (ruta.startsWith("/object/")) {
      const { bucket, path } = partir(ruta.slice("/object/".length));
      const clave = `${bucket}/${path}`;

      // remove — DELETE `${url}/object/<bucket>` con `{ prefixes }` (StorageFileApi.ts:1154-1159).
      // Mejor esfuerzo, como Storage: un path ausente no es error; devuelve lo que si borro.
      if (metodo === "DELETE" && path === "") {
        const json = comoJson(cuerpo);
        const prefixes = Array.isArray(json.prefixes) ? json.prefixes.map(String) : [];
        const borrados = [];
        for (const p of prefixes) {
          const o = estado.objetos.get(`${bucket}/${p}`);
          if (!o) continue;
          estado.objetos.delete(`${bucket}/${p}`);
          borrados.push({ ...aFileObject(p, o), bucket_id: bucket });
        }
        return responderJson(res, 200, borrados);
      }

      // upload (POST, `x-upsert`) y update (PUT) — `${url}/object/<bucket>/<path>`
      // (StorageFileApi.ts:91-94 y :142-147); responde `{ Id, Key }` y storage-js devuelve
      // `{ id: Id, path, fullPath: Key }` (:149).
      if ((metodo === "POST" || metodo === "PUT") && path !== "") {
        return subir(estado, req, res, { metodo, bucket, path, cuerpo });
      }

      // download — GET `${url}/object/<bucket>/<path>` (StorageFileApi.ts:906-915). Lo usa
      // `SupabaseAlmacenEnviosWhatsapp.leer`. exists — HEAD a la misma ruta (:993).
      if ((metodo === "GET" || metodo === "HEAD") && path !== "") {
        const o = estado.objetos.get(clave);
        if (!o) return responderJson(res, 400, NO_EXISTE);
        return responderBytes(res, o);
      }
    }

    return noAtendida(res, metodo, ruta);
  };
}

/**
 * @param {ReturnType<typeof crearEstado>} estado @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {{ metodo: string, bucket: string, path: string, cuerpo: Buffer }} p
 */
function subir(estado, req, res, { metodo, bucket, path, cuerpo }) {
  const contentType = String(req.headers["content-type"] ?? "application/octet-stream");
  // Con un `Blob` storage-js manda multipart (StorageFileApi.ts:98-104). La app sube `Uint8Array`
  // (cuerpo crudo + content-type, :114-117). Guardar el multipart como si fueran los bytes daria
  // un verde falso en R5, asi que se rechaza a voz en grito.
  if (contentType.startsWith("multipart/form-data")) {
    return responderJson(res, 400, {
      statusCode: "400",
      error: "no_implementado",
      message: "el doble de Storage no acepta multipart: sube Uint8Array/Buffer",
    });
  }
  const clave = `${bucket}/${path}`;
  const existe = estado.objetos.has(clave);
  // POST con `x-upsert: false` (lo que pide toda la app) no pisa: 400/409 como Storage real.
  if (metodo === "POST" && existe && req.headers["x-upsert"] !== "true") return responderJson(res, 400, DUPLICADO);
  // PUT (update) sobre un objeto que no existe: Storage real responde not found.
  if (metodo === "PUT" && !existe) return responderJson(res, 400, NO_EXISTE);
  const id = randomUUID();
  estado.buckets.add(bucket);
  estado.objetos.set(clave, { bytes: Buffer.from(cuerpo), contentType, id, creado: new Date().toISOString() });
  return responderJson(res, 200, { Id: id, Key: clave });
}

/**
 * Hijos directos de `prefix` (archivos y carpetas), ordenados y paginados como pide el SDK.
 * @param {ReturnType<typeof crearEstado>} estado @param {string} bucket
 * @param {Record<string, unknown>} cuerpo
 */
function listar(estado, bucket, cuerpo) {
  const prefijo = String(cuerpo.prefix ?? "").replace(/^\/+|\/+$/g, "");
  const base = prefijo ? `${bucket}/${prefijo}/` : `${bucket}/`;
  /** @type {Map<string, ReturnType<typeof aFileObject> | { name: string, id: null, metadata: null }>} */
  const hijos = new Map();
  for (const [clave, o] of estado.objetos) {
    if (!clave.startsWith(base)) continue;
    const resto = clave.slice(base.length);
    const i = resto.indexOf("/");
    if (i === -1) hijos.set(resto, aFileObject(resto, o));
    else if (!hijos.has(resto.slice(0, i))) hijos.set(resto.slice(0, i), { name: resto.slice(0, i), id: null, metadata: null });
  }
  const orden = /** @type {{ column?: string, order?: string }} */ (cuerpo.sortBy ?? {});
  const columna = orden.column === "created_at" ? "created_at" : "name";
  const signo = orden.order === "desc" ? -1 : 1;
  const lista = [...hijos.values()].sort((a, b) => {
    const va = String(/** @type {Record<string, unknown>} */ (a)[columna] ?? "");
    const vb = String(/** @type {Record<string, unknown>} */ (b)[columna] ?? "");
    return va < vb ? -signo : va > vb ? signo : 0;
  });
  const offset = Number(cuerpo.offset ?? 0) || 0;
  const limit = Number(cuerpo.limit ?? 100) || 100;
  return lista.slice(offset, offset + limit);
}

/**
 * Sirve lo firmado (R5): los bytes y el content-type que se subieron, o 400 si el token no casa con
 * ese objeto, vencio, o el objeto ya no existe (se borro despues de firmar).
 * @param {ReturnType<typeof crearEstado>} estado @param {http.ServerResponse} res
 * @param {string} clave @param {string | null} token
 */
function servirFirmado(estado, res, clave, token) {
  const firma = token ? estado.firmas.get(token) : undefined;
  if (!firma || firma.clave !== clave || firma.expira < Date.now()) return responderJson(res, 400, TOKEN_INVALIDO);
  const o = estado.objetos.get(clave);
  if (!o) return responderJson(res, 400, NO_EXISTE);
  return responderBytes(res, o);
}

/**
 * Una ruta que el doble no conoce responde error y lo dice: si la app empieza a usar otra
 * operacion de Storage, el E2E cae con un mensaje claro en vez de con un verde falso.
 * @param {http.ServerResponse} res @param {string} metodo @param {string} ruta
 */
function noAtendida(res, metodo, ruta) {
  console.error(`[storage-falso] ruta no atendida: ${metodo} ${ruta}`);
  return responderJson(res, 501, {
    statusCode: "501",
    error: "no_implementado",
    message: `el doble de Storage no atiende ${metodo} ${ruta}`,
  });
}

/**
 * Arranca el doble en `127.0.0.1:<puerto>`. Con puerto 0 el sistema elige uno libre (tests).
 * @param {{ puerto?: number }} [opciones]
 * @returns {Promise<StorageFalso>}
 */
export function arrancarStorageFalso({ puerto = PUERTO_POR_DEFECTO } = {}) {
  const estado = crearEstado();
  const manejar = crearManejador(estado);
  const servidor = http.createServer((req, res) => {
    manejar(req, res).catch((e) => {
      // Un fallo del propio doble (JSON roto, etc.) se ve en el log y llega al SDK como 500.
      console.error(`[storage-falso] error atendiendo ${req.method} ${req.url}:`, e);
      if (!res.headersSent) responderJson(res, 500, { statusCode: "500", error: "interno", message: String(e) });
      else res.end();
    });
  });
  return new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(puerto, HOST, () => {
      const direccion = servidor.address();
      const real = typeof direccion === "object" && direccion ? direccion.port : puerto;
      resolve({
        url: `http://${HOST}:${real}`,
        puerto: real,
        cerrar: () =>
          new Promise((ok, mal) => {
            servidor.closeAllConnections();
            servidor.close((e) => (e ? mal(e) : ok()));
          }),
      });
    });
  });
}

/** Puerto de `E2E_STORAGE_PUERTO`; uno mal escrito para el arranque en vez de caer en otro. */
function puertoDelEntorno() {
  const crudo = process.env.E2E_STORAGE_PUERTO;
  if (!crudo) return PUERTO_POR_DEFECTO;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`E2E_STORAGE_PUERTO no es un puerto valido: ${crudo}`);
  }
  return n;
}

// Ejecutado como script (`node e2e/_storage-falso/servidor.mjs`, lo hace el `webServer` de
// Playwright) arranca solo; importado (el test de contrato) no arranca nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url, cerrar } = await arrancarStorageFalso({ puerto: puertoDelEntorno() });
  console.log(`[storage-falso] escuchando en ${url}`);
  for (const senal of ["SIGINT", "SIGTERM"]) {
    process.once(senal, () => {
      cerrar().finally(() => process.exit(0));
    });
  }
}
