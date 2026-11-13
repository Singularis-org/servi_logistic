// @vitest-environment jsdom
// SLT-130 (design §4, §5; R7, R9, R14, R16, R18–R21, R25) — el formulario de planes por pasos: qué pasos
// ofrece en cada modo, cómo se navega entre ellos («Siguiente» valida solo el paso actual, Enter avanza,
// «Anterior» y la lista no validan, el foco va al título) y adónde lleva un error al guardar.
//
// Se monta el `PlanForm` REAL con las actions como dobles (las inyecta la página).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm, type EmpresaParaCustom } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { CrearPlanInput, EditarPlanInput, PlanDTO, PlanResult } from "@/lib/types/planes";

import { avanzarHasta, terminar, tituloDelPasoActual } from "./plan-form-pasos";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const CON_PLAN = "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61";
const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };
const EMPRESAS: EmpresaParaCustom[] = [
  { id: CON_PLAN, nombre: "Reparto Sur", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" },
];
const MANANA = "2026-10-30";
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
const RANGO_EFECTO = { hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" };

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
      empresas={EMPRESAS}
      inicioCicloPorDefecto={MANANA}
      rangoInicioCiclo={RANGO}
      rangoFechaDeEfecto={RANGO_EFECTO}
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

const nav = () => screen.getByRole("navigation", { name: "Pasos" });
/** Los títulos de la lista de pasos, sin su número (que es decorativo). */
const titulosDeLaLista = () => within(nav()).getAllByRole("button").map((b) => b.textContent?.replace(/^\d+/, ""));
const botonDelPaso = (titulo: string) => within(nav()).getByRole("button", { name: titulo });
const titulo = (texto: string) => screen.getByRole("heading", { name: texto });
const siguiente = () => screen.getByRole("button", { name: "Siguiente" });
const textosHoy = () => screen.queryAllByText(/^Hoy: /).map((p) => p.textContent);

describe("SLT-130 R7 — los pasos de cada modo", () => {
  it("R7: pasos al crear", () => {
    montarCrear();
    expect(titulosDeLaLista()).toEqual([
      "General",
      "Precio y descuentos",
      "Cobro por orden",
      "Topes",
      "Módulos",
      "Revisar y crear",
    ]);
    expect(tituloDelPasoActual()).toBe("General");
    expect(screen.getByText("Paso 1 de 6")).toBeInTheDocument();
    expect(titulo("General")).toBeInTheDocument();
  });

  it("R7: pasos al editar", () => {
    montarEditar();
    expect(titulosDeLaLista()).toEqual([
      "General",
      "Precio y descuentos",
      "Cobro por orden",
      "Topes",
      "Módulos",
      "Cuándo rige",
      "Revisar y programar",
    ]);
    expect(tituloDelPasoActual()).toBe("General");
    expect(screen.getByText("Paso 1 de 7")).toBeInTheDocument();
  });
});

describe("SLT-130 R9, R14 — el contenido de General y de Cobro por orden", () => {
  it("R9: al editar la visibilidad está deshabilitada con su texto", async () => {
    const user = userEvent.setup();
    const enviar = montarEditar();

    const grupo = screen.getByRole("radiogroup", { name: "Visibilidad" });
    expect(grupo).toHaveAccessibleDescription(expect.stringContaining("No se cambia después de crear el plan."));
    const radios = within(grupo).getAllByRole("radio");
    for (const r of radios) expect(r).toHaveAttribute("aria-disabled", "true");
    expect(within(grupo).getByRole("radio", { name: "Público" })).toBeChecked();
    await user.click(within(grupo).getByRole("radio", { name: "Custom" }));
    expect(within(grupo).getByRole("radio", { name: "Público" })).toBeChecked();

    await terminar(user);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).not.toHaveProperty("visibilidad");
  });

  it("R14: solo dos modos", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await avanzarHasta(user, "Cobro por orden");

    const modos = screen.getByRole("radiogroup", { name: "Cobro por orden" });
    expect(within(modos).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Fijo",
      "Porcentual",
    ]);
    expect(within(modos).getByRole("radio", { name: "Fijo" })).toBeChecked();
    // En «Fijo», vacío = el valor global de la plataforma, con su ayuda de hoy.
    const costo = screen.getByLabelText("Costo por orden");
    expect(costo).toHaveValue("");
    expect(costo).toHaveAccessibleDescription("Vacío: se aplica el valor global de la plataforma.");
    // SLT-118 (R35): «Facturación de órdenes» va en este paso.
    expect(screen.getByRole("radiogroup", { name: "Facturación de órdenes" })).toBeInTheDocument();

    await user.click(within(modos).getByRole("radio", { name: "Porcentual" }));
    expect(screen.getByLabelText(/^Porcentaje/)).toBeInTheDocument();
    expect(screen.getByLabelText("Mínimo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Costo por orden")).toBeNull();
  });
});

describe("SLT-130 R16 — «Hoy: <valor del plan>» bajo lo que cambia al editar", () => {
  it('R16: "Hoy" solo bajo lo que cambia al editar', async () => {
    const user = userEvent.setup();
    montarEditar();

    await avanzarHasta(user, "Precio y descuentos");
    expect(textosHoy()).toEqual([]);
    const mensual = screen.getByLabelText("Costo base mensual");
    await user.clear(mensual);
    await user.type(mensual, "20");
    expect(textosHoy()).toEqual(["Hoy: 10.00 / mes"]);
    // Volver al valor del plan (en otra forma canónica) quita «Hoy».
    await user.clear(mensual);
    await user.type(mensual, "10");
    expect(textosHoy()).toEqual([]);

    await avanzarHasta(user, "Topes");
    expect(textosHoy()).toEqual([]);
    const mensajero = screen.getByLabelText("Usuarios activos con el rol Mensajero");
    await user.clear(mensajero);
    await user.type(mensajero, "7");
    await user.type(screen.getByLabelText("Usuarios activos con el rol Administrador"), "3");
    expect(textosHoy()).toEqual(["Hoy: sin límite", "Hoy: 5"]);
  });

  it('R16: al crear no hay "Hoy"', async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await avanzarHasta(user, "Precio y descuentos");
    await user.click(screen.getByRole("radio", { name: "Con monto" }));
    await user.type(screen.getByLabelText("Costo base mensual"), "20");
    expect(textosHoy()).toEqual([]);

    await avanzarHasta(user, "Topes");
    await user.type(screen.getByLabelText("Usuarios activos con el rol Mensajero"), "7");
    expect(textosHoy()).toEqual([]);
  });
});

