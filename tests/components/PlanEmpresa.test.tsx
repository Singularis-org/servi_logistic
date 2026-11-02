// @vitest-environment jsdom
// SLT-58 (design §6.3, §11.5; R18, R19, R20, R21, R29, R37, R38) — EL PLAN DE UNA EMPRESA EN SU
// DETALLE DEL SUPERADMIN.
//
// Se monta el componente REAL con el `ToastProvider` real; `asignarPlanAction` y
// `previsualizarAsignacionPlanAction` llegan por props como dobles y `router.refresh` se espía. El plan se arma con `planConConsumo` real, así que las filas, las
// marcas y el reinicio son los mismos que ve la empresa en «Mi plan».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { ToastProvider } from "@/providers/ToastProvider";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type {
  AsignacionDePlan,
  PlanDeEmpresaVista,
  PlanDTO,
  PlanResult,
  VistaPreviaAsignacionResult,
} from "@/lib/types/planes";

type EntradaAsignar = { organizacionId: string; planId: string; inicioCiclo?: string };
type EntradaVistaPrevia = { organizacionId: string; planId: string; inicioCiclo: string };

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const OTRA = "0a0b0c0d-1111-4222-8333-444455556666";
const PLAN_ACTUAL = "11111111-1111-4111-8111-111111111111";

const LEIDO: PlanConUsoLeido = {
  vigente: {
    nombre: "Plan Crecer",
    topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10 }, apiKeys: 2 },
    modulos: ["analitica"],
    precio: { tipo: "monto", mensual: "45000", anual: null },
    costoPorOrden: null, // SLT-66 R8: campo nuevo de la versión
  },
  ancla: new Date("2026-01-15T06:00:00.000Z"),
  // SLT-66 R5: el uso ya no lleva `maestro`.
  uso: { ordenes: 1000, apiKeys: 2, porRol: { admin: 0, mensajero: 8, adminTienda: 0, adminSatelite: 0 } },
  cambio: {
    vigenteDesde: new Date("2026-04-01T06:00:00.000Z"),
    version: {
      nombre: "Plan Crecer 2",
      topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 10 }, apiKeys: 2 },
      modulos: ["analitica"],
      precio: { tipo: "monto", mensual: "45000", anual: null },
      costoPorOrden: null, // SLT-66 R8: campo nuevo de la versión
    },
  },
  costoVigente: { monto: "500.00", fuente: "global" }, // SLT-66 R18: campo nuevo de la lectura
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
    costoPorOrden: null, // SLT-66 R8: campo nuevo del PlanDTO
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
  topes: { ordenesPorCiclo: 5000, porRol: { mensajero: 10 }, apiKeys: 2 },
  modulos: ["analitica", "monitoreo"],
  precio: { tipo: "monto", mensual: "45000", anual: null },
});
const CUSTOM_AJENO = planDTO({
  id: "44444444-4444-4444-8444-444444444444",
  nombre: "Enterprise Sur",
  visibilidad: "custom",
  organizacionId: OTRA,
});
const ARCHIVADO = planDTO({ id: "55555555-5555-4555-8555-555555555555", nombre: "Viejo", archivado: true });
// La misma versión vigente que `LEIDO`: es contra la que se calcula «qué cambia».
const ACTUAL = planDTO({ id: PLAN_ACTUAL, ...LEIDO.vigente });

const OK: PlanResult = { estado: "ok", planId: PUBLICO.id, cambio: true, avisos: [], vigenteDesde: null };

