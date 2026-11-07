import { z } from "zod";

import { paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import { normalizarNombreGeografico, type NivelGeografico } from "@/lib/types/geografia-nodo";
import type { ReglaDeCodigoDePais } from "@/lib/utils/codigo-geografico";

// SL-20 (design §2.1, §5, §7; R1, R19, R20, R23, R41) — el país: su schema de alta, su DTO y los
// nombres de sus tres niveles.
//
// Modulo PURO: solo zod, tipos y el catálogo estático `lib/constants/paises-iso-3166-1.ts`. Lo
// importan el servicio, el repositorio, el layout y, por los tipos, la pantalla.

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

/** R41: el mensaje de un código que no está en el catálogo. */
export const PAIS_FUERA_DEL_CATALOGO = "Elige un país de la lista (ISO 3166-1).";

/**
 * El alta de un país (R23, R41; enmienda 2026-10-26, decisión 5). El país se ELIGE del catálogo
 * ISO 3166-1: la entrada trae solo su código (`id`) y los seis nombres de nivel, que sí se teclean.
 * El nombre no viaja: lo pone el servicio desde el catálogo (`DatosDeAltaDePais`). Sin regla de
 * código: la pantalla no la ofrece y el país nuevo acepta códigos de texto libre (R17); solo Costa
 * Rica la tiene, puesta por su migración.
 */
export const crearPaisSchema = z
  .object({
    // R41: un código fuera del catálogo (también `XA`–`XZ`, que solo crea la fábrica de tests) es
    // `validation_error` en `id`. Estar en el catálogo implica cumplir `CODIGO_PAIS`.
    id: z
      .string()
      .trim()
      .refine((id) => paisDelCatalogo(id) !== null, PAIS_FUERA_DEL_CATALOGO),
    nivel1Singular: nombrePaisSchema,
    nivel1Plural: nombrePaisSchema,
    nivel2Singular: nombrePaisSchema,
    nivel2Plural: nombrePaisSchema,
    nivel3Singular: nombrePaisSchema,
    nivel3Plural: nombrePaisSchema,
  })
  .strict();

export type CrearPaisInput = z.infer<typeof crearPaisSchema>;

/** Lo que el repositorio escribe en `pais`: la entrada validada más el nombre del catálogo (R23). */
export type DatosDeAltaDePais = CrearPaisInput & { nombre: string };

// ── SLT-46 (design §4.1; R23, R24, R25, R48, R49) — el país con su catálogo de tipos ─────────

/** P2: un país tiene de 2 a 10 tipos de nivel. Lo comparten el alta y «agregar nivel» (tope). */
export const PAIS_NIVELES_MIN = 2;
export const PAIS_NIVELES_MAX = 10;

const tipoDeAltaSchema = z.object({ singular: nombrePaisSchema, plural: nombrePaisSchema }).strict();

/**
 * El alta de un país con su lista ORDENADA de tipos: el primero es `nivel_1`, el último `nivel_P`
 * (R23). Mismo `id` de catálogo que `crearPaisSchema` (R24: los demás rechazos, como en SL-20).
 *
 * Convive con `crearPaisSchema` (seis campos fijos) hasta que T4 pase `PaisService` y la pantalla a
 * este y retire aquel: cambiarlo en sitio rompería ya el repositorio y el formulario.
 */
export const crearPaisConTiposSchema = z
  .object({
    id: z
      .string()
      .trim()
      .refine((id) => paisDelCatalogo(id) !== null, PAIS_FUERA_DEL_CATALOGO),
    tipos: z
      .array(tipoDeAltaSchema)
      .min(PAIS_NIVELES_MIN, `Un país tiene al menos ${PAIS_NIVELES_MIN} niveles.`)
      .max(PAIS_NIVELES_MAX, `Un país tiene como mucho ${PAIS_NIVELES_MAX} niveles.`),
  })
  .strict();

export type CrearPaisConTiposInput = z.infer<typeof crearPaisConTiposSchema>;

/** R25, R26: los dos nombres de un tipo ya creado, con las cotas del alta (2–40). */
export const renombrarTipoNivelSchema = z
  .object({
    tipoId: z.string().min(1),
    nombreSingular: nombrePaisSchema,
    nombrePlural: nombrePaisSchema,
  })
  .strict();

export type RenombrarTipoNivelInput = z.infer<typeof renombrarTipoNivelSchema>;

/**
 * P3 (R48, R49): agregar un nivel. Sin campo de posición a propósito: siempre va al final, debajo
 * del más profundo; insertar en medio reescribiría la profundidad de nodos existentes. El tope de
 * 10 no se puede ver aquí (depende de cuántos tipos tiene el país); lo aplica el repositorio.
 */
export const agregarNivelPaisSchema = z
  .object({
    paisId: z.string().regex(CODIGO_PAIS, "El código son dos letras mayúsculas (ISO 3166-1 alfa-2)."),
    nombreSingular: nombrePaisSchema,
    nombrePlural: nombrePaisSchema,
  })
  .strict();

export type AgregarNivelPaisInput = z.infer<typeof agregarNivelPaisSchema>;

/**
 * Enmienda 2026-10-26, decisión 6 (R47): encender o apagar la cobertura de un país. `disponible` es
 * el estado DESEADO, no un interruptor: pedir el que ya tiene es éxito sin escribir.
 */
export const cambiarDisponibilidadPaisSchema = z
  .object({
    id: z.string().regex(CODIGO_PAIS, "El código son dos letras mayúsculas (ISO 3166-1 alfa-2)."),
    disponible: z.boolean(),
  })
  .strict();

export type CambiarDisponibilidadPaisInput = z.infer<typeof cambiarDisponibilidadPaisSchema>;

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

/**
 * Las etiquetas de los tres niveles de las pantallas de empresa, de `pais.nivel_N_*`.
 *
 * SLT-46 (design §2.4, P2, P10; R51) — convención `''`: un país de 2 niveles guarda texto vacío en
 * `nivel_3_singular` y `nivel_3_plural` (las columnas son `NOT NULL` y quitarlo no sería aditivo), y
 * `pais_tipos_de_nivel` no le crea tipo `nivel_3` mientras `nivel_3_singular` sea `''`. El singular
 * es la marca, igual que en esa función. Con la marca, `distrito` repite la etiqueta del nivel 2
 * (singular y plural): una columna titulada en blanco no se entiende, y ocultarla es de SLT-47.
 * El `''` lo pone solo el repositorio; ningún schema lo acepta como nombre (2–40).
 */
export function etiquetasDePais(pais: NombresDeNivelesDePais): EtiquetasGeograficas {
  const nivel2 = { singular: pais.nivel2Singular, plural: pais.nivel2Plural };
  const sinNivel3 = pais.nivel3Singular === "";
  return {
    provincia: { singular: pais.nivel1Singular, plural: pais.nivel1Plural },
    canton: nivel2,
    distrito: sinNivel3 ? { ...nivel2 } : { singular: pais.nivel3Singular, plural: pais.nivel3Plural },
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
