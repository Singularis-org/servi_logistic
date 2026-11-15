// @vitest-environment jsdom
/**
 * SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T4.3; R31, R40, R111-R113,
 * R115, R118-R120) — `CierresBodegaAdminModule` abre el detalle único de SLT-95 con `tipo` bodega en
 * lugar del `Modal` de antes. Dobles de las Server Actions; los textos esperados van escritos a mano
 * (canvas «Central 8» y «Central 9», `Main.dc.html`).
 *
 * Mutaciones que lo tumban (`progress/impl_SLT-104.md`): «modo decidir para un recibido», «audiencia
 * central en la fila», «no cerrar tras marcar».
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import type { CierreDetalleGestion, TotalesIngresoEmpresa } from "@/lib/interfaces/services/ICierreDiaService";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  show: vi.fn(),
  dismiss: vi.fn(),
}));

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

import {
  listarHistoricoCierresBodegaPaginado,
  listarPendientesCierresBodegaPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import { marcarConsolidacionRecibidaAction } from "@/lib/actions/conciliacion-satelites";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { marcaRecibida, marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";
import { gestionCanvas, gestionFila } from "@/tests/fixtures/gestion-cierre-fila";

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

/** Consolidación de Limón solicitada a las 19:05 de Costa Rica del 7 de noviembre. */
const PENDIENTE: CierreBodegaResumen = {
  cierreBodegaId: "b1b1b1b1-1111-4111-8111-0000c07b3e19",
  zonaId: "33333333-3333-4333-8333-333333333333",
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: { efectivo: "34000.00", simpe: "0.00", transferencia: "0.00", general: "34000.00" },
  totalPagoMensajero: "3300.00",
  totalIngresoBodegaRechazos: "0.00",
  cantidadCierres: 2,
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
    desmarcable: true,
    conciliadoAt: "2026-11-08T15:12:00.000Z",
    conciliadoPorNombre: "Carlos R.",
  }),
};

/** Ana: la gestión del canvas (fulfillment, pago ajustado) con evidencia; su cierre del día, 18:42. */
const GESTION_ANA: CierreDetalleGestion = gestionCanvas({
  gestionId: "g-ana",
  numRemision: "REM-ANA",
  destinatario: "Laura Vega",
  evidenciaUrls: ["https://evidencias.test/ana.jpg"],
  evidenciaUrl: "https://evidencias.test/ana.jpg",
});
/** Beto: un incidente sin indemnizar (la señal que la central ve y la «solo lectura» no). */
const GESTION_BETO: CierreDetalleGestion = gestionFila({
  gestionId: "g-beto",
  numRemision: "REM-BETO",
  destinatario: "Mario Solís",
  resultado: "incidente",
  montoRecibido: null,
  pagos: [],
  indemnizacion: null,
  causaIncidente: null,
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
        totales: { efectivo: "25000.00", simpe: "0.00", transferencia: "0.00", general: "25000.00" },
        totalPagoMensajero: "1800.00",
        totalIngresoBodegaRechazos: "0.00",
        paraLaCentral: "23200.00",
        gestionesAjustadas: 1,
        solicitadoAt: "2026-11-08T00:42:00.000Z",
        grupos: { ...VACIOS, entregado: [GESTION_ANA] },
      },
      {
        cierreDiaId: "cd-beto",
        mensajeroId: "m-beto",
        mensajeroNombre: "Beto Mensajero",
        totales: { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" },
        totalPagoMensajero: "1500.00",
        totalIngresoBodegaRechazos: "0.00",
        paraLaCentral: "7500.00",
        solicitadoAt: "2026-11-08T00:50:00.000Z",
        grupos: { ...VACIOS, incidente: [GESTION_BETO] },
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
    paraLaCentral: cierre.paraLaCentral,
    efectivoCubreDescuentos: true,
  } as unknown as Ok;
}

const NOMBRE_DIALOGO = "Detalle del cierre de bodega · Cierre de bodega · Limón";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listarPendientesCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([PENDIENTE]) });
  vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue({ status: "ok", page: 1, ...paginaInicial([RECIBIDO]) });
});
afterEach(cleanup);

