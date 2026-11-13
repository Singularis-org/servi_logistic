"use client";

import { Button } from "@/components/ui/button";
import { etiquetaVerEvidencia } from "@/components/private/cierres/dialogos/dialogos-labels";

/**
 * FICHA 486 (R12-R15), SLT-103 (R54, R138) — El botón de evidencia de UNA gestión de cierre.
 *
 * Una gestión guarda hasta 3 fotos (feature 119) y el servidor ya las entrega TODAS, firmadas y
 * ordenadas por `indice` (`CierreDetalleGestion.evidenciaUrls`). Desde SLT-103 hay UN solo botón:
 * pasa todas las URL al visor único, que navega entre ellas con «Anterior»/«Siguiente».
 *
 * - 0 URLs → nada (quien lo monta decide si pinta «—»).
 * - 1 URL → «Ver evidencia», con el mismo texto y `aria-label` de antes de la 486 (R138).
 * - N>1 → «Ver evidencia (N)»; el `aria-label` lleva el mismo texto más el sufijo.
 *
 * Lo comparten `FilaGestion` (`cierre-factura.tsx` y la privada) y `columnaEvidencia`
 * (`CierreDiaModule.tsx`). El nombre del componente se conserva; lo retira SLT-115.
 */
export interface BotonesEvidenciaProps {
  /** URLs FIRMADAS, en el orden del servidor. Nunca rutas de almacenamiento. */
  urls: readonly string[];
  /** Recibe TODAS las URL de la gestión, en su orden. */
  onVer: (urls: readonly string[]) => void;
  /** Rótulo base del botón («Ver evidencia»). Separado para i18n. */
  etiqueta?: string;
  /**
   * Cola del `aria-label` («de la orden X · Y»). Sin ella el botón no lleva `aria-label` y su
   * nombre accesible es el texto visible, como hoy en la tabla del mensajero.
   */
  ariaSufijo?: string;
  className?: string;
}

export function BotonesEvidencia({ urls, onVer, etiqueta, ariaSufijo, className }: BotonesEvidenciaProps) {
  if (urls.length === 0) return null;

  const texto = etiquetaVerEvidencia(urls.length, etiqueta);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className ?? "w-fit"}
      aria-label={ariaSufijo ? `${texto} ${ariaSufijo}` : undefined}
      onClick={() => onVer(urls)}
    >
      {texto}
    </Button>
  );
}
