// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// SLT-160 «Buscar escaneando en los listados» — la prop `escaneo` de `BuscadorFiltros`: Enter busca
// en el acto (una guía queda como el número), el texto queda seleccionado y la siguiente lectura lo
// sustituye (R601-R603); sin Enter, la barra de siempre (R609).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ordenes",
  useSearchParams: () => new URLSearchParams(""),
}));

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";

function montar(props: { minChars?: number; escaneo?: boolean } = {}) {
  const onChange = vi.fn();
  render(
    <BuscadorFiltros
      onChange={onChange}
      leerDeUrl={false}
      escaneo={props.escaneo ?? true}
      minChars={props.minChars}
    />,
  );
  const campo = screen.getByRole("searchbox", { name: "Buscar" }) as HTMLInputElement;
  return { onChange, campo };
}

function pulsarEnter(campo: HTMLInputElement) {
  fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SLT-160 — Enter en el buscador con `escaneo`", () => {
  it("R601 — la URL del QR + Enter: el campo vale el número y se busca sin esperar el debounce", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "https://app.ejemplo.test/paquete/1024" } });
    pulsarEnter(campo);

    expect(campo.value).toBe("1024");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("1024");

    // El debounce que había quedado en vuelo con la URL ya no llega.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("R601 — `#1024` con relleno de pistola en los extremos: queda `1024`", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: " #1024\r" } });
    pulsarEnter(campo);

    expect(campo.value).toBe("1024");
    expect(onChange).toHaveBeenCalledWith("1024");
  });

  it("R602 — un texto que no es guía se busca tal cual en el acto", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "Ana Pérez" } });
    pulsarEnter(campo);

    expect(campo.value).toBe("Ana Pérez");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Ana Pérez");
  });

  it("R602 — por debajo de `minChars` Enter no busca", () => {
    const { onChange, campo } = montar({ minChars: 3 });
    fireEvent.change(campo, { target: { value: "ab" } });
    pulsarEnter(campo);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onChange).not.toHaveBeenCalledWith("ab");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("R603 — tras Enter el texto queda seleccionado entero", () => {
    const { campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });
    pulsarEnter(campo);

    expect(campo.selectionStart).toBe(0);
    expect(campo.selectionEnd).toBe("1024".length);
  });

  it("R603 — la segunda lectura sustituye a la primera, nunca se le añade", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { onChange, campo } = montar();

    await user.click(campo);
    await user.keyboard("1024{Enter}");
    expect(campo.value).toBe("1024");

    await user.keyboard("2048{Enter}");
    expect(campo.value).toBe("2048");
    expect(campo.value).not.toBe("10242048");
    expect(onChange).toHaveBeenLastCalledWith("2048");
    expect(onChange).not.toHaveBeenCalledWith("10242048");
  });

  it("R603 — Enter repetido sobre el mismo término no vuelve a emitir", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });
    pulsarEnter(campo);
    pulsarEnter(campo);

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-160 — R609: sin Enter, la barra de siempre", () => {
  it("escribir sin Enter emite solo pasados los 500 ms", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledWith("1024");
  });

  it("sin `escaneo`, Enter no adelanta la búsqueda ni toca el texto", () => {
    const { onChange, campo } = montar({ escaneo: false });
    fireEvent.change(campo, { target: { value: "#1024" } });
    pulsarEnter(campo);

    expect(onChange).not.toHaveBeenCalled();
    expect(campo.value).toBe("#1024");
  });

  it("la «X» limpia el campo como siempre", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar Buscar" }));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(campo.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