function montar(puedeConciliar = true, audiencia: "admin" | "satelite" | "sin prop" = "admin") {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresBodegaAdminModule
        pendientes={paginaInicial([PENDIENTE])}
        historico={paginaInicial([RECIBIDO])}
        puedeConciliar={puedeConciliar}
        {...(audiencia === "sin prop" ? {} : { audiencia })}
      />
    </SWRConfig>,
  );
  return userEvent.setup();
}

async function abrirPendiente(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle(PENDIENTE));
  await user.click(await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }));
  return screen.findByRole("dialog", { name: NOMBRE_DIALOGO });
}

async function abrirResuelto(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle(RECIBIDO));
  await user.click(screen.getByRole("tab", { name: /^Conciliados/ }));
  await user.click(await screen.findByRole("button", { name: "Ver el cierre de bodega de Limón" }));
  return screen.findByRole("dialog", { name: NOMBRE_DIALOGO });
}

/** Los nombres de los botones del pie, en orden. */
function pie(dialogo: HTMLElement): string[] {
  const footer = dialogo.querySelector("footer") as HTMLElement;
  return within(footer)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
}

/**
 * SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (R455): el valor del par
 * con ese rótulo en la cabecera (`<dt>` → su `<dd>`), o `null` si el par no se pinta.
 */
function valorDelPar(raiz: HTMLElement, rotulo: string): string | null {
  const header = raiz.querySelector("header") as HTMLElement;
  const dt = within(header).queryAllByRole("term").find((t) => t.textContent === rotulo);
  return dt?.nextElementSibling?.textContent ?? null;
}

describe("R40, R111, R112, R118, R119 — «Ver / decidir» abre el detalle único en modo decidir", () => {
  it("dialog con su nombre, pastilla «Pendiente de conciliar», franja y pie «Cerrar» + «Marcar recibido»", async () => {
    const user = montar();
    const dialogo = await abrirPendiente(user);
    const cabecera = dialogo.querySelector("header") as HTMLElement;
    expect(within(cabecera).getByText("Pendiente de conciliar")).toBeTruthy();
    // SLT-153 (R454): cada dato en su par.
    expect(valorDelPar(dialogo, "Origen")).toBe("Bodega satélite");
    expect(valorDelPar(dialogo, "Solicitado por")).toBe("Sara Satélite");
    expect(valorDelPar(dialogo, "Mensajeros")).toBe("2");
    expect(within(dialogo).getByRole("status").textContent).toContain("falta marcar el dinero recibido");
    expect(pie(dialogo)).toEqual(["Cerrar", "Marcar recibido la consolidación de Limón del 2026-11-07"]);
    expect(
      within(dialogo)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Dinero", "Gestiones (2)", "Mensajeros (2)", "Conciliación"]);
    expect(dialogo.querySelector("footer")!.textContent).toContain("Declarado ₡30.700 · márcalo recibido cuando llegue");
  });

  it("R118: no monta el modal de antes ni sus paneles", async () => {
    const user = montar();
    const dialogo = await abrirPendiente(user);
    expect(within(dialogo).queryByRole("region", { name: "Totales del cierre de bodega" })).toBeNull();
    expect(within(dialogo).queryByRole("region", { name: "Cierre del día · Ana Mensajera" })).toBeNull();
    expect(within(dialogo).queryByRole("region", { name: "Conciliación del cierre de bodega" })).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("sin permiso de conciliar, el pie solo lleva «Cerrar»", async () => {
    const user = montar(false);
    const dialogo = await abrirPendiente(user);
    expect(pie(dialogo)).toEqual(["Cerrar"]);
  });

  it("«Cerrar» cierra el detalle", async () => {
    const user = montar();
    const dialogo = await abrirPendiente(user);
    await user.click(within(dialogo.querySelector("footer") as HTMLElement).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: NOMBRE_DIALOGO })).toBeNull());
  });
});

describe("R111 — «Ver» de Resueltos abre en solo lectura", () => {
  it("pastilla «Recibido», sin franja, y pie «Desmarcar» + «Cerrar» principal", async () => {
    const user = montar();
    const dialogo = await abrirResuelto(user);
    const cabecera = dialogo.querySelector("header") as HTMLElement;
    // SLT-153: «Recibido» también es un rótulo de la cabecera; la pastilla vive en la fila del título.
    expect(within(cabecera.firstElementChild as HTMLElement).getByText("Recibido")).toBeTruthy();
    expect(within(dialogo).queryByRole("status")).toBeNull();
    expect(pie(dialogo)).toEqual(["Desmarcar la consolidación de Limón del 2026-11-07", "Cerrar"]);
    expect(dialogo.querySelector("footer")!.textContent).not.toContain("márcalo recibido");
  });
});

