// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// SLT-47 / T3.2 (design §4.2; R3, R5, R17, R18, R20) — la barra de lugar de N niveles montada como
// en `/ordenes`: `BuscadorFiltros` decide qué listas montar y `FilterComponent` las encadena, los dos
// con el traductor de URL. Las listas salen de `declararNiveles` sobre un catálogo de juguete con
// homónimos (dos cantones «Central», dos distritos «San Rafael»).
//
// El mock de `next/navigation` copia el de `tests/unit/components/buscador-filtros-url.test.tsx`.

const replaceMock = vi.fn();

let parametros = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ordenes",
  useSearchParams: () => parametros,
}));

import { olvidarParamsBorrados } from "@/hooks/useFiltrosUrl";
import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import {
  FilterComponent,
  type FilterDef,
  type FilterSelection,
} from "@/components/shared/FilterComponent";
import {
  declararNiveles,
  traductorPorId,
  type OpcionesDeLugar,
  type TraductorDeUrl,
} from "@/lib/utils/filtro-ubicacion";

const NIVELES_CR: OpcionesDeLugar["niveles"] = [
  { profundidad: 1, singular: "Provincia", plural: "Provincias" },
  { profundidad: 2, singular: "Cantón", plural: "Cantones" },
  { profundidad: 3, singular: "Distrito", plural: "Distritos" },
];

const LUGARES_CR: OpcionesDeLugar["lugares"] = [
  { id: "P1", nombre: "San José", padreId: null, profundidad: 1 },
  { id: "P2", nombre: "Alajuela", padreId: null, profundidad: 1 },
  { id: "C1", nombre: "Escazú", padreId: "P1", profundidad: 2 },
  { id: "C2", nombre: "Central", padreId: "P1", profundidad: 2 },
  { id: "C3", nombre: "Central", padreId: "P2", profundidad: 2 },
  { id: "D1", nombre: "San Rafael", padreId: "C1", profundidad: 3 },
  { id: "D2", nombre: "San Antonio", padreId: "C1", profundidad: 3 },
  { id: "D3", nombre: "San Rafael", padreId: "C3", profundidad: 3 },
  { id: "D4", nombre: "Carmen", padreId: "C2", profundidad: 3 },
];

const LISTAS_CR = declararNiveles({ niveles: NIVELES_CR, lugares: LUGARES_CR });
/** Las mismas listas con el catálogo todavía sin llegar. */
const LISTAS_SIN_CATALOGO = declararNiveles({ niveles: NIVELES_CR, lugares: [] });

beforeEach(() => {
  replaceMock.mockClear();
  parametros = new URLSearchParams();
  olvidarParamsBorrados();
});

afterEach(() => {
  cleanup();
});

/**
 * El consumidor mínimo, como `OrdenesListado`: posee las claves puestas, monta en `FilterComponent`
 * solo las pedidas y lo remonta con «Limpiar todo».
 */
function Barra({
  listas,
  traductor,
  activosIniciales = [],
  onSeleccion,
}: {
  listas: FilterDef[];
  traductor?: TraductorDeUrl;
  activosIniciales?: string[];
  onSeleccion: (sel: FilterSelection) => void;
}) {
  const [activos, setActivos] = useState<string[]>(activosIniciales);
  const [reset, setReset] = useState(0);
  const montados = listas.filter((f) => activos.includes(f.key));
  return (
    <BuscadorFiltros
      onChange={() => {}}
      debounceMs={0}
      filtros={listas}
      activos={activos}
      onActivosChange={setActivos}
      onLimpiarTodo={() => {
        setActivos([]);
        setReset((n) => n + 1);
        onSeleccion({});
      }}
      hayFiltrosAplicados={activos.length > 0}
      traductorUrl={traductor}
    >
      {montados.length > 0 ? (
        <FilterComponent
          key={reset}
          filters={montados}
          onChange={onSeleccion}
          debounceMs={0}
          traductorUrl={traductor}
        />
      ) : null}
    </BuscadorFiltros>
  );
}

function ultima(fn: ReturnType<typeof vi.fn>): FilterSelection {
  return fn.mock.calls[fn.mock.calls.length - 1]?.[0] as FilterSelection;
}

