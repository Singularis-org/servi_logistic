// @vitest-environment jsdom
/**
 * SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» (T4.1; R65, R214) — el
 * detalle de bodega de `CierresBodegaAdminModule` (audiencia admin = la central) pinta, sin cambios de
 * pantalla, los dos valores que ahora le llegan del servidor: la fecha del cargo de fulfillment en la
 * nota de la tarjeta y «Sin tarifa de pago» en la celda «Señales», en el conteo «Con señales» y en la
 * columna «Señales» de «Descargar».
 *
 * Los textos esperados van escritos a mano (nunca con `fechaCorta` ni con `textoSenales`). La fecha
 * del doble cae en otro día en UTC que en Costa Rica (03/11 21:30 CR = 04/11 03:30 UTC), para que la
 * nota no pueda acertar por casualidad con el día UTC.
 *
 * Se pone rojo (comprobado, `progress/impl_SLT-110.md`) con `tarifaFaltante: false` o con la fecha nula
 * en el caso positivo.
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import type { CierreDetalleGestion, TotalesIngresoEmpresa } from "@/lib/interfaces/services/ICierreDiaService";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  show: vi.fn(),
  dismiss: vi.fn(),
}));
type Descarga = { titulo: string; columnas: DescargaColumna[]; obtenerFilas?: () => Promise<{ filas?: DescargaFila[] }> };
const { descargas } = vi.hoisted(() => ({ descargas: [] as Descarga[] }));

vi.mock("@/lib/actions/cierre-bodega", () => ({
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaCompleto: vi.fn(),
  listarGestionesCierresBodegaCompleto: vi.fn(),
}));
vi.mock("@/lib/actions/conciliacion-satelites", () => ({
  marcarConsolidacionRecibidaAction: vi.fn(),
  corregirConsolidacionRecibidaAction: vi.fn(),
  revertirConciliacionAction: vi.fn(),
  listarSaldosSatelitesAction: vi.fn(),
  listarSaldosSatelitesCompletoAction: vi.fn(),
  listarConsolidacionesSateliteAction: vi.fn(),
  listarConsolidacionesSateliteCompletoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));
// El botón real genera un Excel: aquí guarda lo que recibe, para afirmar columnas y filas.
vi.mock("@/components/shared/DescargarDatasetButton", () => ({
  DescargarDatasetButton: (p: Descarga) => {
    descargas.push(p);
    return (
      <button type="button" aria-label={`Descargar ${p.titulo}`}>
        Descargar
      </button>
    );
  },
}));

import {
  listarHistoricoCierresBodegaPaginado,
  listarPendientesCierresBodegaPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";
import { gestionCanvas, gestionFila, ingresoNuevo } from "@/tests/fixtures/gestion-cierre-fila";

type Ok = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;

const CERO_INGRESO: TotalesIngresoEmpresa = {
  montoCobrar: "0.00",
  flete: "0.00",
  ivaFlete: "0.00",
  fleteDevolucion: "0.00",
  ivaFleteDevolucion: "0.00",
  comisionCod: "0.00",
  ivaComisionCod: "0.00",
  fleteConIva: "0.00",
  comisionConIva: "0.00",
  fleteDevolucionConIva: "0.00",
  total: "0.00",
};

const PENDIENTE: CierreBodegaResumen = {
  cierreBodegaId: "b1b1b1b1-1111-4111-8111-0000c07b3e19",
  zonaId: "33333333-3333-4333-8333-333333333333",
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: { efectivo: "35000.00", simpe: "0.00", transferencia: "0.00", general: "35000.00" },
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
  cantidadCierres: 1,
  solicitadoAt: "2026-11-08T01:05:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
  paraLaCentral: "33500.00",
  efectivoCubreDescuentos: true,
  ...marcaSinConciliar("35000.00"),
};

/** Cargo de fulfillment a las 21:30 de Costa Rica del 3 de noviembre (04/11 en UTC). */
const CARGO_AT = "2026-11-04T03:30:00.000Z";

/**
 * La gestión que el servidor de SLT-110 ya emite en bodega: modelo nuevo, con fecha de cargo y sin
 * tarifa de pago congelada (`tarifaFaltante`). Sin ajustes, para que «Sin tarifa de pago» sea su
 * única señal.
 */
function gestionSinTarifa(fulfillmentCargadoAt: string | null): CierreDetalleGestion {
  return gestionCanvas({
    gestionId: "g-dora",
    numGuia: 7301,
    numRemision: "REM-DORA",
    destinatario: "Dora Quesada",
    ingresoEmpresa: ingresoNuevo({ fulfillmentCargadoAt }),
    pagoPorTarifa: null,
    pagoMensajero: "0.00",
    ajustesPago: [],
    tarifaFaltante: true,
  });
}

/** Otra gestión del mismo cierre del día, sin señales: el conteo no puede salir 1 por tener una sola fila. */
const GESTION_SIN_SENALES: CierreDetalleGestion = gestionFila({
  gestionId: "g-eli",
  numGuia: 7302,
  numRemision: "REM-ELI",
  destinatario: "Eli Mora",
});

const VACIOS = { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };

