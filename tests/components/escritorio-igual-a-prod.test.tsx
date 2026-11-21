// @vitest-environment jsdom
// SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir».
//
// Decisión de Carlos del 2026-11-18: en escritorio (desde `md`) cada control lleva las clases de
// origin/prod; por debajo de `md`, la PWA del mensajero conserva los 44 px de SLT-156 y SLT-193
// (`max-md:`). Enmienda los R que pedían 44 px «en todos los anchos» (SLT-156 design §4, SLT-160
// R771/DC2, SLT-193 R910/R916/R925).
//
// jsdom no aplica Tailwind: se afirman las clases. La medida real (32 px a 1280 y 44 a 360, con la
// barra de Órdenes alineada) es de `e2e/escritorio-igual-a-prod.spec.ts`.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GestionarOrdenCardButton } from "@/app/(app)/mis-asignaciones/_components/GestionarOrdenCardButton";
import { BOTON_TACTIL_MOVIL, ICONO_TACTIL_MOVIL } from "@/components/shared/texto-entero";

afterEach(() => cleanup());

function clases(el: HTMLElement): string[] {
  return el.className.split(/\s+/);
}

describe("SLT-202 · las constantes de 44 px solo en el móvil (contrato literal)", () => {
  it("`BOTON_TACTIL_MOVIL` repite `touch` (h-11, gap-2, px-4, text-sm, icono 4) con `max-md:`", () => {
    expect(BOTON_TACTIL_MOVIL).toBe(
      "max-md:h-11 max-md:gap-2 max-md:px-4 max-md:text-sm max-md:[&_svg:not([class*='size-'])]:size-4",
    );
  });

  it("`ICONO_TACTIL_MOVIL` repite `icon-touch` (44 × 44) con `max-md:`", () => {
    expect(ICONO_TACTIL_MOVIL).toBe("max-md:size-11");
  });
});

describe("SLT-202 · «Gestionar» y su confirmación, como prod en escritorio", () => {
  it("«Gestionar» lleva el `sm` de prod (h-7) y 44 px solo en el móvil", () => {
    render(<GestionarOrdenCardButton numRemision="REM-1" onConfirmar={() => {}} />);
    const boton = clases(screen.getByRole("button", { name: "Gestionar la orden REM-1" }));
    expect(boton).toEqual(expect.arrayContaining(["h-7", "max-md:h-11", "w-fit"]));
    expect(boton).not.toContain("h-11");
  });

  it("«Cancelar» y «Aceptar» llevan el tamaño por defecto (h-8) y el `gap-2` de prod; 44 px en el móvil", async () => {
    const user = userEvent.setup();
    render(<GestionarOrdenCardButton numRemision="REM-1" onConfirmar={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Gestionar la orden REM-1" }));
    const dialogo = await screen.findByRole("dialog");
    for (const nombre of ["Cancelar", "Aceptar"]) {
      const boton = within(dialogo).getByRole("button", { name: nombre });
      expect(clases(boton)).toEqual(expect.arrayContaining(["h-8", "max-md:h-11"]));
      expect(clases(boton)).not.toContain("h-11");
      expect(clases(boton.parentElement as HTMLElement)).toEqual(expect.arrayContaining(["gap-2", "max-md:gap-3"]));
    }
  });
});
