// @vitest-environment jsdom
// SLT-58 (design §6.3; R13) — el catálogo de planes del superadmin.
//
// Se lee lo que pinta la tabla con el catálogo que baja de la página: nombre, visibilidad («Público»
// o «Custom de <empresa>»), precio sin moneda, topes, cuántas empresas lo tienen y la fecha del cambio
// programado. Los archivados se esconden por defecto y, al mostrarlos, llevan la marca «Archivado».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PlanDelCatalogo, PlanResult } from "@/lib/types/planes";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { PlanesModule } from "@/app/(app)/plataforma/planes/_components/PlanesModule";

const PUBLICO: PlanDelCatalogo = {
  id: "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { ordenesPorCiclo: 3000, porRol: { mensajero: 5 }, apiKeys: 2 },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "10.00", anual: { tipo: "fijo", monto: "100.00" } },
  archivado: false,
  empresaNombre: null,
  empresas: 1200,
  vigenteDesdePendiente: "2030-01-15",
};

const CUSTOM: PlanDelCatalogo = {
  id: "1b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  nombre: "Norte a medida",
  visibilidad: "custom",
  organizacionId: "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60",
  topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "negociable" },
  archivado: false,
  empresaNombre: "Envíos Norte",
  empresas: 1,
  vigenteDesdePendiente: null,
};

const ARCHIVADO: PlanDelCatalogo = {
  ...PUBLICO,
  id: "2b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  nombre: "Viejo",
  precio: { tipo: "sin_precio" },
  archivado: true,
  empresas: 0,
  vigenteDesdePendiente: null,
};

const OK: PlanResult = { estado: "ok", planId: PUBLICO.id, cambio: true, avisos: [], vigenteDesde: null };

function montar(crearPlan = vi.fn().mockResolvedValue(OK)) {
  render(
    <PlanesModule
      planes={[PUBLICO, CUSTOM, ARCHIVADO]}
      empresas={[{ id: CUSTOM.organizacionId!, nombre: "Envíos Norte" }]}
      crearPlan={crearPlan}
    />,
  );
  return { crearPlan };
}

const filaDe = (nombre: string) => screen.getByRole("link", { name: `Ver el plan ${nombre}` }).closest("tr")!;
const celdas = (fila: HTMLElement) => within(fila).getAllByRole("cell").map((c) => c.textContent);

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-58 R13 — el catálogo de planes", () => {
  it("R13: una fila por plan con visibilidad, precio sin moneda, topes, nº de empresas y fecha del cambio", () => {
    montar();

    expect(celdas(filaDe("Básico"))).toEqual([
      "Básico",
      "Público",
      "10.00 al mes, 100.00 al año",
      "Órdenes por ciclo: 3.000Usuarios con el rol Mensajero: 5API keys activas: 2",
      "1.200",
      "Desde 2030-01-15",
    ]);
    expect(celdas(filaDe("Norte a medida"))).toEqual([
      "Norte a medida",
      "Custom de Envíos Norte",
      "negociable",
      "Órdenes por ciclo: sin límiteUsuarios: sin límite por rolAPI keys activas: sin límite",
      "1",
      "—",
    ]);
    expect(filaDe("Básico").querySelector("a")).toHaveAttribute("href", `/plataforma/planes/${PUBLICO.id}`);
  });

  it("R13: los archivados no salen por defecto; con «Mostrar archivados» salen con la marca «Archivado»", async () => {
    const user = userEvent.setup();
    montar();

    expect(screen.queryByRole("link", { name: "Ver el plan Viejo" })).toBeNull();
    expect(screen.queryByText("Archivado")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Mostrar archivados" }));

    const fila = filaDe("Viejo");
    expect(within(fila).getByText("Archivado")).toBeInTheDocument();
    expect(celdas(fila)[2]).toBe("sin precio");
    // Solo el archivado lleva la marca.
    expect(screen.getAllByText("Archivado")).toHaveLength(1);
  });

  it("R13: el precio no lleva símbolo ni código de moneda", () => {
    montar();
    const tabla = screen.getByRole("table");
    expect(tabla.textContent).not.toMatch(/[$₡€]|USD|CRC/);
  });

  it("R14: «Nuevo plan» abre el formulario; al crear, cierra, avisa y relee", async () => {
    const user = userEvent.setup();
    const { crearPlan } = montar();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByRole("textbox", { name: "Nombre" }), "Libre");
    await user.click(within(panel).getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(crearPlan).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Plan «Libre» creado.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
