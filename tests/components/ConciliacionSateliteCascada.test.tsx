// @vitest-environment jsdom
//
// SLT-73 (R9, R8 en pantalla) — LA CUENTA DE UNA CONSOLIDACIÓN en la conciliación de una bodega
// satélite: recaudado por método y su total, lo que es de la satélite (pago a mensajeros y su
// ganancia), lo que va a la central, lo recibido y lo que falta.
//
// SLT-114 «Estado de cuenta de la satélite: conciliación en pestaña» (R235-R237): la fila desplegada
// pasa a dos `Cuenta` en cascada, «Lo que va a la central» y «Conciliación», con los rótulos del
// detalle único y el enlace «Ver el cierre de bodega completo». La `Cuenta` pone el operador en el
// rótulo («− Recibido») y no en el importe; los métodos en cero no se pintan (PA3).
//
// Molde de la ficha 359: se lee LO PINTADO y la cuenta se cierra con las cadenas del DOM, no con
// el fixture. Los esperados se escriben A MANO y llevan céntimos en todas las cifras: un juego de
// importes redondos cierra igual con una resta hecha en `number` y no mediría nada.
import type { ReactNode } from "react";
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
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ConciliacionSatelite } from "@/app/(app)/wallet/satelites/_components/ConciliacionSatelite";

// ── Parseador de lo pintado (propio de este archivo, a propósito) ─────────────────────────────

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

/** La cuenta cierra con las CADENAS que se leen. */
function laCuentaCierra(sumandos: readonly string[], total: string, quien: string): void {
  const suma = sumandos.reduce((acc, s) => acc + centimos(s), BigInt(0));
  expect(suma, `${quien}: se lee ${sumandos.join(" ")} = ${total}, y no da`).toBe(centimos(total));
}

// ── Datos ─────────────────────────────────────────────────────────────────────────────────────

/** Un id que hay que codificar: si el enlace no lo codificara, colaría otro parámetro. */
const ID_RARO = "cb-1/zeta&x";

/**
 * Recibida por menos. 12.500,25 + 70.890,40 + 1.000,10 = 84.390,75 recaudado;
 * 84.390,75 − 15.000,00 − 2.300,50 = 67.090,25 para la central; 67.090,25 − 60.000,00 = 7.090,25.
 */
const RECIBIDA_POR_MENOS: ConsolidacionSateliteDTO = {
  cierreBodegaId: ID_RARO,
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
  // SLT-76 (R3): desde SLT-73 marcar asienta el dinero, así que no se ofrece «Desmarcar».
  desmarcable: false,
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

/** Despliega la fila y devuelve sus dos cuentas. */
async function abrirCuentas(fecha: string): Promise<{ central: HTMLElement; conciliacion: HTMLElement }> {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: `Ver la cuenta de la consolidación del ${fecha}` }),
  );
  return {
    central: screen.getByRole("region", { name: `Lo que va a la central · consolidación del ${fecha}` }),
    conciliacion: screen.getByRole("region", { name: `Conciliación · consolidación del ${fecha}` }),
  };
}

/** Las líneas de una `Cuenta` como se leen: [rótulo con su operador, importe pintado]. */
function lineas(cuenta: HTMLElement): [string, string][] {
  return [...cuenta.querySelectorAll("[data-tipo]")].map((l) => [
    l.querySelector("[data-rotulo]")?.textContent ?? "",
    l.querySelector("[data-monto]")?.textContent ?? "",
  ]);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SLT-114 R235 — «Lo que va a la central» de la consolidación", () => {
  it('R235 — "Lo que va a la central" con literales del doble', async () => {
    montar([RECIBIDA_POR_MENOS]);
    const { central } = await abrirCuentas("15 sept");
    expect(lineas(central)).toEqual([
      ["Efectivo", "₡12.500,25"],
      ["SINPE", "₡70.890,40"],
      ["Transferencia", "₡1.000,10"],
      ["Recaudado", "₡84.390,75"],
      ["− Pago a mensajeros", "₡15.000"],
      ["− Gana la bodega satélite", "₡2.300,50"],
      ["Debe llegar a la central", "₡67.090,25"],
    ]);
    const tipos = [...central.querySelectorAll("[data-tipo]")].map((l) => l.getAttribute("data-tipo"));
    expect(tipos).toEqual(["partida", "partida", "partida", "subtotal", "partida", "partida", "total"]);
    // Las notas del modelo viejo (sin `incluyeModeloNuevo`).
    expect(central.textContent).toContain(
      "Lo que se le reconoce a la bodega satélite por las devoluciones a origen. No es un movimiento de caja registrado.",
    );
    expect(central.textContent).toContain(
      "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por las devoluciones a origen.",
    );
  });

  it("R235 — los métodos en cero no se pintan (PA3)", async () => {
    montar([SIN_MARCAR]);
    const { central } = await abrirCuentas("16 sept");
    expect(lineas(central).map(([r]) => r)).toEqual([
      "SINPE",
      "Recaudado",
      "− Pago a mensajeros",
      "− Gana la bodega satélite",
      "Debe llegar a la central",
    ]);
    expect(central.textContent).not.toContain("Efectivo");
    expect(central.textContent).not.toContain("Transferencia");
  });

  it("R235 — con modelo nuevo, las notas del modelo nuevo", async () => {
    montar([{ ...RECIBIDA_POR_MENOS, incluyeModeloNuevo: true }]);
    const { central } = await abrirCuentas("15 sept");
    expect(central.textContent).toContain(
      "Lo que se le reconoce a la bodega satélite por sus gestiones. No es un movimiento de caja registrado.",
    );
    expect(central.textContent).toContain(
      "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por sus gestiones.",
    );
  });

  it("las identidades de «Lo que va a la central» cierran con lo que se LEE", async () => {
    montar([RECIBIDA_POR_MENOS]);
    const { central } = await abrirCuentas("15 sept");
    const [ef, si, tr, rec, pago, gana, debe] = lineas(central).map(([, m]) => m);
    laCuentaCierra([ef, si, tr], rec, "recaudado por método = recaudado");
    laCuentaCierra([rec, `-${pago}`, `-${gana}`], debe, "recaudado − lo de la satélite = debe llegar");
  });
});

