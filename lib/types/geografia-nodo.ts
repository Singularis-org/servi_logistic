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

// ── SLT-46 (design §4.1): el borde por NODO, a cualquier profundidad ─────────────────────────
//
// El nivel ya no viaja: lo dice la profundidad del nodo en la base, y el tipo de un alta es el de su
// profundidad (P1), asi que tampoco se elige. Un esquema por operacion: los de SL-20, discriminados
// o con `nivel`, se retiraron en T4.4.

const idDeNodoSchema = z.string().min(1);

/** Las claves que admite el alta de un nodo; cualquier otra es una forma que no es la de hoy. */
const CLAVES_DEL_ALTA = ["paisId", "padreId", "nombre", "codigo"] as const;

/**
 * El campo de `fieldErrors` donde va un error de FORMATO del alta (claves que no son de esta forma,
 * o el destino sin decidir). No es un dato que la persona teclee, así que no cabe en `nombre` ni en
 * `codigo`; un campo propio lo deja fuera de `entrada`, que es lo que `.strict()` producía.
 */
export const CAMPO_DE_FORMATO = "formato";

/** Decisión del humano (2026-11-09): el mensaje claro de una entrada con la forma de antes. */
export function mensajeDeFormatoNoValido(sobrantes: readonly string[]): string {
  return (
    `Formato no válido: no se admiten los campos ${sobrantes.join(", ")}. ` +
    "El alta lleva el país (raíz) o el padre (hijo), el nombre y, si se quiere, el código."
  );
}
export const DESTINO_SIN_DECIDIR = "Formato no válido: el alta lleva el país (raíz) o el padre (hijo), uno de los dos.";

/**
 * El alta: raiz de un pais (`paisId`) o hijo de un nodo (`padreId`) de cualquier profundidad.
 * Traer las dos claves, o ninguna, es `validation_error` y no una eleccion silenciosa de una de
 * ellas; un `nivel`, un `provinciaId` o un `tipoId` tambien.
 *
 * SLT-46 (decisión del humano 2026-11-09): un solo objeto y no una `z.union` de dos `.strict()`. Con la
 * union, cualquier fallo (también la falta de `nombre`) salía como «Invalid input» en `formErrors`
 * (→ `fieldErrors.entrada`): la pantalla perdía el error del campo. Ahora cada campo da su error en su
 * clave (`nombre`, `paisId`, `codigo`, …, como antes de SLT-46) y una forma que no es esta (claves
 * de más, o país y padre a la vez, o ninguno) da un mensaje de formato no válido en
 * `fieldErrors.formato`. El refinamiento corre también cuando un campo ya falló (`when`), para que
 * una forma vieja sin nombre diga las dos cosas.
 */
export const crearNodoGeograficoSchema = z
  .object({
    paisId: z.string().regex(/^[A-Z]{2}$/, "El país no es válido.").optional(),
    padreId: idDeNodoSchema.optional(),
    nombre: nombreGeoSchema,
    codigo: codigoGeoSchema,
  })
  .loose()
  .superRefine(
    (v, ctx) => {
      if (typeof v !== "object" || v === null) return;
      const sobrantes = Object.keys(v).filter((k) => !(CLAVES_DEL_ALTA as readonly string[]).includes(k));
      if (sobrantes.length > 0) {
        ctx.addIssue({ code: "custom", path: [CAMPO_DE_FORMATO], message: mensajeDeFormatoNoValido(sobrantes) });
        return;
      }
      const conPais = "paisId" in v && v.paisId !== undefined;
      const conPadre = "padreId" in v && v.padreId !== undefined;
      if (conPais === conPadre) ctx.addIssue({ code: "custom", path: [CAMPO_DE_FORMATO], message: DESTINO_SIN_DECIDIR });
    },
    { when: () => true },
  )
  .transform(({ paisId, padreId, nombre, codigo }): AltaDeRaiz | AltaDeHijo =>
    // El refinamiento ya garantizó que viene exactamente uno de los dos.
    paisId !== undefined ? { paisId, nombre, codigo } : { padreId: padreId as string, nombre, codigo },
  );

interface AltaDeRaiz {
  paisId: string;
  nombre: string;
  codigo?: string;
}

interface AltaDeHijo {
  padreId: string;
  nombre: string;
  codigo?: string;
}

export type CrearNodoGeograficoInput = z.infer<typeof crearNodoGeograficoSchema>;

