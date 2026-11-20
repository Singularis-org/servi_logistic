// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";
import { TACTIL_MOVIL } from "@/components/shared/texto-entero";
import { VistaCardsToggle } from "@/app/(app)/mis-asignaciones/_components/VistaCardsToggle";

// SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (A1; R493) — el área táctil de 44 px.
// jsdom no aplica Tailwind: se afirman las clases (`h-11`/`size-11` = 44 px). La medida en el
// navegador la toma el E2E `e2e/pwa-mensajero-base.spec.ts` (`tactil`).

afterEach(cleanup);

function clases(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/);
}

describe("R493 — tamaños táctiles de `Button`", () => {
  it("`size=\"touch\"` mide 44 px de alto (`h-11`) y no hereda el `h-8` por defecto", () => {
    render(<Button size="touch">Gestionar</Button>);
    const c = clases(screen.getByRole("button", { name: "Gestionar" }));
    expect(c).toContain("h-11");
    expect(c).not.toContain("h-8");
  });

  it("`size=\"icon-touch\"` mide 44 × 44 px (`size-11`)", () => {
    render(
      <Button size="icon-touch" aria-label="Cerrar">
        x
      </Button>,
    );
    const c = clases(screen.getByRole("button", { name: "Cerrar" }));
    expect(c).toContain("size-11");
    expect(c).not.toContain("size-8");
  });

  it("los tamaños de siempre no cambian (`default` sigue en `h-8`)", () => {
    render(<Button>Normal</Button>);
    expect(clases(screen.getByRole("button", { name: "Normal" }))).toContain("h-8");
  });

  it("`TACTIL_MOVIL` da 44 × 44 px solo en móvil", () => {
    expect(TACTIL_MOVIL.split(" ").sort()).toEqual(["max-md:min-h-11", "max-md:min-w-11"]);
  });
});

describe("R493 — conmutador Mosaico / Detalle a 44 px", () => {
  it("en móvil sus dos botones miden 44 px de alto (`max-md:[&>button]:h-11` en el grupo); en escritorio, los de hoy", () => {
    render(<VistaCardsToggle vista="mosaico" onVistaChange={vi.fn()} />);
    const grupo = screen.getByRole("group", { name: "Vista de las órdenes" });
    expect(clases(grupo)).toContain("max-md:[&>button]:h-11");
    // Sin variante sin prefijo: en escritorio (y en `/novedades`) el alto no cambia.
    expect(clases(grupo)).not.toContain("[&>button]:h-11");
    // Los dos botones son hijos DIRECTOS del grupo: si no, el selector `>button` no los alcanza.
    for (const nombre of ["Mosaico", "Detalle"]) {
      expect(screen.getByRole("button", { name: nombre }).parentElement).toBe(grupo);
    }
  });
});
