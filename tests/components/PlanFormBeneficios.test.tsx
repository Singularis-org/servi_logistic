// @vitest-environment jsdom
// SLT-214 «Planes: beneficios de texto con ícono» (design §4.3; R5, R8–R10, R13, R14) — el paso «Beneficios» del
// formulario de planes: agregar, escribir, elegir ícono, subir, bajar y quitar; la lista vacía; los errores bajo
// su campo; los beneficios del plan al editar; y su fila en «Revisar».
//
// Se monta el `PlanForm` REAL con las actions como dobles (las inyecta la página). La ida y vuelta del borrador
// la cubre `unit/planes/plan-form-borrador.test.ts` (R11).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { PlanForm } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import { NOMBRE_DEL_ICONO, ICONOS_DE_BENEFICIO } from "@/lib/planes/beneficios";
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
  beneficios: [
    { icono: "soporte", texto: "Soporte 24 h" },
    { icono: "rayo", texto: "Acceso anticipado" },
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

const texto = (n: number) => screen.getByRole("textbox", { name: `Texto del beneficio ${n}` });
const icono = (n: number) => screen.getByRole("combobox", { name: `Ícono del beneficio ${n}` });
const boton = (nombre: string) => screen.getByRole("button", { name: nombre });
const agregar = () => boton("Agregar beneficio");
/** Los textos de la lista, en el orden de pantalla. */
const textos = () =>
  screen.queryAllByRole("textbox", { name: /^Texto del beneficio \d+$/ }).map((el) => (el as HTMLInputElement).value);

async function elegirIcono(user: UserEvent, n: number, nombre: string) {
  await user.click(icono(n));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: nombre }));
}

/** Llega a «Beneficios» al crear, con un nombre válido. */
async function crearHastaBeneficios(user: UserEvent) {
  const montado = montarCrear();
  await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Pro");
  await avanzarHasta(user, "Beneficios");
  return montado;
}