describe("R112 — tras marcar recibido el detalle se cierra y las dos listas se vuelven a leer", () => {
  it("marca, cierra el detalle y revalida «Pendientes» y «Resueltos»", async () => {
    vi.mocked(marcarConsolidacionRecibidaAction).mockResolvedValue({ status: "ok" } as never);
    const user = montar();
    await waitFor(() => expect(listarHistoricoCierresBodegaPaginado).toHaveBeenCalled());
    const resueltos = vi.mocked(listarHistoricoCierresBodegaPaginado).mock.calls.length;
    const pendientes = vi.mocked(listarPendientesCierresBodegaPaginado).mock.calls.length;
    const dialogo = await abrirPendiente(user);
    await user.click(within(dialogo).getByRole("button", { name: /^Marcar recibido la consolidación de Limón/ }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Marcar recibido" })).getByRole("button", { name: "Marcar recibido" }),
    );
    expect(marcarConsolidacionRecibidaAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: NOMBRE_DIALOGO })).toBeNull());
    await waitFor(() =>
      expect(vi.mocked(listarPendientesCierresBodegaPaginado).mock.calls.length).toBeGreaterThan(pendientes),
    );
    await waitFor(() =>
      expect(vi.mocked(listarHistoricoCierresBodegaPaginado).mock.calls.length).toBeGreaterThan(resueltos),
    );
  });
});

describe("R119 — si la lectura falla no se abre el detalle", () => {
  it("no_encontrada: aviso, relectura de la cola y sin detalle", async () => {
    const user = montar();
    await waitFor(() => expect(listarPendientesCierresBodegaPaginado).toHaveBeenCalled());
    const lecturas = vi.mocked(listarPendientesCierresBodegaPaginado).mock.calls.length;
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue({ status: "no_encontrada" });
    await user.click(await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("El cierre de bodega ya no está disponible. Actualizando la lista."));
    await waitFor(() =>
      expect(vi.mocked(listarPendientesCierresBodegaPaginado).mock.calls.length).toBeGreaterThan(lecturas),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("forbidden: aviso y sin detalle", async () => {
    const user = montar();
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue({ status: "forbidden" });
    await user.click(await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No tienes permiso para ver este cierre de bodega."));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("R31, R113, R120 — «Gestiones» en solo lectura, con Mensajero, evidencia, fulfillment y «Descargar»", () => {
  async function abrirGestiones() {
    const user = montar();
    const dialogo = await abrirPendiente(user);
    await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (2)" }));
    return { user, dialogo };
  }

  it("columna Mensajero, filas de los dos cierres del día, «Descargar», sin la señal que solo ve la central", async () => {
    const { dialogo } = await abrirGestiones();
    const lista = within(dialogo).getByRole("region", { name: "Órdenes del cierre" });
    expect(within(lista).getByText("Mensajero")).toBeTruthy();
    expect(within(lista).getByText("Ana Mensajera")).toBeTruthy();
    expect(within(lista).getByText("Beto Mensajero")).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: /Descargar/ })).toBeTruthy();
    // «solo lectura» no dice «Sin indemnizar» (es la señal de la central y la satélite que deciden).
    expect(within(lista).queryByText("Sin indemnizar")).toBeNull();
  });

  it("la fila desplegada no ofrece corregir ni ajustar; sí «Ver evidencia» y el fulfillment", async () => {
    const { user, dialogo } = await abrirGestiones();
    await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-ANA · Laura Vega" }));
    expect(within(dialogo).queryByRole("button", { name: /Ajustar pago/ })).toBeNull();
    expect(within(dialogo).queryByRole("button", { name: /Corregir/ })).toBeNull();
    expect(within(dialogo).getByRole("button", { name: /^Ver evidencia/ })).toBeTruthy();
    expect(within(dialogo).getByRole("region", { name: /^Fulfillment · se cobró al crear la orden/ })).toBeTruthy();
  });

  it("PA3: la nota de tarifas lleva la fecha de SU cierre del día (18:42), no la del cierre de bodega (19:05)", async () => {
    const { user, dialogo } = await abrirGestiones();
    await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-ANA · Laura Vega" }));
    await user.click(within(dialogo).getByRole("button", { name: "Ver cómo se calculó" }));
    const nota = within(dialogo).getByText(/^Tarifas tal como estaban al crear el cierre/);
    expect(nota.textContent).toContain("(07/11/2026 18:42)");
    expect(nota.textContent).not.toContain("19:05");
  });
});

describe("R115 — «Ver su cierre» cierra el detalle de bodega y abre el del cierre del día", () => {
  it("navega a ?cierre=<id> sin dejar el detalle de bodega abierto debajo", async () => {
    const user = montar();
    const dialogo = await abrirPendiente(user);
    await user.click(within(dialogo).getByRole("tab", { name: "Mensajeros (2)" }));
    await user.click(within(dialogo).getByRole("link", { name: "Ver el cierre de Ana Mensajera" }));
    expect(nav.push).toHaveBeenCalledWith("/cierres-admin?cierre=cd-ana");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: NOMBRE_DIALOGO })).toBeNull());
  });
});

