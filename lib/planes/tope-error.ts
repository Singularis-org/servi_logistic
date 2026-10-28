import type { RolValue } from "@prisma/client";

import { ROL_LABELS } from "@/lib/auth/rol-label";
import { ConflictError } from "@/lib/errors/app-error";
import { llevaSqlstate, mensajesDeLaCadena } from "@/lib/db/sqlstate";

import { mensajeDelTope, type TopeDelPlan } from "./mensajes";

// SL-24 (design §4.1, §4.5) — el rechazo de un alta por el tope del plan, tal como lo lanzan los
// triggers de 20261027130200: SQLSTATE `SL024` y `MESSAGE = 'tope_plan {json}'`.
//
// Es un `CONFLICT` con `details.codigo = "tope_plan"` y no un `AppErrorCode` nuevo: `code` es el
// conjunto cerrado de la feature 10, y ampliarlo cambia el `switch` exhaustivo de `toActionError` en
// todo el repo (mismo criterio que SL-23 §5.5).

export const SQLSTATE_TOPE_PLAN = "SL024";

export type DetalleTopePlan = { codigo: "tope_plan" } & TopeDelPlan;

// Sin campo `declare details`: Playwright transpila con Babel, que no lo acepta, y un campo normal
// (`details!:`) se inicializaría a `undefined` tras `super()` y pisaría el valor. El tipo estrecho
// se expone con un getter, que vive en el prototipo y no toca la instancia.
export class TopeDelPlanAlcanzado extends ConflictError {
  /** `details` con su tipo concreto; es el mismo objeto que `details`. */
  get detalle(): DetalleTopePlan {
    return this.details as DetalleTopePlan;
  }

  constructor(tope: TopeDelPlan, opciones?: { cause?: unknown }) {
    super(mensajeDelTope(tope), { codigo: "tope_plan", ...tope });
    this.name = "TopeDelPlanAlcanzado";
    if (opciones && "cause" in opciones) this.cause = opciones.cause;
  }
}

// Las claves de `ROL_LABELS` son exhaustivas sobre `RolValue`: un rol que el texto no sabría nombrar
// no se acepta.
const ROLES: ReadonlySet<string> = new Set(Object.keys(ROL_LABELS));

const entero = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** El JSON del trigger, validado campo a campo: un mensaje que no encaja no es un tope. */
function leerTope(texto: string): TopeDelPlan | null {
  const json = /tope_plan (\{[^{}]*\})/.exec(texto)?.[1];
  if (json === undefined) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!entero(o.maximo) || !entero(o.usados) || !entero(o.pedidas)) return null;
  const cifras = { maximo: o.maximo, usados: o.usados, pedidas: o.pedidas };
  if (o.tope === "ordenes" || o.tope === "api_keys") return { tope: o.tope, ...cifras };
  if (o.tope === "rol" && typeof o.rol === "string" && ROLES.has(o.rol)) {
    return { tope: "rol", rol: o.rol as RolValue, ...cifras };
  }
  return null;
}

/**
 * Convierte un error con SQLSTATE `SL024` en `TopeDelPlanAlcanzado` (con el original en `cause`).
 * Cualquier otro error, o uno cuyo mensaje no traiga el JSON, se devuelve tal cual. Pensado para
 * `throw traducirErrorDeTope(e)` o para comprobar `instanceof` en el servicio.
 */
export function traducirErrorDeTope(e: unknown): unknown {
  if (e instanceof TopeDelPlanAlcanzado || !llevaSqlstate(e, SQLSTATE_TOPE_PLAN)) return e;
  for (const mensaje of mensajesDeLaCadena(e)) {
    const tope = leerTope(mensaje);
    if (tope !== null) return new TopeDelPlanAlcanzado(tope, { cause: e });
  }
  return e;
}
