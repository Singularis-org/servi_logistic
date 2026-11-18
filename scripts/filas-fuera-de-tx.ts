// SLT-188 «Tests que dejan filas fuera de su transacción» — la comprobacion (R1170-R1176, R1189).
//
// QUE MIDE. La suite de vitest corre contra una base que nace migrada y sembrada solo con catalogos.
// Un test que commitea filas de negocio y no las limpia (o las limpia a medias, o el `afterAll` no
// llega) deja una `organizacion` que no estaba, con sus `orden`, `zona`, `usuario`... Otro test que
// lea «la primera fila» la toma, y el trigger SL017 rechaza la escritura (SLT-177, run 43973243440).
// Esta comprobacion saca una FOTO de la base antes de la suite y, al terminar, lista lo que sobra.
//
// TRES MODOS:
//   tsx scripts/filas-fuera-de-tx.ts foto <antes.json>                 foto de la base ya sembrada
//   tsx scripts/filas-fuera-de-tx.ts comparar <antes.json> <informe>   informe JSON; sale 1 si hay filas
//   node scripts/filas-fuera-de-tx.ts unir <dir> <n> [--modo informe|rojo]   veredicto de los shards
//
// `unir` corre en `gate-completo`, que solo tiene Node (sin `pnpm install`): por eso este archivo no
// importa NADA fuera de `node:` en lo alto (Node 24 le quita los tipos y lo ejecuta tal cual) y el
// cliente de Prisma se carga con `import()` solo en `foto`/`comparar`, que corren con `tsx`.
//
// SOLO LEE (R1175): las consultas van en una transaccion `READ ONLY` y `REPEATABLE READ` (una sola
// instantanea para todas las tablas). Y no imprime la URL ni credenciales (R1189): un error de
// conexion sale con su codigo, nunca con su mensaje (el del driver puede llevar el host).
//
// QUE CUENTA COMO FILA DE UNA EMPRESA. Toda tabla con columna `organizacion_id` (SL-17: toda fila de
// negocio la lleva), descubierta en `pg_catalog` en cada corrida: una tabla nueva entra sola, sin
// lista a mano que mantener. Las particiones se cuentan por su tabla madre.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { PrismaClient } from "@prisma/client";

export const VERSION_FOTO = 2;
export const NOMBRE_INFORME = "filas-fuera-de-tx.json";
export const LINEA_CERO = "0 filas fuera de su transacción";
export const MAX_MUESTRAS = 5;

/** Lo unico que la comprobacion pide de un cliente: SQL crudo de lectura. Vale un `tx` de Prisma. */
export interface ClienteDeLectura {
  $queryRawUnsafe<T = unknown>(sql: string, ...args: unknown[]): Promise<T>;
}

/** La foto «antes» (R1171): lo que habia al empezar. `conteos` es informativo (medida de T1). */
export interface Foto {
  version: number;
  organizaciones: string[];
  orderStatus: string[];
  conteos: Record<string, number>;
  /**
   * Control de ceguera: filas insertadas en `organizacion` desde que existe la base (contador de
   * `pg_stat_user_tables`, que cuenta tambien las de transacciones revertidas). Si la suite corrio
   * contra ESTA base, despues tiene que ser mayor: toda tx revertida de un test crea su empresa.
   */
  insercionesOrganizacion: number;
}

/** Una organizacion que no estaba en la foto y sigue en la base, con lo que cuelga de ella. */
export interface OrganizacionSobrante {
  id: string;
  nombre: string;
  slug: string;
  /** Filas por tabla (solo las tablas con filas). Incluye `organizacion: 1`, la propia empresa. */
  filas: Record<string, number>;
  /** Identificadores legibles: `orden` -> num_remision, `zona` -> nombre, `usuario` -> email. */
  muestras: Record<string, string[]>;
}

/** Lo que se lee de la base DESPUES de la suite, ya restringido a lo que no estaba antes. */
export interface Estado {
  organizaciones: OrganizacionSobrante[];
  orderStatus: string[];
  /** Tablas con `organizacion_id` vistas al comparar. */
  tablas: number;
  /** El mismo contador que `Foto.insercionesOrganizacion`, despues de la suite. */
  insercionesOrganizacion: number;
}

