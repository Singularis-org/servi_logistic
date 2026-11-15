// @vitest-environment jsdom
// SLT-119 (design §6.1; R2, R6, R7, R9, R10, R16, R17) — EL DETALLE DE UNA FACTURA EN EL PANEL LATERAL.
//
// El panel pide el detalle al abrirse y al paginar con la función que le pasa la pantalla (la action del maestro o
// la del superadmin ligada a su empresa). Aquí esa función es un doble: se mide qué pide y cómo pinta la respuesta.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DetalleDeFactura } from "@/components/shared/facturas/DetalleDeFactura";
import { FacturasDeLaEmpresa } from "@/components/shared/facturas/FacturasDeLaEmpresa";
import type { DetalleFacturaResult, FacturaPlataformaDTO, LineaDeFactura } from "@/lib/types/factura-plataforma";

import { cuota, detalle, enPlataforma, factura, linea } from "./_facturas-plataforma";

afterEach(() => cleanup());

type Cargar = (i: { facturaId: string; pagina: number }) => Promise<DetalleFacturaResult>;

function respondeCon(f: FacturaPlataformaDTO, lineas: LineaDeFactura[] = [], extra: { total?: number } = {}) {
  return vi.fn<Cargar>(async ({ pagina }) => ({ estado: "ok", detalle: detalle(f, lineas, { pagina, ...extra }) }));
}

async function abrir(f: FacturaPlataformaDTO, cargar: Cargar) {
  render(<DetalleDeFactura factura={f} onCerrar={vi.fn()} cargarDetalle={cargar} />);
  const panel = await screen.findByRole("dialog");
  await within(panel).findByRole("region", { name: "Resumen de órdenes" });
  return panel;
}

/** Los pares «dt → dd» de una lista de definiciones. */
function datos(dl: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(
    [...dl.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent ?? null]),
  );
}

function filasDe(tabla: HTMLElement) {
  const [, ...cuerpo] = within(tabla).getAllByRole("row");
  return cuerpo.map((fila) => within(fila).getAllByRole("cell").map((c) => c.textContent));
}

const CERRADA_DOS_CUOTAS = factura({
  numero: 7,
  periodicidad: "quincenal",
  plan: { planId: "p-1", planNombre: "Básico", tipoCobro: "quincenal" },
  cargos: "600.00",
  reversos: "300.00",
  movimientos: 3,
  totalOrdenes: "300.00",
  cuota: cuota({ planNombre: "Pro", tipoCobro: "mensual", desde: enPlataforma("2026-12-01"), hasta: enPlataforma("2027-01-01"), cuota: "1000.00" }),
  primeraCuota: cuota({
    planNombre: "Pro",
    tipoCobro: "mensual",
    desde: enPlataforma("2026-11-15"),
    hasta: enPlataforma("2026-12-01"),
    cuota: "533.33",
    diasCobrados: 16,
    diasPeriodo: 30,
  }),
  total: "1833.33",
});

