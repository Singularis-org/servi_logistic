// @vitest-environment jsdom
// Ajuste planes-custom (D12, D13) — EL CUSTOM CON FECHA: VISTA PREVIA DE TOPES Y AVISOS AL CREARLO.
//
// D13: se monta el `PlanForm` REAL con `previsualizarCustomAction` como doble; se mide con qué entrada se
// llama (empresa sin plan, fecha y los topes que se escriben) y qué pinta (los mismos avisos que el modal
// de primera asignación, SLT-58 R37). D12: se monta el `PlanesModule` REAL y, tras un `ok` con `avisos`,
// se leen esos avisos con el día del siguiente ciclo de la vista previa.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { PlanForm, type EmpresaParaCustom } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import { PlanesModule } from "@/app/(app)/plataforma/planes/_components/PlanesModule";
import type {
  CrearPlanInput,
  PlanResult,
  PrevisualizarCustomInput,
  VistaPreviaCustomResult,
} from "@/lib/types/planes";

const SIN_PLAN = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const CON_PLAN = "7a1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f61";
const EMPRESAS: EmpresaParaCustom[] = [
  { id: SIN_PLAN, nombre: "Envíos Norte", tienePlan: false },
  { id: CON_PLAN, nombre: "Reparto Sur", tienePlan: true },
];
const MANANA = "2026-10-30";
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
const SIGUIENTE = "2026-11-30";
const SIN_TOPES = { ordenesPorCiclo: null, porRol: {}, apiKeys: null };

type Enviar = (input: CrearPlanInput) => Promise<PlanResult>;
type Previsualizar = (input: PrevisualizarCustomInput) => Promise<VistaPreviaCustomResult>;

const OK: PlanResult = {
  estado: "ok",
  planId: "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  cambio: true,
  avisos: [],
  vigenteDesde: null,
};
const PREVIA_SIN_AVISOS: VistaPreviaCustomResult = { estado: "ok", avisos: [], siguienteCiclo: SIGUIENTE };
const PREVIA_CON_AVISOS: VistaPreviaCustomResult = {
  estado: "ok",
  avisos: [
    { organizacionId: SIN_PLAN, empresa: "Envíos Norte", tope: "ordenes", usados: 3200, maximo: 3000 },
    { organizacionId: SIN_PLAN, empresa: "Envíos Norte", tope: "mensajero", usados: 12, maximo: 10 },
  ],
  siguienteCiclo: SIGUIENTE,
};
const AVISO_ORDENES = `La empresa ya lleva 3.200 de 3.000 órdenes en este ciclo: no podrá crear más hasta ${SIGUIENTE}.`;
const AVISO_MENSAJEROS = /ya tiene 12 de 10 .*no podrá activar ni crear más hasta bajar del tope\./;

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

function montarForm(previsualizar: Previsualizar = vi.fn<Previsualizar>().mockResolvedValue(PREVIA_SIN_AVISOS)) {
  const enviar = vi.fn<Enviar>().mockResolvedValue(OK);
  const onGuardado = vi.fn();
  render(
    <PlanForm
      modo="crear"
      empresas={EMPRESAS}
      inicioCicloPorDefecto={MANANA}
      rangoInicioCiclo={RANGO}
      enviar={enviar}
      previsualizar={previsualizar}
      onGuardado={onGuardado}
    />,
  );
  return { enviar, onGuardado, previsualizar: vi.mocked(previsualizar) };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function custom(user: Usuario, empresa: string) {
  await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Norte a medida");
  await user.click(screen.getByRole("radio", { name: "Custom" }));
  await user.click(screen.getByRole("combobox", { name: "Empresa" }));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: empresa }));
}

async function conCosto(user: Usuario) {
  await user.click(screen.getByRole("radio", { name: "Con monto" }));
  await user.type(screen.getByLabelText("Costo base mensual"), "50000");
  await user.type(screen.getByLabelText("Costo por orden"), "100");
}

