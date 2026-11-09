import type { TarifaConcepto } from "@prisma/client";

/**
 * SLT-54 (design §5, R13-R17) — que le falta a una zona para activar, en un solo sitio: lo pinta la
 * pantalla y lo decide el servidor al activar (R6) con esta misma funcion.
 *
 * Modulo PURO y solo con imports de TIPO: lo puede importar la pantalla. No escribe y no decide «sin
 * tarifa» en el calculo: esa fuente de verdad sigue siendo el resolver.
 */

/** Decision P1: solo estos tres cuentan. La comision COD, por ejemplo, cobra 0 sin aparecer aqui. */
export const CONCEPTOS_ESENCIALES = [
  "tienda_flete_entregado",
  "tienda_flete_rechazo",
  "mensajero_entregado",
] as const satisfies readonly TarifaConcepto[];

export type ConceptoEsencial = (typeof CONCEPTOS_ESENCIALES)[number];

/** Lo minimo de un `tarifa_valor` para juzgar su nivel. */
export interface ValorDeNivel {
  concepto: TarifaConcepto;
  zonaId: string | null;
  grupoId: string | null;
  tiendaId: string | null;
  mensajeroId: string | null;
  vehiculoId: string | null;
}

export interface EntradaFaltantes {
  zona: { id: string };
  grupos: readonly { id: string; nombre: string }[];
  /** Puede traer valores de otras zonas y de tiendas: aqui se descartan. */
  valores: readonly ValorDeNivel[];
  vehiculosActivos: readonly { id: string }[];
}

export interface Faltante {
  concepto: ConceptoEsencial;
}

/** R16: el grupo no tiene valor propio en ese esencial y cae al de su zona. No es un faltante. */
export interface AvisoGrupo {
  grupoId: string;
  grupoNombre: string;
  concepto: ConceptoEsencial;
}

export interface EstadoZona {
  estado: "completa" | "faltan" | "sin_empezar";
  faltantes: Faltante[];
  usaZona: AvisoGrupo[];
}

/**
 * R15: el valor para todos los vehiculos, o uno por cada vehiculo ACTIVO. Un inactivo no se exige, y su
 * valor guardado no suple a uno activo. Sin activos no hay nada que complete la lista: un `every` sobre
 * una lista vacia daria por cubierto un concepto sin un solo valor.
 */
function cubre(filas: readonly ValorDeNivel[], vehiculosActivos: readonly { id: string }[]): boolean {
  if (filas.some((f) => f.vehiculoId === null)) return true;
  return vehiculosActivos.length > 0 && vehiculosActivos.every((v) => filas.some((f) => f.vehiculoId === v.id));
}

export function faltantesDeZona({ zona, grupos, valores, vehiculosActivos }: EntradaFaltantes): EstadoZona {
  // R14: un precio de tienda no cubre a la zona, y el valor propio del mensajero (SLT-55) tampoco.
  const deLaZona = valores.filter((v) => v.zonaId === zona.id && v.tiendaId === null && v.mensajeroId === null);
  const faltantes: Faltante[] = [];
  const usaZona: AvisoGrupo[] = [];

  for (const concepto of CONCEPTOS_ESENCIALES) {
    const delConcepto = deLaZona.filter((v) => v.concepto === concepto);
    // La zona se juzga solo con su nivel: un distrito fuera de todo grupo cae en ella. Y como un grupo
    // siempre cae a su zona, lo que falta en la zona es UN faltante, tenga los grupos que tenga.
    if (!cubre(delConcepto.filter((v) => v.grupoId === null), vehiculosActivos)) {
      faltantes.push({ concepto });
      continue;
    }
    for (const grupo of grupos) {
      if (!cubre(delConcepto.filter((v) => v.grupoId === grupo.id), vehiculosActivos)) {
        usaZona.push({ grupoId: grupo.id, grupoNombre: grupo.nombre, concepto });
      }
    }
  }

  return { estado: estadoDe(faltantes.length, deLaZona.length), faltantes, usaZona };
}

function estadoDe(faltantes: number, valoresDeLaZona: number): EstadoZona["estado"] {
  if (faltantes === 0) return "completa";
  return valoresDeLaZona === 0 ? "sin_empezar" : "faltan";
}

/** R17: el «M» de «M de T zonas completas», con los mismos estados que cada fila. */
export function zonasCompletas(estados: readonly Pick<EstadoZona, "estado">[]): number {
  return estados.filter((e) => e.estado === "completa").length;
}
