// @vitest-environment jsdom
// SLT-66 (design §6.2; R24, R10) — el costo del plan en el catálogo, el detalle y el modal de asignación
// (primera asignación y cambio de plan): costo base, costo por orden («se aplica el valor global» si el
// plan no lo tiene) y, con anual fijo o descuento, que el anual no cambia el costo por orden.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { ToastProvider } from "@/providers/ToastProvider";
import { lineasDeCosto } from "@/app/(app)/plataforma/planes/_components/plan-vista";
import { PlanesModule } from "@/app/(app)/plataforma/planes/_components/PlanesModule";
import { PlanDetalle } from "@/app/(app)/plataforma/planes/[planId]/_components/PlanDetalle";
import { PlanEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa";
import { planConConsumo } from "@/lib/planes/consumo";
import type {
  DetallePlan,
  PlanDelCatalogo,
  PlanDeEmpresaVista,
  PlanDTO,
  PlanResult,
  VistaPreviaAsignacionResult,
} from "@/lib/types/planes";

const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";
const OK: PlanResult = { estado: "ok", planId: "p", cambio: true, avisos: [], vigenteDesde: null };
const VISTA_PREVIA_OK: VistaPreviaAsignacionResult = { estado: "ok", avisos: [], siguienteCiclo: "2026-11-29" };

function plan(extra: Partial<PlanDTO> & Pick<PlanDTO, "id" | "nombre">): PlanDTO {
  return {
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "50000.00", anual: null },
    costoPorOrden: "100.00",
    archivado: false,
    ...extra,
  };
}

const CONCRETO = plan({ id: "11111111-1111-4111-8111-111111111111", nombre: "Concreto" });
const SIN_COSTO = plan({ id: "22222222-2222-4222-8222-222222222222", nombre: "Sin costo", costoPorOrden: null });
const CON_ANUAL = plan({
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Con anual",
  precio: { tipo: "monto", mensual: "50000.00", anual: { tipo: "descuento", porcentaje: "10" } },
});

const catalogo = (p: PlanDTO): PlanDelCatalogo => ({
  ...p,
  empresaNombre: null,
  empresas: 0,
  vigenteDesdePendiente: null,
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-66 R24, R10 — lineasDeCosto", () => {
  it("R24: costo base y costo por orden del plan", () => {
    expect(lineasDeCosto(CONCRETO)).toEqual(["Costo base: 50000.00 al mes", "Costo por orden: 100.00 por orden"]);
  });

  it("R24: sin costo por orden, «se aplica el valor global»; vale con cualquier forma de la base", () => {
    expect(lineasDeCosto({ precio: { tipo: "negociable" }, costoPorOrden: null })).toEqual([
      "Costo base: negociable",
      "Costo por orden: se aplica el valor global",
    ]);
  });

  it("R10: con descuento o anual fijo, el anual no cambia el costo por orden", () => {
    expect(lineasDeCosto(CON_ANUAL).at(-1)).toBe("El pago anual no cambia el costo por orden.");
    expect(
      lineasDeCosto({ precio: { tipo: "monto", mensual: "1.00", anual: { tipo: "fijo", monto: "10.00" } }, costoPorOrden: "0.00" }),
    ).toContain("El pago anual no cambia el costo por orden.");
    // Sin anual, no hay nota.
    expect(lineasDeCosto(CONCRETO)).toHaveLength(2);
  });
});

