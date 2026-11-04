// SLT-42 (R22, R23) — calendario de una zona horaria IANA: la unica pieza del servidor que sabe
// convertir entre un instante y el calendario local. Modulo PURO: sin DB, sin `process.env`.
//
// Todo se resuelve con `Intl.DateTimeFormat` (`timeZone`, `hourCycle: "h23"`) y nunca con un desfase
// fijo, porque un desfase fijo se rompe en las zonas con horario de verano: el dia de cambio dura 23
// o 25 horas y sumar 24 h cae en la fecha equivocada (R23). Por eso la aritmetica de dias se hace
// sobre la fecha calendario (`YYYY-MM-DD`) y no sobre milisegundos.
//
// Las convenciones son las de `fecha-cr.ts`, que ahora envuelve estas funciones para la UI:
//   - `inicioDelDiaComoFecha` devuelve la MEDIANOCHE UTC de la fecha local (convencion `@db.Date`).
//   - `inicioDelDiaEnUtc` devuelve el INSTANTE REAL de las 00:00 locales (cota de un `timestamp`).
// Son instantes distintos (separados por el desfase de la zona): la primera NO sirve como cota de un
// `timestamp` y la segunda NO sirve para comparar contra una columna `@db.Date`.

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Un formateador por zona: crearlos es caro y la zona es un dato de plataforma, no de una empresa
// (R30 habla de los datos del pais leidos para una empresa; un `Intl` por nombre de zona no lo es).
const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formateadores.set(zona, f);
  }
  return f;
}