describe("SLT-130 R18–R21 — la navegación", () => {
  it("R18: General sin nombre no avanza y enfoca Nombre", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await user.click(siguiente());

    expect(tituloDelPasoActual()).toBe("General");
    const nombre = screen.getByRole("textbox", { name: "Nombre" });
    await waitFor(() => expect(nombre).toHaveAttribute("aria-invalid", "true"));
    await waitFor(() => expect(nombre).toHaveFocus());
    expect(botonDelPaso("Precio y descuentos")).toBeDisabled();
    expect(enviar).not.toHaveBeenCalled();

    // Con el nombre escrito, avanza y limpia el error.
    await user.type(nombre, "Pro");
    await user.click(siguiente());
    expect(tituloDelPasoActual()).toBe("Precio y descuentos");
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it("R18: un error de otro paso no bloquea", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await avanzarHasta(user, "Topes");
    // Un tope que el esquema rechaza, y se vuelve a General sin validar.
    await user.type(screen.getByLabelText("API keys activas"), "-3");
    await user.click(botonDelPaso("General"));

    await user.click(siguiente());
    expect(tituloDelPasoActual()).toBe("Precio y descuentos");
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();

    // En su paso, el error sí detiene «Siguiente».
    await avanzarHasta(user, "Topes");
    await user.click(siguiente());
    expect(tituloDelPasoActual()).toBe("Topes");
    await waitFor(() => expect(screen.getByLabelText("API keys activas")).toHaveAttribute("aria-invalid", "true"));
    expect(enviar).not.toHaveBeenCalled();
  });

  it("R19: Enter en un paso intermedio avanza y no guarda", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro{Enter}");
    expect(tituloDelPasoActual()).toBe("Precio y descuentos");

    await user.click(screen.getByRole("radio", { name: "Con monto" }));
    await user.type(screen.getByLabelText("Costo base mensual"), "20{Enter}");
    expect(tituloDelPasoActual()).toBe("Cobro por orden");

    await user.type(screen.getByLabelText("Costo por orden"), "5{Enter}");
    expect(tituloDelPasoActual()).toBe("Topes");
    await user.type(screen.getByLabelText("API keys activas"), "2{Enter}");
    expect(tituloDelPasoActual()).toBe("Módulos");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("R20: volver y saltar a visitados conserva lo escrito", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Plan X");
    await avanzarHasta(user, "Precio y descuentos");
    await user.click(screen.getByRole("radio", { name: "Con monto" }));
    await user.type(screen.getByLabelText("Costo base mensual"), "25");
    await avanzarHasta(user, "Cobro por orden");
    // «Porcentual» sin porcentaje es un error de este paso: «Anterior» no valida.
    await user.click(screen.getByRole("radio", { name: "Porcentual" }));
    expect(botonDelPaso("Topes")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(tituloDelPasoActual()).toBe("Precio y descuentos");
    expect(screen.getByLabelText("Costo base mensual")).toHaveValue("25");
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();

    await user.click(botonDelPaso("General"));
    expect(tituloDelPasoActual()).toBe("General");
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Plan X");

    await user.click(botonDelPaso("Cobro por orden"));
    expect(tituloDelPasoActual()).toBe("Cobro por orden");
    expect(screen.getByRole("radio", { name: "Porcentual" })).toBeChecked();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("R21: el foco va al título del paso", async () => {
    const user = userEvent.setup();
    montarCrear();
    // Al abrir no se roba el foco.
    expect(titulo("General")).not.toHaveFocus();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await user.click(siguiente());
    await waitFor(() => expect(titulo("Precio y descuentos")).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await waitFor(() => expect(titulo("General")).toHaveFocus());

    await user.click(botonDelPaso("Precio y descuentos"));
    await waitFor(() => expect(titulo("Precio y descuentos")).toHaveFocus());
  });
});

describe("SLT-130 R25 — un error al guardar lleva al paso de su campo", () => {
  it("R25: un validation_error de un tope lleva al paso Topes", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn<Crear>().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: { "topes.porRol.mensajero": ["El tope tiene que ser un entero."] },
    });
    montarCrear(enviar);
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(tituloDelPasoActual()).toBe("Topes"));
    const campo = screen.getByLabelText("Usuarios activos con el rol Mensajero");
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription(expect.stringContaining("El tope tiene que ser un entero."));
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it("R25: empresa que ya no existe lleva a General", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn<Crear>().mockResolvedValue({ estado: "not_found" });
    montarCrear(enviar);
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    await user.click(screen.getByRole("combobox", { name: "Empresa" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Reparto Sur" }));
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(tituloDelPasoActual()).toBe("General"));
    const empresa = screen.getByRole("combobox", { name: "Empresa" });
    await waitFor(() => expect(empresa).toHaveAttribute("aria-invalid", "true"));
    expect(empresa).toHaveAccessibleDescription(expect.stringContaining("Esa empresa ya no existe."));
    await waitFor(() => expect(empresa).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Pro");
  });
});
