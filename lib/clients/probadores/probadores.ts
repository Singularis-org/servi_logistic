// SL-36 (design §1, §15) — punto único donde el composition root obtiene los cuatro probadores.
//
// Por qué un punto único: si cada action eligiera por su cuenta entre real y doble, bastaría con
// que una olvidara la condición de producción para que esa ruta aceptase cualquier credencial.
import type { ProbadoresPorServicio } from "@/lib/interfaces/external/IProbadorIntegracion";
import { AsistenteProbador } from "@/lib/clients/probadores/asistente-probador";
import { GoogleMapsProbador } from "@/lib/clients/probadores/google-maps-probador";
import { OptimizacionRutasProbador } from "@/lib/clients/probadores/optimizacion-rutas-probador";
import { crearProbadoresDoble, usarProbadorDoble } from "@/lib/clients/probadores/probador-doble";
import {
  WhatsappProbador,
  type OpcionesProbadorWhatsapp,
} from "@/lib/clients/probadores/whatsapp-probador";

export function crearProbadoresReales(opts: OpcionesProbadorWhatsapp = {}): ProbadoresPorServicio {
  return {
    whatsapp: new WhatsappProbador(opts),
    google_maps: new GoogleMapsProbador(opts),
    optimizacion_rutas: new OptimizacionRutasProbador(opts),
    asistente: new AsistenteProbador(opts),
  };
}

/** El composition root pasa `process.env`; los tests pasan el entorno que quieren probar. */
export function crearProbadores(
  env: { INTEGRACIONES_PROBADOR_DOBLE?: string; VERCEL_ENV?: string },
  opts: OpcionesProbadorWhatsapp = {},
): ProbadoresPorServicio {
  return usarProbadorDoble(env) ? crearProbadoresDoble() : crearProbadoresReales(opts);
}
