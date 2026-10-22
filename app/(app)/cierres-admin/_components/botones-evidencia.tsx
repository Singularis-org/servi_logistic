"use client";

import { Button } from "@/components/ui/button";

/**
 * FICHA 486 (R12-R15) — Los botones de evidencia de UNA gestión de cierre.
 *
 * Una gestión guarda hasta 3 fotos (feature 119) y el servidor ya las entrega TODAS, firmadas y
 * ordenadas por `indice` (`CierreDetalleGestion.evidenciaUrls`). Este componente decide cuántos
 * botones pintar; el visor no cambia: cada botón llama a `onVer(url)` con SU url.
 *
 * - 0 URLs → nada (quien lo monta decide si pinta «—»).
 * - 1 URL → «Ver evidencia», con el mismo texto y `aria-label` de antes de la 486.
 * - N>1 → «Ver evidencia 1» … «Ver evidencia N», en el orden recibido.
 *
 * Lo comparten `FilaGestion` (`cierre-factura.tsx`) y `columnaEvidencia` (`CierreDiaModule.tsx`).
 */
export interface BotonesEvidenciaProps {
  /** URLs FIRMADAS, en el orden del servidor. Nunca rutas de almacenamiento. */
  urls: readonly string[];
  onVer: (url: string) => void;
  /** Rótulo base del botón («Ver evidencia»). Separado para i18n. */
  etiqueta?: string;
  /**
   * Cola del `aria-label` («de la orden X · Y»). Sin ella el botón no lleva `aria-label` y su
   * nombre accesible es el texto visible, como hoy en la tabla del mensajero.
   */
  ariaSufijo?: string;
  /** Conector del `aria-label` con varias fotos: «Ver evidencia 2 de 3 …». */
  conectorTotal?: string;
  className?: string;
}

const ETIQUETA_POR_DEFECTO = "Ver evidencia";
const CONECTOR_POR_DEFECTO = "de";

export function BotonesEvidencia({
  urls,
  onVer,
  etiqueta = ETIQUETA_POR_DEFECTO,
  ariaSufijo,
  conectorTotal = CONECTOR_POR_DEFECTO,
  className,
}: BotonesEvidenciaProps) {
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    const url = urls[0];
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className ?? "w-fit"}
        aria-label={ariaSufijo ? `${etiqueta} ${ariaSufijo}` : undefined}
        onClick={() => onVer(url)}
      >
        {etiqueta}
      </Button>
    );
  }

  const total = urls.length;
  return (
    <div role="group" aria-label={ariaSufijo ? `${etiqueta} ${ariaSufijo}` : etiqueta} className="flex flex-wrap gap-1">
      {urls.map((url, i) => {
        const numero = i + 1;
        return (
          <Button
            // Las URLs firmadas pueden repetirse en teoría (misma ruta dos veces); el índice es estable.
            key={`${numero}-${url}`}
            type="button"
            size="sm"
            variant="outline"
            className={className ?? "w-fit"}
            aria-label={
              ariaSufijo
                ? `${etiqueta} ${numero} ${conectorTotal} ${total} ${ariaSufijo}`
                : undefined
            }
            onClick={() => onVer(url)}
          >
            {`${etiqueta} ${numero}`}
          </Button>
        );
      })}
    </div>
  );
}
