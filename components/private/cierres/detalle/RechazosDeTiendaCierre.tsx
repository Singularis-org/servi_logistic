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

/**
 * SLT-156 (R524, R492): desde 768 px, la tabla de hoy (Guía · Destinatario · Motivo · Tienda · Fecha)
 * en UNA rejilla: la cabecera, la lista y cada fila son `subgrid` de ella, así que la guía y la fecha
 * miden lo mismo en todas las filas y en la cabecera, sea cual sea su texto (la desalineación m5 de
 * la review de SLT-156 A venía de resolver cada fila por separado).
 */
export const REJILLA_RECHAZOS =
  "md:grid md:grid-cols-[max-content_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_max-content] md:gap-x-2";
export const FILA_SUBGRID = "md:col-span-full md:grid md:grid-cols-subgrid";

/**
 * SLT-156 (R528): por debajo de 768 px cada rechazo es una tarjeta con los MISMOS elementos:
 * destinatario; guía · tienda; la fecha del rechazo en su columna fija; el motivo entero.
 */
export const TARJETA_RECHAZO =
  "max-md:grid max-md:grid-cols-[max-content_minmax(0,1fr)_max-content] max-md:gap-x-3 max-md:gap-y-1 " +
  "max-md:[grid-template-areas:'dest_dest_fecha'_'guia_tienda_fecha'_'motivo_motivo_motivo']";

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
          <div className={REJILLA_RECHAZOS}>
            <div
              aria-hidden="true"
              className={cn("border-b border-border py-2 text-xs text-muted-foreground max-md:hidden", FILA_SUBGRID)}
            >
              <span>{FILA_GUIA_COL}</span>
              <span>{FILA_DESTINATARIO_COL}</span>
              <span>{FILA_MOTIVO_LABEL}</span>
              <span>{FILA_TIENDA_LABEL}</span>
              <span className="text-right">{RECHAZOS_FECHA_COL}</span>
            </div>
            <ul role="list" aria-label={RECHAZOS_LISTA_LABEL} className={cn("m-0 flex list-none flex-col p-0", FILA_SUBGRID)}>
              {rechazos.map((r) => (
                <li
                  key={r.gestionId}
                  className={cn(
                    "items-start border-b border-border/60 py-2 text-sm last:border-b-0",
                    FILA_SUBGRID,
                    TARJETA_RECHAZO,
                  )}
                >
                  <span className={cn("font-mono text-[13px] max-md:[grid-area:guia]", COLUMNA_FIJA)}>{r.numGuia}</span>
                  <span className={cn("max-md:[grid-area:dest] max-md:font-medium", TEXTO_ENTERO)}>{r.destinatario}</span>
                  <span className={cn("max-md:[grid-area:motivo]", TEXTO_ENTERO)}>
                    {motivoGestionLegible(r.motivo, true) ?? ""}
                  </span>
                  <span
                    className={cn(
                      "text-muted-foreground max-md:[grid-area:tienda] max-md:before:mr-1 max-md:before:content-['·']",
                      TEXTO_ENTERO,
                    )}
                  >
                    {r.tiendaNombre}
                  </span>
                  <time dateTime={r.rechazadoAt} className={cn("text-right max-md:[grid-area:fecha]", COLUMNA_FIJA)}>
                    {fechaCalendarioCR(new Date(r.rechazadoAt))}
                  </time>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
