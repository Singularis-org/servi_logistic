// @vitest-environment jsdom
// SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (T4.2; R384, R385, R386) — las TRES
// descargas de bodega con sus constructores reales de pantalla: «Por conciliar» (`descargaColaBodega`)
// y «Conciliados» (`descargaBodegaResueltos`) en `DescargarCierresButton`, y «Solicitados» de la
// satélite (`descargaBodegaSolicitados`) en `DescargarDatasetButton`. La lectura (`descargarDatos`) es
// un doble y `construirDescarga` va ESPIADO (corre el real por debajo). La configuración que recibe el
// generador se compara con literales escritos a mano:
//   (a) solo cierres viejos → la configuración de HOY en las tres pantallas (R384);
//   (b) mixto → «Cierres» como hoja principal + «Por tienda» + «Cierres modelo anterior» (R385);
//   (c) «Solicitados» sin «Pago entregado», aunque la respuesta lo trajera (R386).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import type { DescargaColumna, DescargaConfig } from "@/lib/types/descarga";
import type {
  CierreBodegaResumen,
  CifrasCierreBodegaCentralDescargaDTO,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type { CatalogoFiltrosCierresDTO, FiltrosCierresBodega } from "@/lib/types/filtros-cierres";

const H = vi.hoisted(() => ({ blob: vi.fn(), toastError: vi.fn(), construir: vi.fn(), datos: vi.fn() }));
vi.mock("@/components/shared/descargar-blob", () => ({ descargarBlob: (...a: unknown[]) => H.blob(...a) }));
vi.mock("@/components/shared/descarga-datos", () => ({ descargarDatos: (...a: unknown[]) => H.datos(...a) }));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: H.toastError, info: vi.fn(), warning: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/utils/descarga-dataset", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/utils/descarga-dataset")>();
  return {
    ...real,
    construirDescarga: (config: DescargaConfig, zona: string, fecha?: Date) => {
      H.construir(config);
      return real.construirDescarga(config, zona, fecha);
    },
  };
});
// Los módulos de pantalla importan sus Server Actions; aquí no se llama a ninguna.
vi.mock("@/lib/actions/cierres-admin", () => ({}));
vi.mock("@/lib/actions/cierre-bodega", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  DescargarCierresButton,
  type DescargaResumenCierres,
} from "@/app/(app)/cierres-admin/_components/DescargarCierresButton";
import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";
import { descargaColaBodega } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { descargaBodegaResueltos } from "@/app/(app)/cierres-admin/_components/CierresBodegaResueltosLista";
import { descargaBodegaSolicitados } from "@/app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista";

// --- Dobles -----------------------------------------------------------------------------------

const ZONA = "33333333-3333-4333-8333-333333333333";
const CATALOGO: CatalogoFiltrosCierresDTO = { zonas: [{ id: ZONA, nombre: "Centro" }], mensajeros: [], mensajerosFiltro: [] };
const FILTROS: FiltrosCierresBodega = {};

function bodega(over: Partial<CierreBodegaResumen>): CierreBodegaResumen {
  return {
    cierreBodegaId: "00000000-0000-4000-8000-0000b0de9a01",
    zonaId: ZONA,
    zonaNombre: "Centro",
    solicitadoPorId: "44444444-4444-4444-8444-444444444444",
    solicitadoPorNombre: "Sara Satélite",
    estado: "aprobado",
    totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "500.00",
    cantidadCierres: 1,
    solicitadoAt: "2026-11-07T03:00:00.000Z",
    resueltoAt: "2026-11-07T02:30:00.000Z",
    motivoRechazo: null,
    paraLaCentral: "96500.00",
    efectivoCubreDescuentos: true,
    conciliado: true,
    desmarcable: false,
    montoRecibido: "96000.00",
    faltaPorRecibir: "500.00",
    conciliadoAt: "2026-11-07T02:30:00.000Z",
    conciliadoPorNombre: "Ana Pérez",
    conciliadoNota: null,
    incluyeModeloNuevo: true,
    ...over,
  };
}

/** Nuevo: los literales de BN del design. */
const BN = bodega({});
/** Viejo, conciliado completo. */
const BV = bodega({
  cierreBodegaId: "00000000-0000-4000-8000-0000000c1a51",
  zonaNombre: "Norte",
  incluyeModeloNuevo: false,
  totales: { efectivo: "10000.00", simpe: "0.00", transferencia: "0.00", general: "10000.00" },
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
  paraLaCentral: "8500.00",
  montoRecibido: "8500.00",
  faltaPorRecibir: "0.00",
});