describe("SLT-66 R24 — catálogo", () => {
  it("R24: la columna «Costo» pinta el costo base y el costo por orden", () => {
    render(<PlanesModule planes={[catalogo(CONCRETO), catalogo(SIN_COSTO)]} empresas={[]} crearPlan={vi.fn()} />);

    expect(screen.getByRole("columnheader", { name: "Costo" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Precio" })).toBeNull();
    const fila = (n: string) => screen.getByRole("link", { name: `Ver el plan ${n}` }).closest("tr")!;
    expect(within(fila("Concreto")).getByText("Costo base: 50000.00 al mes")).toBeInTheDocument();
    expect(within(fila("Concreto")).getByText("Costo por orden: 100.00 por orden")).toBeInTheDocument();
    expect(within(fila("Sin costo")).getByText("Costo por orden: se aplica el valor global")).toBeInTheDocument();
  });
});

describe("SLT-66 R24, R10 — detalle del plan", () => {
  const detalle = (p: PlanDTO, rastro: DetallePlan["rastro"] = []): DetallePlan => ({
    plan: p,
    empresaNombre: null,
    pendiente: null,
    empresas: [],
    rastro,
  });
  const montar = (d: DetallePlan) =>
    render(<PlanDetalle detalle={d} editarPlan={vi.fn()} archivarPlan={vi.fn()} cancelarCambio={vi.fn()} />);
  const dato = (termino: string) => screen.getByText(termino, { selector: "dt" }).nextElementSibling as HTMLElement;

  it("R24: «Costo base» y «Costo por orden» como datos de la versión vigente", () => {
    montar(detalle(CONCRETO));
    expect(screen.queryByText("Precio informativo")).toBeNull();
    expect(dato("Costo base")).toHaveTextContent("50000.00 al mes");
    expect(dato("Costo por orden")).toHaveTextContent(/^100\.00 por orden$/);
  });

  it("R24: sin costo por orden dice «se aplica el valor global»", () => {
    montar(detalle(SIN_COSTO));
    expect(dato("Costo por orden")).toHaveTextContent("se aplica el valor global");
  });

  it("R10: con anual, la nota va junto al costo por orden", () => {
    montar(detalle(CON_ANUAL));
    expect(dato("Costo por orden")).toHaveTextContent("El pago anual no cambia el costo por orden.");
  });

  it("R24: el rastro suma el costo por orden al alta y a la edición (también desde vacío)", () => {
    montar(
      detalle(CONCRETO, [
        {
          id: "r-2",
          accion: "editado",
          cambios: { costoPorOrden: { antes: null, despues: "100.00" } },
          actorNombre: "Sofía Admin",
          creadoAt: "2026-10-28T18:30:00.000Z",
        },
        {
          id: "r-1",
          accion: "creado",
          cambios: {
            precio: { antes: null, despues: { tipo: "monto", mensual: "50000.00", anual: null } },
            costoPorOrden: { antes: null, despues: null },
          },
          actorNombre: "Sofía Admin",
          creadoAt: "2026-10-01T15:00:00.000Z",
        },
      ]),
    );
    const filas = within(screen.getByRole("region", { name: "Historial del plan" })).getAllByRole("row").slice(1);
    const cambios = filas.map((f) => within(f).getAllByRole("cell")[3].textContent);
    expect(cambios).toEqual([
      "Costo por orden: se aplica el valor global → 100.00 por orden",
      "Costo base: 50000.00 al mesCosto por orden: se aplica el valor global",
    ]);
  });
});

describe("SLT-66 R24 — modal de asignación", () => {
  function montar(v: PlanDeEmpresaVista, asignables: PlanDTO[]) {
    render(
      <ToastProvider>
        <PlanEmpresa
          organizacionId={ORG}
          empresaNombre="Envíos Norte"
          vista={v}
          asignables={asignables}
          asignarPlan={vi.fn().mockResolvedValue(OK)}
          rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
          previsualizarAsignacion={vi.fn().mockResolvedValue(VISTA_PREVIA_OK)}
        />
      </ToastProvider>,
    );
  }

  async function elegir(user: ReturnType<typeof userEvent.setup>, nombre: string) {
    await user.click(screen.getByRole("combobox", { name: "Plan a asignar" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: nombre }));
  }

  it("R24: la primera asignación lista el costo base y el costo por orden antes de los módulos", async () => {
    const user = userEvent.setup();
    montar({ organizacionId: ORG, plan: null, asignaciones: [] }, [CON_ANUAL]);

    await elegir(user, "Con anual (Público)");
    await user.click(screen.getByRole("button", { name: "Asignar plan" }));
    const modal = await screen.findByRole("dialog", { name: "¿Asignar este plan a la empresa?" });
    const lineas = within(within(modal).getByRole("list", { name: "Lo que tendrá la empresa" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(lineas.slice(-4)).toEqual([
      "Costo base: 50000.00 al mes, con 10 % de descuento en el pago anual",
      "Costo por orden: 100.00 por orden",
      "El pago anual no cambia el costo por orden.",
      "Módulos incluidos: Ninguno",
    ]);
  });

  it("R24: el cambio de plan muestra el costo del plan nuevo aunque sea igual al actual", async () => {
    const user = userEvent.setup();
    const actual = plan({ id: "44444444-4444-4444-8444-444444444444", nombre: "Actual" });
    const vista: PlanDeEmpresaVista = {
      organizacionId: ORG,
      plan: {
        ...planConConsumo(
          {
            vigente: { nombre: actual.nombre, topes: actual.topes, modulos: [], precio: actual.precio, costoPorOrden: "100.00" },
            ancla: new Date("2026-10-01T06:00:00.000Z"),
            uso: { ordenes: 0, apiKeys: 0, porRol: { admin: 0, mensajero: 0, adminTienda: 0, adminSatelite: 0 } },
            cambio: null,
            costoVigente: { monto: "100.00", fuente: "plan" },
          },
          new Date("2026-10-10T06:00:00.000Z"),
        ),
        planId: actual.id,
        archivado: false,
      },
      asignaciones: [],
    };
    montar(vista, [actual, CONCRETO]);

    await elegir(user, "Concreto (Público)");
    await user.click(screen.getByRole("button", { name: "Cambiar plan" }));
    const modal = await screen.findByRole("dialog", { name: "¿Cambiar el plan de esta empresa?" });
    await waitFor(() => expect(within(modal).getByText("Costo base: 50000.00 al mes")).toBeInTheDocument());
    expect(within(modal).getByText("Costo por orden: 100.00 por orden")).toBeInTheDocument();
  });
});
