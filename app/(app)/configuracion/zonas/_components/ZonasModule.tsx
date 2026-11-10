"use client";

import { useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import { listarZonas, obtenerZona, borrarZona } from "@/lib/actions/zonas";
import { listarArbolDeZonas } from "@/lib/actions/geografia";
import type { ZonaDTO } from "@/lib/types/zona";
import type { ArbolDeZonasDTO } from "@/lib/types/geografia-nodo";

import { AVISO_CAMBIO_CONCURRENTE, CrearZonaForm, type ZonaFormInitial } from "./CrearZonaForm";
import { indexarArbol, nodosAsignadosA, repartirPorProfundidad } from "./seleccion-de-zona";

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
  arbol: initialArbol,
}: {
  initialZonas: ZonaDTO[];
  /** SLT-89 (design §4.2): el árbol de zonas de N niveles de la empresa. */
  arbol: ArbolDeZonasDTO;
}) {
  const toast = useToast();
  const [zonas, setZonas] = useState<ZonaDTO[]>(initialZonas);
  // El árbol también es estado: es lo que recibe el formulario. Se reemplaza
  // con el que se lee al abrir crear/editar (SLT-75 R20, ver `leerArbol`).
  const [arbol, setArbol] = useState<ArbolDeZonasDTO>(initialArbol);
  // SLT-89 (R16): el aviso de cambio concurrente sobrevive a la recarga del formulario.
  const [aviso, setAviso] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "form">("list");
  const [formMode, setFormMode] = useState<"crear" | "editar">("crear");
  const [formInitial, setFormInitial] = useState<ZonaFormInitial | undefined>();
  // Cambia al abrir crear/editar para remontar el form y leer `initial` fresco.
  const [formKey, setFormKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ZonaDTO | null>(null);

  async function refetch() {
    const [zonasRes, arbolRes] = await Promise.all([
      listarZonas({ page: 1, pageSize: PAGE_SIZE }),
      listarArbolDeZonas(),
    ]);
    if (zonasRes.status === "ok") setZonas(zonasRes.items);
    if (arbolRes.status === "ok") setArbol(arbolRes.arbol);
  }

  /**
   * SLT-75 (R20): el árbol se lee al ABRIR el formulario, no se toma del estado. El del estado lo
   * refresca `onSaved` sin esperar, así que justo después de guardar otra zona puede seguir diciendo
   * que un distrito está libre: el selector lo ofrecería y la edición lo preseleccionaría mal (R19).
   * `null` si la lectura falla; quien llama no abre el formulario.
   */
  async function leerArbol(): Promise<ArbolDeZonasDTO | null> {
    try {
      const res = await listarArbolDeZonas();
      return res.status === "ok" ? res.arbol : null;
    } catch {
      return null;
    }
  }

  async function abrirCrear() {
    setAviso(null);
    const leido = await leerArbol();
    if (!leido) {
      toast.error("No se pudo cargar el catálogo geográfico.");
      return;
    }
    setArbol(leido);
    setFormMode("crear");
    setFormInitial(undefined);
    setFormKey((k) => k + 1);
    setView("form");
  }

  async function abrirEditar(zona: Pick<ZonaDTO, "id">, conservarAviso = false) {
    if (!conservarAviso) setAviso(null);
    // Zona completa + lugares derivados del árbol de zonas, que se lee al abrir (SLT-75 R20).
    const [res, leido] = await Promise.all([obtenerZona(zona.id), leerArbol()]);
    if (res.status !== "ok" || !leido) {
      toast.error("No se pudo cargar la zona.");
      return;
    }
    const full = res.zona;
    // SLT-89 (R27): exactamente los nodos asignados a la zona, a cualquier profundidad y retirados
    // incluidos, repartidos por profundidad. SLT-75 (R19): de la asignación directa y no de la zona
    // colapsada, que un distrito en dos zonas dejaba en null y el siguiente guardado lo borraba.
    const { distritoIds, nodoIds } = repartirPorProfundidad(
      nodosAsignadosA(leido, full.id),
      indexarArbol(leido),
    );

    setArbol(leido);
    setFormMode("editar");
    setFormInitial({
      zonaId: full.id,
      nombre: full.nombre,
      distritoIds,
      nodoIds,
      esCentral: full.esCentral,
    });
    setFormKey((k) => k + 1);
    setView("form");
  }

  function onSaved() {
    setAviso(null);
    setView("list");
    void refetch();
  }

  /**
   * SLT-89 (R16): el guardado no escribió nada porque los lugares de la zona cambiaron mientras el
   * modal estaba abierto. Se avisa y se vuelve a abrir la zona con lo que hay ahora en la base.
   */
  function onCambioConcurrente() {
    setAviso(AVISO_CAMBIO_CONCURRENTE);
    const id = formInitial?.zonaId;
    if (id) void abrirEditar({ id }, true);
    void refetch();
  }

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Zonas de reparto</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Cada zona agrupa los lugares donde se reparte, de cualquier nivel.
          </p>
        </div>
        {view === "list" ? (
          <Button type="button" onClick={abrirCrear}>
            Crear zona
          </Button>
        ) : null}
      </div>

      {/* R16: el aviso queda fuera del formulario, que se remonta con lo que hay en la base. */}
      <p role="status" aria-live="polite" className="text-sm font-medium text-warning-strong empty:hidden">
        {aviso ?? ""}
      </p>

      {view === "form" ? (
        <CrearZonaForm
          key={formKey}
          mode={formMode}
          arbol={arbol}
          zonas={zonas}
          initial={formInitial}
          onSaved={onSaved}
          onCancel={() => {
            setAviso(null);
            setView("list");
          }}
          onCambioConcurrente={onCambioConcurrente}
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
            {/* SLT-89: los lugares de otro nivel (provincias, cantones…) asignados a la zona. */}
            {z.nodosCount ? (
              <span className="text-xs text-muted-foreground">
                {`+ ${z.nodosCount} ${z.nodosCount === 1 ? "lugar de otro nivel" : "lugares de otro nivel"}`}
              </span>
            ) : null}
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
