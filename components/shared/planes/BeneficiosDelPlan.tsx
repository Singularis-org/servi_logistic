"use client";

import {
  ChartColumn,
  Check,
  Clock,
  Gift,
  Headphones,
  Heart,
  Rocket,
  Shield,
  Star,
  Truck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Beneficio, IconoDeBeneficio as ClaveDelIcono } from "@/lib/planes/beneficios";
import { cn } from "@/lib/utils";

// SLT-214 (design §4.2; R5, R20–R24) — la lista de beneficios de un plan, con su ícono. La usan el listado y el
// detalle de la plataforma, «Mi plan» y las tarjetas para cambiar de plan. El catálogo (claves, orden y nombres)
// vive en `lib/planes/beneficios.ts`; aquí solo se le pone a cada clave su ícono de `lucide-react`.

/** R5: el `Record` obliga un ícono por clave; una clave nueva en el catálogo rompe el typecheck hasta tener el suyo. */
const ICONO: Record<ClaveDelIcono, LucideIcon> = {
  equipo: Users,
  soporte: Headphones,
  reloj_24h: Clock,
  rayo: Zap,
  estrella: Star,
  escudo: Shield,
  cohete: Rocket,
  regalo: Gift,
  grafica: ChartColumn,
  camion: Truck,
  check: Check,
  corazon: Heart,
};

/** R5: decorativo; el texto del beneficio (o el nombre del ícono, en el selector) va siempre al lado. */
export function IconoDeBeneficio({ icono, className }: { icono: ClaveDelIcono; className?: string }) {
  const Icono = ICONO[icono];
  return <Icono aria-hidden="true" focusable="false" data-icono={icono} className={cn("size-4 shrink-0", className)} />;
}

export type TextosDeBeneficios = {
  lista: string;
  mostrarMas: string;
  mostrarMenos: string;
};

const TEXTOS: TextosDeBeneficios = {
  lista: "Beneficios",
  mostrarMas: "Mostrar más",
  mostrarMenos: "Mostrar menos",
};

/**
 * R21: con `plegable`, solo se ven los primeros `plegable` y, si hay más, un botón despliega el resto (los `<li>`
 * se añaden al DOM, así la fila o la tarjeta crece de alto). Sin `plegable`, se ven todos. Sin beneficios, pinta
 * `vacio` o, si es `null`, nada.
 */
export function ListaDeBeneficios({
  beneficios,
  plegable,
  vacio = null,
  textos = TEXTOS,
  className,
}: {
  beneficios: readonly Beneficio[];
  plegable?: number;
  vacio?: string | null;
  textos?: TextosDeBeneficios;
  className?: string;
}) {
  const id = useId();
  const [abierta, setAbierta] = useState(false);

  if (beneficios.length === 0) {
    return vacio === null ? null : <p className={cn("text-sm text-muted-foreground", className)}>{vacio}</p>;
  }

  const sePliega = plegable !== undefined && beneficios.length > plegable;
  const visibles = sePliega && !abierta ? beneficios.slice(0, plegable) : beneficios;

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <ul id={id} aria-label={textos.lista} className="flex flex-col gap-1">
        {visibles.map((b, i) => (
          <li key={`${i}-${b.texto}`} className="flex items-start gap-2 text-sm">
            <IconoDeBeneficio icono={b.icono} className="mt-0.5" />
            <span className="break-words">{b.texto}</span>
          </li>
        ))}
      </ul>
      {sePliega ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          aria-expanded={abierta}
          aria-controls={id}
          onClick={() => setAbierta((a) => !a)}
        >
          {abierta ? textos.mostrarMenos : textos.mostrarMas}
        </Button>
      ) : null}
    </div>
  );
}
