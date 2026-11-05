import type { PrismaClient } from "@prisma/client";

import type { IGrupoDistritosService } from "@/lib/interfaces/services/IGrupoDistritosService";
import type { ITarifaActivacionService } from "@/lib/interfaces/services/ITarifaActivacionService";
import type { ITarifasPantallaService } from "@/lib/interfaces/services/ITarifasPantallaService";
import type { ITarifaValorService } from "@/lib/interfaces/services/ITarifaValorService";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
import { TarifaActivacionRepository } from "@/lib/repositories/TarifaActivacionRepository";
import { TarifasPantallaRepository } from "@/lib/repositories/TarifasPantallaRepository";
import { TarifaValorRepository } from "@/lib/repositories/TarifaValorRepository";
import { GrupoDistritosService } from "@/lib/services/GrupoDistritosService";
import { TarifaActivacionService } from "@/lib/services/TarifaActivacionService";
import { TarifasPantallaService } from "@/lib/services/TarifasPantallaService";
import { TarifaValorService } from "@/lib/services/TarifaValorService";

export interface ServiciosDeTarifas {
  tarifaValor: ITarifaValorService;
  grupoDistritos: IGrupoDistritosService;
  tarifaActivacion: ITarifaActivacionService;
  tarifasPantalla: ITarifasPantallaService;
}

/**
 * SLT-52 (design §8, R13) — la UNICA raiz de composicion de los services del modelo nuevo. Las actions
 * la llaman con el cliente de la peticion (`getPrismaClient()`, que ya lleva la empresa de la sesion) en
 * vez de montar cada una su `new`: asi no hay una raiz que olvide pasar un repositorio y deje el service
 * escribiendo en `undefined`.
 *
 * SLT-54 (design §4, R6): activar recibe el MISMO service que la pantalla como fuente de faltantes, asi
 * que la confirmacion se decide con la lista que el maestro ve.
 * `tests/unit/tarifas/servicios-composicion.test.ts` comprueba que cada dependencia llega.
 */
export function serviciosDeTarifas(prisma: PrismaClient): ServiciosDeTarifas {
  const tarifasPantalla = new TarifasPantallaService(new TarifasPantallaRepository(prisma));
  return {
    tarifaValor: new TarifaValorService(new TarifaValorRepository(prisma)),
    grupoDistritos: new GrupoDistritosService(new GrupoDistritosRepository(prisma)),
    tarifaActivacion: new TarifaActivacionService(new TarifaActivacionRepository(prisma), tarifasPantalla),
    tarifasPantalla,
  };
}
