import type { PrismaClient } from "@prisma/client";

import type { Captura, ConsultaCapturada } from "./captura-consultas";

// SLT-71 (T1.1; design §9.1) — la MEDICION de los scripts de rendimiento, compartida.
//
// Extraida sin cambios de `scripts/geo-explain-consultas.ts` (SLT-65), que la importa y la re-exporta,
// para que `scripts/geo-explain-analitica.ts` (SLT-71) mida igual. Mismo movimiento que SLT-65 T1.1
// hizo con `comparacion.ts`.
//
// Unico cambio: `bloqueaPorPorcentaje` va en la definicion de la lectura, en vez de salir de un `Set`
// fijo del script; y el nombre de la lectura es un parametro de tipo, porque cada script tiene sus
// lecturas. La regla de regresion NO esta aqui: cada script tiene la suya (`hayRegresion` en SLT-65,
// `veredicto` en SLT-71).
//
// Solo cuenta tiempos y Seq Scan: no imprime nada, ni SQL ni parametros.

/** Corridas de `EXPLAIN ANALYZE` por lado (R25 de SLT-65, R19 de SLT-71). */
export const CORRIDAS = 5;

export interface LadoMedido {
  /** Consultas de la lectura que se explican (en antes, con las completadas). */
  consultas: number;
  /** Por corrida, la suma de los `Execution Time` de todas sus consultas (ms). */
  corridasMs: number[];
  medianaMs: number;
  /** Seq Scan sobre `orden` en los planes de este lado (la corrida con mas). */
  seqScanSobreOrden: number;
  /** Tiempo de pared medio del metodo (ms). Informativo. */
  paredMediaMs: number;
}

export interface MedicionDeLectura<N extends string = string> {
  lectura: N;
  bloqueaPorPorcentaje: boolean;
  antes: LadoMedido;
  despues: LadoMedido;
  /** Las consultas de despues con las que se completo antes (solo listados). */
  completadas: number;
}

export type ResultadoDeLectura<N extends string = string> =
  | { estado: "medida"; medicion: MedicionDeLectura<N> }
  | { estado: "sin-muestra"; lectura: N; motivo: string }
  | { estado: "fallida"; lectura: N; error: string };

export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export type LadoDeLaRegla = Pick<LadoMedido, "medianaMs" | "seqScanSobreOrden">;

/** Cuanto sube la mediana de despues sobre la de antes (0,21 = +21 %). */
export function variacion(antes: LadoDeLaRegla, despues: LadoDeLaRegla): number {
  if (antes.medianaMs === 0) return despues.medianaMs === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (despues.medianaMs - antes.medianaMs) / antes.medianaMs;
}

// ---------------------------------------------------------------------------------------------
// Las consultas de despues con las que se completa antes
// ---------------------------------------------------------------------------------------------

// Las tablas de la geografia vieja, de las asignaciones y del catalogo: con la `organizacion` de la
// que el catalogo lee el pais y la `zona` que trae con cada fila de `zona_distrito` (medido: Prisma
// la pide en una consulta aparte). Una consulta que nombra alguna es parte de la lectura que cambia.
// Si una consulta comun leyera `zona`, antes se quedaria sin ella: el error va hacia marcar
// regresion, nunca hacia esconderla.
const TABLAS_DE_LA_GEOGRAFIA =
  /"(provincia|canton|distrito|zona|zona_distrito|distrito_zona_especial|nodo_geografico|tipo_nivel_geografico|organizacion)"/;

export function leeGeografia(sql: string): boolean {
  return TABLAS_DE_LA_GEOGRAFIA.test(sql);
}

/**
 * Las consultas de `despues` que `antes` no tiene (por sentencia, contando repeticiones) y que no
 * leen geografia: lo que la lectura hace igual hoy y la copia no trae.
 */
export function consultasQueCompletanAntes(
  antes: readonly ConsultaCapturada[],
  despues: readonly ConsultaCapturada[],
): ConsultaCapturada[] {
  const pendientes = new Map<string, number>();
  for (const c of antes) pendientes.set(c.consulta.sql, (pendientes.get(c.consulta.sql) ?? 0) + 1);
  const completan: ConsultaCapturada[] = [];
  for (const c of despues) {
    const quedan = pendientes.get(c.consulta.sql) ?? 0;
    if (quedan > 0) {
      pendientes.set(c.consulta.sql, quedan - 1);
      continue;
    }
    if (!leeGeografia(c.consulta.sql)) completan.push(c);
  }
  return completan;
}

