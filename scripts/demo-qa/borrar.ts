import { Prisma, type PrismaClient } from "@prisma/client";

import { loadEtiquetasConfig } from "@/lib/config/etiquetas";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { IAlmacenDescargas } from "@/lib/interfaces/external/IAlmacenDescargas";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import { esViolacionDeClaveForanea, sqlStateDe } from "@/lib/repositories/_shared/prisma-fk";
import { MAX_OBJETOS_POR_CORRIDA } from "@/lib/services/PurgaDescargasService";
import { SupabaseAlmacenDescargas } from "@/lib/storage/SupabaseAlmacenDescargas";
import { SupabaseFileStorage } from "@/lib/storage/SupabaseFileStorage";
import { RUTAS_GUARDADAS } from "@/scripts/migrar-storage-a-carpetas";

import { enParalelo } from "./paralelo";

// SL-43 (design §3.2 y §4; R7, R8, R9, R10, R28) — el borrado de las empresas demo de QA.
//
// Una empresa es demo por `organizacion.es_demo`, que solo pone la demo como dueño (D11). Nunca por
// su slug ni por su nombre: el slug solo sirve para la comprobación de R10.
//
// Orden fijo, por empresa: primero sus archivos (las rutas viven en sus filas) y después sus filas.
// Si la base falla, la empresa sigue marcada y la siguiente ejecución lo vuelve a intentar (R28).
//
// Corre con el rol DUEÑO de la base (D12), sobre el cliente que recibe: sin la extensión de empresa y
// con una sola conexión, la misma del candado (T9). `servi_app` no puede borrar órdenes, cargos de la
// plataforma ni la caja, y eso es lo que pidieron SL-40 y SL-45; aquí se usa solo tras la guardia de
// entorno y filtrando por `es_demo`.
//
// Ningún error lleva el mensaje de la base ni de Storage: pueden llevar datos o la URL. Solo nombres
// de tabla (salen del catálogo), el nombre del error y su código.

/** Las dos empresas de la demo (D3.2). Los slugs son fijos: R10 los comprueba antes de borrar. */
export const EMPRESAS_DEMO = [
  { clave: "A", slug: "demo-qa-a", nombre: "Demo QA A" },
  { clave: "B", slug: "demo-qa-b", nombre: "Demo QA B" },
] as const;

export const SLUGS_DEMO: readonly string[] = EMPRESAS_DEMO.map((e) => e.slug);

/** El cliente dueño (`DIRECT_URL`), sin la extensión de empresa. */
export type ClienteDuenoDemo = PrismaClient;

/** R10: hay una empresa real (`es_demo = false`) con un slug de la demo. No se borra ni se crea nada. */
export class SlugDemoEnEmpresaReal extends Error {
  constructor() {
    super(
      `[demo-qa] una empresa real usa un slug de la demo (${SLUGS_DEMO.join(" o ")}). ` +
        "No se borra ni se crea nada: renombra esa empresa antes de volver a correr la demo.",
    );
    this.name = "SlugDemoEnEmpresaReal";
  }
}

/** R8: una pasada entera no borró nada y quedan tablas. La transacción revierte entera. */
export class BorradoDemoBloqueado extends Error {
  constructor(readonly tablas: readonly string[]) {
    super(
      `[demo-qa] el borrado de las empresas demo no pudo completarse; no se borró nada. ` +
        `Tablas que lo impidieron: ${tablas.join(", ")}`,
    );
    this.name = "BorradoDemoBloqueado";
  }
}

/** Un error que no es una FK al borrar una tabla. La transacción revierte entera. */
export class BorradoDemoFallido extends Error {
  constructor(
    readonly tabla: string,
    readonly causa: Causa,
  ) {
    super(
      `[demo-qa] el borrado falló en la tabla ${tabla} (${causa.nombre}` +
        `${causa.codigo === null ? "" : `, código ${causa.codigo}`}` +
        `${causa.sqlstate === null || causa.sqlstate === causa.codigo ? "" : `, SQLSTATE ${causa.sqlstate}`}); ` +
        "no se borró nada.",
    );
    this.name = "BorradoDemoFallido";
  }
}

