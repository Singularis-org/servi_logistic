"use client";

import type { ReactNode } from "react";

import { money } from "@/lib/config/moneda";
import { esMontoNegativo } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { cn } from "@/lib/utils";

import type { LineaCuenta } from "./detalle-cierre-vista";

// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T2.1) — UNA CUENTA en formato
// cascada (D16, R15): una partida por línea, «−» o «+» DELANTE del rótulo de lo que se resta o se
// suma, subtotal con raya punteada y total en negrita con raya continua.
//
// No calcula nada (R71): cada importe es el STRING del servidor pasado por `money()`. El operador
// vive en el rótulo y no pegado al importe (a diferencia de `CascadaDinero`), así que cada línea
// lleva `data-signo` y `data-tipo`: es lo que lee `DineroIdentidadesEnPantalla.test.tsx` para
// comprobar que la cuenta que se ve cierra al céntimo.
//
// SLT-101 «Fila de gestión única y lista con filtros» (T3.2) — las tarjetas de la fila son Cuentas
// (D16) y piden siete props ADITIVAS, todas apagadas por defecto: sin ellas el DOM es el de antes.

const OPERADOR: Record<LineaCuenta["signo"], string> = {
  neutro: "",
  suma: "+ ",
  resta: "− ",
};

/** SLT-104 (R43): lo que pinta una línea con `sinImporte`. */
const SIN_IMPORTE = "—";

export interface CuentaProps {
  titulo: string;
  lineas: readonly LineaCuenta[];
  /** Nombre accesible de la región; por defecto, el título (R20: único en el detalle). */
  ariaLabel?: string;
  className?: string;
  /** SLT-101: junto al título (la marca «Ajustado», R98). */
  insignia?: ReactNode;
  /** SLT-101: «aviso» = borde ámbar (pago ajustado); «aparte» = borde punteado y fondo suave (fulfillment). */
  tono?: "aviso" | "aparte";
  /** SLT-101: con `lineas` vacías, este texto en su lugar («Sin dato», R27). */
  vacio?: string;
  /** SLT-101: una línea gris bajo el total, sin raya (R93). */
  aparte?: { label: string; monto: string };
  /** SLT-101: bloque gris con raya punteada bajo las líneas (motivo y quién ajustó, R98). */
  notas?: readonly string[];
  /** SLT-101: línea gris bajo el título («Tarifa: …», R97). */
  subtitulo?: string;
  /** SLT-101: al final de la tarjeta (botones o un párrafo). */
  pie?: ReactNode;
}

export function Cuenta({
  titulo,
  lineas,
  ariaLabel,
  className,
  insignia,
  tono,
  vacio,
  aparte,
  notas,
  subtitulo,
  pie,
}: Readonly<CuentaProps>) {
  // SLT-104: 15 px, como todos los títulos de cuenta del canvas (`Main.dc.html`, `Fila2.dc.html`).
  const titular = <h3 className="text-[15px] font-semibold">{titulo}</h3>;
  return (
    <section
      aria-label={ariaLabel ?? titulo}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4",
        tono === "aviso" && "border-warning",
        tono === "aparte" && "border-dashed bg-muted/40",
        className,
      )}
    >
      {insignia ? (
        <div className="flex items-center justify-between gap-2">
          {titular}
          {insignia}
        </div>
      ) : (
        titular
      )}
      {subtitulo ? <span className="text-[13px] text-muted-foreground">{subtitulo}</span> : null}
      {lineas.length === 0 && vacio ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          {lineas.map((l, i) => (
            <div
              key={`${l.label}-${i}`}
              data-signo={l.signo}
              data-tipo={l.tipo}
              data-sin-importe={l.sinImporte ? "" : undefined}
              className={cn(
                "flex items-start justify-between gap-3",
                l.signo === "resta" && "text-muted-foreground",
                l.tipo === "subtotal" && "border-t border-dashed border-border pt-2 text-muted-foreground",
                l.tipo === "total" && "border-t border-border pt-2 font-bold text-foreground",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span data-rotulo>{`${OPERADOR[l.signo]}${l.label}`}</span>
                {l.notas?.map((n) => (
                  <span key={n} className="text-xs font-normal text-muted-foreground">
                    {n}
                  </span>
                ))}
              </span>
              <span
                data-monto
                className={cn(
                  "shrink-0 tabular-nums",
                  l.tipo === "total" && esMontoNegativo(l.monto) && "text-danger-strong",
                )}
              >
                {/* SLT-104 (R43): una línea sin importe dice «—», nunca `money("")` ni ₡0. */}
                {l.sinImporte ? SIN_IMPORTE : money(l.monto)}
              </span>
            </div>
          ))}
          {aparte ? (
            <div data-aparte className="flex items-start justify-between gap-3 text-[13px] text-muted-foreground">
              <span>{aparte.label}</span>
              <span className="shrink-0 tabular-nums">{money(aparte.monto)}</span>
            </div>
          ) : null}
          {notas && notas.length > 0 ? (
            <div
              data-notas
              className="flex flex-col gap-0.5 border-t border-dashed border-border pt-2 text-[13px] text-muted-foreground"
            >
              {notas.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {pie ? <div className="mt-auto">{pie}</div> : null}
    </section>
  );
}
