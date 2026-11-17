"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EscanerGuiaCard } from "@/components/shared/EscanerGuiaCard";
import { useSesionEscaneo } from "@/hooks/useSesionEscaneo";
import {
  horaLectura,
  resumenVisible,
  textoEstado,
  type ContadoresSesion,
  type DesenlaceRecepcion,
  type EstadoFila,
  type FilaLectura,
} from "@/lib/utils/sesion-escaneo";
import { cn } from "@/lib/utils";

// SLT-159 «Escaneo continuo en recepciones y recogidas» — la lista de lecturas de la sesión y
// sus contadores (canvas: Main). No sabe de dominio: pinta `filas` y `contadores` y avisa de
// «Reintentar». Dos variantes: `tabla` (la página de escritorio, cinco columnas) y `lista`
// (el diálogo `max-w-md`: guía y estado arriba; destinatario · tienda · hora debajo).

const SIN_DATO = "—";

const COLOR_ESTADO: Record<EstadoFila["tipo"], string> = {
  recibiendo: "bg-info-soft text-info-strong",
  recibida: "bg-success-soft text-success-strong",
  ya_recibida: "bg-muted text-muted-foreground",
  repetida_en_sesion: "bg-muted text-muted-foreground",
  no_encontrada: "bg-warning-soft text-warning-strong",
  no_se_pudo: "bg-danger-soft text-danger-strong",
  codigo_invalido: "bg-danger-soft text-danger-strong",
};

export function ContadoresEscaneo({
  contadores,
  apilado = false,
  className,
}: Readonly<{ contadores: ContadoresSesion; apilado?: boolean; className?: string }>) {
  const items = [
    { rotulo: "Recibidas", valor: contadores.recibidas },
    { rotulo: "Repetidas", valor: contadores.repetidas },
    { rotulo: "No encontradas", valor: contadores.noEncontradas },
  ];
  return (
    <section aria-label="Resumen" className={className}>
      {/* `apilado`: la columna derecha de la página, uno bajo otro (canvas: Main). */}
      <dl className={cn("grid gap-3", apilado ? "grid-cols-1" : "grid-cols-3")}>
        {items.map(({ rotulo, valor }) => (
          <div key={rotulo} className="rounded-lg border border-border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{rotulo}</dt>
            <dd className="text-xl font-bold tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Estado({
  fila,
  onReintentar,
}: Readonly<{ fila: FilaLectura; onReintentar: (id: number) => void }>) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
          COLOR_ESTADO[fila.estado.tipo],
        )}
      >
        {textoEstado(fila.estado)}
      </span>
      {fila.estado.tipo === "no_se_pudo" ? (
        <>
          <span className="text-xs text-muted-foreground">{fila.estado.motivo}</span>
          <Button type="button" variant="outline" size="touch" onClick={() => onReintentar(fila.id)}>
            <RotateCcw aria-hidden="true" />
            Reintentar
          </Button>
        </>
      ) : null}
    </div>
  );
}

export interface LecturasEscaneoProps {
  filas: readonly FilaLectura[];
  onReintentar: (filaId: number) => void;
  variante: "lista" | "tabla";
  className?: string;
}

/** La lista de lecturas (`role="log"`), la más reciente arriba (R581). */
export function LecturasEscaneo({
  filas,
  onReintentar,
  variante,
  className,
}: Readonly<LecturasEscaneoProps>) {
  if (variante === "lista") {
    return (
      <ul
        role="log"
        aria-label="Lecturas"
        className={cn("max-h-72 divide-y divide-border overflow-y-auto", className)}
      >
        {filas.map((fila) => {
          const resumen = resumenVisible(fila.estado);
          return (
            <li key={fila.id} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm break-all">{fila.numGuia ?? fila.leido}</span>
                <Estado fila={fila} onReintentar={onReintentar} />
              </div>
              <span className="text-xs text-muted-foreground">
                {resumen?.destinatario ?? SIN_DATO} · {resumen?.tienda ?? SIN_DATO} ·{" "}
                {horaLectura(fila.hora)}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section
      role="log"
      aria-label="Lecturas"
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left">
            {["Hora", "Guía", "Destinatario", "Tienda", "Estado"].map((titulo) => (
              <th key={titulo} scope="col" className="px-4 py-3 font-semibold">
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const resumen = resumenVisible(fila.estado);
            return (
              <tr key={fila.id} className="border-t border-border align-top">
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {horaLectura(fila.hora)}
                </td>
                <td className="px-4 py-3 font-mono break-all">{fila.numGuia ?? fila.leido}</td>
                <td className="px-4 py-3">{resumen?.destinatario ?? SIN_DATO}</td>
                <td className="px-4 py-3 text-muted-foreground">{resumen?.tienda ?? SIN_DATO}</td>
                <td className="px-4 py-3">
                  <Estado fila={fila} onReintentar={onReintentar} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export interface TarjetaEscaneoContinuoProps {
  /** La acción de la superficie, ya traducida a desenlace. */
  recibir: (numGuia: number) => Promise<DesenlaceRecepcion>;
  /** R592: refresco del listado de fondo, una vez al cerrar el diálogo si hubo recepción. */
  alCerrarConRecepcion?: () => void;
  titulo: string;
  descripcion: string;
  ariaLabel: string;
  submitLabel: string;
}

/**
 * El diálogo continuo de las recepciones (R580-R593): la tarjeta de SLT-158 en modo continuo,
 * con contadores y lista debajo de cámara y campo (R593). Sin toasts por lectura (R590): la
 * fila lo dice. La sesión muere al desmontar con el diálogo (R591).
 */
export function TarjetaEscaneoContinuo({
  recibir,
  alCerrarConRecepcion,
  titulo,
  descripcion,
  ariaLabel,
  submitLabel,
}: Readonly<TarjetaEscaneoContinuoProps>) {
  const sesion = useSesionEscaneo(recibir, { alCerrarConRecepcion });
  return (
    <EscanerGuiaCard
      continuo
      ariaLabel={ariaLabel}
      titulo={titulo}
      descripcion={descripcion}
      onDecoded={sesion.procesar}
      manual={{ onSubmit: sesion.procesar, submitLabel }}
      alLlegar={sesion.registrar}
      lineaDeError={false}
      mensajeErrorCamara="No se pudo abrir la cámara."
    >
      <ContadoresEscaneo contadores={sesion.contadores} className="mt-6" />
      <LecturasEscaneo
        variante="lista"
        filas={sesion.filas}
        onReintentar={sesion.reintentar}
        className="mt-3"
      />
    </EscanerGuiaCard>
  );
}
