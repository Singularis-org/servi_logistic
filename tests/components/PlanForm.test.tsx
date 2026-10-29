// @vitest-environment jsdom
// SLT-58 (design §6.3; R14, R15, R18) — el formulario de crear y editar un plan del superadmin.
//
// Se mide lo que sale hacia la action (la inyectada por props, como hace la página) y lo que se pinta
// con cada respuesta: la visibilidad solo ofrece «Público» y «Custom», al editar se elige «De
// inmediato» o «A partir de» una fecha, y los `fieldErrors` de la action van junto a su campo.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { PlanDTO, PlanResult } from "@/lib/types/planes";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const EMPRESAS = [
  { id: ORG, nombre: "Envíos Norte" },
  { id: "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61", nombre: "Reparto Sur" },
];

const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };

const PLAN: PlanDTO = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 5 }, apiKeys: null },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "10.00", anual: null },
  archivado: false,
};

afterEach(() => cleanup());

function montarCrear(enviar = vi.fn().mockResolvedValue(OK), onGuardado = vi.fn()) {
  render(<PlanForm modo="crear" empresas={EMPRESAS} enviar={enviar} onGuardado={onGuardado} />);
  return { enviar, onGuardado };
}

function montarEditar(enviar = vi.fn().mockResolvedValue(OK), onGuardado = vi.fn()) {
  render(<PlanForm modo="editar" plan={PLAN} enviar={enviar} onGuardado={onGuardado} />);
  return { enviar, onGuardado };
}

describe("SLT-58 R14 — crear un plan", () => {
  it("R14: la visibilidad ofrece solo «Público» y «Custom» (sin «enterprise»)", () => {
    montarCrear();
    const grupo = screen.getByRole("radiogroup", { name: "Visibilidad" });
    expect(within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Público",
      "Custom",
    ]);
    expect(screen.queryByText(/enterprise/i)).toBeNull();
  });

  it("R14: envía a la action nombre, custom con su empresa, topes (vacío = sin límite), módulos y precio", async () => {
    const user = userEvent.setup();
    const { enviar, onGuardado } = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Plan Norte");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    await user.click(screen.getByRole("combobox", { name: "Empresa" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Envíos Norte" }));
    await user.type(screen.getByLabelText("Órdenes por ciclo"), "3000");
    await user.type(screen.getByLabelText("Usuarios activos con el rol Mensajero"), "5");
    await user.click(screen.getByRole("checkbox", { name: "Monitoreo" }));
    await user.click(screen.getByRole("radio", { name: "Mensual" }));
    await user.type(screen.getByLabelText("Monto mensual"), "25.50");
    await user.click(screen.getByRole("radio", { name: "Descuento sobre el anual" }));
    await user.type(screen.getByLabelText("Porcentaje de descuento"), "10");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar).toHaveBeenCalledWith({
      nombre: "Plan Norte",
      visibilidad: "custom",
      organizacionId: ORG,
      topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 5 }, apiKeys: null },
      modulos: ["monitoreo"],
      precio: { tipo: "monto", mensual: "25.50", anual: { tipo: "descuento", porcentaje: "10" } },
    });
    expect(onGuardado).toHaveBeenCalledWith(OK, "Plan Norte");
  });

  it("R14: un plan público sin topes ni precio sale con organizacionId null y todo sin límite", async () => {
    const user = userEvent.setup();
    const { enviar } = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar).toHaveBeenCalledWith({
      nombre: "Libre",
      visibilidad: "publico",
      organizacionId: null,
      topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
      modulos: [],
      precio: { tipo: "sin_precio" },
    });
  });

  it("R14: un custom sin empresa no llega a la action y marca el campo «Empresa»", async () => {
    const user = userEvent.setup();
    const { enviar } = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Plan Norte");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveAttribute("aria-invalid", "true");
  });

  it("«Crear plan» se deshabilita mientras la petición está en vuelo", async () => {
    const user = userEvent.setup();
    let resolver: (r: PlanResult) => void = () => undefined;
    const enviar = vi.fn(() => new Promise<PlanResult>((res) => (resolver = res)));
    montarCrear(enviar);

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Crear plan/ })).toBeDisabled());
    resolver(OK);
    await waitFor(() => expect(screen.getByRole("button", { name: /Crear plan/ })).toBeEnabled());
  });
});

