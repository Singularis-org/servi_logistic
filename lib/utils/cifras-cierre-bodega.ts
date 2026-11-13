import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import { cifrasDelCierre, type CifrasCierre } from "@/lib/utils/cifras-cierre";
import type { GestionDeTienda } from "@/lib/utils/ingreso-empresa";

/**
 * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (R387) — las cifras AGREGADAS de un
 * cierre de bodega: las mismas ocho que el cierre de mensajero (`CifrasCierre` de SLT-140).
 */
export type CifrasAgregadasBodega = CifrasCierre;

/** Los tres snapshots AGREGADOS del cierre de bodega de los que salen sus cifras. */
export type SnapshotsAgregadosBodega = Pick<
  CierreBodegaResumen,
  "totales" | "totalPagoMensajero" | "totalIngresoBodegaRechazos"
>;

/**
 * SLT-141 (R387) — el bloque «agregado de toda la bodega» que vivía en
 * `CierresBodegaAdminService.verCierreBodegaDetalle`, movido: el detalle y el Excel llaman a ESTA
 * función, así que la misma plata no puede leerse distinta según por dónde se entre.
 *
 * Ese bloque era, función por función y argumento por argumento, el de `cifrasDelCierre` (SLT-140),
 * con el snapshot del cierre de bodega en lugar del de un cierre del día. Por eso delega en ella y no
 * repite la cascada: una segunda copia de las mismas restas es un segundo sitio donde divergir.
 *
 * - Los minuendos son los snapshots AGREGADOS del cierre de bodega (decisión de la 393, R13), nunca la
 *   suma de sus cierres del día: si un día dejaran de coincidir, el archivo enseña el mismo descuadre
 *   que la pantalla.
 * - `gestiones` son las de TODOS sus cierres del día; de ellas salen lo facturado y el reparto por
 *   tienda (ficha 396), en el orden que les da `partesPorTienda`.
 */
export function cifrasAgregadasBodega(
  resumen: SnapshotsAgregadosBodega,
  gestiones: ReadonlyArray<GestionDeTienda>,
): CifrasAgregadasBodega {
  return cifrasDelCierre(
    {
      totales: resumen.totales,
      totalPagoMensajero: resumen.totalPagoMensajero,
      totalIngresoBodegaRechazos: resumen.totalIngresoBodegaRechazos,
    },
    gestiones,
  );
}
