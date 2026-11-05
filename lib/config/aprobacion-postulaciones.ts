// Feature 22 — configuracion de la aprobacion de postulaciones. Sobreescribible
// por variable de entorno para no hardcodear cotas de negocio ni TTL
// (docs/architecture.md: "Sin hardcode de contexto"), patron de
// lib/config/ordenes.ts y lib/config/postulacion.ts.

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AprobacionPostulacionesConfig {
  /** TTL en segundos de la URL firmada del bucket privado (R9/P3). Default 300 s. */
  SIGNED_URL_TTL_SECONDS: number;
  /** Tamano de pagina por defecto del listado de pendientes (R10). */
  PAGE_SIZE_DEFAULT: number;
  /** Cota maxima del tamano de pagina, evita consultas sin limite (R10). */
  PAGE_SIZE_MAX: number;
}

export function loadAprobacionPostulacionesConfig(): AprobacionPostulacionesConfig {
  return {
    SIGNED_URL_TTL_SECONDS: readPositiveInt("APROBACION_SIGNED_URL_TTL_SECONDS", 300),
    PAGE_SIZE_DEFAULT: readPositiveInt("APROBACION_PAGE_SIZE_DEFAULT", 20),
    PAGE_SIZE_MAX: readPositiveInt("APROBACION_PAGE_SIZE_MAX", 50),
  };
}

export const aprobacionPostulacionesConfig: AprobacionPostulacionesConfig =
  loadAprobacionPostulacionesConfig();

/**
 * SLT-42 (decision del humano tras la tanda 2, punto 6) — desde que instante una postulacion es
 * «nueva» y se valida con las reglas del pais al aprobarla. Una postulacion creada ANTES
 * (`usuario.created_at` < este instante) se recibio con las reglas de Costa Rica de entonces y se
 * aprueba igual aunque su documento o su telefono no cumplan la regla de hoy.
 *
 * EL VALOR: el instante del nombre de la primera migracion de SLT-42
 * (`db/migrations/20261104140000_slt42_pais_telefono_y_zona`), en UTC.
 *
 * ⚠️ ABIERTO (antes del deploy, con T1.0): tiene que ser IGUAL O POSTERIOR al deploy de SLT-42 en
 * produccion. Un valor anterior al deploy dejaria sin aprobar las postulaciones recibidas entre ese
 * valor y el deploy, que entraron con las reglas viejas. Un valor posterior no rompe nada: desde el
 * deploy, `PostulacionMensajeroService` ya valida cada postulacion al recibirla (T4.2).
 *
 * El UNICO sitio que lo define; lo lee `AprobacionPostulacionService`.
 */
export const POSTULACION_VALIDADA_POR_PAIS_DESDE = new Date("2026-11-04T14:00:00.000Z");
