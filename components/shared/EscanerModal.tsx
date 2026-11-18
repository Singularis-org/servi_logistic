"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Camera, ScanLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { DentroDeEscanerContext, SELECTOR_CAMPO_ESCANER } from "@/components/shared/EscanerGuiaCard";
import { BOTON_TACTIL_MOVIL, ICONO_TACTIL_MOVIL } from "@/components/shared/texto-entero";
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
// pero una pantalla que hace OTRA cosa debe pasarlo: heredar en silencio el vocabulario ajeno
// es lo que se quiere evitar. Las del mensajero (Reparto, Recoger en bodega y Recolección) pasan
// `ESCANER_LABEL_GUIA` («Escanear o escribir guía», SLT-156 R500); el título de la barra nombra el
// acto («Recoger paquete», «Recolectar en tienda»).
//
// SLT-193 (R925-R928, decisión de Carlos del 2026-11-17): el escáner es UN solo componente. La
// barra con el título visible y el único «Cerrar» de 44 × 44 px son de aquí, para TODOS los usos
// y cualquier disparador; la X pequeña del `Dialog` no se pinta y ninguna pantalla pinta su
// propio cierre (lo vigila `tests/unit/guards/escaner-un-solo-cierre.guardia.test.ts`). Cada
// pantalla pasa `titulo` (obligatorio) y monta su tarjeta sin encabezado propio.
//
// SLT-158 (R571): con puntero fino (escritorio, pistola) el foco inicial va al campo de la
// guía, para que la pistola escriba ahí sin un clic previo; con táctil NO, porque en el
// teléfono abriría el teclado y taparía el visor. Arrancar cerrado no cambia.

/** Texto del disparador cuando la superficie no nombra su propio acto. */
export const ESCANER_LABEL_POR_DEFECTO = "Recibir paquete";

/**
 * SLT-156 (R500): el disparador ÚNICO de escaneo de las pantallas del mensajero (Reparto, Recoger en
 * bodega y Recolección), bajo el encabezado y encima de `BuscadorFiltros`. Arranca cerrado, como
 * todos. El título del diálogo va en su barra (`titulo`); la tarjeta conserva su flujo.
 */
export const ESCANER_LABEL_GUIA = "Escanear o escribir guía";

export interface EscanerModalProps {
  /** Texto del disparador. Nombra el ACTO de esta superficie. */
  label?: string;
  /** Acciones que acompañan al disparador, alineadas al lado contrario. */
  acciones?: ReactNode;
  /**
   * La tarjeta de escaneo propiamente dicha; vive DENTRO del modal. Como función recibe `cerrar`:
   * SLT-156 (R514), Reparto cierra el modal al encontrar la orden para pasar a «¿Gestionar esta
   * orden?». Solo se puede CERRAR desde dentro; abrir sigue siendo el gesto del mensajero.
   */
  children: ReactNode | ((cerrar: () => void) => ReactNode);
  /**
   * SLT-156 (R493, design §4): disparador de 44 px a todo el ancho, para las pantallas del mensajero
   * que ya lo piden (Reparto). Sin ella, el botón de siempre: los demás usos no cambian.
   */
  tactil?: boolean;
  /**
   * SLT-160 (R600, R604): disparador de solo icono (cámara), con `label` como nombre accesible, para ir
   * junto al campo del buscador de los listados. Sin envoltorio de fila. Arranca cerrado igual.
   */
  soloIcono?: boolean;
  /**
   * SLT-200 (punto 7, pedido de Carlos 2026-11-18): con `soloIcono`, el texto del tooltip que dice qué
   * hace el icono. Mismo patrón que `ContactoButtons`: el disparador es EL BOTÓN y el `aria-label`
   * (`label`) se conserva; el tooltip es la ayuda VISUAL de quien ve el icono y no lo reconoce.
   */
  ayuda?: string;
  /**
   * SLT-190 (R867-R869, DS7) y SLT-193 (R925, R927): título VISIBLE del diálogo, en una barra arriba
   * con el único «Cerrar» de 44 × 44 px. Obligatorio: es el único título del diálogo (la tarjeta de
   * dentro va sin encabezado, `sinEncabezado`) y también su nombre accesible.
   */
  titulo: string;
  className?: string;
}

/** SLT-190 (R869): nombre accesible del único botón de cierre de la barra. */
export const ESCANER_CERRAR_LABEL = "Cerrar";

