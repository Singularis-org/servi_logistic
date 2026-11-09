// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { AVISO_SIN_PREFIJO, PrefijoTelefonico } from "@/components/shared/PrefijoTelefonico";
import { useTelefonoDelPais } from "@/hooks/use-telefono-del-pais";
import { telefonoDelPais } from "@/lib/types/pais";
import { PaisDeLaEmpresaProvider } from "@/providers/PaisDeLaEmpresaProvider";

// SLT-81 (design §7.1; R18, R23) — el adorno del prefijo, el hook que lo lee del portal y la regla
// que decide cuándo un país no tiene teléfono cargado.

afterEach(cleanup);

const PANAMA = { paisNombre: "Panamá", prefijo: "507", digitosNacionales: 8 };

describe("PrefijoTelefonico", () => {
  it("con prefijo, pinta +<prefijo> delante del teléfono y ningún aviso", () => {
    render(
      <PrefijoTelefonico prefijo="507">
        <input aria-label="Teléfono" />
      </PrefijoTelefonico>,
    );
    expect(screen.getByText("+507")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Teléfono" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("R23: sin prefijo, el teléfono va solo con el aviso y no se pinta ningún prefijo", () => {
    const { container } = render(
      <PrefijoTelefonico prefijo={null}>
        <input aria-label="Teléfono" />
      </PrefijoTelefonico>,
    );
    expect(screen.getByRole("note")).toHaveTextContent(AVISO_SIN_PREFIJO);
    expect(screen.getByRole("textbox", { name: "Teléfono" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\+\d/);
    expect(screen.queryByTestId("prefijo-telefonico")).not.toBeInTheDocument();
  });

  it("el aviso de R23 se puede reemplazar (i18n)", () => {
    render(
      <PrefijoTelefonico prefijo={null} avisoSinPrefijo="No phone prefix">
        <input aria-label="Teléfono" />
      </PrefijoTelefonico>,
    );
    expect(screen.getByRole("note")).toHaveTextContent("No phone prefix");
  });
});

describe("useTelefonoDelPais", () => {
  it("lee el teléfono del país que baja el proveedor", () => {
    const envoltorio = ({ children }: { children: ReactNode }) => (
      <PaisDeLaEmpresaProvider telefono={PANAMA}>{children}</PaisDeLaEmpresaProvider>
    );
    const { result } = renderHook(() => useTelefonoDelPais(), { wrapper: envoltorio });
    expect(result.current).toEqual(PANAMA);
  });

  it("R23: sin proveedor es null, no el prefijo de un país por defecto", () => {
    const { result } = renderHook(() => useTelefonoDelPais());
    expect(result.current).toBeNull();
  });
});

describe("telefonoDelPais (R23)", () => {
  it("con prefijo y dígitos da la regla del país", () => {
    expect(telefonoDelPais({ nombre: "Panamá", prefijoTelefonico: "507", telefonoDigitosNacionales: 8 })).toEqual(
      PANAMA,
    );
  });

  it("sin prefijo o sin dígitos es null", () => {
    expect(telefonoDelPais({ nombre: "Panamá", prefijoTelefonico: null, telefonoDigitosNacionales: 8 })).toBeNull();
    expect(telefonoDelPais({ nombre: "Panamá", prefijoTelefonico: "507", telefonoDigitosNacionales: null })).toBeNull();
  });
});
