// @vitest-environment jsdom
// SLT-130 (R10–R13; design §5) — los descuentos del plan como lista de líneas, en el paso «Precio y
// descuentos»: cada línea tiene período, valor, tipo («Fijo» o «%») y un botón para quitarla, y viaja a la
// action como el descuento de su período. Se conservan los casos de SLT-86 (R16, R22, R23, R25) sobre los
// errores de descuento de la action, «Rige desde» al editar el precio y la fecha de efecto del custom para
// una empresa con plan, ahora navegando por los pasos.
//
// Se monta el `PlanForm` REAL con la action como doble (la inyecta la página): se mide lo que viaja a la
// action y lo que se pinta.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlanForm, type EmpresaParaCustom } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { CrearPlanInput, EditarPlanInput, PlanDTO, PlanResult } from "@/lib/types/planes";

import { avanzarHasta, terminar } from "./plan-form-pasos";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const CON_PLAN = "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61";
const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };
const EMPRESAS: EmpresaParaCustom[] = [
  { id: CON_PLAN, nombre: "Reparto Sur", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" },
];
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
const RANGO_EFECTO = { hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" };
const MANANA = "2026-10-30";

const PRECIO = "Precio y descuentos";
const VIGENCIA = "Cuándo rige";

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

function montarEditar(enviar = vi.fn<Editar>().mockResolvedValue(OK), plan: PlanDTO = PLAN) {
  render(<PlanForm modo="editar" plan={plan} precioDesdePorDefecto={MANANA} enviar={enviar} onGuardado={vi.fn()} />);
  return enviar;
}

/** La línea de descuento de ese período: un `fieldset` con la leyenda «Descuento <período>». */
const linea = (periodo: string) => screen.getByRole("group", { name: `Descuento ${periodo}` });
const valorDe = (periodo: string) => within(linea(periodo)).getByRole("textbox", { name: "Valor" });
const lineas = () =>
  screen.queryAllByRole("group", { name: /^Descuento / }).map((g) => g.querySelector("legend")?.textContent);
const agregar = () => screen.getByRole("button", { name: "Agregar descuento" });

/** Escribe el valor de la línea de ese período y, si se pide, elige su tipo. */
async function escribir(user: Usuario, periodo: string, valor: string, tipo?: "Fijo" | "%") {
  if (tipo !== undefined) await user.click(within(linea(periodo)).getByRole("radio", { name: tipo }));
  const campo = valorDe(periodo);
  await user.clear(campo);
  await user.type(campo, valor);
}

/** General con nombre y, en «Precio y descuentos», «Con monto» con su costo base mensual. */
async function conMonto(user: Usuario, mensual: string) {
  await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
  await avanzarHasta(user, PRECIO);
  await user.click(screen.getByRole("radio", { name: "Con monto" }));
  await user.type(screen.getByLabelText("Costo base mensual"), mensual);
}

describe("SLT-130 R10–R13 — los descuentos como lista de líneas", () => {
  it("R10: cada línea viaja como el descuento de su período", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    await user.click(agregar());
    await escribir(user, "quincenal", "5");
    await user.click(agregar());
    await escribir(user, "mensual", "1000", "Fijo");
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].precio).toEqual({
      tipo: "monto",
      mensual: "50000",
      descuentos: {
        quincenal: { tipo: "porcentaje", porcentaje: "5" },
        mensual: { tipo: "monto", monto: "1000" },
      },
    });
  });

  it("R10: cambiar el tipo conserva el valor", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    await user.click(agregar());
    await escribir(user, "quincenal", "12");

    await user.click(within(linea("quincenal")).getByRole("radio", { name: "Fijo" }));
    expect(valorDe("quincenal")).toHaveValue("12");
    await user.click(within(linea("quincenal")).getByRole("radio", { name: "%" }));
    expect(valorDe("quincenal")).toHaveValue("12");
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].precio).toEqual({
      tipo: "monto",
      mensual: "50000",
      descuentos: { quincenal: { tipo: "porcentaje", porcentaje: "12" } },
    });
  });

  it("R11: agrega el primer período libre", async () => {
    const user = userEvent.setup();
    montarCrear();
    await conMonto(user, "50000");

    await user.click(agregar());
    expect(lineas()).toEqual(["Descuento quincenal"]);
    // Tipo «%» por defecto y el valor vacío.
    expect(within(linea("quincenal")).getByRole("radio", { name: "%" })).toBeChecked();
    expect(valorDe("quincenal")).toHaveValue("");

    await user.click(agregar());
    expect(lineas()).toEqual(["Descuento quincenal", "Descuento mensual"]);

    // Quitado el quincenal, el primer período libre vuelve a ser ese.
    await user.click(screen.getByRole("button", { name: "Quitar descuento quincenal" }));
    await user.click(agregar());
    expect(lineas()).toEqual(["Descuento mensual", "Descuento quincenal"]);
  });

  it("R11: no repite período", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    await user.click(agregar());
    await user.click(agregar());
    await escribir(user, "mensual", "3");

    await user.click(within(linea("mensual")).getByRole("combobox", { name: "Período" }));
    const opciones = within(await screen.findByRole("listbox")).getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual(["Mensual", "Bimestral", "Anual"]);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Anual" }));

    expect(lineas()).toEqual(["Descuento quincenal", "Descuento anual"]);
    expect(valorDe("anual")).toHaveValue("3");
    await escribir(user, "quincenal", "1");
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].precio).toEqual({
      tipo: "monto",
      mensual: "50000",
      descuentos: {
        quincenal: { tipo: "porcentaje", porcentaje: "1" },
        anual: { tipo: "porcentaje", porcentaje: "3" },
      },
    });
  });

  it("R11: con cuatro líneas no agrega más", async () => {
    const user = userEvent.setup();
    montarCrear();
    await conMonto(user, "50000");
    for (let i = 0; i < 3; i++) await user.click(agregar());
    expect(agregar()).toBeEnabled();
    await user.click(agregar());

    expect(lineas()).toEqual(["Descuento quincenal", "Descuento mensual", "Descuento bimestral", "Descuento anual"]);
    expect(agregar()).toBeDisabled();
    await user.click(agregar());
    expect(lineas()).toHaveLength(4);
  });

  it("R12: lista vacía", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");

    expect(screen.getByText("Sin descuentos. Todas las empresas pagan el costo base completo.")).toBeInTheDocument();
    expect(lineas()).toEqual([]);
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].precio).toEqual({ tipo: "monto", mensual: "50000", descuentos: {} });
  });

  it("R12: quitar una línea", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    await user.click(agregar());
    await escribir(user, "quincenal", "5");
    await user.click(agregar());
    await escribir(user, "mensual", "10");
    await user.click(screen.getByRole("button", { name: "Quitar descuento quincenal" }));

    expect(lineas()).toEqual(["Descuento mensual"]);
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].precio).toEqual({
      tipo: "monto",
      mensual: "50000",
      descuentos: { mensual: { tipo: "porcentaje", porcentaje: "10" } },
    });
  });

  it("R13: al editar abre con los descuentos del plan", async () => {
    const user = userEvent.setup();
    montarEditar(undefined, {
      ...PLAN,
      precio: {
        tipo: "monto",
        mensual: "50000.00",
        descuentos: {
          anual: { tipo: "porcentaje", porcentaje: "10.00" },
          quincenal: { tipo: "monto", monto: "1000.00" },
        },
      },
    });
    await avanzarHasta(user, PRECIO);

    // Una línea por período, en el orden de los períodos (no en el del objeto del plan).
    expect(lineas()).toEqual(["Descuento quincenal", "Descuento anual"]);
    expect(within(linea("quincenal")).getByRole("radio", { name: "Fijo" })).toBeChecked();
    // El monto se pinta como en todo campo de monto (`montoParaCampo`): «1000», no «1000.00».
    expect(valorDe("quincenal")).toHaveValue("1000");
    expect(within(linea("anual")).getByRole("radio", { name: "%" })).toBeChecked();
    expect(valorDe("anual")).toHaveValue("10.00");
  });

  it("R23: «Sin precio» no muestra descuentos", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await avanzarHasta(user, PRECIO);
    expect(screen.queryByRole("button", { name: "Agregar descuento" })).toBeNull();
    expect(lineas()).toEqual([]);
  });
});

