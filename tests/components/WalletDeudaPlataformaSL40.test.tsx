// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { SWRConfig } from "swr";

import type {
  CajaResumenDTO,
  ComposicionGananciaDTO,
  DesgloseEgresosDTO,
} from "@/lib/types/wallet";
import type { DeudaPlataformaDTO } from "@/lib/interfaces/services/IDeudaPlataformaService";
import { aplicarPeriodo } from "@/tests/fixtures/periodo-calendario";
import {
  LLAMADAS_PROHIBIDAS_EN_DINERO,
  codigoSinComentarios,
} from "@/tests/fixtures/money-safe";

/**
 * SL-40 (T7, design §9.2/§10) — LO QUE LA EMPRESA DEBE A LA PLATAFORMA, EN LA WALLET.
 *
 * Cubre R21 (la región, su rótulo y su pista), R23 (la cifra no cambia con los filtros del libro) y
 * R26 (el importe se pinta tal cual llega). Tres alturas:
 *
 *   1. la tarjeta sola, con la deuda y sin ella;
 *   2. la página real (`page.tsx`) montando el módulo real: que la página LEA la deuda y la PASE, y
 *      no solo que la importe (memoria «el composition root que no inyecta»);
 *   3. el mismo montaje con un periodo puesto en el libro: la caja se relee y la deuda no.
 *
 * Los textos y los importes esperados van ESCRITOS A MANO, no leídos de `wallet-labels.ts` ni
 * recalculados con `money()`: la pantalla usa esas fuentes y no podría contradecirlas.
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
  fila: vi.fn(),
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
  listarMovimientosDeFilaAction: (...a: unknown[]) => H.fila(...a),
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

import { CajaResumenCard } from "@/app/(app)/wallet/_components/CajaResumenCard";
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
};

/** La caja del periodo: otra ganancia, para que se vea que la tarjeta SÍ se releyó. */
const RESUMEN_PERIODO: CajaResumenDTO = { ...RESUMEN, ganancia: "1234.00", periodoFiltrado: true };

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

const DESGLOSE: DesgloseEgresosDTO = {
  gastoFijo: "0.00",
  gastoVariable: "0.00",
  sueldo: "0.00",
  indemnizacion: "0.00",
  total: "0.00",
};

/** El ejemplo de design §11.2: dos órdenes a 500,00 y una anulada. */
const DEUDA_500: DeudaPlataformaDTO = { deuda: "500.00", estado: "debe", importe: "500.00" };

/** Once dígitos con céntimos: lo que un `number` ya no garantiza al pasar por una conversión. */
const DEUDA_ONCE_DIGITOS: DeudaPlataformaDTO = { deuda: "12345678901.99", estado: "debe", importe: "12345678901.99" };

// El contrato de R21, escrito a mano. SL-45 (R1): con deuda, la pista dice cómo se paga y se registra; la
// de SL-40 («Todavía no se cobra…») se retira.
const ROTULO = "Lo que la empresa debe a la plataforma";
const PISTA =
  "Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja y baja esta deuda.";

const INSIGNIAS_DE_SIGNO = /^(Positivo|Negativo|En cero)$/;

function envolver(nodo: ReactElement) {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }}
    >
      {nodo}
    </SWRConfig>,
  );
}

const regionDeuda = () => screen.queryByRole("region", { name: ROTULO });

