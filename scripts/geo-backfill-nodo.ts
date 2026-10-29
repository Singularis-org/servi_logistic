import { setTimeout as esperar } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";

// SLT-43 (design §4; R24–R33, R40) — llena las columnas nuevas de la geografía jerárquica en las filas
// que ya existían al migrar:
//
//   pnpm geo:backfill [--aplicar | --validar | --equivalencia] [--tabla <t>] [--lote 1000]
//                     [--pausa-ms 0] [--base <nombre>]
//
// Las migraciones solo añaden las columnas y los triggers que las llenan al escribir; un `UPDATE` de
// toda `orden` dentro del deploy la bloquearía mientras dura y no se podría pausar (design §8, alt. 2).
// Por eso las filas viejas las llena este comando, por lotes, una sentencia (= una transacción) por
// lote, y lo corre una persona fuera de horario (design §6). Ningún agente lo lanza contra producción.
//
// Reanudable por construcción: cada lote filtra `col IS NULL`, así que relanzarlo sigue donde quedó y,
// con todo lleno, no escribe nada (R28). El cursor por id solo evita releer lo ya visto en la misma
// ejecución (una fila que el lote no pudo llenar no lo atasca).
//
// Solo escribe columnas NUEVAS de SLT-43 (R29): `orden.updated_at` es `@updatedAt` de Prisma, no un
// trigger, así que un `UPDATE` que no lo nombra lo deja igual; y ningún trigger de cobro responde a
// estas columnas (R30).
//
// Corre como dueño, sin filtro de empresa (`comoPlataforma`, `EXCEPCIONES_DE_PLATAFORMA`): las filas
// pendientes son de todas las empresas. Solo imprime cifras e ids de zona o de país: nunca nombres de
// destinatarios ni direcciones.

/** Lo que el comando necesita de la conexión: el cliente de la app o la tx de un test. */
export interface ConexionSql {
  $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): PromiseLike<T>;
  $executeRawUnsafe(sql: string, ...valores: unknown[]): PromiseLike<number>;
}

export type TablaConColumnaNueva = "orden" | "zona_distrito" | "distrito_zona_especial" | "cierre_detail";

export const TABLAS: readonly TablaConColumnaNueva[] = [
  "orden",
  "zona_distrito",
  "distrito_zona_especial",
  "cierre_detail",
];

/** Las tres FK que nacen `NOT VALID` (R24); `cierre_detail` no tiene FK nueva. */
export const FKS_SIN_VALIDAR: readonly { tabla: TablaConColumnaNueva; restriccion: string }[] = [
  { tabla: "orden", restriccion: "orden_nodo_geografico_id_fkey" },
  { tabla: "zona_distrito", restriccion: "zona_distrito_nodo_geografico_id_fkey" },
  { tabla: "distrito_zona_especial", restriccion: "distrito_zona_especial_nodo_geografico_id_fkey" },
];

const COLUMNA: Record<TablaConColumnaNueva, string> = {
  orden: "nodo_geografico_id",
  zona_distrito: "nodo_geografico_id",
  distrito_zona_especial: "nodo_geografico_id",
  cierre_detail: "ubicacion_snapshot",
};

export const LOTE_POR_DEFECTO = 1000;

/* -------------------------------------------------------------------------- */
/* Comprobación (sin opciones; R25)                                            */
/* -------------------------------------------------------------------------- */

export interface Comprobacion {
  ordenesConDistritoDeOtroCanton: number;
  ordenesConCantonDeOtraProvincia: number;
  totalOrdenes: number;
  ordenesSinDistrito: number;
  pendientes: Record<TablaConColumnaNueva, number>;
}

