// Feature 92 (design §2, R10) — configuracion del proveedor de optimizacion de ruta
// (Google Cloud Route Optimization) y de las guardas de coste de la feature.
//
// CLON ESTRUCTURAL de `lib/config/geocode.ts`: lee `process.env` en CADA llamada y esta funcion
// NUNCA lanza. Es deliberado: el drenador de la cola comparte proceso con `liberar_reprogramadas` y
// `geocodificacion`, y una excepcion al CARGAR la config tumbaria toda la corrida.
//
// ⚠️ LA CLAVE DE API DE GOOGLE MAPS NO SIRVE AQUI. Route Optimization
// (`routeoptimization.googleapis.com`) NO acepta API key: exige una service account y OAuth2. Es un
// override consciente del humano (design §9.A de la 92).
//
// SL-36 (design §7.2, §9.1, R23): la credencial ya NO vive en el entorno. Es la clave JSON de la
// cuenta de servicio de cada empresa, cifrada en su integracion, y la lee
// `lib/services/integraciones/rutas-de-la-empresa.ts` job a job. Los modos ADC y WIF, que usaban
// identidades de la plataforma, se retiraron (§9.2). Aqui solo quedan los parametros de la feature.

/** Lee un entero POSITIVO de `process.env`; ausente/vacio/invalido -> `fallback`. */
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Texto: ausente o cadena vacia -> `null`. NUNCA lanza (R10). */
function readTexto(name: string): string | null {
  const raw = process.env[name];
  return raw !== undefined && raw !== "" ? raw : null;
}

/**
 * Preferencia de enrutado del TRAZADO (`computeRoutes`). No afecta a la optimizacion.
 *
 *   `TRAFFIC_UNAWARE`       — sin trafico. Es el default de Google y el nuestro. SKU basico.
 *   `TRAFFIC_AWARE`         — trafico en vivo. SKU Advanced: mas caro por llamada.
 *   `TRAFFIC_AWARE_OPTIMAL` — mas precision, mas latencia y mas coste todavia.
 *
 * La GEOMETRIA apenas cambia entre los tres; lo que cambia de verdad es `duration`. Por eso
 * el default se queda en `TRAFFIC_UNAWARE`: hoy la linea se dibuja, el ETA no se muestra.
 */
export type RoutingPreference =
  | "TRAFFIC_UNAWARE"
  | "TRAFFIC_AWARE"
  | "TRAFFIC_AWARE_OPTIMAL";

const ROUTING_PREFERENCES: readonly RoutingPreference[] = [
  "TRAFFIC_UNAWARE",
  "TRAFFIC_AWARE",
  "TRAFFIC_AWARE_OPTIMAL",
];

/**
 * Enum de `process.env` con lista blanca. Un valor desconocido —typo incluido— cae al
 * default en vez de viajar a Google y provocar un 400 que apagaria el trazado entero.
 * Cae del lado BARATO a proposito: un typo nunca debe subir de SKU sin que nadie lo pida.
 */
function readRoutingPreference(name: string): RoutingPreference {
  const raw = (readTexto(name) ?? "").toUpperCase();
  return ROUTING_PREFERENCES.find((p) => p === raw) ?? "TRAFFIC_UNAWARE";
}