// El rango que la página calcula en el servidor (§11.5); aquí, fijo.
const RANGO: RangoDelInicioDelCiclo = { hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" };
const VISTA_PREVIA_OK: VistaPreviaAsignacionResult = { estado: "ok", avisos: [], siguienteCiclo: "2026-11-29" };

function montar({
  v = vista(),
  asignables = [PUBLICO, CUSTOM_SUYO, CUSTOM_AJENO, ARCHIVADO, ACTUAL] as PlanDTO[] | null,
  asignar = vi.fn<(i: EntradaAsignar) => Promise<PlanResult>>().mockResolvedValue(OK),
  previsualizar = vi
    .fn<(i: EntradaVistaPrevia) => Promise<VistaPreviaAsignacionResult>>()
    .mockResolvedValue(VISTA_PREVIA_OK),
  planActual,
}: {
  v?: PlanDeEmpresaVista | null;
  asignables?: PlanDTO[] | null;
  asignar?: (i: EntradaAsignar) => Promise<PlanResult>;
  previsualizar?: (i: EntradaVistaPrevia) => Promise<VistaPreviaAsignacionResult>;
  planActual?: PlanDTO | null;
} = {}) {
  render(
    <ToastProvider>
      <PlanEmpresa
        organizacionId={ORG}
        empresaNombre="Envíos Norte"
        vista={v}
        asignables={asignables}
        planActual={planActual}
        asignarPlan={asignar}
        rangoInicioCiclo={RANGO}
        previsualizarAsignacion={previsualizar}
      />
    </ToastProvider>,
  );
  return asignar;
}

/**
 * Primera asignación: elige el plan, abre el modal y espera a que la vista previa vuelva (con un doble
 * resuelto, «Asignar plan» se habilita). Devuelve el modal.
 */
async function abrirPrimera(user: ReturnType<typeof userEvent.setup>, nombre = "Básico (Público)") {
  await elegir(user, nombre);
  await user.click(screen.getByRole("button", { name: "Asignar plan" }));
  return screen.findByRole("dialog", { name: "¿Asignar este plan a la empresa?" });
}

async function confirmarPrimera(user: ReturnType<typeof userEvent.setup>, modal: HTMLElement) {
  const boton = within(modal).getByRole("button", { name: "Asignar plan" });
  await waitFor(() => expect(boton).toBeEnabled());
  await user.click(boton);
}

async function elegir(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: nombre }));
}

/** «Cambiar plan» abre la confirmación (decisión cerrada del 2026-10-29); se confirma desde el modal. */
async function cambiarYConfirmar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
  const modal = await screen.findByRole("dialog");
  await user.click(within(modal).getByRole("button", { name: "Cambiar plan" }));
}

