"use client";

// SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (T2.2) — las columnas y celdas
// de la cola con rol mensajero (`design.md > Celdas de TablaColaPropia`). Exporta las COLUMNAS y no
// un `<DataTable>` propio: la tabla la pinta `TablaCola` dentro de `ColaCierres.tsx`, para que la
// cola siga siendo UNA instancia de `<DataTable>` en el censo (`censo-tablas.ts`). La lógica y los
// textos viven en `cola-propia-vista.ts`; aquí ningún importe se convierte a número: los pinta
// `money()` tal cual llegan del servidor (R71).

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { Column } from "@/components/shared/DataTable";
import { COLUMNA_FIJA, TACTIL_MOVIL, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import { money } from "@/lib/config/moneda";
import { cn } from "@/lib/utils";
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { EstadoCierreBadge } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { fechaHora, folioDe } from "@/components/private/cierres/detalle/detalle-cierre-vista";

import {
  VER_PROPIA,
  columnasColaPropia,
  columnasColaPropiaMovil,
  masDatosPropioLabel,
  destinoPropio,
  pagoPropioDe,
  textoPagoPropio,
  type ColumnaPropiaId,
} from "./cola-propia-vista";

/** SLT-137: «Ver» de la fila abre el detalle único del cierre (SLT-108). */
export interface AccionesColaPropia {
  abrir: (c: CierrePasadoDTO) => void;
  /** El `cierreId` cuyo detalle se está leyendo (R181), o `null`. */
  leyendo: string | null;
}

/** El nombre accesible de «Ver»: el día del cierre en el calendario de Costa Rica (SLT-76). */
function verLabel(c: Pick<CierrePasadoDTO, "solicitadoAt">): string {
  return `${VER_PROPIA} del cierre del ${fechaCalendarioCR(new Date(c.solicitadoAt))}`;
}

/** «Ver»: abre el detalle único. SLT-156 (R493): 44 px en el teléfono. */
function BotonVer({
  c,
  acciones,
  className,
}: Readonly<{ c: CierrePasadoDTO; acciones: AccionesColaPropia; className?: string }>) {
  const leyendo = acciones.leyendo === c.cierreId;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("px-3 text-[13px]", TACTIL_MOVIL, className)}
      aria-label={verLabel(c)}
      disabled={leyendo}
      aria-busy={leyendo}
      onClick={() => acciones.abrir(c)}
    >
      {VER_PROPIA}
    </Button>
  );
}

function celdaPropia(
  id: ColumnaPropiaId,
  c: CierrePasadoDTO,
  acciones: AccionesColaPropia,
): ReactNode {
  switch (id) {
    case "folio":
      return <span className="font-mono text-[13px]">{`#${folioDe(c.cierreId)}`}</span>;
    case "solicitado":
      return <span className="text-muted-foreground">{fechaHora(c.solicitadoAt)}</span>;
    case "destino":
      return <span className="text-foreground">{destinoPropio(c)}</span>;
    case "estado":
      return <EstadoCierreBadge estado={c.estado} />;
    case "recaudado":
      return <span className="tabular-nums">{money(c.totales.general)}</span>;
    case "ganancia":
      return <span className="tabular-nums">{money(c.totalPagoMensajero)}</span>;
    case "pago":
      return <span className="text-[13px]">{textoPagoPropio(pagoPropioDe(c))}</span>;
    case "acciones":
      return <BotonVer c={c} acciones={acciones} />;
  }
}

/** Las ocho columnas de la cola propia (R60, R156); la de acciones con cabecera solo para lector. */
export function columnasTablaPropia(acciones: AccionesColaPropia): Column<CierrePasadoDTO>[] {
  return columnasColaPropia().map((col) => ({
    id: col.id,
    value: col.label,
    align: col.align,
    renderHeader: col.soloLector ? () => <span className="sr-only">{col.label}</span> : undefined,
    render: (c: CierrePasadoDTO) => celdaPropia(col.id, c, acciones),
  }));
}

/**
 * SLT-156 (R535) con SLT-191 (R818, R819; DS4, DS5) — las columnas del teléfono, sobre la MISMA
 * `DataTable` (una sola instancia en el censo), como `CierresSolicitados` del canvas: «Cierre» con el
 * folio en mono arriba, «Solicitado {fecha y hora}» con el estado y «Destino: …»; «Ganancia» con su
 * rótulo y el importe en su columna fija. «Ver» va en `detallePropioMovil`, no en la fila.
 */
export function columnasTablaPropiaMovil(): Column<CierrePasadoDTO>[] {
  const rotulos = rotulosPropios();
  return columnasColaPropiaMovil().map((col) => ({
    id: col.id,
    value: col.label,
    align: col.align,
    render: (c: CierrePasadoDTO) =>
      col.id === "cierre" ? (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[13px]">{`#${folioDe(c.cierreId)}`}</span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap tabular-nums">{`${rotulos.solicitado} ${fechaHora(c.solicitadoAt)}`}</span>
            <EstadoCierreBadge estado={c.estado} />
          </span>
          <span className={cn("text-muted-foreground", TEXTO_ENTERO)}>{`${rotulos.destino}: ${destinoPropio(c)}`}</span>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{rotulos.ganancia}</span>
          <span className={cn("text-right font-semibold", COLUMNA_FIJA)}>{money(c.totalPagoMensajero)}</span>
        </div>
      ),
  }));
}

/** Los rótulos de las columnas de escritorio, por id (los mismos textos en el teléfono). */
function rotulosPropios(): Record<ColumnaPropiaId, string> {
  return Object.fromEntries(columnasColaPropia().map((col) => [col.id, col.label])) as Record<ColumnaPropiaId, string>;
}

/**
 * SLT-191 (R819, R820; DC1): al desplegar una fila en el teléfono, solo «Ver», a todo el ancho y de
 * 44 px. Folio, recaudado y pago ya no van aquí (el folio sube a la fila; recaudado y pago se quitan
 * del teléfono por decisión de Carlos, 2026-11-16; en escritorio siguen sus columnas).
 */
export function detallePropioMovil(c: CierrePasadoDTO, acciones: AccionesColaPropia): ReactNode {
  return <BotonVer c={c} acciones={acciones} className="min-h-11 w-full" />;
}

/** El nombre accesible del desplegable de cada fila en el teléfono. */
export function masDatosPropio(c: Pick<CierrePasadoDTO, "solicitadoAt">): string {
  return masDatosPropioLabel(fechaCalendarioCR(new Date(c.solicitadoAt)));
}