describe("SLT-86 R10, R23 — los errores de un descuento van junto a su línea", () => {
  it("R10, R23: un porcentaje fuera de rango no deja avanzar y el error va junto a su línea", async () => {
    const user = userEvent.setup();
    const enviar = montarCrear();
    await conMonto(user, "50000");
    await user.click(agregar());
    await user.click(agregar());
    await user.click(agregar());
    await escribir(user, "bimestral", "150");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    const campo = valorDe("bimestral");
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("heading", { name: PRECIO })).toBeInTheDocument();
    expect(enviar).not.toHaveBeenCalled();
    expect(campo).toHaveValue("150");
  });

  it("R23: un validation_error de la action en `precio.descuentos.<periodo>.monto` va junto a su línea y conserva lo escrito", async () => {
    const user = userEvent.setup();
    const enviar = vi.fn<Crear>().mockResolvedValue({
      estado: "validation_error",
      fieldErrors: { "precio.descuentos.anual.monto": ["Monto inválido."] },
    });
    montarCrear(enviar);
    await conMonto(user, "50000");
    for (let i = 0; i < 4; i++) await user.click(agregar());
    await user.click(screen.getByRole("button", { name: "Quitar descuento quincenal" }));
    await user.click(screen.getByRole("button", { name: "Quitar descuento mensual" }));
    await user.click(screen.getByRole("button", { name: "Quitar descuento bimestral" }));
    await escribir(user, "anual", "60000", "Fijo");
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    // R25: vuelve al paso del campo con error.
    await waitFor(() => expect(screen.getByRole("heading", { name: PRECIO })).toBeInTheDocument());
    const campo = valorDe("anual");
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription("Monto inválido.");
    expect(campo).toHaveValue("60000");
    await waitFor(() => expect(campo).toHaveFocus());
  });

  it("R23: un error del descuento entero va junto a su línea", async () => {
    const user = userEvent.setup();
    montarCrear(
      vi.fn<Crear>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { "precio.descuentos.quincenal": ["Descuento inválido."] },
      }),
    );
    await conMonto(user, "50000");
    await user.click(agregar());
    await escribir(user, "quincenal", "10", "Fijo");
    await terminar(user);

    await waitFor(() => expect(screen.getByRole("heading", { name: PRECIO })).toBeInTheDocument());
    const tipo = within(linea("quincenal")).getByRole("radiogroup", { name: "Tipo del descuento" });
    await waitFor(() => expect(tipo).toHaveAttribute("aria-invalid", "true"));
    expect(linea("quincenal")).toHaveAccessibleDescription("Descuento inválido.");
  });
});