// ---------------------------------------------------------------------------------------------
// La medicion
// ---------------------------------------------------------------------------------------------

export interface EntornoDeMedicion {
  cliente: PrismaClient;
  captura: Captura;
  /** Por defecto `CORRIDAS`. */
  corridas?: number;
}

export interface DefinicionDeLectura<N extends string = string> {
  lectura: N;
  antes: () => Promise<unknown>;
  despues: () => Promise<unknown>;
  completarAntes: boolean;
  /** Si el 20 % bloquea en esta lectura (las calientes). El Seq Scan nuevo bloquea siempre. */
  bloqueaPorPorcentaje: boolean;
}

/** Corre el metodo `corridas` veces: las consultas de la primera y el tiempo de pared medio. */
export async function capturar(
  captura: Captura,
  leer: () => Promise<unknown>,
  corridas: number,
): Promise<{ consultas: ConsultaCapturada[]; paredMediaMs: number }> {
  let consultas: ConsultaCapturada[] = [];
  let pared = 0;
  for (let i = 0; i < corridas; i++) {
    const t0 = performance.now();
    const r = await captura.grabar(leer);
    pared += performance.now() - t0;
    if (i === 0) consultas = r.consultas;
  }
  return { consultas, paredMediaMs: pared / corridas };
}

export async function medirLectura<N extends string>(
  entorno: EntornoDeMedicion,
  def: DefinicionDeLectura<N>,
): Promise<MedicionDeLectura<N>> {
  const corridas = entorno.corridas ?? CORRIDAS;
  const antes = await capturar(entorno.captura, def.antes, corridas);
  const despues = await capturar(entorno.captura, def.despues, corridas);
  const completadas = def.completarAntes ? consultasQueCompletanAntes(antes.consultas, despues.consultas) : [];
  const consultasAntes = [...antes.consultas, ...completadas];

  const sumas = { antes: [] as number[], despues: [] as number[] };
  const seq = { antes: 0, despues: 0 };
  // Alternadas por corrida: ningun lado se lleva toda la cache caliente.
  for (let i = 0; i < corridas; i++) {
    for (const [lado, consultas] of [
      ["antes", consultasAntes],
      ["despues", despues.consultas],
    ] as const) {
      let suma = 0;
      let seqDeLaCorrida = 0;
      for (const c of consultas) {
        const plan = await entorno.captura.explicar(c);
        suma += plan.tiempoMs;
        seqDeLaCorrida += plan.seqScanSobreOrden;
      }
      sumas[lado].push(suma);
      seq[lado] = Math.max(seq[lado], seqDeLaCorrida);
    }
  }

  const lado = (n: number, corridasMs: number[], s: number, paredMediaMs: number): LadoMedido => ({
    consultas: n,
    corridasMs,
    medianaMs: mediana(corridasMs),
    seqScanSobreOrden: s,
    paredMediaMs,
  });
  return {
    lectura: def.lectura,
    bloqueaPorPorcentaje: def.bloqueaPorPorcentaje,
    antes: lado(consultasAntes.length, sumas.antes, seq.antes, antes.paredMediaMs),
    despues: lado(despues.consultas.length, sumas.despues, seq.despues, despues.paredMediaMs),
    completadas: completadas.length,
  };
}

/** Solo el nombre del error: el mensaje de Prisma puede llevar SQL, parametros o la URL. */
export function nombreDeError(error: unknown): string {
  return error instanceof Error ? error.name : "error";
}

export async function medirOFallar<N extends string>(
  entorno: EntornoDeMedicion,
  def: DefinicionDeLectura<N>,
): Promise<ResultadoDeLectura<N>> {
  try {
    return { estado: "medida", medicion: await medirLectura(entorno, def) };
  } catch (error) {
    return { estado: "fallida", lectura: def.lectura, error: nombreDeError(error) };
  }
}
