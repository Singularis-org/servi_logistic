"use client";

import { useState } from "react";

import { Modal } from "@/components/shared/Modal";
import { ManifiestoResultado } from "@/components/shared/ManifiestoResultado";
import { useToast } from "@/hooks/useToast";
import { retirarABodegaCentral } from "@/lib/actions/ordenes-guia";
import type { DetalleConflicto, RetirarSateliteResult } from "@/lib/types/orden-guia";
import type { OrdenListItemDTO } from "@/lib/types/orden";

import { guiaDecisionErrorMessage } from "./guia-decision-error-messages";

export interface RetirarACentralModalProps {
  open: boolean;
  /**
   * Órdenes en `en_bodega_satelite` seleccionadas al abrir (snapshot). El padre ya filtró por
   * estado; el service revalida (R973).
   */
  ordenes: OrdenListItemDTO[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Motivo de usuario de cada orden rechazada en un `conflict` (R981). Se reconoce por el prefijo
 * estable del `motivo` que emite `GuiaAsignacionService.retirarABodegaCentral`; el valor interno
 * del estado no se muestra.
 */
function motivoDeRetiro(motivo: string): string {
  if (motivo === "orden no existe" || motivo === "orden borrada") return "ya no existe";
  if (motivo.startsWith("estado de origen no permitido")) return "ya no está en bodega satélite";
  if (motivo.startsWith("la orden cambió de estado")) return "cambió de estado mientras se retiraba";
  return "no admite el retiro";
}

/**
 * SLT-197 (T6.1, R981) — confirmación «Retirar a bodega central». Calco de `RutearSateliteModal`:
 * una sola llamada a `retirarABodegaCentral({ ordenIds })` con todo el lote, toast, fase
 * «resultado» con el manifiesto (`flujo="retiro_satelite"`) y `onSuccess` recién al cerrar. Un
 * resultado no-`ok` se lanza al canal de error del `Modal`, que deja el diálogo abierto; si es un
 * `conflict`, además se listan las órdenes rechazadas con su motivo.
 */
export function RetirarACentralModal({
  open,
  ordenes,
  onOpenChange,
  onSuccess,
}: RetirarACentralModalProps) {
  const toast = useToast();
  const [resultado, setResultado] = useState<{
    ordenIds: string[];
    mensaje: string;
  } | null>(null);
  const [conflictos, setConflictos] = useState<DetalleConflicto[]>([]);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setResultado(null);
      setConflictos([]);
    }
  }

  async function handleConfirm() {
    setConflictos([]);
    if (ordenes.length === 0) {
      const validationError: RetirarSateliteResult = {
        status: "validation_error",
        fieldErrors: {
          ordenIds: ["No hay órdenes en bodega satélite seleccionadas"],
        },
      };
      throw validationError;
    }

    const result = await retirarABodegaCentral({
      ordenIds: ordenes.map((orden) => orden.id),
    });
    if (result.status !== "ok") {
      if (result.status === "conflict") setConflictos(result.detalle);
      throw result;
    }

    const mensaje = `${result.resultados.length} orden(es) en ruta a bodega central.`;
    toast.success(mensaje);
    setResultado({
      ordenIds: result.resultados.map((r) => r.ordenId),
      mensaje,
    });
  }

  function handleError(error: unknown) {
    toast.error(guiaDecisionErrorMessage(error));
  }

  /** Cierre de la fase «resultado» por cualquier vía: recién ahí refresca el padre. */
  function handleOpenChange(next: boolean) {
    if (!next && resultado) {
      setResultado(null);
      onOpenChange(false);
      onSuccess();
      return;
    }
    onOpenChange(next);
  }

  const remisionDe = new Map(ordenes.map((o) => [o.id, o.numRemision]));

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Retirar a bodega central"
      description={
        resultado
          ? "Órdenes retiradas. Descarga el manifiesto del lote antes de cerrar."
          : `Se retirarán ${ordenes.length} orden(es) de su bodega satélite a la bodega central. Quedan en ruta, sin mensajero, hasta que se reciban con el escáner de la central.`
      }
      confirmLabel="Retirar a bodega central"
      cancelLabel={resultado ? "Cerrar" : "Cancelar"}
      hideConfirm={resultado !== null}
      closeOnConfirm={false}
      onConfirm={handleConfirm}
      onError={handleError}
    >
      {resultado ? (
        <ManifiestoResultado
          mensaje={resultado.mensaje}
          flujo="retiro_satelite"
          seleccion={{ ordenIds: resultado.ordenIds }}
        />
      ) : (
        <div className="space-y-3">
          <ul className="max-h-40 list-disc overflow-auto pl-5 text-sm text-muted-foreground">
            {ordenes.map((orden) => (
              <li key={orden.id}>
                {orden.numRemision}
                {orden.zonaNombre ? ` — ${orden.zonaNombre}` : ""}
              </li>
            ))}
          </ul>
          {conflictos.length > 0 ? (
            <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
              <p className="font-medium text-destructive">
                No se retiró ninguna orden. Estas ya no se pueden retirar:
              </p>
              <ul aria-label="Órdenes rechazadas" className="mt-1 list-disc pl-5">
                {conflictos.map((c) => (
                  <li key={c.ordenId}>
                    {remisionDe.get(c.ordenId) ?? c.ordenId}: {motivoDeRetiro(c.motivo)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
