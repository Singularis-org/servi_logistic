// @vitest-environment jsdom
//
// D39 y D40 — las pantallas que ya reciben del servidor si el dinero incluye el modelo nuevo.
//
// Todos los esperados son LITERALES a propósito. Comparar un texto contra la constante que lo pinta
// siempre pasa, también con la nota equivocada, y el contrato de estas deudas es justo que sin modelo
// nuevo cada frase quede idéntica a la de hoy.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";

const conceptosMock = vi.fn();
const listarConsolidacionesMock = vi.fn();

vi.mock("@/lib/actions/wallet", () => ({ listarMovimientosDeFilaAction: vi.fn() }));
vi.mock("@/lib/actions/wallet-filtros", () => ({
  conceptosConMovimientosAction: (...a: unknown[]) => conceptosMock(...a),
  cierresDeLaCuentaAction: vi.fn(),
  quienesDelLibroCajaAction: vi.fn(async () => ({ status: "ok", opciones: [], hayMas: false })),
}));
vi.mock("@/lib/actions/conciliacion-satelites", () => ({
  corregirConsolidacionRecibidaAction: vi.fn(),
  listarConsolidacionesSateliteAction: (...a: unknown[]) => listarConsolidacionesMock(...a),
  listarConsolidacionesSateliteCompletoAction: vi.fn(),
  marcarConsolidacionRecibidaAction: vi.fn(),
  revertirConciliacionAction: vi.fn(),
}));
vi.mock("@/lib/actions/cierre-bodega", () => ({
  listarCierresBodegaSolicitadosPaginado: vi.fn(),
  listarCierresBodegaSolicitadosCompleto: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaCompleto: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import {
  listarCierresBodegaSolicitadosPaginado,
  listarHistoricoCierresBodegaPaginado,
} from "@/lib/actions/cierre-bodega";
import { CascadasCierreMensajero } from "@/app/(app)/cierres-admin/_components/CascadasCierreMensajero";
import { CierresBodegaResueltosLista } from "@/app/(app)/cierres-admin/_components/CierresBodegaResueltosLista";
import { CierresBodegaSolicitadosLista } from "@/app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista";
import { DesglosePorTienda } from "@/app/(app)/cierres-admin/_components/DesglosePorTienda";
import { CierreBodegaFacturaResumen } from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { ComposicionGananciaCard } from "@/app/(app)/wallet/_components/ComposicionGananciaCard";
import { FILTROS_VACIOS } from "@/app/(app)/wallet/_components/wallet-filtros-input";
import { COMPOSICION_IVA_LABEL } from "@/app/(app)/wallet/_components/wallet-labels";
import { ConciliacionSatelite } from "@/app/(app)/wallet/satelites/_components/ConciliacionSatelite";
import type { TotalesIngresoEmpresa } from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { ConsolidacionSateliteDTO } from "@/lib/types/conciliacion-satelites";
import type { CajaResumenDTO, ComposicionGananciaDTO, DesgloseEgresosDTO } from "@/lib/types/wallet";
import type { ParteDeTienda } from "@/lib/utils/ingreso-empresa";
import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";
import { LibroCajaBarraControlada } from "@/tests/fixtures/libro-caja-barra";
import { ToastProvider } from "@/providers/ToastProvider";

// ── Los textos del contrato, escritos a mano ──────────────────────────────────────────────────

const VIEJO = {
  paraLaCentral:
    "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por las devoluciones a origen.",
  ganaBodega:
    "Lo que se le reconoce a la bodega satélite por las devoluciones a origen. No es un movimiento de caja registrado.",
  ganaTienda:
    "Lo recaudado menos todo lo que la empresa le factura, incluido el flete por devolución a origen. No es lo que se le paga hoy.",
  pagoHoy:
    "Es lo que se le paga de este dinero hoy. No es lo que gana en total: el flete por devolución a origen se le cobra aparte.",
  desglose:
    "«Se le paga hoy» y «Gana en total» no son la misma cifra: la diferencia es el flete por devolución a origen, que a la tienda se le cobra aparte, contra su saldo.",
  flete: "Flete por devolución a origen cobrado a la tienda",
  ivaFlete: "IVA del flete por devolución a origen cobrado a la tienda",
};

const NUEVO = {
  paraLaCentral:
    "Lo recaudado menos el pago a los mensajeros y menos lo que gana la bodega satélite por sus gestiones.",
  ganaBodega:
    "Lo que se le reconoce a la bodega satélite por sus gestiones. No es un movimiento de caja registrado.",
  ganaTienda:
    "Lo recaudado menos todo lo que la empresa le factura, incluido el flete de gestiones no entregadas. No es lo que se le paga hoy.",
  pagoHoy:
    "Es lo que se le paga de este dinero hoy. No es lo que gana en total: el flete de gestiones no entregadas se le cobra aparte.",
  desglose:
    "«Se le paga hoy» y «Gana en total» no son la misma cifra: la diferencia es el flete de gestiones no entregadas, que a la tienda se le cobra aparte, contra su saldo.",
  flete: "Flete de gestiones no entregadas cobrado a la tienda",
  ivaFlete: "IVA del flete de gestiones no entregadas cobrado a la tienda",
};

/** Sin modelo nuevo, `false` y ausente tienen que leerse igual. */
const SIN_MODELO_NUEVO: readonly [string, boolean | undefined][] = [
  ["ausente", undefined],
  ["false", false],
];

function conSWR(ui: ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

// ── D40 — la conciliación de la satélite (maestro y admin) ────────────────────────────────────

const CONSOLIDACION: ConsolidacionSateliteDTO = {
  cierreBodegaId: "cb-1",
  solicitadoAt: "2026-09-15T14:00:00.000Z",
  totales: { efectivo: "12500.25", simpe: "70890.40", transferencia: "1000.10", general: "84390.75" },
  pagoMensajero: "15000.00",
  gananciaSatelite: "2300.50",
  paraLaCentral: "67090.25",
  montoRecibido: "60000.00",
  faltaPorRecibir: "7090.25",
  conciliado: true,
  desmarcable: false,
  conciliadoAt: "2026-09-15T17:40:00.000Z",
  conciliadoPorNombre: "Ana Rojas",
  nota: null,
  cantidadCierres: 2,
};

async function cuentaDeConsolidacion(incluyeModeloNuevo: boolean | undefined): Promise<HTMLElement> {
  listarConsolidacionesMock.mockResolvedValue({
    status: "ok",
    items: [{ ...CONSOLIDACION, ...(incluyeModeloNuevo === undefined ? {} : { incluyeModeloNuevo }) }],
    total: 1,
    page: 1,
    pageSize: 25,
  });
  conSWR(
    <ConciliacionSatelite
      bodega={{ zonaId: "z-1", zonaNombre: "Bodega Norte" }}
      pendiente="43300.60"
      puedeConciliar
    />,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Ver la cuenta de la consolidación del 15 sept" }),
  );
  return screen.getByRole("region", { name: "Lo que va a la central · consolidación del 15 sept" });
}

describe("D40 — la cuenta de una consolidación", () => {
  it("con modelo nuevo, las dos notas dicen «sus gestiones», junto a sus cifras", async () => {
    const cuenta = await cuentaDeConsolidacion(true);
    expect(within(cuenta).getByText(NUEVO.ganaBodega)).toBeInTheDocument();
    expect(within(cuenta).getByText(NUEVO.paraLaCentral)).toBeInTheDocument();
    expect(cuenta.textContent).not.toContain("devoluciones a origen");
    expect(cuenta.textContent).toContain("-₡2.300,50");
    expect(cuenta.textContent).toContain("₡67.090,25");
  });

  it.each(SIN_MODELO_NUEVO)("sin modelo nuevo (%s), el texto de hoy", async (_nombre, valor) => {
    const cuenta = await cuentaDeConsolidacion(valor);
    expect(within(cuenta).getByText(VIEJO.ganaBodega)).toBeInTheDocument();
    expect(within(cuenta).getByText(VIEJO.paraLaCentral)).toBeInTheDocument();
    expect(cuenta.textContent).not.toContain("sus gestiones");
  });
});

// ── D40 — la tarjeta del cierre de bodega ─────────────────────────────────────────────────────

function cierreBodega(over: Partial<CierreBodegaResumen> = {}): CierreBodegaResumen {
  return {
    cierreBodegaId: "b1b1b1b1-1111-4111-8111-b1b1b1b1b1b1",
    zonaId: "33333333-3333-4333-8333-333333333333",
    zonaNombre: "Bodega Norte",
    solicitadoPorId: "u1",
    solicitadoPorNombre: "Sara Satélite",
    estado: "solicitado",
    totales: { efectivo: "100000.17", simpe: "26089.00", transferencia: "0.00", general: "126089.17" },
    totalPagoMensajero: "14000.55",
    totalIngresoBodegaRechazos: "250.25",
    cantidadCierres: 3,
    solicitadoAt: "2026-09-01T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    paraLaCentral: "111838.37",
    efectivoCubreDescuentos: true,
    ...marcaSinConciliar("100000.17"),
    ...over,
  };
}

async function desplegarTarjeta(): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Ver detalles del cierre de bodega de Bodega Norte" }),
  );
  return screen.getByRole("region", { name: "Lo que va a la central" });
}

describe("D40 — la tarjeta del cierre de bodega", () => {
  it("con modelo nuevo, la nota dice «sus gestiones», junto a la cifra", async () => {
    conSWR(<CierreBodegaFacturaResumen cierre={cierreBodega({ incluyeModeloNuevo: true })} />);
    const cascada = await desplegarTarjeta();
    expect(within(cascada).getByText(NUEVO.paraLaCentral)).toBeInTheDocument();
    expect(cascada.textContent).not.toContain("devoluciones a origen");
    expect(cascada.textContent).toContain("₡111.838,37");
  });

  it.each(SIN_MODELO_NUEVO)("sin modelo nuevo (%s), el texto de hoy", async (_nombre, valor) => {
    conSWR(
      <CierreBodegaFacturaResumen
        cierre={cierreBodega(valor === undefined ? {} : { incluyeModeloNuevo: valor })}
      />,
    );
    const cascada = await desplegarTarjeta();
    expect(within(cascada).getByText(VIEJO.paraLaCentral)).toBeInTheDocument();
    expect(cascada.textContent).not.toContain("sus gestiones");
  });

  it("el `adminSatelite` en sus solicitados y el maestro en los resueltos leen la misma nota", async () => {
    const fila = cierreBodega({ incluyeModeloNuevo: true });
    const pagina = { items: [fila], total: 1, pageSize: 10 };
    const respuesta = { status: "ok" as const, page: 1, ...pagina };
    vi.mocked(listarCierresBodegaSolicitadosPaginado).mockResolvedValue(respuesta);
    vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue(respuesta);

    const satelite = conSWR(<CierresBodegaSolicitadosLista initialData={pagina} />);
    expect(within(await desplegarTarjeta()).getByText(NUEVO.paraLaCentral)).toBeInTheDocument();
    satelite.unmount();

    conSWR(<CierresBodegaResueltosLista initialData={pagina} onAbrir={() => {}} />);
    expect(within(await desplegarTarjeta()).getByText(NUEVO.paraLaCentral)).toBeInTheDocument();
  });
});

// ── D40 — las notas del cierre de mensajero y su desglose ─────────────────────────────────────

const TOTALES_INGRESO: TotalesIngresoEmpresa = {
  montoCobrar: "285275.00",
  fleteConIva: "50000.00",
  fleteDevolucionConIva: "10848.00",
  comisionConIva: "10098.67",
  total: "70946.67",
  flete: "44247.79",
  ivaFlete: "5752.21",
  fleteDevolucion: "9600.00",
  ivaFleteDevolucion: "1248.00",
  comisionCod: "8936.88",
  ivaComisionCod: "1161.79",
};

const UNA_TIENDA: ParteDeTienda[] = [
  { tiendaId: "t-1", tiendaNombre: "Tienda Uno", recaudado: "285275.00", pagoTienda: "225176.33", ganaLaTienda: "214328.33" },
];

const DOS_TIENDAS: ParteDeTienda[] = [
  { tiendaId: "t-1", tiendaNombre: "Tienda Uno", recaudado: "200000.00", pagoTienda: "160000.33", ganaLaTienda: "152000.33" },
  { tiendaId: "t-2", tiendaNombre: "Tienda Dos", recaudado: "85275.00", pagoTienda: "65176.00", ganaLaTienda: "62328.00" },
];

function pintarCascadas(modeloNuevo: boolean | undefined, partes: ParteDeTienda[] = UNA_TIENDA) {
  render(
    <CascadasCierreMensajero
      mensajeroNombre="Ana"
      estado="solicitado"
      general="285275.00"
      totalesIngreso={TOTALES_INGRESO}
      totalPagoMensajero="20000.00"
      totalIngresoBodegaRechazos="1000.00"
      pagoTienda="225176.33"
      cobradoSobreRecaudado="60098.67"
      ivaFacturado="8162.00"
      netoEmpresa="41784.67"
      ganaLaTienda="214328.33"
      fleteRechazoYaCobradoATienda={false}
      partesPorTienda={partes}
      {...(modeloNuevo === undefined ? {} : { modeloNuevo })}
    />,
  );
}

function regionDe(titulo: RegExp): HTMLElement {
  return screen.getByRole("region", { name: titulo });
}

describe("D40 — las dos notas del cierre de mensajero", () => {
  it("con modelo nuevo, «Gana la tienda» y «Pago a tienda» hablan de gestiones no entregadas", () => {
    pintarCascadas(true);
    const textoDeLaPagina = document.body.textContent ?? "";
    expect(screen.getByText(NUEVO.ganaTienda)).toBeInTheDocument();
    expect(screen.getByText(NUEVO.pagoHoy)).toBeInTheDocument();
    expect(textoDeLaPagina).not.toContain(VIEJO.ganaTienda);
    expect(textoDeLaPagina).not.toContain(VIEJO.pagoHoy);
    expect(textoDeLaPagina).toContain("₡214.328,33");
    expect(textoDeLaPagina).toContain("₡225.176,33");
  });

  it.each(SIN_MODELO_NUEVO)("sin modelo nuevo (%s), el texto de hoy", (_nombre, valor) => {
    pintarCascadas(valor);
    const textoDeLaPagina = document.body.textContent ?? "";
    expect(screen.getByText(VIEJO.ganaTienda)).toBeInTheDocument();
    expect(screen.getByText(VIEJO.pagoHoy)).toBeInTheDocument();
    expect(textoDeLaPagina).not.toContain(NUEVO.ganaTienda);
    expect(textoDeLaPagina).not.toContain(NUEVO.pagoHoy);
  });

  it("cada nota sigue en su línea: la de ganar no se cruza con la de pagar", () => {
    pintarCascadas(true);
    const particion = regionDe(/De quién es el dinero/);
    expect(within(particion).getByText(NUEVO.ganaTienda)).toBeInTheDocument();
    expect(within(particion).queryByText(NUEVO.pagoHoy)).toBeNull();
  });
});

describe("D40 — la nota del desglose por tienda", () => {
  it("con modelo nuevo, la diferencia es el flete de gestiones no entregadas", () => {
    render(<DesglosePorTienda partes={DOS_TIENDAS} de="cierre de Ana" modeloNuevo />);
    expect(screen.getByText(NUEVO.desglose)).toBeInTheDocument();
    expect(document.body.textContent).toContain("₡152.000,33");
    expect(document.body.textContent).not.toContain("flete por devolución a origen");
  });

  it.each(SIN_MODELO_NUEVO)("sin modelo nuevo (%s), el texto de hoy", (_nombre, valor) => {
    render(
      <DesglosePorTienda
        partes={DOS_TIENDAS}
        de="cierre de Ana"
        {...(valor === undefined ? {} : { modeloNuevo: valor })}
      />,
    );
    expect(screen.getByText(VIEJO.desglose)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("gestiones no entregadas");
  });

  it("el cierre de mensajero le pasa el modelo al desglose", () => {
    pintarCascadas(true, DOS_TIENDAS);
    expect(screen.getByText(NUEVO.desglose)).toBeInTheDocument();
  });
});

// ── D39 — la composición de la ganancia (maestro y admin) ─────────────────────────────────────

const DESGLOSE: DesgloseEgresosDTO = {
  gastoFijo: "300.00",
  gastoVariable: "125.50",
  sueldo: "800.00",
  indemnizacion: "25.25",
  total: "1250.75",
};

const COMPOSICION: ComposicionGananciaDTO = {
  ingresos: {
    ingreso_flete: "150.00",
    ingreso_flete_devolucion: "4000.00",
    ingreso_comision_cod: "900.00",
    ingreso_ajuste: "90.00",
    ingreso_cobro_tienda: "0.00",
  },
  totalIngresos: "5140.00",
  egresos: {
    egreso_pago_mensajero: "700.00",
    egreso_ajuste: "45.75",
    egreso_reverso_cobro_tienda: "0.00",
    egreso_reverso_flete_devolucion: "0.00",
    egreso_pago_plataforma: "0.00",
  },
  otrosEgresos: "194.25",
  hayOtrosEgresos: true,
  totalEgresos: "2190.75",
  iva: {
    ingreso_iva_flete: "19.50",
    ingreso_iva_flete_devolucion: "520.00",
    ingreso_iva_comision_cod: "30.25",
    egreso_reverso_iva_flete_devolucion: "0.00",
  },
  totalIva: "569.75",
};

const RESUMEN: CajaResumenDTO = {
  entradas: "18000.00",
  salidas: "2190.75",
  enCaja: "15809.25",
  signoEnCaja: "positivo",
  ingresosPropios: "5140.00",
  egresosPropios: "2190.75",
  ganancia: "2949.25",
  signoGanancia: "positivo",
  deTerceros: "12290.25",
  periodoFiltrado: false,
  porcentajeTiendas: "77.74",
  modoComposicion: "dos_bolsillos",
  capital: "0.00",
  signoCapital: "cero",
  deEmpresa: "3519.00",
  signoDeTerceros: "positivo",
  deTercerosAbsoluto: "12290.25",
  estado: "flujo",
  flujoDesde: "2026-08-25",
  iva: "569.75",
  signoIva: "positivo",
  porCobrarSatelites: "0.00",
  signoPorCobrarSatelites: "cero",
  porcentajePorCobrarSatelites: "0.00",
  deEmpresaEnCaja: "3519.00",
};

function pintarComposicion(categorias: ComposicionGananciaDTO["categoriasConModeloNuevo"]) {
  render(
    <ComposicionGananciaCard
      composicion={{ ...COMPOSICION, ...(categorias === undefined ? {} : { categoriasConModeloNuevo: categorias }) }}
      desglose={DESGLOSE}
      resumen={RESUMEN}
      filtros={FILTROS_VACIOS}
    />,
  );
}

/** Los pares rótulo ↔ importe tal como los lee quien mira la tarjeta. */
function filasDe(grupo: string): [string, string][] {
  const lista = screen.getByRole("group", { name: grupo });
  return [...lista.querySelectorAll("dt")].map((dt) => [
    dt.textContent ?? "",
    dt.parentElement?.querySelector("dd")?.textContent ?? "",
  ]);
}

const GRUPO_INGRESOS = "Desglose de ingresos";
const GRUPO_IVA = COMPOSICION_IVA_LABEL.grupo;

describe("D39 — la composición de la ganancia", () => {
  it("con las dos categorías, las dos filas se renombran y conservan su importe", () => {
    pintarComposicion(["ingreso_flete_devolucion", "ingreso_iva_flete_devolucion"]);
    expect(filasDe(GRUPO_INGRESOS)).toContainEqual([NUEVO.flete, "₡4.000"]);
    expect(filasDe(GRUPO_IVA)).toContainEqual([NUEVO.ivaFlete, "₡520"]);
    const rotulos = [...filasDe(GRUPO_INGRESOS), ...filasDe(GRUPO_IVA)].map(([rotulo]) => rotulo);
    expect(rotulos).not.toContain(VIEJO.flete);
    expect(rotulos).not.toContain(VIEJO.ivaFlete);
  });

  it("el reverso del IVA no se renombra: anula cobros por rechazo, donde «devolución a origen» es cierto", () => {
    pintarComposicion(["ingreso_flete_devolucion", "ingreso_iva_flete_devolucion"]);
    expect(filasDe(GRUPO_IVA)).toContainEqual(["IVA del flete por devolución a origen cobrado a la tienda anulado", "₡0"]);
  });

  it("cada categoría responde por sí misma: solo el flete, el IVA se queda con el de hoy", () => {
    pintarComposicion(["ingreso_flete_devolucion"]);
    expect(filasDe(GRUPO_INGRESOS)).toContainEqual([NUEVO.flete, "₡4.000"]);
    expect(filasDe(GRUPO_IVA)).toContainEqual([VIEJO.ivaFlete, "₡520"]);
  });

  it("cada categoría responde por sí misma: solo el IVA, el flete se queda con el de hoy", () => {
    pintarComposicion(["ingreso_iva_flete_devolucion"]);
    expect(filasDe(GRUPO_INGRESOS)).toContainEqual([VIEJO.flete, "₡4.000"]);
    expect(filasDe(GRUPO_IVA)).toContainEqual([NUEVO.ivaFlete, "₡520"]);
  });

  it.each([
    ["ausente", undefined],
    ["vacía", []],
  ] as const)("sin modelo nuevo (lista %s), los textos de hoy", (_nombre, valor) => {
    pintarComposicion(valor === undefined ? undefined : [...valor]);
    expect(filasDe(GRUPO_INGRESOS)).toContainEqual([VIEJO.flete, "₡4.000"]);
    expect(filasDe(GRUPO_IVA)).toContainEqual([VIEJO.ivaFlete, "₡520"]);
    expect(document.body.textContent).not.toContain("gestiones no entregadas");
  });

  it("las demás filas no cambian de nombre con el modelo nuevo", () => {
    pintarComposicion(["ingreso_flete_devolucion", "ingreso_iva_flete_devolucion"]);
    expect(filasDe(GRUPO_INGRESOS)).toContainEqual(["Flete cobrado a la tienda", "₡150"]);
    expect(filasDe(GRUPO_IVA)).toContainEqual(["IVA del flete cobrado a la tienda", "₡19,50"]);
  });
});

// ── D39 — el filtro de concepto del libro de la caja (maestro y admin) ────────────────────────

async function opcionesDelFiltro(): Promise<string[]> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Concepto" }));
  const lista = await screen.findByRole("listbox");
  await within(lista).findAllByRole("option");
  return within(lista)
    .getAllByRole("option")
    .map((o) => o.textContent?.trim() ?? "");
}

function pintarBarra(conceptos: unknown[]) {
  conceptosMock.mockResolvedValue({ status: "ok", conceptos });
  conSWR(<LibroCajaBarraControlada activosIniciales={["categoria"]} />);
}

describe("D39 — el filtro de concepto del libro", () => {
  it("cada concepto del modelo nuevo se ofrece con su rótulo y su número", async () => {
    pintarBarra([
      { categoria: "ingreso_flete_devolucion", movimientos: 3, incluyeModeloNuevo: true },
      { categoria: "ingreso_iva_flete_devolucion", movimientos: 2, incluyeModeloNuevo: true },
    ]);
    await waitFor(() => expect(conceptosMock).toHaveBeenCalled());
    await screen.findByRole("combobox", { name: "Concepto" });
    await waitFor(async () => {
      expect(await opcionesDelFiltro()).toEqual([`${NUEVO.flete} (3)`, `${NUEVO.ivaFlete} (2)`]);
    });
  });

  it("sin la marca, el rótulo de hoy; y la marca de un concepto no contagia al otro", async () => {
    pintarBarra([
      { categoria: "ingreso_flete_devolucion", movimientos: 3 },
      { categoria: "ingreso_iva_flete_devolucion", movimientos: 2, incluyeModeloNuevo: true },
    ]);
    await waitFor(() => expect(conceptosMock).toHaveBeenCalled());
    await waitFor(async () => {
      expect(await opcionesDelFiltro()).toEqual([`${VIEJO.flete} (3)`, `${NUEVO.ivaFlete} (2)`]);
    });
  });

  it("un concepto cuyo rótulo no depende del modelo no cambia aunque traiga la marca", async () => {
    pintarBarra([{ categoria: "egreso_sueldo", movimientos: 1, incluyeModeloNuevo: true }]);
    await waitFor(() => expect(conceptosMock).toHaveBeenCalled());
    await waitFor(async () => {
      expect(await opcionesDelFiltro()).toEqual(["Sueldo (1)"]);
    });
  });

  it("un concepto ajeno al catálogo de la caja no se ofrece, ni con la marca", async () => {
    pintarBarra([
      { categoria: "no_existe", movimientos: 9, incluyeModeloNuevo: true },
      { categoria: "egreso_sueldo", movimientos: 1 },
    ]);
    await waitFor(() => expect(conceptosMock).toHaveBeenCalled());
    await waitFor(async () => {
      expect(await opcionesDelFiltro()).toEqual(["Sueldo (1)"]);
    });
  });

  it("elegido del modelo nuevo y con 0 movimientos en el periodo nuevo: cae al rótulo de hoy", async () => {
    const user = userEvent.setup();
    const proveedor = new Map();
    const onCambiar = vi.fn();
    const montar = (desde: string) => (
      <SWRConfig value={{ provider: () => proveedor, dedupingInterval: 0 }}>
        <ToastProvider>
          <LibroCajaBarraControlada
            activosIniciales={["categoria"]}
            filtrosWallet={{ desde, hasta: "" }}
            onCambiar={onCambiar}
          />
        </ToastProvider>
      </SWRConfig>
    );
    conceptosMock.mockResolvedValue({
      status: "ok",
      conceptos: [{ categoria: "ingreso_flete_devolucion", movimientos: 3, incluyeModeloNuevo: true }],
    });
    const { rerender } = render(montar(""));
    await user.click(screen.getByRole("combobox", { name: "Concepto" }));
    await user.click(await screen.findByRole("option", { name: `${NUEVO.flete} (3)` }));
    await waitFor(() =>
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ categoria: "ingreso_flete_devolucion" })),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Concepto" })).toHaveTextContent(`${NUEVO.flete} (3)`),
    );

    conceptosMock.mockResolvedValue({ status: "ok", conceptos: [{ categoria: "egreso_sueldo", movimientos: 7 }] });
    rerender(montar("2026-01-01"));

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Concepto" })).toHaveTextContent(`${VIEJO.flete} (0)`),
    );
  });
});
