// Feature 39 — contrato del resolver de la tarifa de pago al mensajero. Solo query
// Prisma (sin logica de negocio: el mapeo resultado->monto vive en el util puro
// lib/utils/pago-mensajero.ts). Money-safe: los Decimal se devuelven ya serializados
// a STRING escala 2.
import type { PrismaClient } from "@prisma/client";
import type { ClienteDeMarcas } from "@/lib/repositories/_shared/zona-especial";
import type { ContextoPagoGestion, TarifaPago } from "@/lib/types/tarifa-flexible";

// SLT-52 (design §5): delegados que lee el resolver del pago, viejo y nuevo. Es el tipo del
// constructor de la fachada y del `tx` de `resolvePagos`; el `prisma` de las raices y el cliente
// de una transaccion ya lo cumplen.
export type PagoTarifaTxClient = Pick<
  PrismaClient,
  | "tarifaZonaMensajero"
  | "tarifaActivacion"
  | "tarifaValor"
  | "grupoDistritosDistrito"
  // SLT-89 (design §4.3): la tabla hermana de miembros y, solo cuando tiene filas, la carga del
  // catalogo de la empresa para subir por los ancestros del distrito (miembro mas cercano, R19).
  | "grupoDistritosNodo"
  | "zonaDistrito"
  | "zonaNodo"
  | "organizacion"
  | "tipoNivelGeografico"
  | "nodoGeografico"
> &
  ClienteDeMarcas;

// Tarifa de pago de una zona (resuelta por vehiculo o por defecto). `cobroEntregado`
// es el UNICO campo que la 39 paga al mensajero (solo por `entregada`). `cobroRechazado`
// se resuelve/transporta para no re-consultar, pero la 39 NO lo paga al mensajero: es un
// ingreso de bodega modelado en la feature 56 (`depends_on: 39`).
export interface PagoTarifa {
  cobroEntregado: string; // Decimal -> string 2 dec (money-safe)
  cobroRechazado: string; // presente pero NO se paga al mensajero (feature 56)
}

export interface ITarifaZonaMensajeroRepository {
  /**
   * R1/R2/R3: resuelve la tarifa de pago de una zona segun el vehiculo del mensajero:
   * 1) intenta la tarifa exacta (zonaId, vehiculoId) cuando hay vehiculo;
   * 2) si no hay tarifa especifica (o el mensajero no tiene vehiculo), cae a la tarifa
   *    por defecto de la zona (vehiculo_id IS NULL);
   * 3) `null` si la zona no tiene ninguna tarifa capturada (gap de datos, R8).
   * El indice unico (zona_id, vehiculo_id) NULLS NOT DISTINCT garantiza determinismo.
   *
   * SLT-52: solo modelo viejo. Sus llamadores pasan a `resolvePagos` en T5.1.
   */
  resolvePagoTarifa(zonaId: string, vehiculoId: string | null): Promise<PagoTarifa | null>;

  /**
   * SLT-52 (R19-R22, R28, R36, R37, R39) — el pago de N gestiones, indexado por `gestionId`, con
   * el modelo de la empresa y un numero fijo de consultas. En el viejo, `null` = la zona no tiene
   * tarifa; en el nuevo nunca es `null` y cada actor sin valor viene `null` (= paga 0, R24).
   * `tx` cuando el llamador esta dentro de su transaccion.
   */
  resolvePagos(
    ctxs: readonly ContextoPagoGestion[],
    tx?: PagoTarifaTxClient,
  ): Promise<Map<string, TarifaPago | null>>;
}
