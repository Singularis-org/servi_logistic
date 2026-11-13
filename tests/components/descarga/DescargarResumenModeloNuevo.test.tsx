// @vitest-environment jsdom
// SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (T4.2; R377, R378, R382) —
// `DescargarCierresButton` en «Resumen · una fila por cierre» con los DOS constructores reales de la
// pantalla (`descargaColaCierres` y `descargaHistoricoCierres`), la lectura (`descargarDatos`) de
// dobles y `construirDescarga` ESPIADO (corre el real por debajo). La configuración que recibe el
// generador se compara con literales escritos a mano:
//   (a) solo cierres viejos, en las dos pestañas → la configuración de HOY, sin `tituloHoja` ni
//       `hojasAdicionales` (R377);
//   (b) solo nuevos → «Cierres» + «Por tienda», con el nombre de archivo de hoy (R378); en
//       «Pendientes», «Pago entregado» vacío (PA2), en «Resueltos», el del servidor;
//   (c) mixto con dos columnas desmarcadas → «Cierres modelo anterior» sin ellas, «Cierres» entera;
//   (d) audiencia satélite → «Cierres» sin «Pago entregado» (R382);
//   (e) un «Resumen» sin el campo nuevo (bodega hasta SLT-141) → la llamada de siempre.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/providers/ToastProvider";
import type { DescargaConfig } from "@/lib/types/descarga";
import type {
  CierreAdminResumen,
  CifrasCierreDescargaDTO,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { CatalogoFiltrosCierresDTO, FiltrosCierres } from "@/lib/types/filtros-cierres";
import { claveDeAmbitoDescarga } from "@/lib/columnas/preferencia-columnas";

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
// El módulo de la pantalla importa sus Server Actions; aquí no se llama a ninguna.
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
import { descargaColaCierres } from "@/app/(app)/cierres-admin/_components/CierresAdminModule";
import { descargaHistoricoCierres } from "@/app/(app)/cierres-admin/_components/CierresAdminHistoricoLista";

// --- Dobles -----------------------------------------------------------------------------------

const ZONA = "33333333-3333-4333-8333-333333333333";
const CATALOGO: CatalogoFiltrosCierresDTO = { zonas: [{ id: ZONA, nombre: "Centro" }], mensajeros: [], mensajerosFiltro: [] };
const FILTROS: FiltrosCierres = {};

function cierre(over: Partial<CierreAdminResumen>): CierreAdminResumen {
  return {
    cierreId: "00000000-0000-4000-8000-0000abcd1234",
    mensajeroId: "11111111-1111-4111-8111-111111111111",
    mensajeroNombre: "Mario Mensajero",
    estado: "aprobado",
    destinoTipo: "bodega_central",
    destinoZonaId: ZONA,
    destinoZonaNombre: "Centro",
    totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "500.00",
    incluyeModeloNuevo: true,
    pagoIndependienteEfectivo: true,
    pendientePagoMensajero: "1800.00",
    senalesCola: { incidentesSinIndemnizar: 0, pagosAjustados: 1, vuelvenABodega: 0 },
    solicitadoAt: "2026-11-06T18:00:00.000Z",
    resueltoAt: "2026-11-07T03:30:00.000Z",
    motivoRechazo: null,
    ...over,
  };
}

/** Nuevo y aprobado («Resueltos»). */
const N1 = cierre({});
/** Nuevo y solicitado («Pendientes»): el servidor no da «Pago entregado». */
const N2 = cierre({ cierreId: "00000000-0000-4000-8000-0000beef0002", estado: "solicitado", resueltoAt: null, pendientePagoMensajero: null });
/** Viejo y aprobado. */
const V1 = cierre({
  cierreId: "00000000-0000-4000-8000-0000cafe0003",
  mensajeroNombre: "Rosa Mensajera",
  incluyeModeloNuevo: false,
  pagoIndependienteEfectivo: false,
  totales: { efectivo: "10000.00", simpe: "0.00", transferencia: "0.00", general: "10000.00" },
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
});
/** Viejo y solicitado. */
const VP = cierre({ ...V1, cierreId: "00000000-0000-4000-8000-0000cafe0004", estado: "solicitado", resueltoAt: null });

const PARTES = [
  { tiendaNombre: "Tienda Norte", recaudado: "100000.00", pagoTienda: "94350.00", ganaLaTienda: "94350.00" },
  { tiendaNombre: "Tienda Sur", recaudado: "0.00", pagoTienda: "0.00", ganaLaTienda: "-2260.00" },
];
const CIFRAS_N1: CifrasCierreDescargaDTO = {
  cierreId: N1.cierreId,
  pagoTienda: "94350.00",
  ganaLaTienda: "92090.00",
  totalFacturado: "7910.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  gestiones: 2,
  pagoEntregado: "1200.00",
  partesPorTienda: PARTES,
};
const CIFRAS_N2: CifrasCierreDescargaDTO = { ...CIFRAS_N1, cierreId: N2.cierreId, pagoEntregado: null };

function respuesta(items: CierreAdminResumen[], cifras?: CifrasCierreDescargaDTO[]) {
  return { status: "ok" as const, items, total: items.length, ...(cifras === undefined ? {} : { cifrasModeloNuevo: cifras }) };
}

type Pestana = "pendientes" | "resueltos";
type Audiencia = "admin" | "satelite";

function resumenDe(pestana: Pestana, audiencia: Audiencia): DescargaResumenCierres {
  return pestana === "pendientes" ? descargaColaCierres(FILTROS, audiencia) : descargaHistoricoCierres(FILTROS, audiencia);
}

async function descargarResumen(resumen: DescargaResumenCierres, audiencia: Audiencia): Promise<DescargaConfig> {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <DescargarCierresButton resumen={resumen} catalogo={CATALOGO} accion={vi.fn()} audiencia={audiencia} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: `Descargar ${resumen.titulo}` }));
  // El generador se importa en dinámico (exceljs): con la suite en paralelo tarda más de 1 s.
  await waitFor(() => expect(H.blob).toHaveBeenCalled(), { timeout: 15_000 });
  expect(H.toastError).not.toHaveBeenCalled();
  expect(H.construir).toHaveBeenCalledTimes(1);
  return H.construir.mock.calls[0][0] as DescargaConfig;
}

