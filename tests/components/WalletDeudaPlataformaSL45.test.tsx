// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { SWRConfig } from "swr";

import type { CajaResumenDTO, ComposicionGananciaDTO, DesgloseEgresosDTO } from "@/lib/types/wallet";
import type { DeudaPlataformaDTO } from "@/lib/interfaces/services/IDeudaPlataformaService";
import { LLAMADAS_PROHIBIDAS_EN_DINERO, codigoSinComentarios } from "@/tests/fixtures/money-safe";

/**
 * SL-45 (T8, design §7.2) — LA REGIÓN DE LA DEUDA DICE QUÉ HACER.
 *
 * Cubre R1–R4 y R14 montando la página real (`page.tsx` → `WalletModule` → `CajaResumenCard`): el
 * rótulo, el importe y la pista de cada estado; el botón «Registrar pago a la plataforma» SOLO en
 * «debe»; que el botón abre el registro con «Pago a la plataforma» ya elegido; y que ni la tarjeta, ni
 * los rótulos, ni el módulo convierten un importe a número (el estado lo decide el servidor).
 *
 * Los textos esperados van ESCRITOS A MANO, nunca leídos de `wallet-labels.ts`.
 */

const H = vi.hoisted(() => ({
  actor: vi.fn(),
  listar: vi.fn(),
  resumen: vi.fn(),
  desglose: vi.fn(),
  deuda: vi.fn(),
  conceptos: vi.fn(),
  quienes: vi.fn(),
  autoria: vi.fn(),
  previsualizar: vi.fn(),
}));

// SL-23 (design §10): las puertas de módulo, todas encendidas; esta prueba no es sobre ellas.
vi.mock("@/lib/modulos/exigir-modulo", async () =>
  (await import("@/tests/fabricas/modulos")).puertasAbiertas());

vi.mock("@/app/_components/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-stub">Salir</button>,
}));
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: (...a: unknown[]) => H.actor(...a),
}));
vi.mock("@/lib/actions/wallet", () => ({
  listarMovimientosAction: (...a: unknown[]) => H.listar(...a),
  libroCajaKardexAction: vi.fn(),
  verResumenCajaAction: (...a: unknown[]) => H.resumen(...a),
  listarMovimientosDeFilaAction: vi.fn(),
  registrarMovimientoManualAction: vi.fn(),
}));
vi.mock("@/lib/actions/deuda-plataforma", () => ({
  verDeudaPlataformaAction: (...a: unknown[]) => H.deuda(...a),
}));
vi.mock("@/lib/actions/wallet-egresos", () => ({
  verDesgloseEgresosAction: (...a: unknown[]) => H.desglose(...a),
  registrarEgresoAdministrativoAction: vi.fn(),
  reversarEgresoAdministrativoAction: vi.fn(),
}));
vi.mock("@/lib/actions/efecto-movimiento", () => ({
  previsualizarMovimientoAction: (...a: unknown[]) => H.previsualizar(...a),
}));
vi.mock("@/lib/actions/gasto-fijo-plantilla", () => ({
  listarPlantillasPaginadoAction: vi.fn(async () => ({ status: "ok", items: [], page: 1, pageSize: 25, total: 0 })),
  listarPlantillasCompletoAction: vi.fn(),
  crearPlantillaAction: vi.fn(),
  actualizarPlantillaAction: vi.fn(),
  eliminarPlantillaAction: vi.fn(),
  setActivaPlantillaAction: vi.fn(),
}));
vi.mock("@/lib/actions/gasto-fijo-cobro", () => ({
  listarCobrosPendientesAction: vi.fn(async () => ({ status: "ok", items: [], total: 0 })),
  aprobarCobroGastoFijoAction: vi.fn(),
  rechazarCobroGastoFijoAction: vi.fn(),
  contarCobrosPendientesDePlantillaAction: vi.fn(),
}));
vi.mock("@/lib/actions/rechazo-tienda-cobro", () => ({
  listarCobrosRechazoTiendaAction: vi.fn(async () => ({ status: "ok", items: [], total: 0 })),
  aprobarCobroRechazoTiendaAction: vi.fn(),
  rechazarCobroRechazoTiendaAction: vi.fn(),
}));
vi.mock("@/lib/actions/libro-caja-autoria", () => ({
  autoriaDelLibroCajaAction: (...a: unknown[]) => H.autoria(...a),
}));
vi.mock("@/lib/actions/wallet-filtros", () => ({
  conceptosConMovimientosAction: (...a: unknown[]) => H.conceptos(...a),
  cierresDeLaCuentaAction: vi.fn(),
  quienesDelLibroCajaAction: (...a: unknown[]) => H.quienes(...a),
}));
vi.mock("@/lib/actions/wallet-anulacion", () => ({ anularMovimientoAction: vi.fn() }));
vi.mock("@/lib/actions/como-quedo", () => ({
  comoQuedoAction: vi.fn(async () => ({ status: "ok", comoQuedo: { caja: null, cuenta: null } })),
}));
vi.mock("@/lib/actions/wallet-comprobante", () => ({
  verComprobanteAction: vi.fn(),
  adjuntarComprobanteAction: vi.fn(),
}));
class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/wallet",
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

