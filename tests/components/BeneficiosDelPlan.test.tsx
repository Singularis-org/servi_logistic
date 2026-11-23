// @vitest-environment jsdom
// SLT-214 (design §4.2; R5, R21) — la lista compartida de beneficios: el ícono decorativo junto al texto, el plegado
// a 3 con «Mostrar más» / «Mostrar menos» y el «Sin beneficios» opcional.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IconoDeBeneficio, ListaDeBeneficios } from "@/components/shared/planes/BeneficiosDelPlan";
import { ICONOS_DE_BENEFICIO, type Beneficio } from "@/lib/planes/beneficios";

afterEach(cleanup);

const CINCO: Beneficio[] = [
  { icono: "soporte", texto: "Soporte prioritario" },
  { icono: "reloj_24h", texto: "Atención 24 h" },
  { icono: "rayo", texto: "Acceso anticipado" },
  { icono: "camion", texto: "Envíos sin tope" },
  { icono: "corazon", texto: "Acompañamiento" },
];

function textosVisibles(): string[] {
  return within(screen.getByRole("list", { name: "Beneficios" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent ?? "");
}

describe("ListaDeBeneficios", () => {
  it("R5: cada beneficio lleva su ícono aria-hidden y el texto visible", () => {
    render(<ListaDeBeneficios beneficios={CINCO.slice(0, 2)} />);
    const items = within(screen.getByRole("list", { name: "Beneficios" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("Soporte prioritario");
    const svg = items[0].querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("data-icono")).toBe("soporte");
    expect(items[1].querySelector("svg")?.getAttribute("data-icono")).toBe("reloj_24h");
  });

  it("R5: los 12 íconos del catálogo se pintan, todos decorativos", () => {
    const { container } = render(
      <>
        {ICONOS_DE_BENEFICIO.map((icono) => (
          <IconoDeBeneficio key={icono} icono={icono} />
        ))}
      </>,
    );
    const svgs = Array.from(container.querySelectorAll("svg"));
    expect(svgs.map((s) => s.getAttribute("data-icono"))).toEqual([...ICONOS_DE_BENEFICIO]);
    expect(svgs.every((s) => s.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("R21: con 3 beneficios o menos no hay botón", () => {
    render(<ListaDeBeneficios beneficios={CINCO.slice(0, 3)} plegable={3} />);
    expect(textosVisibles()).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("R21: con 5, se ven 3 y «Mostrar más» despliega y «Mostrar menos» pliega", async () => {
    const user = userEvent.setup();
    render(<ListaDeBeneficios beneficios={CINCO} plegable={3} />);

    expect(textosVisibles()).toEqual(["Soporte prioritario", "Atención 24 h", "Acceso anticipado"]);
    const mas = screen.getByRole("button", { name: "Mostrar más" });
    expect(mas.getAttribute("aria-expanded")).toBe("false");
    expect(mas.getAttribute("aria-controls")).toBe(screen.getByRole("list", { name: "Beneficios" }).id);

    await user.click(mas);
    expect(textosVisibles()).toEqual(CINCO.map((b) => b.texto));
    const menos = screen.getByRole("button", { name: "Mostrar menos" });
    expect(menos.getAttribute("aria-expanded")).toBe("true");

    await user.click(menos);
    expect(textosVisibles()).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Mostrar más" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("R21: cada lista se despliega por su cuenta", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ListaDeBeneficios beneficios={CINCO} plegable={3} />
        <ListaDeBeneficios beneficios={CINCO} plegable={3} />
      </>,
    );
    const [primero] = screen.getAllByRole("button", { name: "Mostrar más" });
    await user.click(primero);
    expect(screen.getAllByRole("button", { name: "Mostrar más" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Mostrar menos" })).toHaveLength(1);
  });

  it("sin plegable se ven todos", () => {
    render(<ListaDeBeneficios beneficios={CINCO} />);
    expect(textosVisibles()).toHaveLength(5);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sin beneficios pinta «Sin beneficios» si se pide, y nada si no", () => {
    const { container, rerender } = render(<ListaDeBeneficios beneficios={[]} vacio="Sin beneficios" />);
    expect(screen.getByText("Sin beneficios")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();

    rerender(<ListaDeBeneficios beneficios={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
