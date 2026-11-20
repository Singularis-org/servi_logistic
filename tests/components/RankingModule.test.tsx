// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RankingModule } from "@/app/(app)/ranking/_components/RankingModule";
import { RankingPodio } from "@/app/(app)/ranking/_components/RankingPodio";
import { editarPremioAction, obtenerRankingAction } from "@/lib/actions/ranking";
import type { PremioRankingDTO, RankingRowDTO } from "@/lib/types/ranking";

// Feature 76 (T9) — módulo cliente del ranking. Se mockean la Server Action de edición,
// el toast y el router (refresh) para afirmar la composición (tabla + inputs) sin DB ni
// sesión. Trazabilidad: R9, R13, R14, R15, R16, R17, R25.
vi.mock("@/lib/actions/ranking", () => ({
  editarPremioAction: vi.fn(),
  obtenerRankingAction: vi.fn(),
}));

const { successMock, errorMock, refreshMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

const editarMock = vi.mocked(editarPremioAction);

// Podio con SOLO 2 ocupantes elegibles (posición 3 vacía → R15) + una fila fuera de podio.
const RANKING: RankingRowDTO[] = [
  {
    posicion: 1,
    mensajeroId: "m1",
    nombre: "Ana",
    entregadasHoy: 5,
    asignadasHoy: 5,
    pct: "100.0",
    premio: "5000",
  },
  {
    posicion: 2,
    mensajeroId: "m2",
    nombre: "Beto",
    entregadasHoy: 4,
    asignadasHoy: 5,
    pct: "80.0",
    premio: null,
  },
  {
    posicion: null,
    mensajeroId: "m3",
    nombre: "Caro",
    entregadasHoy: 0,
    asignadasHoy: 0,
    pct: null,
    premio: null,
  },
];

const PREMIOS: PremioRankingDTO[] = [
  { posicion: 1, monto: "5000", descripcion: "Bono oro" },
  { posicion: 2, monto: null, descripcion: null },
  { posicion: 3, monto: "1000", descripcion: "Consuelo" },
];

function tablaPremios() {
  return screen.getByRole("table", { name: "Premios del podio" });
}

beforeEach(() => {
  vi.clearAllMocks();
  editarMock.mockResolvedValue({ status: "ok" });
});

afterEach(() => {
  cleanup();
});

// La presentación del ranking (R13/R6/R3) se mudó a `RankingPodio`: su cobertura vive
// ahora en tests/components/RankingPodio.test.tsx. Aquí queda solo la tabla de premios.

describe("RankingModule — premios ↔ ocupante del podio (R14/R15)", () => {
  it("R14: asocia el premio (monto + descripción) al mensajero elegible de esa posición", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const filaPos1 = within(tablaPremios())
      .getByRole("rowheader", { name: "1" })
      .closest("tr") as HTMLElement;
    expect(within(filaPos1).getByText("Ana")).toBeInTheDocument();
    expect(within(filaPos1).getByText("₡5.000")).toBeInTheDocument();
    expect(within(filaPos1).getByText("Bono oro")).toBeInTheDocument();
  });

  it("R15: una posición sin ocupante elegible NO inventa mensajero", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const filaPos3 = within(tablaPremios())
      .getByRole("rowheader", { name: "3" })
      .closest("tr") as HTMLElement;
    expect(
      within(filaPos3).getByText("Sin ocupante elegible hoy"),
    ).toBeInTheDocument();
    // El premio se muestra igualmente, pero sin ocupante inventado.
    expect(within(filaPos3).getByText("₡1.000")).toBeInTheDocument();
    expect(within(filaPos3).queryByText("Ana")).not.toBeInTheDocument();
    expect(within(filaPos3).queryByText("Beto")).not.toBeInTheDocument();
    expect(within(filaPos3).queryByText("Caro")).not.toBeInTheDocument();
  });
});

