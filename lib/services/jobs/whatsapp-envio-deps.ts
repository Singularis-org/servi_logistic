// Ficha 474 (design §8, T8.1) — dependencias REALES de los envios automaticos por WhatsApp, para los
// handlers de la cola y las server actions. UN solo composition root para el motor.
//
// La credencial de Meta se carga PEREZOSAMENTE (dentro de `meta()`): una empresa sin WhatsApp falla
// ESE job con su motivo en `last_error` —y la ejecucion queda `error` «WhatsApp no está configurado
// en tu empresa»—, no el drenado de los demas tipos (patron `whatsapp-bienvenida-handler.ts`).
// Construir esto NO abre conexion ni lee ninguna credencial.
//
// SL-36 (design §9.1, R23): la credencial es la de la empresa en curso. `meta()` corre ya dentro de
// la ejecucion, es decir, en el `conEmpresa` del job (o con la sesion de la action de prueba), y
// ahi la lee `whatsappDeLaEmpresa`. Por eso `buildEnviosWhatsappDeps` sigue siendo sincrono y los
// cinco handlers de envios no cambian.
import type { PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { WhatsappEnvioRepository } from "@/lib/repositories/WhatsappEnvioRepository";
import { WhatsappEjecucionRepository } from "@/lib/repositories/WhatsappEjecucionRepository";
import { PlantillaMensajeRepository } from "@/lib/repositories/PlantillaMensajeRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { SupabaseAlmacenEnviosWhatsapp } from "@/lib/storage/SupabaseAlmacenEnviosWhatsapp";
import { WhatsappCloudClient } from "@/lib/clients/whatsapp-cloud";
import { WhatsappMediaUploadClient } from "@/lib/clients/whatsapp-media-upload";
import { whatsappDeLaEmpresa } from "@/lib/services/whatsapp/whatsapp-de-la-empresa";
import { consoleLogger } from "@/lib/services/whatsapp/chat-logger";
import { EjecucionEnvioService, type MetaEnvios } from "@/lib/services/EjecucionEnvioService";
import { WhatsappEnvioService } from "@/lib/services/WhatsappEnvioService";

export interface EnviosWhatsappDeps {
  prisma: PrismaClient;
  envios: WhatsappEnvioRepository;
  ejecuciones: WhatsappEjecucionRepository;
  cola: JobRepository;
  almacen: SupabaseAlmacenEnviosWhatsapp;
  ejecutor: EjecucionEnvioService;
  configuracion: WhatsappEnvioService;
}

/**
 * Meta real de la empresa en curso, construida al PRIMER uso de cada ejecucion. Lanza
 * `WhatsappNoConfiguradoError` si la empresa no tiene WhatsApp (R24), sin red.
 */
export async function metaReal(): Promise<MetaEnvios> {
  const { config, fetchImpl } = await whatsappDeLaEmpresa();
  return {
    enviador: new WhatsappCloudClient({ config, logger: consoleLogger, fetchImpl }),
    subidor: new WhatsappMediaUploadClient({ config, fetchImpl }),
    idioma: config.templateIdioma,
  };
}

export function buildEnviosWhatsappDeps(now: () => Date = () => new Date()): EnviosWhatsappDeps {
  const prisma = getPrismaClient();
  const envios = new WhatsappEnvioRepository(prisma);
  const ejecuciones = new WhatsappEjecucionRepository(prisma);
  const plantillas = new PlantillaMensajeRepository(prisma);
  const cola = new JobRepository(prisma);
  const almacen = new SupabaseAlmacenEnviosWhatsapp();
  const ejecutor = new EjecucionEnvioService({ envios, ejecuciones, plantillas, almacen, cola, meta: metaReal, now });
  const configuracion = new WhatsappEnvioService({ envios, ejecuciones, plantillas, cola, now });
  return { prisma, envios, ejecuciones, cola, almacen, ejecutor, configuracion };
}