function detalle(gestion: CierreDetalleGestion): Ok {
  return {
    status: "ok",
    cierre: PENDIENTE,
    cierres: [
      {
        cierreDiaId: "cd-dora",
        mensajeroId: "m-dora",
        mensajeroNombre: "Dora Mensajera",
        totales: { efectivo: "35000.00", simpe: "0.00", transferencia: "0.00", general: "35000.00" },
        totalPagoMensajero: "1500.00",
        totalIngresoBodegaRechazos: "0.00",
        paraLaCentral: "33500.00",
        solicitadoAt: "2026-11-08T00:42:00.000Z",
        grupos: { ...VACIOS, entregado: [gestion, GESTION_SIN_SENALES] },
      },
    ],
    totalesIngreso: CERO_INGRESO,
    ivaFacturado: "0.00",
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    partesPorTienda: [],
    paraLaCentral: PENDIENTE.paraLaCentral,
    efectivoCubreDescuentos: true,
  } as unknown as Ok;
}

const NOMBRE_DIALOGO = "Detalle del cierre de bodega · Cierre de bodega · Limón";
const NOTA_SIN_FECHA = "No depende de esta gestión ni de este cierre.";

beforeEach(() => {
  vi.clearAllMocks();
  descargas.length = 0;
  vi.mocked(listarPendientesCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([PENDIENTE]) });
  vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([]) });
});
afterEach(cleanup);

/** Monta la cola de la central, abre el detalle de bodega y su pestaña «Gestiones (2)». */
async function abrirGestiones(gestion: CierreDetalleGestion) {
  vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle(gestion));
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresBodegaAdminModule
        pendientes={paginaInicial([PENDIENTE])}
        historico={paginaInicial([])}
        puedeConciliar
        audiencia="admin"
      />
    </SWRConfig>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }));
  const dialogo = await screen.findByRole("dialog", { name: NOMBRE_DIALOGO });
  await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (2)" }));
  return { user, dialogo };
}

async function desplegarDora(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement) {
  await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-DORA · Dora Quesada" }));
}

/** La descarga de «Gestiones» del detalle de bodega (la que lleva la columna Mensajero). */
function descargaDeBodega(): Descarga {
  const d = descargas.filter((x) => x.columnas.some((c) => c.clave === "mensajero")).at(-1);
  expect(d).toBeDefined();
  return d!;
}

describe("R65, R214 — la nota de Fulfillment lleva la fecha del cargo que manda el servidor", () => {
  it("con fecha: «Se cargó al saldo de la tienda el 03/11/2026, una vez por paquete. …»", async () => {
    const { user, dialogo } = await abrirGestiones(gestionSinTarifa(CARGO_AT));
    await desplegarDora(user, dialogo);
    expect(within(dialogo).getByRole("region", { name: /^Fulfillment · se cobró al crear la orden/ })).toBeTruthy();
    expect(
      within(dialogo).getByText(
        "Se cargó al saldo de la tienda el 03/11/2026, una vez por paquete. No depende de esta gestión ni de este cierre.",
      ),
    ).toBeTruthy();
    // El día UTC (04/11) nunca aparece: la fecha es la del calendario de Costa Rica.
    expect(within(dialogo).queryByText(/04\/11\/2026/)).toBeNull();
  });

  it("contraprueba: con fecha nula la nota es solo «No depende de esta gestión ni de este cierre.»", async () => {
    const { user, dialogo } = await abrirGestiones(gestionSinTarifa(null));
    await desplegarDora(user, dialogo);
    expect(within(dialogo).getByText(NOTA_SIN_FECHA)).toBeTruthy();
    expect(within(dialogo).queryByText(/Se cargó al saldo/)).toBeNull();
  });
});

describe("R214 — «Sin tarifa de pago» en la celda, en «Con señales» y en «Descargar»", () => {
  it("la celda «Señales» de la fila dice «Sin tarifa de pago» y el filtro cuenta «Con señales 1»", async () => {
    const { dialogo } = await abrirGestiones(gestionSinTarifa(CARGO_AT));
    const lista = within(dialogo).getByRole("region", { name: "Órdenes del cierre" });
    expect(within(lista).getAllByText("Sin tarifa de pago")).toHaveLength(1);
    const grupo = within(dialogo).getByRole("group", { name: "Filtrar por resultado" });
    expect(within(grupo).getByRole("button", { name: "Con señales 1" })).toBeTruthy();
    expect(within(grupo).getByRole("button", { name: "Todas 2" })).toBeTruthy();
  });

  it("la columna «Señales» de «Descargar» lleva «Sin tarifa de pago» en su fila y nada en la otra", async () => {
    await abrirGestiones(gestionSinTarifa(CARGO_AT));
    const d = descargaDeBodega();
    expect(d.columnas.at(-1)).toEqual({ clave: "senales", encabezado: "Señales" });
    const filas = (await d.obtenerFilas!()).filas ?? [];
    const senalesPorGuia = Object.fromEntries(filas.map((f) => [String(f.numGuia), f.senales]));
    expect(senalesPorGuia).toEqual({ "7301": "Sin tarifa de pago", "7302": null });
  });
});