describe("RankingModule — solo-lectura del mensajero (R9/R17/R25)", () => {
  it("R17: sin `esEditable` no hay inputs de edición ni botón guardar", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Guardar" }),
    ).not.toBeInTheDocument();
  });

  it("R9: monto vacío se muestra como 'Sin premio asignado', nunca como cero", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const filaPos2 = within(tablaPremios())
      .getByRole("rowheader", { name: "2" })
      .closest("tr") as HTMLElement;
    expect(within(filaPos2).getByText("Sin premio asignado")).toBeInTheDocument();
    expect(within(filaPos2).queryByText("₡0")).not.toBeInTheDocument();
  });

  it("R25: descripción vacía se muestra como 'Sin descripción'; con texto se muestra tal cual", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const filaPos2 = within(tablaPremios())
      .getByRole("rowheader", { name: "2" })
      .closest("tr") as HTMLElement;
    expect(within(filaPos2).getByText("Sin descripción")).toBeInTheDocument();
    const filaPos1 = within(tablaPremios())
      .getByRole("rowheader", { name: "1" })
      .closest("tr") as HTMLElement;
    expect(within(filaPos1).getByText("Bono oro")).toBeInTheDocument();
  });
});

describe("RankingModule — edición del maestro (R16/R10/R25)", () => {
  it("R16: con `esEditable` muestra inputs de monto y descripción por posición y botón guardar", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={true} />);
    expect(
      screen.getByRole("textbox", { name: "Monto del premio — posición 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Descripción — posición 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Guardar" }),
    ).toHaveLength(3);
  });

  it("R10/R25: guardar envía monto + descripción a editarPremioAction y refresca", async () => {
    const user = userEvent.setup();
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={true} />);

    const filaPos2 = within(tablaPremios())
      .getByRole("rowheader", { name: "2" })
      .closest("tr") as HTMLElement;
    const monto = within(filaPos2).getByRole("textbox", {
      name: "Monto del premio — posición 2",
    });
    const desc = within(filaPos2).getByRole("textbox", {
      name: "Descripción — posición 2",
    });

    await user.type(monto, "2500");
    await user.type(desc, "Plata");
    await user.click(within(filaPos2).getByRole("button", { name: "Guardar" }));

    expect(editarMock).toHaveBeenCalledWith({
      posicion: 2,
      monto: "2500",
      descripcion: "Plata",
    });
    expect(successMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("R9/R25: vaciar monto y descripción envía null en ambos", async () => {
    const user = userEvent.setup();
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={true} />);

    const filaPos1 = within(tablaPremios())
      .getByRole("rowheader", { name: "1" })
      .closest("tr") as HTMLElement;
    await user.clear(
      within(filaPos1).getByRole("textbox", {
        name: "Monto del premio — posición 1",
      }),
    );
    await user.clear(
      within(filaPos1).getByRole("textbox", { name: "Descripción — posición 1" }),
    );
    await user.click(within(filaPos1).getByRole("button", { name: "Guardar" }));

    expect(editarMock).toHaveBeenCalledWith({
      posicion: 1,
      monto: null,
      descripcion: null,
    });
  });

  it("R11: si la action responde `invalid`, muestra el mensaje de error y no refresca", async () => {
    editarMock.mockResolvedValue({ status: "invalid", message: "Monto inválido" });
    const user = userEvent.setup();
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={true} />);

    const filaPos1 = within(tablaPremios())
      .getByRole("rowheader", { name: "1" })
      .closest("tr") as HTMLElement;
    await user.click(within(filaPos1).getByRole("button", { name: "Guardar" }));

    expect(errorMock).toHaveBeenCalledWith("Monto inválido");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// SLT-162 «Ranking del mensajero en tarjetas en el móvil» — R750-R754, R758, R759, R763, R764,
// R766 y R769. El corte de 768 px de `useIsMobile` se simula con `matchMedia` (360 = teléfono,
// 1280 = escritorio). Lo que solo existe con CSS (`max-md:`) no se puede medir en jsdom: aquí se
// afirma la CLASE escrita a mano; el E2E `e2e/pwa-mensajero-ranking.spec.ts` mide las cajas.
// ---------------------------------------------------------------------------------------------

/** `matchMedia` para un ancho de ventana: casa `(max-width: Npx)` como lo haría el navegador. */
function simularAncho(ancho: number) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: (() => {
          const max = /max-width:\s*(\d+)px/.exec(query);
          return max ? ancho <= Number(max[1]) : false;
        })(),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

function tablaRanking() {
  return screen.getByRole("table", { name: "Ranking diario de mensajeros" });
}

/** Las filas de datos de «Ranking del día» (sin la de cabecera). */
function filasRanking(): HTMLElement[] {
  return within(tablaRanking()).getAllByRole("row").slice(1);
}

/** Las clases de un elemento, como lista. */
function clases(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/);
}

/** El primer ancestro de `el` (él incluido) que lleva la clase `clase`, o `null`. */
function ancestroConClase(el: Element, clase: string): Element | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (clases(n).includes(clase)) return n;
  }
  return null;
}

