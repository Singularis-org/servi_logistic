// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Feature 265 (R43) — LA TERCERA SEÑAL, LA QUE NO ES UN TEXTO.
//
// El mensajero tiene tres avisos distintos y el diseño exige que sigan siendo tres (R43):
//
//   1. «el punto de partida es aproximado»  -> un `<p>`  (feature 92)
//   2. «el orden de las paradas es aproximado» -> un `Alert` (feature 265)
//   3. el DIBUJO no sigue calles -> una LÍNEA PUNTEADA en el mapa (feature 97)
//
// Las dos primeras son texto y `RepartoModule.test.tsx` las afirma sobre el DOM. La tercera
// NO es texto, y hasta hoy sólo se afirmaba a medio camino: aquel test comprueba que el
// trazado con `fuente: "local"` llega a las **props** de `RutaMapa`, y ahí se paraba. Quien
// convierte esas props en la línea punteada es ESTE componente, y `dashArray` aparecía en un
// único sitio de todo el repo (`RutaMapaInner.tsx`) SIN QUE NINGÚN TEST LO TOCARA — hallazgo
// **m3** de `progress/review_265.md`. Borrar `dashArray` dejaba la suite entera en verde y al
// mensajero con una línea recta continua que le dice «esto es un recorrido navegable» cuando
// no lo es. Es exactamente el fallo mudo que esta casa persigue: no rompe nada, sólo miente.
//
// Se prueba el INNER, no el wrapper: el wrapper lo carga con `next/dynamic({ ssr: false })`
// —Leaflet toca `window` en el ámbito del módulo— y quien decide el estilo de la línea es el
// inner. Molde del mock: `tests/components/UbicacionMapa.test.tsx`, que ya resolvió cómo
// montar un componente de react-leaflet en jsdom sin canvas.

