"use client";

import type { CierreRechazoDeTienda } from "@/lib/interfaces/services/ICierreDiaService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { cn } from "@/lib/utils";
import { COLUMNA_FIJA, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import { motivoGestionLegible } from "@/app/(app)/cierres-admin/_components/cierre-labels";
import {
  FILA_DESTINATARIO_COL,
  FILA_GUIA_COL,
  FILA_MOTIVO_LABEL,
  FILA_TIENDA_LABEL,
  RECHAZOS_FECHA_COL,
  RECHAZOS_LISTA_LABEL,
  RECHAZOS_NOTA,
  efectoAlAprobar,
  separarParaDevolucion,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";

import { RECHAZOS_VACIO } from "./detalle-cierre-labels";

// SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (R17, D11, D27) — el cuerpo de la
// pestaña «Rechazados por la tienda» del detalle único, según el canvas (`Main.dc.html`, `enRechazos`).
// No sustituye a `SeccionRechazosDeTienda` del comprobante: aquella calla sin rechazos (choca con D11)
// y trae los conteos «paga / revisar», que en el detalle ya dicen la franja y el conteo de la pestaña.
// Sin dinero: un rechazo de tienda no se cobra ni suma al pago del mensajero.

// SLT-156 (R492): la guía nunca baja de 80 px ni se monta en el destinatario; crece con su texto.
const COLUMNAS = "grid-cols-[minmax(80px,max-content)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]";

export interface RechazosDeTiendaCierreProps {
  rechazos: readonly CierreRechazoDeTienda[];
}

export function RechazosDeTiendaCierre({ rechazos }: Readonly<RechazosDeTiendaCierreProps>) {
  const cuantas = rechazos.length;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className="m-0 text-sm text-muted-foreground">{RECHAZOS_NOTA}</p>
      {cuantas === 0 ? (
        <p role="status" className="m-0 text-sm text-foreground">
          {RECHAZOS_VACIO}
        </p>
      ) : (
        <>
          <p className="m-0 text-sm font-medium text-foreground">{separarParaDevolucion(cuantas)}</p>
          <p className="m-0 text-sm font-medium text-foreground">{efectoAlAprobar(cuantas)}</p>
          <div
            aria-hidden="true"
            className={cn("grid gap-2 border-b border-border py-2 text-xs text-muted-foreground", COLUMNAS)}
          >
            <span>{FILA_GUIA_COL}</span>
            <span>{FILA_DESTINATARIO_COL}</span>
            <span>{FILA_MOTIVO_LABEL}</span>
            <span>{FILA_TIENDA_LABEL}</span>
            <span className="text-right">{RECHAZOS_FECHA_COL}</span>
          </div>
          <ul role="list" aria-label={RECHAZOS_LISTA_LABEL} className="m-0 flex list-none flex-col p-0">
            {rechazos.map((r) => (
              <li
                key={r.gestionId}
                className={cn("grid items-start gap-2 border-b border-border/60 py-2 text-sm last:border-b-0", COLUMNAS)}
              >
                <span className={cn("font-mono text-[13px]", COLUMNA_FIJA)}>{r.numGuia}</span>
                <span className={TEXTO_ENTERO}>{r.destinatario}</span>
                <span className={TEXTO_ENTERO}>{motivoGestionLegible(r.motivo, true) ?? ""}</span>
                <span className={cn(TEXTO_ENTERO, "text-muted-foreground")}>{r.tiendaNombre}</span>
                <time dateTime={r.rechazadoAt} className={cn("text-right", COLUMNA_FIJA)}>
                  {fechaCalendarioCR(new Date(r.rechazadoAt))}
                </time>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
