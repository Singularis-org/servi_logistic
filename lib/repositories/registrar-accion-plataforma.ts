import type {
  HistorialPlataformaAccion,
  HistorialPlataformaEntidad,
  Prisma,
} from "@prisma/client";

/**
 * SL-20 (design §2.6; R33, R34, R35; D15) — EL ÚNICO ESCRITOR de `historial_plataforma`.
 *
 * Es el `appendAccion` de la plataforma (`registrar-accion.ts`, ficha 362) con su mismo contrato:
 *
 *   TODA acción del superadmin sobre países y geografía invoca `appendAccionPlataforma` en su MISMA
 *   `$transaction`, y SOLO con las entidades que EFECTIVAMENTE escribió.
 *
 * Recibe `tx` y no un cliente para que no pueda abrir su propia transacción: si el registro falla,
 * el cambio no persiste, y si el cambio falla, no queda registro (R33). No hay `update` ni `delete`:
 * la fila es inmutable.
 *
 * Corre como dueño (`comoPlataforma`): `servi_app` no tiene ningún privilegio sobre la tabla (R34).
 */

/** Lo que este punto necesita del cliente: solo la tabla del historial de plataforma. */
export type HistorialPlataformaTxClient = Pick<Prisma.TransactionClient, "historialPlataforma">;

/** El actor CONGELADO en el instante de la acción. Los dos a `null` = sistema o script. */
export interface ActorPlataformaCongelado {
  actorUsuarioId: string | null;
  actorNombre: string | null;
}

/** Una fila por entidad afectada. */
export interface EntradaAccionPlataforma extends ActorPlataformaCongelado {
  accion: HistorialPlataformaAccion;
  entidadTipo: HistorialPlataformaEntidad;
  /** Opaco, sin FK: la fila sobrevive a su sujeto. */
  entidadId: string;
  /** El nombre CONGELADO de la entidad. */
  entidadEtiqueta: string;
  paisId: string;
  /** Solo en el renombre. */
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  /** Solo en `division_cargada`, y solo cifras. */
  detalle?: Prisma.InputJsonValue | null;
}

// Anchuras de las columnas (migración 20261026120400). Recortar aquí y no fallar: una etiqueta larga
// no puede tumbar la acción que registra.
const ANCHO_ETIQUETA = 120;
const ANCHO_ACTOR = 120;

/** Vacío = no-op: una acción que no alcanzó ninguna entidad no deja fila. */
export async function appendAccionPlataforma(
  tx: HistorialPlataformaTxClient,
  entradas: readonly EntradaAccionPlataforma[],
): Promise<void> {
  if (entradas.length === 0) return;

  await tx.historialPlataforma.createMany({
    data: entradas.map((e) => ({
      accion: e.accion,
      entidadTipo: e.entidadTipo,
      entidadId: e.entidadId,
      entidadEtiqueta: e.entidadEtiqueta.slice(0, ANCHO_ETIQUETA),
      paisId: e.paisId,
      actorUsuarioId: e.actorUsuarioId,
      actorNombre: e.actorNombre === null ? null : e.actorNombre.slice(0, ANCHO_ACTOR),
      valorAnterior: e.valorAnterior ?? null,
      valorNuevo: e.valorNuevo ?? null,
      // Sin detalle se omite y la columna queda NULL: Prisma no acepta `null` a secas en un campo JSON.
      detalle: e.detalle ?? undefined,
    })),
  });
}