function disparador(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${label}:`) });
}

/** Abre la lista, lee sus opciones (sin «Todos») y la cierra. */
async function opcionesDe(user: ReturnType<typeof userEvent.setup>, label: string): Promise<string[]> {
  await user.click(disparador(label));
  const lista = screen.getByRole("listbox", { name: label });
  const textos = within(lista)
    .getAllByRole("option")
    .map((o) => o.textContent?.trim() ?? "")
    .filter((t) => t !== "Todos");
  await user.click(disparador(label));
  return textos;
}

async function marcar(user: ReturnType<typeof userEvent.setup>, label: string, opcion: string) {
  await user.click(disparador(label));
  const lista = screen.getByRole("listbox", { name: label });
  await user.click(within(lista).getByRole("option", { name: opcion }));
  await user.click(disparador(label));
}

describe("R3 — listas encadenadas por nivel", () => {
  const TODAS = ["nivel_1", "nivel_2", "nivel_3"];

  it("sin elección arriba, cada lista ofrece todo su nivel (P4)", async () => {
    const user = userEvent.setup();
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} activosIniciales={TODAS} onSeleccion={vi.fn()} />);

    expect(await opcionesDe(user, "Cantón")).toEqual(["Escazú", "Central · San José", "Central · Alajuela"]);
    expect(await opcionesDe(user, "Distrito")).toEqual(["San Rafael · Escazú, San José", "San Antonio", "San Rafael · Central, Alajuela", "Carmen"]);
  });

  it("con elección en k, k+1 ofrece solo los hijos de lo elegido (y k+2 los de debajo)", async () => {
    const user = userEvent.setup();
    const onSeleccion = vi.fn();
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} activosIniciales={TODAS} onSeleccion={onSeleccion} />);

    await marcar(user, "Provincia", "San José");
    expect(await opcionesDe(user, "Cantón")).toEqual(["Escazú", "Central · San José"]);
    expect(await opcionesDe(user, "Distrito")).toEqual(["San Rafael · Escazú, San José", "San Antonio", "Carmen"]);

    await marcar(user, "Cantón", "Escazú");
    expect(await opcionesDe(user, "Distrito")).toEqual(["San Rafael · Escazú, San José", "San Antonio"]);
    expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P1"], nivel_2: ["C1"] });
  });

  it("al cambiar la elección de k, las de los niveles más hondos que dejan de colgar se descartan", async () => {
    const user = userEvent.setup();
    const onSeleccion = vi.fn();
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} activosIniciales={TODAS} onSeleccion={onSeleccion} />);

    await marcar(user, "Provincia", "San José");
    await marcar(user, "Cantón", "Escazú");
    await marcar(user, "Distrito", "San Rafael · Escazú, San José");
    expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P1"], nivel_2: ["C1"], nivel_3: ["D1"] });

    // Se suma Alajuela: Escazú y su San Rafael siguen colgando de lo elegido, nada se descarta.
    await marcar(user, "Provincia", "Alajuela");
    expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P1", "P2"], nivel_2: ["C1"], nivel_3: ["D1"] });

    // Se quita San José: Escazú y su distrito dejan de colgar y salen antes de emitir.
    await marcar(user, "Provincia", "San José");
    expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P2"] });
  });
});

describe("R5 — las listas pasan a la línea siguiente", () => {
  it("con 10 niveles, todas viven en un contenedor `flex-wrap` sin desborde horizontal", () => {
    const niveles = Array.from({ length: 10 }, (_, i) => ({
      profundidad: i + 1,
      singular: `Nivel ${i + 1}`,
      plural: `Niveles ${i + 1}`,
    }));
    const lugares = niveles.map((n) => ({
      id: `L${n.profundidad}`,
      nombre: `Lugar ${n.profundidad}`,
      padreId: n.profundidad === 1 ? null : `L${n.profundidad - 1}`,
      profundidad: n.profundidad,
    }));
    const listas = declararNiveles({ niveles, lugares });
    render(
      <Barra
        listas={listas}
        traductor={traductorPorId()}
        activosIniciales={listas.map((l) => l.key)}
        onSeleccion={vi.fn()}
      />,
    );

    const disparadores = niveles.map((n) => disparador(`Nivel ${n.profundidad}`));
    const contenedor = disparadores[0].closest(".flex-wrap");
    expect(contenedor).not.toBeNull();
    for (const d of disparadores) expect(contenedor?.contains(d)).toBe(true);
    expect(contenedor?.className).not.toMatch(/flex-nowrap|overflow-x-(auto|scroll)/);
    // Y la fila de la barra que lo contiene también envuelve.
    expect(contenedor?.parentElement?.closest(".flex-wrap")).not.toBeNull();
  });
});

describe("R17 — `?lugar_id=` rearma las listas subiendo hasta el nivel 1", () => {
  it("un distrito monta las tres listas con su cadena elegida y filtra por él", async () => {
    parametros = new URLSearchParams("lugar_id=D1");
    const onSeleccion = vi.fn();
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} onSeleccion={onSeleccion} />);

    await waitFor(() => expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P1"], nivel_2: ["C1"], nivel_3: ["D1"] }));
    expect(disparador("Provincia")).toHaveAccessibleName("Provincia: San José");
    expect(disparador("Cantón")).toHaveAccessibleName("Cantón: Escazú");
    expect(disparador("Distrito")).toHaveAccessibleName("Distrito: San Rafael · Escazú, San José");
  });

  it("un id que no está entre las opciones se descarta sin error; los demás se quedan", async () => {
    parametros = new URLSearchParams("lugar_id=NO-EXISTE,C3");
    const onSeleccion = vi.fn();
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} onSeleccion={onSeleccion} />);

    await waitFor(() => expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P2"], nivel_2: ["C3"] }));
    expect(screen.queryByRole("button", { name: /^Distrito:/ })).toBeNull();
  });
});

describe("R18 — los enlaces viejos dan las mismas elecciones que hoy", () => {
  it("con comas o con el parámetro repetido, la misma elección", async () => {
    const conComas = vi.fn();
    parametros = new URLSearchParams("canton_id=C1,C2");
    const { unmount } = render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} onSeleccion={conComas} />);
    await waitFor(() => expect(ultima(conComas)).toEqual({ nivel_2: ["C1", "C2"] }));
    unmount();

    const repetido = vi.fn();
    parametros = new URLSearchParams("canton_id=C1&canton_id=C2");
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} onSeleccion={repetido} />);
    await waitFor(() => expect(ultima(repetido)).toEqual(ultima(conComas)));
  });

  it("un valor incoherente con la elección de arriba, o no ofrecido, se poda como hoy", async () => {
    // C3 cuelga de Alajuela, no de San José; D9 no existe.
    parametros = new URLSearchParams("provincia_id=P1&canton_id=C1,C3&distrito_id=D1,D9");
    const onSeleccion = vi.fn();
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} onSeleccion={onSeleccion} />);

    await waitFor(() => expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P1"], nivel_2: ["C1"], nivel_3: ["D1"] }));
  });

  it("la clave interna de una lista en la URL se ignora (R21)", async () => {
    parametros = new URLSearchParams("nivel_1=P1");
    const onSeleccion = vi.fn();
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} onSeleccion={onSeleccion} />);

    expect(screen.queryByRole("button", { name: /^Provincia:/ })).toBeNull();
    expect(onSeleccion).not.toHaveBeenCalled();
  });
});

describe("R20 — «Limpiar todo» quita `lugar_id` y las claves viejas, y deja las ajenas", () => {
  it("retira lugar_id, provincia_id, canton_id, distrito_id y el término; conserva `cierre`", async () => {
    const user = userEvent.setup();
    parametros = new URLSearchParams(
      "lugar_id=D1&provincia_id=P1&canton_id=C1&distrito_id=D1&q=guia&cierre=abc",
    );
    render(<Barra listas={LISTAS_CR} traductor={traductorPorId()} onSeleccion={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Limpiar todo" }));

    expect(replaceMock).toHaveBeenCalledWith("/ordenes?cierre=abc", { scroll: false });
    expect(screen.queryByRole("button", { name: /^Provincia:/ })).toBeNull();
  });
});

describe("Activación tardía (design §4.2) — el catálogo llega después del montaje", () => {
  it("un `lugar_id` sin catálogo queda pendiente y se activa cuando llegan las opciones", async () => {
    parametros = new URLSearchParams("lugar_id=D1");
    const onSeleccion = vi.fn();
    const traductor = traductorPorId();
    const { rerender } = render(<Barra listas={LISTAS_SIN_CATALOGO} traductor={traductor} onSeleccion={onSeleccion} />);

    expect(screen.queryByRole("button", { name: /^Provincia:/ })).toBeNull();
    expect(onSeleccion).not.toHaveBeenCalled();

    rerender(<Barra listas={LISTAS_CR} traductor={traductor} onSeleccion={onSeleccion} />);

    await waitFor(() => expect(ultima(onSeleccion)).toEqual({ nivel_1: ["P1"], nivel_2: ["C1"], nivel_3: ["D1"] }));
    expect(disparador("Distrito")).toHaveAccessibleName("Distrito: San Rafael · Escazú, San José");
  });

  it("si el usuario ya tocó los filtros, el catálogo tardío no le activa nada", async () => {
    const user = userEvent.setup();
    parametros = new URLSearchParams("lugar_id=D1");
    const onSeleccion = vi.fn();
    const traductor = traductorPorId();
    const listasConEstado: FilterDef[] = [
      { key: "estado", label: "Estado", kind: "multi", options: [{ value: "e1", label: "Nuevo" }] },
    ];
    const { rerender } = render(
      <Barra listas={[...listasConEstado, ...LISTAS_SIN_CATALOGO]} traductor={traductor} onSeleccion={onSeleccion} />,
    );

    await user.click(screen.getByRole("button", { name: /^Filtros/ }));
    await user.click(await screen.findByRole("option", { name: "Estado" }));
    expect(disparador("Estado")).toBeInTheDocument();

    rerender(<Barra listas={[...listasConEstado, ...LISTAS_CR]} traductor={traductor} onSeleccion={onSeleccion} />);

    expect(screen.queryByRole("button", { name: /^Provincia:/ })).toBeNull();
    expect(onSeleccion).not.toHaveBeenCalled();
  });

  it("`FilterComponent` solo: las listas declaradas sin opciones se siembran al llegar el catálogo", async () => {
    parametros = new URLSearchParams("lugar_id=D2");
    const onChange = vi.fn();
    const traductor = traductorPorId();
    const { rerender } = render(
      <FilterComponent filters={LISTAS_SIN_CATALOGO} onChange={onChange} debounceMs={0} traductorUrl={traductor} />,
    );
    expect(onChange).not.toHaveBeenCalled();

    rerender(<FilterComponent filters={LISTAS_CR} onChange={onChange} debounceMs={0} traductorUrl={traductor} />);

    await waitFor(() => expect(ultima(onChange)).toEqual({ nivel_1: ["P1"], nivel_2: ["C1"], nivel_3: ["D2"] }));
  });
});
