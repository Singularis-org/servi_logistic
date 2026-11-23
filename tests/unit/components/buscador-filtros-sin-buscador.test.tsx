// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.1, S3-4, R84) — la prop ADITIVA `buscador`
// de `BuscadorFiltros`. Sin ella la barra es la de siempre (campo de búsqueda + su línea de aviso);
// con `false` no monta ni el campo ni el aviso y pinta sus `children`. La lista de gestiones del
// cierre la monta así, con `leerDeUrl={false}`: no puede tocar la URL de `/cierres-admin`.

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams("cierre=abc&q=guia"),
}));

import { olvidarParamsBorrados } from "@/hooks/useFiltrosUrl";
import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";

beforeEach(() => {
  replaceMock.mockClear();
  pushMock.mockClear();
  olvidarParamsBorrados();
});
afterEach(cleanup);

describe("SLT-101 — `buscador` en `BuscadorFiltros`", () => {
  it("sin la prop: el campo de búsqueda y su línea de aviso, como siempre", () => {
    render(<BuscadorFiltros onChange={vi.fn()} leerDeUrl={false} />);
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("con `false`: ni campo ni aviso, y los `children` se pintan", () => {
    render(
      <BuscadorFiltros onChange={vi.fn()} leerDeUrl={false} buscador={false}>
        <button type="button">Hijo</button>
      </BuscadorFiltros>,
    );
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Hijo" })).toBeInTheDocument();
  });

  it("con `false` y filtros aplicados, «Limpiar todo» depende solo de `hayFiltrosAplicados`", async () => {
    const onLimpiarTodo = vi.fn();
    const { rerender } = render(
      <BuscadorFiltros onChange={vi.fn()} leerDeUrl={false} buscador={false} onLimpiarTodo={onLimpiarTodo} />,
    );
    expect(screen.queryByRole("button", { name: "Limpiar todo" })).toBeNull();
    rerender(
      <BuscadorFiltros
        onChange={vi.fn()}
        leerDeUrl={false}
        buscador={false}
        onLimpiarTodo={onLimpiarTodo}
        hayFiltrosAplicados
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Limpiar todo" }));
    expect(onLimpiarTodo).toHaveBeenCalledTimes(1);
  });

  it("con `leerDeUrl={false}`: no emite lo que trae la URL ni navega al montar", () => {
    const onChange = vi.fn();
    render(<BuscadorFiltros onChange={onChange} leerDeUrl={false} buscador={false} />);
    expect(onChange).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
