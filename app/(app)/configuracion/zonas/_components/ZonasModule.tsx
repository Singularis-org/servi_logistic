"use client";

import { useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import { listarZonas, obtenerZona, borrarZona } from "@/lib/actions/zonas";
import { listarArbolGeografico } from "@/lib/actions/geografia";
import type { ZonaDTO } from "@/lib/types/zona";
import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";

import { CrearZonaForm, type ZonaFormInitial } from "./CrearZonaForm";

const PAGE_SIZE = 100;

/**
 * Módulo cliente de Zonas (SLT-51; antes «Costos por zona» dentro de Tarifas, ahora sin costos):
 * texto introductorio + botón Crear zona,
 * listado de zonas con Editar/Eliminar, formulario de crear/editar (precargado
 * en edición) y modal de confirmación de borrado (no se cierra por click fuera:
 * `dismissible={false}`). Notifica creación/edición/eliminación/error con toast.
 */
export function ZonasModule({
  initialZonas,
  provincias: initialProvincias,
}: {
  initialZonas: ZonaDTO[];
  provincias: ProvinciaArbolDTO[];
}) {
  const toast = useToast();
  const [zonas, setZonas] = useState<ZonaDTO[]>(initialZonas);
  // El árbol también es estado: tras crear/editar/eliminar cambia la marca
  // `zonaId` de los distritos, y la edición la deriva de ahí.
  const [provincias, setProvincias] =
    useState<ProvinciaArbolDTO[]>(initialProvincias);
  const [view, setView] = useState<"list" | "form">("list");
  const [formMode, setFormMode] = useState<"crear" | "editar">("crear");
  const [formInitial, setFormInitial] = useState<ZonaFormInitial | undefined>();
  // Cambia al abrir crear/editar para remontar el form y leer `initial` fresco.
  const [formKey, setFormKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ZonaDTO | null>(null);

  async function refetch() {
    const [zonasRes, arbolRes] = await Promise.all([
      listarZonas({ page: 1, pageSize: PAGE_SIZE }),
      listarArbolGeografico(),
    ]);
    if (zonasRes.status === "ok") setZonas(zonasRes.items);
    if (arbolRes.status === "ok") setProvincias(arbolRes.provincias);
  }

  function abrirCrear() {
    setFormMode("crear");
    setFormInitial(undefined);
    setFormKey((k) => k + 1);
    setView("form");
  }

  async function abrirEditar(zona: ZonaDTO) {
    // Zona completa + distritos derivados del árbol geográfico.
    const res = await obtenerZona(zona.id);
    if (res.status !== "ok") {
      toast.error("No se pudo cargar la zona.");
      return;
    }
    const full = res.zona;
    const distritoIds: string[] = [];
    for (const p of provincias)
      for (const c of p.cantones)
        for (const d of c.distritos)
          if (d.zonaId === full.id) distritoIds.push(d.id);

    setFormMode("editar");
    setFormInitial({
      zonaId: full.id,
      nombre: full.nombre,
      distritoIds,
      esCentral: full.esCentral,
    });
    setFormKey((k) => k + 1);
    setView("form");
  }

  function onSaved() {
    setView("list");
    void refetch();
  }

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Zonas de reparto</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Cada zona agrupa los distritos donde se reparte.
          </p>
        </div>
        {view === "list" ? (
          <Button type="button" onClick={abrirCrear}>
            Crear zona
          </Button>
        ) : null}
      </div>

      {view === "form" ? (
        <CrearZonaForm
          key={formKey}
          mode={formMode}
          provincias={provincias}
          zonas={zonas}
          initial={formInitial}
          onSaved={onSaved}
          onCancel={() => setView("list")}
        />
      ) : (
        <ZonasList
          zonas={zonas}
          onCrear={abrirCrear}
          onEditar={abrirEditar}
          onEliminar={setDeleteTarget}
        />
      )}

      <Modal
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Eliminar zona"
        description={
          deleteTarget
            ? `¿Eliminar la zona "${deleteTarget.nombre}"? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Aceptar"
        cancelLabel="Cancelar"
        confirmVariant="destructive"
        // No se cierra por click fuera ni Escape: sólo Cancelar o Aceptar.
        dismissible={false}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await borrarZona(deleteTarget.id);
          if (res.status !== "ok") throw res; // mantiene el modal abierto; onError avisa
          toast.success("Zona eliminada");
          await refetch();
          // Éxito: el Modal cierra solo (closeOnConfirm) -> onOpenChange limpia target.
        }}
        onError={(e) => toast.error(mensajeBorradoFallido(e))}
      />
    </section>
  );
}

/**
 * ⭑ FICHA 376 (R24) — POR QUÉ EL `conflict` DE BORRAR YA NO TIENE UN SOLO TEXTO.
 *
 * Hasta hoy cualquier `conflict` decía «la zona está en uso», y con la guarda de R10 esa frase
 * pasó a ser MENTIRA en un caso: la zona central (hoy «zona de bodega principal», SLT-51) se rechaza aunque no tenga ni una orden ni un
 * usuario apuntando. Los dos rechazos piden salidas OPUESTAS —vaciar la zona frente a marcar otra
 * como central—, así que quien lo lee tiene que poder distinguirlos sin inferirlo.
 *
 * El `motivo` viaja tipado desde `BorrarZonaResult`; aquí llega por el `throw` del `onConfirm`,
 * que el Modal entrega como `unknown` a `onError`.
 */
function mensajeBorradoFallido(error: unknown): string {
  const res = error as { status?: string; motivo?: string } | null;
  if (res?.status !== "conflict") return "No se pudo eliminar la zona.";
  return res.motivo === "es_central"
    ? "No se puede eliminar la zona de bodega principal. Marca otra zona como bodega principal antes de eliminarla."
    : "No se puede eliminar: la zona está en uso.";
}

/** Listado simple de zonas con acciones Editar/Eliminar. */
function ZonasList({
  zonas,
  onCrear,
  onEditar,
  onEliminar,
}: {
  zonas: ZonaDTO[];
  onCrear: () => void;
  onEditar: (zona: ZonaDTO) => void;
  onEliminar: (zona: ZonaDTO) => void;
}) {
  if (zonas.length === 0) {
    // Icono + título + descripción que enseña + CTA "Crear zona". SLT-51: la zona ya no lleva
    // costos, así que el vacío no promete definirlos aquí.
    return (
      <div className="rounded-md border border-border">
        <EmptyState
          icon={MapPin}
          title="No hay zonas"
          description="Crea la primera zona."
          action={
            <Button type="button" onClick={onCrear}>
              Crear zona
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {zonas.map((z) => (
        <li
          key={z.id}
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {z.nombre}
              {/* SLT-51 (R3/R10): la marca se nombra por lo que decide —a qué bodega va el
                  cierre—, no por la variante de flete GAM que retira SLT-52. */}
              {z.esCentral ? (
                <Badge variant="secondary">Zona de bodega principal</Badge>
              ) : null}
            </span>
            {/* Sin «· cobro por vehículo»: Zonas no muestra costos (R3). */}
            <span className="text-xs text-muted-foreground">
              {z.distritosCount} distrito{z.distritosCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditar(z)}
            >
              <Pencil aria-hidden="true" />
              Editar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onEliminar(z)}
            >
              <Trash2 aria-hidden="true" />
              Eliminar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
