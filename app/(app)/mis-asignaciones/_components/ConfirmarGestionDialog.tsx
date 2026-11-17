"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// SLT-156 (design §7): la confirmación «¿Gestionar esta orden?» sale del botón de la tarjeta a un
// componente CONTROLADO porque tendrá dos disparadores —el botón «Gestionar» de la tarjeta y el
// escáner de la lista (rebanada B7)—, y el aviso sobre la ruta tiene que ser el mismo en los dos.
// Gestionar una orden fuera del orden sugerido puede cambiar la ruta de reparto: por eso el
// mensajero lo acepta a mano antes de que pase nada, y cancelar no toca nada.

export const CONFIRMAR_GESTION_TITULO = "¿Gestionar esta orden?";
const AVISO =
  "Si gestionas esta orden fuera del orden sugerido, tu ruta de reparto puede cambiar.";
const ACEPTAR = "Aceptar";
const CANCELAR = "Cancelar";

export interface ConfirmarGestionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** El mensajero aceptó: el diálogo ya se cerró cuando llega aquí. */
  onAceptar: () => void;
}

export function ConfirmarGestionDialog({
  abierto,
  onAbiertoChange,
  onAceptar,
}: Readonly<ConfirmarGestionDialogProps>) {
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{CONFIRMAR_GESTION_TITULO}</DialogTitle>
          <DialogDescription>{AVISO}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => onAbiertoChange(false)}
          >
            {CANCELAR}
          </Button>
          <Button
            type="button"
            size="touch"
            onClick={() => {
              onAbiertoChange(false);
              onAceptar();
            }}
          >
            {ACEPTAR}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
