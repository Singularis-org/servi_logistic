import { tieneCostoConcreto, type PlanParaCosto } from "@/lib/planes/costo-concreto";
import type { CosteoDelCiclo, FuenteDelCosto } from "@/lib/types/consumo-plan";

// SLT-66 (design §4.3; R19, R20, R10, R28) — el total estimado del ciclo que muestran «Mi plan» y el
// detalle de empresa del superadmin.
//
// Sin `@prisma/client`: este módulo llega a componentes cliente por `consumo.ts`, y `Prisma.Decimal`
// arrastraría el runtime de Prisma al bundle (decisión del humano, 2026-10-31). La aritmética va en
// céntimos enteros, como `lib/utils/pagos-recaudo.ts`, pero en `bigint`: un `DECIMAL(12,2)` por
// cien mil órdenes pasa de 2^53 y un `number` perdería céntimos. Ni `Number(` ni `parseFloat`.

const IMPORTE = /^(\d+)(?:\.(\d{1,2}))?$/;
const CIEN = BigInt(100);

/** Un importe en texto (`"7"`, `"0.1"`, `"9999999999.99"`) a céntimos exactos. */
function aCentimos(importe: string): bigint {
  const partes = IMPORTE.exec(importe);
  // Los importes vienen de columnas `DECIMAL(12,2)` no negativas: otra forma es un error del llamador.
  if (partes === null) throw new Error(`costeoDelCiclo: importe no válido: ${importe}`);
  return BigInt(partes[1]) * CIEN + BigInt((partes[2] ?? "").padEnd(2, "0"));
}

/** Céntimos a texto con dos decimales (`"0.30"`, `"50300.00"`). */
function aTexto(centimos: bigint): string {
  const digitos = centimos.toString().padStart(3, "0");
  return `${digitos.slice(0, -2)}.${digitos.slice(-2)}`;
}

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
): CosteoDelCiclo {
  const { precio } = plan;
  const costo = aCentimos(costoVigente.monto);
  const subtotal = costo * BigInt(ordenes);
  // El anual (fijo o con descuento) no entra: el total es siempre mensual (R10, R19).
  const mensual = precio.tipo === "monto" ? aCentimos(precio.mensual) : null;
  const base: CosteoDelCiclo["base"] =
    mensual === null ? { tipo: "por_definir" } : { tipo: "monto", mensual: aTexto(mensual) };
  return {
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
