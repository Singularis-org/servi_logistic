"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import { todosLosDelNivel, type OpcionFiltro } from "@/lib/utils/filtro-ubicacion-asignaciones";

import type { ListaDelFiltro } from "./useFiltroUbicacion";

// SLT-47 (design §5.4; R7) — el filtro de lugar del mensajero: un select por nivel, de 2 a P,
// encadenados, más «Limpiar filtros». Sucesor del de cantón y distrito (feature 117), con la misma
// forma en Costa Rica. Componente de PRESENTACIÓN puro: el estado vive en `useFiltroUbicacion`. Los
// rótulos salen de los niveles del país; los textos fijos van en constantes (i18n futura).
//
// Teléfono primero (maqueta de T0): en el ancho de un teléfono cada lista ocupa la fila entera; desde
// `sm` se ponen en línea y pasan a la siguiente cuando no caben (R5).

// El `Select` de base-ui trata `value === ""` como placeholder y sus `Item` exigen valor no vacío:
// para VOLVER a «todos» desde el desplegable se antepone esta opción centinela, que se traduce a `""`.
const TODOS = "__todos__";

const PREFIJO_FILTRAR = "Filtrar por";
const CONJUNCION = "y";
const LIMPIAR = "Limpiar filtros";

/** «cantón y distrito», «provincia, comuna y barrio». */
function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} ${CONJUNCION} ${nombres[nombres.length - 1]}`;
}

function conTodos(opciones: OpcionFiltro[], etiquetaTodos: string): SelectOption[] {
  return [{ value: TODOS, label: etiquetaTodos }, ...opciones];
}

export interface FiltroUbicacionProps {
  listas: ListaDelFiltro[];
  /** `true` si hay algún lugar elegido (muestra «Limpiar filtros»). */
  hayFiltro: boolean;
  /** Elegir en la lista `indice` (recibe `""` para «todos»). */
  onElegir: (indice: number, valor: string) => void;
  onLimpiar: () => void;
}

export function FiltroUbicacion({ listas, hayFiltro, onElegir, onLimpiar }: FiltroUbicacionProps) {
  const idBase = useId();
  if (listas.length === 0) return null;

  const regionLabel = `${PREFIJO_FILTRAR} ${enumerar(listas.map((l) => l.singular.toLowerCase()))}`;

  return (
    <section aria-label={regionLabel} className="flex flex-wrap items-end gap-3">
      {listas.map((lista, i) => {
        const id = `${idBase}-nivel-${lista.profundidad}`;
        const todos = todosLosDelNivel(lista.singular, lista.plural);
        return (
          <div key={lista.profundidad} className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-52">
            <label htmlFor={id} className="text-sm font-medium">
              {lista.singular}
            </label>
            <Select
              id={id}
              aria-label={`${PREFIJO_FILTRAR} ${lista.singular.toLowerCase()}`}
              value={lista.valor}
              options={conTodos(lista.opciones, todos)}
              placeholder={todos}
              disabled={lista.deshabilitada}
              onValueChange={(next) => onElegir(i, next === TODOS ? "" : next)}
            />
          </div>
        );
      })}

      {hayFiltro ? (
        <Button type="button" variant="ghost" onClick={onLimpiar}>
          {LIMPIAR}
        </Button>
      ) : null}
    </section>
  );
}
