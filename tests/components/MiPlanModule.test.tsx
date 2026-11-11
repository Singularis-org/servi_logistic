// @vitest-environment jsdom
// SLT-58 (design §6.2, §6.4; R1, R6, R7), SLT-99 (R3, R19, R21) — LO QUE LA EMPRESA VE EN «MI PLAN».
//
// El plan se arma con `planConConsumo` real (el mismo que usa el servicio), así que lo que se lee en
// pantalla es lo que de verdad le llega a la empresa: el panel del plan activo (SLT-99 R3), el consumo con una fila
// por tope, el reinicio y el cambio programado (SLT-58, sin cambios: R21, P8) y los planes disponibles. SLT-99
// sustituye SLT-58 R11 («Mi plan» es solo información): el maestro cambia de plan desde aquí (R19).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MiPlanModule } from "@/app/(app)/mi-plan/_components/MiPlanModule";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import { TITULO_LINEAS_DE_CAMBIO } from "@/lib/planes/mensajes";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { PlanConConsumo } from "@/lib/types/consumo-plan";
import type { VersionPlan } from "@/lib/types/planes";

import { planesDeMiPlan, planesSinPlan } from "./_mi-plan-planes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions/mi-plan", () => ({ cambiarMiPlanAction: vi.fn(), cancelarCambioMiPlanAction: vi.fn() }));

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
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    // El panel del plan activo (SLT-99 R3) y el consumo (SLT-58) llevan los dos el nombre.
    expect(screen.getAllByRole("heading", { name: "Plan Crecer" })).toHaveLength(2);
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
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

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
    render(<MiPlanModule plan={plan({ uso: { ...leido().uso, apiKeys: 5 } })} planes={planesDeMiPlan()} />);

    const apiKeys = within(screen.getByRole("list", { name: "Consumo" })).getByRole("meter", { name: "API keys" });
    expect(apiKeys).toHaveAttribute("aria-valuenow", "2");
    expect(apiKeys).toHaveAttribute("aria-valuetext", "5 de 2 API keys");
  });
});

// SLT-86 (R27): el reinicio es el fin del período de calendario. (El ciclo corto de SLT-58 R40 se retiró,
// P4 = a; su caso se fue con él.)
describe("SLT-86 R27 — «Se reinicia» al fin del período de calendario", () => {
  it("quincenal el 10 de marzo a mediodía: «Se reinicia en 6 días (2026-03-16)»", () => {
    const p = planConConsumo(leido({ tipoCobro: "quincenal" }), new Date("2026-03-10T18:00:00.000Z"));
    render(<MiPlanModule plan={p} planes={planesDeMiPlan({ tipoCobro: "quincenal" })} />);

    expect(screen.getByText("Se reinicia en 6 días (2026-03-16)")).toBeInTheDocument();
  });
});

describe("SLT-58 R6 — sin plan", () => {
  it("dice «Tu empresa no tiene plan asignado: sin límites» y no muestra precio, módulos, consumo ni ciclo", () => {
    const { container } = render(<MiPlanModule plan={null} planes={planesSinPlan()} />);

    // Es el título de un `EmptyState` (texto pleno + icono decorativo), no un párrafo gris suelto.
    expect(screen.getByText("Tu empresa no tiene plan asignado: sin límites")).toHaveClass("text-foreground");
    expect(container.querySelector("span[aria-hidden='true'] svg")).not.toBeNull();
    expect(screen.queryByText(/Costo base/)).toBeNull(); // SLT-66 R9: el rótulo del precio es «Costo base»
    // SLT-99 (R18, P5): sin plan no hay panel activo ni consumo; los planes disponibles sí se ven.
    expect(screen.queryByRole("region", { name: "Plan activo" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Módulos incluidos" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Consumo" })).toBeNull();
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
    render(<MiPlanModule plan={p} planes={planesDeMiPlan()} />);

    expect(screen.getByRole("heading", { name: "Cambio programado desde 2026-04-01" })).toBeInTheDocument();
    expect(screen.getByText(TITULO_LINEAS_DE_CAMBIO)).toBeInTheDocument();
    expect(p.cambioPendiente?.lineas).toHaveLength(2);
    for (const linea of p.cambioPendiente?.lineas ?? []) {
      expect(screen.getByText(linea)).toBeInTheDocument();
    }
    expect(screen.getByText("Nombre del plan: Plan Crecer → Plan Crecer Plus")).toBeInTheDocument();
  });

  it("sin cambio pendiente, esa sección no aparece", () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    expect(screen.queryByText(/Cambio programado/)).toBeNull();
    expect(screen.queryByText(TITULO_LINEAS_DE_CAMBIO)).toBeNull();
  });
});

