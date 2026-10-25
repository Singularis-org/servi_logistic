// SL-36 (design §5, R17) — contrato de la prueba de solo lectura de cada integración.
//
// Por qué los tipos de servicio viven aquí y no en `lib/types/integraciones.ts`: el catálogo
// (T5.5) todavía no existe cuando nacen los probadores. Esto es lo MÍNIMO que el probador
// necesita; cuando llegue el catálogo, este archivo puede importar de allí sin cambiar la forma.
//
// Por qué el resultado nunca lleva texto del proveedor: la pantalla muestra el texto propio del
// catálogo para `prueba_fallida.<servicio>.<motivo>` (R13, D3). El detalle técnico (HTTP, código
// de Graph) lo escribe el probador en el log, sin la credencial ni la URL.

export type ServicioIntegracion = "whatsapp" | "google_maps" | "optimizacion_rutas" | "asistente";

/** Secretos por servicio, con el nombre de campo con que se cifran (design §8). */
export interface CredencialPorServicio {
  whatsapp: { token_acceso: string; app_secret: string };
  google_maps: { clave_api: string };
  optimizacion_rutas: { clave_cuenta_servicio: string };
  asistente: { clave_api: string };
}

/** Lo que la prueba necesita además del secreto: lo que el maestro escribe en claro. */
export interface DatosPruebaPorServicio {
  whatsapp: { numeroId: string; wabaId: string; nombreVisible: string };
  google_maps: Record<string, never>;
  optimizacion_rutas: Record<string, never>;
  asistente: Record<string, never>;
}

/** Datos públicos tras una prueba buena: los que devuelve el proveedor se suman a la entrada. */
export interface DatosPublicosPorServicio {
  whatsapp: {
    numeroId: string;
    wabaId: string;
    nombreVisible: string;
    telefonoVisible: string;
    nombreVerificado: string;
  };
  google_maps: Record<string, never>;
  optimizacion_rutas: { proyectoId: string; cuentaServicio: string };
  asistente: Record<string, never>;
}

/**
 * Motivos compartidos. `sin_respuesta` junta red y timeout porque para el maestro son lo mismo
 * («no contestó, vuelve a intentar»); el log sí los distingue.
 */
export type MotivoPruebaComun =
  | "credencial_rechazada"
  | "sin_respuesta"
  | "proveedor"
  | "respuesta_invalida";

export interface MotivoPruebaPorServicio {
  whatsapp: MotivoPruebaComun | "sin_permiso" | "numero_no_encontrado" | "waba_no_encontrada";
  google_maps: MotivoPruebaComun;
  optimizacion_rutas: MotivoPruebaComun | "clave_mal_formada";
  asistente: MotivoPruebaComun;
}

export type ResultadoPrueba<S extends ServicioIntegracion> =
  | { ok: true; datosPublicos: DatosPublicosPorServicio[S] }
  | { ok: false; motivo: MotivoPruebaPorServicio[S] };

export interface IProbadorIntegracion<S extends ServicioIntegracion> {
  /** Nunca lanza: red, timeout o proveedor caído son un `{ ok: false }` (QC inv. 18). */
  probar(
    credencial: CredencialPorServicio[S],
    datos: DatosPruebaPorServicio[S],
  ): Promise<ResultadoPrueba<S>>;
}

export type ProbadoresPorServicio = { [S in ServicioIntegracion]: IProbadorIntegracion<S> };
