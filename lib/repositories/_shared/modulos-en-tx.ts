import { randomUUID } from "node:crypto";

import type { ModuloApagable, Prisma } from "@prisma/client";

import { nombreDelModulo } from "@/lib/modulos/catalogo";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

// SL-24 (design §7.1) — el cambio de UNA fila de `organizacion_modulo`, dentro de una transacción
// ajena. Sale de `ModulosEmpresaRepository` (SL-23) para que la asignación y la edición de un plan
// sincronicen módulos en SU transacción, junto con el cambio de plan y su historial. El interruptor de
// SL-23 lo sigue usando igual, dentro de la suya: mismas sentencias, mismo resultado.
//
// No registra nada: devuelve si hubo cambio y el id de la fila, y quien llama junta la entrada de
// `entradaDelCambio` en su único `appendAccion` (un lote por acción, SL-23 R12/R13).

export type ModulosTxClient = Pick<Prisma.TransactionClient, "organizacionModulo">;

export interface CambioDeModulo {
  /** `false` = ya estaba así: no se escribió nada y no se registra (SL-23 R13). */
  cambio: boolean;
  filaId: string;
}

export function entradaDelCambio(
  accion: "modulo_activado" | "modulo_desactivado",
  organizacionId: string,
  filaId: string,
  modulo: ModuloApagable,
) {
  return {
    accion,
    entidadTipo: "organizacion_modulo" as const,
    // El id de la fila creada o borrada: opaco y sin FK, sobrevive al borrado al apagar.
    entidadId: filaId,
    entidadEtiqueta: etiquetaDeEntidad("organizacion_modulo", { moduloNombre: nombreDelModulo(modulo) }),
    valorNuevo: modulo,
    organizacionId,
  };
}

export async function encenderEnTx(
  tx: ModulosTxClient,
  organizacionId: string,
  modulo: ModuloApagable,
): Promise<CambioDeModulo> {
  const id = randomUUID();
  // `skipDuplicates` es `ON CONFLICT DO NOTHING` sobre el único (empresa, módulo): encender lo
  // encendido cuenta 0 y no se registra (SL-23 R13).
  const { count } = await tx.organizacionModulo.createMany({
    data: [{ id, organizacionId, modulo }],
    skipDuplicates: true,
  });
  return { cambio: count > 0, filaId: id };
}

export async function apagarEnTx(
  tx: ModulosTxClient,
  organizacionId: string,
  modulo: ModuloApagable,
): Promise<CambioDeModulo> {
  const fila = await tx.organizacionModulo.findFirst({
    where: { organizacionId, modulo },
    select: { id: true },
  });
  if (fila === null) return { cambio: false, filaId: "" };
  // Contado y por id: si otra petición la borró entre la lectura y aquí, no se registra nada.
  const { count } = await tx.organizacionModulo.deleteMany({ where: { id: fila.id } });
  return { cambio: count > 0, filaId: fila.id };
}
