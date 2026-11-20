"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, MapPin, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { EstadoConInfo } from "@/components/shared/EstadoInfo";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import {
  listarZonas,
  obtenerZona,
  borrarZona,
  desactivarZona,
  reactivarZona,
} from "@/lib/actions/zonas";
import { listarArbolGeografico } from "@/lib/actions/geografia";
import { ROL_LABELS } from "@/lib/auth/rol-label";
import type { ImpedimentosDesactivacion, ZonaDTO } from "@/lib/types/zona";
import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";

import { ESTADO_LABELS } from "../../_components/usuario-estado-label";

import { CrearZonaForm, type ZonaFormInitial } from "./CrearZonaForm";

const PAGE_SIZE = 100;

/**
 * Módulo cliente de Zonas (SLT-51; antes «Costos por zona» dentro de Tarifas, ahora sin costos):
 * texto introductorio + botón Crear zona,
 * listado de zonas con Editar/Desactivar/Reactivar/Eliminar, formulario de crear/editar (precargado
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
  // El árbol también es estado: es lo que recibe el formulario. Se reemplaza
  // con el que se lee al abrir crear/editar (SLT-75 R20, ver `leerArbol`).
  const [provincias, setProvincias] =
    useState<ProvinciaArbolDTO[]>(initialProvincias);
  const [view, setView] = useState<"list" | "form">("list");
  const [formMode, setFormMode] = useState<"crear" | "editar">("crear");
  const [formInitial, setFormInitial] = useState<ZonaFormInitial | undefined>();
  // Cambia al abrir crear/editar para remontar el form y leer `initial` fresco.
  const [formKey, setFormKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ZonaDTO | null>(null);
  // SLT-225 (R1760): un solo Modal para desactivar y reactivar; `accion` decide textos y acción.
  const [estadoTarget, setEstadoTarget] = useState<{
    zona: ZonaDTO;
    accion: "desactivar" | "reactivar";
  } | null>(null);
  // Lo que devolvió el último rechazo por impedimentos; se pinta dentro de la confirmación abierta.
  const [impedimentos, setImpedimentos] = useState<ImpedimentosDesactivacion | null>(null);

  function abrirCambioEstado(zona: ZonaDTO, accion: "desactivar" | "reactivar") {
    setImpedimentos(null);
    setEstadoTarget({ zona, accion });
  }

  async function confirmarCambioEstado() {
    if (!estadoTarget) return;
    const { zona, accion } = estadoTarget;
    if (accion === "desactivar") {
      const res = await desactivarZona(zona.id);
      if (res.status === "ok") {
        toast.success("Zona desactivada");
        await refetch();
        return;
      }
      if (res.status === "conflict" && res.motivo === "impedimentos") {
        setImpedimentos(res.impedimentos);
        throw res; // mantiene abierta la confirmación con lo que hay que mover
      }
      if (res.status === "conflict") {
        // Otra persona ya la desactivó: no es un fallo, el listado solo estaba atrasado.
        toast.info("La zona ya estaba desactivada.");
        await refetch();
        return;
      }
      throw res;
    }
    const res = await reactivarZona(zona.id);
    if (res.status === "ok") {
      toast.success("Zona reactivada");
      await refetch();
      return;
    }
    if (res.status === "conflict") {
      toast.info("La zona ya estaba activa.");
      await refetch();
      return;
    }
    throw res;
  }

  async function refetch() {
    const [zonasRes, arbolRes] = await Promise.all([
      listarZonas({ page: 1, pageSize: PAGE_SIZE }),
      listarArbolGeografico(),
    ]);
    if (zonasRes.status === "ok") setZonas(zonasRes.items);
    if (arbolRes.status === "ok") setProvincias(arbolRes.provincias);
  }

  /**
   * SLT-75 (R20): el árbol se lee al ABRIR el formulario, no se toma del estado. El del estado lo
   * refresca `onSaved` sin esperar, así que justo después de guardar otra zona puede seguir diciendo
   * que un distrito está libre: el selector lo ofrecería y la edición lo preseleccionaría mal (R19).
   * `null` si la lectura falla; quien llama no abre el formulario.
   */
  async function leerArbol(): Promise<ProvinciaArbolDTO[] | null> {
    try {
      const res = await listarArbolGeografico();
      return res.status === "ok" ? res.provincias : null;
    } catch {
      return null;
    }
  }

  async function abrirCrear() {
    const arbol = await leerArbol();
    if (!arbol) {
      toast.error("No se pudo cargar el catálogo geográfico.");
      return;
    }
    setProvincias(arbol);
    setFormMode("crear");
    setFormInitial(undefined);
    setFormKey((k) => k + 1);
    setView("form");
  }

  async function abrirEditar(zona: ZonaDTO) {
    // Zona completa + distritos derivados del árbol geográfico, que se lee al abrir (SLT-75 R20).
    const [res, arbol] = await Promise.all([obtenerZona(zona.id), leerArbol()]);
    if (res.status !== "ok" || !arbol) {
      toast.error("No se pudo cargar la zona.");
      return;
    }
    const full = res.zona;
    // SLT-75 (R19): de `zonas` y no de `zonaId`. `zonaId` se colapsa a null cuando el distrito está
    // en dos zonas, y entonces salía desmarcado en las dos y el siguiente guardado lo borraba.
    const distritoIds: string[] = [];
    for (const p of arbol)
      for (const c of p.cantones)
        for (const d of c.distritos)
          if (d.zonas.some((z) => z.id === full.id)) distritoIds.push(d.id);

    setProvincias(arbol);
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
          onDesactivar={(z) => abrirCambioEstado(z, "desactivar")}
          onReactivar={(z) => abrirCambioEstado(z, "reactivar")}
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

      <Modal
        open={estadoTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEstadoTarget(null);
            setImpedimentos(null);
          }
        }}
        title={estadoTarget?.accion === "reactivar" ? "Reactivar zona" : "Desactivar zona"}
        description={
          estadoTarget
            ? estadoTarget.accion === "reactivar"
              ? `¿Reactivar la zona "${estadoTarget.zona.nombre}"? Vuelve a ofrecerse para trabajo nuevo. No recupera distritos ni usuarios.`
              : `¿Desactivar la zona "${estadoTarget.zona.nombre}"? Deja de ofrecerse para trabajo nuevo. Sus órdenes y su historia se conservan.`
            : ""
        }
        confirmLabel={estadoTarget?.accion === "reactivar" ? "Reactivar" : "Desactivar"}
        cancelLabel="Cancelar"
        dismissible={false}
        onConfirm={confirmarCambioEstado}
        onError={(e) => {
          // Los impedimentos ya se ven en la confirmación; el toast solo cubre el fallo inesperado.
          const res = e as { status?: string } | null;
          if (res?.status === "conflict") return;
          toast.error(
            estadoTarget?.accion === "reactivar"
              ? "No se pudo reactivar la zona."
              : "No se pudo desactivar la zona.",
          );
        }}
      >
        {impedimentos ? <ImpedimentosLista impedimentos={impedimentos} /> : null}
      </Modal>
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
    : "No se puede eliminar: la zona tiene historia (órdenes o usuarios). Puedes desactivarla en su lugar.";
}

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/**
 * SLT-225 (R1760, design §3.7): qué hay que mover antes de desactivar, en español llano. El servicio
 * entrega datos tipados y no texto; las etiquetas salen de sus fuentes únicas (`ROL_LABELS`,
 * `ESTADO_LABELS`) y el estado de una orden se pinta con `EstadoConInfo`, que es quien resuelve su
 * nombre y le pone el botón de información, como en el resto de la app (guardia `estado-con-info`).
 */
