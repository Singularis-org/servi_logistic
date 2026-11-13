// @vitest-environment jsdom
/**
 * SL-44 (defecto destapado por el E2E `e2e/cierre-bodega-satelite.spec.ts`) — tras «Solicitar
 * cierre de bodega», las DOS listas de la consolidación se vuelven a leer sin recargar.
 *
 * El defecto: `confirmarSolicitud` solo llamaba a `router.refresh()`. Las dos listas son `useSWR`
 * con la página del Server Component como `fallbackData`, que SWR usa una sola vez; con la caché
 * ya llena, la consolidación recién creada no salía en «Solicitados» (medido en el E2E: «Aún no
 * has solicitado ningún cierre de bodega.» después del aviso de éxito) y lo consolidado seguía en
 * «A consolidar». Mismo defecto y mismo arreglo que ya tienen `CierreDiaModule` y
 * `CierresAdminModule` (pedido humano del 2026-08-19).
 *
 * Mutación que lo tumba: quitar el `mutate(...)` de `confirmarSolicitud`.
 *
 * SLT-106 «Bodega satélite: A consolidar con la cola única» (T3.2): el módulo monta la cola única.
 * Se suman el diálogo con su resumen (R48, R207), el aviso, toast y refresco (R205), la rama sin
 * zona (R202) y lo que ya no se pinta (R204). Importes escritos a mano con el formato de `money()`
 * («₡9.000», «₡1.500», «₡250», «₡7.250», «₡500»).
 *
 * SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (T3.3): «Solicitados» con
 * filtros y conteo del servidor (R52, R290, R291 —la deuda R190/R191 de SLT-106—), «Ver» con el
 * detalle de bodega en lectura (R292-R294). La barra se dobla con un botón que llama a `onChange`
 * con un filtro fijo: la barra real se prueba en `FiltrosCierresBarraEstado.test.tsx`.
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type {
  CierreBodegaResumen,
  CierreConsolidableCola,
  ResumenSolicitados,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import type { CierreDetalleGestion, CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import type { FiltrosCierresBodega } from "@/lib/types/filtros-cierres";
import { marcaRecibida, marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";
import { gestionCanvas } from "@/tests/fixtures/gestion-cierre-fila";

const { consolidables, solicitados, solicitar, verDetalle, refresh, push, toastOk, toastError } =
  vi.hoisted(() => ({
    consolidables: vi.fn(),
    solicitados: vi.fn(),
    solicitar: vi.fn(),
    verDetalle: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    toastOk: vi.fn(),
    toastError: vi.fn(),
  }));

/** El filtro que «pone» la barra doblada (R52: rango de fecha de solicitud). */
const FILTRO: FiltrosCierresBodega = { desde: "2026-11-01", hasta: "2026-11-05" };