export function EscanerModal({
  label = ESCANER_LABEL_POR_DEFECTO,
  acciones,
  children,
  tactil = false,
  soloIcono = false,
  ayuda,
  titulo,
  className,
}: Readonly<EscanerModalProps>) {
  const [abierto, setAbierto] = useState(false);
  const punteroFino = usePunteroFino();
  const popupRef = useRef<HTMLDivElement>(null);
  const idAyuda = useId();

  /** El campo de la tarjeta con puntero fino; si no, el foco inicial por defecto del Dialog. */
  function focoInicial(): HTMLElement | true {
    if (!punteroFino) return true;
    return popupRef.current?.querySelector<HTMLElement>(SELECTOR_CAMPO_ESCANER) ?? true;
  }

  const dialogo = (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {/* El popup no pinta superficie propia: la tarjeta que entra como `children` YA es
          una tarjeta (borde, fondo, sombra), y envolverla en otra la enmarcaba dos veces.
          El alto lo limita el viewport: la tarjeta es alta y en un teléfono no cabe. */}
      <DialogContent
        ref={popupRef}
        initialFocus={focoInicial}
        // SLT-190 (R869) y SLT-193 (R925): un solo «Cerrar», el de la barra, de 44 px.
        showCloseButton={false}
        className="max-h-[90dvh] max-w-md gap-0 overflow-y-auto border-0 bg-transparent p-0 shadow-none">
        {/* SLT-190 (R867-R869, DS7): la barra del canvas. El título visible es el nombre del
            diálogo (R870) y el «Cerrar» cierra con el efecto de siempre: el `Dialog` desmonta la
            tarjeta (cámara apagada) y la sesión refresca una vez si hubo recepción (R598). La
            barra continúa la tarjeta de abajo (mismo borde y fondo, sin redondeo entre las dos). */}
        <div className="flex items-center justify-between gap-2 rounded-t-2xl border border-b-0 border-border bg-card py-2 pr-2 pl-6 sm:pl-8">
          <DialogTitle className="text-lg leading-tight font-semibold text-balance text-card-foreground">
            {titulo}
          </DialogTitle>
          {/* SLT-202 (Carlos, 2026-11-18): desde `md`, el `icon-sm` del «Cerrar» de prod (el de
              `DialogContent`); en el móvil, los 44 × 44 de SLT-193 (R925). */}
          <DialogClose
            aria-label={ESCANER_CERRAR_LABEL}
            render={
              <Button type="button" variant="ghost" size="icon-sm" className={ICONO_TACTIL_MOVIL} />
            }
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </div>
        {/* SLT-193 (R927): la tarjeta de dentro no repite el título de la barra. */}
        <DentroDeEscanerContext.Provider value>
          {typeof children === "function" ? children(() => setAbierto(false)) : children}
        </DentroDeEscanerContext.Provider>
      </DialogContent>
    </Dialog>
  );

  if (soloIcono) {
    const boton = (
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={label}
        aria-describedby={ayuda ? idAyuda : undefined}
        className={className}
        onClick={() => setAbierto(true)}
      >
        <Camera className="size-5" aria-hidden="true" />
      </Button>
    );
    return (
      <>
        {ayuda ? (
          <Tooltip>
            <TooltipTrigger render={boton} />
            <TooltipContent>{ayuda}</TooltipContent>
            {/* El tooltip de Base UI no se enlaza solo con `aria-describedby`: la misma ayuda,
                oculta a la vista, describe el botón para el lector de pantalla (review m2). */}
            <span id={idAyuda} className="sr-only">
              {ayuda}
            </span>
          </Tooltip>
        ) : (
          boton
        )}
        {dialogo}
      </>
    );
  }

  return (
    <div className={cn("flex w-full flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        // SLT-202 (Carlos, 2026-11-18): con `tactil`, 44 px y todo el ancho SOLO en el móvil (SLT-156,
        // R493); desde `md`, el botón de prod.
        className={tactil ? `${BOTON_TACTIL_MOVIL} max-md:w-full` : undefined}
        onClick={() => setAbierto(true)}
      >
        <ScanLine aria-hidden="true" />
        {label}
      </Button>
      {acciones ? <div className="ms-auto flex gap-2">{acciones}</div> : null}

      {dialogo}
    </div>
  );
}
