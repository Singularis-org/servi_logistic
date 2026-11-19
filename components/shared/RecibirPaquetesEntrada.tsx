"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ScanLine } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EscanerModal } from "@/components/shared/EscanerModal";
import { cn } from "@/lib/utils";

// SLT-159 «Escaneo continuo en recepciones y recogidas» (R611, DC5) — la entrada a la recepción
// continua. SLT-202 (Carlos, 2026-11-18): es el único disparador de recibir, «Recibir paquete», en el
// sitio del de prod; la guía suelta se quitó. Con puntero fino (escritorio, pistola) es
// un enlace a la página «Recibir paquetes»; con táctil, un botón que abre la sesión continua en
// el diálogo de siempre, sin cambiar de página.
//
// Review B1: el elemento NO cambia de rol al hidratar. En servidor y durante la hidratación el
// puntero es DESCONOCIDO (`null`) y no se pinta nada; en el primer render del cliente aparece ya
// como enlace o como botón. Antes nacía como botón (táctil por defecto) y pasaba a enlace: en esa
// ventana había dos botones cuyo nombre contenía «Recibir paquete».

export const RECIBIR_PAQUETES = "Recibir paquetes";

/**
 * SLT-202 (Carlos, 2026-11-18): el texto del disparador. Es el ÚNICO de recibir de la pantalla y dice
 * lo que decía el de prod; abre la recepción continua (la página o el diálogo, que se siguen llamando
 * «Recibir paquetes»).
 */
export const RECIBIR_PAQUETE = "Recibir paquete";

const CONSULTA_PUNTERO_FINO = "(pointer: fine)";

function suscribirPuntero(alCambiar: () => void) {
  const mql = window.matchMedia(CONSULTA_PUNTERO_FINO);
  mql.addEventListener("change", alCambiar);
  return () => mql.removeEventListener("change", alCambiar);
}

/** `true` fino, `false` táctil, `null` aún desconocido (servidor e hidratación). */
function usePunteroConocido(): boolean | null {
  return useSyncExternalStore(
    suscribirPuntero,
    () => window.matchMedia(CONSULTA_PUNTERO_FINO).matches,
    () => null,
  );
}

export interface RecibirPaquetesEntradaProps {
  /** La página de recepción continua del rol. */
  href: string;
  /** La superficie del rol en modo continuo: vive dentro del diálogo táctil. */
  children: ReactNode;
}

export function RecibirPaquetesEntrada({ href, children }: Readonly<RecibirPaquetesEntradaProps>) {
  const punteroFino = usePunteroConocido();
  if (punteroFino === null) return null;
  if (punteroFino) {
    return (
      <Link href={href} className={cn(buttonVariants({ variant: "outline" }))}>
        <ScanLine aria-hidden="true" />
        {RECIBIR_PAQUETE}
      </Link>
    );
  }
  return (
    <EscanerModal label={RECIBIR_PAQUETE} titulo={RECIBIR_PAQUETES} className="w-auto">
      {children}
    </EscanerModal>
  );
}
