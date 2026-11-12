// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import { listarCierresPasadosPaginado, verCierrePasado } from "@/lib/actions/cierre-dia";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierrePasadoDTO,
  CierreTotales,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

/**
 * SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (T2.3; R59, R150-R154, R161).
 *
 * Monta `CierreDiaModule`, el composition root, y no `DetalleCierre` suelto: lo que se prueba es que
 * ESTA pantalla le pase al detalle único la audiencia mensajero, sus pestañas, la descarga del
 * mensajero y el visor de evidencia (memoria «El composition root que no inyecta»).
 *
 * Todos los esperados van escritos a mano. Las ausencias se afirman con valores que no pueden salir
 * por casualidad (₡2.100, el ingreso de bodega del cierre), nunca con un dígito suelto.
 */

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
  listarCierresPasadosCompleto: vi.fn(),
}));

const { errorMock, descargas } = vi.hoisted(() => ({
  errorMock: vi.fn(),
  descargas: [] as {
    titulo: string;
    columnas: DescargaColumna[];
    obtenerFilas?: () => Promise<{ status: string; filas?: DescargaFila[] }>;
  }[],
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: errorMock,
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// El botón de descarga real genera un Excel; aquí se sustituye por uno que guarda lo que recibe,
// para afirmar QUÉ columnas y filas le entrega esta pantalla.
vi.mock("@/components/shared/DescargarDatasetButton", () => ({
  DescargarDatasetButton: (p: (typeof descargas)[number]) => {
    descargas.push(p);
    return (
      <button type="button" aria-label={`Descargar ${p.titulo}`}>
        Descargar
      </button>
    );
  },
}));

const verCierrePasadoMock = vi.mocked(verCierrePasado);

const TOTALES_300: CierreTotales = {
  efectivo: "300.00",
  simpe: "0.00",
  transferencia: "0.00",
  general: "300.00",
};

const CIERRE_PASADO: CierrePasadoDTO = {
  cierreId: "c1d8a2b0-0000-4000-8000-0000aa11bb22",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  destinoZonaId: "z1",
  totales: TOTALES_300,
  totalPagoMensajero: "45.00",
  // Dinero de la empresa: el detalle del mensajero no lo pinta (R150).
  totalIngresoBodegaRechazos: "2100.00",
  solicitadoAt: "2026-07-11T16:00:00.000Z",
  resueltoAt: "2026-07-12T15:00:00.000Z",
  motivoRechazo: null,
};

const URL_FIRMADA = "https://signed.example/slt108-ana.jpg?token=xyz";

function entrega(): CierreDetalleGestion {
  return {
    gestionId: "g1",
    ordenId: "o-g1",
    fechaGestion: "2026-07-11",
    numGuia: 4321,
    numRemision: "REM-108",
    destinatario: "Ana Pérez",
    direccion: "Calle 1, casa 2",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja mediana",
    tiendaNombre: "Tienda X",
    resultado: "entregado",
    montoRecibido: "300.00",
    metodoPago: "efectivo",
    pagos: [{ metodo: "efectivo", monto: "300.00" }],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: URL_FIRMADA,
    evidenciaUrls: [URL_FIRMADA],
    pagoMensajero: "45.00",
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
  } as CierreDetalleGestion;
}

function grupos(): CierreGrupos {
  return {
    entregado: [entrega()],
    reprogramado: [],
    novedad: [],
    devolucion_a_origen_por_rechazo: [],
    incidente: [],
  };
}

function lecturaOk() {
  verCierrePasadoMock.mockResolvedValue({
    status: "ok",
    cierre: CIERRE_PASADO,
    grupos: grupos(),
    ordenesSinGestion: [
      {
        ordenId: "os1",
        numGuia: 9001,
        numRemision: "REM-SINGES",
        destinatario: "Eva Sin",
        producto: "Sobre",
        tiendaNombre: "Tienda X",
        zonaNombre: "GAM",
        estatusOrigen: null,
      },
    ],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
  });
}

function renderModule() {
  const pagina = paginaInicial([CIERRE_PASADO]);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "ok", page: 1, ...pagina });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={{ entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] }}
        totales={{ efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" }}
        totalPagoMensajero="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        cierresPasados={pagina}
        bloqueo={SIN_BLOQUEO}
      />
    </SWRConfig>,
  );
}

async function abrir() {
  const user = userEvent.setup();
  renderModule();
  const region = screen.getByRole("region", { name: "Cierres solicitados" });
  await user.click(within(region).getByRole("button", { name: /^Ver del cierre/ }));
  const dialogo = await screen.findByRole("dialog", { name: "Detalle del cierre · Tu cierre del día" });
  return { user, dialogo };
}

function cifra(dialogo: HTMLElement, rotulo: string): string {
  const grupo = within(within(dialogo).getByRole("group", { name: "Cifras del cierre" })).getByRole("group", {
    name: rotulo,
  });
  return grupo.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  descargas.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("R59 — «Ver» abre el detalle único con audiencia mensajero", () => {
  it("lee el cierre por su id y abre el diálogo «Tu cierre del día» con la nota de montos congelados", async () => {
    lecturaOk();
    const { dialogo } = await abrir();

    expect(verCierrePasadoMock).toHaveBeenCalledWith({ cierreId: "c1d8a2b0-0000-4000-8000-0000aa11bb22" });
    expect(within(dialogo).getByText("Los montos son los que quedaron congelados al solicitar el cierre.")).toBeInTheDocument();
    // R161: el comprobante ya no se monta.
    expect(screen.queryByRole("region", { name: "Comprobante detallado de tu cierre" })).toBeNull();
  });

  it("«Cerrar» cierra el detalle", async () => {
    lecturaOk();
    const { user, dialogo } = await abrir();
    // El pie del detalle (la X del diálogo también se llama «Cerrar»).
    const pie = dialogo.querySelector("footer") as HTMLElement;
    await user.click(within(pie).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog", { name: "Detalle del cierre · Tu cierre del día" })).toBeNull();
  });
});

describe("R150 — cabecera y tres cifras, sin el dinero de la empresa", () => {
  it("destino, folio y las cifras Recaudado ₡300, Gestiones 1 y Tu ganancia ₡45", async () => {
    lecturaOk();
    const { dialogo } = await abrir();

    expect(within(dialogo).getByText("AA11BB22")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Bodega central/)).toBeInTheDocument();
    expect(cifra(dialogo, "Recaudado")).toContain("₡300");
    expect(cifra(dialogo, "Gestiones")).toContain("1");
    expect(cifra(dialogo, "Tu ganancia")).toContain("₡45");
  });

  it("no pinta «Le queda a la empresa», «Cobro a la tienda», ₡2.100 ni la pestaña «Dinero»", async () => {
    lecturaOk();
    const { dialogo } = await abrir();

    expect(within(dialogo).queryByText(/Le queda a la empresa/)).toBeNull();
    expect(within(dialogo).queryByText(/Cobro a la tienda/)).toBeNull();
    expect(within(dialogo).queryByText(/₡2\.100/)).toBeNull();
    expect(within(dialogo).queryByRole("tab", { name: "Dinero" })).toBeNull();
  });
});

describe("R151 — pestañas «Gestiones» y «Rechazados por la tienda»", () => {
  it("abre en «Gestiones (1)» y ofrece «Rechazados por la tienda (0)» con su estado vacío", async () => {
    lecturaOk();
    const { user, dialogo } = await abrir();

    const gestiones = within(dialogo).getByRole("tab", { name: "Gestiones (1)" });
    expect(gestiones).toHaveAttribute("aria-selected", "true");
    await user.click(within(dialogo).getByRole("tab", { name: "Rechazados por la tienda (0)" }));
    expect(
      within(dialogo).getByText("Este cierre no tiene paquetes rechazados por la tienda."),
    ).toBeInTheDocument();
  });

  it("la fila única lleva «Ganancia» con el pago de la gestión y sin acciones de corrección", async () => {
    lecturaOk();
    const { dialogo } = await abrir();

    const panel = within(dialogo).getByRole("tabpanel");
    expect(within(panel).getByText("Ganancia")).toBeInTheDocument();
    expect(within(panel).getByText("₡45")).toBeInTheDocument();
    expect(within(panel).queryByText("Cobro a la tienda")).toBeNull();
    expect(within(panel).queryByRole("button", { name: /Corregir|Ajustar pago|Devolver a gestión/ })).toBeNull();
  });

  it("debajo lista las órdenes que pasaron a «Novedad interna»", async () => {
    lecturaOk();
    const { dialogo } = await abrir();

    const seccion = within(dialogo).getByRole("region", { name: "Pasaron a Novedad interna" });
    expect(within(seccion).getAllByRole("listitem")).toHaveLength(1);
    expect(within(seccion).getByText(/REM-SINGES/)).toBeInTheDocument();
  });
});

describe("R152 — «Descargar» en «Gestiones» con las columnas del mensajero", () => {
  it("siete columnas con «Ganancia», sin «Cobro a la tienda», y una fila por gestión", async () => {
    lecturaOk();
    const { dialogo } = await abrir();

    expect(
      within(dialogo).getByRole("button", { name: "Descargar Gestiones del cierre AA11BB22" }),
    ).toBeInTheDocument();
    const d = descargas.find((x) => x.titulo === "Gestiones del cierre AA11BB22");
    expect(d).toBeDefined();
    expect(d!.columnas.map((c) => c.encabezado)).toEqual([
      "Nº Guía",
      "Destinatario",
      "Tienda",
      "Resultado",
      "Recibido",
      "Ganancia",
      "Señales",
    ]);
    const r = await d!.obtenerFilas!();
    expect(r.filas).toEqual([
      {
        numGuia: 4321,
        destinatario: "Ana Pérez",
        tienda: "Tienda X",
        resultado: "Entregado",
        recibido: "300.00",
        ganancia: "45.00",
        senales: null,
      },
    ]);
  });
});

describe("R153 — si la lectura falla, avisa por toast y no abre el detalle", () => {
  it("`no_encontrada` → «Este cierre ya no está disponible.»", async () => {
    verCierrePasadoMock.mockResolvedValue({ status: "no_encontrada" });
    const user = userEvent.setup();
    renderModule();
    await user.click(screen.getByRole("button", { name: /^Ver del cierre/ }));

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalledWith("Este cierre ya no está disponible."));
    expect(errorMock).not.toHaveBeenCalledWith("No se pudo cargar el detalle de este cierre.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("otro fallo → «No se pudo cargar el detalle de este cierre.»", async () => {
    verCierrePasadoMock.mockResolvedValue({ status: "unauthenticated" });
    const user = userEvent.setup();
    renderModule();
    await user.click(screen.getByRole("button", { name: /^Ver del cierre/ }));

    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("No se pudo cargar el detalle de este cierre."),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("R154 — la evidencia abre el visor de /cierre-dia con la URL firmada", () => {
  it("desplegar la fila y pulsar «Ver evidencia» abre el visor con la URL del servidor", async () => {
    lecturaOk();
    const { user, dialogo } = await abrir();

    await user.click(within(dialogo).getByRole("button", { name: "Detalle de la orden REM-108 · Ana Pérez" }));
    await user.click(within(dialogo).getByRole("button", { name: /^Ver evidencia de la orden REM-108 · Ana Pérez/ }));

    const visor = await screen.findByRole("dialog", { name: "Evidencia de la gestión" });
    expect(
      within(visor).getByRole("img", { name: "Evidencia fotográfica de la gestión" }),
    ).toHaveAttribute("src", URL_FIRMADA);
  });
});
