import type { TarifaActor, TarifaConcepto } from "@prisma/client";

import type { ResultadoDeCambio } from "@/lib/actions/tarifas";
import { montoParaCampo } from "@/lib/config/moneda";
import { CATALOGO_CONCEPTOS, esConceptoTienda } from "@/lib/tarifas/catalogo";
import type { ReferenciaDeZona, Referencia } from "@/lib/tarifas/referencia-vigente";
import type { ModoTarifa, TarifaValorDTO } from "@/lib/types/tarifa-flexible";

import { TEXTOS } from "./tarifas-textos";

/**
 * SLT-54 (R20, R34-R36, R38, R61) — de lo digitado al payload de `guardarValoresTarifa`. Aparte y puro porque
 * aqui se decide dinero: lo vacio no es 0, la referencia no entra y un pago no lleva la clave `ivaPct`.
 */

export type AlcanceTienda = { tipo: "todas" } | { tipo: "zona" } | { tipo: "grupo"; grupoId: string };

export type Nivel =
  | { tipo: "zona" }
  | { tipo: "grupo"; grupoId: string }
  | { tipo: "tienda"; tiendaId: string | null; alcance: AlcanceTienda };

export interface ColumnasDelNivel {
  zonaId: string | null;
  grupoId: string | null;
  tiendaId: string | null;
  /** SLT-55: solo la sección de valor propio la manda; la rejilla por zona no envía esta clave. */
  mensajeroId?: string | null;
}

export function columnasDeNivel(nivel: Nivel, zonaId: string): ColumnasDelNivel {
  if (nivel.tipo === "zona") return { zonaId, grupoId: null, tiendaId: null };
  if (nivel.tipo === "grupo") return { zonaId, grupoId: nivel.grupoId, tiendaId: null };
  if (nivel.alcance.tipo === "todas") return { zonaId: null, grupoId: null, tiendaId: nivel.tiendaId };
  if (nivel.alcance.tipo === "zona") return { zonaId, grupoId: null, tiendaId: nivel.tiendaId };
  return { zonaId, grupoId: nivel.alcance.grupoId, tiendaId: nivel.tiendaId };
}

/**
 * Los valores de exactamente ese nivel. `valoresDeZona` trae tambien los de tienda de la zona y `preciosTienda`
 * los de toda la empresa: un filtro flojo pintaria el precio de otro nivel como si fuera de este.
 */
export function valoresDelNivel(
  nivel: Nivel,
  zonaId: string,
  valoresDeZona: readonly TarifaValorDTO[],
  preciosTienda: readonly TarifaValorDTO[],
): TarifaValorDTO[] {
  const c = columnasDeNivel(nivel, zonaId);
  const origen = nivel.tipo === "tienda" ? preciosTienda : valoresDeZona;
  return origen.filter(
    (v) =>
      v.mensajeroId === null && v.tiendaId === c.tiendaId && v.zonaId === c.zonaId && v.grupoId === c.grupoId,
  );
}

export function claveDeCelda(concepto: TarifaConcepto, vehiculoId: string | null): string {
  return `${concepto}:${vehiculoId ?? "todos"}`;
}

export function indiceDeValores(valores: readonly TarifaValorDTO[]): ReadonlyMap<string, TarifaValorDTO> {
  return new Map(valores.map((v) => [claveDeCelda(v.concepto, v.vehiculoId), v]));
}

export interface Celda {
  valor: string;
  modo: ModoTarifa;
  ivaPct: string;
}

/** R20, R61: una celda sin valor nace vacia. La referencia no se consulta aqui, y el IVA tampoco se prellena. */
export function celdaDeGuardado(guardado: TarifaValorDTO | undefined, modoPorDefecto: ModoTarifa = "monto"): Celda {
  if (guardado === undefined) return { valor: "", modo: modoPorDefecto, ivaPct: "" };
  return {
    valor: montoParaCampo(guardado.valor),
    modo: guardado.modo,
    ivaPct: guardado.ivaPct === null ? "" : montoParaCampo(guardado.ivaPct),
  };
}

/** El separador decimal del teclado de quien digita; `2.800` queda con 3 decimales y lo rechaza el service. */
function decimalDeCampo(texto: string): string {
  return texto.trim().replace(",", ".");
}

function canonico(texto: string): string {
  const d = montoParaCampo(decimalDeCampo(texto));
  return d.includes(".") ? d.replace(/\.?0+$/, "") : d;
}

export function mismoDecimal(a: string, b: string): boolean {
  return canonico(a) === canonico(b);
}

