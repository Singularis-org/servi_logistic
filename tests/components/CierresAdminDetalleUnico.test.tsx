// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierresAdminModule } from "@/app/(app)/cierres-admin/_components/CierresAdminModule";
import {
  aprobarCierre,
  forzarSolicitudVencido,
  listarHistoricoCierresAdminPaginado,
  listarPendientesCierresAdminPaginado,
  verCierreDetalle,
} from "@/lib/actions/cierres-admin";
import { listarPagosDeCierreAction } from "@/lib/actions/liquidacion";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import type {
  CierreAdminResumen,
  CierreDetalleAdminServiceResult,
} from "@/lib/interfaces/services/ICierresAdminService";
import type {
  CierreDetalleGestion,
  CierreRechazoDeTienda,
} from "@/lib/interfaces/services/ICierreDiaService";

// SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (T3.2) — el detalle que abre la
// central o la satélite en /cierres-admin es el detalle único de SLT-95, montado por el módulo con
// dobles del servicio. Todos los esperados van escritos a mano.

vi.mock("@/lib/actions/cierres-admin", () => ({
  listarGestionesCierresAdminCompleto: vi.fn(),
  verCierreDetalle: vi.fn(),
  aprobarCierre: vi.fn(),
  rechazarCierre: vi.fn(),
  listarCierresAdmin: vi.fn(),
  forzarSolicitudVencido: vi.fn(),
  listarHistoricoCierresAdminPaginado: vi.fn(),
  listarPendientesCierresAdminPaginado: vi.fn(),
}));
vi.mock("@/lib/actions/liquidacion", () => ({
  registrarPagoMensajeroAction: vi.fn(),
  listarPagosDeCierreAction: vi.fn(),
  anularPagoAction: vi.fn(),
}));

const { errorMock } = vi.hoisted(() => ({ errorMock: vi.fn() }));
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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

type DetalleOk = Extract<CierreDetalleAdminServiceResult, { status: "ok" }>;
type Estado = CierreAdminResumen["estado"];

const verDetalleMock = vi.mocked(verCierreDetalle);
const aprobarMock = vi.mocked(aprobarCierre);
const forzarMock = vi.mocked(forzarSolicitudVencido);

function resumen(estado: Estado, extra: Partial<CierreAdminResumen> = {}): CierreAdminResumen {
  const resuelto = estado === "aprobado" || estado === "rechazado";
  return {
    cierreId: "aaaaaaaa-bbbb-4ccc-8ddd-0000c0ffee01",
    mensajeroId: "m-1",
    mensajeroNombre: "Ana Mensajera",
    estado,
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "500.00",
    pendientePagoMensajero: estado === "aprobado" ? "3000.00" : null,
    solicitadoAt: "2026-11-08T00:42:00.000Z",
    resueltoAt: resuelto ? "2026-11-08T01:10:00.000Z" : null,
    motivoRechazo: null,
    ...extra,
  };
}

function gestion(over: Partial<CierreDetalleGestion> & { gestionId: string }): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-11-07",
    numGuia: 1001,
    numRemision: "REM-001",
    destinatario: "Beto Ruiz",
    direccion: "Calle 1",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja",
    tiendaNombre: "Tienda Norte",
    resultado: "entregado",
    montoRecibido: "70000.00",
    metodoPago: "efectivo",
    pagos: [{ metodo: "efectivo", monto: "70000.00" }],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null,
    evidenciaUrls: [],
    pagoMensajero: "1500.00",
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  };
}

function rechazo(over: Partial<CierreRechazoDeTienda> & { gestionId: string }): CierreRechazoDeTienda {
  return {
    ordenId: `o-${over.gestionId}`,
    numGuia: 1044,
    numRemision: "NA-1044",
    destinatario: "Laura Vega",
    producto: "Caja",
    tiendaNombre: "Tienda Norte",
    zonaNombre: "GAM",
    rechazadoAt: "2026-11-07T21:20:00.000Z",
    motivo: "Cliente no quiso recibir",
    ...over,
  };
}

