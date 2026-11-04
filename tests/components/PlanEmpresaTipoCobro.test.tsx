// @vitest-environment jsdom
// Ajuste planes-custom (D10, D14) — CAMBIAR SOLO EL TIPO DE COBRO Y VERLO EN EL HISTORIAL DE ASIGNACIONES.
//
// Se monta el `PlanEmpresa` REAL con el `ToastProvider` real; `cambiarTipoCobroAction` llega por props
// como doble y `router.refresh` se espía. El plan se arma con `planConConsumo` real, así que el tipo de
// cobro que arranca el modal es el mismo que pinta «Cobro del plan».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { ToastProvider } from "@/providers/ToastProvider";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type {
  AsignacionDePlan,
  CambiarTipoCobroResult,
  PlanDeEmpresaVista,
  TipoCobro,
} from "@/lib/types/planes";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const PLAN_ACTUAL = "11111111-1111-4111-8111-111111111111";
const AHORA = new Date("2026-03-01T06:00:00.000Z");

type EntradaTipo = { organizacionId: string; tipoCobro: TipoCobro };
type CambiarTipo = (i: EntradaTipo) => Promise<CambiarTipoCobroResult>;

function leido(tipoCobro: TipoCobro): PlanConUsoLeido {
  return {
    vigente: {
      nombre: "Plan Crecer",
      topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10 }, apiKeys: 2 },
      modulos: ["analitica"],
      precio: { tipo: "monto", mensual: "45000", anual: null },
      costoPorOrden: null,
      costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
    },
    ancla: new Date("2026-01-15T06:00:00.000Z"),
    uso: { ordenes: 1000, apiKeys: 2, porRol: { admin: 0, mensajero: 8, adminTienda: 0, adminSatelite: 0 } },
    cambio: null,
    costoVigente: { monto: "500.00", fuente: "global" },
    tipoCobro,
  };
}

function vista(tipoCobro: TipoCobro = "mensual", asignaciones: AsignacionDePlan[] = []): PlanDeEmpresaVista {
  return {
    organizacionId: ORG,
    plan: { ...planConConsumo(leido(tipoCobro), AHORA), planId: PLAN_ACTUAL, archivado: false },
    asignaciones,
  };
}

