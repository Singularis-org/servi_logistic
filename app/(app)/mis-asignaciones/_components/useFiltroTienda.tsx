"use client";

import { useMemo, useState, type ReactNode } from "react";

import type { FiltroDisponible } from "@/components/shared/BuscadorFiltros";

import { FiltroTienda } from "./FiltroTienda";
import {
  ETIQUETA_FILTRO_TIENDA,
  FILTRO_TIENDA,
  opcionesTienda,
  type OrdenConTienda,
} from "./filtro-tienda";

// SLT-206 (m3 de la review de SLT-190) — el estado del filtro «Tienda» de Recoger en bodega y
// Recolección, que vivía copiado en los dos módulos. Reúne lo que cada uno repetía: el valor, qué
// filtros están puestos en «Filtros», las opciones (de TODAS las listas de la pantalla, R850) y el
// control (`FiltroTienda`) montado solo con el filtro puesto. El filtrado lo sigue componiendo el
// módulo (término AND tienda, `filtrarPorTienda`), porque cada uno sabe qué listas pinta y cuáles
// no toca (contadores, escáner: R853).

const SIN_ORDENES: readonly OrdenConTienda[] = [];

/** Las props de `BuscadorFiltros` que gobierna el filtro «Tienda». */
export interface BarraFiltroTienda {
  filtros: FiltroDisponible[];
  activos: string[];
  onActivosChange: (siguientes: string[]) => void;
  onLimpiarTodo: () => void;
  hayFiltrosAplicados: boolean;
}

export interface UseFiltroTienda {
  /** Tienda elegida (`""` = todas). */
  tienda: string;
  /** Se reparte tal cual sobre `BuscadorFiltros`. */
  barra: BarraFiltroTienda;
  /** El control, para `children` de `BuscadorFiltros`; `null` si «Tienda» no está puesto. */
  control: ReactNode;
}

/**
 * `lista` y `otraLista` (opcional): las listas cargadas de la pantalla. El llamador las pasa estables
 * (props o memo), como hasta ahora: de ellas depende el memo de las opciones.
 */
export function useFiltroTienda(
  lista: readonly OrdenConTienda[],
  otraLista: readonly OrdenConTienda[] = SIN_ORDENES,
): UseFiltroTienda {
  const [tienda, setTienda] = useState("");
  const [filtrosPuestos, setFiltrosPuestos] = useState<string[]>([]);
  const tiendas = useMemo(() => opcionesTienda(lista, otraLista), [lista, otraLista]);

  // Quitar el filtro de «Filtros» vacía su valor: un filtro que ya no se ve no puede seguir filtrando.
  function cambiarFiltrosPuestos(siguientes: string[]) {
    if (!siguientes.includes(FILTRO_TIENDA)) setTienda("");
    setFiltrosPuestos(siguientes);
  }
  // «Limpiar todo»: la barra vacía su campo y emite `""`; aquí se quita el filtro.
  function limpiarTodo() {
    setTienda("");
    setFiltrosPuestos([]);
  }

  return {
    tienda,
    barra: {
      filtros: [{ key: FILTRO_TIENDA, label: ETIQUETA_FILTRO_TIENDA }],
      activos: filtrosPuestos,
      onActivosChange: cambiarFiltrosPuestos,
      onLimpiarTodo: limpiarTodo,
      hayFiltrosAplicados: tienda !== "" || filtrosPuestos.length > 0,
    },
    control: filtrosPuestos.includes(FILTRO_TIENDA) ? (
      <FiltroTienda tienda={tienda} tiendas={tiendas} onTiendaChange={setTienda} />
    ) : null,
  };
}