import WalletPage from "@/app/(app)/wallet/page";

// ── Los datos ────────────────────────────────────────────────────────────────────────────────────

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
    egreso_pago_plataforma: "0.00",
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

const DESGLOSE: DesgloseEgresosDTO = {
  gastoFijo: "0.00",
  gastoVariable: "0.00",
  sueldo: "0.00",
  indemnizacion: "0.00",
  total: "0.00",
};

// Los tres estados que manda el servidor (design §3). El de «a favor» trae la `deuda` con signo y el
// `importe` en positivo: la pantalla tiene que pintar el importe, no quitarle el signo a la deuda.
const DEBE: DeudaPlataformaDTO = { deuda: "1000.00", estado: "debe", importe: "1000.00" };
const AL_DIA: DeudaPlataformaDTO = { deuda: "0.00", estado: "al_dia", importe: "0.00" };
const A_FAVOR: DeudaPlataformaDTO = { deuda: "-500.00", estado: "a_favor", importe: "500.00" };

// El contrato de R1–R3, escrito a mano.
const ROTULO_DEUDA = "Lo que la empresa debe a la plataforma";
const ROTULO_A_FAVOR = "Saldo a favor de la empresa con la plataforma";
const PISTA_DEBE =
  "Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja y baja esta deuda.";
const PISTA_AL_DIA = "La empresa está al día con la plataforma. Cada orden nueva suma su cobro aquí.";
const PISTA_A_FAVOR =
  "La empresa pagó más de lo que hoy debe, porque se anularon órdenes ya pagadas. Se descuenta de los próximos cobros.";
const BOTON = "Registrar pago a la plataforma";

function envolver(nodo: ReactElement) {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }}
    >
      {nodo}
    </SWRConfig>,
  );
}

async function pintarLaWallet(deuda: DeudaPlataformaDTO) {
  H.deuda.mockResolvedValue({ status: "ok", deudaPlataforma: deuda });
  envolver(await WalletPage());
  return userEvent.setup();
}

function importeDe(region: HTMLElement): string {
  const nodo = region.querySelector(".tabular-nums");
  expect(nodo, "la región no tiene importe").not.toBeNull();
  return (nodo as HTMLElement).textContent ?? "";
}

/** Las cifras del importe pintado, sin el símbolo de la moneda (que no es de esta ficha). */
function cifrasDe(region: HTMLElement): string {
  return importeDe(region).replace(/[^\d.,-]/g, "");
}

