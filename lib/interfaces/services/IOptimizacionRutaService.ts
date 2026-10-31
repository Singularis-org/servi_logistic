// Feature 92 (design §5) — contrato del servicio de optimizacion de ruta.
import type { SecuenciaFuente } from "@/lib/interfaces/external/IRouteOptimizationClient";

/**
 * Motivo del disparo. Solo `manual` esta sujeto al intervalo minimo de R34.
 *
 * SLT-59 (R62, R63, design §12.6): `salida` = la pantalla de reparto vio al mensajero alejarse
 * del punto de recogida con la primera ruta del dia pendiente. Es automatico para el desvio
 * (R51), pero lleva su propia guarda en `ejecutar` (R63).
 */
export type MotivoOptimizacion = "debounce" | "inmediato" | "manual" | "salida";

export interface EjecutarOptimizacionOpts {
  motivo: MotivoOptimizacion;
  /**
   * R20 — `createdAt` del job que dispara esta ejecucion. Si es ANTERIOR al
   * `calculada_at` de la ruta vigente, el trabajo de este job YA lo hizo una optimizacion
   * posterior: se completa sin llamar (ni pagar) al proveedor. Ausente en el disparo
   * manual, que por definicion no viene de la cola.
   */
  jobCreatedAt?: Date;
  /** R22/R23: ubicacion del navegador. Se persiste como origen `gps` si viene. */
  ubicacion?: { lat: number; lng: number };
}

/**
 * Desenlace de una ejecucion. `omitida` cubre TODAS las guardas de coste (R20, R34, R36) y
 * el caso trivial de R35: el job se completa con exito SIN haber llamado al proveedor.
 * Un fallo del proveedor NO aparece aqui: se propaga como excepcion para que la cola
 * aplique su backoff (R27).
 */
/**
 * De donde salio el dibujo de la ruta. NO es un detalle interno: cambia lo que la linea
 * SIGNIFICA, y la UI debe distinguirlas (p.ej. punteada para `local`).
 *
 *   `routes` — geometria real por calles, devuelta por Google Routes.
 *   `local`  — segmentos RECTOS entre paradas, calculados aqui sin red ni coste. Cruzan
 *              manzanas y sentidos prohibidos: valen para ver el recorrido, no para navegar.
 */
export type TrazadoFuente = "routes" | "local";

/**
 * Trazado de la ruta. OPCIONAL: una optimizacion correcta sin trazado sigue siendo `ok` —
 * el orden es lo esencial y el dibujo es accesorio.
 */
export interface TrazadoRuta {
  /** Polilinea codificada de Google, lista para pintar en un mapa. */
  encodedPolyline: string;
  /** Metros. Con `fuente: "local"` es la suma de rectas: una COTA INFERIOR de la real. */
  distanciaM: number | null;
  /** Segundos. Siempre `null` con `fuente: "local"`: sin calles no hay tiempo que estimar. */
  duracionS: number | null;
  fuente: TrazadoFuente;
  /**
   * El recorrido partido en TRAMOS, uno por parada y en orden de visita: el `i` va del punto
   * `i` al `i+1`, empezando en el origen. Permite resaltar el trayecto a la siguiente parada
   * sin pedirle nada mas al proveedor — vienen en la misma respuesta ya pagada.
   *
   * Vacio con `fuente: "local"`: el trazado local es una sola recta continua entre todos los
   * puntos y partirlo daria tramos que no describen ningun recorrido real.
   */
  tramos: TrazadoTramo[];
}

/** Un tramo del recorrido: lo que hay entre dos puntos consecutivos. */
export interface TrazadoTramo {
  encodedPolyline: string;
  distanciaM: number | null;
  duracionS: number | null;
}

