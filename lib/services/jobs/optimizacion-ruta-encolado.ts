// Feature 92 (design §4, R16-R19) — encolado del job de reoptimizacion de ruta desde los
// writers del mensajero, con el patron TRANSACTIONAL OUTBOX: la insercion del job va
// DENTRO de la transaccion del writer (4.º parametro `tx` de `IJobRepository.enqueue`). Si
// la transaccion del writer revierte, el job desaparece con ella: no hay reoptimizacion de
// una recogida que no ocurrio.
//
// ══════════════════════════════════════════════════════════════════════════════════════
// §4.1 — DOS ESPACIOS DE CLAVES DISJUNTOS. ESTO ES NORMATIVO, NO ESTILO.
// ══════════════════════════════════════════════════════════════════════════════════════
// El problema real: `JobRepository.enqueue` hace `ON CONFLICT ("dedupe_key") DO NOTHING`.
// Si el disparo INMEDIATO (gestion) compartiera espacio de claves con el disparo con
// DEBOUNCE (recogida), un debounce en vuelo TRAGARIA el inmediato EN SILENCIO: sin error,
// sin log, sin job. El mensajero registraria una entrega y su ruta no se recalcularia.
//
// Se resuelve con dos namespaces que NUNCA colisionan: `:debounce:` y `:inmediato:`.
//
// El precio es que el job de debounce en vuelo TAMBIEN correra al vencer su minuto, y no
// se puede cancelar: `IJobRepository` no expone cancelacion (verificado) y NO se le anade
// (design §4.1, alternativa D descartada — ampliar un contrato compartido con las features
// 90 y 91 por un caso que se resuelve en el handler). Por eso existe R20: la guarda de
// obsolescencia de `OptimizacionRutaService` completa el job SIN llamar al proveedor si
// una optimizacion posterior al evento ya cubrio el trabajo. Coste evitado sin
// infraestructura nueva.
//
// ⏳ 2026-10-29 (SLT-59, D2/D12; R21-R23, design §3.1): la gestion YA NO es inmediata. Va con
// debounce y comparte la clave `:debounce:` con la recogida y el traspaso, asi que un job en vuelo
// la TRAGA — y ahora eso es lo buscado: ese job corre despues y lee el conjunto al ejecutarse. El
// namespace `:inmediato:` y su helper se retiraron. La entrega en orden no espera a la cola: se
// reduce en la propia peticion (R27). Lo de arriba queda como historia de por que existio.
//
// ══════════════════════════════════════════════════════════════════════════════════════
// §4.2 — LA VENTANA TEMPORAL DE LA CLAVE DE DEBOUNCE ES OBLIGATORIA (R18).
// ══════════════════════════════════════════════════════════════════════════════════════
// Sin ella, `optimizacion_ruta:<mensajeroId>:debounce` quedaria ocupada PARA SIEMPRE por
// la primera fila `done`: el indice unico de `dedupe_key` NO esta acotado por estado y las
// filas completadas no se purgan. La segunda recogida del mensajero —y todas las demas,
// para siempre— se descartarian en silencio. Es la trampa exacta que documento el gate
// F1.4-Q4 de la feature 91.
import type {
  IJobRepository,
  IJobRepositoryMovible,
  JobTxClient,
} from "@/lib/interfaces/repositories/IJobRepository";
import { loadRouteOptimizationConfig } from "@/lib/config/route-optimization";
import { inicioDelDiaCREnUtc } from "@/lib/utils/fecha-cr";

/**
 * SLT-59 (design §13.1, D28/D29) — que evento encolo el job. No es PII. Hoy solo lo escribe la
 * recogida de la primera ruta del dia (R58, R76); la Fase 8 lo lee para el motivo de la llamada.
 */
export const ORIGENES_JOB_RUTA = ["recogida", "recogida_parcial", "gestion", "traspaso"] as const;
export type OrigenJobRuta = (typeof ORIGENES_JOB_RUTA)[number];

/** Prefijo del `dedupe_key` (patron `DEDUPE_PREFIX` de liberar-reprogramadas / 91). */
export const DEDUPE_PREFIX = "optimizacion_ruta";

/** Duracion de la ventana de agrupacion, en ms. Fija: define el ESPACIO de claves. */
const VENTANA_MS = 60_000;

/**
 * R17/R18 — clave del disparo con DEBOUNCE. La ventana se calcula sobre el `runAfter`
 * (el instante en que el job DEBE correr), no sobre `now`: dos recogidas cuyo `runAfter`
 * cae en el mismo minuto producen la misma clave, la segunda se descarta y el job corre
 * en el `runAfter` de la PRIMERA — que es exactamente la semantica pedida.
 *
 * Efecto de borde honesto: si el segundo evento cae cerca del final de la ventana, el
 * debounce EFECTIVO para ese segundo evento puede ser menor a 60 s (nunca mayor a 120 s).
 * Se acepta: nunca dispara de mas y nunca deja de disparar.
 */
