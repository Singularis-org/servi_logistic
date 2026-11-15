// @vitest-environment jsdom
// Ajuste planes-custom (D1–D6) — EL FORMULARIO DE CREAR PLAN: SIN «NEGOCIABLE» Y UN CUSTOM QUE SE ASIGNA.
//
// Se monta el `PlanForm` REAL con la action como doble (la inyecta la página). Se mide lo que viaja a la
// action (tipo de cobro siempre en un custom; inicio del ciclo solo si la empresa no tiene plan, con
// MAÑANA por defecto) y lo que pasa ante un rechazo de la asignación: el formulario NO se cierra
// (`onGuardado` no se llama), el motivo va junto a su campo cuando lo tiene y lo escrito se conserva.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm, type EmpresaParaCustom } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { CrearPlanInput, PlanResult, PrevisualizarCustomInput, VistaPreviaCustomResult } from "@/lib/types/planes";

const SIN_PLAN = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const CON_PLAN = "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61";
const EMPRESAS: EmpresaParaCustom[] = [
  { id: SIN_PLAN, nombre: "Envíos Norte", tienePlan: false, fechaDeEfectoPorDefecto: null },
  // SLT-86 (R25): el primer día de su siguiente período de calendario, como lo calcula la página.
  { id: CON_PLAN, nombre: "Reparto Sur", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" },
];
/** D5: mañana en la hora de la plataforma, como lo calcula la página con `inicioDelCicloPorDefecto`. */
const MANANA = "2026-10-30";
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
/** SLT-86 (R16): de hoy a hoy + 12 meses. */
const RANGO_EFECTO = { hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" };
const OK: PlanResult = {
  estado: "ok",
  planId: "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  cambio: true,
  avisos: [],
  vigenteDesde: null,
};

type Enviar = (input: CrearPlanInput) => Promise<PlanResult>;

afterEach(() => cleanup());

/** D13: la vista previa del custom; por defecto, sin topes pasados. */
const VISTA_PREVIA_OK: VistaPreviaCustomResult = { estado: "ok", avisos: [] };
type Previsualizar = (input: PrevisualizarCustomInput) => Promise<VistaPreviaCustomResult>;

function montar(
  enviar: Enviar = vi.fn<Enviar>().mockResolvedValue(OK),
  previsualizar: Previsualizar = vi.fn<Previsualizar>().mockResolvedValue(VISTA_PREVIA_OK),
) {
  const onGuardado = vi.fn();
  render(
    <PlanForm
      modo="crear"
      empresas={EMPRESAS}
      inicioCicloPorDefecto={MANANA}
      rangoInicioCiclo={RANGO}
      rangoFechaDeEfecto={RANGO_EFECTO}
      enviar={enviar}
      previsualizar={previsualizar}
      onGuardado={onGuardado}
    />,
  );
  return { enviar: vi.mocked(enviar), onGuardado, previsualizar: vi.mocked(previsualizar) };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function custom(user: Usuario, empresa: string) {
  await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Norte a medida");
  await user.click(screen.getByRole("radio", { name: "Custom" }));
  await user.click(screen.getByRole("combobox", { name: "Empresa" }));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: empresa }));
}

async function conCosto(user: Usuario) {
  await user.click(screen.getByRole("radio", { name: "Con monto" }));
  await user.type(screen.getByLabelText("Costo base mensual"), "50000");
  await user.type(screen.getByLabelText("Costo por orden"), "100");
}

const campoInicio = () => screen.queryByLabelText("Inicio del período");

describe("D1 — el costo base ya no ofrece «Negociable»", () => {
  it("solo «Sin precio» y «Con monto»", () => {
    montar();
    const grupo = screen.getByRole("radiogroup", { name: "Costo base" });
    expect(within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Sin precio",
      "Con monto",
    ]);
    expect(screen.queryByText(/negociable/i)).toBeNull();
  });
});

describe("D4, D5 — «Inicio del ciclo» en el custom", () => {
  it("D4, D5: empresa sin plan → se muestra con MAÑANA por defecto y el min/max del servidor", async () => {
    const user = userEvent.setup();
    montar();
    await custom(user, "Envíos Norte");

    const campo = campoInicio();
    expect(campo).not.toBeNull();
    expect(campo).toHaveAttribute("type", "date");
    expect(campo).toHaveValue(MANANA);
    expect(campo).not.toHaveValue(RANGO.hoy);
    expect(campo).toHaveAttribute("min", RANGO.min);
    expect(campo).toHaveAttribute("max", RANGO.max);
  });

  it("D4, SLT-86 R16: empresa con plan → no pide el inicio; la action recibe «Rige desde» y no `inicioCiclo`", async () => {
    const user = userEvent.setup();
    const { enviar } = montar();
    await custom(user, "Reparto Sur");
    expect(campoInicio()).toBeNull();

    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).not.toHaveProperty("inicioCiclo");
    expect(enviar.mock.calls[0]![0]).toMatchObject({
      organizacionId: CON_PLAN,
      tipoCobro: "mensual",
      vigenteDesde: "2026-11-01",
    });
  });

  it("D4: sin empresa elegida, ni público, no se pide la fecha", async () => {
    const user = userEvent.setup();
    montar();
    expect(campoInicio()).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    expect(campoInicio()).toBeNull();
  });

  it("D4, D5: la fecha elegida viaja a la action", async () => {
    const user = userEvent.setup();
    const { enviar } = montar();
    await custom(user, "Envíos Norte");
    const campo = campoInicio()!;
    await user.clear(campo);
    await user.type(campo, "2026-11-05");
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).toMatchObject({ organizacionId: SIN_PLAN, inicioCiclo: "2026-11-05" });
  });
});

