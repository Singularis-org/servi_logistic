"use client";

import { useCallback, useMemo, useState } from "react";

import { useNivelesGeograficos } from "@/hooks/use-niveles-geograficos";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import {
  filtrarAsignaciones,
  listasDeLugar,
  opcionesOfrecidas,
  type OpcionFiltro,
} from "@/lib/utils/filtro-ubicacion-asignaciones";

// SLT-47 (design §5.4; R7) — estado del filtro de lugar del portal del mensajero, sucesor del de
// cantón y distrito (feature 117). Una elección por lista; elegir en una lista vacía las de debajo
// (como hoy elegir cantón vaciaba el distrito) y una lista sin elección arriba va deshabilitada. Las
// opciones se derivan del conjunto COMPLETO cargado, no del filtrado, para que elegir no borre otras
// opciones. 100 % cliente, sin fetch ni Server Actions.

/** Lo que pinta `FiltroUbicacion` por cada lista. */
export interface ListaDelFiltro {
  profundidad: number;
  singular: string;
  plural: string;
  /** Id elegido; `""` = todos. */
  valor: string;
  opciones: OpcionFiltro[];
  /** Sin elección en la lista de arriba no hay nada que ofrecer. */
  deshabilitada: boolean;
}

export interface UseFiltroUbicacion {
  listas: ListaDelFiltro[];
  /** Elige en la lista `indice` (recibe `""` para «todos») y vacía las de debajo. */
  elegir: (indice: number, valor: string) => void;
  hayFiltro: boolean;
  limpiar: () => void;
  /** Aplica el lugar elegido a una lista, preservando su orden. */
  aplicar: (lista: MiAsignacionDTO[]) => MiAsignacionDTO[];
}

/**
 * `ordenes` es el conjunto completo cargado; el llamador lo memoiza para estabilizar las opciones.
 * Los niveles salen del país de la empresa (layout); sin ellos no hay listas.
 */
export function useFiltroUbicacion(ordenes: MiAsignacionDTO[]): UseFiltroUbicacion {
  const niveles = useNivelesGeograficos();
  const [eleccion, setEleccion] = useState<string[]>([]);

  const todas = useMemo(() => listasDeLugar(ordenes, niveles), [ordenes, niveles]);

  const listas = useMemo<ListaDelFiltro[]>(
    () =>
      todas.map((lista, i) => {
        const arriba = i === 0 ? null : (eleccion[i - 1] ?? "");
        const deshabilitada = arriba === "";
        return {
          profundidad: lista.profundidad,
          singular: lista.singular,
          plural: lista.plural,
          valor: eleccion[i] ?? "",
          opciones: deshabilitada ? [] : opcionesOfrecidas(lista, arriba),
          deshabilitada,
        };
      }),
    [todas, eleccion],
  );

  const elegir = useCallback((indice: number, valor: string) => {
    // Las listas de debajo dejan de colgar de la elección nueva: se vacían.
    setEleccion((prev) => [...Array.from({ length: indice }, (_, j) => prev[j] ?? ""), valor]);
  }, []);

  const limpiar = useCallback(() => setEleccion([]), []);

  // El lugar elegido es el de la lista más honda con elección (R4, R9).
  const lugarId = [...eleccion].reverse().find((v) => v !== "") ?? "";

  const aplicar = useCallback(
    (lista: MiAsignacionDTO[]) => filtrarAsignaciones(lista, lugarId),
    [lugarId],
  );

  return { listas, elegir, hayFiltro: lugarId !== "", limpiar, aplicar };
}
