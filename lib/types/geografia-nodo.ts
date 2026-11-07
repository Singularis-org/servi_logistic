import { z } from "zod";

import type { ReglaDeCodigoDeTipo } from "@/lib/utils/codigo-geografico";

// FICHA 374 (design §5.1) — EL VOCABULARIO, LOS SCHEMAS DEL BORDE Y LOS DTO DEL ARBOL.
//
// POR QUE ESTE MODULO EXISTE Y NO VIVE DENTRO DE `lib/actions/geografia.ts`, que es donde el
// `design.md` los dibuja: aquel archivo lleva `"use server"`, y un modulo de Server Actions SOLO
// puede exportar funciones asincronas. Un `export const NIVELES_GEOGRAFICOS` ahi dentro no
// compila. Es exactamente el reparto que ya usa el precedente de vehiculos —`lib/types/vehiculos.ts`
// tiene el schema y `lib/actions/vehiculos.ts` la accion—, asi que el molde se sigue igual.
//
// Modulo PURO: solo zod. Sin Prisma, sin React, sin `lib/services`.

/**
 * El vocabulario CERRADO del nivel. Se usa igual en el schema del borde, en el service y en el
 * repositorio: el nivel viaja como DATO en vez de multiplicar
 * `crearProvincia`/`crearCanton`/`crearDistrito` x `activar`/`desactivar`, que serian seis cuerpos
 * identicos y cinco sitios donde olvidar la comprobacion de rol (design §9, A6).
 */
export const NIVELES_GEOGRAFICOS = ["provincia", "canton", "distrito"] as const;
export type NivelGeografico = (typeof NIVELES_GEOGRAFICOS)[number];

/** El nivel del PADRE de cada nivel; `null` para provincia, que no tiene. */
export const NIVEL_PADRE: Record<NivelGeografico, NivelGeografico | null> = {
  provincia: null,
  canton: "provincia",
  distrito: "canton",
};

// Cotas del nombre. Minimo para que no entre un caracter accidental; maximo porque la columna es
// TEXT sin tope propio y un pegado accidental entraria entero.
export const GEO_NOMBRE_MIN = 2;
export const GEO_NOMBRE_MAX = 80;

/**
 * Normaliza el nombre PARA GUARDARLO: recorta y colapsa los espacios internos (R16).
 *
 * ⚠️ NO baja a minusculas y NO quita acentos, y esa es la diferencia con `normalizeName`. Lo que
 * se PERSISTE es el nombre tal y como lo escribio la persona —«San José», con su mayuscula y su
 * acento—, porque es lo que se lee en toda la app y lo que dice la DTA del IGN. La forma plegada
 * de `normalizeName` se usa para COMPARAR (R17), nunca para guardar. Son dos cosas distintas y
 * confundirlas escribiria «san jose» en el catalogo.
 */