describe("Ajuste planes-custom D13 — vista previa de topes en el form del custom", () => {
  it("D13: empresa sin plan y fecha → lee la vista previa con la empresa, la fecha y los topes del form", async () => {
    const user = userEvent.setup();
    const { previsualizar } = montarForm();
    await custom(user, "Envíos Norte");

    await waitFor(() =>
      expect(previsualizar).toHaveBeenLastCalledWith({ organizacionId: SIN_PLAN, inicioCiclo: MANANA, topes: SIN_TOPES }),
    );

    await user.type(screen.getByLabelText("Órdenes por ciclo"), "3000");
    await waitFor(() =>
      expect(previsualizar).toHaveBeenLastCalledWith({
        organizacionId: SIN_PLAN,
        inicioCiclo: MANANA,
        topes: { ordenesPorCiclo: 3000, porRol: {}, apiKeys: null },
      }),
    );
  });

  it("D13: cambiar la fecha relee con la fecha nueva", async () => {
    const user = userEvent.setup();
    const { previsualizar } = montarForm();
    await custom(user, "Envíos Norte");
    const campo = screen.getByLabelText("Inicio del ciclo de órdenes");
    await user.clear(campo);
    await user.type(campo, "2026-11-05");

    await waitFor(() =>
      expect(previsualizar).toHaveBeenLastCalledWith({
        organizacionId: SIN_PLAN,
        inicioCiclo: "2026-11-05",
        topes: SIN_TOPES,
      }),
    );
  });

  it("D13: pinta los topes ya pasados con el mismo texto que el modal de primera asignación", async () => {
    const user = userEvent.setup();
    montarForm(vi.fn<Previsualizar>().mockResolvedValue(PREVIA_CON_AVISOS));
    await custom(user, "Envíos Norte");

    expect(await screen.findByText(AVISO_ORDENES)).toBeInTheDocument();
    expect(screen.getByText(AVISO_MENSAJEROS)).toBeInTheDocument();
  });

  it("D13: sin topes pasados no hay aviso", async () => {
    const user = userEvent.setup();
    const { previsualizar } = montarForm();
    await custom(user, "Envíos Norte");
    await waitFor(() => expect(previsualizar).toHaveBeenCalled());
    expect(screen.queryByText(/ya lleva|ya tiene/)).toBeNull();
    expect(screen.queryByText("No se pudo comprobar el consumo de la empresa")).toBeNull();
  });

  it("D13: empresa con plan, plan público o sin empresa → no se lee la vista previa", async () => {
    const user = userEvent.setup();
    const { previsualizar } = montarForm();
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    await custom(user, "Reparto Sur");
    await new Promise((r) => setTimeout(r, 400));
    expect(previsualizar).not.toHaveBeenCalled();
  });

  it("D13: un rechazo de la fecha (R30/R31) lo dice sin bloquear el guardado", async () => {
    const user = userEvent.setup();
    const { enviar } = montarForm(
      vi.fn<Previsualizar>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { inicioCiclo: ["Elige una fecha entre el 2026-09-29 y el 2026-11-29."] },
      }),
    );
    await custom(user, "Envíos Norte");

    expect(await screen.findByText("No se pudo comprobar el consumo de la empresa")).toBeInTheDocument();
    expect(screen.getByText("Elige una fecha entre el 2026-09-29 y el 2026-11-29.")).toBeInTheDocument();

    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
  });

  it("D13: si la vista previa lanza, lo dice", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    montarForm(vi.fn<Previsualizar>().mockRejectedValue(new Error("red")));
    await custom(user, "Envíos Norte");
    expect(await screen.findByText("No se pudo comprobar el consumo de la empresa")).toBeInTheDocument();
    error.mockRestore();
  });

  it("D12, D13: si se guarda con la lectura en vuelo, espera su `siguienteCiclo` y se lo pasa a `onGuardado`", async () => {
    const user = userEvent.setup();
    let resolver: (r: VistaPreviaCustomResult) => void = () => {};
    const previsualizar = vi.fn<Previsualizar>().mockImplementation(
      () =>
        new Promise((r) => {
          resolver = r;
        }),
    );
    const { enviar, onGuardado } = montarForm(previsualizar);
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await waitFor(() => expect(previsualizar).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(enviar).not.toHaveBeenCalled();
    resolver(PREVIA_SIN_AVISOS);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(onGuardado).toHaveBeenCalledWith(OK, "Norte a medida", SIGUIENTE);
  });
});

describe("Ajuste planes-custom D12 — los avisos del `ok` al crear un custom con fecha", () => {
  function montarModulo(crearPlan: Enviar, previsualizar: Previsualizar) {
    render(
      <PlanesModule
        planes={[]}
        empresas={EMPRESAS}
        inicioCicloPorDefecto={MANANA}
        rangoInicioCiclo={RANGO}
        crearPlan={crearPlan}
        previsualizarCustom={previsualizar}
      />,
    );
  }

  it("D12: tras crear, junto a «Plan creado» salen los topes ya pasados con el día del siguiente ciclo", async () => {
    const user = userEvent.setup();
    const crearPlan = vi.fn<Enviar>().mockResolvedValue({ ...OK, avisos: PREVIA_CON_AVISOS.estado === "ok" ? PREVIA_CON_AVISOS.avisos : [] } as PlanResult);
    montarModulo(crearPlan, vi.fn<Previsualizar>().mockResolvedValue(PREVIA_CON_AVISOS));
    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Plan «Norte a medida» creado.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(AVISO_ORDENES)).toBeInTheDocument();
    expect(screen.getByText(AVISO_MENSAJEROS)).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("D12: un `ok` sin avisos solo dice «Plan creado»", async () => {
    const user = userEvent.setup();
    montarModulo(vi.fn<Enviar>().mockResolvedValue(OK), vi.fn<Previsualizar>().mockResolvedValue(PREVIA_SIN_AVISOS));
    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Plan «Norte a medida» creado.");
    expect(screen.queryByText(/ya lleva|ya tiene/)).toBeNull();
  });
});
