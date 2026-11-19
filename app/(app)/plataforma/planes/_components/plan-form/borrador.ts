import { montoParaCampo } from "@/lib/config/moneda";
import type {
  BorradorVista,
  GeneralDeCrear,
  GeneralDeEditar,
  ValoresDeBeneficios,
  ValoresDeModulos,
  ValoresDeOrden,
  ValoresDePrecio,
  ValoresDeTopes,
  ValoresDeVigencia,
  ValoresDelPaso,
} from "@/lib/types/plan-borrador";
import { ROLES_CON_TOPE, type RolConTope } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { horaCostaRica } from "@/lib/utils/hora-cr";

import {
  beneficiosEnPantalla,
  PASOS_QUE_SE_GUARDAN,
  versionDe,
  type CamposVisibles,
  type Formulario,
  type IdPaso,
  type IdPasoGuardable,
  type ModoDelPlanForm,
} from "./estado";

// SLT-144 (design §4.2; R2, R15): del formulario al borrador del servidor y de vuelta, sin React. Cada paso
// arma sus valores como `PlanForm` arma hoy la petición entera de crear o editar (`versionDe`), para que
// confirmar el borrador mande lo mismo que mandaba «Crear plan» o «Guardar».

/** Los valores de un paso tal como viajan a `guardarPasoBorradorAction`. */
export function valoresDelPaso(
  modo: ModoDelPlanForm,
  paso: IdPasoGuardable,
  form: Formulario,
  visibles: CamposVisibles,
): ValoresDelPaso {
  const version = versionDe(form);
  switch (paso) {
    case "general":
      return modo === "crear" ? generalDeCrear(form, visibles) : { nombre: form.nombre };
    case "precio":
      return { precio: precioDelBorrador(form) };
    case "orden":
      return {
        costoPorOrden: version.costoPorOrden,
        costoPorOrdenPorcentual: version.costoPorOrdenPorcentual,
        periodicidadOrdenes: version.periodicidadOrdenes,
      };
    case "topes":
      return { topes: version.topes };
    case "modulos":
      return { modulos: version.modulos };
    case "beneficios":
      // SLT-214 (R8): en el orden de pantalla, sin la clave local.
      return { beneficios: version.beneficios };
    case "vigencia":
      // SLT-135 (R15, R16): siempre la fecha del campo que se ve.
      return { vigenteDesde: visibles.cambiaPrecio ? form.precioDesde : form.vigenteDesde };
  }
}

function generalDeCrear(f: Formulario, v: CamposVisibles): GeneralDeCrear {
  const custom = f.visibilidad === "custom";
  return {
    nombre: f.nombre,
    visibilidad: f.visibilidad,
    organizacionId: custom ? f.organizacionId : null,
    ...(custom ? { tipoCobro: f.tipoCobro } : {}),
    ...(custom && v.pideInicioCiclo ? { inicioCiclo: f.inicioCiclo } : {}),
    ...(custom && v.pideFechaDeEfecto ? { vigenteDesde: f.vigenteDesde } : {}),
  };
}

/** R2: los descuentos van como lista, en el orden de pantalla, con la forma como `tipo`. */
function precioDelBorrador(f: Formulario): ValoresDePrecio["precio"] {
  if (f.precio !== "monto") return { tipo: "sin_precio" };
  return {
    tipo: "monto",
    mensual: f.mensual.trim(),
    descuentos: f.descuentos.map((l) => ({ periodo: l.periodo, tipo: l.forma, valor: l.valor.trim() })),
  };
}

const texto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/**
 * R2, R15: `base` con los pasos guardados encima. `base` es `inicial(plan, …)` al editar o `inicial(null, …)` al
 * crear; un paso sin guardar deja lo de `base`. El servidor validó cada paso con el esquema de su id, así que
 * cada uno se lee con el tipo de ese paso.
 */
