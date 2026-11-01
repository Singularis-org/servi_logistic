// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";

const detalleMock = vi.fn();
vi.mock("@/lib/actions/wallet", () => ({
  listarMovimientosDeFilaAction: (...a: unknown[]) => detalleMock(...a),
}));

import { CajaResumenCard } from "@/app/(app)/wallet/_components/CajaResumenCard";
import { ComposicionGananciaCard } from "@/app/(app)/wallet/_components/ComposicionGananciaCard";
import { FILTROS_VACIOS } from "@/app/(app)/wallet/_components/wallet-filtros-input";
import type {
  CajaResumenDTO,
  ComposicionGananciaDTO,
  DesgloseEgresosDTO,
} from "@/lib/types/wallet";
import {
  LLAMADAS_PROHIBIDAS_EN_DINERO,
  codigoSinComentarios,
} from "@/tests/fixtures/money-safe";

/**
 * SL-39 (T5, design §7.1/§7.2) — EL IVA COBRADO, APARTE DE LA GANANCIA, EN LA PANTALLA.
 *
 * Cubre R6, R7, R8, R9 (la pantalla), R10 (la descripción) y R20. El conjunto es el ejemplo de
 * design §1, con la cuenta a mano:
 *
 *   - una entrega con contra-entrega de 20.000,00; flete 2.500,00 (+ IVA 325,00), comisión 700,00
 *     (+ IVA 91,00); pago al mensajero 1.500,00;
 *   - ganancia = (2.500 + 700) − 1.500 = 1.700,00;
 *   - IVA cobrado = 325 + 91 = 416,00;
 *   - «De la empresa» = 1.700 + 416 + 0 = 2.116,00; «De las tiendas» = 20.000 − 3.616 = 16.384,00;
 *     en caja = 20.000 − 1.500 = 18.500,00 = 16.384 + 2.116.
 *
 * Los importes esperados van ESCRITOS A MANO (`₡1.700`, `₡416`), nunca recalculados con `money()`:
 * la pantalla usa esa función y por tanto no podría contradecirla.
 */

const RESUMEN: CajaResumenDTO = {
  entradas: "20000.00",
  salidas: "1500.00",
  enCaja: "18500.00",
  signoEnCaja: "positivo",
  ingresosPropios: "3200.00",
  egresosPropios: "1500.00",
  ganancia: "1700.00",
  signoGanancia: "positivo",
  deTerceros: "16384.00",
  periodoFiltrado: false,
  porcentajeTiendas: "88.56",
  modoComposicion: "dos_bolsillos",
  capital: "0.00",
  signoCapital: "cero",
  deEmpresa: "2116.00",
  signoDeTerceros: "positivo",
  deTercerosAbsoluto: "16384.00",
  estado: "flujo",
  flujoDesde: "2026-08-25",
  iva: "416.00",
  signoIva: "positivo",
  porCobrarSatelites: "0.00",
  signoPorCobrarSatelites: "cero",
  porcentajePorCobrarSatelites: "0.00",
  deEmpresaEnCaja: "2116.00",
};

const DESGLOSE: DesgloseEgresosDTO = {
  gastoFijo: "0.00",
  gastoVariable: "0.00",
  sueldo: "0.00",
  indemnizacion: "0.00",
  total: "0.00",
};

const COMPOSICION: ComposicionGananciaDTO = {
  ingresos: {
    ingreso_flete: "2500.00",
    ingreso_flete_devolucion: "0.00",
    ingreso_comision_cod: "700.00",
    ingreso_ajuste: "0.00",
    ingreso_cobro_tienda: "0.00",
  },
  totalIngresos: "3200.00",
  egresos: {
    egreso_pago_mensajero: "1500.00",
    egreso_ajuste: "0.00",
    egreso_reverso_cobro_tienda: "0.00",
    egreso_reverso_flete_devolucion: "0.00",
    egreso_pago_plataforma: "0.00", // SL-45: la exige el `Record` total
  },
  otrosEgresos: "0.00",
  hayOtrosEgresos: false,
  totalEgresos: "1500.00",
  iva: {
    ingreso_iva_flete: "325.00",
    ingreso_iva_flete_devolucion: "0.00",
    ingreso_iva_comision_cod: "91.00",
    egreso_reverso_iva_flete_devolucion: "0.00",
  },
  totalIva: "416.00",
};