/**
 * El renombre. REUSA `nombreGeoSchema`, el MISMO del alta: un segundo esquema de nombre seria un
 * segundo contrato capaz de admitir por renombrado lo que el alta rechaza. R22: sin campo de padre;
 * `.strict()` rechaza un `padreId` en vez de descartarlo, que es lo que impide que el renombre se
 * convierta en un «mover» encubierto (mover es SLT-48).
 *
 * SLT-46 (2026-11-09, design §4.7; R61): `nombreAnterior` es el nombre que el modal de confirmación
 * mostró como «antes», obligatorio. El repositorio solo escribe si la base sigue teniendo ese nombre
 * (si otra persona lo cambió mientras tanto, cambio concurrente). Sin cotas de longitud: es un dato
 * de la base, no algo que se teclea, y uno heredado de antes de las cotas tiene que poder compararse.
 */
export const renombrarNodoGeograficoSchema = z
  .object({ id: idDeNodoSchema, nombre: nombreGeoSchema, nombreAnterior: z.string().min(1) })
  .strict();

export type RenombrarNodoGeograficoInput = z.infer<typeof renombrarNodoGeograficoSchema>;

/**
 * El retiro o la reactivacion. `activo` es el estado DESEADO, no un toggle: pedir dos veces lo mismo
 * tiene que ser idempotente, y un toggle no puede serlo. R22: sin padre, igual que el renombre.
 */
export const cambiarActivacionGeograficaSchema = z
  .object({ id: idDeNodoSchema, activo: z.boolean() })
  .strict();

export type CambiarActivacionGeograficaInput = z.infer<typeof cambiarActivacionGeograficaSchema>;

/** Un nodo por su id, sin mas: el conteo de ordenes de la confirmacion del retiro (R20). */
export const nodoGeograficoSchema = z.object({ id: idDeNodoSchema }).strict();

export type NodoGeograficoInput = z.infer<typeof nodoGeograficoSchema>;

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

// ── SLT-89 (design §4.2): el arbol de zonas de N niveles (R24–R27) ───────────────────────────

/** Un tipo de nivel del pais tal como lo pinta el selector: los nombres salen de aqui, nunca de literales. */
export interface TipoDeArbolDeZonasDTO {
  profundidad: number;
  nombreSingular: string;
  nombrePlural: string;
}

/**
 * Un nodo del arbol de zonas de la empresa, a cualquier profundidad. `asignadaA` es la asignacion
 * DIRECTA del nodo (como mucho una, R2); `heredaDe`, la zona que lo cubriria por un ancestro (el mas
 * cercano con asignacion, con el colapso de `zonaQueCubre`), con el nodo del que la hereda. Un nodo
 * con asignacion propia distinta de la que hereda es una excepcion: lleva los dos.
 */
export interface NodoDeZonasDTO {
  id: string;
  nombre: string;
  profundidad: number;
  /** El flag PROPIO, como el arbol de hoy. */
  activo: boolean;
  asignadaA: { id: string; nombre: string } | null;
  heredaDe: { zonaId: string; zonaNombre: string; nodoId: string; nodoNombre: string } | null;
  hijos: NodoDeZonasDTO[];
}

export interface ArbolDeZonasDTO {
  tipos: TipoDeArbolDeZonasDTO[];
  raices: NodoDeZonasDTO[];
}

/**
 * SLT-89 (R23, design §4.4) — un nodo que la zona cubre (asignado o heredado), para elegir miembros de
 * un grupo en Tarifas. Sus `hijos` son los que la zona tambien cubre: una excepcion de otra zona no
 * aparece.
 */
export interface NodoCubiertoDTO {
  id: string;
  nombre: string;
  profundidad: number;
  /** El flag PROPIO, como el arbol de zonas. */
  activo: boolean;
  hijos: NodoCubiertoDTO[];
}

/** SLT-89 (R23): el sub-arbol cubierto por una zona, con los nombres de nivel del pais. */
export interface ArbolCubiertoDTO {
  tipos: TipoDeArbolDeZonasDTO[];
  raices: NodoCubiertoDTO[];
}

/**
 * SLT-47 (R16; design §3.4) — un paso de la ruta del lugar de una orden (del nivel 1 al lugar). Vive
 * aqui, en un modulo de tipos sin runtime de servidor, porque lo transportan los DTO que llegan al
 * navegador (mis-asignaciones, novedades). Lo calcula `rutaDelLugar`.
 */
export interface PasoDeRuta {
  id: string;
  nombre: string;
}
