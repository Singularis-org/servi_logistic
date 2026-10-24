import { Prisma } from "@prisma/client";

import type { SumaCobroPlataformaPorTipo } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";
import type { DeudaPlataformaDTO } from "@/lib/types/cobro-plataforma";

// SL-40 (design §5, R26) — la deuda de la empresa con la plataforma, derivada de las sumas por tipo.
// Money-safe: la resta va en `Prisma.Decimal`. La suma de una empresa con muchas órdenes pasa con
// holgura de los 15-16 dígitos que un `number` guarda exactos, y ahí un float pierde los céntimos.
//
// SL-45 (design §3, R13, R14): resta también los pagos vigentes y decide el estado aquí, en el
// servidor, para que la pantalla no compare importes.

/**
 * Σ cargo − Σ reverso − pagos vigentes, con su estado y su importe en positivo. Un tipo ausente
 * aporta 0. `pagosVigentes` es la Σ de los pagos sin anular, como texto.
 */
export function derivarDeudaPlataforma(
  sumas: readonly SumaCobroPlataformaPorTipo[],
  pagosVigentes: string,
): DeudaPlataformaDTO {
  let deuda = new Prisma.Decimal(0);
  for (const s of sumas) {
    const monto = new Prisma.Decimal(s.monto);
    deuda = s.tipo === "cargo" ? deuda.add(monto) : deuda.sub(monto);
  }
  deuda = deuda.sub(new Prisma.Decimal(pagosVigentes));
  // Un cero con signo (`-0`) se pintaría «-0.00»: el cero es siempre «al día» y sin signo.
  if (deuda.isZero()) return { deuda: "0.00", estado: "al_dia", importe: "0.00" };
  return {
    deuda: deuda.toFixed(2),
    estado: deuda.isPositive() ? "debe" : "a_favor",
    importe: deuda.abs().toFixed(2),
  };
}
