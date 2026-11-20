// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

// SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» (R946, R948, DC4, D1): en una
// barra con `escaneo`, los controles de filtro de `FilterComponent` miden 44 px SOLO en móvil
// (`max-md:h-11`) y conservan el `h-8` de escritorio. Lo pide la barra por contexto: ninguna pantalla
// pasa una prop. Fuera de una barra con `escaneo` (barra sin él o `FilterComponent` suelto) no cambian.

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ordenes",
  useSearchParams: () => new URLSearchParams(""),
}));

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import { FilterComponent, type FilterDef } from "@/components/shared/FilterComponent";

afterEach(cleanup);

/** Un filtro de cada tipo que monta `FilterComponent`. Literales a mano. */
const FILTROS: FilterDef[] = [
  { key: "texto", label: "Remitente", kind: "text" },
  {
    key: "zona",
    label: "Zona",
    kind: "multi",
    options: [
      { value: "z1", label: "Zona Norte" },
      { value: "z2", label: "Zona Sur" },
    ],
  },
  {
    key: "estado",
    label: "Estado",
    kind: "single",
    options: [
      { value: "e1", label: "Pendiente" },
      { value: "e2", label: "Entregado" },
    ],
  },
  {
    key: "resultado",
    label: "Resultado",
    kind: "single",
    presentacion: "pastillas",
    options: [
      { value: "todas", label: "Todas" },
      { value: "entregado", label: "Entregadas" },
    ],
  },
  { key: "conCobro", label: "Con cobro", kind: "boolean" },
  { key: "fecha", label: "Periodo", kind: "dateRange" },
];

function filtros() {
  return <FilterComponent filters={FILTROS} onChange={vi.fn()} leerDeUrl={false} debounceMs={0} />;
}

type Montaje = "barra con escaneo" | "barra sin escaneo" | "suelto";

function montar(montaje: Montaje) {
  if (montaje === "suelto") {
    render(filtros());
    return;
  }
  render(
    <BuscadorFiltros onChange={vi.fn()} leerDeUrl={false} escaneo={montaje === "barra con escaneo"}>
      {filtros()}
    </BuscadorFiltros>,
  );
}

/** El disparador o la caja de cada tipo de control, con su nombre. */
function controles(): Array<[string, HTMLElement]> {
  const pastillas = within(screen.getByRole("group", { name: "Resultado" })).getAllByRole("button");
  const casilla = screen.getByRole("checkbox", { name: "Con cobro" }).closest("label");
  if (casilla === null) throw new Error("la casilla no está dentro de su `label`");
  return [
    ["texto", screen.getByRole("searchbox", { name: "Remitente" })],
    ["selección múltiple", screen.getByRole("button", { name: /^Zona:/ })],
    ["selección única", screen.getByRole("combobox", { name: "Estado" })],
    ["pastilla «Todas»", pastillas[0]],
    ["pastilla «Entregadas»", pastillas[1]],
    ["casilla", casilla],
    ["rango de fechas", screen.getByRole("button", { name: "Periodo" })],
  ];
}

const clases = (el: HTMLElement) => el.className.split(/\s+/);

describe("SLT-194 — filtros de una barra con `escaneo` a 44 px en móvil (R946)", () => {
  it("R946: cada control lleva `max-md:h-11` y conserva el `h-8` de escritorio", () => {
    montar("barra con escaneo");
    const lista = controles();
    expect(lista).toHaveLength(7); // no vacuidad: un control por tipo, pastillas por separado
    for (const [nombre, el] of lista) {
      expect({ nombre, clases: clases(el) }).toEqual({
        nombre,
        clases: expect.arrayContaining(["h-8", "max-md:h-11"]),
      });
    }
  });
});

describe("SLT-194 — fuera de una barra con `escaneo` los filtros no cambian (R948)", () => {
  it.each<Montaje>(["barra sin escaneo", "suelto"])(
    "R948: %s → ningún control lleva `max-md:h-11` y todos siguen en `h-8`",
    (montaje) => {
      montar(montaje);
      const lista = controles();
      expect(lista).toHaveLength(7);
      for (const [nombre, el] of lista) {
        expect({ nombre, movil: clases(el).includes("max-md:h-11") }).toEqual({
          nombre,
          movil: false,
        });
        expect({ nombre, escritorio: clases(el).includes("h-8") }).toEqual({
          nombre,
          escritorio: true,
        });
      }
    },
  );
});