/** `a` va antes que `b` en el documento. */
function antes(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("SLT-162 — Ranking del día en el teléfono (R750, R759, R764)", () => {
  beforeEach(() => simularAncho(360));
  afterEach(() => vi.restoreAllMocks());

  it("R750: cada fila es una tarjeta «{posición} · {nombre}», con «Entregados / asignados» y «% del día», sin cabecera visible", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);

    // Sin cabecera de columnas visible: una sola, y solo para lector.
    const cabeceras = within(tablaRanking()).getAllByRole("columnheader");
    expect(cabeceras).toHaveLength(1);
    expect(cabeceras[0].querySelector(".sr-only")).not.toBeNull();

    const [ana, , caro] = filasRanking();
    expect(within(ana).getByText("1 · Ana")).toBeInTheDocument();
    expect(within(ana).getByText("Entregados / asignados")).toBeInTheDocument();
    expect(within(ana).getByText("5 / 5")).toBeInTheDocument();
    expect(within(ana).getByText("% del día")).toBeInTheDocument();
    expect(within(ana).getByText("100.0%")).toBeInTheDocument();
    // Posición sin dato → «—».
    expect(within(caro).getByText("— · Caro")).toBeInTheDocument();
    // Sin desplegar: ningún control de desglose.
    expect(within(tablaRanking()).queryByRole("button", { expanded: false })).toBeNull();
  });

  it("R750: el chip «Tú» va SOLO en la tarjeta del mensajero que mira", () => {
    render(
      <RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} mensajeroPropioId="m2" />,
    );
    const [ana, beto, caro] = filasRanking();
    expect(within(beto).getByText("Tú")).toBeInTheDocument();
    expect(within(ana).queryByText("Tú")).toBeNull();
    expect(within(caro).queryByText("Tú")).toBeNull();
  });

  it("R750: maestro/admin (sin fila propia) no ven ningún chip «Tú»", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={true} />);
    expect(within(tablaRanking()).queryByText("Tú")).toBeNull();
  });

  it("R758/R759: el nombre envuelve y el conteo y el porcentaje van en columna fija", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const [ana] = filasRanking();
    expect(clases(within(ana).getByText("1 · Ana"))).toEqual(
      expect.arrayContaining(["min-w-0", "whitespace-normal", "wrap-anywhere"]),
    );
    for (const dato of ["5 / 5", "100.0%"]) {
      expect(clases(within(ana).getByText(dato)), dato).toEqual(
        expect.arrayContaining(["shrink-0", "whitespace-nowrap", "tabular-nums"]),
      );
    }
  });

  it("R764: las tarjetas salen en el orden del servidor", () => {
    const desordenado = [RANKING[2], RANKING[0], RANKING[1]];
    render(<RankingModule ranking={desordenado} premios={PREMIOS} esEditable={false} />);
    const caro = screen.getByText("— · Caro");
    const ana = screen.getByText("1 · Ana");
    const beto = screen.getByText("2 · Beto");
    expect(antes(caro, ana)).toBe(true);
    expect(antes(ana, beto)).toBe(true);
  });

  it("R763: sin mensajeros, el vacío de hoy con su texto", () => {
    render(<RankingModule ranking={[]} premios={PREMIOS} esEditable={false} />);
    expect(screen.getByText("Todavía no hay mensajeros para mostrar hoy.")).toBeInTheDocument();
  });

  it("R766: «Descargar» a todo el ancho y 44 px en el teléfono, encima de la lista", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const descargar = screen.getByRole("button", { name: "Descargar Ranking del día" });
    const seccion = ancestroConClase(
      tablaRanking(),
      "max-md:[&_[data-slot=button][aria-label^=Descargar]]:w-full",
    );
    expect(seccion, "la sección de la tabla no lleva DESCARGA_MOVIL").not.toBeNull();
    expect(clases(seccion!)).toEqual(
      expect.arrayContaining([
        "max-md:[&_div:has(>[data-slot=button][aria-label^=Descargar])]:w-full",
        "max-md:[&_[data-slot=button][aria-label^=Descargar]]:min-h-11",
      ]),
    );
    expect(seccion!.contains(descargar)).toBe(true);
    // El selector alcanza el botón: es un `data-slot="button"` cuyo nombre empieza por «Descargar».
    expect(descargar.getAttribute("data-slot")).toBe("button");
    expect(descargar.getAttribute("aria-label")?.startsWith("Descargar")).toBe(true);
    expect(antes(descargar, tablaRanking())).toBe(true);
  });
});

