import type { ModuloApagable } from "@prisma/client";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// SLT-99 (diseño aprobado; R3, R5) — los íconos de los módulos, en SVG en línea como el diseño. Un `Record` por
// `ModuloApagable`: un módulo nuevo del enum rompe el typecheck hasta que tenga su ícono.

const TRAZOS: Record<ModuloApagable, ReactNode> = {
  analitica: (
    <>
      <path d="M3 3v18h18" />
      <path d="M8 17v-5M13 17V8M18 17v-9" />
    </>
  ),
  monitoreo: <path d="M22 12h-4l-3 8-6-16-3 8H2" />,
  ranking: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4" />,
};

/** Decorativo: el nombre del módulo va siempre en texto al lado. */
// @sin-superficie la monta CambioDePlan de «Mi plan» en la task T7 de SLT-99, que quita esta línea.
export function IconoDelModulo({ modulo, className }: { readonly modulo: ModuloApagable; readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-modulo={modulo}
      className={cn("size-4 shrink-0", className)}
    >
      {TRAZOS[modulo]}
    </svg>
  );
}
