import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { ROLES_CON_TOPE, type PlanDTO, type PrecioPlan, type TopesPlan } from "@/lib/types/planes";

// SL-24 (design §2.8, §5) — qué cambió entre dos versiones de un plan, para la columna `cambios` de
// `plan_rastro`: `{ "<campo>": { antes, despues } }` solo con los campos que cambiaron. Pura.
//
// Las dos versiones se comparan en su forma CANÓNICA: un importe «10» y el «10.00» que devuelve la
// base son el mismo precio, y el orden de los módulos o de las claves de `porRol` no es un cambio. Sin
// eso, guardar sin tocar nada escribiría una fila falsa (§2.8: una edición sin cambios no escribe).

export type CampoDelPlan = "nombre" | "topes" | "modulos" | "precio" | "costoPorOrden" | "archivado";
export type CambiosDelPlan = Partial<Record<CampoDelPlan, { antes: unknown; despues: unknown }>>;

const CAMPOS: readonly CampoDelPlan[] = ["nombre", "topes", "modulos", "precio", "costoPorOrden", "archivado"];

/** Texto con dos decimales y sin ceros a la izquierda, sin pasar por `Number` («007.5» → «7.50»). */
export function importeCanonico(texto: string): string {
  const [entero, decimales = ""] = texto.split(".");
  return `${entero.replace(/^0+(?=\d)/, "")}.${decimales.padEnd(2, "0")}`;
}

function precioCanonico(p: PrecioPlan): PrecioPlan {
  if (p.tipo !== "monto") return { tipo: p.tipo };
  const anual =
    p.anual === null
      ? null
      : p.anual.tipo === "fijo"
        ? { tipo: "fijo" as const, monto: importeCanonico(p.anual.monto) }
        : { tipo: "descuento" as const, porcentaje: importeCanonico(p.anual.porcentaje) };
  return { tipo: "monto", mensual: importeCanonico(p.mensual), anual };
}

function topesCanonicos(t: TopesPlan): TopesPlan {
  const porRol: TopesPlan["porRol"] = {};
  for (const rol of ROLES_CON_TOPE) {
    const maximo = t.porRol[rol];
    if (maximo !== undefined) porRol[rol] = maximo;
  }
  return { ordenesPorCiclo: t.ordenesPorCiclo, porRol, apiKeys: t.apiKeys };
}

/** La forma canónica del plan: la que se compara y la que se guarda en el rastro. */
export function planCanonico(p: PlanDTO): PlanDTO {
  return {
    ...p,
    topes: topesCanonicos(p.topes),
    modulos: ORDEN_MODULOS.filter((m) => p.modulos.includes(m)),
    precio: precioCanonico(p.precio),
    // SLT-66 (R11): «100» y el «100.00» de la base son el mismo costo; vacío sigue siendo `null`.
    costoPorOrden: p.costoPorOrden === null ? null : importeCanonico(p.costoPorOrden),
  };
}

/**
 * Los campos que cambian de `antes` a `despues`. Con `antes = null` (alta) salen todos, con
 * `antes: null`. Un objeto vacío significa «sin cambios»: no se escribe nada (§2.8).
 */
export function diferenciasDelPlan(antes: PlanDTO | null, despues: PlanDTO): CambiosDelPlan {
  const d = planCanonico(despues);
  const a = antes === null ? null : planCanonico(antes);
  const cambios: CambiosDelPlan = {};
  for (const campo of CAMPOS) {
    const valorAntes = a === null ? null : a[campo];
    if (a !== null && JSON.stringify(valorAntes) === JSON.stringify(d[campo])) continue;
    cambios[campo] = { antes: valorAntes, despues: d[campo] };
  }
  return cambios;
}

export function hayCambios(c: CambiosDelPlan): boolean {
  return Object.keys(c).length > 0;
}
