// SL-24 (design §4.5) — reconocer un SQLSTATE propio (`SL017`, `SL024`, …) en un error de Prisma,
// esté donde esté. Extraído de `contexto-empresa.ts` (SL-17) sin cambiar su recorrido.
//
// Formas reales en Prisma 7.8 + @prisma/adapter-pg (leidas en `@prisma/client/runtime` y en
// `@prisma/adapter-pg`):
//  - SQL a mano: `PrismaClientKnownRequestError` P2010 con `meta.driverAdapterError`, un
//    `DriverAdapterError` cuyo `cause` es `{ kind: "postgres", code, originalCode, message }`, y
//    el mensaje «Raw query failed. Code: `SL017`…».
//  - Operacion de modelo: el SQLSTATE no tiene codigo Prisma, asi que el runtime relanza el
//    propio `DriverAdapterError` (mismo `cause`).
//  - `pg` directo: el error del driver con `code: "SL017"`.
// Se recorre el grafo `cause`/`meta`/`driverAdapterError` en vez de fijar una sola forma: la
// envoltura en lote o un `cause` intermedio no deben hacer que se escape sin traducir.

const CLAVES_ANIDADAS = ["cause", "meta", "driverAdapterError"] as const;
const PROFUNDIDAD_MAXIMA = 6;

function nodoLleva(o: Record<string, unknown>, codigo: string): boolean {
  if (o.code === codigo || o.originalCode === codigo) return true;
  return o.code === "P2010" && typeof o.message === "string" && o.message.includes(`Code: \`${codigo}\``);
}

/** Visita cada objeto del grafo de causas, sin ciclos; para en cuanto `visita` devuelve `true`. */
function recorrer(
  e: unknown,
  visita: (o: Record<string, unknown>) => boolean,
  vistos: Set<unknown>,
  profundidad: number,
): boolean {
  if (e === null || typeof e !== "object" || vistos.has(e) || profundidad > PROFUNDIDAD_MAXIMA) return false;
  vistos.add(e);
  const o = e as Record<string, unknown>;
  if (visita(o)) return true;
  return CLAVES_ANIDADAS.some((k) => recorrer(o[k], visita, vistos, profundidad + 1));
}

/** ¿Lleva `e`, en sí o en alguna de sus causas, el SQLSTATE `codigo`? */
export function llevaSqlstate(e: unknown, codigo: string): boolean {
  return recorrer(e, (o) => nodoLleva(o, codigo), new Set(), 0);
}

/**
 * Los `message` de texto de todo el grafo, en orden de recorrido. Sirve para leer lo que el trigger
 * puso en MESSAGE: segun la forma, llega en el `cause` del driver o dentro del texto de P2010.
 */
export function mensajesDeLaCadena(e: unknown): string[] {
  const mensajes: string[] = [];
  recorrer(
    e,
    (o) => {
      if (typeof o.message === "string") mensajes.push(o.message);
      return false;
    },
    new Set(),
    0,
  );
  return mensajes;
}