beforeEach(() => {
  window.localStorage.clear();
  H.blob.mockReset();
  H.toastError.mockReset();
  H.construir.mockReset();
  H.datos.mockReset();
});
afterEach(cleanup);

const ENCABEZADOS_CIERRES_SATELITE = [
  "Folio", "Mensajero", "Destino", "Estado", "Solicitado", "Resuelto", "Efectivo", "SINPE",
  "Transferencia", "Recaudado", "Se le paga a la tienda", "Gana la tienda en total",
  "Pago al mensajero", "Pago a la bodega satélite", "Total facturado", "IVA facturado",
  "Le queda a la empresa", "Gestiones", "Pagos ajustados",
];

describe("SLT-140 — el «Resumen» de cierres con el libro del modelo nuevo (T4.2)", () => {
  it("(a) «Pendientes», solo viejos: la configuración de hoy, sin tituloHoja ni hojasAdicionales (R377)", async () => {
    H.datos.mockResolvedValue(respuesta([VP]));
    const config = await descargarResumen(resumenDe("pendientes", "admin"), "admin");
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(H.datos).toHaveBeenCalledWith("listarPendientesCierresAdminCompleto", { filtros: {} });
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres pendientes de decisión",
      columnas: [
        { clave: "estado", encabezado: "Estado" },
        { clave: "mensajero", encabezado: "Mensajero" },
        { clave: "fecha", encabezado: "Fecha" },
        { clave: "destino", encabezado: "Destino" },
        { clave: "general", encabezado: "Total general" },
        { clave: "pagoMensajero", encabezado: "Pago mensajero" },
        { clave: "ingresoBodega", encabezado: "Ingreso bodega" },
      ],
      filas: [
        {
          estado: "Solicitado",
          mensajero: "Rosa Mensajera",
          fecha: "2026-11-06",
          destino: "Bodega central · Centro",
          general: "10000.00",
          pagoMensajero: "1500.00",
          ingresoBodega: "0.00",
        },
      ],
    });
  });

  it("(a) «Resueltos», solo viejos y satélite: la configuración de hoy (R377)", async () => {
    H.datos.mockResolvedValue(respuesta([V1]));
    const config = await descargarResumen(resumenDe("resueltos", "satelite"), "satelite");
    expect(H.datos).toHaveBeenCalledWith("listarHistoricoCierresAdminCompleto", { filtros: {} });
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres del día resueltos",
      columnas: [
        { clave: "estado", encabezado: "Estado" },
        { clave: "mensajero", encabezado: "Mensajero" },
        { clave: "fechaResuelta", encabezado: "Fecha resuelta" },
        { clave: "destino", encabezado: "Destino" },
        { clave: "general", encabezado: "Total general" },
        { clave: "pagoMensajero", encabezado: "Pago mensajero" },
        { clave: "ingresoBodega", encabezado: "Ingreso bodega" },
        { clave: "motivo", encabezado: "Motivo" },
      ],
      filas: [
        {
          estado: "Aprobado",
          mensajero: "Rosa Mensajera",
          fechaResuelta: "2026-11-06",
          destino: "Bodega central · Centro",
          general: "10000.00",
          pagoMensajero: "1500.00",
          ingresoBodega: "0.00",
          motivo: null,
        },
      ],
    });
  });

  it("(b) «Resueltos», solo nuevos: «Cierres» + «Por tienda» con el nombre de archivo de hoy (R378)", async () => {
    H.datos.mockResolvedValue(respuesta([N1], [CIFRAS_N1]));
    const config = await descargarResumen(resumenDe("resueltos", "admin"), "admin");
    expect(H.datos).toHaveBeenCalledTimes(1);
    expect(config.tipo).toBe("xlsx");
    expect(config.titulo).toBe("Cierres del día resueltos");
    expect(config.tituloHoja).toBe("Cierres");
    expect(config.columnas).toHaveLength(20);
    expect(config.filas).toEqual([
      {
        folio: "ABCD1234",
        mensajero: "Mario Mensajero",
        destino: "Bodega central · Centro",
        estado: "Aprobado",
        solicitado: "2026-11-06",
        resuelto: "2026-11-06",
        efectivo: "70000.00",
        sinpe: "30000.00",
        transferencia: "0.00",
        recaudado: "100000.00",
        pagoTienda: "94350.00",
        ganaLaTienda: "92090.00",
        pagoMensajero: "3000.00",
        pagoBodega: "500.00",
        totalFacturado: "7910.00",
        ivaFacturado: "910.00",
        netoEmpresa: "3500.00",
        gestiones: 2,
        pagosAjustados: 1,
        pagoEntregado: "1200.00",
      },
    ]);
    expect(config.hojasAdicionales?.map((h) => h.titulo)).toEqual(["Por tienda"]);
    expect(config.hojasAdicionales?.[0].filas).toEqual([
      { folio: "ABCD1234", tienda: "Tienda Norte", recaudado: "100000.00", pagoTienda: "94350.00", ganaLaTienda: "94350.00" },
      { folio: "ABCD1234", tienda: "Tienda Sur", recaudado: "0.00", pagoTienda: "0.00", ganaLaTienda: "-2260.00" },
    ]);
  });

  it("(b) «Pendientes», solo nuevos: la misma hoja, con «Pago entregado» vacío (PA2, R382)", async () => {
    H.datos.mockResolvedValue(respuesta([N2], [CIFRAS_N2]));
    const config = await descargarResumen(resumenDe("pendientes", "admin"), "admin");
    expect(config.titulo).toBe("Cierres pendientes de decisión");
    expect(config.tituloHoja).toBe("Cierres");
    expect(config.columnas.map((c) => c.encabezado)).toEqual([...ENCABEZADOS_CIERRES_SATELITE, "Pago entregado"]);
    expect(config.filas.map((f) => [f.folio, f.estado, f.resuelto, f.pagoEntregado])).toEqual([
      ["BEEF0002", "Solicitado", null, null],
    ]);
  });

  it("(c) mixto con dos columnas desmarcadas: «Cierres modelo anterior» sin ellas y «Cierres» entera (R378)", async () => {
    window.localStorage.setItem(
      claveDeAmbitoDescarga("cierres-resueltos"),
      JSON.stringify({ ocultas: ["destino", "motivo"] }),
    );
    H.datos.mockResolvedValue(respuesta([V1, N1], [CIFRAS_N1]));
    const config = await descargarResumen(resumenDe("resueltos", "admin"), "admin");
    expect([config.tituloHoja, ...(config.hojasAdicionales ?? []).map((h) => h.titulo)]).toEqual([
      "Cierres",
      "Por tienda",
      "Cierres modelo anterior",
    ]);
    expect(config.columnas).toHaveLength(20);
    expect(config.filas.map((f) => f.folio)).toEqual(["ABCD1234"]);
    const anterior = config.hojasAdicionales?.[1];
    expect(anterior?.columnas).toEqual([
      { clave: "estado", encabezado: "Estado" },
      { clave: "mensajero", encabezado: "Mensajero" },
      { clave: "fechaResuelta", encabezado: "Fecha resuelta" },
      { clave: "general", encabezado: "Total general" },
      { clave: "pagoMensajero", encabezado: "Pago mensajero" },
      { clave: "ingresoBodega", encabezado: "Ingreso bodega" },
    ]);
    expect(anterior?.filas.map((f) => f.mensajero)).toEqual(["Rosa Mensajera"]);
  });

  it("(d) satélite: «Cierres» con 19 columnas, sin «Pago entregado» (R382)", async () => {
    H.datos.mockResolvedValue(respuesta([N1], [{ ...CIFRAS_N1, pagoEntregado: null }]));
    const config = await descargarResumen(resumenDe("resueltos", "satelite"), "satelite");
    expect(config.columnas.map((c) => c.encabezado)).toEqual(ENCABEZADOS_CIERRES_SATELITE);
    expect(config.filas[0]).not.toHaveProperty("pagoEntregado");
  });

  it("(e) un «Resumen» sin `obtenerFilasConColumnas` (bodega): la llamada de siempre, sin argumentos", async () => {
    const obtenerFilas = vi.fn(async () => ({ status: "ok" as const, filas: [{ folio: "X1" }] }));
    const config = await descargarResumen(
      {
        titulo: "Cierres de bodega de prueba",
        columnas: [{ clave: "folio", encabezado: "Folio" }],
        ambitoColumnas: "slt140-bodega-de-prueba",
        obtenerFilas,
      },
      "admin",
    );
    expect(obtenerFilas).toHaveBeenCalledTimes(1);
    expect(obtenerFilas).toHaveBeenCalledWith();
    expect(config).toEqual({
      tipo: "xlsx",
      titulo: "Cierres de bodega de prueba",
      columnas: [{ clave: "folio", encabezado: "Folio" }],
      filas: [{ folio: "X1" }],
    });
  });
});