export interface CeldaEditada {
  clave: string;
  concepto: TarifaConcepto;
  vehiculoId: string | null;
  guardado: TarifaValorDTO | undefined;
  celda: Celda;
}

export type CambioDeValor =
  | { accion: "fijar"; clave: string; datos: Record<string, unknown> }
  | { accion: "quitar"; clave: string; id: string };

export interface PlanDeGuardado {
  cambios: CambioDeValor[];
  /** Filas que no se envian: no llegan al servidor y conservan lo digitado (R38, R61). */
  errores: Record<string, string[]>;
}

/**
 * R35: se envia solo lo cambiado. Vacio con valor guardado = quitar; vacio sin valor = nada, nunca un 0. El
 * pago se construye sin la clave `ivaPct`: el service rechaza tambien `null` y `"0"` (R36).
 */
export function planDeGuardado(editadas: readonly CeldaEditada[], columnas: ColumnasDelNivel): PlanDeGuardado {
  const cambios: CambioDeValor[] = [];
  const errores: Record<string, string[]> = {};

  for (const { clave, concepto, vehiculoId, guardado, celda } of editadas) {
    const valor = decimalDeCampo(celda.valor);
    if (valor === "") {
      if (guardado !== undefined) cambios.push({ accion: "quitar", clave, id: guardado.id });
      continue;
    }

    const base = {
      concepto,
      modo: celda.modo,
      valor,
      zonaId: columnas.zonaId,
      grupoId: columnas.grupoId,
      ...(columnas.mensajeroId === undefined ? {} : { mensajeroId: columnas.mensajeroId }),
    };
    if (!esConceptoTienda(concepto)) {
      const sinCambio = guardado !== undefined && mismoDecimal(valor, guardado.valor) && celda.modo === guardado.modo;
      if (!sinCambio) cambios.push({ accion: "fijar", clave, datos: { ...base, tiendaId: null, vehiculoId } });
      continue;
    }

    const ivaPct = decimalDeCampo(celda.ivaPct);
    if (ivaPct === "") {
      errores[clave] = [TEXTOS.ivaObligatorio];
      continue;
    }
    const sinCambio =
      guardado !== undefined &&
      mismoDecimal(valor, guardado.valor) &&
      celda.modo === guardado.modo &&
      mismoDecimal(ivaPct, guardado.ivaPct ?? "");
    if (!sinCambio) {
      cambios.push({ accion: "fijar", clave, datos: { ...base, ivaPct, tiendaId: columnas.tiendaId, vehiculoId: null } });
    }
  }
  return { cambios, errores };
}

/** R37, R38: lo que se pinta en la fila. Un `validation_error` trae su mensaje: el de la carrera, por ejemplo. */
export function erroresDeResultado(resultado: ResultadoDeCambio): string[] {
  if (resultado.status === "validation_error") {
    const mensajes = Object.values(resultado.fieldErrors ?? {}).flat();
    return mensajes.length > 0 ? mensajes : [TEXTOS.filaError];
  }
  if (resultado.status === "not_found") return [TEXTOS.filaNoExiste];
  if (resultado.status === "forbidden") return [TEXTOS.filaSinPermiso];
  return [TEXTOS.filaError];
}

/** La referencia de una fila, segun el nivel. `null` tras activar: la columna no se pinta (R24). */
export function referenciaDe(
  referencia: ReferenciaDeZona | null,
  nivel: Nivel,
  concepto: TarifaConcepto,
  vehiculoId: string | null,
): Referencia | null {
  if (referencia === null) return null;
  const de = (mapa: Partial<Record<TarifaConcepto, Referencia>> | undefined): Referencia | null =>
    mapa?.[concepto] ?? null;
  if (vehiculoId !== null) return de(referencia.vehiculos[vehiculoId]);
  if (nivel.tipo === "zona") return de(referencia.zona);
  if (nivel.tipo === "grupo") return de(referencia.grupos[nivel.grupoId]);
  if (referencia.tienda === null) return null;
  if (nivel.alcance.tipo === "todas") return de(referencia.tienda.enTodasSusZonas);
  if (nivel.alcance.tipo === "zona") return de(referencia.tienda.enZona);
  return de(referencia.tienda.enGrupos[nivel.alcance.grupoId]);
}

/** R49, R51: los valores por vehiculo guardados en ese nivel y esa pestaña. */
export function valoresPorVehiculo(valores: readonly TarifaValorDTO[], actor: TarifaActor): TarifaValorDTO[] {
  return valores.filter((v) => v.vehiculoId !== null && CATALOGO_CONCEPTOS[v.concepto].actor === actor);
}
