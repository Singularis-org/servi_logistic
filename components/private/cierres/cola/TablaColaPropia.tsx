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
import { money } from "@/lib/config/moneda";
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { EstadoCierreBadge } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { fechaHora, folioDe } from "@/components/private/cierres/detalle/detalle-cierre-vista";

import {
  VER_PROPIA,
  columnasColaPropia,
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
    case "acciones": {
      const leyendo = acciones.leyendo === c.cierreId;
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="px-3 text-[13px]"
          aria-label={verLabel(c)}
          disabled={leyendo}
          aria-busy={leyendo}
          onClick={() => acciones.abrir(c)}
        >
          {VER_PROPIA}
        </Button>
      );
    }
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
