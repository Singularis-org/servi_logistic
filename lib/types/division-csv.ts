// SL-20 (design §6) — el contrato de la carga de la division geografica de un pais por CSV.
//
// Modulo PURO: lo comparten `planificarDivision` (que valida y cruza), el service que lee el
// archivo y el repositorio que escribe el plan. Los nombres de columna son NEUTROS (`nivel_1`…)
// porque cada pais llama distinto a sus niveles; la pantalla muestra la equivalencia.

import type { NivelGeografico } from "@/lib/types/geografia-nodo";
import type { ReglaDeCodigoDeTipo } from "@/lib/utils/codigo-geografico";

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

// ── SLT-46 (design §5; R30–R34): la carga a P profundidades ─────────────────────────────────
//
// P es el numero de tipos del pais (2–10). Las columnas siguen siendo neutras, `nivel_<k>` y
// `codigo_nivel_<k>` (P4); para CR, P = 3 y son las seis de arriba. Todo lo que arriba va por
// `NivelGeografico` aqui va por profundidad (numero, 1 = raiz).
//
// Conviven con las formas de SL-20 hasta que T4 pase `CargaDivisionService` y `GeoRepository` a
// estas y retire aquellas; `planificarDivision` con la firma vieja traduce a estas y de vuelta.

/** La columna del nombre de la profundidad `k`. */
export function columnaNivel(k: number): string {
  return `nivel_${k}`;
}

/** La columna del codigo de la profundidad `k`. */
export function columnaCodigoNivel(k: number): string {
  return `codigo_nivel_${k}`;
}

/** R30: las columnas obligatorias de un pais de `p` tipos, en el orden de la cabecera. */
export function columnasDivision(p: number): string[] {
  return Array.from({ length: p }, (_, i) => [columnaNivel(i + 1), columnaCodigoNivel(i + 1)]).flat();
}

/** Las profundidades que una fila debe llenar siempre (como `nivel_1` y `nivel_2` en SL-20). */
export const DIVISION_PROFUNDIDADES_OBLIGATORIAS = 2;

/**
 * Una fila de datos a P profundidades: `niveles[k - 1]` son las celdas de `nivel_<k>` y
 * `codigo_nivel_<k>`, tal cual se leyeron (`""` si vacias). Siempre P entradas.
 */
export interface FilaDivisionPorNiveles {
  linea: number;
  niveles: { nombre: string; codigo: string }[];
}

/** Un nodo del pais ya en la base, con su profundidad (lo que lee `leerDivisionDePais`). */
export interface NodoExistenteConProfundidad extends NodoExistente {
  profundidad: number;
}

/**
 * Lo que la planificacion necesita de un tipo: su profundidad y su regla de codigo (R17). Lo cumple
 * `TipoNivelDTO`. Los tipos de un pais van de 1 a P sin huecos.
 */
export interface TipoDeDivision extends ReglaDeCodigoDeTipo {
  profundidad: number;
}

export interface CodigoACompletarPorProfundidad {
  profundidad: number;
  id: string;
  codigo: string;
}

/** R33: lo que devuelve una carga buena, con las altas por profundidad (claves 1..P). */
export interface ResumenCargaPorProfundidad {
  creados: Record<number, number>;
  existentes: number;
  codigosCompletados: number;
}

/** Las altas por profundidad (claves 1..P), para crearlas de arriba abajo. */
export interface PlanDivisionPorProfundidad {
  altas: Record<number, AltaDePlan[]>;
  codigosACompletar: CodigoACompletarPorProfundidad[];
  resumen: ResumenCargaPorProfundidad;
}

export type ResultadoPlanificacionPorProfundidad =
  | { errores: ErrorDeLinea[] }
  | { plan: PlanDivisionPorProfundidad };