export function formDelBorrador(base: Formulario, pasos: BorradorVista["pasos"]): Formulario {
  let f = base;
  if (pasos.general) f = conGeneral(f, pasos.general as GeneralDeCrear | GeneralDeEditar);
  if (pasos.precio) f = conPrecio(f, pasos.precio as ValoresDePrecio);
  if (pasos.orden) f = conOrden(f, pasos.orden as ValoresDeOrden);
  if (pasos.topes) f = conTopes(f, pasos.topes as ValoresDeTopes);
  if (pasos.modulos) f = { ...f, modulos: [...(pasos.modulos as ValoresDeModulos).modulos] };
  // SLT-214 (R11): en su orden, con su texto y su ícono, y claves locales nuevas.
  if (pasos.beneficios) f = { ...f, beneficios: beneficiosEnPantalla((pasos.beneficios as ValoresDeBeneficios).beneficios) };
  if (pasos.vigencia) f = conVigencia(f, pasos.vigencia as ValoresDeVigencia);
  return f;
}

function conGeneral(f: Formulario, g: GeneralDeCrear | GeneralDeEditar): Formulario {
  if (!("visibilidad" in g)) return { ...f, nombre: g.nombre };
  return {
    ...f,
    nombre: g.nombre,
    visibilidad: g.visibilidad,
    organizacionId: g.organizacionId ?? "",
    ...(g.tipoCobro !== undefined ? { tipoCobro: g.tipoCobro } : {}),
    ...(g.inicioCiclo !== undefined ? { inicioCiclo: g.inicioCiclo } : {}),
    ...(g.vigenteDesde !== undefined ? { vigenteDesde: g.vigenteDesde } : {}),
  };
}

function conPrecio(f: Formulario, { precio }: ValoresDePrecio): Formulario {
  if (precio.tipo === "sin_precio") return { ...f, precio: "sin_precio" };
  return {
    ...f,
    precio: "monto",
    mensual: montoParaCampo(precio.mensual),
    descuentos: precio.descuentos.map((d) => ({
      periodo: d.periodo,
      forma: d.tipo,
      valor: d.tipo === "monto" ? montoParaCampo(d.valor) : d.valor,
    })),
  };
}

function conOrden(f: Formulario, o: ValoresDeOrden): Formulario {
  const porcentual = o.costoPorOrdenPorcentual;
  return {
    ...f,
    costoPorOrden: o.costoPorOrden === null ? "" : montoParaCampo(o.costoPorOrden),
    modoCosto: porcentual === null ? "fijo" : "porcentual",
    porcentajePorOrden: porcentual?.porcentaje ?? "",
    minimoPorOrden: porcentual?.minimo == null ? "" : montoParaCampo(porcentual.minimo),
    periodicidadOrdenes: o.periodicidadOrdenes,
  };
}

function conTopes(f: Formulario, { topes }: ValoresDeTopes): Formulario {
  const porRol = Object.fromEntries(ROLES_CON_TOPE.map((r) => [r, texto(topes.porRol[r])])) as Record<
    RolConTope,
    string
  >;
  return { ...f, porRol, apiKeys: texto(topes.apiKeys) };
}

/**
 * La fecha guardada, la misma en «Rige desde» y en «A partir de»: sirve cambie o no el precio, que se decide al
 * comparar con el plan. SLT-135 (R15): siempre hay fecha.
 */
function conVigencia(f: Formulario, { vigenteDesde }: ValoresDeVigencia): Formulario {
  return { ...f, precioDesde: vigenteDesde, vigenteDesde };
}

/** R15: al retomar, el primer paso sin guardar; con todos guardados, «Revisar». */
export function pasoInicial(modo: ModoDelPlanForm, guardados: ReadonlySet<IdPasoGuardable>): IdPaso {
  return PASOS_QUE_SE_GUARDAN(modo).find((p) => !guardados.has(p)) ?? "revisar";
}

/** «AAAA-MM-DD HH:mm» de un instante, en la hora de la plataforma (SLT-144 design §4.6; antes en `PlanDetalle`). */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fechaCalendarioCR(d)} ${horaCostaRica(iso)}`;
}
