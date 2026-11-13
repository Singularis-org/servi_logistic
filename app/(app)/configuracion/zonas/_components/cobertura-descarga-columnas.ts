/**
 * Ficha 465 (design §3.6, T7) — columnas de EXPORT del Excel de cobertura por distrito.
 *
 * Módulo PURO: sin React ni DOM. Es el ÚNICO sitio con los textos del archivo (R7-R14): el DTO
 * (`CoberturaDistritoDTO`) llega sin textos de UI y aquí se traduce a valores crudos de celda.
 * `null` = celda vacía (R10, R12, R14).
 */
import type { CoberturaDistritoDTO, MotivoSinCobertura } from "@/lib/types/cobertura";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { ETIQUETAS_NEUTRAS, type EtiquetasGeograficas } from "@/lib/types/pais";
import { celdasDeNivel, type NivelDelPais } from "@/lib/utils/ubicacion-presentacion";
import {
  conColumnasDeNivel,
  nivelesDeCeldas,
  nivelesDeColumnas,
  rutaDeLaFila,
} from "@/app/(app)/_components/niveles-de-columnas";

/** R16 — ámbito de la preferencia de columnas (selector + orden recordados en el navegador). */
export const AMBITO_DESCARGA_COBERTURA = "tarifas-cobertura";

/** R5 — columnas del archivo, en su orden por defecto. */
export const COLUMNAS_DESCARGA_COBERTURA: DescargaColumna[] = [
  { clave: "provincia", encabezado: ETIQUETAS_NEUTRAS.provincia.singular },
  { clave: "canton", encabezado: ETIQUETAS_NEUTRAS.canton.singular },
  { clave: "distrito", encabezado: ETIQUETAS_NEUTRAS.distrito.singular },
  { clave: "activo", encabezado: "Activo" },
  { clave: "cobertura", encabezado: "Cobertura" },
  { clave: "motivo", encabezado: "Motivo sin cobertura" },
  { clave: "zona", encabezado: "Zona" },
  { clave: "gam", encabezado: "GAM" },
  { clave: "zona_especial", encabezado: "Zona especial" },
  { clave: "tarifa_general", encabezado: "Tarifa general de la zona" },
];

/**
 * SL-20 (design §7; R19) — las columnas del archivo con los encabezados de nivel del país de la
 * empresa (`etiquetas`, de `useEtiquetasGeograficas`). Es lo que monta la pantalla.
 * `COLUMNAS_DESCARGA_COBERTURA` sigue siendo el contrato de claves y orden, pero sus encabezados de provincia, cantón
 * y distrito son los neutros («Nivel 1»…): no se descarga con ella directamente.
 *
 * SLT-125 (design §5, P5; R1–R4, R6): con los `niveles` del país, una columna de lugar por nivel en
 * el sitio de las tres de hoy, con el mismo criterio que la descarga de órdenes. Sin niveles, las de hoy.
 */
export function columnasDescargaCobertura(
  etiquetas: EtiquetasGeograficas,
  niveles?: readonly NivelDelPais[],
): DescargaColumna[] {
  return conColumnasDeNivel(COLUMNAS_DESCARGA_COBERTURA, nivelesDeColumnas(etiquetas, niveles));
}

const SI = "Sí";
const NO = "No";

/**
 * R9 — texto de cada causa de «sin cobertura». SL-20 (R19): las tres de nivel nombran el nivel
 * con el nombre del país de la empresa. La concordancia («retirada»/«retirado») es la de Costa
 * Rica: el género del nombre de nivel depende del país y el dato no lo trae (pregunta abierta,
 * `progress/impl_SL-20-T5b.md`).
 *
 * SLT-125 (R6, P5; decisión del 2026-11-13): desde el nivel 4 el motivo es `nivel_<k>_retirado`, y su
 * texto nombra el tipo del nivel k del país (`niveles`), con la concordancia de «cantón» y «distrito».
 * Los niveles 1–3 conservan sus textos de hoy. Sin niveles de 4 o más, no hay motivos de nivel ≥ 4.
 */
export function motivoSinCoberturaLabel(
  etiquetas: EtiquetasGeograficas,
  niveles?: readonly NivelDelPais[],
): Record<MotivoSinCobertura, string> {
  const textos: Record<MotivoSinCobertura, string> = {
    provincia_retirada: `${etiquetas.provincia.singular} retirada del catálogo`,
    canton_retirado: `${etiquetas.canton.singular} retirado del catálogo`,
    distrito_retirado: `${etiquetas.distrito.singular} retirado del catálogo`,
    sin_zona: "Sin zona asignada",
    varias_zonas: "Asignado a varias zonas",
  };
  for (const nivel of niveles ?? []) {
    if (nivel.profundidad >= 4) {
      textos[`nivel_${nivel.profundidad}_retirado`] = `${nivel.singular} retirado del catálogo`;
    }
  }
  return textos;
}

function siNo(valor: boolean): string {
  return valor ? SI : NO;
}

/** R11 — nombre de la zona única, «Sin zona» o «Varias zonas: A, B». */
function textoZona(zonas: readonly string[]): string {
  if (zonas.length === 0) return "Sin zona";
  if (zonas.length === 1) return zonas[0]!;
  return `Varias zonas: ${zonas.join(", ")}`;
}

/**
 * Proyecta un distrito a una fila del archivo con los textos de R7-R14. SL-20 (R19): es una
 * factoría sobre las `etiquetas` del país de la empresa, que nombran los motivos de nivel; la forma
 * `fila(etiquetas)(dto)` es la que ya reconoce `columnas-sensibles.guardia`. SLT-125: también sobre
 * los `niveles` del país (columnas de lugar y motivos desde el nivel 4).
 */
export function filaCobertura(
  etiquetas: EtiquetasGeograficas,
  niveles?: readonly NivelDelPais[],
): (dto: CoberturaDistritoDTO) => DescargaFila {
  const motivos = motivoSinCoberturaLabel(etiquetas, niveles);
  const nivelesDeLaFila = nivelesDeCeldas(niveles);
  return (dto) => ({
    // SLT-125 (R1, R6): una celda por nivel desde la ruta de la fila (nivel 1 a P); sin ella, los
    // tres nombres de hoy.
    ...celdasDeNivel(rutaDeLaFila(dto.ruta, [dto.provincia, dto.canton, dto.distrito]), nivelesDeLaFila),
    activo: siNo(dto.disponible),
    cobertura: siNo(dto.cobertura),
    motivo: dto.motivo === null ? null : motivos[dto.motivo],
    zona: textoZona(dto.zonas),
    gam: dto.zonaUnica === null ? null : siNo(dto.zonaUnica.esCentral),
    // SL-38 (R15): la marca es de la empresa; hay fila o no la hay. «Sin definir» ya no existe.
    zona_especial: siNo(dto.zonaEspecial),
    tarifa_general:
      dto.zonaUnica === null ? null : siNo(dto.zonaUnica.tieneTarifaGeneral),
  });
}
