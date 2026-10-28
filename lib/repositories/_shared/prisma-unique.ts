import { Prisma } from "@prisma/client";

// Fix P2002 bajo el driver adapter de Prisma 7 (`@prisma/adapter-pg` / `PrismaPg`).
//
// Con el adapter, la violacion de unicidad P2002 NO trae `error.meta.target`
// (viene `undefined`). El nombre de la constraint violada vive en
// `error.meta.driverAdapterError.cause.originalMessage`, p. ej.:
//   "llave duplicada viola restriccion de unicidad «usuario_email_key»".
// En el motor nativo (sin adapter) el campo violado venia en `meta.target`
// (array de columnas). Los handlers que disambiguan leyendo solo `meta.target`
// se rompen bajo el adapter y dejan escalar el P2002 crudo a un 500.
//
// Este modulo unifica AMBAS formas en un texto minusculizado y buscable con
// `.includes(...)`, para que los `mapDuplicadoError` de cada repositorio sigan
// funcionando igual en nativo y en adapter.

/** `true` si el error es un P2002 (violacion de unicidad) de Prisma. */
export function esP2002(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Devuelve un texto en minusculas con el/los identificadores de la constraint
 * violada por un P2002, robusto a ambas formas del error:
 *   - forma nativa: `meta.target` (array -> join con coma; string -> tal cual).
 *   - forma adapter: `meta.driverAdapterError.cause.originalMessage` (string).
 * Concatena ambas fuentes (lo que exista) separadas por espacio. Devuelve `null`
 * si el error no es un P2002 o si no aporta ninguna pista de la constraint; los
 * callers deben tratar `null` como "no puedo disambiguar" y re-lanzar el original.
 */
export function textoConstraintP2002(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  const meta = error.meta;
  if (meta == null) return null;

  const partes: string[] = [];

  // Forma nativa: meta.target (array de columnas o, en algunos casos, string).
  const target: unknown = (meta as Record<string, unknown>).target;
  if (Array.isArray(target)) {
    partes.push(target.filter((t): t is string => typeof t === "string").join(","));
  } else if (typeof target === "string") {
    partes.push(target);
  }

  // Forma adapter: meta.driverAdapterError.cause.originalMessage (campos no
  // tipados en el tipo de Prisma; acceso defensivo para no romper `strict`).
  const original = leerOriginalMessage(meta as Record<string, unknown>);
  if (original) partes.push(original);

  const texto = partes.join(" ").toLowerCase().trim();
  return texto.length > 0 ? texto : null;
}

/** Lee `meta.driverAdapterError.cause.originalMessage` de forma segura, o `null`. */
function leerOriginalMessage(meta: Record<string, unknown>): string | null {
  const dae = meta.driverAdapterError;
  if (dae == null || typeof dae !== "object") return null;
  const cause = (dae as Record<string, unknown>).cause;
  if (cause == null || typeof cause !== "object") return null;
  const original = (cause as Record<string, unknown>).originalMessage;
  return typeof original === "string" ? original : null;
}

// SL-20 (design §4, R36) — el borde de la geografia del superadmin solo traduce a `conflict` la
// violacion de unicidad; cualquier otro fallo es `error`. La de un modelo llega como P2002; la de un
// SQL a mano (P2010) o la del driver, con el SQLSTATE `23505` en el mensaje o en algun `cause`.
const SQLSTATE_UNICO = "23505";
const CLAVES_ANIDADAS = ["cause", "meta", "driverAdapterError"] as const;

function lleva23505(e: unknown, vistos: Set<unknown>, profundidad: number): boolean {
  if (e === null || typeof e !== "object" || vistos.has(e) || profundidad > 6) return false;
  vistos.add(e);
  const o = e as Record<string, unknown>;
  if (o.code === SQLSTATE_UNICO || o.originalCode === SQLSTATE_UNICO) return true;
  if (o.code === "P2010" && typeof o.message === "string" && o.message.includes(`Code: \`${SQLSTATE_UNICO}\``)) {
    return true;
  }
  return CLAVES_ANIDADAS.some((k) => lleva23505(o[k], vistos, profundidad + 1));
}

/** `true` si el error es una violacion de unicidad, por cualquiera de las formas en que llega. */
export function esViolacionDeUnico(error: unknown): boolean {
  return esP2002(error) || lleva23505(error, new Set(), 0);
}
