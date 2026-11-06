import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type {
  GuardarTopeResultado,
  ITopeIntentosRepository,
} from "@/lib/interfaces/repositories/ITopeIntentosRepository";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

type TopeIntentosPrismaClient = Pick<PrismaClient, "$transaction">;

/**
 * SLT-77 (design §2.3) — la unica escritura de la app sobre `organizacion`. SQL a mano y por el contexto,
 * como la lectura (`_shared/tope-intentos-empresa.ts`): sin empresa o en plataforma no encuentra fila y
 * falla, en vez de escribir como dueño (R27). La RLS y el `GRANT` por columna lo respaldan (R7).
 */
export class TopeIntentosRepository implements ITopeIntentosRepository {
  constructor(private readonly prisma: TopeIntentosPrismaClient) {}

  async guardar(tope: number, actorUsuarioId: string): Promise<GuardarTopeResultado> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa dos guardados, asi el «anterior» del historial es cierto. `NO KEY` para no frenar las FK
      // a `organizacion` de cada insercion de la empresa, que toman `FOR KEY SHARE`.
      const filas = await tx.$queryRaw<{ id: string; tope: number }[]>`
        SELECT "id", "tope_intentos_entrega" AS "tope" FROM "organizacion"
         WHERE "id" = NULLIF(current_setting('app.organizacion_id', true), '')
           FOR NO KEY UPDATE`;
      if (filas.length === 0) throw new EmpresaNoResuelta("organizacion", "guardarTopeIntentos");

      const { id, tope: anterior } = filas[0];
      if (anterior === tope) return { cambio: false };

      await tx.$executeRaw`
        UPDATE "organizacion" SET "tope_intentos_entrega" = ${tope}, "updated_at" = now()
         WHERE "id" = NULLIF(current_setting('app.organizacion_id', true), '')`;

      const actor = await resolverActorCongelado(tx, actorUsuarioId);
      await appendAccion(tx, [
        {
          accion: "tope_intentos_cambiado",
          entidadTipo: "organizacion",
          entidadId: id,
          entidadEtiqueta: etiquetaDeEntidad("organizacion", {}),
          ...actor,
          valorAnterior: String(anterior),
          valorNuevo: String(tope),
        },
      ]);
      return { cambio: true };
    });
  }
}
