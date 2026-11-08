// Feature 135 (T4.1) — resolucion de los rangos temporales de la analitica.
//
// `resolverRango(entrada, zona, now?)` traduce un preset (o un par de fechas
// calendario) a la ventana SEMIABIERTA `[desde, hasta)` de instantes UTC mas las
// fechas calendario de `zona` correspondientes (R13). SLT-42: `zona` es la zona IANA
// del pais de la empresa; antes era Costa Rica fija. Es el unico sitio del lote
// 122-134 donde se decide que significa "hoy", "esta semana" o "este mes".
//
// R1 (modulo puro): sin `'use server'`, sin `next/headers`, sin `@/lib/db`, sin
// repositorios ni servicios, sin `@prisma/client`, sin efectos al importarse.
// R14 (reutiliza, no reimplementa): TODA la aritmetica de fecha sale de
// `@/lib/utils/calendario-zona`; aqui no hay ninguna constante de desfase propia
// ni la duracion de un dia: los dias se suman sobre la fecha CALENDARIO, porque en
// una zona con horario de verano el dia de cambio dura 23 o 25 h (SLT-42, R23).
//
// ---------------------------------------------------------------------------
// (a) DOS CONVENCIONES CONVIVEN A PROPOSITO — NO SE HOMOGENEIZAN
// ---------------------------------------------------------------------------
// `semana` tiene borde de CALENDARIO: empieza el LUNES de la semana local que
// contiene a `now` (decision D2 del humano, 2026-07-30). `mes` NO tiene borde de
// calendario: es una ventana MOVIL de exactamente 30 dias que termina en el dia
// local de `now` (decision D3, «ultimos 30»), NO el mes calendario de
// `periodoMensual`. Consecuencia visible y aceptada: `semana` dura entre 1 y 7
// dias segun el dia en que se consulte, mientras `mes` dura SIEMPRE 30.
// Esto NO es una inconsistencia que arreglar: esta escrito en
// `specs/135-analitica-catalogo-kpis-rangos/design.md §4.3` y en `requirements.md > D3`
// precisamente para que "homogeneizar" ambos presets exija una decision humana
// nueva y fechada, no un refactor de pasada.
//
// ---------------------------------------------------------------------------
// (b) EL PERIODO ES EL "EN CURSO" — Y ESO ES UN SUPUESTO DEL SPEC_AUTHOR
// ---------------------------------------------------------------------------
// Los tres presets devuelven el periodo EN CURSO hasta ahora
// (`hasta = inicioDelDiaSiguienteEnUtc(fecha local de now, zona)`), no el ultimo periodo
// COMPLETO. La segunda mitad de la pregunta Q3 (*en curso o completo*) NO fue
// respondida por el humano: es un SUPUESTO del spec_author, declarado como tal en
// `requirements.md > D3 (⚠ SUPUESTO...)`. Si el humano lo contradice cambian R15,
// R27 y R28 y sus tests, y nada mas del contrato.
//
// ---------------------------------------------------------------------------
// (c) LA TRAMPA `inicioDelDiaComoFecha` — VIVA; LA DIVERGENCIA CON EL RANKING — CERRADA (166)
// ---------------------------------------------------------------------------
// El dia operativo de la analitica es el dia NATURAL de la zona 00:00-24:00,
// resuelto con `inicioDelDiaEnUtc` / `inicioDelDiaSiguienteEnUtc` (convencion
// de la feature 144): todo borde cae en el instante real de las 00:00 locales.
//
// La trampa que este bloque existe para nombrar SIGUE VIVA: el repo exporta
// tambien `inicioDelDiaComoFecha` (antes `startOfDayCR`), que devuelve la MEDIANOCHE
// UTC de la fecha calendario. Esa es la convencion CORRECTA para columnas `@db.Date`
// (feature 46, p.ej. `fecha_reprogramacion`); pero como cota contra columnas
// `timestamp` esta desplazada el desfase de la zona respecto del inicio real del
// dia (en CR, la ventana 18:00-18:00). NO la importes aqui ni "corrijas" la
// analitica con ella: propagaria el error a un rollup persistido.
//
// La divergencia que este bloque declaraba ACEPTADA (D6 / R31) esta CERRADA: la
// feature **166** paso `RankingService` a esta misma convencion, asi que analitica
// y ranking resuelven "hoy" con cotas identicas al milisegundo. Ya no hay dos
// verdades sobre el dia; lo que queda es la eleccion de helper segun el TIPO de
// columna, que es lo que documenta el parrafo anterior.