/** Defensa en profundidad: alguien pidió borrar una empresa que no está marcada como demo. */
export class EmpresaNoDemo extends Error {
  constructor() {
    super("[demo-qa] se pidió borrar una empresa que no es demo: no se borra nada.");
    this.name = "EmpresaNoDemo";
  }
}

/** Nombre, código y SQLSTATE de un error, sin su mensaje ni su `detail` (llevan datos). */
type Causa = { nombre: string; codigo: string | null; sqlstate: string | null };

/**
 * El código es el SQLSTATE o el de Prisma, si lo hay. El SQLSTATE aparte porque bajo el adapter un
 * `$executeRawUnsafe` fallido llega como `P2010` y el SQLSTATE va colgado (`sqlStateDe`): sin él,
 * el rojo de CI del run 40271163801 decía solo «P2010» y no se podía saber qué falló.
 */
function causaDe(error: unknown): Causa {
  if (error === null || typeof error !== "object") return { nombre: typeof error, codigo: null, sqlstate: null };
  const e = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } };
  const nombre = typeof e.name === "string" ? e.name : "Error";
  const codigo =
    typeof e.cause?.code === "string" ? e.cause.code : typeof e.code === "string" ? e.code : null;
  return { nombre, codigo, sqlstate: sqlStateDe(error) };
}

