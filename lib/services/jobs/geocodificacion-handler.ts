// Feature 91 (design §7, R32) — handler DELGADO del job `geocodificacion` y su fabrica de
// dependencias reales. Espejo de `liberar-reprogramadas-handler.ts`.
//
// Este tipo de job NO es recurrente: no se registra en `buildRecurrencias()`. Se encola
// por EVENTO (creacion o correccion de la direccion de una orden), no por reloj.
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler } from "@/lib/interfaces/services/IJobQueueService";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";
import {
  GeocodificacionService,
  type FabricaClienteGeocode,
  type GeocodeLogger,
} from "@/lib/services/GeocodificacionService";
import { GoogleGeocodeClient } from "@/lib/clients/google-geocode";
import { OrdenGeocodeRepository } from "@/lib/repositories/OrdenGeocodeRepository";
import { GeocodeCacheRepository } from "@/lib/repositories/GeocodeCacheRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { loadGeocodeConfig } from "@/lib/config/geocode";
import { credencialesIntegracionReales } from "@/lib/services/integraciones/credencial-de-la-empresa";
// FICHA 401 (T13, R12) — EL COMPOSITION ROOT DEL AVISO. Estos cuatro imports no cablean nada por
// si solos: lo que cumple el requisito son las lineas de `buildGeocodificacionService` que los
// PASAN. Ver el aviso ⚠️ de ahi abajo.
import { GeocodeSaludService } from "@/lib/services/GeocodeSaludService";
import { GeocodeSaludRepository } from "@/lib/repositories/GeocodeSaludRepository";
import { loadGeocodeSaludConfig } from "@/lib/config/geocode-salud";
import { notificarGeocodificacionCaidaReal } from "@/lib/notificaciones/notificadores";

/**
 * FICHA 401 (m-6 de la revision, R11/R20) — EL LOGGER **REAL** DE ESTE CRON.
 *
 * ⚠️ NACE DE UN FALLO MUDO MEDIDO, no de la simetria. R20 promete que un fallo de la recuperacion
 * «queda registrado con contexto», y hasta esta linea NO ERA CIERTO EN PRODUCCION: los dos services
 * declaran su logger con default `{ warn: () => {} }` —convencion de la 91, para que ninguna suite
 * escupa por consola— y este composition root les pasaba `undefined`, o sea el no-op. Consecuencia:
 * si `contarFallosConfigDesde` o `revivirFallosConfig` reventaban, en produccion NO QUEDABA NI UNA
 * LINEA, y los tests seguian verdes porque ellos SI inyectan un logger y afirman sobre el.
 *
 * `console.warn` es el mismo canal que ya usan los defaults reales de `JobQueueService`,
 * `CorteDiarioService`, `AnaliticaRollupService` y `DevolucionSlaService`: en Vercel va al log de la
 * funcion, que es donde se diagnostica un cron.
 *
 * VIVE AQUI Y NO DENTRO DE LOS SERVICES a proposito: `GeocodificacionService` tiene una guardia que
 * le prohibe usar `console.*` (feature 91, R31), y esta bien que la siga teniendo. El canal se elige
 * en el composition root; el service solo recibe una interfaz.
 *
 * NUNCA RECIBE PII NI SECRETOS: los dos services solo le pasan mensajes AGREGADOS (R26), y hay tests
 * que lo afirman sobre cada linea emitida.
 */
export const geocodeLoggerReal: GeocodeLogger = { warn: (mensaje) => console.warn(mensaje) };

/** R32: adapta `GeocodificacionService.ejecutar` a la firma `JobHandler`. */
export function crearGeocodificacionHandler(service: GeocodificacionService): JobHandler {
  return async (job: JobDTO) => {
    await service.ejecutar(job);
  };
}

/** Lo que el composition root deja cambiar a un test: de donde sale la credencial y el `fetch`. */
export interface GeocodificacionDeps {
  credenciales?: ICredencialesIntegracion;
  fetchImpl?: typeof fetch;
}

/**
 * Construye el service real con sus repos y el cliente HTTP (patron
 * `buildLiberarReprogramadasService`).
 *
 * SL-36 (design §9.1, R23, R28): aqui NO se lee ninguna clave. Se construye una sola vez por
 * corrida del drenador, que sirve jobs de varias empresas; por eso el service recibe el lector de
 * credenciales y una FABRICA del cliente, y arma el cliente job a job con la clave de la empresa del
 * job. Un cliente armado aqui le prestaria la clave de una empresa a las demas. Construir esto NUNCA
 * lanza por falta de credencial: el service corta antes de la red con `GeocodeNoConfiguradoError`
 * (R25), asi que una empresa sin Google Maps no tumba el drenado de la cola.
 */
export function buildGeocodificacionService(
  now: () => Date = () => new Date(),
  deps: GeocodificacionDeps = {},
) {
  const prisma = getPrismaClient();
  const config = loadGeocodeConfig();
  const crearCliente: FabricaClienteGeocode = (claveApi) =>
    new GoogleGeocodeClient({
      apiKey: claveApi,
      timeoutMs: config.GEOCODE_TIMEOUT_MS,
      fetchImpl: deps.fetchImpl,
    });
  // FICHA 401 (T13, R12) — SALUD DE LA GEOCODIFICACION: reconoce la caida por configuracion
  // NUESTRA, avisa al `maestro` y a los `admin`, y devuelve a la cola los jobs que murieron por
  // esa causa. Se construye AQUI porque este es el unico sitio del arbol donde el service de
  // geocodificacion se arma para produccion.
  const salud = new GeocodeSaludService(
    new GeocodeSaludRepository(prisma),
    loadGeocodeSaludConfig(),
    // ⚠️ ESTA LINEA ES EL REQUISITO, NO EL `import` DE ARRIBA. Medido en este repo el 2026-08-23:
    // de SIETE notificadores reales, DOS estaban MUERTOS —`buildService()` pasaba cinco argumentos
    // y el notificador era el septimo— y la suite entera seguia verde. Que un notificador se
    // importe NO prueba que alguien lo PASE. Si esta linea desaparece, el service se queda con su
    // default no-op y el aviso no se emite JAMAS en produccion: lo vigilan la guardia por SITIO y
    // la guardia derivada de `tests/unit/services/notificacion-notificadores-reales.test.ts`.
    notificarGeocodificacionCaidaReal,
    // ⚠️ Y ESTE LOGGER TAMBIEN ES EL REQUISITO (R20, m-6): con `undefined` aqui, un fallo de la
    // recuperacion no dejaba ni una linea en produccion.
    geocodeLoggerReal,
    now,
  );
  return new GeocodificacionService(
    new OrdenGeocodeRepository(prisma),
    new GeocodeCacheRepository(prisma),
    // ⚠️ ESTAS DOS LINEAS SON R23: sin ellas no hay de donde sacar la clave de la empresa del job.
    deps.credenciales ?? credencialesIntegracionReales(),
    crearCliente,
    now,
    // El MISMO logger real (m-6): es quien registra el fallo best-effort de las tres llamadas a la
    // salud, y sin el ese `catch` con contexto no se ve en ningun sitio.
    geocodeLoggerReal,
    // ⚠️ Y ESTA OTRA: sin ella, `GeocodificacionService` usa `geocodeSaludNoOp` y toda la ficha 401
    // queda inerte —ni avisa ni recupera— con la suite en verde.
    salud,
  );
}
