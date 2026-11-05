import type { Prisma, VehiculoRastroAccion } from "@prisma/client";

/**
 * SL-42 (design §2.2, P2; R21, R22) — EL ÚNICO ESCRITOR de `vehiculo_rastro`.
 *
 * Mismo contrato que `appendAccionPlataforma` (`registrar-accion-plataforma.ts`):
 *
 *   TODA acción del superadmin sobre el catálogo de vehículos que EFECTIVAMENTE escribe invoca
 *   `appendRastroVehiculo` en su MISMA `$transaction`. Una operación que no escribe (renombrar a su
 *   propio nombre, activar lo activo) no lo llama y no deja fila (R21).
 *
 * Recibe `tx` y no un cliente para que no pueda abrir su propia transacción: si el registro falla, el
 * cambio no persiste, y si el cambio falla, no queda registro. No hay `update` ni `delete`: la fila es
 * inmutable.
 *
 * Corre como dueño: el superadmin no tiene empresa (design §3, «Contexto de datos»). `servi_app` no
 * tiene ningún privilegio sobre la tabla (R22).
 */

/** Lo que este punto necesita del cliente: solo la tabla del rastro de vehículos. */
export type VehiculoRastroTxClient = Pick<Prisma.TransactionClient, "vehiculoRastro">;

export interface EntradaRastroVehiculo {
  accion: VehiculoRastroAccion;
  /** Opaco, sin FK: la fila sobrevive a su sujeto. */
  vehiculoId: string;
  /** El nombre CONGELADO del vehículo en el instante de la acción. */
  vehiculoNombre: string;
  /** El actor CONGELADO. */
  actorUsuarioId: string;
  actorNombre: string;
  /** Solo en el renombre. */
  valorAnterior?: string | null;
  valorNuevo?: string | null;
}

// Anchuras de las columnas (migración 20261103120100). Recortar aquí y no fallar: un nombre largo no
// puede tumbar la acción que registra.
const ANCHO_NOMBRE = 40;
const ANCHO_ACTOR = 120;

function recortar(valor: string | null | undefined): string | null {
  return valor == null ? null : valor.slice(0, ANCHO_NOMBRE);
}

export async function appendRastroVehiculo(
  tx: VehiculoRastroTxClient,
  entrada: EntradaRastroVehiculo,
): Promise<void> {
  await tx.vehiculoRastro.create({
    data: {
      accion: entrada.accion,
      vehiculoId: entrada.vehiculoId,
      vehiculoNombre: entrada.vehiculoNombre.slice(0, ANCHO_NOMBRE),
      actorUsuarioId: entrada.actorUsuarioId,
      actorNombre: entrada.actorNombre.slice(0, ANCHO_ACTOR),
      valorAnterior: recortar(entrada.valorAnterior),
      valorNuevo: recortar(entrada.valorNuevo),
    },
  });
}
