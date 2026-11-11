import type { FilterDef, FilterSelection } from "@/components/shared/FilterComponent";
import type { LugarDeFiltroDTO, NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import { valoresDeParam, type LectorParams } from "@/lib/utils/filtros-url";

// SLT-47 (design §4; R1–R6, R9, R17–R21) — EL FILTROUBICACION: el filtro de lugar de N niveles.
//
// MODULO PURO: sin React, sin Prisma y sin `next/` (los tipos de `FilterComponent` son solo tipos).
// Es la UNICA pieza que conoce las claves `nivel_<k>` de las listas, el parametro de transporte
// `lugar_id` y las claves de los enlaces viejos (`provincia_id`…, y `provincia`/`canton` por nombre
// en novedades). Sabe:
//   - declarar una lista por nivel del pais, encadenadas con `dependsOn` (el encadenado, la poda y la
//     re-siembra los hace `FilterComponent`, como hoy);
//   - pasar de la seleccion de la barra al lugar elegido (`lugar_id`): los ids de la lista mas honda
//     con eleccion;
//   - traducir la URL al entrar: `lugar_id` (subiendo hasta el nivel 1) y los enlaces viejos.
//
// Ningun rotulo es un literal: salen de los tipos de nivel del pais (R1).

/** El parametro de transporte del lugar elegido (R9). */
export const PARAM_LUGAR = "lugar_id";

const PREFIJO_NIVEL = "nivel_";

/** La clave interna de la lista del nivel k. Nunca viaja al servidor. */
export const claveDeNivel = (k: number): string => `${PREFIJO_NIVEL}${k}`;

/** k de una clave `nivel_<k>`, o `null` si no lo es. */
export function nivelDeClave(clave: string): number | null {
  const m = /^nivel_(\d+)$/.exec(clave);
  return m === null ? null : Number(m[1]);
}

/** Lo que necesita la declaracion: los niveles del pais y sus lugares (a cualquier profundidad). */
export interface OpcionesDeLugar {
  niveles: readonly NivelDeFiltroDTO[];
  lugares: readonly Pick<LugarDeFiltroDTO, "id" | "nombre" | "padreId" | "profundidad">[];
}

export interface OpcionesDeDeclaracion {
  /** El primer nivel con lista (mis-asignaciones empieza en 2, P2). Por defecto 1. */
  desde?: number;
  /** Rotula las opciones de la PRIMERA lista como «lugar (su padre)» (mis-asignaciones, P2). */
  etiquetaConPadre?: boolean;
}

/**
 * R1, R2, R6, R7 — una `FilterDef` `multi` por nivel, de `desde` a P, en orden. Rotulo: el nombre
 * singular del tipo; busqueda: «Buscar <singular>…». Cada lista depende de la anterior y sus opciones
 * llevan `parentValue` = su padre; la primera no lleva ni `dependsOn` ni `parentValue`, como hoy.
 * Con 2 niveles, 2 listas: ninguna repite el nivel 2 (R2).
 */
export function declararNiveles(op: OpcionesDeLugar, opts: OpcionesDeDeclaracion = {}): FilterDef[] {
  const desde = opts.desde ?? 1;
  const porId = new Map(op.lugares.map((l) => [l.id, l]));
  const porProfundidad = new Map<number, OpcionesDeLugar["lugares"][number][]>();
  for (const l of op.lugares) {
    const lista = porProfundidad.get(l.profundidad);
    if (lista) lista.push(l);
    else porProfundidad.set(l.profundidad, [l]);
  }
  const niveles = [...op.niveles].filter((n) => n.profundidad >= desde).sort((a, b) => a.profundidad - b.profundidad);
  return niveles.map((nivel) => {
    const k = nivel.profundidad;
    const primera = k === desde;
    const lugares = porProfundidad.get(k) ?? [];
    const def: FilterDef = {
      key: claveDeNivel(k),
      label: nivel.singular,
      kind: "multi",
      ...(primera ? {} : { dependsOn: claveDeNivel(k - 1) }),
      searchPlaceholder: `Buscar ${nivel.singular.toLowerCase()}…`,
      options: lugares.map((l) => {
        const padre = l.padreId === null ? undefined : porId.get(l.padreId);
        if (primera) {
          const label = opts.etiquetaConPadre && padre ? `${l.nombre} (${padre.nombre})` : l.nombre;
          return { value: l.id, label };
        }
        return { value: l.id, label: l.nombre, ...(l.padreId === null ? {} : { parentValue: l.padreId }) };
      }),
    };
    return def;
  });
}

/** R4, R9 — los ids de la lista mas honda con eleccion. `[]` = sin filtro de lugar. */
export function lugarElegido(sel: FilterSelection): string[] {
  let mejor: { k: number; ids: string[] } | null = null;
  for (const [clave, valores] of Object.entries(sel)) {
    const k = nivelDeClave(clave);
    if (k === null || valores.length === 0) continue;
    if (mejor === null || k > mejor.k) mejor = { k, ids: [...valores] };
  }
  return mejor?.ids ?? [];
}

/** R9 — la seleccion de la barra como transporte: un solo `lugar_id`, o nada. */
export function seleccionALugar(sel: FilterSelection): { lugar_id?: string[] } {
  const ids = lugarElegido(sel);
  return ids.length === 0 ? {} : { lugar_id: ids };
}

// ---------------------------------------------------------------------------------------------
// La URL al entrar (R17–R21)
// ---------------------------------------------------------------------------------------------

export interface TraductorDeUrl {
  /** Claves que «Limpiar todo» tambien borra: `lugar_id` y las viejas de la pantalla (R20). */
  claves: readonly string[];
  /** Vista de los params con las claves `nivel_<k>` ya puestas. Pura; recibe las FilterDef montadas. */
  traducir(params: LectorParams, filtros: readonly FilterDef[]): LectorParams;
}

/** Enlaces viejos por id: cada clave pasa tal cual a la lista de su nivel (el renombre de §4.2). */
const VIEJAS_POR_ID: readonly [string, number][] = [
  ["provincia_id", 1],
  ["canton_id", 2],
  ["distrito_id", 3],
];

/** Enlaces viejos de novedades, por nombre. */
const VIEJAS_POR_NOMBRE: readonly [string, number][] = [
  ["provincia", 1],
  ["canton", 2],
];

/** Las listas de nivel montadas, por k. */
function listasDeNivel(filtros: readonly FilterDef[]): Map<number, FilterDef> {
  const listas = new Map<number, FilterDef>();
  for (const f of filtros) {
    const k = nivelDeClave(f.key);
    if (k !== null) listas.set(k, f);
  }
  return listas;
}

/** Los params sin las claves `traducidas` y sin ninguna `nivel_<k>` (R21), con `puestas` añadidas. */
function vistaDeParams(params: LectorParams, quitar: ReadonlySet<string>, puestas: ReadonlyMap<string, string[]>): LectorParams {
  const salida = new URLSearchParams();
  for (const [clave, valor] of params.entries()) {
    if (quitar.has(clave) || nivelDeClave(clave) !== null) continue;
    salida.append(clave, valor);
  }
  for (const [clave, valores] of puestas) if (valores.length > 0) salida.append(clave, valores.join(","));
  return salida;
}

/**
 * R17 — `lugar_id`: cada id se busca en las opciones de las listas montadas; desde su nivel se sube
 * por `parentValue` y cada antepasado se pone en su lista. Un id que ninguna lista ofrece se descarta.
 */
function desdeLugar(ids: readonly string[], listas: ReadonlyMap<number, FilterDef>): Map<string, string[]> {
  const opcion = new Map<string, { k: number; padre: string | undefined }>();
  for (const [k, f] of listas) for (const o of f.options ?? []) opcion.set(o.value, { k, padre: o.parentValue });
  const puestas = new Map<string, Set<string>>();
  for (const id of ids) {
    let actual: string | undefined = id;
    // Un catalogo con ciclos no existe (FK de SLT-43); el tope evita un bucle si un doble lo trae.
    for (let paso = 0; actual !== undefined && paso <= listas.size; paso++) {
      const o = opcion.get(actual);
      if (o === undefined) break;
      const clave = claveDeNivel(o.k);
      const set = puestas.get(clave) ?? new Set<string>();
      set.add(actual);
      puestas.set(clave, set);
      actual = o.padre;
    }
  }
  return new Map([...puestas].map(([k, v]) => [k, [...v]]));
}

/** Traductor de `/ordenes`, recepcion satelite y analitica: `lugar_id` y los enlaces viejos por id. */
export function traductorPorId(): TraductorDeUrl {
  const viejas = VIEJAS_POR_ID.map(([c]) => c);
  return {
    claves: [PARAM_LUGAR, ...viejas],
    traducir(params, filtros) {
      const listas = listasDeNivel(filtros);
      const lugar = valoresDeParam(params, PARAM_LUGAR);
      const puestas = lugar.length > 0 ? desdeLugar(lugar, listas) : new Map<string, string[]>();
      // Si `lugar_id` dejo algo, gana sobre los enlaces viejos; si no, se renombran tal cual y
      // `FilterComponent` los valida y poda como hoy (R18).
      if (puestas.size === 0) {
        for (const [vieja, k] of VIEJAS_POR_ID) {
          const valores = valoresDeParam(params, vieja);
          if (valores.length > 0) puestas.set(claveDeNivel(k), valores);
        }
      }
      return vistaDeParams(params, new Set([PARAM_LUGAR, ...viejas]), puestas);
    },
  };
}

/**
 * Traductor de `/novedades` (R19): `lugar_id`, y `provincia`/`canton` por nombre exacto. Cada
 * provincia pasa a los lugares de nivel 1 con ese rotulo; cada canton, a los de nivel 2 con ese
 * rotulo, solo entre los hijos de las provincias traducidas si hay alguna. Sin coincidencia, nada.
 */
export function traductorPorNombre(): TraductorDeUrl {
  const viejas = VIEJAS_POR_NOMBRE.map(([c]) => c);
  return {
    claves: [PARAM_LUGAR, ...viejas],
    traducir(params, filtros) {
      const listas = listasDeNivel(filtros);
      const lugar = valoresDeParam(params, PARAM_LUGAR);
      const puestas = lugar.length > 0 ? desdeLugar(lugar, listas) : new Map<string, string[]>();
      if (puestas.size === 0) {
        let padres: Set<string> | null = null;
        for (const [vieja, k] of VIEJAS_POR_NOMBRE) {
          const nombres = new Set(valoresDeParam(params, vieja));
          const lista = listas.get(k);
          if (nombres.size === 0 || lista === undefined) continue;
          const elegidos = (lista.options ?? [])
            .filter((o) => nombres.has(o.label))
            .filter((o) => padres === null || (o.parentValue !== undefined && padres.has(o.parentValue)))
            .map((o) => o.value);
          if (elegidos.length > 0) {
            puestas.set(claveDeNivel(k), elegidos);
            padres = new Set(elegidos);
          }
        }
      }
      return vistaDeParams(params, new Set([PARAM_LUGAR, ...viejas]), puestas);
    },
  };
}
