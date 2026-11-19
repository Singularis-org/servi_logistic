// @vitest-environment jsdom
// SLT-99 (design §4–§6; R8, R16–R20) — el cambio de plan del maestro en «Mi plan»: la confirmación con el corte y el
// primer período (sin elegir fecha), el aviso de dejar el plan a la medida (P6), el pendiente con «Cancelar cambio»
// (sea del maestro o del superadmin, P3), sin plan sin «Cambiar a» y los textos de cada rechazo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MiPlanModule } from "@/app/(app)/mi-plan/_components/MiPlanModule";
import { cambiarMiPlanAction, cancelarCambioMiPlanAction } from "@/lib/actions/mi-plan";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { PendienteDeEmpresa } from "@/lib/types/consumo-plan";
import type { PlanVista } from "@/lib/types/planes";

import { BASICO, CUSTOM, PRO, planesDeMiPlan, planesSinPlan } from "./_mi-plan-planes";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/actions/mi-plan", () => ({ cambiarMiPlanAction: vi.fn(), cancelarCambioMiPlanAction: vi.fn() }));

const cambiar = vi.mocked(cambiarMiPlanAction);
const cancelar = vi.mocked(cancelarCambioMiPlanAction);

function leido(extra: Partial<PlanConUsoLeido> = {}): PlanConUsoLeido {
  return {
    vigente: {
      nombre: "Básico",
      topes: { porRol: { admin: 2, mensajero: 10, adminTienda: 5, adminSatelite: 1 }, apiKeys: 2 },
      modulos: [],
      precio: { tipo: "monto", mensual: "12000.00", descuentos: {} },
      costoPorOrden: "200.00",
      costoPorOrdenPorcentual: null,
    },
    entrada: new Date("2026-09-01T06:00:00.000Z"),
    precioDelPeriodo: { tipo: "monto", mensual: "12000.00", descuentos: {} },
    pendiente: null,
    uso: { ordenes: 40, apiKeys: 1, porRol: { admin: 1, mensajero: 3, adminTienda: 1, adminSatelite: 0 } },
    cambio: null,
    costoVigente: { modo: "fijo", monto: "200.00", fuente: "plan" },
    cobroCiclo: { cobrado: "0.00", pendientes: 0 },
    tipoCobro: "mensual",
    ...extra,
  };
}

const AHORA = new Date("2026-11-10T18:00:00.000Z");
const plan = (extra: Partial<PlanConUsoLeido> = {}) => planConConsumo(leido(extra), AHORA);
/** El pendiente de la empresa: el repositorio no dice quién lo programó (SLT-86 R32), así que se ve igual. */
const PENDIENTE: PendienteDeEmpresa = { planNombre: "Pro", tipo: "anual", desde: "2026-12-01" };

async function abrirConfirmacion(nombre = "Pro") {
  await userEvent.click(screen.getByRole("button", { name: nombre }));
  await userEvent.click(screen.getByRole("button", { name: `Cambiar a ${nombre}` }));
  return screen.findByRole("dialog", { name: `¿Cambiar a ${nombre}?` });
}

/**
 * El aviso del rechazo. SLT-119 (R17): sin la prop `facturas`, «Facturas de la empresa» pinta su propio aviso de
 * fallo, así que se descarta el que vive en esa sección.
 */
