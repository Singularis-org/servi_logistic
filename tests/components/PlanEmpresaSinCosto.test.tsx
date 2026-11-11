// @vitest-environment jsdom
// SLT-66 (design §6.5, §6.4; R20) — el bloque «Plan» del detalle de empresa: el aviso del plan actual sin costo
// concreto y el ancla `#plan` del listado de «Empresas». SLT-99 (decisión del 2026-11-10) quita R28–R29: un plan
// sin costos se ofrece y se asigna.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { ToastProvider } from "@/providers/ToastProvider";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import { planConConsumo } from "@/lib/planes/consumo";
import type {
  PlanDeEmpresaVista,
  PlanDTO,
  PlanResult,
  PrecioPlan,
  VistaPreviaAsignacionResult,
} from "@/lib/types/planes";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const PLAN_ACTUAL = "11111111-1111-4111-8111-111111111111";
/** El texto del rechazo que quitó SLT-99: no debe salir. */
const TEXTO_R28 = "Ese plan no tiene costo base y costo por orden concretos: crea un custom con sus precios para asignarlo.";
const AVISO_R20 = "Plan sin costo concreto: complétalo en «Planes» o asígnale otro con costo base y costo por orden.";
const VISTA_PREVIA_OK: VistaPreviaAsignacionResult = { estado: "ok", avisos: [] };

function planDTO(extra: Partial<PlanDTO> & Pick<PlanDTO, "id" | "nombre">): PlanDTO {
  return {
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "50000.00", descuentos: {} },
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
    archivado: false,
    ...extra,
  };
}

const CONCRETO = planDTO({ id: "22222222-2222-4222-8222-222222222222", nombre: "Concreto" });

/**
 * La vista con un plan actual de esa base y ese costo por orden; `null` = sin plan. `excepcion` hace que
 * el costo vigente salga de la excepción de la empresa (fuente `empresa`) con ese importe.
 */
function vista(
  actual: { precio: PrecioPlan; costoPorOrden: string | null } | null,
  excepcion?: string,
): PlanDeEmpresaVista {
  if (actual === null) return { organizacionId: ORG, plan: null, pendienteSinPlan: null, asignaciones: [] };
  const consumo = planConConsumo(
    {
      vigente: { nombre: "Actual", topes: { porRol: {}, apiKeys: null }, modulos: [], costoPorOrdenPorcentual: null, ...actual }, // SLT-83: campo nuevo del tipo
      // SLT-86 (R5, R15, R26): la entrada, el precio del período y el pendiente.
      entrada: new Date("2026-10-01T06:00:00.000Z"),
      precioDelPeriodo: actual.precio,
      pendiente: null,
      uso: { ordenes: 3, apiKeys: 0, porRol: { admin: 0, mensajero: 0, adminTienda: 0, adminSatelite: 0 } },
      cambio: null,
      tipoCobro: "mensual", // Ajuste planes-custom (D6): campo nuevo de la lectura.
      costoVigente:
        excepcion === undefined
          ? { modo: "fijo", monto: actual.costoPorOrden ?? "500.00", fuente: actual.costoPorOrden ? "plan" : "global" }
          : { modo: "fijo", monto: excepcion, fuente: "empresa" },
      cobroCiclo: { cobrado: "0.00", pendientes: 0 }, // SLT-83: campo nuevo de la lectura
    },
    new Date("2026-10-10T06:00:00.000Z"),
  );
  return {
    organizacionId: ORG,
    plan: { ...consumo, planId: PLAN_ACTUAL, archivado: false },
    pendienteSinPlan: null,
    asignaciones: [],
  };
}

