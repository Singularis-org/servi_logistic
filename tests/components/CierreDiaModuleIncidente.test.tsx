// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import { deshacerGestion, solicitarCierre } from "@/lib/actions/cierre-dia";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreTotales,
  CierreResultado,
} from "@/lib/interfaces/services/ICierreDiaService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";

// Feature 158 (T2.2 — R18/R17/Q-D) → SLT-108 (R58, R162) → SLT-109 «/cierre-dia: el cierre de hoy,
// rechazado o vencido como página» (R242, R256) — el incidente en el cierre de HOY del mensajero, que
// ahora es la lista única de «Gestiones». Lo que este archivo protege:
//   - que el incidente es un resultado PROPIO, con su filtro y su causa (R18, R9 de la 158);
//   - que su «Ganancia» es el `pagoMensajero` del servidor, «—» si es nulo, en la fila y en el
//     archivo, y que la indemnización (plata de la tienda, design §7.2) no sale en ninguno (R256);
//   - que el «Devolver a gestión» SÍ se ofrece sobre un incidente (Q-D/R14: se puede deshacer).
// Lo que se fue con la tabla por resultado: «el grupo vacío no se pinta» (la lista no tiene secciones)
// y las cabeceras de columna propias de cada sección.
vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  // Feature 170 — FASE 2 (T I.2): «Cierres solicitados» llega paginado del servidor.
  listarCierresPasadosPaginado: vi.fn(async () => ({
    status: "ok" as const,
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  })),
}));

const { successMock, errorMock, refreshMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

// El botón real genera un Excel: aquí guarda lo que recibe, para afirmar columnas y filas.
type Descarga = { titulo: string; columnas: DescargaColumna[]; obtenerFilas?: () => Promise<{ filas?: DescargaFila[] }> };
const { descargas } = vi.hoisted(() => ({ descargas: [] as Descarga[] }));
vi.mock("@/components/shared/DescargarDatasetButton", () => ({
  DescargarDatasetButton: (p: Descarga) => {
    descargas.push(p);
    return <button type="button" aria-label={`Descargar ${p.titulo}`}>Descargar</button>;
  },
}));

/** La lista única de «Gestiones» del cierre de hoy (R242). */
function lista(): HTMLElement {
  return screen.getByRole("region", { name: "Órdenes del cierre" });
}

/** La fila única de esa gestión. */
function filaDe(gestionId: string): HTMLElement {
  const fila = lista().querySelector(`[data-gestion="${gestionId}"]`);
  expect(fila, `no hay fila para ${gestionId}`).not.toBeNull();
  return fila as HTMLElement;
}

const deshacerMock = vi.mocked(deshacerGestion);
const solicitarMock = vi.mocked(solicitarCierre);

function makeGestion(
  over: Partial<CierreDetalleGestion> & { gestionId: string; resultado: CierreResultado },
): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-07-11",
    numGuia: 1001,
    numRemision: "REM-001",
    destinatario: "Ana Pérez",
    direccion: "Calle 1, casa 2",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja mediana",
    tiendaNombre: "Tienda X",
    montoRecibido: null,
    metodoPago: null,
    // Feature 212/R31: el DTO gana el desglose y CONSERVA el escalar de arriba.
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false, // feature 237 (D6/R41): la registro el mensajero, no la tienda
    // Feature 158/R9/R19: campos POR RAMA del incidente; los casos del incidente los
    // sobreescriben.
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  };
}

function emptyGrupos(): CierreGrupos {
  return { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
}

const ZERO_TOTALES: CierreTotales = {
  efectivo: "0.00",
  simpe: "0.00",
  transferencia: "0.00",
  general: "0.00",
};

function renderModule(grupos: CierreGrupos) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <CierreDiaModule
      grupos={grupos}
      totales={ZERO_TOTALES}
      totalPagoMensajero="0.00"
      puedesSolicitar
      motivoBloqueo={null}
      cierresPasados={{ items: [], total: 0, pageSize: 25 }}
      bloqueo={SIN_BLOQUEO}
    />
    </SWRConfig>,
  );
}

