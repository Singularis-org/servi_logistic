// @vitest-environment jsdom
// SLT-66 (design §2.3 bis; R34) — la fila `desasignado` que escribe la migración M4 en `plan_rastro` se
// traduce en el historial del plan con la empresa a la que se le quitó.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { PlanDetalle } from "@/app/(app)/plataforma/planes/[planId]/_components/PlanDetalle";
import type { DetallePlan } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const ORG = "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60";

const DETALLE: DetallePlan = {
  plan: {
    id: PLAN_ID,
    nombre: "Básico",
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "sin_precio" },
    costoPorOrden: null,
    archivado: false,
  },
  empresaNombre: null,
  pendiente: null,
  empresas: [],
  rastro: [
    {
      id: "r-1",
      accion: "desasignado",
      // Lo que escribe M4: `cambios.empresa` con antes y `despues: null` (no es un campo del plan).
      cambios: {
        ...({
          empresa: {
            antes: { id: ORG, nombre: "Envíos Norte", ancla: "2026-10-01T06:00:00+00:00", cortoDesde: null },
            despues: null,
          },
        } as object),
      },
      actorNombre: "Sistema (migración SLT-66)",
      creadoAt: "2026-10-31T18:00:00.000Z",
    },
  ],
};

afterEach(() => cleanup());

describe("SLT-66 R34 — la fila «desasignado» del rastro", () => {
  it("R34: dice la acción, el actor de sistema y la frase con la empresa", () => {
    render(<PlanDetalle detalle={DETALLE} editarPlan={vi.fn()} archivarPlan={vi.fn()} cancelarCambio={vi.fn()} />);

    const filas = within(screen.getByRole("region", { name: "Historial del plan" })).getAllByRole("row").slice(1);
    expect(filas).toHaveLength(1);
    const celdas = within(filas[0]).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas.slice(1)).toEqual([
      "Sistema (migración SLT-66)",
      "Desasignado",
      "Desasignado de Envíos Norte por la migración: el plan no tenía costo base concreto",
    ]);
  });
});
