"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useBorradorReporteBug } from "@/hooks/useBorradorReporteBug";
import { enviarReporteBugAction } from "@/lib/actions/reporte-bug";
import { DESCRIPCION_MAX } from "@/lib/config/reporte-bug";
import { VENTANA_LADO_MAX, type EnviarReporteBugInput } from "@/lib/types/reporte-bug";
import { cn } from "@/lib/utils";

// SLT-87 (design §8.2; R1–R5, R9, R10) — el botón flotante «Reportar un problema» y su panel de un solo
// envío. Lo monta `app/(app)/layout.tsx` como hermano de la página, solo para usuarios de empresa (R2).
//
// Los textos son constantes de este archivo porque el test los compara literalmente (design §8.4).

export const TEXTOS_REPORTE_BUG = {
  titulo: "Reportar un problema",
  etiquetaDescripcion: "Describe el problema",
  cerrar: "Cerrar",
  enviar: "Enviar",
  descartar: "Descartar",
  gracias: "Gracias, recibimos tu reporte",
  fallo: "No pudimos enviar tu reporte. Inténtalo de nuevo.",
} as const;

/** R4: «{n}/500», sin espacios. */
export function textoContador(n: number): string {
  return `${n}/${DESCRIPCION_MAX}`;
}

type Estado = "editando" | "enviando" | "gracias" | "error";

/** R3: en `/mis-asignaciones` y sus subrutas el chat ocupa la esquina, y este botón va encima. */
function vaSobreElChat(ruta: string | null): boolean {
  return ruta === "/mis-asignaciones" || (ruta?.startsWith("/mis-asignaciones/") ?? false);
}

function ladoValido(lado: number): boolean {
  return Number.isInteger(lado) && lado >= 1 && lado <= VENTANA_LADO_MAX;
}

/**
 * El contexto que solo conoce el navegador (R13). La página es solo la ruta (Q2). Una ventana fuera del
 * rango que acepta el servidor no se manda: perderla es mejor que perder el reporte por validación.
 */
function contextoDelNavegador(): Omit<EnviarReporteBugInput, "descripcion"> {
  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  const standalone =
    typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  // `navigator.standalone` solo existe en Safari de iOS, donde no hay `display-mode`.
  const standaloneIos = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    pagina: window.location.pathname,
    ...(ladoValido(ancho) && ladoValido(alto) ? { ventana: { ancho, alto } } : {}),
    appInstalada: standalone || standaloneIos,
  };
}

export interface ReporteBugBotonProps {
  /** De la sesión, resuelta en el layout: separa el borrador de cada usuario (R7). */
  usuarioId: string;
}