describe("SLT-86 R22, R23 — «Rige desde» al editar el precio", () => {
  it("R23: sin tocar el precio sigue «Aplicar» (SLT-58) y no se pide «Rige desde»", async () => {
    const user = userEvent.setup();
    montarEditar();
    await avanzarHasta(user, VIGENCIA);
    expect(screen.getByRole("radiogroup", { name: "Aplicar" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Rige desde")).toBeNull();
  });

  it("R23: cambiar el costo base pide «Rige desde» con mañana por defecto y su ayuda, en lugar de «Aplicar»", async () => {
    const user = userEvent.setup();
    const enviar = montarEditar();
    await avanzarHasta(user, PRECIO);
    const mensual = screen.getByLabelText("Costo base mensual");
    await user.clear(mensual);
    await user.type(mensual, "60000");
    await avanzarHasta(user, VIGENCIA);

    const fecha = screen.getByLabelText("Rige desde");
    expect(fecha).toHaveAttribute("type", "date");
    expect(fecha).toHaveValue(MANANA);
    expect(fecha).toHaveAccessibleDescription(
      "Cada empresa paga el precio nuevo desde su primer período que empiece en esa fecha o después.",
    );
    expect(screen.queryByRole("radiogroup", { name: "Aplicar" })).toBeNull();

    await terminar(user);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0]).toMatchObject({
      precio: { tipo: "monto", mensual: "60000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
      vigenteDesde: MANANA,
    });
  });

  it("R22, R23: cambiar solo un descuento también la pide, y la fecha elegida viaja a la action", async () => {
    const user = userEvent.setup();
    const enviar = montarEditar();
    await avanzarHasta(user, PRECIO);
    await user.click(agregar());
    await escribir(user, "quincenal", "5000", "Fijo");
    await avanzarHasta(user, VIGENCIA);
    const fecha = screen.getByLabelText("Rige desde");
    await user.clear(fecha);
    await user.type(fecha, "2026-11-16");
    await terminar(user);

    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].vigenteDesde).toBe("2026-11-16");
    expect(enviar.mock.calls[0]![0].precio).toMatchObject({
      descuentos: { quincenal: { tipo: "monto", monto: "5000" }, anual: { tipo: "porcentaje", porcentaje: "10.00" } },
    });
  });

  it("R23: «10» y el «10.00» guardado son el mismo descuento: no pide fecha", async () => {
    const user = userEvent.setup();
    montarEditar();
    await avanzarHasta(user, PRECIO);
    await escribir(user, "anual", "10");
    await avanzarHasta(user, VIGENCIA);
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
    await avanzarHasta(user, PRECIO);
    const mensual = screen.getByLabelText("Costo base mensual");
    await user.clear(mensual);
    await user.type(mensual, "60000");
    await terminar(user);

    await waitFor(() => expect(screen.getByRole("heading", { name: VIGENCIA })).toBeInTheDocument());
    const fecha = screen.getByLabelText("Rige desde");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    expect(fecha).toHaveAccessibleDescription(expect.stringContaining("La fecha de efecto no puede ser anterior a hoy."));
    await user.click(within(screen.getByRole("navigation", { name: "Pasos" })).getByRole("button", { name: PRECIO }));
    expect(screen.getByLabelText("Costo base mensual")).toHaveValue("60000");
  });
});

