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

import { CUSTOM, planesDeMiPlan, planesSinPlan } from "./_mi-plan-planes";

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
