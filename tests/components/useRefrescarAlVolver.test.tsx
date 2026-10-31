// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { useRefrescarAlVolver } from "@/hooks/useRefrescarAlVolver";

// SLT-69 (R7/R8) — releer al volver a la pantalla, sin martillar al servidor: un regreso que
// dispara `visibilitychange` y `focus` cuenta como UNA relectura, hay 30 s de intervalo mínimo, y
// ni una pantalla oculta ni una desmontada relee.

function fijarVisibilidad(estado: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => estado,
  });
}

function volverVisible() {
  fijarVisibilidad("visible");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function recuperarFoco() {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

function avanzar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  fijarVisibilidad("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fijarVisibilidad("visible");
});

describe("useRefrescarAlVolver — intervalo mínimo (R7)", () => {
  it("un foco inmediato tras montar no relee: la página acaba de leer del servidor", () => {
    const alVolver = vi.fn();
    renderHook(() => useRefrescarAlVolver(alVolver));

    recuperarFoco();

    expect(alVolver).not.toHaveBeenCalled();
  });

  it("visibilidad + foco seguidos cuentan como UNA relectura; a los 29 s no relee; a los 30 s sí", () => {
    const alVolver = vi.fn();
    renderHook(() => useRefrescarAlVolver(alVolver));

    avanzar(30_000);
    volverVisible();
    recuperarFoco();
    expect(alVolver).toHaveBeenCalledTimes(1);

    avanzar(29_000);
    volverVisible();
    expect(alVolver).toHaveBeenCalledTimes(1);

    avanzar(1_000);
    recuperarFoco();
    expect(alVolver).toHaveBeenCalledTimes(2);
  });
});

describe("useRefrescarAlVolver — oculta o desmontada no relee (R8)", () => {
  it("un `visibilitychange` que deja la pantalla OCULTA no relee", () => {
    const alVolver = vi.fn();
    renderHook(() => useRefrescarAlVolver(alVolver));

    avanzar(60_000);
    fijarVisibilidad("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(alVolver).toHaveBeenCalledTimes(0);
  });

  it("tras desmontar, ni el foco ni la visibilidad releen", () => {
    const alVolver = vi.fn();
    const { unmount } = renderHook(() => useRefrescarAlVolver(alVolver));

    unmount();
    avanzar(60_000);
    recuperarFoco();
    volverVisible();

    expect(alVolver).toHaveBeenCalledTimes(0);
  });
});
