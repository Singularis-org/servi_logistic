"use client";

import { useState } from "react";
import { Truck } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ConfirmarGestionDialog } from "./ConfirmarGestionDialog";

// Rama ux (pedido humano): llevar una orden a gestión deja de ser un TOQUE en cualquier parte de
// la card —se disparaba sin querer al manipular la lista— y pasa por un control explícito al pie,
// en la misma línea que "Gestionar más tarde" y en el extremo opuesto. La confirmación vive en
// `ConfirmarGestionDialog` (SLT-156: la comparte con el escáner de la lista).

export interface GestionarOrdenCardButtonProps {
  /** Nº de remisión; solo para el nombre accesible del control y del modal. */
  numRemision: string;
  /** Confirmación del mensajero: lleva esta orden a gestión. */
  onConfirmar: () => void;
  /**
   * Mensajero bloqueado (cierre pendiente), gestión activa en otra orden, o —desde la feature
   * 261 (R12)— orden reservada para un día de reparto posterior. Quién lo decide y por qué vive
   * en el llamador (`RepartoModule.renderCardEnReparto`); aquí sólo se apaga el control.
   *
   * ⚠️ Apagar el botón dice QUE no se puede, no POR QUÉ. El motivo va SIEMPRE en palabras al
   * lado —el aviso de bloqueo total arriba, o la línea de la card en el caso de la reserva—:
   * un control gris sin explicación es un misterio, y es la regla que el repo ya sigue.
   */
  disabled?: boolean;
}

export function GestionarOrdenCardButton({
  numRemision,
  onConfirmar,
  disabled = false,
}: Readonly<GestionarOrdenCardButtonProps>) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* SLT-156 (R493): 44 px; el mensajero lo pulsa en la calle, con el pulgar. */}
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="w-fit"
        disabled={disabled}
        aria-label={`Gestionar la orden ${numRemision}`}
        onClick={() => setAbierto(true)}
      >
        <Truck aria-hidden="true" />
        Gestionar
      </Button>

      <ConfirmarGestionDialog
        abierto={abierto}
        onAbiertoChange={setAbierto}
        onAceptar={onConfirmar}
      />
    </>
  );
}
