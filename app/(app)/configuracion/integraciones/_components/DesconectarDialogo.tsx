"use client";

import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/ui/badge";
import { CATALOGO_INTEGRACIONES, type ServicioIntegracion } from "@/lib/types/integraciones";

import { ETIQUETA_MARCA, TEXTOS_PANTALLA } from "./integraciones-textos";

export interface DesconectarDialogoProps {
  servicio: ServicioIntegracion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Llama a la action. Si lanza, el Modal deja el diálogo abierto y avisa por `onError`. */
  onConfirmar: () => Promise<void>;
  onError?: (error: unknown) => void;
}

const TEXTOS = {
  titulo: (nombre: string) => `¿Desconectar ${nombre}?`,
  marca: "Este servicio es",
  queDeja: "Sin él, esto deja de funcionar:",
  borrado: "Se borran sus credenciales guardadas. Para volver a usarlo tendrás que configurarlo de nuevo.",
} as const;

/**
 * SL-36 (R31) — la confirmación de desconectar. La marca y «qué deja de funcionar» salen del
 * catálogo y se muestran ANTES de confirmar: desconectar un servicio requerido no puede ser un clic
 * a ciegas. El borrado en sí (R32) es de la action.
 */
export function DesconectarDialogo({ servicio, open, onOpenChange, onConfirmar, onError }: DesconectarDialogoProps) {
  const entrada = CATALOGO_INTEGRACIONES[servicio];
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={TEXTOS.titulo(entrada.nombre)}
      confirmLabel={TEXTOS_PANTALLA.desconectar}
      confirmVariant="destructive"
      onConfirm={onConfirmar}
      onError={onError}
      size="md"
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          {TEXTOS.marca}
          <Badge variant={entrada.marca === "requerido" ? "warning" : "secondary"} data-testid="marca-desconexion">
            {ETIQUETA_MARCA[entrada.marca]}
          </Badge>
        </p>
        <div className="flex flex-col gap-1">
          <p className="font-medium">{TEXTOS.queDeja}</p>
          <p data-testid="que-deja-de-funcionar">{entrada.queDejaDeFuncionar}</p>
        </div>
        <p className="text-muted-foreground">{TEXTOS.borrado}</p>
      </div>
    </Modal>
  );
}