describe("SLT-214 R8 — editar la lista de beneficios", () => {
  it("R8: agregar al final con «Check» y el foco en el texto, escribir, elegir ícono, subir, bajar y quitar", async () => {
    const user = userEvent.setup();
    const { enviar } = await crearHastaBeneficios(user);

    await user.click(agregar());
    expect(texto(1)).toHaveFocus();
    expect(icono(1)).toHaveTextContent("Check");
    await user.type(texto(1), "Soporte 24 h");
    await user.click(agregar());
    expect(texto(2)).toHaveFocus();
    await user.type(texto(2), "Acceso anticipado");
    await elegirIcono(user, 2, "Rayo");
    expect(icono(2)).toHaveTextContent("Rayo");
    await user.click(agregar());
    await user.type(texto(3), "Features nuevas");
    expect(textos()).toEqual(["Soporte 24 h", "Acceso anticipado", "Features nuevas"]);

    // Subir está deshabilitado en la primera fila y bajar en la última.
    expect(boton("Subir beneficio 1")).toBeDisabled();
    expect(boton("Bajar beneficio 3")).toBeDisabled();
    expect(boton("Bajar beneficio 1")).toBeEnabled();

    await user.click(boton("Bajar beneficio 1"));
    expect(textos()).toEqual(["Acceso anticipado", "Soporte 24 h", "Features nuevas"]);
    // El ícono viaja con su fila.
    expect(icono(1)).toHaveTextContent("Rayo");
    await user.click(boton("Subir beneficio 3"));
    expect(textos()).toEqual(["Acceso anticipado", "Features nuevas", "Soporte 24 h"]);
    await user.click(boton("Quitar beneficio 2"));
    expect(textos()).toEqual(["Acceso anticipado", "Soporte 24 h"]);

    // El orden en pantalla es el que se guarda y el que se envía al confirmar.
    await terminar(user);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].beneficios).toEqual([
      { icono: "rayo", texto: "Acceso anticipado" },
      { icono: "check", texto: "Soporte 24 h" },
    ]);
  });

  it("R5: el selector ofrece los 12 íconos, en orden y con su nombre; cada ícono es decorativo", async () => {
    const user = userEvent.setup();
    await crearHastaBeneficios(user);
    await user.click(agregar());
    await user.click(icono(1));
    const opciones = within(await screen.findByRole("listbox")).getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual(ICONOS_DE_BENEFICIO.map((c) => NOMBRE_DEL_ICONO[c]));
    for (const opcion of opciones) {
      expect(opcion.querySelector("svg[data-icono]")).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("SLT-214 R9 — sin beneficios", () => {
  it("R9: la lista vacía lo dice y deja guardar y continuar", async () => {
    const user = userEvent.setup();
    const { acciones } = await crearHastaBeneficios(user);
    expect(screen.getByText("Este plan no tiene beneficios.")).toBeInTheDocument();

    await user.click(boton("Guardar y continuar"));
    // SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (R7): el siguiente es «Niveles».
    await waitFor(() => expect(tituloDelPasoActual()).toBe("Niveles"));
    expect(acciones.guardarPaso).toHaveBeenLastCalledWith(
      expect.objectContaining({ paso: "beneficios", valores: { beneficios: [] } }),
    );
  });

  it("R9: quitar el último beneficio vuelve a decir que no hay", async () => {
    const user = userEvent.setup();
    await crearHastaBeneficios(user);
    await user.click(agregar());
    expect(screen.queryByText("Este plan no tiene beneficios.")).toBeNull();
    await user.click(boton("Quitar beneficio 1"));
    expect(screen.getByText("Este plan no tiene beneficios.")).toBeInTheDocument();
  });
});

describe("SLT-214 R10 — validar al guardar el paso", () => {
  it("R10: un texto vacío y uno repetido marcan su campo y no avanzan ni guardan", async () => {
    const user = userEvent.setup();
    const { acciones } = await crearHastaBeneficios(user);
    await user.click(agregar());
    await user.type(texto(1), "Soporte 24 h");
    await user.click(agregar());
    await user.type(texto(2), " soporte  24 H");
    await user.click(agregar());

    await user.click(boton("Guardar y continuar"));
    await waitFor(() => expect(texto(2)).toHaveAttribute("aria-invalid", "true"));
    expect(tituloDelPasoActual()).toBe("Beneficios");
    expect(texto(1)).not.toHaveAttribute("aria-invalid");
    // R4: el repetido después del primero; R2: el vacío.
    expect(texto(2)).toHaveAccessibleDescription("Ya hay un beneficio con ese texto");
    expect(texto(3)).toHaveAttribute("aria-invalid", "true");
    expect(texto(3)).toHaveAccessibleDescription("Escribe el texto del beneficio.");
    // El foco va al primer campo con error.
    expect(texto(2)).toHaveFocus();
    expect(acciones.guardarPaso).not.toHaveBeenCalledWith(expect.objectContaining({ paso: "beneficios" }));

    // Corregido, guarda y avanza.
    await user.clear(texto(2));
    await user.type(texto(2), "Acceso anticipado");
    await user.click(boton("Quitar beneficio 3"));
    await user.click(boton("Guardar y continuar"));
    // SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (R7): el siguiente es «Niveles».
    await waitFor(() => expect(tituloDelPasoActual()).toBe("Niveles"));
  });

  it("R10: un error del servidor en `beneficios.<i>.texto` va bajo su campo", async () => {
    const user = userEvent.setup();
    const { acciones } = await crearHastaBeneficios(user);
    await user.click(agregar());
    await user.type(texto(1), "Soporte");
    acciones.guardarPaso.mockResolvedValueOnce({
      estado: "validation_error",
      fieldErrors: { "beneficios.0.texto": ["El texto del beneficio admite hasta 120 caracteres."] },
    });
    await user.click(boton("Guardar y continuar"));
    await waitFor(() => expect(texto(1)).toHaveAttribute("aria-invalid", "true"));
    expect(texto(1)).toHaveAccessibleDescription("El texto del beneficio admite hasta 120 caracteres.");
    expect(tituloDelPasoActual()).toBe("Beneficios");
  });

  it("R2: el texto admite hasta 120 caracteres en el campo", async () => {
    const user = userEvent.setup();
    await crearHastaBeneficios(user);
    await user.click(agregar());
    expect(texto(1)).toHaveAttribute("maxLength", "120");
  });
});

describe("SLT-214 R13 — al editar", () => {
  it("R13: el paso abre con los beneficios vigentes del plan, en su orden y con su ícono", async () => {
    const user = userEvent.setup();
    montarEditar();
    await avanzarHasta(user, "Beneficios");
    expect(textos()).toEqual(["Soporte 24 h", "Acceso anticipado"]);
    expect(icono(1)).toHaveTextContent("Soporte");
    expect(icono(2)).toHaveTextContent("Rayo");
  });

  it("R13: sin tocarlos, se programan los mismos", async () => {
    const user = userEvent.setup();
    const { enviar } = montarEditar();
    await terminar(user);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(enviar.mock.calls[0]![0].beneficios).toEqual(PLAN.beneficios);
  });
});

describe("SLT-214 R14 — «Revisar»", () => {
  /** La fila «Beneficios» de «Revisar»: su `<dd>`. */
  const filaDeBeneficios = () =>
    Array.from(document.querySelectorAll("dl dt")).find((dt) => dt.textContent === "Beneficios")?.nextElementSibling ??
    null;

  it("R14: al crear lista los beneficios en orden y con su ícono", async () => {
    const user = userEvent.setup();
    await crearHastaBeneficios(user);
    await user.click(agregar());
    await user.type(texto(1), "Soporte 24 h");
    await elegirIcono(user, 1, "Soporte");
    await user.click(agregar());
    await user.type(texto(2), "Features nuevas");
    await elegirIcono(user, 2, "Estrella");
    await avanzarHasta(user, "Revisar y crear");

    const fila = filaDeBeneficios();
    expect(fila).not.toBeNull();
    const items = within(fila as HTMLElement).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Soporte 24 h", "Features nuevas"]);
    expect(items.map((li) => li.querySelector("svg")?.getAttribute("data-icono"))).toEqual(["soporte", "estrella"]);
    expect(items[0]!.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("R14: al editar, si cambian, «antes → después»; si no, no hay fila", async () => {
    const user = userEvent.setup();
    montarEditar();
    await avanzarHasta(user, "Revisar y programar");
    expect(filaDeBeneficios()).toBeNull();
    expect(screen.getByText("Sin cambios.")).toBeInTheDocument();

    await user.click(botonDeLaLista("Beneficios"));
    await user.click(boton("Quitar beneficio 2"));
    await avanzarHasta(user, "Revisar y programar");
    const fila = filaDeBeneficios() as HTMLElement;
    const [antes, despues] = within(fila).getAllByRole("list", { name: "Beneficios" });
    expect(within(antes!).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Soporte 24 h",
      "Acceso anticipado",
    ]);
    expect(within(despues!).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Soporte 24 h"]);
    expect(screen.queryByText("Sin cambios.")).toBeNull();
  });

  it("R14: un plan que se queda sin beneficios dice «Sin beneficios» después", async () => {
    const user = userEvent.setup();
    montarEditar({ ...PLAN, beneficios: [{ icono: "check", texto: "Único" }] });
    await avanzarHasta(user, "Beneficios");
    await user.click(boton("Quitar beneficio 1"));
    await avanzarHasta(user, "Revisar y programar");
    expect(within(filaDeBeneficios() as HTMLElement).getByText("Sin beneficios")).toBeInTheDocument();
  });
});