function montar({
  v = vista(null),
  asignables = [CONCRETO] as PlanDTO[] | null,
  asignar = vi.fn<(i: unknown) => Promise<PlanResult>>(),
  previsualizar = vi.fn<(i: unknown) => Promise<VistaPreviaAsignacionResult>>().mockResolvedValue(VISTA_PREVIA_OK),
  planPreseleccionado,
}: {
  v?: PlanDeEmpresaVista;
  asignables?: PlanDTO[] | null;
  asignar?: (i: unknown) => Promise<PlanResult>;
  previsualizar?: (i: unknown) => Promise<VistaPreviaAsignacionResult>;
  planPreseleccionado?: string;
} = {}) {
  const props = {
    organizacionId: ORG,
    empresaNombre: "Envíos Norte",
    vista: v,
    asignables,
    asignarPlan: asignar,
    rangoInicioCiclo: { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" },
    inicioCicloPorDefecto: "2026-10-30", // Ajuste planes-custom (D5): mañana.
    rangoFechaDeEfecto: { hoy: "2026-10-10", min: "2026-10-10", max: "2027-10-10" },
    fechaDeEfectoPorDefecto: "2026-11-01",
    previsualizarAsignacion: previsualizar,
    cambiarTipoCobro: vi.fn(),
    cancelarCambioEmpresa: vi.fn(),
    ...(planPreseleccionado === undefined ? {} : { planPreseleccionado }),
  };
  render(
    <ToastProvider>
      <PlanEmpresa {...props} />
    </ToastProvider>,
  );
  return { asignar, previsualizar };
}

async function elegir(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: nombre }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-66 §6.4 — el ancla del bloque «Plan»", () => {
  it("la section lleva id=\"plan\" para el enlace «…#plan» del listado", () => {
    montar();
    expect(screen.getByRole("region", { name: "Plan" })).toHaveAttribute("id", "plan");
  });
});

// SLT-99 (decisión del humano del 2026-11-10, modifica SLT-66 R28–R29): ya no hay rechazo `plan_sin_costo` ni
// filtro de costo concreto: un plan sin costos se ofrece y se asigna (cuota 0 y tarifa global).
const SIN_COSTOS = planDTO({
  id: "44444444-4444-4444-8444-444444444444",
  nombre: "Sin costos",
  precio: { tipo: "sin_precio" },
  costoPorOrden: null,
});

