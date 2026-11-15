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
/**
 * SLT-154 (R462): las cifras de la empresa son `T | null` en el contrato (`null` para quien no es la
 * central). Este panel antiguo solo se monta con las de la central: un `null` aquí es un doble mal
 * armado y falla ruidoso, en vez de pintar algo que no llegó.
 */
function exigir<T>(valor: T | null, campo: string): T {
  if (valor === null) throw new Error(`montarDetalleAnteriorDelAdmin: «${campo}» llegó en null`);
  return valor;
}

export function montarDetalleAnteriorDelAdmin(
  d: Extract<CierreDetalleAdminServiceResult, { status: "ok" }>,
) {
  return render(
    <div role="dialog" aria-label={`Detalle del cierre · ${d.cierre.mensajeroNombre}`}>
      <CascadasCierreMensajero
        mensajeroNombre={d.cierre.mensajeroNombre}
        estado={d.cierre.estado}
        general={d.cierre.totales.general}
        totalesIngreso={exigir(d.totalesIngreso, "totalesIngreso")}
        totalPagoMensajero={d.cierre.totalPagoMensajero}
        totalIngresoBodegaRechazos={d.cierre.totalIngresoBodegaRechazos}
        pagoTienda={exigir(d.pagoTienda, "pagoTienda")}
        cobradoSobreRecaudado={exigir(d.cobradoSobreRecaudado, "cobradoSobreRecaudado")}
        ivaFacturado={exigir(d.ivaFacturado, "ivaFacturado")}
        netoEmpresa={exigir(d.netoEmpresa, "netoEmpresa")}
        ganaLaTienda={exigir(d.ganaLaTienda, "ganaLaTienda")}
        fleteRechazoYaCobradoATienda={exigir(d.fleteRechazoYaCobradoATienda, "fleteRechazoYaCobradoATienda")}
        partesPorTienda={exigir(d.partesPorTienda, "partesPorTienda")}
        modeloNuevo={hayGestionEnModeloNuevo(d.grupos)}
      />
      <CierreFacturaDetalle
        cierre={d.cierre}
        grupos={d.grupos}
        totalesIngreso={exigir(d.totalesIngreso, "totalesIngreso")}
        desgloseIngresoBodegaRechazos={d.desgloseIngresoBodegaRechazos}
        ganancia={exigir(d.ganancia, "ganancia")}
        ivaFacturado={exigir(d.ivaFacturado, "ivaFacturado")}
        pagoTienda={exigir(d.pagoTienda, "pagoTienda")}
        audiencia="satelite"
        ordenesSinGestion={d.ordenesSinGestion}
        sinGestionRegistrado={d.sinGestionRegistrado}
        rechazosDeTienda={d.rechazosDeTienda}
      />
    </div>,
  );
}
