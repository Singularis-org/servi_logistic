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
  topes: { porRol: { mensajero: 10, adminTienda: 5 }, apiKeys: 2 },
  modulos: ["analitica", "ranking"],
  precio: { tipo: "monto", mensual: "45000", descuentos: {} },
  costoPorOrden: null, // SLT-66 R8: campo nuevo del tipo.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
};

// SLT-86 (R5): entrada el 15 de enero y «ahora» el 1 de marzo a las 00:00 de la plataforma: el período
// mensual de marzo completo; el anual, un tramo desde la entrada.
const ENTRADA = new Date("2026-01-15T06:00:00.000Z");
const AHORA = new Date("2026-03-01T06:00:00.000Z");

function leido(extra: Partial<PlanConUsoLeido> = {}): PlanConUsoLeido {
  return {
    vigente: VIGENTE,
    entrada: ENTRADA,
    precioDelPeriodo: VIGENTE.precio,
    pendiente: null,
    uso: {
      ordenes: 1000,
      apiKeys: 2,
      // SLT-66 R5: el uso ya no cuenta maestros.
      porRol: { admin: 2, mensajero: 8, adminTienda: 4, adminSatelite: 0 },
    },
    cambio: null,
    costoVigente: { modo: "fijo", monto: "500.00", fuente: "global" }, // SLT-66 R18: campo nuevo de la lectura.
    cobroCiclo: { cobrado: "0.00", pendientes: 0 }, // SLT-83: campo nuevo de la lectura
    tipoCobro: "mensual", // Ajuste planes-custom (D6): campo nuevo de la lectura.
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
    // SLT-66 R9: «Precio informativo» pasa a «Costo base»; el importe sigue sin símbolo de moneda.
    // SLT-86 (R28): el costo base del período en curso, con su tipo.
    expect(screen.getByText("Costo base mensual: 45000.00")).toBeInTheDocument();

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
    // Las órdenes del período, los cuatro roles con tope y API keys (R2; SLT-66 R5: sin la fila del
    // maestro). SLT-86 (R7, R8): las órdenes, solo un conteo, sin tope ni barra.
    expect(filas).toHaveLength(6);
    expect(within(consumo).getByText("Órdenes en el período: 1.000")).toBeInTheDocument();
    expect(within(consumo).getAllByText(/sin límite/)).toHaveLength(2); // admin, adminSatelite (SLT-66 R5)

    // 8 de 10 mensajeros → cerca; 2 de 2 API keys → lleno; 4 de 5 → cerca (80 %). La marca es texto.
    expect(within(consumo).getAllByText("Cerca del tope")).toHaveLength(2);
    expect(within(consumo).getAllByText("Lleno")).toHaveLength(1);

    // Una barra por tope con máximo; las filas sin límite y las órdenes (sin tope) no la llevan.
    const barras = within(consumo).getAllByRole("meter");
    expect(barras).toHaveLength(3);
    const mensajeros = barras[0];
    expect(mensajeros).toHaveAttribute("aria-valuenow", "8");
    expect(mensajeros).toHaveAttribute("aria-valuemax", "10");

    expect(screen.getByText(/^Se reinicia en \d+ días \(\d{4}-\d{2}-\d{2}\)$/)).toBeInTheDocument();
  });

  it("si la empresa ya pasa el tope, la barra no se sale del máximo y el texto da el uso real", () => {
    render(<MiPlanModule plan={plan({ uso: { ...leido().uso, apiKeys: 5 } })} />);

    const apiKeys = screen.getByRole("meter", { name: "API keys" });
    expect(apiKeys).toHaveAttribute("aria-valuenow", "2");
    expect(apiKeys).toHaveAttribute("aria-valuetext", "5 de 2 API keys");
  });
});

// SLT-86 (R27): el reinicio es el fin del período de calendario. (El ciclo corto de SLT-58 R40 se retiró,
// P4 = a; su caso se fue con él.)
describe("SLT-86 R27 — «Se reinicia» al fin del período de calendario", () => {
  it("quincenal el 10 de marzo a mediodía: «Se reinicia en 6 días (2026-03-16)»", () => {
    const p = planConConsumo(leido({ tipoCobro: "quincenal" }), new Date("2026-03-10T18:00:00.000Z"));
    render(<MiPlanModule plan={p} />);

    expect(screen.getByText("Se reinicia en 6 días (2026-03-16)")).toBeInTheDocument();
  });
});

describe("SLT-58 R6 — sin plan", () => {
  it("dice «Tu empresa no tiene plan asignado: sin límites» y no muestra precio, módulos, consumo ni ciclo", () => {
    const { container } = render(<MiPlanModule plan={null} />);

    // Es el título de un `EmptyState` (texto pleno + icono decorativo), no un párrafo gris suelto.
    expect(screen.getByText("Tu empresa no tiene plan asignado: sin límites")).toHaveClass("text-foreground");
    expect(container.querySelector("span[aria-hidden='true'] svg")).not.toBeNull();
    expect(screen.queryByText(/Costo base/)).toBeNull(); // SLT-66 R9: el rótulo del precio es «Costo base»
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
    // SLT-86 (R26): el cambio pendiente de la empresa se ve, pero no se cancela desde aquí.
    ["con un cambio de empresa pendiente", () => plan({ pendiente: { planNombre: "Pro", tipo: "anual", desde: "2026-04-01" } })],
  ])("%s: no hay botones, formularios, enlaces ni campos", (_caso, armar) => {
    const { container } = render(<MiPlanModule plan={armar()} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(container.querySelectorAll("form, button, input, select, textarea")).toHaveLength(0);
  });
});

describe("Ajuste planes-custom D9, SLT-86 R27 — «Mi plan» muestra el tipo, el período en curso y el siguiente cobro", () => {
  it("mensual: el período de calendario completo y el siguiente cobro el 1 del mes siguiente", () => {
    render(<MiPlanModule plan={plan()} />);
    const cobro = screen.getByRole("list", { name: "Cobro del plan" });
    expect(within(cobro).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Tipo de cobro: Mensual",
      "Período: 2026-03-01 – 2026-03-31",
      "Siguiente cobro: 2026-04-01",
    ]);
  });

  it("anual: el tramo desde la entrada, su costo proporcional, el pago del inicio y el siguiente el 1 de enero", () => {
    const sinPrecio = { ...VIGENTE, precio: { tipo: "sin_precio" } as const };
    render(<MiPlanModule plan={plan({ tipoCobro: "anual", vigente: sinPrecio, precioDelPeriodo: VIGENTE.precio })} />);
    const cobro = screen.getByRole("list", { name: "Cobro del plan" });
    expect(within(cobro).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Tipo de cobro: Anual",
      "Período: 2026-01-15 – 2026-12-31 (tramo de 351 de 365 días)",
      "Pago anual: 2026-01-15",
      "Siguiente pago: 2027-01-01",
    ]);
    // R12, R15: 45 000 × 12 × 351 / 365, con el precio de cuando empezó el período.
    expect(screen.getByRole("list", { name: "Costo del período" })).toHaveTextContent("Costo base anual: 519287.67");
  });

  it("sin costo base: «Costo base mensual: por definir» en el costo del período", () => {
    const sinPrecio = { ...VIGENTE, precio: { tipo: "sin_precio" } as const };
    render(<MiPlanModule plan={plan({ vigente: sinPrecio, precioDelPeriodo: sinPrecio.precio })} />);
    expect(screen.getByRole("list", { name: "Costo del período" })).toHaveTextContent("Costo base mensual: por definir");
  });
});