// SLT-99 sustituye SLT-58 R11 («Mi plan» es solo información): ahora se cambia de plan desde aquí (R19).
describe("SLT-99 R19 (sustituye SLT-58 R11) — «Mi plan» ofrece cambiar de plan, sin elegir la fecha", () => {
  it("con plan: tocar otra tarjeta abre su detalle y «Cambiar a {plan}» pide confirmación con el corte, sin campo de fecha", async () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pro" }));
    await userEvent.click(screen.getByRole("button", { name: "Cambiar a Pro" }));

    const dialogo = await screen.findByRole("dialog", { name: "¿Cambiar a Pro?" });
    expect(within(dialogo).getByText("Tu plan cambia a Pro el 2026-12-01. Hasta entonces sigues con Plan Crecer.")).toBeInTheDocument();
    expect(within(dialogo).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(dialogo).queryAllByRole("radio")).toHaveLength(0);
    expect(dialogo.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("sin plan: se ven los planes, pero el detalle no ofrece «Cambiar a» (R18)", async () => {
    render(<MiPlanModule plan={null} planes={planesSinPlan()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pro" }));
    expect(screen.getByRole("heading", { name: "Detalles de Pro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cambiar a/ })).toBeNull();
  });
});

describe("SLT-99 R3 — el panel del plan activo", () => {
  it("nombre con «Activo», uso de la plataforma, costo por orden, período, renovación, uso y módulos uno por uno", () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    const panel = within(screen.getByRole("region", { name: "Plan activo" }));
    expect(panel.getByRole("heading", { name: "Plan Crecer" })).toBeInTheDocument();
    expect(panel.getByText("Activo")).toBeInTheDocument();
    // Sin símbolo de moneda (SLT-58 D26).
    expect(panel.getByText("Uso de la plataforma").nextSibling).toHaveTextContent("Mensual · 45000.00");
    expect(panel.getByText("Costo por orden").nextSibling).toHaveTextContent("500.00 por orden");
    expect(panel.getByText("Período actual").nextSibling).toHaveTextContent("2026-03-01 – 2026-03-31");
    expect(panel.getByText("Se renueva el").nextSibling).toHaveTextContent("2026-04-01");
    // R4: admin y admin satélite sin tope → «Usuarios» sin tope y sin barra; el uso suma los cuatro roles (2+8+4+0).
    expect(panel.getByText("14 · Sin tope")).toBeInTheDocument();
    expect(panel.getByRole("meter", { name: "API keys" })).toHaveAttribute("aria-valuetext", "2 de 2");
    expect(panel.queryByRole("meter", { name: "Usuarios" })).toBeNull();
    expect(within(panel.getByRole("list", { name: "Módulos" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "AnalíticaIncluido",
      "MonitoreoNo incluido",
      "RankingIncluido",
    ]);
  });

  it("con tope en los cuatro roles, «Usuarios» es la suma con su barra", () => {
    const vigente = { ...VIGENTE, topes: { porRol: { admin: 3, mensajero: 10, adminTienda: 5, adminSatelite: 2 }, apiKeys: 2 } };
    render(<MiPlanModule plan={plan({ vigente })} planes={planesDeMiPlan()} />);

    const usuarios = within(screen.getByRole("region", { name: "Plan activo" })).getByRole("meter", { name: "Usuarios" });
    expect(usuarios).toHaveAttribute("aria-valuetext", "14 de 20");
    expect(usuarios).toHaveAttribute("aria-valuemax", "20");
  });

  it("R21 (P8): el consumo y el costeo del período siguen debajo del plan activo", () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    const panel = screen.getByRole("region", { name: "Plan activo" });
    const costeo = screen.getByRole("list", { name: "Costo del período" });
    expect(panel.compareDocumentPosition(costeo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Decisión del humano del 2026-11-10: el costeo ya no lleva «Órdenes del período: n × c = s» ni el total.
    expect(within(costeo).getByText(/^Costo por orden: /)).toBeInTheDocument();
    expect(screen.queryByText(/^Órdenes del período: /)).toBeNull();
    expect(screen.queryByText(/Total estimado del período/)).toBeNull();
  });

  it("decisión del humano del 2026-11-10: «Órdenes» debajo de «API keys», con el conteo del período y sin tope ni barra", () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    const panel = screen.getByRole("region", { name: "Plan activo" });
    const usos = within(panel).getAllByRole("listitem").filter((li) => li.querySelector("span.text-muted-foreground"));
    const etiquetas = usos.map((li) => li.querySelector("span.text-muted-foreground")?.textContent);
    expect(etiquetas.slice(0, 3)).toEqual(["Usuarios", "API keys", "Órdenes"]);
    // `ordenesDelPeriodo` = 1000 (el uso de órdenes del período que ya trae `PlanConConsumo`).
    expect(usos[2]).toHaveTextContent("Órdenes1.000 · Sin tope");
    expect(within(panel).queryByRole("meter", { name: "Órdenes" })).toBeNull();
  });
});

describe("Ajuste planes-custom D9, SLT-86 R27 — «Mi plan» muestra el tipo, el período en curso y el siguiente cobro", () => {
  it("mensual: el período de calendario completo y el siguiente cobro el 1 del mes siguiente", () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);
    const cobro = screen.getByRole("list", { name: "Cobro del plan" });
    expect(within(cobro).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Tipo de cobro: Mensual",
      "Período: 2026-03-01 – 2026-03-31",
      "Siguiente cobro: 2026-04-01",
    ]);
  });

  it("anual: el tramo desde la entrada, su costo proporcional, el pago del inicio y el siguiente el 1 de enero", () => {
    const sinPrecio = { ...VIGENTE, precio: { tipo: "sin_precio" } as const };
    render(
      <MiPlanModule
        plan={plan({ tipoCobro: "anual", vigente: sinPrecio, precioDelPeriodo: VIGENTE.precio })}
        planes={planesDeMiPlan({ tipoCobro: "anual" })}
      />,
    );
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

  it("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28–R29): sin costo base cuesta como base 0, ya no «por definir»", () => {
    const sinPrecio = { ...VIGENTE, precio: { tipo: "sin_precio" } as const };
    render(<MiPlanModule plan={plan({ vigente: sinPrecio, precioDelPeriodo: sinPrecio.precio })} planes={planesDeMiPlan()} />);
    expect(screen.getByRole("list", { name: "Costo del período" })).toHaveTextContent("Costo base mensual: 0.00");
    expect(screen.queryByText(/por definir/)).toBeNull();
  });
});
