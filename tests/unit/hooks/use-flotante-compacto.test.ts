// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { siguienteCompacto, useFlotanteCompacto } from "@/hooks/use-flotante-compacto";

// SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (A5; R497, R498) — cuándo se achican
// los botones flotantes. Umbral de 8 px escrito a mano (design.md §6), no leído de la constante.

describe("R497, R498 — `siguienteCompacto`", () => {
  it("bajar 9 px → reducido", () => {
    expect(siguienteCompacto(false, 100, 109)).toBe(true);
  });

  it("subir 9 px → tamaño de hoy", () => {
    expect(siguienteCompacto(true, 109, 100)).toBe(false);
  });

  it("arriba del todo (`scrollY` 0) → tamaño de hoy, venga de donde venga", () => {
    expect(siguienteCompacto(true, 0, 0)).toBe(false);
    expect(siguienteCompacto(true, 400, 0)).toBe(false);
  });

  it("5 px en cualquier sentido no cambia el estado", () => {
    expect(siguienteCompacto(false, 100, 105)).toBe(false);
    expect(siguienteCompacto(true, 100, 105)).toBe(true);
    expect(siguienteCompacto(true, 100, 95)).toBe(true);
    expect(siguienteCompacto(false, 100, 95)).toBe(false);
  });

  it("8 px justos tampoco: hace falta MÁS de 8", () => {
    expect(siguienteCompacto(false, 100, 108)).toBe(false);
    expect(siguienteCompacto(true, 108, 100)).toBe(true);
  });
});

describe("R497, R498 — `useFlotanteCompacto` con el scroll de la ventana", () => {
  let y = 0;

  beforeEach(() => {
    y = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
    // Un fotograma = ya: el hook mide en `requestAnimationFrame`.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function desplazarA(nuevaY: number) {
    y = nuevaY;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
  }

  it("arranca en `false`; al bajar se reduce; al subir desde donde dio la vuelta, vuelve", () => {
    const { result } = renderHook(() => useFlotanteCompacto());
    expect(result.current).toBe(false);

    desplazarA(300);
    expect(result.current).toBe(true);

    // Sigue bajando: la referencia acompaña al punto más bajo.
    desplazarA(600);
    expect(result.current).toBe(true);

    // 5 px hacia arriba desde el punto más bajo: no cambia.
    desplazarA(595);
    expect(result.current).toBe(true);

    // 9 px hacia arriba desde 600 (no desde 300): vuelve al tamaño de hoy.
    desplazarA(591);
    expect(result.current).toBe(false);
  });

  it("al volver arriba del todo, tamaño de hoy", () => {
    const { result } = renderHook(() => useFlotanteCompacto());
    desplazarA(50);
    expect(result.current).toBe(true);
    desplazarA(0);
    expect(result.current).toBe(false);
  });
});