describe("SLT-119 R6 — la cabecera, las cuotas y el resumen", () => {
  it("R6: una cerrada con las dos cuotas, una de ellas prorrateada («X de Y días»)", async () => {
    const panel = await abrir(CERRADA_DOS_CUOTAS, respondeCon(CERRADA_DOS_CUOTAS));

    expect(within(panel).getByRole("heading", { name: "Factura N.º 7" })).toBeInTheDocument();
    expect(datos(panel.querySelector("dl") as HTMLElement)).toEqual({
      Número: "N.º 7",
      Período: "16 nov 2026 – 30 nov 2026",
      Estado: "Emitida",
      "Plan de las órdenes": "Básico",
      "Periodicidad de las órdenes": "Quincenal",
    });

    const cuotas = within(panel).getByRole("region", { name: "Cuotas" });
    expect(filasDe(within(cuotas).getByRole("table"))).toEqual([
      ["Cuota del período", "Pro", "Mensual", "1 dic 2026 – 31 dic 2026", "₡1.000"],
      ["Primera cuota", "Pro", "Mensual", "15 nov 2026 – 30 nov 202616 de 30 días", "₡533,33"],
    ]);
    expect(within(cuotas).getByText("16 de 30 días")).toBeInTheDocument();
    expect(within(cuotas).queryByText(/prevista/)).toBeNull();

    const resumen = within(panel).getByRole("region", { name: "Resumen de órdenes" });
    expect(datos(resumen.querySelector("dl") as HTMLElement)).toEqual({
      Cargos: "₡600",
      Reversos: "₡300",
      Movimientos: "3",
      "Total de órdenes": "₡300",
      Total: "₡1.833,33",
    });
  });

  it("R6: una sin cuota lo dice y no pinta la tabla de cuotas", async () => {
    const f = factura({ plan: null, periodicidad: "mensual" });
    const panel = await abrir(f, respondeCon(f));

    const cabecera = datos(panel.querySelector("dl") as HTMLElement);
    expect(cabecera["Plan de las órdenes"]).toBe("Sin plan");
    expect(cabecera["Periodicidad de las órdenes"]).toBe("Mensual");
    const cuotas = within(panel).getByRole("region", { name: "Cuotas" });
    expect(within(cuotas).getByText("Esta factura no lleva cuota.")).toBeInTheDocument();
    expect(within(cuotas).queryByRole("table")).toBeNull();
  });

  it.each(["en_curso", "por_cerrar"] as const)(
    "R2, R6: una %s se muestra «En curso», sin número y con la cuota prevista marcada",
    async (estado) => {
      const f = factura({
        estado,
        numero: null,
        hastaPrevisto: true,
        cerradaAt: null,
        cuota: cuota({ cuota: "500.25" }),
        total: "800.25",
      });
      const panel = await abrir(f, respondeCon(f));

      expect(within(panel).getByRole("heading", { name: "Factura 16 nov 2026 – 30 nov 2026" })).toBeInTheDocument();
      const cabecera = datos(panel.querySelector("dl") as HTMLElement);
      expect(cabecera).not.toHaveProperty("Número");
      expect(cabecera.Estado).toBe("En curso");
      const cuotas = within(panel).getByRole("region", { name: "Cuotas" });
      expect(filasDe(within(cuotas).getByRole("table"))[0][0]).toBe("Cuota del período(prevista)");
      expect(within(panel).queryByText(/N\.º/)).toBeNull();
    },
  );
});

describe("SLT-119 R7, R9 — las líneas: fecha y hora, guía, tipo y valor con signo", () => {
  it("R7, R9: cargo y reverso en el orden de la base, el reverso en negativo y «—» sin guía", async () => {
    const lineas = [
      linea({ id: "l-1", instante: enPlataforma("2026-11-17", "09:30"), numGuia: 1001, tipo: "cargo", valor: "300.00" }),
      linea({ id: "l-2", instante: enPlataforma("2026-11-17", "09:30"), numGuia: null, tipo: "cargo", valor: "300.00" }),
      linea({ id: "l-3", instante: enPlataforma("2026-11-20", "18:05"), numGuia: 1001, tipo: "reverso", valor: "-300.00" }),
    ];
    const panel = await abrir(CERRADA_DOS_CUOTAS, respondeCon(CERRADA_DOS_CUOTAS, lineas));

    const seccion = within(panel).getByRole("region", { name: "Cargos y reversos" });
    const tabla = within(seccion).getByRole("table");
    expect(within(tabla).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Fecha y hora",
      "Guía",
      "Tipo",
      "Valor",
    ]);
    expect(filasDe(tabla)).toEqual([
      ["17 nov 2026 09:30", "1001", "Cargo", "₡300"],
      ["17 nov 2026 09:30", "—", "Cargo", "₡300"],
      ["20 nov 2026 18:05", "1001", "Reverso", "-₡300"],
    ]);
  });
});

