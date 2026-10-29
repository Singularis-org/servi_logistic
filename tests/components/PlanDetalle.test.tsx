// @vitest-environment jsdom
// SLT-58 (design §6.3; R15–R18) — el detalle de un plan para el superadmin.
//
// Se lee lo que pinta con el `DetallePlan` que baja de la página (versión vigente, cambio pendiente,
// empresas, rastro del más reciente al más antiguo) y se mide qué sale hacia las actions inyectadas:
// cancelar y archivar no llaman sin confirmar, un archivado no ofrece controles, los avisos de una
// edición se ven y un rechazo se explica sin dar el cambio por hecho.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DetallePlan, PlanResult } from "@/lib/types/planes";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { PlanDetalle } from "@/app/(app)/plataforma/planes/[planId]/_components/PlanDetalle";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";

const DETALLE: DetallePlan = {
  plan: {
    id: PLAN_ID,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 5 }, apiKeys: null },
    modulos: ["analitica", "ranking"],
    precio: { tipo: "monto", mensual: "10.00", anual: null },
    archivado: false,
  },
  empresaNombre: null,
  pendiente: { vigenteDesde: "2030-01-15", lineas: ["Órdenes por ciclo: 3000 → 5000"] },
  empresas: [{ id: ORG, nombre: "Envíos Norte" }],
  rastro: [
    {
      id: "r-2",
      accion: "cambio_programado",
      cambios: {
        topes: {
          antes: { ordenesPorCiclo: 3000, porRol: { mensajero: 5 }, apiKeys: null },
          despues: { ordenesPorCiclo: 5000, porRol: { mensajero: 5 }, apiKeys: null },
        },
        // El repositorio guarda además desde cuándo rige (instante de las 00:00, hora de la plataforma).
        ...({ vigenteDesde: { antes: null, despues: "2030-01-15T06:00:00.000Z" } } as object),
      },
      actorNombre: "Sofía Admin",
      creadoAt: "2026-10-28T18:30:00.000Z",
    },
    {
      id: "r-1",
      accion: "creado",
      cambios: {
        nombre: { antes: null, despues: "Básico" },
        precio: { antes: null, despues: { tipo: "monto", mensual: "10.00", anual: null } },
      },
      actorNombre: "Sofía Admin",
      creadoAt: "2026-10-01T15:00:00.000Z",
    },
  ],
};

const OK: PlanResult = { estado: "ok", planId: PLAN_ID, cambio: true, avisos: [], vigenteDesde: null };

/** Una action inyectada que responde `r`. */
const accion = (r: PlanResult) => vi.fn<(input: unknown) => Promise<PlanResult>>().mockResolvedValue(r);
type Accion = ReturnType<typeof accion>;

function montar(
  detalle: DetallePlan = DETALLE,
  acciones: Partial<Record<"editarPlan" | "archivarPlan" | "cancelarCambio", Accion>> = {},
) {
  const editarPlan = acciones.editarPlan ?? accion(OK);
  const archivarPlan = acciones.archivarPlan ?? accion(OK);
  const cancelarCambio = acciones.cancelarCambio ?? accion(OK);
  render(
    <PlanDetalle detalle={detalle} editarPlan={editarPlan} archivarPlan={archivarPlan} cancelarCambio={cancelarCambio} />,
  );
  return { editarPlan, archivarPlan, cancelarCambio };
}

const seccion = (nombre: string) => screen.getByRole("region", { name: nombre });

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-58 R16 — lo que muestra el detalle", () => {
  it("R16: la versión vigente con su visibilidad, precio sin moneda, topes y módulos", () => {
    montar();
    const vigente = seccion("Versión vigente");
    expect(within(vigente).getByText("Público")).toBeInTheDocument();
    expect(within(vigente).getByText("10.00 al mes")).toBeInTheDocument();
    expect(within(vigente).getByText("Órdenes por ciclo: 3.000")).toBeInTheDocument();
    expect(within(vigente).getByText("Usuarios con el rol Mensajero: 5")).toBeInTheDocument();
    expect(within(vigente).getByText("API keys activas: sin límite")).toBeInTheDocument();
    expect(within(vigente).getByText("Analítica, Ranking")).toBeInTheDocument();
  });

  it("R16: el cambio pendiente con su fecha y una línea por cosa que cambia", () => {
    montar();
    const pendiente = seccion("Cambio programado");
    expect(within(pendiente).getByText("Cambio programado desde 2030-01-15")).toBeInTheDocument();
    expect(within(pendiente).getByText("Esto es lo que cambia:")).toBeInTheDocument();
    expect(within(pendiente).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Órdenes por ciclo: 3000 → 5000",
    ]);
  });

  it("R16: las empresas con el plan enlazan a su detalle", () => {
    montar();
    expect(within(seccion("Empresas con este plan")).getByRole("link", { name: "Envíos Norte" })).toHaveAttribute(
      "href",
      `/plataforma/empresas/${ORG}`,
    );
  });

  it("R16: el rastro, del más reciente al más antiguo, con fecha (hora de la plataforma), quién, acción y qué cambió", () => {
    montar();
    const filas = within(seccion("Historial del plan")).getAllByRole("row").slice(1);
    const celdas = filas.map((f) => within(f).getAllByRole("cell").map((c) => c.textContent));
    expect(celdas).toEqual([
      [
        "2026-10-28 12:30",
        "Sofía Admin",
        "Cambio programado",
        "Órdenes por ciclo: 3000 → 5000Rige desde 2030-01-15",
      ],
      ["2026-10-01 09:00", "Sofía Admin", "Creado", "Nombre del plan: BásicoPrecio: 10.00 al mes"],
    ]);
  });
});