vi.mock("@/app/(app)/cierres-admin/_components/FiltrosCierresBarra", () => ({
  FiltrosCierresBarra: ({ onChange }: { onChange: (f: FiltrosCierresBodega) => void }) => (
    <button type="button" onClick={() => onChange(FILTRO)}>
      Aplicar filtro QK4
    </button>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/actions/cierre-bodega", () => ({
  listarGestionesCierresBodegaCompleto: vi.fn(),
  verCierreBodegaDetalle: (...a: unknown[]) => verDetalle(...a),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  solicitarCierreBodega: (...a: unknown[]) => solicitar(...a),
  listarCierresBodegaAdmin: vi.fn(),
  listarConsolidacion: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarConsolidablesPaginado: (...a: unknown[]) => consolidables(...a),
  listarCierresBodegaSolicitadosPaginado: (...a: unknown[]) => solicitados(...a),
  listarConsolidablesCompleto: vi.fn(),
  listarCierresBodegaSolicitadosCompleto: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push, replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: toastOk, error: toastError, warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

import { ConsolidacionBodegaModule } from "@/app/(app)/cierres-admin/_components/ConsolidacionBodegaModule";

const TOTALES: CierreTotales = { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" };

const CONSOLIDABLE: CierreConsolidableCola = {
  cierreDiaId: "cd-1",
  mensajeroId: "m-1",
  mensajeroNombre: "Mensajero Uno",
  totales: TOTALES,
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
  paraLaCentral: "7500.00",
  aprobadoAt: "2026-11-08T01:10:00.000Z",
  gestionesAjustadas: 0,
};

function pagina<T>(items: T[], total = items.length) {
  return { status: "ok" as const, items, page: 1, pageSize: 10, total };
}

/** R287: las cifras de las tarjetas de «Solicitados», escritas a mano. */
const RESUMEN: ResumenSolicitados = {
  porLlegar: { monto: "30700.00", cierres: 1 },
  recibido30Dias: { monto: "53500.00", cierres: 2 },
  faltaPorRecibir: { monto: "0.00", cierres: 0 },
};

type Props = Parameters<typeof ConsolidacionBodegaModule>[0];

function montar(over: Partial<Props> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConsolidacionBodegaModule
        consolidables={{ items: [CONSOLIDABLE], total: 1, pageSize: 10 }}
        totalesAgregados={TOTALES}
        totalPagoMensajeroAgregado="1500.00"
        totalIngresoBodegaRechazosAgregado="0.00"
        incluyeModeloNuevoAgregado={false}
        totalCentralDebeAgregado="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        paraLaCentralAgregado="7500.00"
        cierresAConsolidar={1}
        mensajerosAConsolidar={1}
        bloqueo={null}
        zonaNombre="Limón"
        cierresBodegaPasados={{ items: [], total: 0, pageSize: 10 }}
        solicitadosResumen={RESUMEN}
        sinZona={false}
        {...over}
      />
    </SWRConfig>,
  );
}

describe("ConsolidacionBodegaModule — refresco tras solicitar el cierre de bodega (SL-44)", () => {
  beforeEach(() => {
    consolidables.mockReset();
    solicitados.mockReset();
    solicitar.mockReset();
  });

  it("vuelve a leer «A consolidar» y «Solicitados» y pinta lo que devuelve el servidor", async () => {
    // Antes de solicitar: un consolidable y ningún solicitado. Después: al revés.
    let solicitado = false;
    consolidables.mockImplementation(async () => pagina(solicitado ? [] : [CONSOLIDABLE]));
    solicitados.mockImplementation(async () => pagina([]));
    solicitar.mockImplementation(async () => {
      solicitado = true;
      return { status: "ok", cierreBodegaId: "b-1", totales: TOTALES };
    });
    montar();
    await waitFor(() => expect(consolidables).toHaveBeenCalled());
    await waitFor(() => expect(solicitados).toHaveBeenCalled());
    const lecturasConsolidables = consolidables.mock.calls.length;
    const lecturasSolicitados = solicitados.mock.calls.length;

    const usuario = userEvent.setup();
    // SLT-106: el botón vive en el pie de la cola (R197), ya no en una región propia (R204).
    await usuario.click(screen.getByRole("button", { name: "Solicitar cierre de bodega" }));
    await usuario.click(
      within(screen.getByRole("dialog", { name: "Solicitar cierre de bodega" })).getByRole("button", {
        name: "Solicitar cierre de bodega",
      }),
    );

    expect(solicitar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(consolidables.mock.calls.length).toBeGreaterThan(lecturasConsolidables));
    await waitFor(() => expect(solicitados.mock.calls.length).toBeGreaterThan(lecturasSolicitados));
    // Lo que ve el usuario: el consolidado ya no está en «A consolidar».
    await waitFor(() =>
      expect(screen.getByText("No hay cierres del día aprobados para consolidar.")).toBeTruthy(),
    );
  });
});

describe("ConsolidacionBodegaModule — la cola de la satélite (SLT-106)", () => {
  beforeEach(() => {
    consolidables.mockReset();
    solicitados.mockReset();
    solicitar.mockReset();
    refresh.mockReset();
    push.mockReset();
    toastOk.mockReset();
    consolidables.mockImplementation(async () => pagina([CONSOLIDABLE]));
    solicitados.mockImplementation(async () => pagina([]));
  });

  it("R205: tras `ok`, toast, diálogo cerrado y ruta refrescada", async () => {
    solicitar.mockResolvedValue({ status: "ok", cierreBodegaId: "b-1", totales: TOTALES });
    montar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Solicitar cierre de bodega" }));
    await usuario.click(
      within(screen.getByRole("dialog", { name: "Solicitar cierre de bodega" })).getByRole("button", {
        name: "Solicitar cierre de bodega",
      }),
    );
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith("Cierre de bodega solicitado correctamente."),
    );
    expect(refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Solicitar cierre de bodega" })).toBeNull(),
    );
  });

  it("R48/R207: el diálogo resume las cuatro cifras de las tarjetas, y título y descripción de hoy", async () => {
    montar({
      totalPagoMensajeroAgregado: "1500.00",
      totalIngresoBodegaRechazosAgregado: "250.00",
      paraLaCentralAgregado: "7250.00",
    });
    // Las tarjetas, antes de abrir (el diálogo deja el resto de la página fuera del árbol accesible).
    const tarjetas = screen.getByRole("group", { name: "Cifras a consolidar" });
    expect(within(tarjetas).getByRole("group", { name: "Gana la bodega satélite" })).toHaveTextContent(
      "₡250",
    );
    expect(within(tarjetas).getByRole("group", { name: "Debe llegar a la central" })).toHaveTextContent(
      "₡7.250",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Solicitar cierre de bodega" }));
    const dialogo = screen.getByRole("dialog", { name: "Solicitar cierre de bodega" });
    expect(dialogo).toHaveAccessibleDescription(
      "Se consolidarán todos los cierres del día aprobados de tu zona en una solicitud a la bodega central. Esta acción no se puede deshacer.",
    );
    const resumen = within(dialogo).getByLabelText("Resumen del cierre de bodega a solicitar");
    expect(resumen.tagName).toBe("DL");
    const pares = Array.from(resumen.querySelectorAll("dt")).map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(pares).toEqual([
      ["Recaudado", "₡9.000"],
      ["Pago a mensajeros", "₡1.500"],
      ["Gana la bodega satélite", "₡250"],
      ["Debe llegar a la central", "₡7.250"],
    ]);
    expect(
      within(dialogo).getByRole("button", { name: "Solicitar cierre de bodega" }),
    ).toBeInTheDocument();
  });

  it("R46/R47: bloqueada, el aviso nombra al mensajero y el botón está deshabilitado", () => {
    const motivo =
      "Todavía no puedes consolidar: Carla Mensajera tiene un cierre sin resolver. Apruébalo o recházalo primero.";
    montar({ puedesSolicitar: false, motivoBloqueo: motivo, bloqueo: "sin_resolver" });
    expect(screen.getByText(motivo)).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Solicitar cierre de bodega" })).toBeDisabled();
    expect(
      screen.getByText("Se habilita cuando no quede ningún cierre de mensajero por resolver."),
    ).toBeInTheDocument();
  });

  it("R190/R203: la cola con su descripción, pestañas con conteo y la región de la tabla", () => {
    montar({ cierresBodegaPasados: { items: [], total: 8, pageSize: 10 } });
    expect(
      screen.getByText(
        "Bodega satélite · Limón. Junta los cierres aprobados de tus mensajeros y envíalos a la central.",
      ),
    ).toBeInTheDocument();
    const lista = screen.getByRole("tablist", { name: "Cierre de bodega por etapa" });
    expect(within(lista).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "A consolidar 1",
      "Solicitados 8",
    ]);
    expect(screen.getByRole("region", { name: "Cierres del día a consolidar" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Paginación de los cierres del día a consolidar" }),
    ).toBeInTheDocument();
  });

  it("R193: «Ver su cierre» navega al enlace del detalle del cierre del día", async () => {
    montar();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Ver el cierre de Mensajero Uno" }));
    expect(push).toHaveBeenCalledWith("/cierres-admin?cierre=cd-1");
  });

  it("R289 (sustituye a R201): «Solicitados» con sus tarjetas y su región, sin las de «A consolidar» ni botón", async () => {
    montar();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Solicitados 0" }));
    expect(screen.getByRole("region", { name: "Cierres de bodega solicitados" })).toBeInTheDocument();
    const cifras = screen.getByRole("group", { name: "Cifras de los cierres de bodega solicitados" });
    expect(within(cifras).getByRole("group", { name: "Por llegar a la central" })).toHaveTextContent(
      "₡30.700",
    );
    expect(
      within(cifras).getByRole("group", { name: "Recibido por la central (30 días)" }),
    ).toHaveTextContent("₡53.500");
    expect(within(cifras).getByRole("group", { name: "Falta por recibir" })).toHaveTextContent("₡0");
    expect(screen.queryByRole("group", { name: "Cifras a consolidar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar cierre de bodega" })).toBeNull();
  });

  it("R202: sin zona, el aviso de hoy y la lista de solicitados, sin cola, tarjetas ni botón", () => {
    montar({ sinZona: true, puedesSolicitar: false, bloqueo: "sin_zona" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No tienes una zona asignada; contacta a tu administrador.",
    );
    expect(screen.getByRole("region", { name: "Cierres de bodega solicitados" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("group", { name: "Cifras a consolidar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar cierre de bodega" })).toBeNull();
  });

  it("R204: ya no pinta los totales sueltos, «Central debe» ni los comprobantes", () => {
    montar({ totalCentralDebeAgregado: "500.00" });
    expect(screen.queryByRole("region", { name: "Totales a consolidar" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Solicitar cierre de bodega" })).toBeNull();
    expect(screen.queryByText(/Comprobante del cierre de/)).toBeNull();
    expect(screen.queryByText(/\bCentral debe\b/)).toBeNull();
    // Lo que la sustituye: la tarjeta «La central debe» (R196).
    expect(screen.getByRole("group", { name: "La central debe" })).toHaveTextContent("₡500");
  });
});

// ═══ SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (T3.3) ═══════════════

type Ok = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;

/** Consolidación de Limón solicitada a las 19:05 de Costa Rica del 7 de noviembre, sin marca. */
const ID_CB = "b1b1b1b1-1111-4111-8111-0000c07b3e19";
const FOLIO = "#C07B3E19";
const PENDIENTE: CierreBodegaResumen = {
  cierreBodegaId: ID_CB,
  zonaId: "33333333-3333-4333-8333-333333333333",
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: { efectivo: "34000.00", simpe: "0.00", transferencia: "0.00", general: "34000.00" },
  totalPagoMensajero: "3300.00",
  totalIngresoBodegaRechazos: "0.00",
  cantidadCierres: 1,
  solicitadoAt: "2026-11-08T01:05:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
  paraLaCentral: "30700.00",
  efectivoCubreDescuentos: true,
  ...marcaSinConciliar("34000.00"),
};

const RECIBIDO: CierreBodegaResumen = {
  ...PENDIENTE,
  ...marcaRecibida("30700.00", "0.00", {
    conciliadoAt: "2026-11-08T15:12:00.000Z",
    conciliadoPorNombre: "Carlos R.",
  }),
};

/** Ana: la gestión del canvas (con fulfillment y evidencia). La satélite no debe ver el fulfillment. */
const GESTION_ANA: CierreDetalleGestion = gestionCanvas({
  gestionId: "g-ana",
  numRemision: "REM-ANA",
  destinatario: "Laura Vega",
  evidenciaUrls: ["https://evidencias.test/ana.jpg"],
  evidenciaUrl: "https://evidencias.test/ana.jpg",
});

const VACIOS = { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };

function detalle(cierre: CierreBodegaResumen): Ok {
  return {
    status: "ok",
    cierre,
    cierres: [
      {
        cierreDiaId: "cd-ana",
        mensajeroId: "m-ana",
        mensajeroNombre: "Ana Mensajera",
        totales: { efectivo: "34000.00", simpe: "0.00", transferencia: "0.00", general: "34000.00" },
        totalPagoMensajero: "3300.00",
        totalIngresoBodegaRechazos: "0.00",
        paraLaCentral: "30700.00",
        gestionesAjustadas: 0,
        solicitadoAt: "2026-11-08T00:42:00.000Z",
        grupos: { ...VACIOS, entregado: [GESTION_ANA] },
      },
    ],
    totalesIngreso: {
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
    },
    ivaFacturado: "0.00",
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    partesPorTienda: [],
    paraLaCentral: cierre.paraLaCentral,
    efectivoCubreDescuentos: true,
  } as unknown as Ok;
}

const NAV_CONSOLIDAR = "Paginación de los cierres del día a consolidar";
const NAV_SOLICITADOS = "Paginación de los cierres de bodega solicitados";

/** La página marcada como actual en una paginación. */
function paginaActual(nav: string): string | null {
  const control = screen.getByRole("navigation", { name: nav });
  return control.querySelector("[aria-current='page']")?.textContent ?? null;
}

async function irAPagina2(usuario: ReturnType<typeof userEvent.setup>, nav: string) {
  await usuario.click(
    within(screen.getByRole("navigation", { name: nav })).getByRole("button", {
      name: "Página siguiente",
    }),
  );
  await waitFor(() => expect(paginaActual(nav)).toBe("2"));
}

describe("SLT-107 — «Solicitados» con filtros y páginas (R52, R290, R291)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 25 de cada lado sin filtro (tres páginas de 10); con el filtro, 13 solicitados (dos páginas).
    consolidables.mockImplementation(async () => pagina([CONSOLIDABLE], 25));
    solicitados.mockImplementation(async (input: { filtros?: FiltrosCierresBodega }) =>
      input.filtros?.desde ? pagina([PENDIENTE], 13) : pagina([PENDIENTE], 25),
    );
  });

  const conPaginas = {
    consolidables: { items: [CONSOLIDABLE], total: 25, pageSize: 10 },
    cierresBodegaPasados: { items: [PENDIENTE], total: 25, pageSize: 10 },
  };

  it("(a) R291, deuda R191: un filtro pide las DOS pestañas con él y las devuelve a la página 1", async () => {
    montar(conPaginas);
    const usuario = userEvent.setup();
    await irAPagina2(usuario, NAV_CONSOLIDAR);
    await usuario.click(screen.getByRole("tab", { name: /^Solicitados/ }));
    await irAPagina2(usuario, NAV_SOLICITADOS);

    await usuario.click(screen.getByRole("button", { name: "Aplicar filtro QK4" }));

    await waitFor(() =>
      expect(solicitados).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, filtros: FILTRO }),
    );
    await waitFor(() =>
      expect(consolidables).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, filtros: FILTRO }),
    );
    expect(paginaActual(NAV_SOLICITADOS)).toBe("1");
    await usuario.click(screen.getByRole("tab", { name: /^A consolidar/ }));
    expect(paginaActual(NAV_CONSOLIDAR)).toBe("1");
  });

  it("(b) R291, deuda R190: cambiar de pestaña conserva la página y el filtro de cada una", async () => {
    montar(conPaginas);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Aplicar filtro QK4" }));
    await irAPagina2(usuario, NAV_CONSOLIDAR);
    await usuario.click(screen.getByRole("tab", { name: /^Solicitados/ }));
    await irAPagina2(usuario, NAV_SOLICITADOS);

    await usuario.click(screen.getByRole("tab", { name: /^A consolidar/ }));
    expect(paginaActual(NAV_CONSOLIDAR)).toBe("2");
    expect(consolidables).toHaveBeenLastCalledWith({ page: 2, pageSize: 10, filtros: FILTRO });

    await usuario.click(screen.getByRole("tab", { name: /^Solicitados/ }));
    expect(paginaActual(NAV_SOLICITADOS)).toBe("2");
    expect(solicitados).toHaveBeenLastCalledWith({ page: 2, pageSize: 10, filtros: FILTRO });
  });

  it("(c) R290: «Solicitados <n>» es el `total` filtrado del servidor, el de la tabla", async () => {
    montar(conPaginas);
    const usuario = userEvent.setup();
    expect(screen.getByRole("tab", { name: "Solicitados 25" })).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Aplicar filtro QK4" }));
    expect(await screen.findByRole("tab", { name: "Solicitados 13" })).toBeInTheDocument();
  });

  it("R52: la descarga de «Solicitados» y la lista llevan el mismo filtro", async () => {
    montar(conPaginas);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Aplicar filtro QK4" }));
    await usuario.click(screen.getByRole("tab", { name: /^Solicitados/ }));
    await waitFor(() =>
      expect(solicitados).toHaveBeenCalledWith({ page: 1, pageSize: 10, filtros: FILTRO }),
    );
  });

  it("(g) R202: sin zona, la lista de hoy sin filtros, como antes", async () => {
    montar({ sinZona: true, puedesSolicitar: false, bloqueo: "sin_zona" });
    expect(screen.getByRole("region", { name: "Cierres de bodega solicitados" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cifras de los cierres de bodega solicitados" })).toBeNull();
    await waitFor(() => expect(solicitados).toHaveBeenCalled());
    expect(solicitados.mock.calls.every(([input]) => input.filtros === undefined)).toBe(true);
  });
});

describe("SLT-107 — «Ver»: el cierre de bodega en lectura (R50, R51, R292-R294)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consolidables.mockImplementation(async () => pagina([CONSOLIDABLE]));
    solicitados.mockImplementation(async () => pagina([PENDIENTE]));
  });

  async function verDesdeSolicitados(cierre: CierreBodegaResumen) {
    verDetalle.mockResolvedValue(detalle(cierre));
    montar({ cierresBodegaPasados: { items: [cierre], total: 1, pageSize: 10 } });
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("tab", { name: /^Solicitados/ }));
    await usuario.click(screen.getByRole("button", { name: `Ver el cierre de bodega ${FOLIO}` }));
    const dialogo = await screen.findByRole("dialog", { name: /^Detalle del cierre de bodega/ });
    return { usuario, dialogo };
  }

  function botonesDelPie(dialogo: HTMLElement): string[] {
    const footer = dialogo.querySelector("footer") as HTMLElement;
    return within(footer)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
  }

  it("(d) sin marca: pestañas, franja de la satélite, pie solo «Cerrar» y su texto", async () => {
    const { dialogo } = await verDesdeSolicitados(PENDIENTE);
    expect(verDetalle).toHaveBeenCalledWith({ cierreBodegaId: ID_CB });
    expect(within(dialogo).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Dinero",
      "Gestiones (1)",
      "Mensajeros (1)",
      "Conciliación",
    ]);
    expect(within(dialogo).getByRole("status").textContent).toContain(
      "la central aún no marca el dinero recibido",
    );
    expect(botonesDelPie(dialogo)).toEqual(["Cerrar"]);
    expect(dialogo.querySelector("footer")!.textContent).toContain(
      "Declarado ₡30.700 · la central lo marca recibido cuando llega",
    );
    expect(within(dialogo).queryByRole("button", { name: /Marcar recibido|Desmarcar|Corregir/ })).toBeNull();
  });

  it("(d) con marca: sin franja y el pie sigue solo con «Cerrar»", async () => {
    const { dialogo } = await verDesdeSolicitados(RECIBIDO);
    expect(within(dialogo).queryByRole("status")).toBeNull();
    expect(botonesDelPie(dialogo)).toEqual(["Cerrar"]);
    expect(dialogo.querySelector("footer")!.textContent).not.toContain("cuando llega");
  });

  it("(d) R51: «Gestiones» en solo lectura, sin fulfillment aunque la fila lo traiga", async () => {
    const { usuario, dialogo } = await verDesdeSolicitados(PENDIENTE);
    await usuario.click(within(dialogo).getByRole("tab", { name: "Gestiones (1)" }));
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-ANA · Laura Vega" }),
    );
    expect(within(dialogo).getByRole("button", { name: /^Ver evidencia/ })).toBeTruthy();
    expect(within(dialogo).queryByRole("region", { name: /^Fulfillment/ })).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: /Ajustar pago|Corregir/ })).toBeNull();
  });

  it("«Cerrar» cierra el detalle", async () => {
    const { usuario, dialogo } = await verDesdeSolicitados(PENDIENTE);
    await usuario.click(
      within(dialogo.querySelector("footer") as HTMLElement).getByRole("button", { name: "Cerrar" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /^Detalle del cierre de bodega/ })).toBeNull(),
    );
  });

  it("(f) R294: «Ver su cierre» cierra el detalle y navega al cierre del día", async () => {
    const { usuario, dialogo } = await verDesdeSolicitados(PENDIENTE);
    await usuario.click(within(dialogo).getByRole("tab", { name: "Mensajeros (1)" }));
    await usuario.click(within(dialogo).getByRole("link", { name: "Ver el cierre de Ana Mensajera" }));
    expect(push).toHaveBeenCalledWith("/cierres-admin?cierre=cd-ana");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /^Detalle del cierre de bodega/ })).toBeNull(),
    );
  });

  it.each([
    ["forbidden", "No tienes permiso para ver este cierre de bodega."],
    ["no_encontrada", "No tienes permiso para ver este cierre de bodega."],
    ["unauthenticated", "Tu sesión expiró. Inicia sesión de nuevo."],
    ["validation_error", "No se pudo abrir el detalle del cierre de bodega. Inténtalo de nuevo."],
  ])("(e) R293: %s → aviso y ningún diálogo", async (status, aviso) => {
    verDetalle.mockResolvedValue({ status, fieldErrors: {} });
    montar({ cierresBodegaPasados: { items: [PENDIENTE], total: 1, pageSize: 10 } });
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("tab", { name: /^Solicitados/ }));
    await usuario.click(screen.getByRole("button", { name: `Ver el cierre de bodega ${FOLIO}` }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(aviso));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
