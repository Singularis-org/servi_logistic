import { aCentimos, aTexto } from "@/lib/planes/centimos";
import { tieneCostoConcreto, type PlanParaCosto } from "@/lib/planes/costo-concreto";
import type { CosteoDelCiclo, FuenteDelCosto } from "@/lib/types/consumo-plan";

// SLT-66 (design §4.3; R19, R20, R10, R28) — el total estimado del ciclo que muestran «Mi plan» y el
// detalle de empresa del superadmin.
//
// La aritmética, en céntimos exactos (`lib/planes/centimos.ts`): ni `Number(` ni `parseFloat`.

/**
 * `costoVigente` es el de `cobro_plataforma_tarifa_de`, el mismo que usará el próximo cargo (§3.2):
 * nunca queda «por definir» porque cae al global o a `0.00` (R20). El total usa lo que la empresa paga.
 *
 * `sinCostoConcreto` mira el PLAN, no lo que se cobra (R28): con una excepción en la empresa y un plan
 * sin costo por orden, el aviso sale igual.
 */
export function costeoDelCiclo(
  plan: PlanParaCosto,
  costoVigente: { monto: string; fuente: FuenteDelCosto },
  ordenes: number,
): Extract<CosteoDelCiclo, { modo: "fijo" }> {
  const { precio } = plan;
  const costo = aCentimos(costoVigente.monto);
  const subtotal = costo * BigInt(ordenes);
  // El anual (fijo o con descuento) no entra: el total es siempre mensual (R10, R19).
  const mensual = precio.tipo === "monto" ? aCentimos(precio.mensual) : null;
  const base: CosteoDelCiclo["base"] =
    mensual === null ? { tipo: "por_definir" } : { tipo: "monto", mensual: aTexto(mensual) };
  return {
    modo: "fijo",
    base,
    costoPorOrden: aTexto(costo),
    fuente: costoVigente.fuente,
    ordenes,
    subtotalOrdenes: aTexto(subtotal),
    total: mensual === null ? null : aTexto(mensual + subtotal),
    sinCostoConcreto: !tieneCostoConcreto(plan),
    anualNoAplicaAlCosto: precio.tipo === "monto" && precio.anual !== null,
  };
}