/** R25: solo lectura. Las dos primeras cifras son las que impiden escribir (R26). */
export async function comprobar(db: ConexionSql): Promise<Comprobacion> {
  const [f] = await db.$queryRawUnsafe<
    {
      distrito_mal: number;
      canton_mal: number;
      total: number;
      sin_distrito: number;
      p_orden: number;
      p_zona: number;
      p_especial: number;
      p_cierre: number;
    }[]
  >(`SELECT
      (SELECT count(*)::int FROM orden o JOIN distrito d ON d.id = o.distrito_id
        WHERE d.canton_id <> o.canton_id) AS distrito_mal,
      (SELECT count(*)::int FROM orden o JOIN canton c ON c.id = o.canton_id
        WHERE c.provincia_id <> o.provincia_id) AS canton_mal,
      (SELECT count(*)::int FROM orden) AS total,
      (SELECT count(*)::int FROM orden WHERE distrito_id IS NULL) AS sin_distrito,
      (SELECT count(*)::int FROM orden WHERE nodo_geografico_id IS NULL) AS p_orden,
      (SELECT count(*)::int FROM zona_distrito WHERE nodo_geografico_id IS NULL) AS p_zona,
      (SELECT count(*)::int FROM distrito_zona_especial WHERE nodo_geografico_id IS NULL) AS p_especial,
      (SELECT count(*)::int FROM cierre_detail WHERE ubicacion_snapshot IS NULL) AS p_cierre`);
  return {
    ordenesConDistritoDeOtroCanton: f.distrito_mal,
    ordenesConCantonDeOtraProvincia: f.canton_mal,
    totalOrdenes: f.total,
    ordenesSinDistrito: f.sin_distrito,
    pendientes: {
      orden: f.p_orden,
      zona_distrito: f.p_zona,
      distrito_zona_especial: f.p_especial,
      cierre_detail: f.p_cierre,
    },
  };
}

export function jerarquiaRota(c: Comprobacion): boolean {
  return c.ordenesConDistritoDeOtroCanton > 0 || c.ordenesConCantonDeOtraProvincia > 0;
}

/* -------------------------------------------------------------------------- */
/* Escritura por lotes (--aplicar; R27, R28, R31, R40)                          */
/* -------------------------------------------------------------------------- */

// Cada lote es UNA sentencia: elige los ids pendientes por keyset y los llena. Fuera de una transacción
// explícita, Postgres la confirma sola: un corte entre lotes deja confirmado todo lo anterior.
const LOTE_PENDIENTE = (tabla: TablaConColumnaNueva) =>
  `SELECT id FROM ${tabla} WHERE id > $1 AND ${COLUMNA[tabla]} IS NULL ORDER BY id LIMIT $2::int`;

const ACTUALIZAR: Record<TablaConColumnaNueva, string> = {
  // R20: el nodo de la orden es su distrito o, sin distrito, su cantón (los ids se conservan, R13).
  orden: `UPDATE orden t SET nodo_geografico_id = COALESCE(t.distrito_id, t.canton_id)
            FROM lote WHERE t.id = lote.id RETURNING t.id`,
  zona_distrito: `UPDATE zona_distrito t SET nodo_geografico_id = t.distrito_id
            FROM lote WHERE t.id = lote.id RETURNING t.id`,
  distrito_zona_especial: `UPDATE distrito_zona_especial t SET nodo_geografico_id = t.distrito_id
            FROM lote WHERE t.id = lote.id RETURNING t.id`,
  // R31 / design §2.6: el NOMBRE es la foto (las tres columnas congeladas de la fila) y el ID solo
  // enlaza (las FK de la orden, que son los ids de los nodos). El tipo es el `nombre_singular` del nivel
  // en el país de la empresa de la fila. Sin `distrito_nombre`, dos niveles.
  cierre_detail: `UPDATE cierre_detail t SET ubicacion_snapshot = jsonb_build_object(
              'v', 1,
              'niveles',
              jsonb_build_array(
                jsonb_build_object('profundidad', 1, 'tipo', t1.nombre_singular, 'nombre', t.provincia_nombre, 'id', o.provincia_id),
                jsonb_build_object('profundidad', 2, 'tipo', t2.nombre_singular, 'nombre', t.canton_nombre, 'id', o.canton_id)
              ) || CASE WHEN t.distrito_nombre IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
                jsonb_build_object('profundidad', 3, 'tipo', t3.nombre_singular, 'nombre', t.distrito_nombre, 'id', o.distrito_id)
              ) END)
            FROM lote, orden o, organizacion org,
                 tipo_nivel_geografico t1, tipo_nivel_geografico t2, tipo_nivel_geografico t3
           WHERE t.id = lote.id
             AND o.id = t.orden_id
             AND org.id = t.organizacion_id
             AND t1.pais_id = org.pais_id AND t1.clave = 'nivel_1'
             AND t2.pais_id = org.pais_id AND t2.clave = 'nivel_2'
             AND t3.pais_id = org.pais_id AND t3.clave = 'nivel_3'
          RETURNING t.id`,
};

export interface ResultadoDeLote {
  /** Filas pendientes que el lote miró. 0 = no queda nada después del cursor. */
  leidas: number;
  /** Filas que llenó. Menos que `leidas` solo si a alguna le falta lo que la llena. */
  escritas: number;
  /** El id más alto mirado: el cursor del lote siguiente. */
  cursor: string;
}