function alertaDelCambio() {
  return waitFor(() => {
    const facturas = screen.getByRole("region", { name: "Facturas de la empresa" });
    const alertas = screen.getAllByRole("alert").filter((a) => !facturas.contains(a));
    expect(alertas).toHaveLength(1);
    return alertas[0]!;
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("R8 — «Activo desde» en el detalle del plan activo", () => {
  it("la entrada de la empresa (`plan_ciclo_ancla_at`, 1 de septiembre a las 00:00 de la plataforma) sale como «Activo desde 1 sep 2026»", async () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    await userEvent.click(screen.getByRole("button", { name: /^Básico/ }));
    const detalle = screen.getByRole("region", { name: "Detalles de Básico" });
    expect(within(detalle).getByText("Activo desde").nextSibling).toHaveTextContent("1 sep 2026");
    expect(within(detalle).getByText("Período en curso").nextSibling).toHaveTextContent("2026-11-01 – 2026-11-30");
  });

  it("en otro plan no hay «Activo desde»", async () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    await userEvent.click(screen.getByRole("button", { name: "Pro" }));
    const detalle = screen.getByRole("region", { name: "Detalles de Pro" });
    expect(within(detalle).queryByText("Activo desde")).toBeNull();
  });
});

describe("R19 — la confirmación del cambio", () => {
  it("con el corte y el primer período completo con su costo base, sin campo de fecha; con plan público, sin el aviso de P6", async () => {
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    const dialogo = await abrirConfirmacion();
    expect(within(dialogo).getByText("Tu plan cambia a Pro el 2026-12-01. Hasta entonces sigues con Básico.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Tu primer período con Pro: 2026-12-01 – 2026-12-31, costo base 85000.00.")).toBeInTheDocument();
    expect(dialogo.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(within(dialogo).queryByText(/plan a la medida/)).toBeNull();
    expect(within(dialogo).getByRole("button", { name: "Confirmar cambio" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Volver" })).toBeInTheDocument();
  });

  it("P6: con un plan a la medida activo, la confirmación avisa que solo la plataforma puede volver a asignarlo", async () => {
    const planes = planesDeMiPlan({ activoId: CUSTOM.id, customActivo: CUSTOM, activoEsCustom: true });
    render(<MiPlanModule plan={plan()} planes={planes} />);

    const dialogo = await abrirConfirmacion();
    expect(
      within(dialogo).getByText("Si dejas tu plan a la medida, solo la plataforma puede volver a asignártelo."),
    ).toBeInTheDocument();
  });

  it("al confirmar se guarda con `{ planId }`, dice «Listo…» con el corte y refresca la pantalla", async () => {
    cambiar.mockResolvedValue({ estado: "ok", vigenteDesde: "2026-12-01" });
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    const dialogo = await abrirConfirmacion();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Confirmar cambio" }));

    expect(cambiar).toHaveBeenCalledWith({ planId: "pro" });
    expect(await screen.findByRole("status")).toHaveTextContent("Listo: tu plan cambia a Pro el 2026-12-01.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("R16, R17 (P3) — el pendiente de la empresa", () => {
  it("se muestra con «Cancelar cambio» y las demás tarjetas siguen ofreciendo «Cambiar a»; la confirmación avisa del reemplazo", async () => {
    render(<MiPlanModule plan={plan({ pendiente: PENDIENTE })} planes={planesDeMiPlan({ hayPendiente: true })} />);

    expect(screen.getByText("Desde el 2026-12-01: Pro · Anual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar cambio" })).toBeInTheDocument();

    const dialogo = await abrirConfirmacion();
    expect(within(dialogo).getByText("Esto reemplaza el cambio programado: Desde el 2026-12-01: Pro · Anual.")).toBeInTheDocument();
  });

  it("«Cancelar cambio» pide confirmación y, confirmada, cancela con `{}` y refresca", async () => {
    cancelar.mockResolvedValue({ estado: "ok" });
    render(<MiPlanModule plan={plan({ pendiente: PENDIENTE })} planes={planesDeMiPlan({ hayPendiente: true })} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar cambio" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Cancelar el cambio a Pro programado para el 2026-12-01?" });
    expect(cancelar).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar cambio" }));

    expect(cancelar).toHaveBeenCalledWith({});
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("«Volver» cierra la confirmación sin cancelar nada", async () => {
    render(<MiPlanModule plan={plan({ pendiente: PENDIENTE })} planes={planesDeMiPlan({ hayPendiente: true })} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar cambio" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Volver" }));

    expect(cancelar).not.toHaveBeenCalled();
  });
});

describe("R18 (P5) — sin plan", () => {
  it("se ven los planes y su detalle, sin «Cambiar a»", async () => {
    render(<MiPlanModule plan={null} planes={planesSinPlan()} />);

    await userEvent.click(screen.getByRole("button", { name: "Básico" }));
    expect(screen.getByRole("heading", { name: "Detalles de Básico" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cambiar a/ })).toBeNull();
  });
});

describe("R20 — el texto de cada rechazo, sin mostrar un pendiente que no se guardó", () => {
  it.each([
    [
      "tope_excedido",
      {
        estado: "tope_excedido" as const,
        excedidos: [],
        mensaje: "No puedes cambiar a Pro:\nPro permite 5 y tienes 6: sobra 1 mensajero.",
      },
      ["No puedes cambiar a Pro:", "Pro permite 5 y tienes 6: sobra 1 mensajero."],
    ],
    ["no_disponible", { estado: "no_disponible" as const }, ["Ese plan ya no está disponible."]],
    ["sin_plan", { estado: "sin_plan" as const }, ["Tu empresa no tiene plan: pide uno a la plataforma."]],
  ])("%s", async (_estado, respuesta, lineas) => {
    cambiar.mockResolvedValue(respuesta);
    render(<MiPlanModule plan={plan()} planes={planesDeMiPlan()} />);

    const dialogo = await abrirConfirmacion();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Confirmar cambio" }));

    const alerta = await alertaDelCambio();
    for (const linea of lineas) expect(within(alerta).getByText(linea)).toBeInTheDocument();
    expect(screen.queryByText(/^Listo:/)).toBeNull();
    expect(screen.queryByText(/^Desde el /)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sin_cambio_programado al cancelar", async () => {
    cancelar.mockResolvedValue({ estado: "sin_cambio_programado" });
    render(<MiPlanModule plan={plan({ pendiente: PENDIENTE })} planes={planesDeMiPlan({ hayPendiente: true })} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar cambio" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar cambio" }));

    expect(await alertaDelCambio()).toHaveTextContent("Tu empresa ya no tiene un cambio pendiente.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

// SLT-214 «Planes: beneficios de texto con ícono» (design §4.2, §4.4; R21, R24): las tarjetas para cambiar de plan
// muestran los 3 primeros beneficios y «Mostrar más», que no selecciona el plan.
describe("SLT-214 R24 — los beneficios en las tarjetas para cambiar de plan", () => {
  const CINCO: NonNullable<PlanVista["beneficios"]> = [
    { icono: "equipo", texto: "Equipo dedicado" },
    { icono: "soporte", texto: "Soporte prioritario" },
    { icono: "reloj_24h", texto: "Atención 24 h" },
    { icono: "rayo", texto: "Alta rápida" },
    { icono: "estrella", texto: "Reportes premium" },
  ];

  const tarjeta = (id: string) => document.querySelector<HTMLElement>(`article[data-plan="${id}"]`)!;
  const textos = (t: HTMLElement) =>
    within(within(t).getByRole("list", { name: "Beneficios" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);

  it("R24: cada tarjeta, también la del plan activo, muestra los 3 primeros en orden; sin beneficios no pinta la lista", () => {
    const planes = planesDeMiPlan({
      planes: [
        { ...BASICO, beneficios: CINCO.slice(0, 2) },
        { ...PRO, beneficios: CINCO },
      ],
    });
    const sinBeneficios: PlanVista = { ...PRO, id: "libre", nombre: "Libre", beneficios: [] };
    render(<MiPlanModule plan={plan()} planes={{ ...planes, planes: [...planes.planes, sinBeneficios] }} />);

    // «Básico» es el activo (R5 de SLT-99): también lleva sus beneficios, sin botón porque son 2.
    expect(tarjeta("basico")).toHaveAttribute("data-activo");
    expect(textos(tarjeta("basico"))).toEqual(["Equipo dedicado", "Soporte prioritario"]);
    expect(within(tarjeta("basico")).queryByRole("button", { name: "Mostrar más" })).toBeNull();

    expect(textos(tarjeta("pro"))).toEqual(["Equipo dedicado", "Soporte prioritario", "Atención 24 h"]);
    expect(within(tarjeta("pro")).getByRole("button", { name: "Mostrar más" })).toHaveAttribute("aria-expanded", "false");

    expect(within(tarjeta("libre")).queryByRole("list", { name: "Beneficios" })).toBeNull();
    expect(within(tarjeta("libre")).queryByText("Sin beneficios")).toBeNull();
  });

  it("R24: el custom activo también muestra sus beneficios", () => {
    const custom: PlanVista = { ...CUSTOM, beneficios: CINCO.slice(0, 1) };
    render(
      <MiPlanModule
        plan={plan()}
        planes={planesDeMiPlan({ activoId: custom.id, customActivo: custom, activoEsCustom: true })}
      />,
    );

    expect(textos(tarjeta(custom.id))).toEqual(["Equipo dedicado"]);
  });

  it("R21, R24: «Mostrar más» despliega la tarjeta sola y no selecciona el plan; «Mostrar menos» la pliega", async () => {
    const planes = planesDeMiPlan({
      planes: [
        { ...BASICO, beneficios: CINCO },
        { ...PRO, beneficios: CINCO },
      ],
    });
    render(<MiPlanModule plan={plan()} planes={planes} />);

    await userEvent.click(within(tarjeta("pro")).getByRole("button", { name: "Mostrar más" }));

    expect(textos(tarjeta("pro"))).toEqual(CINCO.map((b) => b.texto));
    expect(within(tarjeta("pro")).getByRole("button", { name: "Mostrar menos" })).toHaveAttribute("aria-expanded", "true");
    // Cada tarjeta por su cuenta.
    expect(textos(tarjeta("basico"))).toHaveLength(3);
    // No selecciona: el botón del plan sigue sin pulsar y no se abre su detalle.
    expect(within(tarjeta("pro")).getByRole("button", { name: "Pro" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("region", { name: "Detalles de Pro" })).toBeNull();
    // design §4.2: la lista va sobre el área del botón del plan, que cubre la tarjeta.
    const contenedor = within(tarjeta("pro")).getByRole("list", { name: "Beneficios" }).parentElement!;
    expect(contenedor).toHaveClass("relative", "z-10");

    await userEvent.click(within(tarjeta("pro")).getByRole("button", { name: "Mostrar menos" }));
    expect(textos(tarjeta("pro"))).toHaveLength(3);
  });
});
