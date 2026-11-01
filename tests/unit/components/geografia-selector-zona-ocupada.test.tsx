// @vitest-environment jsdom
// SLT-75 (R15-R18) — UN DISTRITO QUE YA ESTÁ EN OTRA ZONA NO SE PUEDE ELEGIR.
//
// La base impide que un distrito quede en dos zonas de la misma empresa, y el servidor rechaza el
// guardado que lo intente. El selector no debe ofrecerlo: la casilla del distrito se deshabilita y
// dice en qué zona está, y las casillas de cantón y provincia trabajan solo con los seleccionables.
//
// Datos sintéticos: ningún nombre sale de producción.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GeografiaSelector } from "@/app/(app)/configuracion/zonas/_components/GeografiaSelector";
import type { DistritoArbolDTO, ProvinciaArbolDTO } from "@/lib/types/geografia-nodo";

const Z_EDITADA = { id: "z-editada", nombre: "Zona Editada" };
const Z_OTRA = { id: "z-otra", nombre: "Zona Otra" };

function distrito(
  id: string,
  nombre: string,
  zonas: { id: string; nombre: string }[],
): DistritoArbolDTO {
  const unica = zonas.length === 1 ? zonas[0] : null;
  return {
    id,
    nombre,
    zonaId: unica?.id ?? null,
    zonaNombre: unica?.nombre ?? null,
    zonas,
    zonaEspecial: false,
    activo: true,
  };
}

//  Provincia Prueba
//    Alfa → Libre Uno (sin zona) · Propio Uno (Zona Editada) · Ocupado Uno (Zona Otra)
//    Beta → Ocupado Dos (Zona Otra)   ← sin ningún seleccionable
const ARBOL: ProvinciaArbolDTO[] = [
  {
    id: "p1",
    nombre: "Provincia Prueba",
    activo: true,
    cantones: [
      {
        id: "c-alfa",
        nombre: "Alfa",
        activo: true,
        distritos: [
          distrito("d-libre", "Libre Uno", []),
          distrito("d-propio", "Propio Uno", [Z_EDITADA]),
          distrito("d-ocupado", "Ocupado Uno", [Z_OTRA]),
        ],
      },
      {
        id: "c-beta",
        nombre: "Beta",
        activo: true,
        distritos: [distrito("d-ocupado-2", "Ocupado Dos", [Z_OTRA])],
      },
    ],
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** La casilla de un distrito, por prefijo del nombre accesible (el `label` añade el texto de la fila). */
function casillaDistrito(nombre: string): Promise<HTMLElement> {
  return screen.findByRole("checkbox", {
    name: new RegExp(String.raw`^Seleccionar distrito ${nombre}\b`),
  });
}

function casillaGrupo(nombre: string): HTMLElement {
  return screen.getByRole("checkbox", { name: `Seleccionar todos los distritos de ${nombre}` });
}

/** Monta el selector y despliega el árbol: todos los distritos llevan una «o». */
async function montar(props: {
  zonaEnEdicionId?: string;
  initialSelected?: string[];
  onSelectedChange?: (ids: string[]) => void;
}) {
  const user = userEvent.setup();
  render(<GeografiaSelector provincias={ARBOL} {...props} />);
  await user.type(
    screen.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }),
    "o",
  );
  return user;
}

describe("R15 — distrito con otra zona: casilla deshabilitada y «(zona: X)»", () => {
  it("al editar, el de otra zona sale deshabilitado, con su zona en la fila y en el aria-label", async () => {
    await montar({ zonaEnEdicionId: Z_EDITADA.id });

    const ocupado = await casillaDistrito("Ocupado Uno");
    expect(ocupado).toHaveAttribute("aria-disabled", "true");
    expect(ocupado).toHaveAttribute(
      "aria-label",
      "Seleccionar distrito Ocupado Uno (zona: Zona Otra)",
    );
    expect(screen.getAllByText("(zona: Zona Otra)").length).toBeGreaterThan(0);
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
    expect(onSelectedChange).toHaveBeenLastCalledWith([]);
  });
});

describe("R16 — la cascada del cantón solo toca los seleccionables", () => {
  it("marcar el cantón no marca el bloqueado; desmarcar tampoco lo toca", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ zonaEnEdicionId: Z_EDITADA.id, onSelectedChange });

    await user.click(casillaGrupo("Alfa"));
    expect([...onSelectedChange.mock.lastCall![0]].sort()).toEqual(["d-libre", "d-propio"]);
    expect(await casillaDistrito("Ocupado Uno")).not.toBeChecked();

    await user.click(casillaGrupo("Alfa"));
    expect(onSelectedChange).toHaveBeenLastCalledWith([]);
  });

  it("desmarcar el cantón deja intacto un bloqueado que venía marcado", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({
      zonaEnEdicionId: Z_EDITADA.id,
      initialSelected: ["d-libre", "d-propio", "d-ocupado"],
      onSelectedChange,
    });

    await user.click(casillaGrupo("Alfa"));

    expect(onSelectedChange).toHaveBeenLastCalledWith(["d-ocupado"]);
  });

  it("marcar la provincia tampoco marca los bloqueados", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({ zonaEnEdicionId: Z_EDITADA.id, onSelectedChange });

    await user.click(casillaGrupo("Provincia Prueba"));

    expect([...onSelectedChange.mock.lastCall![0]].sort()).toEqual(["d-libre", "d-propio"]);
  });
});

describe("R17 — el estado del grupo se calcula sobre los seleccionables", () => {
  it("cantón con todos sus seleccionables marcados sale `checked`, no indeterminado", async () => {
    await montar({ zonaEnEdicionId: Z_EDITADA.id, initialSelected: ["d-libre", "d-propio"] });

    const alfa = casillaGrupo("Alfa");
    expect(alfa).toBeChecked();
    expect(alfa).not.toBePartiallyChecked();
  });

  it("cantón sin seleccionables: deshabilitado (y su provincia, que sí tiene, no)", async () => {
    await montar({ zonaEnEdicionId: Z_EDITADA.id });

    expect(casillaGrupo("Beta")).toHaveAttribute("aria-disabled", "true");
    expect(casillaGrupo("Alfa")).not.toHaveAttribute("aria-disabled", "true");
    expect(casillaGrupo("Provincia Prueba")).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("R18 — la zona que se edita conserva sus distritos operables", () => {
  it("con `zonaEnEdicionId`, el distrito de esa zona es marcable y desmarcable y dice su zona", async () => {
    const onSelectedChange = vi.fn();
    const user = await montar({
      zonaEnEdicionId: Z_EDITADA.id,
      initialSelected: ["d-propio"],
      onSelectedChange,
    });

    const propio = await casillaDistrito("Propio Uno");
    expect(propio).not.toHaveAttribute("aria-disabled", "true");
    expect(propio).toBeChecked();
    expect(screen.getByText("(zona: Zona Editada)")).toBeInTheDocument();

    await user.click(propio);
    expect(onSelectedChange).toHaveBeenLastCalledWith([]);

    await user.click(propio);
    expect(onSelectedChange).toHaveBeenLastCalledWith(["d-propio"]);
  });
});
