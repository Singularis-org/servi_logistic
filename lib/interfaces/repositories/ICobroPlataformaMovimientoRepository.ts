import type { CobroPlataformaTipo, PrismaClient } from "@prisma/client";

// SL-40 (design §5) — contrato del repositorio de los cargos y reversos del cobro de la plataforma.
// SOLO LECTURA: los movimientos los escribe la base, con los triggers sobre `orden` (design §2.2), y
// la empresa no tiene permiso de escritura (R8). Lo vigila
// `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`.
//
// SLT-118 (design §5; R18): la deuda suma también las cuotas de las facturas cerradas. No son un
// movimiento: viven solo en la fila de la factura (P2), y aquí entran como un tipo más, `cuota`.

/** La suma de los importes de un tipo, como texto con dos decimales (R26). `cuota`: SLT-118 R18. */
export interface SumaCobroPlataformaPorTipo {
  tipo: CobroPlataformaTipo | "cuota";
  monto: string;
}

/**
 * El cliente extendido, o el `tx` de una transacción abierta (SL-45, el tope de design §6).
 * SLT-118 (design §5): y las facturas, de donde salen las cuotas.
 */
export type CobroPlataformaPrismaClient = Pick<PrismaClient, "cobroPlataformaMovimiento" | "facturaPlataforma">;

export interface ICobroPlataformaMovimientoRepository {
  /**
   * Σ `monto` por `tipo` de TODOS los movimientos de la empresa, desde el principio y sin ningún
   * otro filtro (R23). Un tipo sin movimientos no aparece. Con `cliente`, lee dentro de esa
   * transacción (SL-45, design §6). SLT-118 (R18): y la entrada `cuota`, Σ `cuota` + `primera_cuota`
   * de sus facturas cerradas, que no aparece si no hay ninguna con cuota.
   */
  sumasPorTipo(organizacionId: string, cliente?: CobroPlataformaPrismaClient): Promise<SumaCobroPlataformaPorTipo[]>;
}
