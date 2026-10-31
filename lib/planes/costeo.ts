import { Prisma } from "@prisma/client";

import type { CosteoDelCiclo, FuenteDelCosto } from "@/lib/types/consumo-plan";
import type { PrecioPlan } from "@/lib/types/planes";

// SLT-66 (design §4.3; R19, R20, R10) — el total estimado del ciclo que muestran «Mi plan» y el detalle
// de empresa del superadmin. Money-safe como `lib/utils/deuda-plataforma.ts`: un `number` perdería los
// céntimos (`0.10 × 3`) y no guarda exactos los `DECIMAL(12,2)` grandes multiplicados por las órdenes.

/**
 * `costoVigente` es el de `cobro_plataforma_tarifa_de`, el mismo que usará el próximo cargo (§3.2):
 * nunca queda «por definir» porque cae al global o a `0.00` (R20).
 *
 * El plan no tiene costo concreto si su base no es «monto» o si no fija costo por orden. Lo segundo se
 * lee de la fuente: sin excepción, la función solo cae a `global` o `sin_configurar` cuando el plan no
 * tiene costo por orden (R12).
 */
export function costeoDelCiclo(
  precio: PrecioPlan,
  costoVigente: { monto: string; fuente: FuenteDelCosto },
  ordenes: number,
): CosteoDelCiclo {
  const costo = new Prisma.Decimal(costoVigente.monto);
  const subtotal = costo.mul(ordenes);
  // El anual (fijo o con descuento) no entra: el total es siempre mensual (R10, R19).
  const base: CosteoDelCiclo["base"] =
    precio.tipo === "monto"
      ? { tipo: "monto", mensual: new Prisma.Decimal(precio.mensual).toFixed(2) }
      : { tipo: "por_definir" };
  const total = base.tipo === "monto" ? new Prisma.Decimal(base.mensual).add(subtotal).toFixed(2) : null;
  const planSinCostoPorOrden = costoVigente.fuente === "global" || costoVigente.fuente === "sin_configurar";
  return {
    base,
    costoPorOrden: costo.toFixed(2),
    fuente: costoVigente.fuente,
    ordenes,
    subtotalOrdenes: subtotal.toFixed(2),
    total,
    sinCostoConcreto: base.tipo !== "monto" || planSinCostoPorOrden,
    anualNoAplicaAlCosto: precio.tipo === "monto" && precio.anual !== null,
  };
}