// SLT-111 «Cifras del servidor: reparto en % y señales de la cola» (T5.4, R267) — el reparto que
// emite `verCierreBodegaDetalle` llega a «Dinero» del detalle montado por el módulo. Con el doble de
// Limón (₡34.000 = ₡30.700 + ₡3.300 + ₡0), a mano: 90,29 / 9,70 / 0 → enteros 90 / 9 / 0 (suman 99);
// el punto que falta va al mayor resto (9,70) → [90, 10, 0].
describe("SLT-111 R267 — el reparto del servidor llega a «Dinero» del cierre de bodega", () => {
  it("la leyenda lleva «(90 %)», «(10 %)» y «(0 %)» en el orden del servidor", async () => {
    const user = montar();
    vi.mocked(verCierreBodegaDetalle).mockResolvedValue({ ...detalle(PENDIENTE), porcentajesReparto: [90, 10, 0] });
    await user.click(await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }));
    const dialogo = await screen.findByRole("dialog", { name: NOMBRE_DIALOGO });
    const reparto = within(dialogo).getByRole("region", { name: "Reparto de lo recaudado" });
    expect([...reparto.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Debe llegar a la central ₡30.700 (90 %)",
      "Pago a mensajeros ₡3.300 (10 %)",
      "Gana la bodega satélite ₡0 (0 %)",
    ]);
  });

  it("sin el campo (doble de siempre): solo la leyenda, sin «%»", async () => {
    const dialogo = await abrirPendiente(montar());
    const reparto = within(dialogo).getByRole("region", { name: "Reparto de lo recaudado" });
    expect(reparto.textContent).toContain("Debe llegar a la central ₡30.700");
    expect(reparto.textContent).not.toContain("%");
  });
});

// SLT-107 M1 (review vuelta 1, fichas 431/481): la audiencia del detalle de bodega sale de la prop
// `audiencia` que decide el servidor, no de un literal. Un `audiencia="central"` escrito a mano le
// enseñaría a un no-admin el fulfillment (R51) y la franja de la central: estos casos caen.
describe("SLT-107 M1 — la audiencia del detalle de bodega sigue a la prop, no a un literal", () => {
  async function gestionesDeAna(audiencia: "admin" | "satelite" | "sin prop") {
    const user = montar(false, audiencia);
    const dialogo = await abrirPendiente(user);
    await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (2)" }));
    await user.click(within(dialogo).getByRole("button", { name: "Desglose de ingreso de la orden REM-ANA · Laura Vega" }));
    return dialogo;
  }

  it("admin: ve el fulfillment de la fila", async () => {
    const dialogo = await gestionesDeAna("admin");
    expect(within(dialogo).getByRole("region", { name: /^Fulfillment · se cobró al crear la orden/ })).toBeTruthy();
  });

  it.each([["satelite"], ["sin prop"]] as const)("no-admin (%s): sin fulfillment y con la franja de la satélite", async (aud) => {
    const dialogo = await gestionesDeAna(aud);
    expect(within(dialogo).queryByRole("region", { name: /^Fulfillment/ })).toBeNull();
    expect(within(dialogo).getByRole("status").textContent).toContain("la central aún no marca el dinero recibido");
  });
});
