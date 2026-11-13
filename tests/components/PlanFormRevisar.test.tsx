// @vitest-environment jsdom
// SLT-130 (design §5, §6; R22, R23) — el último paso del formulario de planes. Al crear, «Revisar y crear»
// lista los valores finales del plan; al editar, «Revisar y programar» lista solo lo que cambia como
// «antes → después», más la fila de cuándo rige, o «Sin cambios.». Cada clave va en negrita (`<dt>`).
//
// Se monta el `PlanForm` REAL con las actions como dobles; las filas puras las cubre
// `unit/planes/plan-form-revision.test.ts`.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { CrearPlanInput, EditarPlanInput, PlanDTO, PlanResult } from "@/lib/types/planes";

import { avanzarHasta } from "./plan-form-pasos";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };
const MANANA = "2026-10-30";
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };

const PLAN: PlanDTO = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { mensajero: 5 }, apiKeys: null },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "10.00", descuentos: {} },
  costoPorOrden: null,
  costoPorOrdenPorcentual: null,
  archivado: false,
};

type Crear = (input: CrearPlanInput) => Promise<PlanResult>;
type Editar = (input: EditarPlanInput) => Promise<PlanResult>;

afterEach(() => cleanup());

function montarCrear(enviar = vi.fn<Crear>().mockResolvedValue(OK)) {
  render(
    <PlanForm
      modo="crear"
      empresas={[]}
      inicioCicloPorDefecto={MANANA}
      rangoInicioCiclo={RANGO}
      rangoFechaDeEfecto={RANGO}
      enviar={enviar}
      previsualizar={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
      onGuardado={vi.fn()}
    />,
  );
  return enviar;
}

function montarEditar(enviar = vi.fn<Editar>().mockResolvedValue(OK)) {
  render(<PlanForm modo="editar" plan={PLAN} precioDesdePorDefecto={MANANA} enviar={enviar} onGuardado={vi.fn()} />);
  return enviar;
}

/** Las filas de «Revisar»: cada `<dt>` (la clave) con su `<dd>` (el valor). */
function filas(): [string, string][] {
  return Array.from(document.querySelectorAll("dl dt")).map((dt) => [
    dt.textContent ?? "",
    dt.nextElementSibling?.textContent ?? "",
  ]);
}

/** R22, R23: la clave va en negrita. */
function clavesEnNegrita() {
  for (const dt of Array.from(document.querySelectorAll("dl dt"))) expect(dt).toHaveClass("font-semibold");
}

describe("SLT-130 R22 — «Revisar y crear»", () => {
  it("R22: al crear lista los valores finales", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Plan Norte");
    await avanzarHasta(user, "Precio y descuentos");
    await user.click(screen.getByRole("radio", { name: "Con monto" }));
    await user.type(screen.getByLabelText("Costo base mensual"), "25.50");
    await user.click(screen.getByRole("button", { name: "Agregar descuento" }));
    await user.type(screen.getByRole("textbox", { name: "Valor" }), "10");
    await avanzarHasta(user, "Topes");
    await user.type(screen.getByLabelText("Usuarios activos con el rol Mensajero"), "5");
    await avanzarHasta(user, "Módulos");
    await user.click(screen.getByRole("checkbox", { name: "Monitoreo" }));
    await avanzarHasta(user, "Revisar y crear");

    expect(screen.getByText("Así queda el plan. No existe hasta que pulses «Crear plan».")).toBeInTheDocument();
    expect(filas()).toEqual([
      ["Visibilidad", "Público"],
      ["Nombre", "Plan Norte"],
      ["Costo base mensual", "25.50 / mes"],
      ["Descuentos", "Descuento quincenal: 10.00 %"],
      ["Cobro por orden", "se aplica el valor global"],
      ["Facturación de órdenes", "Quincenal"],
      ["Tope de Administrador", "sin límite"],
      ["Tope de Mensajero", "5"],
      ["Tope de Admin de tienda", "sin límite"],
      ["Tope de Admin satélite", "sin límite"],
      ["Tope de API keys", "sin límite"],
      ["Módulos incluidos", "Monitoreo"],
    ]);
    clavesEnNegrita();
    expect(screen.queryByText("Sin cambios.")).toBeNull();
    // «Revisar» no guarda: solo el botón final.
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeInTheDocument();
  });
});

describe("SLT-130 R23 — «Revisar y programar»", () => {
  it("R23: solo lo que cambia", async () => {
    const user = userEvent.setup();
    const enviar = montarEditar();
    const nombre = screen.getByRole("textbox", { name: "Nombre" });
    await user.clear(nombre);
    await user.type(nombre, "Básico Plus");
    await avanzarHasta(user, "Topes");
    const mensajero = screen.getByLabelText("Usuarios activos con el rol Mensajero");
    await user.clear(mensajero);
    await user.type(mensajero, "8");
    await avanzarHasta(user, "Revisar y programar");

    expect(
      screen.getByText("Esto es lo que cambia. Nada se aplica hasta que pulses «Guardar»."),
    ).toBeInTheDocument();
    expect(filas()).toEqual([
      ["Nombre", "Básico → Básico Plus"],
      ["Tope de Mensajero", "5 → 8"],
      ["Aplicar", "De inmediato"],
    ]);
    clavesEnNegrita();
    expect(screen.queryByText("Sin cambios.")).toBeNull();

    // Con «A partir de», la fila de cuándo rige lleva su fecha y el botón pasa a «Programar cambio».
    await user.click(screen.getByRole("button", { name: "Cuándo rige" }));
    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    const fecha = screen.getByLabelText("Fecha");
    await user.clear(fecha);
    await user.type(fecha, "2026-12-01");
    await avanzarHasta(user, "Revisar y programar");

    expect(filas()).toEqual([
      ["Nombre", "Básico → Básico Plus"],
      ["Tope de Mensajero", "5 → 8"],
      ["A partir de", "2026-12-01"],
    ]);
    expect(screen.getByRole("button", { name: "Programar cambio" })).toBeInTheDocument();
    await waitFor(() => expect(enviar).not.toHaveBeenCalled());
  });

  it("R23: sin cambios", async () => {
    const user = userEvent.setup();
    montarEditar();
    await avanzarHasta(user, "Revisar y programar");

    expect(screen.getByText("Sin cambios.")).toBeInTheDocument();
    // La fila de cuándo rige se conserva.
    expect(filas()).toEqual([["Aplicar", "De inmediato"]]);
    clavesEnNegrita();
  });
});
