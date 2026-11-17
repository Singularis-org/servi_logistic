"use client";

import { CarruselCards } from "@/components/shared/CarruselCards";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import type { VistaCards } from "@/app/(app)/mis-asignaciones/_components/VistaCardsToggle";
import {
  CLASE_FASE,
  type FaseTransicion,
} from "@/app/(app)/mis-asignaciones/_components/useTransicionVista";
import { TOPE_RECOLECTADAS_HOY } from "@/lib/constants/recoleccion-tienda";
import type { RecolectadaHoyDTO } from "@/lib/types/recoleccion-tienda";

// Feature 167 (R24/R28/R30/R31) — lo que el mensajero YA recolectó hoy. Presentación pura:
// recibe la lista por props, YA acotada al día natural de Costa Rica (R27), YA filtrada al
// propio actor (R21/R29) y YA ordenada de la más reciente a la más antigua por el servidor.
//
// NO reordena ni recorta: si este componente ordenara por su cuenta, el orden del servidor y
// el de la pantalla podrían divergir y el tope dejaría de significar "las más recientes"
// (R31). Aquí solo se pinta.
//
// 2026-08-11 (decisión del humano): pinta la MISMA card que el resto del portal
// (`PosOrderCardMosaico` / `PosOrderCardDetalle`) en vez de su fila propia de guía·remisión·
// tienda·hora. La vista NO la decide este componente: la recibe del módulo, que es donde vive
// el único conmutador del apartado — dos secciones de la misma pantalla conmutando por
// separado serían dos preferencias para una sola mirada.
//
// La HORA se conserva: es el único dato que la card no tiene y el que convierte la lista en el
// trabajo del día. En Mosaico va por el pie de la card (`acciones`), el hueco que la card
// compartida deja para lo propio de cada consumidor. SLT-190 (R863, R865, DS6): en Detalle sube a
// la fila plegada, tras la tienda, y ya no se repite al desplegar.
//
// SLT-190 (R860, DS4): el conmutador de vista ya no vive aquí; el único está en la barra fija del
// módulo y gobierna las dos listas.
//
// Sigue montado con el mensajero BLOQUEADO por un cierre pendiente: es historial de lo ya
// hecho, no una acción (R23).

const TITULO = "Recogidos en tienda hoy";

/**
 * SLT-156 (R521, decisión del leader 2026-11-14): el vacío de búsqueda de Recolección, el mismo en
 * sus dos listas porque el término es uno solo.
 */
export const SIN_RESULTADOS_BUSQUEDA =
  "Ninguna guía por recolectar coincide con la búsqueda.";

/** R30: el vacío se DICE, no se omite — omitir la lista parecería que el trabajo se perdió. */
const VACIO =
  "Todavía no has recolectado ninguna orden hoy. Las que escanees aparecerán aquí.";

/**
 * R31: la lista viene recortada; se avisa para que nadie la lea como "esto es todo".
 *
 * El número NO se escribe a mano: sale de la MISMA constante que el servidor usa para recortar
 * (`TOPE_RECOLECTADAS_HOY`). Mientras el literal estaba duplicado, cambiar el tope dejaba este
 * aviso mintiendo sin que ningún test lo notara (hallazgo m5 del review).
 */
const RECORTADA = `Se muestran las ${TOPE_RECOLECTADAS_HOY} más recientes de hoy.`;