function ImpedimentosLista({ impedimentos }: { impedimentos: ImpedimentosDesactivacion }) {
  const { esCentral, distritos, usuarios, ordenesVivas } = impedimentos;
  const restantes = ordenesVivas.total - ordenesVivas.muestra.length;
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-destructive/40 p-3 text-sm"
    >
      <p className="font-medium">Todavía no se puede desactivar. Antes hay que mover:</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        {esCentral ? (
          <li>Es la zona de bodega principal. Marca otra zona como bodega principal antes.</li>
        ) : null}
        {distritos > 0 ? (
          <li>
            {`Tiene ${distritos} ${plural(distritos, "distrito", "distritos")}. ${plural(distritos, "Quítalo", "Quítalos")} editando la zona.`}
          </li>
        ) : null}
        {usuarios.length > 0 ? (
          <li>
            {`Tiene ${usuarios.length} ${plural(usuarios.length, "usuario asignado", "usuarios asignados")}. ${plural(usuarios.length, "Cámbiale", "Cámbiales")} la zona:`}
            <ul className="mt-1 flex flex-col gap-0.5">
              {usuarios.map((u, i) => (
                <li key={`${u.nombre}-${i}`}>
                  {`${u.nombre} · ${ROL_LABELS[u.rol] ?? u.rol} · ${ESTADO_LABELS[u.estado] ?? u.estado}`}
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {ordenesVivas.total > 0 ? (
          <li>
            {`Tiene ${ordenesVivas.total} ${plural(ordenesVivas.total, "orden", "órdenes")} sin terminar:`}
            <ul className="mt-1 flex flex-col gap-0.5">
              {ordenesVivas.porEstado.map((e) => (
                <li key={e.estado}>
                  <EstadoConInfo codigo={e.estado} /> ({e.cantidad})
                </li>
              ))}
            </ul>
            {ordenesVivas.muestra.length > 0 ? (
              <p className="mt-1 break-words">
                {`Guías: ${ordenesVivas.muestra.join(", ")}${restantes > 0 ? ` y ${restantes} más.` : "."}`}
              </p>
            ) : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * Listado simple de zonas. SLT-225 (R1759): el orden (activas primero) lo da el servidor; una zona
 * desactivada no se edita (R1753), así que solo ofrece Reactivar y Eliminar.
 */
function ZonasList({
  zonas,
  onCrear,
  onEditar,
  onDesactivar,
  onReactivar,
  onEliminar,
}: {
  zonas: ZonaDTO[];
  onCrear: () => void;
  onEditar: (zona: ZonaDTO) => void;
  onDesactivar: (zona: ZonaDTO) => void;
  onReactivar: (zona: ZonaDTO) => void;
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
            <span
              className={`flex flex-wrap items-center gap-2 text-sm font-medium${z.activa ? "" : " text-muted-foreground"}`}
            >
              {z.nombre}
              {z.activa ? null : <Badge variant="secondary">Desactivada</Badge>}
              {/* SLT-51 (R3/R10): la marca se nombra por lo que decide —a qué bodega va el
                  cierre—, no por la variante de flete GAM que retira SLT-52. */}
              {z.esCentral ? (
                <Badge variant="secondary">Zona de bodega principal</Badge>
              ) : null}
            </span>
            {/* Sin «· cobro por vehículo»: Zonas no muestra costos (R3). */}
            {/* SLT-198 (R1230): una bodega cerrada se ve como tal, con la misma marca que la central. */}
            {z.distritosCount === 0 ? (
              <span>
                <Badge variant="secondary">Sin distritos</Badge>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {z.distritosCount} distrito{z.distritosCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {z.activa ? (
              <>
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
                  variant="outline"
                  size="sm"
                  onClick={() => onDesactivar(z)}
                >
                  <Archive aria-hidden="true" />
                  Desactivar
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onReactivar(z)}
              >
                <ArchiveRestore aria-hidden="true" />
                Reactivar
              </Button>
            )}
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
