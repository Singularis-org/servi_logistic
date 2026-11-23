"use client";

import type { ReactNode, Ref } from "react";
import { Check } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Formulario por pasos genérico (SLT-130, R1–R5): la lista de pasos, «Paso n de m» con el
 * título del actual, el contenido con su propio scroll y el pie fijo abajo. No guarda estado:
 * quien lo usa decide el paso actual, cuáles se pueden elegir y qué hace al elegir uno.
 * SLT-144 (R5, R6): con borrador, además, qué pasos están guardados (✓) y cuáles cambiaron sin volver a
 * guardarse («Sin guardar»).
 */
export type PasoDelFormulario = { id: string; titulo: string };

export type FormularioPorPasosProps = {
  pasos: readonly PasoDelFormulario[];
  /** Id del paso actual. */
  actual: string;
  /**
   * SLT-144 (R5): pasos que se pueden elegir; el resto va deshabilitado. El paso actual siempre se puede
   * elegir, salvo con `deshabilitado`. Con borrador, `pasosElegibles` aplica la regla de los pasos guardados.
   */
  elegibles?: ReadonlySet<string>;
  /**
   * SLT-144 (R4): toda la lista deshabilitada, también el paso actual. Mientras un guardado o la confirmación
   * están en vuelo no se cambia de paso.
   */
  deshabilitado?: boolean;
  /** SLT-144 (R6): pasos guardados en el borrador; llevan ✓ y el nombre accesible «<título> (guardado)». */
  guardados?: ReadonlySet<string>;
  /** SLT-144 (R6): pasos guardados cuyos valores cambiaron en pantalla; pierden el ✓ y dicen «Sin guardar». */
  sinGuardar?: ReadonlySet<string>;
  onIr: (id: string) => void;
  /** Por defecto "vertical". En pantalla angosta siempre es "horizontal" (R3). */
  orientacion?: "vertical" | "horizontal";
  /** Botones de quien lo usa. */
  pie: ReactNode;
  /** Contenido del paso actual. */
  children: ReactNode;
  /** Para mover el foco al título al cambiar de paso. */
  tituloRef?: Ref<HTMLHeadingElement>;
};

export const TEXTOS_FORMULARIO_POR_PASOS = {
  navegacion: "Pasos",
  pasoDe: (n: number, m: number) => `Paso ${n} de ${m}`,
  // SLT-144 (design §9): viven aquí y no en los textos de planes porque los pinta este componente compartido.
  pasoGuardado: (titulo: string) => `${titulo} (guardado)`,
  marcaSinGuardar: "Sin guardar",
} as const;

const NINGUNO: ReadonlySet<string> = new Set();

/**
 * SLT-144 (design §4.3; R5): con borrador se elige el primer paso, un paso guardado o el que sigue a uno
 * guardado. Así no se salta a un paso sin haber guardado el anterior.
 */
export function pasosElegibles(pasos: readonly PasoDelFormulario[], guardados: ReadonlySet<string>): Set<string> {
  return new Set(
    pasos
      .filter((p, i) => i === 0 || guardados.has(p.id) || guardados.has(pasos[i - 1]?.id ?? ""))
      .map((p) => p.id),
  );
}

export function FormularioPorPasos({
  pasos,
  actual,
  elegibles = NINGUNO,
  deshabilitado = false,
  guardados = NINGUNO,
  sinGuardar = NINGUNO,
  onIr,
  orientacion = "vertical",
  pie,
  children,
  tituloRef,
}: FormularioPorPasosProps) {
  const efectiva = useIsMobile() ? "horizontal" : orientacion;
  const vertical = efectiva === "vertical";
  const indice = pasos.findIndex((p) => p.id === actual);
  const pasoActual = indice >= 0 ? pasos[indice] : undefined;

  return (
    <div
      data-orientacion={efectiva}
      className={cn("flex min-h-0 flex-1", vertical ? "flex-row" : "flex-col")}
    >
      <nav
        aria-label={TEXTOS_FORMULARIO_POR_PASOS.navegacion}
        className={cn(
          "flex-none",
          vertical
            ? "w-[220px] overflow-y-auto border-r border-border p-3"
            : "overflow-x-auto border-b border-border px-3 py-2",
        )}
      >
        <ol className={cn("flex gap-1", vertical ? "flex-col" : "flex-row")}>
          {pasos.map((paso, i) => (
            <li key={paso.id} className="flex-none">
              <BotonDelPaso
                numero={i + 1}
                titulo={paso.titulo}
                esActual={paso.id === actual}
                habilitado={!deshabilitado && (paso.id === actual || elegibles.has(paso.id))}
                estado={sinGuardar.has(paso.id) ? "sin_guardar" : guardados.has(paso.id) ? "guardado" : null}
                onClick={() => onIr(paso.id)}
              />
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pasoActual ? (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground">
                {TEXTOS_FORMULARIO_POR_PASOS.pasoDe(indice + 1, pasos.length)}
              </p>
              <h3
                ref={tituloRef}
                tabIndex={-1}
                className="text-base font-semibold outline-none"
              >
                {pasoActual.titulo}
              </h3>
            </div>
          ) : null}
          {children}
        </div>
        <div className="flex-none border-t border-border bg-background p-4">
          {pie}
        </div>
      </div>
    </div>
  );
}

function BotonDelPaso({
  numero,
  titulo,
  esActual,
  habilitado,
  estado,
  onClick,
}: {
  numero: number;
  titulo: string;
  esActual: boolean;
  habilitado: boolean;
  /** SLT-144 (R6): «Sin guardar» manda sobre el ✓: un paso que cambió ya no está guardado como se ve. */
  estado: "guardado" | "sin_guardar" | null;
  onClick: () => void;
}) {
  const guardado = estado === "guardado";
  return (
    <button
      type="button"
      aria-current={esActual ? "step" : undefined}
      aria-label={guardado ? TEXTOS_FORMULARIO_POR_PASOS.pasoGuardado(titulo) : undefined}
      disabled={!habilitado}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        esActual
          ? "bg-muted font-medium text-primary"
          : "text-muted-foreground enabled:hover:bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-6 flex-none items-center justify-center rounded-full border text-xs",
          esActual
            ? "border-primary bg-primary text-primary-foreground"
            : guardado
              ? "border-primary text-primary"
              : "border-border",
        )}
      >
        {guardado ? <Check className="size-3.5" /> : numero}
      </span>
      <span>{titulo}</span>
      {estado === "sin_guardar" ? (
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {TEXTOS_FORMULARIO_POR_PASOS.marcaSinGuardar}
        </span>
      ) : null}
    </button>
  );
}
