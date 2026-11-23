// Campos de la plantilla de carga masiva de órdenes (compartidos por el paso de
// subida y el generador de plantilla). Se aíslan aquí para evitar dependencias
// circulares entre el botón orquestador y el componente de subida.
import type { TemplateField, UploadFileType } from "@/components/shared/BulkUpload";
// Solo el tipo: el valor arrastraria `geografia-dominio` entero al bundle del navegador.
import type { ColumnaGeoDePlantilla } from "@/lib/utils/plantilla-geo";

// Feature 276 — Plantilla v3: la columna unica `direccion_destinatario` de la v2
// (`Pais / Provincia / Canton (Distrito) / Direccion`) se sustituye por TRES columnas
// separadas: `provincia`, `canton_distrito` (formato `nombreCanton (Distrito)`) y
// `direccion`. El pais desaparece: la v2 ya lo descartaba sin validarlo ni persistirlo,
// asi que no se pierde ningun dato (R1, R5, R6).
// El orden de esta lista ES el orden de las columnas de la plantilla (R1) y las
// claves son las cabeceras verbatim que el backend valida (R2): no añadir
// `label` ni sufijos, o se rompe el round-trip descargar → subir.
export const ORDENES_BULK_FIELDS: TemplateField[] = [
  { key: "destinatario", example: "Juan Pérez" },
  { key: "telefono", example: "88887777" },
  // R4: la terna del ejemplo debe existir en el catálogo del seed y su distrito
  // tener zona; lo blinda `tests/unit/scripts/carga-masiva-ejemplos-geo.test.ts`.
  // Se conserva la de la v2 (`Cartago` + `Cartago (Occidental)`, zona GAM), que ya
  // estaba verificada contra el cruce del seed.
  { key: "provincia", example: "Cartago" },
  { key: "canton_distrito", example: "Cartago (Occidental)" },
  { key: "direccion", example: "Frente gasolinera JSM, 200m sur" },
  { key: "monto_cobrar", example: "25.90" },
  { key: "producto", example: "Camiseta talla M" },
  { key: "num_remision", example: "REM-0001" },
  { key: "peso", example: "1.5" },
  { key: "notas", example: "Entregar en la tarde" },
];

/**
 * Las dos columnas de geografia de `ORDENES_BULK_FIELDS`, las que sustituyen las de nivel. Copia de
 * `COLUMNAS_GEO_DE_FORMA_CR` (`lib/utils/plantilla-geo.ts`) por el bundle (ver el import);
 * `tests/components/CargaMasivaColumnasGeo.test.tsx` exige que sean iguales.
 */
export const COLUMNAS_GEO_DE_HOY: readonly string[] = ["provincia", "canton_distrito"];

/**
 * SLT-45 (design §8; R29, R30) — los campos de la plantilla con la geografia de la empresa.
 *
 * Sin columnas (`null`/`undefined`: pais de forma CR, o la pantalla no las recibio) son
 * `ORDENES_BULK_FIELDS` tal cual, la misma referencia. Con ellas, las columnas de nivel ocupan, en
 * su orden, el sitio de `provincia` y `canton_distrito`; el resto de la plantilla no se mueve.
 * Las columnas las calcula `columnasGeoDePlantilla` (`lib/utils/plantilla-geo.ts`), la misma
 * funcion con la que el servidor lee la fila: plantilla descargada y lectura no pueden divergir.
 */
export function camposDePlantilla(
  columnasGeo?: readonly ColumnaGeoDePlantilla[] | null,
): TemplateField[] {
  if (columnasGeo == null) return ORDENES_BULK_FIELDS;
  const [primeraGeo] = COLUMNAS_GEO_DE_HOY;
  return ORDENES_BULK_FIELDS.flatMap((field) =>
    field.key === primeraGeo
      ? columnasGeo.map((c) => ({ ...c }))
      : COLUMNAS_GEO_DE_HOY.includes(field.key)
        ? []
        : [field],
  );
}

export const ORDENES_BULK_TEMPLATE_NAME = "plantilla-ordenes-carga-masiva.xlsx";

export const ORDENES_BULK_ACCEPT: UploadFileType[] = ["csv", "xlsx"];