/** El importe de la región: el `tabular-nums` que va entre el rótulo y la pista. */
function importeDe(region: HTMLElement): string {
  const nodo = region.querySelector(".tabular-nums");
  expect(nodo, "la región no tiene importe").not.toBeNull();
  return (nodo as HTMLElement).textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  H.actor.mockResolvedValue({ usuarioId: "m", rol: "maestro", organizacionId: "org-a" });
  H.listar.mockResolvedValue({ status: "ok", data: { movimientos: [], total: 0, page: 1, pageSize: 20 } });
  H.resumen.mockResolvedValue({ status: "ok", resumen: RESUMEN, composicion: COMPOSICION });
  H.desglose.mockResolvedValue({ status: "ok", desglose: DESGLOSE });
  H.deuda.mockResolvedValue({ status: "ok", deudaPlataforma: DEUDA_500 });
  H.conceptos.mockResolvedValue({ status: "ok", conceptos: [] });
  H.quienes.mockResolvedValue({ status: "ok", opciones: [], hayMas: false });
  H.fila.mockResolvedValue({ status: "ok", data: { movimientos: [], total: 0, page: 1, pageSize: 10 } });
  H.autoria.mockResolvedValue({ status: "ok", filas: [] });
});

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("SL-40 R21 — la región en el bolsillo de la empresa", () => {
  it("R21: con la deuda, el bolsillo de la empresa pinta la región con su rótulo, su importe y la pista exacta", () => {
    const { container } = envolver(<CajaResumenCard resumen={RESUMEN} deudaPlataforma={DEUDA_500} />);

    const region = regionDeuda();
    expect(region, "no hay región de la deuda").not.toBeNull();
    const bolsillo = container.querySelector<HTMLElement>('[data-bolsillo="empresa"]');
    expect(bolsillo?.contains(region)).toBe(true);
    expect((region as HTMLElement).dataset.region).toBe("deuda_plataforma");
    expect(within(region as HTMLElement).getByText(ROTULO)).toBeInTheDocument();
    expect(within(region as HTMLElement).getByText(PISTA)).toBeInTheDocument();
    expect(importeDe(region as HTMLElement)).toContain("500");
  });

  it("R21: es la última región del bolsillo, después de «IVA cobrado» y «Saldo inicial y aportes»", () => {
    const { container } = envolver(<CajaResumenCard resumen={RESUMEN} deudaPlataforma={DEUDA_500} />);
    const orden = [...container.querySelectorAll<HTMLElement>('[data-bolsillo="empresa"] [data-region]')].map(
      (n) => n.dataset.region,
    );
    expect(orden).toEqual(["iva", "capital", "deuda_plataforma"]);
  });

  it("R21: la región va sin insignia de signo y sin color de signo: una deuda no es dinero a favor ni en contra de la caja", () => {
    envolver(<CajaResumenCard resumen={RESUMEN} deudaPlataforma={DEUDA_500} />);
    const region = regionDeuda() as HTMLElement;

    expect(within(region).queryAllByText(INSIGNIAS_DE_SIGNO)).toEqual([]);
    const importe = region.querySelector(".tabular-nums") as HTMLElement;
    expect(importe.className).not.toMatch(/text-(success|danger)-strong/);

    // Contraprueba: las regiones hermanas SÍ llevan su insignia, así que la búsqueda de arriba
    // encuentra una cuando la hay.
    const iva = screen.getByRole("region", { name: "IVA cobrado" });
    expect(within(iva).getAllByText(INSIGNIAS_DE_SIGNO)).toHaveLength(1);
  });

  it("R21 (design §9.2): con la deuda en `null`, la región no se pinta y las de SL-39 siguen", () => {
    const { container } = envolver(<CajaResumenCard resumen={RESUMEN} deudaPlataforma={null} />);
    expect(regionDeuda()).toBeNull();
    expect(screen.queryByText(PISTA)).toBeNull();
    expect(container.querySelector('[data-region="deuda_plataforma"]')).toBeNull();
    expect(screen.getByRole("region", { name: "IVA cobrado" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Saldo inicial y aportes" })).toBeInTheDocument();
  });

  it("R21: sin la prop, tampoco se pinta (los montajes de la caja anteriores a SL-40)", () => {
    envolver(<CajaResumenCard resumen={RESUMEN} />);
    expect(regionDeuda()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("SL-40 R26 — el importe se pinta tal cual llega", () => {
  it("R26: once dígitos con céntimos salen exactos, sin redondear ni perder los céntimos", () => {
    envolver(<CajaResumenCard resumen={RESUMEN} deudaPlataforma={DEUDA_ONCE_DIGITOS} />);
    expect(importeDe(regionDeuda() as HTMLElement)).toContain("12.345.678.901,99");
  });

  it("R26: ni la tarjeta ni los rótulos convierten un importe a número", () => {
    for (const ruta of [
      "app/(app)/wallet/_components/CajaResumenCard.tsx",
      "app/(app)/wallet/_components/wallet-labels.ts",
    ]) {
      const fuente = codigoSinComentarios(ruta);
      // No vacuidad: el barrido lee código de verdad, y es el código que pinta la deuda.
      expect(fuente.length, `${ruta} está vacío`).toBeGreaterThan(500);
      expect(fuente).toContain("deudaPlataforma");
      for (const prohibida of LLAMADAS_PROHIBIDAS_EN_DINERO) {
        expect(fuente, `${ruta} llama a ${prohibida}`).not.toMatch(prohibida);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("SL-40 R21/R23 — la página lee la deuda y la pasa hasta la tarjeta", () => {
  async function pintarLaWallet() {
    envolver(await WalletPage());
    return userEvent.setup();
  }

  it("R21: la página pide la deuda una vez, sin filtros, y la región muestra lo que respondió el servidor", async () => {
    await pintarLaWallet();

    expect(H.deuda).toHaveBeenCalledTimes(1);
    expect(H.deuda).toHaveBeenCalledWith();
    const region = regionDeuda();
    expect(region, "la página no pasó la deuda hasta la tarjeta").not.toBeNull();
    expect(importeDe(region as HTMLElement)).toContain("500");
  });

  it("R21 (design §9.2): si la lectura de la deuda responde `forbidden`, la caja se pinta y la región no", async () => {
    H.deuda.mockResolvedValue({ status: "forbidden" });
    await pintarLaWallet();

    expect(regionDeuda()).toBeNull();
    expect(screen.getByRole("region", { name: "Ganancia de la empresa" })).toBeInTheDocument();
  });

  it("R23: con un periodo en el libro la caja se relee y la deuda ni se vuelve a pedir ni cambia", async () => {
    const user = await pintarLaWallet();
    const antes = importeDe(regionDeuda() as HTMLElement);
    H.resumen.mockResolvedValue({ status: "ok", resumen: RESUMEN_PERIODO, composicion: COMPOSICION });

    const libro = screen.getByRole("region", { name: "Libro de movimientos" });
    await aplicarPeriodo(user, libro, 1, 28);

    // Control: el filtro llegó a la caja (otra lectura, otra ganancia en pantalla).
    await waitFor(() => expect(H.resumen).toHaveBeenCalledTimes(2));
    const ganancia = screen.getByRole("region", { name: "Ganancia de la empresa" });
    await waitFor(() => expect(ganancia.textContent).toContain("1.234"));

    expect(H.deuda).toHaveBeenCalledTimes(1);
    expect(importeDe(regionDeuda() as HTMLElement)).toBe(antes);
  });
});