// Hora FIJA en la zona de Costa Rica: la lectura es estable y no depende de la zona del
// dispositivo. Es la misma convención con la que el servidor decidió qué es "hoy" (R27), así
// que la hora que el mensajero lee y el día al que pertenece la fila no pueden contradecirse.
const HORA_CR = new Intl.DateTimeFormat("es-CR", {
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

function horaDe(fecha: Date): string {
  const ms = fecha.getTime();
  return Number.isNaN(ms) ? "—" : HORA_CR.format(fecha);
}

export interface RecolectadasHoyListaProps {
  /** R28: de la MÁS RECIENTE a la más antigua, tal como llega del servidor. */
  recolectadasHoy: readonly RecolectadaHoyDTO[];
  /**
   * SLT-156 (R520): lo que deja a la vista el término del buscador de la pantalla. Ausente = la
   * lista entera. La cabecera sigue contando `recolectadasHoy` (lo que el mensajero tiene).
   */
  visibles?: readonly RecolectadaHoyDTO[];
  /** SLT-156 (R521): hay un término escrito; con `visibles` vacía se pinta el vacío de búsqueda. */
  buscando?: boolean;
  /** R31: hoy hay más recolecciones de las que trae la lista. */
  recortada?: boolean;
  /** Vista EFECTIVA (la que toca pintar), decidida por el módulo. */
  vista: VistaCards;
  /** Tramo de la animación del conmutador, para que las dos secciones se muevan a la vez. */
  fase: FaseTransicion;
}

export function RecolectadasHoyLista({
  recolectadasHoy,
  visibles = recolectadasHoy,
  buscando = false,
  recortada = false,
  vista,
  fase,
}: Readonly<RecolectadasHoyListaProps>) {
  /**
   * Una card «recolectada hoy». La MISMA de «Por recoger» y «Por recolectar»: sin `onGestionar`
   * (solo-visualización) y sin ruta (no son paradas). FICHA 455 (R7): el chip dice el estado
   * ACTUAL de la orden; que se recolectó hoy lo dice el pie («Recolectada a las…»).
   */
  function renderCard(orden: RecolectadaHoyDTO, vistaCard: VistaCards, posicion: number) {
    const recogidoA = (
      <>
        Recogido a las{" "}
        <time
          dateTime={
            Number.isNaN(orden.recolectadaAt.getTime())
              ? undefined
              : orden.recolectadaAt.toISOString()
          }
          className="tabular-nums"
        >
          {horaDe(orden.recolectadaAt)}
        </time>
      </>
    );
    if (vistaCard === "detalle") {
      // SLT-156 (R517): en Detalle, la tarjeta compacta de Reparto. SLT-190 (R862, R863, R865):
      // con la fila de Recolección, y la hora plegada tras la tienda (no en el despliegue).
      return (
        <PosOrderCardDetalle
          orden={orden}
          total={visibles.length}
          mostrarRuta={false}
          posicion={posicion}
          filaRecoleccion={{ sufijo: recogidoA }}
          compacta
        />
      );
    }
    return (
      <PosOrderCardMosaico
        orden={orden}
        total={visibles.length}
        mostrarRuta={false}
        posicion={posicion}
        acciones={
          <p className="text-[11px] font-semibold text-muted-foreground">{recogidoA}</p>
        }
      />
    );
  }

  return (
    <section aria-label={TITULO} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{TITULO}</h2>
        {recolectadasHoy.length > 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            {recolectadasHoy.length === 1
              ? "1 paquete recogido en tienda hoy."
              : `${recolectadasHoy.length} paquetes recogidos en tienda hoy.`}
          </p>
        ) : null}
      </div>

      {recolectadasHoy.length === 0 ? (
        <p className="text-sm text-muted-foreground">{VACIO}</p>
      ) : buscando && visibles.length === 0 ? (
        /* SLT-156 (R521): hay recolecciones hoy, pero el término no deja ninguna. */
        <p className="text-sm text-muted-foreground">{SIN_RESULTADOS_BUSQUEDA}</p>
      ) : (
        <>
          {vista === "mosaico" ? (
            <div className={CLASE_FASE[fase]}>
              <CarruselCards
                items={[...visibles]}
                getKey={(orden) => orden.id}
                ariaLabel="Paquetes recogidos en tienda hoy"
                singular="Orden"
                plural="Órdenes"
                renderItem={(orden) =>
                  renderCard(orden, "mosaico", visibles.indexOf(orden) + 1)
                }
              />
            </div>
          ) : (
            <ul className={`flex flex-col gap-3 ${CLASE_FASE[fase]}`}>
              {visibles.map((orden, i) => (
                <li key={orden.id}>{renderCard(orden, "detalle", i + 1)}</li>
              ))}
            </ul>
          )}
          {recortada ? (
            <p role="status" className="text-sm text-muted-foreground">
              {RECORTADA}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
