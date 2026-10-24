import { Prisma } from "@prisma/client";

import type { SumaCobroPlataformaPorTipo } from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";

// SL-40 (design §5, R26) — la deuda de la empresa con la plataforma, derivada de las sumas por tipo.
// Money-safe: la resta va en `Prisma.Decimal`. La suma de una empresa con muchas órdenes pasa con
// holgura de los 15-16 dígitos que un `number` guarda exactos, y ahí un float pierde los céntimos.

/** Σ cargo − Σ reverso, como texto con dos decimales. Un tipo ausente aporta 0. */
export function derivarDeudaPlataforma(sumas: readonly SumaCobroPlataformaPorTipo[]): string {
  let deuda = new Prisma.Decimal(0);
  for (const s of sumas) {
    const monto = new Prisma.Decimal(s.monto);
    deuda = s.tipo === "cargo" ? deuda.add(monto) : deuda.sub(monto);
  }
  return deuda.toFixed(2);
}
