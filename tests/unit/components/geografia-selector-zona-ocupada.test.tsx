// @vitest-environment jsdom
// SLT-75 (R15-R18) — UN DISTRITO QUE YA ESTÁ EN OTRA ZONA NO SE PUEDE ELEGIR.
//
// La base impide que un distrito quede en dos zonas de la misma empresa, y el servidor rechaza el
// guardado que lo intente. El selector no debe ofrecerlo: la casilla del distrito se deshabilita y
// dice en qué zona está.
//
// SLT-89 (T7.1, design §8.1 y §11.3): la entrada pasa a ser el árbol de N niveles y la cascada del
// cantón (R16/R17 de SLT-75) se retira: marcar el cantón asigna EL CANTÓN y sus distritos lo heredan;
// el de otra zona queda como excepción, sin marcarse. Lo que R16 protegía —que el bloqueado no entre
// en la zona— sigue afirmado.
//
// Datos sintéticos: ningún nombre sale de producción.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GeografiaSelector } from "@/app/(app)/configuracion/zonas/_components/GeografiaSelector";
import type { ArbolDeZonasDTO, NodoDeZonasDTO } from "@/lib/types/geografia-nodo";

const Z_EDITADA = { id: "z-editada", nombre: "Zona Editada" };
const Z_OTRA = { id: "z-otra", nombre: "Zona Otra" };

function distrito(id: string, nombre: string, zona: { id: string; nombre: string } | null): NodoDeZonasDTO {
  return { id, nombre, profundidad: 3, activo: true, asignadaA: zona, heredaDe: null, hijos: [] };
}

function grupo(id: string, nombre: string, profundidad: number, hijos: NodoDeZonasDTO[]): NodoDeZonasDTO {
  return { id, nombre, profundidad, activo: true, asignadaA: null, heredaDe: null, hijos };
}

//  Provincia Prueba
//    Alfa → Libre Uno (sin zona) · Propio Uno (Zona Editada) · Ocupado Uno (Zona Otra)
//    Beta → Ocupado Dos (Zona Otra)
const ARBOL: ArbolDeZonasDTO = {
  tipos: [
    { profundidad: 1, nombreSingular: "Provincia", nombrePlural: "Provincias" },
    { profundidad: 2, nombreSingular: "Cantón", nombrePlural: "Cantones" },
    { profundidad: 3, nombreSingular: "Distrito", nombrePlural: "Distritos" },
  ],
  raices: [
    grupo("p1", "Provincia Prueba", 1, [
      grupo("c-alfa", "Alfa", 2, [
        distrito("d-libre", "Libre Uno", null),
        distrito("d-propio", "Propio Uno", Z_EDITADA),
        distrito("d-ocupado", "Ocupado Uno", Z_OTRA),
      ]),
      grupo("c-beta", "Beta", 2, [distrito("d-ocupado-2", "Ocupado Dos", Z_OTRA)]),
    ]),
  ],
};

const NADA = { distritoIds: [], nodoIds: [] };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** La casilla de un distrito, por prefijo del nombre accesible. */
function casillaDistrito(nombre: string): Promise<HTMLElement> {
  return screen.findByRole("checkbox", {
    name: new RegExp(String.raw`^Seleccionar distrito ${nombre}\b`),
  });
}

/**
 * SLT-89 (R25): el cantón y la provincia tienen su propia casilla; ya no son una cascada. Por prefijo,
 * como la del distrito: ahora también la envuelve el `label` de su fila.
 */
function casillaGrupo(nivel: "cantón" | "provincia", nombre: string): HTMLElement {
  return screen.getByRole("checkbox", { name: new RegExp(`^Seleccionar ${nivel} ${nombre} `) });
}

/** Monta el selector y despliega el árbol: todos los distritos llevan una «o». */
async function montar(props: {
  zonaEnEdicionId?: string;
  initialSelected?: string[];
  onSelectedChange?: (s: { distritoIds: string[]; nodoIds: string[] }) => void;
}) {
  const user = userEvent.setup();
  render(<GeografiaSelector arbol={ARBOL} {...props} />);
  await user.type(
    screen.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }),
    "o",
  );
  return user;
}

