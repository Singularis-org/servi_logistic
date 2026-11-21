// @vitest-environment jsdom
// SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (A3; R490, R492) — las tarjetas POS del
// mensajero (Mosaico, Detalle y el bloque de navegación) muestran ENTEROS destinatario, producto,
// dirección, cantón y distrito: envuelven en varias líneas, sin «…» (en el móvil no hay tooltip). El
// monto a cobrar va en su columna fija, a la derecha, sin partirse.
//
// jsdom no aplica Tailwind: se afirman las clases. La medida en el navegador (sin desborde ni elipsis a
// 360 px) es del E2E `e2e/pwa-mensajero-base.spec.ts`. Los textos largos van escritos a mano.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { PosNavBlock } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// El modal de ubicación arrastra Leaflet vía `next/dynamic`; irrelevante para el recorte.
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));

const DESTINATARIO = "María Fernanda de los Ángeles Rodríguez VillalobosSinEspaciosNiPausasHastaElFinal";
const DIRECCION =
  "Del antiguo Higuerón de San Pedro de Montes de Oca 300 metros al este, 150 metros al norte y 25 metros al oeste, casa esquinera de dos plantas color verde con portón negro y verjas blancas";
const PRODUCTO = "Juego de sartenes antiadherentes de cerámica con mango de madera y tapa de vidrio templado";

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-1",
    estatusValue: "en_reparto",
    destinatario: DESTINATARIO,
    telefonoDest: "70001111",
    direccion: DIRECCION,
    producto: PRODUCTO,
    peso: 1.2,
    montoCobrar: 99999999.99,
    latitud: 9.93,
    longitud: -84.08,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Montes de Oca",
    distritoNombre: "San Pedro",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

afterEach(cleanup);

function clases(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/);
}

/** El elemento que lleva el texto (el más interno cuyo texto es exactamente `texto`). */
function conTexto(texto: string): HTMLElement {
  const hallados = screen.getAllByText((_, el) => {
    if (!el || el.textContent !== texto) return false;
    return !Array.from(el.children).some((h) => h.textContent === texto);
  });
  return hallados[0];
}

/** El texto envuelve y no recorta: él y sus ancestros dentro del `article` sin `truncate`. */
function entero(texto: string) {
  const el = conTexto(texto);
  for (let n: Element | null = el; n && n.tagName !== "BODY"; n = n.parentElement) {
    const c = clases(n);
    expect(c, `«${texto.slice(0, 20)}…» en <${n.tagName}>`).not.toContain("truncate");
    expect(c).not.toContain("text-ellipsis");
    expect(c.some((x) => x.startsWith("line-clamp-"))).toBe(false);
    expect(n.hasAttribute("title")).toBe(false);
  }
  expect(clases(el)).toEqual(expect.arrayContaining(["whitespace-normal", "wrap-anywhere"]));
}

describe("R490 — Mosaico: nada se recorta", () => {
  it("destinatario, producto y dirección enteros, que envuelven", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={1} />);
    entero(DESTINATARIO);
    entero(PRODUCTO);
    entero(DIRECCION);
  });

  it("R492: el monto va en columna fija a la derecha", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={1} />);
    const cobrar = screen.getByText("Cobrar").parentElement as HTMLElement;
    const monto = cobrar.lastElementChild as HTMLElement;
    expect(clases(monto)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap", "tabular-nums", "text-right"]));
  });
});

describe("R490 — Detalle: nada se recorta", () => {
  it("destinatario y ubicación (cantón · distrito — dirección) enteros, que envuelven", () => {
    render(<PosOrderCardDetalle orden={makeOrden()} total={1} />);
    entero(DESTINATARIO);
    entero(`Montes de Oca · San Pedro — ${DIRECCION}`);
  });

  it("R492: el monto va en columna fija a la derecha", () => {
    render(<PosOrderCardDetalle orden={makeOrden()} total={1} />);
    const cobrar = screen.getByText("Cobrar").parentElement as HTMLElement;
    const monto = cobrar.lastElementChild as HTMLElement;
    expect(clases(monto)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap", "tabular-nums", "text-right"]));
  });
});

describe("R490 — bloque de navegación: nada se recorta", () => {
  it("cantón, distrito y dirección enteros, que envuelven", () => {
    render(<PosNavBlock orden={makeOrden()} />);
    entero("Montes de Oca");
    entero("San Pedro");
    entero(DIRECCION);
  });
});
