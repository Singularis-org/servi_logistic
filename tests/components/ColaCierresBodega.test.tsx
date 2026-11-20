// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ColaCierres,
  type ColaCierresBodegaProps,
} from "@/components/private/cierres/cola/ColaCierres";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";

// SLT-127 «Cola de bodega de la central con la cola única» (T2.2) — `ColaCierres` con `tipo` bodega,
// montada con dobles. Los esperados van ESCRITOS A MANO (canvas, rama bodega · central):
// - importes: lo que `money()` da hoy, ejecutado una vez el 2026-11-11 y copiado (T0.2):
//   "349100.00" → «₡349.100», "334100.00" → «₡334.100», "15000.00" → «₡15.000», "0.00" → «₡0»,
//   "-500.00" → «-₡500», "15500.00" → «₡15.500»;
// - fechas: `fechaHora` en hora de Costa Rica ("2026-11-08T01:55Z" → «2026-11-07 19:55»).
// Ninguno se compara contra la función que lo genera.

afterEach(cleanup);

function cierre(over: Partial<CierreBodegaResumen> & { cierreBodegaId: string }): CierreBodegaResumen {
  return {
    zonaId: `z-${over.cierreBodegaId}`,
    zonaNombre: "Limón",
    solicitadoPorId: "u1",
    solicitadoPorNombre: "Pedro Satélite",
    estado: "solicitado",
    // R134: valores que no pueden salir por casualidad; la fila no debe pintar ninguno.
    totales: { efectivo: "987654.32", simpe: "0.00", transferencia: "0.00", general: "987654.32" },
    totalPagoMensajero: "45678.91",
    totalIngresoBodegaRechazos: "0.00",
    cantidadCierres: 3,
    solicitadoAt: "2026-11-08T01:55:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    paraLaCentral: "349100.00",
    efectivoCubreDescuentos: true,
    conciliado: false,
    desmarcable: false,
    montoRecibido: null,
    faltaPorRecibir: "349100.00",
    conciliadoAt: null,
    conciliadoPorNombre: null,
    conciliadoNota: null,
    incluyeModeloNuevo: true,
    ...over,
  };
}

const marcada = {
  estado: "aprobado" as const,
  conciliado: true,
  conciliadoAt: "2026-11-08T03:00:00.000Z",
  conciliadoPorNombre: "Marcadora-ZQ7",
  conciliadoNota: "NOTA-SLT127-ZQ",
};

const POR_CONCILIAR: CierreBodegaResumen[] = [
  cierre({ cierreBodegaId: "11111111-0000-4000-8000-00000ab1c2d3", zonaNombre: "Limón" }),
  cierre({
    cierreBodegaId: "22222222-0000-4000-8000-00000ef4a5b6",
    zonaNombre: "Cartago",
    ...marcada,
    montoRecibido: "334100.00",
    faltaPorRecibir: "15000.00",
  }),
];

const CONCILIADOS: CierreBodegaResumen[] = [
  cierre({
    cierreBodegaId: "33333333-0000-4000-8000-000007c8d9e0",
    zonaNombre: "Heredia",
    ...marcada,
    montoRecibido: "349100.00",
    faltaPorRecibir: "0.00",
  }),
  // Llegó de más: un negativo no es faltante.
  cierre({
    cierreBodegaId: "44444444-0000-4000-8000-000001f2e3d4",
    zonaNombre: "Alajuela",
    ...marcada,
    paraLaCentral: "15000.00",
    montoRecibido: "15500.00",
    faltaPorRecibir: "-500.00",
  }),
];

const REGION_PC = "Cierres de bodega por conciliar";
const REGION_C = "Cierres de bodega conciliados";

function props(over: Partial<ColaCierresBodegaProps> = {}): ColaCierresBodegaProps {
  const pestana = over.pestanaActiva ?? "pendientes";
  return {
    tipo: "bodega",
    rol: "central",
    descripcion: "Los cierres que mandan las bodegas satélite. Márcalos recibidos cuando llegue el dinero.",
    pestanas: [
      { id: "pendientes", label: "Por conciliar", conteo: 3 },
      { id: "resueltos", label: "Conciliados", conteo: 21 },
    ],
    pestanaActiva: pestana,
    onPestana: vi.fn(),
    barra: <input aria-label="Buscar" />,
    descargar: <button type="button">Descargar</button>,
    filas: pestana === "pendientes" ? POR_CONCILIAR : CONCILIADOS,
    cargando: false,
    error: null,
    vacio: "No hay cierres de bodega por conciliar.",
    region: pestana === "pendientes" ? REGION_PC : REGION_C,
    acciones: { abrir: vi.fn() },
    paginacion: <nav aria-label="Paginación doble" />,
    ...over,
  };
}

function filaDe(region: HTMLElement, bodega: string): HTMLElement {
  const fila = within(region)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(bodega) !== null);
  if (!fila) throw new Error(`sin fila de ${bodega}`);
  return fila;
}

