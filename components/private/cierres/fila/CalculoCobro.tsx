"use client";

import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import {
  SIN_TARIFA_CONGELADA_NOTA,
  especialSinPactoBadgeNota,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";

import { Cuenta } from "../detalle/Cuenta";
import type { CalculoVista } from "./fila-gestion-vista";
import { CALCULO_REGION } from "./fila-gestion-labels";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.3; R28, R29, R97) — «Ver cómo se calculó»:
// una `Cuenta` por concepto COBRADO (D2), en dos columnas, con la nota de las tarifas congeladas.
// Qué cuenta va y con qué líneas lo decide `calculoDe` (puro); aquí solo se pinta. Ningún importe se
// calcula (R71): base, IVA y total son strings del servidor.

export interface CalculoCobroProps {
  calculo: CalculoVista;
  /** Para que las regiones de N filas desplegadas no se llamen igual. */
  sufijo: string;
}

export function CalculoCobro({ calculo, sufijo }: Readonly<CalculoCobroProps>) {
  // SL-20 (R19): la nota de «especial sin pacto» nombra el nivel con el nombre del país.
  const etiquetas = useEtiquetasGeograficas();
  return (
    <section aria-label={CALCULO_REGION} className="flex flex-col gap-3">
      {calculo.sinTarifa ? (
        <p role="note" className="text-sm text-destructive">
          {SIN_TARIFA_CONGELADA_NOTA}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {calculo.cuentas.map((c) => (
            <Cuenta
              key={c.titulo}
              titulo={c.titulo}
              ariaLabel={`${c.titulo} ${sufijo}`}
              subtitulo={c.tarifa}
              lineas={c.lineas}
            />
          ))}
        </div>
      )}
      {calculo.notas.map((n) => (
        <p key={n} className="text-[13px] text-muted-foreground">
          {n}
        </p>
      ))}
      {calculo.faltaPacto ? (
        <p role="note" className="text-[13px] text-warning-strong">
          {especialSinPactoBadgeNota(etiquetas)}
        </p>
      ) : null}
      <p className="text-[13px] text-muted-foreground">{calculo.nota}</p>
    </section>
  );
}
