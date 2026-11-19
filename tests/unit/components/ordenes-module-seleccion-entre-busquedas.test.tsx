// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";

import { ToastProvider } from "@/providers/ToastProvider";
import type { OrdenListItemDTO } from "@/lib/types/orden";
import type { AccionLote } from "@/app/(app)/ordenes/_components/OrdenesModule";
import type { OrdenesFilterUI } from "@/app/(app)/ordenes/_components/serializar-filtro";

// SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos» (T1) —
// en `/ordenes` la selección es un `Map id -> fila` que sobrevive a cada búsqueda, filtro y
// orden; la barra cuenta el TOTAL y cuántas no se ven; la acción recibe todas las marcadas.

const listarOrdenesMock = vi.fn();
vi.mock("@/lib/actions/ordenes", () => ({
  listarOrdenes: (...a: unknown[]) => listarOrdenesMock(...a),
}));

import { OrdenesModule } from "@/app/(app)/ordenes/_components/OrdenesModule";

function makeOrden(
  id: string,
  numGuia: number,
  over: Partial<OrdenListItemDTO> = {},
): OrdenListItemDTO {
  return {
    id,
    numGuia,
    numRemision: `REM-${id}`,
    estatusId: "est-1",
    estatusValue: "en_preparacion",
    destinatario: "Destino",
    telefonoDest: "0999999999",
    tiendaId: "tienda-1",
    tiendaNombre: "Tienda X",
    zonaId: "zona-1",
    provinciaId: "prov-1",
    cantonId: "canton-1",
    distritoId: null,
    producto: "Producto",
    peso: 1,
    notas: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  } as OrdenListItemDTO;
}

/** Qué devuelve el servidor para cada término buscado. */
let resultados: Record<string, OrdenListItemDTO[]> = {};

function envolver(ui: ReactElement) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>
  );
}

const onRun = vi.fn();
const acciones = (): AccionLote[] => [{ key: "hacer", label: "Hacer", onRun }];

function modulo(filter: OrdenesFilterUI, extra: Partial<Parameters<typeof OrdenesModule>[0]> = {}) {
  return envolver(
    <OrdenesModule filter={filter} selectable acciones={acciones} {...extra} />,
  );
}

