// @vitest-environment jsdom
// SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (design §4.2; R8–R10, R13, R14) — el paso «Niveles»
// del formulario de planes: agregar, escribir la meta, elegir el tipo y el valor del descuento, quitar y renumerar;
// el tope de 10; la lista vacía; los errores bajo su campo; los niveles del plan al editar; y su fila en «Revisar».
//
// Se monta el `PlanForm` REAL con las actions como dobles (las inyecta la página). La ida y vuelta del borrador
// la cubre `unit/planes/plan-form-borrador.test.ts` (R11).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { CrearPlanInput, EditarPlanInput, PlanDTO, PlanResult } from "@/lib/types/planes";

import { avanzarHasta, botonDeLaLista, conBorrador, conBorradorDeCambio, terminar, tituloDelPasoActual } from "./plan-form-pasos";

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
  niveles: [
    { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10.00" } },
    { meta: 500, descuento: { tipo: "monto", monto: "1500.00" } },
  ],
};

type Crear = (input: CrearPlanInput) => Promise<PlanResult>;
type Editar = (input: EditarPlanInput) => Promise<PlanResult>;

afterEach(() => cleanup());

function montarCrear(enviar = vi.fn<Crear>().mockResolvedValue(OK)) {
  const props = conBorrador(enviar);
  render(
    <PlanForm
      modo="crear"
      empresas={[]}
      inicioCicloPorDefecto={MANANA}
      rangoInicioCiclo={RANGO}
      rangoFechaDeEfecto={RANGO}
      {...props}
      previsualizar={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
      onGuardado={vi.fn()}
    />,
  );
  return { enviar, acciones: props.borrador };
}

function montarEditar(plan: PlanDTO = PLAN, enviar = vi.fn<Editar>().mockResolvedValue(OK)) {
  const props = conBorradorDeCambio(enviar);
  render(<PlanForm modo="editar" plan={plan} precioDesdePorDefecto={MANANA} {...props} onGuardado={vi.fn()} />);
  return { enviar, acciones: props.borrador };
}

const meta = (n: number) => screen.getByRole("textbox", { name: `Meta de órdenes al mes del nivel ${n}` });
const valor = (n: number) => screen.getByRole("textbox", { name: `Descuento del nivel ${n}` });
const tipo = (n: number) => screen.getByRole("radiogroup", { name: `Tipo de descuento del nivel ${n}` });
const boton = (nombre: string) => screen.getByRole("button", { name: nombre });
const agregar = () => boton("Agregar nivel");
/** Las metas de la lista, en el orden de pantalla. */
const metas = () =>
  screen
    .queryAllByRole("textbox", { name: /^Meta de órdenes al mes del nivel \d+$/ })
    .map((el) => (el as HTMLInputElement).value);
/** Los rótulos «Nivel n» de las filas, en orden. */
const rotulos = () => screen.queryAllByRole("heading", { name: /^Nivel \d+$/ }).map((h) => h.textContent);

async function elegirTipo(user: UserEvent, n: number, nombre: "Porcentaje" | "Monto fijo") {
  await user.click(within(tipo(n)).getByRole("radio", { name: nombre }));
}

/** Una fila nueva con su meta, su tipo y su valor. */
async function nuevoNivel(user: UserEvent, n: number, m: string, forma: "Porcentaje" | "Monto fijo", v: string) {
  await user.click(agregar());
  await user.type(meta(n), m);
  if (forma === "Monto fijo") await elegirTipo(user, n, forma);
  await user.type(valor(n), v);
}

/** Llega a «Niveles» al crear, con un nombre válido. */
async function crearHastaNiveles(user: UserEvent) {
  const montado = montarCrear();
  await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
  await avanzarHasta(user, "Niveles");
  return montado;
}

describe("SLT-215 R8 — editar la lista de niveles", () => {
  it("R8: agregar al final en porcentaje con el foco en la meta, elegir el tipo, quitar y renumerar; se envía en orden", async () => {
    const user = userEvent.setup();
    const { enviar } = await crearHastaNiveles(user);

    await user.click(agregar());
    expect(meta(1)).toHaveFocus();
    expect(within(tipo(1)).getByRole("radio", { name: "Porcentaje" })).toBeChecked();
    await user.type(meta(1), "100");
    await user.type(valor(1), "10");
    await nuevoNivel(user, 2, "300", "Porcentaje", "5");
    await nuevoNivel(user, 3, "500", "Monto fijo", "1500");
    expect(within(tipo(3)).getByRole("radio", { name: "Monto fijo" })).toBeChecked();
    expect(rotulos()).toEqual(["Nivel 1", "Nivel 2", "Nivel 3"]);
    expect(metas()).toEqual(["100", "300", "500"]);

    // Cambiar el tipo conserva el valor escrito.
    await elegirTipo(user, 2, "Monto fijo");
    expect(valor(2)).toHaveValue("5");
    await elegirTipo(user, 2, "Porcentaje");

    // Quitar el 2 renumera los de después.
    await user.click(boton("Quitar nivel 2"));
    expect(rotulos()).toEqual(["Nivel 1", "Nivel 2"]);
    expect(metas()).toEqual(["100", "500"]);
    expect(valor(2)).toHaveValue("1500");
    expect(within(tipo(2)).getByRole("radio", { name: "Monto fijo" })).toBeChecked();

    await terminar(user);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].niveles).toEqual([
      { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10" } },
      { meta: 500, descuento: { tipo: "monto", monto: "1500" } },
    ]);
  });

  it("R8: con 10 niveles «Agregar nivel» queda deshabilitado; al quitar uno vuelve", async () => {
    const user = userEvent.setup();
    await crearHastaNiveles(user);
    for (let i = 0; i < 10; i++) await user.click(agregar());
    expect(rotulos()).toHaveLength(10);
    expect(agregar()).toBeDisabled();
    await user.click(boton("Quitar nivel 10"));
    expect(agregar()).toBeEnabled();
  });
});

