import { z } from "zod";

import type { ITarifaActivacionRepository } from "@/lib/interfaces/repositories/ITarifaActivacionRepository";
import type {
  ActivarTarifasResult,
  Actor,
  IFaltantesDeActivacion,
  ITarifaActivacionService,
} from "@/lib/interfaces/services/ITarifaActivacionService";
import { activarTarifasSchema } from "@/lib/types/tarifa-flexible";

/**
 * SLT-54 (design §4, R4-R7) — hacer regir el modelo nuevo en la empresa del contexto. Es la unica
 * escritura que cambia con que modelo calcula una empresa.
 */
export class TarifaActivacionService implements ITarifaActivacionService {
  constructor(
    private readonly repo: ITarifaActivacionRepository,
    private readonly faltantes: IFaltantesDeActivacion,
  ) {}

  async activar(input: unknown, actor: Actor): Promise<ActivarTarifasResult> {
    // R5: antes de leer nada y antes de mirar el input.
    if (actor.rol !== "maestro") return { status: "forbidden" };

    const parseado = activarTarifasSchema.safeParse(input);
    if (!parseado.success) {
      return { status: "validation_error", fieldErrors: z.flattenError(parseado.error).fieldErrors };
    }

    const vigente = await this.repo.leer();
    if (vigente !== null) return { status: "ya_activada", activadaAt: vigente.activadaAt };

    // R6: lo decide el servidor. El dialogo pudo abrirse con otro estado y otra sesion pudo vaciar un
    // valor entretanto. Si la confirmacion llega y la lista cambio, se activa: el maestro acepto
    // activar con lo que falte, no con una lista concreta (design §4).
    const conFaltantes = (await this.faltantes.faltantesPorZona()).filter((z) => z.faltantes.length > 0);
    if (conFaltantes.length > 0 && !parseado.data.confirmaFaltantes) {
      return { status: "confirmacion_requerida", faltantes: conFaltantes };
    }

    const total = conFaltantes.reduce((suma, z) => suma + z.faltantes.length, 0);
    const res = await this.repo.activar(actor.usuarioId, total);
    return { status: res.creada ? "ok" : "ya_activada", activadaAt: res.activadaAt };
  }
}