const CIFRAS_BN: CifrasCierreBodegaCentralDescargaDTO = {
  cierreBodegaId: BN.cierreBodegaId,
  gestiones: 3,
  pagosAjustados: 1,
  totalFacturado: "7910.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  ganaLaTienda: "92090.00",
  pagoEntregado: "3000.00",
  partesPorTienda: [
    { tiendaId: "t1", tiendaNombre: "Tienda Uno", recaudado: "70000.00", pagoTienda: "65480.00", ganaLaTienda: "63220.00" },
    { tiendaId: "t2", tiendaNombre: "Tienda Dos", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
  ],
};

function respuesta(items: CierreBodegaResumen[], cifras?: CifrasCierreBodegaCentralDescargaDTO[]) {
  return { status: "ok" as const, items, total: items.length, ...(cifras === undefined ? {} : { cifrasModeloNuevo: cifras }) };
}

// --- Literales a mano -------------------------------------------------------------------------

const COLUMNAS_PENDIENTES_HOY: DescargaColumna[] = [
  { clave: "zona", encabezado: "Zona" },
  { clave: "solicito", encabezado: "Solicitó" },
  { clave: "fecha", encabezado: "Fecha" },
  { clave: "cierresDelDia", encabezado: "Cierres del día" },
  { clave: "general", encabezado: "Total general" },
  { clave: "pagoMensajero", encabezado: "Pago mensajero" },
  { clave: "ingresoBodega", encabezado: "Ingreso bodega" },
  { clave: "paraLaCentral", encabezado: "Para la central" },
  { clave: "montoRecibido", encabezado: "Monto recibido" },
  { clave: "faltaPorRecibir", encabezado: "Falta por recibir" },
];
const FILA_PENDIENTE_BV = {
  zona: "Norte",
  solicito: "Sara Satélite",
  fecha: "2026-11-06",
  cierresDelDia: 1,
  general: "10000.00",
  pagoMensajero: "1500.00",
  ingresoBodega: "0.00",
  paraLaCentral: "8500.00",
  montoRecibido: "8500.00",
  faltaPorRecibir: "0.00",
};

const COLUMNAS_RESUELTOS_HOY: DescargaColumna[] = [
  { clave: "estado", encabezado: "Estado" },
  { clave: "zona", encabezado: "Zona" },
  { clave: "solicito", encabezado: "Solicitó" },
  { clave: "fechaResuelta", encabezado: "Fecha resuelta" },
  { clave: "general", encabezado: "Total general" },
  { clave: "pagoMensajero", encabezado: "Pago mensajero" },
  { clave: "ingresoBodega", encabezado: "Ingreso bodega" },
  { clave: "motivo", encabezado: "Motivo" },
  { clave: "paraLaCentral", encabezado: "Para la central" },
  { clave: "montoRecibido", encabezado: "Monto recibido" },
  { clave: "faltaPorRecibir", encabezado: "Falta por recibir" },
];
const FILA_RESUELTO_BV = {
  estado: "Recibido",
  zona: "Norte",
  solicito: "Sara Satélite",
  fechaResuelta: "2026-11-06",
  general: "10000.00",
  pagoMensajero: "1500.00",
  ingresoBodega: "0.00",
  motivo: null,
  paraLaCentral: "8500.00",
  montoRecibido: "8500.00",
  faltaPorRecibir: "0.00",
};

const COLUMNAS_SOLICITADOS_HOY: DescargaColumna[] = [
  { clave: "estado", encabezado: "Estado" },
  { clave: "fechaSolicitud", encabezado: "Fecha solicitud" },
  { clave: "cierresDelDia", encabezado: "Cierres del día" },
  { clave: "general", encabezado: "Total general" },
  { clave: "pagoMensajero", encabezado: "Pago mensajero" },
  { clave: "ingresoBodega", encabezado: "Ingreso bodega" },
  { clave: "motivo", encabezado: "Motivo" },
  { clave: "paraLaCentral", encabezado: "Para la central" },
  { clave: "montoRecibido", encabezado: "Monto recibido" },
  { clave: "faltaPorRecibir", encabezado: "Falta por recibir" },
];
const FILA_SOLICITADO_BV = {
  estado: "Recibido",
  fechaSolicitud: "2026-11-06",
  cierresDelDia: 1,
  general: "10000.00",
  pagoMensajero: "1500.00",
  ingresoBodega: "0.00",
  motivo: null,
  paraLaCentral: "8500.00",
  montoRecibido: "8500.00",
  faltaPorRecibir: "0.00",
};

/** «Cierres» de la satélite: las 25 columnas del documento, a mano. */
const COLUMNAS_CIERRES_SATELITE: DescargaColumna[] = [
  { clave: "folio", encabezado: "Folio" },
  { clave: "bodega", encabezado: "Bodega" },
  { clave: "destino", encabezado: "Destino" },
  { clave: "estado", encabezado: "Estado" },
  { clave: "solicitado", encabezado: "Solicitado" },
  { clave: "resuelto", encabezado: "Resuelto" },
  { clave: "efectivo", encabezado: "Efectivo", formato: "monto" },
  { clave: "sinpe", encabezado: "SINPE", formato: "monto" },
  { clave: "transferencia", encabezado: "Transferencia", formato: "monto" },
  { clave: "recaudado", encabezado: "Recaudado", formato: "monto" },
  { clave: "paraLaCentral", encabezado: "Debe llegar a la central", formato: "monto" },
  { clave: "ganaLaTienda", encabezado: "Gana la tienda en total", formato: "monto" },
  { clave: "pagoMensajero", encabezado: "Pago al mensajero", formato: "monto" },
  { clave: "pagoBodega", encabezado: "Pago a la bodega satélite", formato: "monto" },
  { clave: "totalFacturado", encabezado: "Total facturado", formato: "monto" },
  { clave: "ivaFacturado", encabezado: "IVA facturado", formato: "monto" },
  { clave: "netoEmpresa", encabezado: "Le queda a la empresa", formato: "monto" },
  { clave: "gestiones", encabezado: "Gestiones" },
  { clave: "pagosAjustados", encabezado: "Pagos ajustados" },
  { clave: "cierresIncluidos", encabezado: "Cierres incluidos" },
  { clave: "recibido", encabezado: "Recibido", formato: "monto" },
  { clave: "faltaPorRecibir", encabezado: "Falta por recibir", formato: "monto" },
  { clave: "estadoConciliacion", encabezado: "Estado de conciliación" },
  { clave: "conciliadoPor", encabezado: "Conciliado por" },
  { clave: "conciliadoEl", encabezado: "Conciliado el" },
];
/** «Cierres» de la central: las 26, con «Pago entregado» tras «Pagos ajustados». */
const COLUMNAS_CIERRES_CENTRAL: DescargaColumna[] = [
  ...COLUMNAS_CIERRES_SATELITE.slice(0, 19),
  { clave: "pagoEntregado", encabezado: "Pago entregado", formato: "monto" },
  ...COLUMNAS_CIERRES_SATELITE.slice(19),
];

const FILA_CIERRES_BN_SATELITE = {
  folio: "B0DE9A01",
  bodega: "Centro",
  destino: "Bodega central",
  estado: "Recibido incompleto",
  solicitado: "2026-11-06",
  resuelto: "2026-11-06",
  efectivo: "70000.00",
  sinpe: "30000.00",
  transferencia: "0.00",
  recaudado: "100000.00",
  paraLaCentral: "96500.00",
  ganaLaTienda: "92090.00",
  pagoMensajero: "3000.00",
  pagoBodega: "500.00",
  totalFacturado: "7910.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  gestiones: 3,
  pagosAjustados: 1,
  cierresIncluidos: 1,
  recibido: "96000.00",
  faltaPorRecibir: "500.00",
  estadoConciliacion: "Recibido incompleto",
  conciliadoPor: "Ana Pérez",
  conciliadoEl: "2026-11-06",
};
const FILA_CIERRES_BN_CENTRAL = { ...FILA_CIERRES_BN_SATELITE, pagoEntregado: "3000.00" };

const HOJA_POR_TIENDA_BN = {
  titulo: "Por tienda",
  columnas: [
    { clave: "folio", encabezado: "Folio" },
    { clave: "tienda", encabezado: "Tienda" },
    { clave: "recaudado", encabezado: "Recaudado", formato: "monto" },
    { clave: "pagoTienda", encabezado: "Se le paga hoy", formato: "monto" },
    { clave: "ganaLaTienda", encabezado: "Gana en total", formato: "monto" },
  ],
  filas: [
    { folio: "B0DE9A01", tienda: "Tienda Uno", recaudado: "70000.00", pagoTienda: "65480.00", ganaLaTienda: "63220.00" },
    { folio: "B0DE9A01", tienda: "Tienda Dos", recaudado: "30000.00", pagoTienda: "28870.00", ganaLaTienda: "28870.00" },
  ],
};

// --- Montaje ----------------------------------------------------------------------------------

async function esperarConfig(): Promise<DescargaConfig> {
  // El generador se importa en dinámico (exceljs): con la suite en paralelo tarda más de 1 s.
  await waitFor(() => expect(H.blob).toHaveBeenCalled(), { timeout: 15_000 });
  expect(H.toastError).not.toHaveBeenCalled();
  expect(H.construir).toHaveBeenCalledTimes(1);
  return H.construir.mock.calls[0][0] as DescargaConfig;
}

async function descargarCentral(resumen: DescargaResumenCierres): Promise<DescargaConfig> {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <DescargarCierresButton resumen={resumen} catalogo={CATALOGO} accion={vi.fn()} audiencia="admin" />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: `Descargar ${resumen.titulo}` }));
  return esperarConfig();
}