/** Las cuatro filas del bloque, con el rótulo del libro (`CATEGORIA_LABEL`), escritas a mano. */
const FILAS_IVA = [
  "IVA del flete cobrado a la tienda",
  "IVA del flete por devolución a origen cobrado a la tienda",
  "IVA de la comisión cobrado a la tienda",
  "IVA del flete por devolución a origen cobrado a la tienda anulado",
] as const;

const PISTA_IVA =
  "IVA que se les cobró a las tiendas sobre el flete y la comisión. No es ganancia.";

function envolver(nodo: ReactElement) {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), revalidateOnFocus: false, revalidateOnReconnect: false }}
    >
      {nodo}
    </SWRConfig>,
  );
}

function pintarResumen(resumen: CajaResumenDTO = RESUMEN) {
  return envolver(<CajaResumenCard resumen={resumen} />);
}

function pintarComposicion(
  composicion: ComposicionGananciaDTO = COMPOSICION,
  resumen: CajaResumenDTO = RESUMEN,
) {
  return envolver(
    <ComposicionGananciaCard
      composicion={composicion}
      desglose={DESGLOSE}
      resumen={resumen}
      filtros={FILTROS_VACIOS}
    />,
  );
}

/** Los pares rótulo ↔ importe de un grupo, fila a fila (el último es el total). */
function pares(grupo: HTMLElement): { rotulo: string; importe: string }[] {
  const dl = grupo.querySelector(":scope > dl");
  if (dl === null) throw new Error("el grupo no envuelve una <dl>");
  return [...dl.children].map((fila) => ({
    rotulo: (fila.querySelector("dt")?.textContent ?? "").trim(),
    importe: (fila.querySelector("dd")?.textContent ?? "").trim(),
  }));
}

function grupo(nombre: string): HTMLElement {
  return screen.getByRole("group", { name: nombre });
}

beforeEach(() => {
  detalleMock.mockReset();
  detalleMock.mockResolvedValue({
    status: "ok" as const,
    data: { movimientos: [], total: 0, page: 1, pageSize: 10 },
  });
});

afterEach(() => {
  cleanup();
});

describe("SL-39 R6/R9 — la región «IVA cobrado» del bolsillo de la empresa", () => {
  it("R6: la región lleva el importe, la insignia del signo y la pista", () => {
    const { container } = pintarResumen();
    const empresa = container.querySelector<HTMLElement>('[data-bolsillo="empresa"]');
    expect(empresa, "no hay bolsillo de la empresa").not.toBeNull();

    const region = within(empresa as HTMLElement).getByRole("region", { name: "IVA cobrado" });
    expect(within(region).getByText("IVA cobrado")).toBeInTheDocument();
    expect(within(region).getByText("₡416")).toBeInTheDocument();
    expect(within(region).getByText("Positivo")).toBeInTheDocument();
    expect(within(region).getByText(PISTA_IVA)).toBeInTheDocument();
  });

  it("R8/R10: la ganancia del bolsillo va sin IVA y su pista lo dice", () => {
    const { container } = pintarResumen();
    const empresa = container.querySelector<HTMLElement>('[data-bolsillo="empresa"]') as HTMLElement;
    const ganancia = within(empresa).getByRole("region", { name: "Ganancia de la empresa" });
    expect(within(ganancia).getByText("₡1.700")).toBeInTheDocument();
    expect(
      within(ganancia).getByText("Lo que la empresa gana menos lo que gasta, sin el IVA"),
    ).toBeInTheDocument();
    // Ni el IVA ni la suma con IVA se leen bajo el rótulo de la ganancia.
    expect(within(ganancia).queryByText("₡416")).toBeNull();
    expect(within(ganancia).queryByText("₡2.116")).toBeNull();
    // Y los dos datos secundarios, sin IVA: 2.500 + 700 = 3.200 y 1.500.
    expect(within(empresa).getByText("₡3.200")).toBeInTheDocument();
    expect(within(empresa).getByText("₡1.500")).toBeInTheDocument();
  });

  it("R9: el bolsillo pinta la ganancia y DESPUÉS «IVA cobrado» y «Saldo inicial y aportes», en ese orden", () => {
    const { container } = pintarResumen();
    const empresa = container.querySelector<HTMLElement>('[data-bolsillo="empresa"]') as HTMLElement;
    const regiones = within(empresa)
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label"));
    expect(regiones).toEqual(["Ganancia de la empresa", "IVA cobrado", "Saldo inicial y aportes"]);
  });

  it("R20: importe y signo son los del servidor — un IVA negativo se pinta tal cual llega", () => {
    // El servidor manda signo e importe; si la tarjeta los dedujera, este render coincidiría con
    // el de arriba.
    pintarResumen({ ...RESUMEN, iva: "-12.00", signoIva: "negativo" });
    const region = screen.getByRole("region", { name: "IVA cobrado" });
    expect(within(region).getByText("-₡12")).toBeInTheDocument();
    expect(within(region).getByText("Negativo")).toBeInTheDocument();
    cleanup();

    pintarResumen({ ...RESUMEN, iva: "0.00", signoIva: "cero" });
    const cero = screen.getByRole("region", { name: "IVA cobrado" });
    expect(within(cero).getByText("₡0")).toBeInTheDocument();
    expect(within(cero).getByText("En cero")).toBeInTheDocument();
  });
});