function casilla(numRemision: string) {
  return screen.getByRole("checkbox", { name: `Seleccionar orden ${numRemision}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  resultados = {
    juan: [makeOrden("o1", 1001)],
    pedro: [makeOrden("o2", 1002)],
    nada: [],
  };
  listarOrdenesMock.mockImplementation(
    async (input: { page: number; pageSize: number; filter?: { q?: string } }) => {
      const items = resultados[input.filter?.q ?? ""] ?? [];
      return {
        status: "ok",
        items,
        page: input.page,
        pageSize: input.pageSize,
        total: items.length,
      };
    },
  );
});

afterEach(() => cleanup());

describe("SLT-222 — /ordenes: la selección sobrevive a la búsqueda", () => {
  it("R1500 + R1501 + R1505: marcar en «juan», buscar «pedro», marcar: la acción recibe las DOS filas", async () => {
    const user = userEvent.setup();
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "pedro" }));
    await screen.findByText("1002");
    await user.click(casilla("REM-o2"));

    await user.click(screen.getByRole("button", { name: "Hacer" }));
    expect(onRun).toHaveBeenCalledTimes(1);
    const filas = onRun.mock.calls[0]![0] as OrdenListItemDTO[];
    expect(filas.map((f) => f.id).sort()).toEqual(["o1", "o2"]);
  });

  it("R1506: el contador dice el TOTAL y cuántas quedan fuera de esta búsqueda (D8)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));
    expect(screen.getByText("1 seleccionada")).toBeInTheDocument();

    rerender(modulo({ q: "pedro" }));
    await screen.findByText("1002");
    expect(
      await screen.findByText("1 seleccionada · 1 fuera de esta búsqueda"),
    ).toBeInTheDocument();

    await user.click(casilla("REM-o2"));
    expect(
      await screen.findByText("2 seleccionadas · 1 fuera de esta búsqueda"),
    ).toBeInTheDocument();
  });

  it("R1506: la barra sigue con un resultado VACÍO", async () => {
    const user = userEvent.setup();
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "nada" }));
    await screen.findByText("Sin coincidencias");
    expect(
      screen.getByText("1 seleccionada · 1 fuera de esta búsqueda"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpiar" })).toBeInTheDocument();
  });

  it("R1506: la barra sigue aunque la página visible no tenga filas seleccionables", async () => {
    const user = userEvent.setup();
    // El predicado quita la columna en la búsqueda «pedro» (ninguna fila accionable).
    const soloO1 = (items: OrdenListItemDTO[]) => items.some((i) => i.id === "o1");
    const { rerender } = render(modulo({ q: "juan" }, { selectable: soloO1 }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "pedro" }, { selectable: soloO1 }));
    await screen.findByText("1002");
    expect(screen.queryByRole("checkbox", { name: "Seleccionar orden REM-o2" })).toBeNull();
    expect(
      screen.getByText("1 seleccionada · 1 fuera de esta búsqueda"),
    ).toBeInTheDocument();
  });

  it("R1504: al volver a la búsqueda anterior, la casilla sale marcada", async () => {
    const user = userEvent.setup();
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "pedro" }));
    await screen.findByText("1002");
    rerender(modulo({ q: "juan" }));
    await screen.findByText("1001");
    expect(casilla("REM-o1")).toHaveAttribute("aria-checked", "true");
  });

  it("R1502: cambiar un filtro de la barra (no el término) conserva lo marcado", async () => {
    const user = userEvent.setup();
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "juan", zona_id: ["z9"] }));
    await waitFor(() =>
      expect(listarOrdenesMock).toHaveBeenCalledWith(
        expect.objectContaining({ filter: { q: "juan", zona_id: ["z9"] } }),
      ),
    );
    expect(await screen.findByText("1 seleccionada")).toBeInTheDocument();
    expect(casilla("REM-o1")).toHaveAttribute("aria-checked", "true");
  });

  it("R1503: cambiar el ORDEN conserva lo marcado", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      modulo({ q: "juan" }, { orden: { sortBy: "created_at", sortDir: "desc" } }),
    );
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "juan" }, { orden: { sortBy: "created_at", sortDir: "asc" } }));
    await waitFor(() =>
      expect(listarOrdenesMock).toHaveBeenCalledWith(
        expect.objectContaining({ sortDir: "asc" }),
      ),
    );
    expect(screen.getByText("1 seleccionada")).toBeInTheDocument();
  });

  it("R1507: «Limpiar» desmarca TODO, también lo que no se ve", async () => {
    const user = userEvent.setup();
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));
    rerender(modulo({ q: "pedro" }));
    await screen.findByText("1002");
    await user.click(casilla("REM-o2"));

    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(screen.queryByText(/seleccionada/)).toBeNull());

    rerender(modulo({ q: "juan" }));
    await screen.findByText("1001");
    expect(casilla("REM-o1")).toHaveAttribute("aria-checked", "false");
  });

  it("R1509: la acción recibe el ÚLTIMO estado conocido de una marcada que ya no se ve", async () => {
    const user = userEvent.setup();
    resultados.otra = [makeOrden("o1", 1001, { estatusValue: "en_bodega_central" })];
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    // Otra búsqueda trae la o1 con un estado nuevo: se refresca la fila guardada…
    rerender(modulo({ q: "otra" }));
    await waitFor(() =>
      expect(listarOrdenesMock).toHaveBeenCalledWith(
        expect.objectContaining({ filter: { q: "otra" } }),
      ),
    );
    await screen.findByText("1001");
    // …y al dejar de verse, la acción usa ese estado y no el del momento de marcarla.
    rerender(modulo({ q: "pedro" }));
    await screen.findByText("1002");
    await user.click(screen.getByRole("button", { name: "Hacer" }));

    const filas = onRun.mock.calls[0]![0] as OrdenListItemDTO[];
    expect(filas).toHaveLength(1);
    expect(filas[0]!.estatusValue).toBe("en_bodega_central");
  });

  it("R1512: «seleccionar todo» añade lo visible y conserva lo de fuera", async () => {
    const user = userEvent.setup();
    resultados.pedro = [makeOrden("o2", 1002), makeOrden("o3", 1003)];
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "pedro" }));
    await screen.findByText("1003");
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar todas las órdenes" }));

    expect(
      await screen.findByText("3 seleccionadas · 1 fuera de esta búsqueda"),
    ).toBeInTheDocument();
  });

  it("R1513: desmarcar «seleccionar todo» quita lo visible y NO lo de fuera (D6)", async () => {
    const user = userEvent.setup();
    resultados.pedro = [makeOrden("o2", 1002), makeOrden("o3", 1003)];
    const { rerender } = render(modulo({ q: "juan" }));
    await screen.findByText("1001");
    await user.click(casilla("REM-o1"));

    rerender(modulo({ q: "pedro" }));
    await screen.findByText("1003");
    const todas = screen.getByRole("checkbox", { name: "Seleccionar todas las órdenes" });
    await user.click(todas);
    await screen.findByText("3 seleccionadas · 1 fuera de esta búsqueda");
    await user.click(todas);

    expect(
      await screen.findByText("1 seleccionada · 1 fuera de esta búsqueda"),
    ).toBeInTheDocument();
    expect(casilla("REM-o2")).toHaveAttribute("aria-checked", "false");
    expect(casilla("REM-o3")).toHaveAttribute("aria-checked", "false");
  });
});
