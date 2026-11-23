// @vitest-environment jsdom
// SLT-190 «Recoger y Recolección según el canvas» (R855, R856, R858, DS3) — las tarjetas de Recoger
// y Recolección se numeran por su POSICIÓN en la lista visible, que no es una parada de la ruta:
// nombre accesible «Orden {n} de {total}», sin «Parada», «Sin posición» ni «Pendiente de optimizar».
// Sin la prop, y en Reparto (`mostrarRuta`), la parada sigue como hoy.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// El modal de ubicación arrastra Leaflet vía `next/dynamic`; irrelevante aquí.
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "R-2026-0051",
    estatusValue: "mensajero_recogiendo_en_bodega",
    destinatario: "Ana Rojas",
    telefonoDest: "70001111",
    direccion: "Barrio Escalante",
    producto: "Caja",
    peso: 0.8,
    montoCobrar: 15000,
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
    // Fuera de Reparto es siempre `null` (`IMisAsignacionesService.ts`): la posición NO sale de aquí.
    secuenciaRuta: null,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

const norm = (texto: string | null) => (texto ?? "").replace(/\s/g, " ");

afterEach(cleanup);

describe("SLT-190 R855/R856 — Mosaico numerado por posición", () => {
  it("R855: el número a la izquierda de la remisión y «{posición} de {total} · {peso}» debajo", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={2} mostrarRuta={false} posicion={1} />);
    const card = screen.getByRole("article");
    const numero = within(card).getByText("Orden 1 de 2");
    const remision = within(card).getByText("R-2026-0051");
    // El número va ANTES de la remisión en el orden del documento (a su izquierda).
    expect(numero.compareDocumentPosition(remision) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const linea = remision.nextElementSibling;
    expect(norm(linea?.textContent ?? null)).toMatch(/^1 de 2 · 0.8 kg$/);
  });

  it("R856: nombre accesible «Orden {n} de {total}», sin «Parada», «Sin posición» ni «Pendiente de optimizar»", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={5} mostrarRuta={false} posicion={3} />);
    const card = screen.getByRole("article");
    expect(within(card).getByText("Orden 3 de 5")).toHaveClass("sr-only");
    expect(card.textContent).not.toMatch(/Parada|Sin posición|Pendiente de optimizar/);
  });

  it("R855: la posición sale de la prop, no de `secuenciaRuta` (mutación: volver a la ruta)", () => {
    render(
      <PosOrderCardMosaico
        orden={makeOrden({ secuenciaRuta: 7 })}
        total={4}
        mostrarRuta={false}
        posicion={2}
      />,
    );
    expect(screen.getByText("Orden 2 de 4")).toBeInTheDocument();
    expect(screen.queryByText("Orden 7 de 4")).toBeNull();
    expect(screen.getByRole("article").textContent).not.toContain("7 de 4");
  });

  it("sin la prop, Mosaico sin ruta no pinta número (como hoy)", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={2} mostrarRuta={false} />);
    expect(screen.queryByText(/^Orden \d+ de \d+$/)).toBeNull();
    expect(norm(screen.getByText("R-2026-0051").nextElementSibling?.textContent ?? null)).toBe("0.8 kg");
  });
});

describe("SLT-190 R855/R856 — Detalle numerado por posición", () => {
  it("R855/R856: la fila compacta lleva el número antes de la remisión, con su nombre accesible", () => {
    render(
      <PosOrderCardDetalle orden={makeOrden()} total={3} mostrarRuta={false} posicion={2} compacta />,
    );
    const fila = screen.getByRole("button", { expanded: false });
    const numero = within(fila).getByText("Orden 2 de 3");
    expect(numero).toHaveClass("sr-only");
    const remision = within(fila).getByText("R-2026-0051");
    expect(numero.compareDocumentPosition(remision) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(fila.textContent).not.toMatch(/Parada|Sin posición|Pendiente de optimizar/);
  });

  it("R855: también en la fila no compacta", () => {
    render(<PosOrderCardDetalle orden={makeOrden()} total={3} mostrarRuta={false} posicion={3} />);
    expect(screen.getByText("Orden 3 de 3")).toBeInTheDocument();
  });
});

describe("SLT-190 R858 — Reparto no cambia", () => {
  it("con `mostrarRuta`, Mosaico sigue con la parada y «{n} de {total}» de la ruta, aunque llegue `posicion`", () => {
    render(<PosOrderCardMosaico orden={makeOrden({ secuenciaRuta: 4 })} total={9} posicion={1} />);
    const card = screen.getByRole("article");
    expect(within(card).queryByText("Orden 1 de 9")).toBeNull();
    expect(norm(card.textContent)).toContain("Parada 4 de 9");
  });

  it("con `mostrarRuta` y sin secuencia, «Sin posición» y «Pendiente de optimizar» siguen", () => {
    render(<PosOrderCardMosaico orden={makeOrden()} total={9} />);
    expect(screen.getByText(/Sin posición/)).toBeInTheDocument();
    expect(screen.getByText("Pendiente de optimizar")).toBeInTheDocument();
  });

  it("Detalle compacta de Reparto: «Parada {n} de {total}» intacta", () => {
    render(<PosOrderCardDetalle orden={makeOrden({ secuenciaRuta: 4 })} total={9} compacta posicion={1} />);
    const fila = screen.getByRole("button", { expanded: false });
    expect(within(fila).getByText("Parada 4 de 9")).toBeInTheDocument();
    expect(within(fila).queryByText("Orden 1 de 9")).toBeNull();
  });
});
