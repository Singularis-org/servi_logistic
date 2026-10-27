import { z } from "zod";

import { normalizarNombreGeografico, type NivelGeografico } from "@/lib/types/geografia-nodo";
import type { ReglaDeCodigoDePais } from "@/lib/utils/codigo-geografico";

// SL-20 (design §2.1, §5, §7; R1, R19, R20, R23) — el país: su schema de alta, su DTO y los nombres
// de sus tres niveles.
//
// Modulo PURO: solo zod y tipos. Lo importan el servicio, el repositorio, el layout y, por los
// tipos, la pantalla.

/** ISO 3166-1 alfa-2, igual que el `CHECK (id ~ '^[A-Z]{2}$')` de la tabla `pais`. */
export const CODIGO_PAIS = /^[A-Z]{2}$/;

// Cotas de los nombres del país y de sus niveles (design §5).
export const PAIS_NOMBRE_MIN = 2;
export const PAIS_NOMBRE_MAX = 40;

/** Se guarda recortado y con los espacios colapsados, con sus mayúsculas y sus acentos. */
const nombrePaisSchema = z
  .string()
  .transform(normalizarNombreGeografico)
  .pipe(
    z
      .string()
      .min(PAIS_NOMBRE_MIN, `Debe tener al menos ${PAIS_NOMBRE_MIN} caracteres.`)
      .max(PAIS_NOMBRE_MAX, `No puede superar los ${PAIS_NOMBRE_MAX} caracteres.`),
  );

/**
 * El alta de un país (R23). Sin regla de código: la pantalla no la ofrece y el país nuevo acepta
 * códigos de texto libre (R17); solo Costa Rica la tiene, puesta por su migración.
 */
export const crearPaisSchema = z
  .object({
    id: z.string().trim().regex(CODIGO_PAIS, "El código son dos letras mayúsculas (ISO 3166-1 alfa-2)."),
    nombre: nombrePaisSchema,
    nivel1Singular: nombrePaisSchema,
    nivel1Plural: nombrePaisSchema,
    nivel2Singular: nombrePaisSchema,
    nivel2Plural: nombrePaisSchema,
    nivel3Singular: nombrePaisSchema,
    nivel3Plural: nombrePaisSchema,
  })
  .strict();

export type CrearPaisInput = z.infer<typeof crearPaisSchema>;

/** Un país tal como sale de la base. Cumple `ReglaDeCodigoDePais`, la entrada de `validarCodigo`. */
export interface PaisDTO extends ReglaDeCodigoDePais {
  id: string;
  nombre: string;
  nivel1Singular: string;
  nivel1Plural: string;
  nivel2Singular: string;
  nivel2Plural: string;
  nivel3Singular: string;
  nivel3Plural: string;
  /** Enmienda 2026-10-26, decisión 6 (R44): hay cobertura. Con `false` no se acepta en un alta nueva de empresa (R45). */
  disponible: boolean;
}

/**
 * Un país que se puede elegir en el alta de empresa (R9, R45): solo los `disponible = true`. Lo que
 * necesita el `Select` y nada más: el valor (`id`, el código) y la etiqueta (`nombre`).
 */
export interface PaisDisponibleDTO {
  id: string;
  nombre: string;
}

export interface EtiquetaDeNivel {
  singular: string;
  plural: string;
}

/** Cómo llama un país a cada nivel. Las claves siguen siendo `provincia`/`canton`/`distrito` (R18). */
export type EtiquetasGeograficas = Record<NivelGeografico, EtiquetaDeNivel>;

export type NombresDeNivelesDePais = Pick<
  PaisDTO,
  "nivel1Singular" | "nivel1Plural" | "nivel2Singular" | "nivel2Plural" | "nivel3Singular" | "nivel3Plural"
>;

export function etiquetasDePais(pais: NombresDeNivelesDePais): EtiquetasGeograficas {
  return {
    provincia: { singular: pais.nivel1Singular, plural: pais.nivel1Plural },
    canton: { singular: pais.nivel2Singular, plural: pais.nivel2Plural },
    distrito: { singular: pais.nivel3Singular, plural: pais.nivel3Plural },
  };
}

/**
 * Las etiquetas cuando no hay país del que leerlas: la sesión del superadmin, que no tiene empresa
 * (design §7). Neutras a propósito: usar las de Costa Rica aquí volvería a dar a un país por defecto.
 */
export const ETIQUETAS_NEUTRAS: EtiquetasGeograficas = {
  provincia: { singular: "Nivel 1", plural: "Nivel 1" },
  canton: { singular: "Nivel 2", plural: "Nivel 2" },
  distrito: { singular: "Nivel 3", plural: "Nivel 3" },
};
