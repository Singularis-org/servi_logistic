// Feature 92 (design §5) — servicio que recalcula la ruta de UN mensajero. DI por
// INTERFACES (docs/architecture.md §Service): no conoce Next.js, ni Prisma, ni `fetch`.
//
// PRIVACIDAD (R14): las coordenadas de entrega son DATO PERSONAL — identifican el
// domicilio del destinatario, y la ubicacion del mensajero es dato de una persona
// trabajando. Este archivo NUNCA emite coordenadas, direccion ni credencial por el logger
// ni por un mensaje de error, y no usa `console.*`.
//
// ═══ LAS CINCO GUARDAS DE COSTE SON LO IMPORTANTE DE ESTE ARCHIVO ═══
// (decia «CUATRO» y siempre listo CINCO; corregido con el cierre de menores de la 265)
// Cada llamada a `optimizeTours` se FACTURA. El orden de los pasos esta elegido para que
// las guardas mas baratas corten antes que las caras:
//
//   R20  job obsoleto (una optimizacion posterior ya cubrio este evento) -> 0 llamadas
//   R34  dos pulsaciones del boton dentro del intervalo minimo           -> 0 llamadas
//   R35  0 o 1 parada con coordenadas                                    -> 0 llamadas
//        (con 1 parada SI se pide el trazado, que es otro SKU; ver la rama)
//   R38  mas de RUTA_MAX_PARADAS -> se recorta, no se paga por el exceso
//   ★    265/R16: origen incoherente con las paradas -> se SUSTITUYE por el centroide
//        No corta la llamada: la ARREGLA. Con el origen a mil kilometros del racimo de
//        paradas el modelo es irresoluble y lo unico seguro de esa llamada es que se paga.
//        Va ANTES de la huella (265/R20) porque la huella debe describir el origen que
//        REALMENTE se envia; si no, la guarda de «sin cambios» cortaria por lo que no fue.
//   R36  mismo conjunto de paradas y mismo origen que la ultima vez      -> 0 llamadas
//
// [2026-10-29, SLT-59, D1/D6/D8] R36 cambia de criterio por decision del humano (SLT-59
// design §10): «sin cambios» = mismo CONJUNTO de paradas y el mensajero a no mas de
// `RUTA_REOPT_DISTANCIA_M` de la ruta dada, sin criterio de tiempo. Justo detras va la
// reduccion (SLT-59 R11): si la gestion solo QUITO paradas se reutiliza el orden previo sin
// `optimizeTours`. Ambas viven en `decidirGuardaRuta`. El orden de las guardas no cambia (R8).
//
// [2026-10-30, SLT-59, D16] R11 queda retirado: la reduccion solo vale si lo quitado es un
// PREFIJO de la secuencia (entrega en orden, R41). Cualquier entrega fuera de orden —incluido
// quitar la ultima— recalcula el conjunto completo como el boton (R42, R43). Ya no hay tramo
// puente (R14 retirado): una reduccion nunca llama a nadie.
//
// [2026-10-31, SLT-59, D21-D25] Detras de R34 van dos guardas nuevas, antes de leer paradas:
// la de la salida (R63) y la del boton con la primera ruta pendiente (R64). La decision de
// `decidirGuardaRuta` gana la primera ruta del dia (R59), el desvio solo a mano (R51, R52) y el
// enfriamiento de la recuperacion manual (R53).
//
// [2026-10-29, SLT-59, D8] Limite declarado 2 de la 265 («la huella congela el orden local
// hasta que cambie el conjunto o el origen; la posicion cambia constantemente, asi que se cura
// sola»): ya no se cura con el movimiento normal, solo con un cambio de conjunto o un desvio
// de mas de `RUTA_REOPT_DISTANCIA_M`.
//
// ⚠️ ESTE ORDEN YA NO VIVE SOLO EN ESTE COMENTARIO. 265/R33 exige que las guardas corten
// «exactamente igual Y EN EL MISMO ORDEN», y hasta el cierre de menores de la 265 lo unico
// que lo sostenia era este parrafo — un comentario no se pone rojo. Lo fija ahora
// `tests/unit/services/optimizacion-ruta-service.test.ts`, describe «265/R33 — las guardas
// cortan EN ESTE ORDEN»: monta casos donde DOS guardas cortarian a la vez y afirma cual gana.
// Si reordenas algo de esta lista, ese describe te lo dice; los tests de cada guarda por
// separado, NO (medido: reordenar R20 y R34 mata 1 test de 40).
//
// ═══ ANTE FALLO DEL PROVEEDOR SE CONSERVA EL ULTIMO ORDEN VALIDO (R27) ═══
// Decision explicita del humano. NUNCA se borra la secuencia previa y NUNCA se cae en
// silencio a `createdAt desc`: la ruta se marca `desactualizada` (lo que alimenta el aviso
// de la UI) y se LANZA para que la cola aplique su backoff.
import { createHash } from "node:crypto";
import type {
  IRouteOptimizationClient,
  OptimizarOutcome,
} from "@/lib/interfaces/external/IRouteOptimizationClient";
import type {
  IRutaOptimizadaRepository,
  OrigenFuente,
  RutaOptimizadaDTO,
  TramoPersistido,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import type {
  EjecutarOptimizacionOpts,
  EjecutarOptimizacionResult,
  IOptimizacionRutaService,
  TrazadoRuta,
  TrazadoTramo,
  TrazarTramoVivoResult,
} from "@/lib/interfaces/services/IOptimizacionRutaService";
import {
  codificarPolilinea,
  decodificarPolilinea,
  distanciaHaversineKm,
  distanciaMinimaAPolilineaM,
  distanciaTotalM,
} from "@/lib/geo/polilinea";
import { optlog, opterror } from "@/lib/logging/optimizer-log";
import type { IRoutesClient } from "@/lib/interfaces/external/IRoutesClient";
import type { MotivoOptimizacion } from "@/lib/interfaces/services/IOptimizacionRutaService";
import {
  FUERA_DE_COLA,
  type ContextoLlamadaRuta,
  type MotivoLlamadaRuta,
} from "@/lib/clients/registro-llamada-google";
import {
  dedupeKeyPrimeraRecogida,
  primeraRutaPendiente as primeraRutaPendienteDelDia,
  type OrigenJobRuta,
} from "@/lib/services/jobs/optimizacion-ruta-encolado";
import type { ILectorJobPendiente } from "@/lib/interfaces/repositories/IJobRepository";
import { fechaCalendarioCR, inicioDelDiaCREnUtc, startOfDayCR } from "@/lib/utils/fecha-cr";

/** Fuente de las paradas. `Pick` para que los dobles de test no implementen 40 metodos. */
export interface ParadasRepo {
  findParadasEnReparto(mensajeroId: string): Promise<ParadaRutaRow[]>;
  /**
   * SLT-59 (R64, R67, design §12.5) — asignadas y recogidas del dia en curso. `dia` va en la
   * convencion `@db.Date` (`startOfDayCR`), la de `fecha_reparto`. Solo la lee el boton con la
   * primera ruta pendiente: una lectura, y solo en ese caso.
   */
  contarAsignadasDelDia(
    mensajeroId: string,
    dia: Date,
  ): Promise<{ asignadas: number; recogidas: number }>;
}

/** Logger inyectable, patron `GeocodeLogger` de la 91. NUNCA recibe PII ni secretos. */
export interface RutaLogger {
  warn(message: string): void;
}
/**
 * ⚠️ ESTE `warn` NO LLEGA A NADIE EN PRODUCCION, Y ESTA ASI A PROPOSITO.
 *
 * Es un no-op, y la UNICA construccion real del servicio (`buildOptimizacionRutaService`,
 * `lib/services/jobs/optimizacion-ruta-handler.ts`) pasa `undefined` en esta posicion, asi que
 * los avisos AGREGADOS de 265/R19 y R30 —«paradas recortadas al tope», «origen descartado por
 * incoherencia geografica»— se emiten contra este objeto vacio. LIMITE DECLARADO 5 de la ficha
 * 265 (`design.md` §14.3), cerrado asi por la puerta humana P8: la operacion se entera de que
 * una ruta se ordeno en local consultando `ruta_optimizada.secuencia_fuente`, que es un dato
 * persistido, no un log que expira. Su hermano vive en `lib/clients/fallback-route-optimization.ts`,
 * con la misma nota.
 *
 * ⚠️ Consecuencia practica, para que nadie la descubra tarde: **no cuelgues nada de estos
 * `warn`**. Escribirlos no es avisar, y leer el codigo puede dar la impresion contraria — que
 * es justo por lo que la revision de la 265 lo anoto (menor **m11**). Si algun dia hacen falta
 * de verdad, se inyecta un logger real en `buildOptimizacionRutaService`; el hueco ya esta
 * abierto en el constructor y no hace falta tocar el servicio.
 */
const defaultLogger: RutaLogger = { warn: () => {} };

/** El proveedor fallo (transitorio o config invalida). La cola aplica su backoff. */
export class RutaIntentoFallidoError extends Error {
  constructor(detalle: string) {
    super(detalle);
    this.name = "RutaIntentoFallidoError";
  }
}

/**
 * SLT-59 (design §4; R29-R31, R35) — el proveedor rechazo la credencial (401/403). Es SUBCLASE a
 * proposito: todo borde que hoy atrapa `RutaIntentoFallidoError` (la sincronizacion manual) la
 * sigue tratando igual (R31), y solo el handler del job la distingue para no reintentarla (R29).
 * El mensaje es el `detalle` ya saneado del cliente: operacion y estado HTTP, nada mas (R35).
 */
export class RutaCredencialRechazadaError extends RutaIntentoFallidoError {
  constructor(detalle: string) {
    super(detalle);
    this.name = "RutaCredencialRechazadaError";
  }
}

/**
 * Feature 265 (R24, R32, design §7) — errores NUESTROS cuyos mensajes ya estan saneados POR
 * CONTRATO: citan la operacion y el estado, nunca el token, la URL ni una coordenada.
 *
 * ⚠️ SE COMPARA POR `name` Y NO CON `instanceof` A PROPOSITO. Un `instanceof` obligaria a este
 * servicio a importar `lib/clients/google-route-optimization`, es decir a conocer el proveedor
 * concreto — que es justo lo que `IRouteOptimizationClient` aisla (docs/architecture.md §2).
 * Cada una de estas clases fija su `this.name` explicitamente.
 */
const ERRORES_SANEADOS: readonly string[] = [
  "RutaRespuestaInvalidaError",
  "RutaPeticionRechazadaError",
  "RutaNoConfiguradoError",
  "RutaTokenError",
];

/** Motivo de una excepcion del cliente, SIN filtrar nada (R32). */
const MOTIVO_EXCEPCION_GENERICO = "optimizar ruta: el proveedor no respondio correctamente";

export function motivoDeExcepcion(error: unknown): string {
  // Ante un error de LIBRERIA se usa texto fijo: `error.message` de `fetch` o de otra libreria
  // de red puede traer la peticion completa colgada, y ahi es donde viven las cabeceras con el
  // Bearer. Es la misma trampa que `opterror` ya documenta.
  if (!(error instanceof Error) || !ERRORES_SANEADOS.includes(error.name)) {
    return MOTIVO_EXCEPCION_GENERICO;
  }
  return error.message;
}

/**
 * Redondeo del origen para la huella de R36. 4 decimales ≈ 11 m: mas fino haria que el
 * jitter del GPS parado en un semaforo invalidara la huella y disparara una llamada
 * facturada por cada lectura. Mas grueso perderia cambios de calle reales.
 *
 * [2026-10-29, SLT-59, D8] Este redondeo ya no decide si se paga: la guarda de «sin cambios»
 * mira el conjunto y el desvio (`decidirGuardaRuta`). Sigue entrando en la huella, que ahora
 * solo condiciona las escrituras (`guardarTrazado`, `reducirSecuencia`).
 */
const ORIGEN_DECIMALES = 4;

/**
 * Centroide aritmetico de las paradas. UNA sola aritmetica para los DOS consumidores —el
 * escalon 3 de `resolverOrigen` y la guarda de coherencia de la 265—: dos cuentas del mismo
 * punto es exactamente el genero de divergencia que este repo ya ha pagado antes.
 *
 * ⚠️ Con `paradas` vacio devuelve NaN. Es correcto que reviente ahi y no que invente un
 * punto: la guarda R35 (0 o 1 parada) corta antes de que se pueda llamar sin paradas.
 */
function centroide(paradas: { latitud: number; longitud: number }[]): { lat: number; lng: number } {
  return {
    lat: paradas.reduce((s, p) => s + p.latitud, 0) / paradas.length,
    lng: paradas.reduce((s, p) => s + p.longitud, 0) / paradas.length,
  };
}

/** Parada con coordenadas, tal como llega a las guardas (ya filtrada por R37 de la 92). */
type ParadaConCoordenadas = { ordenId: string; latitud: number; longitud: number };

/**
 * Las cuatro columnas de origen, que es todo lo que leen `resolverOrigen` y
 * `origenSoloDeUltimaConocida`. SLT-59 (R46, design §2.4): existe para poder resolver el origen
 * con la ubicacion recibida aunque no haya fila todavia, sin escribirla antes de saber si se
 * va a recalcular.
 */
type OrigenGuardado = Pick<
  RutaOptimizadaDTO,
  "origenLat" | "origenLng" | "origenAt" | "origenFuente"
>;

/**
 * SLT-59 (R1-R20, design §2) — que hacer con un conjunto de paradas frente a la ruta guardada.
 * `reducir.restantes` es la secuencia previa filtrada al conjunto actual, en su orden.
 */
export type DecisionGuardaRuta =
  | {
      tipo: "reoptimizar";
      motivo:
        | "sin_ruta"
        | "primera_del_dia"
        | "desactualizada"
        | "recuperacion"
        | "paradas_nuevas"
        | "fuera_de_orden"
        | "desviado";
    }
  | { tipo: "omitir" }
  // SLT-59 (R53): manual sobre una ruta `desactualizada` antes del enfriamiento.
  | { tipo: "omitir"; motivo: "enfriamiento" }
  | { tipo: "reducir"; previa: string[]; restantes: string[] };

/**
 * SLT-59 (design §12.1) — quien dispara la ejecucion. Solo el boton (`manual`) mide el desvio
 * (R51, R52); `salida` no lo mide y tiene su propia guarda en `ejecutar` (R63).
 */
export type DisparoRuta = "manual" | "automatico" | "salida";

export function disparoDe(motivo: MotivoOptimizacion): DisparoRuta {
  if (motivo === "manual") return "manual";
  if (motivo === "salida") return "salida";
  return "automatico";
}

/**
 * Instante en que empieza el dia en curso, para compararlo con columnas `timestamp`
 * (`calculada_at`, `origen_at`). Es `inicioDelDiaCREnUtc` y NO `startOfDayCR`, que es para
 * columnas `date` (ficha 166).
 */
function inicioDelDiaEnCurso(ahora: Date): Date {
  return inicioDelDiaCREnUtc(fechaCalendarioCR(ahora));
}

/**
 * SLT-59 (glosario «Primera ruta pendiente», R59, R67) — la ruta no existe, o su `calculada_at`
 * es nula o anterior al inicio del dia en curso. Pura sobre `ruta`: cero lecturas. Una reduccion
 * no la cumple porque R17 no mueve `calculada_at`.
 *
 * Delega en el predicado de `optimizacion-ruta-encolado.ts`, el que usan los repositorios dentro de
 * sus transacciones: con dos copias, el servicio y los writers podrian discrepar sobre si la
 * primera ruta sigue pendiente (review m8).
 */
export function primeraRutaPendiente(
  ruta: Pick<RutaOptimizadaDTO, "calculadaAt"> | null,
  ahora: Date,
): boolean {
  return primeraRutaPendienteDelDia(ruta?.calculadaAt ?? null, fechaCalendarioCR(ahora));
}

/**
 * SLT-59 (glosario «Punto de recogida», R62, R63) — el origen guardado cuando es `gps` y se
 * capturo dentro del dia en curso: lo escribio la ultima recogida con GPS (92/R23). Un origen
 * `ultima_conocida`, `centroide` o de ayer no dice donde recogio hoy.
 */
export function puntoDeRecogida(
  ruta: Pick<RutaOptimizadaDTO, "origenLat" | "origenLng" | "origenAt" | "origenFuente"> | null,
  ahora: Date,
): { lat: number; lng: number } | null {
  if (ruta === null || ruta.origenFuente !== "gps") return null;
  if (ruta.origenLat === null || ruta.origenLng === null || ruta.origenAt === null) return null;
  if (ruta.origenAt < inicioDelDiaEnCurso(ahora)) return null;
  return { lat: ruta.origenLat, lng: ruta.origenLng };
}

/**
 * SLT-59 (R3, R5, design §2.1) — la posicion del mensajero es el origen final SOLO si sale de
 * el: el centroide es un punto calculado, no donde esta nadie, y medir el desvio contra el
 * dispararia reoptimizaciones por una geometria que nadie recorre.
 */
export function posicionDelMensajero(
  origen: { lat: number; lng: number; fuente: OrigenFuente } | null,
): { lat: number; lng: number } | null {
  if (origen === null || origen.fuente === "centroide") return null;
  return { lat: origen.lat, lng: origen.lng };
}

/** Ids de la secuencia persistida en orden de visita (el `Map` no tiene orden util). */
function secuenciaPrevia(ruta: RutaOptimizadaDTO): string[] {
  return [...ruta.secuenciaPorOrden.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/**
 * SLT-59 (R4) — la ruta dada contra la que se mide el desvio. Solo una polilinea `routes` es
 * «la ruta por calles»: una `local` heredada son rectas que nadie recorre. Sin ella, la recta
 * por las paradas en el orden guardado; las que ya no estan en `paradas` se saltan porque sus
 * coordenadas no estan cargadas y leerlas costaria una consulta (R9).
 */
function lineaReferencia(
  ruta: RutaOptimizadaDTO,
  previa: string[],
  paradas: ParadaConCoordenadas[],
): { lat: number; lng: number }[] {
  if (ruta.trazado !== null && ruta.trazado.fuente === "routes") {
    return decodificarPolilinea(ruta.trazado.encodedPolyline);
  }
  const porId = new Map(paradas.map((p) => [p.ordenId, p]));
  return previa
    .map((id) => porId.get(id))
    .filter((p): p is ParadaConCoordenadas => p !== undefined)
    .map((p) => ({ lat: p.latitud, lng: p.longitud }));
}

/**
 * SLT-59 (design §2) — sustituye a la guarda 92/R36 («misma huella»). La huella mezcla el
 * origen y cualquier GPS nuevo la cambiaba: el criterio pasa a ser el CONJUNTO de paradas mas
 * el desvio respecto a la ruta. Pura sobre lo ya cargado: cero lecturas, cero llamadas (R9).
 *
 * El desvio se mide DESPUES de descartar paradas nuevas a proposito: a partir de ahi toda
 * parada actual esta en la secuencia previa y tiene coordenadas, asi que la recta de R4 nunca
 * queda vacia (la 92/R35 ya corto con 0 paradas). Ademas ahorra decodificar la polilinea
 * cuando la respuesta ya es «reoptimizar».
 *
 * Sin criterio de tiempo (R10, D8): `calculada_at` no entra aqui.
 *
 * [2026-10-30, SLT-59, D16] Rama nueva ANTES del desvio: si las restantes no son la COLA de
 * la secuencia previa (lo quitado no es un prefijo) -> reoptimizar, motivo `fuera_de_orden`
 * (R42, R43). Va antes porque no necesita decodificar la polilinea y las dos ramas dicen lo
 * mismo. Recalcular no es una rama propia: `ejecutar` sigue por el camino de siempre.
 */
export function decidirGuardaRuta(input: {
  ruta: RutaOptimizadaDTO | null;
  paradas: ParadaConCoordenadas[];
  posicion: { lat: number; lng: number } | null;
  umbralM: number;
  disparo: DisparoRuta;
  ahora: Date;
  enfriamientoMin: number;
}): DecisionGuardaRuta {
  const { ruta, paradas, posicion, umbralM, disparo, ahora, enfriamientoMin } = input;
  if (ruta === null) return { tipo: "reoptimizar", motivo: "sin_ruta" };
  // [2026-10-31, SLT-59, D23/D25, R59] Va antes que todo: con la primera ruta pendiente no hay
  // secuencia de hoy que conservar ni reducir.
  if (primeraRutaPendiente(ruta, ahora)) return { tipo: "reoptimizar", motivo: "primera_del_dia" };
  // [2026-10-31, SLT-59, D21] Solo los automaticos siguen R7 tal cual. El boton pasa por el
  // enfriamiento de R53 cuando no hay nada nuevo que justifique pagar.
  if (ruta.estado !== "vigente" && disparo !== "manual") {
    return { tipo: "reoptimizar", motivo: "desactualizada" }; // R7
  }

  const previa = secuenciaPrevia(ruta);
  const actual = new Set(paradas.map((p) => p.ordenId));
  if ([...actual].some((id) => !ruta.secuenciaPorOrden.has(id))) {
    return { tipo: "reoptimizar", motivo: "paradas_nuevas" }; // R20
  }

  // R42/R43 (D16): «prefijo» en codigo = las restantes son exactamente la cola de `previa`.
  // Quitar la ultima deja [s1, s2] de [s1, s2, s3]: sin hueco, pero no es la cola.
  const restantes = previa.filter((id) => actual.has(id));
  const cola = previa.slice(previa.length - restantes.length);
  if (restantes.some((id, i) => id !== cola[i])) {
    return { tipo: "reoptimizar", motivo: "fuera_de_orden" };
  }

  // R3: estricto; a `umbralM` justos no esta desviado.
  // [2026-10-31, SLT-59, D24, R51] Solo el boton mide el desvio: en automatico ni se decodifica
  // la polilinea, y R47 (polilinea vacia = desviado) queda acotado al camino manual (R52).
  const desviado =
    disparo === "manual" &&
    posicion !== null &&
    distanciaMinimaAPolilineaM(posicion, lineaReferencia(ruta, previa, paradas)) > umbralM;
  if (desviado) return { tipo: "reoptimizar", motivo: "desviado" }; // R52 (antes R19)

  if (ruta.estado !== "vigente") {
    // R53/R54: `actualizadaAt` es una cota superior del instante del fallo.
    const transcurridoMs = ahora.getTime() - ruta.actualizadaAt.getTime();
    return transcurridoMs >= enfriamientoMin * 60_000
      ? { tipo: "reoptimizar", motivo: "recuperacion" }
      : { tipo: "omitir", motivo: "enfriamiento" };
  }

  if (actual.size === previa.length) return { tipo: "omitir" }; // R1, R2
  // R11 — [2026-10-30, SLT-59, D16] se lee R41; en manual, R56.
  return { tipo: "reducir", previa, restantes };
}

/** SLT-59 — por que `decidirGuardaRuta` mando recalcular. */
export type MotivoReoptimizar = Extract<DecisionGuardaRuta, { tipo: "reoptimizar" }>["motivo"];

/**
 * SLT-59 (D27, D28, D29; R73, R76; design §13.1) — el motivo registrado de las llamadas de un
 * recalculo. Puro: lo decide con la rama de `decidirGuardaRuta` (que ya aplica la precedencia de
 * §12.1) y con quien disparo. El cliente no decide nada.
 *
 * Fuera de la tabla de §13.1 hay combinaciones que el flujo no produce hoy (un automatico no mide
 * el desvio, R51; el boton no pasa por `desactualizada`, R53; el traspaso no encola con la primera
 * pendiente, R60). Se les da el motivo mas cercano para que el `switch` sea total.
 */
export function motivoLlamadaRuta(
  decision: MotivoReoptimizar,
  disparo: MotivoOptimizacion,
  origen: OrigenJobRuta | null,
): MotivoLlamadaRuta {
  if (disparo === "salida") return "primera_ruta_salida";
  if (disparo === "manual") {
    switch (decision) {
      case "sin_ruta":
      case "primera_del_dia":
        return "primera_ruta_boton";
      case "desviado":
        return "sincronizacion_manual_desvio";
      case "paradas_nuevas":
      case "fuera_de_orden":
        return "sincronizacion_manual_paradas";
      case "desactualizada":
      case "recuperacion":
        return "recuperacion_ruta_caida";
    }
  }
  // Un job. Fuera de orden y ruta caida no dependen de quien encolo.
  if (decision === "fuera_de_orden") return "entrega_fuera_de_orden";
  if (decision === "desactualizada" || decision === "recuperacion") {
    return "reintento_ruta_desactualizada";
  }
  switch (origen) {
    case null:
      return "job_sin_origen";
    // R76: el job de la recogida corre por la espera de RUTA_PRIMERA_DEBOUNCE_MIN
    // (5 min desde SLT-74) o por la ultima recogida (R58).
    case "recogida_parcial":
      return "primera_ruta_debounce_recogida";
    case "recogida":
      return "primera_ruta_recogida_completa";
    case "gestion":
      return decision === "paradas_nuevas" || decision === "desviado"
        ? "paradas_nuevas_gestion"
        : "primera_ruta_primera_gestion";
    case "traspaso":
      return "paradas_nuevas_traspaso";
  }
}

/**
 * SLT-59 (design §2.2) — como rehacer el trazado de una reduccion, y si cuesta una llamada.
 *   `concatenar`  R13: cada parada restante conserva el tramo que llega a ella. 0 llamadas.
 *   `puente`      R14: falta el tramo de cada hueco; UNA llamada a Routes desde `desde`.
 *   `sin_trazado` R15: no hay tramos por calles completos. 0 llamadas.
 *
 * [2026-10-30, SLT-59, D16] La rama `puente` (R14, D14) se borra: fuera de orden ya no llega a
 * la reduccion (`decidirGuardaRuta` lo manda a reoptimizar, R42), asi que las restantes son
 * siempre la cola de la secuencia, sin huecos, y cada una conserva el tramo que llega a ella.
 */
type PlanReduccion = { tipo: "concatenar" } | { tipo: "sin_trazado" };

function planificarReduccion(ruta: RutaOptimizadaDTO, restantes: string[]): PlanReduccion {
  const tramosCompletos =
    ruta.trazado !== null &&
    ruta.trazado.fuente === "routes" &&
    restantes.every((id) => ruta.tramoPorOrden.has(id));
  return tramosCompletos ? { tipo: "concatenar" } : { tipo: "sin_trazado" };
}

/**
 * Cabecera de un trazado rehecho con tramos. Las uniones repiten el punto final de un tramo
 * como inicial del siguiente; se quita para no dibujar un vertice doble. Una suma con algun
 * sumando desconocido es desconocida, no una cifra menor que pareceria real.
 */
function trazadoConcatenado(tramos: TramoPersistido[]): TrazadoRuta {
  const puntos: { lat: number; lng: number }[] = [];
  for (const tramo of tramos) {
    const pts = decodificarPolilinea(tramo.encodedPolyline);
    const ultimo = puntos[puntos.length - 1];
    const repetido =
      ultimo !== undefined && pts.length > 0 && pts[0].lat === ultimo.lat && pts[0].lng === ultimo.lng;
    puntos.push(...(repetido ? pts.slice(1) : pts));
  }
  const suma = (k: "distanciaM" | "duracionS"): number | null =>
    tramos.some((t) => t[k] === null) ? null : tramos.reduce((s, t) => s + (t[k] as number), 0);
  return {
    encodedPolyline: codificarPolilinea(puntos),
    distanciaM: suma("distanciaM"),
    duracionS: suma("duracionS"),
    fuente: "routes",
    tramos: tramos.map((t) => ({ ...t })),
  };
}

export class OptimizacionRutaService implements IOptimizacionRutaService {
  constructor(
    private readonly rutas: IRutaOptimizadaRepository,
    private readonly paradasRepo: ParadasRepo,
    private readonly client: IRouteOptimizationClient,
    private readonly config: RouteOptimizationConfig,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: RutaLogger = defaultLogger,
    /**
     * Trazado de la ruta (Google Routes). OPCIONAL a proposito: `null` = no se dibuja, y
     * todo lo demas sigue igual. Es una llamada FACTURADA aparte, y su fallo NUNCA debe
     * tumbar una optimizacion que ya salio bien (ver `trazar`).
     */
    private readonly routes: IRoutesClient | null = null,
    /**
     * SLT-74: de aqui sale cuanto falta para el job pendiente de la primera ruta, solo para el
     * aviso de `recogida_insuficiente`. OPCIONAL: `null` = el aviso solo pide recoger.
     */
    private readonly jobsPendientes: ILectorJobPendiente | null = null,
  ) {}

  /**
   * SLT-74: ms hasta el `run_after` del job pendiente de la primera ruta de HOY (puede ser <= 0),
   * o `undefined` si no hay. Es solo para el texto del aviso: si la lectura falla, el aviso sale
   * sin el tiempo en vez de tumbar la respuesta del boton.
   */
  private async esperaPrimeraRuta(mensajeroId: string, ahora: Date): Promise<number | undefined> {
    if (this.jobsPendientes === null) return undefined;
    try {
      const job = await this.jobsPendientes.findPendienteByDedupeKey(
        dedupeKeyPrimeraRecogida(mensajeroId, fechaCalendarioCR(ahora)),
      );
      return job === null ? undefined : job.runAfter.getTime() - ahora.getTime();
    } catch (error) {
      opterror("service — SLT-74: no se pudo leer el job pendiente de la primera ruta", error);
      return undefined;
    }
  }

  async ejecutar(
    mensajeroId: string,
    opts: EjecutarOptimizacionOpts,
  ): Promise<EjecutarOptimizacionResult> {
    const ahora = this.now();
    optlog("service — ENTRADA", {
      mensajeroId,
      motivo: opts.motivo,
      jobCreatedAt: opts.jobCreatedAt?.toISOString(),
      ubicacionRecibida: opts.ubicacion !== undefined,
    });

    // R23: la ubicacion del navegador se persiste ANTES de cualquier guarda. Aunque la
    // optimizacion se omita, la posicion capturada sigue siendo util para la siguiente.
    //
    // [2026-10-31, SLT-59, D17/m1, R46, design §2.4] Ya no se escribe aqui: escribirla antes de
    // las guardas pisaba el origen guardado aunque luego se omitiera, se redujera o cortara el
    // intervalo minimo. La ubicacion se usa EN MEMORIA (origen y desvio de esta ejecucion) y se
    // persiste solo justo antes de recalcular (`persistirUbicacion`).
    const ubicacionGps =
      opts.ubicacion !== undefined
        ? { lat: opts.ubicacion.lat, lng: opts.ubicacion.lng, capturadaAt: ahora, fuente: "gps" as const }
        : null;

    const ruta = await this.rutas.findByMensajero(mensajeroId);
    // Lo que se leeria si la ubicacion ya estuviera guardada. Sin fila (`ruta === null`) basta
    // con las columnas de origen: es lo unico que leen `resolverOrigen` y su hermano, y la
    // decision sera recalcular de todos modos (R7).
    const origenGuardado: OrigenGuardado | null =
      ubicacionGps !== null
        ? {
            origenLat: ubicacionGps.lat,
            origenLng: ubicacionGps.lng,
            origenAt: ahora,
            origenFuente: "gps",
          }
        : ruta;
    // Las guardas 92/R20 y 92/R34 siguen leyendo `calculadaAt` de `ruta`: la vista no lo cambia.
    const rutaVista: RutaOptimizadaDTO | null =
      ruta !== null && origenGuardado !== null ? { ...ruta, ...origenGuardado } : ruta;

    // ── R20: guarda de OBSOLESCENCIA ──────────────────────────────────────────────
    // El job de debounce en vuelo no se puede cancelar (`IJobRepository` no lo expone y
    // NO se le anade, design §4.1). Si entre su encolado y su ejecucion una optimizacion
    // posterior ya recalculo la ruta, este job no tiene nada que hacer: completarlo sin
    // llamar es el ahorro que compensa no poder cancelar.
    if (
      opts.jobCreatedAt !== undefined &&
      ruta?.calculadaAt != null &&
      opts.jobCreatedAt < ruta.calculadaAt
    ) {
      optlog("service — guarda R20: job obsoleto, 0 llamadas facturadas", {
        jobCreatedAt: opts.jobCreatedAt.toISOString(),
        rutaCalculadaAt: ruta.calculadaAt.toISOString(),
      });
      return { status: "omitida", razon: "obsoleta" };
    }

    // ── R34: intervalo minimo del boton manual ────────────────────────────────────
    // Solo aplica al disparo manual: los de la cola ya estan acotados por el debounce y
    // por la guarda de obsolescencia. Dos pulsaciones seguidas (doble clic, o el mensajero
    // impaciente) NO producen dos llamadas facturadas.
    if (opts.motivo === "manual" && ruta?.calculadaAt != null) {
      const transcurridoS = (ahora.getTime() - ruta.calculadaAt.getTime()) / 1000;
      if (transcurridoS < this.config.RUTA_SYNC_MIN_INTERVALO_S) {
        optlog("service — guarda R34: intervalo minimo, 0 llamadas facturadas", {
          transcurridoS,
          minimoS: this.config.RUTA_SYNC_MIN_INTERVALO_S,
        });
        return { status: "omitida", razon: "intervalo_minimo" };
      }
    }

    // ── SLT-59 R63: disparo de salida ─────────────────────────────────────────────
    // Antes de leer paradas: si no aplica, 0 lecturas mas, 0 llamadas y nada escrito.
    if (opts.motivo === "salida" && !this.salidaAplica(ruta, opts.ubicacion, ahora)) {
      optlog("service — guarda R63: la salida no aplica, 0 llamadas facturadas");
      return { status: "omitida", razon: "salida_no_aplica" };
    }

    // ── SLT-59 R64: boton con la primera ruta pendiente ───────────────────────────
    // Despues de 92/R20 y 92/R34 (no aplican: `calculada_at` es de ayer o nula) y antes de leer
    // paradas. La lectura de conteo solo ocurre aqui, con la primera pendiente (R67).
    if (opts.motivo === "manual" && primeraRutaPendiente(ruta, ahora)) {
      const { asignadas, recogidas } = await this.paradasRepo.contarAsignadasDelDia(
        mensajeroId,
        startOfDayCR(ahora),
      );
      // Entera y sin redondeos; con `asignadas = 0` no hay nada que esperar y no corta.
      if (recogidas * 100 < asignadas * this.config.RUTA_PRIMERA_MIN_RECOGIDO_PCT) {
        optlog("service — guarda R64: recogida insuficiente, 0 llamadas facturadas", {
          recogidas,
          asignadas,
        });
        const esperaMs = await this.esperaPrimeraRuta(mensajeroId, ahora);
        return {
          status: "omitida",
          razon: "recogida_insuficiente",
          recogidas,
          asignadas,
          ...(esperaMs !== undefined ? { esperaMs } : {}),
        };
      }
    }

    const todas = await this.paradasRepo.findParadasEnReparto(mensajeroId);
    // R37: las ordenes SIN coordenadas se EXCLUYEN de la optimizacion, no la abortan.
    // Quedan como paradas sin posicion (R28) y la lectura las muestra al final.
    const conCoordenadas = todas.filter(
      (p): p is ParadaRutaRow & { latitud: number; longitud: number } =>
        p.latitud !== null && p.longitud !== null,
    );
    optlog("service — paradas en reparto", {
      total: todas.length,
      conCoordenadas: conCoordenadas.length,
      sinCoordenadas: todas.length - conCoordenadas.length,
    });

    // ── R35: 0 o 1 parada ─────────────────────────────────────────────────────────
    // Optimizar un punto no significa nada: no hay orden que calcular. Se persiste la
    // secuencia trivial (o se limpia la vieja, si el mensajero ya entrego todo) SIN
    // llamar al proveedor de OPTIMIZACION.
    //
    // Pero con UNA parada si hay recorrido que enseñar —del origen a esa parada—, y no
    // dibujarlo dejaba al mensajero con un mapa de dos puntos sueltos justo en el caso mas
    // comun del final del dia. El TRAZADO si se pide (decision del humano, 2026-08-14).
    // Sigue siendo `omitida`: describe que no hubo ORDENACION, no que no pasara nada.
    if (conCoordenadas.length <= 1) {
      optlog("service — guarda R35: 0 o 1 parada, 0 llamadas de OPTIMIZACION", {
        conCoordenadas: conCoordenadas.length,
      });
      const unica = conCoordenadas[0];
      const origen =
        unica !== undefined
          ? this.resolverOrigen(origenGuardado, conCoordenadas, ahora)
          : this.origenSoloDeUltimaConocida(origenGuardado);
      const secuencia = unica !== undefined ? [unica.ordenId] : [];
      const huellaSet = this.huella(secuencia, origen);

      // SLT-59 (R2, R6, R11; design §2.2 ultimo parrafo): la guarda va ANTES de la escritura.
      // Antes se reescribia la secuencia y luego se miraba la huella; eso movia `calculada_at`
      // y el origen aunque no hubiera nada que hacer, que es justo lo que R6 prohibe. Con
      // cero paradas no hay conjunto que comparar: sigue limpiando como hoy.
      // [2026-10-30, SLT-59, D16] «R11» se lee R41/R42.
      // Sin fila la guarda no corre y la decision seria `sin_ruta` (R7): es el motivo de partida.
      let recalculo: MotivoReoptimizar = "sin_ruta";
      if (unica !== undefined) {
        const guarda = await this.guardaSinRecalculo(
          mensajeroId,
          rutaVista,
          [unica],
          origen,
          "sin_paradas",
          { disparo: disparoDe(opts.motivo), ahora },
        );
        if ("desenlace" in guarda) return guarda.desenlace;
        recalculo = guarda.reoptimizar;
      }

      await this.persistirUbicacion(mensajeroId, ubicacionGps);
      await this.rutas.reemplazarSecuencia(mensajeroId, secuencia, {
        calculadaAt: ahora,
        origen,
        huellaSet,
        // Feature 265 (R37): con 0 o 1 parada NO HUBO ORDENACION, asi que no hay procedencia
        // que afirmar. `null` es «no consta», y afirmar `proveedor` aqui seria mentir sobre
        // un calculo que nadie hizo.
        secuenciaFuente: null,
      });

      // El trazado SI se factura (Routes es su propio SKU). Se reusa el criterio de R36
      // para no pagarlo en cada disparo: si la parada y el origen son los mismos que la
      // ultima vez y la ruta sigue vigente, se devuelve el trazado ya persistido.
      //
      // OJO al orden: `cacheado` se lee de `ruta`, la cabecera de ANTES de la escritura de
      // arriba. Releer despues no serviria — `reemplazarSecuencia` acaba de limpiar las
      // columnas del trazado.
      //
      // [2026-10-29, SLT-59, D1/D8] El criterio de «sin cambios» de este parrafo ya no es la
      // huella: lo decide `guardaSinRecalculo` ARRIBA, antes de escribir nada (R2, R6). Si se
      // llega aqui con una parada es porque hay que recalcular (R7, R19, R20), y entonces el
      // trazado se pide siempre. El parrafo de arriba se conserva como historia de la 92; la
      // reposicion del dibujo cacheado que describia ya no hace falta, porque omitir ya no
      // escribe y no hay nada que reponer.
      if (unica === undefined || origen === null) {
        optlog("service — R35: no se redibuja", {
          conCoordenadas: conCoordenadas.length,
          sinOrigen: origen === null,
        });
        return { status: "omitida", razon: "sin_paradas" };
      }
      // SLT-59 (§13.1): la rama de una parada solo produce el `computeRoutes`, con su motivo.
      const trazado = await this.trazar(
        [unica.ordenId],
        [unica],
        origen,
        this.contextoLlamada(mensajeroId, recalculo, opts),
      );
      await this.persistirTrazado(mensajeroId, huellaSet, trazado);
      return {
        status: "omitida",
        razon: "sin_paradas",
        ...(trazado !== null ? { trazado } : {}),
      };
    }

    // ── R38: tope de paradas ──────────────────────────────────────────────────────
    // `findParadasEnReparto` ya devuelve `createdAt asc`, que es el criterio pedido: se
    // optimizan las mas antiguas y el resto queda sin posicion (R28), no se descarta.
    const paradas = conCoordenadas.slice(0, this.config.RUTA_MAX_PARADAS);
    if (conCoordenadas.length > this.config.RUTA_MAX_PARADAS) {
      // Mensaje AGREGADO: un conteo, jamas un id ni una coordenada.
      this.logger.warn(
        `[optimizacion_ruta] paradas recortadas al tope (${this.config.RUTA_MAX_PARADAS})`,
      );
    }

    // ── 265/R16-R23: coherencia del origen ────────────────────────────────────────
    // Va DESPUES de resolver el origen (necesita uno ya resuelto) y DESPUES del recorte del
    // tope (el centroide debe calcularse sobre las paradas que DE VERDAD se envian), y ANTES
    // de la huella (R20): el origen que entra en la huella tiene que ser el que se envia.
    const origen = this.origenCoherente(
      this.resolverOrigen(origenGuardado, paradas, ahora),
      paradas,
    );

    // ── R36: huella del conjunto + origen ─────────────────────────────────────────
    // Si nada cambio desde la ultima optimizacion valida, el resultado seria identico:
    // pagarlo otra vez es tirar dinero. La huella ordena los ids para ser independiente
    // del orden de lectura, e incluye el origen redondeado.
    const huellaSet = this.huella(
      paradas.map((p) => p.ordenId),
      origen,
    );
    optlog("service — origen resuelto y huella calculada", {
      origen,
      huellaSet,
      huellaPrevia: ruta?.huellaSet ?? null,
      estadoRuta: ruta?.estado ?? null,
    });

    // [2026-10-29, SLT-59, D1/D8, R8] La guarda de este sitio ya no compara huellas: decide
    // por CONJUNTO de paradas + desvio de mas de `RUTA_REOPT_DISTANCIA_M` respecto a la ruta
    // (`decidirGuardaRuta`), y la reduccion de R11 va justo detras. La huella de arriba se sigue
    // calculando igual porque condiciona las escrituras (`guardarTrazado`, `reducirSecuencia`).
    const guarda = await this.guardaSinRecalculo(
      mensajeroId,
      rutaVista,
      paradas,
      origen,
      "sin_cambios",
      { disparo: disparoDe(opts.motivo), ahora },
    );
    if ("desenlace" in guarda) return guarda.desenlace;
    // SLT-59 (D27, §13.1): el `optimizeTours` y el `computeRoutes` de este recalculo, mismo motivo.
    const contexto = this.contextoLlamada(mensajeroId, guarda.reoptimizar, opts);

    // Ya esta decidido recalcular: la ubicacion recibida se guarda como origen ANTES de la
    // llamada, como hacia la 92/R23. Si el proveedor falla despues, el GPS queda guardado.
    await this.persistirUbicacion(mensajeroId, ubicacionGps);

    // ── Llamada FACTURADA al proveedor ────────────────────────────────────────────
    optlog("service — ninguna guarda corto: se LLAMA al proveedor (esto se factura)", {
      paradas: paradas.length,
    });
    // ⚠️ Feature 265 (R24-R26, design §7) — EL `try` NO ES DECORACION, ES EL DEFECTO MEDIDO.
    // Sin el, una EXCEPCION del cliente (respuesta con forma invalida, HTTP 400, fallo del
    // proveedor de token) atravesaba el servicio SIN pasar por `marcarDesactualizada` y
    // llegaba cruda al borde, que la convertia en «AppErrorCode inesperado INTERNAL»: pantalla
    // rota, 6 veces sobre 2 usuarios en produccion. Ahora cualquier excepcion recibe el MISMO
    // trato que los desenlaces de fallo: se conserva el orden previo, se marca desactualizada
    // y se lanza el fallo TIPADO —que la cola sigue viendo como excepcion (R26)—.
    let outcome: OptimizarOutcome;
    try {
      outcome = await this.client.optimizar(
        {
          origen: { lat: origen.lat, lng: origen.lng },
          paradas: paradas.map((p) => ({ ordenId: p.ordenId, lat: p.latitud, lng: p.longitud })),
        },
        contexto,
      );
    } catch (error) {
      opterror("service — el proveedor LANZO; se conserva el orden previo (R27)", error);
      const motivo = motivoDeExcepcion(error);
      await this.rutas.marcarDesactualizada(mensajeroId, motivo);
      throw new RutaIntentoFallidoError(motivo);
    }

    if (outcome.status === "ok") {
      await this.rutas.reemplazarSecuencia(mensajeroId, outcome.secuencia, {
        calculadaAt: ahora,
        origen,
        huellaSet,
        // Feature 265 (R35/R36): el servicio TRANSPORTA la procedencia, no la decide. Va en
        // la misma escritura que la secuencia que describe, asi que nunca puede quedar una
        // marca vieja pegada a un orden nuevo.
        secuenciaFuente: outcome.fuente,
      });
      optlog("service — SALIDA: ok, secuencia persistida", {
        secuencia: outcome.secuencia,
        paradas: outcome.secuencia.length,
        secuenciaFuente: outcome.fuente,
      });
      const trazado = await this.trazar(outcome.secuencia, paradas, origen, contexto);
      await this.persistirTrazado(mensajeroId, huellaSet, trazado);
      return {
        status: "ok",
        paradas: outcome.secuencia.length,
        secuenciaFuente: outcome.fuente,
        ...(trazado !== null ? { trazado } : {}),
      };
    }

    // ── 265/§5.3: `sin_solucion` SIN COMPUESTO = defensa en profundidad ────────────
    // En produccion esto no deberia llegar aqui: `FallbackRouteOptimizationClient` lo
    // intercepta y ordena en local. Pero si alguien cablea el cliente de Google SIN el
    // compuesto (los tests lo hacen), el trato es el de un fallo del proveedor: se conserva el
    // orden previo, se marca desactualizada y se lanza. NUNCA se persiste parcial, NUNCA se
    // cae en silencio.
    if (outcome.status === "sin_solucion") {
      this.logger.warn(
        `[optimizacion_ruta] el proveedor no sirvio todas las paradas (${outcome.servidas} de ` +
          `${outcome.enviadas}) y no hay calculo local cableado: se conserva el orden previo`,
      );
    }

    // R27: fallo del proveedor. NO se tocan las paradas — el ultimo orden valido queda
    // INTACTO. Se marca la ruta `desactualizada` (aviso de la UI) y se LANZA para que la
    // cola aplique su backoff. `outcome.detalle` viene ya saneado del cliente: cita la
    // operacion y el estado HTTP, nunca el token, la URL ni una coordenada (R14).
    if (outcome.status === "config_invalida") {
      // Ruidoso a proposito (mismo criterio que la 91): preferimos un dead-letter VISIBLE
      // a rutas que dejan de actualizarse en silencio.
      this.logger.warn("[optimizacion_ruta] el proveedor rechazo la credencial");
    }
    optlog("service — SALIDA: fallo del proveedor; se CONSERVA el orden previo (R27)", {
      status: outcome.status,
      detalle: outcome.detalle,
    });
    await this.rutas.marcarDesactualizada(mensajeroId, outcome.detalle);
    if (outcome.status === "config_invalida") {
      // SLT-59 (R29): con la credencial rechazada cada reintento es otra llamada que vuelve a
      // fallar igual; el tipo propio deja al handler cortar los reintentos.
      throw new RutaCredencialRechazadaError(outcome.detalle);
    }
    throw new RutaIntentoFallidoError(outcome.detalle);
  }

  /**
   * SLT-59 (R27, design §3.2) — la reduccion que la peticion de la gestion puede permitirse:
   * solo R13 o R15, que no llaman a nadie. Todo lo demas (hueco que pide un tramo puente,
   * desvio, paradas nuevas, ruta desactualizada) se deja al job ya encolado, para no colgar
   * hasta `ROUTE_OPT_TIMEOUT_MS` el registro de una entrega (alternativa A8).
   *
   * Recorre las mismas piezas que `ejecutar` (recorte 92/R38, origen 265/R16) para que la
   * decision sea la misma que tomaria el job; sin las guardas de job y de boton, que no
   * aplican a una gestion.
   *
   * [2026-10-30, SLT-59, D16] R27 se lee R44: `decidirGuardaRuta` solo devuelve `reducir` con
   * un prefijo, y la reduccion ya no llama nunca. Fuera de orden (hueco o «quitar la ultima»)
   * devuelve `reoptimizar` y aqui no se hace nada: lo recalcula el job (R42).
   */
  async reducirSinLlamadas(mensajeroId: string): Promise<void> {
    const ahora = this.now();
    const ruta = await this.rutas.findByMensajero(mensajeroId);
    // Sin ruta vigente no hay secuencia que reducir (R7): ahorra la lectura de paradas.
    if (ruta === null || ruta.estado !== "vigente") return;

    const conCoordenadas = (await this.paradasRepo.findParadasEnReparto(mensajeroId)).filter(
      (p): p is ParadaRutaRow & ParadaConCoordenadas => p.latitud !== null && p.longitud !== null,
    );
    // Con cero paradas la limpieza es de la 92/R35, y la hace el job.
    if (conCoordenadas.length === 0) return;

    const paradas = conCoordenadas.slice(0, this.config.RUTA_MAX_PARADAS);
    const origen =
      paradas.length === 1
        ? this.resolverOrigen(ruta, paradas, ahora)
        : this.origenCoherente(this.resolverOrigen(ruta, paradas, ahora), paradas);

    const decision = decidirGuardaRuta({
      ruta,
      paradas,
      posicion: posicionDelMensajero(origen),
      umbralM: this.config.RUTA_REOPT_DISTANCIA_M,
      // La peticion de la gestion es automatica (design §12.1): sin desvio (R51), y con la
      // primera ruta pendiente la decision es recalcular, asi que aqui no se hace nada.
      disparo: "automatico",
      ahora,
      enfriamientoMin: this.config.RUTA_RECUPERACION_ENFRIAMIENTO_MIN,
    });
    optlog("service — reduccion en la peticion: decision", { decision: decision.tipo });
    if (decision.tipo !== "reducir") return;
    await this.aplicarReduccion(mensajeroId, ruta, decision, origen);
  }

  /**
   * SLT-59 (R63, R66, design §12.6) — el servidor no se fia del cliente: vuelve a comprobar con
   * la posicion recibida que la primera ruta sigue pendiente, que hay punto de recogida (en la
   * ruta LEIDA, antes de la vista de §2.4, que lo pisaria con la propia posicion) y que el
   * mensajero ya se alejo mas de `RUTA_REOPT_DISTANCIA_M`. Con la ruta `desactualizada`, ademas,
   * el enfriamiento de R53: es lo que acota a una llamada cada 5 min si el proveedor falla.
   */
  private salidaAplica(
    ruta: RutaOptimizadaDTO | null,
    ubicacion: { lat: number; lng: number } | undefined,
    ahora: Date,
  ): boolean {
    if (ubicacion === undefined || !primeraRutaPendiente(ruta, ahora)) return false;
    const punto = puntoDeRecogida(ruta, ahora);
    if (ruta === null || punto === null) return false;
    // R3/R62: estricto; a `RUTA_REOPT_DISTANCIA_M` justos todavia no salio.
    if (distanciaHaversineKm(ubicacion, punto) * 1000 <= this.config.RUTA_REOPT_DISTANCIA_M) {
      return false;
    }
    if (ruta.estado === "vigente") return true;
    const transcurridoMs = ahora.getTime() - ruta.actualizadaAt.getTime();
    return transcurridoMs >= this.config.RUTA_RECUPERACION_ENFRIAMIENTO_MIN * 60_000;
  }

  /**
   * SLT-59 — la guarda que ocupa el sitio de la 92/R36 (R8): `omitir` o `reducir` devuelven el
   * desenlace; `null` = hay que recalcular y `ejecutar` sigue como hoy.
   * `razonOmitir` conserva la razon que cada rama devolvia antes, para no cambiar lo que ve
   * la accion manual.
   */
  private async guardaSinRecalculo(
    mensajeroId: string,
    ruta: RutaOptimizadaDTO | null,
    paradas: ParadaConCoordenadas[],
    origen: { lat: number; lng: number; fuente: OrigenFuente } | null,
    razonOmitir: "sin_cambios" | "sin_paradas",
    contexto: { disparo: DisparoRuta; ahora: Date },
  ): Promise<{ desenlace: EjecutarOptimizacionResult } | { reoptimizar: MotivoReoptimizar }> {
    const decision = decidirGuardaRuta({
      ruta,
      paradas,
      posicion: posicionDelMensajero(origen),
      umbralM: this.config.RUTA_REOPT_DISTANCIA_M,
      disparo: contexto.disparo,
      ahora: contexto.ahora,
      enfriamientoMin: this.config.RUTA_RECUPERACION_ENFRIAMIENTO_MIN,
    });
    const enfriamiento = "motivo" in decision && decision.motivo === "enfriamiento";
    optlog("service — guarda SLT-59: conjunto + desvio", {
      decision: decision.tipo,
      motivo: "motivo" in decision ? decision.motivo : null,
    });
    if (decision.tipo === "reoptimizar") return { reoptimizar: decision.motivo };
    // `decidirGuardaRuta` devuelve `sin_ruta` con `ruta === null`: aqui la ruta existe.
    if (ruta === null) return { reoptimizar: "sin_ruta" };

    if (decision.tipo === "omitir") {
      // Nada que RECALCULAR, pero el mapa sigue necesitando su linea. El trazado persistido
      // corresponde a esta misma secuencia —la DB solo lo conserva mientras la secuencia no
      // cambie— asi que se devuelve tal cual, sin llamar, pagar ni escribir nada (R6).
      // [2026-10-31, SLT-59, D21, R53] Lo mismo con el enfriamiento: ni siquiera el origen (R46).
      const cacheado = this.trazadoDesdeCache(ruta);
      optlog("service — guarda R36 (SLT-59): sin recalculo, 0 llamadas facturadas", {
        enfriamiento,
        trazadoEnCache: cacheado !== null,
        tramosEnCache: cacheado?.tramos.length ?? 0,
      });
      return {
        desenlace: {
          status: "omitida",
          razon: enfriamiento ? "enfriamiento" : razonOmitir,
          ...(cacheado !== null ? { trazado: cacheado } : {}),
        },
      };
    }

    return { desenlace: await this.aplicarReduccion(mensajeroId, ruta, decision, origen) };
  }

  /**
   * SLT-59 (D27; R70, R73) — el contexto de las llamadas facturadas de un recalculo: el motivo de
   * §13.1 y el intento del job (1 de 1 fuera de la cola).
   */
  private contextoLlamada(
    mensajeroId: string,
    recalculo: MotivoReoptimizar,
    opts: EjecutarOptimizacionOpts,
  ): ContextoLlamadaRuta {
    const intento =
      opts.job !== undefined
        ? { intento: opts.job.intento, maxIntentos: opts.job.maxIntentos }
        : FUERA_DE_COLA;
    return {
      motivo: motivoLlamadaRuta(recalculo, opts.motivo, opts.job?.origen ?? null),
      mensajeroId,
      ...intento,
    };
  }

  /**
   * SLT-59 (R46, design §2.4) — la escritura de la ubicacion recibida, en el sitio donde ya se
   * sabe que se va a recalcular. Hace falta aunque `reemplazarSecuencia` lleve el origen: esa
   * escritura no toca `origen_at`, y sin esta la siguiente ejecucion veria un `gps` recien
   * capturado con el instante viejo y lo bajaria a `ultima_conocida`.
   */
  private async persistirUbicacion(
    mensajeroId: string,
    ubicacion: { lat: number; lng: number; capturadaAt: Date; fuente: "gps" } | null,
  ): Promise<void> {
    if (ubicacion === null) return;
    await this.rutas.upsertOrigen(mensajeroId, ubicacion);
  }

  /**
   * SLT-59 (R11-R18, design §2.2) — persiste la secuencia previa sin las paradas que faltan y
   * devuelve el trazado rehecho (o `null` si no hay, no se pudo, o no se escribio).
   *
   * NUNCA LANZA POR EL TRAMO PUENTE (R16): el orden reducido ya es correcto sin dibujo, y
   * propagar el fallo haria reintentar el job para arreglar lo accesorio.
   *
   * [2026-10-30, SLT-59, D16] Ya no hay tramo puente (R14, D14) ni parametro que permita
   * llamar: la reduccion es solo de un prefijo (R41) y se resuelve siempre con R13 o R15, sin
   * llamadas. R16 queda retirado: no hay llamada que pueda fallar.
   *
   * [2026-10-31, SLT-59, D19/m3, R49] Devuelve el desenlace, no solo el trazado: si la escritura
   * condicionada no se aplica, el resultado es `reduccion_descartada` y no `reducida`, para que
   * el job y la accion no informen de una reduccion que no existe.
   */
  private async aplicarReduccion(
    mensajeroId: string,
    ruta: RutaOptimizadaDTO,
    decision: { previa: string[]; restantes: string[] },
    origen: { lat: number; lng: number } | null,
  ): Promise<EjecutarOptimizacionResult> {
    const { previa, restantes } = decision;
    const plan = planificarReduccion(ruta, restantes);
    const tramos: TramoPersistido[] | null =
      plan.tipo === "concatenar"
        ? restantes.map((id) => ruta.tramoPorOrden.get(id) as TramoPersistido)
        : null;
    const trazado = tramos !== null ? trazadoConcatenado(tramos) : null;

    // R18: sin huella previa no hay con que condicionar la escritura, y escribir sin condicion
    // podria pisar una optimizacion que entro mientras tanto. Se trata como huella cambiada.
    const aplicada =
      ruta.huellaSet !== null &&
      (await this.rutas.reducirSecuencia(mensajeroId, ruta.huellaSet, {
        huellaSet: this.huella(restantes, origen),
        paradas: restantes.map((ordenId, i) => ({ ordenId, tramo: tramos?.[i] ?? null })),
        trazado:
          trazado === null
            ? null
            : {
                encodedPolyline: trazado.encodedPolyline,
                distanciaM: trazado.distanciaM,
                duracionS: trazado.duracionS,
                fuente: "routes",
              },
      }));
    optlog("service — reduccion", {
      plan: plan.tipo,
      quitadas: previa.length - restantes.length,
      restantes: restantes.length,
      conTrazado: trazado !== null,
      aplicada,
    });
    if (!aplicada) return { status: "omitida", razon: "reduccion_descartada" };
    return {
      status: "omitida",
      razon: "reducida",
      ...(trazado !== null ? { trazado } : {}),
    };
  }

  /**
   * Guarda el trazado para que la proxima lectura —y la proxima guarda R36— tengan linea que
   * pintar sin volver a llamar a Routes.
   *
   * ═══ SOLO SE CACHEA `routes`. EL FALLBACK LOCAL NO ═══
   * Un trazado `local` no es un resultado: es la marca de que Google no contesto. Cachearlo
   * congelaria lineas RECTAS hasta que cambie el conjunto de paradas, porque la guarda R36
   * cortaria antes de reintentar. Dejando la columna vacia, el proximo disparo vuelve a
   * pedirle el dibujo a Routes y el mapa se cura solo en cuanto el proveedor vuelva.
   * El precio es alguna llamada de mas mientras Routes este caido; es el lado barato del error.
   *
   * [2026-10-29, SLT-59, D8] Con la guarda R36 nueva (conjunto + desvio) el movimiento normal
   * del mensajero ya no cambia nada: una ruta sin dibujo cacheado se queda sin el hasta que
   * cambie el conjunto o el mensajero se desvie (SLT-59 design §10, limite 2 de la 265).
   *
   * NUNCA LANZA: se llega aqui con la secuencia YA persistida. Fallar por no haber podido
   * guardar el DIBUJO provocaria un reintento que volveria a pagar la OPTIMIZACION —la cara—
   * para arreglar lo accesorio. Mismo criterio que `trazar`.
   */
  /**
   * Trayecto EN VIVO desde la posicion actual hasta UNA parada. Ver el contrato para el
   * porque de que esto no se pueda cachear.
   *
   * ═══ EL ORDEN DE LAS GUARDAS ES EL DE SIEMPRE: LO BARATO PRIMERO ═══
   *   1. intervalo minimo  -> 0 llamadas, 0 lecturas de paradas
   *   2. sin cliente Routes-> 0 llamadas
   *   3. la parada es suya -> 0 llamadas si no lo es
   * Solo despues se llama al proveedor.
   *
   * LA COMPROBACION DE PERTENENCIA ES LA AUTORIZACION, no una validacion de forma.
   * `findParadasEnReparto` devuelve EXACTAMENTE las paradas en reparto de ESTE mensajero, asi
   * que buscar el `ordenId` ahi dentro responde de una vez «¿existe?» y «¿es suya?». Sin esto,
   * cualquier mensajero con sesion podria pedir el trayecto a la guia de otro y, de paso,
   * averiguar sus coordenadas de entrega (R14).
   */
  async trazarTramoVivo(
    mensajeroId: string,
    input: { ubicacion: { lat: number; lng: number }; ordenId: string },
  ): Promise<TrazarTramoVivoResult> {
    const ahora = this.now();
    const ruta = await this.rutas.findByMensajero(mensajeroId);

    if (ruta?.tramoVivoAt != null) {
      const transcurridoS = (ahora.getTime() - ruta.tramoVivoAt.getTime()) / 1000;
      if (transcurridoS < this.config.RUTA_SYNC_MIN_INTERVALO_S) {
        optlog("service — tramo vivo: intervalo minimo, 0 llamadas facturadas", {
          transcurridoS,
          minimoS: this.config.RUTA_SYNC_MIN_INTERVALO_S,
        });
        return { status: "intervalo_minimo" };
      }
    }

    if (this.routes === null) {
      optlog("service — tramo vivo: sin cliente de Routes");
      return { status: "no_disponible" };
    }

    const paradas = await this.paradasRepo.findParadasEnReparto(mensajeroId);
    const destino = paradas.find((p) => p.ordenId === input.ordenId);
    if (destino === undefined || destino.latitud === null || destino.longitud === null) {
      // Una parada suya pero SIN geocodificar cae aqui tambien. Es correcto: no hay punto al
      // que trazar, y el mensajero no puede distinguir ese caso del de una guia ajena — ni
      // falta que le hace.
      optlog("service — tramo vivo: la parada no es suya o no tiene coordenadas");
      return { status: "no_autorizada" };
    }

    optlog("service — tramo vivo: ninguna guarda corto, se LLAMA a Routes (esto se factura)");
    let outcome;
    try {
      outcome = await this.routes.trazar(
        {
          origen: input.ubicacion,
          paradasEnOrden: [
            { ordenId: destino.ordenId, lat: destino.latitud, lng: destino.longitud },
          ],
        },
        // SLT-59 (§13.1): el boton del trayecto no viene de la cola.
        { motivo: "trayecto_vivo", mensajeroId, ...FUERA_DE_COLA },
      );
    } catch (error) {
      // Se traga la excepcion como en `trazar`: esto es apoyo visual, no una operacion.
      opterror("service — tramo vivo: el proveedor lanzo", error);
      return { status: "no_disponible" };
    }

    if (outcome.status !== "ok") {
      optlog("service — tramo vivo: el proveedor no dio geometria", { status: outcome.status });
      return { status: "no_disponible" };
    }

    // Se sella DESPUES del exito: cobrarle el intervalo por un intento que no le devolvio nada
    // dejaria al mensajero esperando sin haber recibido su trayecto.
    await this.rutas.marcarTramoVivo(mensajeroId, ahora);
    return {
      status: "ok",
      encodedPolyline: outcome.encodedPolyline,
      distanciaM: outcome.distanciaM,
      duracionS: outcome.duracionS,
    };
  }

  /**
   * Rearma el trazado del dominio a partir de lo persistido. La cabecera guarda la polilinea
   * entera; los tramos viven repartidos por las filas de las paradas, asi que hay que volver a
   * ordenarlos POR SECUENCIA — el `Map` no tiene orden util.
   *
   * TODO O NADA con los tramos, igual que en el cliente: se consumen por indice, asi que si a
   * alguna parada le falta el suyo se devuelven vacios. La polilinea entera sigue sirviendo.
   */
  private trazadoDesdeCache(ruta: RutaOptimizadaDTO): TrazadoRuta | null {
    if (ruta.trazado === null) return null;
    const enOrden = [...ruta.secuenciaPorOrden.entries()].sort((a, b) => a[1] - b[1]);
    const tramos = enOrden.map(([ordenId]) => ruta.tramoPorOrden.get(ordenId));
    const completos = tramos.every((t) => t !== undefined);
    return {
      ...ruta.trazado,
      tramos: completos && tramos.length > 0 ? (tramos as TrazadoTramo[]) : [],
    };
  }

  private async persistirTrazado(
    mensajeroId: string,
    huellaSet: string,
    trazado: TrazadoRuta | null,
  ): Promise<void> {
    if (trazado === null || trazado.fuente !== "routes") {
      optlog("service — trazado NO cacheado", { fuente: trazado?.fuente ?? "ninguno" });
      return;
    }
    try {
      await this.rutas.guardarTrazado(mensajeroId, huellaSet, trazado, trazado.tramos);
      optlog("service — trazado persistido", {
        fuente: trazado.fuente,
        tramos: trazado.tramos.length,
      });
    } catch (error) {
      opterror("service — no se pudo persistir el trazado; se sigue igual", error);
    }
  }

  /**
   * Pide a Google Routes la POLILINEA de la secuencia recien calculada. Devuelve `null` si
   * no hay cliente de trazado o si el trazado no salio: nunca lanza.
   *
   * POR QUE NO PROPAGA NINGUN FALLO: el trazado es accesorio. La ruta ya esta optimizada y
   * PERSISTIDA cuando se llega aqui; hacer fallar el job por no haber podido dibujarla
   * provocaria un reintento que volveria a pagar la optimizacion —la cara— para arreglar el
   * dibujo —lo barato—. Si Routes falla, el mensajero se queda sin linea en el mapa y con
   * su lista de paradas intacta.
   *
   * ⚠️ ESTO NO SE PERSISTE TODAVIA. `ruta_optimizada` no tiene columna para la polilinea, y
   * anadirla es una migracion. Por ahora el trazado viaja en el resultado (util para el
   * disparo manual) y queda en la traza. Ver el seguimiento anotado en el spec.
   */
  private async trazar(
    secuencia: string[],
    paradas: { ordenId: string; latitud: number; longitud: number }[],
    origen: { lat: number; lng: number },
    contexto: ContextoLlamadaRuta,
  ): Promise<TrazadoRuta | null> {
    // La secuencia son `ordenId`; dibujar necesita COORDENADAS. Este mapa es el puente, y
    // reordena `paradas` al orden que decidio la optimizacion.
    const porOrdenId = new Map(paradas.map((p) => [p.ordenId, p]));
    const paradasEnOrden = secuencia
      .map((ordenId) => porOrdenId.get(ordenId))
      .filter((p): p is { ordenId: string; latitud: number; longitud: number } => p !== undefined)
      .map((p) => ({ ordenId: p.ordenId, lat: p.latitud, lng: p.longitud }));

    if (paradasEnOrden.length !== secuencia.length) {
      // No deberia pasar: el cliente ya valida que la secuencia cubra todas las paradas.
      // Sin correspondencia completa no se dibuja NADA: una linea a la que le falta una
      // parada es peor que ninguna linea, porque parece correcta.
      optlog("service — trazado omitido: la secuencia no cuadra con las paradas", {
        secuencia: secuencia.length,
        resueltas: paradasEnOrden.length,
      });
      return null;
    }

    // ── Trazado REAL, por calles ──────────────────────────────────────────────────
    if (this.routes !== null) {
      let outcome;
      try {
        outcome = await this.routes.trazar({ origen, paradasEnOrden }, contexto);
      } catch (error) {
        // Ni siquiera una excepcion cancela el dibujo: se cae al trazado local.
        opterror("service — el trazado por calles lanzo; se usa el local", error);
        outcome = null;
      }
      if (outcome !== null && outcome.status === "ok") {
        optlog("service — trazado obtenido de Routes (por calles)", {
          distanciaM: outcome.distanciaM,
          duracionS: outcome.duracionS,
          polilineaChars: outcome.encodedPolyline.length,
          tramos: outcome.tramos.length,
        });
        return {
          encodedPolyline: outcome.encodedPolyline,
          distanciaM: outcome.distanciaM,
          duracionS: outcome.duracionS,
          fuente: "routes",
          tramos: outcome.tramos,
        };
      }
      optlog("service — Routes no dio polilinea; se cae al trazado local", {
        status: outcome?.status ?? "excepcion",
      });
    } else {
      optlog("service — sin cliente de Routes; trazado local directo");
    }

    // ── Trazado LOCAL, en linea recta ─────────────────────────────────────────────
    // Gratis, sin red y siempre disponible: se aplica IGUAL venga la secuencia de Google o
    // del fallback Haversine. Une origen + paradas en el orden calculado.
    const puntos = [origen, ...paradasEnOrden.map((p) => ({ lat: p.lat, lng: p.lng }))];
    const encodedPolyline = codificarPolilinea(puntos);
    const distanciaM = distanciaTotalM(puntos);
    // Se loguea el TAMANO, nunca la polilinea: decodificarla devuelve las coordenadas de los
    // domicilios de entrega una por una (R14, cabecera de este archivo).
    optlog("service — trazado LOCAL (lineas rectas entre paradas)", {
      puntos: puntos.length,
      distanciaM,
      polilineaChars: encodedPolyline.length,
    });
    // `duracionS` va a null a proposito: sin calles no hay tiempo de viaje que estimar, y
    // una cifra inventada acabaria mostrandose al mensajero como si fuera real.
    // `tramos` vacio: el trazado local es UNA recta continua por todos los puntos. Partirla
    // daria segmentos que no describen ningun recorrido, solo la cuerda entre dos domicilios.
    return { encodedPolyline, distanciaM, duracionS: null, fuente: "local", tramos: [] };
  }

  /**
   * R24/R25 — resolucion del ORIGEN, en tres escalones. NUNCA falla ni bloquea: la
   * denegacion del permiso de geolocalizacion en el navegador simplemente hace que no
   * llegue `ubicacion`, y se cae al escalon siguiente (R25).
   *
   *   1. `gps` con antiguedad < RUTA_ORIGEN_TTL_MIN   -> fuente "gps"
   *   2. la ultima conocida AUNQUE este vencida        -> fuente "ultima_conocida"
   *   3. el CENTROIDE de las paradas                   -> fuente "centroide"
   *
   * No hay cuarto escalon: si no hubiera ni una parada con coordenadas, la guarda R35 ya
   * habria cortado antes de llegar aqui. El centroide se eligio porque el esquema NO tiene
   * coordenadas de zona ni de bodega (verificado) y no requiere ninguna llamada externa;
   * anadirlas queda como seguimiento (design §11.2).
   *
   * La fuente se PERSISTE y se muestra en la UI: el mensajero debe saber cuando la ruta se
   * calculo desde un punto aproximado.
   */
  private resolverOrigen(
    ruta: OrigenGuardado | null,
    paradas: { latitud: number; longitud: number }[],
    ahora: Date,
  ): { lat: number; lng: number; fuente: OrigenFuente } {
    if (ruta !== null && ruta.origenLat !== null && ruta.origenLng !== null) {
      const vigente =
        ruta.origenAt !== null &&
        ahora.getTime() - ruta.origenAt.getTime() <= this.config.RUTA_ORIGEN_TTL_MIN * 60_000;
      return {
        lat: ruta.origenLat,
        lng: ruta.origenLng,
        // Escalon 1 vs 2: la MISMA coordenada, pero la fuente cambia para que la UI pueda
        // avisar de que el punto de partida esta viejo.
        fuente: vigente && ruta.origenFuente === "gps" ? "gps" : "ultima_conocida",
      };
    }
    // Escalon 3: centroide aritmetico de las paradas (la cuenta vive en `centroide`).
    return { ...centroide(paradas), fuente: "centroide" };
  }

  /**
   * Feature 265 (R16-R23, design §6) — ¿EL ORIGEN GUARDA RELACION CON LAS PARADAS?
   *
   * Medida: distancia de circulo maximo entre el origen y el centroide de las paradas que de
   * verdad se van a enviar. Por encima de `RUTA_ORIGEN_MAX_KM` el origen se DESCARTA y se baja
   * al escalon 3 de la escalera que la 92 ya diseño (gps -> ultima_conocida -> centroide).
   *
   * ═══ POR QUE SE SUSTITUYE Y NO SE CORTA EL TRABAJO (R23, alternativa A7) ═══
   * Lo que esta roto es el punto de PARTIDA, no las paradas. Un mensajero con seis entregas
   * tiene una ruta razonable entre ellas aunque no sepamos desde donde arranca; cortar el job
   * le deja sin ninguna y reintroduce el bucle de reintentos que la 265 vino a cerrar.
   *
   * TRES PROPIEDADES QUE HAY QUE CONSERVAR SI ESTO SE TOCA:
   *  · NO aplica cuando el origen YA es el centroide (R18): seria comparar un punto consigo
   *    mismo —siempre 0— y ademas garantiza que la sustitucion no puede entrar en bucle.
   *  · NO mira el TTL. Frescura y coherencia son cosas distintas: el origen del incidente era
   *    `gps` RECIENTE y estaba en otro pais. Un TTL vencido ya tiene su propio tratamiento.
   *  · ES PURA Y GRATIS (R22): dos sumas y una raiz sobre datos ya cargados. Cero llamadas
   *    facturadas, cero lecturas de base.
   */
  private origenCoherente(
    origen: { lat: number; lng: number; fuente: OrigenFuente },
    paradas: { latitud: number; longitud: number }[],
  ): { lat: number; lng: number; fuente: OrigenFuente } {
    if (origen.fuente === "centroide") return origen;
    const centro = centroide(paradas);
    const km = distanciaHaversineKm(origen, centro);
    if (km <= this.config.RUTA_ORIGEN_MAX_KM) return origen;

    optlog("service — guarda 265/R16: origen incoherente, se sustituye por el centroide", {
      km: Math.round(km),
      maxKm: this.config.RUTA_ORIGEN_MAX_KM,
      fuenteDescartada: origen.fuente,
      paradas: paradas.length,
    });
    // Aviso AGREGADO (R19): distancia redondeada y numero de paradas. NUNCA coordenadas.
    this.logger.warn(
      `[optimizacion_ruta] origen descartado por incoherencia geografica: ${Math.round(km)} km ` +
        `del centroide de ${paradas.length} paradas (maximo ${this.config.RUTA_ORIGEN_MAX_KM} km); ` +
        "se usa el centroide",
    );
    return { ...centro, fuente: "centroide" };
  }

  /**
   * Caso borde de R35 con CERO paradas: no hay centroide posible (dividir entre cero). Se
   * usa la ultima ubicacion conocida si la hay, y `null` si tampoco. La secuencia vieja se
   * limpia igual: el mensajero entrego todo y no quedan paradas que ordenar.
   */
  private origenSoloDeUltimaConocida(
    ruta: OrigenGuardado | null,
  ): { lat: number; lng: number; fuente: OrigenFuente } | null {
    if (ruta === null || ruta.origenLat === null || ruta.origenLng === null) return null;
    return { lat: ruta.origenLat, lng: ruta.origenLng, fuente: "ultima_conocida" };
  }

  /**
   * R36 — huella del conjunto de paradas + origen. Los ids se ORDENAN antes de hashear:
   * la huella identifica el CONJUNTO, no el orden de lectura (si dependiera del orden,
   * cualquier reordenacion de la consulta dispararia una llamada facturada de mas).
   * El origen se redondea (ver `ORIGEN_DECIMALES`) para absorber el jitter del GPS.
   *
   * [2026-10-29, SLT-59, D8] Ya no es el criterio de «sin cambios» (ver `decidirGuardaRuta`);
   * se conserva igual porque condiciona `guardarTrazado` y `reducirSecuencia` (R18).
   */
  private huella(
    ordenIds: string[],
    origen: { lat: number; lng: number } | null,
  ): string {
    const ids = [...ordenIds].sort().join(",");
    const punto =
      origen === null
        ? "sin-origen"
        : `${origen.lat.toFixed(ORIGEN_DECIMALES)},${origen.lng.toFixed(ORIGEN_DECIMALES)}`;
    return createHash("sha256").update(`${punto}|${ids}`, "utf8").digest("hex");
  }
}