// --- Mock de leaflet y react-leaflet (jsdom no pinta canvas ni tiene el `window` de Leaflet).
// `Polyline` es el único que importa aquí: expone sus `pathOptions` como JSON en un atributo
// para poder afirmarlas sobre el DOM renderizado y no sobre el objeto que le pasamos nosotros.
vi.mock("leaflet/dist/leaflet.css", () => ({}));
// SLT-166: la instancia del mapa es UNA y compartida (como la que da `useMap` dentro de un mismo
// `MapContainer`), con espías para lo que el componente le pide: encuadre, tamaño y centrado.
const mapa = vi.hoisted(() => ({
  setView: vi.fn(),
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
  panTo: vi.fn(),
  getZoom: vi.fn(() => 13),
}));
vi.mock("leaflet", () => ({
  default: {
    divIcon: (opts: unknown) => ({ opts }),
    DomEvent: { disableClickPropagation: vi.fn() },
  },
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  // El marcador expone el HTML de su icono y su `click` (Leaflet lo vuelve `role="button"`).
  Marker: ({
    children,
    icon,
    eventHandlers,
  }: {
    children: React.ReactNode;
    icon?: { opts?: { html?: string } };
    eventHandlers?: { click?: () => void };
  }) => (
    <div data-testid="marker" data-html={icon?.opts?.html ?? ""}>
      <button type="button" onClick={() => eventHandlers?.click?.()}>
        tocar marcador
      </button>
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Polyline: ({ pathOptions }: { pathOptions?: Record<string, unknown> }) => (
    <div data-testid="polyline" data-path-options={JSON.stringify(pathOptions ?? {})} />
  ),
  useMap: () => mapa,
}));

import { useState } from "react";

import { RutaMapaInner } from "@/app/(app)/mis-asignaciones/_components/RutaMapaInner";
import { HojaParadaMapa } from "@/app/(app)/mis-asignaciones/_components/HojaParadaMapa";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { codificarPolilinea } from "@/lib/geo/polilinea";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

// Tres puntos reales (San José, CR): la polilínea se CODIFICA con la función del repo en vez
// de pegar una cadena mágica, porque el componente la DECODIFICA y una cadena inventada
// caería por la rama de «polilínea corrupta» sin que el test se enterara.
const POLILINEA = codificarPolilinea([
  { lat: 9.93, lng: -84.09 },
  { lat: 9.94, lng: -84.1 },
  { lat: 9.95, lng: -84.11 },
]);

const PARADAS = [
  { id: "o1", secuencia: 1, lat: 9.93, lng: -84.09, etiqueta: "REM-1 · Uno" },
  { id: "o2", secuencia: 2, lat: 9.95, lng: -84.11, etiqueta: "REM-2 · Dos" },
];

/** `pathOptions` de la línea de la RUTA (la primera `Polyline` montada). */
function opcionesDeLaRuta(container: HTMLElement): Record<string, unknown> {
  const linea = container.querySelectorAll('[data-testid="polyline"]')[0];
  expect(linea, "el mapa tiene que pintar la línea de la ruta").toBeDefined();
  return JSON.parse(linea!.getAttribute("data-path-options") ?? "{}") as Record<string, unknown>;
}

describe("265/R43 — la tercera señal: el trazado LOCAL se dibuja PUNTEADO", () => {
  it("`fuente: local` -> la línea lleva dashArray (no es un recorrido navegable)", () => {
    const { container } = render(
      <RutaMapaInner
        paradas={PARADAS}
        origen={{ lat: 9.92, lng: -84.08 }}
        trazado={{ encodedPolyline: POLILINEA, fuente: "local" }}
      />,
    );

    const opciones = opcionesDeLaRuta(container);
    // Mata la mutación «borrar el `dashArray`» y la mutación «invertir la condición».
    expect(
      opciones.dashArray,
      "un orden calculado en la app se dibuja punteado: pintarlo continuo le dice al " +
        "mensajero que la línea sigue calles, y no las sigue",
    ).toBe("8 8");
    expect(opciones.opacity).toBe(0.75);
  });

  it("`fuente: routes` -> la línea es CONTINUA (sí sigue calles)", () => {
    const { container } = render(
      <RutaMapaInner
        paradas={PARADAS}
        origen={{ lat: 9.92, lng: -84.08 }}
        trazado={{ encodedPolyline: POLILINEA, fuente: "routes" }}
      />,
    );

    const opciones = opcionesDeLaRuta(container);
    // La mitad negativa: sin ella, puntear SIEMPRE también pasaría el test de arriba, y
    // entonces la señal dejaría de distinguir nada.
    expect(opciones).not.toHaveProperty("dashArray");
    expect(opciones.opacity).toBeUndefined();
  });

  it("SIN trazado (paradas unidas en recto) la línea también va punteada", () => {
    // No hay geometría del proveedor, así que lo que se ve es el orden de visita, no un
    // recorrido. `esPorCalles` es falso y la línea tiene que salir punteada igual.
    const { container } = render(
      <RutaMapaInner paradas={PARADAS} origen={{ lat: 9.92, lng: -84.08 }} trazado={null} />,
    );

    expect(opcionesDeLaRuta(container).dashArray).toBe("8 8");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SLT-166 «PWA del mensajero: mapa de ruta» (R539-R542)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const TRES = [
  { id: "o1", secuencia: 1, lat: 9.93, lng: -84.09, etiqueta: "REM-1 · Uno" },
  { id: "o2", secuencia: 2, lat: 9.95, lng: -84.11, etiqueta: "REM-2 · Dos" },
  { id: "o3", secuencia: 3, lat: 9.96, lng: -84.12, etiqueta: "REM-3 · Tres" },
];

/** El HTML del icono de cada marcador (origen primero, si lo hay), por orden de montaje. */
function htmlDeMarcadores(): string[] {
  return screen.getAllByTestId("marker").map((m) => m.getAttribute("data-html") ?? "");
}

describe("SLT-166 R539 — marcadores con la paleta de la app y leyenda", () => {
  it("la parada activa va amarilla con número negro; las demás negras; el origen dice «Tú»", () => {
    render(<RutaMapaInner paradas={TRES} origen={{ lat: 9.92, lng: -84.08 }} paradaActivaId="o2" />);

    const [origen, uno, dos, tres] = htmlDeMarcadores();
    expect(origen).toContain("Tú");
    // Amarillo Señal de fondo y Negro Servi de número: los valores de `docs/marca.md`.
    expect(dos).toContain("background:var(--color-brand-light)");
    expect(dos).toContain("color:var(--color-brand-dark)");
    for (const otra of [uno, tres]) {
      expect(otra).toContain("background:var(--color-brand-dark)");
      expect(otra).not.toContain("--color-brand-light");
    }
    for (const html of [origen, uno, dos, tres]) expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("sin parada activa, la amarilla es la primera de la ruta", () => {
    render(<RutaMapaInner paradas={[TRES[2]!, TRES[0]!, TRES[1]!]} />);
    const [tres, uno] = htmlDeMarcadores();
    expect(uno).toContain("background:var(--color-brand-light)");
    expect(tres).not.toContain("--color-brand-light");
  });

  it("bajo el mapa, la leyenda «Siguiente · Pendiente · Gestionada · Tú»", () => {
    render(<RutaMapaInner paradas={TRES} />);
    const leyenda = screen.getByRole("list", { name: "Leyenda del mapa" });
    expect(Array.from(leyenda.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "Siguiente",
      "Pendiente",
      "Gestionada",
      "Tú",
    ]);
  });
});

describe("SLT-166 R540 — tocar un marcador avisa de su parada", () => {
  it("el `click` del marcador llama a `onSeleccionarParada` con su id", async () => {
    const user = userEvent.setup();
    const onSeleccionarParada = vi.fn();
    render(<RutaMapaInner paradas={TRES} onSeleccionarParada={onSeleccionarParada} />);

    await user.click(screen.getAllByRole("button", { name: "tocar marcador" })[1]!);

    expect(onSeleccionarParada).toHaveBeenCalledWith("o2");
  });
});

describe("SLT-166 R541 — pantalla completa en el mismo contenedor", () => {
  it("«Ver mapa completo» la abre (fixed inset-0) e `invalidateSize`; «Cerrar» la devuelve", async () => {
    const user = userEvent.setup();
    render(<RutaMapaInner paradas={TRES} origen={{ lat: 9.92, lng: -84.08 }} totalParadas={5} />);
    const contenedor = screen.getByTestId("ruta-mapa");
    expect(contenedor).toHaveAttribute("data-completo", "false");
    expect(contenedor.className).not.toContain("fixed");
    // Fuera de pantalla completa no hay barra ni botón de centrar.
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Centrar en mi ubicación" })).toBeNull();
    mapa.invalidateSize.mockClear();

    await user.click(screen.getByRole("button", { name: "Ver mapa completo" }));

    expect(contenedor).toHaveAttribute("data-completo", "true");
    expect(contenedor.className).toContain("fixed inset-0");
    expect(mapa.invalidateSize).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Mapa de ruta a pantalla completa" })).toBe(contenedor);
    // Tres paradas en el mapa de las cinco de la lista (las otras dos, sin coordenadas: R543).
    expect(screen.getByText("Paradas 3 de 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver mapa completo" })).toBeNull();

    const centrar = screen.getByRole("button", { name: "Centrar en mi ubicación" });
    expect(centrar.className).toContain("size-11");
    await user.click(centrar);
    expect(mapa.setView).toHaveBeenLastCalledWith([9.92, -84.08], 15);

    mapa.invalidateSize.mockClear();
    const cerrar = screen.getByRole("button", { name: "Cerrar" });
    expect(cerrar.className).toContain("h-11");
    await user.click(cerrar);

    expect(contenedor).toHaveAttribute("data-completo", "false");
    expect(contenedor.className).not.toContain("fixed");
    expect(mapa.invalidateSize).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ver mapa completo" })).toBeInTheDocument();
  });

  it("«Ver mapa completo» mide 44 px", () => {
    render(<RutaMapaInner paradas={TRES} />);
    expect(screen.getByRole("button", { name: "Ver mapa completo" }).className).toContain("h-11");
  });
});

describe("SLT-166 R542 — la parada activa centra el mapa", () => {
  it("al cambiar `paradaActivaId` llama a `panTo` con sus coordenadas y la pinta amarilla", () => {
    const { rerender } = render(<RutaMapaInner paradas={TRES} paradaActivaId="o1" />);
    // La entrada es el encuadre de todas: no salta a la primera.
    expect(mapa.panTo).not.toHaveBeenCalled();

    rerender(<RutaMapaInner paradas={TRES} paradaActivaId="o3" />);

    expect(mapa.panTo).toHaveBeenCalledWith([9.96, -84.12]);
    const [, , tres] = htmlDeMarcadores();
    expect(tres).toContain("background:var(--color-brand-light)");
  });
});

describe("SLT-166 (review m4) — Escape con la hoja abierta sobre la pantalla completa", () => {
  const ORDEN = {
    id: "o2",
    numGuia: 1002,
    numRemision: "REM-2",
    estatusValue: "en_reparto",
    destinatario: "Dos",
    telefonoDest: "88880000",
    direccion: "Calle 2",
    producto: "Caja",
    peso: 1,
    montoCobrar: 1000,
    latitud: 9.95,
    longitud: -84.11,
    notas: null,
    tiendaNombre: "Tienda",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular",
    secuenciaRuta: 2,
  } as MiAsignacionDTO;

  /** El mapa y su hoja montados juntos, como en `RepartoModule`. */
  function MapaConHoja() {
    const [hoja, setHoja] = useState<string | null>(null);
    return (
      <>
        <RutaMapaInner paradas={TRES} onSeleccionarParada={setHoja} />
        <HojaParadaMapa
          orden={hoja === null ? null : ORDEN}
          total={3}
          onOpenChange={(abierta) => {
            if (!abierta) setHoja(null);
          }}
          gestionarDeshabilitado={false}
          onGestionar={() => setHoja(null)}
        />
      </>
    );
  }

  it("el primer Escape cierra solo la hoja; el segundo, la pantalla completa", async () => {
    const user = userEvent.setup();
    render(<MapaConHoja />);
    await user.click(screen.getByRole("button", { name: "Ver mapa completo" }));
    const contenedor = screen.getByTestId("ruta-mapa");
    await user.click(screen.getAllByRole("button", { name: "tocar marcador" })[1]!);
    expect(screen.getByRole("dialog", { name: "Parada 2 de 3" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Parada 2 de 3" })).toBeNull());
    expect(contenedor).toHaveAttribute("data-completo", "true");

    await user.keyboard("{Escape}");

    expect(contenedor).toHaveAttribute("data-completo", "false");
  });
});
