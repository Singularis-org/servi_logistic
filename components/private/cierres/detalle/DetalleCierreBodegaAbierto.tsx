"use client";

// SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (T3.1, R292, R295) — el ÚNICO
// montaje del detalle de bodega, para la central (`CierresBodegaAdminModule`) y la satélite
// (`ConsolidacionBodegaModule`). Es el bloque que vivía en `CierresBodegaAdminModule` (SLT-104), movido
// sin cambiar su JSX: mismo flujo en dos roles, un componente con props (D15). Lo que cambia por rol
// son dos props: la audiencia y el nodo de la conciliación (ausente = el pie solo tiene «Cerrar»,
// R51). No pide datos: el resultado de `verCierreBodegaDetalle` llega por props.

import { useMemo, type ReactNode } from "react";

import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import { GestionesCierre } from "@/components/private/cierres/fila/GestionesCierre";
import type { EvidenciaAbierta } from "@/components/private/cierres/dialogos/VisorEvidencia";

import { ConciliacionCierreBodega } from "./ConciliacionCierreBodega";
import { DetalleCierre } from "./DetalleCierre";
import { MensajerosCierreBodega } from "./MensajerosCierreBodega";
import { tituloDescargaGestiones } from "./detalle-cierre-labels";
import {
  COLUMNAS_DESCARGA_DETALLE_BODEGA,
  filaDescargaDetalleBodega,
} from "./detalle-cierre-descarga-columnas";
import {
  filasMensajeros,
  folioDe,
  gestionesDeBodega,
  modoBodegaDe,
  vistaBodegaDesdeAdmin,
} from "./detalle-cierre-vista";

/** El resultado `ok` de `verCierreBodegaDetalle` tal cual llega: la pantalla no suma ni filtra (R71). */
export type CierreBodegaDetalleOk = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;

export interface DetalleCierreBodegaAbiertoProps {
  detalle: CierreBodegaDetalleOk;
  audiencia: "central" | "satelite";
  /** `ConciliacionAcciones` de la central con permiso; ausente = solo «Cerrar» (R51, R112). */
  conciliacion?: ReactNode;
  onCerrar: () => void;
  /** «Ver su cierre» de la pestaña Mensajeros (R115, R294). */
  onVerSuCierre: (href: string) => void;
  onVerEvidencia: (e: EvidenciaAbierta) => void;
}

export function DetalleCierreBodegaAbierto({
  detalle,
  audiencia,
  conciliacion,
  onCerrar,
  onVerSuCierre,
  onVerEvidencia,
}: Readonly<DetalleCierreBodegaAbiertoProps>) {
  /** SLT-104: la vista del detalle, una vez por detalle abierto (no en cada render). */
  const vista = useMemo(() => vistaBodegaDesdeAdmin(detalle), [detalle]);

  return (
    // El modo sale de la marca de recibido (`modoBodegaDe`, PA1): sin marca, la satélite lee «la
    // central aún no marca el dinero recibido»; qué pinta el pie lo decide `accionesDe`.
    <DetalleCierre
      tipo="bodega"
      marco="modal"
      audiencia={audiencia}
      detalle={vista}
      modo={modoBodegaDe(detalle.cierre)}
      pestanas={{
        // R31, R41, R113: la lista única, en «solo lectura» (sin corregir ni ajustar; evidencia
        // y, para la central, fulfillment), con la columna Mensajero. La fecha de la nota de
        // tarifas va por gestión, la de SU cierre del día (PA3, R120).
        gestiones: (
          <GestionesCierre
            gestiones={gestionesDeBodega(detalle.cierres)}
            audiencia="solo lectura"
            columnaMensajero
            // FICHA 481 — fulfillment SOLO para la central (R51: la satélite no lo ve).
            quienMiraEsCentral={audiencia === "central"}
            congeladoAt={null}
            acciones={{}}
            onVerEvidencia={onVerEvidencia}
            descargar={
              <DescargarDatasetButton
                titulo={tituloDescargaGestiones(folioDe(detalle.cierre.cierreBodegaId))}
                columnas={COLUMNAS_DESCARGA_DETALLE_BODEGA}
                obtenerFilas={async () => ({
                  status: "ok",
                  filas: gestionesDeBodega(detalle.cierres).map((i) =>
                    filaDescargaDetalleBodega(i.gestion, i.mensajeroNombre),
                  ),
                })}
              />
            }
          />
        ),
        mensajeros: (
          <MensajerosCierreBodega
            filas={filasMensajeros(detalle.cierres)}
            // R115, R294: quien monta cierra el detalle de bodega y abre el del cierre del día.
            onVerSuCierre={onVerSuCierre}
          />
        ),
        conciliacion: <ConciliacionCierreBodega detalle={vista} />,
      }}
      acciones={{ conciliacion }}
      onCerrar={onCerrar}
    />
  );
}