describe("SLT-162 — Ranking del día en escritorio (R751)", () => {
  beforeEach(() => simularAncho(1280));
  afterEach(() => vi.restoreAllMocks());

  it("R751: las cuatro columnas de hoy, en su orden, y sin tarjeta", () => {
    render(
      <RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} mensajeroPropioId="m2" />,
    );
    const cabeceras = within(tablaRanking())
      .getAllByRole("columnheader")
      .map((c) => c.textContent);
    expect(cabeceras).toEqual(["Posición", "Mensajero", "% del día", "Entregados / asignados"]);
    const [ana] = filasRanking();
    expect(within(ana).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "1",
      "Ana",
      "100.0%",
      "5/5",
    ]);
    expect(screen.queryByText("1 · Ana")).toBeNull();
  });
});

describe("SLT-162 — búsqueda por nombre en Ranking del día (R769)", () => {
  afterEach(() => vi.restoreAllMocks());

  const CON_ACENTOS: RankingRowDTO[] = [
    ...RANKING,
    {
      posicion: null,
      mensajeroId: "m4",
      nombre: "Andrés Núñez",
      entregadasHoy: 1,
      asignadasHoy: 2,
      pct: "50.0",
      premio: null,
    },
  ];

  /** El encabezado «{posición} · {nombre}» de cada tarjeta que la lista está pintando, en su orden. */
  function encabezados(): string[] {
    return filasRanking().map((f) => f.querySelector('[data-columna="nombre"]')?.textContent ?? "");
  }

  it.each([360, 1280])("una sola barra de búsqueda a %i px, con el campo a 44 px en el teléfono", (ancho) => {
    simularAncho(ancho);
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const campos = screen.getAllByRole("searchbox");
    expect(campos).toHaveLength(1);
    expect(campos[0]).toHaveAccessibleName("Buscar mensajero");
    expect(clases(campos[0].parentElement!)).toContain("max-md:h-11");
  });

  it("filtra sin mayúsculas ni acentos, conserva posición y orden, y al vaciar vuelve todo", async () => {
    simularAncho(360);
    const user = userEvent.setup();
    render(<RankingModule ranking={CON_ACENTOS} premios={PREMIOS} esEditable={false} />);
    const campo = screen.getByRole("searchbox", { name: "Buscar mensajero" });

    await user.type(campo, "ANDRES");
    await waitFor(() => expect(encabezados()).toEqual(["— · Andrés Núñez"]));

    await user.clear(campo);
    await user.type(campo, "nuñez");
    await waitFor(() => expect(encabezados()).toEqual(["— · Andrés Núñez"]));

    // «a» casa con Ana, Caro y Andrés: los tres, en el orden del servidor y con su posición.
    await user.clear(campo);
    await user.type(campo, "a");
    await waitFor(() => expect(encabezados()).toEqual(["1 · Ana", "— · Caro", "— · Andrés Núñez"]));

    await user.clear(campo);
    await waitFor(() =>
      expect(encabezados()).toEqual(["1 · Ana", "2 · Beto", "— · Caro", "— · Andrés Núñez"]),
    );
  });

  it("sin coincidencias avisa «sin resultados», distinto del vacío del día", async () => {
    simularAncho(360);
    const user = userEvent.setup();
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    await user.type(screen.getByRole("searchbox", { name: "Buscar mensajero" }), "Zoraida");
    expect(await screen.findByText("Ningún mensajero coincide con la búsqueda.")).toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay mensajeros para mostrar hoy.")).toBeNull();
  });

  it("no filtra «Premios del podio» ni el podio, y no pide nada al servidor", async () => {
    simularAncho(360);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    // Como en la página: el podio y el módulo reciben el MISMO ranking.
    render(
      <>
        <RankingPodio ranking={RANKING} />
        <RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />
      </>,
    );
    await user.type(screen.getByRole("searchbox", { name: "Buscar mensajero" }), "Caro");
    await waitFor(() =>
      expect(filasRanking().map((f) => f.querySelector('[data-columna="nombre"]')?.textContent)).toEqual([
        "— · Caro",
      ]),
    );

    // Premios: Beto sigue ocupando el 2º aunque la lista solo muestre a Caro.
    const filaPos2 = within(tablaPremios())
      .getByRole("rowheader", { name: "2" })
      .closest("tr") as HTMLElement;
    expect(within(filaPos2).getByText("Beto")).toBeInTheDocument();
    // Podio: Ana y Beto siguen en sus escalones.
    const podio = screen.getByRole("list", { name: "Podio del ranking diario" });
    expect(within(podio).getByText("Ana")).toBeInTheDocument();
    expect(within(podio).getByText("Beto")).toBeInTheDocument();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(obtenerRankingAction)).not.toHaveBeenCalled();
    expect(editarMock).not.toHaveBeenCalled();
  });
});

