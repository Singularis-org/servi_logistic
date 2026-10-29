// @vitest-environment jsdom
// SLT-58 (design §6.3; R18, R19, R20, R21) — EL PLAN DE UNA EMPRESA EN SU DETALLE DEL SUPERADMIN.
//
// Se monta el componente REAL con el `ToastProvider` real; `asignarPlanAction` llega por props como un
// doble y `router.refresh` se espía. El plan se arma con `planConConsumo` real, así que las filas, las
// marcas y el reinicio son los mismos que ve la empresa en «Mi plan».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { ToastProvider } from "@/providers/ToastProvider";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { AsignacionDePlan, PlanDeEmpresaVista, PlanDTO, PlanResult } from "@/lib/types/planes";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const OTRA = "0a0b0c0d-1111-4222-8333-444455556666";
const PLAN_ACTUAL = "11111111-1111-4111-8111-111111111111";

const LEIDO: PlanConUsoLeido = {
  vigente: {
    nombre: "Plan Crecer",
    topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10 }, apiKeys: 2 },
    modulos: ["analitica"],
    precio: { tipo: "monto", mensual: "45000", anual: null },
  },
  ancla: new Date("2026-01-15T06:00:00.000Z"),
  uso: { ordenes: 1000, apiKeys: 2, porRol: { maestro: 1, admin: 0, mensajero: 8, adminTienda: 0, adminSatelite: 0 } },
  cambio: {
    vigenteDesde: new Date("2026-04-01T06:00:00.000Z"),
    version: {
      nombre: "Plan Crecer 2",
      topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10 }, apiKeys: 2 },
      modulos: ["analitica"],
      precio: { tipo: "monto", mensual: "45000", anual: null },
    },
  },
};

const AHORA = new Date("2026-03-01T06:00:00.000Z");

const ASIGNACIONES: AsignacionDePlan[] = [
  { creadoAt: "2026-03-01T18:30:00.000Z", actorNombre: "Sara Admin", planNombre: "Plan «Plan Crecer»" },
  { creadoAt: "2026-01-15T06:00:00.000Z", actorNombre: "Pedro Plataforma", planNombre: "Plan «Básico»" },
];

function vista(extra: Partial<PlanDeEmpresaVista> = {}): PlanDeEmpresaVista {
  return {
    organizacionId: ORG,
    plan: { ...planConConsumo(LEIDO, AHORA), planId: PLAN_ACTUAL, archivado: false },
    asignaciones: ASIGNACIONES,
    ...extra,
  };
}

function planDTO(extra: Partial<PlanDTO> & Pick<PlanDTO, "id" | "nombre">): PlanDTO {
  return {
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "sin_precio" },
    archivado: false,
    ...extra,
  };
}

const PUBLICO = planDTO({ id: "22222222-2222-4222-8222-222222222222", nombre: "Básico" });
const CUSTOM_SUYO = planDTO({
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Enterprise Norte",
  visibilidad: "custom",
  organizacionId: ORG,
});
const CUSTOM_AJENO = planDTO({
  id: "44444444-4444-4444-8444-444444444444",
  nombre: "Enterprise Sur",
  visibilidad: "custom",
  organizacionId: OTRA,
});
const ARCHIVADO = planDTO({ id: "55555555-5555-4555-8555-555555555555", nombre: "Viejo", archivado: true });
const ACTUAL = planDTO({ id: PLAN_ACTUAL, nombre: "Plan Crecer" });

const OK: PlanResult = { estado: "ok", planId: PUBLICO.id, cambio: true, avisos: [], vigenteDesde: null };

function montar({
  v = vista(),
  asignables = [PUBLICO, CUSTOM_SUYO, CUSTOM_AJENO, ARCHIVADO, ACTUAL] as PlanDTO[] | null,
  asignar = vi.fn<(i: { organizacionId: string; planId: string }) => Promise<PlanResult>>().mockResolvedValue(OK),
}: {
  v?: PlanDeEmpresaVista | null;
  asignables?: PlanDTO[] | null;
  asignar?: (i: { organizacionId: string; planId: string }) => Promise<PlanResult>;
} = {}) {
  render(
    <ToastProvider>
      <PlanEmpresa organizacionId={ORG} vista={v} asignables={asignables} asignarPlan={asignar} />
    </ToastProvider>,
  );
  return asignar;
}

