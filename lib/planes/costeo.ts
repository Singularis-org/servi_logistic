import { aCentimos, aCentimosConSigno, aTexto } from "@/lib/planes/centimos";
import { tieneCostoConcreto, type PlanParaCosto } from "@/lib/planes/costo-concreto";
import type { CobroDelCiclo, CosteoDelCiclo, CostoVigente, FuenteDelCosto } from "@/lib/types/consumo-plan";

// SLT-66 (design §4.3; R19, R20, R10, R28) — el total estimado del ciclo que muestran «Mi plan» y el
// detalle de empresa del superadmin. SLT-83 (design §4.3; R23): con un plan porcentual el total es lo
// que ya se cobró, no una estimación, porque el importe de cada orden depende de su estado final.
//
// La aritmética, en céntimos exactos (`lib/planes/centimos.ts`): ni `Number(` ni `parseFloat`.

type CostoFijo = Extract<CostoVigente, { modo: "fijo" }>;

/** Una fila de `cobro_plataforma_tarifa_de` con los importes como texto (SLT-83 M3). */
export type TarifaLeida = { monto: string | null; fuente: FuenteDelCosto; porcentaje: string | null; minimo: string | null };

/**
 * SLT-83 (R22, R23): la regla vigente con su modo. «Porcentual» es `porcentaje` no nulo, como en la
 * función. Un porcentaje solo sale del plan (la excepción y el global son fijos, R7) y el modo fijo
 * siempre trae importe: otra forma es una función rota, y se dice en vez de pintar una cifra falsa.
 */
export function costoVigenteDeLaTarifa(t: TarifaLeida): CostoVigente {
  if (t.porcentaje !== null) {
    if (t.fuente !== "plan") {
      throw new Error(`cobro_plataforma_tarifa_de: porcentaje con fuente ${t.fuente}; solo el plan es porcentual`);
    }
    return { modo: "porcentual", porcentaje: t.porcentaje, minimo: t.minimo, fuente: "plan" };
  }
  if (t.monto === null) throw new Error(`cobro_plataforma_tarifa_de: modo fijo sin importe (fuente ${t.fuente})`);
  return { modo: "fijo", monto: t.monto, fuente: t.fuente };
}

type CosteoFijo = Extract<CosteoDelCiclo, { modo: "fijo" }>;

/**
 * `costoVigente` es el de `cobro_plataforma_tarifa_de`, el mismo que usará el próximo cargo (§3.2):
 * en modo fijo nunca queda «por definir» porque cae al global o a `0.00` (R20). El total usa lo que la
 * empresa paga.
 *
 * `sinCostoConcreto` mira el PLAN, no lo que se cobra (R28): con una excepción en la empresa y un plan
 * sin costo por orden, el aviso sale igual.
 *
 * SLT-83: `cobroCiclo` es el de `plan_cobro_del_ciclo` (R24) y solo lo usa el modo porcentual: en el
 * fijo es opcional y no cambia nada.
 */
export function costeoDelCiclo(plan: PlanParaCosto, costoVigente: CostoFijo, ordenes: number, cobroCiclo?: CobroDelCiclo): CosteoFijo;
export function costeoDelCiclo(
  plan: PlanParaCosto,
  costoVigente: CostoVigente,
  ordenes: number,
  cobroCiclo: CobroDelCiclo,
): CosteoDelCiclo;
export function costeoDelCiclo(
  plan: PlanParaCosto,
  costoVigente: CostoVigente,
  ordenes: number,
  cobroCiclo?: CobroDelCiclo,
): CosteoDelCiclo {
  const { precio } = plan;
  // El anual (fijo o con descuento) no entra: el total es siempre mensual (R10, R19).
  const mensual = precio.tipo === "monto" ? aCentimos(precio.mensual) : null;
  const comun = {
    base: mensual === null ? { tipo: "por_definir" as const } : { tipo: "monto" as const, mensual: aTexto(mensual) },
    sinCostoConcreto: !tieneCostoConcreto(plan),
    anualNoAplicaAlCosto: precio.tipo === "monto" && precio.anual !== null,
  };

  if (costoVigente.modo === "porcentual") {
    // R23: base + lo cobrado en el ciclo; las órdenes aún sin estado final solo se cuentan.
    // Las sobrecargas lo exigen en este modo; sin él, el total sería una cifra inventada.
    if (cobroCiclo === undefined) throw new Error("costeoDelCiclo: el modo porcentual necesita lo cobrado en el ciclo");
    const cobrado = aCentimosConSigno(cobroCiclo.cobrado);
    return {
      modo: "porcentual",
      ...comun,
      porcentaje: costoVigente.porcentaje,
      minimo: costoVigente.minimo,
      cobrado: aTexto(cobrado),
      pendientes: cobroCiclo.pendientes,
      total: mensual === null ? null : aTexto(mensual + cobrado),
    };
  }

  const costo = aCentimos(costoVigente.monto);
  const subtotal = costo * BigInt(ordenes);
  return {
    modo: "fijo",
    ...comun,
    costoPorOrden: aTexto(costo),
    fuente: costoVigente.fuente,
    ordenes,
    subtotalOrdenes: aTexto(subtotal),
    total: mensual === null ? null : aTexto(mensual + subtotal),
  };
}