describe("SLT-99 (modifica SLT-66 R28) — un plan sin costos se asigna", () => {
  it("al cambiar de plan, uno sin costos se ofrece, se confirma y relee; no hay texto de rechazo", async () => {
    const user = userEvent.setup();
    const asignar = vi
      .fn<(i: unknown) => Promise<PlanResult>>()
      .mockResolvedValue({ estado: "ok", planId: SIN_COSTOS.id, cambio: true, avisos: [], vigenteDesde: null } as PlanResult);
    montar({
      v: vista({ precio: { tipo: "monto", mensual: "1.00", descuentos: {} }, costoPorOrden: "1.00" }),
      asignables: [planDTO({ id: PLAN_ACTUAL, nombre: "Actual" }), CONCRETO, SIN_COSTOS],
      asignar,
    });

    await elegir(user, "Sin costos (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
    const modal = await screen.findByRole("dialog");
    await user.click(within(modal).getByRole("button", { name: "Cambiar plan" }));

    await waitFor(() => expect(asignar).toHaveBeenCalledTimes(1));
    expect(asignar.mock.calls[0][0]).toMatchObject({ organizacionId: ORG, planId: SIN_COSTOS.id });
    expect(screen.queryByText(TEXTO_R28)).toBeNull();
  });

  it("en la primera asignación, la vista previa de uno sin costos deja confirmar", async () => {
    const user = userEvent.setup();
    montar({ asignables: [SIN_COSTOS] });

    await elegir(user, "Sin costos (Público)");
    await user.click(screen.getByRole("button", { name: "Asignar plan" }));
    const modal = await screen.findByRole("dialog");

    expect(await within(modal).findByRole("button", { name: "Asignar plan" })).toBeInTheDocument();
    expect(modal).not.toHaveTextContent(TEXTO_R28);
  });
});

describe("SLT-99 (modifica SLT-66 R29) — sin asignables", () => {
  it("lista vacía → «No hay otros planes que asignar a esta empresa.», sin el texto de costo concreto", () => {
    montar({ asignables: [] });
    expect(screen.getByText("No hay otros planes que asignar a esta empresa.")).toBeInTheDocument();
    expect(screen.queryByText(/No hay planes con costo concreto/)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("SLT-66 R20 — aviso del plan actual sin costo concreto", () => {
  it.each<[string, { precio: PrecioPlan; costoPorOrden: string | null }]>([
    ["base sin precio", { precio: { tipo: "sin_precio" }, costoPorOrden: "100.00" }],
    ["sin costo por orden", { precio: { tipo: "monto", mensual: "50000.00", descuentos: {} }, costoPorOrden: null }],
  ])("R20: %s → aviso", (_caso, actual) => {
    montar({ v: vista(actual) });
    expect(screen.getByText(AVISO_R20)).toBeInTheDocument();
  });

  it.each<[string, { precio: PrecioPlan; costoPorOrden: string | null }]>([
    ["base y costo con monto", { precio: { tipo: "monto", mensual: "50000.00", descuentos: {} }, costoPorOrden: "100.00" }],
    ["base y costo 0.00 (concretos)", { precio: { tipo: "monto", mensual: "0.00", descuentos: {} }, costoPorOrden: "0.00" }],
  ])("R20: %s → sin aviso", (_caso, actual) => {
    montar({ v: vista(actual) });
    expect(screen.queryByText(AVISO_R20)).toBeNull();
  });

  it("R20: sin plan, sin aviso", () => {
    montar({ v: vista(null) });
    expect(screen.queryByText(AVISO_R20)).toBeNull();
  });
});

describe("SLT-66 §6.3 (P1) — la nota de la excepción en el detalle del superadmin", () => {
  it("fuente empresa → «excepción de la empresa», nunca «precio acordado para tu empresa»", () => {
    montar({ v: vista({ precio: { tipo: "monto", mensual: "50000.00", descuentos: {} }, costoPorOrden: "100.00" }, "80.00") });
    expect(screen.getByText("excepción de la empresa")).toBeInTheDocument();
    expect(screen.queryByText("precio acordado para tu empresa")).toBeNull();
  });

  it("fuente plan → sin nota de excepción", () => {
    montar({ v: vista({ precio: { tipo: "monto", mensual: "50000.00", descuentos: {} }, costoPorOrden: "100.00" }) });
    expect(screen.queryByText("excepción de la empresa")).toBeNull();
  });

  it("R20: el aviso del plan sin costo concreto sale una sola vez (ConsumoDelPlan no lo repite)", () => {
    montar({ v: vista({ precio: { tipo: "sin_precio" }, costoPorOrden: "100.00" }, "80.00") });
    expect(screen.getAllByText(AVISO_R20)).toHaveLength(1);
    expect(screen.getAllByText(/sin costo concreto/i)).toHaveLength(1);
  });
});

describe("SLT-66 R33 — el plan preseleccionado desde el detalle del plan", () => {
  const OTRO = planDTO({ id: "33333333-3333-4333-8333-333333333333", nombre: "Otro" });

  it("R33: un planPreseleccionado válido arranca elegido; nada se asigna sin el clic y el modal", async () => {
    const user = userEvent.setup();
    const { asignar, previsualizar } = montar({ asignables: [CONCRETO, OTRO], planPreseleccionado: OTRO.id });

    expect(screen.getByRole("combobox", { name: "Plan a asignar" })).toHaveTextContent("Otro (Público)");
    const boton = screen.getByRole("button", { name: "Asignar plan" });
    expect(boton).toBeEnabled();
    expect(asignar).not.toHaveBeenCalled();
    expect(previsualizar).not.toHaveBeenCalled();

    await user.click(boton);
    const modal = await screen.findByRole("dialog", { name: "¿Asignar este plan a la empresa?" });
    expect(modal).toHaveTextContent("Asignar Otro a Envíos Norte");
    expect(asignar).not.toHaveBeenCalled();
  });

  it.each([
    ["fuera de los asignables", "99999999-9999-4999-8999-999999999999"],
    ["el plan que ya tiene la empresa", PLAN_ACTUAL],
  ])("R33: uno %s se ignora", (_caso, id) => {
    montar({
      v: vista({ precio: { tipo: "monto", mensual: "1.00", descuentos: {} }, costoPorOrden: "1.00" }),
      asignables: [planDTO({ id: PLAN_ACTUAL, nombre: "Actual" }), CONCRETO],
      planPreseleccionado: id,
    });
    expect(screen.getByRole("combobox", { name: "Plan a asignar" })).not.toHaveTextContent(/Actual|Concreto/);
    expect(screen.getByRole("button", { name: "Cambiar plan" })).toBeDisabled();
  });
});
