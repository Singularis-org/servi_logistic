"use client";

import { useState, type ReactNode } from "react";

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import { FilterComponent } from "@/components/shared/FilterComponent";
import { Pagination } from "@/components/shared/Pagination";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { EvidenciaAbierta } from "../dialogos/VisorEvidencia";

import { FilaGestion, GUIA_CELDA, REJILLA_ESCRITORIO, plantillaFila } from "./FilaGestion";
import {
  FILTRO_TODAS,
  GESTIONES_POR_PAGINA,
  coincideGestion,
  columnasDe,
  estadoVacioDe,
  filtrar,
  filtrosDe,
  type AccionesFila,
  type AudienciaFila,
  type FiltroGestiones,
  type ItemGestion,
} from "./fila-gestion-vista";
import {
  BUSCAR_GESTION_LABEL,
  BUSCAR_GESTION_PLACEHOLDER,
  COL_RESULTADO,
  FILTRAR_POR_RESULTADO,
  ORDENES_DEL_CIERRE,
  PAGINACION_GESTIONES_LABEL,
  SIN_COINCIDENCIAS,
} from "./fila-gestion-labels";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.4; R22-R24, R84, R89-R91) — la pestaña
// «Gestiones» de un cierre: los filtros por resultado con su conteo, «Descargar» en la misma fila,
// la cabecera de columnas y una `FilaGestion` por gestión.
//
// Los filtros son la barra de la app (S3-4): `BuscadorFiltros` sin buscador y `FilterComponent` con
// un `single` en pastillas. `leerDeUrl={false}` en los dos: filtrar no lee ni toca la URL de
// `/cierres-admin` (`?cierre=`, los filtros de la cola), ni cambia un importe ni «Descargar» (R84).
//
// SLT-156 (R526, R527): por debajo de 768 px (`useIsMobile`) la barra queda fija arriba, con buscador
// (guía, remisión o destinatario) y el resultado como filtro del selector «Filtros»; la lista se
// pagina de 25 en 25 y cada fila es una tarjeta (CSS de `FilaGestion`). En escritorio, lo de antes.

export interface GestionesCierreProps {
  /** Ya en el orden de S3-5 (`gestionesEnOrden`: por resultado y, dentro, el del servidor). */
  gestiones: readonly ItemGestion[];
  audiencia: AudienciaFila;
  quienMiraEsCentral: boolean;
  /**
   * `solicitadoAt` del cierre (nota de R97). `null` = sin fecha. SLT-104 (PA3): si el item trae su
   * propio `congeladoAt` (bodega: el de su cierre del día), manda el del item.
   */
  congeladoAt: string | null;
  acciones: AccionesFila;
  onVerEvidencia?: (evidencia: EvidenciaAbierta) => void;
  /** El `DescargarDatasetButton`, a la derecha de los filtros (R90). */
  descargar?: ReactNode;
  /** R23 bodega: la columna «Mensajero» (la monta SLT-104). */
  columnaMensajero?: boolean;
  /** SLT-109 (R244): el `gestionId` cuyo «Devolver a gestión» está en vuelo. */
  enVuelo?: string | null;
}

/** La barra no tiene buscador: su `onChange` de término no se emite nunca. */
const SIN_BUSQUEDA = () => {};

/** SLT-156 (R527): el resultado es un filtro del selector «Filtros» en el teléfono. */
const CLAVE_RESULTADO = "resultado";
const FILTROS_MOVIL = [{ key: CLAVE_RESULTADO, label: COL_RESULTADO }];

/** SLT-156 (R493): los botones de la paginación y «Descargar» miden 44 px en el teléfono. */
const BOTONES_TACTILES = "max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11";
/** SLT-165 (R493, B2 de la review): las pastillas de resultado de 44 px de alto en el teléfono. */
const PASTILLAS_TACTILES = "max-w-full max-md:[&_button]:min-h-11";

