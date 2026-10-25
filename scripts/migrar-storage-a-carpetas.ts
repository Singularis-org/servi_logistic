import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import type { Prisma } from "@prisma/client";

import { loadDescargaConfig } from "@/lib/config/descarga";
import { loadEtiquetasConfig } from "@/lib/config/etiquetas";
import { loadGestionConfig } from "@/lib/config/gestion";
import { loadPostulacionConfig } from "@/lib/config/postulacion";
import { loadWalletComprobanteConfig } from "@/lib/config/wallet-comprobante";
import { bucketEnviosWhatsapp } from "@/lib/config/whatsapp-envios";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { RutaDeAlmacenInvalida, rutaEnCarpeta } from "@/lib/storage/carpeta-de-empresa";
import { createServerClient } from "@/lib/supabase/client";

// SL-19 (design §4; R23–R28) — mueve lo ya guardado en Storage a la carpeta de su empresa.
//
//   pnpm storage:migrar-a-carpetas [--aplicar | --revertir] [--bucket <nombre>]
//
// Desde SL-19 los adaptadores de `lib/storage/` leen y escriben `<organizacion_id>/<ruta>`, pero lo
// guardado antes vive en `<ruta>`, en la raiz del bucket. Sin este comando esos archivos dan «no
// encontrado» (design §3.6, alternativa C: buscar en la raiz reabriria el agujero entre empresas).
//
// POR QUE OPERA FUERA DE LOS ADAPTADORES. Es el unico camino que tiene que ver la raiz y las carpetas
// de todas las empresas a la vez: lee las filas en plataforma y usa el cliente de Storage crudo
// (`EXCEPCIONES_DE_PLATAFORMA` y `EXCEPCIONES_DE_STORAGE`, ficha SL-19).
//
// Mover es `download` + `upload` (sin pisar) + `remove` del original, no `move`: el doble de Storage
// del E2E no implementa `move`, y asi el comando se prueba entero sin red.
//
// Orden en cada entorno: sin `--aplicar` (conteos), con `--aplicar`, y otra vez sin: todo en 0 salvo
// los huerfanos. Correrlo contra QA o produccion es una puerta humana (tasks T10.4).
//
// Solo imprime conteos por bucket y la lista de huerfanos (bucket y ruta): nunca contenido, URLs
// firmadas ni el detalle de un error de Storage.

type ErrorSdk = { message: string; status?: number | string; statusCode?: number | string } | null;

/** Un hijo de un listado: archivo (`id` no nulo) o carpeta (`id` nulo). */
export interface EntradaListada {
  name: string;
  id: string | null;
}

/** Superficie minima del cliente de Storage que usa el comando (el SDK real o un doble). */
export interface ClienteDeStorage {
  from(bucket: string): {
    list(
      path: string,
      options?: { limit?: number; offset?: number },
    ): Promise<{ data: EntradaListada[] | null; error: ErrorSdk }>;
    download(path: string): Promise<{ data: Blob | null; error: ErrorSdk }>;
    upload(
      path: string,
      body: Uint8Array,
      options?: { contentType?: string; upsert?: boolean },
    ): Promise<{ data: { path: string } | null; error: ErrorSdk }>;
    remove(paths: string[]): Promise<{ data: unknown; error: ErrorSdk }>;
  };
}

/** Los modelos que guardan una ruta de Storage, mas `organizacion` para conocer las carpetas. */
export type LectorDeRutas = Pick<
  Prisma.TransactionClient,
  | "organizacion"
  | "mensajeroDocumento"
  | "gestionOrden"
  | "gestionOrdenEvidencia"
  | "ordenIncidenteEvidencia"
  | "devolucionTiendaEvidencia"
  | "orden"
  | "carga"
  | "walletComprobante"
  | "abonoTienda"
  | "aporteCapital"
  | "pagoPorCuentaTienda"
  | "whatsappEnvioEjecucion"
>;

type FiltroDeEmpresa = { organizacionId: { in: string[] } } | undefined;

interface FilaConRuta {
  organizacionId: string;
  ruta: string | null;
}

