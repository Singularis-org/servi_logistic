import type { PrismaClient } from "@prisma/client";

import { crearProbadores } from "@/lib/clients/probadores/probadores";
import { leerAnilloDeClaves, pruebasPorMinuto } from "@/lib/config/integraciones";
import { BovedaIntegraciones, FuenteAleatoriaCripto, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import type { IIntegracionesService } from "@/lib/interfaces/services/IIntegracionesService";
import { IntegracionPruebaMinutoRepository } from "@/lib/repositories/IntegracionPruebaMinutoRepository";
import { IntegracionRepository } from "@/lib/repositories/IntegracionRepository";
import { IntegracionesService, type IntegracionesServiceDeps } from "@/lib/services/IntegracionesService";

// SL-36 (design §1, §10, §15) — el composition root de `IntegracionesService`.
//
// Vive fuera de `lib/actions/integraciones.ts` a propósito: en un archivo "use server" toda función
// exportada es un endpoint público, y construir el service no debe poder llamarse desde el navegador.
// Separarlo además deja que un test reciba las dependencias que se pasan de verdad.
//
// `IntegracionesServiceDeps` tiene dos opcionales con defecto (`limitePorMinuto`, `reloj`). El tipo
// de abajo las hace obligatorias menos el reloj: un opcional que nadie pasa es justo el cable suelto
// que deja la suite verde y la pantalla rota («el composition root que no inyecta»). El reloj se
// queda en su defecto (`new Date()`): no hay otro reloj de producción que inyectar.

/** El camino del webhook único de WhatsApp (design §10): el que Meta ya tiene configurado. */
export const RUTA_WEBHOOK_WHATSAPP = "/api/webhooks/whatsapp";

type Entorno = Readonly<Record<string, string | undefined>>;

/** Todas las dependencias del service, sin opcionales salvo el reloj. */
export type DependenciasIntegraciones = Required<Omit<IntegracionesServiceDeps, "reloj">> &
  Pick<IntegracionesServiceDeps, "reloj">;

export interface OpcionesComposicion {
  prisma: PrismaClient;
  /** `process.env` en producción. Se lee en cada operación (R4, R16), no al construir. */
  env: Entorno;
  /** URL absoluta del webhook; la arma la action (depende de la petición si falta la variable). */
  urlWebhook: string;
}

export function dependenciasIntegraciones({ prisma, env, urlWebhook }: OpcionesComposicion): DependenciasIntegraciones {
  return {
    repo: new IntegracionRepository(prisma),
    pruebas: new IntegracionPruebaMinutoRepository(prisma),
    // El único sitio que elige entre probador real y doble (design §15): fuera de él, una ruta que
    // olvidara la condición de producción aceptaría cualquier credencial.
    probadores: crearProbadores(env),
    // Se pasa el lector y no el anillo: rotar la clave activa no exige reiniciar (R4).
    cifrador: new BovedaIntegraciones(() => leerAnilloDeClaves(env)),
    resumen: new ResumenSecretoSha256(),
    aleatoria: new FuenteAleatoriaCripto(),
    urlWebhook,
    limitePorMinuto: () => pruebasPorMinuto(env),
  };
}

export function construirIntegracionesService(opciones: OpcionesComposicion): IIntegracionesService {
  return new IntegracionesService(dependenciasIntegraciones(opciones));
}

/**
 * La URL absoluta del webhook: `base + /api/webhooks/whatsapp`. `base` es `baseUrlDeLaApp()`; si
 * falta, el origen de la petición en curso. Sin ninguno de los dos, la ruta sola: el maestro la ve
 * junto al token y no hay una URL inventada que pegar en Meta.
 */
export function urlWebhookWhatsapp(base: string | null, origenPeticion: string | null): string {
  const raiz = (base ?? origenPeticion ?? "").replace(/\/+$/, "");
  return `${raiz}${RUTA_WEBHOOK_WHATSAPP}`;
}
