"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BOTON_TACTIL_MOVIL, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import { cn } from "@/lib/utils";

// SLT-156 (R509, canvas v35: RepartoMejorado) — un aviso de ruta en UNA línea. Abiertos, los dos
// avisos de ruta ocupaban media pantalla del teléfono encima de la lista, que es lo que el
// mensajero vino a ver. El título queda siempre a la vista (se parte si no cabe: R490) y la
// descripción, entera, a un toque de «Ver más».

const VER_MAS = "Ver más";
const VER_MENOS = "Ver menos";

export interface AvisoRutaLineaProps {
  titulo: string;
  /** La descripción completa; se despliega con «Ver más». */
  children: ReactNode;
  variant?: "default" | "destructive";
  /** Control que va en la MISMA fila, al final (p. ej. «Mostrar mapa»). */
  accion?: ReactNode;
}

export function AvisoRutaLinea({
  titulo,
  children,
  variant = "default",
  accion,
}: Readonly<AvisoRutaLineaProps>) {
  const [abierto, setAbierto] = useState(false);
  const idDescripcion = useId();
  const textoBoton = abierto ? VER_MENOS : VER_MAS;

  return (
    <Alert variant={variant} className="gap-1 px-3 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTitle className={cn("flex-1", TEXTO_ENTERO)}>{titulo}</AlertTitle>
        <Button
          type="button"
          variant="ghost"
          // SLT-202 (Carlos, 2026-11-18): control nuevo, sin par en prod: desde `md`, el tamaño por
          // defecto de la casa; en el móvil, los 44 px de SLT-156 (R509), con su `px-2`.
          className={cn(BOTON_TACTIL_MOVIL, "px-2 max-md:px-2")}
          aria-expanded={abierto}
          aria-controls={abierto ? idDescripcion : undefined}
          // Con dos avisos a la vez habría dos «Ver más» iguales para el lector de pantalla: el
          // nombre lleva el título, y empieza por el texto visible (WCAG 2.5.3).
          aria-label={`${textoBoton}: ${titulo}`}
          onClick={() => setAbierto((previo) => !previo)}
        >
          {textoBoton}
          <ChevronDown
            className={cn("size-4 transition-transform", abierto && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
        {accion}
      </div>
      {abierto ? (
        <AlertDescription id={idDescripcion} className="pb-2">
          {children}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}
