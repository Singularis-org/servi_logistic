// @vitest-environment jsdom
// SLT-118 (design §3.2, §8; R35) — el selector «Facturación de órdenes» del formulario del plan: quincenal al
// crear (P14), el del plan al editar, siempre en la petición y con su error de campo junto a él.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { PlanDTO, PlanResult } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const RANGO = { hoy: "2026-11-10", min: "2026-10-10", max: "2026-12-10" };
const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };

const PLAN: PlanDTO = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" },
  costoPorOrden: null,
  costoPorOrdenPorcentual: null,
  periodicidadOrdenes: "mensual",
  archivado: false,
};

afterEach(() => cleanup());

function montarCrear(enviar = vi.fn().mockResolvedValue(OK)) {
  render(
    <PlanForm
      modo="crear"
      empresas={[]}
      inicioCicloPorDefecto="2026-11-11"
      rangoInicioCiclo={RANGO}
      rangoFechaDeEfecto={RANGO}
      enviar={enviar}
      previsualizar={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
      onGuardado={vi.fn()}
    />,
  );
  return { enviar };
}

function montarEditar(plan: PlanDTO = PLAN, enviar = vi.fn().mockResolvedValue(OK)) {
  render(<PlanForm modo="editar" plan={plan} enviar={enviar} onGuardado={vi.fn()} />);
  return { enviar };
}

const grupo = () => screen.getByRole("radiogroup", { name: "Facturación de órdenes" });

describe("SLT-118 R35 — «Facturación de órdenes» en el formulario del plan", () => {
  it("R35: ofrece «Quincenal» y «Mensual», con quincenal marcada al crear", () => {
    montarCrear();
    expect(within(grupo()).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Quincenal",
      "Mensual",
    ]);
    expect(within(grupo()).getByRole("radio", { name: "Quincenal" })).toBeChecked();
  });

  it("R35: al crear manda quincenal si no se toca y la elegida si se cambia", async () => {
    const user = userEvent.setup();
    const { enviar } = montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Plan Norte");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].periodicidadOrdenes).toBe("quincenal");

    await user.click(within(grupo()).getByRole("radio", { name: "Mensual" }));
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(2));
    expect(enviar.mock.calls[1]![0].periodicidadOrdenes).toBe("mensual");
  });

  it("R35: al editar marca la del plan y la manda aunque no se toque", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();
    expect(within(grupo()).getByRole("radio", { name: "Mensual" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).toMatchObject({ planId: PLAN_ID, periodicidadOrdenes: "mensual" });
  });

  it("R35: al editar un plan sin periodicidad en el DTO marca quincenal y manda la elegida", async () => {
    const user = userEvent.setup();
    const sinPeriodicidad: PlanDTO = { ...PLAN };
    delete sinPeriodicidad.periodicidadOrdenes;
    const { enviar } = montarEditar(sinPeriodicidad);
    expect(within(grupo()).getByRole("radio", { name: "Quincenal" })).toBeChecked();
    await user.click(within(grupo()).getByRole("radio", { name: "Mensual" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].periodicidadOrdenes).toBe("mensual");
  });

  it("R35: el error de campo `periodicidadOrdenes` de la action se pinta junto al selector y se lleva el foco", async () => {
    const user = userEvent.setup();
    const mensaje = "Hay empresas con tipo de cobro quincenal en este plan.";
    const enviar = vi.fn().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: { periodicidadOrdenes: [mensaje] },
    } satisfies PlanResult);
    montarEditar(PLAN, enviar);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // Va junto a su campo (su `FieldError`, enlazado por `aria-describedby`), no al aviso general.
    const error = (await screen.findByText(mensaje)).closest<HTMLElement>('[role="alert"]');
    expect(error?.id).toBeTruthy();
    const g = grupo();
    expect(g).toHaveAttribute("aria-invalid", "true");
    expect((g.getAttribute("aria-describedby") ?? "").split(" ")).toContain(error!.id);
    await waitFor(() => expect(g.contains(document.activeElement)).toBe(true));
  });
});
