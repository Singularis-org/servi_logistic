// @vitest-environment jsdom
// SLT-113 «Excel del modelo nuevo de cierres» (T4.3; R370, R372, R376) — `DescargarCierresButton` en
// «Detalle · una fila por gestión» con una acción de dobles y `construirDescarga` ESPIADO (corre el
// real por debajo). La configuración que recibe el generador se compara con literales escritos a mano:
//   (a) solo cierres viejos → la configuración de HOY, sin `tituloHoja` ni `hojasAdicionales`;
//   (b) solo nuevo → «Gestiones» + «Rechazados por la tienda»;
//   (c) mixto → tres hojas en orden;
//   (d) satélite → «Gestiones» sin las tres columnas de fulfillment; central, con ellas.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import type { DescargaConfig } from "@/lib/types/descarga";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type {
  CierreGestionDescargaDTO,
  RechazoTiendaDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { CatalogoFiltrosCierresDTO, FiltrosDescargaGestiones } from "@/lib/types/filtros-cierres";
import { claveDeAmbitoDescarga } from "@/lib/columnas/preferencia-columnas";

const H = vi.hoisted(() => ({ blob: vi.fn(), toastError: vi.fn(), construir: vi.fn() }));
vi.mock("@/components/shared/descargar-blob", () => ({ descargarBlob: (...a: unknown[]) => H.blob(...a) }));
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

import {
  DescargarCierresButton,
  NIVEL_DETALLE_LABEL,
  SELECTOR_DISPARADOR,
} from "@/app/(app)/cierres-admin/_components/DescargarCierresButton";

// --- Dobles -----------------------------------------------------------------------------------

const MENSAJERO = "11111111-1111-4111-8111-111111111111";
const ZONA = "33333333-3333-4333-8333-333333333333";
const CATALOGO: CatalogoFiltrosCierresDTO = {
  zonas: [{ id: ZONA, nombre: "Centro" }],
  mensajeros: [{ id: MENSAJERO, nombre: "Mario Mensajero", zonaId: ZONA }],
  mensajerosFiltro: [{ id: MENSAJERO, nombre: "Mario Mensajero", zonaId: ZONA }],
};

function ingreso(over: Partial<IngresoEmpresaDTO>): IngresoEmpresaDTO {
  return {
    tarifaModelo: "nuevo",
    montoCobrar: null,
    cobraComision: false,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: null,
    total: "0.00",
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: null,
    ...over,
  };
}

function gestion(over: Partial<CierreGestionDescargaDTO>): CierreGestionDescargaDTO {
  return {
    mensajeroNombre: "Mario Mensajero",
    cierreSolicitadoAt: "2026-11-06T18:00:00.000Z",
    fechaGestion: "2026-11-06",
    diaReparto: "2026-11-05",
    fechaCreacionOrden: "2026-11-04",
    numGuia: 501,
    numRemision: "REM-A",
    destinatario: "Laura Díaz",
    direccion: "Calle 3",
    zonaNombre: "Centro",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja",
    tiendaNombre: "Tienda Sol",
    intentosContactoTienda: 0,
    intentosEntrega: 1,
    resultado: "entregado",
    montoRecibido: null,
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    esRechazoSla: false,
    causaIncidente: null,
    indemnizacion: null,
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    ingresoEmpresa: null,
    ...over,
  };
}

const NUEVA = gestion({
  folioCierre: "ABCD1234",
  cierreModelo: "nuevo",
  pagoMensajero: "1800.00",
  ingresoEmpresa: ingreso({ flete: "3500.00", ivaFlete: "455.00", total: "3955.00", ivaIncluido: "455.00", fulfillment: "600.00", ivaFulfillment: "78.00" }),
  pagoPorTarifa: null,
  ajustesPago: [],
  tarifaFaltante: false,
  fulfillmentCargadoDia: "2026-11-06",
});

const VIEJA = gestion({
  folioCierre: "EF567890",
  cierreModelo: "viejo",
  mensajeroNombre: "Rosa Mensajera",
  numGuia: 503,
  numRemision: "REM-C",
  destinatario: "Carla Soto",
  montoRecibido: "10000.00",
  pagos: [{ metodo: "SINPE", monto: "10000.00" }],
  pagoMensajero: "1500.00",
  ingresoEmpresa: ingreso({
    tarifaModelo: "viejo",
    montoCobrar: "10000.00",
    cobraComision: true,
    flete: "2000.00",
    ivaFlete: "260.00",
    comisionCod: "300.00",
    ivaComisionCod: "39.00",
    fleteConIva: "2260.00",
    comisionConIva: "339.00",
    total: "2599.00",
    fulfillment: "0.00",
    ivaFulfillment: "0.00",
  }),
  pagoPorTarifa: null,
  ajustesPago: [],
  tarifaFaltante: false,
  fulfillmentCargadoDia: null,
});

