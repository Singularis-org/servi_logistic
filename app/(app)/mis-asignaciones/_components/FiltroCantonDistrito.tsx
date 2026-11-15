"use client";

import { Select, type SelectOption } from "@/components/ui/select";
import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import type { OpcionFiltro } from "@/lib/utils/filtro-canton-distrito";

// Feature 117 — control de filtro por cantón y distrito (dos selects encadenados). Componente de
// PRESENTACIÓN puro: recibe estado y opciones por props y emite los cambios; el estado vive en
// `useFiltroCantonDistrito`. Textos separados en constantes para i18n futura.
//
// SLT-156 (R495, R505): deja de ser una fila aparte con su «Limpiar filtros». Sus selects son los
// `children` de la `BuscadorFiltros` de Reparto: se monta solo el de cada filtro PUESTO en
// «Filtros», y la limpieza la hace «Limpiar todo» de la barra. Una sola barra por lista.

// El `Select` de base-ui trata `value === ""` como placeholder (sin selección), y sus
// `Item` exigen valor no vacío. Para poder VOLVER a "todos" desde el desplegable se
// antepone una opción con este valor centinela, que el handler traduce a `""`.
const TODOS = "__todos__";

// SL-20 (design §7; R19): los nombres accesibles nombran los niveles con los nombres del país de
// la empresa (`useEtiquetasGeograficas`).
const PREFIJO_FILTRAR = "Filtrar por";
const CANTON_TODOS = "Todos los cantones";
const DISTRITO_TODOS = "Todos los distritos";

// Mismo alto que el campo de la barra con `tactil` (44 px en el teléfono, R493). Sin `labelPrefix`
// del `Select`: ese rótulo recorta con «…» (R490); el placeholder ya dice qué filtra.
const CLASE_SELECT = "h-8 w-full max-md:h-11 sm:w-52";

export interface FiltroCantonDistritoProps {
  /** Cantón elegido (`""` = todos). */
  canton: string;
  /** Distrito elegido (`""` = todos). */
  distrito: string;
  /** Opciones de cantón (etiqueta "Cantón (Provincia)"). */
  cantones: OpcionFiltro[];
  /** Opciones de distrito del cantón elegido. */
  distritos: OpcionFiltro[];
  /** ¿Está puesto el filtro de cantón en «Filtros»? */
  mostrarCanton: boolean;
  /** ¿Está puesto el filtro de distrito en «Filtros»? */
  mostrarDistrito: boolean;
  /** Elegir cantón (recibe `""` para "todos"; resetea el distrito). */
  onCantonChange: (value: string) => void;
  /** Elegir distrito (recibe `""` para "todos"). */
  onDistritoChange: (value: string) => void;
}

/** Antepone la opción centinela "todos" a las opciones derivadas. */
function conTodos(opciones: OpcionFiltro[], etiquetaTodos: string): SelectOption[] {
  return [{ value: TODOS, label: etiquetaTodos }, ...opciones];
}

export function FiltroCantonDistrito({
  canton,
  distrito,
  cantones,
  distritos,
  mostrarCanton,
  mostrarDistrito,
  onCantonChange,
  onDistritoChange,
}: FiltroCantonDistritoProps) {
  const etiquetas = useEtiquetasGeograficas();
  const cantonAria = `${PREFIJO_FILTRAR} ${etiquetas.canton.singular.toLowerCase()}`;
  const distritoAria = `${PREFIJO_FILTRAR} ${etiquetas.distrito.singular.toLowerCase()}`;

  return (
    <>
      {mostrarCanton ? (
        <Select
          aria-label={cantonAria}
          className={CLASE_SELECT}
          value={canton}
          options={conTodos(cantones, CANTON_TODOS)}
          placeholder={CANTON_TODOS}
          onValueChange={(next) => onCantonChange(next === TODOS ? "" : next)}
        />
      ) : null}
      {mostrarDistrito ? (
        <Select
          aria-label={distritoAria}
          className={CLASE_SELECT}
          value={distrito}
          options={conTodos(distritos, DISTRITO_TODOS)}
          placeholder={DISTRITO_TODOS}
          // R3: sin cantón elegido el distrito no aplica y va deshabilitado.
          disabled={canton === ""}
          onValueChange={(next) => onDistritoChange(next === TODOS ? "" : next)}
        />
      ) : null}
    </>
  );
}
