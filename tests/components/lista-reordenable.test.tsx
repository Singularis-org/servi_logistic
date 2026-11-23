// @vitest-environment jsdom
// R53: reordenar por la manija; con la manija enfocada, las flechas mueven una posición.
// El arrastre de @dnd-kit no se prueba aquí: jsdom no tiene layout (todas las cajas miden 0) y
// simularlo exigiría trucos frágiles; queda para el E2E/ensayo manual.
import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { ListaReordenable } from "@/app/(app)/plataforma/geografia/_components/ListaReordenable";

afterEach(() => cleanup());

interface Tipo {
  id: string;
  nombre: string;
}

const TIPOS: Tipo[] = [
  { id: "a", nombre: "Provincia" },
  { id: "b", nombre: "Cantón" },
  { id: "c", nombre: "Distrito" },
];

function Envoltorio({
  onReordenar,
  deshabilitado,
}: {
  onReordenar: (lista: Tipo[]) => void;
  deshabilitado?: boolean;
}) {
  const [lista, setLista] = useState(TIPOS);
  return (
    <ListaReordenable
      elementos={lista}
      nombreDe={(t) => t.nombre}
      pintarFila={(t) => <span>{t.nombre}</span>}
      onReordenar={(nueva) => {
        onReordenar(nueva);
        setLista(nueva);
      }}
      deshabilitado={deshabilitado}
      etiqueta="Tipos de nivel"
    />
  );
}

const manija = (nombre: string, k: number) =>
  screen.getByRole("button", { name: `Mover ${nombre}, posición ${k} de 3` });

describe("ListaReordenable (R53)", () => {
  it("pinta cada fila con una manija cuyo nombre dice su posición", () => {
    render(<Envoltorio onReordenar={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(manija("Provincia", 1)).toBeTruthy();
    expect(manija("Cantón", 2)).toBeTruthy();
    expect(manija("Distrito", 3)).toBeTruthy();
  });

  it("no muestra botones de subir o bajar: los únicos botones son las manijas", () => {
    render(<Envoltorio onReordenar={vi.fn()} />);
    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(3);
    for (const b of botones) {
      expect(b.getAttribute("aria-label")).toMatch(/^Mover /);
      expect(b.getAttribute("type")).toBe("button");
    }
    expect(screen.queryByRole("button", { name: /subir|bajar/i })).toBeNull();
  });

  it("ArrowDown en la manija de la fila 1 la lleva a la posición 2 y el foco sigue en su manija", () => {
    const onReordenar = vi.fn();
    render(<Envoltorio onReordenar={onReordenar} />);
    const m = manija("Provincia", 1);
    m.focus();
    fireEvent.keyDown(m, { key: "ArrowDown" });

    expect(onReordenar).toHaveBeenCalledTimes(1);
    expect(onReordenar.mock.calls[0][0].map((t: Tipo) => t.id)).toEqual(["b", "a", "c"]);
    const movida = manija("Provincia", 2);
    expect(document.activeElement).toBe(movida);
    expect(screen.getAllByRole("listitem")[1].textContent).toContain("Provincia");
  });

  it("ArrowUp en la fila 2 la sube a la posición 1", () => {
    const onReordenar = vi.fn();
    render(<Envoltorio onReordenar={onReordenar} />);
    const m = manija("Cantón", 2);
    m.focus();
    fireEvent.keyDown(m, { key: "ArrowUp" });
    expect(onReordenar.mock.calls[0][0].map((t: Tipo) => t.id)).toEqual(["b", "a", "c"]);
    expect(document.activeElement).toBe(manija("Cantón", 1));
  });

  it("anuncia la posición nueva en una región aria-live", () => {
    render(<Envoltorio onReordenar={vi.fn()} />);
    // dnd-kit pinta su propia región (assertive, vacía porque se le quitan los anuncios en inglés).
    const vivo = screen
      .getAllByRole("status")
      .find((el) => el.getAttribute("aria-live") === "polite");
    if (!vivo) throw new Error("falta la región aria-live polite");
    fireEvent.keyDown(manija("Provincia", 1), { key: "ArrowDown" });
    expect(vivo.textContent).toBe("Provincia: posición 2 de 3");
  });

  it("ArrowUp en la primera fila no emite nada", () => {
    const onReordenar = vi.fn();
    render(<Envoltorio onReordenar={onReordenar} />);
    fireEvent.keyDown(manija("Provincia", 1), { key: "ArrowUp" });
    expect(onReordenar).not.toHaveBeenCalled();
  });

  it("ArrowDown en la última fila no emite nada (no envuelve)", () => {
    const onReordenar = vi.fn();
    render(<Envoltorio onReordenar={onReordenar} />);
    fireEvent.keyDown(manija("Distrito", 3), { key: "ArrowDown" });
    expect(onReordenar).not.toHaveBeenCalled();
  });

  it("deshabilitado: las flechas no emiten nada", () => {
    const onReordenar = vi.fn();
    render(<Envoltorio onReordenar={onReordenar} deshabilitado />);
    const m = manija("Provincia", 1);
    expect(m.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(m, { key: "ArrowDown" });
    expect(onReordenar).not.toHaveBeenCalled();
  });

  it("la manija tiene objetivo táctil de 44px, sin gestos del navegador y con foco visible", () => {
    render(<Envoltorio onReordenar={vi.fn()} />);
    const clase = manija("Provincia", 1).className;
    expect(clase).toContain("size-11");
    expect(clase).toContain("touch-none");
    expect(clase).toContain("focus-visible:ring-3");
  });
});