async function descargarSolicitados(): Promise<DescargaConfig> {
  const user = userEvent.setup();
  const descarga = descargaBodegaSolicitados(FILTROS);
  render(
    <ToastProvider>
      <DescargarDatasetButton {...descarga} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Descargar Cierres de bodega solicitados" }));
  return esperarConfig();
}

beforeEach(() => {
  window.localStorage.clear();
  H.blob.mockReset();
  H.toastError.mockReset();
  H.construir.mockReset();
  H.datos.mockReset();
});
afterEach(cleanup);

describe("SLT-141 — el «Resumen» de bodega con el libro del modelo nuevo (T4.2)", () => {
  it("(a) «Por conciliar», solo viejos: la configuración de hoy (R384)", async () => {
    H.datos.mockResolvedValue(respuesta([BV]));
    const config = await descargarCentral(descargaColaBodega(FILTROS, "admin"));
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(H.datos).toHaveBeenCalledWith("listarPendientesCierresBodegaCompleto", { filtros: {} });
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres de bodega pendientes",
      columnas: COLUMNAS_PENDIENTES_HOY,
      filas: [FILA_PENDIENTE_BV],
    });
  });

  it("(a) «Conciliados», solo viejos: la configuración de hoy (R384)", async () => {
    H.datos.mockResolvedValue(respuesta([BV]));
    const config = await descargarCentral(descargaBodegaResueltos(FILTROS, "admin"));
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(H.datos).toHaveBeenCalledWith("listarHistoricoCierresBodegaCompleto", { filtros: {} });
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres de bodega resueltos",
      columnas: COLUMNAS_RESUELTOS_HOY,
      filas: [FILA_RESUELTO_BV],
    });
  });

  it("(a) «Solicitados», solo viejos: la configuración de hoy (R384)", async () => {
    H.datos.mockResolvedValue(respuesta([BV]));
    const config = await descargarSolicitados();
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(H.datos).toHaveBeenCalledWith("listarCierresBodegaSolicitadosCompleto", { filtros: {} });
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres de bodega solicitados",
      columnas: COLUMNAS_SOLICITADOS_HOY,
      filas: [FILA_SOLICITADO_BV],
    });
  });

  it("(b) «Por conciliar», mixto: «Cierres» + «Por tienda» + «Cierres modelo anterior» (R385)", async () => {
    H.datos.mockResolvedValue(respuesta([BV, BN], [CIFRAS_BN]));
    const config = await descargarCentral(descargaColaBodega(FILTROS, "admin"));
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres de bodega pendientes",
      tituloHoja: "Cierres",
      columnas: COLUMNAS_CIERRES_CENTRAL,
      filas: [FILA_CIERRES_BN_CENTRAL],
      hojasAdicionales: [
        HOJA_POR_TIENDA_BN,
        { titulo: "Cierres modelo anterior", columnas: COLUMNAS_PENDIENTES_HOY, filas: [FILA_PENDIENTE_BV] },
      ],
    });
  });

  it("(b) «Conciliados», mixto: el mismo libro, con la fila de hoy de su pestaña en la anterior (R385)", async () => {
    H.datos.mockResolvedValue(respuesta([BV, BN], [CIFRAS_BN]));
    const config = await descargarCentral(descargaBodegaResueltos(FILTROS, "admin"));
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres de bodega resueltos",
      tituloHoja: "Cierres",
      columnas: COLUMNAS_CIERRES_CENTRAL,
      filas: [FILA_CIERRES_BN_CENTRAL],
      hojasAdicionales: [
        HOJA_POR_TIENDA_BN,
        { titulo: "Cierres modelo anterior", columnas: COLUMNAS_RESUELTOS_HOY, filas: [FILA_RESUELTO_BV] },
      ],
    });
  });

  it("(b, c) «Solicitados», mixto: el libro de la satélite, sin «Pago entregado» aunque llegara (R385, R386)", async () => {
    // Una respuesta que trajera la clave por error no la cuela en el archivo: la satélite no la ve.
    H.datos.mockResolvedValue(respuesta([BV, BN], [CIFRAS_BN]));
    const config = await descargarSolicitados();
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres de bodega solicitados",
      tituloHoja: "Cierres",
      columnas: COLUMNAS_CIERRES_SATELITE,
      filas: [FILA_CIERRES_BN_SATELITE],
      hojasAdicionales: [
        HOJA_POR_TIENDA_BN,
        { titulo: "Cierres modelo anterior", columnas: COLUMNAS_SOLICITADOS_HOY, filas: [FILA_SOLICITADO_BV] },
      ],
    });
    expect(config.columnas.map((c) => c.encabezado)).not.toContain("Pago entregado");
    expect(config.filas[0]).not.toHaveProperty("pagoEntregado");
  });
});
