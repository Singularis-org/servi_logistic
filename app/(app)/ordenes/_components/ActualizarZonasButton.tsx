"use client";

import { useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { actualizarZonas, vistaPreviaActualizacionZonas } from "@/lib/actions/actualizacion-zonas";
import type {
  MotivoSaltada,
  OrdenSaltadaDTO,
  ResultadoActualizacionZonasDTO,
  VistaPreviaZonasDTO,
} from "@/lib/types/actualizacion-zonas";

import { guiaDecisionErrorMessage } from "./guia-decision-error-messages";

/**
 * SLT-224 (design §3b.5, R1726): el texto de cada motivo por el que una orden con la zona errada NO
 * se actualiza. Exhaustivo: un motivo nuevo en `MotivoSaltada` sin su texto rompe el typecheck.
 * SLT-248 (R1804) quito «esperando liberación en bodega»: las reprogramadas ya se actualizan.
 */
export const TEXTO_MOTIVO_SALTADA: Record<MotivoSaltada, string> = {
  estante_satelite: "en el estante de una satélite",
  finalizada: "finalizada",
  devolucion: "en devolución",
  cobro_en_curso: "cobro en curso (gestión o cierre sin aprobar)",
};

const TEXTOS = {
  boton: "Actualizar zonas",
  titulo: "Actualizar zonas",
  cargando: "Buscando órdenes con la zona errada…",
  alDia: "Todas las zonas están al día.",
  sinCandidatas: "No hay órdenes con la zona errada que se puedan actualizar.",
  descripcionVista:
    "Estas órdenes tienen una zona que no es la de su distrito. Al confirmar toman la zona de su distrito.",
  confirmar: "Confirmar",
  cancelar: "Cancelar",
  cerrar: "Cerrar",
  grupos: "Órdenes que se actualizan",
  saltadas: "Órdenes que se saltan",
} as const;

function ordenes(n: number): string {
  return n === 1 ? "1 orden" : `${n} órdenes`;
}

type Fase =
  | { tipo: "cargando" }
  | { tipo: "vista"; vista: VistaPreviaZonasDTO }
  | { tipo: "resultado"; resultado: ResultadoActualizacionZonasDTO }
  | { tipo: "error"; mensaje: string };

function ListaSaltadas({ saltadas }: Readonly<{ saltadas: OrdenSaltadaDTO[] }>) {
  if (saltadas.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Se saltan {saltadas.length}</p>
      <ul
        aria-label={TEXTOS.saltadas}
        className="max-h-48 list-disc overflow-auto pl-5 text-sm text-muted-foreground"
      >
        {saltadas.map((s, i) => (
          <li key={`${s.guia}-${i}`}>
            {s.guia}: {TEXTO_MOTIVO_SALTADA[s.motivo]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ActualizarZonasButtonProps {
  /** R1713: solo maestro y admin (`esAccesoTotal`). Con `false` no se pinta nada. */
  puedeActualizarZonas: boolean;
  /** Al cerrar el modal tras confirmar: el padre refresca el listado (R1718). */
  onSuccess: () => void;
}

/**
 * SLT-224 (design §3b.4/§3b.5, R1713, R1715, R1716, R1718, R1726) — el botón «Actualizar zonas» de la
 * cabecera de `/ordenes`. No depende de la selección: al pulsarlo abre el `Modal` compartido en
 * «cargando», pide la vista previa (que no escribe nada) y pinta los grupos zona actual → nueva, el
 * total y las saltadas con su motivo. «Confirmar» llama a `actualizarZonas()` y enseña el resultado
 * en el mismo modal; `onSuccess` corre recién al cerrarlo. Las Server Actions revalidan el rol:
 * ocultar el botón no es la defensa (R1714).
 */
export function ActualizarZonasButton({
  puedeActualizarZonas,
  onSuccess,
}: Readonly<ActualizarZonasButtonProps>) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [fase, setFase] = useState<Fase>({ tipo: "cargando" });
  // Descarta la respuesta de una vista previa vieja si el modal se cerró y se volvió a abrir.
  const pedido = useRef(0);

  if (!puedeActualizarZonas) return null;

  async function abrir() {
    const id = ++pedido.current;
    setFase({ tipo: "cargando" });
    setOpen(true);
    try {
      const r = await vistaPreviaActualizacionZonas();
      if (id !== pedido.current) return;
      setFase(
        r.status === "ok"
          ? { tipo: "vista", vista: r.vistaPrevia }
          : { tipo: "error", mensaje: guiaDecisionErrorMessage(r) },
      );
    } catch (error) {
      if (id !== pedido.current) return;
      setFase({ tipo: "error", mensaje: guiaDecisionErrorMessage(error) });
    }
  }

  async function handleConfirm() {
    const r = await actualizarZonas();
    if (r.status !== "ok") throw r;
    const mensaje = `Se actualizaron ${ordenes(r.resultado.actualizadas)}.`;
    toast.success(mensaje);
    setFase({ tipo: "resultado", resultado: r.resultado });
  }

  function handleError(error: unknown) {
    toast.error(guiaDecisionErrorMessage(error));
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      return;
    }
    pedido.current++;
    const habiaResultado = fase.tipo === "resultado";
    setOpen(false);
    if (habiaResultado) onSuccess();
  }

  const conCandidatas = fase.tipo === "vista" && fase.vista.total > 0;

  return (
    <>
      <Button type="button" variant="outline" onClick={abrir}>
        <RefreshCw aria-hidden="true" />
        {TEXTOS.boton}
      </Button>
      <Modal
        open={open}
        onOpenChange={handleOpenChange}
        title={TEXTOS.titulo}
        description={conCandidatas ? TEXTOS.descripcionVista : undefined}
        confirmLabel={TEXTOS.confirmar}
        cancelLabel={conCandidatas ? TEXTOS.cancelar : TEXTOS.cerrar}
        hideConfirm={!conCandidatas}
        closeOnConfirm={false}
        onConfirm={handleConfirm}
        onError={handleError}
        size="lg"
      >
        <CuerpoFase fase={fase} />
      </Modal>
    </>
  );
}

function CuerpoFase({ fase }: Readonly<{ fase: Fase }>) {
  switch (fase.tipo) {
    case "cargando":
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {TEXTOS.cargando}
        </p>
      );
    case "error":
      return (
        <p role="alert" className="text-sm text-destructive">
          {fase.mensaje}
        </p>
      );
    case "resultado":
      return (
        <div className="space-y-3">
          <p role="status" className="text-sm font-medium">
            Se actualizaron {ordenes(fase.resultado.actualizadas)}.
          </p>
          <ListaSaltadas saltadas={fase.resultado.saltadas} />
        </div>
      );
    case "vista": {
      const { grupos, total, saltadas } = fase.vista;
      if (total === 0) {
        return (
          <div className="space-y-3">
            <p role="status" className="text-sm">
              {saltadas.length === 0 ? TEXTOS.alDia : TEXTOS.sinCandidatas}
            </p>
            <ListaSaltadas saltadas={saltadas} />
          </div>
        );
      }
      return (
        <div className="space-y-3">
          <ul aria-label={TEXTOS.grupos} className="list-disc space-y-1 pl-5 text-sm">
            {grupos.map((g) => (
              <li key={`${g.zonaActual}->${g.zonaNueva}`}>
                {ordenes(g.cantidad)}: {g.zonaActual} → {g.zonaNueva}
              </li>
            ))}
          </ul>
          <p className="text-sm font-medium">Total: {ordenes(total)}</p>
          <ListaSaltadas saltadas={saltadas} />
        </div>
      );
    }
  }
}
