"use client";

import Link from "next/link";

import { money } from "@/lib/config/moneda";

import * as L from "./detalle-cierre-labels";
import type { FilaMensajeroBodega } from "./detalle-cierre-vista";

// SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T3.1; R42, R114, R115) — la
// pestaña «Mensajeros» del detalle de bodega, como el canvas (`Main.dc.html`, rama bodega): una fila
// por cierre del día incluido, en el orden del servidor. Rejilla CSS como `GestionesCierre`, con roles
// de tabla para quien no ve la pantalla.
//
// No calcula nada (R71): los tres importes son el STRING del servidor pasado por `money()`; las filas
// las arma `filasMensajeros` (`detalle-cierre-vista.ts`).

/** Las columnas del canvas: Mensajero · Gestiones · Recaudado · Pago · A la central · Señales · enlace. */
const PLANTILLA = { gridTemplateColumns: "1.6fr 90px 1fr 1fr 1fr 1.2fr 120px" } as const;

export interface MensajerosCierreBodegaProps {
  filas: readonly FilaMensajeroBodega[];
  /** R115: cierra el detalle de bodega y navega a `href`. Ausente: el enlace navega solo. */
  onVerSuCierre?: (href: string) => void;
}

export function MensajerosCierreBodega({ filas, onVerSuCierre }: Readonly<MensajerosCierreBodegaProps>) {
  const C = L.MENSAJEROS_COLUMNAS;
  return (
    <div role="table" aria-label={L.MENSAJEROS_REGION_LABEL} className="rounded-xl border border-border bg-card px-4 py-1">
      <div role="row" className="grid border-b border-border py-2.5 text-xs text-muted-foreground" style={PLANTILLA}>
        <span role="columnheader">{C.mensajero}</span>
        <span role="columnheader" className="text-right">
          {C.gestiones}
        </span>
        <span role="columnheader" className="text-right">
          {C.recaudado}
        </span>
        <span role="columnheader" className="text-right">
          {C.pago}
        </span>
        <span role="columnheader" className="text-right">
          {C.aLaCentral}
        </span>
        <span role="columnheader" className="pl-4">
          {C.senales}
        </span>
        <span role="columnheader" />
      </div>
      {filas.map((f) => (
        <div
          key={f.cierreDiaId}
          role="row"
          className="grid items-center border-b border-border/50 py-3 text-sm"
          style={PLANTILLA}
        >
          <span role="cell" className="min-w-0 truncate">
            {f.mensajero}
          </span>
          <span role="cell" className="text-right tabular-nums">
            {f.gestiones}
          </span>
          <span role="cell" className="text-right tabular-nums">
            {money(f.recaudado)}
          </span>
          <span role="cell" className="text-right tabular-nums">
            {money(f.pago)}
          </span>
          <span role="cell" className="text-right tabular-nums">
            {money(f.aLaCentral)}
          </span>
          <span role="cell" className="pl-4 text-xs text-warning-strong">
            {f.senal}
          </span>
          <span role="cell" className="text-right">
            <Link
              href={f.href}
              aria-label={L.verElCierreDe(f.mensajero)}
              className="text-sm text-info-strong hover:underline"
              onClick={(e) => {
                if (!onVerSuCierre) return;
                e.preventDefault();
                onVerSuCierre(f.href);
              }}
            >
              {L.VER_SU_CIERRE}
            </Link>
          </span>
        </div>
      ))}
    </div>
  );
}