function detalle(estado: Estado, extra: Partial<DetalleOk> = {}, cierreExtra: Partial<CierreAdminResumen> = {}): DetalleOk {
  return {
    status: "ok",
    cierre: resumen(estado, cierreExtra),
    grupos: {
      entregado: [
        gestion({ gestionId: "g1" }),
        gestion({ gestionId: "g2", numGuia: 1002, numRemision: "REM-002", destinatario: "Ceci Mora" }),
      ],
      reprogramado: [],
      novedad: [],
      devolucion_a_origen_por_rechazo: [],
      incidente: [],
    },
    totalesIngreso: {
      montoCobrar: "100000.00",
      fleteConIva: "4520.00",
      comisionConIva: "1130.00",
      fleteDevolucionConIva: "2260.00",
      total: "7910.00",
      flete: "4000.00",
      ivaFlete: "520.00",
      fleteDevolucion: "2000.00",
      ivaFleteDevolucion: "260.00",
      comisionCod: "1000.00",
      ivaComisionCod: "130.00",
    },
    desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "500.00", total: "500.00" },
    ivaFacturado: "910.00",
    ganancia: "4000.00",
    pagoTienda: "94350.00",
    cobradoSobreRecaudado: "5650.00",
    netoEmpresa: "3500.00",
    ganaLaTienda: "92090.00",
    fleteRechazoYaCobradoATienda: false,
    partesPorTienda: [],
    ordenesSinGestion: [],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
    ...extra,
  };
}

function montar(
  d: DetalleOk,
  opciones: {
    audiencia?: "admin" | "satelite";
    puedeRegistrarPago?: boolean;
    // SLT-101: los tres permisos de las acciones de la fila, como los pasa la página.
    permisosFila?: boolean;
  } = {},
) {
  const enCola = d.cierre.estado === "solicitado" || d.cierre.estado === "vencido";
  const cola = paginaInicial(enCola ? [d.cierre] : []);
  const historico = paginaInicial(enCola ? [] : [d.cierre]);
  vi.mocked(listarPendientesCierresAdminPaginado).mockResolvedValue({ status: "ok", page: 1, ...cola });
  vi.mocked(listarHistoricoCierresAdminPaginado).mockResolvedValue({ status: "ok", page: 1, ...historico });
  verDetalleMock.mockResolvedValue(d);
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresAdminModule
        pendientes={cola}
        historico={historico}
        sinZona={false}
        audiencia={opciones.audiencia ?? "admin"}
        puedeRegistrarPago={opciones.puedeRegistrarPago ?? false}
        puedeCorregirPagos={opciones.permisosFila ?? false}
        puedeCorregirResultado={opciones.permisosFila ?? false}
        puedeAjustarPagoMensajero={opciones.permisosFila ?? false}
      />
    </SWRConfig>,
  );
}

/** Abre el detalle con el botón que la cola o el histórico ofrecen para ese estado. */
async function abrir(d: DetalleOk, opciones: Parameters<typeof montar>[1] = {}) {
  montar(d, opciones);
  const user = userEvent.setup();
  const estado = d.cierre.estado;
  if (estado === "solicitado") {
    await user.click(await screen.findByRole("button", { name: "Ver / decidir" }));
  } else if (estado === "vencido") {
    await user.click(await screen.findByRole("button", { name: "Ver el cierre de Ana Mensajera" }));
  } else {
    // SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (R99): la pestaña es un `tab`.
    await user.click(screen.getByRole("tab", { name: /^Resueltos/ }));
    await user.click(await screen.findByRole("button", { name: "Ver el cierre resuelto de Ana Mensajera" }));
  }
  const dialogo = await screen.findByRole("dialog", { name: "Detalle del cierre · Cierre de Ana Mensajera" });
  return { user, dialogo };
}

/** Los rótulos de los botones del pie, en orden. */
function botonesDelPie(dialogo: HTMLElement): string[] {
  const pie = dialogo.querySelector("footer") as HTMLElement;
  return within(pie)
    .getAllByRole("button")
    .map((b) => b.textContent ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listarPagosDeCierreAction).mockResolvedValue({ status: "ok", pagos: [] } as never);
});
afterEach(cleanup);