describe("SLT-162 — Premios del podio en el teléfono (R752, R753, R764)", () => {
  beforeEach(() => simularAncho(360));
  afterEach(() => vi.restoreAllMocks());

  /** La fila (tarjeta) de premios de la posición `n`. */
  function tarjetaPremio(n: number): HTMLElement {
    return within(tablaPremios())
      .getByRole("rowheader", { name: String(n) })
      .closest("tr") as HTMLElement;
  }

  it("R752: la cabecera queda solo para lector y la tabla se maqueta como tarjetas, sin scroll", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const tabla = tablaPremios();
    const filaCabecera = within(tabla).getAllByRole("row")[0];
    expect(clases(filaCabecera)).toContain("max-md:sr-only");
    expect(clases(tabla)).toContain("max-md:block");
    expect(clases(tarjetaPremio(1))).toEqual(
      expect.arrayContaining(["max-md:grid", "max-md:rounded-lg", "max-md:border", "max-md:p-4"]),
    );
  });

  it("R752: arriba «{n}º · {ocupante}»; abajo la descripción y, en columna fija, «Monto del premio» con el monto", () => {
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    const t1 = tarjetaPremio(1);
    expect(within(t1).getByRole("rowheader").textContent).toBe("1º ·");
    expect(within(t1).getByText("Ana")).toBeInTheDocument();
    expect(within(t1).getByText("Bono oro")).toBeInTheDocument();
    const monto = within(t1).getByText("₡5.000");
    expect(clases(monto)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap", "tabular-nums"]));
    const celdaMonto = monto.closest("td") as HTMLElement;
    expect(within(celdaMonto).getByText("Monto del premio")).toBeInTheDocument();
    // Abajo a la derecha (columna 3, fila 2) y la descripción abajo a la izquierda.
    expect(clases(celdaMonto)).toEqual(expect.arrayContaining(["max-md:col-start-3", "max-md:row-start-2"]));
    const celdaDescripcion = within(t1).getByText("Bono oro").closest("td") as HTMLElement;
    expect(clases(celdaDescripcion)).toEqual(
      expect.arrayContaining(["max-md:col-start-1", "max-md:row-start-2", "wrap-anywhere"]),
    );
  });

  it("R752: sin ocupante, sin descripción y sin monto, los textos de hoy", () => {
    const premios: PremioRankingDTO[] = [
      { posicion: 1, monto: "5000", descripcion: "Bono oro" },
      { posicion: 2, monto: null, descripcion: null },
      { posicion: 3, monto: null, descripcion: null },
    ];
    render(<RankingModule ranking={RANKING} premios={premios} esEditable={false} />);
    const t3 = tarjetaPremio(3);
    expect(within(t3).getByRole("rowheader").textContent).toBe("3º ·");
    expect(within(t3).getByText("Sin ocupante elegible hoy")).toBeInTheDocument();
    expect(within(t3).getByText("Sin descripción")).toBeInTheDocument();
    expect(within(t3).getByText("Sin premio asignado")).toBeInTheDocument();
  });

  it("R764: las tarjetas de premios van por posición 1-3 aunque lleguen desordenadas", () => {
    const desordenados = [PREMIOS[2], PREMIOS[0], PREMIOS[1]];
    render(<RankingModule ranking={RANKING} premios={desordenados} esEditable={false} />);
    expect(antes(tarjetaPremio(1), tarjetaPremio(2))).toBe(true);
    expect(antes(tarjetaPremio(2), tarjetaPremio(3))).toBe(true);
  });

  it("R753 (DC24): el editable muestra monto, descripción y «Guardar» a 44 px, y guarda igual que hoy", async () => {
    const user = userEvent.setup();
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={true} />);
    const t2 = tarjetaPremio(2);
    const monto = within(t2).getByRole("textbox", { name: "Monto del premio — posición 2" });
    const desc = within(t2).getByRole("textbox", { name: "Descripción — posición 2" });
    const guardar = within(t2).getByRole("button", { name: "Guardar" });
    expect(clases(monto)).toContain("max-md:h-11");
    expect(clases(desc)).toContain("max-md:h-11");
    expect(clases(guardar)).toEqual(
      expect.arrayContaining(["max-md:min-h-11", "max-md:min-w-11", "max-md:w-full"]),
    );
    // Una sola copia de cada control: el teléfono no duplica el DOM.
    expect(screen.getAllByRole("button", { name: "Guardar" })).toHaveLength(3);

    await user.type(monto, "2500");
    await user.type(desc, "Plata");
    await user.click(guardar);
    expect(editarMock).toHaveBeenCalledWith({ posicion: 2, monto: "2500", descripcion: "Plata" });
    expect(refreshMock).toHaveBeenCalled();
  });
});

describe("SLT-162 — Premios del podio en escritorio (R754)", () => {
  beforeEach(() => simularAncho(1280));
  afterEach(() => vi.restoreAllMocks());

  it("R754: las columnas de hoy, con «Acciones» solo si es editable", () => {
    const { unmount } = render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={true} />);
    expect(within(tablaPremios()).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Posición",
      "Mensajero",
      "Monto del premio",
      "Descripción",
      "Acciones",
    ]);
    unmount();
    render(<RankingModule ranking={RANKING} premios={PREMIOS} esEditable={false} />);
    expect(within(tablaPremios()).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Posición",
      "Mensajero",
      "Monto del premio",
      "Descripción",
    ]);
  });
});
