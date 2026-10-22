import { Prisma, type PrismaClient } from "@prisma/client";
import {
  SinTransicionesError,
  type ComprobanteDeOrden,
  type ConfirmarEntregaLoteInput,
  type ConfirmarEntregaLoteResultado,
  type IDevolucionTiendaRepository,
  type OrdenParaReporte,
} from "@/lib/interfaces/repositories/IDevolucionTiendaRepository";
import { appendCambioEstado } from "@/lib/repositories/registrar-cambio-estado";

const ROL_TIENDA = "adminTienda";

/**
 * FICHA 419 (design D4) — la confirmacion CENTRAL de entrega a la tienda, set-based.
 *
 * Patron calcado de `GestionOrdenRepository.recogerLote`: UNA sentencia `UPDATE ... RETURNING`
 * guardada por id + tienda + estado de origen + no borrada, y el append del historial SOLO con lo
 * devuelto por el `RETURNING`, todo en la misma `$transaction`. La carrera con otro lote o con el
 * escaner de la tienda la decide Postgres (R8): la orden que otro gano no aparece en el
 * `RETURNING` y no deja rastro. La `PRIMARY KEY (orden_id)` del enlace es la segunda red.
 */
export class DevolucionTiendaRepository implements IDevolucionTiendaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findEstatusIdByValue(value: string): Promise<string | null> {
    const found = await this.prisma.orderStatus.findUnique({
      where: { value },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  async esTienda(usuarioId: string): Promise<boolean> {
    const u = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, rol: { value: ROL_TIENDA } },
      select: { id: true },
    });
    return u !== null;
  }

  async confirmarEntregaLote(
    input: ConfirmarEntregaLoteInput,
  ): Promise<ConfirmarEntregaLoteResultado> {
    const { tiendaId, subidoPor, ordenIds, origenEstatusId, destinoEstatusId, evidencias } = input;
    if (ordenIds.length === 0) throw new SinTransicionesError();

    return this.prisma.$transaction(
      async (tx) => {
        // 1-2. El comprobante y sus archivos. Si el UPDATE no gana ninguna fila, el throw de
        //      abajo revierte estas dos inserciones (R11).
        const comprobante = await tx.devolucionTiendaComprobante.create({
          data: { tiendaId, subidoPor },
          select: { id: true },
        });
        await tx.devolucionTiendaEvidencia.createMany({
          data: evidencias.map((e) => ({
            comprobanteId: comprobante.id,
            storagePath: e.storagePath,
            contentType: e.contentType,
            indice: e.indice,
          })),
        });

        // 3. La defensa REAL (R6/R8): estado + tienda + no borrada en el propio WHERE.
        //    `updated_at` a mano: el raw no dispara el @updatedAt de Prisma.
        const rows = await tx.$queryRaw<{ id: string }[]>`
          UPDATE "orden"
          SET "estatus_id" = ${destinoEstatusId},
              "updated_at" = NOW()
          WHERE "id" IN (${Prisma.join(ordenIds)})
            AND "tienda_id" = ${tiendaId}
            AND "estatus_id" = ${origenEstatusId}
            AND "deleted_at" IS NULL
          RETURNING "id"`;

        // 4. R11: sin transiciones no se persiste nada del comprobante.
        if (rows.length === 0) throw new SinTransicionesError();

        // 5. R9/R14: historial (familia `ajuste_estado`, como el escaner) + webhook outbox en la
        //    MISMA tx, SOLO para lo que devolvio el RETURNING.
        await appendCambioEstado(
          tx,
          rows.map((r) => ({
            ordenId: r.id,
            estatusOrigenId: origenEstatusId,
            estatusDestinoId: destinoEstatusId,
            actorUsuarioId: subidoPor,
            origenTipo: "ajuste_estado",
          })),
        );

        // 6. R10: enlace orden <-> comprobante, solo de las transicionadas.
        await tx.devolucionTiendaOrden.createMany({
          data: rows.map((r) => ({ ordenId: r.id, comprobanteId: comprobante.id })),
        });

        return { comprobanteId: comprobante.id, transicionadas: rows.map((r) => r.id) };
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  }

  async findOrdenesParaReporte(ordenIds: string[]): Promise<OrdenParaReporte[]> {
    if (ordenIds.length === 0) return [];
    const filas = await this.prisma.orden.findMany({
      where: { id: { in: ordenIds } }, // SIN filtro de borradas: se reportan como no_encontrada
      select: {
        id: true,
        numGuia: true,
        tiendaId: true,
        deletedAt: true,
        estatus: { select: { value: true } },
      },
    });
    return filas.map((f) => ({
      id: f.id,
      numGuia: f.numGuia,
      tiendaId: f.tiendaId,
      deletedAt: f.deletedAt,
      estatusValue: f.estatus.value,
    }));
  }

  async findComprobanteDeOrden(ordenId: string): Promise<ComprobanteDeOrden | null> {
    const enlace = await this.prisma.devolucionTiendaOrden.findUnique({
      where: { ordenId },
      select: {
        comprobante: {
          select: {
            createdAt: true,
            subidor: { select: { nombre: true } },
            evidencias: {
              orderBy: { indice: "asc" },
              select: { storagePath: true, contentType: true, indice: true },
            },
          },
        },
      },
    });
    if (enlace === null) return null;
    const c = enlace.comprobante;
    return { createdAt: c.createdAt, subidoPorNombre: c.subidor.nombre, evidencias: c.evidencias };
  }
}