describe("SLT-100 R38 — el detalle de /cierres-admin es el detalle único", () => {
  it.each(["admin", "satelite"] as const)("con audiencia %s abre el diálogo nuevo con sus pestañas", async (audiencia) => {
    const { dialogo } = await abrir(detalle("solicitado"), { audiencia });
    const pestanas = within(dialogo).getByRole("tablist", { name: "Secciones del cierre" });
    expect(within(pestanas).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Dinero",
      "Gestiones (2)",
      "Rechazados por la tienda (0)",
    ]);
    // Las cuatro cifras de la central y la satélite (S1), con los strings del servidor.
    const cifras = within(dialogo).getByRole("group", { name: "Cifras del cierre" });
    expect(within(cifras).getByRole("group", { name: "Recaudado" })).toHaveTextContent("₡100.000");
    expect(within(cifras).getByRole("group", { name: "Le queda a la empresa" })).toHaveTextContent("₡3.500");
    // Lo que el modal anterior pintaba y el nuevo no (D3, D12).
    expect(within(dialogo).queryByText("Debe")).toBeNull();
    expect(within(dialogo).queryByRole("region", { name: "Decisión del cierre" })).toBeNull();
  });
});

describe("SLT-100 R79 — el modo sale del estado, y el pie con él", () => {
  it("solicitado → decidir: «Rechazar» y «Aprobar»", async () => {
    const { dialogo } = await abrir(detalle("solicitado"));
    expect(botonesDelPie(dialogo)).toEqual(["Rechazar", "Aprobar"]);
  });

  it("solicitado con paquetes que vuelven → «Revisar paquetes y aprobar»", async () => {
    const d = detalle("solicitado", {
      grupos: { ...detalle("solicitado").grupos, novedad: [gestion({ gestionId: "g3", resultado: "novedad" })] },
    });
    const { dialogo } = await abrir(d);
    expect(botonesDelPie(dialogo)).toEqual(["Rechazar", "Revisar paquetes y aprobar"]);
  });

  it("vencido → vencido: «Cerrar» y «Destrabar cierre vencido»", async () => {
    const { dialogo } = await abrir(detalle("vencido"));
    expect(botonesDelPie(dialogo)).toEqual(["Cerrar", "Destrabar cierre vencido"]);
  });

  it.each(["aprobado", "rechazado"] as const)("%s → solo lectura: solo «Cerrar»", async (estado) => {
    const { dialogo } = await abrir(detalle(estado));
    expect(botonesDelPie(dialogo)).toEqual(["Cerrar"]);
  });
});

describe("SLT-100 R18 — «Pago al mensajero» solo con el cierre aprobado, el permiso y la central", () => {
  it("central con permiso: la pestaña existe y monta la sección de hoy", async () => {
    const { user, dialogo } = await abrir(detalle("aprobado"), { puedeRegistrarPago: true });
    await user.click(within(dialogo).getByRole("tab", { name: "Pago al mensajero" }));
    expect(await within(dialogo).findByRole("region", { name: "Pago al mensajero" })).toBeInTheDocument();
  });

  it("la satélite no la ve, aunque le llegara el permiso", async () => {
    const { dialogo } = await abrir(detalle("aprobado"), { audiencia: "satelite", puedeRegistrarPago: true });
    expect(within(dialogo).queryByRole("tab", { name: "Pago al mensajero" })).toBeNull();
  });

  it("la central sin permiso tampoco", async () => {
    const { dialogo } = await abrir(detalle("aprobado"), { puedeRegistrarPago: false });
    expect(within(dialogo).queryByRole("tab", { name: "Pago al mensajero" })).toBeNull();
  });
});

describe("SLT-100 R39 — el pie lanza los flujos de hoy", () => {
  it("«Aprobar» llama a la Server Action de hoy con el cierre", async () => {
    aprobarMock.mockResolvedValue({ status: "ok", pendientePagoMensajero: null } as never);
    const { user, dialogo } = await abrir(detalle("solicitado"));
    await user.click(within(dialogo).getByRole("button", { name: "Aprobar" }));
    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({ cierreId: "aaaaaaaa-bbbb-4ccc-8ddd-0000c0ffee01" }),
    );
  });

  it("«Rechazar» abre el sub-modal del motivo", async () => {
    const { user, dialogo } = await abrir(detalle("solicitado"));
    await user.click(within(dialogo).getByRole("button", { name: "Rechazar" }));
    expect(await screen.findByRole("dialog", { name: "Rechazar cierre" })).toBeInTheDocument();
  });
});

