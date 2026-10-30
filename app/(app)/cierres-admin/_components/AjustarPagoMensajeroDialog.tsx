"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import { money } from "@/lib/config/moneda";
import { ajustarPagoMensajeroGestion } from "@/lib/actions/cierres-admin";
import type {
  AjustePagoGestionDTO,
  CierreDetalleGestion,
} from "@/lib/interfaces/services/ICierreDiaService";

import { AJUSTE_PAGO_TEXTO as T } from "./cierre-labels";

/**
 * SLT-56 (design §5; R11, R21) — AJUSTE del pago al mensajero de UNA gestión desde el detalle de
 * un cierre ABIERTO.
 *
 * Hermano de `CorregirResultadoDialog`: mismo `Modal`, mismos desenlaces y misma forma de no
 * cerrarse al confirmar (o enseña el error, o enseña lo que quedó).
 *
 * **Money-safe (R16).** El valor nuevo viaja como el STRING que se tecleó: aquí no se convierte a
 * número, no se compara y no se suma. La validación de verdad (formato, tope, igual al vigente)
 * es del servidor; este diálogo solo evita el viaje con el campo o el motivo vacíos.
 *
 * **`pagoAnterior` es el vigente que se PINTÓ (R9).** Si otro ajuste o una corrección cambió el
 * pago entre que se abrió el detalle y se guardó, el servidor responde `conflict` y no escribe.
 *
 * **Al terminar** se avisa al padre con los valores DEL SERVIDOR (pago nuevo, total del cierre y
 * el ajuste registrado), para que actualice la pantalla sin recargar (R11).
 */

const PAGO_ID = "ajuste-pago-nuevo";
const MOTIVO_ID = "ajuste-pago-motivo";

/** Lo que devuelve un ajuste aplicado: cifras del servidor, STRING escala 2. */
export interface AjustePagoAplicado {
  gestionId: string;
  pagoMensajero: string;
  totalPagoMensajero: string;
  ajuste: AjustePagoGestionDTO;
}

export interface AjustarPagoMensajeroDialogProps {
  /** La gestión a ajustar; `null` cierra el diálogo. Siempre con `pagoMensajero` no nulo. */
  gestion: CierreDetalleGestion | null;
  onOpenChange: (open: boolean) => void;
  /** Se invoca tras un ajuste efectivo, con los valores que devolvió el servidor. */
  onAjustado: (r: AjustePagoAplicado) => void | Promise<void>;
}

interface Errores {
  pagoNuevo?: string;
  motivo?: string;
  general?: string;
}