/** Un lote de `tabla`, después de `cursor` (`""` = desde el principio). */
export async function aplicarLote(
  db: ConexionSql,
  tabla: TablaConColumnaNueva,
  opciones: { cursor?: string; lote?: number } = {},
): Promise<ResultadoDeLote> {
  const cursor = opciones.cursor ?? "";
  const lote = opciones.lote ?? LOTE_POR_DEFECTO;
  const [f] = await db.$queryRawUnsafe<{ leidas: number; escritas: number; cursor: string | null }[]>(
    `WITH lote AS (${LOTE_PENDIENTE(tabla)}),
          hechas AS (${ACTUALIZAR[tabla]})
     SELECT (SELECT count(*)::int FROM lote) AS leidas,
            (SELECT count(*)::int FROM hechas) AS escritas,
            (SELECT max(id) FROM lote) AS cursor`,
    cursor,
    lote,
  );
  return { leidas: f.leidas, escritas: f.escritas, cursor: f.cursor ?? cursor };
}

export interface ResumenDeAplicar {
  /** R26: si la jerarquía está rota no se escribe nada. */
  rechazado: boolean;
  comprobacion: Comprobacion;
  escritas: Record<TablaConColumnaNueva, number>;
  lotes: number;
}

export async function aplicar(
  db: ConexionSql,
  opciones: {
    tabla?: TablaConColumnaNueva;
    lote?: number;
    pausaMs?: number;
    alTerminarLote?: (tabla: TablaConColumnaNueva, r: ResultadoDeLote) => void;
  } = {},
): Promise<ResumenDeAplicar> {
  const escritas: Record<TablaConColumnaNueva, number> = {
    orden: 0,
    zona_distrito: 0,
    distrito_zona_especial: 0,
    cierre_detail: 0,
  };
  const comprobacion = await comprobar(db);
  if (jerarquiaRota(comprobacion)) return { rechazado: true, comprobacion, escritas, lotes: 0 };

  let lotes = 0;
  for (const tabla of opciones.tabla ? [opciones.tabla] : TABLAS) {
    let cursor = "";
    for (;;) {
      const r = await aplicarLote(db, tabla, { cursor, lote: opciones.lote });
      if (r.leidas === 0) break;
      lotes++;
      escritas[tabla] += r.escritas;
      cursor = r.cursor;
      opciones.alTerminarLote?.(tabla, r);
      if (opciones.pausaMs && opciones.pausaMs > 0) await esperar(opciones.pausaMs);
    }
  }
  return { rechazado: false, comprobacion, escritas, lotes };
}

/* -------------------------------------------------------------------------- */
/* Validación de las FK (--validar; R24)                                        */
/* -------------------------------------------------------------------------- */

export interface ResumenDeValidar {
  /** Filas sin nodo: con alguna, `VALIDATE` fallaría o validaría a medias; no se intenta. */
  pendientes: Record<"orden" | "zona_distrito" | "distrito_zona_especial", number>;
  validadas: string[];
}

export async function validar(db: ConexionSql): Promise<ResumenDeValidar> {
  const { pendientes } = await comprobar(db);
  const pendientesFk = {
    orden: pendientes.orden,
    zona_distrito: pendientes.zona_distrito,
    distrito_zona_especial: pendientes.distrito_zona_especial,
  };
  if (Object.values(pendientesFk).some((n) => n > 0)) return { pendientes: pendientesFk, validadas: [] };
  // `VALIDATE CONSTRAINT` toma SHARE UPDATE EXCLUSIVE: no bloquea lecturas ni escrituras (design §4).
  const validadas: string[] = [];
  for (const { tabla, restriccion } of FKS_SIN_VALIDAR) {
    await db.$executeRawUnsafe(`ALTER TABLE "${tabla}" VALIDATE CONSTRAINT "${restriccion}"`);
    validadas.push(restriccion);
  }
  return { pendientes: pendientesFk, validadas };
}

/* -------------------------------------------------------------------------- */
/* Equivalencia (--equivalencia; R32)                                          */
/* -------------------------------------------------------------------------- */

export interface DiferenciaDeNivel {
  paisId: string;
  profundidad: 1 | 2 | 3;
  vieja: number;
  nueva: number;
}

export interface ResumenDeEquivalencia {
  niveles: DiferenciaDeNivel[];
  /** Zonas cuyo conjunto de `distrito_id` no es el de `nodo_geografico_id` en `zona_distrito`. */
  zonasDistintas: string[];
  ordenesSinNodo: number;
  iguales: boolean;
}

