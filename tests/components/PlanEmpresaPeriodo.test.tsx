// @vitest-environment jsdom
// SLT-86 (design §7.1, §7.2; R24–R26, R30) — EL PLAN DE UNA EMPRESA EN SU DETALLE CON PERÍODOS DE CALENDARIO.
//
// Se monta el `PlanEmpresa` REAL con el `ToastProvider` real; las actions llegan por props como dobles y
// `router.refresh` se espía. El plan se arma con `planConConsumo` real. Se mide:
// - «Cambiar plan», «Cambiar tipo de cobro» y la primera asignación: los cuatro tipos, «Rige desde» y el
//   costo base del primer período o tramo (R24, R25);
// - el cambio pendiente con «Cancelar cambio», con y sin plan (R26);
// - la fila «cambio cancelado» del historial (R26, R30).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { ToastProvider } from "@/providers/ToastProvider";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type {
  AsignacionDePlan,
  CambiarTipoCobroResult,
  CancelarCambioEmpresaResult,
  PlanDeEmpresaVista,
  PlanDTO,
  PlanResult,
  PreciosQueRigen,
  TipoCobro,
} from "@/lib/types/planes";
import type { PendienteDeEmpresa } from "@/lib/types/consumo-plan";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const PLAN_ACTUAL = "11111111-1111-4111-8111-111111111111";
/** 2026-03-10 a mediodía en la hora de la plataforma. */
const AHORA = new Date("2026-03-10T18:00:00.000Z");
/** El primer día del siguiente período mensual: lo calcula la página con `fechaDeEfectoPorDefecto`. */
const FECHA_EFECTO = "2026-04-01";
const RANGO_EFECTO = { hoy: "2026-03-10", min: "2026-03-10", max: "2027-03-10" };
const MANANA = "2026-10-30";

type Asignar = (i: {
  organizacionId: string;
  planId: string;
  inicioCiclo?: string;
  vigenteDesde?: string;
  tipoCobro: TipoCobro;
}) => Promise<PlanResult>;
type CambiarTipo = (i: { organizacionId: string; tipoCobro: TipoCobro; vigenteDesde: string }) => Promise<CambiarTipoCobroResult>;
type Cancelar = (i: { organizacionId: string }) => Promise<CancelarCambioEmpresaResult>;

function planDTO(extra: Partial<PlanDTO> & Pick<PlanDTO, "id" | "nombre">): PlanDTO {
  return {
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "sin_precio" },
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null,
    archivado: false,
    ...extra,
  };
}