export interface RouteOptimizationConfig {
  /** Timeout de la llamada HTTP al proveedor en ms. Default 20_000. */
  ROUTE_OPT_TIMEOUT_MS: number;
  /** R16: ventana del debounce de la reoptimizacion tras recoger, en segundos. */
  RUTA_DEBOUNCE_S: number;
  /** R24: antiguedad maxima de una ubicacion `gps` para servir de origen, en minutos. */
  RUTA_ORIGEN_TTL_MIN: number;
  /** R34: intervalo minimo entre dos sincronizaciones manuales facturadas, en segundos. */
  RUTA_SYNC_MIN_INTERVALO_S: number;
  /** R38: tope de paradas enviadas al proveedor en una optimizacion. */
  RUTA_MAX_PARADAS: number;
  /**
   * Feature 265 (R16-R21, design §6.4 y §15) — distancia MAXIMA, en km, entre el origen
   * resuelto y el centroide de las paradas. Por encima, el origen se DESCARTA y se usa el
   * centroide: la llamada facturada deja de ser imposible y el mensajero recibe un orden en
   * vez de un error duro.
   *
   * ═══ 🧭 VALOR PROPUESTO, NO CALIBRADO CON DATOS DE PRODUCCION ═══
   * Fecha: 2026-08-22. Motivo: M1 NO SE PUDO MEDIR —`ruta_optimizada_parada` estaba vacia y
   * habia 0 ordenes en `en_reparto`, asi que no habia centroide contra el que medir ningun
   * origen—. Y el caso de ~1.040 km que inspiro esta guarda resulto ser UNA PRUEBA DEL PROPIO
   * HUMANO, no evidencia de campo: que nadie lo cite despues como una medicion de la
   * operacion real.
   * Lo unico medido que acota el numero: dos paradas legitimas de la MISMA llamada distaban
   * ~58 km, asi que el umbral tiene que quedar comodamente por encima de eso.
   * Se declara sin base documental —igual que la 92 hizo con `RUTA_MAX_PARADAS = 100`— y se
   * revisa con datos reales. Puntero: `specs/265-optimizador-lee-al-proveedor`.
   *
   * ⚠️ ESTE ES EL UNICO SITIO donde vive el numero (R46). Ningun otro modulo de produccion
   * puede repetir el literal; lo vigila `tests/unit/guards/umbral-origen-declarado.guardia.test.ts`.
   */
  RUTA_ORIGEN_MAX_KM: number;
  /**
   * Preferencia de trafico del TRAZADO. Default `TRAFFIC_UNAWARE` (SKU basico): subirlo
   * cuesta dinero por llamada, asi que es una decision explicita, nunca implicita.
   */
  ROUTES_ROUTING_PREFERENCE: RoutingPreference;
  /**
   * SLT-59 (R3, R19, design §2.1) — distancia, en METROS, entre la posicion del mensajero y la
   * linea de su ruta a partir de la cual se considera que se desvio. Con el conjunto de paradas
   * sin cambios, solo un desvio mayor que esto justifica pagar una reoptimizacion: el mensajero
   * que sigue su ruta esta a ~0 de ella por mucho que avance.
   *
   * Decidido por el humano 2026-10-29 (SLT-59, D8); no calibrado con datos de produccion.
   */
  RUTA_REOPT_DISTANCIA_M: number;
  /**
   * SLT-59 (R32, design §4.5) — `max_intentos` de los jobs de reoptimizacion. Fallar aqui no
   * pierde datos (se conserva el ultimo orden valido, 92/R27) y cada intento extra es una
   * llamada facturada, asi que se insiste menos que el default de la cola.
   *
   * Decidido por el humano 2026-10-29 (SLT-59, D9).
   */
  RUTA_OPT_MAX_INTENTOS: number;
}

export function loadRouteOptimizationConfig(): RouteOptimizationConfig {
  return {
    ROUTE_OPT_TIMEOUT_MS: readPositiveInt("ROUTE_OPT_TIMEOUT_MS", 20_000),
    RUTA_DEBOUNCE_S: readPositiveInt("RUTA_DEBOUNCE_S", 60),
    RUTA_ORIGEN_TTL_MIN: readPositiveInt("RUTA_ORIGEN_TTL_MIN", 120),
    RUTA_SYNC_MIN_INTERVALO_S: readPositiveInt("RUTA_SYNC_MIN_INTERVALO_S", 10),
    RUTA_MAX_PARADAS: readPositiveInt("RUTA_MAX_PARADAS", 100),
    // 🧭 200 km: ver la declaracion completa —y por que NO esta calibrado— en el contrato.
    RUTA_ORIGEN_MAX_KM: readPositiveInt("RUTA_ORIGEN_MAX_KM", 200),
    ROUTES_ROUTING_PREFERENCE: readRoutingPreference("ROUTES_ROUTING_PREFERENCE"),
    // SLT-59 D8 y D9: ver la nota de cada campo en el contrato.
    RUTA_REOPT_DISTANCIA_M: readPositiveInt("RUTA_REOPT_DISTANCIA_M", 1000),
    RUTA_OPT_MAX_INTENTOS: readPositiveInt("RUTA_OPT_MAX_INTENTOS", 3),
  };
}
