// @vitest-environment jsdom
// SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview» (punto 3) — la tarjeta
// de Mosaico se leía con lupa en el teléfono: guía en mono de 12 px y textos de 9-11 px («Sin
// posición», producto, «Intentos», «COBRAR», «VER DETALLE COMPLETO», chips). Carlos aprobó subirlos:
// lo secundario a 12 px como mínimo (`text-xs`) y lo principal a 14 px (`text-sm`), con las clases
// de la escala que ya usa la PWA. La estructura no cambia.
//
// jsdom no aplica Tailwind: se afirman las clases.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// El modal de ubicación arrastra Leaflet vía `next/dynamic`; irrelevante para los tamaños.
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-QX-7",
    estatusValue: "en_reparto",
    destinatario: "Ana Lucía Vargas",
    telefonoDest: "70001111",
    direccion: "100 m norte de la iglesia",
    producto: "Caja de prueba",
    peso: null,
    montoCobrar: 5000,
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
    secuenciaRuta: null,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

afterEach(cleanup);

const clases = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

/** Tamaños por debajo de 12 px que la tarjeta usaba (9, 10 y 11 px). */
const MENORES_DE_12 = /^(?:[a-z-]+:)*text-\[(?:9px|10px|11px|0\.5625rem|0\.625rem|0\.6875rem)\]$/;

describe("SLT-200 — Mosaico legible en el móvil", () => {
  it("ningún texto de la tarjeta queda por debajo de 12 px", () => {
    const { container } = render(<PosOrderCardMosaico orden={makeOrden()} total={3} />);
    const articulo = container.querySelector("article")!;
    const pequenos = Array.from(articulo.querySelectorAll("*"))
      .filter((el) => clases(el).some((c) => MENORES_DE_12.test(c)))
      .map((el) => `${el.tagName.toLowerCase()} «${(el.textContent ?? "").trim().slice(0, 25)}»`);
    expect(pequenos).toEqual([]);
  });

  it("la guía va a 14 px y no en mono pequeña", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={3} />);
    const guia = screen.getByText("REM-QX-7");
    expect(clases(guia)).toContain("text-sm");
    expect(clases(guia)).not.toContain("font-mono");
    expect(clases(guia)).not.toContain("text-xs");
  });

  it("«Sin posición», producto, «Intentos», «Cobrar» y «Ver detalle completo» van a 12 px como mínimo", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={3} />);
    const sinPosicion = screen.getByText(/Sin posición/);
    const producto = screen.getAllByText("Caja de prueba")[0]!.closest("p")!;
    const intentos = screen.getAllByText(/Intentos/)[0]!.closest("p")!;
    const cobrar = screen.getByText("Cobrar");
    const detalle = screen.getByRole("button", { name: /Ver detalle completo/ });
    for (const el of [sinPosicion, producto, intentos, cobrar, detalle]) {
      expect(clases(el), (el.textContent ?? "").slice(0, 30)).toContain("text-xs");
    }
    // El producto deja la mono: en 12 px se leía peor que la sans del resto de la tarjeta.
    expect(clases(producto)).not.toContain("font-mono");
  });

  it("el destinatario y el monto siguen siendo lo principal, a 14 px", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={3} />);
    expect(clases(screen.getAllByText("Ana Lucía Vargas")[0]!)).toContain("text-sm");
    const monto = screen.getByText("Cobrar").parentElement!.lastElementChild!;
    expect(clases(monto)).toContain("text-sm");
  });
});