describe("R15 — distrito con otra zona: casilla deshabilitada y su zona a la vista", () => {
  it("al editar, el de otra zona sale deshabilitado, con su zona en la fila y en el aria-label", async () => {
    await montar({ zonaEnEdicionId: Z_EDITADA.id });

    const ocupado = await casillaDistrito("Ocupado Uno");
    expect(ocupado).toHaveAttribute("aria-disabled", "true");
    expect(ocupado).toHaveAttribute(
      "aria-label",
      "Seleccionar distrito Ocupado Uno (zona: Zona Otra)",
    );
    // SLT-89 (maqueta aprobada): la fila dice «En <zona>»; el aria-label conserva «(zona: X)».
    expect(screen.getAllByText("En Zona Otra").length).toBeGreaterThan(0);
    // Control: el libre sigue operable.
    expect(await casillaDistrito("Libre Uno")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("al crear (sin zona en edición), todo distrito con zona queda bloqueado", async () => {
    await montar({});

    expect(await casillaDistrito("Propio Uno")).toHaveAttribute("aria-disabled", "true");
    expect(await casillaDistrito("Ocupado Uno")).toHaveAttribute("aria-disabled", "true");
    expect(await casillaDistrito("Libre Uno")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("un clic en el bloqueado no lo marca", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ zonaEnEdicionId: Z_EDITADA.id, onSelectedChange });

    await user.click(await casillaDistrito("Ocupado Uno"));

    expect(await casillaDistrito("Ocupado Uno")).not.toBeChecked();
    expect(onSelectedChange).toHaveBeenLastCalledWith(NADA);
  });
});

describe("R16 — marcar el cantón no mete en la zona al distrito de otra zona", () => {
  it("marcar el cantón emite el cantón; el bloqueado queda sin marcar, como excepción", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ zonaEnEdicionId: Z_EDITADA.id, onSelectedChange });

    await user.click(casillaGrupo("cantón", "Alfa"));
    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: ["c-alfa"] });
    expect(await casillaDistrito("Ocupado Uno")).not.toBeChecked();
    expect(screen.getByText("Excepción · va a Zona Otra")).toBeInTheDocument();

    await user.click(casillaGrupo("cantón", "Alfa"));
    expect(onSelectedChange).toHaveBeenLastCalledWith(NADA);
  });

  it("marcar el cantón quita los distritos propios marcados (pasan a heredarlo)", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({
      zonaEnEdicionId: Z_EDITADA.id,
      initialSelected: ["d-libre", "d-propio"],
      onSelectedChange,
    });

    await user.click(casillaGrupo("cantón", "Alfa"));

    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: ["c-alfa"] });
  });

  it("marcar la provincia tampoco marca los bloqueados", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ zonaEnEdicionId: Z_EDITADA.id, onSelectedChange });

    await user.click(casillaGrupo("provincia", "Provincia Prueba"));

    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: [], nodoIds: ["p1"] });
    expect(await casillaDistrito("Ocupado Uno")).not.toBeChecked();
    expect(await casillaDistrito("Ocupado Dos")).not.toBeChecked();
  });
});

describe("R17 — bajo un ancestro marcado, lo heredado no se marca suelto", () => {
  it("con el cantón marcado, sus distritos libres salen marcados y deshabilitados", async () => {
    await montar({ zonaEnEdicionId: Z_EDITADA.id, initialSelected: ["c-alfa"] });

    const libre = await casillaDistrito("Libre Uno");
    expect(libre).toBeChecked();
    expect(libre).toHaveAttribute("aria-disabled", "true");
  });

  it("un cantón cuyos distritos son todos de otra zona sigue siendo marcable", async () => {
    await montar({ zonaEnEdicionId: Z_EDITADA.id });

    expect(casillaGrupo("cantón", "Beta")).not.toHaveAttribute("aria-disabled", "true");
    expect(casillaGrupo("cantón", "Alfa")).not.toHaveAttribute("aria-disabled", "true");
    expect(casillaGrupo("provincia", "Provincia Prueba")).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("R18 — la zona que se edita conserva sus distritos operables", () => {
  it("con `zonaEnEdicionId`, el distrito de esa zona es marcable y desmarcable", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({
      zonaEnEdicionId: Z_EDITADA.id,
      initialSelected: ["d-propio"],
      onSelectedChange,
    });

    const propio = await casillaDistrito("Propio Uno");
    expect(propio).not.toHaveAttribute("aria-disabled", "true");
    expect(propio).toBeChecked();
    // SLT-89: el de la zona que se edita es «elegido»; no se rotula con su propia zona.
    expect(propio).toHaveAttribute("aria-label", "Seleccionar distrito Propio Uno");

    await user.click(propio);
    expect(onSelectedChange).toHaveBeenLastCalledWith(NADA);

    await user.click(propio);
    expect(onSelectedChange).toHaveBeenLastCalledWith({ distritoIds: ["d-propio"], nodoIds: [] });
  });
});