function montar({
  v = vista(),
  cambiar = vi.fn<CambiarTipo>().mockResolvedValue({ estado: "ok", cambio: true }),
}: { v?: PlanDeEmpresaVista; cambiar?: CambiarTipo } = {}) {
  const asignar = vi.fn();
  render(
    <ToastProvider>
      <PlanEmpresa
        organizacionId={ORG}
        empresaNombre="Envíos Norte"
        vista={v}
        asignables={[]}
        asignarPlan={asignar}
        rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
        inicioCicloPorDefecto="2026-10-30"
        previsualizarAsignacion={vi.fn()}
        cambiarTipoCobro={cambiar}
      />
    </ToastProvider>,
  );
  return { cambiar: vi.mocked(cambiar), asignar };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrir(user: Usuario) {
  await user.click(screen.getByRole("button", { name: "Cambiar tipo de cobro" }));
  return screen.findByRole("dialog", { name: "¿Cambiar el tipo de cobro?" });
}

async function confirmar(user: Usuario, modal: HTMLElement) {
  await user.click(within(modal).getByRole("button", { name: "Cambiar tipo de cobro" }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("Ajuste planes-custom D10 — «Cambiar tipo de cobro» en el detalle de empresa", () => {
  it("D10: solo se ofrece si la empresa tiene plan", () => {
    montar({ v: { organizacionId: ORG, plan: null, asignaciones: [] } });
    expect(screen.queryByRole("button", { name: "Cambiar tipo de cobro" })).toBeNull();
  });

  it("D10: el modal arranca en el tipo actual, dice que el plan no cambia y no llama a la action al abrir", async () => {
    const user = userEvent.setup();
    const { cambiar } = montar({ v: vista("anual") });
    const modal = await abrir(user);

    expect(within(modal).getByText(/La empresa sigue con «Plan Crecer»/)).toBeInTheDocument();
    const grupo = within(modal).getByRole("radiogroup", { name: "Tipo de cobro" });
    expect(within(grupo).getByRole("radio", { name: "Anual" })).toBeChecked();
    expect(cambiar).not.toHaveBeenCalled();
  });

  it("D10: confirmar manda la empresa y el tipo elegido, avisa y relee la página (tipo, monto y siguiente cobro)", async () => {
    const user = userEvent.setup();
    const { cambiar, asignar } = montar();
    const modal = await abrir(user);
    await user.click(within(modal).getByRole("radio", { name: "Anual" }));
    await confirmar(user, modal);

    await waitFor(() => expect(cambiar).toHaveBeenCalledTimes(1));
    expect(cambiar).toHaveBeenCalledWith({ organizacionId: ORG, tipoCobro: "anual" });
    expect(asignar).not.toHaveBeenCalled();
    expect(await screen.findByText("Tipo de cobro cambiado.")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("D10: mismo tipo → `cambio: false`: lo dice y no relee", async () => {
    const user = userEvent.setup();
    const { cambiar } = montar({
      cambiar: vi.fn<CambiarTipo>().mockResolvedValue({ estado: "ok", cambio: false }),
    });
    const modal = await abrir(user);
    await confirmar(user, modal);

    await waitFor(() => expect(cambiar).toHaveBeenCalledWith({ organizacionId: ORG, tipoCobro: "mensual" }));
    expect(await screen.findByText("La empresa ya tenía ese tipo de cobro.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it.each<[CambiarTipoCobroResult, string]>([
    [{ estado: "sin_plan" }, "La empresa ya no tiene plan: el tipo de cobro se elige al asignarle uno."],
    [{ estado: "not_found" }, "Esa empresa ya no existe."],
    [{ estado: "forbidden" }, "No tienes permiso para esto."],
    [{ estado: "validation_error", fieldErrors: { organizacionId: ["x"] } }, "Revisa el tipo de cobro elegido."],
  ])("D10: el rechazo %j se explica y no relee", async (resultado, texto) => {
    const user = userEvent.setup();
    montar({ cambiar: vi.fn<CambiarTipo>().mockResolvedValue(resultado) });
    const modal = await abrir(user);
    await user.click(within(modal).getByRole("radio", { name: "Anual" }));
    await confirmar(user, modal);

    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("D10: un `validation_error` de `tipoCobro` va junto al campo con el modal abierto", async () => {
    const user = userEvent.setup();
    montar({
      cambiar: vi
        .fn<CambiarTipo>()
        .mockResolvedValue({ estado: "validation_error", fieldErrors: { tipoCobro: ["Elige mensual o anual."] } }),
    });
    const modal = await abrir(user);
    await confirmar(user, modal);

    expect(await within(modal).findByText("Elige mensual o anual.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "¿Cambiar el tipo de cobro?" })).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("D10: si la action lanza, avisa y no da el cambio por hecho", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    montar({ cambiar: vi.fn<CambiarTipo>().mockRejectedValue(new Error("red")) });
    const modal = await abrir(user);
    await confirmar(user, modal);

    expect(await screen.findByText("No se pudo cambiar el tipo de cobro. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("D10: «Volver» cierra sin llamar a la action", async () => {
    const user = userEvent.setup();
    const { cambiar } = montar();
    const modal = await abrir(user);
    await user.click(within(modal).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cambiar).not.toHaveBeenCalled();
  });
});

describe("Ajuste planes-custom D14 — el historial de asignaciones muestra el tipo de cobro", () => {
  const FILAS: AsignacionDePlan[] = [
    {
      creadoAt: "2026-03-01T18:30:00.000Z",
      actorNombre: "Sara Admin",
      planNombre: "Plan «Plan Crecer»",
      tipo: "cambio_tipo_cobro",
      tipoCobro: "anual",
      tipoCobroAnterior: "mensual",
    },
    {
      creadoAt: "2026-02-01T18:30:00.000Z",
      actorNombre: "Sara Admin",
      planNombre: "Plan «Plan Crecer»",
      tipo: "asignacion",
      tipoCobro: "mensual",
      tipoCobroAnterior: null,
    },
    {
      creadoAt: "2026-01-15T06:00:00.000Z",
      actorNombre: "Pedro Plataforma",
      planNombre: "Plan «Básico»",
      tipo: "asignacion",
      tipoCobro: null,
      tipoCobroAnterior: null,
    },
  ];

  it("D14: columna «Tipo de cobro»; el cambio de solo el tipo es su propia fila y dice de cuál a cuál", () => {
    montar({ v: vista("anual", FILAS) });
    const tabla = screen.getByRole("table", { name: "Historial de asignaciones" });
    expect(within(tabla).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Fecha",
      "Quién",
      "Plan asignado",
      "Tipo de cobro",
    ]);
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas.map((f) => within(f).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["2026-03-01 12:30", "Sara Admin", "Plan «Plan Crecer»", "Cambió de Mensual a Anual"],
      ["2026-02-01 12:30", "Sara Admin", "Plan «Plan Crecer»", "Mensual"],
      ["2026-01-15 00:00", "Pedro Plataforma", "Plan «Básico»", "—"],
    ]);
  });
});
