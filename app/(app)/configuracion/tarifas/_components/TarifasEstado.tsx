"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

import { fechaParaVer, TEXTOS } from "./tarifas-textos";

export function textoEnVigor(activadaAt: Date): string {
  return TEXTOS.enVigorDesde(fechaParaVer(fechaCalendarioCR(new Date(activadaAt))));
}

/** Lo que va en el encabezado de `AppPage`: quien edita antes de activar; desde cuando rige, despues (R40). */
export function TarifasEncabezado({ activadaAt }: Readonly<{ activadaAt: Date | null }>) {
  if (activadaAt === null) return <span className="text-[13px] text-muted-foreground">{TEXTOS.soloMaestro}</span>;
  return <Badge variant="success">{textoEnVigor(activadaAt)}</Badge>;
}

export interface TarifasEstadoProps {
  activada: boolean;
  completas: number;
  total: number;
  puedeEscribir: boolean;
  onActivar: () => void;
}

/** R17, R40, R60: la banda de borrador, con los tokens de `DESIGN.md`; tras activar, la nota de en vigor. */
export function TarifasEstado({ activada, completas, total, puedeEscribir, onActivar }: Readonly<TarifasEstadoProps>) {
  const resumen = TEXTOS.zonasCompletas(completas, total);

  if (activada) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>{TEXTOS.enVigorNota}</p>
        <span className="font-semibold">{resumen}</span>
      </div>
    );
  }

  return (
    <section
      aria-label="Estado de las tarifas"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-warning bg-warning-soft px-[18px] py-4 text-warning-strong dark:bg-warning/15"
    >
      <div className="min-w-0 flex-[1_1_420px]">
        <p className="text-[15px] font-bold">{TEXTOS.bandaTitulo}</p>
        <p className="mt-[3px] text-sm">{TEXTOS.bandaDetalle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="text-sm font-semibold">{resumen}</span>
        {puedeEscribir ? (
          <Button type="button" className="min-h-11 px-[18px] font-semibold" onClick={onActivar}>
            {TEXTOS.activar}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
