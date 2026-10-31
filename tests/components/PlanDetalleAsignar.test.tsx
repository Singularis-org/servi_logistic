// @vitest-environment jsdom
// SLT-66 (design §6.6; R33) — «Asignar a una empresa» desde el detalle del plan: elige la empresa entre
// las candidatas que baja la página y lleva al bloque «Plan» de su detalle con el plan ya elegido. No
// asigna nada. Solo aparece si el plan no está archivado y tiene costo concreto.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { PlanDetalle } from "@/app/(app)/plataforma/planes/[planId]/_components/PlanDetalle";
import type { DetallePlan, PlanDTO } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const NORTE = { id: "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60", nombre: "Envíos Norte" };
const SUR = { id: "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61", nombre: "Reparto Sur" };
const SIN_COSTO_TEXTO = "Para asignarlo, dale costo base mensual y costo por orden.";

const CONCRETO: PlanDTO = {
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

function montar(plan: PlanDTO, empresasCandidatas?: { id: string; nombre: string }[] | null) {
  const detalle: DetallePlan = { plan, empresaNombre: null, pendiente: null, empresas: [], rastro: [] };
  const acciones = { editarPlan: vi.fn(), archivarPlan: vi.fn(), cancelarCambio: vi.fn() };
  render(<PlanDetalle detalle={detalle} {...acciones} empresasCandidatas={empresasCandidatas} />);
  return acciones;
}

const seccion = () => screen.getByRole("region", { name: "Empresas con este plan" });

afterEach(() => cleanup());

describe("SLT-66 R33 — «Asignar a una empresa»", () => {
  it("R33: ofrece las empresas candidatas y lleva a su bloque «Plan» con el plan elegido", async () => {
    const user = userEvent.setup();
    const acciones = montar(CONCRETO, [NORTE, SUR]);

    const s = seccion();
    // Sin empresa elegida, el botón se ve pero no lleva a ningún sitio.
    expect(within(s).getByRole("button", { name: "Asignar a una empresa" })).toBeDisabled();
    expect(within(s).queryByRole("link", { name: "Asignar a una empresa" })).toBeNull();

    await user.click(within(s).getByRole("combobox", { name: "Empresa" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option").map((o) => o.textContent)).toEqual(["Envíos Norte", "Reparto Sur"]);
    await user.click(within(listbox).getByRole("option", { name: "Reparto Sur" }));

    expect(within(s).getByRole("link", { name: "Asignar a una empresa" })).toHaveAttribute(
      "href",
      `/plataforma/empresas/${SUR.id}?plan=${PLAN_ID}#plan`,
    );
    // Elegir no asigna nada: ninguna action del detalle se llama.
    for (const accion of Object.values(acciones)) expect(accion).not.toHaveBeenCalled();
  });

  it("R33: un custom ofrece solo su empresa (la lista que baja la página)", async () => {
    const user = userEvent.setup();
    montar({ ...CONCRETO, visibilidad: "custom", organizacionId: NORTE.id }, [NORTE]);

    await user.click(within(seccion()).getByRole("combobox", { name: "Empresa" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option").map((o) => o.textContent)).toEqual(["Envíos Norte"]);
    await user.click(within(listbox).getByRole("option", { name: "Envíos Norte" }));
    expect(within(seccion()).getByRole("link", { name: "Asignar a una empresa" })).toHaveAttribute(
      "href",
      `/plataforma/empresas/${NORTE.id}?plan=${PLAN_ID}#plan`,
    );
  });

  it("R33: un plan archivado no lo ofrece, ni el texto de «dale costo…»", () => {
    montar({ ...CONCRETO, archivado: true }, [NORTE]);
    expect(screen.queryByText("Asignar a una empresa")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Empresa" })).toBeNull();
    expect(screen.queryByText(SIN_COSTO_TEXTO)).toBeNull();
  });

  it.each<[string, Partial<PlanDTO>]>([
    ["sin costo por orden", { costoPorOrden: null }],
    ["base negociable", { precio: { tipo: "negociable" } }],
    ["base sin precio", { precio: { tipo: "sin_precio" } }],
  ])("R33: %s → «%s» no se ofrece y dice cómo completarlo", (_caso, extra) => {
    montar({ ...CONCRETO, ...extra }, [NORTE]);
    expect(within(seccion()).getByText(SIN_COSTO_TEXTO)).toBeInTheDocument();
    expect(screen.queryByText("Asignar a una empresa")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Empresa" })).toBeNull();
  });

  it("R33: con costo 0.00 y base 0.00 (concretos) sí se ofrece", () => {
    montar({ ...CONCRETO, precio: { tipo: "monto", mensual: "0.00", anual: null }, costoPorOrden: "0.00" }, [NORTE]);
    expect(within(seccion()).getByRole("combobox", { name: "Empresa" })).toBeInTheDocument();
    expect(screen.queryByText(SIN_COSTO_TEXTO)).toBeNull();
  });

  it("R33: sin empresas candidatas no pinta el selector; si no se pudieron leer, lo dice", () => {
    montar(CONCRETO, []);
    expect(screen.queryByRole("combobox", { name: "Empresa" })).toBeNull();
    cleanup();

    montar(CONCRETO, null);
    expect(within(seccion()).getByText("No se pudieron cargar las empresas.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Empresa" })).toBeNull();
  });
});
