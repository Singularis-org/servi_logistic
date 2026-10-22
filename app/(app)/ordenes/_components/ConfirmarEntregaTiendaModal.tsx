"use client";

import { useId, useState, type ChangeEvent } from "react";

import {
  EvidenciasField,
  MAX_EVIDENCIAS,
  mensajeEvidenciasRechazadas,
  prepararEvidencias,
} from "@/components/shared/EvidenciasField";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import { confirmarEntregaTienda } from "@/lib/actions/devolucion-tienda";
import {
  confirmarEntregaTiendaSchema,
  TOPE_ORDENES_POR_LOTE,
  type DesenlaceOrden,
} from "@/lib/types/devolucion-tienda";
import type { OrdenListItemDTO } from "@/lib/types/orden";

import { estatusLabel } from "./estatus-label";

// FICHA 419 (F2, R18/R19/R20) — la bodega CENTRAL confirma que la tienda recibió de vuelta un lote
// de órdenes `devolviendo_a_tienda`, con un comprobante (foto) OBLIGATORIO. Una sola llamada a la
// Server Action para todo el lote (el servidor lo hace set-based y devuelve un desenlace por orden):
// a diferencia de «Enviar a la tienda», aquí NO hay loop por orden en el navegador.
//
// La tienda del lote se DERIVA de las órdenes seleccionadas (precedente: el origen del traspaso,
// 427). Si la selección mezcla tiendas, el modal lo dice nombrándolas y no deja confirmar (R18): un
// comprobante prueba la entrega a UNA tienda, y recortar la selección por su cuenta movería órdenes
// que nadie miró.
//
// Tras confirmar, el modal NO se cierra: pinta el resumen (R20) y el padre revalida el listado
// detrás (`onSuccess` = `revalidarTablas`). Quien opera lo cierra cuando ha leído qué pasó.

export const CONFIRMAR_ENTREGA_TIENDA_ACCION = "Confirmar entrega a la tienda";

const EVIDENCIAS_LABEL = "Comprobante de entrega";
const EVIDENCIAS_AYUDA =
  "Foto del acta o del paquete recibido por la tienda. Es obligatorio: sin comprobante no se puede confirmar.";

/** Motivo en lenguaje claro de una orden que NO pasó (R20). */
function motivoNoDevuelta(d: DesenlaceOrden): string {
  switch (d.desenlace) {
    case "ya_devuelta":
      return "Ya estaba marcada como entregada a la tienda.";
    case "tienda_distinta":
      return "Pertenece a otra tienda, no a la de este comprobante.";
    case "no_encontrada":
      return "No existe o fue eliminada.";
    case "estado_invalido":
      return `Ya no está en devolución a la tienda: su estado actual es «${estatusLabel(d.estado)}».`;
    case "devuelta_a_tienda":
      return "";
  }
}

const ERROR_GENERICO =
  "No se pudo confirmar la entrega. Ninguna orden cambió de estado; inténtalo de nuevo y, si el problema sigue, avisa a soporte.";

export interface ConfirmarEntregaTiendaModalProps {
  open: boolean;
  /**
   * Órdenes `devolviendo_a_tienda` seleccionadas al abrir (snapshot). El padre NO recorta por
   * tienda: el modal deriva la tienda y bloquea si hay más de una (R18).
   */
  ordenes: OrdenListItemDTO[];
  onOpenChange: (open: boolean) => void;
  /** Se llama tras una respuesta del servidor que pudo cambiar órdenes: el padre revalida (R20). */
  onSuccess: () => void;
}

interface Resultado {
  devueltas: number;
  noDevueltas: DesenlaceOrden[];
}

function firstError(errs: Record<string, string[]>, key: string): string | undefined {
  return errs[key]?.[0];
}

