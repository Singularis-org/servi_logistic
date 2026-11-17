"use client";

import { useId, useState } from "react";

import { useIsMobile } from "@/hooks/use-mobile";
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
  /**
   * SLT-191 (R815-R817, DS1): en el teléfono, cada rechazo es una fila desplegable como el canvas
   * (`CierreDia`). Solo la pasa `/cierre-dia` (`CierreDiaModule`); ausente o en escritorio, el DOM es
   * el de hoy (`/cierres-admin` y el detalle de bodega no cambian).
   */
  desplegableMovil?: boolean;
}

/** SLT-191 (R816): la fila plegada es UN botón a todo el ancho, de 44 px como mínimo. */
export const FILA_RECHAZO_BOTON =
  "grid min-h-11 w-full grid-cols-[minmax(0,1fr)_max-content] items-start gap-x-3 py-2 text-left text-sm";

export function RechazosDeTiendaCierre({ rechazos, desplegableMovil = false }: Readonly<RechazosDeTiendaCierreProps>) {
  const cuantas = rechazos.length;
  const esMovil = useIsMobile();
  const desplegable = desplegableMovil && esMovil;
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
          {desplegable ? (
            <ul role="list" aria-label={RECHAZOS_LISTA_LABEL} className="m-0 flex list-none flex-col p-0">
              {rechazos.map((r) => (
                <FilaRechazoDesplegable key={r.gestionId} r={r} />
              ))}
            </ul>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}

/**
 * SLT-191 (R815, R816; DS5) — un rechazo en el teléfono, como el canvas (`CierreDia`): plegado, la
 * guía en mono, el destinatario y «Motivo: …» entero a la izquierda y la fecha del rechazo en su
 * columna fija a la derecha, sin la tienda; desplegado, «Tienda» y «Fecha del rechazo». Toda la fila
 * es el botón (dentro solo hay texto). Sin guía o sin motivo, omite esa pieza, como la tabla de hoy.
 */
function FilaRechazoDesplegable({ r }: Readonly<{ r: CierreRechazoDeTienda }>) {
  const [abierta, setAbierta] = useState(false);
  const idDetalle = useId();
  const fecha = fechaCalendarioCR(new Date(r.rechazadoAt));
  const motivo = motivoGestionLegible(r.motivo, true);
  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={abierta ? idDetalle : undefined}
        onClick={() => setAbierta((v) => !v)}
        className={FILA_RECHAZO_BOTON}
      >
        <span className="flex min-w-0 flex-col gap-1">
          {r.numGuia === null ? null : <span className={cn("font-mono text-[13px]", COLUMNA_FIJA)}>{r.numGuia}</span>}
          <span className={cn("font-medium", TEXTO_ENTERO)}>{r.destinatario}</span>
          {motivo ? <span className={TEXTO_ENTERO}>{`${FILA_MOTIVO_LABEL}: ${motivo}`}</span> : null}
        </span>
        <time dateTime={r.rechazadoAt} className={cn("text-right", COLUMNA_FIJA)}>
          {fecha}
        </time>
      </button>
      {abierta ? (
        <dl id={idDetalle} className="m-0 flex flex-col gap-2 pb-3 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{FILA_TIENDA_LABEL}</dt>
            <dd className={cn("m-0", TEXTO_ENTERO)}>{r.tiendaNombre}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{RECHAZOS_FECHA_COL}</dt>
            <dd className="m-0">{fecha}</dd>
          </div>
        </dl>
      ) : null}
    </li>
  );
}
