// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (A4; R495, R496, R493) — `BuscadorFiltros`
// cabe en 312 px y tiene dos props ADITIVAS, apagadas por defecto: `fija` (pegada arriba) y
// `tactil` (controles de 44 px en móvil). Sin ellas, los otros consumidores no cambian.
//
// jsdom no aplica Tailwind: se afirman las CLASES que la producen. La medida real (sin desborde a
// 360 px, 44 px) la toma el E2E `e2e/pwa-mensajero-base.spec.ts`.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/mis-asignaciones/reparto",
  useSearchParams: () => new URLSearchParams(),
}));

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";

afterEach(cleanup);

const FILTROS = [
  { key: "canton", label: "Cantón" },
  { key: "distrito", label: "Distrito" },
];

function clases(el: Element | null): string[] {
  if (!el) throw new Error("sin elemento");
  return (el.getAttribute("class") ?? "").split(/\s+/);
}

/** La raíz de la barra: el primer hijo del contenedor de render. */
function raiz(container: HTMLElement): Element {
  const el = container.firstElementChild;
  if (!el) throw new Error("sin raíz");
  return el;
}

/** El contenedor del campo de búsqueda (el que lleva el mínimo de ancho y el alto). */
function cajaDelCampo(): Element {
  return screen.getByRole("searchbox", { name: "Buscar" }).parentElement as Element;
}

function montar(props: { fija?: boolean; tactil?: boolean } = {}) {
  return render(
    <BuscadorFiltros
      onChange={vi.fn()}
      leerDeUrl={false}
      filtros={FILTROS}
      onLimpiarTodo={vi.fn()}
      hayFiltrosAplicados
      {...props}
    />,
  );
}

describe("R496 — cabe en el ancho útil del móvil", () => {
  it("el campo no tiene mínimo de 250 px en el móvil: solo desde `sm`", () => {
    montar();
    const c = clases(cajaDelCampo());
    expect(c).toContain("min-w-0");
    expect(c).toContain("sm:min-w-[250px]");
    expect(c).not.toContain("min-w-[250px]");
  });

  it("la fila envuelve: si no cabe, «Filtros» baja a la línea siguiente", () => {
    montar();
    const fila = cajaDelCampo().parentElement;
    expect(clases(fila)).toContain("flex-wrap");
  });
});

describe("R496 — `fija`", () => {
  it("con `fija`, la barra queda pegada arriba (`sticky top-0`) con fondo, sobre la lista", () => {
    const { container } = montar({ fija: true });
    const c = clases(raiz(container));
    for (const clase of ["sticky", "top-0", "z-20", "bg-background"]) expect(c).toContain(clase);
  });

  it("sin la prop, la barra no es pegajosa (los otros consumidores no cambian)", () => {
    const { container } = montar();
    const c = clases(raiz(container));
    expect(c).not.toContain("sticky");
    expect(c).not.toContain("top-0");
  });
});

describe("R493 — `tactil`", () => {
  it("con `tactil`, campo, «Filtros» y «Limpiar todo» miden 44 px en móvil (`max-md:h-11`)", () => {
    montar({ tactil: true });
    expect(clases(cajaDelCampo())).toContain("max-md:h-11");
    expect(clases(screen.getByRole("button", { name: /Filtros/ }))).toContain("max-md:h-11");
    expect(clases(screen.getByRole("button", { name: "Limpiar todo" }))).toContain("max-md:h-11");
  });

  it("sin la prop, las clases de hoy: `h-8` y ningún alto táctil", () => {
    montar();
    const campo = clases(cajaDelCampo());
    expect(campo).toContain("h-8");
    expect(campo).not.toContain("max-md:h-11");
    expect(clases(screen.getByRole("button", { name: /Filtros/ }))).not.toContain("max-md:h-11");
    expect(clases(screen.getByRole("button", { name: "Limpiar todo" }))).not.toContain("max-md:h-11");
  });
});