import {
  diaDeLaSemana,
  fechaCalendario,
  inicioDelDiaEnUtc,
  inicioDelDiaSiguienteEnUtc,
  sumarDiasCalendario,
} from "@/lib/utils/calendario-zona";
import type { EntradaRango, RangoResuelto } from "@/lib/analytics/types";

/** Dias de la ventana movil del preset `mes` (D3: «ultimos 30», contando hoy). */
const MES_MOVIL_DIAS = 30;

/**
 * Fecha calendario del LUNES de la semana que contiene a `fecha` (D2). El dia de la semana es
 * el de la FECHA calendario, no el de un instante, asi que no depende del huso del proceso (R18).
 * `diaDeLaSemana`: 0 = domingo ... 6 = sabado, luego `(dow + 6) % 7` son los dias a retroceder
 * hasta el lunes (0 si ya es lunes).
 */
function lunesDeLaSemana(fecha: string): string {
  return sumarDiasCalendario(fecha, -((diaDeLaSemana(fecha) + 6) % 7));
}

/**
 * Resuelve una entrada de rango a la ventana semiabierta `[desde, hasta)` en
 * instantes UTC + las fechas calendario inclusivas de `zona` (R13).
 *
 * - `dia`: el dia local de `now`.
 * - `semana`: desde el LUNES de la semana local de `now` hasta el dia local de `now` (D2).
 * - `mes`: ventana MOVIL de 30 dias que termina en el dia local de `now` (D3).
 * - `personalizado`: las dos fechas las fija el cliente (D4); su validacion
 *   (formato, orden y tope `RANGO_TOPE_DIAS`) es del esquema zod de `filters.ts`,
 *   no de aqui.
 *
 * `now` es inyectable con default `new Date()` (R17): ningun `Date.now()` escondido,
 * ningun test necesita falsear el reloj global.
 */
export function resolverRango(
  entrada: EntradaRango,
  zona: string,
  now: Date = new Date(),
): RangoResuelto {
  const { desdeFecha, hastaFecha } = fechasCalendarioDelRango(entrada, now, zona);

  return {
    preset: entrada.preset,
    // INCLUSIVO: el instante de las 00:00 de pared de la zona.
    desde: inicioDelDiaEnUtc(desdeFecha, zona),
    // EXCLUSIVO: 00:00 locales del dia SIGUIENTE, para que `hastaFecha` sea inclusiva.
    hasta: inicioDelDiaSiguienteEnUtc(hastaFecha, zona),
    desdeFecha,
    hastaFecha,
  };
}

function fechasCalendarioDelRango(
  entrada: EntradaRango,
  now: Date,
  zona: string,
): { desdeFecha: string; hastaFecha: string } {
  if (entrada.preset === "personalizado") {
    return { desdeFecha: entrada.desde, hastaFecha: entrada.hasta };
  }

  const hoy = fechaCalendario(now, zona);

  switch (entrada.preset) {
    case "dia":
      return { desdeFecha: hoy, hastaFecha: hoy };
    case "semana":
      return { desdeFecha: lunesDeLaSemana(hoy), hastaFecha: hoy };
    case "mes":
      return {
        desdeFecha: sumarDiasCalendario(hoy, -(MES_MOVIL_DIAS - 1)),
        hastaFecha: hoy,
      };
  }
}
