// @vitest-environment jsdom
// SLT-54 (R59, R60, R61, R70; design §12) — jsdom no mide: aquí se atan la estructura y las clases de ancho y
// alto que dan los números de la maqueta. Sin esto, cambiar una clase saldría verde hasta el E2E de medidas.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasModule, type PantallaOk } from "@/app/(app)/configuracion/tarifas/_components/TarifasModule";
import { TarifasActivarDialog } from "@/app/(app)/configuracion/tarifas/_components/TarifasActivarDialog";
import { valor, zonaOk, zonaResumen, referenciaUniforme } from "../fixtures/tarifas-pantalla";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/tarifas", () => ({
  cargarZonaTarifas: vi.fn(),
  guardarValoresTarifa: vi.fn(),
  activarTarifasNuevas: vi.fn(),
  crearGrupoDistritos: vi.fn(),
  renombrarGrupoDistritos: vi.fn(),
  cambiarDistritosDeGrupo: vi.fn(),
  borrarGrupoDistritos: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const PANTALLA: PantallaOk = {
  status: "ok",
  activacion: null,
  zonas: [zonaResumen()],
  vehiculos: [{ id: "v1", nombre: "Tipo", activo: true }],
  tiendas: [],
  preciosTienda: [valor("tienda_flete_entregado", { tiendaId: "t", zonaId: null, nivel: "tienda_general" })],
  mensajeros: [],
  valoresMensajero: [],
  puedeEscribir: true,
};

function montar(pantalla: Partial<PantallaOk> = {}) {
  render(
    <TarifasModule
      pantalla={{ ...PANTALLA, ...pantalla }}
      zonaInicialId="z1"
      zonaInicial={zonaOk({ referencia: referenciaUniforme({ tipo: "no_cobra" }) })}
      nombresDeGrupo={{}}
    />,
  );
}

function clases(el: Element | null): string[] {
  expect(el).not.toBeNull();
  return (el as Element).className.split(/\s+/);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-54 — disposición (design §12)", () => {
  it("R70: lista y panel como la maqueta: 250-280, gap 24, panel de 560", () => {
    montar();
    const lista = screen.getByTestId("tarifas-zonas");
    const panel = screen.getByTestId("tarifas-panel");
    expect(clases(lista)).toEqual(expect.arrayContaining(["flex-[1_1_250px]", "xl:max-w-[280px]"]));
    expect(clases(panel)).toEqual(expect.arrayContaining(["flex-[999_1_560px]", "min-w-0"]));
    expect(lista.parentElement).toBe(panel.parentElement);
    expect(clases(lista.parentElement)).toEqual(expect.arrayContaining(["flex", "flex-wrap", "gap-6", "items-start"]));
    expect(lista.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R59, R70: fila de zona de 58 de alto; el nombre puede partir y no desborda en móvil", () => {
    montar();
    const fila = within(screen.getByTestId("tarifas-zonas")).getByRole("button");
    expect(clases(fila)).toEqual(expect.arrayContaining(["min-h-[58px]", "w-full", "whitespace-normal"]));
  });

  it("R59, R70: tres pestañas de 44 de alto", () => {
    montar();
    const pestanas = screen.getAllByRole("tab");
    expect(pestanas.map((p) => p.textContent)).toEqual(["Cobro a la tienda", "Pago al mensajero", "Pago a la satélite"]);
    for (const p of pestanas) expect(clases(p)).toContain("min-h-11");
  });

  it("R70: 5 columnas en cobro; una menos tras activar; campos de 110 y 70 con alto 40", () => {
    montar();
    expect(screen.getAllByRole("columnheader").slice(0, 5).map((c) => c.textContent)).toEqual([
      "Concepto",
      "Modo",
      "Valor",
      "IVA",
      "Hoy rige",
    ]);
    const tabla = screen.getByTestId("tarifas-rejilla").querySelector("table");
    expect(clases(tabla)).toContain("min-w-[620px]");

    const fila = within(screen.getByTestId("tarifas-rejilla")).getByRole("row", { name: /Flete por entregado/ });
    expect(clases(within(fila).getByRole("textbox", { name: /^Valor/ }))).toEqual(expect.arrayContaining(["w-[110px]", "min-h-10", "text-right"]));
    expect(clases(within(fila).getByRole("textbox", { name: /^IVA/ }))).toEqual(expect.arrayContaining(["w-[70px]", "min-h-10", "text-right"]));
    expect(clases(within(fila).getByRole("combobox"))).toContain("min-h-10");
  });

  it("R70: 4 columnas en pago", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("tab", { name: "Pago al mensajero" }));
    const tabla = screen.getByTestId("tarifas-rejilla");
    expect(within(tabla).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Concepto", "Modo", "Valor", "Hoy rige"]);
    expect(within(tabla).getAllByRole("row")).toHaveLength(6);
  });

  it("R59: bajo el ancho de escritorio, los controles de la rejilla suben a 44", () => {
    montar();
    const fila = within(screen.getByTestId("tarifas-rejilla")).getByRole("row", { name: /Flete por entregado/ });
    expect(clases(within(fila).getByRole("textbox", { name: /^Valor/ }))).toContain("max-lg:min-h-11");
    expect(clases(within(fila).getByRole("textbox", { name: /^IVA/ }))).toContain("max-lg:min-h-11");
    expect(clases(within(fila).getByRole("combobox"))).toContain("max-lg:min-h-11");
    expect(clases(screen.getByRole("combobox", { name: "Editando" }))).toContain("max-lg:min-h-11");
  });

  it("R70: activar y guardar de 44, dentro de la banda y al pie del panel", () => {
    montar();
    const banda = screen.getByRole("region", { name: "Estado de las tarifas" });
    expect(clases(within(banda).getByRole("button", { name: "Activar tarifas nuevas" }))).toContain("min-h-11");
    const panel = screen.getByTestId("tarifas-panel");
    expect(clases(within(panel).getByRole("button", { name: "Guardar borrador" }))).toContain("min-h-11");
  });

  it("R70: tabla de tiendas de 5 columnas", () => {
    montar();
    const tiendas = screen.getByRole("region", { name: "Tiendas con precio propio" });
    expect(within(tiendas).getAllByRole("columnheader")).toHaveLength(5);
  });

  it("R70: el diálogo de 640 con padding de 24, casilla de 20 en fila de 44", () => {
    render(
      <TarifasActivarDialog
        faltantes={[{ zonaId: "z1", zonaNombre: "Norte", faltantes: [{ concepto: "mensajero_entregado" }], usaZona: [] }]}
        onCerrar={vi.fn()}
        onCompletar={vi.fn()}
        onActivada={vi.fn()}
      />,
    );
    const d = screen.getByRole("dialog");
    expect(d).toHaveStyle({ maxWidth: "640px" });
    expect(clases(d)).toContain("p-6");
    expect(clases(d)).toContain("[&_button[data-slot=button]]:min-h-11");
    const casilla = within(d).getByRole("checkbox");
    expect(clases(casilla)).toContain("size-5");
    expect(clases(casilla.closest("label"))).toContain("min-h-11");
    expect(clases(within(d).getByRole("link", { name: "Completar" }))).toContain("min-h-11");
  });

  it("R60: la banda usa los tokens de `DESIGN.md`", () => {
    montar();
    expect(clases(screen.getByRole("region", { name: "Estado de las tarifas" }))).toEqual(
      expect.arrayContaining(["bg-warning-soft", "dark:bg-warning/15", "text-warning-strong", "border-warning"]),
    );
  });

  it("El foco de lo nuevo es opaco: la pieza compartida trae `ring-ring/50`", () => {
    montar();
    const fila = within(screen.getByTestId("tarifas-rejilla")).getByRole("row", { name: /Flete por entregado/ });
    for (const el of [within(fila).getByRole("textbox", { name: /^Valor/ }), within(fila).getByRole("combobox"), screen.getAllByRole("tab")[0]]) {
      expect(clases(el)).toContain("focus-visible:ring-ring");
      expect(clases(el)).not.toContain("focus-visible:ring-ring/50");
    }
  });
});

