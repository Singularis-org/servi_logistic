// SL-20 (design §6) — el contrato de la carga de la division geografica de un pais por CSV.
//
// Modulo PURO: lo comparten `planificarDivision` (que valida y cruza), el service que lee el
// archivo y el repositorio que escribe el plan. Los nombres de columna son NEUTROS (`nivel_1`…)
// porque cada pais llama distinto a sus niveles; la pantalla muestra la equivalencia.

import type { NivelGeografico } from "@/lib/types/geografia-nodo";

/** Columnas obligatorias de la cabecera (R28), ya normalizadas (minusculas y recortadas). */
export const COLUMNAS_DIVISION = [
  "nivel_1",
  "codigo_nivel_1",
  "nivel_2",
  "codigo_nivel_2",
  "nivel_3",
  "codigo_nivel_3",
] as const;
export type ColumnaDivision = (typeof COLUMNAS_DIVISION)[number];

/**
 * Cotas del archivo (R28, design §6). 5 MB es el `bodySizeLimit` de las Server Actions en
 * `next.config.ts`; las filas son de datos, sin la cabecera.
 */
export const DIVISION_MAX_BYTES = 5 * 1024 * 1024;
export const DIVISION_TOPE_DE_FILAS_CSV = 10_000;
/** Cuantos errores de linea devuelve la respuesta como mucho; `total` dice cuantos hubo. */
export const DIVISION_MAX_ERRORES = 200;

/**
 * Una fila de datos del CSV, tal cual se leyo (texto literal, recortado; `""` si vacia).
 * `linea` es la del archivo: la que cita cada error (R25).
 */
export interface FilaDivision {
  linea: number;
  nivel1: string;
  codigoNivel1: string;
  nivel2: string;
  codigoNivel2: string;
  nivel3: string;
  codigoNivel3: string;
}

export interface ErrorDeLinea {
  linea: number;
  mensaje: string;
}

/** Lo que devuelve una carga buena (R24). */
export interface ResumenCarga {
  creados: Record<NivelGeografico, number>;
  /** Nodos distintos del archivo que ya estaban en la base (activos o retirados). */
  existentes: number;
  /** Nodos existentes sin codigo a los que la carga les pone el de la fila (R26). */
  codigosCompletados: number;
}

// ── Entrada y salida de `planificarDivision` ─────────────────────────────────────────────────

/**
 * Un nodo que ya esta en la base, del pais que se carga. `padreId` es `null` en las provincias.
 * Lista plana por nivel: es lo que el repositorio saca con una consulta por tabla.
 */
export interface NodoExistente {
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  padreId: string | null;
}

export type ArbolExistente = Record<NivelGeografico, NodoExistente[]>;

/**
 * El padre de un alta: un nodo de la base o un alta del mismo archivo. Las altas se identifican
 * por una `clave` del plan y no por un id: la funcion es pura y el id lo genera quien escribe.
 */
export type RefNodo = { tipo: "existente"; id: string } | { tipo: "nuevo"; clave: string };

export interface AltaDePlan {
  clave: string;
  /** Nombre a guardar, con `normalizarNombreGeografico` (conserva mayusculas y acentos). */
  nombre: string;
  codigo: string | null;
  /** `null` solo en las provincias. */
  padre: RefNodo | null;
}

export interface CodigoACompletar {
  nivel: NivelGeografico;
  id: string;
  codigo: string;
}

/**
 * Lo que hay que escribir. Las altas van por nivel para crearlas de arriba abajo; ningun nodo
 * existente cambia salvo el codigo, y solo si no tenia (R26).
 */
export interface PlanDivision {
  altas: Record<NivelGeografico, AltaDePlan[]>;
  codigosACompletar: CodigoACompletar[];
  resumen: ResumenCarga;
}

export type ResultadoPlanificacion = { errores: ErrorDeLinea[] } | { plan: PlanDivision };