describe("SLT-215 R9 — sin niveles", () => {
  it("R9: la lista vacía lo dice y deja guardar y continuar", async () => {
    const user = userEvent.setup();
    const { acciones } = await crearHastaNiveles(user);
    expect(screen.getByText("Este plan no tiene niveles.")).toBeInTheDocument();

    await user.click(boton("Guardar y continuar"));
    await waitFor(() => expect(tituloDelPasoActual()).toBe("Revisar y crear"));
    expect(acciones.guardarPaso).toHaveBeenLastCalledWith(
      expect.objectContaining({ paso: "niveles", valores: { niveles: [] } }),
    );
  });

  it("R9: quitar el último nivel vuelve a decir que no hay", async () => {
    const user = userEvent.setup();
    await crearHastaNiveles(user);
    await user.click(agregar());
    expect(screen.queryByText("Este plan no tiene niveles.")).toBeNull();
    await user.click(boton("Quitar nivel 1"));
    expect(screen.getByText("Este plan no tiene niveles.")).toBeInTheDocument();
  });
});

describe("SLT-215 R10 — validar al guardar el paso", () => {
  it("R10: una meta inválida, una que no crece y un porcentaje fuera de rango marcan su campo y no avanzan ni guardan", async () => {
    const user = userEvent.setup();
    const { acciones } = await crearHastaNiveles(user);
    await nuevoNivel(user, 1, "0", "Porcentaje", "10");
    await nuevoNivel(user, 2, "50", "Porcentaje", "5");
    await nuevoNivel(user, 3, "50", "Porcentaje", "150");

    await user.click(boton("Guardar y continuar"));
    await waitFor(() => expect(meta(1)).toHaveAttribute("aria-invalid", "true"));
    expect(tituloDelPasoActual()).toBe("Niveles");
    // R3: la meta de al menos 1 y la que no crece; el foco va al primer campo con error.
    expect(meta(1)).toHaveAccessibleDescription("Escribe una meta de al menos 1 orden.");
    expect(meta(1)).toHaveFocus();
    expect(meta(2)).not.toHaveAttribute("aria-invalid");
    expect(meta(3)).toHaveAttribute("aria-invalid", "true");
    expect(meta(3)).toHaveAccessibleDescription("La meta debe ser mayor que la del nivel anterior.");
    // R4: el porcentaje fuera de (0, 100] en su campo.
    expect(valor(3)).toHaveAttribute("aria-invalid", "true");
    expect(valor(1)).not.toHaveAttribute("aria-invalid");
    expect(acciones.guardarPaso).not.toHaveBeenCalledWith(expect.objectContaining({ paso: "niveles" }));

    // Corregido, guarda y avanza.
    await user.clear(meta(1));
    await user.type(meta(1), "10");
    await user.clear(meta(3));
    await user.type(meta(3), "80");
    await user.clear(valor(3));
    await user.type(valor(3), "15");
    await user.click(boton("Guardar y continuar"));
    await waitFor(() => expect(tituloDelPasoActual()).toBe("Revisar y crear"));
  });

  it("R10: un monto de 0 marca su campo; una meta que no es entera también", async () => {
    const user = userEvent.setup();
    await crearHastaNiveles(user);
    await nuevoNivel(user, 1, "1.5", "Monto fijo", "0");
    await user.click(boton("Guardar y continuar"));
    await waitFor(() => expect(valor(1)).toHaveAttribute("aria-invalid", "true"));
    expect(meta(1)).toHaveAccessibleDescription("Escribe una meta de al menos 1 orden.");
    expect(tituloDelPasoActual()).toBe("Niveles");
  });

  it("R10: un error del servidor en `niveles.<i>.descuento.monto` va bajo su campo", async () => {
    const user = userEvent.setup();
    const { acciones } = await crearHastaNiveles(user);
    await nuevoNivel(user, 1, "10", "Monto fijo", "100");
    acciones.guardarPaso.mockResolvedValueOnce({
      estado: "validation_error",
      fieldErrors: { "niveles.0.descuento.monto": ["Monto inválido."] },
    });
    await user.click(boton("Guardar y continuar"));
    await waitFor(() => expect(valor(1)).toHaveAttribute("aria-invalid", "true"));
    expect(valor(1)).toHaveAccessibleDescription("Monto inválido.");
    expect(tituloDelPasoActual()).toBe("Niveles");
  });
});

