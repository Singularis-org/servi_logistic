// Feature 91 (design §2) — configuracion del proveedor de geocodificacion. Clon estructural de
// `lib/config/cron.ts`: esta funcion NUNCA lanza. Es deliberado: el drenado de la cola comparte
// proceso con `liberar_reprogramadas`, y una excepcion al CARGAR la config tumbaria toda la corrida.
//
// SL-36 (design §9.1, R23): la clave de Google Maps ya NO vive aqui. Es de cada empresa, se guarda
// cifrada en su integracion y la lee `GeocodificacionService` job a job, dentro del contexto de la
// empresa del job. En el entorno solo queda lo que no es credencial.

/** Lee un entero POSITIVO de `process.env`; ausente/vacio/invalido -> `fallback`. */
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface GeocodeConfig {
  /** Timeout de la llamada HTTP al proveedor en ms. Default 10_000. */
  GEOCODE_TIMEOUT_MS: number;
}

export function loadGeocodeConfig(): GeocodeConfig {
  return {
    GEOCODE_TIMEOUT_MS: readPositiveInt("GEOCODE_TIMEOUT_MS", 10_000),
  };
}
