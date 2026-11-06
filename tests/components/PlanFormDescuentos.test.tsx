// @vitest-environment jsdom
// SLT-86 (design §7.1, §7.2; R23, R25) — el formulario del plan con un descuento por período y sin tope de
// órdenes, «Rige desde» al editar el precio y, en el custom para una empresa con plan, su fecha de efecto
// con el costo base del primer período o tramo.
//
// Se monta el `PlanForm` REAL con la action como doble (la inyecta la página): se mide lo que viaja a la
// action y lo que se pinta.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm, type EmpresaParaCustom } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { CrearPlanInput, EditarPlanInput, PlanDTO, PlanResult } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const CON_PLAN = "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61";
const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };
const EMPRESAS: EmpresaParaCustom[] = [
  { id: CON_PLAN, nombre: "Reparto Sur", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" },
];
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
const RANGO_EFECTO = { hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" };
const MANANA = "2026-10-30";
const TIPOS = ["quincenal", "mensual", "bimestral", "anual"] as const;

const PLAN: PlanDTO = {
  id: PLAN_ID,
  nombre: "Pro",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "monto", mensual: "50000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
  costoPorOrden: "100.00",
  costoPorOrdenPorcentual: null,
  archivado: false,
};

type Crear = (input: CrearPlanInput) => Promise<PlanResult>;
type Editar = (input: EditarPlanInput) => Promise<PlanResult>;
type Usuario = ReturnType<typeof userEvent.setup>;

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

const grupo = (tipo: string) => screen.getByRole("group", { name: `Descuento ${tipo}` });

async function elegir(user: Usuario, tipo: string, forma: "Ninguno" | "Porcentaje" | "Monto fijo", valor?: string) {
  await user.click(within(grupo(tipo)).getByRole("radio", { name: forma }));
  if (valor !== undefined) {
    const campo = within(grupo(tipo)).getByRole("textbox", { name: forma });
    await user.clear(campo);
    await user.type(campo, valor);
  }
}

async function conMonto(user: Usuario, mensual: string) {
  await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
  await user.click(screen.getByRole("radio", { name: "Con monto" }));
  await user.type(screen.getByLabelText("Costo base mensual"), mensual);
}

describe("SLT-86 R23 — un descuento por período, sin anual ni tope de órdenes", () => {
  it("R23: los cuatro períodos ofrecen «Ninguno», «Porcentaje» y «Monto fijo», con «Ninguno» marcado", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.click(screen.getByRole("radio", { name: "Con monto" }));

    for (const tipo of TIPOS) {
      const radios = within(grupo(tipo)).getByRole("radiogroup", { name: `Descuento ${tipo}` });
      expect(within(radios).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
        "Ninguno",
        "Porcentaje",
        "Monto fijo",
      ]);
      expect(within(radios).getByRole("radio", { name: "Ninguno" })).toBeChecked();
    }
  });

  it("R8, R23: no ofrece el precio anual fijo, el descuento anual de antes ni el tope de órdenes", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.click(screen.getByRole("radio", { name: "Con monto" }));

    expect(screen.queryByLabelText("Órdenes por ciclo")).toBeNull();
    expect(screen.queryByText("Pago anual")).toBeNull();
    expect(screen.queryByText("Monto anual fijo")).toBeNull();
    expect(screen.queryByText("Descuento sobre el anual")).toBeNull();
  });

  it("R23: «Sin precio» no muestra descuentos", () => {
    montarCrear();
    expect(screen.queryByRole("group", { name: "Descuento anual" })).toBeNull();
  });

  it("R23: envía solo el dato de la forma elegida y nada en los períodos con «Ninguno»", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    // Se escribe un porcentaje y luego se pasa a monto fijo: solo viaja el monto.
    await elegir(user, "quincenal", "Porcentaje", "5");
    await elegir(user, "quincenal", "Monto fijo", "1000");
    await elegir(user, "bimestral", "Monto fijo", "5000");
    await elegir(user, "anual", "Porcentaje", "10");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].precio).toEqual({
      tipo: "monto",
      mensual: "50000",
      descuentos: {
        quincenal: { tipo: "monto", monto: "1000" },
        bimestral: { tipo: "monto", monto: "5000" },
        anual: { tipo: "porcentaje", porcentaje: "10" },
      },
    });
    expect(enviar.mock.calls[0]![0].topes).toEqual({ porRol: {}, apiKeys: null });
  });

  it("R23: cambiar de forma no borra lo escrito; volver a «Ninguno» lo deja fuera del envío", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    await elegir(user, "mensual", "Porcentaje", "7.5");
    await elegir(user, "mensual", "Ninguno");
    await elegir(user, "mensual", "Porcentaje");
    expect(within(grupo("mensual")).getByRole("textbox", { name: "Porcentaje" })).toHaveValue("7.5");
    await elegir(user, "mensual", "Ninguno");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].precio).toEqual({ tipo: "monto", mensual: "50000", descuentos: {} });
  });

  it("R10, R23: un porcentaje fuera de rango no llega a la action y el error va junto a su campo", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    await elegir(user, "bimestral", "Porcentaje", "150");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    const campo = within(grupo("bimestral")).getByRole("textbox", { name: "Porcentaje" });
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(enviar).not.toHaveBeenCalled();
    expect(campo).toHaveValue("150");
  });

  it("R23: un validation_error de la action en `precio.descuentos.<periodo>.monto` va junto a su campo y conserva lo escrito", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn<Crear>().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: { "precio.descuentos.anual.monto": ["Monto inválido."] },
    });
    montarCrear(enviar);
    await conMonto(user, "50000");
    await elegir(user, "anual", "Monto fijo", "60000");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    const campo = within(grupo("anual")).getByRole("textbox", { name: "Monto fijo" });
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription("Monto inválido.");
    expect(campo).toHaveValue("60000");
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it("R23: un error del descuento entero va junto a su grupo", async () => {
    const user = userEvent.setup();
    montarCrear(
      vi.fn<Crear>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { "precio.descuentos.quincenal": ["Descuento inválido."] },
      }),
    );
    await conMonto(user, "50000");
    await elegir(user, "quincenal", "Monto fijo", "10");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    const radios = within(grupo("quincenal")).getByRole("radiogroup", { name: "Descuento quincenal" });
    await waitFor(() => expect(radios).toHaveAttribute("aria-invalid", "true"));
    expect(radios).toHaveAccessibleDescription("Descuento inválido.");
  });

  it("R23: al editar precarga los descuentos del plan", () => {
    montarEditar();
    expect(within(grupo("anual")).getByRole("radio", { name: "Porcentaje" })).toBeChecked();
    expect(within(grupo("anual")).getByRole("textbox", { name: "Porcentaje" })).toHaveValue("10.00");
    expect(within(grupo("mensual")).getByRole("radio", { name: "Ninguno" })).toBeChecked();
  });
});

