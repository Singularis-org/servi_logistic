"use client";

import { useState } from "react";
import { MapPin, Navigation } from "lucide-react";

import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { TEXTO_ENTERO } from "@/components/shared/texto-entero";

import { UbicacionModal } from "../UbicacionModal";
import { puntoDeOrden, UbicacionTrigger } from "../UbicacionTrigger";

// POS card · bloque de NAVEGACIÓN (réplica del `NavBlock` de la referencia). En la
// referencia el lado derecho muestra distancia + ETA; el DTO del mensajero no trae
// esos datos, así que se ADAPTA sin perder la estructura: cantón (mono, destacado) +
// badge de distrito arriba, y la dirección completa con el pin abajo.
//
// Dos acciones distintas, por eso el bloque NO es un único enlace (un botón dentro
// de un `<a>` es HTML inválido):
//  - "Ir": abre el minimapa con el destino + el GPS del mensajero (`UbicacionTrigger`).
//    Ya NO saca de la app; solo cae a Google Maps si la orden no está geocodificada.
//  - Pin: abre el mismo modal de minimapa que el chat (`UbicacionModal`), centrado en
//    las COORDENADAS de la orden (`latitud`/`longitud`), no en su dirección escrita.
//    Sin coordenadas el pin es decorativo, no un botón muerto.

export interface PosNavBlockProps {
  orden: MiAsignacionDTO;
}

export function PosNavBlock({ orden }: PosNavBlockProps) {
  const punto = puntoDeOrden(orden);
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex w-full items-stretch gap-3 rounded-2xl bg-navy p-3 text-left text-white">
      <UbicacionTrigger
        orden={orden}
        ariaLabel={`Ver en el mapa la ruta hasta ${orden.direccion ?? orden.cantonNombre}`}
        className="flex flex-col items-center justify-center rounded-xl bg-brand-light px-4 py-2 text-brand-dark transition-transform hover:bg-brand-light/90 active:scale-[0.99]"
      >
        <Navigation className="size-6" aria-hidden="true" />
        <span className="mt-1 text-[10px] font-bold uppercase tracking-wide">Ir</span>
      </UbicacionTrigger>
      {/* SLT-156 (R490): cantón, distrito y dirección enteros, en varias líneas si no caben. */}
      <div className="min-w-0 flex-1 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-mono text-lg font-bold tabular-nums text-white ${TEXTO_ENTERO}`}>
            {orden.cantonNombre}
          </span>
          {orden.distritoNombre ? (
            <span className={`rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold ${TEXTO_ENTERO}`}>
              {orden.distritoNombre}
            </span>
          ) : null}
        </div>
        <p className="mt-1 flex items-start gap-1 text-sm font-semibold leading-tight text-white/90">
          {punto ? (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              aria-label={`Ver en el mapa la ubicación de ${orden.destinatario}`}
              className="-m-1 mt-0 shrink-0 rounded-md p-1 transition-colors hover:bg-white/15 active:bg-white/25"
            >
              <MapPin className="size-3.5" aria-hidden="true" />
            </button>
          ) : (
            <MapPin className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className={`text-pretty ${TEXTO_ENTERO}`}>{orden.direccion ?? "Sin dirección"}</span>
        </p>
      </div>

      {/* Mismo modal que el chat, pero con las coordenadas de la orden. */}
      <UbicacionModal
        punto={abierto ? punto : null}
        onOpenChange={(v) => setAbierto(v)}
        titulo="Ubicación de la orden"
        descripcion="Las coordenadas registradas de la orden y tu ubicación actual."
      />
    </div>
  );
}