export function normalizarNombreGeografico(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

const nombreGeoSchema = z
  .string()
  .transform(normalizarNombreGeografico)
  .pipe(
    z
      .string()
      .min(GEO_NOMBRE_MIN, `El nombre debe tener al menos ${GEO_NOMBRE_MIN} caracteres.`)
      .max(GEO_NOMBRE_MAX, `El nombre no puede superar los ${GEO_NOMBRE_MAX} caracteres.`),
  );

/**
 * SL-20 (R29) — el código oficial del alta, opcional. Solo se recorta: la regla (R17) depende del
 * país y del código del padre, que el borde no conoce; la aplica el service con `validarCodigo`.
 * Vacío equivale a no traerlo.
 */
const codigoGeoSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/**
 * El alta, como union DISCRIMINADA por el nivel (R25).
 *
 * La discriminada mantiene el borde igual de estricto que seis acciones separadas: un `cantonId`
 * en un alta de provincia es `validation_error`, NO un campo ignorado en silencio. `.strict()` no
 * es decorativo: una clave desconocida se rechaza, no se descarta.
 *
 * SL-20: la provincia cuelga de un país (`paisId`, ISO alfa-2); cantón y distrito heredan el de su
 * padre, así que no lo llevan.
 */
export const crearNodoGeograficoSchema = z.discriminatedUnion("nivel", [
  z
    .object({
      nivel: z.literal("provincia"),
      nombre: nombreGeoSchema,
      paisId: z.string().regex(/^[A-Z]{2}$/, "El país no es válido."),
      codigo: codigoGeoSchema,
    })
    .strict(),
  z
    .object({
      nivel: z.literal("canton"),
      nombre: nombreGeoSchema,
      provinciaId: z.string().min(1),
      codigo: codigoGeoSchema,
    })
    .strict(),
  z
    .object({
      nivel: z.literal("distrito"),
      nombre: nombreGeoSchema,
      cantonId: z.string().min(1),
      codigo: codigoGeoSchema,
    })
    .strict(),
]);

export type CrearNodoGeograficoInput = z.infer<typeof crearNodoGeograficoSchema>;

/** El cambio de activacion. `activo` es el estado DESEADO, no un toggle: pedir dos veces lo mismo
 * tiene que ser idempotente (R21) y un toggle no puede serlo. */
export const cambiarActivacionGeograficaSchema = z
  .object({
    nivel: z.enum(NIVELES_GEOGRAFICOS),
    id: z.string().min(1),
    activo: z.boolean(),
  })
  .strict();

export type CambiarActivacionGeograficaInput = z.infer<typeof cambiarActivacionGeograficaSchema>;

/**
 * FICHA 375 — el RENOMBRADO. Mismo `{nivel, id}` que el resto, mas el nombre nuevo.
 *
 * REUSA `nombreGeoSchema`, el MISMO del alta, a proposito: recorta, colapsa espacios y exige las
 * mismas cotas. Un segundo esquema de nombre seria un segundo contrato capaz de admitir por
 * renombrado lo que el alta rechaza —y al reves—, y la base tiene UN solo `@@unique` para los dos
 * caminos. `.strict()` no es decorativo: una clave desconocida se rechaza, no se descarta.
 */
export const renombrarNodoGeograficoSchema = z
  .object({
    nivel: z.enum(NIVELES_GEOGRAFICOS),
    id: z.string().min(1),
    nombre: nombreGeoSchema,
  })
  .strict();

export type RenombrarNodoGeograficoInput = z.infer<typeof renombrarNodoGeograficoSchema>;

/** Un nodo, sin mas: lo que necesita el conteo de la confirmacion (R60). */
export const nodoGeograficoSchema = z
  .object({ nivel: z.enum(NIVELES_GEOGRAFICOS), id: z.string().min(1) })
  .strict();

export type NodoGeograficoInput = z.infer<typeof nodoGeograficoSchema>;

// ── SLT-46 (design §4.1): el borde por NODO, a cualquier profundidad ─────────────────────────
//
// Conviven con los de arriba (por `nivel`) solo hasta T4, que pasa la action y los services a
// estos y retira aquellos; cambiarlos en sitio aqui romperia a la vez la action, `GeografiaService`
// y la pantalla. El nivel ya no viaja: lo dice la profundidad del nodo en la base, y el tipo de un
// alta es el de su profundidad (P1), asi que tampoco se elige.

const idDeNodoSchema = z.string().min(1);

/**
 * El alta: raiz de un pais (`paisId`) o hijo de un nodo (`padreId`) de cualquier profundidad.
 * Cada rama es `.strict()`: traer las dos claves, o ninguna, es `validation_error` y no una
 * eleccion silenciosa de una de ellas.
 */
export const altaDeNodoSchema = z.union([
  z
    .object({
      paisId: z.string().regex(/^[A-Z]{2}$/, "El país no es válido."),
      nombre: nombreGeoSchema,
      codigo: codigoGeoSchema,
    })
    .strict(),
  z.object({ padreId: idDeNodoSchema, nombre: nombreGeoSchema, codigo: codigoGeoSchema }).strict(),
]);

export type AltaDeNodoInput = z.infer<typeof altaDeNodoSchema>;

/**
 * El renombre. R22: sin campo de padre; `.strict()` rechaza un `padreId` en vez de descartarlo, que
 * es lo que impide que el renombre se convierta en un «mover» encubierto (mover es SLT-48).
 */
export const renombrarNodoSchema = z.object({ id: idDeNodoSchema, nombre: nombreGeoSchema }).strict();

export type RenombrarNodoInput = z.infer<typeof renombrarNodoSchema>;

/** El retiro o la reactivacion: `activo` es el estado deseado. R22: sin padre, igual que el renombre. */
export const cambiarActivacionNodoSchema = z
  .object({ id: idDeNodoSchema, activo: z.boolean() })
  .strict();

export type CambiarActivacionNodoInput = z.infer<typeof cambiarActivacionNodoSchema>;

/** Un nodo por su id, sin mas: el conteo de ordenes de la confirmacion del retiro (R20). */
export const nodoPorIdSchema = z.object({ id: idDeNodoSchema }).strict();

export type NodoPorIdInput = z.infer<typeof nodoPorIdSchema>;

/** El padre que exige el alta de cada nivel; `null` cuando el nivel no lleva padre. */
export function padreDeAlta(input: CrearNodoGeograficoInput): string | null {
  if (input.nivel === "canton") return input.provinciaId;
  if (input.nivel === "distrito") return input.cantonId;
  return null;
}

/**
 * SL-20 — dónde cuelga el alta: el padre en cantón y distrito, el PAÍS en la provincia. Es la clave
 * con la que `IGeoRepository.findHermanos` lee los hermanos y la regla de código.
 */
export function contenedorDeAlta(input: CrearNodoGeograficoInput): string {
  return input.nivel === "provincia" ? input.paisId : (padreDeAlta(input) as string);
}

// ── Los DTO del arbol ────────────────────────────────────────────────────────────────────────
//
// VIVEN AQUI Y NO EN LA SERVER ACTION porque desde la ficha 374 los produce `GeoRepository`, y un
// repositorio no puede importar un modulo `"use server"`. `lib/actions/geografia.ts` los
// RE-EXPORTA como tipos para que ningun consumidor actual tenga que cambiar su import.

export interface DistritoArbolDTO {
  id: string;
  nombre: string;
  /**
   * La zona UTILIZABLE del distrito, o `null`.
   *
   * ⚠️ FICHA 374 — CAMBIO DE COMPORTAMIENTO DELIBERADO. Antes esto era «la primera zona»
   * (`zonas: { take: 1 }`), asi que un distrito en DOS zonas se pintaba «(zona: X)» aunque la
   * carga masiva lo rechace por ambiguo. Esa etiqueta MENTIA. Ahora se aplica el MISMO colapso
   * 1/0/>1 de `_shared/zona-colapso.ts`: `null` con 0 zonas y tambien con mas de una.
   */
  zonaId: string | null;
  zonaNombre: string | null;
  /**
   * SLT-75 R14: TODAS las zonas de la empresa a las que pertenece el distrito, sin colapsar y
   * ordenadas por nombre. Obligatorio a proposito: un fixture viejo no compila en vez de pasar con
   * `undefined`. Con el indice unico por empresa trae como mucho una; el selector la usa para
   * bloquear el distrito y la edicion para preseleccionar, sin depender del colapso de `zonaId`.
   */
  zonas: { id: string; nombre: string }[];
  /**
   * Marca de zona especial de la EMPRESA de la transaccion (SL-38, `distrito_zona_especial`): el
   * distrito es especial para esta empresa si tiene su marca. Se resuelve en el repositorio con
   * `esZonaEspecialDeLaEmpresa` (`_shared/zona-especial.ts`).
   */
  zonaEspecial: boolean;
  /** FICHA 374: el flag PROPIO de esta fila. La disponibilidad efectiva la deriva quien lee, con
   * `estaDisponible`, mirando a sus ascendientes en este mismo arbol. */
  activo: boolean;
}

export interface CantonArbolDTO {
  id: string;
  nombre: string;
  /** FICHA 374: el flag PROPIO de este canton. */
  activo: boolean;
  distritos: DistritoArbolDTO[];
}

export interface ProvinciaArbolDTO {
  id: string;
  nombre: string;
  /** FICHA 374: el flag PROPIO de esta provincia. */
  activo: boolean;
  cantones: CantonArbolDTO[];
}

// ── SL-20: el árbol del superadmin (design §5, §8) ──────────────────────────────────────────
//
// SIN zona ni marca de zona especial: son de cada empresa, y en plataforma esa lectura mezclaría las
// de todas. Con el código oficial, que es lo que el superadmin edita junto al nombre.

export interface NodoPlataformaDTO {
  id: string;
  nombre: string;
  codigo: string | null;
  /** El flag PROPIO del nodo; la disponibilidad efectiva la deriva quien lee. */
  activo: boolean;
}

export interface CantonPlataformaDTO extends NodoPlataformaDTO {
  distritos: NodoPlataformaDTO[];
}

export interface ProvinciaPlataformaDTO extends NodoPlataformaDTO {
  cantones: CantonPlataformaDTO[];
}

// ── SLT-46 (design §4.6): el tipo de nivel y el arbol de N niveles ───────────────────────────

/**
 * Un tipo de nivel de un pais (`tipo_nivel_geografico`). `profundidad` es el `k` de su clave
 * `nivel_<k>`.
 *
 * Lleva tambien la regla de codigo (`ReglaDeCodigoDeTipo`), que §4.6 no lista: sin ella el alta
 * (`contextoDeAlta` → `validarCodigoDeTipo`, §4.3) y la carga CSV (`planificarDivision` con los
 * tipos de `leerDivisionDePais`, §4.4) tendrian que leer el tipo dos veces.
 */
export interface TipoNivelDTO extends ReglaDeCodigoDeTipo {
  id: string;
  clave: string;
  profundidad: number;
  nombreSingular: string;
  nombrePlural: string;
}

/** Un nodo del arbol del superadmin, a cualquier profundidad (R21). Sin zonas: son de cada empresa. */
export interface NodoArbolPlataformaDTO {
  id: string;
  nombre: string;
  codigo: string | null;
  /** El flag PROPIO del nodo; la disponibilidad efectiva la deriva quien lee. */
  activo: boolean;
  profundidad: number;
  tipoId: string;
  hijos: NodoArbolPlataformaDTO[];
}