/** Los ids de las empresas demo, como dueño. */
export async function empresasDemo(dueno: ClienteDuenoDemo): Promise<string[]> {
  const filas = await dueno.organizacion.findMany({
    where: { esDemo: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return filas.map((f) => f.id);
}

/** R10: si una empresa real tiene un slug de la demo, lanza `SlugDemoEnEmpresaReal`. */
export async function comprobarSlugs(dueno: ClienteDuenoDemo): Promise<void> {
  const reales = await dueno.organizacion.count({
    where: { slug: { in: [...SLUGS_DEMO] }, esDemo: false },
  });
  if (reales > 0) throw new SlugDemoEnEmpresaReal();
}

/** Lanza `EmpresaNoDemo` si algún id no es de una empresa marcada como demo. */
async function exigirSoloDemo(dueno: ClienteDuenoDemo, ids: readonly string[]): Promise<void> {
  const marcadas = await dueno.organizacion.count({ where: { id: { in: [...ids] }, esDemo: true } });
  if (marcadas !== new Set(ids).size) throw new EmpresaNoDemo();
}

// ─── Storage (D4.1, R9) ─────────────────────────────────────────────────────────────────────────

/** Los adaptadores de `lib/storage/` que usa el borrado. Inyectables para el doble del test. */
export interface AlmacenesDemo {
  archivos(bucket: string): Pick<IFileStorage, "remove">;
  descargas(): Pick<IAlmacenDescargas, "purgarAnterioresA">;
}

/** Los de verdad: el cliente de Storage lo crea cada adaptador, perezoso, con `SUPABASE_URL`. */
export const ALMACENES_DE_SUPABASE: AlmacenesDemo = {
  archivos: (bucket) => new SupabaseFileStorage(undefined, bucket),
  descargas: () => new SupabaseAlmacenDescargas(),
};

/** Rutas por llamada a `remove`: el API de Storage acepta lotes acotados. */
const LOTE_REMOVE = 1000;
/** Vueltas de la purga de temporales antes de rendirse: con 5000 por vuelta, medio millón. */
const MAX_VUELTAS_PURGA = 100;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

export type ResumenStorage = { rutas: number; temporales: number };

/**
 * La ruta dentro de la carpeta de la empresa que nombra una URL firmada de Storage
 * (`…/object/sign/<bucket>/<organizacion_id>/<ruta>?token=…`). `null` si la URL es de otro bucket,
 * de otra carpeta o no se puede leer: nunca se borra lo que no se reconoce.
 */
export function rutaDeUrlFirmada(url: string, bucket: string, organizacionId: string): string | null {
  let camino: string;
  try {
    camino = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const marca = `/object/sign/${bucket}/${organizacionId}/`;
  const i = camino.indexOf(marca);
  if (i === -1) return null;
  const ruta = camino.slice(i + marca.length);
  return ruta === "" || ruta.split("/").includes("..") ? null : ruta;
}

/**
 * R9: borra los archivos de UNA empresa demo: los que nombran sus filas (`RUTAS_GUARDADAS`, por
 * bucket) y sus temporales de descarga. Dentro de `conEmpresa(<demo>)`: el adaptador solo puede
 * expresar `<demo>/<ruta>`, así que un archivo de otra empresa es inalcanzable por construcción.
 */
export async function borrarArchivosDeEmpresa(
  dueno: ClienteDuenoDemo,
  organizacionId: string,
  almacenes: AlmacenesDemo,
  ahora: Date,
): Promise<ResumenStorage> {
  const porBucket = new Map<string, Set<string>>();
  // Las lecturas a la vez: con el lector de la demo (varias conexiones) son una ida y vuelta, no 23.
  const leidas = await enParalelo(RUTAS_GUARDADAS.map((entrada) => entrada.leer(dueno, { organizacionId: { in: [organizacionId] } })));
  for (const [i, entrada] of RUTAS_GUARDADAS.entries()) {
    const filas = leidas[i];
    const bucket = entrada.bucket();
    const rutas = porBucket.get(bucket) ?? new Set<string>();
    for (const f of filas) {
      if (f.organizacionId === organizacionId && f.ruta !== null && f.ruta !== "") rutas.add(f.ruta);
    }
    porBucket.set(bucket, rutas);
  }
  // El PDF de etiquetas de una carga por API (features 136/141) no deja su ruta en ninguna columna
  // de `RUTAS_GUARDADAS`: solo su URL firmada, en `carga.download_url` u `orden.download_url`. Sin
  // esto quedaba en Storage tras el borrado (lo midió T10).
  const etiquetas = loadEtiquetasConfig().ETIQUETAS_BUCKET;
  const rutasEtiquetas = porBucket.get(etiquetas) ?? new Set<string>();
  const firmadas = (
    await enParalelo([
      dueno.carga.findMany({ where: { organizacionId, downloadUrl: { not: null } }, select: { downloadUrl: true } }),
      dueno.orden.findMany({ where: { organizacionId, downloadUrl: { not: null } }, select: { downloadUrl: true } }),
    ])
  ).flat();
  for (const { downloadUrl } of firmadas) {
    const ruta = downloadUrl === null ? null : rutaDeUrlFirmada(downloadUrl, etiquetas, organizacionId);
    if (ruta !== null) rutasEtiquetas.add(ruta);
  }
  porBucket.set(etiquetas, rutasEtiquetas);

  return conEmpresa(organizacionId, async () => {
    let total = 0;
    for (const [bucket, rutas] of porBucket) {
      const lista = [...rutas];
      for (let i = 0; i < lista.length; i += LOTE_REMOVE) {
        await almacenes.archivos(bucket).remove(lista.slice(i, i + LOTE_REMOVE));
      }
      total += lista.length;
    }

    // Un corte en el futuro: todo temporal de la empresa es «anterior», también el recién subido.
    const corte = new Date(ahora.getTime() + UN_DIA_MS);
    const descargas = almacenes.descargas();
    let temporales = 0;
    for (let vuelta = 0; ; vuelta++) {
      if (vuelta >= MAX_VUELTAS_PURGA) {
        throw new Error("[demo-qa] la purga de temporales de descarga no terminó tras el máximo de vueltas");
      }
      const r = await descargas.purgarAnterioresA(corte, MAX_OBJETOS_POR_CORRIDA);
      temporales += r.borrados;
      if (!r.quedaPendiente) break;
    }
    return { rutas: total, temporales };
  });
}

// ─── Base (D4.2, R7, R8) ────────────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

/** Un `DELETE` de la pasada: una tabla y la columna por la que cuelga de la demo. */
export type Paso = { tabla: string; columna: string; ids: "empresas" | "usuarios" };

/**
 * Tablas de plataforma con un usuario pero SIN FK hacia `usuario`: `pg_constraint` no las ve.
 * `"Session"."userId"` es la sesión de login (sin FK desde `20260709194415_add_session_table`).
 */
const COLUMNAS_DE_USUARIO_SIN_FK: readonly { tabla: string; columna: string }[] = [
  { tabla: "Session", columna: "userId" },
];

const TIMEOUT_TRANSACCION_MS = 300_000;
const ESPERA_TRANSACCION_MS = 30_000;

const id = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;

/** Las tablas con `organizacion_id`, del catálogo, sin `organizacion` ni `usuario` (van al final). */
async function tablasConEmpresa(tx: Tx): Promise<string[]> {
  const filas = await tx.$queryRaw<{ tabla: string }[]>(Prisma.sql`
    SELECT c.table_name AS "tabla"
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'organizacion_id'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name NOT IN ('organizacion', 'usuario')
     ORDER BY 1`);
  return filas.map((f) => f.tabla);
}

/** Las FK hacia `usuario(id)` de tablas SIN `organizacion_id`: filas de plataforma de un usuario. */
async function columnasHaciaUsuario(tx: Tx): Promise<{ tabla: string; columna: string }[]> {
  const porFk = await tx.$queryRaw<{ tabla: string; columna: string }[]>(Prisma.sql`
    SELECT DISTINCT cl.relname AS "tabla", a.attname AS "columna"
      FROM pg_constraint co
      JOIN pg_class cl ON cl.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
     WHERE co.contype = 'f'
       AND co.confrelid = 'public.usuario'::regclass
       AND n.nspname = 'public'
       AND array_length(co.conkey, 1) = 1
       AND NOT EXISTS (
             SELECT 1 FROM information_schema.columns ic
              WHERE ic.table_schema = 'public' AND ic.table_name = cl.relname
                AND ic.column_name = 'organizacion_id')
     ORDER BY 1, 2`);
  const sinFk: { tabla: string; columna: string }[] = [];
  for (const c of COLUMNAS_DE_USUARIO_SIN_FK) {
    const existe = await tx.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS "n" FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ${c.tabla} AND column_name = ${c.columna}`);
    if ((existe[0]?.n ?? 0) > 0) sinFk.push(c);
  }
  return [...porFk, ...sinFk];
}

/**
 * El `DELETE` de un paso. Es el único SQL de tabla dinámica del borrado, y lo usan las dos formas de
 * borrar (la pasada en orden y las pasadas con SAVEPOINT): la guardia de SL-45 lo cuenta.
 */
function borrarPaso(tx: Tx, paso: Paso, valores: string[]): Promise<number> {
  return tx.$executeRawUnsafe(`DELETE FROM ${id(paso.tabla)} WHERE ${id(paso.columna)} = ANY($1::text[])`, valores);
}

/** Las FK entre las tablas de los pasos (sin las de una tabla a sí misma): `hija` va antes que `madre`. */
async function fksEntre(tx: Tx, pasos: readonly Paso[]): Promise<{ hija: string; madre: string }[]> {
  const tablas = [...new Set(pasos.map((p) => p.tabla))];
  return tx.$queryRaw<{ hija: string; madre: string }[]>(Prisma.sql`
    SELECT DISTINCT h.relname::text AS "hija", m.relname::text AS "madre"
      FROM pg_constraint co
      JOIN pg_class h ON h.oid = co.conrelid
      JOIN pg_class m ON m.oid = co.confrelid
      JOIN pg_namespace n ON n.oid = h.relnamespace
     WHERE co.contype = 'f'
       AND n.nspname = 'public'
       AND h.oid <> m.oid
       AND h.relname = ANY(${tablas}::text[])
       AND m.relname = ANY(${tablas}::text[])`);
}

/**
 * Los pasos con cada tabla antes que aquellas a las que apunta (orden topológico, estable). Lo que
 * queda en un ciclo va al final en su orden: esa pasada fallará y el borrado seguirá por pasadas.
 */
export function ordenarPorFk(pasos: readonly Paso[], aristas: readonly { hija: string; madre: string }[]): Paso[] {
  const tablas = [...new Set(pasos.map((p) => p.tabla))];
  const hijasPendientes = new Map(tablas.map((t) => [t, new Set<string>()]));
  for (const { hija, madre } of aristas) if (hijasPendientes.has(hija)) hijasPendientes.get(madre)?.add(hija);
  const orden: string[] = [];
  const restantes = new Set(tablas);
  while (restantes.size > 0) {
    const lista = tablas.find((t) => restantes.has(t) && (hijasPendientes.get(t)?.size ?? 0) === 0);
    if (lista === undefined) break;
    orden.push(lista);
    restantes.delete(lista);
    for (const hijas of hijasPendientes.values()) hijas.delete(lista);
  }
  orden.push(...tablas.filter((t) => restantes.has(t)));
  return orden.flatMap((t) => pasos.filter((p) => p.tabla === t));
}

/**
 * Una pasada sin SAVEPOINT por tabla, dentro de uno solo. Devuelve las filas borradas, o `null` si
 * algo falló: entonces la pasada se deshace entera y no queda nada a medias.
 */
async function borrarEnOrdenDeFk(
  tx: Tx,
  pasos: readonly Paso[],
  empresas: string[],
  usuarios: string[],
): Promise<number | null> {
  await tx.$executeRawUnsafe(`SAVEPOINT demo_qa_en_orden`);
  try {
    let filas = 0;
    for (const paso of pasos) {
      const valores = paso.ids === "empresas" ? empresas : usuarios;
      if (valores.length === 0) continue;
      filas += await borrarPaso(tx, paso, valores);
    }
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT demo_qa_en_orden`);
    return filas;
  } catch {
    // El error no se pierde: la pasada por tablas lo vuelve a encontrar y lo nombra (R8).
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT demo_qa_en_orden`);
    return null;
  }
}

export type ResumenBase = { filas: number; pasadas: number; usuarios: number; organizaciones: number };

/**
 * R7, R8: borra todas las filas de las empresas `ids` en UNA transacción. Cada `DELETE` va en su
 * `SAVEPOINT`; el que choca con una FK se deshace y pasa a la siguiente pasada. Si una pasada entera
 * no borra nada y quedan tablas, lanza `BorradoDemoBloqueado` con sus nombres y la transacción
 * revierte: no queda nada borrado. Al final, `usuario` y `organizacion`.
 */
export async function borrarFilasDeEmpresas(
  dueno: ClienteDuenoDemo,
  ids: readonly string[],
): Promise<ResumenBase> {
  if (ids.length === 0) return { filas: 0, pasadas: 0, usuarios: 0, organizaciones: 0 };
  await exigirSoloDemo(dueno, ids);
  const empresas = [...ids];

  return dueno.$transaction(
    async (tx) => {
      const usuarios = (
        await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "usuario" WHERE "organizacion_id" = ANY(${empresas}::text[])`)
      ).map((u) => u.id);

      const pasos: Paso[] = [
        ...(await columnasHaciaUsuario(tx)).map((c) => ({ ...c, ids: "usuarios" as const })),
        ...(await tablasConEmpresa(tx)).map((tabla) => ({ tabla, columna: "organizacion_id", ids: "empresas" as const })),
      ];

      // Primero, una sola pasada en el orden de las FK, sin un SAVEPOINT por tabla: en el build de QA
      // cada ida y vuelta son ~90 ms, y el borrado por pasadas hacía tres por tabla. Si algo choca
      // (un ciclo, una FK que el orden no ve), se deshace entera y se sigue por pasadas, que es el
      // camino que decide qué tabla lo impide (R8).
      const rapido = await borrarEnOrdenDeFk(tx, ordenarPorFk(pasos, await fksEntre(tx, pasos)), empresas, usuarios);
      let filas = rapido ?? 0;
      let pasadas = rapido === null ? 0 : 1;
      let pendientes = rapido === null ? pasos : [];
      while (pendientes.length > 0) {
        pasadas++;
        const bloqueados: Paso[] = [];
        for (const paso of pendientes) {
          const valores = paso.ids === "empresas" ? empresas : usuarios;
          if (valores.length === 0) continue;
          await tx.$executeRawUnsafe(`SAVEPOINT demo_qa_paso`);
          try {
            filas += await borrarPaso(tx, paso, valores);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT demo_qa_paso`);
          } catch (error) {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT demo_qa_paso`);
            if (!esViolacionDeClaveForanea(error)) throw new BorradoDemoFallido(paso.tabla, causaDe(error));
            bloqueados.push(paso);
          }
        }
        if (bloqueados.length > 0 && bloqueados.length === pendientes.length) {
          throw new BorradoDemoBloqueado([...new Set(bloqueados.map((p) => p.tabla))]);
        }
        pendientes = bloqueados;
      }

      const usuariosBorrados = await borrarFinal(
        tx,
        "usuario",
        `DELETE FROM "usuario" WHERE "organizacion_id" = ANY($1::text[])`,
        empresas,
      );
      const organizaciones = await borrarFinal(
        tx,
        "organizacion",
        `DELETE FROM "organizacion" WHERE "id" = ANY($1::text[]) AND "es_demo"`,
        empresas,
      );
      return { filas, pasadas, usuarios: usuariosBorrados, organizaciones };
    },
    { timeout: TIMEOUT_TRANSACCION_MS, maxWait: ESPERA_TRANSACCION_MS },
  );
}