describe("SLT-100 R83 — destrabar desde el pie relee el detalle", () => {
  it("al confirmar: la Server Action de destrabe y una segunda lectura que deja el detalle en decidir", async () => {
    forzarMock.mockResolvedValue({ status: "ok" } as never);
    const { user, dialogo } = await abrir(detalle("vencido"));
    expect(verDetalleMock).toHaveBeenCalledTimes(1);
    verDetalleMock.mockResolvedValue(detalle("solicitado"));

    await user.click(within(dialogo).getByRole("button", { name: "Destrabar cierre vencido" }));
    const confirmar = await screen.findByRole("dialog", { name: "Destrabar cierre vencido abandonado" });
    await user.click(within(confirmar).getByRole("button", { name: "Destrabar (excepción)" }));

    await vi.waitFor(() =>
      expect(forzarMock).toHaveBeenCalledWith({ cierreId: "aaaaaaaa-bbbb-4ccc-8ddd-0000c0ffee01" }),
    );
    await vi.waitFor(() => expect(verDetalleMock).toHaveBeenCalledTimes(2));
    const relei = await screen.findByRole("dialog", { name: "Detalle del cierre · Cierre de Ana Mensajera" });
    await vi.waitFor(() => expect(botonesDelPie(relei)).toEqual(["Rechazar", "Aprobar"]));
  });

  it("si falla: el error de hoy, sin segunda lectura, y el detalle sigue vencido", async () => {
    forzarMock.mockResolvedValue({ status: "conflict" } as never);
    const { user, dialogo } = await abrir(detalle("vencido"));
    await user.click(within(dialogo).getByRole("button", { name: "Destrabar cierre vencido" }));
    const confirmar = await screen.findByRole("dialog", { name: "Destrabar cierre vencido abandonado" });
    await user.click(within(confirmar).getByRole("button", { name: "Destrabar (excepción)" }));

    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("El cierre ya no está vencido (otro proceso lo resolvió)."),
    );
    expect(verDetalleMock).toHaveBeenCalledTimes(1);
    const sigue = screen.getByRole("dialog", { name: "Detalle del cierre · Cierre de Ana Mensajera" });
    expect(botonesDelPie(sigue)).toEqual(["Cerrar", "Destrabar cierre vencido"]);
  });
});

