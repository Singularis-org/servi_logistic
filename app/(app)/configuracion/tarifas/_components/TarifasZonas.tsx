"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import type { GrupoDeZonaResumen, ZonaResumen } from "@/lib/interfaces/services/ITarifasPantallaService";
import type { EtiquetasGeograficas } from "@/lib/types/pais";
import { cn } from "@/lib/utils";

import { textoEstadoZona, TEXTOS } from "./tarifas-textos";

export interface TarifasZonasProps {
  zonas: readonly ZonaResumen[];
  seleccionada: string;
  /** Lo de la zona ya abierta, más fresco que `zona.grupos`: un grupo recién creado se ve sin recargar. */
  gruposPorZona: Readonly<Record<string, readonly GrupoDeZonaResumen[]>>;
  onElegir: (zonaId: string) => void;
}

/**
 * La maqueta enseña «Zona especial: 8 distritos» y «1 grupo». R44 prohíbe distinguir ese nombre, así que
 * la regla es la misma para todos: un grupo se nombra con sus distritos; un grupo vacío y varios, se cuentan.
 */
function detalle(
  zona: ZonaResumen,
  grupos: readonly GrupoDeZonaResumen[],
  distrito: EtiquetasGeograficas["distrito"],
): string {
  if (zona.esCentral) return TEXTOS.bodegaPrincipal;
  if (grupos.length === 0) return TEXTOS.sinGrupos;
  const unico = grupos.length === 1 ? grupos[0] : undefined;
  return unico !== undefined && unico.distritos > 0
    ? TEXTOS.grupoUnicoDeZona(
        unico.nombre,
        unico.distritos,
        distrito.singular.toLowerCase(),
        distrito.plural.toLowerCase(),
      )
    : TEXTOS.gruposDeZona(grupos.length);
}

/** R17, R33: la lista de zonas con su estado. Bajo el ancho de dos columnas, va encima del panel (R59). */
export function TarifasZonas({ zonas, seleccionada, gruposPorZona, onElegir }: Readonly<TarifasZonasProps>) {
  const { distrito } = useEtiquetasGeograficas();
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
          const texto = detalle(zona, gruposPorZona[zona.id] ?? zona.grupos, distrito);
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
                  <span className="text-xs opacity-80">{texto}</span>
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
