import { z } from "zod";

import type { ITopeIntentosRepository } from "@/lib/interfaces/repositories/ITopeIntentosRepository";
import type {
  Actor,
  GuardarTopeIntentosResult,
  ITopeIntentosService,
} from "@/lib/interfaces/services/ITopeIntentosService";
import { guardarTopeIntentosSchema } from "@/lib/types/tarifa-flexible";

/**
 * SLT-77 (design §4.1, R3-R5, R11) — guardar rige desde ya y no toca ninguna orden (R8): lo que ya alcance
 * el valor nuevo se resuelve en su siguiente paso.
 */
export class TopeIntentosService implements ITopeIntentosService {
  constructor(private readonly repo: ITopeIntentosRepository) {}

  async guardar(input: unknown, actor: Actor): Promise<GuardarTopeIntentosResult> {
    // R4: antes de mirar el input, para que un rol sin permiso no aprenda nada de la validacion.
    if (actor.rol !== "maestro") return { status: "forbidden" };

    const parseado = guardarTopeIntentosSchema.safeParse(input);
    if (!parseado.success) {
      return { status: "validation_error", fieldErrors: z.flattenError(parseado.error).fieldErrors };
    }

    await this.repo.guardar(parseado.data.tope, actor.usuarioId);
    return { status: "ok", tope: parseado.data.tope };
  }
}
