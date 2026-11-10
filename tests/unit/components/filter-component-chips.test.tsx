// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.1, S3-4, R84, R89) — la prop ADITIVA
// `presentacion: "pastillas"` del `single` de `FilterComponent` y el `tono` de una opción. Sin la
// prop el `single` sigue siendo el `Select` de siempre.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { FilterComponent, type FilterDef } from "@/components/shared/FilterComponent";

afterEach(cleanup);

const OPCIONES = [
  { value: "todas", label: "Todas 4" },
  { value: "entregado", label: "Entregado 2" },
  { value: "reprogramado", label: "Reprogramado 0" },
  { value: "novedad", label: "Novedad 0" },
  { value: "devolucion_a_origen_por_rechazo", label: "Devolución a origen por rechazo 1" },
  { value: "incidente", label: "Incidente 1" },
  { value: "con_senales", label: "Con señales 3", tono: "aviso" as const },
];

function montar(presentacion?: FilterDef["presentacion"]) {
  const onChange = vi.fn();
  render(
    <FilterComponent
      leerDeUrl={false}
      debounceMs={0}
      onChange={onChange}
      filters={[{ key: "resultado", label: "Filtrar por resultado", kind: "single", presentacion, options: OPCIONES }]}
    />,
  );
  return onChange;
}

function pulsadas(): string[] {
  const grupo = screen.getByRole("group", { name: "Filtrar por resultado" });
  return within(grupo)
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent ?? "");
}

describe("SLT-101 — `presentacion: \"pastillas\"` en el `single`", () => {
  it("un grupo con nombre y un botón por opción, todos a la vista, en orden", () => {
    montar("pastillas");
    const grupo = screen.getByRole("group", { name: "Filtrar por resultado" });
    expect(within(grupo).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Todas 4",
      "Entregado 2",
      "Reprogramado 0",
      "Novedad 0",
      "Devolución a origen por rechazo 1",
      "Incidente 1",
      "Con señales 3",
    ]);
  });

  it("sin selección, la primera opción está activa; no emite al montar", () => {
    const onChange = montar("pastillas");
    expect(pulsadas()).toEqual(["Todas 4"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("elegir una emite `[valor]` y sustituye a la anterior (excluyentes)", async () => {
    const onChange = montar("pastillas");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Entregado 2" }));
    expect(onChange).toHaveBeenLastCalledWith({ resultado: ["entregado"] });
    expect(pulsadas()).toEqual(["Entregado 2"]);
    await user.click(screen.getByRole("button", { name: "Con señales 3" }));
    expect(onChange).toHaveBeenLastCalledWith({ resultado: ["con_senales"] });
    expect(pulsadas()).toEqual(["Con señales 3"]);
  });

  it("`tono: \"aviso\"` pinta la opción con borde y texto de aviso; las demás no", () => {
    montar("pastillas");
    expect(screen.getByRole("button", { name: "Con señales 3" }).className).toMatch(/text-warning-strong/);
    expect(screen.getByRole("button", { name: "Entregado 2" }).className).not.toMatch(/text-warning-strong/);
  });

  it("sin `presentacion`: el `Select` de siempre, sin grupo de botones", () => {
    montar();
    expect(screen.queryByRole("group", { name: "Filtrar por resultado" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filtrar por resultado" })).toBeInTheDocument();
  });
});
