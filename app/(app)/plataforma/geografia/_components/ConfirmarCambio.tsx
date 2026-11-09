"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// SLT-46 (design §4.7 y §6; R58, R59, R61): toda escritura de la pantalla de geografía pasa por aquí
// con el antes → después ya validado. El modal no se cierra solo al confirmar (`closeOnConfirm`
// false): el desenlace de la action decide. Ante el cambio concurrente (§4.7; decisión humana D2 de
// la review, 2026-11-09) el modal se CIERRA sin escribir nada, el aviso queda en la pantalla, fuera
// del diálogo, y la página se refresca para traer el valor actual. El aviso vive aquí (no en cada
// módulo) para que los cinco usos lo pinten igual; se olvida al volver a abrir el modal.

/** Lo mínimo que comparten los resultados de las actions de `geografia-plataforma.ts`. */
export type ResultadoDeCambio = { status: string; motivo?: string };

/** Desenlace con el que se avisa al padre cuando `accion` lanza en vez de responder. */
export type ErrorGenericoDeCambio = { status: "error" };

export interface FilaDeCambio {
  /** Qué dato cambia (p. ej. «Nombre»). Se pinta como encabezado de fila. */
  etiqueta: string;
  /** Valor actual; `null` en las altas (se pinta «—» con texto para lector de pantalla). */
  antes: ReactNode | null;
  /** Valor tras confirmar. */
  despues: ReactNode;
}

export interface ConfirmarCambioProps<R extends ResultadoDeCambio> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: ReactNode;
  /** Texto de apoyo bajo el título (aria-describedby del diálogo). */
  descripcion?: ReactNode;
  filas: readonly FilaDeCambio[];
  /** Botón confirmar, «Sí, <verbo>…». */
  confirmLabel: string;
  /** Rojo para el retiro. */
  destructivo?: boolean;
  /** Contenido extra bajo la tabla (p. ej. el conteo de órdenes del retiro). */
  children?: ReactNode;
  /** Ejecuta la escritura. Se llama una sola vez por confirmación. */
  accion: () => Promise<R>;
  /** `ok`: el modal ya se cerró y la página se está refrescando. */
  onExito?: (resultado: R) => void;
  /** Cualquier otro desenlace salvo el cambio concurrente; el padre pinta el error en el campo. */
  onRechazo?: (resultado: R | ErrorGenericoDeCambio) => void;

  // Textos con valor por defecto, sobreescribibles para i18n.
  cancelLabel?: string;
  encabezadoDato?: string;
  encabezadoAntes?: string;
  encabezadoDespues?: string;
  /** Lo que oye el lector de pantalla en lugar de «—». */
  textoSinValor?: string;
  /** Aviso en pantalla (fuera del modal) cuando el dato cambió mientras tanto. */
  avisoConcurrente?: ReactNode;
}

const AVISO_CONCURRENTE = "Este dato cambió mientras tanto; revisa el valor actual.";

function esCambioConcurrente(resultado: ResultadoDeCambio): boolean {
  return resultado.status === "conflict" && resultado.motivo === "cambio_concurrente";
}

export function ConfirmarCambio<R extends ResultadoDeCambio>({
  open,
  onOpenChange,
  titulo,
  descripcion,
  filas,
  confirmLabel,
  destructivo = false,
  children,
  accion,
  onExito,
  onRechazo,
  // D3 (maqueta v7): el secundario de una confirmación es «Volver» (vuelve al formulario).
  cancelLabel = "Volver",
  encabezadoDato = "Dato",
  encabezadoAntes = "Antes",
  encabezadoDespues = "Después",
  textoSinValor = "Sin valor",
  avisoConcurrente = AVISO_CONCURRENTE,
}: Readonly<ConfirmarCambioProps<R>>) {
  const router = useRouter();
  const [concurrente, setConcurrente] = useState(false);
  // El aviso sobrevive al cierre del modal (se ve en la pantalla) y se olvida al volver a abrirlo,
  // sin efecto (patrón de ajustar estado cuando cambia una prop).
  const [openPrevio, setOpenPrevio] = useState(open);
  if (open !== openPrevio) {
    setOpenPrevio(open);
    if (open) setConcurrente(false);
  }

  async function confirmar() {
    let resultado: R | ErrorGenericoDeCambio;
    try {
      resultado = await accion();
    } catch {
      // Una action que lanza (red caída, error no capturado) se trata como `error`: el padre
      // muestra su mensaje genérico y la pantalla no se rompe.
      resultado = { status: "error" };
    }

    if (resultado.status === "ok") {
      onOpenChange(false);
      onExito?.(resultado as R);
      router.refresh();
      return;
    }
    if (esCambioConcurrente(resultado)) {
      setConcurrente(true);
      onOpenChange(false);
      router.refresh();
      return;
    }
    onOpenChange(false);
    onRechazo?.(resultado);
  }

  return (
    <>
      {concurrente ? (
        <Alert>
          <AlertDescription>{avisoConcurrente}</AlertDescription>
        </Alert>
      ) : null}
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={titulo}
        description={descripcion}
        confirmLabel={confirmLabel}
        confirmVariant={destructivo ? "destructive" : "default"}
        cancelLabel={cancelLabel}
        closeOnConfirm={false}
        onConfirm={confirmar}
        size="lg"
        // Objetivo táctil de 44px para los botones del pie, que el Modal pinta con la altura por defecto.
        className="[&_[data-slot=button]]:min-h-11"
      >
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{encabezadoDato}</TableHead>
                <TableHead scope="col">{encabezadoAntes}</TableHead>
                <TableHead scope="col">{encabezadoDespues}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((fila) => (
                <TableRow key={fila.etiqueta}>
                  <TableHead scope="row" className="text-muted-foreground">
                    {fila.etiqueta}
                  </TableHead>
                  <TableCell className="whitespace-normal">
                    {fila.antes === null ? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">{textoSinValor}</span>
                      </>
                    ) : (
                      fila.antes
                    )}
                  </TableCell>
                  <TableCell className="font-medium whitespace-normal">
                    {fila.despues}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {children}
        </div>
      </Modal>
    </>
  );
}
