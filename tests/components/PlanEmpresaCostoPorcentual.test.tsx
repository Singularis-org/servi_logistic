// @vitest-environment jsdom
// SLT-83 (design §6.2; R21) — el modal de asignación del detalle de empresa (primera asignación y cambio
// de plan) pinta el costo por orden de un plan porcentual con `textoDelCostoPorOrdenPorcentual`; el fijo y
// el vacío, como SLT-66 R24.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ToastProvider } from "@/providers/ToastProvider";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import { PlanesModule } from "@/app/(app)/plataforma/planes/_components/PlanesModule";
import { PlanDetalle } from "@/app/(app)/plataforma/planes/[planId]/_components/PlanDetalle";
import { planConConsumo } from "@/lib/planes/consumo";
import type {
  DetallePlan,
  PlanDeEmpresaVista,
  PlanDelCatalogo,
  PlanDTO,
  PlanResult,
  VistaPreviaAsignacionResult,
} from "@/lib/types/planes";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const PLAN_ACTUAL = "11111111-1111-4111-8111-111111111111";
const VISTA_PREVIA_OK: VistaPreviaAsignacionResult = { estado: "ok", avisos: [] };

function planDTO(extra: Partial<PlanDTO> & Pick<PlanDTO, "id" | "nombre">): PlanDTO {
  return {
    visibilidad: "publico",
    organizacionId: null,
    topes: { porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "50000.00", descuentos: {} },
    costoPorOrden: "100.00",
    costoPorOrdenPorcentual: null,
    archivado: false,
    ...extra,
  };
}

const ACTUAL = planDTO({ id: PLAN_ACTUAL, nombre: "Actual" });
const CON_MINIMO = planDTO({
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Porcentual",
  costoPorOrden: null,
  costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: "500.00" },
});
const SIN_MINIMO = planDTO({
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Porcentual libre",
  costoPorOrden: null,
  costoPorOrdenPorcentual: { porcentaje: "2.35", minimo: null },
});
const FIJO = planDTO({ id: "44444444-4444-4444-8444-444444444444", nombre: "Fijo", costoPorOrden: "150.00" });
const VACIO = planDTO({ id: "55555555-5555-4555-8555-555555555555", nombre: "Vacío", costoPorOrden: null });

const ASIGNABLES = [CON_MINIMO, SIN_MINIMO, FIJO, VACIO];

/** La vista de una empresa sin plan, o con el plan `ACTUAL` (fijo). */
function vista(conPlan: boolean): PlanDeEmpresaVista {
  if (!conPlan) return { organizacionId: ORG, plan: null, pendienteSinPlan: null, asignaciones: [] };
  const consumo = planConConsumo(
    {
      vigente: {
        nombre: ACTUAL.nombre,
        topes: ACTUAL.topes,
        modulos: [],
        precio: ACTUAL.precio,
        costoPorOrden: ACTUAL.costoPorOrden,
        costoPorOrdenPorcentual: null,
      },
      entrada: new Date("2026-10-01T06:00:00.000Z"),
      precioDelPeriodo: ACTUAL.precio,
      pendiente: null,
      uso: { ordenes: 3, apiKeys: 0, porRol: { admin: 0, mensajero: 0, adminTienda: 0, adminSatelite: 0 } },
      cambio: null,
      tipoCobro: "mensual",
      costoVigente: { modo: "fijo", monto: "100.00", fuente: "plan" },
      cobroCiclo: { cobrado: "0.00", pendientes: 0 },
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

function montar(conPlan: boolean) {
  render(
    <ToastProvider>
      <PlanEmpresa
        organizacionId={ORG}
        empresaNombre="Envíos Norte"
        vista={vista(conPlan)}
        asignables={ASIGNABLES}
        planActual={conPlan ? ACTUAL : undefined}
        asignarPlan={vi.fn<(i: unknown) => Promise<PlanResult>>()}
        rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
        inicioCicloPorDefecto="2026-10-30"
        rangoFechaDeEfecto={{ hoy: "2026-10-10", min: "2026-10-10", max: "2027-10-10" }}
        fechaDeEfectoPorDefecto="2026-11-01"
        previsualizarAsignacion={vi.fn().mockResolvedValue(VISTA_PREVIA_OK)}
        cambiarTipoCobro={vi.fn()}
        cancelarCambioEmpresa={vi.fn()}
      />
    </ToastProvider>,
  );
}

async function elegir(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
  await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: nombre }));
}

async function abrirPrimera(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await elegir(user, nombre);
  await user.click(screen.getByRole("button", { name: "Asignar plan" }));
  return screen.findByRole("dialog", { name: "¿Asignar este plan a la empresa?" });
}

async function abrirCambio(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await elegir(user, nombre);
  await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
  return screen.findByRole("dialog");
}