export async function equivalencia(db: ConexionSql): Promise<ResumenDeEquivalencia> {
  const niveles = await db.$queryRawUnsafe<{ pais_id: string; profundidad: number; vieja: number; nueva: number }[]>(
    `WITH vieja AS (
        SELECT pais_id, 1 AS profundidad, count(*)::int AS n FROM provincia GROUP BY pais_id
        UNION ALL SELECT pais_id, 2, count(*)::int FROM canton GROUP BY pais_id
        UNION ALL SELECT pais_id, 3, count(*)::int FROM distrito GROUP BY pais_id
      ), nueva AS (
        SELECT pais_id, profundidad, count(*)::int AS n FROM nodo_geografico GROUP BY pais_id, profundidad
      )
      SELECT COALESCE(v.pais_id, n.pais_id) AS pais_id, COALESCE(v.profundidad, n.profundidad) AS profundidad,
             COALESCE(v.n, 0) AS vieja, COALESCE(n.n, 0) AS nueva
        FROM vieja v FULL JOIN nueva n ON n.pais_id = v.pais_id AND n.profundidad = v.profundidad
       WHERE COALESCE(v.n, 0) <> COALESCE(n.n, 0)
       ORDER BY 1, 2`,
  );
  // Cobertura por zona: la misma multiplicidad de distritos y de nodos. Un nodo NULL cuenta como
  // diferencia (la zona aún no está cubierta en el modelo nuevo).
  const zonas = await db.$queryRawUnsafe<{ zona_id: string }[]>(
    `SELECT zona_id FROM (
        SELECT zona_id, distrito_id AS id FROM zona_distrito
        EXCEPT ALL
        SELECT zona_id, nodo_geografico_id FROM zona_distrito
      ) a
     UNION
     SELECT zona_id FROM (
        SELECT zona_id, nodo_geografico_id AS id FROM zona_distrito
        EXCEPT ALL
        SELECT zona_id, distrito_id FROM zona_distrito
      ) b
     ORDER BY 1`,
  );
  const [o] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM orden WHERE nodo_geografico_id IS NULL`,
  );
  const resumen = {
    niveles: niveles.map((f) => ({
      paisId: f.pais_id,
      profundidad: f.profundidad as 1 | 2 | 3,
      vieja: f.vieja,
      nueva: f.nueva,
    })),
    zonasDistintas: zonas.map((z) => z.zona_id),
    ordenesSinNodo: o.n,
  };
  return {
    ...resumen,
    iguales: resumen.niveles.length === 0 && resumen.zonasDistintas.length === 0 && resumen.ordenesSinNodo === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Argumentos y ejecución                                                      */
/* -------------------------------------------------------------------------- */

export type Modo = "comprobar" | "aplicar" | "validar" | "equivalencia";

export interface Argumentos {
  modo: Modo;
  tabla?: TablaConColumnaNueva;
  lote: number;
  pausaMs: number;
  base?: string;
}

const USO =
  "Uso: pnpm geo:backfill [--aplicar | --validar | --equivalencia] [--tabla <t>] [--lote 1000] [--pausa-ms 0] [--base <nombre>]";

const MODOS: Record<string, Modo> = { "--aplicar": "aplicar", "--validar": "validar", "--equivalencia": "equivalencia" };

function entero(texto: string | undefined, minimo: number): number | null {
  if (texto === undefined || !/^\d+$/.test(texto)) return null;
  const n = Number.parseInt(texto, 10);
  return n >= minimo ? n : null;
}

/** Interpreta los argumentos; `null` si no son válidos. */
export function leerArgumentos(argv: readonly string[]): Argumentos | null {
  const a: Argumentos = { modo: "comprobar", lote: LOTE_POR_DEFECTO, pausaMs: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valor = argv[i + 1];
    if (arg in MODOS) {
      if (a.modo !== "comprobar" && a.modo !== MODOS[arg]) return null;
      a.modo = MODOS[arg];
    } else if (arg === "--tabla" && (TABLAS as readonly string[]).includes(valor ?? "")) {
      a.tabla = valor as TablaConColumnaNueva;
      i++;
    } else if (arg === "--lote" && entero(valor, 1) !== null) {
      a.lote = entero(valor, 1) as number;
      i++;
    } else if (arg === "--pausa-ms" && entero(valor, 0) !== null) {
      a.pausaMs = entero(valor, 0) as number;
      i++;
    } else if (arg === "--base" && valor !== undefined && !valor.startsWith("--")) {
      a.base = valor;
      i++;
    } else {
      return null;
    }
  }
  return a;
}

export interface Ejecucion {
  codigoDeSalida: number;
  lineas: string[];
}

/**
 * Corre el modo pedido sobre `db`. R33: los modos que escriben (`--aplicar`, `--validar`) exigen
 * `--base` igual a `current_database()`; si falta o no coincide, se niegan antes de escribir nada.
 */
export async function ejecutar(db: ConexionSql, a: Argumentos): Promise<Ejecucion> {
  const lineas: string[] = [];
  if (a.modo === "aplicar" || a.modo === "validar") {
    const [{ base }] = await db.$queryRawUnsafe<{ base: string }[]>(`SELECT current_database() AS base`);
    if (a.base === undefined || a.base !== base) {
      // No se imprime el nombre real: quien lo lanza tiene que saber contra qué base está.
      lineas.push("Rechazado: --base no coincide con la base conectada. No se escribió nada.");
      return { codigoDeSalida: 1, lineas };
    }
  }

  if (a.modo === "comprobar") {
    const c = await comprobar(db);
    lineas.push(...lineasDeComprobacion(c));
    return { codigoDeSalida: 0, lineas };
  }

  if (a.modo === "aplicar") {
    const r = await aplicar(db, {
      tabla: a.tabla,
      lote: a.lote,
      pausaMs: a.pausaMs,
      alTerminarLote: (tabla, l) => lineas.push(`lote ${tabla}: leidas=${l.leidas} escritas=${l.escritas}`),
    });
    lineas.push(...lineasDeComprobacion(r.comprobacion));
    if (r.rechazado) {
      lineas.push("Rechazado: hay órdenes con la jerarquía rota (R26). No se escribió nada.");
      return { codigoDeSalida: 1, lineas };
    }
    for (const t of TABLAS) lineas.push(`escritas ${t}=${r.escritas[t]}`);
    return { codigoDeSalida: 0, lineas };
  }

  if (a.modo === "validar") {
    const r = await validar(db);
    for (const [t, n] of Object.entries(r.pendientes)) lineas.push(`pendientes ${t}=${n}`);
    if (r.validadas.length === 0) {
      lineas.push("Rechazado: quedan filas sin nodo; corre antes --aplicar. No se validó nada.");
      return { codigoDeSalida: 1, lineas };
    }
    for (const v of r.validadas) lineas.push(`validada ${v}`);
    return { codigoDeSalida: 0, lineas };
  }

  const r = await equivalencia(db);
  for (const n of r.niveles) lineas.push(`nivel ${n.paisId}/${n.profundidad}: vieja=${n.vieja} nueva=${n.nueva}`);
  for (const z of r.zonasDistintas) lineas.push(`zona distinta ${z}`);
  lineas.push(`ordenes sin nodo=${r.ordenesSinNodo}`);
  lineas.push(r.iguales ? "Equivalentes." : "NO equivalentes.");
  return { codigoDeSalida: r.iguales ? 0 : 1, lineas };
}

function lineasDeComprobacion(c: Comprobacion): string[] {
  return [
    `ordenes con distrito de otro canton=${c.ordenesConDistritoDeOtroCanton}`,
    `ordenes con canton de otra provincia=${c.ordenesConCantonDeOtraProvincia}`,
    `ordenes total=${c.totalOrdenes}`,
    `ordenes sin distrito=${c.ordenesSinDistrito}`,
    ...TABLAS.map((t) => `pendientes ${t}=${c.pendientes[t]}`),
  ];
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }
  const argumentos = leerArgumentos(process.argv.slice(2));
  if (argumentos === null) {
    // No se repite el argumento: se escribe a mano y podría llevar algo que no debe salir.
    console.error(USO);
    process.exit(1);
  }
  const prisma = getPrismaClient();
  try {
    const r = await comoPlataforma(
      "SLT-43",
      "llenar el nodo geográfico y el snapshot de ubicación de las filas previas a la migración",
      () => ejecutar(prisma, argumentos),
    );
    for (const linea of r.lineas) console.log(linea);
    process.exitCode = r.codigoDeSalida;
  } finally {
    await prisma.$disconnect();
  }
}

// Solo auto-ejecuta cuando este archivo es el entrypoint (no cuando un test lo importa).
const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().catch((error: unknown) => {
    // Solo el nombre: el mensaje de Prisma puede llevar la URL de la base.
    console.error(`Falló geo:backfill (${error instanceof Error ? error.name : "error desconocido"}).`);
    process.exit(1);
  });
}
