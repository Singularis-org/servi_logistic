"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useToast";
import type { VerificacionWebhook } from "@/lib/interfaces/services/IIntegracionesService";

export interface RevelarTokenWebhookModalProps {
  verificacion: VerificacionWebhook;
  /** El anfitrión borra el token de su estado al cerrar: no hay otra vía de volver a verlo (R18). */
  onClose: () => void;
}

const TEXTOS = {
  titulo: "Webhook de WhatsApp",
  descripcion: "Pega estos dos datos en la configuración del webhook de tu app en Meta.",
  aviso: "Esta es la única vez que verás este token. Si lo pierdes, tendrás que regenerarlo y volver a pegarlo en Meta.",
  url: "URL del webhook",
  token: "Token de verificación",
  copiar: "Copiar",
  copiado: "Copiado al portapapeles",
  sinCopiar: "No se pudo copiar; selecciona el texto y cópialo manualmente",
  guardado: "Ya pegué el token en Meta o lo guardé en un lugar seguro",
  cerrar: "Cerrar",
} as const;

/**
 * SL-36 (R18) — el token de verificación y la URL del webhook, UNA sola vez. Espejo de
 * `RevelarWebhookSecretoModal` de `Configuración › API`: Escape y clic fuera bloqueados, y el único
 * cierre es el botón que habilita la casilla. El token vive solo en el estado del anfitrión (nunca
 * en props del Server Component ni en almacenamiento), así que al recargar ya no existe.
 */
export function RevelarTokenWebhookModal({ verificacion, onClose }: RevelarTokenWebhookModalProps) {
  const toast = useToast();
  const [guardado, setGuardado] = useState(false);

  async function copiar(valor: string) {
    try {
      // Sin `clipboard` (contexto no seguro, navegador embebido) el dato sigue visible y
      // seleccionable: no copiar no es un fallo duro.
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(valor);
      toast.success(TEXTOS.copiado);
    } catch {
      toast.error(TEXTOS.sinCopiar);
    }
  }

  const filas = [
    { id: "webhook-whatsapp-url", etiqueta: TEXTOS.url, valor: verificacion.urlWebhook },
    { id: "webhook-whatsapp-token", etiqueta: TEXTOS.token, valor: verificacion.token },
  ];

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={TEXTOS.titulo}
      description={TEXTOS.descripcion}
      confirmLabel={TEXTOS.cerrar}
      confirmDisabled={!guardado}
      hideCancel
      dismissible={false}
      onConfirm={onClose}
    >
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm font-medium text-destructive">
          {TEXTOS.aviso}
        </p>

        {filas.map((fila) => (
          <div key={fila.id} className="flex flex-col gap-1.5">
            <Label htmlFor={fila.id}>{fila.etiqueta}</Label>
            <div className="flex items-center gap-2">
              <Input id={fila.id} readOnly value={fila.valor} className="font-mono" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copiar(fila.valor)}
                aria-label={`${TEXTOS.copiar}: ${fila.etiqueta}`}
              >
                <Copy aria-hidden="true" />
                {TEXTOS.copiar}
              </Button>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id="webhook-whatsapp-guardado"
            checked={guardado}
            onCheckedChange={(next) => setGuardado(next === true)}
            aria-label={TEXTOS.guardado}
          />
          <label htmlFor="webhook-whatsapp-guardado" className="cursor-pointer">
            {TEXTOS.guardado}
          </label>
        </div>
      </div>
    </Modal>
  );
}