/** El aviso es un `Alert` destructivo (no un `<p>` suelto) con el texto en `danger-strong`. */
function esAlertDestructivo(el: HTMLElement) {
  expect(el).toHaveAttribute("data-slot", "alert");
  expect(el).toHaveClass("text-danger-strong");
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-58 R19 — el plan de la empresa con su consumo", () => {
  it("R19: nombre, precio, módulos, filas con marca, reinicio y cambio programado", () => {
    montar();

    const seccion = screen.getByRole("region", { name: "Plan" });
    expect(within(seccion).getByRole("heading", { level: 3, name: "Plan Crecer" })).toBeInTheDocument();
    // SLT-66 R9: el precio informativo se pinta como «Costo base: …», con el importe del costeo (dos decimales).
    expect(within(seccion).getByText("Costo base: 45000.00 al mes")).toBeInTheDocument();
    expect(within(seccion).getByRole("list", { name: "Módulos incluidos" })).toHaveTextContent("Analítica");

    const consumo = within(seccion).getByRole("list", { name: "Consumo" });
    expect(within(consumo).getAllByRole("listitem")).toHaveLength(6); // SLT-66 R5: sin la fila del rol Maestro
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

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("No se pudo cargar el plan.");
    esAlertDestructivo(aviso);
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
    await cambiarYConfirmar(user);

    expect(asignar).toHaveBeenCalledWith({ organizacionId: ORG, planId: CUSTOM_SUYO.id });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
    await cambiarYConfirmar(user);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(mensaje);
    esAlertDestructivo(aviso);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refreshMock).not.toHaveBeenCalled();
    // La empresa sigue con su plan.
    expect(screen.getByRole("heading", { level: 3, name: "Plan Crecer" })).toBeInTheDocument();
  });

  it("R20: si no se pudieron leer los asignables, lo dice y no ofrece selector", () => {
    montar({ asignables: null });
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("No se pudieron cargar los planes que se pueden asignar.");
    esAlertDestructivo(aviso);
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
    await cambiarYConfirmar(user);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(texto);
    esAlertDestructivo(aviso);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R18: validation_error → el error junto al selector", async () => {
    const user = userEvent.setup();
    montar({
      asignar: vi.fn().mockResolvedValue({ estado: "validation_error", fieldErrors: { planId: ["Plan inválido."] } }),
    });

    await elegir(user, "Básico (Público)");
    await cambiarYConfirmar(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Plan inválido.");
    expect(screen.getByRole("combobox", { name: "Plan a asignar" })).toHaveAttribute("aria-invalid", "true");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R18: si la action lanza, avisa y no da el cambio por hecho", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    montar({ asignar: vi.fn().mockRejectedValue(new Error("red")) });

    await elegir(user, "Básico (Público)");
    await cambiarYConfirmar(user);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudo asignar el plan. Inténtalo de nuevo.");
    esAlertDestructivo(aviso);
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

  it("R21: sin asignaciones lo dice con el mismo EmptyState con borde que el rastro del plan", () => {
    montar({ v: vista({ asignaciones: [] }) });
    const texto = screen.getByText("Esta empresa todavía no tiene asignaciones de plan.");
    expect(texto.closest(".rounded-md.border")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("SLT-58 R20 — «Cambiar plan» pide confirmación con el resumen (decisión cerrada del 2026-10-29)", () => {
  it("R20: el modal se abre al pulsar «Cambiar plan», resume qué cambia y no llama a la action todavía", async () => {
    const user = userEvent.setup();
    const asignar = montar();

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    const modal = await screen.findByRole("dialog", { name: "¿Cambiar el plan de esta empresa?" });
    expect(modal).toHaveTextContent("La empresa pasa de «Plan Crecer» a «Básico».");
    const lineas = within(modal).getByRole("list", { name: "Esto es lo que cambia:" });
    expect(within(lineas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Nombre del plan: Plan Crecer → Básico",
      "Órdenes por ciclo: 3000 → sin límite",
      "Usuarios activos con el rol Mensajero: 10 → sin límite",
      "API keys activas: 2 → sin límite",
      "Deja de incluirse el módulo Analítica.",
      // `diferenciasDelPlan` compara en forma canónica (dos decimales), igual que en el correo.
      // SLT-66 R9: la línea «Precio:» pasa a «Costo base:».
      "Costo base: 45000.00 al mes → sin precio",
    ]);
    expect(asignar).not.toHaveBeenCalled();
  });

  it("R20: solo salen los topes que cambian y los módulos que entran", async () => {
    const user = userEvent.setup();
    montar();

    await elegir(user, "Enterprise Norte (Custom)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    const modal = await screen.findByRole("dialog");
    const lineas = within(modal).getByRole("list", { name: "Esto es lo que cambia:" });
    expect(within(lineas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Nombre del plan: Plan Crecer → Enterprise Norte",
      "Órdenes por ciclo: 3000 → 5000",
      "Se incluye el módulo Monitoreo.",
    ]);
  });

  it("R20: «Volver» cierra el modal sin llamar a asignarPlanAction", async () => {
    const user = userEvent.setup();
    const asignar = montar();

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(asignar).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R20: confirmar sí llama a asignarPlanAction con la elección", async () => {
    const user = userEvent.setup();
    const asignar = montar();

    await elegir(user, "Básico (Público)");
    await cambiarYConfirmar(user);

    expect(asignar).toHaveBeenCalledTimes(1);
    expect(asignar).toHaveBeenCalledWith({ organizacionId: ORG, planId: PUBLICO.id });
  });

  it("R20: con el plan actual archivado (fuera de los asignables) compara contra el `planActual` de la página", async () => {
    const user = userEvent.setup();
    montar({
      v: vista({ plan: { ...planConConsumo(LEIDO, AHORA), planId: PLAN_ACTUAL, archivado: true } }),
      asignables: [PUBLICO],
      planActual: { ...ACTUAL, archivado: true },
    });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByRole("list", { name: "Esto es lo que cambia:" })).toHaveTextContent(
      "Órdenes por ciclo: 3000 → sin límite",
    );
  });

  it("R20: si no se pudo leer el plan actual, el modal lo dice y no deja confirmar: solo «Reintentar» y «Volver»", async () => {
    const user = userEvent.setup();
    const asignar = montar({ asignables: [PUBLICO], planActual: null });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));

    const modal = await screen.findByRole("dialog");
    const aviso = within(modal).getByRole("alert");
    expect(aviso).toHaveTextContent("No se pudo cargar el plan actual");
    esAlertDestructivo(aviso);
    expect(within(modal).queryByRole("list")).toBeNull();
    expect(within(modal).getAllByRole("button").map((b) => b.textContent)).toEqual(["Volver", "Reintentar"]);
    expect(within(modal).queryByRole("button", { name: "Cambiar plan" })).toBeNull();
    expect(asignar).not.toHaveBeenCalled();
  });

  it("R20: con el plan actual ilegible, «Reintentar» relee la página y no llama a asignarPlanAction", async () => {
    const user = userEvent.setup();
    const asignar = montar({ asignables: [PUBLICO], planActual: null });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reintentar" }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(asignar).not.toHaveBeenCalled();
    // Sigue abierto: si la lectura vuelve, el resumen aparece en su sitio.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("R20: con el plan actual ilegible, «Volver» cierra sin llamar a asignarPlanAction", async () => {
    const user = userEvent.setup();
    const asignar = montar({ asignables: [PUBLICO], planActual: null });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(asignar).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R20: mientras la action corre, el botón muestra el estado de carga (`loading`)", async () => {
    const user = userEvent.setup();
    let resolver: (r: PlanResult) => void = () => {};
    montar({
      v: vista({ plan: null }),
      asignar: vi.fn(() => new Promise<PlanResult>((r) => (resolver = r))),
    });

    await confirmarPrimera(user, await abrirPrimera(user));

    // Con el modal abierto el resto de la página queda `aria-hidden`: el botón de la sección se busca igual.
    const seccion = screen.getByRole("region", { name: "Plan", hidden: true });
    const boton = within(seccion).getByRole("button", { name: /Asignar plan/, hidden: true });
    expect(boton).toHaveAttribute("aria-busy", "true");
    expect(boton).toBeDisabled();
    resolver(OK);
    await waitFor(() => expect(boton).not.toHaveAttribute("aria-busy"));
  });

  it("R20: sin planes que ofrecer, lo dice en texto y no pinta selector ni botón", () => {
    montar({ asignables: [ACTUAL, CUSTOM_AJENO, ARCHIVADO] });

    expect(screen.getByText("No hay otros planes que asignar a esta empresa.")).toHaveClass("text-muted-foreground");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cambiar plan" })).toBeNull();
  });
});

describe("SLT-58 R20 — la primera asignación también pide confirmación (decisión cerrada del 2026-10-29)", () => {
  const SIN_PLAN = () => vista({ plan: null });

  it("R20, R38: el modal dice «Asignar <plan> a <empresa>», cada tope (con «sin límite»), los módulos y el día en que empieza el ciclo", async () => {
    const user = userEvent.setup();
    const asignar = montar({ v: SIN_PLAN() });

    const modal = await abrirPrimera(user, "Enterprise Norte (Custom)");
    expect(modal).toHaveTextContent("Asignar Enterprise Norte a Envíos Norte: desde ahora tendrá:");
    const lineas = within(modal).getByRole("list", { name: "Lo que tendrá la empresa" });
    expect(within(lineas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Órdenes por ciclo: 5.000",
      // SLT-66 R5: sin la línea del rol Maestro.
      "Usuarios activos con el rol Administrador: sin límite",
      "Usuarios activos con el rol Mensajero: 10",
      "Usuarios activos con el rol Admin de tienda: sin límite",
      "Usuarios activos con el rol Admin satélite: sin límite",
      "API keys activas: 2",
      // SLT-66 R24: el costo base y el costo por orden del plan, antes de los módulos.
      "Costo base: 45000 al mes",
      "Costo por orden: se aplica el valor global",
      "Módulos incluidos: Analítica, Monitoreo",
    ]);
    // R38: la frase con la fecha elegida sustituye a «empieza hoy».
    expect(modal).toHaveTextContent("El ciclo de órdenes empieza el 2026-10-29.");
    expect(modal).not.toHaveTextContent("El ciclo de órdenes empieza hoy.");
    expect(asignar).not.toHaveBeenCalled();
  });

  it("R20: un plan sin módulos lo dice («Ninguno»)", async () => {
    const user = userEvent.setup();
    montar({ v: SIN_PLAN() });

    const lineas = within(await abrirPrimera(user)).getByRole("list", { name: "Lo que tendrá la empresa" });
    expect(lineas).toHaveTextContent("Órdenes por ciclo: sin límite");
    expect(lineas).toHaveTextContent("Módulos incluidos: Ninguno");
  });

  it("R20: «Volver» cierra el modal sin llamar a asignarPlanAction", async () => {
    const user = userEvent.setup();
    const asignar = montar({ v: SIN_PLAN() });

    await user.click(within(await abrirPrimera(user)).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(asignar).not.toHaveBeenCalled();
  });

  it("R20, R29: confirmar sí llama a asignarPlanAction con la elección y la fecha, y relee la página", async () => {
    const user = userEvent.setup();
    const asignar = montar({ v: SIN_PLAN() });

    await confirmarPrimera(user, await abrirPrimera(user));

    expect(asignar).toHaveBeenCalledTimes(1);
    expect(asignar).toHaveBeenCalledWith({ organizacionId: ORG, planId: PUBLICO.id, inicioCiclo: RANGO.hoy });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});

describe("SLT-58 §11.5 — la fecha de inicio del ciclo en la primera asignación", () => {
  const SIN_PLAN = () => vista({ plan: null });
  const campoFecha = (modal: HTMLElement) =>
    within(modal).getByLabelText("Inicio del ciclo de órdenes") as HTMLInputElement;
  const vistaPreviaCon = (avisos: Extract<VistaPreviaAsignacionResult, { estado: "ok" }>["avisos"]) =>
    ({ estado: "ok", avisos, siguienteCiclo: "2026-11-05" }) satisfies VistaPreviaAsignacionResult;

  it("R29: el campo trae «hoy» por defecto, con el min/max del servidor, y la vista previa lee esa fecha", async () => {
    const user = userEvent.setup();
    const previsualizar = vi.fn().mockResolvedValue(VISTA_PREVIA_OK);
    montar({ v: SIN_PLAN(), previsualizar });

    const campo = campoFecha(await abrirPrimera(user));
    expect(campo).toHaveAttribute("type", "date");
    expect(campo).toHaveValue("2026-10-29");
    expect(campo).toHaveAttribute("min", "2026-09-29");
    expect(campo).toHaveAttribute("max", "2026-11-29");
    expect(previsualizar).toHaveBeenCalledWith({ organizacionId: ORG, planId: PUBLICO.id, inicioCiclo: "2026-10-29" });
  });

  it("R29, R38: la fecha elegida viaja en la asignación y la frase la repite", async () => {
    const user = userEvent.setup();
    const asignar = montar({ v: SIN_PLAN() });

    const modal = await abrirPrimera(user);
    fireEvent.change(campoFecha(modal), { target: { value: "2026-10-05" } });
    expect(modal).toHaveTextContent("El ciclo de órdenes empieza el 2026-10-05.");
    await confirmarPrimera(user, modal);

    expect(asignar).toHaveBeenCalledWith({ organizacionId: ORG, planId: PUBLICO.id, inicioCiclo: "2026-10-05" });
  });

  it("R37: aviso de órdenes con «3.200 de 3.000» y el día del siguiente ciclo, de un rol y de las API keys", async () => {
    const user = userEvent.setup();
    montar({
      v: SIN_PLAN(),
      previsualizar: vi.fn().mockResolvedValue(
        vistaPreviaCon([
          { organizacionId: ORG, empresa: "Envíos Norte", tope: "ordenes", usados: 3200, maximo: 3000 },
          { organizacionId: ORG, empresa: "Envíos Norte", tope: "mensajero", usados: 12, maximo: 10 },
          { organizacionId: ORG, empresa: "Envíos Norte", tope: "api_keys", usados: 3, maximo: 2 },
        ]),
      ),
    });

    const modal = await abrirPrimera(user);
    const aviso = await within(modal).findByRole("alert");
    expect(within(aviso).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "La empresa ya lleva 3.200 de 3.000 órdenes en este ciclo: no podrá crear más hasta 2026-11-05.",
      "La empresa ya tiene 12 de 10 Mensajero: no podrá activar ni crear más hasta bajar del tope.",
      "La empresa ya tiene 3 de 2 API keys activas: no podrá crear ni activar más hasta bajar del tope.",
    ]);
    // Es un aviso, no un error: el plan se puede asignar igual (R36, R42).
    expect(aviso).not.toHaveClass("text-danger-strong");
    await waitFor(() => expect(within(modal).getByRole("button", { name: "Asignar plan" })).toBeEnabled());
  });

  it("R37: sin tope pasado no hay aviso", async () => {
    const user = userEvent.setup();
    montar({ v: SIN_PLAN() });

    const modal = await abrirPrimera(user);
    await waitFor(() => expect(within(modal).getByRole("button", { name: "Asignar plan" })).toBeEnabled());
    expect(within(modal).queryByRole("alert")).toBeNull();
  });

  it("R37: cambiar la fecha relee la vista previa con la fecha nueva y pinta sus avisos", async () => {
    const user = userEvent.setup();
    const previsualizar = vi
      .fn()
      .mockResolvedValueOnce(VISTA_PREVIA_OK)
      .mockResolvedValueOnce(
        vistaPreviaCon([{ organizacionId: ORG, empresa: "Envíos Norte", tope: "ordenes", usados: 3200, maximo: 3000 }]),
      );
    montar({ v: SIN_PLAN(), previsualizar });

    const modal = await abrirPrimera(user);
    await waitFor(() => expect(previsualizar).toHaveBeenCalledTimes(1));
    expect(within(modal).queryByRole("alert")).toBeNull();

    fireEvent.change(campoFecha(modal), { target: { value: "2026-10-05" } });

    expect(previsualizar).toHaveBeenCalledTimes(2);
    expect(previsualizar).toHaveBeenLastCalledWith({ organizacionId: ORG, planId: PUBLICO.id, inicioCiclo: "2026-10-05" });
    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "La empresa ya lleva 3.200 de 3.000 órdenes en este ciclo: no podrá crear más hasta 2026-11-05.",
    );
  });

  it("R37: una respuesta vieja no pisa la de la fecha nueva", async () => {
    const user = userEvent.setup();
    let resolverVieja: (r: VistaPreviaAsignacionResult) => void = () => {};
    const previsualizar = vi
      .fn()
      .mockImplementationOnce(() => new Promise<VistaPreviaAsignacionResult>((r) => (resolverVieja = r)))
      .mockResolvedValueOnce(VISTA_PREVIA_OK);
    montar({ v: SIN_PLAN(), previsualizar });

    const modal = await abrirPrimera(user);
    fireEvent.change(campoFecha(modal), { target: { value: "2026-10-05" } });
    await waitFor(() => expect(within(modal).getByRole("button", { name: "Asignar plan" })).toBeEnabled());

    resolverVieja(
      vistaPreviaCon([{ organizacionId: ORG, empresa: "Envíos Norte", tope: "ordenes", usados: 3200, maximo: 3000 }]),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(within(modal).queryByRole("alert")).toBeNull();
  });

  it("P11: con la vista previa en vuelo, «Asignar plan» está deshabilitado", async () => {
    const user = userEvent.setup();
    let resolver: (r: VistaPreviaAsignacionResult) => void = () => {};
    const asignar = montar({
      v: SIN_PLAN(),
      previsualizar: vi.fn(() => new Promise<VistaPreviaAsignacionResult>((r) => (resolver = r))),
    });

    const modal = await abrirPrimera(user);
    const boton = within(modal).getByRole("button", { name: "Asignar plan" });
    expect(boton).toBeDisabled();
    await user.click(boton);
    expect(asignar).not.toHaveBeenCalled();

    resolver(VISTA_PREVIA_OK);
    await waitFor(() => expect(boton).toBeEnabled());
  });

  it.each<[string, () => Promise<VistaPreviaAsignacionResult>]>([
    ["lanza", () => Promise.reject(new Error("red"))],
    ["responde not_found", () => Promise.resolve({ estado: "not_found" })],
  ])("R37 (P11): si la lectura %s, solo «Reintentar» y «Volver», sin «Asignar plan»", async (_caso, falla) => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const asignar = montar({ v: SIN_PLAN(), previsualizar: vi.fn(falla) });

    const modal = await abrirPrimera(user);
    const aviso = await within(modal).findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudo comprobar el consumo de la empresa");
    esAlertDestructivo(aviso);
    expect(within(modal).getAllByRole("button").map((b) => b.textContent)).toEqual(["Volver", "Reintentar"]);
    expect(within(modal).queryByRole("button", { name: "Asignar plan" })).toBeNull();
    expect(asignar).not.toHaveBeenCalled();
  });

  it("R37 (P11): «Reintentar» relee la vista previa y, si vuelve, deja confirmar", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const previsualizar = vi.fn().mockRejectedValueOnce(new Error("red")).mockResolvedValueOnce(VISTA_PREVIA_OK);
    const asignar = montar({ v: SIN_PLAN(), previsualizar });

    const modal = await abrirPrimera(user);
    await user.click(await within(modal).findByRole("button", { name: "Reintentar" }));

    expect(previsualizar).toHaveBeenCalledTimes(2);
    expect(previsualizar).toHaveBeenLastCalledWith({ organizacionId: ORG, planId: PUBLICO.id, inicioCiclo: "2026-10-29" });
    await confirmarPrimera(user, modal);
    expect(asignar).toHaveBeenCalledWith({ organizacionId: ORG, planId: PUBLICO.id, inicioCiclo: "2026-10-29" });
  });

  it("R37 (P11): «Volver» con la lectura fallida cierra sin asignar", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const asignar = montar({ v: SIN_PLAN(), previsualizar: vi.fn().mockRejectedValue(new Error("red")) });

    const modal = await abrirPrimera(user);
    await within(modal).findByRole("button", { name: "Reintentar" });
    await user.click(within(modal).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(asignar).not.toHaveBeenCalled();
  });

  it("R30: un `validation_error` de la fecha en la vista previa va junto al campo y no deja confirmar", async () => {
    const user = userEvent.setup();
    montar({
      v: SIN_PLAN(),
      previsualizar: vi.fn().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { inicioCiclo: ["Elige una fecha entre el 2026-09-29 y el 2026-11-29."] },
      } satisfies VistaPreviaAsignacionResult),
    });

    const modal = await abrirPrimera(user);
    expect(await within(modal).findByText("Elige una fecha entre el 2026-09-29 y el 2026-11-29.")).toBeInTheDocument();
    expect(campoFecha(modal)).toHaveAttribute("aria-invalid", "true");
    expect(within(modal).getByRole("button", { name: "Asignar plan" })).toBeDisabled();
  });

  it("R31: un `validation_error` de la fecha al confirmar deja el modal abierto con el error junto al campo", async () => {
    const user = userEvent.setup();
    montar({
      v: SIN_PLAN(),
      asignar: vi.fn().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { inicioCiclo: ["La fecha de inicio solo se elige en la primera asignación."] },
      } satisfies PlanResult),
    });

    const modal = await abrirPrimera(user);
    await confirmarPrimera(user, modal);

    expect(await within(modal).findByText("La fecha de inicio solo se elige en la primera asignación.")).toBeInTheDocument();
    expect(campoFecha(modal)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R36, R42: un `ok` con avisos los deja bajo la sección, con el mismo texto que el modal", async () => {
    const user = userEvent.setup();
    const aviso = { organizacionId: ORG, empresa: "Envíos Norte", tope: "ordenes" as const, usados: 3200, maximo: 3000 };
    montar({
      v: SIN_PLAN(),
      previsualizar: vi.fn().mockResolvedValue(vistaPreviaCon([aviso])),
      asignar: vi.fn().mockResolvedValue({ ...OK, avisos: [aviso] } satisfies PlanResult),
    });

    await confirmarPrimera(user, await abrirPrimera(user));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(screen.getByRole("region", { name: "Plan" })).getByRole("alert")).toHaveTextContent(
      "La empresa ya lleva 3.200 de 3.000 órdenes en este ciclo: no podrá crear más hasta 2026-11-05.",
    );
  });

  it("R31: «Cambiar plan» no tiene campo de fecha, no lee la vista previa y no envía `inicioCiclo`", async () => {
    const user = userEvent.setup();
    const previsualizar = vi.fn().mockResolvedValue(VISTA_PREVIA_OK);
    const asignar = montar({ previsualizar });

    await elegir(user, "Básico (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
    const modal = await screen.findByRole("dialog", { name: "¿Cambiar el plan de esta empresa?" });
    expect(within(modal).queryByLabelText("Inicio del ciclo de órdenes")).toBeNull();
    await user.click(within(modal).getByRole("button", { name: "Cambiar plan" }));

    expect(asignar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(asignar).mock.calls[0]![0]).not.toHaveProperty("inicioCiclo");
    expect(previsualizar).not.toHaveBeenCalled();
  });
});