/** Lo que demuestra que la comprobacion miro la base de la suite (sale en el resumen). */
export interface Control {
  tablasAntes: number;
  tablasDespues: number;
  organizacionesAntes: number;
  filasDeEmpresaAntes: number;
  insercionesDuranteLaSuite: number;
}

export interface Informe {
  version: number;
  estado: "ok" | "error";
  /** Solo en `error`: por que no se pudo comparar (sin URL ni credenciales). */
  motivo?: string;
  organizaciones: OrganizacionSobrante[];
  orderStatusNuevos: string[];
  totalFilas: number;
  control?: Control;
}

// ── Lectura de la base ────────────────────────────────────────────────────────────────────────

/** Tablas con `organizacion_id` (ordinarias o particionadas madre), como `esquema.tabla` citado. */
export async function tablasDeEmpresa(c: ClienteDeLectura): Promise<{ esquema: string; tabla: string }[]> {
  return c.$queryRawUnsafe<{ esquema: string; tabla: string }[]>(
    `SELECT n.nspname AS esquema, cl.relname AS tabla
       FROM pg_attribute a
       JOIN pg_class cl ON cl.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE a.attname = 'organizacion_id'
        AND NOT a.attisdropped
        AND cl.relkind IN ('r', 'p')
        AND NOT cl.relispartition
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_%'
      ORDER BY n.nspname, cl.relname`,
  );
}

function etiquetaDeTabla(t: { esquema: string; tabla: string }): string {
  return t.esquema === "public" ? t.tabla : `${t.esquema}.${t.tabla}`;
}

function citada(t: { esquema: string; tabla: string }): string {
  return `"${t.esquema.replace(/"/g, '""')}"."${t.tabla.replace(/"/g, '""')}"`;
}

/** R1170/R1171: la foto. Ids de `organizacion`, `value` de `order_status` y conteo por tabla. */
export async function leerFoto(c: ClienteDeLectura): Promise<Foto> {
  const orgs = await c.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text AS id FROM "organizacion" ORDER BY id`);
  const estados = await c.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value::text AS value FROM "order_status" ORDER BY value`,
  );
  const conteos: Record<string, number> = {};
  for (const t of await tablasDeEmpresa(c)) {
    const [fila] = await c.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${citada(t)}`);
    conteos[etiquetaDeTabla(t)] = fila?.n ?? 0;
  }
  return {
    version: VERSION_FOTO,
    organizaciones: orgs.map((o) => o.id),
    orderStatus: estados.map((e) => e.value),
    conteos,
    insercionesOrganizacion: await insercionesEnOrganizacion(c),
  };
}

/** `n_tup_ins` de `public.organizacion` (0 si las estadisticas no la conocen todavia). */
export async function insercionesEnOrganizacion(c: ClienteDeLectura): Promise<number> {
  const [fila] = await c.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COALESCE((SELECT n_tup_ins FROM pg_stat_user_tables
                       WHERE schemaname = 'public' AND relname = 'organizacion'), 0)::int AS n`,
  );
  return fila?.n ?? 0;
}

/** Columna legible por tabla para la muestra (R1170). */
const COLUMNA_DE_MUESTRA: Record<string, string> = {
  orden: "num_remision",
  zona: "nombre",
  usuario: "email",
};

