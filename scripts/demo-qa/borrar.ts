import { Prisma, type PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { IAlmacenDescargas } from "@/lib/interfaces/external/IAlmacenDescargas";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import { esViolacionDeClaveForanea } from "@/lib/repositories/_shared/prisma-fk";
import { MAX_OBJETOS_POR_CORRIDA } from "@/lib/services/PurgaDescargasService";
import { SupabaseAlmacenDescargas } from "@/lib/storage/SupabaseAlmacenDescargas";
import { SupabaseFileStorage } from "@/lib/storage/SupabaseFileStorage";
import { RUTAS_GUARDADAS } from "@/scripts/migrar-storage-a-carpetas";

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
    readonly causa: { nombre: string; codigo: string | null },
  ) {
    super(
      `[demo-qa] el borrado falló en la tabla ${tabla} (${causa.nombre}` +
        `${causa.codigo === null ? "" : `, código ${causa.codigo}`}); no se borró nada.`,
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

/** Nombre y código de un error, sin su mensaje. El código es el SQLSTATE o el de Prisma, si lo hay. */
function causaDe(error: unknown): { nombre: string; codigo: string | null } {
  if (error === null || typeof error !== "object") return { nombre: typeof error, codigo: null };
  const e = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } };
  const nombre = typeof e.name === "string" ? e.name : "Error";
  const codigo =
    typeof e.cause?.code === "string" ? e.cause.code : typeof e.code === "string" ? e.code : null;
  return { nombre, codigo };
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
  for (const entrada of RUTAS_GUARDADAS) {
    const filas = await entrada.leer(dueno, { organizacionId: { in: [organizacionId] } });
    const bucket = entrada.bucket();
    const rutas = porBucket.get(bucket) ?? new Set<string>();
    for (const f of filas) {
      if (f.organizacionId === organizacionId && f.ruta !== null && f.ruta !== "") rutas.add(f.ruta);
    }
    porBucket.set(bucket, rutas);
  }

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
type Paso = { tabla: string; columna: string; ids: "empresas" | "usuarios" };

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

      let filas = 0;
      let pasadas = 0;
      let pendientes = pasos;
      while (pendientes.length > 0) {
        pasadas++;
        const bloqueados: Paso[] = [];
        for (const paso of pendientes) {
          const valores = paso.ids === "empresas" ? empresas : usuarios;
          if (valores.length === 0) continue;
          await tx.$executeRawUnsafe(`SAVEPOINT demo_qa_paso`);
          try {
            filas += await tx.$executeRawUnsafe(
              `DELETE FROM ${id(paso.tabla)} WHERE ${id(paso.columna)} = ANY($1::text[])`,
              valores,
            );
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

  for (const organizacionId of empresas) {
    const r = await borrarArchivosDeEmpresa(dueno, organizacionId, almacenes, ahora);
    storage.rutas += r.rutas;
    storage.temporales += r.temporales;
  }
  const base = await borrarFilasDeEmpresas(dueno, empresas);
  return { empresas, storage, base };
}
