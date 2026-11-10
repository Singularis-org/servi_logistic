// @vitest-environment jsdom
// SLT-89 (R24–R27, design §8.1) — EL SELECTOR DE N NIVELES.
//
// Marcar un nodo asigna ESE nodo; lo que cuelga de él lo hereda y se pinta como heredado; lo que está en
// otra zona se ve como excepción. Los nombres de nivel salen del DTO (aquí, a propósito, no son los de
// Costa Rica). Datos sintéticos.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GeografiaSelector } from "@/app/(app)/configuracion/zonas/_components/GeografiaSelector";
import type { ArbolDeZonasDTO, NodoDeZonasDTO } from "@/lib/types/geografia-nodo";

const Z_EDITADA = { id: "z-oeste", nombre: "Zona Oeste" };
const Z_SUR = { id: "z-sur", nombre: "Zona Sur" };

function nodo(
  id: string,
  nombre: string,
  profundidad: number,
  hijos: NodoDeZonasDTO[] = [],
  extra: Partial<NodoDeZonasDTO> = {},
): NodoDeZonasDTO {
  return { id, nombre, profundidad, activo: true, asignadaA: null, heredaDe: null, hijos, ...extra };
}

//  Región Capital
//    Comuna Escazú → Barrio Centro · Barrio San Rafael (Zona Sur) · Barrio Retirado (inactivo)
//                    Barrio Centro → Sector Uno (profundidad 4)
//    Comuna Mora (Zona Sur) → Barrio Colón (hereda Zona Sur)
const ARBOL: ArbolDeZonasDTO = {
  tipos: [
    { profundidad: 1, nombreSingular: "Región", nombrePlural: "Regiones" },
    { profundidad: 2, nombreSingular: "Comuna", nombrePlural: "Comunas" },
    { profundidad: 3, nombreSingular: "Barrio", nombrePlural: "Barrios" },
    { profundidad: 4, nombreSingular: "Sector", nombrePlural: "Sectores" },
  ],
  raices: [
    nodo("r1", "Capital", 1, [
      nodo("c-esc", "Escazú", 2, [
        nodo("b-centro", "Centro", 3, [nodo("s-uno", "Sector Ñandú", 4)]),
        nodo("b-sr", "San Rafael", 3, [], { asignadaA: Z_SUR }),
        nodo("b-ret", "Retirado", 3, [], { activo: false }),
      ]),
      nodo("c-mora", "Mora", 2, [
        nodo("b-colon", "Colón", 3, [], {
          heredaDe: { zonaId: Z_SUR.id, zonaNombre: Z_SUR.nombre, nodoId: "c-mora", nodoNombre: "Mora" },
        }),
      ], { asignadaA: Z_SUR }),
    ]),
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function casilla(texto: string): Promise<HTMLElement> {
  // Sin `\b`: tras una vocal acentuada no hay límite de palabra en una RegExp sin `u`.
  return screen.findByRole("checkbox", { name: new RegExp(String.raw`^Seleccionar ${texto}(?:$|\s)`) });
}

/** Monta y despliega todo escribiendo en el buscador una letra que llevan todos los nombres visibles. */
async function montar(props: {
  initialSelected?: string[];
  onSelectedChange?: (s: { distritoIds: string[]; nodoIds: string[] }) => void;
  desplegar?: string;
}) {
  const user = userEvent.setup();
  render(
    <GeografiaSelector
      arbol={ARBOL}
      zonaEnEdicionId={Z_EDITADA.id}
      nombreZona={Z_EDITADA.nombre}
      initialSelected={props.initialSelected}
      onSelectedChange={props.onSelectedChange}
    />,
  );
  // Buscar el nombre de la región despliega su rama entera (su texto arrastra a los descendientes).
  await user.type(
    screen.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }),
    props.desplegar ?? "capital",
  );
  return user;
}

/** La fila (el `li` más cercano) de una casilla. */
function filaDe(el: HTMLElement): HTMLElement {
  return el.closest("li") as HTMLElement;
}

describe("R24 — el árbol a todas sus profundidades, con el nombre del tipo de cada nivel", () => {
  it("cada fila dice su nivel con el nombre del DTO y sus hijos con el plural", async () => {
    await montar({});
    expect(await casilla("región Capital")).toBeInTheDocument();
    expect(await casilla("comuna Escazú")).toBeInTheDocument();
    expect(await casilla("barrio Centro")).toBeInTheDocument();
    expect(await casilla("sector Sector Ñandú")).toBeInTheDocument();
    expect(screen.getByText("Comuna · 3 barrios")).toBeInTheDocument();
    expect(screen.getByText("Barrio · 1 sector")).toBeInTheDocument();
  });

  it("nombra la zona y el nodo de los que hereda un nodo de otra zona", async () => {
    await montar({});
    const colon = filaDe(await casilla("barrio Colón"));
    expect(within(colon).getByText("hereda de Zona Sur por Mora")).toBeInTheDocument();
    // Mora está asignada a otra zona: lo dice y su casilla no se puede marcar.
    const mora = await casilla("comuna Mora");
    expect(mora).toHaveAttribute("aria-label", "Seleccionar comuna Mora (zona: Zona Sur)");
    expect(mora).toHaveAttribute("aria-disabled", "true");
    expect(within(filaDe(mora)).getAllByText("En Zona Sur").length).toBeGreaterThan(0);
  });
});