export type EjecutarOptimizacionResult =
  | {
      status: "ok";
      paradas: number;
      /**
       * Feature 265 (R35, design §13.4) — QUIEN ordeno esta secuencia. Sube hasta el toast de
       * la sincronizacion manual: un orden aproximado presentado como optimo es la clase de
       * mentira silenciosa que esta casa persigue.
       */
      secuenciaFuente: SecuenciaFuente;
      trazado?: TrazadoRuta;
    }
  | {
      status: "omitida";
      /**
       * SLT-59 (design §2.2): `reducida` = una gestion solo QUITO paradas y se persistio la
       * secuencia previa sin ellas, sin `optimizeTours`. No hubo ordenacion, por eso `omitida`.
       *
       * SLT-59 (R49): `reduccion_descartada` = tocaba reducir pero la escritura condicionada no
       * se aplico (la huella cambio o la ruta dejo de estar `vigente`, R48). Es un desenlace
       * distinto de `reducida` para que nadie informe de una reduccion que no se escribio; no
       * trae trazado y no lanza, porque otra ejecucion ya dejo la ruta en un estado mas nuevo.
       */
      /**
       * SLT-59 revision 4 (design §12.7):
       *   `enfriamiento`     R53: manual sobre una ruta `desactualizada` antes de
       *                      `RUTA_RECUPERACION_ENFRIAMIENTO_MIN`; trae el trazado en cache.
       *   `salida_no_aplica` R63: el disparo de salida no cumple alguna condicion.
       */
      razon:
        | "obsoleta"
        | "intervalo_minimo"
        | "sin_paradas"
        | "sin_cambios"
        | "reducida"
        | "reduccion_descartada"
        | "enfriamiento"
        | "salida_no_aplica";
      /**
       * R35 con UNA parada: no hubo nada que ORDENAR —por eso `omitida`— pero si hay algo
       * que DIBUJAR, la linea del origen a esa unica parada. Las demas razones nunca lo
       * traen: o no se recalculo nada nuevo, o no hay parada alguna.
       */
      trazado?: TrazadoRuta;
    }
  | {
      status: "omitida";
      /**
       * SLT-59 (R64, design §12.5): el boton con la primera ruta del dia pendiente y menos del
       * `RUTA_PRIMERA_MIN_RECOGIDO_PCT` % recogido. Lleva los conteos para que la accion pueda
       * decirle al mensajero cuanto lleva.
       */
      razon: "recogida_insuficiente";
      recogidas: number;
      asignadas: number;
      trazado?: undefined;
    };

/**
 * Desenlace del trayecto EN VIVO (ubicacion actual -> una parada concreta).
 *
 *   `no_autorizada`   — esa orden no es una parada en reparto de este mensajero. Se devuelve
 *                       el MISMO valor que si no existiera: distinguirlos convertiria la
 *                       action en un oraculo para saber si una guia ajena esta en reparto.
 *   `intervalo_minimo`— se pidio demasiado pronto. CERO llamadas.
 *   `no_disponible`   — sin cliente de trazado, o el proveedor no dio geometria.
 */
export type TrazarTramoVivoResult =
  | { status: "ok"; encodedPolyline: string; distanciaM: number | null; duracionS: number | null }
  | { status: "no_autorizada" }
  | { status: "intervalo_minimo" }
  | { status: "no_disponible" };

export interface IOptimizacionRutaService {
  ejecutar(
    mensajeroId: string,
    opts: EjecutarOptimizacionOpts,
  ): Promise<EjecutarOptimizacionResult>;

  /**
   * Trayecto por calles desde donde el mensajero ESTA hasta una parada concreta.
   *
   * Es lo unico de esta feature que NO se puede cachear: en cuanto se mueve, el resultado
   * anterior deja de empezar donde el esta. Cada llamada se FACTURA, y por eso lleva su propia
   * guarda de intervalo minimo persistida (`tramoVivoAt`) — el cerrojo del cliente no cuenta,
   * porque una Server Action se puede invocar en bucle sin pasar por el boton.
   *
   * NO toca la ruta optimizada: ni la secuencia, ni el origen, ni el trazado guardado. Es una
   * consulta de apoyo, no un recalculo.
   */
  trazarTramoVivo(
    mensajeroId: string,
    input: { ubicacion: { lat: number; lng: number }; ordenId: string },
  ): Promise<TrazarTramoVivoResult>;

  /**
   * SLT-59 (R27, design §3.2) — aplica la reduccion de la secuencia SOLO si no cuesta ninguna
   * llamada facturada (R13 o R15). En cualquier otro caso no hace nada: el job encolado por la
   * gestion se encarga. Puede lanzar si falla la base; quien llama lo trata como best-effort (R28).
   *
   * [2026-10-30, SLT-59, D16] R27 se lee R44: solo reduce un prefijo (entrega en orden). Fuera
   * de orden no hace nada y el job recalcula el conjunto completo (R42).
   */
  reducirSinLlamadas(mensajeroId: string): Promise<void>;
}