describe("SL-39 R7/R8 — la composición con el IVA aparte", () => {
  it("R7/R8: las tres filas de IVA no están en «Ingresos», y su total es «Ingresos de la empresa»", () => {
    pintarComposicion();
    expect(pares(grupo("Desglose de ingresos"))).toEqual([
      { rotulo: "Flete cobrado a la tienda", importe: "₡2.500" },
      { rotulo: "Flete por devolución a origen cobrado a la tienda", importe: "₡0" },
      { rotulo: "Comisión de contra-entrega cobrada a la tienda", importe: "₡700" },
      { rotulo: "Corrección de caja (suma)", importe: "₡0" },
      { rotulo: "La empresa le cobra a una tienda", importe: "₡0" },
      { rotulo: "Total de ingresos", importe: "₡3.200" },
    ]);
    const ingresos = grupo("Desglose de ingresos").textContent ?? "";
    expect(ingresos).not.toMatch(/IVA/);
    // Y el reverso tampoco está en «Egresos»: su total es «Gastos de la empresa», 1.500.
    const egresos = grupo("Desglose de egresos");
    expect(egresos.textContent ?? "").not.toMatch(/IVA/);
    const filasEgreso = pares(egresos);
    expect(filasEgreso[filasEgreso.length - 1]).toEqual({
      rotulo: "Total de egresos",
      importe: "₡1.500",
    });
  });

  it("R7: el bloque «IVA cobrado (aparte de la ganancia)» tiene las cuatro filas y el total del IVA", () => {
    pintarComposicion();
    expect(screen.getByText("IVA cobrado (aparte de la ganancia)")).toBeInTheDocument();
    expect(pares(grupo("Desglose del IVA"))).toEqual([
      { rotulo: FILAS_IVA[0], importe: "₡325" },
      { rotulo: FILAS_IVA[1], importe: "₡0" },
      { rotulo: FILAS_IVA[2], importe: "₡91" },
      { rotulo: FILAS_IVA[3], importe: "₡0" },
      { rotulo: "Total del IVA", importe: "₡416" },
    ]);
  });

  it("R7: las tres de ingreso entran en verde y el reverso sale en rojo, como en su columna", () => {
    pintarComposicion();
    const dl = grupo("Desglose del IVA").querySelector(":scope > dl") as HTMLElement;
    const colores = [...dl.children].slice(0, 4).map((fila) => {
      const dd = fila.querySelector("dd");
      if (dd?.classList.contains("text-success-strong")) return "verde";
      if (dd?.classList.contains("text-danger-strong")) return "rojo";
      return "otro";
    });
    expect(colores).toEqual(["verde", "verde", "verde", "rojo"]);
  });

  it("R7: el grupo del IVA envuelve una <dl> sin rol, como las dos columnas", () => {
    pintarComposicion();
    const g = grupo("Desglose del IVA");
    expect(g.tagName).toBe("DIV");
    const dl = g.querySelector(":scope > dl");
    expect(dl).not.toBeNull();
    expect(dl?.hasAttribute("role")).toBe(false);
  });

  it("R7: cada una de las cuatro filas del IVA se abre y pide SU fila al servidor", async () => {
    pintarComposicion();
    const g = grupo("Desglose del IVA");
    const controles = within(g).getAllByRole("button", { name: /^Ver los movimientos de / });
    expect(controles).toHaveLength(4);

    const tokens = [
      "ingreso_iva_flete",
      "ingreso_iva_flete_devolucion",
      "ingreso_iva_comision_cod",
      "egreso_reverso_iva_flete_devolucion",
    ];
    for (const [i, rotulo] of FILAS_IVA.entries()) {
      await userEvent.click(within(g).getByRole("button", { name: `Ver los movimientos de ${rotulo}` }));
      expect(await screen.findByRole("region", { name: `Movimientos de ${rotulo}` })).toBeInTheDocument();
      await waitFor(() => expect(detalleMock).toHaveBeenCalledTimes(i + 1));
      expect(detalleMock.mock.calls[i][0]).toEqual({ fila: tokens[i], page: 1 });
    }
  });

  it("R8: el pie es la ganancia sin IVA, no la suma con él", () => {
    const { container } = pintarComposicion();
    const pie = container.querySelector<HTMLElement>('[data-slot="card-footer"]') as HTMLElement;
    expect(within(pie).getByText("Ganancia de la empresa")).toBeInTheDocument();
    expect(within(pie).getByText("₡1.700")).toBeInTheDocument();
    expect(pie.textContent ?? "").not.toMatch(/₡2\.116|₡416/);
  });

  it("R20: el total del IVA es el del servidor, no una suma de la pantalla", () => {
    // 325 + 0 + 91 − 0 son 416; aquí el servidor manda otro número y la tarjeta pinta ESE.
    pintarComposicion({ ...COMPOSICION, totalIva: "1.00" });
    const filas = pares(grupo("Desglose del IVA"));
    expect(filas[filas.length - 1]).toEqual({ rotulo: "Total del IVA", importe: "₡1" });
  });

  it("R10: la descripción dice que la ganancia no lleva el IVA y que se muestra aparte", () => {
    const { container } = pintarComposicion();
    const texto = container.querySelector('[data-slot="card-description"]')?.textContent ?? "";
    expect(texto).toBe(
      "Ingresos y gastos propios del conjunto filtrado, concepto por concepto: fletes, comisiones, " +
        "gastos, sueldos, indemnizaciones, pagos a mensajeros y ajustes. El IVA cobrado a las " +
        "tiendas no es ganancia: se muestra aparte. No incluye el dinero de las tiendas: el " +
        "contra-entrega cobrado no es de la empresa y por eso no está en la ganancia.",
    );
  });
});

describe("SL-39 R20 — la pantalla no opera con importes", () => {
  it("ninguna de las fuentes tocadas convierte un importe a número", () => {
    const fuentes = [
      "app/(app)/wallet/_components/CajaResumenCard.tsx",
      "app/(app)/wallet/_components/ComposicionGananciaCard.tsx",
      "app/(app)/wallet/_components/DesgloseEgresosLista.tsx",
      "app/(app)/wallet/_components/wallet-labels.ts",
    ];
    for (const ruta of fuentes) {
      const fuente = codigoSinComentarios(ruta);
      // No vacuidad: el barrido lee código de verdad.
      expect(fuente.length, `${ruta} está vacío`).toBeGreaterThan(500);
      for (const prohibida of LLAMADAS_PROHIBIDAS_EN_DINERO) {
        expect(fuente, `${ruta} llama a ${prohibida}`).not.toMatch(prohibida);
      }
      expect(fuente).not.toMatch(/derivarCaja|derivarComposicionGanancia/);
    }
  });
});