async function elegir(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: nombre }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-58 R19 — el plan de la empresa con su consumo", () => {
  it("R19: nombre, precio, módulos, filas con marca, reinicio y cambio programado", () => {
    montar();

    const seccion = screen.getByRole("region", { name: "Plan" });
    expect(within(seccion).getByRole("heading", { level: 3, name: "Plan Crecer" })).toBeInTheDocument();
    expect(within(seccion).getByText("45000 al mes")).toBeInTheDocument();
    expect(within(seccion).getByRole("list", { name: "Módulos incluidos" })).toHaveTextContent("Analítica");

    const consumo = within(seccion).getByRole("list", { name: "Consumo" });
    expect(within(consumo).getAllByRole("listitem")).toHaveLength(7);
    expect(within(consumo).getByText("1.000 de 3.000 órdenes del ciclo")).toBeInTheDocument();
    expect(within(consumo).getByText("Cerca del tope")).toBeInTheDocument(); // 8 de 10 mensajeros
    expect(within(consumo).getByText("Lleno")).toBeInTheDocument(); // 2 de 2 API keys
    expect(within(seccion).getByText(/^Se reinicia en \d+ días? \(\d{4}-\d{2}-\d{2}\)$/)).toBeInTheDocument();
    expect(within(seccion).getByRole("heading", { name: "Cambio programado desde 2026-04-01" })).toBeInTheDocument();
  });

  it("R19: sin plan → «Sin plan: sin límites», sin filas, y el botón dice «Asignar plan»", () => {
    montar({ v: vista({ plan: null }) });

    expect(screen.getByText("Sin plan: sin límites")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Consumo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Asignar plan" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cambiar plan" })).toBeNull();
  });

  it("R19: con plan el botón dice «Cambiar plan»", () => {
    montar();
    expect(screen.getByRole("button", { name: "Cambiar plan" })).toBeDisabled();
  });

  it("R19: si la lectura del plan falló, la sección lo dice y no ofrece asignar", () => {
    montar({ v: null });

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el plan.");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("SLT-58 R20 — asignar o cambiar el plan", () => {
  it("R20: el selector ofrece solo los asignables (públicos y customs suyos, no archivados, no el actual)", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Básico (Público)",
      "Enterprise Norte (Custom)",
    ]);
  });

  it("R20: envía la elección a asignarPlanAction y, con ok, relee la página", async () => {
    const user = userEvent.setup();
    const asignar = montar();

    await elegir(user, "Enterprise Norte (Custom)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    expect(asignar).toHaveBeenCalledWith({ organizacionId: ORG, planId: CUSTOM_SUYO.id });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("R20: un rechazo por tope muestra qué tope se pasa, con uso y tope, y no relee", async () => {
    const user = userEvent.setup();
    const mensaje = "Envíos Norte ya tiene 8 usuarios activos con el rol Mensajero y el plan permite 5.";
    montar({
      asignar: vi.fn().mockResolvedValue({
        estado: "tope_excedido",
        excedidos: [{ organizacionId: ORG, empresa: "Envíos Norte", tope: "mensajero", usados: 8, maximo: 5 }],
        mensaje,
      } satisfies PlanResult),
    });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(mensaje);
    expect(refreshMock).not.toHaveBeenCalled();
    // La empresa sigue con su plan.
    expect(screen.getByRole("heading", { level: 3, name: "Plan Crecer" })).toBeInTheDocument();
  });

  it("R20: si no se pudieron leer los asignables, lo dice y no ofrece selector", () => {
    montar({ asignables: null });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los planes que se pueden asignar.");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("SLT-58 R18 — un rechazo se explica y no se da por hecho", () => {
  it.each<[PlanResult, string]>([
    [{ estado: "forbidden" }, "No tienes permiso para esto."],
    [{ estado: "not_found" }, "El plan o la empresa ya no existe."],
    [{ estado: "archivado" }, "El plan está archivado."],
    [{ estado: "custom_de_otra_empresa" }, "Ese plan es de otra empresa."],
    [{ estado: "sin_cambio_programado" }, "El plan ya no tiene un cambio pendiente."],
  ])("R18: %o → mensaje y sin releer", async (respuesta, texto) => {
    const user = userEvent.setup();
    montar({ asignar: vi.fn().mockResolvedValue(respuesta) });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(texto);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R18: validation_error → el error junto al selector", async () => {
    const user = userEvent.setup();
    montar({
      asignar: vi.fn().mockResolvedValue({ estado: "validation_error", fieldErrors: { planId: ["Plan inválido."] } }),
    });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Plan inválido.");
    expect(screen.getByRole("combobox", { name: "Plan a asignar" })).toHaveAttribute("aria-invalid", "true");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R18: si la action lanza, avisa y no da el cambio por hecho", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    montar({ asignar: vi.fn().mockRejectedValue(new Error("red")) });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo asignar el plan. Inténtalo de nuevo.");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("SLT-58 R21 — el historial de asignaciones", () => {
  it("R21: del más reciente al más antiguo, con fecha en hora de la plataforma, quién y el plan", () => {
    montar();

    const tabla = screen.getByRole("table", { name: "Historial de asignaciones" });
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas.map((f) => within(f).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["2026-03-01 12:30", "Sara Admin", "Plan «Plan Crecer»"],
      ["2026-01-15 00:00", "Pedro Plataforma", "Plan «Básico»"],
    ]);
  });

  it("R21: sin asignaciones lo dice", () => {
    montar({ v: vista({ asignaciones: [] }) });
    expect(screen.getByText("Esta empresa todavía no tiene asignaciones de plan.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