/** `usuario` y `organizacion`: sin pasadas, lo que las bloquee ya no se puede borrar después. */
async function borrarFinal(tx: Tx, tabla: string, sql: string, empresas: string[]): Promise<number> {
  try {
    return await tx.$executeRawUnsafe(sql, empresas);
  } catch (error) {
    if (esViolacionDeClaveForanea(error)) throw new BorradoDemoBloqueado([tabla]);
    throw new BorradoDemoFallido(tabla, causaDe(error));
  }
}

// ─── El borrado entero ──────────────────────────────────────────────────────────────────────────

export interface OpcionesBorrado {
  almacenes?: AlmacenesDemo;
  ahora?: Date;
  /**
   * El dueño con varias conexiones (`ConexionDemo.lector`), para leer a la vez las rutas de Storage.
   * Sin él, se leen con el cliente del borrado. La transacción va siempre por el del borrado.
   */
  lector?: ClienteDuenoDemo;
}

export type ResultadoBorrado = { empresas: string[]; storage: ResumenStorage; base: ResumenBase };

/**
 * R7–R10, R28: comprueba los slugs (R10), busca las empresas demo y borra, de cada una, primero sus
 * archivos y después todas sus filas. Sin empresas demo, no hace nada.
 */
export async function borrarEmpresasDemo(
  dueno: ClienteDuenoDemo,
  opciones: OpcionesBorrado = {},
): Promise<ResultadoBorrado> {
  const almacenes = opciones.almacenes ?? ALMACENES_DE_SUPABASE;
  const ahora = opciones.ahora ?? new Date();

  await comprobarSlugs(dueno);
  const empresas = await empresasDemo(dueno);
  const storage: ResumenStorage = { rutas: 0, temporales: 0 };
  if (empresas.length === 0) {
    return { empresas, storage, base: { filas: 0, pasadas: 0, usuarios: 0, organizaciones: 0 } };
  }
  await exigirSoloDemo(dueno, empresas);

  // Los archivos de cada empresa, a la vez: carpetas distintas (`<organizacion_id>/…`).
  const porEmpresa = await enParalelo(
    empresas.map((organizacionId) => borrarArchivosDeEmpresa(opciones.lector ?? dueno, organizacionId, almacenes, ahora)),
  );
  for (const r of porEmpresa) {
    storage.rutas += r.rutas;
    storage.temporales += r.temporales;
  }
  const base = await borrarFilasDeEmpresas(dueno, empresas);
  return { empresas, storage, base };
}
