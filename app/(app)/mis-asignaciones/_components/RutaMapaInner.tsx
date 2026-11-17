"use client";

// Feature 97 (R28, design §10 relajado por el briefing) — render REAL del mapa de la ruta
// con Leaflet + tiles de OpenStreetMap. Este archivo importa `leaflet`, que toca `window`/
// `document` en el ámbito del módulo, así que NUNCA debe ejecutarse en el servidor: se carga
// SIEMPRE vía `next/dynamic(..., { ssr: false })` desde `RutaMapa.tsx`, nunca de forma directa.
//
// GOTCHA de iconos: el icono PNG por defecto de Leaflet se rompe con los bundlers (las rutas
// a los assets quedan mal resueltas). En vez de re-parchear `L.Icon.Default`, se usa
// `L.divIcon` con HTML propio: resuelve el bug Y da justo lo que pide R28 —marcadores
// NUMERADOS con la posición de la ruta (1, 2, 3…)—. El origen usa un `divIcon` distinto.
//
// SLT-166 (R539-R543, design §11): los marcadores salen de `htmlMarcador` (paleta de la app), el
// toque abre la hoja de la parada (la pinta `RepartoModule`, que tiene la orden), el MISMO
// contenedor pasa a pantalla completa y la parada del carrusel centra el mapa.
import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import L, { type LatLngTuple } from "leaflet";
import { ChevronUp, LocateFixed, Maximize2, X } from "lucide-react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import { Button } from "@/components/ui/button";
import { decodificarPolilinea } from "@/lib/geo/polilinea";
import { PAIS_DE_OPERACION } from "@/lib/config/pais";

import {
  COLOR_MARCADOR,
  htmlMarcador,
  LADO_MARCADOR,
  type TipoMarcador,
} from "./ruta-mapa-iconos";
import type { RutaMapaParada, RutaMapaOrigen, RutaMapaTrazado } from "./ruta-mapa-tipos";

// Atribución obligatoria de OSM (condición de uso de sus tiles públicos).
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const VER_MAPA_COMPLETO = "Ver mapa completo";
export const CERRAR_MAPA_COMPLETO = "Cerrar";
export const CENTRAR_EN_MI_UBICACION = "Centrar en mi ubicación";
export const OCULTAR_MAPA = "Ocultar mapa";
export const LEYENDA_MAPA: { tipo: TipoMarcador; texto: string }[] = [
  { tipo: "siguiente", texto: "Siguiente" },
  { tipo: "pendiente", texto: "Pendiente" },
  { tipo: "gestionada", texto: "Gestionada" },
  { tipo: "origen", texto: "Tú" },
];

/** «Paradas {n} de {total}»: las que el mapa dibuja frente al total de la ruta (R543: sin coordenadas no se dibujan). */
export function textoParadasEnMapa(enMapa: number, total: number): string {
  return `Paradas ${enMapa} de ${total}`;
}

/** Marcador numerado de una parada (R28): el número es su posición en la ruta. */
function iconoParada(tipo: TipoMarcador, numero: number | null): L.DivIcon {
  return L.divIcon({
    className: "",
    html: htmlMarcador(tipo, numero),
    iconSize: [LADO_MARCADOR, LADO_MARCADOR],
    iconAnchor: [LADO_MARCADOR / 2, LADO_MARCADOR / 2],
  });
}

/** Marcador del punto de partida del mensajero («Tú»), distinto de las paradas. */
function iconoOrigen(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: htmlMarcador("origen"),
    iconSize: [32, 40],
    iconAnchor: [16, 9],
  });
}

/** Re-encuadra el mapa a todos los puntos cada vez que cambian (paradas + origen). */
function AjustarEncuadre({ puntos }: { puntos: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      map.setView(puntos[0], 15);
      return;
    }
    map.fitBounds(puntos, { padding: [40, 40] });
  }, [map, puntos]);
  return null;
}

/**
 * R541: al entrar o salir de pantalla completa el contenedor cambia de tamaño, y Leaflet no se
 * entera solo: sin `invalidateSize` sigue pintando los tiles del tamaño anterior y deja media
 * pantalla gris.
 */