describe("SLT-100 R17 — «Rechazados por la tienda»", () => {
  it("con 0: la pestaña sigue y dice que no hay ninguno (D11, D27)", async () => {
    const { user, dialogo } = await abrir(detalle("solicitado"));
    await user.click(within(dialogo).getByRole("tab", { name: "Rechazados por la tienda (0)" }));
    expect(within(dialogo).getByRole("status")).toHaveTextContent(
      "Este cierre no tiene paquetes rechazados por la tienda.",
    );
    expect(within(dialogo).getByText("No son gestiones del mensajero y no suman a su pago.")).toBeInTheDocument();
  });

  it("con 2: una fila por rechazo con guía, destinatario, motivo, tienda y fecha, y la nota", async () => {
    const d = detalle("solicitado", {
      rechazosDeTienda: [
        rechazo({ gestionId: "r1" }),
        rechazo({
          gestionId: "r2",
          numGuia: 1051,
          destinatario: "Diego Solís",
          motivo: "Dirección inexistente",
          tiendaNombre: "Tienda Sur",
          rechazadoAt: "2026-11-07T22:05:00.000Z",
        }),
      ],
    });
    const { user, dialogo } = await abrir(d);
    await user.click(within(dialogo).getByRole("tab", { name: "Rechazados por la tienda (2)" }));
    const lista = within(dialogo).getByRole("list", { name: "Lista de paquetes rechazados por la tienda" });
    const filas = within(lista).getAllByRole("listitem");
    expect(filas.map((f) => Array.from(f.children).map((c) => c.textContent))).toEqual([
      ["1044", "Laura Vega", "Cliente no quiso recibir", "Tienda Norte", "2026-11-07"],
      ["1051", "Diego Solís", "Dirección inexistente", "Tienda Sur", "2026-11-07"],
    ]);
    expect(within(dialogo).getByText("No son gestiones del mensajero y no suman a su pago.")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Este cierre no tiene paquetes rechazados por la tienda.")).toBeNull();
  });
});

describe("SLT-100 R19, R21 — «Gestiones»: novedad interna, «Descargar» y sin impresión", () => {
  it("muestra las órdenes que pasaron a «Novedad interna» con su conteo", async () => {
    const d = detalle("solicitado", {
      ordenesSinGestion: [
        {
          ordenId: "os1",
          numGuia: 2001,
          numRemision: "REM-S1",
          destinatario: "Eva Sin",
          producto: "Caja",
          tiendaNombre: "Tienda Norte",
          estatusOrigen: null,
        } as DetalleOk["ordenesSinGestion"][number],
      ],
    });
    const { user, dialogo } = await abrir(d);
    await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (2)" }));
    const seccion = within(dialogo).getByRole("region", { name: "Pasaron a Novedad interna" });
    expect(within(seccion).getByText("1")).toBeInTheDocument();
    expect(within(seccion).getAllByRole("listitem")).toHaveLength(1);
  });

  it("un cierre anterior al registro lo dice, sin lista", async () => {
    const { user, dialogo } = await abrir(detalle("solicitado", { sinGestionRegistrado: false }));
    await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (2)" }));
    expect(
      within(dialogo).getByText(
        "Este cierre es anterior al registro de las órdenes que pasan a Novedad interna: no se conserva la lista.",
      ),
    ).toBeInTheDocument();
  });

  it("ofrece «Descargar» y no hay hoja imprimible ni «Imprimir» en el diálogo", async () => {
    const { user, dialogo } = await abrir(detalle("solicitado"));
    await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (2)" }));
    expect(
      within(dialogo).getByRole("button", { name: "Descargar Gestiones del cierre C0FFEE01" }),
    ).toBeInTheDocument();
    expect(dialogo.querySelector(".hoja-imprimible")).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: /Imprimir/ })).toBeNull();
  });
});

describe("SLT-100 R80 — la cabecera dice quién resolvió", () => {
  it("con el nombre del servidor: «Aprobado <fecha> por <nombre>»", async () => {
    const { dialogo } = await abrir(detalle("aprobado", { resueltoPorNombre: "Carla Resolutora" }));
    expect(
      within(dialogo).getByText(
        /· Solicitado 2026-11-07 18:42 · Aprobado 2026-11-07 19:10 por Carla Resolutora$/,
      ),
    ).toBeInTheDocument();
  });

  it("sin el nombre: la fecha sola, sin «por»", async () => {
    const { dialogo } = await abrir(detalle("aprobado"));
    expect(within(dialogo).getByText(/· Solicitado 2026-11-07 18:42 · Aprobado 2026-11-07 19:10$/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/Aprobado 2026-11-07 19:10 por/)).toBeNull();
  });
});

describe("SLT-100 R81 — la nota del origen del ingreso de bodega", () => {
  it("modelo viejo: bajo «− pago a la bodega», con los rótulos de hoy", async () => {
    const { dialogo } = await abrir(detalle("solicitado"));
    const cuenta = within(dialogo).getByRole("region", { name: "De lo facturado, le queda a la empresa" });
    const linea = within(cuenta)
      .getByText("− Ingreso de bodega por devoluciones a origen")
      .closest("[data-signo]") as HTMLElement;
    expect(within(linea).getByText("₡500")).toBeInTheDocument();
    expect(
      within(linea).getByText("Automático (por plazo vencido) ₡0 · Manual (mensajero) ₡500"),
    ).toBeInTheDocument();
  });
});

// ─── SLT-101 «Fila de gestión única y lista con filtros» (T4.2; R19, R26, R30, R90) ────────────────
// «Gestiones» monta la lista y la fila únicas con la audiencia del actor. Las gestiones llevan
// fulfillment en el doble A PROPÓSITO: el servidor ya lo anula a la satélite (481), y aquí se mira
// que la pantalla tampoco lo pinte aunque llegara (R30).

