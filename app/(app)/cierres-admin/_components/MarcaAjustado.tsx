"use client";

import { badgeVariants } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ROL_LABELS } from "@/lib/auth/rol-label";
import { money } from "@/lib/config/moneda";
import type { AjustePagoGestionDTO } from "@/lib/interfaces/services/ICierreDiaService";
import { cn } from "@/lib/utils";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { horaCostaRica } from "@/lib/utils/hora-cr";

import {
  AJUSTADO_BADGE_LABEL,
  AJUSTES_PAGO_TITULO,
  AJUSTE_MOTIVO_LABEL,
  ajustadoBadgeAriaLabel,
} from "./cierre-labels";

/** «AAAA-MM-DD HH:mm» de Costa Rica de un instante ISO; el ISO tal cual si no es una fecha. */
function cuandoAjuste(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fechaCalendarioCR(d)} ${horaCostaRica(iso)}`;
}

/**
 * SLT-56 (design §5; R19/R20) — la marca «Ajustado» de una gestión. Es un BOTÓN con forma de
 * badge que abre, en un popover, sus ajustes en el orden en que llegan (cronológico, lo garantiza
 * el servidor): quién y con qué rol, cuándo, de cuánto a cuánto y por qué. Popover y no tooltip:
 * se abre con el dedo, que es como se revisa un cierre en el teléfono. Los importes son STRING y
 * se pintan con el mismo formateador que la celda (money-safe).
 *
 * El `click` no sube: la marca vive dentro de la fila desplegable y un toque no puede plegarla.
 */
export function MarcaAjustado({ ajustes }: Readonly<{ ajustes: readonly AjustePagoGestionDTO[] }>) {
  return (
    <Popover modal={false}>
      <PopoverTrigger
        aria-label={ajustadoBadgeAriaLabel(ajustes.length)}
        className={cn(
          badgeVariants({ variant: "warning" }),
          "cursor-pointer focus-visible:ring-3 focus-visible:ring-ring",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {AJUSTADO_BADGE_LABEL}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="max-w-[min(22rem,calc(100vw-2rem))]"
        onClick={(e) => e.stopPropagation()}
      >
        <PopoverTitle>{AJUSTES_PAGO_TITULO}</PopoverTitle>
        <ol className="mt-2 flex flex-col gap-2" aria-label={AJUSTES_PAGO_TITULO}>
          {ajustes.map((a, i) => (
            <li
              key={`${a.creadoAt}-${i}`}
              className="flex flex-col gap-0.5 border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <span className="text-xs text-muted-foreground">
                {cuandoAjuste(a.creadoAt)} · {a.actorNombre} ({ROL_LABELS[a.actorRol]})
              </span>
              <span className="font-medium tabular-nums">
                {money(a.pagoAnterior)} → {money(a.pagoNuevo)}
              </span>
              <span className="text-xs">
                {AJUSTE_MOTIVO_LABEL}: {a.motivo}
              </span>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