function SeguirTamano({ completo }: { completo: boolean }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map, completo]);
  return null;
}

/**
 * R542: centra el mapa en la parada activa cuando CAMBIA. La primera vez no: el encuadre de todas
 * las paradas es la vista de entrada, y saltar a la primera la taparía.
 */
function CentrarEnActiva({ punto }: { punto: LatLngTuple | null }) {
  const map = useMap();
  const previa = useRef<string | null>(null);
  const clave = punto ? `${punto[0]},${punto[1]}` : null;
  useEffect(() => {
    if (clave === null || punto === null) return;
    const antes = previa.current;
    previa.current = clave;
    if (antes === null || antes === clave) return;
    map.panTo(punto);
  }, [map, clave, punto]);
  return null;
}

/**
 * R541: «Centrar en mi ubicación». Vive DENTRO del mapa (necesita la instancia) y corta la
 * propagación nativa: sin eso, el toque también le llega a Leaflet como clic o arrastre del mapa.
 */
function BotonCentrar({ origen }: { origen: RutaMapaOrigen | null | undefined }) {
  const map = useMap();
  function centrar() {
    if (origen) {
      map.setView([origen.lat, origen.lng], Math.max(map.getZoom(), 15));
      return;
    }
    // Sin ubicación conocida se pide al navegador, sin forzar nada (R25 de la feature 92).
    navigator.geolocation?.getCurrentPosition((pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 15));
    });
  }
  return (
    <Button
      ref={(el) => {
        if (el) L.DomEvent.disableClickPropagation(el);
      }}
      type="button"
      variant="outline"
      size="icon-touch"
      aria-label={CENTRAR_EN_MI_UBICACION}
      className="absolute right-4 bottom-4 z-[1000] bg-background shadow-md"
      onClick={centrar}
    >
      <LocateFixed aria-hidden="true" />
    </Button>
  );
}

function LeyendaMapa() {
  return (
    <ul aria-label="Leyenda del mapa" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {LEYENDA_MAPA.map(({ tipo, texto }) => (
        <li key={tipo} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ background: COLOR_MARCADOR[tipo].fondo }}
          />
          {texto}
        </li>
      ))}
    </ul>
  );
}

export interface RutaMapaInnerProps {
  /** Paradas CON coordenadas; las que no tengan coords se omiten antes de llegar aquí. */
  paradas: RutaMapaParada[];
  /** Punto de partida del mensajero (GPS), si se conoce. */
  origen?: RutaMapaOrigen | null;
  /**
   * Geometría de la ruta devuelta por la sincronización. Si viene de `routes`, sigue las
   * calles; si falta, se cae a unir las paradas en recto (comportamiento original).
   */
  trazado?: RutaMapaTrazado | null;
  /** Polilinea codificada del tramo a la SIGUIENTE parada, resaltado sobre el resto. */
  tramoSiguiente?: string | null;
  /** SLT-166 (R539, R542): la parada de la tarjeta a la vista; sin ella, la primera de la ruta. */
  paradaActivaId?: string | null;
  /** SLT-166 (R540): el mensajero tocó el marcador de esa parada. */
  onSeleccionarParada?: (id: string) => void;
  /** SLT-166 (R541): paradas de la ruta sin filtrar, con y sin coordenadas, para «Paradas {n} de {total}». */
  totalParadas?: number;
  /**
   * SLT-192 (R880-R882): pliega el mapa. Con ella, «Ocultar mapa» va en el pie junto a «Ver mapa
   * completo»; sin ella, el pie queda como antes (solo «Ver mapa completo»).
   */
  onOcultar?: () => void;
  /** SLT-192 (R885): nota bajo la leyenda (p. ej. el punto de partida aproximado). */
  nota?: ReactNode;
}