describe("SLT-86 R22, R23 — «Rige desde» al editar el precio", () => {
  it("R23: sin tocar el precio sigue «Aplicar» (SLT-58) y no se pide «Rige desde»", () => {
    montarEditar();
    expect(screen.getByRole("radiogroup", { name: "Aplicar" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Rige desde")).toBeNull();
  });

  it("R23: cambiar el costo base pide «Rige desde» con mañana por defecto y su ayuda, en lugar de «Aplicar»", async () => {
    const user = userEvent.setup();
    const enviar = montarEditar();
    const mensual = screen.getByLabelText("Costo base mensual");
    await user.clear(mensual);
    await user.type(mensual, "60000");

    const fecha = screen.getByLabelText("Rige desde");
    expect(fecha).toHaveAttribute("type", "date");
    expect(fecha).toHaveValue(MANANA);
    expect(fecha).toHaveAccessibleDescription(
      "Cada empresa paga el precio nuevo desde su primer período que empiece en esa fecha o después.",
    );
    expect(screen.queryByRole("radiogroup", { name: "Aplicar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).toMatchObject({
      precio: { tipo: "monto", mensual: "60000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
      vigenteDesde: MANANA,
    });
  });

  it("R22, R23: cambiar solo un descuento también la pide, y la fecha elegida viaja a la action", async () => {
    const user = userEvent.setup();
    const enviar = montarEditar();
    await elegir(user, "bimestral", "Monto fijo", "5000");
    const fecha = screen.getByLabelText("Rige desde");
    await user.clear(fecha);
    await user.type(fecha, "2026-11-16");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].vigenteDesde).toBe("2026-11-16");
  });

  it("R23: «10» y el «10.00» guardado son el mismo descuento: no pide fecha", async () => {
    const user = userEvent.setup();
    montarEditar();
    await elegir(user, "anual", "Porcentaje", "10");
    expect(screen.queryByLabelText("Rige desde")).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Aplicar" })).toBeInTheDocument();
  });

  it("R22, R23: un validation_error de `vigenteDesde` va junto a «Rige desde» y conserva el precio escrito", async () => {
    const user = userEvent.setup();
    montarEditar(
      vi.fn<Editar>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { vigenteDesde: ["La fecha de efecto no puede ser anterior a hoy."] },
      }),
    );
    const mensual = screen.getByLabelText("Costo base mensual");
    await user.clear(mensual);
    await user.type(mensual, "60000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const fecha = screen.getByLabelText("Rige desde");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    expect(fecha).toHaveAccessibleDescription(expect.stringContaining("La fecha de efecto no puede ser anterior a hoy."));
    expect(screen.getByLabelText("Costo base mensual")).toHaveValue("60000");
  });
});

describe("SLT-86 R16, R25 — el custom para una empresa que ya tiene plan", () => {
  async function customConPlan(user: Usuario, mensual: string) {
    await conMonto(user, mensual);
    await user.type(screen.getByLabelText("Costo por orden"), "100");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    await user.click(screen.getByRole("combobox", { name: "Empresa" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Reparto Sur" }));
  }

  it("R25: pide «Rige desde» con el inicio del siguiente período de la empresa, su rango y su ayuda", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000");

    const fecha = screen.getByLabelText("Rige desde");
    expect(fecha).toHaveValue("2026-11-01");
    expect(fecha).toHaveAttribute("min", RANGO_EFECTO.min);
    expect(fecha).toHaveAttribute("max", RANGO_EFECTO.max);
    expect(fecha).toHaveAccessibleDescription("Hasta esa fecha la empresa sigue con su plan y su período actuales.");
    expect(screen.queryByLabelText("Inicio del ciclo de órdenes")).toBeNull();
  });

  it("R25: muestra el costo base del primer período completo con el tipo elegido", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000");
    await user.click(screen.getByRole("radio", { name: "Quincenal" }));

    expect(screen.getByText("Costo base quincenal: 15500.00")).toBeInTheDocument();
    expect(screen.getByText("Período: 2026-11-01 – 2026-11-15")).toBeInTheDocument();
  });

  it("R12, R25: con una fecha a mitad de período muestra el tramo y su costo proporcional", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000");
    await user.click(screen.getByRole("radio", { name: "Quincenal" }));
    const fecha = screen.getByLabelText("Rige desde");
    await user.clear(fecha);
    await user.type(fecha, "2026-11-10");

    expect(screen.getByText("Costo base quincenal: 6200.00")).toBeInTheDocument();
    expect(screen.getByText("Período: 2026-11-10 – 2026-11-15 (tramo de 6 de 15 días)")).toBeInTheDocument();
  });

  it("R10, R12, R25: el costo del tramo lleva el descuento de su período", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000");
    await elegir(user, "anual", "Porcentaje", "10");
    await user.click(screen.getByRole("radio", { name: "Anual" }));
    const fecha = screen.getByLabelText("Rige desde");
    await user.clear(fecha);
    await user.type(fecha, "2026-11-05");

    // 31 000 × 12 × 0.90 = 334 800.00; 57 de 365 días → 52 283.84.
    expect(screen.getByText("Costo base anual: 52283.84")).toBeInTheDocument();
    expect(screen.getByText("Período: 2026-11-05 – 2026-12-31 (tramo de 57 de 365 días)")).toBeInTheDocument();
  });

  it("R16, R25: la fecha de efecto viaja a la action con el tipo elegido", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await customConPlan(user, "31000");
    await user.click(screen.getByRole("radio", { name: "Bimestral" }));
    const fecha = screen.getByLabelText("Rige desde");
    await user.clear(fecha);
    await user.type(fecha, "2027-01-01");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).toMatchObject({
      organizacionId: CON_PLAN,
      tipoCobro: "bimestral",
      vigenteDesde: "2027-01-01",
    });
    expect(enviar.mock.calls[0]![0]).not.toHaveProperty("inicioCiclo");
  });

  it("R16: un validation_error de `vigenteDesde` va junto a «Rige desde»", async () => {
    const user = userEvent.setup();
    montarCrear(
      vi.fn<Crear>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { vigenteDesde: ["Elige una fecha entre el 2026-10-29 y el 2027-10-29."] },
      }),
    );
    await customConPlan(user, "31000");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    const fecha = screen.getByLabelText("Rige desde");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    expect(fecha).toHaveAccessibleDescription(expect.stringContaining("Elige una fecha entre el 2026-10-29 y el 2027-10-29."));
  });
});
