"use client";

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

const OPERADOR: Record<LineaCuenta["signo"], string> = {
  neutro: "",
  suma: "+ ",
  resta: "− ",
};

export interface CuentaProps {
  titulo: string;
  lineas: readonly LineaCuenta[];
  /** Nombre accesible de la región; por defecto, el título (R20: único en el detalle). */
  ariaLabel?: string;
  className?: string;
}

export function Cuenta({ titulo, lineas, ariaLabel, className }: Readonly<CuentaProps>) {
  return (
    <section
      aria-label={ariaLabel ?? titulo}
      className={cn("flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4", className)}
    >
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="flex flex-col gap-2 text-sm">
        {lineas.map((l, i) => (
          <div
            key={`${l.label}-${i}`}
            data-signo={l.signo}
            data-tipo={l.tipo}
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
              {money(l.monto)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
