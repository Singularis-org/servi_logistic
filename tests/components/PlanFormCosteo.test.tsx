// @vitest-environment jsdom
// SLT-66 (design §6.1; R5, R9, R23) — el formulario del plan sin tope de maestro, con «Costo base» y con
// el campo «Costo por orden». Se mide lo que sale hacia la action inyectada y lo que se pinta.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { PlanDTO, PlanResult } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };

const PLAN: PlanDTO = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000.00", anual: null },
  costoPorOrden: "100.00",
  archivado: false,
};

afterEach(() => cleanup());

function montarCrear(enviar = vi.fn().mockResolvedValue(OK)) {
  render(<PlanForm modo="crear" empresas={[]} enviar={enviar} onGuardado={vi.fn()} />);
  return enviar;
}

describe("SLT-66 R5 — sin tope de maestro", () => {
  it("R5: no hay ningún campo del rol Maestro", () => {
    montarCrear();
    expect(screen.queryByLabelText(/Maestro/)).toBeNull();
    expect(screen.queryByText(/Maestro/)).toBeNull();
    // Control de no vacuidad: los demás topes por rol sí están.
    expect(screen.getByLabelText("Usuarios activos con el rol Mensajero")).toBeInTheDocument();
  });
});

describe("SLT-66 R9 — «Costo base»", () => {
  it("R9: el grupo se llama «Costo base» y el campo mensual «Costo base mensual»", async () => {
    const user = userEvent.setup();
    montarCrear();

    const grupo = screen.getByRole("radiogroup", { name: "Costo base" });
    expect(within(grupo).getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByText("Precio informativo")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Con monto" }));
    expect(screen.getByLabelText("Costo base mensual")).toBeInTheDocument();
  });
});

describe("SLT-66 R23 — «Costo por orden»", () => {
  it("R23: el campo existe con su ayuda, fuera del grupo «Costo base», y vacío envía null", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();

    const campo = screen.getByLabelText("Costo por orden");
    expect(campo).toHaveAccessibleDescription("Vacío: se aplica el valor global de la plataforma.");
    // Independiente de la forma de la base (R7): se ve también con «Sin precio».
    expect(within(screen.getByRole("radiogroup", { name: "Costo base" })).queryByLabelText("Costo por orden")).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toMatchObject({ precio: { tipo: "sin_precio" }, costoPorOrden: null });
  });

  it("R23: lo escrito se envía como texto, con cualquier forma de la base", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Por orden");
    await user.click(screen.getByRole("radio", { name: "Negociable" }));
    await user.type(screen.getByLabelText("Costo por orden"), "100.50");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toMatchObject({ precio: { tipo: "negociable" }, costoPorOrden: "100.50" });
    expect(typeof enviar.mock.calls[0][0].costoPorOrden).toBe("string");
  });

  it("R23: al editar precarga el costo del plan sin «.00»", () => {
    render(<PlanForm modo="editar" plan={PLAN} enviar={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByLabelText("Costo por orden")).toHaveValue("100");
    expect(screen.getByLabelText("Costo base mensual")).toHaveValue("50000");
  });

  it("R23: el validation_error de costoPorOrden sale junto al campo y conserva lo escrito", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: { costoPorOrden: ["Importe inválido."] },
    } satisfies PlanResult);
    const onGuardado = vi.fn();
    render(<PlanForm modo="editar" plan={PLAN} enviar={enviar} onGuardado={onGuardado} />);

    const campo = screen.getByLabelText("Costo por orden");
    await user.clear(campo);
    await user.type(campo, "7");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    const ids = campo.getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain("Importe inválido.");
    // No se repite en el aviso general: tiene su campo.
    expect(screen.getAllByText("Importe inválido.")).toHaveLength(1);
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo).toHaveValue("7");
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it("R23: un costo inválido no llega a la action (el mismo esquema que la action)", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Mal");
    await user.type(screen.getByLabelText("Costo por orden"), "1.234");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(screen.getByLabelText("Costo por orden")).toHaveAttribute("aria-invalid", "true"));
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Costo por orden")).toHaveValue("1.234");
  });
});
