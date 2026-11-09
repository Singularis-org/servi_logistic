import { z } from "zod";

import { paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import { normalizarNombreGeografico, type NivelGeografico } from "@/lib/types/geografia-nodo";
import type { ReglaDeCodigoDePais } from "@/lib/utils/codigo-geografico";
import type { ReglaDocumento } from "@/lib/utils/documento";

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

// SLT-81 (design §4.1; R5, R7, R8, R9) — los datos del país y sus tipos de documento. Las cotas son
// las de los CHECK de SLT-42: el schema frena antes y con un mensaje por campo; la base sigue siendo
// la última red.

/** = CHECK `pais_prefijo_telefonico_formato`: 1 a 3 dígitos, sin `+` y sin `0` inicial (R7). */
export const PREFIJO_TELEFONICO = /^[1-9]\d{0,2}$/;
/** = CHECK `pais_telefono_digitos_rango` (R7). */
export const DIGITOS_NACIONALES_MIN = 4;
export const DIGITOS_NACIONALES_MAX = 14;
/** = CHECK `tipo_identificacion_largos` (R9). */
export const DOCUMENTO_LARGO_MAX = 30;
/** Tope de entrada del alta: anti-abuso, no regla de negocio. */
export const TIPOS_EN_ALTA_MAX = 10;

export const CARACTERES_DOCUMENTO = ["digitos", "alfanumerico"] as const;

const MENSAJE_PREFIJO = "El prefijo son de 1 a 3 dígitos, sin «+» y sin 0 inicial.";
const MENSAJE_DIGITOS = `Los dígitos nacionales son un número entero de ${DIGITOS_NACIONALES_MIN} a ${DIGITOS_NACIONALES_MAX}.`;
/** R8: también lo usa el servicio cuando la zona no está en la lista del runtime o de la base. */
export const MENSAJE_ZONA = "Elige una zona horaria de la lista.";
const MENSAJE_CARACTERES = "Elige «Solo dígitos» o «Letras y dígitos».";
const MENSAJE_LARGO = `El largo es un número entero de 1 a ${DOCUMENTO_LARGO_MAX}.`;
const MENSAJE_LARGO_ORDEN = "El largo máximo no puede ser menor que el mínimo.";

const largoDocumentoSchema = z
  .number({ error: MENSAJE_LARGO })
  .int(MENSAJE_LARGO)
  .min(1, MENSAJE_LARGO)
  .max(DOCUMENTO_LARGO_MAX, MENSAJE_LARGO);

/** Los campos de un tipo de documento (R9). La regla `mínimo ≤ máximo` la pone `conLargosEnOrden`. */
const camposDeTipoDocumento = {
  nombre: nombrePaisSchema,
  caracteres: z.enum(CARACTERES_DOCUMENTO, { error: MENSAJE_CARACTERES }),
  largoMin: largoDocumentoSchema,
  largoMax: largoDocumentoSchema,
};

/**
 * R9: `largoMin ≤ largoMax`, con el error en `largoMax`. Una función y no un `.refine` compartido:
 * zod 4 no deja extender (`.extend`) un objeto ya refinado, y un `.and` de dos `.strict()` rechaza
 * los campos del otro lado.
 */
function conLargosEnOrden<T extends z.ZodType<{ largoMin: number; largoMax: number }>>(schema: T) {
  return schema.refine((t) => t.largoMin <= t.largoMax, { path: ["largoMax"], message: MENSAJE_LARGO_ORDEN });
}

const tipoDocumentoNuevoSchema = conLargosEnOrden(z.object(camposDeTipoDocumento).strict());

export type TipoDocumentoNuevoInput = z.infer<typeof tipoDocumentoNuevoSchema>;

/** Prefijo, dígitos y zona (R7, R8). El prefijo oficial (R26) y la lista de zonas los mira el servicio. */
const datosTelefonoYZona = {
  prefijoTelefonico: z.string({ error: MENSAJE_PREFIJO }).trim().regex(PREFIJO_TELEFONICO, MENSAJE_PREFIJO),
  telefonoDigitosNacionales: z
    .number({ error: MENSAJE_DIGITOS })
    .int(MENSAJE_DIGITOS)
    .min(DIGITOS_NACIONALES_MIN, MENSAJE_DIGITOS)
    .max(DIGITOS_NACIONALES_MAX, MENSAJE_DIGITOS),
  zonaHoraria: z.string({ error: MENSAJE_ZONA }).trim().min(1, MENSAJE_ZONA),
};

/**
 * El alta de un país (R23, R41; enmienda 2026-10-26, decisión 5). El país se ELIGE del catálogo
 * ISO 3166-1: la entrada trae su código (`id`) y los seis nombres de nivel, que sí se teclean.
 * El nombre no viaja: lo pone el servicio desde el catálogo (`DatosDeAltaDePais`). Sin regla de
 * código: la pantalla no la ofrece y el país nuevo acepta códigos de texto libre (R17); solo Costa
 * Rica la tiene, puesta por su migración.
 *
 * SLT-81 (R5): además, el prefijo, los dígitos, la zona y al menos un tipo de documento.
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
    ...datosTelefonoYZona,
    tiposDocumento: z
      .array(tipoDocumentoNuevoSchema, { error: "Agrega al menos un tipo de documento." })
      .min(1, "Agrega al menos un tipo de documento.")
      .max(TIPOS_EN_ALTA_MAX, `No más de ${TIPOS_EN_ALTA_MAX} tipos de documento en el alta.`),
  })
  .strict();

export type CrearPaisInput = z.infer<typeof crearPaisSchema>;

/**
 * Lo que el repositorio escribe: la entrada validada más el nombre del catálogo (R23) y, en cada
 * tipo, la clave y el `value` que deriva el servicio (design §4.2).
 */
export type DatosDeAltaDePais = Omit<CrearPaisInput, "tiposDocumento"> & {
  nombre: string;
  tiposDocumento: DatosDeTipoDocumentoNuevo[];
};

/** Un tipo listo para insertar: lo validado más su identidad (`clave`, `value`), que no cambia al renombrar. */
export type DatosDeTipoDocumentoNuevo = TipoDocumentoNuevoInput & { clave: string; value: string };

/**
 * R10: editar prefijo, dígitos y zona de un país existente. `empresasConfirmadas` es el número de
 * empresas que el superadmin vio y confirmó; ausente = aún no confirmó.
 */
export const actualizarDatosPaisSchema = z
  .object({
    id: z.string().regex(CODIGO_PAIS, "El país no es válido."),
    ...datosTelefonoYZona,
    empresasConfirmadas: z.number().int().min(0).optional(),
  })
  .strict();

export type ActualizarDatosPaisInput = z.infer<typeof actualizarDatosPaisSchema>;

/** Los tres datos que `actualizarDatos` escribe (sin la confirmación, que es del servicio). */
export type DatosTelefonoYZona = Pick<
  ActualizarDatosPaisInput,
  "prefijoTelefonico" | "telefonoDigitosNacionales" | "zonaHoraria"
>;

/** R13: un tipo nuevo en un país que ya existe. */
export const crearTipoDocumentoSchema = conLargosEnOrden(
  z.object({ ...camposDeTipoDocumento, paisId: z.string().regex(CODIGO_PAIS, "El país no es válido.") }).strict(),
);

export type CrearTipoDocumentoInput = z.infer<typeof crearTipoDocumentoSchema>;

/** R13, R14: nombre y regla de formato. La clave y el `value` no se tocan. */
export const editarTipoDocumentoSchema = conLargosEnOrden(
  z.object({ ...camposDeTipoDocumento, id: z.string().uuid("El tipo de documento no es válido.") }).strict(),
);

export type EditarTipoDocumentoInput = z.infer<typeof editarTipoDocumentoSchema>;

/** R13, R15: `activo` es el estado DESEADO; pedir el que ya tiene es éxito sin escribir. */
export const cambiarActivoTipoDocumentoSchema = z
  .object({ id: z.string().uuid("El tipo de documento no es válido."), activo: z.boolean() })
  .strict();

export type CambiarActivoTipoDocumentoInput = z.infer<typeof cambiarActivoTipoDocumentoSchema>;

/** Lo que el alta de empresa necesita de cada país disponible (R20). */
export interface PaisParaAltaDTO {
  id: string;
  nombre: string;
  prefijoTelefonico: string | null;
  /** Solo los activos, por `orden`. `value` es lo que envía el formulario. */
  tiposDocumento: { id: string; value: string; nombre: string }[];
}

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
  /**
   * SLT-42 (R1; design §4.2): prefijo internacional en dígitos, sin `+`. `null` mientras el país no
   * lo tenga (R6): un país dado de alta por la pantalla de SL-20 nace sin él.
   */
  prefijoTelefonico: string | null;
  /** SLT-42 (R1): cuántos dígitos tiene un número nacional. `null` = aún sin dato (R6). */
  telefonoDigitosNacionales: number | null;
  /** SLT-42 (R1): identificador IANA. `null` = aún sin dato; lo que la necesite falla (R28). */
  zonaHoraria: string | null;
}

