/**
 * SLT-243 (design §6.0 y §6.1; R10–R13) — los encabezados con impuesto de las descargas de cierres
 * del admin, en UN solo sitio.
 *
 * La forma la fijó el humano en P2: donde el encabezado decía el nombre del impuesto a secas, dice
 * la palabra «impuesto» seguida del nombre del país entre paréntesis («Flete + impuesto (IGV)»,
 * «Impuesto (IGV) del flete»). Vale para todos los países: en Costa Rica, «Impuesto (IVA) del flete».
 *
 * - Las cuatro declaraciones de columnas toman de aquí su encabezado base (`encabezadoBase`), con el
 *   rótulo de la plataforma (`IMPUESTO_ROTULO`). Ninguna escribe el nombre del impuesto (R11).
 * - Los componentes que arman el libro pasan sus columnas u hojas por `conImpuestoEn…` con el
 *   impuesto del país (`useImpuestoDelPais()`). Con el de la plataforma no cambia nada, ni la
 *   identidad del arreglo.
 * - Los rótulos de PANTALLA de `cierre-labels.ts` («Flete + IVA»…) no salen de aquí: son de SLT-244.
 *
 * Módulo puro: sin React. `DescargaFilasResult` es solo un tipo (`import type`).
 */
import type { DescargaFilasResult } from "@/components/shared/DataTable";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import type { DescargaColumna, DescargaHoja } from "@/lib/types/descarga";

import { FLETE_NO_ENTREGADAS_LABEL } from "./cierre-labels";

/** «impuesto (IGV)»: la pieza común de la forma de P2, en medio del encabezado. */
export function impuestoEntreParentesis(impuesto: string): string {
  return `impuesto (${impuesto})`;
}

/** «Impuesto (IGV)»: la misma pieza cuando abre el encabezado. */
function alInicio(impuesto: string): string {
  return `Impuesto (${impuesto})`;
}

/**
 * Clave de columna → su encabezado con el impuesto que se le pase (tabla de design §6.0). Las claves
 * son los nombres internos de siempre (SL-21) y el contrato de la preferencia de columnas guardada:
 * no cambian.
 */
export const ENCABEZADO_CON_IMPUESTO = {
  fleteConIva: (i: string) => `Flete + ${impuestoEntreParentesis(i)}`,
  comisionConIva: (i: string) => `Comisión + ${impuestoEntreParentesis(i)}`,
  fleteDevolucionConIva: (i: string) => `Flete por devolución a origen + ${impuestoEntreParentesis(i)}`,
  ivaFlete: (i: string) => `${alInicio(i)} del flete`,
  ivaComisionCod: (i: string) => `${alInicio(i)} de la comisión`,
  ivaFleteDevolucion: (i: string) => `${alInicio(i)} del ${FLETE_NO_ENTREGADAS_LABEL.toLowerCase()}`,
  ivaIncluido: (i: string) => `De eso, ${impuestoEntreParentesis(i)}`,
  ivaFulfillment: (i: string) => `${alInicio(i)} de fulfillment`,
  ivaFacturado: (i: string) => `${alInicio(i)} facturado`,
} as const satisfies Readonly<Record<string, (impuesto: string) => string>>;

/** Una de las nueve claves de columna cuyo encabezado nombra el impuesto. */
export type ClaveConImpuesto = keyof typeof ENCABEZADO_CON_IMPUESTO;

function esClaveConImpuesto(clave: string): clave is ClaveConImpuesto {
  return Object.hasOwn(ENCABEZADO_CON_IMPUESTO, clave);
}

/**
 * El encabezado base de una clave: la forma de P2 con el rótulo de la plataforma
 * («Impuesto (IVA) del flete»). Lo usan las declaraciones de columnas.
 */
export function encabezadoBase(clave: ClaveConImpuesto): string {
  return ENCABEZADO_CON_IMPUESTO[clave](IMPUESTO_ROTULO);
}

/** La columna con el impuesto del país, o la MISMA columna si no es una de las nueve con su base. */
function conImpuestoEnColumna(columna: DescargaColumna, impuesto: string): DescargaColumna {
  const { clave } = columna;
  // Solo se sustituye un encabezado que hoy es el base: una columna con la misma clave y otro
  // rótulo no se toca, así que este módulo no puede renombrar una columna que no conoce.
  if (!esClaveConImpuesto(clave) || columna.encabezado !== encabezadoBase(clave)) return columna;
  return { ...columna, encabezado: ENCABEZADO_CON_IMPUESTO[clave](impuesto) };
}

/**
 * Sustituye el encabezado de las columnas de la tabla cuyo encabezado es hoy el base, y deja las
 * demás tal cual (mismos objetos). Con `impuesto === IMPUESTO_ROTULO` devuelve EL MISMO arreglo: las
 * columnas son dependencia del hook de preferencia, y con Costa Rica su identidad no debe cambiar.
 */
export function conImpuestoEnColumnas(columnas: DescargaColumna[], impuesto: string): DescargaColumna[] {
  if (impuesto === IMPUESTO_ROTULO) return columnas;
  return columnas.map((columna) => conImpuestoEnColumna(columna, impuesto));
}

function conImpuestoEnHoja(hoja: DescargaHoja, impuesto: string): DescargaHoja {
  return { ...hoja, columnas: conImpuestoEnColumnas(hoja.columnas, impuesto) };
}

/** Lo mismo sobre cada hoja de un libro. Con el rótulo de la plataforma, las mismas hojas. */
export function conImpuestoEnHojas(
  hojas: [DescargaHoja, ...DescargaHoja[]],
  impuesto: string,
): [DescargaHoja, ...DescargaHoja[]] {
  if (impuesto === IMPUESTO_ROTULO) return hojas;
  const [primera, ...resto] = hojas;
  return [conImpuestoEnHoja(primera, impuesto), ...resto.map((hoja) => conImpuestoEnHoja(hoja, impuesto))];
}

/**
 * El resultado de una descarga con el impuesto del país en los encabezados de su libro. Sin libro
 * (el archivo del modelo anterior, o un error), el MISMO objeto: sus columnas no nombran el impuesto.
 */
export function conImpuestoEnResultado(r: DescargaFilasResult, impuesto: string): DescargaFilasResult {
  if (r.status !== "ok" || r.libro === undefined || impuesto === IMPUESTO_ROTULO) return r;
  return { ...r, libro: { hojas: conImpuestoEnHojas(r.libro.hojas, impuesto) } };
}
