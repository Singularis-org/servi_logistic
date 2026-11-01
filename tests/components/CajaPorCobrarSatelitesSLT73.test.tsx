// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

import { CajaResumenCard } from "@/app/(app)/wallet/_components/CajaResumenCard";
import type { CajaResumenDTO } from "@/lib/types/wallet";

/**
 * SLT-73 (D12–D14, design §2.9.8, R28) — el bloque «Por cobrar a satélites» de la tarjeta de la caja.
 *
 * Lo que esta suite impide:
 *
 *  - que el bloque se pinte DENTRO del de la empresa: Carlos dijo que ese dinero no es de la empresa;
 *  - que se oculte con importe cero (D14: se muestra siempre, en los dos estados);
 *  - que la pista la elija el navegador comparando importes en vez del signo del servidor.
 *
 * Los textos esperados van escritos a mano, leyendo lo pintado, no importados de las etiquetas.
 */
const RESUMEN: CajaResumenDTO = {
  entradas: "15000.00",
  salidas: "3000.00",
  enCaja: "12000.00",
  signoEnCaja: "positivo",
  ingresosPropios: "5000.00",
  egresosPropios: "3000.00",
  ganancia: "2000.00",
  signoGanancia: "positivo",
  deTerceros: "10000.00",
  periodoFiltrado: false,
  porcentajeTiendas: "83.33",
  modoComposicion: "dos_bolsillos",
  capital: "0.00",
  signoCapital: "cero",
  deEmpresa: "2000.00",
  signoDeTerceros: "positivo",
  deTercerosAbsoluto: "10000.00",
  estado: "saldo",
  flujoDesde: "2026-08-25",
  iva: "0.00",
  signoIva: "cero",
  porCobrarSatelites: "0.00",
  signoPorCobrarSatelites: "cero",
  porcentajePorCobrarSatelites: "0.00",
  deEmpresaEnCaja: "2000.00",
};

const PISTA_POSITIVA = "Lo que las satélites entregaron de menos al conciliar y aún no han pagado.";
const PISTA_NEGATIVA = "La central les debe a las satélites.";

function pintar(overrides: Partial<CajaResumenDTO> = {}) {
  return render(<CajaResumenCard resumen={{ ...RESUMEN, ...overrides }} />);
}

/** El bloque, leído por su nombre accesible. */
function bloque(): HTMLElement {
  return screen.getByRole("region", { name: "Por cobrar a satélites" });
}

afterEach(() => {
  cleanup();
});

describe("SLT-73 — el bloque «Por cobrar a satélites» (R28)", () => {
  it("R28: con deuda de la satélite, el bloque muestra el rótulo, el importe del DTO, la insignia y la pista positiva", () => {
    // Un importe distinto de todos los del resumen: no puede confundirse con otro.
    pintar({
      modoComposicion: "tres_tramos",
      porCobrarSatelites: "1234.50",
      signoPorCobrarSatelites: "positivo",
      porcentajePorCobrarSatelites: "9.32",
      deEmpresaEnCaja: "765.50",
    });

    const b = bloque();
    expect(b.dataset.bolsillo).toBe("satelites");
    expect(within(b).getByText("Por cobrar a satélites")).toBeInTheDocument();
    expect(within(b).getByText("₡1.234,50")).toBeInTheDocument();
    expect(within(b).getByText("Positivo")).toBeInTheDocument();
    expect(within(b).getByRole("note").textContent).toBe(PISTA_POSITIVA);
    // Pinta `porCobrarSatelites`, no otra cifra del resumen.
    expect(within(b).queryByText("₡765,50")).toBeNull();
    expect(within(b).queryByText("₡2.000")).toBeNull();
  });

  it("R28: negativo → la pista dice que la central les debe a las satélites", () => {
    pintar({ porCobrarSatelites: "-350.00", signoPorCobrarSatelites: "negativo" });

    const b = bloque();
    expect(within(b).getByText("-₡350")).toBeInTheDocument();
    expect(within(b).getByText("Negativo")).toBeInTheDocument();
    expect(within(b).getByRole("note").textContent).toBe(PISTA_NEGATIVA);
    expect(b.textContent).not.toContain(PISTA_POSITIVA);
  });

  it("R28: la pista la elige el SIGNO del servidor, no el importe", () => {
    // CONTRAPRUEBA: importe positivo con signo «negativo». Si la pantalla comparara el importe con
    // cero, pintaría la pista positiva; con el signo del servidor, la negativa.
    pintar({ porCobrarSatelites: "500.00", signoPorCobrarSatelites: "negativo" });
    expect(within(bloque()).getByRole("note").textContent).toBe(PISTA_NEGATIVA);
    cleanup();

    pintar({ porCobrarSatelites: "-500.00", signoPorCobrarSatelites: "positivo" });
    expect(within(bloque()).getByRole("note").textContent).toBe(PISTA_POSITIVA);
  });

  it("R28: el bloque está FUERA del de la empresa y del de las tiendas, como hermano", () => {
    const { container } = pintar({ porCobrarSatelites: "1234.50", signoPorCobrarSatelites: "positivo" });

    const b = bloque();
    const empresa = container.querySelector<HTMLElement>('[data-bolsillo="empresa"]');
    const tiendas = container.querySelector<HTMLElement>('[data-bolsillo="tiendas"]');
    // Control de no-vacuidad: los dos bloques vecinos existen.
    expect(empresa).not.toBeNull();
    expect(tiendas).not.toBeNull();

    expect(empresa?.contains(b)).toBe(false);
    expect(tiendas?.contains(b)).toBe(false);
    expect(b.contains(empresa as HTMLElement)).toBe(false);
    // Hermanos: cuelgan del mismo padre.
    expect(b.parentElement).toBe(empresa?.parentElement);
    expect(within(empresa as HTMLElement).queryByText("Por cobrar a satélites")).toBeNull();
    expect(within(empresa as HTMLElement).queryByText("₡1.234,50")).toBeNull();
  });

  it("R28 (D14): con ₡0 el bloque está y muestra ₡0, en estado «saldo»", () => {
    pintar({ porCobrarSatelites: "0.00", signoPorCobrarSatelites: "cero" });

    const b = bloque();
    expect(within(b).getByText("₡0")).toBeInTheDocument();
    expect(within(b).getByText("En cero")).toBeInTheDocument();
    expect(within(b).getByRole("note").textContent).toBe(PISTA_POSITIVA);
  });

  it("R28 (D14): con ₡0 el bloque está y muestra ₡0, también en estado «flujo» (sin barra)", () => {
    const { container } = pintar({
      estado: "flujo",
      porCobrarSatelites: "0.00",
      signoPorCobrarSatelites: "cero",
    });

    // En «flujo» no hay barra (R22 de la 459), pero el bloque sigue.
    expect(container.querySelector('[role="img"]')).toBeNull();
    const b = bloque();
    expect(within(b).getByText("₡0")).toBeInTheDocument();
    expect(within(b).getByText("Por cobrar a satélites")).toBeInTheDocument();
  });
});
