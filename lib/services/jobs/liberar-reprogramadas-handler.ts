// Feature 90 (design §5, R22-R24) — handler DELGADO del job recurrente
// `liberar_reprogramadas` + su registro de recurrencia. NO reescribe la logica de
// liberacion: delega TODO en `LiberacionReprogramadaService.ejecutarLiberacion(...)`
// (feature 46), que ya es idempotente por dia (seguro ante re-claim por visibility
// timeout o reintento). El horario es las 00:00 locales (decision del gate F1.4-1).
//
// SLT-42 (design §6.1; R25, R26, R28): una serie para todas las zonas. Cada corrida es la de la
// zona que antes llega a las 00:00 y procesa solo las empresas de esa zona, cada una con «hoy» en
// su zona. Con una sola zona, los mismos instantes de antes (R26).
import type { ILiberacionReprogramadaService } from "@/lib/interfaces/services/ILiberacionReprogramadaService";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { LiberacionReprogramadaService } from "@/lib/services/LiberacionReprogramadaService";
import { LiberacionReprogramadaRepository } from "@/lib/repositories/LiberacionReprogramadaRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { fechaCalendario, inicioDelDiaComoFecha } from "@/lib/utils/calendario-zona";
import { zonaDeLaEmpresa } from "@/lib/services/zona-de-la-empresa";
import {
  claveConZona,
  corridaOriginalDeLaClave,
  instanteDeLaCorrida,
  leerClaveConZona,
  proximaCorridaPorZona,
  zonaLlegaALaHora,
  type HoraObjetivo,
} from "@/lib/services/jobs/serie-diaria-por-zona";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";

/** Prefijo del `dedupe_key`: `liberar_reprogramadas:<zona>:<YYYY-MM-DD local de la corrida>`. */
export const DEDUPE_PREFIX = "liberar_reprogramadas";

/** 00:00 locales (gate F1.4-1: se preserva la medianoche, no se mueve a 01:00). */
export const HORA_LIBERAR: HoraObjetivo = { hora: 0, minuto: 0 };

/**
 * `dedupe_key` de la corrida de `zona` en `instante`: la fecha CALENDARIO local de ESE instante.
 * Idempotencia por zona y dia (R25/R26 de la 90): dos siembras o reencolados colisionan.
 */
export function dedupeKeyLiberar(instante: Date, zona: string): string {
  return claveConZona(DEDUPE_PREFIX, zona, fechaCalendario(instante, zona));
}

/**
 * R25: proxima corrida = las proximas 00:00 locales ESTRICTAMENTE posteriores a `now` de la zona
 * que antes llega, entre las de los paises con empresas.
 */
export function proximaCorridaLiberar(now: Date, zonas: readonly string[]): { runAfter: Date; zona: string } {
  return proximaCorridaPorZona(now, zonas, HORA_LIBERAR);
}

/** R23/R24 de la 90 + R25 de SLT-42: la proxima ocurrencia, con la zona en la clave. */
export const recurrenciaLiberarReprogramadas: RecurrenciaSpec = {
  siguiente(desde: Date, zonas: readonly string[]) {
    const { runAfter, zona } = proximaCorridaLiberar(desde, zonas);
    return { runAfter, dedupeKey: dedupeKeyLiberar(runAfter, zona) };
  },
  // La clave lleva la fecha de la corrida: 00:00 de esa fecha en su zona.
  corridaOriginal: (job) => corridaOriginalDeLaClave(job, DEDUPE_PREFIX, HORA_LIBERAR),
};

/**
 * R22 de la 90: handler delgado, que corre dentro de la empresa (`conSuEmpresa`). Lee la zona de la
 * empresa (sin zona, `PaisSinZonaHoraria`: falla esa empresa, R28). Si la corrida es de otra zona
 * (que no llega a las 00:00 en ese instante), no hace nada (R25). Si no, libera con «hoy» en la
 * zona de la empresa. Una clave vieja, sin zona, corre para todas (R26). `now` inyectable.
 */
export function crearLiberarReprogramadasHandler(
  service: ILiberacionReprogramadaService,
  now: () => Date = () => new Date(),
  reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
): JobHandler {
  return async (job) => {
    const zona = await zonaDeLaEmpresa(reglasPais, "liberar_reprogramadas");
    const corrida = leerClaveConZona(job.dedupeKey, DEDUPE_PREFIX);
    if (corrida !== null) {
      const instante = instanteDeLaCorrida(corrida.fecha, corrida.zona, HORA_LIBERAR);
      if (!zonaLlegaALaHora(zona, instante, HORA_LIBERAR)) return;
    }
    await service.ejecutarLiberacion(inicioDelDiaComoFecha(now(), zona));
  };
}

/** Construye el `LiberacionReprogramadaService` real con sus repos (patron de la ruta 46). */
export function buildLiberarReprogramadasService(): ILiberacionReprogramadaService {
  const prisma = getPrismaClient();
  return new LiberacionReprogramadaService(
    new LiberacionReprogramadaRepository(prisma),
    new ZonaRepository(prisma),
    new OrdenRepository(prisma),
  );
}
