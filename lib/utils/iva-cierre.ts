import { Prisma } from "@prisma/client";

import type { TotalesIngresoEmpresa } from "@/lib/interfaces/services/ICierreDiaService";

// SL-39 (design §12.3, R21–R23) — QUE PARTE DE LO FACTURADO EN UN CIERRE ES IVA.
//
// Lo facturado (`totales.total`) lleva el IVA dentro, y ese IVA no es de la empresa: se le cobra a
// la tienda y se le debe al fisco. La ganancia y el neto del detalle del cierre se restan desde lo
// facturado SIN IVA. La regla vive aqui, en un solo sitio, y los dos detalles de `cierres-admin`
// (mensajero y bodega, en sus dos niveles) le pasan el resultado a `gananciaEmpresa`/`netoEmpresa`.
//
// Solo importa el TIPO de los totales: los tres IVA ya llegan sumados aparte en
// `TotalesIngresoEmpresa`. Se separa al leer, tambien en cierres anteriores a SL-39 (R25).
//
// Money-safe: `Prisma.Decimal` dentro, STRING con dos decimales fuera.

type ConceptoIva = "ivaFlete" | "ivaFleteDevolucion" | "ivaComisionCod";

/** Los totales del cierre; un IVA ausente o `null` se acepta y no aporta. */
type TotalesConIva = Pick<TotalesIngresoEmpresa, "total"> & {
  [K in ConceptoIva]?: TotalesIngresoEmpresa[K] | null;
};

/** Un concepto ausente o `null` no aporta: no es un 0.00 facturado, es un concepto que no aplica. */
function decimalDe(monto: string | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(monto ?? 0);
}

function ivaDecimal(totales: TotalesConIva): Prisma.Decimal {
  return decimalDe(totales.ivaFlete)
    .plus(decimalDe(totales.ivaFleteDevolucion))
    .plus(decimalDe(totales.ivaComisionCod));
}

/** R21: IVA del flete + IVA del flete por devolucion a origen + IVA de la comision COD. */
export function ivaFacturado(totales: TotalesConIva): string {
  return ivaDecimal(totales).toFixed(2);
}

/** R22/R23: el minuendo de la ganancia y del neto — lo facturado menos su IVA. */
export function facturadoSinIva(totales: TotalesConIva): string {
  return decimalDe(totales.total).minus(ivaDecimal(totales)).toFixed(2);
}
