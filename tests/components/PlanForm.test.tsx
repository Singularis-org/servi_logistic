// @vitest-environment jsdom
// SLT-58 (design §6.3; R14, R15, R18) — el formulario de crear y editar un plan del superadmin.
//
// Se mide lo que sale hacia la action (la inyectada por props, como hace la página) y lo que se pinta
// con cada respuesta: la visibilidad solo ofrece «Público» y «Custom», al editar se elige «De
// inmediato» o «A partir de» una fecha, y los `fieldErrors` de la action van junto a su campo.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { PlanDTO, PlanResult } from "@/lib/types/planes";

import { avanzarHasta, terminar } from "./plan-form-pasos";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
// Ajuste planes-custom (D4): «Envíos Norte» aún no tiene plan; «Reparto Sur» ya lo tiene.
const EMPRESAS = [
  { id: ORG, nombre: "Envíos Norte", tienePlan: false, fechaDeEfectoPorDefecto: null },
  { id: "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61", nombre: "Reparto Sur", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" },
];
/** D5: mañana en la hora de la plataforma, como lo calcula la página. */
const MANANA = "2026-10-30";
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
/** SLT-86 (R16): el rango de «Rige desde» de una empresa con plan. */
const RANGO_EFECTO = { hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" };

const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };

const PLAN: PlanDTO = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { mensajero: 5 }, apiKeys: null },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "10.00", descuentos: {} },
  costoPorOrden: null, // SLT-66 R8: campo nuevo del PlanDTO
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
  archivado: false,
};

afterEach(() => cleanup());

function montarCrear(enviar = vi.fn().mockResolvedValue(OK), onGuardado = vi.fn()) {
  render(
    <PlanForm
      modo="crear"
      empresas={EMPRESAS}
      inicioCicloPorDefecto={MANANA}
      rangoInicioCiclo={RANGO}
      rangoFechaDeEfecto={RANGO_EFECTO}
      enviar={enviar}
      previsualizar={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
      onGuardado={onGuardado}
    />,
  );
  return { enviar, onGuardado };
}

function montarEditar(enviar = vi.fn().mockResolvedValue(OK), onGuardado = vi.fn()) {
  render(<PlanForm modo="editar" plan={PLAN} enviar={enviar} onGuardado={onGuardado} />);
  return { enviar, onGuardado };
}

/**
 * SLT-130 (R10): agrega una línea de descuento (sale con el primer período libre, «Quincenal») y la pasa
 * a `periodo`. Devuelve el grupo de la línea.
 */
async function agregarDescuento(user: UserEvent, periodo: string): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: "Agregar descuento" }));
  const nueva = screen.getByRole("group", { name: "Descuento quincenal" });
  await user.click(within(nueva).getByRole("combobox", { name: "Período" }));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: periodo }));
  return screen.getByRole("group", { name: `Descuento ${periodo.toLowerCase()}` });
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
    // SLT-130: cada campo en su paso.
    await avanzarHasta(user, "Precio y descuentos");
    await user.click(screen.getByRole("radio", { name: "Con monto" }));
    // SLT-66 R9: el rótulo «Monto mensual» pasa a «Costo base mensual».
    await user.type(screen.getByLabelText("Costo base mensual"), "25.50");
    // SLT-86 (R23); SLT-130 (R10): el descuento anual es una línea de la lista.
    const anual = await agregarDescuento(user, "Anual");
    await user.click(within(anual).getByRole("radio", { name: "%" }));
    await user.type(within(anual).getByRole("textbox", { name: "Valor" }), "10");
    await avanzarHasta(user, "Topes");
    await user.type(screen.getByLabelText("Usuarios activos con el rol Mensajero"), "5");
    await avanzarHasta(user, "Módulos");
    await user.click(screen.getByRole("checkbox", { name: "Monitoreo" }));
    await avanzarHasta(user, "Revisar y crear");
    // R28: el custom de una empresa sin plan espera su vista previa antes de poder crearse.
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear plan" })).toBeEnabled());
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar).toHaveBeenCalledWith({
      nombre: "Plan Norte",
      visibilidad: "custom",
      organizacionId: ORG,
      topes: { porRol: { mensajero: 5 }, apiKeys: null },
      modulos: ["monitoreo"],
      precio: { tipo: "monto", mensual: "25.50", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
      costoPorOrden: null, // SLT-66 R8: campo nuevo; vacío = null
      costoPorOrdenPorcentual: null, // SLT-83: campo nuevo; el modo no elegido viaja null
      periodicidadOrdenes: "quincenal", // SLT-118 (R35): viaja siempre
      // Ajuste planes-custom (D2, D4–D6): el custom se asigna al crearlo; la empresa no tiene plan.
      tipoCobro: "mensual",
      inicioCiclo: MANANA,
    });
    // SLT-86 (R8): sin siguiente ciclo; `onGuardado` recibe el resultado y el nombre.
    expect(onGuardado).toHaveBeenCalledWith(OK, "Plan Norte");
  });

  it("R14: un plan público sin topes ni precio sale con organizacionId null y todo sin límite", async () => {
    const user = userEvent.setup();
    const { enviar } = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar).toHaveBeenCalledWith({
      nombre: "Libre",
      visibilidad: "publico",
      organizacionId: null,
      topes: { porRol: {}, apiKeys: null },
      modulos: [],
      precio: { tipo: "sin_precio" },
      costoPorOrden: null, // SLT-66 R8: campo nuevo; vacío = null
      costoPorOrdenPorcentual: null, // SLT-83: campo nuevo; el modo no elegido viaja null
      periodicidadOrdenes: "quincenal", // SLT-118 (R35): viaja siempre
    });
  });

  it("R14: un custom sin empresa no llega a la action y marca el campo «Empresa»", async () => {
    const user = userEvent.setup();
    const { enviar } = montarCrear();

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Plan Norte");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    // SLT-130 (R18): «Siguiente» valida General con el esquema de la action y no deja pasar.
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveAttribute("aria-invalid", "true");
  });

  it("«Crear plan» se deshabilita mientras la petición está en vuelo", async () => {
    const user = userEvent.setup();
    let resolver: (r: PlanResult) => void = () => undefined;
    const enviar = vi.fn(() => new Promise<PlanResult>((res) => (resolver = res)));
    montarCrear(enviar);

    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await terminar(user);

    await waitFor(() => expect(screen.getByRole("button", { name: /Crear plan/ })).toBeDisabled());
    resolver(OK);
    await waitFor(() => expect(screen.getByRole("button", { name: /Crear plan/ })).toBeEnabled());
  });
});