/** Un incidente del día, con su motivo y su evidencia ya firmada por el servidor. */
function incidente(over: Partial<CierreDetalleGestion> = {}): CierreDetalleGestion {
  return makeGestion({
    gestionId: "gi1",
    resultado: "incidente",
    numRemision: "REM-INC",
    destinatario: "Beto Ruiz",
    motivo: "Caja aplastada en el furgón",
    evidenciaUrl: "https://signed.example/inc.jpg?token=abc", evidenciaUrls: ["https://signed.example/inc.jpg?token=abc"],
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  descargas.length = 0;
  deshacerMock.mockResolvedValue({ status: "ok", ordenId: "o-gi1" });
  solicitarMock.mockResolvedValue({
    status: "ok",
    cierreId: "c1",
    totales: ZERO_TOTALES,
    destinoTipo: "bodega_satelite",
  });
});

afterEach(() => {
  cleanup();
});

describe("R18 — el incidente es un resultado PROPIO de la lista del mensajero", () => {
  // SLT-109 (R242): ya no hay una sección por resultado; el incidente es un filtro propio de la
  // lista única, con su conteo, y su fila dice «Incidente».
  it("tiene su filtro «Incidente» con el conteo y su fila dice el resultado", () => {
    const grupos = emptyGrupos();
    grupos.incidente = [incidente()];
    renderModule(grupos);

    expect(screen.getByText("Incidente 1")).toBeInTheDocument();
    const fila = filaDe("gi1");
    expect(within(fila).getByText("Incidente")).toBeInTheDocument();
  });

  it("NO se mezcla con las devoluciones: cada una en su fila, con su resultado", () => {
    const grupos = emptyGrupos();
    grupos.incidente = [incidente()];
    grupos.novedad = [makeGestion({ gestionId: "gd1", resultado: "novedad", numRemision: "REM-DEV" })];
    renderModule(grupos);

    expect(within(filaDe("gi1")).queryByText("Novedad")).toBeNull();
    expect(within(filaDe("gd1")).queryByText("Incidente")).toBeNull();
    expect(screen.getByText("Novedad 1")).toBeInTheDocument();
  });

  it("la causa que él reportó sale en «Señales» (R9 de la 158)", () => {
    const grupos = emptyGrupos();
    grupos.incidente = [incidente({ causaIncidente: "perdido" })];
    renderModule(grupos);

    expect(within(filaDe("gi1")).getByText("Paquete perdido")).toBeInTheDocument();
  });

  it("la evidencia se abre desde la URL FIRMADA que llega del servidor", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.incidente = [incidente()];
    renderModule(grupos);

    await user.click(screen.getByRole("button", { name: "Detalle de la orden REM-INC · Beto Ruiz" }));
    await user.click(screen.getByRole("button", { name: "Ver evidencia de la orden REM-INC · Beto Ruiz" }));
    const dialog = await screen.findByRole("dialog", { name: "Evidencia de la gestión" });
    expect(within(dialog).getByRole("img", { name: "Evidencia fotográfica de la gestión" })).toHaveAttribute(
      "src",
      "https://signed.example/inc.jpg?token=abc",
    );
  });
});

// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R256; SLT-108 R58/R162):
// la «Ganancia» de un incidente es su `pagoMensajero`, en la fila y en el archivo; la indemnización
// (plata de la tienda, design §7.2) no aparece en ninguno de los dos.
describe("R256 — el incidente muestra la ganancia del mensajero, no la indemnización", () => {
  it("la fila del incidente dice su «Ganancia» con el pago del servidor", () => {
    const grupos = emptyGrupos();
    grupos.incidente = [incidente({ pagoMensajero: "350.00" })];
    renderModule(grupos);

    expect(within(lista()).getByText("Ganancia")).toBeInTheDocument();
    expect(within(filaDe("gi1")).getByText("₡350")).toBeInTheDocument();
  });

  it("sin pago (null) la fila pinta «—», nunca un cero", () => {
    const grupos = emptyGrupos();
    grupos.incidente = [incidente({ pagoMensajero: null })];
    renderModule(grupos);

    const fila = filaDe("gi1");
    expect(within(fila).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(fila).queryByText("₡0")).toBeNull();
  });

  it("la indemnización no aparece en la fila, aunque el doble la traiga", () => {
    const grupos = emptyGrupos();
    grupos.incidente = [incidente({ pagoMensajero: "350.00", indemnizacion: "48713.00" })];
    renderModule(grupos);

    expect(lista().textContent ?? "").not.toContain("48.713");
    expect(screen.queryByText(/indemniz/i)).toBeNull();
  });

  it("«Descargar» del cierre de hoy: «Gestiones del cierre de hoy», las siete columnas del mensajero y la ganancia del incidente", async () => {
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "ge1", resultado: "entregado", numGuia: 4321, montoRecibido: "300.00", pagoMensajero: "1700.00" }),
    ];
    grupos.incidente = [
      incidente({ numGuia: 5555, pagoMensajero: "350.00", indemnizacion: "48713.00", causaIncidente: "perdido" }),
      incidente({ gestionId: "gi2", numGuia: 6666, numRemision: "REM-INC2", pagoMensajero: null }),
    ];
    renderModule(grupos);

    expect(screen.getByRole("button", { name: "Descargar Gestiones del cierre de hoy" })).toBeInTheDocument();
    const d = descargas.find((x) => x.titulo === "Gestiones del cierre de hoy");
    expect(d?.columnas.map((c) => c.encabezado)).toEqual(["Nº Guía", "Destinatario", "Tienda", "Resultado", "Recibido", "Ganancia", "Señales"]);
    const filas = (await d!.obtenerFilas!()).filas;
    expect(filas).toEqual([
      { numGuia: 4321, destinatario: "Ana Pérez", tienda: "Tienda X", resultado: "Entregado", recibido: "300.00", ganancia: "1700.00", senales: null },
      { numGuia: 5555, destinatario: "Beto Ruiz", tienda: "Tienda X", resultado: "Incidente", recibido: null, ganancia: "350.00", senales: null },
      { numGuia: 6666, destinatario: "Beto Ruiz", tienda: "Tienda X", resultado: "Incidente", recibido: null, ganancia: null, senales: null },
    ]);
    expect(JSON.stringify(filas)).not.toContain("48713");
  });
});

describe("Q-D/R14, R243 — un incidente SE PUEDE devolver a gestión desde la lista", () => {
  it("ofrece «Devolver a gestión» en la fila del incidente y llama a la action", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.incidente = [incidente()];
    renderModule(grupos);

    await user.click(within(filaDe("gi1")).getByRole("button", { name: "Devolver a gestión la orden REM-INC · Beto Ruiz" }));
    const dialog = await screen.findByRole("dialog", { name: "Devolver la orden a gestión" });
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(deshacerMock).toHaveBeenCalledWith({ gestionId: "gi1" }));
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
