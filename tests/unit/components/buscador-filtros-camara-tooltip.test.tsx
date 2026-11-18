// @vitest-environment jsdom
// SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview», punto 7 (pedido de
// Carlos, 2026-11-18): el botón de cámara del buscador compartido (`BuscadorFiltros` con `escaneo`)
// lleva un tooltip que dice qué hace: «Buscar escaneando la guía» (la cámara lee el código y filtra
// la lista; no cambia nada). Mismo patrón que `ContactoButtons`: el disparador es el botón y el
// `aria-label` se conserva letra por letra.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ordenes",
  useSearchParams: () => new URLSearchParams(""),
}));

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";

afterEach(cleanup);

describe("SLT-200 — tooltip del botón de cámara del buscador", () => {
  // Por FOCO y no por hover: el hover de base-ui no se activa en jsdom (ver `ContactoButtons.test`).
  it("al enfocar la cámara sale «Buscar escaneando la guía»", async () => {
    render(<BuscadorFiltros onChange={vi.fn()} leerDeUrl={false} escaneo />);
    expect(screen.queryByText("Buscar escaneando la guía")).toBeNull();

    fireEvent.focus(screen.getByRole("button", { name: "Escanear con cámara" }));

    expect(await screen.findByText("Buscar escaneando la guía")).toBeInTheDocument();
  });

  it("el tooltip no reemplaza el nombre accesible del botón", () => {
    render(<BuscadorFiltros onChange={vi.fn()} leerDeUrl={false} escaneo />);
    const camara = screen.getByRole("button", { name: "Escanear con cámara" });
    expect(camara).toHaveAttribute("aria-label", "Escanear con cámara");
  });

  it("sin `escaneo` no hay cámara ni tooltip", () => {
    render(<BuscadorFiltros onChange={vi.fn()} leerDeUrl={false} />);
    expect(screen.queryByRole("button", { name: "Escanear con cámara" })).toBeNull();
    fireEvent.focus(screen.getByRole("searchbox"));
    expect(screen.queryByText("Buscar escaneando la guía")).toBeNull();
  });
});
