// SL-36 (design §15) — doble de los cuatro probadores para el E2E.
//
// Por qué existe: el E2E del alta buena no puede depender de credenciales reales en CI ni de red
// hacia Meta, Google y Anthropic. La regla es visible a simple vista en el test: un secreto que
// empieza por `valido-` pasa; cualquier otro, se rechaza.
//
// Nunca se elige en producción: lo impide `usarProbadorDoble`, que exige las dos mitades.
import type {
  CredencialPorServicio,
  DatosPruebaPorServicio,
  ProbadoresPorServicio,
  ResultadoPrueba,
} from "@/lib/interfaces/external/IProbadorIntegracion";
import { leerClaveCuentaServicio } from "@/lib/clients/probadores/optimizacion-rutas-probador";

export const PREFIJO_SECRETO_VALIDO = "valido-";

function esValido(secreto: string): boolean {
  return secreto.startsWith(PREFIJO_SECRETO_VALIDO);
}

/**
 * El doble solo puede elegirse con `INTEGRACIONES_PROBADOR_DOBLE=1` y fuera de producción.
 * Las dos condiciones a la vez: una variable olvidada en Vercel no basta para aceptar cualquier
 * credencial en producción.
 */
export function usarProbadorDoble(env: {
  INTEGRACIONES_PROBADOR_DOBLE?: string;
  VERCEL_ENV?: string;
}): boolean {
  return env.INTEGRACIONES_PROBADOR_DOBLE === "1" && env.VERCEL_ENV !== "production";
}

export function crearProbadoresDoble(): ProbadoresPorServicio {
  return {
    whatsapp: {
      probar: async (
        credencial: CredencialPorServicio["whatsapp"],
        datos: DatosPruebaPorServicio["whatsapp"],
      ): Promise<ResultadoPrueba<"whatsapp">> =>
        esValido(credencial.token_acceso) && esValido(credencial.app_secret)
          ? {
              ok: true,
              datosPublicos: {
                numeroId: datos.numeroId,
                wabaId: datos.wabaId,
                nombreVisible: datos.nombreVisible,
                // Valores de relleno reconocibles: el E2E no tiene un número real que mostrar.
                telefonoVisible: `+${datos.numeroId}`,
                nombreVerificado: datos.nombreVisible,
              },
            }
          : { ok: false, motivo: "credencial_rechazada" },
    },
    google_maps: {
      probar: async (credencial) =>
        esValido(credencial.clave_api)
          ? { ok: true, datosPublicos: {} }
          : { ok: false, motivo: "credencial_rechazada" },
    },
    optimizacion_rutas: {
      // El secreto es un JSON de clave: se exige la misma forma que el probador real y el prefijo
      // va en la clave privada, que es el secreto de verdad dentro del archivo.
      probar: async (credencial) => {
        const clave = leerClaveCuentaServicio(credencial.clave_cuenta_servicio);
        if (clave === null) return { ok: false, motivo: "clave_mal_formada" };
        return esValido(clave.private_key)
          ? {
              ok: true,
              datosPublicos: { proyectoId: clave.project_id, cuentaServicio: clave.client_email },
            }
          : { ok: false, motivo: "credencial_rechazada" };
      },
    },
    asistente: {
      probar: async (credencial) =>
        esValido(credencial.clave_api)
          ? { ok: true, datosPublicos: {} }
          : { ok: false, motivo: "credencial_rechazada" },
    },
  };
}