describe("SLT-215 R13 — al editar", () => {
  it("R13: el paso abre con los niveles vigentes del plan, en su orden, con su meta y su descuento", async () => {
    const user = userEvent.setup();
    montarEditar();
    await avanzarHasta(user, "Niveles");
    expect(metas()).toEqual(["100", "500"]);
    expect(within(tipo(1)).getByRole("radio", { name: "Porcentaje" })).toBeChecked();
    expect(valor(1)).toHaveValue("10.00");
    expect(within(tipo(2)).getByRole("radio", { name: "Monto fijo" })).toBeChecked();
    expect(valor(2)).toHaveValue("1500");
  });

  it("R13: sin tocarlos, se programan los mismos", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();
    await terminar(user);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].niveles).toEqual([
      { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10.00" } },
      { meta: 500, descuento: { tipo: "monto", monto: "1500" } },
    ]);
  });
});

describe("SLT-215 R14 — «Revisar»", () => {
  /** La fila «Niveles» de «Revisar»: su `<dd>`. */
  const filaDeNiveles = () =>
    Array.from(document.querySelectorAll("dl dt")).find((dt) => dt.textContent === "Niveles")?.nextElementSibling ??
    null;
  const lineas = (lista: HTMLElement) => within(lista).getAllByRole("listitem").map((li) => li.textContent);

  it("R14: al crear lista los niveles en orden, tras «Beneficios»", async () => {
    const user = userEvent.setup();
    await crearHastaNiveles(user);
    await nuevoNivel(user, 1, "100", "Porcentaje", "10");
    await nuevoNivel(user, 2, "500", "Monto fijo", "1500");
    await avanzarHasta(user, "Revisar y crear");

    const claves = Array.from(document.querySelectorAll("dl dt")).map((dt) => dt.textContent);
    expect(claves.indexOf("Niveles")).toBe(claves.indexOf("Beneficios") + 1);
    const fila = filaDeNiveles() as HTMLElement;
    expect(lineas(within(fila).getByRole("list", { name: "Niveles" }))).toEqual([
      "Nivel 1: desde 100 órdenes, −10.00 %",
      "Nivel 2: desde 500 órdenes, −1500.00",
    ]);
  });

  it("R14: al crear sin niveles dice «Sin niveles»", async () => {
    const user = userEvent.setup();
    await crearHastaNiveles(user);
    await avanzarHasta(user, "Revisar y crear");
    expect(filaDeNiveles()).toHaveTextContent(/^Sin niveles$/);
  });

  it("R14: al editar, si cambian, «antes → después»; si no, no hay fila", async () => {
    const user = userEvent.setup();
    montarEditar();
    await avanzarHasta(user, "Revisar y programar");
    expect(filaDeNiveles()).toBeNull();
    expect(screen.getByText("Sin cambios.")).toBeInTheDocument();

    await user.click(botonDeLaLista("Niveles"));
    await user.click(boton("Quitar nivel 1"));
    await avanzarHasta(user, "Revisar y programar");
    const [antes, despues] = within(filaDeNiveles() as HTMLElement).getAllByRole("list", { name: "Niveles" });
    expect(lineas(antes!)).toEqual(["Nivel 1: desde 100 órdenes, −10.00 %", "Nivel 2: desde 500 órdenes, −1500.00"]);
    expect(lineas(despues!)).toEqual(["Nivel 1: desde 500 órdenes, −1500.00"]);
    expect(screen.queryByText("Sin cambios.")).toBeNull();
  });

  it("R14: un plan que se queda sin niveles dice «Sin niveles» después", async () => {
    const user = userEvent.setup();
    montarEditar({ ...PLAN, niveles: [PLAN.niveles![0]!] });
    await avanzarHasta(user, "Niveles");
    await user.click(boton("Quitar nivel 1"));
    await avanzarHasta(user, "Revisar y programar");
    expect(within(filaDeNiveles() as HTMLElement).getByText("Sin niveles")).toBeInTheDocument();
  });
});
