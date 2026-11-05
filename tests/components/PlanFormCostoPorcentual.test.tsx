// @vitest-environment jsdom
// SLT-83 (design §6.1; R20) — el formulario del plan con el modo del costo por orden: «Fijo» o
// «Porcentual». Se mide lo que sale hacia la action inyectada y lo que se pinta.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { PlanDTO, PlanResult } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };

const PLAN_FIJO: PlanDTO = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000.00", anual: null },
  costoPorOrden: "100.00",
  costoPorOrdenPorcentual: null,
  archivado: false,
};

const PLAN_PORCENTUAL: PlanDTO = {
  ...PLAN_FIJO,
  costoPorOrden: null,
  costoPorOrdenPorcentual: { porcentaje: "2.50", minimo: "500.00" },
};

afterEach(() => cleanup());

function montarCrear(enviar = vi.fn().mockResolvedValue(OK)) {
  render(
    <PlanForm
      modo="crear"
      empresas={[]}
      inicioCicloPorDefecto="2026-10-30"
      rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
      enviar={enviar}
      previsualizar={vi.fn().mockResolvedValue({ estado: "ok", avisos: [], siguienteCiclo: "2026-11-30" })}
      onGuardado={vi.fn()}
    />,
  );
  return enviar;
}

describe("SLT-83 R20 — el modo del costo por orden", () => {
  it("R20: el selector ofrece «Fijo» y «Porcentual»; por defecto «Fijo» con el campo de SLT-66", () => {
    montarCrear();
    const grupo = screen.getByRole("radiogroup", { name: "Cobro por orden" });
    expect(grupo).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fijo" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Porcentual" })).not.toBeChecked();
    expect(screen.getByLabelText("Costo por orden")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Porcentaje" })).toBeNull();
    expect(screen.queryByLabelText("Mínimo")).toBeNull();
  });

  it("R20: con «Porcentual» pide «Porcentaje» (obligatorio, con sufijo %) y «Mínimo» (opcional)", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));

    const porcentaje = screen.getByRole("textbox", { name: "Porcentaje" });
    expect(porcentaje).toHaveAttribute("aria-required", "true");
    expect(porcentaje.parentElement).toHaveTextContent("%");
    expect(screen.getByLabelText("Mínimo")).not.toHaveAttribute("aria-required");
    expect(screen.queryByLabelText("Costo por orden")).toBeNull();
  });

  it("R20: con «Porcentual» envía solo el porcentaje y el mínimo; el fijo viaja null", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Porcentual");
    // Lo escrito en el fijo no viaja si el modo elegido es el porcentual.
    await user.type(screen.getByLabelText("Costo por orden"), "100");
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));
    await user.type(screen.getByRole("textbox", { name: "Porcentaje" }), "2.5");
    await user.type(screen.getByLabelText("Mínimo"), "500");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toMatchObject({
      costoPorOrden: null,
      costoPorOrdenPorcentual: { porcentaje: "2.5", minimo: "500" },
    });
  });

  it("R20: el mínimo vacío viaja como null", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Sin mínimo");
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));
    await user.type(screen.getByRole("textbox", { name: "Porcentaje" }), "3");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toMatchObject({
      costoPorOrden: null,
      costoPorOrdenPorcentual: { porcentaje: "3", minimo: null },
    });
  });

  it("R20: con «Fijo» el porcentual viaja null aunque se haya escrito", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Fijo");
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));
    await user.type(screen.getByRole("textbox", { name: "Porcentaje" }), "2");
    await user.click(screen.getByRole("radio", { name: "Fijo" }));
    await user.type(screen.getByLabelText("Costo por orden"), "150");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toMatchObject({ costoPorOrden: "150", costoPorOrdenPorcentual: null });
  });

  it("R20: cambiar de modo no borra lo escrito en el otro", async () => {
    const user = userEvent.setup();
    montarCrear();

    await user.type(screen.getByLabelText("Costo por orden"), "100");
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));
    await user.type(screen.getByRole("textbox", { name: "Porcentaje" }), "2");
    await user.type(screen.getByLabelText("Mínimo"), "500");
    await user.click(screen.getByRole("radio", { name: "Fijo" }));
    expect(screen.getByLabelText("Costo por orden")).toHaveValue("100");
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));
    expect(screen.getByRole("textbox", { name: "Porcentaje" })).toHaveValue("2");
    expect(screen.getByLabelText("Mínimo")).toHaveValue("500");
  });

  it("R20: al editar un plan porcentual abre en «Porcentual» con sus valores", () => {
    render(<PlanForm modo="editar" plan={PLAN_PORCENTUAL} enviar={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Porcentual" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Porcentaje" })).toHaveValue("2.50");
    expect(screen.getByLabelText("Mínimo")).toHaveValue("500");
  });

  it("R20: al editar un plan fijo abre en «Fijo»", () => {
    render(<PlanForm modo="editar" plan={PLAN_FIJO} enviar={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Fijo" })).toBeChecked();
    expect(screen.getByLabelText("Costo por orden")).toHaveValue("100");
  });

  it("R20: un porcentaje inválido no llega a la action y el error sale junto al campo", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Mal");
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));
    await user.type(screen.getByRole("textbox", { name: "Porcentaje" }), "100.01");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    const campo = screen.getByRole("textbox", { name: "Porcentaje" });
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(enviar).not.toHaveBeenCalled();
    expect(campo).toHaveValue("100.01");
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it("R20: el validation_error de la action en .porcentaje y .minimo sale junto a cada campo y conserva lo escrito", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: {
        "costoPorOrdenPorcentual.porcentaje": ["Porcentaje inválido."],
        "costoPorOrdenPorcentual.minimo": ["Mínimo inválido."],
      },
    } satisfies PlanResult);
    const onGuardado = vi.fn();
    render(<PlanForm modo="editar" plan={PLAN_PORCENTUAL} enviar={enviar} onGuardado={onGuardado} />);

    const porcentaje = screen.getByRole("textbox", { name: "Porcentaje" });
    const minimo = screen.getByLabelText("Mínimo");
    await user.clear(porcentaje);
    await user.type(porcentaje, "3");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(porcentaje).toHaveAttribute("aria-invalid", "true"));
    expect(minimo).toHaveAttribute("aria-invalid", "true");
    const textos = (el: HTMLElement) =>
      el.getAttribute("aria-describedby")!.split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(textos(porcentaje)).toContain("Porcentaje inválido.");
    expect(textos(minimo)).toContain("Mínimo inválido.");
    // No se repiten en el aviso general: tienen su campo.
    expect(screen.getAllByText("Porcentaje inválido.")).toHaveLength(1);
    expect(screen.getAllByText("Mínimo inválido.")).toHaveLength(1);
    await waitFor(() => expect(porcentaje).toHaveFocus());
    expect(porcentaje).toHaveValue("3");
    expect(minimo).toHaveValue("500");
    expect(onGuardado).not.toHaveBeenCalled();
  });
});