const ACTUAL = planDTO({
  id: PLAN_ACTUAL,
  nombre: "Plan Crecer",
  precio: { tipo: "monto", mensual: "45000.00", descuentos: {} },
});
const PRO = planDTO({
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Pro",
  precio: { tipo: "monto", mensual: "31000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
});

function leido(pendiente: PendienteDeEmpresa | null): PlanConUsoLeido {
  return {
    vigente: {
      nombre: ACTUAL.nombre,
      topes: ACTUAL.topes,
      modulos: [],
      precio: ACTUAL.precio,
      costoPorOrden: ACTUAL.costoPorOrden,
      costoPorOrdenPorcentual: null,
    },
    entrada: new Date("2026-03-01T06:00:00.000Z"),
    precioDelPeriodo: ACTUAL.precio,
    pendiente,
    uso: { ordenes: 4, apiKeys: 0, porRol: { admin: 0, mensajero: 0, adminTienda: 0, adminSatelite: 0 } },
    cambio: null,
    costoVigente: { modo: "fijo", monto: "100.00", fuente: "plan" },
    cobroCiclo: { cobrado: "0.00", pendientes: 0 },
    tipoCobro: "mensual",
  };
}

function conPlan(pendiente: PendienteDeEmpresa | null = null, asignaciones: AsignacionDePlan[] = []): PlanDeEmpresaVista {
  return {
    organizacionId: ORG,
    plan: { ...planConConsumo(leido(pendiente), AHORA), planId: PLAN_ACTUAL, archivado: false },
    pendienteSinPlan: null,
    asignaciones,
  };
}

function sinPlan(pendienteSinPlan: PendienteDeEmpresa | null = null): PlanDeEmpresaVista {
  return { organizacionId: ORG, plan: null, pendienteSinPlan, asignaciones: [] };
}

function montar({
  v = conPlan(),
  asignar = vi.fn<Asignar>().mockResolvedValue({ estado: "ok", planId: PRO.id, cambio: true, avisos: [], vigenteDesde: null }),
  cambiar = vi.fn<CambiarTipo>().mockResolvedValue({ estado: "ok", cambio: true, vigenteDesde: null }),
  cancelar = vi.fn<Cancelar>().mockResolvedValue({ estado: "ok" }),
  precios,
}: {
  v?: PlanDeEmpresaVista;
  asignar?: Asignar;
  cambiar?: CambiarTipo;
  cancelar?: Cancelar;
  precios?: PreciosQueRigen;
} = {}) {
  render(
    <ToastProvider>
      <PlanEmpresa
        organizacionId={ORG}
        empresaNombre="Envíos Norte"
        vista={v}
        asignables={[ACTUAL, PRO]}
        planActual={v.plan === null ? undefined : ACTUAL}
        asignarPlan={asignar}
        rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
        inicioCicloPorDefecto={MANANA}
        rangoFechaDeEfecto={RANGO_EFECTO}
        fechaDeEfectoPorDefecto={v.plan === null ? null : FECHA_EFECTO}
        preciosQueRigen={precios}
        previsualizarAsignacion={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
        cambiarTipoCobro={cambiar}
        cancelarCambioEmpresa={cancelar}
      />
    </ToastProvider>,
  );
  return { asignar: vi.mocked(asignar), cambiar: vi.mocked(cambiar), cancelar: vi.mocked(cancelar) };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirCambioDePlan(user: Usuario) {
  await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Pro (Público)" }));
  await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
  return screen.findByRole("dialog", { name: "¿Cambiar el plan de esta empresa?" });
}

async function abrirCambioDeTipo(user: Usuario) {
  await user.click(screen.getByRole("button", { name: "Cambiar tipo de cobro" }));
  return screen.findByRole("dialog", { name: "¿Cambiar el tipo de cobro?" });
}

const tipos = (modal: HTMLElement) =>
  within(within(modal).getByRole("radiogroup", { name: "Tipo de cobro" }))
    .getAllByRole("radio")
    .map((r) => r.closest("label")?.textContent);

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-86 R24, R25 — «Cambiar plan» con fecha de efecto y costo del primer período", () => {
  it("R24: el modal muestra el costo base mensual con el descuento de cada período, sin tope de órdenes", async () => {
    const user = userEvent.setup();
    montar();
    const modal = await abrirCambioDePlan(user);

    expect(within(modal).getByText("Costo base: 31000.00 / mes · Descuento anual: 10.00 %")).toBeInTheDocument();
    expect(modal).not.toHaveTextContent(/Órdenes por ciclo/);
  });

  it("R25: ofrece los cuatro tipos y «Rige desde» con el siguiente período, su rango y su ayuda", async () => {
    const user = userEvent.setup();
    montar();
    const modal = await abrirCambioDePlan(user);

    expect(tipos(modal)).toEqual(["Quincenal", "Mensual", "Bimestral", "Anual"]);
    const fecha = within(modal).getByLabelText("Rige desde");
    expect(fecha).toHaveAttribute("type", "date");
    expect(fecha).toHaveValue(FECHA_EFECTO);
    expect(fecha).toHaveAttribute("min", RANGO_EFECTO.min);
    expect(fecha).toHaveAttribute("max", RANGO_EFECTO.max);
    expect(fecha).toHaveAccessibleDescription("Hasta esa fecha la empresa sigue con su plan y su período actuales.");
  });

  it("R25: muestra el costo base del primer período completo con el tipo elegido", async () => {
    const user = userEvent.setup();
    montar();
    const modal = await abrirCambioDePlan(user);

    expect(within(modal).getByText("Costo base mensual: 31000.00")).toBeInTheDocument();
    expect(within(modal).getByText("Período: 2026-04-01 – 2026-04-30")).toBeInTheDocument();
  });

  it("R12, R25: con una fecha a mitad de período muestra el tramo y su costo proporcional", async () => {
    const user = userEvent.setup();
    montar();
    const modal = await abrirCambioDePlan(user);
    await user.click(within(modal).getByRole("radio", { name: "Quincenal" }));
    fireEvent.change(within(modal).getByLabelText("Rige desde"), { target: { value: "2026-04-10" } });

    expect(within(modal).getByText("Costo base quincenal: 6200.00")).toBeInTheDocument();
    expect(within(modal).getByText("Período: 2026-04-10 – 2026-04-15 (tramo de 6 de 15 días)")).toBeInTheDocument();
  });

  it("R16, R25: confirmar manda el tipo y la fecha; con el cambio pendiente lo dice con su fecha y sus avisos", async () => {
    const user = userEvent.setup();
    const aviso = { organizacionId: ORG, empresa: "Envíos Norte", tope: "mensajero" as const, usados: 12, maximo: 10 };
    const { asignar } = montar({
      asignar: vi
        .fn<Asignar>()
        .mockResolvedValue({ estado: "ok", planId: PRO.id, cambio: true, avisos: [aviso], vigenteDesde: "2026-04-15" }),
    });
    const modal = await abrirCambioDePlan(user);
    await user.click(within(modal).getByRole("radio", { name: "Bimestral" }));
    fireEvent.change(within(modal).getByLabelText("Rige desde"), { target: { value: "2026-04-15" } });
    await user.click(within(modal).getByRole("button", { name: "Cambiar plan" }));

    await waitFor(() =>
      expect(asignar).toHaveBeenCalledWith({
        organizacionId: ORG,
        planId: PRO.id,
        vigenteDesde: "2026-04-15",
        tipoCobro: "bimestral",
      }),
    );
    // El texto único del cambio programado (design §6.5 de SLT-58).
    expect(await screen.findByText("Cambio programado desde 2026-04-15.")).toBeInTheDocument();
    // R18: con fecha futura los topes ya pasados son avisos, no rechazos.
    expect(
      screen.getByText("La empresa ya tiene 12 de 10 Mensajero: no podrá activar ni crear más hasta bajar del tope."),
    ).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("SLT-118 R32: al cambiar el plan, la confirmación dice la fecha real del servidor y no la elegida", async () => {
    const user = userEvent.setup();
    const { asignar } = montar({
      asignar: vi
        .fn<Asignar>()
        .mockResolvedValue({ estado: "ok", planId: PRO.id, cambio: true, avisos: [], vigenteDesde: "2026-05-01" }),
    });
    const modal = await abrirCambioDePlan(user);
    fireEvent.change(within(modal).getByLabelText("Rige desde"), { target: { value: "2026-04-10" } });
    await user.click(within(modal).getByRole("button", { name: "Cambiar plan" }));

    await waitFor(() => expect(asignar).toHaveBeenCalledWith(expect.objectContaining({ vigenteDesde: "2026-04-10" })));
    expect(await screen.findByText("Cambio programado desde 2026-05-01.")).toBeInTheDocument();
    expect(screen.queryByText("Cambio programado desde 2026-04-10.")).toBeNull();
  });

  it("R16: un `validation_error` de `vigenteDesde` va junto a «Rige desde» con el modal abierto", async () => {
    const user = userEvent.setup();
    montar({
      asignar: vi.fn<Asignar>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { vigenteDesde: ["Elige una fecha entre el 2026-03-10 y el 2027-03-10."] },
      }),
    });
    const modal = await abrirCambioDePlan(user);
    await user.click(within(modal).getByRole("button", { name: "Cambiar plan" }));

    const fecha = within(modal).getByLabelText("Rige desde");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    expect(within(modal).getByText("Elige una fecha entre el 2026-03-10 y el 2027-03-10.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R17: el modal ya no dice que topes y módulos cambian al confirmar", async () => {
    const user = userEvent.setup();
    montar();
    const modal = await abrirCambioDePlan(user);
    expect(modal).toHaveTextContent("La empresa pasa de «Plan Crecer» a «Pro».");
    expect(modal).not.toHaveTextContent("cambian en cuanto confirmes");
  });
});

describe("SLT-86 R16, R25 — «Cambiar tipo de cobro» con fecha de efecto", () => {
  it("R25: los cuatro tipos, «Rige desde» con el siguiente período y el costo del primer período o tramo", async () => {
    const user = userEvent.setup();
    montar();
    const modal = await abrirCambioDeTipo(user);

    expect(tipos(modal)).toEqual(["Quincenal", "Mensual", "Bimestral", "Anual"]);
    expect(within(modal).getByLabelText("Rige desde")).toHaveValue(FECHA_EFECTO);
    expect(modal).toHaveTextContent("La empresa sigue con «Plan Crecer»: no cambian sus topes ni sus módulos.");

    // Del 1 de abril al 31 de diciembre: 275 de 365 días de 45 000 × 12.
    await user.click(within(modal).getByRole("radio", { name: "Anual" }));
    expect(within(modal).getByText("Costo base anual: 406849.32")).toBeInTheDocument();
    expect(within(modal).getByText("Período: 2026-04-01 – 2026-12-31 (tramo de 275 de 365 días)")).toBeInTheDocument();
  });

  it("R16: confirmar manda el tipo y la fecha de efecto", async () => {
    const user = userEvent.setup();
    const { cambiar } = montar();
    const modal = await abrirCambioDeTipo(user);
    await user.click(within(modal).getByRole("radio", { name: "Quincenal" }));
    fireEvent.change(within(modal).getByLabelText("Rige desde"), { target: { value: "2026-03-16" } });
    await user.click(within(modal).getByRole("button", { name: "Cambiar tipo de cobro" }));

    await waitFor(() =>
      expect(cambiar).toHaveBeenCalledWith({ organizacionId: ORG, tipoCobro: "quincenal", vigenteDesde: "2026-03-16" }),
    );
  });

  it("R16: un `validation_error` de `vigenteDesde` va junto a «Rige desde» con el modal abierto", async () => {
    const user = userEvent.setup();
    montar({
      cambiar: vi.fn<CambiarTipo>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { vigenteDesde: ["Elige desde qué fecha rige el cambio."] },
      }),
    });
    const modal = await abrirCambioDeTipo(user);
    await user.click(within(modal).getByRole("radio", { name: "Anual" }));
    await user.click(within(modal).getByRole("button", { name: "Cambiar tipo de cobro" }));

    const fecha = within(modal).getByLabelText("Rige desde");
    await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
    expect(within(modal).getByText("Elige desde qué fecha rige el cambio.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "¿Cambiar el tipo de cobro?" })).toBeInTheDocument();
  });
});

describe("SLT-86 R15, R25 (review m4) — el costo del primer período con el precio que regirá en la fecha elegida", () => {
  /** Las 00:00 de la plataforma (UTC−6) de una fecha, como las entrega `verPreciosQueRigen`. */
  const desde = (fecha: string) => `${fecha}T06:00:00.000Z`;
  const monto = (mensual: string) => ({ tipo: "monto" as const, mensual, descuentos: {} });

  it("R15, R25: «Cambiar plan» con una edición programada antes de «Rige desde» muestra el costo nuevo", async () => {
    const user = userEvent.setup();
    montar({
      precios: { [PRO.id]: [{ desde: null, precio: PRO.precio }, { desde: desde("2026-03-20"), precio: monto("62000.00") }] },
    });
    const modal = await abrirCambioDePlan(user);

    expect(within(modal).getByText("Costo base mensual: 62000.00")).toBeInTheDocument();
    expect(within(modal).getByText("Período: 2026-04-01 – 2026-04-30")).toBeInTheDocument();
  });

  it("R15, R25: «Cambiar plan» con la edición después de «Rige desde» muestra el costo de hoy, y el nuevo al mover la fecha", async () => {
    const user = userEvent.setup();
    montar({
      precios: { [PRO.id]: [{ desde: null, precio: PRO.precio }, { desde: desde("2026-05-01"), precio: monto("62000.00") }] },
    });
    const modal = await abrirCambioDePlan(user);

    expect(within(modal).getByText("Costo base mensual: 31000.00")).toBeInTheDocument();
    fireEvent.change(within(modal).getByLabelText("Rige desde"), { target: { value: "2026-05-01" } });
    expect(within(modal).getByText("Costo base mensual: 62000.00")).toBeInTheDocument();
  });

  it("R25: «Cambiar plan» sin edición programada muestra el mismo costo que hoy", async () => {
    const user = userEvent.setup();
    montar({ precios: {} });
    const modal = await abrirCambioDePlan(user);

    expect(within(modal).getByText("Costo base mensual: 31000.00")).toBeInTheDocument();
  });

  it("R15, R25: «Cambiar tipo de cobro» usa la edición programada del plan actual antes de «Rige desde»", async () => {
    const user = userEvent.setup();
    montar({
      precios: {
        [ACTUAL.id]: [{ desde: null, precio: ACTUAL.precio }, { desde: desde("2026-04-01"), precio: monto("50000.00") }],
        // La del plan elegido en otro modal no cuenta aquí.
        [PRO.id]: [{ desde: desde("2026-03-11"), precio: monto("99000.00") }],
      },
    });
    const modal = await abrirCambioDeTipo(user);
    await user.click(within(modal).getByRole("radio", { name: "Quincenal" }));

    expect(within(modal).getByText("Costo base quincenal: 25000.00")).toBeInTheDocument();
    expect(within(modal).getByText("Período: 2026-04-01 – 2026-04-15")).toBeInTheDocument();
  });

  it("R25: «Cambiar tipo de cobro» con la edición después de «Rige desde» muestra el mismo costo que hoy", async () => {
    const user = userEvent.setup();
    montar({
      precios: { [ACTUAL.id]: [{ desde: null, precio: ACTUAL.precio }, { desde: desde("2026-04-02"), precio: monto("50000.00") }] },
    });
    const modal = await abrirCambioDeTipo(user);
    await user.click(within(modal).getByRole("radio", { name: "Quincenal" }));

    expect(within(modal).getByText("Costo base quincenal: 22500.00")).toBeInTheDocument();
  });

  it("R15, R25: la primera asignación usa la edición programada antes de su inicio", async () => {
    const user = userEvent.setup();
    montar({
      v: sinPlan(),
      precios: { [PRO.id]: [{ desde: null, precio: PRO.precio }, { desde: desde(MANANA), precio: monto("62000.00") }] },
    });
    await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Pro (Público)" }));
    await user.click(screen.getByRole("button", { name: "Asignar plan" }));
    const modal = await screen.findByRole("dialog", { name: "¿Asignar este plan a la empresa?" });

    // Del 30 al 31 de octubre: 2 de 31 días de 62 000.
    expect(within(modal).getByText("Costo base mensual: 4000.00")).toBeInTheDocument();
  });
});

describe("SLT-86 R25 — la primera asignación", () => {
  it("R25: los cuatro tipos y el costo base del primer tramo desde la fecha de inicio", async () => {
    const user = userEvent.setup();
    montar({ v: sinPlan() });
    await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Pro (Público)" }));
    await user.click(screen.getByRole("button", { name: "Asignar plan" }));
    const modal = await screen.findByRole("dialog", { name: "¿Asignar este plan a la empresa?" });

    expect(tipos(modal)).toEqual(["Quincenal", "Mensual", "Bimestral", "Anual"]);
    expect(modal).toHaveTextContent(`El plan empieza a regir el ${MANANA}.`);
    // Del 30 al 31 de octubre: 2 de 31 días de 31 000.
    expect(within(modal).getByText("Costo base mensual: 2000.00")).toBeInTheDocument();
    expect(within(modal).getByText("Período: 2026-10-30 – 2026-10-31 (tramo de 2 de 31 días)")).toBeInTheDocument();
    expect(within(modal).queryByLabelText("Rige desde")).toBeNull();
  });
});

describe("SLT-86 R19, R26 — el cambio pendiente con «Cancelar cambio»", () => {
  const PENDIENTE: PendienteDeEmpresa = { planNombre: "Pro", tipo: "quincenal", desde: "2026-04-01" };

  it("R26: con plan, «Desde el {fecha}: {plan} · {Tipo}» y «Cancelar cambio»", () => {
    montar({ v: conPlan(PENDIENTE) });
    const seccion = screen.getByRole("region", { name: "Plan" });
    expect(within(seccion).getByText("Desde el 2026-04-01: Pro · Quincenal")).toBeInTheDocument();
    expect(within(seccion).getByRole("button", { name: "Cancelar cambio" })).toBeInTheDocument();
  });

  it("R26: sin pendiente no hay «Cancelar cambio»", () => {
    montar();
    expect(screen.queryByRole("button", { name: "Cancelar cambio" })).toBeNull();
    expect(screen.queryByText(/^Desde el /)).toBeNull();
  });

  it("R26: sin plan y con una primera asignación pendiente, «Sin límites» y debajo «{Plan} empieza a regir el {fecha}»", () => {
    montar({ v: sinPlan(PENDIENTE) });
    const seccion = screen.getByRole("region", { name: "Plan" });
    expect(within(seccion).getByText("Sin límites")).toBeInTheDocument();
    expect(within(seccion).getByText("Pro empieza a regir el 2026-04-01")).toBeInTheDocument();
    expect(within(seccion).queryByText("Sin plan: sin límites")).toBeNull();
    expect(within(seccion).getByRole("button", { name: "Cancelar cambio" })).toBeInTheDocument();
  });

  /** Decisión del 2026-11-06: «Cancelar cambio» abre la confirmación; la action sale de su botón. */
  const TITULO_CONFIRMAR = "¿Cancelar el cambio a Pro programado para el 2026-04-01?";
  async function cancelarYConfirmar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Cancelar cambio" }));
    const modal = await screen.findByRole("dialog", { name: TITULO_CONFIRMAR });
    await user.click(within(modal).getByRole("button", { name: "Cancelar cambio" }));
  }

  it("R19 (decisión 2026-11-06): «Cancelar cambio» pide confirmación con el plan y la fecha, sin llamar aún a la action", async () => {
    const user = userEvent.setup();
    const { cancelar } = montar({ v: conPlan(PENDIENTE) });
    await user.click(screen.getByRole("button", { name: "Cancelar cambio" }));

    const modal = await screen.findByRole("dialog", { name: TITULO_CONFIRMAR });
    expect(within(modal).getByRole("button", { name: "Cancelar cambio" })).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(cancelar).not.toHaveBeenCalled();
  });

  it("R19 (decisión 2026-11-06): cerrar la confirmación con «Volver» no llama a la action", async () => {
    const user = userEvent.setup();
    const { cancelar } = montar({ v: conPlan(PENDIENTE) });
    await user.click(screen.getByRole("button", { name: "Cancelar cambio" }));
    const modal = await screen.findByRole("dialog", { name: TITULO_CONFIRMAR });
    await user.click(within(modal).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cancelar).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R19: confirmar llama a la action con la empresa, avisa, cierra el modal y relee la página", async () => {
    const user = userEvent.setup();
    const { cancelar } = montar({ v: conPlan(PENDIENTE) });
    await cancelarYConfirmar(user);

    await waitFor(() => expect(cancelar).toHaveBeenCalledWith({ organizacionId: ORG }));
    expect(await screen.findByText("Cambio programado cancelado.")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITULO_CONFIRMAR })).toBeNull());
  });

  it("R19, R26: también sin plan pide confirmación y cancela la primera asignación pendiente", async () => {
    const user = userEvent.setup();
    const { cancelar } = montar({ v: sinPlan(PENDIENTE) });
    await cancelarYConfirmar(user);
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith({ organizacionId: ORG }));
  });

  it.each<[CancelarCambioEmpresaResult, string]>([
    [{ estado: "sin_cambio_programado" }, "La empresa ya no tiene un cambio pendiente."],
    [{ estado: "not_found" }, "Esa empresa ya no existe."],
    [{ estado: "forbidden" }, "No tienes permiso para esto."],
  ])("R19: el rechazo %j se explica y no relee", async (resultado, texto) => {
    const user = userEvent.setup();
    montar({ v: conPlan(PENDIENTE), cancelar: vi.fn<Cancelar>().mockResolvedValue(resultado) });
    await cancelarYConfirmar(user);

    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R19: si la action lanza, avisa y no relee", async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    montar({ v: conPlan(PENDIENTE), cancelar: vi.fn<Cancelar>().mockRejectedValue(new Error("red")) });
    await cancelarYConfirmar(user);

    expect(await screen.findByText("No se pudo guardar. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("SLT-86 R26, R30 — el historial de asignaciones con fecha y cambios cancelados", () => {
  const FILAS: AsignacionDePlan[] = [
    {
      creadoAt: "2026-03-09T18:30:00.000Z",
      actorNombre: "Sara Admin",
      planNombre: "Plan «Pro»",
      tipo: "cambio_cancelado",
      tipoCobro: "quincenal",
      tipoCobroAnterior: null,
      desde: "2026-12-01",
    },
    {
      creadoAt: "2026-03-01T18:30:00.000Z",
      actorNombre: "Sara Admin",
      planNombre: "Plan «Plan Crecer»",
      tipo: "cambio_tipo_cobro",
      tipoCobro: "bimestral",
      tipoCobroAnterior: "mensual",
      desde: "2026-03-01",
    },
    {
      creadoAt: "2026-02-01T18:30:00.000Z",
      actorNombre: "Pedro Plataforma",
      planNombre: "Plan «Plan Crecer»",
      tipo: "asignacion",
      tipoCobro: "mensual",
      tipoCobroAnterior: null,
      desde: "2026-02-01",
    },
  ];

  it("R26, R30: el cambio cancelado dice cuál era; las demás filas, su tipo y desde cuándo rigen", () => {
    montar({ v: conPlan(null, FILAS) });
    const tabla = screen.getByRole("table", { name: "Historial de asignaciones" });
    expect(within(tabla).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Fecha",
      "Quién",
      "Plan asignado",
      "Tipo de cobro",
      "Rige desde",
    ]);
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas.map((f) => within(f).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["2026-03-09 12:30", "Sara Admin", "Plan «Pro»", "Cambio cancelado: Quincenal desde el 2026-12-01", "—"],
      ["2026-03-01 12:30", "Sara Admin", "Plan «Plan Crecer»", "Cambió de Mensual a Bimestral", "2026-03-01"],
      ["2026-02-01 12:30", "Pedro Plataforma", "Plan «Plan Crecer»", "Mensual", "2026-02-01"],
    ]);
  });
});
