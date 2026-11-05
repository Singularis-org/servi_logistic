"use client";

import { useState } from "react";

import { DataTable, type Column } from "@/components/shared/DataTable";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { guardarValoresTarifa } from "@/lib/actions/tarifas";
import type { TiendaDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type { TarifaValorDTO } from "@/lib/types/tarifa-flexible";

import { claveDeCelda } from "./tarifas-borrador";
import { TEXTOS, textoValorSinIva } from "./tarifas-textos";

export interface FilaPrecioTienda {
  id: string;
  tiendaId: string;
  tiendaNombre: string;
  zonaId: string | null;
  grupoId: string | null;
  aplica: string;
  valores: readonly TarifaValorDTO[];
}

/** R41: una fila por tienda y alcance, con los nombres de lo que ya se conoce. */
export function filasDePrecios(
  precios: readonly TarifaValorDTO[],
  tiendas: readonly TiendaDePantalla[],
  zonas: readonly { id: string; nombre: string }[],
  nombresDeGrupo: Readonly<Record<string, string>>,
): FilaPrecioTienda[] {
  const filas = new Map<string, FilaPrecioTienda & { valores: TarifaValorDTO[] }>();
  for (const v of precios) {
    if (v.tiendaId === null) continue;
    const id = `${v.tiendaId}|${v.zonaId ?? ""}|${v.grupoId ?? ""}`;
    const fila = filas.get(id) ?? {
      id,
      tiendaId: v.tiendaId,
      tiendaNombre: tiendas.find((t) => t.id === v.tiendaId)?.nombre ?? TEXTOS.tiendaDesconocida,
      zonaId: v.zonaId,
      grupoId: v.grupoId,
      aplica: aplicaEn(v, zonas, nombresDeGrupo),
      valores: [],
    };
    fila.valores.push(v);
    filas.set(id, fila);
  }
  return [...filas.values()].sort(
    (a, b) => a.tiendaNombre.localeCompare(b.tiendaNombre) || a.aplica.localeCompare(b.aplica),
  );
}

function aplicaEn(
  v: TarifaValorDTO,
  zonas: readonly { id: string; nombre: string }[],
  nombresDeGrupo: Readonly<Record<string, string>>,
): string {
  if (v.zonaId === null) return TEXTOS.todasSusZonas;
  const zona = zonas.find((z) => z.id === v.zonaId)?.nombre ?? "";
  if (v.grupoId === null) return zona;
  return `${zona} · ${nombresDeGrupo[v.grupoId] ?? TEXTOS.grupoDeZona("")}`.trim();
}

export interface TarifasTiendasProps {
  filas: readonly FilaPrecioTienda[];
  puedeEscribir: boolean;
  onAnadir: () => void;
  onEditar: (fila: FilaPrecioTienda) => void;
  onCambio: () => Promise<void> | void;
}

function flete(fila: FilaPrecioTienda, concepto: TarifaValorDTO["concepto"]): string {
  const v = fila.valores.find((x) => x.concepto === concepto);
  return v === undefined ? TEXTOS.usaValorGeneral : textoValorSinIva(v);
}

/** R41, R57: la lista de precios propios. Editar y añadir usan el panel de valores: no hay un segundo formulario. */
export function TarifasTiendas({ filas, puedeEscribir, onAnadir, onEditar, onCambio }: Readonly<TarifasTiendasProps>) {
  const toast = useToast();
  const [aQuitar, setAQuitar] = useState<FilaPrecioTienda | null>(null);

  const columnas: Column<FilaPrecioTienda>[] = [
    { id: "tienda", value: TEXTOS.colTienda, render: (f) => <span className="font-medium">{f.tiendaNombre}</span> },
    { id: "aplica", value: TEXTOS.colAplica, render: (f) => f.aplica },
    { id: "entregado", value: TEXTOS.colFleteEntregado, render: (f) => flete(f, "tienda_flete_entregado") },
    { id: "devolucion", value: TEXTOS.colFleteDevolucion, render: (f) => flete(f, "tienda_flete_rechazo") },
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
            aria-label={TEXTOS.editarPrecioDe(f.tiendaNombre)}
            onClick={() => onEditar(f)}
          >
            {TEXTOS.editar}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-3"
            aria-label={TEXTOS.quitarPrecioDe(f.tiendaNombre)}
            onClick={() => setAQuitar(f)}
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
      if (r.status !== "ok" || r.resultados.some((x) => x.status !== "ok")) {
        toast.error(TEXTOS.errorGuardar);
        await onCambio();
        return;
      }
      toast.success(TEXTOS.precioQuitado);
      setAQuitar(null);
      await onCambio();
    } catch {
      toast.error(TEXTOS.errorGuardar);
    }
  }

  const accionAnadir = puedeEscribir ? (
    <Button type="button" variant="outline" className="min-h-11 px-4 font-semibold" onClick={onAnadir}>
      {TEXTOS.anadirPrecio}
    </Button>
  ) : null;

  return (
    <section aria-label={TEXTOS.tiendasTitulo} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{TEXTOS.tiendasTitulo}</h2>
          <p className="mt-[3px] text-[13px] text-muted-foreground">{TEXTOS.tiendasNota}</p>
        </div>
        {filas.length > 0 ? accionAnadir : null}
      </div>
      <DataTable<FilaPrecioTienda>
        columns={columnas}
        data={[...filas]}
        rowKey="id"
        ariaLabel={TEXTOS.tiendasTitulo}
        emptyState={{
          title: TEXTOS.sinPreciosTitulo,
          description: puedeEscribir ? TEXTOS.sinPreciosDetalle : undefined,
          action: accionAnadir ?? undefined,
        }}
      />
      <Modal
        open={aQuitar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setAQuitar(null);
        }}
        title={aQuitar === null ? "" : TEXTOS.quitarPrecioTitulo(aQuitar.tiendaNombre, aQuitar.aplica)}
        description={aQuitar === null ? undefined : TEXTOS.quitarPrecioDetalle(aQuitar.valores.length)}
        confirmLabel={TEXTOS.quitar}
        cancelLabel={TEXTOS.cancelar}
        confirmVariant="destructive"
        size="md"
        closeOnConfirm={false}
        className="[&_button[data-slot=button]]:min-h-11"
        onConfirm={quitar}
      />
    </section>
  );
}
