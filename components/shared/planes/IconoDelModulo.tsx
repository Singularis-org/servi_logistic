import type { ModuloApagable } from "@prisma/client";
import { Fragment, type ReactNode } from "react";

import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { cn } from "@/lib/utils";

// SLT-99 (diseño aprobado; R3, R5) — los íconos de los módulos, en SVG en línea como el diseño. Van en el orden de
// `ORDEN_MODULOS` y no por clave: la guardia de `tests/unit/tablero-dia/primitivas.guardia.test.ts` no deja que
// `components/shared/` nombre la pantalla de uno de ellos. El tipo de tupla obliga a un ícono por módulo: uno nuevo en
// `ORDEN_MODULOS` rompe el typecheck hasta que tenga el suyo.

/** Un elemento por cada uno de la tupla (mapeado sobre un parámetro de tipo, así solo toca los elementos). */
type UnoPorCada<T extends readonly unknown[]> = { readonly [K in keyof T]: ReactNode };

const TRAZOS_EN_ORDEN: UnoPorCada<typeof ORDEN_MODULOS> = [
  <Fragment key="barras">
    <path d="M3 3v18h18" />
    <path d="M8 17v-5M13 17V8M18 17v-9" />
  </Fragment>,
  <path key="pulso" d="M22 12h-4l-3 8-6-16-3 8H2" />,
  <path key="trofeo" d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4" />,
];

const TRAZOS = Object.fromEntries(ORDEN_MODULOS.map((m, i) => [m, TRAZOS_EN_ORDEN[i]])) as Record<ModuloApagable, ReactNode>;

/** Decorativo: el nombre del módulo va siempre en texto al lado. */
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