describe("SLT-119 R10 — páginas de 100 con anterior, siguiente y el total de líneas", () => {
  const cienLineas = Array.from({ length: 100 }, (_, i) => linea({ id: `l-${i}`, numGuia: 2000 + i }));

  it("R10: 230 líneas: «230 líneas», página 1 de 3; «Siguiente» pide la 2 y el resumen es el de la factura entera", async () => {
    const cargar = respondeCon(CERRADA_DOS_CUOTAS, cienLineas, { total: 230 });
    const user = userEvent.setup();
    const panel = await abrir(CERRADA_DOS_CUOTAS, cargar);

    expect(cargar).toHaveBeenCalledWith({ facturaId: CERRADA_DOS_CUOTAS.id, pagina: 1 });
    const paginas = within(panel).getByRole("navigation", { name: "Páginas de líneas" });
    expect(paginas).toHaveTextContent("230 líneas · Página 1 de 3");
    expect(within(paginas).getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(within(paginas).getByRole("button", { name: "Siguiente" })).toBeEnabled();

    await user.click(within(paginas).getByRole("button", { name: "Siguiente" }));

    expect(cargar).toHaveBeenLastCalledWith({ facturaId: CERRADA_DOS_CUOTAS.id, pagina: 2 });
    const pagina2 = await within(panel).findByText("230 líneas · Página 2 de 3");
    expect(pagina2).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Anterior" })).toBeEnabled();
    // El resumen no se recalcula con las líneas de la página: son los totales de la factura (R5, R10).
    const resumen = within(panel).getByRole("region", { name: "Resumen de órdenes" });
    expect(resumen).toHaveTextContent("Movimientos3");
  });

  it("R10: en la última página «Siguiente» está deshabilitado", async () => {
    const cargar = vi.fn<Cargar>(async () => ({
      estado: "ok",
      detalle: detalle(CERRADA_DOS_CUOTAS, cienLineas.slice(0, 30), { pagina: 3, total: 230 }),
    }));
    const panel = await abrir(CERRADA_DOS_CUOTAS, cargar);

    const paginas = within(panel).getByRole("navigation", { name: "Páginas de líneas" });
    expect(paginas).toHaveTextContent("230 líneas · Página 3 de 3");
    expect(within(paginas).getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(cargar).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-119 R16 — solo lectura", () => {
  it("R16: los únicos botones del panel son cerrar y paginar", async () => {
    const panel = await abrir(CERRADA_DOS_CUOTAS, respondeCon(CERRADA_DOS_CUOTAS, [linea()]));

    expect(within(panel).getAllByRole("button").map((b) => b.textContent)).toEqual(["Anterior", "Siguiente", "Cerrar"]);
    expect(within(panel).queryByRole("link")).toBeNull();
  });
});

describe("SLT-119 R17 — si la lectura del detalle falla", () => {
  it.each<[string, () => Cargar]>([
    ["lanza", () => vi.fn<Cargar>().mockRejectedValue(new Error("db caída"))],
    ["responde not_found", () => vi.fn<Cargar>().mockResolvedValue({ estado: "not_found" })],
    ["responde forbidden", () => vi.fn<Cargar>().mockResolvedValue({ estado: "forbidden" })],
  ])("R17: si %s, el detalle dice «No se pudo cargar la factura» y la lista sigue visible", async (_caso, crear) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const f = factura();
    render(<FacturasDeLaEmpresa facturas={[f]} cargarDetalle={crear()} />);

    await user.click(screen.getByRole("button", { name: /Ver detalle de la factura/ }));

    const panel = await screen.findByRole("dialog");
    expect(await within(panel).findByRole("alert")).toHaveTextContent("No se pudo cargar la factura");
    // La lista sigue montada detrás del panel.
    expect(screen.getByText("N.º 1", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("Facturas de la empresa")).toBeInTheDocument();
  });
});
