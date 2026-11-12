"use client";

import { useState, type ReactNode } from "react";

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import { FilterComponent } from "@/components/shared/FilterComponent";
import { cn } from "@/lib/utils";
import type { EvidenciaAbierta } from "../dialogos/VisorEvidencia";

import { FilaGestion, GUIA_CELDA, plantillaFila } from "./FilaGestion";
import {
  FILTRO_TODAS,
  columnasDe,
  estadoVacioDe,
  filtrar,
  filtrosDe,
  type AccionesFila,
  type AudienciaFila,
  type FiltroGestiones,
  type ItemGestion,
} from "./fila-gestion-vista";
import { FILTRAR_POR_RESULTADO, ORDENES_DEL_CIERRE } from "./fila-gestion-labels";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.4; R22-R24, R84, R89-R91) — la pestaña
// «Gestiones» de un cierre: los filtros por resultado con su conteo, «Descargar» en la misma fila,
// la cabecera de columnas y una `FilaGestion` por gestión.
//
// Los filtros son la barra de la app (S3-4): `BuscadorFiltros` sin buscador y `FilterComponent` con
// un `single` en pastillas. `leerDeUrl={false}` en los dos: filtrar no lee ni toca la URL de
// `/cierres-admin` (`?cierre=`, los filtros de la cola), ni cambia un importe ni «Descargar» (R84).

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
}

/** La barra no tiene buscador: su `onChange` de término no se emite nunca. */
const SIN_BUSQUEDA = () => {};

export function GestionesCierre({
  gestiones,
  audiencia,
  quienMiraEsCentral,
  congeladoAt,
  acciones,
  onVerEvidencia,
  descargar,
  columnaMensajero = false,
}: Readonly<GestionesCierreProps>) {
  const [filtro, setFiltro] = useState<FiltroGestiones>(FILTRO_TODAS);
  const opciones = filtrosDe(
    gestiones.map((i) => i.gestion),
    audiencia,
  );
  const visibles = filtrar(gestiones, filtro, audiencia);
  const columnas = columnasDe(audiencia, columnaMensajero);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <BuscadorFiltros buscador={false} leerDeUrl={false} onChange={SIN_BUSQUEDA} className="w-auto flex-1">
          <FilterComponent
            leerDeUrl={false}
            debounceMs={0}
            filters={[
              {
                key: "resultado",
                label: FILTRAR_POR_RESULTADO,
                kind: "single",
                presentacion: "pastillas",
                options: opciones,
              },
            ]}
            onChange={(sel) => setFiltro((sel.resultado?.[0] as FiltroGestiones | undefined) ?? FILTRO_TODAS)}
          />
        </BuscadorFiltros>
        {descargar ? <div className="shrink-0">{descargar}</div> : null}
      </div>

      <section aria-label={ORDENES_DEL_CIERRE} className="rounded-xl border border-border bg-card">
        <div
          className="grid gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"
          style={plantillaFila(columnas)}
        >
          {columnas.map((c) => (
            <span key={c.id} className={cn("min-w-0", c.id === "guia" && GUIA_CELDA, c.derecha && "text-right", c.id === "senales" && "pl-4")}>
              {c.label}
            </span>
          ))}
          <span />
        </div>
        {visibles.length === 0 ? (
          <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
            {estadoVacioDe(filtro)}
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
            />
          ))
        )}
      </section>
    </div>
  );
}