const R1: RechazoTiendaDescargaDTO = {
  folioCierre: "ABCD1234",
  numGuia: 777,
  destinatario: "Luis Vega",
  motivo: "No lo pidió",
  tiendaNombre: "Tienda Sol",
  fechaRechazo: "2026-11-05",
};

function accion(items: CierreGestionDescargaDTO[], rechazos?: RechazoTiendaDescargaDTO[]) {
  return vi.fn(async (_recorte: FiltrosDescargaGestiones) => ({
    status: "ok" as const,
    items,
    total: items.length,
    ...(rechazos === undefined ? {} : { rechazosDeTienda: rechazos }),
  }));
}

/** Las columnas del detalle que el usuario dejó MARCADAS: solo «Mensajero», «Nº Guía» y «Resultado». */
function marcarSoloTres() {
  const todas = [
    "mensajero", "fechaCierre", "fechaGestion", "diaReparto", "fechaCreacionOrden", "numGuia",
    "numRemision", "destinatario", "direccion", "ubicacion", "producto", "tienda", "intentosEntrega",
    "resultado", "montoCobrar", "fulfillment", "recibido", "pago_efectivo", "pago_SINPE",
    "pago_transferencia", "nuevaFecha", "origenRechazo", "causa", "motivo", "fleteConIva",
    "comisionConIva", "fleteDevolucionConIva", "ingresoTotal", "pagoMensajero", "ingresoBodega",
    "indemnizacion",
  ];
  const ocultas = todas.filter((c) => !["mensajero", "numGuia", "resultado"].includes(c));
  window.localStorage.setItem(claveDeAmbitoDescarga("cierres-gestiones"), JSON.stringify({ ocultas }));
}

async function descargarDetalle(acc: ReturnType<typeof accion>, audiencia: "admin" | "satelite"): Promise<DescargaConfig> {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <DescargarCierresButton
        resumen={{
          titulo: "Cierres de prueba",
          columnas: [{ clave: "folio", encabezado: "Folio" }],
          obtenerFilas: async () => ({ status: "ok", filas: [] }),
          ambitoColumnas: "slt113-resumen-de-prueba",
        }}
        catalogo={CATALOGO}
        accion={acc}
        audiencia={audiencia}
      />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: SELECTOR_DISPARADOR }));
  await user.click(await screen.findByRole("radio", { name: NIVEL_DETALLE_LABEL }));
  await user.keyboard("{Escape}");
  await user.click(await screen.findByRole("button", { name: "Descargar detallada por mensajero" }));
  await user.click(await screen.findByRole("button", { name: "Descargar Gestiones de cierres" }));
  // El generador se importa en dinámico (exceljs): con la suite en paralelo tarda más de 1 s.
  await waitFor(() => expect(H.blob).toHaveBeenCalled(), { timeout: 15_000 });
  expect(acc).toHaveBeenCalledTimes(1);
  expect(H.toastError).not.toHaveBeenCalled();
  expect(H.construir).toHaveBeenCalledTimes(1);
  return H.construir.mock.calls[0][0] as DescargaConfig;
}

beforeEach(() => {
  window.localStorage.clear();
  H.blob.mockReset();
  H.toastError.mockReset();
  H.construir.mockReset();
});
afterEach(cleanup);

