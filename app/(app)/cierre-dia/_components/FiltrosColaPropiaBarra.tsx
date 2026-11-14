"use client";

import { useMemo, useState } from "react";

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import {
  FilterComponent,
  type FilterDef,
  type FilterSelection,
} from "@/components/shared/FilterComponent";
import { ATAJOS_CREACION } from "@/app/(app)/ordenes/_components/ordenes-filtros-def";
import { ultimosNDiasCalendarioCR } from "@/lib/utils/fecha-cr";
import { MAX_FOLIO_FILTRO, sinFiltrosPropios, type FiltrosColaPropia } from "@/lib/types/filtros-cierres";
import {
  BARRA_PROPIA,
  BUSCA_POR_FOLIO,
  CLAVE_ESTADO_PROPIA,
  CLAVE_FECHA_PROPIA,
  FILTRO_ESTADO_PROPIA,
  FILTRO_FECHA_PROPIA,
  aFiltrosPropios,
  opcionesEstadoPropias,
} from "@/components/private/cierres/cola/cola-propia-vista";

/**
 * SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» (R167, R177, R178) — la barra de
 * «Cierres solicitados». Es el componente de filtros de la app (`BuscadorFiltros` + `FilterComponent`),
 * con el mismo reparto que `FiltrosCierresBarra` de `/cierres-admin`, que NO se toca (R179): aquel
 * ofrece bodega, mensajero, estados agrupados y un aviso; aquí solo folio, fecha y estado.
 *
 * Sin `disabled` mientras carga: aquí se teclea, y deshabilitar el campo en cada lectura le quitaría
 * el foco al mensajero a mitad del folio. SWR ya descarta la respuesta de una clave vieja.
 */

export interface FiltrosColaPropiaBarraProps {
  /** Emite el objeto ENTERO; `{}` = sin filtros. */
  onChange: (filtros: FiltrosColaPropia) => void;
}

const DECLARADOS: FilterDef[] = [
  {
    key: CLAVE_FECHA_PROPIA,
    label: FILTRO_FECHA_PROPIA,
    kind: "dateRange",
    placeholder: "Cualquier fecha",
    // Los mismos atajos de rango que `/cierres-admin` (R177), resueltos al calendario de Costa Rica.
    options: ATAJOS_CREACION.map((a) => ({
      value: a.value,
      label: a.label,
      defaultRange: ultimosNDiasCalendarioCR(a.dias),
    })),
  },
  {
    key: CLAVE_ESTADO_PROPIA,
    label: FILTRO_ESTADO_PROPIA,
    kind: "multi",
    placeholder: "Todos",
    searchPlaceholder: "Filtrar estados…",
    emptyMessage: "Ningún estado coincide",
    options: opcionesEstadoPropias(),
  },
];

const OFRECIDOS = DECLARADOS.map((f) => ({ key: f.key, label: f.label }));

export function FiltrosColaPropiaBarra({ onChange }: Readonly<FiltrosColaPropiaBarraProps>) {
  /** Claves de los filtros PEDIDOS en el selector. */
  const [activos, setActivos] = useState<string[]>([]);
  /** La selección agregada que devuelve `FilterComponent`. */
  const [seleccion, setSeleccion] = useState<FilterSelection>({});
  /** El último término que emitió el buscador. */
  const [termino, setTermino] = useState("");
  /** `key` del `FilterComponent`: cambiarla lo remonta vacío («Limpiar todo»). */
  const [reset, setReset] = useState(0);

  const montados = useMemo(
    () => DECLARADOS.filter((f) => activos.includes(f.key)),
    [activos],
  );
  const filtros = useMemo(() => aFiltrosPropios(seleccion, termino), [seleccion, termino]);

  function aplicarSeleccion(next: FilterSelection) {
    setSeleccion(next);
    onChange(aFiltrosPropios(next, termino));
  }

  function aplicarTermino(t: string) {
    setTermino(t);
    onChange(aFiltrosPropios(seleccion, t));
  }

  // R178: el buscador vacía su campo solo; aquí se vacía lo demás y se vuelve a la lista sin filtros.
  function limpiarTodo() {
    setSeleccion({});
    setActivos([]);
    setTermino("");
    setReset((n) => n + 1);
    onChange({});
  }

  return (
    <section aria-label={BARRA_PROPIA} className="flex flex-col gap-2">
      <BuscadorFiltros
        label="Buscar"
        placeholder={BUSCA_POR_FOLIO}
        // SLT-153: el mismo tope que el borde (R171); pegar más no deja la lista en error.
        maxLength={MAX_FOLIO_FILTRO}
        onChange={aplicarTermino}
        filtros={OFRECIDOS}
        activos={activos}
        onActivosChange={setActivos}
        onLimpiarTodo={limpiarTodo}
        hayFiltrosAplicados={!sinFiltrosPropios(filtros) || activos.length > 0}
      >
        {montados.length > 0 ? (
          <FilterComponent key={reset} filters={montados} onChange={aplicarSeleccion} />
        ) : null}
      </BuscadorFiltros>
    </section>
  );
}