describe("D6 — el tipo de cobro en el custom", () => {
  it("D6, SLT-86 R1: un custom ofrece los cuatro tipos, con «Mensual» por defecto", async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.queryByRole("radiogroup", { name: "Tipo de cobro" })).toBeNull(); // público: no aplica
    await custom(user, "Envíos Norte");

    const grupo = screen.getByRole("radiogroup", { name: "Tipo de cobro" });
    expect(within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Quincenal",
      "Mensual",
      "Bimestral",
      "Anual",
    ]);
    expect(within(grupo).getByRole("radio", { name: "Mensual" })).toBeChecked();
  });

  it("D2, D6: el tipo elegido viaja a la action junto a la empresa y el inicio del ciclo", async () => {
    const user = userEvent.setup();
    const { enviar, onGuardado } = montar();
    await custom(user, "Envíos Norte");
    await user.click(screen.getByRole("radio", { name: "Anual" }));
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).toMatchObject({
      visibilidad: "custom",
      organizacionId: SIN_PLAN,
      tipoCobro: "anual",
      inicioCiclo: MANANA,
      precio: { tipo: "monto", mensual: "50000", descuentos: {} },
      costoPorOrden: "100",
    });
    expect(onGuardado).toHaveBeenCalledWith(OK, "Norte a medida");
  });

  it("D6: un plan público no manda tipo de cobro ni inicio del ciclo", async () => {
    const user = userEvent.setup();
    const { enviar } = montar();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Libre");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).not.toHaveProperty("tipoCobro");
    expect(enviar.mock.calls[0]![0]).not.toHaveProperty("inicioCiclo");
  });
});

describe("D3 — un rechazo de la asignación no cierra el formulario", () => {
  it("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28): un custom sin costo base ni costo por orden se envía y, con `ok`, se guarda sin errores de costo", async () => {
    const user = userEvent.setup();
    const { enviar, onGuardado } = montar();
    await custom(user, "Envíos Norte");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).toMatchObject({ precio: { tipo: "sin_precio" }, costoPorOrden: null });
    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(OK, "Norte a medida"));
    expect(
      screen.queryByText("Para asignarlo a la empresa, el plan necesita costo base con monto y costo por orden."),
    ).toBeNull();
  });

  it("D3: `not_found` → junto a «Empresa»", async () => {
    const user = userEvent.setup();
    const { onGuardado } = montar(vi.fn<Enviar>().mockResolvedValue({ estado: "not_found" }));
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    const empresa = screen.getByRole("combobox", { name: "Empresa" });
    await waitFor(() => expect(empresa).toHaveAttribute("aria-invalid", "true"));
    expect(empresa).toHaveAccessibleDescription("Esa empresa ya no existe.");
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it("D3: `tope_excedido` → su mensaje en el aviso general, con el formulario abierto y lo escrito", async () => {
    const user = userEvent.setup();
    const mensaje = "Reparto Sur ya tiene 8 usuarios activos con el rol Mensajero y el plan permite 5.";
    const { onGuardado } = montar(
      vi.fn<Enviar>().mockResolvedValue({
        estado: "tope_excedido",
        excedidos: [{ organizacionId: CON_PLAN, empresa: "Reparto Sur", tope: "mensajero", usados: 8, maximo: 5 }],
        mensaje,
      }),
    );
    await custom(user, "Reparto Sur");
    await user.type(screen.getByLabelText("Usuarios activos con el rol Mensajero"), "5");
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(mensaje);
    expect(onGuardado).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Usuarios activos con el rol Mensajero")).toHaveValue("5");
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeEnabled();
  });

  it("D3: un `validation_error` de `inicioCiclo` va junto al campo de la fecha", async () => {
    const user = userEvent.setup();
    const { onGuardado } = montar(
      vi.fn<Enviar>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { inicioCiclo: ["Elige una fecha entre el 2026-09-29 y el 2026-11-29."] },
      }),
    );
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    const campo = campoInicio()!;
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription(expect.stringContaining("Elige una fecha entre el 2026-09-29 y el 2026-11-29."));
    expect(onGuardado).not.toHaveBeenCalled();
  });
});
