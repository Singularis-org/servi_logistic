import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import {
  ROLES_CON_TOPE,
  TIPOS_COBRO,
  type CostoPorOrdenPorcentual,
  type DescuentoPeriodo,
  type PlanDTO,
  type PrecioPlan,
  type TipoCobro,
  type TopesPlan,
} from "@/lib/types/planes";

// SL-24 (design §2.8, §5) — qué cambió entre dos versiones de un plan, para la columna `cambios` de
// `plan_rastro`: `{ "<campo>": { antes, despues } }` solo con los campos que cambiaron. Pura.
//
// Las dos versiones se comparan en su forma CANÓNICA: un importe «10» y el «10.00» que devuelve la
// base son el mismo precio, y el orden de los módulos o de las claves de `porRol` no es un cambio. Sin
// eso, guardar sin tocar nada escribiría una fila falsa (§2.8: una edición sin cambios no escribe).
//
// SLT-86 (design §5.4; R31): cada descuento del período va en su propia clave, `descuento_<periodo>`, y
// `precio` guarda solo el costo base mensual. Así cambiar un descuento deja su antes y su después sin
// arrastrar el resto del precio. Las filas viejas (`precio` con el anual, `topes.ordenesPorCiclo` y el
// `tope_ordenes_ciclo` que escribe la migración) no se reescriben: las pinta `lineasDeCambioDelPlan`.

export type ClaveDeDescuento = `descuento_${TipoCobro}`;

export type CampoDelPlan =
  | "nombre"
  | "topes"
  | "modulos"
  | "precio"
  | ClaveDeDescuento
  | "costoPorOrden"
  | "costoPorOrdenPorcentual"
  | "archivado";
export type CambiosDelPlan = Partial<Record<CampoDelPlan, { antes: unknown; despues: unknown }>>;

/** La clave del rastro del descuento de un período. */
export function claveDeDescuento(tipo: TipoCobro): ClaveDeDescuento {
  return `descuento_${tipo}`;
}

const CAMPOS: readonly CampoDelPlan[] = [
  "nombre",
  "topes",
  "modulos",
  "precio",
  ...TIPOS_COBRO.map(claveDeDescuento),
  "costoPorOrden",
  "costoPorOrdenPorcentual",
  "archivado",
];

/** Texto con dos decimales y sin ceros a la izquierda, sin pasar por `Number` («007.5» → «7.50»). */
export function importeCanonico(texto: string): string {
  const [entero, decimales = ""] = texto.split(".");
  return `${entero.replace(/^0+(?=\d)/, "")}.${decimales.padEnd(2, "0")}`;
}

/** El costo base del rastro: solo el mensual; los descuentos van en sus claves. */
type CostoBaseDelRastro = { tipo: "sin_precio" } | { tipo: "monto"; mensual: string };

function precioCanonico(p: PrecioPlan): CostoBaseDelRastro {
  return p.tipo === "monto" ? { tipo: "monto", mensual: importeCanonico(p.mensual) } : { tipo: p.tipo };
}

/** R10, R11: «10» y «10.00» son el mismo descuento; sin precio no hay descuentos aunque lleguen. */
function descuentoCanonico(p: PrecioPlan, tipo: TipoCobro): DescuentoPeriodo | null {
  const d = p.tipo === "monto" ? p.descuentos[tipo] : undefined;
  if (d === undefined) return null;
  return d.tipo === "porcentaje"
    ? { tipo: "porcentaje", porcentaje: importeCanonico(d.porcentaje) }
    : { tipo: "monto", monto: importeCanonico(d.monto) };
}

/** SLT-83 (R4): «2» y el «2.00» de la base son el mismo porcentaje; un mínimo vacío sigue siendo `null`. */
function porcentualCanonico(c: CostoPorOrdenPorcentual | null): CostoPorOrdenPorcentual | null {
  if (c === null) return null;
  return { porcentaje: importeCanonico(c.porcentaje), minimo: c.minimo === null ? null : importeCanonico(c.minimo) };
}

function topesCanonicos(t: TopesPlan): TopesPlan {
  const porRol: TopesPlan["porRol"] = {};
  for (const rol of ROLES_CON_TOPE) {
    const maximo = t.porRol[rol];
    if (maximo !== undefined) porRol[rol] = maximo;
  }
  return { porRol, apiKeys: t.apiKeys };
}

/** La forma canónica del plan, campo a campo: la que se compara y la que se guarda en el rastro. */
export function planCanonico(p: PlanDTO): Record<CampoDelPlan, unknown> {
  const canonico: Partial<Record<CampoDelPlan, unknown>> = {
    nombre: p.nombre,
    topes: topesCanonicos(p.topes),
    modulos: ORDEN_MODULOS.filter((m) => p.modulos.includes(m)),
    precio: precioCanonico(p.precio),
    // SLT-66 (R11): «100» y el «100.00» de la base son el mismo costo; vacío sigue siendo `null`.
    costoPorOrden: p.costoPorOrden === null ? null : importeCanonico(p.costoPorOrden),
    costoPorOrdenPorcentual: porcentualCanonico(p.costoPorOrdenPorcentual),
    archivado: p.archivado,
  };
  for (const tipo of TIPOS_COBRO) canonico[claveDeDescuento(tipo)] = descuentoCanonico(p.precio, tipo);
  return canonico as Record<CampoDelPlan, unknown>;
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

/**
 * SLT-86 (R15, R22): la edición cambia el costo base mensual o algún descuento. Entonces lleva fecha de
 * efecto y deja su fila en el historial de precio; el resto de campos sigue la regla de SLT-58.
 */
export function cambiaElPrecio(c: CambiosDelPlan): boolean {
  return Object.keys(c).some((campo) => campo === "precio" || campo.startsWith("descuento_"));
}