describe("SLT-58 R15 — editar: de inmediato o a partir de una fecha", () => {
  it("R15: no ofrece cambiar la visibilidad y precarga la versión vigente", () => {
    montarEditar();
    expect(screen.queryByRole("radiogroup", { name: "Visibilidad" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Básico");
    expect(screen.getByLabelText("Órdenes por ciclo")).toHaveValue("3000");
    expect(screen.getByLabelText("Monto mensual")).toHaveValue("10.00");
    expect(screen.getByRole("checkbox", { name: "Analítica" })).toHaveAttribute("aria-checked", "true");
  });

  it("R15: «De inmediato» envía vigenteDesde null", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();

    const grupo = screen.getByRole("radiogroup", { name: "Aplicar" });
    expect(within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "De inmediato",
      "A partir de",
    ]);
    await user.clear(screen.getByLabelText("Órdenes por ciclo"));
    await user.type(screen.getByLabelText("Órdenes por ciclo"), "5000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar).toHaveBeenCalledWith({
      planId: PLAN_ID,
      nombre: "Básico",
      topes: { ordenesPorCiclo: 5000, porRol: { mensajero: 5 }, apiKeys: null },
      modulos: ["analitica"],
      precio: { tipo: "monto", mensual: "10.00", anual: null },
      vigenteDesde: null,
    });
  });

  it("R15: «A partir de» envía solo la fecha (AAAA-MM-DD)", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();

    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0][0]).toMatchObject({ planId: PLAN_ID, vigenteDesde: "2030-01-15" });
  });
});

describe("SLT-58 R18 — los rechazos se explican y no dan el cambio por hecho", () => {
  it("R18: los fieldErrors de la action se pintan junto a su campo", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: {
        vigenteDesde: ["La fecha de vigencia tiene que ser posterior a hoy."],
        "topes.porRol.mensajero": ["Tope inválido."],
      },
    } satisfies PlanResult);
    const { onGuardado } = montarEditar(enviar);

    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const fecha = await screen.findByLabelText("Fecha");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    const errorFecha = document.getElementById(fecha.getAttribute("aria-describedby")!.split(" ").at(-1)!);
    expect(errorFecha).toHaveTextContent("La fecha de vigencia tiene que ser posterior a hoy.");

    const mensajero = screen.getByLabelText("Usuarios activos con el rol Mensajero");
    expect(mensajero).toHaveAttribute("aria-invalid", "true");
    const errorMensajero = document.getElementById(mensajero.getAttribute("aria-describedby")!);
    expect(errorMensajero).toHaveTextContent("Tope inválido.");
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it.each<[PlanResult, string]>([
    [{ estado: "forbidden" }, "No tienes permiso para esto."],
    [{ estado: "not_found" }, "El plan o la empresa ya no existe."],
    [{ estado: "archivado" }, "El plan está archivado."],
    [{ estado: "custom_de_otra_empresa" }, "Ese plan es de otra empresa."],
  ])("R18: %o → muestra «%s» y no avisa de guardado", async (respuesta, texto) => {
    const user = userEvent.setup();
    const { onGuardado } = montarEditar(vi.fn().mockResolvedValue(respuesta));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(texto);
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it("R18: si la action lanza, avisa con un genérico y no da el cambio por hecho", async () => {
    const user = userEvent.setup();
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { onGuardado } = montarEditar(vi.fn().mockRejectedValue(new Error("red")));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar. Inténtalo de nuevo.");
    expect(onGuardado).not.toHaveBeenCalled();
    consola.mockRestore();
  });
});
