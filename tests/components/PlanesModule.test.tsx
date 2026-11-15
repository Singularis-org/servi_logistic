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
  topes: { porRol: { mensajero: 5 }, apiKeys: 2 },
  modulos: ["analitica"],
  // SLT-86 (R24): el costo base con un descuento por período.
  precio: { tipo: "monto", mensual: "10.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
  costoPorOrden: null, // SLT-66 R8: campo nuevo del PlanDTO
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
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
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" }, // Ajuste planes-custom (D1): sin «negociable».
  costoPorOrden: null, // SLT-66 R8: campo nuevo del PlanDTO
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
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
      empresas={[{ id: CUSTOM.organizacionId!, nombre: "Envíos Norte", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" }]}
      inicioCicloPorDefecto="2026-10-30"
      rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
      rangoFechaDeEfecto={{ hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" }}
      crearPlan={crearPlan}
      previsualizarCustom={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
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
      // SLT-66 R9, R24: la columna «Costo» lleva el costo base y el costo por orden.
      // SLT-86 (R24): «{mensual} / mes» y el descuento de cada período que lo tiene; sin tope de órdenes.
      "Costo base: 10.00 / mes · Descuento anual: 10.00 %Costo por orden: se aplica el valor global",
      "Usuarios activos con el rol Mensajero: 5API keys activas: 2",
      "1.200",
      "Desde 2030-01-15",
    ]);
    expect(celdas(filaDe("Norte a medida"))).toEqual([
      "Norte a medida",
      "Custom de Envíos Norte",
      "Costo base: sin precioCosto por orden: se aplica el valor global", // SLT-66 R9, R24
      "Usuarios: sin límite por rolAPI keys activas: sin límite",
      "1",
      "Ninguno",
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
    expect(celdas(fila)[2]).toBe("Costo base: sin precioCosto por orden: se aplica el valor global"); // SLT-66 R9, R24
    // Solo el archivado lleva la marca.
    expect(screen.getAllByText("Archivado")).toHaveLength(1);
    // Archivar es un estado inactivo, no una alerta: badge neutro, no `warning`.
    expect(within(fila).getByText("Archivado")).toHaveClass("bg-secondary");
    expect(within(fila).getByText("Archivado")).not.toHaveClass("bg-warning-soft");
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

  it("SLT-118 R32: crear un custom para una empresa con plan avisa con la fecha real del servidor y no la elegida", async () => {
    const user = userEvent.setup();
    const { crearPlan } = montar(vi.fn().mockResolvedValue({ ...OK, vigenteDesde: "2026-12-01" } satisfies PlanResult));

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByRole("textbox", { name: "Nombre" }), "Norte a medida");
    await user.click(within(panel).getByRole("radio", { name: "Custom" }));
    await user.click(within(panel).getByRole("combobox", { name: "Empresa" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Envíos Norte" }));
    await user.click(within(panel).getByRole("radio", { name: "Con monto" }));
    await user.type(within(panel).getByLabelText("Costo base mensual"), "50000");
    await user.type(within(panel).getByLabelText("Costo por orden"), "100");
    await user.click(within(panel).getByRole("button", { name: "Crear plan" }));

    // La elegida es la propuesta por defecto de la empresa (2026-11-01); el servidor devuelve la real.
    await waitFor(() => expect(crearPlan).toHaveBeenCalledTimes(1));
    expect(crearPlan.mock.calls[0]![0]).toMatchObject({ vigenteDesde: "2026-11-01" });
    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent("Plan «Norte a medida» creado. Cambio programado desde 2026-12-01.");
    expect(aviso).not.toHaveTextContent("2026-11-01");
  });

  it("SLT-118 R32: un plan que rige ya (sin `vigenteDesde`) no menciona ningún cambio programado", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByRole("textbox", { name: "Nombre" }), "Libre");
    await user.click(within(panel).getByRole("button", { name: "Crear plan" }));

    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent("Plan «Libre» creado.");
    expect(aviso).not.toHaveTextContent(/Cambio programado/);
  });

  it("SLT-83 (texto aprobado 2026-11-04): el panel «Nuevo plan» explica cuándo se cobra el costo por orden fijo y el porcentual", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveAccessibleDescription(
      "Los topes vacíos no tienen límite. El costo base es informativo. El costo por orden fijo se cobra al crear cada orden; el porcentual, cuando la orden llega a un estado final.",
    );
  });
});

describe("SLT-58 — revisión de diseño del catálogo", () => {
  it("sin cambio programado la celda dice «Ninguno» (no una raya muda)", () => {
    montar();
    expect(within(filaDe("Norte a medida")).getByText("Ninguno")).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("por debajo de md se ocultan «Visibilidad» y «Cambio programado» (cabecera y celdas)", () => {
    montar();
    for (const nombre of ["Visibilidad", "Cambio programado"]) {
      expect(screen.getByRole("columnheader", { name: nombre })).toHaveClass("hidden", "md:table-cell");
    }
    const [, visibilidad, precio, , , cambio] = within(filaDe("Básico")).getAllByRole("cell");
    expect(visibilidad).toHaveClass("hidden", "md:table-cell");
    expect(cambio).toHaveClass("hidden", "md:table-cell");
    expect(precio).not.toHaveClass("hidden");
  });

  it("«Mostrar archivados» toma su nombre del <label> visible, sin aria-label duplicado", () => {
    montar();
    const casilla = screen.getByRole("checkbox", { name: "Mostrar archivados" });
    expect(casilla).not.toHaveAttribute("aria-label");
  });

  it("si el catálogo no se pudo leer: solo el aviso de error con «Reintentar», sin tabla ni estado vacío", async () => {
    const user = userEvent.setup();
    render(
      <PlanesModule
        errorDeCarga
        planes={[]}
        empresas={[]}
        inicioCicloPorDefecto="2026-10-30"
        rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
        rangoFechaDeEfecto={{ hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" }}
        crearPlan={vi.fn()}
        previsualizarCustom={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el catálogo de planes.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Aún no hay planes.")).toBeNull();
    expect(screen.queryByText(/Crea el primero/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuevo plan" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
