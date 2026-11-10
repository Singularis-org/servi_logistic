"use client";

import { money } from "@/lib/config/moneda";
import { cn } from "@/lib/utils";

import { Cuenta } from "./Cuenta";
import {
  POR_TIENDA_COLUMNAS,
  POR_TIENDA_TITULO,
  REPARTO_REGION_LABEL,
  REPARTO_TITULO,
} from "./detalle-cierre-labels";
import type { DineroVista } from "./detalle-cierre-vista";

// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T2.2) — la pestaña «Dinero»
// (R14, R16): el reparto de lo recaudado, las cuentas en formato cascada y «Por tienda». Las líneas
// salen de `lineasDinero`; aquí no se suma ni se resta nada (R71).

/** Colores del reparto, por posición. Tokens semánticos, nunca un hex. */
const COLOR_PARTE = ["bg-success", "bg-foreground", "bg-warning"] as const;

export interface DineroCierreProps {
  dinero: DineroVista;
}

export function DineroCierre({ dinero }: Readonly<DineroCierreProps>) {
  const conBarra = dinero.reparto.every((p) => p.porcentaje !== null);
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label={REPARTO_REGION_LABEL}
        className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-[18px] py-4"
      >
        <h3 className="text-[15px] font-semibold">{REPARTO_TITULO}</h3>
        {conBarra ? (
          <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-muted">
            {dinero.reparto.map((p, i) => (
              <div
                key={p.label}
                className={COLOR_PARTE[i % COLOR_PARTE.length]}
                style={{ width: `${p.porcentaje}%` }}
              />
            ))}
          </div>
        ) : null}
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {dinero.reparto.map((p, i) => (
            <li key={p.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-2.5 rounded-sm", COLOR_PARTE[i % COLOR_PARTE.length])} />
              {p.label}{" "}
              <strong className="font-semibold text-foreground tabular-nums">{money(p.monto)}</strong>
              {p.porcentaje !== null ? ` (${p.porcentaje} %)` : null}
            </li>
          ))}
        </ul>
      </section>

      <div className={cn("grid gap-4", dinero.cuentas.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {dinero.cuentas.map((c) => (
          <Cuenta key={c.titulo} titulo={c.titulo} lineas={c.lineas} />
        ))}
      </div>

      {dinero.porTienda ? (
        <section
          aria-label={POR_TIENDA_TITULO}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card px-[18px] py-4"
        >
          <h3 className="text-[15px] font-semibold">{POR_TIENDA_TITULO}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-1.5 text-left font-normal">
                    {POR_TIENDA_COLUMNAS.tienda}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-normal">
                    {POR_TIENDA_COLUMNAS.recaudado}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-normal">
                    {POR_TIENDA_COLUMNAS.hoy}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-normal">
                    {POR_TIENDA_COLUMNAS.gana}
                  </th>
                </tr>
              </thead>
              <tbody>
                {dinero.porTienda.map((t) => (
                  <tr key={t.tiendaId} className="border-b border-border/50 last:border-0">
                    <th scope="row" className="py-2.5 text-left font-normal">
                      {t.tiendaNombre}
                    </th>
                    <td className="py-2.5 text-right tabular-nums">{money(t.recaudado)}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(t.pagoTienda)}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(t.ganaLaTienda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
