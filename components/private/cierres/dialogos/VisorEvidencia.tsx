"use client";

import { useState } from "react";

import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";

import { VISOR_EVIDENCIA_TEXTO, descripcionVisor } from "./dialogos-labels";

/**
 * SLT-103 (R54, R137-R139) — El ÚNICO visor de evidencia del módulo de cierres. Lo montan
 * `/cierres-admin` › Mensajero, `/cierres-admin` › Bodega y `/cierre-dia`.
 *
 * No decide quién ve qué: recibe URL ya FIRMADAS por el servidor, en su orden. Con varias fotos,
 * «Anterior» y «Siguiente» van en el cuerpo, bajo la foto (PA4), sin vuelta circular; «Cerrar» va
 * al pie y Escape o un clic fuera lo cierran (los da `Modal`).
 */

/** Lo que abre el visor: las URL FIRMADAS de UNA gestión, en el orden del servidor. */
export interface EvidenciaAbierta {
  urls: readonly string[];
  /** «Orden X · Y». Ausente en superficies que no lo tienen a mano. */
  contexto?: string;
}

export interface VisorEvidenciaProps {
  /** `null` = cerrado. Cada apertura es un objeto nuevo y vuelve a la foto 1 (R139). */
  evidencia: EvidenciaAbierta | null;
  onClose: () => void;
}

export function VisorEvidencia({ evidencia, onClose }: VisorEvidenciaProps) {
  // El índice va atado al objeto que se abrió: con otro objeto (cada apertura es uno nuevo) vuelve
  // a la foto 1 sin un efecto que resetee el estado (R139).
  const [navegacion, setNavegacion] = useState<{ de: EvidenciaAbierta | null; indice: number }>({
    de: evidencia,
    indice: 0,
  });

  const urls = evidencia?.urls ?? [];
  const n = urls.length;
  const i = navegacion.de === evidencia ? Math.min(navegacion.indice, Math.max(n - 1, 0)) : 0;
  const url = urls[i];

  function irA(destino: number) {
    setNavegacion({ de: evidencia, indice: Math.min(Math.max(destino, 0), Math.max(n - 1, 0)) });
  }

  return (
    <Modal
      open={evidencia !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onClose();
      }}
      title={VISOR_EVIDENCIA_TEXTO.titulo}
      description={evidencia ? descripcionVisor(i + 1, n, evidencia.contexto) : undefined}
      confirmLabel={VISOR_EVIDENCIA_TEXTO.cerrar}
      hideCancel
      onConfirm={onClose}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada externa
        <img src={url} alt={VISOR_EVIDENCIA_TEXTO.alt} className="max-h-[60vh] w-full rounded-md object-contain" />
      ) : null}
      {n > 1 ? (
        <div role="group" aria-label={VISOR_EVIDENCIA_TEXTO.navegacion} className="mt-3 flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={i === 0}
            onClick={() => irA(i - 1)}
          >
            {VISOR_EVIDENCIA_TEXTO.anterior}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={i === n - 1}
            onClick={() => irA(i + 1)}
          >
            {VISOR_EVIDENCIA_TEXTO.siguiente}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
