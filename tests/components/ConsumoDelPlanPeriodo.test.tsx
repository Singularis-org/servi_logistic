// @vitest-environment jsdom
// SLT-86 (design §7.1, §7.2; R7, R8, R26–R28) — «MI PLAN» Y EL CONSUMO CON PERÍODOS DE CALENDARIO.
//
// El plan se arma con `planConConsumo` real, así que el período, el costo y el siguiente cobro que se leen
// son los que calcula el servidor. Se mide `ConsumoDelPlan` (lo comparten «Mi plan» y el detalle de
// empresa) y `MiPlanModule` con el cambio pendiente de la empresa, con y sin plan.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { MiPlanModule } from "@/app/(app)/mi-plan/_components/MiPlanModule";

import { planesDeMiPlan, planesSinPlan } from "./_mi-plan-planes";

// SLT-99: «Mi plan» monta el cambio de plan, que usa el router y las actions del maestro.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions/mi-plan", () => ({ cambiarMiPlanAction: vi.fn(), cancelarCambioMiPlanAction: vi.fn() }));
import { ConsumoDelPlan } from "@/components/shared/ConsumoDelPlan";
import { planConConsumo, type PlanConUsoLeido } from "@/lib/planes/consumo";
import type { PendienteDeEmpresa } from "@/lib/types/consumo-plan";
import type { PrecioPlan, TipoCobro, VersionPlan } from "@/lib/types/planes";

const PRECIO: PrecioPlan = {
  tipo: "monto",
  mensual: "31000.00",
  descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } },
};

const VIGENTE: VersionPlan = {
  nombre: "Pro",
  topes: { porRol: { mensajero: 10 }, apiKeys: 2 },
  modulos: [],
  precio: PRECIO,
  costoPorOrden: "100.00",
  costoPorOrdenPorcentual: null,
};

/** Las 00:00 de la plataforma (−06:00) de un día `AAAA-MM-DD`. */
const dia = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);
/** Mediodía de la plataforma de un día. */
const mediodia = (fecha: string) => new Date(`${fecha}T18:00:00.000Z`);

function leido(tipoCobro: TipoCobro, entrada: string, extra: Partial<PlanConUsoLeido> = {}): PlanConUsoLeido {
  return {
    vigente: VIGENTE,
    entrada: dia(entrada),
    precioDelPeriodo: PRECIO,
    pendiente: null,
    uso: { ordenes: 1234, apiKeys: 1, porRol: { admin: 0, mensajero: 9, adminTienda: 0, adminSatelite: 0 } },
    cambio: null,
    costoVigente: { modo: "fijo", monto: "100.00", fuente: "plan" },
    cobroCiclo: { cobrado: "0.00", pendientes: 0 },
    tipoCobro,
    ...extra,
  };
}

function pintar(l: PlanConUsoLeido, ahora: Date) {
  return render(<ConsumoDelPlan plan={planConConsumo(l, ahora)} textoSinPlan="Sin plan" />);
}