describe("SLT-113 — el «Detalle» de cierres con el libro del modelo nuevo (T4.3)", () => {
  it("(a) solo cierres viejos: la configuración de hoy, sin tituloHoja ni hojasAdicionales (R370)", async () => {
    marcarSoloTres();
    const config = await descargarDetalle(accion([VIEJA], [R1]), "admin");
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Gestiones de cierres",
      columnas: [
        { clave: "mensajero", encabezado: "Mensajero" },
        { clave: "numGuia", encabezado: "Nº Guía" },
        { clave: "resultado", encabezado: "Resultado" },
      ],
      filas: [
        {
          mensajero: "Rosa Mensajera",
          fechaCierre: "2026-11-06",
          fechaGestion: "2026-11-06",
          diaReparto: "2026-11-05",
          fechaCreacionOrden: "2026-11-04",
          numGuia: 503,
          numRemision: "REM-C",
          destinatario: "Carla Soto",
          direccion: "Calle 3",
          ubicacion: "Centro · San José · Central · Carmen",
          producto: "Caja",
          tienda: "Tienda Sol",
          intentosEntrega: 1,
          resultado: "Entregado",
          montoCobrar: "10000.00",
          fulfillment: null,
          recibido: "10000.00",
          pago_efectivo: null,
          pago_SINPE: "10000.00",
          pago_transferencia: null,
          nuevaFecha: null,
          origenRechazo: null,
          causa: null,
          motivo: null,
          fleteConIva: "2260.00",
          comisionConIva: "339.00",
          fleteDevolucionConIva: null,
          ingresoTotal: "2599.00",
          pagoMensajero: "1500.00",
          ingresoBodega: null,
          indemnizacion: null,
        },
      ],
    });
    expect(Object.keys(config).sort()).toEqual(["columnas", "filas", "tipo", "titulo"]);
  });

  it("(b) solo nuevo: hoja «Gestiones» y segunda hoja «Rechazados por la tienda» (R372)", async () => {
    const config = await descargarDetalle(accion([NUEVA], [R1]), "admin");
    expect(config.tipo).toBe("xlsx");
    expect(config.titulo).toBe("Gestiones de cierres");
    expect(config.tituloHoja).toBe("Gestiones");
    expect(config.filas.map((f) => [f.folio, f.numGuia, f.cobroTienda, f.pagoMensajero])).toEqual([
      ["ABCD1234", 501, "3955.00", "1800.00"],
    ]);
    expect(config.hojasAdicionales?.map((h) => h.titulo)).toEqual(["Rechazados por la tienda"]);
    expect(config.hojasAdicionales?.[0].filas).toEqual([
      { folio: "ABCD1234", numGuia: 777, destinatario: "Luis Vega", motivo: "No lo pidió", tienda: "Tienda Sol", fechaRechazo: "2026-11-05" },
    ]);
  });

  it("(c) mixto: tres hojas en orden; la anterior con las columnas marcadas (R372, PA6)", async () => {
    marcarSoloTres();
    const config = await descargarDetalle(accion([VIEJA, NUEVA], []), "admin");
    expect([config.tituloHoja, ...(config.hojasAdicionales ?? []).map((h) => h.titulo)]).toEqual([
      "Gestiones",
      "Rechazados por la tienda",
      "Gestiones modelo anterior",
    ]);
    expect(config.filas.map((f) => f.numGuia)).toEqual([501]);
    expect(config.hojasAdicionales?.[0].filas).toEqual([]);
    const anterior = config.hojasAdicionales?.[1];
    expect(anterior?.columnas).toEqual([
      { clave: "mensajero", encabezado: "Mensajero" },
      { clave: "numGuia", encabezado: "Nº Guía" },
      { clave: "resultado", encabezado: "Resultado" },
    ]);
    expect(anterior?.filas.map((f) => f.numGuia)).toEqual([503]);
  });

  it("(d) satélite: «Gestiones» sin las columnas de fulfillment; la central, con ellas (R376)", async () => {
    const satelite = await descargarDetalle(accion([NUEVA], []), "satelite");
    const encabezadosSatelite = satelite.columnas.map((c) => c.encabezado);
    expect(encabezadosSatelite).toHaveLength(32);
    for (const ausente of ["Fulfillment", "IVA de fulfillment", "Fulfillment cargado el"]) {
      expect(encabezadosSatelite).not.toContain(ausente);
    }
    cleanup();
    H.construir.mockReset();
    H.blob.mockReset();

    const central = await descargarDetalle(accion([NUEVA], []), "admin");
    const encabezadosCentral = central.columnas.map((c) => c.encabezado);
    expect(encabezadosCentral).toHaveLength(35);
    expect(encabezadosCentral.slice(31, 34)).toEqual(["Fulfillment", "IVA de fulfillment", "Fulfillment cargado el"]);
    expect([central.filas[0].fulfillment, central.filas[0].ivaFulfillment, central.filas[0].fulfillmentCargadoDia]).toEqual([
      "600.00", "78.00", "2026-11-06",
    ]);
  });
});