describe("SLT-86 R16, R25 — el custom para una empresa que ya tiene plan", () => {
  /** General: custom de «Reparto Sur»; Precio: «Con monto». Vuelve a General por la lista de pasos. */
  async function customConPlan(user: Usuario, mensual: string, preparar?: () => Promise<void>) {
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    await user.click(screen.getByRole("combobox", { name: "Empresa" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Reparto Sur" }));
    await avanzarHasta(user, PRECIO);
    await user.click(screen.getByRole("radio", { name: "Con monto" }));
    await user.type(screen.getByLabelText("Costo base mensual"), mensual);
    await preparar?.();
    await user.click(within(screen.getByRole("navigation", { name: "Pasos" })).getByRole("button", { name: "General" }));
  }

  const tipoDeCobro = (tipo: string) =>
    within(screen.getByRole("radiogroup", { name: "Tipo de cobro" })).getByRole("radio", { name: tipo });

  it("R25: pide «Rige desde» con el inicio del siguiente período de la empresa, su rango y su ayuda", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000");

    const fecha = screen.getByLabelText("Rige desde");
    expect(fecha).toHaveValue("2026-11-01");
    expect(fecha).toHaveAttribute("min", RANGO_EFECTO.min);
    expect(fecha).toHaveAttribute("max", RANGO_EFECTO.max);
    expect(fecha).toHaveAccessibleDescription("Hasta esa fecha la empresa sigue con su plan y su período actuales.");
    expect(screen.queryByLabelText("Inicio del período")).toBeNull();
  });

  it("R25: muestra el costo base del primer período completo con el tipo elegido", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000");
    await user.click(tipoDeCobro("Quincenal"));

    expect(screen.getByText("Costo base quincenal: 15500.00")).toBeInTheDocument();
    expect(screen.getByText("Período: 2026-11-01 – 2026-11-15")).toBeInTheDocument();
  });

  it("R12, R25: con una fecha a mitad de período muestra el tramo y su costo proporcional", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000");
    await user.click(tipoDeCobro("Quincenal"));
    const fecha = screen.getByLabelText("Rige desde");
    await user.clear(fecha);
    await user.type(fecha, "2026-11-10");

    expect(screen.getByText("Costo base quincenal: 6200.00")).toBeInTheDocument();
    expect(screen.getByText("Período: 2026-11-10 – 2026-11-15 (tramo de 6 de 15 días)")).toBeInTheDocument();
  });

  it("R10, R12, R25: el costo del tramo lleva el descuento de su período", async () => {
    const user = userEvent.setup();
    montarCrear();
    await customConPlan(user, "31000", async () => {
      for (let i = 0; i < 4; i++) await user.click(agregar());
      await escribir(user, "anual", "10");
      for (const periodo of ["quincenal", "mensual", "bimestral"]) {
        await user.click(screen.getByRole("button", { name: `Quitar descuento ${periodo}` }));
      }
    });
    await user.click(tipoDeCobro("Anual"));
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
    await user.click(tipoDeCobro("Bimestral"));
    const fecha = screen.getByLabelText("Rige desde");
    await user.clear(fecha);
    await user.type(fecha, "2027-01-01");
    await terminar(user);

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
    await terminar(user);

    await waitFor(() => expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument());
    const fecha = screen.getByLabelText("Rige desde");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    expect(fecha).toHaveAccessibleDescription(expect.stringContaining("Elige una fecha entre el 2026-10-29 y el 2027-10-29."));
  });
});