describe("R25 — marcar un nodo asigna ese nodo, no sus descendientes", () => {
  it("marcar la comuna emite la comuna; sus barrios salen heredados, nombrando zona y nodo", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ onSelectedChange });

    await user.click(await casilla("comuna Escazú"));

    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: ["c-esc"] });
    const centro = await casilla("barrio Centro");
    expect(centro).toBeChecked();
    expect(centro).toHaveAttribute("aria-disabled", "true");
    expect(within(filaDe(centro)).getAllByText("hereda de Zona Oeste por Escazú").length).toBeGreaterThan(0);
  });

  it("marcar la comuna quita de la selección los barrios propios que tenía marcados", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ initialSelected: ["b-centro", "s-uno"], onSelectedChange });
    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: ["b-centro"], nodoIds: ["s-uno"] });

    await user.click(await casilla("comuna Escazú"));

    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: ["c-esc"] });
  });

  it("el barrio de otra zona bajo la comuna marcada queda a la vista como excepción", async () => {
    const user = await montar({});
    await user.click(await casilla("comuna Escazú"));

    const sr = await casilla("barrio San Rafael");
    expect(sr).not.toBeChecked();
    expect(sr).toHaveAttribute("aria-disabled", "true");
    expect(within(filaDe(sr)).getByText("Excepción · va a Zona Sur")).toBeInTheDocument();
  });
});

describe("R26 — qué se puede marcar", () => {
  it("un nodo de otra zona no se marca con un clic", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ onSelectedChange });

    await user.click(await casilla("barrio San Rafael"));

    expect(await casilla("barrio San Rafael")).not.toBeChecked();
    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: [] });
  });

  it("bajo un ancestro marcado, el nodo que ya hereda esta zona está deshabilitado", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ initialSelected: ["c-esc"], onSelectedChange });

    const sector = await casilla("sector Sector Ñandú");
    expect(sector).toHaveAttribute("aria-disabled", "true");
    await user.click(sector);
    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: ["c-esc"] });
  });

  it("un nodo que hereda OTRA zona sí se marca: crea una excepción", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ onSelectedChange });

    const colon = await casilla("barrio Colón");
    expect(colon).not.toHaveAttribute("aria-disabled", "true");
    await user.click(colon);

    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: ["b-colon"], nodoIds: [] });
  });

  it("desmarcar el ancestro devuelve la casilla del descendiente", async () => {
    const user = await montar({ initialSelected: ["c-esc"] });
    await user.click(await casilla("comuna Escazú"));
    expect(await casilla("barrio Centro")).not.toHaveAttribute("aria-disabled", "true");
    expect(await casilla("barrio Centro")).not.toBeChecked();
  });
});

describe("R27 — preselección y búsqueda", () => {
  it("preselecciona exactamente lo asignado, el retirado incluido, y lo emite al montar", () => {
    const onSelectedChange = vi.fn();
    render(
      <GeografiaSelector
        arbol={ARBOL}
        zonaEnEdicionId={Z_EDITADA.id}
        initialSelected={["b-ret", "c-esc"]}
        onSelectedChange={onSelectedChange}
      />,
    );
    expect(onSelectedChange).toHaveBeenCalledTimes(1);
    expect(onSelectedChange).toHaveBeenCalledWith({ distritoIds: ["b-ret"], nodoIds: ["c-esc"] });
  });

  it("el retirado se pinta con su distintivo y su casilla responde", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ initialSelected: ["b-ret"], onSelectedChange });
    const ret = await casilla("barrio Retirado");
    expect(ret).toBeChecked();
    expect(within(filaDe(ret)).getByText("Inactivo")).toBeInTheDocument();
    await user.click(ret);
    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: [] });
  });

  it("la búsqueda encuentra un nodo de profundidad 4 sin acentos ni mayúsculas", async () => {
    await montar({ desplegar: "sector   nandu" });
    expect(await casilla("sector Sector Ñandú")).toBeInTheDocument();
    expect(screen.queryByText("San Rafael")).toBeNull();
  });

  it("sin búsqueda, el árbol arranca plegado y se abre con su botón", async () => {
    const user = userEvent.setup();
    render(<GeografiaSelector arbol={ARBOL} zonaEnEdicionId={Z_EDITADA.id} />);
    expect(screen.queryByText("Escazú")).toBeNull();
    const abrir = screen.getByRole("button", { name: "Abrir Capital" });
    expect(abrir).toHaveAttribute("aria-expanded", "false");
    await user.click(abrir);
    expect(screen.getByText("Escazú")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar Capital" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("al crear (sin zona en edición), todo nodo con zona queda bloqueado", () => {
  it("la comuna de otra zona y el barrio de otra zona no se pueden marcar", async () => {
    const user = userEvent.setup();
    render(<GeografiaSelector arbol={ARBOL} />);
    await user.type(screen.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }), "capital");
    expect(await casilla("comuna Mora")).toHaveAttribute("aria-disabled", "true");
    expect(await casilla("barrio San Rafael")).toHaveAttribute("aria-disabled", "true");
    expect(await casilla("barrio Centro")).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("R24 (review SLT-89 vuelta 1, m1) — el porqué del estado llega al lector de pantalla", () => {
  it("la casilla describe la herencia y la excepción con el texto de su fila", async () => {
    const user = await montar({});
    await user.click(await casilla("comuna Escazú"));

    expect(await casilla("barrio Centro")).toHaveAccessibleDescription("hereda de Zona Oeste por Escazú");
    expect(await casilla("barrio San Rafael")).toHaveAccessibleDescription("Excepción · va a Zona Sur");
    expect(await casilla("barrio Colón")).toHaveAccessibleDescription("hereda de Zona Sur por Mora");
    // Lo elegido no lleva descripción: no hay nada que explicar.
    expect(await casilla("comuna Escazú")).not.toHaveAttribute("aria-describedby");
  });
});