/** La región de la deuda, por su `data-region` (el rótulo cambia con el estado). */
function regionDeLaDeuda(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[data-region="deuda_plataforma"]');
  expect(region, "no hay región de la deuda").not.toBeNull();
  return region as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  H.actor.mockResolvedValue({ usuarioId: "m", rol: "maestro", organizacionId: "org-a" });
  H.listar.mockResolvedValue({ status: "ok", data: { movimientos: [], total: 0, page: 1, pageSize: 20 } });
  H.resumen.mockResolvedValue({ status: "ok", resumen: RESUMEN, composicion: COMPOSICION });
  H.desglose.mockResolvedValue({ status: "ok", desglose: DESGLOSE });
  H.conceptos.mockResolvedValue({ status: "ok", conceptos: [] });
  H.quienes.mockResolvedValue({ status: "ok", opciones: [], hayMas: false });
  H.autoria.mockResolvedValue({ status: "ok", filas: [] });
  H.previsualizar.mockResolvedValue({ status: "forbidden" });
});

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("SL-45 R1–R3 — la región, por estado", () => {
  it("R1: «debe» — rótulo, importe, la pista que lleva a pagar y registrar, y el botón dentro de la región", async () => {
    await pintarLaWallet(DEBE);
    const region = screen.getByRole("region", { name: ROTULO_DEUDA });
    expect(region).toBe(regionDeLaDeuda());
    expect(within(region).getByText(PISTA_DEBE)).toBeInTheDocument();
    expect(cifrasDe(region)).toBe("1.000");
    expect(within(region).getByRole("button", { name: BOTON })).toBeInTheDocument();
  });

  it("R2: «al día» — el importe 0,00, la pista de estar al día y NINGÚN botón de pago en la pantalla", async () => {
    await pintarLaWallet(AL_DIA);
    const region = screen.getByRole("region", { name: ROTULO_DEUDA });
    expect(within(region).getByText(PISTA_AL_DIA)).toBeInTheDocument();
    expect(cifrasDe(region)).toBe("0");
    expect(screen.queryByRole("button", { name: BOTON })).toBeNull();
    expect(within(region).queryAllByRole("button")).toEqual([]);
    // Contraprueba: el registro único de la cabecera sigue ahí (la búsqueda de botones funciona).
    expect(screen.getByRole("button", { name: "Registrar un movimiento" })).toBeInTheDocument();
  });

  it("R3/R14: «a favor» — el rótulo del saldo a favor, el importe en POSITIVO y ningún botón de pago", async () => {
    await pintarLaWallet(A_FAVOR);
    expect(screen.queryByRole("region", { name: ROTULO_DEUDA })).toBeNull();
    const region = screen.getByRole("region", { name: ROTULO_A_FAVOR });
    expect(within(region).getByText(PISTA_A_FAVOR)).toBeInTheDocument();
    // Sin signo: «500», no «-500».
    expect(cifrasDe(region)).toBe("500");
    expect(screen.queryByRole("button", { name: BOTON })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("SL-45 R4 — el botón abre el registro con el pago ya elegido", () => {
  it("R4: al pulsarlo se abre «Registrar movimiento» con «Pago a la plataforma» elegido", async () => {
    const user = await pintarLaWallet(DEBE);
    await user.click(within(regionDeLaDeuda()).getByRole("button", { name: BOTON }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Pago a la plataforma" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "Gasto de la empresa" })).not.toBeChecked();
    expect(dialog.querySelector("#movimiento-concepto-efecto")?.textContent).toBe(
      "Sale dinero de la empresa hacia la plataforma y baja lo que la empresa le debe; baja la ganancia.",
    );
  });

  it("R4 (contraprueba): el registro de la cabecera sigue abriendo con el gasto de la empresa", async () => {
    const user = await pintarLaWallet(DEBE);
    await user.click(screen.getByRole("button", { name: "Registrar un movimiento" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Gasto de la empresa" })).toBeChecked();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("SL-45 R14 — la pantalla no hace aritmética con la deuda", () => {
  it("R14: ni la tarjeta, ni los rótulos, ni el módulo convierten un importe a número", () => {
    for (const ruta of [
      "app/(app)/wallet/_components/CajaResumenCard.tsx",
      "app/(app)/wallet/_components/wallet-labels.ts",
      "app/(app)/wallet/_components/WalletModule.tsx",
    ]) {
      const fuente = codigoSinComentarios(ruta);
      expect(fuente.length, `${ruta} está vacío`).toBeGreaterThan(500);
      expect(fuente).toContain("deudaPlataforma");
      for (const prohibida of LLAMADAS_PROHIBIDAS_EN_DINERO) {
        expect(fuente, `${ruta} llama a ${prohibida}`).not.toMatch(prohibida);
      }
    }
  });

  it("R14: el botón lo decide el `estado` del servidor, no el importe: «debe» con importe 0,00 sí lo pinta", async () => {
    // Un estado y un importe que no casan solo los manda un servidor roto; aquí sirve para medir que la
    // pantalla mira el estado y no compara el importe con cero.
    await pintarLaWallet({ deuda: "0.00", estado: "debe", importe: "0.00" });
    expect(within(regionDeLaDeuda()).getByRole("button", { name: BOTON })).toBeInTheDocument();
  });
});