export function ReporteBugBoton({ usuarioId }: ReporteBugBotonProps) {
  const ruta = usePathname();
  const sobreChat = vaSobreElChat(ruta);
  const { texto, cambiar, limpiar } = useBorradorReporteBug(usuarioId);
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>("editando");
  const botonRef = useRef<HTMLButtonElement>(null);
  const idPanel = useId();
  const idTitulo = useId();
  const idCampo = useId();
  const idContador = useId();

  const enviando = estado === "enviando";
  const vacia = texto.trim() === "";

  // M3 (review): al cerrar, el panel vuelve al formulario. El aviso de «Gracias» o de fallo es de esa
  // apertura y no reaparece al reabrir; el borrador no se toca. Un envío en curso se deja terminar.
  function cerrar() {
    setAbierto(false);
    setEstado((actual) => (actual === "enviando" ? actual : "editando"));
    botonRef.current?.focus();
  }

  function abrir() {
    // Un envío que terminó con el panel cerrado no deja su aviso para la siguiente apertura.
    setEstado((actual) => (actual === "enviando" ? actual : "editando"));
    setAbierto(true);
  }

  // M4 (review): Escape cierra el panel esté donde esté el foco. El listener vive solo mientras el panel
  // está abierto y respeta un Escape ya consumido por otro (un menú, un diálogo), igual que
  // `MultiSelectFilter`. No lo consume él: el panel no es modal. Si el foco estaba fuera del panel, se
  // queda donde estaba (propuesta): devolverlo al botón se lo robaría a lo que la persona estaba usando.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    function alPulsarTecla(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const activo = document.activeElement;
      const focoDentro = activo === document.body || (activo !== null && !!panelRef.current?.contains(activo));
      setAbierto(false);
      setEstado((actual) => (actual === "enviando" ? actual : "editando"));
      if (focoDentro) botonRef.current?.focus();
    }
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [abierto]);

  function alEscribir(siguiente: string) {
    cambiar(siguiente);
    if (estado === "gracias") setEstado("editando");
  }

  function descartar() {
    limpiar();
    setEstado("editando");
  }

  async function enviar() {
    if (vacia || enviando) return;
    setEstado("enviando");
    let enviado = false;
    try {
      const r = await enviarReporteBugAction({ descripcion: texto, ...contextoDelNavegador() });
      enviado = r.status === "enviado";
    } catch {
      // Fallo manejado: una caída de red o del servidor se avisa en el panel igual que un rechazo (R10),
      // y el borrador se conserva para reintentar.
      enviado = false;
    }
    if (enviado) limpiar();
    setEstado(enviado ? "gracias" : "error");
  }

  return (
    <>
      {abierto && (
        <Card
          id={idPanel}
          role="dialog"
          ref={panelRef}
          aria-labelledby={idTitulo}
          className={cn(
            "fixed right-5 z-40 w-[min(22rem,calc(100vw-2.5rem))] gap-3 shadow-lg",
            sobreChat ? "bottom-40" : "bottom-20",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-(--card-spacing)">
            <h2 id={idTitulo} className="font-heading text-base font-medium">
              {TEXTOS_REPORTE_BUG.titulo}
            </h2>
            <Button variant="ghost" size="icon-sm" aria-label={TEXTOS_REPORTE_BUG.cerrar} onClick={cerrar}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-col gap-1.5 px-(--card-spacing)">
            <label htmlFor={idCampo} className="sr-only">
              {TEXTOS_REPORTE_BUG.etiquetaDescripcion}
            </label>
            <Textarea
              id={idCampo}
              autoFocus
              value={texto}
              maxLength={DESCRIPCION_MAX}
              disabled={enviando}
              aria-describedby={idContador}
              onChange={(e) => alEscribir(e.target.value)}
              className="max-h-60 min-h-28"
            />
            <p id={idContador} aria-live="polite" className="self-end text-xs text-muted-foreground tabular-nums">
              {textoContador(texto.length)}
            </p>
            {estado === "gracias" && (
              <p role="status" className="text-sm text-success-strong">
                {TEXTOS_REPORTE_BUG.gracias}
              </p>
            )}
            {estado === "error" && (
              <p role="alert" className="text-sm text-danger-strong">
                {TEXTOS_REPORTE_BUG.fallo}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 px-(--card-spacing)">
            <Button variant="outline" disabled={enviando} onClick={descartar}>
              {TEXTOS_REPORTE_BUG.descartar}
            </Button>
            <Button disabled={vacia} loading={enviando} onClick={() => void enviar()}>
              {TEXTOS_REPORTE_BUG.enviar}
            </Button>
          </div>
        </Card>
      )}
      <button
        ref={botonRef}
        type="button"
        aria-label={TEXTOS_REPORTE_BUG.titulo}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        data-posicion={sobreChat ? "sobre-chat" : "esquina"}
        onClick={() => (abierto ? cerrar() : abrir())}
        className={cn(
          "fixed right-5 z-40 flex size-12 items-center justify-center rounded-full border bg-card text-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-95",
          sobreChat ? "bottom-24" : "bottom-5",
        )}
      >
        <Bug className="size-5" aria-hidden="true" />
      </button>
    </>
  );
}