/** R1170: lo que sobra respecto a `antes`. Solo lee las organizaciones que no estaban. */
export async function leerEstado(c: ClienteDeLectura, antes: Foto): Promise<Estado> {
  const yaEstaban = new Set(antes.organizaciones);
  const todas = await c.$queryRawUnsafe<{ id: string; nombre: string; slug: string }[]>(
    `SELECT id::text AS id, nombre, slug FROM "organizacion" ORDER BY nombre, id`,
  );
  const nuevas = todas.filter((o) => !yaEstaban.has(o.id));
  const tablas = await tablasDeEmpresa(c);
  const porId = new Map<string, OrganizacionSobrante>(
    nuevas.map((o) => [o.id, { ...o, filas: { organizacion: 1 }, muestras: {} }]),
  );
  if (nuevas.length > 0) {
    const ids = nuevas.map((o) => o.id);
    for (const t of tablas) {
      const etiqueta = etiquetaDeTabla(t);
      const conteos = await c.$queryRawUnsafe<{ org: string; n: number }[]>(
        `SELECT organizacion_id::text AS org, count(*)::int AS n
           FROM ${citada(t)}
          WHERE organizacion_id::text = ANY($1::text[])
          GROUP BY 1`,
        ids,
      );
      for (const { org, n } of conteos) {
        const o = porId.get(org);
        if (o && n > 0) o.filas[etiqueta] = n;
      }
      const columna = t.esquema === "public" ? COLUMNA_DE_MUESTRA[t.tabla] : undefined;
      if (columna === undefined || conteos.length === 0) continue;
      const muestras = await c.$queryRawUnsafe<{ org: string; valor: string }[]>(
        `SELECT org, valor FROM (
           SELECT organizacion_id::text AS org, "${columna}"::text AS valor,
                  row_number() OVER (PARTITION BY organizacion_id ORDER BY "${columna}") AS i
             FROM ${citada(t)}
            WHERE organizacion_id::text = ANY($1::text[])
         ) m WHERE i <= ${MAX_MUESTRAS} ORDER BY org, valor`,
        ids,
      );
      for (const { org, valor } of muestras) {
        const o = porId.get(org);
        if (o) (o.muestras[etiqueta] ??= []).push(valor);
      }
    }
  }
  const estados = await c.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value::text AS value FROM "order_status" ORDER BY value`,
  );
  const estadosAntes = new Set(antes.orderStatus);
  return {
    organizaciones: [...porId.values()],
    orderStatus: estados.map((e) => e.value).filter((v) => !estadosAntes.has(v)),
    tablas: tablas.length,
    insercionesOrganizacion: await insercionesEnOrganizacion(c),
  };
}

// ── Comparacion (pura) ────────────────────────────────────────────────────────────────────────

/**
 * R1170/R1176: el informe. Se vuelve a filtrar por `antes` aunque `leerEstado` ya lo haga: asi la
 * regla «lo que ya estaba no cuenta» vive en una funcion pura que los fixtures prueban sin base.
 */
export function comparar(antes: Foto, despues: Estado, opciones?: { exigirSuite?: boolean }): Informe {
  const control: Control = {
    tablasAntes: Object.keys(antes.conteos).length,
    tablasDespues: despues.tablas,
    organizacionesAntes: antes.organizaciones.length,
    filasDeEmpresaAntes: Object.values(antes.conteos).reduce((a, n) => a + n, 0),
    insercionesDuranteLaSuite: despues.insercionesOrganizacion - antes.insercionesOrganizacion,
  };
  // Comprobacion CIEGA = falla (R1174): sin tablas de empresa no hay nada que contar, y si la suite
  // no inserto ni una empresa en esta base es que corrio contra OTRA (o no corrio).
  const ciega =
    control.tablasAntes === 0 || control.tablasDespues === 0
      ? "0 tablas con organizacion_id: la foto o la comparacion no miraron una base migrada"
      : opciones?.exigirSuite && control.insercionesDuranteLaSuite <= 0
        ? "la suite no inserto ninguna organizacion en esta base: la comprobacion miro otra base o la suite no corrio"
        : undefined;
  if (ciega !== undefined) {
    return {
      version: VERSION_FOTO,
      estado: "error",
      motivo: `comprobacion ciega: ${ciega}`,
      organizaciones: [],
      orderStatusNuevos: [],
      totalFilas: 0,
      control,
    };
  }
  const orgsAntes = new Set(antes.organizaciones);
  const estadosAntes = new Set(antes.orderStatus);
  const organizaciones = despues.organizaciones.filter((o) => !orgsAntes.has(o.id));
  const orderStatusNuevos = despues.orderStatus.filter((v) => !estadosAntes.has(v));
  const totalFilas =
    organizaciones.reduce((s, o) => s + Object.values(o.filas).reduce((a, n) => a + n, 0), 0) +
    orderStatusNuevos.length;
  return { version: VERSION_FOTO, estado: "ok", organizaciones, orderStatusNuevos, totalFilas, control };
}

/** R1176: 1 si hay filas fuera de su transaccion (o no se pudo medir), 0 si no. */
export function codigoDeSalida(informe: Informe): 0 | 1 {
  if (informe.estado !== "ok") return 1;
  return informe.organizaciones.length > 0 || informe.orderStatusNuevos.length > 0 ? 1 : 0;
}

/** Lineas legibles de un informe; `prefijo` nombra el shard en `unir` (R1173). */
export function lineasDeInforme(informe: Informe, prefijo = ""): string[] {
  const c = informe.control;
  const lineaDeControl =
    c === undefined
      ? []
      : [
          `${prefijo}control: ${c.tablasAntes} tablas con organizacion_id antes / ${c.tablasDespues} despues; ` +
            `foto con ${c.organizacionesAntes} organizacion(es) y ${c.filasDeEmpresaAntes} fila(s) en esas tablas; ` +
            `${c.insercionesDuranteLaSuite} insercion(es) en organizacion durante la suite`,
        ];
  if (informe.estado !== "ok") {
    return [`${prefijo}no se pudo comparar: ${informe.motivo ?? "sin motivo"}`, ...lineaDeControl];
  }
  if (codigoDeSalida(informe) === 0) return [`${prefijo}${LINEA_CERO}`, ...lineaDeControl];
  const lineas: string[] = [...lineaDeControl];
  for (const o of informe.organizaciones) {
    const filas = Object.entries(o.filas)
      .map(([t, n]) => `${t}: ${n}`)
      .join(", ");
    lineas.push(`${prefijo}organizacion «${o.nombre}» (${o.slug}, ${o.id}) — ${filas}`);
    for (const [t, valores] of Object.entries(o.muestras)) {
      lineas.push(`${prefijo}    ${t}: ${valores.join(" | ")}`);
    }
  }
  if (informe.orderStatusNuevos.length > 0) {
    lineas.push(`${prefijo}order_status nuevos: ${informe.orderStatusNuevos.join(", ")}`);
  }
  lineas.push(`${prefijo}${informe.totalFilas} filas fuera de su transacción`);
  return lineas;
}

// ── Union de los shards (R1173, R1174) ────────────────────────────────────────────────────────

export type Modo = "informe" | "rojo";

/**
 * Lee `<dir>/informe-shard-<i>/filas-fuera-de-tx.json` de cada shard. Un informe que falta o no
 * parsea cuenta como fallo (falla cerrado, R1174). En modo `informe` (T2, para medir) el codigo es 0
 * pase lo que pase; en modo `rojo`, 1 si algun shard deja filas o no dejo informe.
 */
export function unir(dir: string, shards: number, modo: Modo): { lineas: string[]; codigo: 0 | 1 } {
  const lineas: string[] = [];
  let rojo = false;
  let total = 0;
  let sinInforme = 0;
  for (let i = 1; i <= shards; i++) {
    const ruta = join(dir, `informe-shard-${i}`, NOMBRE_INFORME);
    const prefijo = `shard ${i}/${shards}: `;
    if (!existsSync(ruta)) {
      lineas.push(`${prefijo}falta el informe de filas fuera de su transacción (${NOMBRE_INFORME})`);
      rojo = true;
      sinInforme++;
      continue;
    }
    let informe: Informe;
    try {
      informe = JSON.parse(readFileSync(ruta, "utf8")) as Informe;
    } catch {
      lineas.push(`${prefijo}el informe de filas fuera de su transacción no es JSON valido`);
      rojo = true;
      sinInforme++;
      continue;
    }
    lineas.push(...lineasDeInforme(informe, prefijo));
    if (codigoDeSalida(informe) !== 0) rojo = true;
    if (informe.estado !== "ok") sinInforme++;
    total += informe.estado === "ok" ? informe.totalFilas : 0;
  }
  if (!rojo) lineas.push(`total: ${LINEA_CERO}`);
  else lineas.push(`total: ${total} filas fuera de su transacción; ${sinInforme} shard(s) sin informe valido`);
  if (modo === "informe") lineas.push("modo informe: se mide sin poner el gate en rojo");
  return { lineas, codigo: modo === "rojo" && rojo ? 1 : 0 };
}

// ── Conexion (solo `foto` y `comparar`) ───────────────────────────────────────────────────────

/** Corre `fn` en una transaccion de SOLO LECTURA con una sola instantanea (R1175). */
export async function enSoloLectura<T>(
  prisma: Pick<PrismaClient, "$transaction">,
  fn: (c: ClienteDeLectura) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET TRANSACTION READ ONLY`);
      return fn(tx);
    },
    { isolationLevel: "RepeatableRead", timeout: 120_000, maxWait: 30_000 },
  );
}

