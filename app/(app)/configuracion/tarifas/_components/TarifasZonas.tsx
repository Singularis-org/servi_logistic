"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ZonaResumen } from "@/lib/interfaces/services/ITarifasPantallaService";
import { cn } from "@/lib/utils";

import { textoEstadoZona, TEXTOS } from "./tarifas-textos";

export interface TarifasZonasProps {
  zonas: readonly ZonaResumen[];
  seleccionada: string;
  /** Lo que ya se sabe de cada zona: `cargarPantallaTarifas` no trae el conteo, y cada zona abierta lo da. */
  gruposPorZona: Readonly<Record<string, number>>;
  onElegir: (zonaId: string) => void;
}

function detalle(zona: ZonaResumen, grupos: number | undefined): string | null {
  if (zona.esCentral) return TEXTOS.bodegaPrincipal;
  if (grupos === undefined) return null;
  return grupos === 0 ? TEXTOS.sinGrupos : TEXTOS.gruposDeZona(grupos);
}

/** R17, R33: la lista de zonas con su estado. Bajo el ancho de dos columnas, va encima del panel (R59). */
export function TarifasZonas({ zonas, seleccionada, gruposPorZona, onElegir }: Readonly<TarifasZonasProps>) {
  return (
    <section
      aria-label={TEXTOS.zonas}
      data-testid="tarifas-zonas"
      className="w-full flex-[1_1_250px] overflow-hidden rounded-xl border border-border bg-card xl:max-w-[280px]"
    >
      <h2 className="border-b border-border px-4 py-[13px] text-[13px] font-semibold text-muted-foreground">
        {TEXTOS.zonas}
      </h2>
      <ul>
        {zonas.map((zona) => {
          const activa = zona.id === seleccionada;
          const texto = detalle(zona, gruposPorZona[zona.id]);
          return (
            <li key={zona.id} className="border-b border-border last:border-b-0">
              <Button
                type="button"
                variant="ghost"
                aria-current={activa ? "true" : undefined}
                onClick={() => onElegir(zona.id)}
                className={cn(
                  "h-auto min-h-[58px] w-full justify-between gap-2.5 rounded-none px-3.5 py-2.5 text-left font-normal whitespace-normal",
                  activa && "bg-brand-soft hover:bg-brand-soft dark:bg-brand/15 dark:hover:bg-brand/15",
                )}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{zona.nombre}</span>
                  {texto === null ? null : <span className="text-xs opacity-80">{texto}</span>}
                </span>
                <Badge variant={zona.estado === "completa" ? "success" : "warning"} className="flex-none">
                  {textoEstadoZona(zona.estado, zona.faltantes.length)}
                </Badge>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