function conCobro(d: DetalleOk): DetalleOk {
  const ingreso = {
    montoCobrar: "70000.00",
    cobraComision: true,
    esCentral: true,
    esZonaEspecial: false,
    fleteOrigen: "normal" as const,
    fleteDevolucionOrigen: "normal" as const,
    flete: "2000.00",
    ivaFlete: "260.00",
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: "700.00",
    ivaComisionCod: "91.00",
    fleteConIva: "2260.00",
    fleteDevolucionConIva: null,
    comisionConIva: "791.00",
    total: "3051.00",
    fulfillment: "300.00",
    ivaFulfillment: "0.00",
    tarifa: null,
    tarifaModelo: "viejo" as const,
    ivaIncluido: "351.00",
    fulfillmentConIva: "300.00",
    ivaPctFulfillment: null,
    fulfillmentCargadoAt: null,
    conceptosTarifa: [],
  };
  return {
    ...d,
    grupos: {
      ...d.grupos,
      entregado: d.grupos.entregado.map((g) => ({
        ...g,
        ingresoEmpresa: { ...ingreso, tarifa: { tarifaId: "t", valorFlete: "1500.00", valorFleteGam: "2000.00", valorFleteDevuelto: "1000.00", valorFleteDevueltoGam: "2000.00", comisionCod: "1.00", ivaFlete: "13.00", ivaComisionCod: "13.00", fulfillment: "300.00", tarifaEspecial: null, tarifaEspecialDevuelta: null } },
      })),
    },
  };
}

async function abrirGestiones(d: DetalleOk, opciones: Parameters<typeof montar>[1] = {}) {
  const { user, dialogo } = await abrir(d, opciones);
  await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (2)" }));
  return { user, dialogo };
}

