import type { PrismaClient } from "@prisma/client";

import type { IGrupoDistritosService } from "@/lib/interfaces/services/IGrupoDistritosService";
import type {
  IFaltantesDeActivacion,
  ITarifaActivacionService,
} from "@/lib/interfaces/services/ITarifaActivacionService";
import type { ITarifaValorService } from "@/lib/interfaces/services/ITarifaValorService";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
import { TarifaActivacionRepository } from "@/lib/repositories/TarifaActivacionRepository";
import { TarifaValorRepository } from "@/lib/repositories/TarifaValorRepository";
import { GrupoDistritosService } from "@/lib/services/GrupoDistritosService";
import { TarifaActivacionService } from "@/lib/services/TarifaActivacionService";
import { TarifaValorService } from "@/lib/services/TarifaValorService";

export interface ServiciosDeTarifas {
  tarifaValor: ITarifaValorService;
  grupoDistritos: IGrupoDistritosService;
  tarifaActivacion: ITarifaActivacionService;
}

/**
 * SLT-54 T1.4 — los faltantes de verdad llegan con `TarifasPantallaService` (T2.3 los ata aqui). Hasta
 * entonces activar FALLA CERRADO: una lista vacia activaria sin pedir la confirmacion de R6, y eso mueve
 * dinero. Lo fija `tests/unit/tarifas/servicios-composicion.test.ts`.
 */
const FALTANTES_SIN_ATAR: IFaltantesDeActivacion = {
  faltantesPorZona: async () => {
    throw new Error("SLT-54: los faltantes de la activacion se atan en T2.3");
  },
};

/**
 * SLT-52 (design §8, R13) — la UNICA raiz de composicion de los services de escritura del modelo
 * nuevo. Las actions de SLT-54 la llaman con el cliente de la peticion (`getPrismaClient()`, que ya
 * lleva la empresa de la sesion) en vez de montar cada una su `new`: asi no hay una raiz que olvide
 * pasar un repositorio y deje el service escribiendo en `undefined`.
 * `tests/unit/tarifas/servicios-composicion.test.ts` comprueba que cada dependencia llega.
 */
export function serviciosDeTarifas(prisma: PrismaClient): ServiciosDeTarifas {
  return {
    tarifaValor: new TarifaValorService(new TarifaValorRepository(prisma)),
    grupoDistritos: new GrupoDistritosService(new GrupoDistritosRepository(prisma)),
    tarifaActivacion: new TarifaActivacionService(new TarifaActivacionRepository(prisma), FALTANTES_SIN_ATAR),
  };
}