const celdas = (region: HTMLElement, bodega: string) =>
  within(filaDe(region, bodega))
    .getAllByRole("cell")
    .map((c) => c.textContent ?? "");

/** La celda «Falta» (8.ª columna) de la fila. */
const celdaFalta = (region: HTMLElement, bodega: string) =>
  within(filaDe(region, bodega)).getAllByRole("cell")[7]!.firstElementChild as HTMLElement;

describe("ColaCierres · bodega central — pestañas y cabecera (R32, R127)", () => {
  it("tablist «Cierres de bodega por estado» con «Por conciliar (3)» activa y «Conciliados (21)»", () => {
    render(<ColaCierres {...props()} />);
    const lista = screen.getByRole("tablist", { name: "Cierres de bodega por estado" });
    expect(within(lista).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Por conciliar (3)",
      "Conciliados (21)",
    ]);
    expect(within(lista).getByRole("tab", { name: "Por conciliar (3)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tablist", { name: "Cierres del día por estado" })).toBeNull();
  });

  it("sin tarjetas de cifras: solo descripción, pestañas, barra, tabla y pie (R32)", () => {
    const { container } = render(<ColaCierres {...props()} />);
    expect(screen.getAllByRole("table")).toHaveLength(1);
    // Las tarjetas de cifras de la satélite son `article`/`figure`; aquí no hay ninguna.
    expect(container.querySelectorAll("article, figure, dl")).toHaveLength(0);
  });

  it("cambiar de pestaña avisa con el id interno", async () => {
    const onPestana = vi.fn();
    render(<ColaCierres {...props({ onPestana })} />);
    await userEvent.setup().click(screen.getByRole("tab", { name: "Conciliados (21)" }));
    expect(onPestana).toHaveBeenCalledWith("resueltos");
  });
});

describe("ColaCierres · bodega central — fila (R44, R129)", () => {
  it("las 9 cabeceras + acciones, en el orden del canvas", () => {
    render(<ColaCierres {...props()} />);
    const tabla = screen.getByRole("table", { name: REGION_PC });
    expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Folio",
      "Bodega",
      "Solicitó",
      "Solicitado",
      "Cierres",
      "Debe llegar",
      "Recibido",
      "Falta",
      "Estado",
      "Acciones",
    ]);
  });

  it("Por conciliar: celdas del pendiente y del incompleto", () => {
    render(<ColaCierres {...props()} />);
    const region = screen.getByRole("region", { name: REGION_PC });
    expect(celdas(region, "Limón")).toEqual([
      "#0AB1C2D3",
      "Limón",
      "Pedro Satélite",
      "2026-11-07 19:55",
      "3",
      "₡349.100",
      "—",
      "₡349.100",
      "Pendiente de conciliar",
      "Ver / conciliar",
    ]);
    expect(celdas(region, "Cartago")).toEqual([
      "#0EF4A5B6",
      "Cartago",
      "Pedro Satélite",
      "2026-11-07 19:55",
      "3",
      "₡349.100",
      "₡334.100",
      "₡15.000",
      "Recibido incompleto",
      "Ver / corregir",
    ]);
    expect(screen.getByText("#0AB1C2D3")).toHaveClass("font-mono");
    expect(screen.getAllByText("₡349.100")[0]).toHaveClass("font-semibold");
  });

  it("Conciliados: recibido entero y llegado de más", () => {
    render(<ColaCierres {...props({ pestanaActiva: "resueltos" })} />);
    const region = screen.getByRole("region", { name: REGION_C });
    expect(celdas(region, "Heredia").slice(5)).toEqual([
      "₡349.100",
      "₡349.100",
      "₡0",
      "Recibido",
      "Ver",
    ]);
    expect(celdas(region, "Alajuela").slice(5)).toEqual([
      "₡15.000",
      "₡15.500",
      "-₡500",
      "Recibido",
      "Ver",
    ]);
  });

  it("Recibido sin marca pinta «—» y NUNCA ₡0", () => {
    render(<ColaCierres {...props()} />);
    const fila = filaDe(screen.getByRole("region", { name: REGION_PC }), "Limón");
    expect(within(fila).getAllByRole("cell")[6]).toHaveTextContent(/^—$/);
    expect(fila.textContent).not.toContain("₡0");
  });

  it("la Falta va resaltada si y solo si queda algo por llegar", () => {
    const { unmount } = render(<ColaCierres {...props()} />);
    const pc = screen.getByRole("region", { name: REGION_PC });
    expect(celdaFalta(pc, "Cartago")).toHaveClass("text-warning-strong");
    expect(celdaFalta(pc, "Limón")).toHaveClass("text-warning-strong");
    unmount();

    render(<ColaCierres {...props({ pestanaActiva: "resueltos" })} />);
    const c = screen.getByRole("region", { name: REGION_C });
    expect(celdaFalta(c, "Heredia")).not.toHaveClass("text-warning-strong");
    expect(celdaFalta(c, "Alajuela")).not.toHaveClass("text-warning-strong");
  });

  it.each([
    ["Limón", "pendientes", "Pendiente de conciliar", "bg-warning-soft"],
    ["Cartago", "pendientes", "Recibido incompleto", "bg-warning-soft"],
    ["Heredia", "resueltos", "Recibido", "bg-success-soft"],
  ] as const)("pastilla de %s: «%s» con su token (PA6)", (bodega, pestana, texto, token) => {
    render(<ColaCierres {...props({ pestanaActiva: pestana })} />);
    const fila = filaDe(screen.getByRole("region", { name: pestana === "pendientes" ? REGION_PC : REGION_C }), bodega);
    const pastilla = within(fila)
      .getAllByText(texto)
      .find((el) => el.getAttribute("data-slot") === "badge");
    expect(pastilla).toBeDefined();
    expect(pastilla).toHaveClass(token);
  });

  it.each(["pendientes", "resueltos"] as const)(
    "%s: las pastillas no pintan el estado del enum (Aprobado, Solicitado, Rechazado)",
    (pestana) => {
      const { container } = render(<ColaCierres {...props({ pestanaActiva: pestana })} />);
      const pastillas = [...container.querySelectorAll('[data-slot="badge"]')].map(
        (b) => b.textContent,
      );
      expect(pastillas).toHaveLength(2);
      expect(pastillas).not.toContain("Aprobado");
      expect(pastillas).not.toContain("Solicitado");
      expect(pastillas).not.toContain("Rechazado");
      expect(screen.queryByText("Aprobado")).toBeNull();
    },
  );
});

