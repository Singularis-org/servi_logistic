import type { PrismaClient } from "@prisma/client";

import type {
  ActivarResultado,
  ITarifaActivacionRepository,
  TarifaActivacionDTO,
} from "@/lib/interfaces/repositories/ITarifaActivacionRepository";
import { textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

/**
 * SLT-54 (design §2, §4) — `tarifa_activacion`. Sin `organizacion_id` en ningun `where` ni en el
 * `create`: lo pone la extension del cliente y la politica RLS `tarifa_activacion_por_empresa` lo
 * respalda (R12). Activar A no puede tocar a B porque aqui no hay forma de nombrar a B.
 */
type TarifaActivacionPrismaClient = Pick<
  PrismaClient,
  "tarifaActivacion" | "usuario" | "$transaction" | "historialAccion"
>;

export class TarifaActivacionRepository implements ITarifaActivacionRepository {
  constructor(private readonly prisma: TarifaActivacionPrismaClient) {}

  async leer(): Promise<TarifaActivacionDTO | null> {
    return this.prisma.tarifaActivacion.findFirst({ select: { activadaAt: true, activadaPor: true } });
  }

  /**
   * R4: la fila y su historial en la misma transaccion. R7: dos activaciones a la vez chocan en el
   * unico por empresa; la perdedora espera el commit de la ganadora, no deja ni fila ni historial
   * (su transaccion se revierte entera) y lee la fecha fuera de ella. Otra violacion se propaga.
   */
  async activar(actorUsuarioId: string, totalFaltantes: number): Promise<ActivarResultado> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const fila = await tx.tarifaActivacion.create({
          data: { activadaPor: actorUsuarioId },
          select: { id: true, activadaAt: true },
        });
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "tarifas_activadas",
            entidadTipo: "tarifa_activacion",
            entidadId: fila.id,
            entidadEtiqueta: etiquetaDeEntidad("tarifa_activacion", {}),
            ...actor,
            valorAnterior: null,
            valorNuevo: `faltantes: ${totalFaltantes}`,
          },
        ]);
        return { creada: true, activadaAt: fila.activadaAt };
      });
    } catch (e) {
      if (!textoConstraintP2002(e)?.includes("tarifa_activacion_organizacion_id_key")) throw e;
      const ganadora = await this.leer();
      // El unico acaba de decir que la fila existe: si no se ve, la RLS o el contexto estan mal y
      // responder «ya activada» seria mentir.
      if (ganadora === null) throw e;
      return { creada: false, activadaAt: ganadora.activadaAt };
    }
  }
}
