"use client";

import { useState } from "react";
import type { TarifaConcepto } from "@prisma/client";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { guardarValoresTarifa } from "@/lib/actions/tarifas";
import type { MensajeroDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type { TarifaValorDTO } from "@/lib/types/tarifa-flexible";

import { claveDeCelda } from "./tarifas-borrador";
import { conceptosDeActor, etiquetaConcepto, TEXTOS, textoValorSinIva } from "./tarifas-textos";
import { TarifaMensajeroDialogo } from "./TarifaMensajeroDialogo";

export interface FilaMensajero {
  mensajeroId: string;
  nombre: string;
  /** R32: dado de baja, o ya sin rol `mensajero`. */
  inactivo: boolean;
  valores: readonly TarifaValorDTO[];
}

/** R27, R32: una fila por mensajero con al menos un valor. El orden de la lectura no se usa: no está definido. */
export function filasDeMensajeros(
  valores: readonly TarifaValorDTO[],
  mensajeros: readonly MensajeroDePantalla[],
): FilaMensajero[] {
  const filas = new Map<string, FilaMensajero & { valores: TarifaValorDTO[] }>();
  for (const v of valores) {
    if (v.mensajeroId === null) continue;
    const mensajero = mensajeros.find((m) => m.id === v.mensajeroId);
    const fila = filas.get(v.mensajeroId) ?? {
      mensajeroId: v.mensajeroId,
      nombre: mensajero?.nombre ?? TEXTOS.tiendaDesconocida,
      inactivo: mensajero?.elegible !== true,
      valores: [],
    };
    fila.valores.push(v);
    filas.set(v.mensajeroId, fila);
  }
  return [...filas.values()].sort(
    (a, b) => a.nombre.localeCompare(b.nombre) || a.mensajeroId.localeCompare(b.mensajeroId),
  );
}

export interface TarifasMensajerosProps {
  filas: readonly FilaMensajero[];
  mensajeros: readonly MensajeroDePantalla[];
  activada: boolean;
  puedeEscribir: boolean;
  onCambio: () => Promise<void> | void;
}

function valorDe(fila: FilaMensajero, concepto: TarifaConcepto): string {
  const v = fila.valores.find((x) => x.concepto === concepto);
  return v === undefined ? TEXTOS.usaZona : textoValorSinIva(v);
}

type Dialogo = { tipo: "anadir" } | { tipo: "editar"; mensajeroId: string };

/** R27-R36: el pago propio de cada mensajero. Sale de la lista por `elegible` y por tener valor, nunca por su rol. */
export function TarifasMensajeros({ filas, mensajeros, activada, puedeEscribir, onCambio }: Readonly<TarifasMensajerosProps>) {
  const toast = useToast();
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aQuitarId, setAQuitarId] = useState<string | null>(null);

  // Se busca en cada render: tras un fallo parcial la recarga deja menos valores, y reintentar con la lista
  // vieja pediría quitar lo que ya no existe. Si ya no queda ninguno, el modal se cierra solo.
  const aQuitar = filas.find((f) => f.mensajeroId === aQuitarId) ?? null;

  const columnas: Column<FilaMensajero>[] = [
    {
      id: "mensajero",
      value: TEXTOS.colMensajero,
      render: (f) => (
        <span className="inline-flex flex-wrap items-center gap-1.5 font-medium">
          {f.nombre}
          {f.inactivo ? <Badge variant="warning">{TEXTOS.inactivo}</Badge> : null}
        </span>
      ),
    },
    ...conceptosDeActor("mensajero").map(
      (concepto): Column<FilaMensajero> => ({
        id: concepto,
        value: etiquetaConcepto(concepto),
        render: (f) => valorDe(f, concepto),
      }),
    ),
  ];
  if (puedeEscribir) {
    columnas.push({
      id: "acciones",
      value: TEXTOS.colAcciones,
      renderHeader: () => <span className="sr-only">{TEXTOS.colAcciones}</span>,
      align: "right",
      render: (f) => (
        <span className="inline-flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-3"
            aria-label={TEXTOS.editarMensajeroDe(f.nombre)}
            onClick={() => setDialogo({ tipo: "editar", mensajeroId: f.mensajeroId })}
          >
            {TEXTOS.editar}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-3"
            aria-label={TEXTOS.quitarMensajeroDe(f.nombre)}
            onClick={() => setAQuitarId(f.mensajeroId)}
          >
            {TEXTOS.quitar}
          </Button>
        </span>
      ),
    });
  }

  async function quitar(): Promise<void> {
    if (aQuitar === null) return;
    try {
      const r = await guardarValoresTarifa({
        cambios: aQuitar.valores.map((v) => ({ accion: "quitar", clave: claveDeCelda(v.concepto, null), id: v.id })),
      });
      const fallidos = r.status === "ok" ? r.resultados.filter((x) => x.status !== "ok").length : 0;
      if (r.status !== "ok" || fallidos > 0) {
        // Sin cifras: la recarga deja en el modal los que de verdad quedan.
        if (r.status === "ok" && fallidos < r.resultados.length) toast.warning(TEXTOS.quitadoParcial);
        else toast.error(TEXTOS.errorQuitar);
        await onCambio();
        return;
      }
      toast.success(TEXTOS.mensajeroQuitado);
      setAQuitarId(null);
      await onCambio();
    } catch {
      toast.error(TEXTOS.errorQuitar);
    }
  }

  const accionAnadir = puedeEscribir ? (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 px-4 font-semibold"
      onClick={() => setDialogo({ tipo: "anadir" })}
    >
      {TEXTOS.anadirMensajero}
    </Button>
  ) : null;

  const conValor = new Set(filas.map((f) => f.mensajeroId));

  return (
    <section aria-label={TEXTOS.mensajerosTitulo} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <h2 className="text-lg font-bold">{TEXTOS.mensajerosTitulo}</h2>
          <p className="mt-[3px] text-[13px] text-muted-foreground">{TEXTOS.mensajerosNota}</p>
          <p className="text-[13px] text-muted-foreground">{TEXTOS.mensajerosBase}</p>
          <p className="text-[13px] text-muted-foreground">
            {activada ? TEXTOS.mensajerosEnVigor : TEXTOS.mensajerosSinActivar}
          </p>
        </div>
        {filas.length > 0 ? accionAnadir : null}
      </div>
      <DataTable<FilaMensajero>
        columns={columnas}
        data={[...filas]}
        rowKey="mensajeroId"
        ariaLabel={TEXTOS.mensajerosTitulo}
        emptyState={{
          title: TEXTOS.mensajerosVacioTitulo,
          description: puedeEscribir ? TEXTOS.mensajerosVacioDetalle : undefined,
          action: accionAnadir ?? undefined,
        }}
      />
      <Modal
        open={aQuitar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setAQuitarId(null);
        }}
        title={aQuitar === null ? "" : TEXTOS.quitarMensajeroTitulo(aQuitar.nombre)}
        description={aQuitar === null ? undefined : TEXTOS.quitarMensajeroDetalle(aQuitar.valores.length)}
        confirmLabel={TEXTOS.quitar}
        cancelLabel={TEXTOS.cancelar}
        confirmVariant="destructive"
        size="md"
        closeOnConfirm={false}
        className="[&_button[data-slot=button]]:min-h-11"
        onConfirm={quitar}
      />
      {dialogo !== null && puedeEscribir ? (
        <TarifaMensajeroDialogo
          filas={filas}
          disponibles={mensajeros.filter((m) => m.elegible && !conValor.has(m.id))}
          mensajeroInicialId={dialogo.tipo === "editar" ? dialogo.mensajeroId : null}
          activada={activada}
          onCerrar={() => setDialogo(null)}
          onCambio={onCambio}
        />
      ) : null}
    </section>
  );
}