describe("SLT-58 R17 — confirmaciones y archivado", () => {
  it("R17: «Archivar» pide confirmación (avisando que cancela el pendiente) antes de llamar a la action", async () => {
    const user = userEvent.setup();
    const { archivarPlan } = montar();

    await user.click(screen.getByRole("button", { name: "Archivar" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Archivar este plan?" });
    expect(archivarPlan).not.toHaveBeenCalled();
    expect(dialogo).toHaveTextContent("También se cancela el cambio programado desde 2030-01-15.");

    await user.click(within(dialogo).getByRole("button", { name: "Archivar plan" }));

    await waitFor(() => expect(archivarPlan).toHaveBeenCalledWith({ planId: PLAN_ID }));
    expect(await screen.findByRole("status")).toHaveTextContent("Plan archivado.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("R17: «Volver» en la confirmación de archivar no llama a la action", async () => {
    const user = userEvent.setup();
    const { archivarPlan } = montar();

    await user.click(screen.getByRole("button", { name: "Archivar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(archivarPlan).not.toHaveBeenCalled();
  });

  it("R17: «Cancelar cambio» pide confirmación antes de llamar a la action", async () => {
    const user = userEvent.setup();
    const { cancelarCambio } = montar();

    await user.click(within(seccion("Cambio programado")).getByRole("button", { name: "Cancelar cambio" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Cancelar el cambio programado?" });
    expect(cancelarCambio).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar cambio" }));

    await waitFor(() => expect(cancelarCambio).toHaveBeenCalledWith({ planId: PLAN_ID }));
    expect(await screen.findByRole("status")).toHaveTextContent("Cambio programado cancelado.");
  });

  it("R17: un plan archivado no ofrece Editar, Archivar ni Cancelar cambio, y lo dice", () => {
    montar({ ...DETALLE, plan: { ...DETALLE.plan, archivado: true } });

    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archivar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar cambio" })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("Archivado");
  });
});

describe("SLT-58 R15 — editar y los avisos de topes pasados", () => {
  it("R15: tras guardar, muestra cada empresa que ya pasa un tope nuevo con el tope, su uso y el tope nuevo", async () => {
    const user = userEvent.setup();
    const editarPlan = accion({
      ...OK,
      avisos: [
        { organizacionId: ORG, empresa: "Envíos Norte", tope: "mensajero", usados: 7, maximo: 5 },
        { organizacionId: ORG, empresa: "Envíos Norte", tope: "ordenes", usados: 3200, maximo: 3000 },
      ],
    } satisfies PlanResult);
    montar(DETALLE, { editarPlan });

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const panel = await screen.findByRole("dialog", { name: "Editar plan" });
    await user.click(within(panel).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(editarPlan).toHaveBeenCalledTimes(1));
    expect(editarPlan.mock.calls[0][0]).toMatchObject({ planId: PLAN_ID, vigenteDesde: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Cambios guardados.");
    expect(
      screen.getByText("Envíos Norte ya tiene 7 usuarios activos con el rol Mensajero y el plan permite 5."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Envíos Norte ya tiene 3200 órdenes en el ciclo en curso y el plan permite 3000."),
    ).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("R15: una edición programada dice desde cuándo rige", async () => {
    const user = userEvent.setup();
    const editarPlan = accion({ ...OK, vigenteDesde: "2030-02-01" } satisfies PlanResult);
    montar(DETALLE, { editarPlan });

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const panel = await screen.findByRole("dialog", { name: "Editar plan" });
    await user.click(within(panel).getByRole("radio", { name: "A partir de" }));
    await user.type(within(panel).getByLabelText("Fecha"), "2030-02-01");
    await user.click(within(panel).getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cambio programado desde 2030-02-01.");
  });
});

describe("SLT-58 R18 — un rechazo se explica y no da el cambio por hecho", () => {
  it.each<[PlanResult, string]>([
    [{ estado: "sin_cambio_programado" }, "El plan ya no tiene un cambio pendiente."],
    [{ estado: "forbidden" }, "No tienes permiso para esto."],
    [{ estado: "not_found" }, "El plan o la empresa ya no existe."],
  ])("R18: cancelar → %o muestra «%s», sin aviso de éxito ni relectura", async (respuesta, texto) => {
    const user = userEvent.setup();
    montar(DETALLE, { cancelarCambio: accion(respuesta) });

    await user.click(within(seccion("Cambio programado")).getByRole("button", { name: "Cancelar cambio" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar cambio" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(texto));
    expect(screen.queryByRole("status")).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R18: archivar → `archivado` muestra «El plan está archivado.»", async () => {
    const user = userEvent.setup();
    montar(DETALLE, { archivarPlan: accion({ estado: "archivado" }) });

    await user.click(screen.getByRole("button", { name: "Archivar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Archivar plan" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("El plan está archivado."));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R18: editar → `validation_error` deja el panel abierto con el error junto a su campo", async () => {
    const user = userEvent.setup();
    const editarPlan = accion({
      estado: "validation_error",
      fieldErrors: { nombre: ["Ya hay un plan con ese nombre."] },
    } satisfies PlanResult);
    montar(DETALLE, { editarPlan });

    await user.click(screen.getByRole("button", { name: "Editar" }));
    const panel = await screen.findByRole("dialog", { name: "Editar plan" });
    await user.click(within(panel).getByRole("button", { name: "Guardar" }));

    const nombre = within(panel).getByRole("textbox", { name: "Nombre" });
    await waitFor(() => expect(nombre).toHaveAttribute("aria-invalid", "true"));
    expect(within(panel).getByText("Ya hay un plan con ese nombre.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