describe("SLT-101 R90 — «Gestiones» monta la lista y la fila únicas", () => {
  it.each(["admin", "satelite"] as const)("%s: filtros con conteo, sin buscador, «Descargar» en la misma fila", async (audiencia) => {
    const { dialogo } = await abrirGestiones(conCobro(detalle("solicitado")), { audiencia });
    const grupo = within(dialogo).getByRole("group", { name: "Filtrar por resultado" });
    expect(within(grupo).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Todas (2)",
      "Entregado (2)",
      "Reprogramado (0)",
      "Novedad (0)",
      "Devolución a origen por rechazo (0)",
      "Incidente (0)",
      "Con señales (0)",
    ]);
    expect(within(dialogo).queryByRole("searchbox")).toBeNull();
    const descargar = within(dialogo).getByRole("button", { name: "Descargar Gestiones del cierre C0FFEE01" });
    expect((descargar.closest(".flex-wrap") as HTMLElement).contains(grupo)).toBe(true);
    // Sin la región por resultado de las pestañas de antes: la lista es «Órdenes del cierre».
    expect(within(dialogo).getByRole("region", { name: "Órdenes del cierre" })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("region", { name: "Entregado" })).toBeNull();
  });

  it("central: Fulfillment y las tres acciones de la fila", async () => {
    const { user, dialogo } = await abrirGestiones(conCobro(detalle("solicitado")), { permisosFila: true });
    await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-001 · Beto Ruiz" }));
    expect(
      within(dialogo).getByRole("region", { name: "Fulfillment · se cobró al crear la orden de la orden REM-001 · Beto Ruiz" }),
    ).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Corregir métodos de pago de la orden REM-001 · Beto Ruiz" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Corregir el resultado de la orden REM-001 · Beto Ruiz" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Ajustar pago al mensajero de la orden REM-001 · Beto Ruiz" })).toBeInTheDocument();
  });

  it("satélite: sin Fulfillment ni «Corregir métodos de pago» ni «Corregir el resultado», aunque llegaran; sí «Ajustar pago»", async () => {
    const { user, dialogo } = await abrirGestiones(conCobro(detalle("solicitado")), {
      audiencia: "satelite",
      permisosFila: true,
    });
    await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-001 · Beto Ruiz" }));
    expect(within(dialogo).queryByText("Fulfillment · se cobró al crear la orden")).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: /Corregir métodos de pago/ })).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: /Corregir el resultado/ })).toBeNull();
    expect(within(dialogo).getByRole("button", { name: "Ajustar pago al mensajero de la orden REM-001 · Beto Ruiz" })).toBeInTheDocument();
    // Lo que sí ve: el cobro a la tienda con su IVA incluido (R25, R93).
    const cobro = within(dialogo).getByRole("region", { name: "Se le cobra a la tienda de la orden REM-001 · Beto Ruiz" });
    expect(cobro).toHaveTextContent("Se le cobra₡3.051");
    expect(cobro).toHaveTextContent("de eso, IVA (no es de la empresa)₡351");
  });

  it("«Ajustar pago» abre el diálogo de hoy con esa gestión", async () => {
    const { user, dialogo } = await abrirGestiones(conCobro(detalle("solicitado")), { permisosFila: true });
    await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-001 · Beto Ruiz" }));
    await user.click(within(dialogo).getByRole("button", { name: "Ajustar pago al mensajero de la orden REM-001 · Beto Ruiz" }));
    const ajuste = await screen.findByRole("dialog", { name: "Ajustar el pago al mensajero" });
    expect(ajuste).toHaveTextContent("REM-001");
  });

  it("«Corregir el resultado» abre el diálogo de hoy con esa gestión", async () => {
    const { user, dialogo } = await abrirGestiones(conCobro(detalle("solicitado")), { permisosFila: true });
    await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-001 · Beto Ruiz" }));
    await user.click(within(dialogo).getByRole("button", { name: "Corregir el resultado de la orden REM-001 · Beto Ruiz" }));
    const correccion = await screen.findByRole("dialog", { name: "Corregir el resultado de la entrega" });
    expect(correccion).toHaveTextContent("Orden REM-001 · Beto Ruiz");
  });

  it("R19: «Pasaron a Novedad interna» sigue debajo de la lista", async () => {
    const d = conCobro(
      detalle("solicitado", {
        ordenesSinGestion: [
          {
            ordenId: "os1",
            numGuia: 2001,
            numRemision: "REM-S1",
            destinatario: "Eva Sin",
            producto: "Caja",
            tiendaNombre: "Tienda Norte",
            estatusOrigen: null,
          } as DetalleOk["ordenesSinGestion"][number],
        ],
      }),
    );
    const { dialogo } = await abrirGestiones(d);
    const lista = within(dialogo).getByRole("region", { name: "Órdenes del cierre" });
    const novedad = within(dialogo).getByRole("region", { name: "Pasaron a Novedad interna" });
    expect(lista.compareDocumentPosition(novedad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// SLT-111 «Cifras del servidor: reparto en % y señales de la cola» (T5.4, R267) — el reparto que
// emite `verCierreDetalle` llega al detalle montado por el módulo: `abrirDetalle` lo guarda y el
// mapeador lo pone en su hueco. Esperados escritos a mano (MA [94, 6]).
describe("SLT-111 R267 — el reparto del servidor llega a «Dinero»", () => {
  it.each(["admin", "satelite"] as const)("con audiencia %s la leyenda lleva «(94 %)» y «(6 %)»", async (audiencia) => {
    const { dialogo } = await abrir(detalle("solicitado", { porcentajesReparto: [94, 6] }), { audiencia });
    const reparto = within(dialogo).getByRole("region", { name: "Reparto de lo recaudado" });
    expect([...reparto.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Se le paga hoy a la tienda ₡94.350 (94 %)",
      "Sale de lo recaudado ₡5.650 (6 %)",
    ]);
  });

  it("con `null` del servidor: solo la leyenda, sin «%»", async () => {
    const { dialogo } = await abrir(detalle("solicitado", { porcentajesReparto: null }));
    const reparto = within(dialogo).getByRole("region", { name: "Reparto de lo recaudado" });
    expect(reparto.textContent).toContain("Se le paga hoy a la tienda ₡94.350");
    expect(reparto.textContent).not.toContain("%");
  });
});