describe("SLT-114 R236 — «Conciliación» de la consolidación", () => {
  it("con marca: debe llegar, − recibido y falta por recibir", async () => {
    montar([RECIBIDA_POR_MENOS]);
    const { conciliacion } = await abrirCuentas("15 sept");
    expect(lineas(conciliacion)).toEqual([
      ["Debe llegar a la central", "₡67.090,25"],
      ["− Recibido", "₡60.000"],
      ["Falta por recibir", "₡7.090,25"],
    ]);
  });

  it('R236 — "Conciliación": "—" sin marca y la falta del servidor tal cual (canario)', async () => {
    // Si la pantalla restara en el cliente, aquí saldría ₡36.210,35 y no el canario.
    montar([{ ...SIN_MARCAR, faltaPorRecibir: "1234.56" }]);
    const { conciliacion } = await abrirCuentas("16 sept");
    expect(lineas(conciliacion)).toEqual([
      ["Debe llegar a la central", "₡36.210,35"],
      ["− Recibido", "—"],
      ["Falta por recibir", "₡1.234,56"],
    ]);
    expect(conciliacion.textContent).not.toContain("₡0");
  });
});

describe("SLT-114 R237 — el enlace al cierre de bodega", () => {
  it('R237 — enlace "Ver el cierre de bodega completo" con su href', async () => {
    montar([RECIBIDA_POR_MENOS]);
    const { conciliacion, central } = await abrirCuentas("15 sept");
    const enlace = within(conciliacion).getByRole("link", { name: "Ver el cierre de bodega completo" });
    expect(enlace.getAttribute("href")).toBe("/cierres-admin?cierreBodega=cb-1%2Fzeta%26x");
    expect(within(central).queryByRole("link")).toBeNull();
    // El id solo viaja en el href: no se lee en ninguna parte de la fila.
    expect(conciliacion.textContent).not.toContain(ID_RARO);
    expect(central.textContent).not.toContain(ID_RARO);
  });
});

describe("SLT-73 R8/R9 — lo que no cambia en la tabla", () => {
  it("R8 — la falta es la del SERVIDOR en la columna: un canario que no cuadra se pinta tal cual", async () => {
    montar([{ ...RECIBIDA_POR_MENOS, faltaPorRecibir: "1234.56" }]);
    const tabla = await screen.findByRole("table");
    expect(await within(tabla).findByText("₡1.234,56")).toBeInTheDocument();
    expect(within(tabla).queryByText("₡7.090,25")).toBeNull();
  });

  it("la fila dice lo esperado (Debe llegar), lo recibido y la falta, y NO el efectivo", async () => {
    montar([RECIBIDA_POR_MENOS]);
    const tabla = await screen.findByRole("table");
    await within(tabla).findByText("₡67.090,25");
    expect(within(tabla).getByRole("columnheader", { name: "Debe llegar" })).toBeInTheDocument();
    expect(within(tabla).getByRole("columnheader", { name: "Falta" })).toBeInTheDocument();
    expect(within(tabla).getByText("₡60.000")).toBeInTheDocument();
    expect(within(tabla).getByText("₡7.090,25")).toBeInTheDocument();
    expect(within(tabla).queryByText("₡12.500,25")).toBeNull();
  });

  it("el diálogo de marcar precarga lo ESPERADO (paraLaCentral), no el efectivo", async () => {
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