export function GestionesCierre({
  gestiones,
  audiencia,
  quienMiraEsCentral,
  congeladoAt,
  acciones,
  onVerEvidencia,
  descargar,
  columnaMensajero = false,
  enVuelo = null,
}: Readonly<GestionesCierreProps>) {
  const esMovil = useIsMobile();
  const [filtro, setFiltro] = useState<FiltroGestiones>(FILTRO_TODAS);
  const [termino, setTermino] = useState("");
  const [pagina, setPagina] = useState(1);
  /** Teléfono: los filtros pedidos en «Filtros» y la llave que remonta las pastillas al limpiar. */
  const [activos, setActivos] = useState<string[]>([]);
  const [reinicio, setReinicio] = useState(0);
  const opciones = filtrosDe(
    gestiones.map((i) => i.gestion),
    audiencia,
  );
  const filtradas = filtrar(gestiones, filtro, audiencia);
  // SLT-154 (R474): sin el dinero de la empresa, «Gana bodega» en el sitio del cobro.
  const columnas = columnasDe(audiencia, columnaMensajero, quienMiraEsCentral);

  // R526: el término y las páginas solo existen en el teléfono; en escritorio, la lista entera.
  const buscadas = esMovil ? filtradas.filter((i) => coincideGestion(i.gestion, termino)) : filtradas;
  const paginar = esMovil && buscadas.length > GESTIONES_POR_PAGINA;
  // Si la lista encoge (una gestión devuelta), la página no se queda fuera del rango.
  const paginaVigente = Math.min(pagina, Math.max(1, Math.ceil(buscadas.length / GESTIONES_POR_PAGINA)));
  const visibles = paginar
    ? buscadas.slice((paginaVigente - 1) * GESTIONES_POR_PAGINA, paginaVigente * GESTIONES_POR_PAGINA)
    : buscadas;

  // R526: cambiar el resultado o el término vuelve a la página 1.
  function elegirResultado(siguiente: FiltroGestiones) {
    setFiltro(siguiente);
    setPagina(1);
  }
  function buscar(t: string) {
    setTermino(t);
    setPagina(1);
  }
  function limpiarTodo() {
    setActivos([]);
    setReinicio((n) => n + 1);
    elegirResultado(FILTRO_TODAS);
  }

  const pastillas = (
    <FilterComponent
      key={reinicio}
      leerDeUrl={false}
      debounceMs={0}
      filters={[
        {
          key: CLAVE_RESULTADO,
          label: FILTRAR_POR_RESULTADO,
          kind: "single",
          presentacion: "pastillas",
          options: opciones,
        },
      ]}
      onChange={(sel) => elegirResultado((sel[CLAVE_RESULTADO]?.[0] as FiltroGestiones | undefined) ?? FILTRO_TODAS)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {esMovil ? (
        // R527: fija arriba; buscador, «Filtros ({n})» con el resultado en pastillas y «Descargar».
        <BuscadorFiltros
          fija
          tactil
          leerDeUrl={false}
          label={BUSCAR_GESTION_LABEL}
          placeholder={BUSCAR_GESTION_PLACEHOLDER}
          onChange={buscar}
          filtros={FILTROS_MOVIL}
          activos={activos}
          onActivosChange={setActivos}
          onLimpiarTodo={limpiarTodo}
          hayFiltrosAplicados={filtro !== FILTRO_TODAS || activos.length > 0}
        >
          {activos.includes(CLAVE_RESULTADO) ? <div className={PASTILLAS_TACTILES}>{pastillas}</div> : null}
          {descargar ? <div className={cn("order-last shrink-0", BOTONES_TACTILES)}>{descargar}</div> : null}
        </BuscadorFiltros>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <BuscadorFiltros buscador={false} leerDeUrl={false} onChange={SIN_BUSQUEDA} className="w-auto flex-1">
            {pastillas}
          </BuscadorFiltros>
          {descargar ? <div className="shrink-0">{descargar}</div> : null}
        </div>
      )}

      <section aria-label={ORDENES_DEL_CIERRE} className="rounded-xl border border-border bg-card">
        {/* R523: en el teléfono no hay cabecera de columnas: cada fila es una tarjeta. */}
        <div
          className={cn(
            "grid gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground max-md:hidden",
            REJILLA_ESCRITORIO,
          )}
          style={plantillaFila(columnas)}
        >
          {columnas.map((c) => (
            <span key={c.id} data-columna={c.id} className={cn("min-w-0", c.id === "guia" && GUIA_CELDA, c.derecha && "text-right", c.id === "senales" && "pl-4")}>
              {c.label}
            </span>
          ))}
          <span />
        </div>
        {visibles.length === 0 ? (
          <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
            {filtradas.length > 0 ? SIN_COINCIDENCIAS : estadoVacioDe(filtro)}
          </p>
        ) : (
          visibles.map((i) => (
            <FilaGestion
              key={i.gestion.gestionId}
              gestion={i.gestion}
              mensajeroNombre={i.mensajeroNombre}
              audiencia={audiencia}
              quienMiraEsCentral={quienMiraEsCentral}
              congeladoAt={i.congeladoAt === undefined ? congeladoAt : i.congeladoAt}
              acciones={acciones}
              onVerEvidencia={onVerEvidencia}
              columnaMensajero={columnaMensajero}
              enVuelo={enVuelo}
              // SLT-191 (R810-R814, DS1): la tarjeta del canvas, solo para el propio mensajero en el teléfono.
              tarjetaMensajero={esMovil && audiencia === "mensajero"}
            />
          ))
        )}
      </section>

      {paginar ? (
        <Pagination
          page={paginaVigente}
          pageSize={GESTIONES_POR_PAGINA}
          total={buscadas.length}
          onPageChange={setPagina}
          showFirstLast
          ariaLabel={PAGINACION_GESTIONES_LABEL}
          className={BOTONES_TACTILES}
        />
      ) : null}
    </div>
  );
}