describe("ColaCierres · bodega central — acciones (R130)", () => {
  it.each([
    ["pendientes", "Limón", "Ver / conciliar el cierre de bodega de Limón", "Ver / conciliar", "11111111-0000-4000-8000-00000ab1c2d3", true],
    ["pendientes", "Cartago", "Ver / corregir el cierre de bodega de Cartago", "Ver / corregir", "22222222-0000-4000-8000-00000ef4a5b6", true],
    ["resueltos", "Heredia", "Ver el cierre de bodega de Heredia", "Ver", "33333333-0000-4000-8000-000007c8d9e0", false],
  ] as const)("%s · %s: «%s»", async (pestana, _bodega, nombre, texto, id, principal) => {
    const abrir = vi.fn();
    render(<ColaCierres {...props({ pestanaActiva: pestana, acciones: { abrir } })} />);
    const boton = screen.getByRole("button", { name: nombre });
    expect(boton).toHaveTextContent(texto);
    // Principal = variante `default` (bg-primary); «Ver» = secundaria (`outline`).
    if (principal) expect(boton).toHaveClass("bg-primary");
    else expect(boton).not.toHaveClass("bg-primary");
    await userEvent.setup().click(boton);
    expect(abrir).toHaveBeenCalledWith(id);
  });

  it("una sola acción por fila", () => {
    render(<ColaCierres {...props()} />);
    const fila = filaDe(screen.getByRole("region", { name: REGION_PC }), "Cartago");
    expect(within(fila).getAllByRole("button")).toHaveLength(1);
  });
});

describe("ColaCierres · bodega central — lo que la fila no enseña (R134)", () => {
  it.each(["pendientes", "resueltos"] as const)("%s: ni recaudado, ni pago a mensajeros, ni marca, ni nota", (pestana) => {
    render(<ColaCierres {...props({ pestanaActiva: pestana })} />);
    const texto = document.body.textContent ?? "";
    expect(texto).not.toContain("987.654");
    expect(texto).not.toContain("45.678");
    expect(texto).not.toContain("NOTA-SLT127-ZQ");
    expect(texto).not.toContain("Marcadora-ZQ7");
    expect(texto).not.toMatch(/modelo nuevo/i);
    expect(screen.queryByRole("button", { name: /Ver detalles/ })).toBeNull();
  });
});

describe("ColaCierres · bodega central — estados de la tabla y pie (R131, R132)", () => {
  it("región y tabla con el nombre que llega; pie y paginación en el footer", () => {
    render(<ColaCierres {...props({ pie: "PIE-SLT127" })} />);
    expect(screen.getByRole("region", { name: REGION_PC })).toBeInTheDocument();
    expect(screen.getByText("PIE-SLT127")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginación doble" })).toBeInTheDocument();
  });

  it("cargando: estado de carga y sin filas", () => {
    render(<ColaCierres {...props({ cargando: true, filas: [] })} />);
    const region = screen.getByRole("region", { name: REGION_PC });
    expect(within(region).getByRole("status")).toHaveTextContent("Cargando");
  });

  it("error y vacío: el texto que llega", () => {
    const { unmount } = render(
      <ColaCierres {...props({ filas: [], error: "No se pudieron cargar los cierres de bodega por conciliar." })} />,
    );
    expect(screen.getByText("No se pudieron cargar los cierres de bodega por conciliar.")).toBeInTheDocument();
    unmount();
    render(<ColaCierres {...props({ filas: [] })} />);
    expect(screen.getByText("No hay cierres de bodega por conciliar.")).toBeInTheDocument();
  });
});