export function dedupeKeyDebounce(mensajeroId: string, runAfter: Date): string {
  const ventana = Math.floor(runAfter.getTime() / VENTANA_MS);
  return `${DEDUPE_PREFIX}:${mensajeroId}:debounce:${ventana}`;
}

/**
 * R16: encola la reoptimizacion DIFERIDA `debounceS` segundos, dentro de la transaccion
 * del writer. Recoger 8 paquetes seguidos produce UN job, no ocho.
 *
 * El payload lleva SOLO el `mensajeroId` — ni coordenadas ni direcciones (regla de PII
 * heredada de la 91). El handler releera todo lo que necesite.
 */
export async function encolarOptimizacionDebounce(
  repo: IJobRepository,
  tx: JobTxClient | undefined,
  mensajeroId: string,
  opts: { ahora: Date; debounceS: number },
): Promise<void> {
  const runAfter = new Date(opts.ahora.getTime() + opts.debounceS * 1000);
  await repo.enqueue(
    "optimizacion_ruta",
    { mensajeroId },
    {
      runAfter,
      dedupeKey: dedupeKeyDebounce(mensajeroId, runAfter),
      // SLT-59 (R32, D9): antes una constante de 5. Las filas ya encoladas conservan el suyo.
      maxIntentos: loadRouteOptimizationConfig().RUTA_OPT_MAX_INTENTOS,
    },
    tx,
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════
// SLT-59 (R57, R58, R76, R77; design §12.2 y su nota D29) — LA PRIMERA RUTA DEL DIA, POR RECOGIDA.
// ══════════════════════════════════════════════════════════════════════════════════════
// Mientras el mensajero carga en bodega, cada recogida NO paga una optimizacion (Route Optimization
// factura POR ENVIO). Deja UN job por mensajero y dia, con una clave propia que NO es por ventana:
//   - quedan paquetes por recoger -> `ahora + RUTA_PRIMERA_DEBOUNCE_MIN` (debounce deslizante, R76);
//   - era el ultimo               -> `ahora + RUTA_DEBOUNCE_S` (R58).
// Cada recogida MUEVE el mismo job (`encolarOMoverPendiente`); si ya corrio, ni se crea ni se toca
// (R77). La clave vive en otro espacio que `:debounce:`, asi que no traga ni es tragada por los
// jobs de gestion y traspaso.

/** Clave del job de la primera ruta: una por mensajero y dia de Costa Rica (`YYYY-MM-DD`). */
export function dedupeKeyPrimeraRecogida(mensajeroId: string, diaCR: string): string {
  return `ruta-opt:primera-recogida:${mensajeroId}:${diaCR}`;
}

/**
 * Glosario «primera ruta pendiente»: la ruta nunca se calculo o se calculo antes de que empezara
 * el dia `diaCR` en Costa Rica. Puro: no lee nada (R67).
 */
export function primeraRutaPendiente(calculadaAt: Date | null, diaCR: string): boolean {
  return calculadaAt === null || calculadaAt.getTime() < inicioDelDiaCREnUtc(diaCR).getTime();
}

/**
 * R58/R76: deja o mueve el job de la primera ruta del dia. Quien llama ya comprobo que la primera
 * ruta esta pendiente; aqui solo se decide CUANDO corre y con que `origen`.
 */
export async function encolarPrimeraRutaPorRecogida(
  repo: IJobRepositoryMovible,
  tx: JobTxClient | undefined,
  mensajeroId: string,
  opts: { ahora: Date; diaCR: string; quedanPorRecoger: boolean },
): Promise<void> {
  const config = loadRouteOptimizationConfig();
  const esperaMs = opts.quedanPorRecoger
    ? config.RUTA_PRIMERA_DEBOUNCE_MIN * 60_000
    : config.RUTA_DEBOUNCE_S * 1000;
  const origen: OrigenJobRuta = opts.quedanPorRecoger ? "recogida_parcial" : "recogida";
  await repo.encolarOMoverPendiente(
    "optimizacion_ruta",
    { mensajeroId, origen },
    {
      runAfter: new Date(opts.ahora.getTime() + esperaMs),
      dedupeKey: dedupeKeyPrimeraRecogida(mensajeroId, opts.diaCR),
      maxIntentos: config.RUTA_OPT_MAX_INTENTOS,
    },
    tx,
  );
}