/**
 * SLT-42 (R2, R11; design §4.2) — un tipo de documento del catálogo de un país, con su regla de
 * formato (`ReglaDocumento`, la entrada de `validarDocumento`). `activo` viaja tal cual: decidir qué
 * hacer con uno inactivo es de quien lo usa (R11 lo rechaza en un alta).
 */
export interface TipoDocumentoDTO extends ReglaDocumento {
  id: string;
  /** Compatibilidad: único global y aún lo envían los formularios (`<PAIS>_<clave>` fuera de CR). */
  value: string;
  paisId: string;
  /** Única dentro del país. */
  clave: string;
  nombre: string;
  activo: boolean;
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

/**
 * SLT-81 (design §7.1; R18–R23) — la regla del teléfono del país de la empresa, para pintarla junto a
 * un teléfono. `null` si al país le falta el prefijo o los dígitos (R23): entonces no se pinta el
 * prefijo de ningún otro país.
 */
export interface TelefonoDelPais {
  paisNombre: string;
  prefijo: string;
  digitosNacionales: number;
}

export function telefonoDelPais(
  pais: Pick<PaisDTO, "nombre" | "prefijoTelefonico" | "telefonoDigitosNacionales">,
): TelefonoDelPais | null {
  if (!pais.prefijoTelefonico || pais.telefonoDigitosNacionales === null) return null;
  return {
    paisNombre: pais.nombre,
    prefijo: pais.prefijoTelefonico,
    digitosNacionales: pais.telefonoDigitosNacionales,
  };
}

/** SLT-81 (design §7.1): lo que el layout del portal baja del país de la empresa, en una sola lectura. */
export interface PaisDeLaEmpresaParaUi {
  etiquetas: EtiquetasGeograficas;
  telefono: TelefonoDelPais | null;
}
