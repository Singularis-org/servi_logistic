import { Prisma } from "@prisma/client";

import type { PagoCongelado } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 (T5.2, R40, R34; design §2.5) — la fila de `gestion_pago_congelado` de un `PagoCongelado`.
 *
 * Un solo mapeo para los tres sitios que congelan el pago de una gestion: la creacion del cierre
 * (solicitud y corte, `CierreDiaRepository.crearCierre`), la re-solicitud de un rechazado (477) y la
 * correccion de un resultado (398). Copia el valor resuelto tal cual; `base` solo en porcentaje
 * (CHECK `gestion_pago_congelado_base_solo_porcentaje`). Sin IVA: la tabla no tiene donde ponerlo.
 * Money-safe: texto -> `Prisma.Decimal`, nunca `number`.
 */
export function filaPagoCongelado(p: PagoCongelado): Prisma.GestionPagoCongeladoCreateManyInput {
  return {
    gestionOrdenId: p.gestionId,
    actor: p.actor,
    concepto: p.valor.concepto,
    modo: p.valor.modo,
    valor: new Prisma.Decimal(p.valor.valor),
    nivel: p.valor.nivel,
    tarifaValorId: p.valor.tarifaValorId,
    base: p.base === null ? null : new Prisma.Decimal(p.base),
    importe: new Prisma.Decimal(p.importe),
  };
}
