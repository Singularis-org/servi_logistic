import {
  PASOS_DE_CREAR,
  PASOS_DE_EDITAR,
  type IdPasoBorrador,
  type LineaDeDescuento,
  type ModoDelBorrador,
  type PasosDeCrear,
  type PasosDeEditar,
  type PrecioDelBorrador,
} from "@/lib/types/plan-borrador";
import type { DescuentoPeriodo, PrecioPlan, TipoCobro, crearPlanSchema, editarPlanSchema } from "@/lib/types/planes";
import type { z } from "zod";

// SLT-129 (design §5.1; R7, R16, R17, R18, R20) — lo puro del borrador de planes: qué pasos faltan y cómo se
// arma, con los pasos guardados, la petición de crear o de editar de hoy. Confirmar pasa esa petición por
// `PlanesService.crear` / `editar`, así que la validación completa y las reglas son las de siempre.
//
// Este módulo y `lib/types/plan-borrador.ts` se importan entre sí: aquí solo se leen sus constantes dentro de
// funciones, y allí `descuentosDeLaLista` solo se llama al validar. Ninguno usa al otro al cargarse.

/** Los pasos del modo, en el orden del formulario. */
export function pasosDelModo(modo: ModoDelBorrador): readonly IdPasoBorrador[] {
  return modo === "crear" ? PASOS_DE_CREAR : PASOS_DE_EDITAR;
}

/** R16: los pasos del modo que no están guardados, en el orden del formulario. */
export function pasosQueFaltan(modo: ModoDelBorrador, guardados: Iterable<IdPasoBorrador>): IdPasoBorrador[] {
  const hay = new Set(guardados);
  return pasosDelModo(modo).filter((paso) => !hay.has(paso));
}

/**
 * R7: la lista de descuentos del borrador en el registro por período de hoy. Supone períodos sin repetir (lo
 * garantiza el esquema del paso); la lista vacía es «sin descuentos».
 */
export function descuentosDeLaLista(lineas: readonly LineaDeDescuento[]): Partial<Record<TipoCobro, DescuentoPeriodo>> {
  const descuentos: Partial<Record<TipoCobro, DescuentoPeriodo>> = {};
  for (const { periodo, tipo, valor } of lineas) {
    descuentos[periodo] = tipo === "monto" ? { tipo: "monto", monto: valor } : { tipo: "porcentaje", porcentaje: valor };
  }
  return descuentos;
}

function precioDeHoy(precio: PrecioDelBorrador): PrecioPlan {
  if (precio.tipo === "sin_precio") return { tipo: "sin_precio" };
  return { tipo: "monto", mensual: precio.mensual, descuentos: descuentosDeLaLista(precio.descuentos) };
}

/** R17: la entrada de `crearPlanSchema` con los cinco pasos de un borrador de creación. */
export function peticionDeCrear(pasos: PasosDeCrear): z.input<typeof crearPlanSchema> {
  return {
    ...pasos.general,
    precio: precioDeHoy(pasos.precio.precio),
    costoPorOrden: pasos.orden.costoPorOrden,
    costoPorOrdenPorcentual: pasos.orden.costoPorOrdenPorcentual,
    periodicidadOrdenes: pasos.orden.periodicidadOrdenes,
    topes: pasos.topes.topes,
    modulos: pasos.modulos.modulos,
    // SLT-214 (R15): el paso guardado, en su orden.
    beneficios: pasos.beneficios.beneficios,
    // SLT-215 (R15): lo mismo con los niveles.
    niveles: pasos.niveles.niveles,
  };
}

/** R18: la entrada de `editarPlanSchema` con los pasos del borrador de cambio de `planId`. */
export function peticionDeEditar(planId: string, pasos: PasosDeEditar): z.input<typeof editarPlanSchema> {
  return {
    planId,
    nombre: pasos.general.nombre,
    precio: precioDeHoy(pasos.precio.precio),
    costoPorOrden: pasos.orden.costoPorOrden,
    costoPorOrdenPorcentual: pasos.orden.costoPorOrdenPorcentual,
    periodicidadOrdenes: pasos.orden.periodicidadOrdenes,
    topes: pasos.topes.topes,
    modulos: pasos.modulos.modulos,
    // SLT-214 (R16): van en la versión programada, no en el plan.
    beneficios: pasos.beneficios.beneficios,
    // SLT-215 (R16): también en la versión programada; la lista del plan no cambia al programar.
    niveles: pasos.niveles.niveles,
    vigenteDesde: pasos.vigencia.vigenteDesde,
  };
}

/**
 * R20: el borrador ya no está al confirmar (otro lo descartó o lo confirmó). El repositorio la lanza dentro de
 * la transacción para deshacerla sin crear ni programar nada; el servicio la traduce a `borrador_no_encontrado`.
 */
export class BorradorNoEncontrado extends Error {
  constructor(readonly borradorId: string) {
    super(`El borrador ${borradorId} ya no existe.`);
    this.name = "BorradorNoEncontrado";
  }
}
