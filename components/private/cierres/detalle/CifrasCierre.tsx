"use client";

import { useId } from "react";

import { money } from "@/lib/config/moneda";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import { esMontoNegativo } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { cn } from "@/lib/utils";

import { CIFRAS_REGION_LABEL, METODOS_DEL_RECAUDADO_LABEL } from "./detalle-cierre-labels";
import { metodosVisibles, type Cifra } from "./detalle-cierre-vista";

// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T2.2) — las cifras de arriba
// del detalle (R6-R8): cuatro con la central y la satélite, tres con el mensajero. Qué cifra va y de
// qué campo sale lo decide `cifrasDe`; aquí solo se pinta, con `money()` y con su signo.

export interface CifrasCierreProps {
  cifras: readonly Cifra[];
  totales: CierreTotales;
}

function CajaCifra({ c, totales }: Readonly<{ c: Cifra; totales: CierreTotales }>) {
  const id = useId();
  const negativo = c.esMonto && esMontoNegativo(c.valor);
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border px-4 py-3.5",
        c.destacada ? "border-brand/60 bg-brand-soft" : "border-border bg-card",
      )}
    >
      <span id={id} className="text-sm text-muted-foreground">
        {c.label}
      </span>
      <span
        data-cifra={c.id}
        className={cn(
          "text-xl leading-tight font-bold tabular-nums wrap-anywhere sm:text-2xl",
          c.id === "paraTienda" && !negativo && "text-success-strong",
          negativo && "text-danger-strong",
        )}
      >
        {c.esMonto ? money(c.valor) : c.valor}
      </span>
      {c.conMetodos ? (
        <dl aria-label={METODOS_DEL_RECAUDADO_LABEL} className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {metodosVisibles(totales).map((m) => (
            <div key={m.metodo} className="flex justify-between gap-2">
              <dt>{m.label}</dt>
              <dd className="tabular-nums">{money(m.monto)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {c.contexto ? <span className="text-xs text-muted-foreground">{c.contexto}</span> : null}
    </div>
  );
}

/**
 * @sin-superficie S1 de SLT-95 es el componente base sin montar; lo monta S2 (SLT-100) en /cierres-admin
 */
export function CifrasCierre({ cifras, totales }: Readonly<CifrasCierreProps>) {
  return (
    <div
      role="group"
      aria-label={CIFRAS_REGION_LABEL}
      className={cn(
        "grid shrink-0 grid-cols-2 gap-3",
        cifras.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {cifras.map((c) => (
        <CajaCifra key={c.id} c={c} totales={totales} />
      ))}
    </div>
  );
}