const lineasDePrimera = (modal: HTMLElement) =>
  within(within(modal).getByRole("list", { name: "Lo que tendrá la empresa" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-83 R21 — primera asignación", () => {
  it("R21: un plan porcentual con mínimo dice «{p} % del valor del paquete, mínimo {m}»", async () => {
    const user = userEvent.setup();
    montar(false);
    const modal = await abrirPrimera(user, "Porcentual (Público)");
    expect(lineasDePrimera(modal)).toContain("Costo por orden: 2.00 % del valor del paquete, mínimo 500.00");
    expect(modal).not.toHaveTextContent("se aplica el valor global");
  });

  it("R21: un plan porcentual sin mínimo dice «{p} % del valor del paquete»", async () => {
    const user = userEvent.setup();
    montar(false);
    const modal = await abrirPrimera(user, "Porcentual libre (Público)");
    expect(lineasDePrimera(modal)).toContain("Costo por orden: 2.35 % del valor del paquete");
    expect(modal).not.toHaveTextContent("mínimo");
  });

  it("R21: el fijo y el vacío se pintan como en SLT-66 R24", async () => {
    const user = userEvent.setup();
    montar(false);
    const modal = await abrirPrimera(user, "Fijo (Público)");
    expect(lineasDePrimera(modal)).toContain("Costo por orden: 150.00 por orden");
    cleanup();

    montar(false);
    const modalVacio = await abrirPrimera(user, "Vacío (Público)");
    expect(lineasDePrimera(modalVacio)).toContain("Costo por orden: se aplica el valor global");
  });
});

describe("SLT-83 R21 — cambio de plan", () => {
  it("R21: el costo del plan nuevo porcentual se ve con su texto, con y sin mínimo", async () => {
    const user = userEvent.setup();
    montar(true);
    const modal = await abrirCambio(user, "Porcentual (Público)");
    const lineas = within(modal)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(lineas).toContain("Costo por orden: 2.00 % del valor del paquete, mínimo 500.00");
    cleanup();

    montar(true);
    const modalSin = await abrirCambio(user, "Porcentual libre (Público)");
    expect(
      within(modalSin)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toContain("Costo por orden: 2.35 % del valor del paquete");
  });

  it("R21: a un plan fijo sigue como SLT-66 R24", async () => {
    const user = userEvent.setup();
    montar(true);
    const modal = await abrirCambio(user, "Fijo (Público)");
    expect(
      within(modal)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toContain("Costo por orden: 150.00 por orden");
    expect(modal).not.toHaveTextContent("% del valor del paquete");
  });
});

// El catálogo y el detalle del plan leen el mismo `plan-vista.ts` (design §6.2).
describe("SLT-83 R21 — catálogo y detalle del plan", () => {
  const catalogo = (p: PlanDTO): PlanDelCatalogo => ({ ...p, empresaNombre: null, empresas: 0, vigenteDesdePendiente: null });
  const detalle = (p: PlanDTO, rastro: DetallePlan["rastro"] = []): DetallePlan => ({
    plan: p,
    empresaNombre: null,
    pendiente: null,
    empresas: [],
    rastro,
  });
  const montarDetalle = (d: DetallePlan) =>
    render(<PlanDetalle detalle={d} editarPlan={vi.fn()} archivarPlan={vi.fn()} cancelarCambio={vi.fn()} />);
  const dato = (termino: string) => screen.getByText(termino, { selector: "dt" }).nextElementSibling as HTMLElement;

  it("R21: la columna «Costo» del catálogo pinta el porcentual, con y sin mínimo, y el fijo como SLT-66", () => {
    render(
      <PlanesModule
        planes={[catalogo(CON_MINIMO), catalogo(SIN_MINIMO), catalogo(FIJO)]}
        empresas={[]}
        inicioCicloPorDefecto="2026-10-30"
        rangoFechaDeEfecto={{ hoy: "2026-10-10", min: "2026-10-10", max: "2027-10-10" }}
        rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
        crearPlan={vi.fn()}
        previsualizarCustom={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
      />,
    );
    const fila = (n: string) => screen.getByRole("link", { name: `Ver el plan ${n}` }).closest("tr")!;
    expect(
      within(fila("Porcentual")).getByText("Costo por orden: 2.00 % del valor del paquete, mínimo 500.00"),
    ).toBeInTheDocument();
    expect(within(fila("Porcentual libre")).getByText("Costo por orden: 2.35 % del valor del paquete")).toBeInTheDocument();
    expect(within(fila("Fijo")).getByText("Costo por orden: 150.00 por orden")).toBeInTheDocument();
  });

  it("R21: el dato «Costo por orden» del detalle pinta el porcentual", () => {
    montarDetalle(detalle(CON_MINIMO));
    expect(dato("Costo por orden")).toHaveTextContent(/^2\.00 % del valor del paquete, mínimo 500\.00$/);
    cleanup();
    montarDetalle(detalle(SIN_MINIMO));
    expect(dato("Costo por orden")).toHaveTextContent(/^2\.35 % del valor del paquete$/);
  });

  it("R21, R4: el historial del detalle pinta el alta porcentual y el paso de fijo a porcentual", () => {
    montarDetalle(
      detalle(CON_MINIMO, [
        {
          id: "r-2",
          accion: "editado",
          cambios: {
            costoPorOrden: { antes: "100.00", despues: null },
            costoPorOrdenPorcentual: { antes: null, despues: { porcentaje: "2.00", minimo: "500.00" } },
          },
          actorNombre: "Sofía Admin",
          creadoAt: "2026-10-28T18:30:00.000Z",
        },
        {
          id: "r-1",
          accion: "creado",
          cambios: {
            costoPorOrden: { antes: null, despues: null },
            costoPorOrdenPorcentual: { antes: null, despues: { porcentaje: "3.00", minimo: null } },
          },
          actorNombre: "Sofía Admin",
          creadoAt: "2026-10-01T15:00:00.000Z",
        },
      ]),
    );
    const filas = within(screen.getByRole("region", { name: "Historial del plan" })).getAllByRole("row").slice(1);
    const cambios = filas.map((f) => within(f).getAllByRole("cell")[3].textContent);
    expect(cambios).toEqual([
      "Costo por orden: 100.00 por orden → cobra porcentual" +
        "Costo por orden porcentual: sin costo porcentual → 2.00 % del valor del paquete, mínimo 500.00",
      "Costo por orden: 3.00 % del valor del paquete",
    ]);
  });
});