export function ConfirmarEntregaTiendaModal({
  open,
  ordenes,
  onOpenChange,
  onSuccess,
}: Readonly<ConfirmarEntregaTiendaModalProps>) {
  const toast = useToast();
  const evidenciasId = useId();

  const [evidencias, setEvidencias] = useState<File[]>([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Cada apertura arranca limpia (patrón «ajustar estado durante el render» del repo).
  const [abiertoPrevio, setAbiertoPrevio] = useState(open);
  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open);
    if (open) {
      setEvidencias([]);
      setFieldErrors({});
      setErrorGeneral(null);
      setResultado(null);
    }
  }

  // R18: la tienda del lote se deriva de las órdenes.
  const tiendas = new Map<string, string>();
  for (const o of ordenes) {
    if (!tiendas.has(o.tiendaId)) tiendas.set(o.tiendaId, o.tiendaNombre);
  }
  const sinOrdenes = ordenes.length === 0;
  const variasTiendas = tiendas.size > 1;
  const sobreTope = ordenes.length > TOPE_ORDENES_POR_LOTE;
  const tiendaId = tiendas.size === 1 ? [...tiendas.keys()][0] : null;
  const tiendaNombre = tiendaId ? tiendas.get(tiendaId) ?? "" : "";
  const sinComprobante = evidencias.length === 0;

  const loteUtilizable = !sinOrdenes && !variasTiendas && !sobreTope;
  const puedeConfirmar = loteUtilizable && !sinComprobante && !comprimiendo;

  const numRemisionPorId = new Map(ordenes.map((o) => [o.id, o.numRemision]));

  async function handleEvidenciaChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const seleccion = Array.from(input.files ?? []);
    input.value = "";
    if (seleccion.length === 0) return;
    setComprimiendo(true);
    try {
      const { aceptadas, rechazadas } = await prepararEvidencias(seleccion);
      setEvidencias((prev) => {
        const combinadas = [...prev, ...aceptadas];
        setFieldErrors((errs) => {
          const rest = { ...errs };
          delete rest.evidencias;
          const avisos = [
            mensajeEvidenciasRechazadas(rechazadas),
            combinadas.length > MAX_EVIDENCIAS
              ? `Solo puedes adjuntar hasta ${MAX_EVIDENCIAS} fotos.`
              : null,
          ].filter((m): m is string => m !== null);
          return avisos.length > 0 ? { ...rest, evidencias: avisos } : rest;
        });
        return combinadas.slice(0, MAX_EVIDENCIAS);
      });
    } finally {
      setComprimiendo(false);
    }
  }

  function quitarEvidencia(index: number) {
    setEvidencias((prev) => prev.filter((_, i) => i !== index));
    setFieldErrors((errs) => {
      if (!errs.evidencias) return errs;
      const rest = { ...errs };
      delete rest.evidencias;
      return rest;
    });
  }

  function buildFormData(id: string): FormData {
    const fd = new FormData();
    fd.set("tiendaId", id);
    for (const o of ordenes) fd.append("ordenId", o.id);
    // Una entrada `evidencia` por archivo (`append`, no `set`): el borde lee `getAll`.
    for (const foto of evidencias) fd.append("evidencia", foto);
    return fd;
  }

  async function handleConfirm() {
    // Guarda redundante con `confirmDisabled`: el handler no depende del botón.
    if (!puedeConfirmar || tiendaId === null) return;
    setErrorGeneral(null);

    // Validación de borde con el MISMO schema del servidor (tipo/tamaño de cada foto, tope).
    const parsed = confirmarEntregaTiendaSchema.safeParse({
      tiendaId,
      ordenIds: ordenes.map((o) => o.id),
      evidencias,
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setFieldErrors({});

    const result = await confirmarEntregaTienda(buildFormData(tiendaId));
    switch (result.status) {
      case "ok":
      case "ninguna_devuelta": {
        const devueltas = result.status === "ok" ? result.devueltas : 0;
        setResultado({
          devueltas,
          noDevueltas: result.desenlaces.filter((d) => d.desenlace !== "devuelta_a_tienda"),
        });
        if (devueltas > 0) {
          toast.success(`${devueltas} orden(es) pasaron a «Devuelta a tienda».`);
        } else {
          toast.warning("Ninguna orden cambió de estado.");
        }
        onSuccess();
        return;
      }
      case "validation_error": {
        setFieldErrors(result.fieldErrors);
        const otros = Object.entries(result.fieldErrors)
          .filter(([k]) => k !== "evidencias")
          .flatMap(([, v]) => v);
        if (otros.length > 0) setErrorGeneral(`No se pudo confirmar: ${otros.join(" · ")}.`);
        return;
      }
      case "comprobante_no_guardado":
        setErrorGeneral(
          "No se pudo guardar el comprobante. Ninguna orden cambió de estado; inténtalo de nuevo.",
        );
        return;
      case "forbidden":
        setErrorGeneral("No tienes permiso para confirmar entregas a la tienda.");
        return;
      case "unauthenticated":
        setErrorGeneral("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
    }
  }

  // Si la promesa de la action se rechaza (fallo de escritura propagado, red caída), el error se
  // dice DENTRO del modal y por toast: nunca mudo.
  function handleError() {
    setErrorGeneral(ERROR_GENERICO);
    toast.error(ERROR_GENERICO);
  }

  const evidenciasError = firstError(fieldErrors, "evidencias");

  const descripcion = resultado
    ? "Resultado de la confirmación."
    : loteUtilizable
      ? `${ordenes.length} orden(es) de ${tiendaNombre}. Adjunta el comprobante de que la tienda las recibió.`
      : `${ordenes.length} orden(es) seleccionada(s).`;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={CONFIRMAR_ENTREGA_TIENDA_ACCION}
      description={descripcion}
      confirmLabel={CONFIRMAR_ENTREGA_TIENDA_ACCION}
      cancelLabel={resultado ? "Cerrar" : "Cancelar"}
      confirmDisabled={!puedeConfirmar}
      hideConfirm={resultado !== null}
      closeOnConfirm={false}
      onConfirm={handleConfirm}
      onError={handleError}
    >
      {resultado ? (
        <ResumenConfirmacion
          resultado={resultado}
          numRemisionPorId={numRemisionPorId}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {sinOrdenes ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Selecciona al menos una orden.
            </p>
          ) : null}
          {variasTiendas ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <p>
                Las órdenes seleccionadas son de varias tiendas. Un comprobante prueba la entrega a
                una sola tienda: deja en la selección solo las órdenes de una tienda.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {[...tiendas.values()].map((nombre, i) => (
                  <li key={`${nombre}-${i}`}>{nombre}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {sobreTope ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {`Seleccionaste ${ordenes.length} órdenes y el máximo por confirmación es ${TOPE_ORDENES_POR_LOTE}. Divide la selección en varias confirmaciones.`}
            </p>
          ) : null}

          {loteUtilizable ? (
            <ul
              aria-label="Órdenes a confirmar"
              className="max-h-40 list-disc overflow-auto pl-5 text-sm text-muted-foreground"
            >
              {ordenes.map((o) => (
                <li key={o.id}>
                  {o.numRemision}
                  {o.numGuia != null ? ` — Guía ${o.numGuia}` : ""}
                </li>
              ))}
            </ul>
          ) : null}

          <EvidenciasField
            inputId={evidenciasId}
            label={EVIDENCIAS_LABEL}
            ariaLabel={EVIDENCIAS_LABEL}
            ayuda={EVIDENCIAS_AYUDA}
            files={evidencias}
            error={evidenciasError}
            onSelect={handleEvidenciaChange}
            onRemove={quitarEvidencia}
          />
          {sinComprobante && !evidenciasError ? (
            <p className="text-sm text-muted-foreground">
              Adjunta al menos una foto del comprobante para poder confirmar.
            </p>
          ) : null}

          {errorGeneral ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorGeneral}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function ResumenConfirmacion({
  resultado,
  numRemisionPorId,
}: Readonly<{ resultado: Resultado; numRemisionPorId: Map<string, string> }>) {
  const { devueltas, noDevueltas } = resultado;
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <p className="text-sm font-medium">
        {devueltas === 0
          ? "Ninguna orden pasó a «Devuelta a tienda». No se guardó el comprobante."
          : devueltas === 1
            ? "1 orden pasó a «Devuelta a tienda»."
            : `${devueltas} órdenes pasaron a «Devuelta a tienda».`}
      </p>
      {noDevueltas.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            {noDevueltas.length === 1
              ? "1 orden no cambió de estado:"
              : `${noDevueltas.length} órdenes no cambiaron de estado:`}
          </p>
          <ul
            aria-label="Órdenes que no cambiaron de estado"
            className="max-h-48 list-disc overflow-auto pl-5 text-sm text-muted-foreground"
          >
            {noDevueltas.map((d) => {
              const referencia =
                d.numGuia != null
                  ? `Guía ${d.numGuia}`
                  : `Remisión ${numRemisionPorId.get(d.ordenId) ?? "desconocida"}`;
              return (
                <li key={d.ordenId}>
                  {`${referencia}: ${motivoNoDevuelta(d)}`}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
