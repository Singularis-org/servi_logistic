import type { CobroPlataformaTipo, PrismaClient } from "@prisma/client";

// SL-40 (design §5) — contrato del repositorio de los cargos y reversos del cobro de la plataforma.
// SOLO LECTURA: los movimientos los escribe la base, con los triggers sobre `orden` (design §2.2), y
// la empresa no tiene permiso de escritura (R8). Lo vigila
// `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`.

/** La suma de los importes de un tipo de movimiento, como texto con dos decimales (R26). */
export interface SumaCobroPlataformaPorTipo {
  tipo: CobroPlataformaTipo;
  monto: string;
}

/** El cliente extendido, o el `tx` de una transacción abierta (SL-45, el tope de design §6). */
export type CobroPlataformaPrismaClient = Pick<PrismaClient, "cobroPlataformaMovimiento">;

export interface ICobroPlataformaMovimientoRepository {
  /**
   * Σ `monto` por `tipo` de TODOS los movimientos de la empresa, desde el principio y sin ningún
   * otro filtro (R23). Un tipo sin movimientos no aparece. Con `cliente`, lee dentro de esa
   * transacción (SL-45, design §6).
   */
  sumasPorTipo(organizacionId: string, cliente?: CobroPlataformaPrismaClient): Promise<SumaCobroPlataformaPorTipo[]>;
}