interface Pared {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

// Memo por zona de las dos conversiones caras. `formatToParts` cuesta microsegundos por llamada y
// el troceo de una serie o un barrido de fechas la pide millones de veces con los MISMOS instantes
// (inicios de dia, mediodias): sin memo, `fecha-cr.ts` paso de aritmetica pura a ~30x mas lento y
// los barridos de 366/400 dias se salian del `testTimeout`. Ambas funciones son puras (zona + ms ->
// resultado), asi que memoizar no cambia ningun resultado. El tope evita crecer sin limite en un
// proceso largo: al llenarse, el mapa de esa zona se vacia entero (sencillo y suficiente).
const TOPE_MEMO = 20_000;
const memoPared = new Map<string, Map<number, Pared>>();
const memoInstante = new Map<string, Map<number, number>>();

function memoDeZona<V>(memo: Map<string, Map<number, V>>, zona: string): Map<number, V> {
  let m = memo.get(zona);
  if (!m) {
    m = new Map<number, V>();
    memo.set(zona, m);
  } else if (m.size >= TOPE_MEMO) {
    m.clear();
  }
  return m;
}

function pared(instante: Date, zona: string): Pared {
  const t = instante.getTime();
  const memo = memoDeZona(memoPared, zona);
  const guardada = memo.get(t);
  if (guardada) return guardada;
  const calculada = paredSinMemo(instante, zona);
  // Un instante invalido da campos NaN: no se guarda (NaN como clave no aporta nada).
  if (!Number.isNaN(t)) memo.set(t, calculada);
  return calculada;
}

function paredSinMemo(instante: Date, zona: string): Pared {
  const p: Record<string, number> = {};
  for (const parte of formateador(zona).formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  return {
    anio: p.year,
    mes: p.month,
    dia: p.day,
    hora: p.hour,
    minuto: p.minute,
    segundo: p.second,
  };
}

/** La hora de pared de `instante` leida como si fuera UTC, en ms (incluye los ms del instante). */
function paredComoUtcMs(instante: Date, zona: string): number {
  const w = pared(instante, zona);
  const ms = ((instante.getTime() % 1000) + 1000) % 1000;
  return Date.UTC(w.anio, w.mes - 1, w.dia, w.hora, w.minuto, w.segundo, ms);
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function aFecha(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`;
}

/** `YYYY-MM-DD` -> medianoche UTC de esa fecha (NaN si no tiene la forma). */
function fechaAUtcMs(fecha: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Suma dias de CALENDARIO a una fecha `YYYY-MM-DD` (no 24 h: ver la cabecera). */
function sumarDias(fecha: string, dias: number): string {
  return aFecha(fechaAUtcMs(fecha) + dias * UN_DIA_MS);
}

/**
 * Instante en que la pared de `zona` marca `objetivoMs` (una hora de pared leida como UTC).
 *
 * Si esa hora existe dos veces (se atrasa el reloj), devuelve la primera. Si no existe (se adelanta
 * el reloj y la salta), devuelve el primer instante posterior al salto: es el primero cuya pared es
 * igual o posterior al objetivo, que es lo que R23 pide para el comienzo de un dia sin 00:00.
 */
function instanteDePared(objetivoMs: number, zona: string): Date {
  if (Number.isNaN(objetivoMs)) return new Date(Number.NaN);
  const memo = memoDeZona(memoInstante, zona);
  let t = memo.get(objetivoMs);
  if (t === undefined) {
    t = instanteDeParedSinMemo(objetivoMs, zona).getTime();
    memo.set(objetivoMs, t);
  }
  // Siempre un `Date` nuevo: quien lo recibe puede mutarlo sin tocar el memo.
  return new Date(t);
}

function instanteDeParedSinMemo(objetivoMs: number, zona: string): Date {
  // Desfases alrededor del objetivo: como mucho hay un cambio de hora en esta ventana.
  const desfases = new Set(
    [-UN_DIA_MS, 0, UN_DIA_MS].map((d) => desfaseEnMs(new Date(objetivoMs + d), zona)),
  );
  const exactos = [...desfases]
    .map((o) => objetivoMs + o)
    .filter((t) => paredComoUtcMs(new Date(t), zona) === objetivoMs);
  if (exactos.length > 0) return new Date(Math.min(...exactos));

  // Hueco del cambio de hora: busqueda binaria del primer instante con pared >= objetivo.
  let lo = objetivoMs + Math.min(...desfases);
  let hi = objetivoMs + Math.max(...desfases);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (paredComoUtcMs(new Date(mid), zona) >= objetivoMs) hi = mid;
    else lo = mid + 1;
  }
  return new Date(lo);
}

/**
 * Desfase de `zona` en `instante`, con el mismo signo que el desfase fijo que tenia `fecha-cr.ts`:
 * `UTC - hora de pared`. Una zona UTC-6 da `+6 h`; la pared se obtiene como `instante - desfase`.
 * Depende del instante porque en una zona con horario de verano cambia a lo largo del año.
 */
export function desfaseEnMs(instante: Date, zona: string): number {
  return instante.getTime() - paredComoUtcMs(instante, zona);
}

/** Fecha CALENDARIO `YYYY-MM-DD` de `zona` en el instante `now` (nunca `toISOString`, que es UTC). */
export function fechaCalendario(now: Date, zona: string): string {
  const w = pared(now, zona);
  return `${w.anio}-${dosDigitos(w.mes)}-${dosDigitos(w.dia)}`;
}

/**
 * Medianoche UTC de la fecha calendario de `zona` en `now` (convencion `@db.Date`). NO es el
 * instante en que empieza el dia local: para cotas de un `timestamp`, `inicioDelDiaEnUtc`.
 */
export function inicioDelDiaComoFecha(now: Date, zona: string): Date {
  return new Date(fechaAUtcMs(fechaCalendario(now, zona)));
}

/**
 * INSTANTE real de las 00:00 locales de `fecha` (`YYYY-MM-DD`, ya validada) en `zona`. El desfase se
 * resuelve en la medianoche de ESE dia, no en otro momento: en un dia de cambio de hora el de la
 * tarde es otro. Si las 00:00 no existen ese dia, el primer instante del dia local (R23).
 */
export function inicioDelDiaEnUtc(fecha: string, zona: string): Date {
  return instanteDePared(fechaAUtcMs(fecha), zona);
}

/**
 * INSTANTE del comienzo del dia SIGUIENTE a `fecha`: la cota superior EXCLUSIVA que hace inclusivo
 * un `hasta`. No es `inicioDelDiaEnUtc(fecha) + 24 h`: el dia de cambio de hora dura 23 o 25 h.
 */
export function inicioDelDiaSiguienteEnUtc(fecha: string, zona: string): Date {
  return inicioDelDiaEnUtc(sumarDias(fecha, 1), zona);
}

/** Fecha calendario de MAÑANA en `zona` (`YYYY-MM-DD`). */
export function manana(now: Date, zona: string): string {
  return sumarDias(fechaCalendario(now, zona), 1);
}

/** «Ultimos N dias» como rango de fechas calendario, contando hoy (por eso retrocede `N - 1`). */
export function ultimosNDias(
  dias: number,
  now: Date,
  zona: string,
): { desde: string; hasta: string } {
  const hasta = fechaCalendario(now, zona);
  return { desde: sumarDias(hasta, -(dias - 1)), hasta };
}

/** INSTANTE en que empieza «ultimos N dias»: las 00:00 locales de hace `N - 1` dias. */
export function inicioDeUltimosNDiasEnUtc(dias: number, now: Date, zona: string): Date {
  return inicioDelDiaEnUtc(ultimosNDias(dias, now, zona).desde, zona);
}

/** Periodo mensual `YYYY-MM` de la fecha calendario de `zona` en `now`. */
export function periodoMensual(now: Date, zona: string): string {
  return fechaCalendario(now, zona).slice(0, 7);
}

/** INSTANTE en que empezo el mes EN CURSO del calendario de `zona`. */
export function inicioDelMesEnUtc(now: Date, zona: string): Date {
  return inicioDelDiaEnUtc(`${periodoMensual(now, zona)}-01`, zona);
}

/**
 * Dias NATURALES entre dos instantes en el calendario de `zona`: cambios de fecha, no periodos de
 * 24 h (ayer 23:50 -> hoy 00:10 es 1 dia). Se restan fechas, no instantes, para que un dia de 23 o
 * 25 h cuente como uno. Nunca negativo: un `desde` futuro da 0.
 */
export function diasNaturalesDesde(desde: Date, now: Date, zona: string): number {
  const dias = Math.round(
    (fechaAUtcMs(fechaCalendario(now, zona)) - fechaAUtcMs(fechaCalendario(desde, zona))) /
      UN_DIA_MS,
  );
  return dias > 0 ? dias : 0;
}

/** Hora de pared «HH:mm» de `instante` en `zona`; `""` si el instante no es valido. */
export function horaDePared(instante: Date, zona: string): string {
  if (Number.isNaN(instante.getTime())) return "";
  const w = pared(instante, zona);
  return `${dosDigitos(w.hora)}:${dosDigitos(w.minuto)}`;
}

/**
 * Proximo instante ESTRICTAMENTE posterior a `now` en que la pared de `zona` marca `hh:mm`. Si esa
 * hora no existe un dia (salto del cambio de hora), ese dia vale el primer instante tras el salto.
 */
export function proximaHoraLocal(now: Date, zona: string, hh: number, mm: number): Date {
  const hoy = fechaCalendario(now, zona);
  // Tres dias bastan: hoy, mañana y, por un dia sin esa hora, el siguiente.
  for (let d = 0; d <= 2; d += 1) {
    const objetivo = fechaAUtcMs(sumarDias(hoy, d)) + (hh * 60 + mm) * 60 * 1000;
    const t = instanteDePared(objetivo, zona);
    if (t.getTime() > now.getTime()) return t;
  }
  // Inalcanzable con una zona IANA valida: el bucle siempre encuentra un instante posterior.
  throw new Error("proximaHoraLocal: no se encontro una hora posterior");
}

/**
 * `true` si `value` es una fecha CALENDARIO `YYYY-MM-DD` que EXISTE de verdad. No depende de la zona.
 *
 * Hace falta el ROUND-TRIP —parsear y comprobar que el instante vuelve a emitir EXACTAMENTE la misma
 * cadena— porque ni el regex (`2026-02-31` cumple la forma) ni `Number.isNaN(new Date(...))` cazan un
 * dia inexistente: V8 solo da `Invalid Date` con el MES fuera de rango; un DIA desbordado RUEDA en
 * silencio (`2026-02-31` es el 3 de marzo), y una fecha rodada guarda otro dia sin avisar.
 */
export function esFechaCalendarioValida(value: string): boolean {
  const dia = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(dia.getTime())) return false;
  return dia.toISOString().slice(0, 10) === value;
}