async function conBase<T>(fn: (c: ClienteDeLectura) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile();
    } catch {
      // sin .env: se usa lo que ya haya en el entorno
    }
  }
  if (!process.env.DATABASE_URL) throw new ErrorSinUrl("falta DATABASE_URL en el entorno");
  const { PrismaClient: Cliente } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new Cliente({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
  try {
    return await enSoloLectura(prisma, fn);
  } finally {
    await prisma.$disconnect();
  }
}

/** Error cuyo mensaje es seguro de imprimir (lo escribe este script, nunca el driver). */
class ErrorSinUrl extends Error {}

/** R1189: de un error del driver solo sale su codigo o su clase, nunca el mensaje. */
export function motivoSeguro(e: unknown): string {
  if (e instanceof ErrorSinUrl) return e.message;
  const o = (e ?? {}) as { code?: unknown; name?: unknown; cause?: { code?: unknown } };
  const codigo = o.code ?? o.cause?.code;
  const nombre = typeof o.name === "string" ? o.name : "Error";
  return typeof codigo === "string" ? `${nombre} (${codigo})` : nombre;
}

function escribir(ruta: string, datos: unknown): void {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`);
}

function resumenDeFoto(f: Foto): string[] {
  const conFilas = Object.entries(f.conteos).filter(([, n]) => n > 0);
  return [
    `foto: ${f.organizaciones.length} organizacion(es), ${f.orderStatus.length} order_status, ` +
      `${Object.keys(f.conteos).length} tablas con organizacion_id (${conFilas.length} con filas), ` +
      `${f.insercionesOrganizacion} insercion(es) historicas en organizacion`,
    ...conFilas.map(([t, n]) => `    ${t}: ${n}`),
  ];
}

async function main(argv: string[]): Promise<number> {
  const [orden, ...args] = argv;
  if (orden === "foto" && args[0]) {
    try {
      const foto = await conBase(leerFoto);
      escribir(args[0], foto);
      for (const l of resumenDeFoto(foto)) console.log(l);
      return 0;
    } catch (e) {
      console.error(`filas-fuera-de-tx: no se pudo tomar la foto: ${motivoSeguro(e)}`);
      return 2;
    }
  }
  if (orden === "comparar" && args[0] && args[1]) {
    let informe: Informe;
    try {
      if (!existsSync(args[0])) throw new ErrorSinUrl("no hay foto «antes» (el paso de la foto no corrio o fallo)");
      const antes = JSON.parse(readFileSync(args[0], "utf8")) as Foto;
      if (antes.version !== VERSION_FOTO) throw new ErrorSinUrl(`foto con version ${antes.version}, se espera ${VERSION_FOTO}`);
      informe = comparar(antes, await conBase((c) => leerEstado(c, antes)), { exigirSuite: true });
    } catch (e) {
      informe = {
        version: VERSION_FOTO,
        estado: "error",
        motivo: motivoSeguro(e),
        organizaciones: [],
        orderStatusNuevos: [],
        totalFilas: 0,
      };
    }
    escribir(args[1], informe);
    for (const l of lineasDeInforme(informe)) console.log(l);
    return codigoDeSalida(informe);
  }
  if (orden === "unir" && args[0] && args[1]) {
    const shards = Number(args[1]);
    const iModo = args.indexOf("--modo");
    const modo = iModo >= 0 ? args[iModo + 1] : "rojo";
    if (!Number.isInteger(shards) || shards < 1 || (modo !== "informe" && modo !== "rojo")) {
      console.error("filas-fuera-de-tx: uso: unir <dir> <n> [--modo informe|rojo]");
      return 2;
    }
    const { lineas, codigo } = unir(args[0], shards, modo);
    for (const l of lineas) console.log(l);
    return codigo;
  }
  console.error(
    "uso: filas-fuera-de-tx foto <antes.json> | comparar <antes.json> <informe.json> | unir <dir> <n> [--modo informe|rojo]",
  );
  return 2;
}

const esEntrada = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrada) {
  main(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (e: unknown) => {
      console.error(`filas-fuera-de-tx: ${motivoSeguro(e)}`);
      process.exit(2);
    },
  );
}
