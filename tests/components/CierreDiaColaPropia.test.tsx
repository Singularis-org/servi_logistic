// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import { listarCierresPasadosPaginado, verCierrePasado } from "@/lib/actions/cierre-dia";
import type {
  CierrePasadoDTO,
  ResumenGananciaMensajero,
} from "@/lib/interfaces/services/ICierreDiaService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

/**
 * SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (T2.3; R60, R155-R158, R160,
 * R166, R181). Monta `CierreDiaModule`, el composition root, con una página de cuatro cierres y un
 * `total` de 7. Todos los esperados están escritos a mano desde los datos de abajo, nunca con las
 * funciones que los pintan: folio = últimos 8 del id en mayúsculas; 10:00 UTC = 04:00 en Costa Rica.
 */

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
  listarCierresPasadosCompleto: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/shared/DescargarDatasetButton", () => ({
  DescargarDatasetButton: (p: { titulo: string }) => (
    <button type="button" aria-label={`Descargar ${p.titulo}`}>Descargar</button>
  ),
}));
// R166: si la pantalla volviera a montar la tira de comprobantes, estos marcadores aparecerían.
vi.mock("@/app/(app)/cierres-admin/_components/ListaComprobantes", () => ({
  ListaComprobantes: () => <p>MARCADOR-LISTA-COMPROBANTES-Q7</p>,
}));
vi.mock("@/app/(app)/cierres-admin/_components/cierre-factura", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(app)/cierres-admin/_components/cierre-factura")>()),
  CierreFacturaResumenPropio: () => <p>MARCADOR-RESUMEN-PROPIO-Q7</p>,
}));

const CERO = { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" };

const APROBADO_PENDIENTE: CierrePasadoDTO = {
  cierreId: "c0000000-0000-4000-8000-0000aaaa1111",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  destinoZonaId: "z1",
  totales: { ...CERO, efectivo: "12500.00", general: "12500.00" },
  totalPagoMensajero: "875.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-07-11T10:00:00.000Z",
  resueltoAt: "2026-07-12T10:00:00.000Z",
  motivoRechazo: null,
  pendientePagoMensajero: "300.00",
};
const APROBADO_LIQUIDADO: CierrePasadoDTO = {
  ...APROBADO_PENDIENTE,
  cierreId: "c0000000-0000-4000-8000-0000bbbb2222",
  destinoTipo: "bodega_satelite",
  solicitadoAt: "2026-07-10T10:00:00.000Z",
  pendientePagoMensajero: "0.00",
};
const RECHAZADO: CierrePasadoDTO = {
  ...APROBADO_PENDIENTE,
  cierreId: "c0000000-0000-4000-8000-0000cccc3333",
  estado: "rechazado",
  solicitadoAt: "2026-07-09T10:00:00.000Z",
  motivoRechazo: "Faltan tres guías",
  pendientePagoMensajero: null,
};
const SOLICITADO: CierrePasadoDTO = {
  ...APROBADO_PENDIENTE,
  cierreId: "c0000000-0000-4000-8000-0000dddd4444",
  estado: "solicitado",
  solicitadoAt: "2026-07-08T10:00:00.000Z",
  resueltoAt: null,
  pendientePagoMensajero: null,
};
const CUATRO = [APROBADO_PENDIENTE, APROBADO_LIQUIDADO, RECHAZADO, SOLICITADO];

function montar(
  items: CierrePasadoDTO[] = CUATRO,
  total = 7,
  resumenGanancia?: ResumenGananciaMensajero,
) {
  const pagina = paginaInicial(items, { total });
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "ok", page: 1, ...pagina });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={{ entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] }}
        totales={CERO}
        totalPagoMensajero="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        cierresPasados={pagina}
        bloqueo={SIN_BLOQUEO}
        resumenGanancia={resumenGanancia}
      />
    </SWRConfig>,
  );
  return screen.getByRole("region", { name: "Cierres solicitados" });
}