describe("SLT-54 — lo que no puede estar escrito en el código de la pantalla", () => {
  const DIR = path.resolve(__dirname, "../../app/(app)/configuracion/tarifas/_components");
  const fuentes = readdirSync(DIR).map((f) => ({ f, t: readFileSync(path.join(DIR, f), "utf8") }));

  it("Los 10 archivos de la pantalla nueva, y ninguno de la vieja", () => {
    expect(fuentes.map((x) => x.f).sort()).toEqual(
      [
        "TarifasActivarDialog.tsx",
        "TarifasEstado.tsx",
        "TarifasGrupos.tsx",
        "TarifasModule.tsx",
        "TarifasTiendas.tsx",
        "TarifasValores.tsx",
        "TarifasVehiculo.tsx",
        "TarifasZonas.tsx",
        "tarifas-borrador.ts",
        "tarifas-textos.ts",
      ].sort(),
    );
  });

  it.each([
    ["hex sueltos", /#[0-9a-fA-F]{3,8}\b/],
    ["utilidades de color fijas", /\b(?:bg|text|border)-(?:red|green|emerald|amber|yellow|gray|slate|stone|zinc|white|black)(?:-\d+)?\b/],
    ["símbolo de moneda", /₡/],
    ["país o moneda", /Costa Rica|colones|SINPE/],
    ["vehículos del catálogo", /["'`](?:moto|carro|camion|bicicleta)["'`]/i],
    ["un IVA por defecto", /ivaPct:\s*["'`]\d/],
    ["`zona.cobro_vehiculo` (R49)", /cobroVehiculo|cobro_vehiculo/],
  ])("R47, R49, R60, R61: sin %s", (_nombre, patron) => {
    for (const { f, t } of fuentes) expect(`${f}: ${patron.exec(t)?.[0] ?? ""}`).toBe(`${f}: `);
  });
});
