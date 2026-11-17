"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ScanLine } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EscanerModal } from "@/components/shared/EscanerModal";
import { usePunteroFino } from "@/hooks/useEntradaEscaneo";
import { cn } from "@/lib/utils";

// SLT-159 «Escaneo continuo en recepciones y recogidas» (R611, DC5) — la entrada a la recepción
// continua, junto al «Recibir paquete» de guía suelta. Con puntero fino (escritorio, pistola) es
// un enlace a la página «Recibir paquetes»; con táctil, un botón que abre la sesión continua en
// el diálogo de siempre, sin cambiar de página.
//
// Al hidratar, `usePunteroFino` arranca en táctil (snapshot de servidor) y pasa a enlace en el
// primer render del cliente con puntero fino: sin error de hidratación; un frame de parpadeo,
// aceptado en el design.

export const RECIBIR_PAQUETES = "Recibir paquetes";

export interface RecibirPaquetesEntradaProps {
  /** La página de recepción continua del rol. */
  href: string;
  /** La superficie del rol en modo continuo: vive dentro del diálogo táctil. */
  children: ReactNode;
}

export function RecibirPaquetesEntrada({ href, children }: Readonly<RecibirPaquetesEntradaProps>) {
  const punteroFino = usePunteroFino();
  if (punteroFino) {
    return (
      <Link href={href} className={cn(buttonVariants({ variant: "outline" }))}>
        <ScanLine aria-hidden="true" />
        {RECIBIR_PAQUETES}
      </Link>
    );
  }
  return (
    <EscanerModal label={RECIBIR_PAQUETES} className="w-auto">
      {children}
    </EscanerModal>
  );
}