/** Los textos de las celdas de la fila `n` (1 = la primera de datos). */
function celdas(region: HTMLElement, n: number): string[] {
  const fila = within(region).getAllByRole("row")[n];
  return within(fila).getAllByRole("cell").map((c) => c.textContent?.trim() ?? "");
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-137 · /cierre-dia: la cola de cierres con rol mensajero", () => {
  it("R155: descripción, una pestaña con el total, su tablist y UNA región «Cierres solicitados»", () => {
    montar();
    expect(screen.getByText("Tus cierres enviados a aprobación y cómo terminaron.")).toBeInTheDocument();
    const tablist = screen.getByRole("tablist", { name: "Tus cierres" });
    expect(within(tablist).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Cierres solicitados 7"]);
    expect(screen.getAllByRole("region", { name: "Cierres solicitados" })).toHaveLength(1);
  });

  it("R60/R156: ocho columnas en orden y la primera fila con folio, fecha, destino, estado e importes", () => {
    const region = montar();
    expect(within(region).getAllByRole("columnheader").map((h) => h.textContent?.trim())).toEqual([
      "Folio", "Solicitado", "Destino", "Estado", "Recaudado", "Ganancia", "Pago", "Acciones",
    ]);
    expect(celdas(region, 1).slice(0, 6)).toEqual([
      "#AAAA1111", "2026-07-11 04:00", "Bodega central", "Aprobado", "₡12.500", "₡875",
    ]);
    // El destino va sin la zona (R156): la satélite se nombra por su tipo.
    expect(celdas(region, 2)[2]).toBe("Bodega satélite");
  });

  it("R157: «Pago» dice pendiente, liquidado, el motivo del rechazo o «—»", () => {
    const region = montar();
    expect([1, 2, 3, 4].map((n) => celdas(region, n)[6])).toEqual([
      "Pendiente de pago",
      "Liquidado",
      "Motivo: «Faltan tres guías»",
      "—",
    ]);
  });

  it("R158/R357: sin las cifras del servidor, sin tarjetas de la ganancia ni ceros en su lugar", () => {
    montar();
    expect(screen.queryByRole("group", { name: "Ganancia de tus cierres" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ganancia pendiente de pago")).not.toBeInTheDocument();
    expect(screen.queryByText("Ganancia pagada este mes")).not.toBeInTheDocument();
    expect(screen.queryByText("Ningún pago este mes")).not.toBeInTheDocument();
  });

  it("R166: la pantalla ya no monta la tira de comprobantes ni su hoja resumida", () => {
    montar();
    expect(screen.queryByText("MARCADOR-LISTA-COMPROBANTES-Q7")).not.toBeInTheDocument();
    expect(screen.queryByText("MARCADOR-RESUMEN-PROPIO-Q7")).not.toBeInTheDocument();
  });

  it("R160: vacío con el texto de hoy", () => {
    const region = montar([], 0);
    expect(within(region).getByText("Aún no has solicitado ningún cierre.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cierres solicitados 0" })).toBeInTheDocument();
  });

  it("R160: error con el texto de hoy cuando la página no se puede leer", async () => {
    const user = userEvent.setup();
    // La página 1 llega del servidor; el error sale al pedir otra (sin `fallbackData`).
    const region = montar(CUATRO, 30);
    vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "error" } as never);
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(
      await within(region).findByText("No se pudieron cargar tus cierres solicitados."),
    ).toBeInTheDocument();
  });

  it("R160: la paginación va en el pie con su nombre y los tamaños de hoy", () => {
    montar();
    const nav = screen.getByRole("navigation", { name: "Paginación de los cierres solicitados" });
    const tamanos = within(nav).getByRole("combobox", { name: "Elementos por página" });
    expect(within(tamanos).getAllByRole("option").map((o) => o.textContent)).toEqual(["10", "25", "50"]);
  });

  it("R181: «Ver» queda deshabilitado y ocupado mientras lee, y al resolver abre el detalle", async () => {
    let resolver: (v: Awaited<ReturnType<typeof verCierrePasado>>) => void = () => {};
    vi.mocked(verCierrePasado).mockReturnValue(new Promise((r) => (resolver = r)));
    const region = montar();
    const user = userEvent.setup();
    const ver = within(region).getByRole("button", { name: "Ver del cierre del 2026-07-11" });

    await user.click(ver);
    expect(ver).toBeDisabled();
    expect(ver).toHaveAttribute("aria-busy", "true");
    // Solo la fila que se lee: la de otro cierre sigue activa.
    expect(within(region).getByRole("button", { name: "Ver del cierre del 2026-07-10" })).toBeEnabled();

    resolver({
      status: "ok",
      cierre: APROBADO_PENDIENTE,
      grupos: { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] },
      ordenesSinGestion: [],
      sinGestionRegistrado: true,
      rechazosDeTienda: [],
    });
    expect(
      await screen.findByRole("dialog", { name: "Detalle del cierre · Tu cierre del día" }),
    ).toBeInTheDocument();
    expect(vi.mocked(verCierrePasado)).toHaveBeenCalledWith({ cierreId: APROBADO_PENDIENTE.cierreId });
  });
});

// SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» (T5.4, R358). Los importes
// esperados son los que pinta `money()` escritos a mano: 47500.55 → «₡47.500,55», 3500.00 → «₡3.500».
describe("SLT-112 · /cierre-dia: las tarjetas de la ganancia (R358)", () => {
  const RESUMEN: ResumenGananciaMensajero = {
    pendiente: { monto: "47500.55", conteo: 2 },
    pagadaEsteMes: { monto: "3500.00", conteo: 2 },
  };

  /** Los textos de las dos cajas del grupo «Ganancia de tus cierres», en orden. */
  function cajas(): string[][] {
    const grupo = screen.getByRole("group", { name: "Ganancia de tus cierres" });
    return within(grupo)
      .getAllByRole("group")
      .map((caja) => [...caja.querySelectorAll("span")].map((s) => s.textContent?.trim() ?? ""));
  }

  it("con las cifras del servidor, dos tarjetas en orden con el importe y su nota", () => {
    montar(CUATRO, 7, RESUMEN);
    expect(cajas()).toEqual([
      ["Ganancia pendiente de pago", "₡47.500,55", "2 cierres aprobados sin liquidar"],
      ["Ganancia pagada este mes", "₡3.500", "2 pagos"],
    ]);
    expect(screen.getByRole("group", { name: "Ganancia pendiente de pago" }).className).toContain("bg-brand-soft");
    expect(screen.getByRole("group", { name: "Ganancia pagada este mes" }).className).not.toContain("bg-brand-soft");
  });

  it("van entre la barra y la tabla", () => {
    montar(CUATRO, 7, RESUMEN);
    const barra = screen.getByRole("region", { name: "Filtros de tus cierres" });
    const grupo = screen.getByRole("group", { name: "Ganancia de tus cierres" });
    const tabla = screen.getByRole("region", { name: "Cierres solicitados" });
    expect(barra.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grupo.compareDocumentPosition(tabla) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("también en cero, con las notas de cero y una sola de cada", () => {
    montar(CUATRO, 7, {
      pendiente: { monto: "0.00", conteo: 0 },
      pagadaEsteMes: { monto: "0.00", conteo: 0 },
    });
    expect(cajas()).toEqual([
      ["Ganancia pendiente de pago", "₡0", "Ningún cierre aprobado sin liquidar"],
      ["Ganancia pagada este mes", "₡0", "Ningún pago este mes"],
    ]);
  });

  it("con 1, las notas en singular", () => {
    montar(CUATRO, 7, {
      pendiente: { monto: "3500.00", conteo: 1 },
      pagadaEsteMes: { monto: "875.25", conteo: 1 },
    });
    expect(cajas().map((c) => c[2])).toEqual(["1 cierre aprobado sin liquidar", "1 pago"]);
  });

  it("paginar y filtrar no cambian las tarjetas", async () => {
    const user = userEvent.setup();
    montar(CUATRO, 30, RESUMEN);
    const antes = cajas();

    vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({
      status: "ok",
      ...paginaInicial([SOLICITADO], { total: 30 }),
      page: 2,
    });
    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(vi.mocked(listarCierresPasadosPaginado)).toHaveBeenCalled());
    expect(cajas()).toEqual(antes);

    await user.type(screen.getByPlaceholderText("Busca por folio"), "DDDD4444");
    await waitFor(() =>
      expect(vi.mocked(listarCierresPasadosPaginado)).toHaveBeenLastCalledWith(
        expect.objectContaining({ filtros: expect.objectContaining({ folio: "DDDD4444" }) }),
      ),
    );
    expect(cajas()).toEqual(antes);
  });
});
