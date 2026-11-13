// Ficha 465 (design §3.3) — LA regla de cobertura por distrito, escrita una sola vez.
//
// Se construye ENCIMA de las reglas que ya existen, no las copia:
//   - zona unica: `zonaUnicaDeDistrito` (colapso 1/0/>1 que usa la carga de ordenes);
//   - disponibilidad: llega ya calculada por el repositorio con `disponibleDesdeCadena`;
//   - precedencia de motivos: la de `resolveGeo` (provincia -> canton -> distrito -> zona). La
//     equivalencia la fija `tests/unit/utils/cobertura-vs-resolve-geo.test.ts` (R15): si
//     `resolveGeo` gana una regla nueva, ese test se pone rojo en vez de que el Excel mienta.
//
// Funcion PURA: sin Prisma, sin React, sin textos de UI.
import type { DistritoCoberturaRow } from "@/lib/interfaces/repositories/ICoberturaRepository";
import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";
import type { CoberturaDistritoDTO, MotivoSinCobertura } from "@/lib/types/cobertura";

/** Orden alfabetico español sin distinguir mayusculas ni tildes (R6, R11). */
function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

/** Los tres niveles con clave propia desde SL-20; desde el 4, `nivel_<k>_retirado` (SLT-125, R6). */
const RETIRADO_DE_HOY: readonly MotivoSinCobertura[] = ["provincia_retirada", "canton_retirado", "distrito_retirado"];

/** SLT-125 (R6) — el motivo «retirado del catalogo» del nivel k (1..P). */
export function motivoNivelRetirado(k: number): MotivoSinCobertura {
  return RETIRADO_DE_HOY[k - 1] ?? `nivel_${k}_retirado`;
}

/**
 * La cadena de la fila, del nivel 1 al lugar. SLT-125 (P5): la `ruta` del repositorio, de P niveles;
 * una fila sin ella (la lectura de hoy, de 3 niveles) usa sus tres campos, que son los mismos flags.
 */
function cadenaDe(row: DistritoCoberturaRow): { nombre: string; activo: boolean }[] {
  return row.ruta ?? [row.provincia, row.canton, row.distrito];
}

/** La PRIMERA causa que aplique, en el orden de R9 / `resolveGeo`. `null` = con cobertura. */
function motivoDe(row: DistritoCoberturaRow): MotivoSinCobertura | null {
  // Del nivel 1 hacia abajo, como `resolveGeo` (provincia -> canton -> distrito -> ...).
  const retirado = cadenaDe(row).findIndex((n) => !n.activo);
  if (retirado !== -1) return motivoNivelRetirado(retirado + 1);
  if (row.zonas.length === 0) return "sin_zona";
  if (zonaUnicaDeDistrito(row.zonas) === null) return "varias_zonas";
  return null;
}

export function clasificarCobertura(
  row: DistritoCoberturaRow,
  zonasConTarifaGeneral: ReadonlySet<string>,
): CoberturaDistritoDTO {
  const zona = zonaUnicaDeDistrito(row.zonas);
  // R8: disponible Y zona unica. Se calcula a partir de las dos piezas compartidas, no del motivo,
  // para que una divergencia entre ambas la vea el test de equivalencia.
  const cobertura = row.disponible && zona !== null;
  const motivo = motivoDe(row);

  return {
    provincia: row.provincia.nombre,
    canton: row.canton.nombre,
    distrito: row.distrito.nombre,
    disponible: row.disponible,
    cobertura,
    motivo: cobertura ? null : motivo,
    zonas: row.zonas.map((z) => z.nombre).sort(compararTexto),
    zonaUnica:
      zona === null
        ? null
        : {
            nombre: zona.nombre,
            esCentral: zona.esCentral,
            tieneTarifaGeneral: zonasConTarifaGeneral.has(zona.id),
          },
    zonaEspecial: row.distrito.zonaEspecial,
    // SLT-125 (P5): solo si el repositorio la trae; una fila sin ruta conserva la forma de hoy.
    ...(row.ruta === undefined ? {} : { ruta: row.ruta.map((n) => ({ id: n.id, nombre: n.nombre })) }),
  };
}

/**
 * R6: provincia, despues canton, despues distrito. SLT-125 (P5): nivel por nivel de la ruta, del 1 al P;
 * en Costa Rica la ruta son esos tres nombres y el orden es el de hoy.
 */
export function compararCobertura(a: CoberturaDistritoDTO, b: CoberturaDistritoDTO): number {
  const na = nombresDe(a);
  const nb = nombresDe(b);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const c = compararTexto(na[i] ?? "", nb[i] ?? "");
    if (c !== 0) return c;
  }
  return 0;
}

function nombresDe(d: CoberturaDistritoDTO): string[] {
  return d.ruta?.map((p) => p.nombre) ?? [d.provincia, d.canton, d.distrito];
}
