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
    await user.click(screen.getByRole("radio", { name: "Con monto" }));
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
    // SLT-67: el servidor serializa «10.00»; el campo lo muestra sin «.00».
    expect(screen.getByLabelText("Monto mensual")).toHaveValue("10");
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
      precio: { tipo: "monto", mensual: "10", anual: null },
      vigenteDesde: null,
    });
  });

  it("SLT-67: editar un plan con mensual y anual «500.00» los muestra sin «.00» y envía montos string válidos", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn().mockResolvedValue(OK);
    const plan: PlanDTO = {
      ...PLAN,
      precio: { tipo: "monto", mensual: "500.00", anual: { tipo: "fijo", monto: "5000.00" } },
    };
    render(<PlanForm modo="editar" plan={plan} enviar={enviar} onGuardado={vi.fn()} />);

    expect(screen.getByLabelText("Monto mensual")).toHaveValue("500");
    expect(screen.getByLabelText("Monto anual")).toHaveValue("5000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    const precio = enviar.mock.calls[0][0].precio;
    expect(precio).toEqual({ tipo: "monto", mensual: "500", anual: { tipo: "fijo", monto: "5000" } });
    expect(typeof precio.mensual).toBe("string");
    expect(precio.mensual).toMatch(/^\d{1,10}(\.\d{1,2})?$/);
  });

  it("R15: «A partir de» envía solo la fecha (AAAA-MM-DD)", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();

    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await user.click(screen.getByRole("button", { name: "Programar cambio" }));

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
    await user.click(screen.getByRole("button", { name: "Programar cambio" }));

    const fecha = await screen.findByLabelText("Fecha");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    const errorFecha = document.getElementById(fecha.getAttribute("aria-describedby")!.split(" ").at(-1)!);
    expect(errorFecha).toHaveTextContent("La fecha de vigencia tiene que ser posterior a hoy.");

    const mensajero = screen.getByLabelText("Usuarios activos con el rol Mensajero");
    expect(mensajero).toHaveAttribute("aria-invalid", "true");
    // El tope enlaza su error y la ayuda «Vacío = sin límite»; el error va primero.
    const errorMensajero = document.getElementById(mensajero.getAttribute("aria-describedby")!.split(" ")[0]);
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

describe("SLT-58 — revisión de diseño del formulario", () => {
  it("tras errores de la action, el foco va al PRIMER campo con error en el orden del formulario (con scroll)", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const enviar = vi.fn().mockResolvedValue({
      estado: "validation_error",
      // La fecha llega antes en el objeto, pero en pantalla el tope de mensajero va antes.
      fieldErrors: { vigenteDesde: ["Fecha inválida."], "topes.porRol.mensajero": ["Tope inválido."] },
    } satisfies PlanResult);
    montarEditar(enviar);

    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await user.click(screen.getByRole("button", { name: "Programar cambio" }));

    const mensajero = screen.getByLabelText("Usuarios activos con el rol Mensajero");
    await waitFor(() => expect(mensajero).toHaveFocus());
    expect(scroll).toHaveBeenCalled();
    expect(scroll.mock.contexts.at(-1)).toBe(mensajero);
  });

  it("una validación del cliente lleva el foco al primer campo con error (el nombre, arriba del todo)", async () => {
    const user = userEvent.setup();
    const { enviar } = montarCrear();

    await user.click(screen.getByRole("radio", { name: "Custom" }));
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(enviar).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus());
  });

  it("si solo hay errores sin campo visible, el foco va al aviso general", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: { planId: ["El plan no es válido."] },
    } satisfies PlanResult);
    montarEditar(enviar);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("El plan no es válido.");
    await waitFor(() => expect(aviso).toHaveFocus());
  });

  it("un rechazo de la action también lleva el foco al aviso general", async () => {
    const user = userEvent.setup();
    montarEditar(vi.fn().mockResolvedValue({ estado: "forbidden" } satisfies PlanResult));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const aviso = await screen.findByRole("alert");
    await waitFor(() => expect(aviso).toHaveFocus());
  });

  it("si las empresas no se pudieron leer, lo dice junto al campo «Empresa»", async () => {
    const user = userEvent.setup();
    render(<PlanForm modo="crear" empresas={null} enviar={vi.fn()} onGuardado={vi.fn()} />);

    expect(screen.queryByText("No se pudieron cargar las empresas.")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Custom" }));

    expect(screen.getByText("No se pudieron cargar las empresas.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveAccessibleDescription(
      "No se pudieron cargar las empresas.",
    );
  });

  it("los topes dicen «Sin límite» de placeholder, enlazan la ayuda y van en una sola columna", () => {
    montarCrear();
    for (const nombre of ["Órdenes por ciclo", "Usuarios activos con el rol Mensajero", "API keys activas"]) {
      const campo = screen.getByLabelText(nombre);
      expect(campo).toHaveAttribute("placeholder", "Sin límite");
      expect(campo).toHaveAccessibleDescription("Vacío = sin límite.");
      expect(campo.closest(".sm\:grid-cols-2")).toBeNull();
    }
  });

  it("las casillas de módulos toman su nombre del <label> visible, sin aria-label duplicado", () => {
    montarCrear();
    expect(screen.getByRole("checkbox", { name: "Monitoreo" })).not.toHaveAttribute("aria-label");
  });

  it("el precio ofrece «Con monto» (no «Mensual») y el pago anual lleva un título visible", async () => {
    const user = userEvent.setup();
    montarCrear();

    const precio = screen.getByRole("radiogroup", { name: "Precio informativo" });
    expect(within(precio).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Sin precio",
      "Negociable",
      "Con monto",
    ]);
    await user.click(screen.getByRole("radio", { name: "Con monto" }));

    const anual = screen.getByRole("group", { name: "Pago anual" });
    expect(within(anual).getByText("Pago anual")).toBeVisible();
    expect(within(anual).getByRole("radiogroup", { name: "Pago anual" })).toBeInTheDocument();
  });

  it("al editar, el botón dice «Programar cambio» con «A partir de» y vuelve a «Guardar» con «De inmediato»", async () => {
    const user = userEvent.setup();
    montarEditar();

    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    expect(screen.getByRole("button", { name: "Programar cambio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "De inmediato" }));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("el pie con el botón de enviar queda fijo al fondo del panel", () => {
    montarCrear();
    expect(screen.getByRole("button", { name: "Crear plan" }).parentElement).toHaveClass("sticky", "bottom-0");
  });
});
