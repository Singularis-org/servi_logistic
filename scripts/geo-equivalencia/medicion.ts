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
  /**
   * SLT-71 (design §9.3; R21): las mismas sumas sin las consultas de la carga del catalogo
   * (`leeElCatalogo`). `medirLectura` lo rellena siempre; es opcional para los que construyen un lado
   * a mano (los tests de SLT-65).
   */
  sinCatalogo?: {
    corridasMs: number[];
    medianaMs: number;
    /** Review v1 (m2): las consultas del lado que NO casan con `leeElCatalogo` (las que suman). */
    consultas: number;
  };
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
// SOLO para completar `antes` (`consultasQueCompletanAntes`): si una consulta comun leyera `zona`,
// antes se quedaria sin ella y su suma bajaria, asi que el error va hacia marcar regresion, nunca
// hacia esconderla. Con `leeElCatalogo` (abajo), que tambien cuenta `zona`, el error va al reves
// (review v1, m2): por eso un test lo fija.
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

// SLT-71 (design §9.3; R21) — las tablas de la CARGA DEL CATALOGO de SLT-44 (`deLaEmpresa`): los
// nodos y sus tipos, las asignaciones de zona con su `zona` (Prisma la pide en una consulta aparte,
// como arriba), las marcas y la `organizacion` de la que sale el pais. Sin `provincia`, `canton` ni
// `distrito`: la union de la lectura de HOY con esas tablas va dentro de su consulta sobre `orden`, y
// es tiempo de la lectura, no del catalogo (en antes, «total» y «sin catalogo» son iguales).
//
// SENTIDO DEL ERROR (review v1, m2): al reves que `TABLAS_DE_LA_GEOGRAFIA`. Si una consulta MEDIDA
// de la lectura (no de la carga del catalogo) nombrara una de estas tablas —`"zona"` es la de
// riesgo—, su tiempo saldria de «sin catalogo» y una regresion real se veria como
// `costo-fijo-del-catalogo`. Lo fija `geo-explain-analitica.test.ts` (R19): en cada lectura medida,
// ninguna consulta de antes casa con `leeElCatalogo`, y el SQL de las lecturas nuevas usa
// `o."zona_id"`, que el patron no casa.
const TABLAS_DEL_CATALOGO =
  /"(nodo_geografico|tipo_nivel_geografico|zona_distrito|distrito_zona_especial|organizacion|zona)"/;

export function leeElCatalogo(sql: string): boolean {
  return TABLAS_DEL_CATALOGO.test(sql);
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
  const sumasSinCatalogo = { antes: [] as number[], despues: [] as number[] };
  const seq = { antes: 0, despues: 0 };
  // Alternadas por corrida: ningun lado se lleva toda la cache caliente.
  for (let i = 0; i < corridas; i++) {
    for (const [lado, consultas] of [
      ["antes", consultasAntes],
      ["despues", despues.consultas],
    ] as const) {
      let suma = 0;
      let sumaSinCatalogo = 0;
      let seqDeLaCorrida = 0;
      for (const c of consultas) {
        const plan = await entorno.captura.explicar(c);
        suma += plan.tiempoMs;
        if (!leeElCatalogo(c.consulta.sql)) sumaSinCatalogo += plan.tiempoMs;
        seqDeLaCorrida += plan.seqScanSobreOrden;
      }
      sumas[lado].push(suma);
      sumasSinCatalogo[lado].push(sumaSinCatalogo);
      seq[lado] = Math.max(seq[lado], seqDeLaCorrida);
    }
  }

  const lado = (
    consultas: readonly ConsultaCapturada[],
    corridasMs: number[],
    sinCat: number[],
    s: number,
    paredMediaMs: number,
  ): LadoMedido => ({
    consultas: consultas.length,
    corridasMs,
    medianaMs: mediana(corridasMs),
    seqScanSobreOrden: s,
    paredMediaMs,
    sinCatalogo: {
      corridasMs: sinCat,
      medianaMs: mediana(sinCat),
      consultas: consultas.filter((c) => !leeElCatalogo(c.consulta.sql)).length,
    },
  });
  return {
    lectura: def.lectura,
    bloqueaPorPorcentaje: def.bloqueaPorPorcentaje,
    antes: lado(consultasAntes, sumas.antes, sumasSinCatalogo.antes, seq.antes, antes.paredMediaMs),
    despues: lado(despues.consultas, sumas.despues, sumasSinCatalogo.despues, seq.despues, despues.paredMediaMs),
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
