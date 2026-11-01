"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import {
  corregirConsolidacionRecibidaAction,
  marcarConsolidacionRecibidaAction,
  revertirConciliacionAction,
} from "@/lib/actions/conciliacion-satelites";
import type {
  MarcaConciliacionActionResult,
  RevertirConciliacionActionResult,
} from "@/lib/actions/conciliacion-satelites";
import { money } from "@/lib/config/moneda";
import {
  estadoConciliacionDe,
  type EstadoConciliacion,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";

import {
  CONCILIACION_ACCION,
  CONCILIACION_RESPUESTA,
  CONCILIACION_ASIENTA_NOTA,
  CONCILIACION_ASIENTA_TITULO,
} from "./conciliacion-labels";
import { MarcarRecibidoDialog, type MarcarRecibidoCampos } from "./MarcarRecibidoDialog";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 (R25) — LAS DOS ACCIONES DE UNA CONSOLIDACIÓN: marcar recibido y deshacer la marca.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// COMPARTIDO por las dos pantallas que concilian: el desglose de `/wallet/satelites` (donde la
// central persigue el efectivo bodega por bodega) y la cola de `/cierres-admin` (donde el mismo
// botón sustituye al «Aprobar» que esta ficha retira). Mismo componente y no dos: son la misma
// acción sobre la misma fila, y dos copias acabarían diciendo cosas distintas sobre si el dinero
// llegó — que es exactamente el defecto que esta ficha vino a cerrar.
//
// ── UN BOTÓN, Y SÓLO EL QUE APLICA
//   sin conciliar        → «Marcar recibido» (primario: es lo que hay que hacer)
//   recibido incompleto  → «Corregir»        (no se re-marca: se cambia el monto que se dijo)
//   recibido             → «Desmarcar»       (discreto: es una corrección, no una operación)
//
// Los tres estados salen de `estadoConciliacionDe`, la MISMA función que pinta el badge, así que
// el rótulo del botón y el del estado no pueden contradecirse.
//
// ── POR QUÉ «DESMARCAR» PIDE CONFIRMACIÓN Y «MARCAR» NO
// (Con SLT-73 marcar SÍ asienta el dinero, y una marca con asientos ya no se desmarca: R14.)
// No sólo por peligro sino por ASIMETRÍA DE INFORMACIÓN:
// marcar abre un diálogo donde se ve el declarado y se teclea el monto, así que ya hay un paso
// donde mirar. Desmarcar es un clic que, sin nada delante, borra el rastro de quién dijo que el
// dinero llegó y de cuánto. La confirmación lleva escrito el importe que se va a borrar y la nota
// de la conciliación (SLT-73, R35: marcar asienta el dinero; con asientos no se desmarca, se usa
// «Corregir»): las dos mitades de lo que hay que saber antes de pulsar.
//
// ── QUIÉN DECIDE EL PERMISO: EL SERVIDOR
// `puedeConciliar` baja por props desde un Server Component que lo resolvió con `esAccesoTotal`,
// el MISMO predicado con el que `ConciliacionSatelitesService` responde `forbidden` (R27). Son
// las dos mitades del control: ocultar el botón no es una de ellas por sí solo. **Default
// `false`: falla cerrado** — quien monte esto sin decidir el permiso no ofrece conciliar nada.

export interface ConciliacionAccionesProps {
  cierreBodegaId: string;
  /** Nombre de la bodega, para el diálogo y para los nombres accesibles. */
  bodega: string;
  /** Día de la consolidación YA formateado por quien lo monta. */
  fecha: string;
  /**
   * Lo ESPERADO de la consolidación, STRING del servidor: `paraLaCentral` desde SLT-73 (D3/R8), ya
   * no el `total_efectivo`. Precarga el monto del diálogo, así que una marca «de un clic» no deja
   * una diferencia que nadie quiso registrar.
   */
  declarado: string;
  /**
   * La marca de hoy, tal como llega del servidor. Aquí no se deriva nada de dinero.
   * SLT-76 (R3/R4): `desmarcable` lo decide el servidor con el mismo predicado con el que
   * `revertirConciliacion` responde `con_asientos`. OBLIGATORIO y sin default: quien monte esto
   * sin el dato no compila. Con `false` no se ofrece «Desmarcar».
   */
  marca: {
    conciliado: boolean;
    faltaPorRecibir: string;
    montoRecibido: string | null;
    desmarcable: boolean;
  };
  /** Nota ya guardada, si la hay: el diálogo de corregir parte de ella. */
  nota?: string | null;
  /** Ver la cabecera. Default `false`: falla cerrado. */
  puedeConciliar?: boolean;
  /**
   * Refresco DIRIGIDO tras marcar o desmarcar. Lo aporta quien monta porque es quien sabe qué
   * claves de SWR describen SU pantalla: la de saldos invalida su tabla y su desglose; la cola de
   * `/cierres-admin` invalida sus dos listados. Un `mutate()` sin argumentos refrescaría también
   * los desgloses de las demás bodegas abiertas, que es una consulta por fila sin motivo.
   */
  onCambio?: () => void | Promise<void>;
}

/** El tamaño de los botones de una fila de tabla: `sm`, como el resto de acciones de fila. */
const TAMANO = "sm" as const;

export function ConciliacionAcciones({
  cierreBodegaId,
  bodega,
  fecha,
  declarado,
  marca,
  nota = null,
  puedeConciliar = false,
  onCambio,
}: Readonly<ConciliacionAccionesProps>) {
  const toast = useToast();
  const [marcando, setMarcando] = useState(false);
  const [desmarcando, setDesmarcando] = useState(false);
  // SLT-73 (R14): el aviso de «ya entró a la caja». Vive DENTRO del diálogo y no en un toast: no
  // cambió nada, y quien lo lee tiene que saber que la salida es corregir el monto.
  const [conAsientos, setConAsientos] = useState<string | null>(null);

  if (!puedeConciliar) return null;

  const estado: EstadoConciliacion = estadoConciliacionDe(marca);

  // 473 (R14) — UN ENVÍO POR MODO. «Corregir» sólo existe sobre una «Recibido incompleto», que
  // YA está conciliada: mandarla a la action de marcar —cuyo `WHERE` exige una SIN marcar— era
  // un `conflict` garantizado sin escribir nada. Corregir sustituye el monto y la deja conciliada.
  const esCorreccion = estado === "incompleto";

  async function enviar(campos: MarcarRecibidoCampos): Promise<MarcaConciliacionActionResult> {
    const input = { ...campos, cierreBodegaId };
    return esCorreccion
      ? corregirConsolidacionRecibidaAction(input)
      : marcarConsolidacionRecibidaAction(input);
  }

  /** R16 — el aviso dice el monto que QUEDÓ registrado, con el verbo de lo que se hizo. */
  async function trasEnviar(montoRecibido: string) {
    toast.success(
      esCorreccion
        ? CONCILIACION_RESPUESTA.corregida(montoRecibido)
        : CONCILIACION_RESPUESTA.marcada(montoRecibido),
    );
    await onCambio?.();
  }

  /** R17 — el diálogo ya se cerró; el aviso promete «Actualizando la lista», y se cumple. */
  async function trasConflicto() {
    toast.error(CONCILIACION_RESPUESTA.conflicto);
    await onCambio?.();
  }

  /** R12 — deshacer. No lleva monto: el que había se BORRA (y sobrevive en el historial). */
  async function confirmarDesmarcar() {
    let resultado: RevertirConciliacionActionResult;
    try {
      resultado = await revertirConciliacionAction({ cierreBodegaId });
    } catch {
      toast.error(CONCILIACION_RESPUESTA.fallo);
      return;
    }
    if (resultado.status === "con_asientos") {
      // R14: rechazada sin tocar nada, así que tampoco hay nada que refrescar.
      setConAsientos(resultado.mensaje);
      return;
    }
    if (resultado.status === "ok") {
      toast.success(CONCILIACION_RESPUESTA.revertida);
    } else if (resultado.status === "conflict") {
      toast.error(CONCILIACION_RESPUESTA.conflicto);
    } else if (resultado.status === "no_encontrada") {
      toast.error(CONCILIACION_RESPUESTA.noEncontrada);
    } else if (resultado.status === "forbidden") {
      toast.error(CONCILIACION_RESPUESTA.forbidden);
    } else if (resultado.status === "unauthenticated") {
      toast.error(CONCILIACION_RESPUESTA.unauthenticated);
    } else {
      toast.error(CONCILIACION_RESPUESTA.fallo);
    }
    setDesmarcando(false);
    await onCambio?.();
  }

  // El nombre accesible lleva SIEMPRE la bodega y el día: una pantalla puede tener veinte filas
  // abiertas, y veinte botones llamados «Marcar recibido» no identifican ninguna para quien
  // navega con lector de pantalla.
  const sufijo = `de ${bodega} del ${fecha}`;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {estado === "pendiente" ? (
        <Button
          type="button"
          size={TAMANO}
          aria-label={`${CONCILIACION_ACCION.marcar} la consolidación ${sufijo}`}
          onClick={() => setMarcando(true)}
        >
          {CONCILIACION_ACCION.marcar}
        </Button>
      ) : null}

      {estado === "incompleto" ? (
        <Button
          type="button"
          size={TAMANO}
          variant="outline"
          aria-label={`${CONCILIACION_ACCION.corregir} el monto recibido ${sufijo}`}
          onClick={() => setMarcando(true)}
        >
          {CONCILIACION_ACCION.corregir}
        </Button>
      ) : null}

      {/* SLT-76 (R3): sólo si el servidor dice que la reversión no chocaría con dinero asentado.
          El aviso `con_asientos` del diálogo queda para la carrera entre pintar y pulsar. */}
      {estado !== "pendiente" && marca.desmarcable ? (
        <Button
          type="button"
          size={TAMANO}
          variant="ghost"
          aria-label={`${CONCILIACION_ACCION.desmarcar} la consolidación ${sufijo}`}
          onClick={() => setDesmarcando(true)}
        >
          {CONCILIACION_ACCION.desmarcar}
        </Button>
      ) : null}

      <MarcarRecibidoDialog
        open={marcando}
        onOpenChange={setMarcando}
        bodega={bodega}
        fecha={fecha}
        declarado={declarado}
        montoActual={estado === "pendiente" ? null : marca.montoRecibido}
        notaActual={nota}
        onMarcar={enviar}
        onMarcado={trasEnviar}
        onConflicto={trasConflicto}
      />

      <Modal
        open={desmarcando}
        onOpenChange={(abierto) => {
          setDesmarcando(abierto);
          if (!abierto) setConAsientos(null);
        }}
        title={CONCILIACION_ACCION.desmarcar}
        description={`Consolidación de ${bodega} del ${fecha}.`}
        confirmLabel={CONCILIACION_ACCION.desmarcar}
        cancelLabel={CONCILIACION_ACCION.cancelar}
        onConfirm={confirmarDesmarcar}
        closeOnConfirm={false}
        confirmDisabled={conAsientos !== null}
        size="md"
      >
        <div className="flex flex-col gap-3 text-sm">
          {conAsientos === null ? null : (
            <p
              role="alert"
              className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-warning-strong"
            >
              <strong className="font-semibold">{CONCILIACION_RESPUESTA.conAsientosTitulo}</strong>{" "}
              {conAsientos}
            </p>
          )}
          {/* El importe que se va a borrar, dicho antes de borrarlo. Es el dato que falta para
              decidir, y tras la reversión sólo sobrevive en el registro de acciones. */}
          {marca.montoRecibido === null ? null : (
            <p className="text-muted-foreground">
              Ahora mismo consta recibida por{" "}
              <strong className="font-semibold tabular-nums text-foreground">
                {money(marca.montoRecibido)}
              </strong>
              .
            </p>
          )}
          <p className="text-muted-foreground">
            <strong className="font-semibold text-foreground">
              {CONCILIACION_ASIENTA_TITULO}
            </strong>{" "}
            {CONCILIACION_ASIENTA_NOTA}
          </p>
        </div>
      </Modal>
    </div>
  );
}