export function AjustarPagoMensajeroDialog({
  gestion,
  onOpenChange,
  onAjustado,
}: Readonly<AjustarPagoMensajeroDialogProps>) {
  const toast = useToast();
  const [pagoNuevo, setPagoNuevo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<AjustePagoAplicado | null>(null);

  // Al abrir con OTRA gestión el diálogo arranca limpio (mismo patrón que sus hermanos: se
  // ajusta durante el render, no en un efecto).
  const gestionId = gestion?.gestionId ?? null;
  const [ultima, setUltima] = useState<string | null>(gestionId);
  if (gestionId !== ultima) {
    setUltima(gestionId);
    setPagoNuevo("");
    setMotivo("");
    setErrores({});
    setHecho(null);
  }

  const pagoVacio = pagoNuevo.trim() === "";
  const motivoVacio = motivo.trim() === "";

  async function confirmar() {
    if (!gestion || gestion.pagoMensajero === null || enviando || pagoVacio || motivoVacio) {
      return;
    }
    setEnviando(true);
    setErrores({});
    try {
      const r = await ajustarPagoMensajeroGestion({
        gestionId: gestion.gestionId,
        // El vigente que se pintó arriba, tal cual llegó (R9).
        pagoAnterior: gestion.pagoMensajero,
        // Tal como se tecleó, sin espacios alrededor: ni número ni redondeo (R16).
        pagoNuevo: pagoNuevo.trim(),
        motivo,
      });
      if (r.status === "ok") {
        const aplicado: AjustePagoAplicado = {
          gestionId: r.gestionId,
          pagoMensajero: r.pagoMensajero,
          totalPagoMensajero: r.totalPagoMensajero,
          ajuste: r.ajuste,
        };
        setHecho(aplicado);
        toast.success(T.ok);
        await onAjustado(aplicado);
        return;
      }
      if (r.status === "validation_error") {
        const fe = r.fieldErrors as Record<string, string[] | undefined>;
        const pago = fe.pagoNuevo?.[0];
        const mot = fe.motivo?.[0];
        setErrores({
          pagoNuevo: pago,
          motivo: mot,
          general: pago || mot ? undefined : T.errorGenerico,
        });
        return;
      }
      setErrores({
        general:
          r.status === "conflict"
            ? T.conflicto
            : r.status === "no_encontrada"
              ? T.noEncontrada
              : r.status === "forbidden"
                ? T.sinPermiso
                : r.status === "unauthenticated"
                  ? T.sinSesion
                  : T.errorGenerico,
      });
    } catch {
      setErrores({ general: T.errorGenerico });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={gestion !== null}
      onOpenChange={onOpenChange}
      title={T.titulo}
      description={
        gestion ? `Orden ${gestion.numRemision} · ${gestion.destinatario}. ${T.aviso}` : T.aviso
      }
      confirmLabel={hecho ? T.cerrar : T.confirmar}
      hideCancel={hecho !== null}
      confirmDisabled={enviando || (hecho === null && (pagoVacio || motivoVacio))}
      closeOnConfirm={false}
      onConfirm={hecho ? () => onOpenChange(false) : confirmar}
    >
      {gestion === null ? null : hecho ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{T.hechoNota}</p>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{T.hechoPagoGestion}</dt>
              <dd className="font-semibold tabular-nums">{money(hecho.pagoMensajero)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{T.hechoTotalCierre}</dt>
              <dd className="font-semibold tabular-nums">
                {money(hecho.totalPagoMensajero)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{T.pagoVigente}</span>
            <span className="font-semibold tabular-nums">{money(gestion.pagoMensajero)}</span>
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor={PAGO_ID} className="text-sm font-medium">
              {T.pagoNuevo}
            </label>
            <Input
              id={PAGO_ID}
              value={pagoNuevo}
              inputMode="decimal"
              autoComplete="off"
              onChange={(e) => {
                setPagoNuevo(e.target.value);
                if (errores.pagoNuevo || errores.general) {
                  setErrores((prev) => ({ ...prev, pagoNuevo: undefined, general: undefined }));
                }
              }}
              aria-required="true"
              aria-invalid={errores.pagoNuevo !== undefined}
              aria-describedby={errores.pagoNuevo ? `${PAGO_ID}-error` : `${PAGO_ID}-ayuda`}
              className="h-10"
            />
            <p id={`${PAGO_ID}-ayuda`} className="text-xs text-muted-foreground">
              {T.pagoNuevoAyuda}
            </p>
            {errores.pagoNuevo ? (
              <p id={`${PAGO_ID}-error`} role="alert" className="text-sm text-destructive">
                {errores.pagoNuevo}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={MOTIVO_ID} className="text-sm font-medium">
              {T.motivo}
            </label>
            <Textarea
              id={MOTIVO_ID}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (errores.motivo || errores.general) {
                  setErrores((prev) => ({ ...prev, motivo: undefined, general: undefined }));
                }
              }}
              rows={3}
              aria-required="true"
              aria-invalid={errores.motivo !== undefined}
              aria-describedby={errores.motivo ? `${MOTIVO_ID}-error` : `${MOTIVO_ID}-ayuda`}
            />
            <p id={`${MOTIVO_ID}-ayuda`} className="text-xs text-muted-foreground">
              {T.motivoAyuda}
            </p>
            {errores.motivo ? (
              <p id={`${MOTIVO_ID}-error`} role="alert" className="text-sm text-destructive">
                {errores.motivo}
              </p>
            ) : null}
          </div>

          {errores.general ? (
            <p role="alert" className="text-sm text-destructive">
              {errores.general}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