const cobro = () =>
  within(screen.getByRole("list", { name: "Cobro del plan" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
const costo = () => screen.getByRole("list", { name: "Costo del período" });

afterEach(() => cleanup());

describe("SLT-86 R7, R8 — las órdenes del período, sin tope", () => {
  it("R7, R8: «Órdenes en el período: {n}», sin barra, sin «cerca» ni «lleno» y con el reinicio debajo", () => {
    pintar(leido("mensual", "2026-01-15"), mediodia("2026-03-10"));

    const consumo = screen.getByRole("list", { name: "Consumo" });
    const ordenes = within(consumo).getByText("Órdenes en el período: 1.234").closest("li")!;
    expect(within(ordenes).queryByRole("meter")).toBeNull();
    expect(within(ordenes).getByText("Se reinicia en 22 días (2026-04-01)")).toBeInTheDocument();
    expect(ordenes).not.toHaveTextContent(/Cerca del tope|Lleno|de \d/);
    // Los demás topes siguen con su barra (R8: usuarios y API keys no cambian).
    expect(within(consumo).getAllByRole("meter")).toHaveLength(2);
    expect(screen.queryByText(/órdenes del ciclo/)).toBeNull();
  });
});

describe("SLT-86 R27 — el período en curso y el siguiente cobro", () => {
  it("R5, R27: quincenal con entrada el 10: el tramo del 10 al 15, su costo proporcional y el cobro el 16", () => {
    pintar(leido("quincenal", "2026-03-10"), mediodia("2026-03-12"));

    expect(cobro()).toEqual([
      "Tipo de cobro: Quincenal",
      "Período: 2026-03-10 – 2026-03-15 (tramo de 6 de 15 días)",
      "Siguiente cobro: 2026-03-16",
    ]);
    // R12: 31 000 ÷ 2 × 6 ÷ 15.
    expect(within(costo()).getByText("Costo base quincenal: 6200.00")).toBeInTheDocument();
  });

  it("R27: bimestral completo: el bimestre de calendario y el cobro al empezar el siguiente", () => {
    pintar(leido("bimestral", "2025-06-01"), mediodia("2026-04-20"));

    expect(cobro()).toEqual([
      "Tipo de cobro: Bimestral",
      "Período: 2026-03-01 – 2026-04-30",
      "Siguiente cobro: 2026-05-01",
    ]);
    expect(within(costo()).getByText("Costo base bimestral: 62000.00")).toBeInTheDocument();
  });

  it("R27: anual completo: el pago del inicio del período y el siguiente, el 1 de enero; con su descuento", () => {
    pintar(leido("anual", "2025-06-01"), mediodia("2026-03-10"));

    expect(cobro()).toEqual([
      "Tipo de cobro: Anual",
      "Período: 2026-01-01 – 2026-12-31",
      "Pago anual: 2026-01-01",
      "Siguiente pago: 2027-01-01",
    ]);
    // R10: 31 000 × 12 con el 10 %.
    expect(within(costo()).getByText("Costo base anual: 334800.00")).toBeInTheDocument();
  });

  it("R27: con un cambio pendiente, el siguiente cobro es su fecha de efecto", () => {
    const pendiente: PendienteDeEmpresa = { planNombre: "Pro", tipo: "anual", desde: "2026-03-20" };
    pintar(leido("mensual", "2026-01-15", { pendiente }), mediodia("2026-03-10"));

    expect(cobro().at(-1)).toBe("Siguiente cobro: 2026-03-20");
  });
});

describe("SLT-86 R28 — el total del período", () => {
  it("R28: modo fijo: el costo base del tramo más las órdenes del período por el costo por orden", () => {
    pintar(leido("quincenal", "2026-03-10", { uso: { ...leido("quincenal", "2026-03-10").uso, ordenes: 3 } }), mediodia("2026-03-12"));

    const b = costo();
    expect(within(b).getByText("Costo base quincenal: 6200.00")).toBeInTheDocument();
    expect(within(b).getByText("Órdenes del período: 3 × 100.00 = 300.00")).toBeInTheDocument();
    expect(within(b).getByText("Total estimado del período: 6500.00")).toBeInTheDocument();
    expect(screen.queryByText("El pago anual no cambia el costo por orden.")).toBeNull();
  });

  it("R28: modo porcentual: el costo base del tramo más lo cobrado en el período", () => {
    pintar(
      leido("quincenal", "2026-03-10", {
        vigente: { ...VIGENTE, costoPorOrden: null, costoPorOrdenPorcentual: { porcentaje: "2.00", minimo: null } },
        costoVigente: { modo: "porcentual", porcentaje: "2.00", minimo: null, fuente: "plan" },
        cobroCiclo: { cobrado: "800.00", pendientes: 2 },
      }),
      mediodia("2026-03-12"),
    );

    const b = costo();
    expect(within(b).getByText("Cobrado en el período: 800.00")).toBeInTheDocument();
    expect(within(b).getByText("Total del período hasta hoy: 6200.00 + 800.00 = 7000.00")).toBeInTheDocument();
  });

  it("R28: sin costo base, «por definir» y ningún total", () => {
    const sinPrecio: PrecioPlan = { tipo: "sin_precio" };
    pintar(
      leido("mensual", "2026-01-15", { vigente: { ...VIGENTE, precio: sinPrecio }, precioDelPeriodo: sinPrecio }),
      mediodia("2026-03-10"),
    );

    expect(within(costo()).getByText("Costo base mensual: por definir")).toBeInTheDocument();
    expect(screen.queryByText(/^Total /)).toBeNull();
  });

  it("R15, R28: el costo sale del precio de cuando empezó el período, no del vigente", () => {
    pintar(
      leido("mensual", "2026-01-15", { precioDelPeriodo: { tipo: "monto", mensual: "20000.00", descuentos: {} } }),
      mediodia("2026-03-10"),
    );
    expect(within(costo()).getByText("Costo base mensual: 20000.00")).toBeInTheDocument();
  });
});

describe("SLT-86 R26 — el cambio pendiente de la empresa en «Mi plan»", () => {
  const PENDIENTE: PendienteDeEmpresa = { planNombre: "Pro", tipo: "anual", desde: "2026-04-01" };

  // SLT-99 (R16, R17, P3) sustituye «sin botón para cancelarlo»: el maestro cancela el pendiente, sea de quien sea.
  it("R26: con plan, «Desde el {fecha}: {plan} · {Tipo}», con «Cancelar cambio» (SLT-99 R17)", () => {
    render(
      <MiPlanModule
        plan={planConConsumo(leido("mensual", "2026-01-15", { pendiente: PENDIENTE }), mediodia("2026-03-10"))}
        planes={planesDeMiPlan({ hayPendiente: true })}
      />,
    );

    expect(screen.getByText("Desde el 2026-04-01: Pro · Anual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar cambio" })).toBeInTheDocument();
  });

  it("R26: sin pendiente no hay línea «Desde el …»", () => {
    render(<MiPlanModule plan={planConConsumo(leido("mensual", "2026-01-15"), mediodia("2026-03-10"))} planes={planesDeMiPlan()} />);
    expect(screen.queryByText(/^Desde el /)).toBeNull();
  });

  it("R26: sin plan y con una primera asignación pendiente, «Sin límites» y debajo «{Plan} empieza a regir el {fecha}»", () => {
    render(<MiPlanModule plan={null} pendienteSinPlan={PENDIENTE} planes={planesSinPlan()} />);

    const titulo = screen.getByText("Sin límites");
    expect(titulo).toHaveClass("text-foreground");
    expect(screen.getByText("Pro empieza a regir el 2026-04-01")).toBeInTheDocument();
    expect(screen.queryByText("Tu empresa no tiene plan asignado: sin límites")).toBeNull();
    // La primera asignación es del superadmin: el maestro sin plan no la cancela (SLT-99 R18, P5).
    expect(screen.queryByRole("button", { name: "Cancelar cambio" })).toBeNull();
  });

  it("R26: sin plan y sin pendiente, el aviso de siempre (SLT-58 R6)", () => {
    render(<MiPlanModule plan={null} pendienteSinPlan={null} planes={planesSinPlan()} />);
    expect(screen.getByText("Tu empresa no tiene plan asignado: sin límites")).toBeInTheDocument();
    expect(screen.queryByText("Sin límites")).toBeNull();
  });
});