describe("SLT-58 R15 — editar: de inmediato o a partir de una fecha", () => {
  it("R15: no ofrece cambiar la visibilidad y precarga la versión vigente", async () => {
    const user = userEvent.setup();
    montarEditar();
    // SLT-130 (R9): la visibilidad se ve, pero deshabilitada; no se puede cambiar.
    const visibilidad = screen.getByRole("radiogroup", { name: "Visibilidad" });
    for (const radio of within(visibilidad).getAllByRole("radio")) expect(radio).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Básico");
    await avanzarHasta(user, "Precio y descuentos");
    // SLT-67: el servidor serializa «10.00»; el campo lo muestra sin «.00».
    // SLT-66 R9: el rótulo «Monto mensual» pasa a «Costo base mensual».
    expect(screen.getByLabelText("Costo base mensual")).toHaveValue("10");
    await avanzarHasta(user, "Topes");
    expect(screen.getByLabelText("Usuarios activos con el rol Mensajero")).toHaveValue("5");
    // SLT-86 (R8, R23): sin tope de órdenes.
    expect(screen.queryByLabelText("Órdenes por ciclo")).toBeNull();
    await avanzarHasta(user, "Módulos");
    expect(screen.getByRole("checkbox", { name: "Analítica" })).toHaveAttribute("aria-checked", "true");
  });

  it("R15: «De inmediato» envía vigenteDesde null", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();

    await avanzarHasta(user, "Topes");
    await user.type(screen.getByLabelText("API keys activas"), "2");
    // SLT-130 (R17): «Aplicar» vive en «Cuándo rige».
    await avanzarHasta(user, "Cuándo rige");
    const grupo = screen.getByRole("radiogroup", { name: "Aplicar" });
    expect(within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "De inmediato",
      "A partir de",
    ]);
    await avanzarHasta(user, "Revisar y programar");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar).toHaveBeenCalledWith({
      planId: PLAN_ID,
      nombre: "Básico",
      topes: { porRol: { mensajero: 5 }, apiKeys: 2 },
      modulos: ["analitica"],
      precio: { tipo: "monto", mensual: "10", descuentos: {} },
      costoPorOrden: null, // SLT-66 R8: campo nuevo; vacío = null
      costoPorOrdenPorcentual: null, // SLT-83: campo nuevo; el modo no elegido viaja null
      periodicidadOrdenes: "quincenal", // SLT-118 (R35): viaja siempre
      vigenteDesde: null,
    });
  });

  it("SLT-67: editar un plan con mensual y descuento fijo «500.00» los muestra sin «.00» y envía montos string válidos", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn().mockResolvedValue(OK);
    const plan: PlanDTO = {
      ...PLAN,
      precio: { tipo: "monto", mensual: "500.00", descuentos: { anual: { tipo: "monto", monto: "5000.00" } } },
    };
    render(<PlanForm modo="editar" plan={plan} enviar={enviar} onGuardado={vi.fn()} />);

    await avanzarHasta(user, "Precio y descuentos");
    // SLT-66 R9: el rótulo «Monto mensual» pasa a «Costo base mensual».
    expect(screen.getByLabelText("Costo base mensual")).toHaveValue("500");
    // SLT-130 (R13): el descuento del plan abre como una línea de la lista, con su tipo «Fijo».
    const anual = screen.getByRole("group", { name: "Descuento anual" });
    expect(within(anual).getByRole("radio", { name: "Fijo" })).toBeChecked();
    expect(within(anual).getByRole("textbox", { name: "Valor" })).toHaveValue("5000");
    // El precio no cambia (el plan ya lo tenía), así que «Cuándo rige» ofrece «Aplicar» y el botón dice «Guardar».
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    const precio = enviar.mock.calls[0][0].precio;
    expect(precio).toEqual({ tipo: "monto", mensual: "500", descuentos: { anual: { tipo: "monto", monto: "5000" } } });
    expect(typeof precio.mensual).toBe("string");
    expect(precio.mensual).toMatch(/^\d{1,10}(\.\d{1,2})?$/);
  });

  it("R15: «A partir de» envía solo la fecha (AAAA-MM-DD)", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();

    await avanzarHasta(user, "Cuándo rige");
    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await avanzarHasta(user, "Revisar y programar");
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

    await avanzarHasta(user, "Cuándo rige");
    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await avanzarHasta(user, "Revisar y programar");
    await user.click(screen.getByRole("button", { name: "Programar cambio" }));

    // SLT-130 (R25): el formulario va al paso del primer error en pantalla, Topes.
    const mensajero = await screen.findByLabelText("Usuarios activos con el rol Mensajero");
    await waitFor(() => expect(mensajero).toHaveAttribute("aria-invalid", "true"));
    // El tope enlaza su error y la ayuda «Vacío = sin límite»; el error va primero.
    const errorMensajero = document.getElementById(mensajero.getAttribute("aria-describedby")!.split(" ")[0]);
    expect(errorMensajero).toHaveTextContent("Tope inválido.");

    // La fecha conserva su error en su paso, «Cuándo rige».
    const nav = screen.getByRole("navigation", { name: "Pasos" });
    await user.click(within(nav).getByRole("button", { name: "Cuándo rige" }));
    const fecha = screen.getByLabelText("Fecha");
    expect(fecha).toHaveAttribute("aria-invalid", "true");
    const errorFecha = document.getElementById(fecha.getAttribute("aria-describedby")!.split(" ").at(-1)!);
    expect(errorFecha).toHaveTextContent("La fecha de vigencia tiene que ser posterior a hoy.");
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

    await terminar(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(texto);
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it("R18: si la action lanza, avisa con un genérico y no da el cambio por hecho", async () => {
    const user = userEvent.setup();
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { onGuardado } = montarEditar(vi.fn().mockRejectedValue(new Error("red")));

    await terminar(user);

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

    await avanzarHasta(user, "Cuándo rige");
    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await avanzarHasta(user, "Revisar y programar");
    await user.click(screen.getByRole("button", { name: "Programar cambio" }));

    const mensajero = await screen.findByLabelText("Usuarios activos con el rol Mensajero");
    await waitFor(() => expect(mensajero).toHaveFocus());
    expect(scroll).toHaveBeenCalled();
    expect(scroll.mock.contexts.at(-1)).toBe(mensajero);
  });

  it("una validación del cliente lleva el foco al primer campo con error (el nombre, arriba del todo)", async () => {
    const user = userEvent.setup();
    const { enviar } = montarCrear();

    await user.click(screen.getByRole("radio", { name: "Custom" }));
    // SLT-130 (R18): la validación del cliente corre al pulsar «Siguiente» en General.
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

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

    await terminar(user);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("El plan no es válido.");
    await waitFor(() => expect(aviso).toHaveFocus());
  });

  it("un rechazo de la action también lleva el foco al aviso general", async () => {
    const user = userEvent.setup();
    montarEditar(vi.fn().mockResolvedValue({ estado: "forbidden" } satisfies PlanResult));

    await terminar(user);

    const aviso = await screen.findByRole("alert");
    await waitFor(() => expect(aviso).toHaveFocus());
  });

  it("si las empresas no se pudieron leer, lo dice junto al campo «Empresa»", async () => {
    const user = userEvent.setup();
    render(
      <PlanForm
        modo="crear"
        empresas={null}
        inicioCicloPorDefecto={MANANA}
        rangoInicioCiclo={RANGO}
        rangoFechaDeEfecto={RANGO_EFECTO}
        enviar={vi.fn()}
        previsualizar={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
        onGuardado={vi.fn()}
      />,
    );

    expect(screen.queryByText("No se pudieron cargar las empresas.")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Custom" }));

    expect(screen.getByText("No se pudieron cargar las empresas.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveAccessibleDescription(
      "No se pudieron cargar las empresas.",
    );
  });

  it("los topes dicen «Sin límite» de placeholder, enlazan la ayuda y van en una sola columna", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await avanzarHasta(user, "Topes");
    for (const nombre of ["Usuarios activos con el rol Mensajero", "API keys activas"]) {
      const campo = screen.getByLabelText(nombre);
      expect(campo).toHaveAttribute("placeholder", "Sin límite");
      expect(campo).toHaveAccessibleDescription("Vacío = sin límite.");
      expect(campo.closest(".sm\:grid-cols-2")).toBeNull();
    }
  });

  it("las casillas de módulos toman su nombre del <label> visible, sin aria-label duplicado", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await avanzarHasta(user, "Módulos");
    expect(screen.getByRole("checkbox", { name: "Monitoreo" })).not.toHaveAttribute("aria-label");
  });

  it("el precio ofrece «Con monto» (no «Mensual») y cada descuento lleva un título visible, sin «Pago anual»", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await avanzarHasta(user, "Precio y descuentos");

    // SLT-66 R9: el grupo «Precio informativo» pasa a «Costo base».
    const precio = screen.getByRole("radiogroup", { name: "Costo base" });
    expect(within(precio).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Sin precio",
      "Con monto",
    ]);
    await user.click(screen.getByRole("radio", { name: "Con monto" }));

    // SLT-86 (R23): el pago anual fijo y su descuento se van; entra un descuento por período.
    // SLT-130 (R10): los descuentos son una lista con su título visible; cada línea se nombra por su período.
    expect(screen.queryByRole("group", { name: "Pago anual" })).toBeNull();
    expect(screen.getByRole("region", { name: "Descuentos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Descuentos" })).toBeVisible();
    const anual = await agregarDescuento(user, "Anual");
    expect(within(anual).getByRole("radiogroup", { name: "Tipo del descuento" })).toBeInTheDocument();
  });

  it("al editar, el botón dice «Programar cambio» con «A partir de» y vuelve a «Guardar» con «De inmediato»", async () => {
    const user = userEvent.setup();
    montarEditar();

    // SLT-130 (R17, R24): «Aplicar» está en «Cuándo rige» y el botón final, en el paso siguiente.
    await avanzarHasta(user, "Revisar y programar");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await user.click(screen.getByRole("radio", { name: "A partir de" }));
    await user.type(screen.getByLabelText("Fecha"), "2030-01-15");
    await avanzarHasta(user, "Revisar y programar");
    expect(screen.getByRole("button", { name: "Programar cambio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await user.click(screen.getByRole("radio", { name: "De inmediato" }));
    await avanzarHasta(user, "Revisar y programar");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("el pie con el botón de enviar queda fijo al fondo del panel", async () => {
    // SLT-130 (design §3): el pie del componente de pasos queda fuera del contenido con scroll, sin `sticky`.
    const user = userEvent.setup();
    montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await avanzarHasta(user, "Revisar y crear");
    const boton = screen.getByRole("button", { name: "Crear plan" });
    expect(boton.closest(".overflow-y-auto")).toBeNull();
    expect(boton.closest(".flex-none.border-t")).not.toBeNull();
  });
});
