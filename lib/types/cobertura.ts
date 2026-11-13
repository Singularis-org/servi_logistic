// Ficha 465 (design §3.1) — tipos de dominio del Excel de cobertura por distrito.
//
// Modulo de TIPOS: no importa Prisma, React ni nada de `app/`. Y SIN TEXTOS DE UI: los «Sí»/«No»,
// los motivos legibles, «Sin zona» y «Varias zonas: …» se escriben en UN solo sitio del cliente
// (`cobertura-descarga-columnas.ts`, `filaCobertura`). Aqui viajan los hechos.

import type { PasoDeRuta } from "@/lib/types/geografia-nodo";

/**
 * Por que un distrito NO tiene cobertura, en el orden de precedencia de R9 (el mismo en que
 * `resolveGeo` rechaza: provincia -> canton -> distrito -> zona). Solo se informa la PRIMERA.
 */
export type MotivoSinCobertura =
  | "provincia_retirada"
  | "canton_retirado"
  | "distrito_retirado"
  | MotivoNivelRetirado
  | "sin_zona"
  | "varias_zonas";

/**
 * SLT-125 (R6; decision 2026-11-13) — el nivel k >= 4 retirado del catalogo. Los niveles 1-3 conservan
 * sus claves de hoy en todo pais (SL-20); desde el 4, `nivel_<k>_retirado`, como `nivel_<n>` (R3).
 */
export type MotivoNivelRetirado = `nivel_${number}_retirado`;

/** La zona del distrito cuando tiene EXACTAMENTE una (R11, R12, R14). */
export interface ZonaUnicaCobertura {
  nombre: string;
  /** La zona es la central (GAM, R12). */
  esCentral: boolean;
  /** Existe una tarifa con esa zona y SIN tienda (nivel 3 de la cascada, R14). */
  tieneTarifaGeneral: boolean;
}

/** Fila de dominio: una por distrito del catalogo, disponible o no (R4). */
export interface CoberturaDistritoDTO {
  provincia: string;
  canton: string;
  distrito: string;
  /** Disponibilidad efectiva: provincia, canton y distrito activos los tres (R7). */
  disponible: boolean;
  /** `disponible` Y zona unica (R8). */
  cobertura: boolean;
  /** `null` si y solo si `cobertura` (R9, R10). */
  motivo: MotivoSinCobertura | null;
  /** Nombres de TODAS las zonas del distrito, en orden alfabetico español (R11). */
  zonas: string[];
  /** `null` con 0 o con mas de una zona (R11, R12, R14). */
  zonaUnica: ZonaUnicaCobertura | null;
  /** La marca de zona especial de la EMPRESA del actor (SL-38 R15): «Sí» o «No», sin tercer valor. */
  zonaEspecial: boolean;
  /**
   * SLT-125 (design §4.2, P5; R6) — la ruta del lugar de la fila, del nivel 1 al nivel P del pais: las
   * columnas por nivel de la descarga. `provincia`, `canton` y `distrito` son sus niveles 1-3.
   * Opcional por el patron aditivo (R37): el servicio la envia siempre que el repositorio la trae.
   */
  ruta?: PasoDeRuta[];
}
