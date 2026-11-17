"use client";

import { useRef, useState } from "react";
import { GripHorizontal, Navigation } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { EstadoConInfo } from "@/components/shared/EstadoInfo";
import { CLASE_INFO_TACTIL, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

import { AbrirEnAppNavegacion } from "./AbrirEnAppNavegacion";
import { GestionarOrdenCardButton } from "./GestionarOrdenCardButton";
import { PosAmountRow } from "./pos-card/PosAmountRow";
import { claseChipEstado, textoParada } from "./pos-card/pos-estado";
import { destinoDeOrden, lineaUbicacion } from "./pos-card/pos-format";

// SLT-166 (R540, design §11, canvas v35: RepartoMapaCompleto) — la hoja inferior que abre el
// marcador de una parada. Presentación pura: la orden llega del módulo, y las dos acciones son las
// de HOY, no otras nuevas:
//   - «Navegar» despliega la fila «Abrir en:» (`AbrirEnAppNavegacion`, feature 289).
//   - «Gestionar» es el `GestionarOrdenCardButton` de la tarjeta, con su «¿Gestionar esta orden?»;
//     al aceptar, el módulo cierra la hoja y abre el modo foco (R510), el mismo camino que la tarjeta.
// SLT-192 (R887-R890): cabecera como el canvas —«número · remisión · destinatario · estado» en una
// fila y la dirección «Cantón · Distrito — dirección»—, sin botón «Cerrar» (asa, Escape o tocar
// fuera) y con nombre accesible «Parada {n}».

export const ASA_HOJA = "Arrastrar para ampliar la hoja";
export const NAVEGAR = "Navegar";

/** Píxeles de arrastre del asa que cuentan como gesto (menos es un toque). */
const UMBRAL_ARRASTRE = 24;

export interface HojaParadaMapaProps {
  /** La orden de la parada tocada; `null` = hoja cerrada. */
  orden: MiAsignacionDTO | null;
  onOpenChange: (abierta: boolean) => void;
  /** Las mismas condiciones que apagan «Gestionar» en la tarjeta (bloqueo, reserva, otra en gestión). */
  gestionarDeshabilitado: boolean;
  /** El mensajero aceptó «¿Gestionar esta orden?». */
  onGestionar: (orden: MiAsignacionDTO) => void;
}

export function HojaParadaMapa({
  orden,
  onOpenChange,
  gestionarDeshabilitado,
  onGestionar,
}: Readonly<HojaParadaMapaProps>) {
  return (
    <Sheet open={orden !== null} onOpenChange={onOpenChange}>
      {orden ? (
        // `key`: cada parada abre la hoja plegada y sin la fila «Abrir en:» de la anterior.
        <ContenidoHoja
          key={orden.id}
          orden={orden}
          onCerrar={() => onOpenChange(false)}
          gestionarDeshabilitado={gestionarDeshabilitado}
          onGestionar={onGestionar}
        />
      ) : null}
    </Sheet>
  );
}

function ContenidoHoja({
  orden,
  onCerrar,
  gestionarDeshabilitado,
  onGestionar,
}: {
  orden: MiAsignacionDTO;
  onCerrar: () => void;
  gestionarDeshabilitado: boolean;
  onGestionar: (orden: MiAsignacionDTO) => void;
}) {
  const [ampliada, setAmpliada] = useState(false);
  const [navegar, setNavegar] = useState(false);
  const inicioArrastre = useRef<number | null>(null);
  // Tras un arrastre el navegador también dispara `click`: sin esto, el gesto se desharía solo.
  const fueArrastre = useRef(false);

  // El asa se toca (alterna) o se arrastra: hacia arriba amplía, hacia abajo pliega y, ya
  // plegada, cierra. El toque es la vía accesible; el arrastre, el gesto del canvas.
  function alSoltar(y: number) {
    const inicio = inicioArrastre.current;
    inicioArrastre.current = null;
    if (inicio === null) return;
    const delta = y - inicio;
    fueArrastre.current = Math.abs(delta) >= UMBRAL_ARRASTRE;
    if (delta <= -UMBRAL_ARRASTRE) setAmpliada(true);
    else if (delta >= UMBRAL_ARRASTRE) {
      if (ampliada) setAmpliada(false);
      else onCerrar();
    }
  }

  // R890: nombre accesible de la hoja (el `aria-label` del canvas); el número ya se ve en la fila.
  const parada = orden.secuenciaRuta === null ? "Parada sin posición" : `Parada ${textoParada(orden)}`;
  const ubicacion = lineaUbicacion(orden);

  return (
    <SheetContent
      side="bottom"
      showCloseButton={false}
      data-ampliada={ampliada ? "true" : "false"}
      className={`gap-3 overflow-y-auto rounded-t-2xl px-4 pb-6 ${ampliada ? "max-h-[90dvh]" : "max-h-[60dvh]"}`}
    >
      <div className="flex justify-center">
        <button
          type="button"
          aria-label={ASA_HOJA}
          aria-expanded={ampliada}
          className="flex h-11 w-24 touch-none items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            if (fueArrastre.current) {
              fueArrastre.current = false;
              return;
            }
            setAmpliada((v) => !v);
          }}
          onPointerDown={(e) => {
            inicioArrastre.current = e.clientY;
          }}
          onPointerUp={(e) => alSoltar(e.clientY)}
        >
          <GripHorizontal aria-hidden="true" />
        </button>
      </div>

      {/* R887: una fila que se parte en líneas sin recortar: número · remisión · destinatario · estado. */}
      <SheetTitle className="sr-only">{parada}</SheetTitle>
      <div data-testid="hoja-parada-cabecera" className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-navy text-xs font-black text-white"
        >
          {textoParada(orden)}
        </span>
        <SheetDescription
          render={<span />}
          className={`font-mono text-xs font-bold text-foreground ${TEXTO_ENTERO}`}
        >
          {orden.numRemision}
        </SheetDescription>
        <span className={`text-sm font-bold text-foreground ${TEXTO_ENTERO}`}>{orden.destinatario}</span>
        <EstadoConInfo
          codigo={orden.estatusValue}
          className={CLASE_INFO_TACTIL}
          chipClassName={`rounded-full px-2 py-1 text-[10px] font-bold tracking-wide ${claseChipEstado(orden.estatusValue)}`}
        />
      </div>

      {/* R888: «Cantón · Distrito — dirección», como la fila Detalle. */}
      <p className={`text-sm text-muted-foreground ${TEXTO_ENTERO}`}>
        {ubicacion || "Sin dirección"}
      </p>

      <PosAmountRow montoCobrar={orden.montoCobrar} />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="touch"
          aria-expanded={navegar}
          onClick={() => setNavegar((v) => !v)}
        >
          <Navigation aria-hidden="true" />
          {NAVEGAR}
        </Button>
        <GestionarOrdenCardButton
          numRemision={orden.numRemision}
          disabled={gestionarDeshabilitado}
          onConfirmar={() => onGestionar(orden)}
        />
      </div>

      {navegar ? <AbrirEnAppNavegacion destino={destinoDeOrden(orden)} /> : null}
    </SheetContent>
  );
}
