import { render } from "@testing-library/react";

import type { CierreDetalleAdminServiceResult } from "@/lib/interfaces/services/ICierresAdminService";
import { CascadasCierreMensajero } from "@/app/(app)/cierres-admin/_components/CascadasCierreMensajero";
import { CierreFacturaDetalle } from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { hayGestionEnModeloNuevo } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";

/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» — el interior del modal que
 * montaba `CierresAdminModule` HASTA esta ficha: las cascadas de la 395/396 y el comprobante
 * detallado, con las MISMAS props que les pasaba el módulo (copiadas de su versión anterior, con la
 * audiencia por defecto del módulo, `satelite`).
 *
 * Por qué existe: SLT-100 sustituyó ese modal por el detalle único (SLT-95), cuyo «Dinero» tiene
 * otra forma —aprobada por Carlos (D3, D20, D25)— y en la que no existen «Gana la tienda», «Debe»,
 * «Liquidación» ni las notas del tiempo verbal. Los tests de la 395/396 vigilan esos dos
 * componentes, que siguen en el árbol (`@sin-superficie`) hasta que SLT-115 «Retirar los
 * componentes de cierre sustituidos» los borre; se montan aquí directamente para no perder ninguna
 * aserción mientras tanto. Lo que el admin VE ahora lo vigilan `DineroIdentidadesEnPantalla`,
 * `CierresAdminDetalleUnico` y `e2e/cierres-rediseno.spec.ts`.
 */
export function montarDetalleAnteriorDelAdmin(
  d: Extract<CierreDetalleAdminServiceResult, { status: "ok" }>,
) {
  return render(
    <div role="dialog" aria-label={`Detalle del cierre · ${d.cierre.mensajeroNombre}`}>
      <CascadasCierreMensajero
        mensajeroNombre={d.cierre.mensajeroNombre}
        estado={d.cierre.estado}
        general={d.cierre.totales.general}
        totalesIngreso={d.totalesIngreso}
        totalPagoMensajero={d.cierre.totalPagoMensajero}
        totalIngresoBodegaRechazos={d.cierre.totalIngresoBodegaRechazos}
        pagoTienda={d.pagoTienda}
        cobradoSobreRecaudado={d.cobradoSobreRecaudado}
        ivaFacturado={d.ivaFacturado}
        netoEmpresa={d.netoEmpresa}
        ganaLaTienda={d.ganaLaTienda}
        fleteRechazoYaCobradoATienda={d.fleteRechazoYaCobradoATienda}
        partesPorTienda={d.partesPorTienda}
        modeloNuevo={hayGestionEnModeloNuevo(d.grupos)}
      />
      <CierreFacturaDetalle
        cierre={d.cierre}
        grupos={d.grupos}
        totalesIngreso={d.totalesIngreso}
        desgloseIngresoBodegaRechazos={d.desgloseIngresoBodegaRechazos}
        ganancia={d.ganancia}
        ivaFacturado={d.ivaFacturado}
        pagoTienda={d.pagoTienda}
        audiencia="satelite"
        ordenesSinGestion={d.ordenesSinGestion}
        sinGestionRegistrado={d.sinGestionRegistrado}
        rechazosDeTienda={d.rechazosDeTienda}
      />
    </div>,
  );
}
