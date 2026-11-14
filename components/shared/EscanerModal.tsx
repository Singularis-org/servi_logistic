"use client";

import { useRef, useState, type ReactNode } from "react";
import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SELECTOR_CAMPO_ESCANER } from "@/components/shared/EscanerGuiaCard";
import { usePunteroFino } from "@/hooks/useEntradaEscaneo";
import { cn } from "@/lib/utils";

// El envoltorio ÚNICO de toda tarjeta de escaneo del producto (`EscanerGuiaCard` y
// compañía): recepción en origen, en bodega central, en satélite, recogida del mensajero y
// recolección en tienda. Nació en `/ordenes` como `ReceptorDesplegable`, se promovió aquí
// el 2026-07-31 como `EscanerDesplegable` (plegable en línea) y el 2026-08-10 pasó a MODAL
// por pedido del humano: la tarjeta es alta (cámara + número de guía) y desplegada en línea
// se comía la pantalla del listado que la acompaña. En modal, el escaneo ocupa el foco
// mientras dura y devuelve la pantalla intacta al cerrar.
//
// Lo que NO cambia al pasar de plegable a modal —y es el motivo por el que este envoltorio
// existe— es el montaje:
//
//   El contenido se MONTA y DESMONTA con la apertura (no queda oculto por CSS) a propósito:
//   mientras está dentro vive `QrScanner`, y dejarlo montado significaría la cámara
//   ENCENDIDA detrás de algo invisible — en un teléfono, en la calle. El popup de Base UI
//   se desmonta al terminar la animación de salida, así que se puede cerrar con animación y
//   aun así apagar la cámara al final.
//
// Arranca SIEMPRE cerrado, sin excepción por pantalla: es decisión del humano del
// 2026-07-31, tomada sobre la alternativa de una prop `defaultOpen`. Así la cámara nunca
// arranca encendida y el gesto es el mismo en toda la app. Si vuelve a aparecer una prop
// para abrirlo de entrada, vuelve el problema que esto cierra.
//
// No sabe de dominio: el acto lo nombra cada superficie con `label`. El valor por defecto
// es "Recibir paquete" —el acto de las dos superficies de recepción, que son la mayoría—,
// pero una pantalla que hace OTRA cosa ("Recoger paquete", "Recolectar en tienda") debe
// pasarlo: heredar en silencio el vocabulario ajeno es lo que se quiere evitar.
//
// El cierre lo pone el propio Dialog (la "X" con nombre accesible "Cerrar"), así que ya no
// hay un segundo texto que mantener por superficie.
//
// SLT-158 (R571): con puntero fino (escritorio, pistola) el foco inicial va al campo de la
// guía, para que la pistola escriba ahí sin un clic previo; con táctil NO, porque en el
// teléfono abriría el teclado y taparía el visor. Arrancar cerrado no cambia.

/** Texto del disparador cuando la superficie no nombra su propio acto. */
export const ESCANER_LABEL_POR_DEFECTO = "Recibir paquete";

export interface EscanerModalProps {
  /** Texto del disparador. Nombra el ACTO de esta superficie. */
  label?: string;
  /** Acciones que acompañan al disparador, alineadas al lado contrario. */
  acciones?: ReactNode;
  /** La tarjeta de escaneo propiamente dicha; vive DENTRO del modal. */
  children: ReactNode;
  className?: string;
}

export function EscanerModal({
  label = ESCANER_LABEL_POR_DEFECTO,
  acciones,
  children,
  className,
}: Readonly<EscanerModalProps>) {
  const [abierto, setAbierto] = useState(false);
  const punteroFino = usePunteroFino();
  const popupRef = useRef<HTMLDivElement>(null);

  /** El campo de la tarjeta con puntero fino; si no, el foco inicial por defecto del Dialog. */
  function focoInicial(): HTMLElement | true {
    if (!punteroFino) return true;
    return popupRef.current?.querySelector<HTMLElement>(SELECTOR_CAMPO_ESCANER) ?? true;
  }

  return (
    <div className={cn("flex w-full flex-wrap items-center gap-2", className)}>
      <Button type="button" variant="outline" onClick={() => setAbierto(true)}>
        <ScanLine aria-hidden="true" />
        {label}
      </Button>
      {acciones ? <div className="ms-auto flex gap-2">{acciones}</div> : null}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        {/* El popup no pinta superficie propia: la tarjeta que entra como `children` YA es
            una tarjeta (borde, fondo, sombra), y envolverla en otra la enmarcaba dos veces.
            El alto lo limita el viewport: la tarjeta es alta y en un teléfono no cabe. */}
        <DialogContent
          ref={popupRef}
          initialFocus={focoInicial}
          className="max-h-[90dvh] max-w-md overflow-y-auto border-0 bg-transparent p-0 shadow-none">
          {/* El nombre accesible del diálogo. Visualmente lo dice el título de la tarjeta,
              que es de quien la monta: aquí solo se garantiza que el diálogo tenga uno. */}
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
    </div>
  );
}
