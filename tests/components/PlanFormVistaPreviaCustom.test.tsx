// @vitest-environment jsdom
// Ajuste planes-custom (D12, D13, D17) — EL CUSTOM CON FECHA: VISTA PREVIA DE TOPES Y AVISOS AL CREARLO.
// D17: si la vista previa no carga (o mientras se lee), «Crear plan» queda bloqueado; si falló, «Reintentar».
//
// D13: se monta el `PlanForm` REAL con `previsualizarCustomAction` como doble; se mide con qué entrada se
// llama (empresa sin plan, fecha y los topes que se escriben) y qué pinta (los mismos avisos que el modal
// de primera asignación, SLT-58 R37). D12: se monta el `PlanesModule` REAL y, tras un `ok` con `avisos`,
// se leen esos avisos. SLT-86 (R8): sin tope de órdenes, ni su aviso, ni el día del siguiente ciclo.
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
  { id: SIN_PLAN, nombre: "Envíos Norte", tienePlan: false, fechaDeEfectoPorDefecto: null },
  { id: CON_PLAN, nombre: "Reparto Sur", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" },
];
const MANANA = "2026-10-30";
const RANGO = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
const RANGO_EFECTO = { hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" };
const SIN_TOPES = { porRol: {}, apiKeys: null };

type Enviar = (input: CrearPlanInput) => Promise<PlanResult>;
type Previsualizar = (input: PrevisualizarCustomInput) => Promise<VistaPreviaCustomResult>;

const OK: PlanResult = {
  estado: "ok",
  planId: "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  cambio: true,
  avisos: [],
  vigenteDesde: null,
};
const PREVIA_SIN_AVISOS: VistaPreviaCustomResult = { estado: "ok", avisos: [] };
const PREVIA_CON_AVISOS: VistaPreviaCustomResult = {
  estado: "ok",
  avisos: [{ organizacionId: SIN_PLAN, empresa: "Envíos Norte", tope: "mensajero", usados: 12, maximo: 10 }],
};
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
      rangoFechaDeEfecto={RANGO_EFECTO}
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

    await user.type(screen.getByLabelText("API keys activas"), "2");
    await waitFor(() =>
      expect(previsualizar).toHaveBeenLastCalledWith({
        organizacionId: SIN_PLAN,
        inicioCiclo: MANANA,
        topes: { porRol: {}, apiKeys: 2 },
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

    expect(await screen.findByText(AVISO_MENSAJEROS)).toBeInTheDocument();
    // SLT-86 (R8): ningún aviso de órdenes.
    expect(screen.queryByText(/órdenes en este ciclo/)).toBeNull();
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

  it("D13, D17: un rechazo de la fecha (R30/R31) lo dice y bloquea «Crear plan» con «Reintentar»", async () => {
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
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();

    await conCosto(user);
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    expect(enviar).not.toHaveBeenCalled();
  });

  it("D13, D17: si la vista previa lanza, lo dice y bloquea «Crear plan» con «Reintentar»", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    montarForm(vi.fn<Previsualizar>().mockRejectedValue(new Error("red")));
    await custom(user, "Envíos Norte");
    expect(await screen.findByText("No se pudo comprobar el consumo de la empresa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeDisabled();
    error.mockRestore();
  });

  it("D17: «Reintentar» relee la misma entrada; con éxito se habilita «Crear plan» y se crea", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previsualizar = vi
      .fn<Previsualizar>()
      .mockRejectedValueOnce(new Error("red"))
      .mockResolvedValue(PREVIA_SIN_AVISOS);
    const { enviar, onGuardado } = montarForm(previsualizar);
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Crear plan" })).toBeEnabled());
    expect(previsualizar).toHaveBeenCalledTimes(2);
    expect(previsualizar).toHaveBeenLastCalledWith({ organizacionId: SIN_PLAN, inicioCiclo: MANANA, topes: SIN_TOPES });
    expect(screen.queryByText("No se pudo comprobar el consumo de la empresa")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(onGuardado).toHaveBeenCalledWith(OK, "Norte a medida");
    error.mockRestore();
  });

  it("D17: si se guarda en la pausa y la lectura de ese momento falla, no se crea y sale «Reintentar»", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previsualizar = vi
      .fn<Previsualizar>()
      .mockResolvedValueOnce(PREVIA_SIN_AVISOS)
      .mockRejectedValue(new Error("red"));
    const { enviar } = montarForm(previsualizar);
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await waitFor(() => expect(previsualizar).toHaveBeenCalledTimes(1));
    // Un tope nuevo abre la pausa; se guarda antes de que termine: la lectura se hace al guardar.
    await user.type(screen.getByLabelText("API keys activas"), "2");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeDisabled();
    expect(enviar).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("D17: con empresa con plan o plan público no hay vista previa y «Crear plan» no se bloquea", async () => {
    const user = userEvent.setup();
    const { enviar, previsualizar } = montarForm();
    await custom(user, "Reparto Sur");
    await conCosto(user);
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));

    cleanup();
    const publico = montarForm();
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Público");
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(publico.enviar).toHaveBeenCalledTimes(1));
    expect(previsualizar).not.toHaveBeenCalled();
    expect(publico.previsualizar).not.toHaveBeenCalled();
  });

  it("D12, D13, D17: con la lectura en vuelo «Crear plan» espera deshabilitado; al llegar se crea", async () => {
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
    expect(screen.getByRole("button", { name: "Crear plan" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    expect(enviar).not.toHaveBeenCalled();

    resolver(PREVIA_SIN_AVISOS);
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear plan" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    expect(onGuardado).toHaveBeenCalledWith(OK, "Norte a medida");
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
        rangoFechaDeEfecto={RANGO_EFECTO}
        crearPlan={crearPlan}
        previsualizarCustom={previsualizar}
      />,
    );
  }

  it("D12: tras crear, junto a «Plan creado» salen los topes ya pasados", async () => {
    const user = userEvent.setup();
    const crearPlan = vi.fn<Enviar>().mockResolvedValue({ ...OK, avisos: PREVIA_CON_AVISOS.estado === "ok" ? PREVIA_CON_AVISOS.avisos : [] } as PlanResult);
    montarModulo(crearPlan, vi.fn<Previsualizar>().mockResolvedValue(PREVIA_CON_AVISOS));
    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    await custom(user, "Envíos Norte");
    await conCosto(user);
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Plan «Norte a medida» creado.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