export function RutaMapaInner({
  paradas,
  origen,
  trazado,
  tramoSiguiente,
  paradaActivaId,
  onSeleccionarParada,
  totalParadas,
  onOcultar,
  nota,
}: RutaMapaInnerProps) {
  // La ruta (Polyline) conecta SOLO las paradas ya optimizadas, en orden de secuencia.
  // Las pendientes (sin secuencia) se muestran como marcador pero no entran a la línea:
  // todavía no tienen una posición real en el recorrido.
  const optimizadas = useMemo(
    () =>
      paradas
        .filter((p) => p.secuencia !== null)
        .sort((a, b) => (a.secuencia ?? 0) - (b.secuencia ?? 0)),
    [paradas],
  );

  // La línea que se pinta. Con `trazado` se usa su geometría —decenas o cientos de puntos
  // que siguen las calles si vino de Routes—; sin él se unen las paradas en recto, que es
  // como se dibujaba antes de la feature 92.
  const lineaRuta = useMemo<LatLngTuple[]>(() => {
    if (trazado !== null && trazado !== undefined && trazado.encodedPolyline !== "") {
      const puntos = decodificarPolilinea(trazado.encodedPolyline);
      // Una polilínea corrupta o vacía no debe dejar el mapa sin ruta: se cae al recto.
      if (puntos.length >= 2) return puntos.map<LatLngTuple>((p) => [p.lat, p.lng]);
    }
    const desdeOrigen: LatLngTuple[] = origen ? [[origen.lat, origen.lng]] : [];
    return [
      ...desdeOrigen,
      ...optimizadas.map<LatLngTuple>((p) => [p.lat, p.lng]),
    ];
  }, [optimizadas, origen, trazado]);

  // Punteada mientras la línea NO sea un recorrido real por calles: así el mensajero ve de
  // un vistazo si lo que tiene delante es navegable o solo el orden de visita.
  const esPorCalles = trazado?.fuente === "routes";

  // Tramo a la siguiente parada. Se dibuja ENCIMA del recorrido completo, en Negro Servi
  // (#111111): es lo que el mensajero tiene delante ahora, y el resto de la ruta es contexto.
  const lineaTramo = useMemo<LatLngTuple[]>(() => {
    if (!tramoSiguiente) return [];
    const puntos = decodificarPolilinea(tramoSiguiente);
    // Un tramo de un solo punto no es una línea: se descarta en vez de pintar nada visible.
    return puntos.length >= 2 ? puntos.map<LatLngTuple>((p) => [p.lat, p.lng]) : [];
  }, [tramoSiguiente]);

  const puntosEncuadre = useMemo<LatLngTuple[]>(() => {
    const base = paradas.map<LatLngTuple>((p) => [p.lat, p.lng]);
    return origen ? [...base, [origen.lat, origen.lng]] : base;
  }, [paradas, origen]);

  // R539: la amarilla es la de la tarjeta a la vista; sin carrusel que la diga, la primera de la ruta.
  const activaId = paradaActivaId ?? optimizadas[0]?.id ?? paradas[0]?.id ?? null;
  const activa = paradas.find((p) => p.id === activaId) ?? null;
  const puntoActivo = useMemo<LatLngTuple | null>(
    () => (activa ? [activa.lat, activa.lng] : null),
    [activa],
  );

  // R541: el MISMO contenedor alterna a pantalla completa (un solo `MapContainer`: los tiles, el
  // zoom y la posición no se pierden al entrar ni al salir).
  const [completo, setCompleto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!completo) return;
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Con otro diálogo encima (la hoja de la parada, el «¿Gestionar esta orden?») el Escape es
      // suyo: el primero cierra ese diálogo y solo el siguiente sale de la pantalla completa.
      const otroDialogo = Array.from(document.querySelectorAll('[role="dialog"]')).some(
        (d) => d !== contenedor.current,
      );
      if (otroDialogo) return;
      setCompleto(false);
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [completo]);

  return (
    <div
      ref={contenedor}
      data-testid="ruta-mapa"
      data-completo={completo ? "true" : "false"}
      role={completo ? "dialog" : undefined}
      aria-modal={completo ? true : undefined}
      aria-label={completo ? "Mapa de ruta a pantalla completa" : undefined}
      className={
        completo
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "flex flex-col gap-2"
      }
    >
      {completo ? (
        <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
          <Button type="button" variant="outline" size="touch" onClick={() => setCompleto(false)}>
            <X aria-hidden="true" />
            {CERRAR_MAPA_COMPLETO}
          </Button>
          <p className="text-sm font-semibold tabular-nums">
            {textoParadasEnMapa(paradas.length, totalParadas ?? paradas.length)}
          </p>
        </div>
      ) : null}

      <div className={completo ? "relative min-h-0 flex-1" : "relative h-72 w-full"}>
        <MapContainer
          center={puntosEncuadre[0] ?? [...PAIS_DE_OPERACION.centroMapa]}
          zoom={13}
          scrollWheelZoom={false}
          // `react-leaflet` fija la clase al montar y no la vuelve a leer: el tamaño lo manda el
          // envoltorio de arriba, que sí cambia con la pantalla completa.
          className="h-full w-full rounded-xl"
          // Leaflet pinta encima de otros elementos si no se acota el z-index del panel.
          style={{ zIndex: 0 }}
        >
          <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} />

          {lineaRuta.length >= 2 ? (
            <Polyline
              positions={lineaRuta}
              pathOptions={{
                color: "#2563eb",
                weight: 4,
                // El resto de la ruta se atenúa cuando hay un tramo destacado: si los dos se
                // pintaran igual de fuertes, resaltar no resaltaría nada.
                ...(lineaTramo.length >= 2 ? { opacity: 0.45 } : {}),
                ...(esPorCalles ? {} : { dashArray: "8 8", opacity: 0.75 }),
              }}
            />
          ) : null}

          {/* Tramo a la SIGUIENTE parada, encima del resto. Va después en el JSX a propósito:
              Leaflet apila por orden de montaje, así que este queda por encima de la línea
              completa sin tener que pelearse con z-index. */}
          {lineaTramo.length >= 2 ? (
            <Polyline
              positions={lineaTramo}
              pathOptions={{ color: "#111111", weight: 6, opacity: 0.95 }}
            />
          ) : null}

          {origen ? (
            <Marker position={[origen.lat, origen.lng]} icon={iconoOrigen()}>
              <Tooltip>Tu ubicación de partida</Tooltip>
            </Marker>
          ) : null}

          {paradas.map((p) => {
            const esActiva = p.id === activaId;
            return (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={iconoParada(esActiva ? "siguiente" : "pendiente", p.secuencia)}
                // La activa por encima de las demás: si dos paradas se tocan, la amarilla se ve.
                zIndexOffset={esActiva ? 1000 : 0}
                eventHandlers={{ click: () => onSeleccionarParada?.(p.id) }}
              >
                <Tooltip>{p.etiqueta}</Tooltip>
              </Marker>
            );
          })}

          <AjustarEncuadre puntos={puntosEncuadre} />
          <SeguirTamano completo={completo} />
          <CentrarEnActiva punto={puntoActivo} />
          {completo ? <BotonCentrar origen={origen} /> : null}
        </MapContainer>
      </div>

      <div className={completo ? "border-t bg-background px-4 py-2" : undefined}>
        <LeyendaMapa />
      </div>

      {/* SLT-192 (R885, R886): la nota va bajo la leyenda y encima de los botones del pie; a
          pantalla completa no se pinta (el canvas RepartoMapaCompleto no la dibuja). */}
      {completo || !nota ? null : (
        <p data-testid="ruta-mapa-nota" className="text-xs text-muted-foreground">
          {nota}
        </p>
      )}

      {/* SLT-192 (R880, R886): «Ver mapa completo» y «Ocultar mapa» juntos bajo el mapa. */}
      {completo ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="flex-1"
            onClick={() => setCompleto(true)}
          >
            <Maximize2 aria-hidden="true" />
            {VER_MAPA_COMPLETO}
          </Button>
          {onOcultar ? (
            <Button
              type="button"
              variant="ghost"
              size="touch"
              className="flex-1"
              aria-expanded={true}
              onClick={onOcultar}
            >
              <ChevronUp aria-hidden="true" />
              {OCULTAR_MAPA}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