/** Que bucket guarda la ruta de que columna. Los nombres de bucket salen de los mismos `load*Config` que la app. */
export interface RutaGuardada {
  readonly bucket: () => string;
  readonly columna: string;
  readonly leer: (db: LectorDeRutas, where: FiltroDeEmpresa) => Promise<FilaConRuta[]>;
}

const evidencias = () => loadGestionConfig().EVIDENCIA_BUCKET;
const comprobantes = () => loadWalletComprobanteConfig().BUCKET;
const etiquetas = () => loadEtiquetasConfig().ETIQUETAS_BUCKET;

/** Las 12 columnas de design §3.1. Ninguna fila nombra objetos del bucket de descargas. */
export const RUTAS_GUARDADAS: readonly RutaGuardada[] = [
  {
    bucket: () => loadPostulacionConfig().BUCKET,
    columna: "mensajero_documento.storage_path",
    leer: async (db, where) =>
      (await db.mensajeroDocumento.findMany({ where, select: { organizacionId: true, storagePath: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.storagePath }),
      ),
  },
  {
    bucket: evidencias,
    columna: "gestion_orden.evidencia_storage_path",
    leer: async (db, where) =>
      (await db.gestionOrden.findMany({ where, select: { organizacionId: true, evidenciaStoragePath: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.evidenciaStoragePath }),
      ),
  },
  {
    bucket: evidencias,
    columna: "gestion_orden_evidencia.storage_path",
    leer: async (db, where) =>
      (await db.gestionOrdenEvidencia.findMany({ where, select: { organizacionId: true, storagePath: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.storagePath }),
      ),
  },
  {
    bucket: evidencias,
    columna: "orden_incidente_evidencia.storage_path",
    leer: async (db, where) =>
      (await db.ordenIncidenteEvidencia.findMany({ where, select: { organizacionId: true, storagePath: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.storagePath }),
      ),
  },
  {
    bucket: evidencias,
    columna: "devolucion_tienda_evidencia.storage_path",
    leer: async (db, where) =>
      (
        await db.devolucionTiendaEvidencia.findMany({ where, select: { organizacionId: true, storagePath: true } })
      ).map((f) => ({ organizacionId: f.organizacionId, ruta: f.storagePath })),
  },
  {
    bucket: etiquetas,
    columna: "orden.download_storage_path",
    leer: async (db, where) =>
      (await db.orden.findMany({ where, select: { organizacionId: true, downloadStoragePath: true } })).map((f) => ({
        organizacionId: f.organizacionId,
        ruta: f.downloadStoragePath,
      })),
  },
  {
    bucket: etiquetas,
    columna: "carga.download_storage_path",
    leer: async (db, where) =>
      (await db.carga.findMany({ where, select: { organizacionId: true, downloadStoragePath: true } })).map((f) => ({
        organizacionId: f.organizacionId,
        ruta: f.downloadStoragePath,
      })),
  },
  {
    bucket: comprobantes,
    columna: "wallet_comprobante.storage_path",
    leer: async (db, where) =>
      (await db.walletComprobante.findMany({ where, select: { organizacionId: true, storagePath: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.storagePath }),
      ),
  },
  {
    bucket: comprobantes,
    columna: "abono_tienda.comprobante_path",
    leer: async (db, where) =>
      (await db.abonoTienda.findMany({ where, select: { organizacionId: true, comprobantePath: true } })).map((f) => ({
        organizacionId: f.organizacionId,
        ruta: f.comprobantePath,
      })),
  },
  {
    bucket: comprobantes,
    columna: "aporte_capital.comprobante_path",
    leer: async (db, where) =>
      (await db.aporteCapital.findMany({ where, select: { organizacionId: true, comprobantePath: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.comprobantePath }),
      ),
  },
  {
    bucket: comprobantes,
    columna: "pago_por_cuenta_tienda.comprobante_path",
    leer: async (db, where) =>
      (await db.pagoPorCuentaTienda.findMany({ where, select: { organizacionId: true, comprobantePath: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.comprobantePath }),
      ),
  },
  {
    bucket: bucketEnviosWhatsapp,
    columna: "whatsapp_envio_ejecucion.pdf_ruta",
    leer: async (db, where) =>
      (await db.whatsappEnvioEjecucion.findMany({ where, select: { organizacionId: true, pdfRuta: true } })).map(
        (f) => ({ organizacionId: f.organizacionId, ruta: f.pdfRuta }),
      ),
  },
];

/** Bucket de las descargas temporales (R26): sin filas, sus `tmp/` de la raiz caducan en una hora. */
const bucketDescargas = () => loadDescargaConfig().BUCKET;
const CARPETA_TEMPORALES = "tmp/";

export type Modo = "prueba" | "aplicar" | "revertir";

export interface ConteoDeBucket {
  bucket: string;
  /** El bucket no existe en este entorno (los de creacion perezosa, design §3.1). */
  inexistente: boolean;
  /** En la raiz, con fila: se mueven (o se moverian) a la carpeta. En `--revertir`, al reves. */
  aMover: number;
  /** Ya en su sitio (carpeta; raiz en `--revertir`). R25: cuenta como movido. */
  yaEnSuSitio: number;
  /** En los dos sitios con los mismos bytes (una corrida cortada): se borra la copia sobrante. */
  duplicadosIguales: number;
  /** En los dos sitios con bytes distintos: no se toca nada y el comando sale con 1. */
  discrepancias: number;
  /** Filas cuya ruta no tiene objeto ni en la raiz ni en la carpeta. */
  filasSinObjeto: number;
  /** Rutas guardadas que la app no podria pedir (R17), o la misma ruta en filas de dos empresas. */
  rutasNoValidas: number;
  /** R26: temporales de descargas en la raiz. */
  temporales: number;
  /** R27: objetos en la raiz que ninguna fila nombra (sin contar los temporales). */
  huerfanos: string[];
  /** Operaciones de Storage que fallaron: el comando sale con 1 y se puede volver a correr. */
  fallos: number;
}

export interface ResumenDeMigracion {
  modo: Modo;
  buckets: ConteoDeBucket[];
  codigoDeSalida: 0 | 1;
}

export interface OpcionesDeMigracion {
  db: LectorDeRutas;
  storage: ClienteDeStorage;
  modo: Modo;
  /** Solo este bucket (`--bucket`). */
  bucket?: string;
  /**
   * Solo las filas de estas empresas. No es una opcion del comando: el test corre contra una base
   * compartida y no puede depender de las filas de otros tests.
   */
  soloEmpresas?: readonly string[];
}

const PAGINA_DE_LISTADO = 1000;

function esBucketInexistente(error: ErrorSdk): boolean {
  if (!error) return false;
  return /bucket not found/i.test(error.message) || String(error.statusCode) === "404" || String(error.status) === "404";
}

/** Error de Storage sin su detalle: el mensaje del SDK puede llevar rutas firmadas o tokens. */
class FalloDeStorage extends Error {
  constructor(operacion: string) {
    super(`fallo de Storage al ${operacion}`);
    this.name = "FalloDeStorage";
  }
}

/** Los hijos de una carpeta, todas las paginas. `null` si el bucket no existe. */
async function listarCarpeta(
  storage: ClienteDeStorage,
  bucket: string,
  carpeta: string,
): Promise<EntradaListada[] | null> {
  const todas: EntradaListada[] = [];
  for (let offset = 0; ; offset += PAGINA_DE_LISTADO) {
    const { data, error } = await storage.from(bucket).list(carpeta, { limit: PAGINA_DE_LISTADO, offset });
    if (error) {
      if (esBucketInexistente(error)) return null;
      throw new FalloDeStorage("listar");
    }
    const pagina = data ?? [];
    todas.push(...pagina);
    if (pagina.length < PAGINA_DE_LISTADO) return todas;
  }
}

/**
 * Todos los objetos fuera de una carpeta de empresa, por niveles. Las carpetas de primer nivel con
 * el id de una organizacion se saltan (design §4): lo de dentro ya esta migrado.
 */
async function objetosFueraDeCarpetas(
  storage: ClienteDeStorage,
  bucket: string,
  empresas: ReadonlySet<string>,
): Promise<Set<string> | null> {
  const raiz = await listarCarpeta(storage, bucket, "");
  if (raiz === null) return null;
  const objetos = new Set<string>();
  const pendientes: { carpeta: string; entradas: EntradaListada[] }[] = [{ carpeta: "", entradas: raiz }];
  while (pendientes.length > 0) {
    const { carpeta, entradas } = pendientes.pop()!;
    for (const e of entradas) {
      const ruta = carpeta === "" ? e.name : `${carpeta}/${e.name}`;
      if (e.id !== null) {
        objetos.add(ruta);
        continue;
      }
      if (carpeta === "" && empresas.has(e.name)) continue;
      pendientes.push({ carpeta: ruta, entradas: (await listarCarpeta(storage, bucket, ruta)) ?? [] });
    }
  }
  return objetos;
}

/** Existencia de un objeto por el listado de su carpeta padre, con cache por carpeta. */
class Existencias {
  private readonly porCarpeta = new Map<string, Set<string>>();
  constructor(
    private readonly storage: ClienteDeStorage,
    private readonly bucket: string,
  ) {}

  private partir(ruta: string): { carpeta: string; nombre: string } {
    const i = ruta.lastIndexOf("/");
    return i === -1 ? { carpeta: "", nombre: ruta } : { carpeta: ruta.slice(0, i), nombre: ruta.slice(i + 1) };
  }

  private async archivos(carpeta: string): Promise<Set<string>> {
    let s = this.porCarpeta.get(carpeta);
    if (!s) {
      const entradas = (await listarCarpeta(this.storage, this.bucket, carpeta)) ?? [];
      s = new Set(entradas.filter((e) => e.id !== null).map((e) => e.name));
      this.porCarpeta.set(carpeta, s);
    }
    return s;
  }

  async existe(ruta: string): Promise<boolean> {
    const { carpeta, nombre } = this.partir(ruta);
    return (await this.archivos(carpeta)).has(nombre);
  }

  async anotar(ruta: string, existe: boolean): Promise<void> {
    const { carpeta, nombre } = this.partir(ruta);
    const s = await this.archivos(carpeta);
    if (existe) s.add(nombre);
    else s.delete(nombre);
  }
}

async function descargar(storage: ClienteDeStorage, bucket: string, ruta: string): Promise<{ bytes: Uint8Array; tipo: string }> {
  const { data, error } = await storage.from(bucket).download(ruta);
  if (error || !data) throw new FalloDeStorage("descargar");
  return { bytes: new Uint8Array(await data.arrayBuffer()), tipo: data.type || "application/octet-stream" };
}

const huella = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Copia `origen` a `destino` sin pisar y borra el origen. Si la copia falla, el origen queda. */
async function mover(storage: ClienteDeStorage, bucket: string, origen: string, destino: string): Promise<void> {
  const { bytes, tipo } = await descargar(storage, bucket, origen);
  const subida = await storage.from(bucket).upload(destino, bytes, { contentType: tipo, upsert: false });
  if (subida.error || !subida.data) throw new FalloDeStorage("copiar");
  const borrado = await storage.from(bucket).remove([origen]);
  if (borrado.error) throw new FalloDeStorage("borrar el original");
}

function conteoVacio(bucket: string): ConteoDeBucket {
  return {
    bucket,
    inexistente: false,
    aMover: 0,
    yaEnSuSitio: 0,
    duplicadosIguales: 0,
    discrepancias: 0,
    filasSinObjeto: 0,
    rutasNoValidas: 0,
    temporales: 0,
    huerfanos: [],
    fallos: 0,
  };
}

/** Las rutas guardadas por bucket, deduplicadas por `(bucket, ruta)`; `null` si dos empresas la nombran. */
async function rutasPorBucket(
  db: LectorDeRutas,
  soloEmpresas: readonly string[] | undefined,
): Promise<Map<string, Map<string, string | null>>> {
  const where: FiltroDeEmpresa = soloEmpresas ? { organizacionId: { in: [...soloEmpresas] } } : undefined;
  const porBucket = new Map<string, Map<string, string | null>>();
  for (const r of RUTAS_GUARDADAS) {
    const bucket = r.bucket();
    const rutas = porBucket.get(bucket) ?? new Map<string, string | null>();
    porBucket.set(bucket, rutas);
    for (const fila of await r.leer(db, where)) {
      if (fila.ruta === null || fila.ruta === "") continue;
      const previa = rutas.get(fila.ruta);
      rutas.set(fila.ruta, previa === undefined || previa === fila.organizacionId ? fila.organizacionId : null);
    }
  }
  return porBucket;
}

async function migrarBucket(
  storage: ClienteDeStorage,
  bucket: string,
  rutas: ReadonlyMap<string, string | null>,
  empresas: ReadonlySet<string>,
  modo: Modo,
): Promise<ConteoDeBucket> {
  const conteo = conteoVacio(bucket);
  const enRaiz = await objetosFueraDeCarpetas(storage, bucket, empresas);
  if (enRaiz === null) {
    conteo.inexistente = true;
    conteo.filasSinObjeto = rutas.size;
    return conteo;
  }
  const existencias = new Existencias(storage, bucket);

  for (const [ruta, organizacionId] of rutas) {
    let enCarpeta: string;
    try {
      if (organizacionId === null) throw new RutaDeAlmacenInvalida("la nombran filas de dos empresas");
      enCarpeta = rutaEnCarpeta(organizacionId, ruta);
    } catch (e) {
      if (!(e instanceof RutaDeAlmacenInvalida)) throw e;
      conteo.rutasNoValidas += 1;
      continue;
    }
    // Revertir es la misma operacion con origen y destino cambiados (R28).
    const [origen, destino] = modo === "revertir" ? [enCarpeta, ruta] : [ruta, enCarpeta];
    try {
      const hayOrigen = modo === "revertir" ? await existencias.existe(origen) : enRaiz.has(origen);
      const hayDestino = modo === "revertir" ? enRaiz.has(destino) : await existencias.existe(destino);
      if (hayOrigen && hayDestino) {
        // R25: una corrida cortada entre la copia y el borrado. Solo se borra el sobrante si es identico.
        const [a, b] = await Promise.all([descargar(storage, bucket, origen), descargar(storage, bucket, destino)]);
        if (huella(a.bytes) !== huella(b.bytes)) {
          conteo.discrepancias += 1;
          continue;
        }
        conteo.duplicadosIguales += 1;
        if (modo !== "prueba") {
          const borrado = await storage.from(bucket).remove([origen]);
          if (borrado.error) throw new FalloDeStorage("borrar el duplicado");
        }
      } else if (hayOrigen) {
        conteo.aMover += 1;
        if (modo !== "prueba") await mover(storage, bucket, origen, destino);
      } else if (hayDestino) {
        conteo.yaEnSuSitio += 1;
        continue;
      } else {
        conteo.filasSinObjeto += 1;
        continue;
      }
      if (modo !== "prueba") {
        await existencias.anotar(modo === "revertir" ? origen : destino, modo !== "revertir");
        if (modo === "revertir") enRaiz.add(destino);
        else enRaiz.delete(origen);
      }
    } catch (e) {
      if (!(e instanceof FalloDeStorage)) throw e;
      conteo.fallos += 1;
    }
  }

  // Lo que queda en la raiz sin fila: temporales de descargas (R26) o huerfanos (R27).
  const esDescargas = bucket === bucketDescargas();
  const temporales: string[] = [];
  for (const ruta of [...enRaiz].sort()) {
    if (rutas.has(ruta)) continue;
    if (esDescargas && ruta.startsWith(CARPETA_TEMPORALES)) temporales.push(ruta);
    else conteo.huerfanos.push(ruta);
  }
  conteo.temporales = temporales.length;
  if (modo === "aplicar" && temporales.length > 0) {
    const borrado = await storage.from(bucket).remove(temporales);
    if (borrado.error) conteo.fallos += 1;
  }
  return conteo;
}

/** Corre la migracion. No imprime nada: devuelve los conteos y el codigo de salida. */
export async function migrarStorageACarpetas(o: OpcionesDeMigracion): Promise<ResumenDeMigracion> {
  const empresas = new Set((await o.db.organizacion.findMany({ select: { id: true } })).map((e) => e.id));
  const porBucket = await rutasPorBucket(o.db, o.soloEmpresas);
  const descargas = bucketDescargas();
  if (!porBucket.has(descargas)) porBucket.set(descargas, new Map());

  const buckets: ConteoDeBucket[] = [];
  for (const [bucket, rutas] of [...porBucket].sort(([a], [b]) => a.localeCompare(b))) {
    if (o.bucket !== undefined && o.bucket !== bucket) continue;
    buckets.push(await migrarBucket(o.storage, bucket, rutas, empresas, o.modo));
  }
  const mal = buckets.some((b) => b.discrepancias > 0 || b.fallos > 0 || b.rutasNoValidas > 0);
  return { modo: o.modo, buckets, codigoDeSalida: mal ? 1 : 0 };
}

/** Las lineas de la salida: conteos por bucket y huerfanos con su bucket y su ruta. Nada mas. */
export function lineasDelResumen(r: ResumenDeMigracion): string[] {
  const verbo = { prueba: "se moverian", aplicar: "movidos", revertir: "devueltos a la raiz" }[r.modo];
  const lineas = [
    r.modo === "prueba" ? "Modo de prueba: no se movio ni se borro nada. Usa --aplicar para mover." : `Modo: ${r.modo}.`,
  ];
  for (const b of r.buckets) {
    if (b.inexistente) {
      lineas.push(`[${b.bucket}] el bucket no existe; filas sin objeto: ${b.filasSinObjeto}`);
      continue;
    }
    lineas.push(
      `[${b.bucket}] ${verbo}: ${b.aMover} · ya en su sitio: ${b.yaEnSuSitio} · duplicados iguales: ${b.duplicadosIguales}` +
        ` · bytes distintos: ${b.discrepancias} · filas sin objeto: ${b.filasSinObjeto}` +
        ` · rutas no validas: ${b.rutasNoValidas} · temporales: ${b.temporales} · huerfanos: ${b.huerfanos.length}` +
        ` · fallos: ${b.fallos}`,
    );
  }
  for (const b of r.buckets) for (const h of b.huerfanos) lineas.push(`huerfano ${b.bucket} ${h}`);
  return lineas;
}

const USO = "Uso: pnpm storage:migrar-a-carpetas [--aplicar | --revertir] [--bucket <nombre>]";

/** Interpreta los argumentos; `null` si no son validos. */
export function leerArgumentos(argv: readonly string[]): { modo: Modo; bucket?: string } | null {
  let modo: Modo = "prueba";
  let bucket: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--aplicar" || a === "--revertir") {
      const nuevo: Modo = a === "--aplicar" ? "aplicar" : "revertir";
      if (modo !== "prueba" && modo !== nuevo) return null;
      modo = nuevo;
    } else if (a === "--bucket" && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      bucket = argv[++i];
    } else {
      return null;
    }
  }
  return { modo, bucket };
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }
  const argumentos = leerArgumentos(process.argv.slice(2));
  if (argumentos === null) {
    // No se repite el argumento: se escribe a mano y podria llevar algo que no debe salir.
    console.error(USO);
    process.exit(1);
  }
  const prisma = getPrismaClient();
  try {
    const resumen = await comoPlataforma("SL-19", "mover los archivos ya guardados a la carpeta de su empresa", () =>
      migrarStorageACarpetas({
        db: prisma,
        storage: createServerClient().storage as unknown as ClienteDeStorage,
        ...argumentos,
      }),
    );
    for (const linea of lineasDelResumen(resumen)) console.log(linea);
    process.exitCode = resumen.codigoDeSalida;
  } finally {
    await prisma.$disconnect();
  }
}

// Solo auto-ejecuta cuando este archivo es el entrypoint (no cuando un test lo importa).
const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().catch((error: unknown) => {
    // Solo el nombre: el mensaje de Prisma o de Storage puede llevar la URL de la base o rutas.
    console.error(`Fallo la migracion de Storage (${error instanceof Error ? error.name : "error desconocido"}).`);
    process.exit(1);
  });
}
