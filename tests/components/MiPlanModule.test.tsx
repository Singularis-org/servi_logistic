// @vitest-environment jsdom
// SLT-58 (design §6.2, §6.4; R1, R6, R7, R11) — LO QUE LA EMPRESA VE EN «MI PLAN».
//
// El plan se arma con `planConConsumo` real (el mismo que usa el servicio), así que lo que se lee en
// pantalla es lo que de verdad le llega a la empresa: nombre, precio sin moneda, módulos, una fila por
// tope con su marca, el reinicio y el cambio programado. Sin plan, solo el aviso. Y en ningún caso un
// botón o un formulario: «Mi plan» es solo información.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { MiPlanModule } from "@/app/(app)/mi-plan/_components/MiPlanModule";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import { TITULO_LINEAS_DE_CAMBIO } from "@/lib/planes/mensajes";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { PlanConConsumo } from "@/lib/types/consumo-plan";
import type { VersionPlan } from "@/lib/types/planes";

const VIGENTE: VersionPlan = {
  nombre: "Plan Crecer",
  topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10, adminTienda: 5 }, apiKeys: 2 },
  modulos: ["analitica", "ranking"],
  precio: { tipo: "monto", mensual: "45000", anual: null },
};

// Mitad de ciclo: ancla el 15 de enero a las 06:00 UTC, «ahora» el 1 de marzo a las 06:00 UTC.
const ANCLA = new Date("2026-01-15T06:00:00.000Z");
const AHORA = new Date("2026-03-01T06:00:00.000Z");

function leido(extra: Partial<PlanConUsoLeido> = {}): PlanConUsoLeido {
  return {
    vigente: VIGENTE,
    ancla: ANCLA,
    uso: {
      ordenes: 1000,
      apiKeys: 2,
      porRol: { maestro: 1, admin: 2, mensajero: 8, adminTienda: 4, adminSatelite: 0 },
    },
    cambio: null,
    ...extra,
  };
}

function plan(extra: Partial<PlanConUsoLeido> = {}): PlanConConsumo {
  return planConConsumo(leido(extra), AHORA);
}

afterEach(() => cleanup());

describe("SLT-58 R1 — con plan, nombre, precio informativo y módulos", () => {
  it("pinta el nombre del plan, su precio sin símbolo de moneda y los módulos por su nombre comercial", () => {
    render(<MiPlanModule plan={plan()} />);

    expect(screen.getByRole("heading", { name: "Plan Crecer" })).toBeInTheDocument();
    expect(screen.getByText("45000 al mes")).toBeInTheDocument();
    expect(screen.getByText(/Precio informativo/)).toBeInTheDocument();

    const modulos = screen.getByRole("list", { name: "Módulos incluidos" });
    expect(within(modulos).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      nombreDelModulo("analitica"),
      nombreDelModulo("ranking"),
    ]);
  });

  it("pinta una fila por tope, con «sin límite» donde no lo hay, la marca en texto y el reinicio", () => {
    render(<MiPlanModule plan={plan()} />);

    const consumo = screen.getByRole("list", { name: "Consumo" });
    const filas = within(consumo).getAllByRole("listitem");
    // Órdenes, los cinco roles con tope y API keys (R2).
    expect(filas).toHaveLength(7);
    expect(within(consumo).getByText("1.000 de 3.000 órdenes del ciclo")).toBeInTheDocument();
    expect(within(consumo).getAllByText(/sin límite/)).toHaveLength(3); // maestro, admin, adminSatelite

    // 8 de 10 mensajeros → cerca; 2 de 2 API keys → lleno; 4 de 5 → cerca (80 %). La marca es texto.
    expect(within(consumo).getAllByText("Cerca del tope")).toHaveLength(2);
    expect(within(consumo).getAllByText("Lleno")).toHaveLength(1);

    // Una barra por tope con máximo; las filas sin límite no la llevan.
    const barras = within(consumo).getAllByRole("meter");
    expect(barras).toHaveLength(4);
    const ordenes = barras[0];
    expect(ordenes).toHaveAttribute("aria-valuenow", "1000");
    expect(ordenes).toHaveAttribute("aria-valuemax", "3000");

    expect(screen.getByText(/^Se reinicia en \d+ días \(\d{4}-\d{2}-\d{2}\)$/)).toBeInTheDocument();
  });

  it("si la empresa ya pasa el tope, la barra no se sale del máximo y el texto da el uso real", () => {
    render(<MiPlanModule plan={plan({ uso: { ...leido().uso, apiKeys: 5 } })} />);

    const apiKeys = screen.getByRole("meter", { name: "API keys" });
    expect(apiKeys).toHaveAttribute("aria-valuenow", "2");
    expect(apiKeys).toHaveAttribute("aria-valuetext", "5 de 2 API keys");
  });
});

describe("SLT-58 R6 — sin plan", () => {
  it("dice «Tu empresa no tiene plan asignado: sin límites» y no muestra precio, módulos, consumo ni ciclo", () => {
    render(<MiPlanModule plan={null} />);

    expect(screen.getByText("Tu empresa no tiene plan asignado: sin límites")).toBeInTheDocument();
    expect(screen.queryByText(/Precio informativo/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.queryByText(/Se reinicia/)).toBeNull();
  });
});

describe("SLT-58 R7 — cambio programado", () => {
  it("con un cambio pendiente, muestra la fecha desde la que rige y una línea por cada cosa que cambia", () => {
    const cambio = {
      vigenteDesde: new Date("2026-04-01T06:00:00.000Z"), // 00:00 del 1 de abril en la hora de la plataforma
      version: { ...VIGENTE, nombre: "Plan Crecer Plus", modulos: ["analitica" as const] },
    };
    const p = plan({ cambio });
    render(<MiPlanModule plan={p} />);

    expect(screen.getByRole("heading", { name: "Cambio programado desde 2026-04-01" })).toBeInTheDocument();
    expect(screen.getByText(TITULO_LINEAS_DE_CAMBIO)).toBeInTheDocument();
    expect(p.cambioPendiente?.lineas).toHaveLength(2);
    for (const linea of p.cambioPendiente?.lineas ?? []) {
      expect(screen.getByText(linea)).toBeInTheDocument();
    }
    expect(screen.getByText("Nombre del plan: Plan Crecer → Plan Crecer Plus")).toBeInTheDocument();
  });

  it("sin cambio pendiente, esa sección no aparece", () => {
    render(<MiPlanModule plan={plan()} />);

    expect(screen.queryByText(/Cambio programado/)).toBeNull();
    expect(screen.queryByText(TITULO_LINEAS_DE_CAMBIO)).toBeNull();
  });
});

describe("SLT-58 R11 — «Mi plan» es solo información", () => {
  it.each([
    ["con plan y cambio pendiente", () =>
      plan({ cambio: { vigenteDesde: new Date("2026-04-01T06:00:00.000Z"), version: { ...VIGENTE, nombre: "Otro" } } })],
    ["sin plan", () => null],
  ])("%s: no hay botones, formularios, enlaces ni campos", (_caso, armar) => {
    const { container } = render(<MiPlanModule plan={armar()} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(container.querySelectorAll("form, button, input, select, textarea")).toHaveLength(0);
  });
});
