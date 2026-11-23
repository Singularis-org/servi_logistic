import {
  estaActivo,
  nodosDeProfundidad,
  type CatalogoGeografico,
  type TipoDeNivel,
} from "@/lib/services/geografia-dominio";
import { normalizeName } from "@/lib/utils/normalize";

// SLT-45 (design §8; R29, R30) — LAS COLUMNAS DE GEOGRAFIA DE LA PLANTILLA DE CARGA MASIVA.
//
// Un solo origen de verdad para las dos puntas: la pantalla pinta estas cabeceras en la plantilla
// (T6.3, por props) y el servidor lee las mismas al resolver la fila (`BulkOrdenService.cargarMasiva`
// con `geoInputDesdeColumnasDeNivel`). Si cada punta calculara las suyas, la primera diferencia
// rompe el viaje descargar → subir sin que nada se ponga rojo.
//
// Forma CR → `null`: se usa la plantilla de hoy (`provincia` + `canton_distrito`), sin tocar nada
// (R29). Otro pais → una columna por profundidad 1..max (R30).
//
// ⚠️ PURO A PROPOSITO: sin Prisma ni I/O. Recibe el catalogo ya cargado. Lo vigila
// `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`.
//
// No importa `ORDENES_BULK_FIELDS` (`app/(app)/ordenes/_components/carga-masiva-fields.ts`): el
// servidor la usa y la dependencia va de la pantalla al servidor, nunca al reves
// (`tests/unit/guards/lib-no-importa-app.guardia.test.ts`). Las demas columnas de la plantilla se
// copian en `COLUMNAS_NO_GEO_DE_PLANTILLA` y `tests/unit/utils/plantilla-geo.test.ts` exige que
// sean exactamente las de `ORDENES_BULK_FIELDS` sin las dos de geografia.

/**
 * Una columna de geografia de la plantilla. Serializable (cruza de Server a Client Component por
 * props) y asignable a `TemplateField`: la pantalla la pone en lugar de `provincia` y
 * `canton_distrito`. Sin `label` a proposito: la cabecera del archivo ES `key` (round-trip, ver
 * `carga-masiva-fields.ts`).
 */
export interface ColumnaGeoDePlantilla {
  /** Cabecera de la columna, en minusculas como las lee el parser (`lib/parsers/spreadsheet`). */
  key: string;
  /** Nombre del primer nodo activo (en cascada) de esa profundidad; ausente si no hay ninguno. */
  example?: string;
}

/** Las dos columnas de geografia de la plantilla de hoy (forma CR), que estas sustituyen. */
export const COLUMNAS_GEO_DE_FORMA_CR: readonly string[] = ["provincia", "canton_distrito"];

/**
 * Las demas columnas de la plantilla (`ORDENES_BULK_FIELDS` sin las dos de geografia), en su orden.
 * Una cabecera de nivel que coincide con una de ellas pasa a `nivel_{n}`.
 */
export const COLUMNAS_NO_GEO_DE_PLANTILLA: readonly string[] = [
  "destinatario",
  "telefono",
  "direccion",
  "monto_cobrar",
  "producto",
  "num_remision",
  "peso",
  "notas",
];

/** Los `nombreSingular` normalizados de las profundidades 1, 2 y 3 de un pais de forma CR. */
const TIPOS_DE_FORMA_CR: readonly string[] = ["provincia", "canton", "distrito"];

/** La cabecera de reserva de una profundidad (1-based). */
export function cabeceraDeNivel(n: number): string {
  return `nivel_${n}`;
}

/** `nombreSingular` con `normalizeName` y los espacios a `_` («Region Metropolitana» → `region_metropolitana`). */
function cabeceraDeTipo(tipo: TipoDeNivel): string {
  return normalizeName(tipo.nombreSingular).replace(/ /g, "_");
}

function profundidadMaxima(cat: CatalogoGeografico): number {
  let maxima = 0;
  for (const n of cat.nodos) if (n.profundidad > maxima) maxima = n.profundidad;
  return maxima;
}

/** El tipo de una profundidad es el de sus nodos; `null` si mezclan mas de uno o el tipo no esta. */
function tipoDeProfundidad(cat: CatalogoGeografico, profundidad: number): TipoDeNivel | null {
  const ids = new Set(nodosDeProfundidad(cat, profundidad).map((n) => n.tipoId));
  if (ids.size !== 1) return null;
  const [id] = ids;
  return cat.tipos.find((t) => t.id === id) ?? null;
}

function esFormaCR(tipos: readonly (TipoDeNivel | null)[]): boolean {
  return (
    tipos.length === TIPOS_DE_FORMA_CR.length &&
    tipos.every((t, i) => t !== null && normalizeName(t.nombreSingular) === TIPOS_DE_FORMA_CR[i])
  );
}

/**
 * Las columnas de geografia de la plantilla del pais del catalogo, o `null` si es de forma CR
 * (3 niveles con tipos provincia, canton y distrito).
 *
 * Cabecera = el `nombreSingular` del tipo de la profundidad, normalizado. `nivel_{n}` si la
 * profundidad mezcla tipos, si la cabecera queda vacia o si choca con otra columna de la plantilla
 * (`COLUMNAS_NO_GEO_DE_PLANTILLA`, otra profundidad o el `nivel_{m}` de reserva de otra).
 */
export function columnasGeoDePlantilla(cat: CatalogoGeografico): ColumnaGeoDePlantilla[] | null {
  const maxima = profundidadMaxima(cat);
  const tipos = Array.from({ length: maxima }, (_, i) => tipoDeProfundidad(cat, i + 1));
  if (esFormaCR(tipos)) return null;

  const otras = new Set(COLUMNAS_NO_GEO_DE_PLANTILLA);
  const candidatas = tipos.map((t) => (t === null ? null : cabeceraDeTipo(t)));
  const veces = new Map<string, number>();
  for (const c of candidatas) if (c !== null) veces.set(c, (veces.get(c) ?? 0) + 1);

  return candidatas.map((c, i) => {
    const n = i + 1;
    const reservaDeOtra = c !== null && /^nivel_\d+$/.test(c) && c !== cabeceraDeNivel(n);
    const choca = c === "" || (c !== null && (otras.has(c) || (veces.get(c) ?? 0) > 1)) || reservaDeOtra;
    const ejemplo = nodosDeProfundidad(cat, n).find((nodo) => estaActivo(cat, nodo.id) === true);
    return {
      key: c !== null && !choca ? c : cabeceraDeNivel(n),
      ...(ejemplo !== undefined ? { example: ejemplo.nombre } : {}),
    };
  });
}
