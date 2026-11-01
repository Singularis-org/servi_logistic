// @vitest-environment jsdom
//
// SLT-73 (R9, R8 en pantalla) — LA CUENTA DE UNA CONSOLIDACIÓN en la conciliación de una bodega
// satélite: recaudado por método y su total, lo que es de la satélite (pago a mensajeros y su
// ganancia), lo que va a la central, lo recibido y lo que falta.
//
// Molde de la ficha 359: se lee LO PINTADO y la cuenta se cierra con las cadenas del DOM, no con
// el fixture. Los esperados se escriben A MANO y llevan céntimos en todas las cifras: un juego de
// importes redondos cierra igual con una resta hecha en `number` y no mediría nada.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { ToastProvider } from "@/providers/ToastProvider";
import { monedaConfig } from "@/lib/config/moneda";
import type { ConsolidacionSateliteDTO } from "@/lib/types/conciliacion-satelites";

const listarConsolidacionesMock = vi.fn();

vi.mock("@/lib/actions/conciliacion-satelites", () => ({
  corregirConsolidacionRecibidaAction: vi.fn(),
  listarConsolidacionesSateliteAction: (...a: unknown[]) => listarConsolidacionesMock(...a),
  listarConsolidacionesSateliteCompletoAction: vi.fn(),
  marcarConsolidacionRecibidaAction: vi.fn(),
  revertirConciliacionAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { ConciliacionSatelite } from "@/app/(app)/wallet/satelites/_components/ConciliacionSatelite";

// ── Parseador de lo pintado (propio de este archivo, a propósito) ─────────────────────────────

const PATRON_IMPORTE = new RegExp(
  `[+-]?${monedaConfig.simbolo}\\d[\\d${monedaConfig.separadorMiles}]*(?:${monedaConfig.separadorDecimal}\\d\\d)?`,
);

function centimos(pintado: string): bigint {
  const texto = pintado.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = negativo || texto.startsWith("+") ? texto.slice(1) : texto;
  expect(sinSigno.startsWith(monedaConfig.simbolo), `«${pintado}» no es un importe`).toBe(true);
  const cuerpo = sinSigno.slice(monedaConfig.simbolo.length);
  const corte = cuerpo.indexOf(monedaConfig.separadorDecimal);
  const enteros = corte === -1 ? cuerpo : cuerpo.slice(0, corte);
  const cola = corte === -1 ? "00" : `${cuerpo.slice(corte + 1)}00`.slice(0, 2);
  const valor =
    BigInt(enteros.split(monedaConfig.separadorMiles).join("")) * BigInt(100) + BigInt(cola);
  return negativo ? -valor : valor;
}

/** El importe pintado que sigue a un rótulo dentro de una región. */
function importeTras(region: HTMLElement, rotulo: string): string {
  const texto = region.textContent ?? "";
  const desde = texto.indexOf(rotulo);
  expect(desde, `el rótulo «${rotulo}» no está en la región`).toBeGreaterThanOrEqual(0);
  const hallado = texto.slice(desde + rotulo.length).match(PATRON_IMPORTE);
  expect(hallado, `no hay importe junto a «${rotulo}»`).not.toBeNull();
  return hallado![0];
}

/** La cuenta cierra con las CADENAS que se leen. */
function laCuentaCierra(sumandos: readonly string[], total: string, quien: string): void {
  const suma = sumandos.reduce((acc, s) => acc + centimos(s), BigInt(0));
  expect(suma, `${quien}: se lee ${sumandos.join(" ")} = ${total}, y no da`).toBe(centimos(total));
}

// ── Datos ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Recibida por menos. 12.500,25 + 70.890,40 + 1.000,10 = 84.390,75 recaudado;
 * 84.390,75 − 15.000,00 − 2.300,50 = 67.090,25 para la central; 67.090,25 − 60.000,00 = 7.090,25.
 */
const RECIBIDA_POR_MENOS: ConsolidacionSateliteDTO = {
  cierreBodegaId: "cb-1",
  solicitadoAt: "2026-09-15T14:00:00.000Z",
  totales: {
    efectivo: "12500.25",
    simpe: "70890.40",
    transferencia: "1000.10",
    general: "84390.75",
  },
  pagoMensajero: "15000.00",
  gananciaSatelite: "2300.50",
  paraLaCentral: "67090.25",
  montoRecibido: "60000.00",
  faltaPorRecibir: "7090.25",
  conciliado: true,
  conciliadoAt: "2026-09-15T17:40:00.000Z",
  conciliadoPorNombre: "Ana Rojas",
  nota: null,
  cantidadCierres: 2,
};

/** Sin marcar: todo SINPE, como la satélite de producción. */
const SIN_MARCAR: ConsolidacionSateliteDTO = {
  ...RECIBIDA_POR_MENOS,
  cierreBodegaId: "cb-2",
  solicitadoAt: "2026-09-16T14:00:00.000Z",
  totales: { efectivo: "0.00", simpe: "45210.35", transferencia: "0.00", general: "45210.35" },
  pagoMensajero: "9000.00",
  gananciaSatelite: "0.00",
  paraLaCentral: "36210.35",
  montoRecibido: null,
  faltaPorRecibir: "36210.35",
  conciliado: false,
  conciliadoAt: null,
  conciliadoPorNombre: null,
};

function montar(items: ConsolidacionSateliteDTO[]) {
  listarConsolidacionesMock.mockResolvedValue({
    status: "ok",
    items,
    total: items.length,
    page: 1,
    pageSize: 25,
  });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>
        <ConciliacionSatelite
          bodega={{ zonaId: "z-1", zonaNombre: "FGAM Limón" }}
          pendiente="43300.60"
          puedeConciliar
        />
      </ToastProvider>
    </SWRConfig>,
  );
}

async function abrirCuenta(fecha: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: `Ver la cuenta de la consolidación del ${fecha}` }),
  );
  return screen.getByRole("region", {
    name: `Lo que va a la central · consolidación del ${fecha}`,
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SLT-73 R9 — la cuenta de cada consolidación en la conciliación", () => {
  it("pinta recaudado por método y su total, lo de la satélite, para la central, recibido y falta", async () => {
    montar([RECIBIDA_POR_MENOS]);
    const cuenta = await abrirCuenta("15 sept");

    expect(importeTras(cuenta, "Efectivo")).toBe("₡12.500,25");
    expect(importeTras(cuenta, "SINPE")).toBe("+₡70.890,40");
    expect(importeTras(cuenta, "Transferencia")).toBe("+₡1.000,10");
    expect(importeTras(cuenta, "Total general")).toBe("₡84.390,75");
    expect(importeTras(cuenta, "Pago al mensajero")).toBe("-₡15.000");
    expect(importeTras(cuenta, "Gana la bodega satélite")).toBe("-₡2.300,50");
    expect(importeTras(cuenta, "Para la central")).toBe("₡67.090,25");
    expect(importeTras(cuenta, "Monto recibido")).toBe("-₡60.000");
    expect(importeTras(cuenta, "Falta por recibir")).toBe("₡7.090,25");
  });

  it("las tres identidades cierran con lo que se LEE", async () => {
    montar([RECIBIDA_POR_MENOS]);
    const cuenta = await abrirCuenta("15 sept");
    const general = importeTras(cuenta, "Total general");
    const central = importeTras(cuenta, "Para la central");

    laCuentaCierra(
      [
        importeTras(cuenta, "Efectivo"),
        importeTras(cuenta, "SINPE"),
        importeTras(cuenta, "Transferencia"),
      ],
      general,
      "recaudado por método = total",
    );
    laCuentaCierra(
      [general, importeTras(cuenta, "Pago al mensajero"), importeTras(cuenta, "Gana la bodega satélite")],
      central,
      "total − lo de la satélite = para la central",
    );
    laCuentaCierra(
      [central, importeTras(cuenta, "Monto recibido")],
      importeTras(cuenta, "Falta por recibir"),
      "para la central − recibido = falta",
    );
  });

  it("R8 — la falta es la del SERVIDOR: un canario que no cuadra se pinta tal cual", async () => {
    // Si la pantalla restara en el cliente, aquí saldría ₡7.090,25 y no el canario.
    montar([{ ...RECIBIDA_POR_MENOS, faltaPorRecibir: "1234.56" }]);
    // Primero la COLUMNA de la fila, con la cuenta aún cerrada: si no, la línea de la cuenta
    // (que vive dentro de la misma tabla) taparía una resta hecha en la celda.
    const tabla = await screen.findByRole("table");
    expect(await within(tabla).findByText("₡1.234,56")).toBeInTheDocument();
    expect(within(tabla).queryByText("₡7.090,25")).toBeNull();
    const cuenta = await abrirCuenta("15 sept");
    expect(importeTras(cuenta, "Falta por recibir")).toBe("₡1.234,56");
  });

  it("la fila dice lo esperado (Para la central), lo recibido y la falta, y NO el efectivo", async () => {
    montar([RECIBIDA_POR_MENOS]);
    const tabla = await screen.findByRole("table");
    await within(tabla).findByText("₡67.090,25");
    expect(within(tabla).getByRole("columnheader", { name: "Para la central" })).toBeInTheDocument();
    expect(within(tabla).getByRole("columnheader", { name: "Falta por recibir" })).toBeInTheDocument();
    expect(within(tabla).getByText("₡60.000")).toBeInTheDocument();
    expect(within(tabla).getByText("₡7.090,25")).toBeInTheDocument();
    expect(within(tabla).queryByText("₡12.500,25")).toBeNull();
  });

  it("sin marcar no hay línea de recibido, y la falta es todo lo que va a la central (todo SINPE)", async () => {
    montar([SIN_MARCAR]);
    const cuenta = await abrirCuenta("16 sept");
    expect(cuenta.textContent ?? "").not.toContain("Monto recibido");
    expect(importeTras(cuenta, "Efectivo")).toBe("₡0");
    expect(importeTras(cuenta, "SINPE")).toBe("+₡45.210,35");
    expect(importeTras(cuenta, "Para la central")).toBe("₡36.210,35");
    expect(importeTras(cuenta, "Falta por recibir")).toBe("₡36.210,35");
  });

  it("el diálogo de marcar precarga lo ESPERADO (Para la central), no el efectivo", async () => {
    // Con todo SINPE el efectivo es ₡0: precargarlo dejaría una diferencia que nadie quiso.
    montar([SIN_MARCAR]);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Marcar recibido la consolidación de FGAM Limón/ }),
    );
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByLabelText(/Monto recibido/)).toHaveValue("36210.35");
  });
});
