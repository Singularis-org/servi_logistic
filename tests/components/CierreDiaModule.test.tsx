// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import {
  deshacerGestion,
  listarCierresPasadosPaginado,
  solicitarCierre,
  verCierrePasado,
} from "@/lib/actions/cierre-dia";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreTotales,
  CierrePasadoDTO,
  CierreResultado,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import type { CierreReenviable } from "@/components/private/cierres/detalle/detalle-cierre-vista";
import { SIN_BLOQUEO, estaBloqueadoPorCierres } from "@/lib/utils/bloqueo-cierre";
import {
  bloqueoConRechazado,
  bloqueoConVencido,
  bloqueoDe,
  bloqueoMixtoElMasViejoEsSuyo,
  bloqueoPorAcumular,
  bloqueoTodosPorEnviar,
} from "@/tests/fixtures/bloqueo-cierre";

// Feature 37 (T15) — módulo cliente del "Cierre del día". Se mockea la Server
// Action (solicitarCierre), el toast y el router (refresh) para afirmar la
// composición (agrupación, totales, gate, histórico) y el envío sin DB ni sesión.
vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  // Feature 67 (T17/T18): la Server Action del deshacer también se mockea (contrato
  // cerrado por el backend: recibe un OBJETO `{ gestionId }`, no un string).
  deshacerGestion: vi.fn(),
  // Pedido humano: detalle de un cierre pasado (se pide bajo demanda al abrir el visor).
  verCierrePasado: vi.fn(),
  // Feature 170 — FASE 2 (T I.2): «Cierres solicitados» llega paginado del servidor.
  listarCierresPasadosPaginado: vi.fn(),
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

const solicitarMock = vi.mocked(solicitarCierre);
const deshacerMock = vi.mocked(deshacerGestion);
const verCierrePasadoMock = vi.mocked(verCierrePasado);

/** Cierre del histórico usado por los casos del visor de detalle. */
const CIERRE_PASADO: CierrePasadoDTO = {
  cierreId: "c1",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  destinoZonaId: "z1",
  totales: {
    efectivo: "300.00",
    simpe: "0.00",
    transferencia: "0.00",
    general: "300.00",
  },
  totalPagoMensajero: "45.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-07-11T10:00:00.000Z",
  resueltoAt: "2026-07-12T09:00:00.000Z",
  motivoRechazo: null,
};

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
    pagoMensajero: null, // feature 39
    ingresoBodegaRechazo: null, // feature 56
    tarifaFaltante: false, // feature 56/R23
    esRechazoSla: false, // feature 102
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

/**
 * Feature 170 — FASE 2 (T I.2): `cierresPasados` ya no es un array, es la PÁGINA que pre-carga
 * el Server Component. El helper sigue recibiendo el array para no reescribir cada caso, y
 * ADEMÁS programa la Server Action paginada con esa misma página (SWR revalida al montar).
 */
function renderModule(
  props?: Omit<Partial<Parameters<typeof CierreDiaModule>[0]>, "cierresPasados"> & {
    cierresPasados?: CierrePasadoDTO[];
  },
) {
  const pagina = paginaInicial(props?.cierresPasados ?? []);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...pagina,
  });
  const bloqueo = props?.bloqueo ?? SIN_BLOQUEO;
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={props?.grupos ?? emptyGrupos()}
        totales={props?.totales ?? ZERO_TOTALES}
        totalPagoMensajero={props?.totalPagoMensajero ?? "0.00"}
        puedesSolicitar={props?.puedesSolicitar ?? true}
        motivoBloqueo={props?.motivoBloqueo ?? null}
        cierresPasados={pagina}
        bloqueo={bloqueo}
        correcciones={props?.correcciones}
        // SLT-109 (R240): con un cierre por reenviar, `page.tsx` lo lee; el doble lo da leído.
        reenviable={"reenviable" in (props ?? {}) ? props?.reenviable : reenviableDe(bloqueo)}
      />
    </SWRConfig>,
  );
}

/**
 * SLT-109 (R240): la lectura `ok` del cierre por reenviar que haría `page.tsx` con `verCierrePasado`,
 * con el id y el estado de `aReenviarPrimero`. Sin nada que reenviar, ninguna.
 */
function reenviableDe(bloqueo: BloqueoDetalle): CierreReenviable | undefined {
  const r = bloqueo.aReenviarPrimero;
  if (!r) return undefined;
  return {
    estado: "ok",
    cierre: { ...CIERRE_PASADO, cierreId: r.cierreId, estado: r.estado, resueltoAt: null, motivoRechazo: null },
    grupos: emptyGrupos(),
    ordenesSinGestion: [],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
  };
}

/**
 * SLT-109 (R246): el aviso de bloqueo vive ahora en la franja del detalle, con su título. Devuelve
 * esa franja entera (título + texto).
 */
function avisoDeBloqueo(): HTMLElement {
  const franja = screen.getByText("Tu cierre está bloqueado:").closest('[role="status"]');
  expect(franja, "no hay franja de bloqueo en el detalle").not.toBeNull();
  return franja as HTMLElement;
}

/** SLT-109 (R242): la lista única de «Gestiones» del cierre de la página. */
function listaGestiones(): HTMLElement {
  return screen.getByRole("region", { name: "Órdenes del cierre" });
}

/** La cifra del detalle con ese rótulo («Recaudado», «Gestiones», «Tu ganancia»). */
function cifra(rotulo: string): HTMLElement {
  return screen.getByRole("group", { name: rotulo });
}

beforeEach(() => {
  vi.clearAllMocks();
  solicitarMock.mockResolvedValue({
    status: "ok",
    cierreId: "c1",
    totales: ZERO_TOTALES,
    destinoTipo: "bodega_satelite",
  });
  deshacerMock.mockResolvedValue({ status: "ok", ordenId: "o-g1" });
});

afterEach(() => {
  cleanup();
});

describe("CierreDiaModule", () => {
  // SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R242, R255): las
  // gestiones del día ya no van en una tabla por resultado sino en la lista y la fila únicas de la
  // pestaña «Gestiones» del detalle. Los casos que vigilaban una REGLA (qué datos llegan, que el
  // importe es el string del servidor, que la evidencia es la URL firmada, que el ingreso de bodega
  // no se le muestra) se reapuntan a la fila; los que solo probaban la tabla por resultado
  // («Ubicación», «Método» y «Motivo» como columnas) se fueron con ella.
  it("R3/R242: las gestiones de los 4 resultados salen en la lista única, una fila por gestión", () => {
    const grupos: CierreGrupos = {
      entregado: [makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-ENT" })],
      reprogramado: [makeGestion({ gestionId: "g2", resultado: "reprogramado", numRemision: "REM-REP" })],
      novedad: [makeGestion({ gestionId: "g3", resultado: "novedad", numRemision: "REM-DEV" })],
      devolucion_a_origen_por_rechazo: [makeGestion({ gestionId: "g4", resultado: "devolucion_a_origen_por_rechazo", numRemision: "REM-REC" })],
      incidente: [],
    };
    renderModule({ grupos });

    const lista = listaGestiones();
    const filas = Array.from(lista.querySelectorAll("[data-gestion]")).map((f) => f.getAttribute("data-gestion"));
    expect(filas).toEqual(["g1", "g2", "g3", "g4"]);
    for (const remision of ["REM-ENT", "REM-REP", "REM-DEV", "REM-REC"]) {
      expect(within(lista).getByRole("button", { name: `Devolver a gestión la orden ${remision} · Ana Pérez` })).toBeInTheDocument();
    }
    expect(screen.getByRole("tab", { name: "Gestiones (4)" })).toHaveAttribute("aria-selected", "true");
  });

  it("R4: la fila dice guía, destinatario y tienda, y al desplegarla la orden, el producto y la dirección", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.novedad = [
      makeGestion({
        gestionId: "g1",
        resultado: "novedad",
        numGuia: 2002,
        numRemision: "REM-DETALLE",
        destinatario: "Beto Ruiz",
        direccion: "Av. Central 100",
        producto: "Sobre",
        tiendaNombre: "Tienda Norte",
      }),
    ];
    renderModule({ grupos });

    const lista = listaGestiones();
    expect(within(lista).getByText("2002")).toBeInTheDocument();
    expect(within(lista).getByText(/Beto Ruiz/)).toBeInTheDocument();
    expect(within(lista).getByText(/Tienda Norte/)).toBeInTheDocument();
    await user.click(within(lista).getByRole("button", { name: "Detalle de la orden REM-DETALLE · Beto Ruiz" }));
    expect(within(lista).getByText("REM-DETALLE")).toBeInTheDocument();
    expect(within(lista).getByText("Av. Central 100")).toBeInTheDocument();
    expect(within(lista).getByText("Sobre")).toBeInTheDocument();
  });

  it("R6: una entrega expone su monto recibido tal cual lo da el servidor (money-safe)", () => {
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({
        gestionId: "g1",
        resultado: "entregado",
        numRemision: "REM-ENT",
        montoRecibido: "1250.50",
        metodoPago: "SINPE",
        pagos: [{ metodo: "SINPE", monto: "1250.50" }],
      }),
    ];
    renderModule({ grupos });

    expect(within(listaGestiones()).getByText("₡1.250,50")).toBeInTheDocument();
  });

  it("R5: la evidencia se muestra vía URL firmada en el visor (nunca el path crudo)", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.devolucion_a_origen_por_rechazo = [
      makeGestion({
        gestionId: "g1",
        resultado: "devolucion_a_origen_por_rechazo",
        numRemision: "REM-REC",
        motivo: "Dirección inexistente",
        evidenciaUrl: "https://signed.example/evidencia.jpg?token=abc", evidenciaUrls: ["https://signed.example/evidencia.jpg?token=abc"],
      }),
    ];
    renderModule({ grupos });

    await user.click(screen.getByRole("button", { name: "Detalle de la orden REM-REC · Ana Pérez" }));
    await user.click(screen.getByRole("button", { name: "Ver evidencia de la orden REM-REC · Ana Pérez" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Evidencia de la gestión",
    });
    const img = within(dialog).getByRole("img", {
      name: "Evidencia fotográfica de la gestión",
    });
    expect(img).toHaveAttribute(
      "src",
      "https://signed.example/evidencia.jpg?token=abc",
    );
  });

  it("R7/R241: «Recaudado» es el total del servidor y debajo los métodos que no valen cero (sin reparsear)", () => {
    renderModule({
      totales: {
        efectivo: "100.00",
        simpe: "50.25",
        transferencia: "10.10",
        general: "160.35",
      },
    });

    // El general es el del SERVIDOR, no una suma de la pantalla. FICHA 359: 100 + 50,25 + 10,10 =
    // 160,35, que es exactamente el total pintado.
    const recaudado = cifra("Recaudado");
    expect(within(recaudado).getByText("₡160,35")).toBeInTheDocument();
    expect(within(recaudado).getByText("₡100")).toBeInTheDocument();
    expect(within(recaudado).getByText("₡50,25")).toBeInTheDocument();
    expect(within(recaudado).getByText("₡10,10")).toBeInTheDocument();
  });

  it("R10/R256: expone la ganancia por gestión (string, money-safe) en su fila", () => {
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({
        gestionId: "g1",
        resultado: "entregado",
        numRemision: "REM-ENT",
        montoRecibido: "1250.50",
        metodoPago: "efectivo",
        pagos: [{ metodo: "efectivo", monto: "1250.50" }], // feature 213 (T8)
        pagoMensajero: "1500.00",
      }),
    ];
    renderModule({ grupos });

    expect(within(listaGestiones()).getByText("₡1.500")).toBeInTheDocument();
  });

  it("R11/R241: el total a pagar al mensajero es la cifra «Tu ganancia», separada de «Recaudado»", () => {
    renderModule({ totalPagoMensajero: "4200.00" });

    expect(within(cifra("Tu ganancia")).getByText("₡4.200")).toBeInTheDocument();
    expect(within(cifra("Recaudado")).queryByText("₡4.200")).toBeNull();
  });

  it("feature 56/R12: el ingreso de bodega por devoluciones a origen NO se muestra en la fila (el desglose vive en las vistas de bodega/admin)", () => {
    const grupos = emptyGrupos();
    grupos.devolucion_a_origen_por_rechazo = [
      makeGestion({
        gestionId: "g1",
        resultado: "devolucion_a_origen_por_rechazo",
        numRemision: "REM-REC",
        motivo: "Cliente rechazó",
        ingresoBodegaRechazo: "3517.00",
      }),
    ];
    renderModule({ grupos });

    const lista = listaGestiones();
    expect(within(lista).queryByText("Ingreso bodega")).not.toBeInTheDocument();
    expect(within(lista).queryByText("₡3.517")).not.toBeInTheDocument();
  });

  it("feature 56/R10: el ingreso de bodega por devoluciones a origen NO se le muestra al mensajero (el total vive en las vistas de bodega/admin)", () => {
    renderModule();

    expect(
      screen.queryByRole("region", { name: "Ingreso de bodega por devoluciones a origen" }),
    ).not.toBeInTheDocument();
  });

  it("R10/R11/R245: sin poder solicitar, el botón está deshabilitado y el motivo lo dicen la franja y el botón", () => {
    const motivo = "Tienes paquetes en reparto que todavía no gestionaste; gestiónalos antes de cerrar.";
    renderModule({ puedesSolicitar: false, motivoBloqueo: motivo });

    const boton = screen.getByRole("button", { name: "Solicitar cierre" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription(motivo);
    const franja = screen.getByText("Antes de cerrar:").closest('[role="status"]');
    expect(franja).toHaveTextContent(motivo);
  });

  it("solicitar cierre OK: confirma, muestra toast de éxito y refresca", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [makeGestion({ gestionId: "g1", resultado: "entregado" })];
    renderModule({ grupos, puedesSolicitar: true });

    await user.click(screen.getByRole("button", { name: "Solicitar cierre" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Solicitar cierre del día",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Solicitar cierre" }),
    );

    await vi.waitFor(() => expect(solicitarMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(successMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("SLT-137 R160: tras solicitar, la cola relee sus páginas y enseña el cierre nuevo sin recargar", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [makeGestion({ gestionId: "g1", resultado: "entregado" })];
    renderModule({ grupos, puedesSolicitar: true, cierresPasados: [CIERRE_PASADO] });
    const region = screen.getByRole("region", { name: "Cierres solicitados" });
    expect(screen.getByRole("tab", { name: "Cierres solicitados 1" })).toBeInTheDocument();
    // La revalidación del montaje termina ANTES de cambiar la respuesta: si no, ella sola traería
    // el cierre nuevo y el caso pasaría sin que solicitar releyera nada.
    await vi.waitFor(() => expect(vi.mocked(listarCierresPasadosPaginado)).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    // Lo que el servidor devuelve DESPUÉS de solicitar: el cierre nuevo encabeza la página.
    const nuevo: CierrePasadoDTO = {
      ...CIERRE_PASADO,
      cierreId: "c-nuevo",
      estado: "solicitado",
      solicitadoAt: "2026-07-19T15:00:00.000Z",
      resueltoAt: null,
    };
    vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({
      status: "ok",
      page: 1,
      ...paginaInicial([nuevo, CIERRE_PASADO]),
    });

    await user.click(screen.getByRole("button", { name: "Solicitar cierre" }));
    const dialog = await screen.findByRole("dialog", { name: "Solicitar cierre del día" });
    await user.click(within(dialog).getByRole("button", { name: "Solicitar cierre" }));

    expect(
      await within(region).findByRole("button", { name: "Ver del cierre del 2026-07-19" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cierres solicitados 2" })).toBeInTheDocument();
  });

  it("solicitar cierre conflict: muestra toast de error con el motivo del dominio", async () => {
    const user = userEvent.setup();
    solicitarMock.mockResolvedValue({
      status: "conflict",
      motivo: "Ya tienes un cierre solicitado.",
    });
    const grupos = emptyGrupos();
    grupos.entregado = [makeGestion({ gestionId: "g1", resultado: "entregado" })];
    renderModule({ grupos, puedesSolicitar: true });

    await user.click(screen.getByRole("button", { name: "Solicitar cierre" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Solicitar cierre del día",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Solicitar cierre" }),
    );

    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("Ya tienes un cierre solicitado."),
    );
    expect(successMock).not.toHaveBeenCalled();
  });

  it("SLT-103 R55/R140: «Solicitar cierre del día» resume Gestiones, Recaudado y Tu ganancia, en ese orden", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "e1", resultado: "entregado", numRemision: "REM-E1" }),
      makeGestion({ gestionId: "e2", resultado: "entregado", numRemision: "REM-E2" }),
      makeGestion({ gestionId: "e3", resultado: "entregado", numRemision: "REM-E3" }),
    ];
    grupos.devolucion_a_origen_por_rechazo = [
      makeGestion({ gestionId: "r1", resultado: "devolucion_a_origen_por_rechazo", numRemision: "REM-R1" }),
    ];
    renderModule({
      grupos,
      // `efectivo` distinto de `general` a propósito: el resumen lee el «Total general».
      totales: { efectivo: "100000.00", simpe: "85275.00", transferencia: "100000.00", general: "285275.00" },
      totalPagoMensajero: "45000.55",
      puedesSolicitar: true,
    });

    await user.click(screen.getByRole("button", { name: "Solicitar cierre" }));
    const dialog = await screen.findByRole("dialog", { name: "Solicitar cierre del día" });
    const resumen = dialog.querySelector('dl[aria-label="Resumen del cierre a solicitar"]');
    expect(resumen).not.toBeNull();
    if (!resumen) return;
    const pares = Array.from(resumen.children).map((el) => el.textContent?.trim());
    expect(pares).toEqual(["Gestiones", "4", "Recaudado", "₡285.275", "Tu ganancia", "₡45.000,55"]);
  });

  it("R18: el histórico lista los cierres pasados con estado, destino y totales", () => {
    const cierresPasados: CierrePasadoDTO[] = [
      {
        cierreId: "c1",
        estado: "solicitado",
        destinoTipo: "bodega_central",
        destinoZonaId: "z1",
        totales: {
          efectivo: "300.00",
          simpe: "0.00",
          transferencia: "0.00",
          general: "300.00",
        },
        totalPagoMensajero: "0.00", // feature 39/R13
        totalIngresoBodegaRechazos: "2100.00", // en el DTO, pero el mensajero no lo ve
        solicitadoAt: "2026-07-11T10:00:00.000Z",
      },
    ];
    renderModule({ cierresPasados });

    const region = screen.getByRole("region", { name: "Cierres solicitados" });
    // SLT-137 (R156): el histórico vuelve a ser la cola, una fila por cierre. La fila dice estado,
    // destino, la fecha con su hora de Costa Rica (10:00 UTC = 04:00 CR) y el total recaudado.
    const fila = within(region).getAllByRole("row")[1];
    expect(within(fila).getByText("Solicitado")).toBeInTheDocument();
    expect(within(fila).getByText("Bodega central")).toBeInTheDocument();
    // Un solo ₡300 a la vista: el «Recaudado». El importe va sin céntimos desde la feature 230.
    expect(within(region).getAllByText("₡300")).toHaveLength(1);
    // El histórico del mensajero nunca enseñó el ingreso de bodega por devoluciones a origen: es
    // plata de la empresa (design §7.2).
    expect(within(region).queryByText("₡2.100")).not.toBeInTheDocument();
    expect(within(fila).getByText("2026-07-11 04:00")).toBeInTheDocument();
  });

  it("R18 + design §7.2: en su cola, el mensajero ve SU ganancia y no el ingreso de la empresa", () => {
    // SLT-137 (R156): la cola no tiene desplegable; la fila lo dice todo al primer vistazo.
    const cierresPasados: CierrePasadoDTO[] = [
      {
        cierreId: "c1",
        estado: "aprobado",
        destinoTipo: "bodega_central",
        destinoZonaId: "z1",
        totales: {
          efectivo: "300.00",
          simpe: "0.00",
          transferencia: "0.00",
          general: "300.00",
        },
        totalPagoMensajero: "45.00",
        totalIngresoBodegaRechazos: "2100.00",
        solicitadoAt: "2026-07-11T10:00:00.000Z",
      },
    ];
    renderModule({ cierresPasados });

    const region = screen.getByRole("region", { name: "Cierres solicitados" });

    // Su pago está, y con SU rótulo: en su pantalla ese monto se llama «Ganancia».
    expect(within(region).getByRole("columnheader", { name: "Ganancia" })).toBeInTheDocument();
    expect(within(region).getByText("₡45")).toBeInTheDocument();
    // Y el ingreso de bodega por devoluciones a origen sigue sin aparecer, ni el rótulo ni el monto.
    expect(
      within(region).queryByText("Ingreso de bodega por devoluciones a origen"),
    ).not.toBeInTheDocument();
    expect(within(region).queryByText("₡2.100")).not.toBeInTheDocument();
  });

  // Pedido humano: cada cierre del histórico se puede ABRIR y ver su detalle. SLT-108 (R59): con el
  // detalle único del módulo en audiencia mensajero, ya no con el comprobante.
  it("el histórico ofrece 'Ver' y abre el detalle único del cierre con sus órdenes", async () => {
    const user = userEvent.setup();
    verCierrePasadoMock.mockResolvedValue({
      ordenesSinGestion: [],
      sinGestionRegistrado: true,
      rechazosDeTienda: [],
      status: "ok",
      cierre: CIERRE_PASADO,
      grupos: {
        ...emptyGrupos(),
        entregado: [
          makeGestion({
            gestionId: "g1",
            resultado: "entregado",
            destinatario: "Ana Pérez",
            montoRecibido: "300.00",
            metodoPago: "efectivo",
            pagos: [{ metodo: "efectivo", monto: "300.00" }], // feature 213 (T8)
            pagoMensajero: "45.00",
          }),
        ],
      },
    });
    renderModule({ cierresPasados: [CIERRE_PASADO] });

    const region = screen.getByRole("region", { name: "Cierres solicitados" });
    await user.click(within(region).getByRole("button", { name: /^Ver del cierre/ }));

    await vi.waitFor(() =>
      expect(verCierrePasadoMock).toHaveBeenCalledWith({ cierreId: "c1" }),
    );
    // El detalle se pinta con la orden del cierre y el pago rotulado como GANANCIA
    // (para el mensajero ese monto es su ganancia, no "pago al mensajero").
    const detalle = await screen.findByRole("dialog", {
      name: "Detalle del cierre · Tu cierre del día",
    });
    expect(within(detalle).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(detalle).getAllByText("Ganancia").length).toBeGreaterThan(0);
    // Plata de la EMPRESA: no aparece en la vista del mensajero (design §7.2).
    expect(within(detalle).queryByText("Pago al mensajero")).toBeNull();
    expect(within(detalle).queryByText("Liquidación")).toBeNull();
    // R161: el comprobante ya no se monta.
    expect(screen.queryByRole("region", { name: "Comprobante detallado de tu cierre" })).toBeNull();
  });

  it("si el cierre ya no está disponible, avisa por toast y no abre el detalle (R153)", async () => {
    const user = userEvent.setup();
    verCierrePasadoMock.mockResolvedValue({ status: "no_encontrada" });
    renderModule({ cierresPasados: [CIERRE_PASADO] });

    await user.click(screen.getByRole("button", { name: /^Ver del cierre/ }));

    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("Este cierre ya no está disponible."),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("R18: sin cierres pasados muestra el estado vacío del histórico", () => {
    renderModule({ cierresPasados: [] });
    const region = screen.getByRole("region", { name: "Cierres solicitados" });
    expect(
      within(region).getByText("Aún no has solicitado ningún cierre."),
    ).toBeInTheDocument();
  });

  // =============================================================================================
  // Feature 41 (F2/R21) + 111 (R12) + 109 (R31) -> FEATURE 271 (T9.2/T9.3)
  // =============================================================================================
  //
  // ⚠️ EL AVISO CAMBIÓ DOS VECES EN TRES DÍAS Y LA SEGUNDA DESHACE MEDIA PRIMERA.
  //   · Hasta el 19/08: «No puedes gestionar NI RECIBIR NUEVAS ASIGNACIONES…».
  //   · El 20/08 (241): se le quitó lo de recibir —la regla firmada declaraba la asignación exenta
  //     de todo bloqueo— y quedó «Sí puedes seguir recibiendo asignaciones: te esperan en
  //     «Entregas»».
  //   · El 23/08 (esta ficha, palabra del humano): esa mitad se REVIERTE. Un mensajero bloqueado
  //     TAMPOCO recibe trabajo nuevo, ni reparto ni recolección. La frase del 20/08 pasó de cierta
  //     a falsa, y este archivo la afirmaba palabra por palabra.
  //
  // ⚠️ LOS LITERALES VAN A MANO Y COMPLETOS, y NO importados de `avisoBloqueo` — compararlos
  // contra la función que los genera estaría siempre verde: cambiar el copy cambiaría el aserto
  // con él y esto no vigilaría nada. Aquí el texto es el CONTRATO con el mensajero, aprobado por
  // el humano el 2026-08-23 (§10.2), en su variante SIN puntero: ya está en esta pantalla.
  //
  // ⚠️ Y AHORA EL AVISO CUENTA. Antes era una cadena fija; ahora dice CUÁNTOS cierres arrastra y
  // CUÁL toca resolver primero (R43), con la fecha de la JORNADA —no la del nacimiento del cierre,
  // que en un vencido va un día por delante—.

  it("271/§10.2 caso 1 · bloqueado por ACUMULAR (N=2, V=0), con la fecha de la jornada", () => {
    renderModule({ bloqueo: bloqueoPorAcumular("2026-08-21") });

    expect(avisoDeBloqueo()).toHaveTextContent(
      "Tienes 2 cierres esperando aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Se desbloquea cuando la bodega apruebe el más antiguo, el del 21 de agosto.",
    );
  });

  it("271/R60 · el MISMO caso sin jornada fiable: la fecha desaparece entera", () => {
    renderModule({ bloqueo: bloqueoPorAcumular(null) });

    expect(avisoDeBloqueo()).toHaveTextContent(
      "Tienes 2 cierres esperando aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Se desbloquea cuando la bodega apruebe el más antiguo.",
    );
  });

  it("271/§10.2 caso 2 · con algo que reenviar (N=1, V=1): el botón está DEBAJO, no en otra pantalla", () => {
    renderModule({ bloqueo: bloqueoConVencido() });

    // La única diferencia con los portales «Entregas» y «Recolección» (R52): allí el puntero manda
    // a «Cierre del día»; aquí el mensajero YA está, y remitirlo aquí sería ruido.
    expect(avisoDeBloqueo()).toHaveTextContent(
      "Tienes un cierre sin enviar a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envíalo a aprobación con el botón de abajo.",
    );
    expect(avisoDeBloqueo()).not.toHaveTextContent(/Ve a «Cierre del día»/);
  });

  it("271/§10.2 caso 3 · las DOS cosas a la vez (N=2, V=1)", () => {
    renderModule({ bloqueo: bloqueoDe({ n: 2, v: 1, jornadaCR: "2026-08-21" }) });

    expect(avisoDeBloqueo()).toHaveTextContent(
      "Tienes 2 cierres sin resolver y 1 de ellos no se ha enviado a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envía el que falta y espera a que la bodega apruebe el más antiguo, el del 21 de agosto.",
    );
    // Aquí NUNCA hay puntero (R52): el mensajero ya está en esta pantalla. El cambio del
    // 2026-08-23 —el puntero de este caso pierde el objeto— sólo afecta a los otros tres portales.
    expect(avisoDeBloqueo()).not.toHaveTextContent(/Ve a «Cierre del día»/);
  });

  it("271/§10.2 caso 3 con el MÁS VIEJO SUYO · la fecha es la del que él envía", () => {
    // ⚠️ LA CUARTA RAMA (aprobada el 2026-08-23, y el estado se midió en el navegador): el admin
    // rechazó el PRIMERO de sus dos `solicitado`, así que el cierre más viejo es SUYO. Antes decía
    // «espera a que la bodega apruebe el más antiguo» fechando su propio cierre — le mandaba a
    // esperar por el mismo que el botón le ofrece reenviar. Ahora la fecha nombra el que ÉL envía y
    // la espera se corre al RESTO.
    renderModule({ bloqueo: bloqueoMixtoElMasViejoEsSuyo({ jornadaCR: "2026-08-20" }) });

    expect(avisoDeBloqueo()).toHaveTextContent(
      "Tienes 2 cierres sin resolver y 1 de ellos no se ha enviado a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envía el que falta, el del 20 de agosto, y después espera a que la bodega apruebe el resto.",
    );
    // Aquí nunca hay puntero (R52) y el botón del rechazado está debajo, en la misma pantalla.
    expect(avisoDeBloqueo()).not.toHaveTextContent(/Ve a «Cierre del día»/);
    expect(
      screen.getByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    ).toBeInTheDocument();
  });

  it("271/§10.2 caso 3 con V = N · TODO en su tejado: ni singular ni esperar a la bodega", () => {
    // Estado alcanzable (dos `rechazado`, o `vencido` + `rechazado`). Hasta el 2026-08-23 leía el
    // texto de arriba, que aquí dice dos cosas falsas: singular con DOS por enviar, y esperar a la
    // bodega cuando el más antiguo es suyo. Y sigue sin puntero, que es lo propio de esta pantalla.
    renderModule({ bloqueo: bloqueoTodosPorEnviar(2, "2026-08-21") });

    expect(avisoDeBloqueo()).toHaveTextContent(
      "Tienes 2 cierres sin resolver y ninguno se ha enviado a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envíalos a aprobación, empezando por el más antiguo, el del 21 de agosto.",
    );
    expect(avisoDeBloqueo()).not.toHaveTextContent(/Ve a «Cierre del día»/);
  });

  it("271/R51 · el aviso NO promete recibir asignaciones ni recoger en tiendas", () => {
    // Guardia de la regresión concreta, en su forma NEGATIVA: que hoy diga la verdad no impide que
    // mañana vuelva a colarse la promesa «para suavizar el mensaje». Era cierta hasta el 22 de
    // agosto y es falsa desde el 23.
    renderModule({ bloqueo: bloqueoDe({ n: 2, v: 1, jornadaCR: "2026-08-21" }) });

    const aviso = avisoDeBloqueo();
    expect(aviso).not.toHaveTextContent(/seguir recibiendo asignaciones/i);
    expect(aviso).not.toHaveTextContent(/seguir recogiendo en tiendas/i);
    expect(aviso).not.toHaveTextContent(/sí puedes/i);
    expect(aviso).not.toHaveTextContent(/ni recibir nuevas asignaciones/i);
  });

  it("271/R5 · un solo cierre YA enviado (N=1, V=0) NO muestra el aviso", () => {
    // La mitad de la regla del 2026-08-20 que esta ficha CONSERVA: ese mensajero ya hizo lo suyo y
    // espera al administrador (mediana 8,2 h, p90 22,1 h medidas contra producción).
    renderModule({ bloqueo: bloqueoDe({ n: 1, v: 0 }) });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Tu cierre está bloqueado:")).toBeNull();
  });

  it("271/R4 · sin ningún cierre abierto tampoco hay aviso", () => {
    renderModule({ bloqueo: SIN_BLOQUEO });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Tu cierre está bloqueado:")).toBeNull();
  });

  // ---------- Feature 111 (R13) -> 271 (T9.3): el CTA del cierre vencido, DERIVADO ----------
  //
  // El CTA ya no llega en una prop propia: se deriva del MISMO detalle que enciende el aviso. Dos
  // fuentes para la misma pregunta —el predicado por un lado, el histórico de cierres por otro— es
  // exactamente cómo se desincronizan.

  it("R13: con el más viejo VENCIDO aparece el CTA, habilitado aunque no pueda solicitar", () => {
    renderModule({ bloqueo: bloqueoConVencido(), puedesSolicitar: false });

    const cta = screen.getByRole("button", {
      name: "Solicitar aprobación del cierre vencido",
    });
    expect(cta).toBeInTheDocument();
    // R13: habilitado con INDEPENDENCIA del gate de creación (`puedesSolicitar`).
    expect(cta).toBeEnabled();
    // SLT-109 (R240): la página pinta el vencido y NO el cierre de hoy, así que no hay «Solicitar
    // cierre» (antes salía deshabilitado debajo).
    expect(screen.queryByRole("button", { name: "Solicitar cierre" })).toBeNull();
  });

  it("R13: sin nada que reenviar NO aparece el CTA del vencido", () => {
    renderModule({ bloqueo: bloqueoDe({ n: 1, v: 0 }) });

    expect(
      screen.queryByRole("button", {
        name: "Solicitar aprobación del cierre vencido",
      }),
    ).not.toBeInTheDocument();
  });

  it("R13/271: al confirmar el CTA del vencido invoca solicitarCierre y muestra su toast", async () => {
    const user = userEvent.setup();
    // FEATURE 271: el servidor ya NO distingue `vencido_solicitado` de `rechazado_solicitado` —la
    // re-solicitud se decide por EDAD, no por estado (R18)—, así que devuelve `resolicitado` y
    // quien sabe qué acaba de pasar es el botón que se pulsó.
    solicitarMock.mockResolvedValue({ status: "ok", via: "resolicitado" });
    renderModule({ bloqueo: bloqueoConVencido(), puedesSolicitar: false });

    await user.click(
      screen.getByRole("button", {
        name: "Solicitar aprobación del cierre vencido",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Solicitar aprobación del cierre vencido",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Solicitar aprobación" }),
    );

    await vi.waitFor(() => expect(solicitarMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(successMock).toHaveBeenCalledWith(
        "Cierre vencido enviado a aprobación.",
      ),
    );
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  // ---------- Feature 109 (R31) -> 271: el CTA del cierre rechazado ----------

  it("R31: con el más viejo RECHAZADO aparece su CTA, habilitado aunque no pueda solicitar", () => {
    renderModule({ bloqueo: bloqueoConRechazado(), puedesSolicitar: false });

    const cta = screen.getByRole("button", {
      name: "Solicitar aprobación del cierre rechazado",
    });
    expect(cta).toBeInTheDocument();
    expect(cta).toBeEnabled();
    // SLT-109 (R240): se pinta el rechazado, no el cierre de hoy.
    expect(screen.queryByRole("button", { name: "Solicitar cierre" })).toBeNull();
  });

  // SLT-109 (R246, R255): los avisos sueltos «Cierre rechazado» y «Cierre vencido» se fueron con sus
  // regiones. Lo que decían lo dicen ahora la franja del detalle (el motivo del rechazo y el aviso de
  // bloqueo, que distingue «envíalo» de «espera a la bodega») y el pie con su botón. Lo que estos
  // casos vigilaban —que nada promete que el bloqueo se levanta al reenviar (271)— sigue vigilado
  // sobre el detalle entero.
  it("R31/271 → SLT-109: el rechazado se pinta en el detalle, sin la región suelta, y nada promete el desbloqueo", () => {
    renderModule({ bloqueo: bloqueoConRechazado() });

    expect(screen.queryByRole("region", { name: "Cierre rechazado" })).toBeNull();
    const detalle = screen.getByRole("region", { name: "Detalle del cierre · Tu cierre del día" });
    expect(within(detalle).getByText("Motivo del rechazo:")).toBeInTheDocument();
    // Ni la promesa vieja de la 109 («hasta que tu bodega lo apruebe») ni la de la 241 («con eso
    // se levanta el bloqueo»): las dos son ciertas sólo para un valor concreto de N.
    expect(detalle).not.toHaveTextContent(/sigue bloqueando/i);
    expect(detalle).not.toHaveTextContent(/y tu bodega lo apruebe/i);
    expect(detalle).not.toHaveTextContent(/se levanta el bloqueo/i);
  });

  it("R13/271 → SLT-109: el vencido se pinta en el detalle con la franja de bloqueo, sin la región suelta ni promesas", () => {
    renderModule({ bloqueo: bloqueoConVencido() });

    expect(screen.queryByRole("region", { name: "Cierre vencido" })).toBeNull();
    expect(avisoDeBloqueo()).toHaveTextContent("Envíalo a aprobación con el botón de abajo.");
    const detalle = screen.getByRole("region", { name: "Detalle del cierre · Tu cierre del día" });
    expect(detalle).not.toHaveTextContent(/destrabar tu operación/i);
  });

  it("R31: sin cierre rechazado NO aparece su CTA", () => {
    renderModule({ bloqueo: bloqueoConVencido() });

    expect(
      screen.queryByRole("button", {
        name: "Solicitar aprobación del cierre rechazado",
      }),
    ).not.toBeInTheDocument();
  });

  it("R31/271: al confirmar el CTA del rechazado invoca la MISMA action y muestra su toast", async () => {
    const user = userEvent.setup();
    solicitarMock.mockResolvedValue({ status: "ok", via: "resolicitado" });
    renderModule({ bloqueo: bloqueoConRechazado(), puedesSolicitar: false });

    await user.click(
      screen.getByRole("button", {
        name: "Solicitar aprobación del cierre rechazado",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Solicitar aprobación del cierre rechazado",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Solicitar aprobación" }),
    );

    await vi.waitFor(() => expect(solicitarMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(successMock).toHaveBeenCalledWith(
        "Cierre rechazado enviado a aprobación.",
      ),
    );
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  // =============================================================================================
  // FEATURE 271 — QUÉ PUEDE REENVIAR **ÉL**: LOS CASOS 5, 6 Y 7 DE LA TABLA DE VERDAD
  // =============================================================================================
  //
  // EL BOTÓN NO CONTESTA LA PREGUNTA DE LA COLA. `aResolverPrimero` dice qué se resuelve PRIMERO
  // (el abierto más viejo, R11); `aReenviarPrimero` dice qué puede tocar ÉL (el RE-SOLICITABLE más
  // viejo, R18). En los casos 5 y 7 son el mismo cierre y da igual de cuál se lea; en el CASO 6
  // —«solicitó el primero y dejó vencer el segundo», N=2 V=1— son DOS cierres distintos, y ahí es
  // donde la pantalla se equivocaba: derivaba el botón del primero, veía un `solicitado` —que
  // resuelve la BODEGA— y no pintaba nada, aunque `solicitarCierre` sí le dejaba reenviar el otro
  // (R16/R18). Un mensajero con algo que hacer y sin dónde hacerlo.
  //
  // ⚠️ AQUÍ VIVIÓ UN TERCER CTA «NEUTRO» («Enviar el cierre a aprobación») y estos tests vigilan
  // que NO vuelva. Existía sólo porque el dato no viajaba: decía que había algo que enviar sin
  // poder decir qué. Ahora el caso 6 enciende el CTA del `vencido` o el del `rechazado`, con
  // nombre propio, así que un botón sin nombre sería un segundo botón para el MISMO envío.
  const CTA_NEUTRO_RETIRADO = "Enviar el cierre a aprobación";

  /**
   * El CASO 7 —«dos cierres rechazados», N=2 V=2— se compone AQUÍ y no se pide a `bloqueoDe`:
   * esa fábrica sólo sabe producir `vencido`, y lo que esta pantalla tiene que saber pintar en el
   * caso 7 es el desenlace **normal** de dos re-solicitables, que llega por el RECHAZO.
   *
   * ⚠️ CORREGIDO EL 2026-08-23: aquí decía que **dos `vencido` a la vez son IMPOSIBLES** (R17) y que
   * pedirle `{ n: 2, v: 2 }` daría «un doble que la base no puede producir». **La base sí puede
   * producirlo** —raro, pero alcanzable: la orden reservada de la 246 sobrevive al corte y su
   * protección caduca sola; medido en
   * `tests/integration/db/corte-diario-segundo-cierre-sql-real.test.ts`—. El caso 7 se sigue
   * componiendo con dos `rechazado` porque es el camino frecuente, no porque el otro no exista. Y la
   * pantalla no necesita distinguirlos: la rama `v === n` del aviso dice lo mismo para los dos.
   *
   * `bloqueado` NO se escribe a mano —sale de `estaBloqueadoPorCierres`, igual que en la fábrica
   * compartida—: un doble no debe poder afirmar un estado que la regla no produce.
   */
  function bloqueoCaso7(): BloqueoDetalle {
    const rechazadoMasViejo = {
      cierreId: "c-rechazado-viejo",
      estado: "rechazado" as const,
      solicitadoAt: "2026-08-20T18:00:00.000Z",
      jornadaCR: "2026-08-20",
      resuelve: "mensajero" as const,
    };
    return {
      bloqueado: estaBloqueadoPorCierres({ n: 2, v: 2 }),
      cierresAbiertos: 2,
      cierresPorReenviar: 2,
      // Con los DOS abiertos re-solicitables, el más viejo de la cola y el más viejo de los
      // re-solicitables son el MISMO cierre: los dos campos apuntan ahí (R18).
      aResolverPrimero: rechazadoMasViejo,
      aReenviarPrimero: rechazadoMasViejo,
    };
  }

  it("271/caso 5 (N=1, V=1): con un único cierre vencido, su CTA y ningún otro", () => {
    // Los dos campos nombran el mismo cierre. Es el caso que ya funcionaba, y está aquí para que se
    // vea que la lectura nueva no lo rompe: no hace falta ramificar por caso.
    renderModule({ bloqueo: bloqueoConVencido("2026-08-21"), puedesSolicitar: false });

    expect(
      screen.getByRole("button", { name: "Solicitar aprobación del cierre vencido" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: CTA_NEUTRO_RETIRADO })).toBeNull();
  });

  it("271/caso 6 (N=2, V=1): el CTA sale del RE-SOLICITABLE, no del más viejo de la cola", () => {
    // ⚠️ ÉSTE ES EL TEST DE LA REGRESIÓN. El más viejo es el `solicitado` que espera a la bodega;
    // el suyo es el `vencido`. Derivar el botón del primero deja la pantalla SIN botón —el fallo
    // que este cambio cierra—, así que este aserto muere si alguien vuelve a leer aquel campo.
    renderModule({
      bloqueo: bloqueoDe({ n: 2, v: 1, jornadaCR: "2026-08-21" }),
      puedesSolicitar: false,
    });

    const cta = screen.getByRole("button", {
      name: "Solicitar aprobación del cierre vencido",
    });
    expect(cta).toBeEnabled();
    // Y con nombre propio: el CTA neutro se retiró junto con la deuda que lo justificaba.
    expect(screen.queryByRole("button", { name: CTA_NEUTRO_RETIRADO })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    ).toBeNull();
  });

  it("271/caso 6: el aviso dice LAS DOS COSAS y el botón está debajo, en la misma pantalla", () => {
    // R43 — qué espera de la bodega (`aResolverPrimero`, con SU fecha) y qué puede hacer él ya
    // mismo (`aReenviarPrimero`, que es el botón). Antes decía sólo la primera mitad y la segunda
    // no tenía dónde ocurrir.
    //
    // ⚠️ LITERAL A MANO Y COMPLETO (§10.2, aprobado por el humano el 2026-08-23), nunca comparado
    // contra `avisoBloqueo`: un texto medido contra la función que lo genera está siempre verde.
    renderModule({
      bloqueo: bloqueoDe({ n: 2, v: 1, jornadaCR: "2026-08-21" }),
      puedesSolicitar: false,
    });

    expect(avisoDeBloqueo()).toHaveTextContent(
      "Tienes 2 cierres sin resolver y 1 de ellos no se ha enviado a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envía el que falta y espera a que la bodega apruebe el más antiguo, el del 21 de agosto.",
    );
    expect(
      screen.getByRole("button", { name: "Solicitar aprobación del cierre vencido" }),
    ).toBeEnabled();
  });

  it("271/caso 6: la fecha del aviso es la del cierre que espera a la BODEGA, no la del suyo", () => {
    // Las dos jornadas son distintas a propósito (21 el `solicitado`, 22 el `vencido`). La
    // aposición cuelga de «el más antiguo», que es el de la bodega: leerla del re-solicitable
    // nombraría el 22 y mandaría al mensajero a esperar por un cierre que ya es suyo.
    renderModule({
      bloqueo: bloqueoDe({
        n: 2,
        v: 1,
        jornadaCR: "2026-08-21",
        jornadaCRReenviable: "2026-08-22",
      }),
    });

    const aviso = avisoDeBloqueo();
    expect(aviso).toHaveTextContent("el más antiguo, el del 21 de agosto");
    expect(aviso).not.toHaveTextContent("22 de agosto");
  });

  it("271/caso 7 (N=2, V=2, dos rechazados): aparece el CTA del rechazado, que es SU clase", () => {
    renderModule({ bloqueo: bloqueoCaso7(), puedesSolicitar: false });

    expect(
      screen.getByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    ).toBeEnabled();
    // Ni el del vencido —ese cierre no lo está— ni el neutro, que ya no existe.
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre vencido" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: CTA_NEUTRO_RETIRADO })).toBeNull();
  });

  it("271/caso 4: bloqueado por ACUMULAR (V=0) NO ofrece ningún botón de reenvío", () => {
    // `aReenviarPrimero` es `null`: sus dos cierres están enviados y no tiene nada que hacer.
    // Ofrecerle un botón sería mandarlo a buscar una acción que el servidor no tiene, y es la misma
    // razón por la que este caso es el único cuyo aviso no lleva llamado a la acción.
    renderModule({ bloqueo: bloqueoPorAcumular("2026-08-21"), puedesSolicitar: false });

    expect(screen.queryByRole("button", { name: CTA_NEUTRO_RETIRADO })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre vencido" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    ).toBeNull();
  });

  it("271/casos 2 y 3: un solo cierre YA enviado (N=1, V=0) tampoco ofrece reenvío", () => {
    // Ni bloqueo ni botón: ese mensajero ya hizo lo suyo y espera al administrador.
    renderModule({ bloqueo: bloqueoDe({ n: 1, v: 0 }) });

    expect(screen.queryByRole("button", { name: CTA_NEUTRO_RETIRADO })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre vencido" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    ).toBeNull();
  });

  it("271/caso 1: sin ningún cierre abierto no hay ni aviso ni botón de reenvío", () => {
    renderModule({ bloqueo: SIN_BLOQUEO });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Tu cierre está bloqueado:")).toBeNull();
    expect(screen.queryByRole("button", { name: CTA_NEUTRO_RETIRADO })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre vencido" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    ).toBeNull();
  });

  it("271/caso 6: al confirmar, el CTA nombrado invoca la MISMA action y da SU toast", async () => {
    const user = userEvent.setup();
    solicitarMock.mockResolvedValue({ status: "ok", via: "resolicitado" });
    renderModule({
      bloqueo: bloqueoDe({ n: 2, v: 1, jornadaCR: "2026-08-21" }),
      puedesSolicitar: false,
    });

    await user.click(
      screen.getByRole("button", {
        name: "Solicitar aprobación del cierre vencido",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Solicitar aprobación del cierre vencido",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Solicitar aprobación" }),
    );

    await vi.waitFor(() => expect(solicitarMock).toHaveBeenCalledTimes(1));
    // El servidor devuelve `resolicitado` sin decir de qué clase (mueve el más viejo por EDAD,
    // R18); quien sabe qué acaba de pasar es el botón que se pulsó, y aquí ya sabe nombrarlo.
    await vi.waitFor(() =>
      expect(successMock).toHaveBeenCalledWith("Cierre vencido enviado a aprobación."),
    );
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});

// ---------- Feature 67 (T17/T18, R35–R38): deshacer gestión ----------
//
// La vista NO decide la elegibilidad: `findGestionesPendientes` ya filtra por la
// ventana (`cierre_id IS NULL` + `anulada_at IS NULL`) y `/cierre-dia` es exclusivo
// del mensajero dueño (`page.tsx` → `notFound()`). Por eso toda fila renderizada es
// deshacible y el botón va en las 4 tablas; una carrera la corta el server con
// `conflict` + motivo accionable, que la vista muestra tal cual (R38).

const REGIONES: Array<{ resultado: CierreResultado; region: string }> = [
  { resultado: "entregado", region: "Entregado" },
  { resultado: "reprogramado", region: "Reprogramado" },
  { resultado: "novedad", region: "Novedad" },
  { resultado: "devolucion_a_origen_por_rechazo", region: "Devolución a origen por rechazo" },
];

/** Abre el modal de confirmación desde la fila indicada y devuelve el diálogo. */
async function abrirDeshacer(
  user: ReturnType<typeof userEvent.setup>,
  nombreBoton: string,
) {
  await user.click(
    within(listaGestiones()).getByRole("button", {
      name: nombreBoton,
    }),
  );
  return screen.findByRole("dialog", { name: "Devolver la orden a gestión" });
}

describe("CierreDiaModule — feature 67: devolver a gestión", () => {
  it.each(REGIONES)(
    "R35/R243: ofrece la acción en la fila de una gestión «$region» de la lista única",
    ({ resultado }) => {
      const grupos = emptyGrupos();
      grupos[resultado] = [
        makeGestion({ gestionId: "g1", resultado, destinatario: "Ana Pérez", numRemision: "REM-A" }),
      ];
      renderModule({ grupos });

      expect(
        within(listaGestiones()).getByRole("button", {
          name: "Devolver a gestión la orden REM-A · Ana Pérez",
        }),
      ).toBeInTheDocument();
    },
  );

  it("R35: hay UN botón por fila y su nombre accesible identifica SU orden", () => {
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-1", destinatario: "Ana Pérez" }),
      makeGestion({ gestionId: "g2", resultado: "entregado", numRemision: "REM-2", destinatario: "Beto Ruiz" }),
    ];
    renderModule({ grupos });

    const region = listaGestiones();
    expect(
      within(region).getAllByRole("button", { name: /^Devolver a gestión la orden/ }),
    ).toHaveLength(2);
    expect(
      within(region).getByRole("button", { name: "Devolver a gestión la orden REM-1 · Ana Pérez" }),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole("button", { name: "Devolver a gestión la orden REM-2 · Beto Ruiz" }),
    ).toBeInTheDocument();
  });

  it("R35: una tabla vacía no ofrece la acción", () => {
    renderModule({ grupos: emptyGrupos() });

    expect(
      screen.queryByRole("button", { name: /^Devolver a gestión la orden/ }),
    ).not.toBeInTheDocument();
  });

  it("R36: pulsar la acción NO ejecuta el deshacer: pide confirmación explícita", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.novedad = [
      makeGestion({ gestionId: "g1", resultado: "novedad", numRemision: "REM-A", destinatario: "Ana Pérez" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");

    expect(dialog).toBeInTheDocument();
    expect(deshacerMock).not.toHaveBeenCalled();
  });

  it("R36: cancelar la confirmación NO invoca la action ni refresca", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-A", destinatario: "Ana Pérez" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(deshacerMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R36: la confirmación nombra la orden y advierte que la gestión queda anulada con rastro", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-A", destinatario: "Ana Pérez" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");

    expect(dialog).toHaveTextContent(/Orden REM-A · Ana Pérez/);
    expect(dialog).toHaveTextContent(/quedará anulada/i);
    expect(dialog).toHaveTextContent(/volverá a tu lista para gestionar/i);
  });

  it("R37: al confirmar invoca la action con el gestionId de ESA fila (objeto, no string)", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.reprogramado = [
      makeGestion({ gestionId: "g-abc", resultado: "reprogramado", numRemision: "REM-1", destinatario: "Ana Pérez" }),
      makeGestion({ gestionId: "g-xyz", resultado: "reprogramado", numRemision: "REM-2", destinatario: "Beto Ruiz" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-2 · Beto Ruiz",
    );
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(deshacerMock).toHaveBeenCalledTimes(1));
    expect(deshacerMock).toHaveBeenCalledWith({ gestionId: "g-xyz" });
  });

  it("R37: éxito → toast de éxito y refresh (la vista relee el estado del servidor)", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-A", destinatario: "Ana Pérez" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(successMock).toHaveBeenCalled());
    // R37: el nuevo estado (fila fuera + totales recalculados) lo produce el SERVIDOR;
    // la vista solo revalida la ruta. Nunca muta la tabla ni los totales localmente.
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("R38: conflict → muestra el motivo ACCIONABLE del server y NO altera tabla ni totales", async () => {
    const user = userEvent.setup();
    deshacerMock.mockResolvedValue({
      status: "conflict",
      motivo: "Esta orden ya fue procesada por la bodega; ya no se puede deshacer.",
    });
    const grupos = emptyGrupos();
    grupos.novedad = [
      makeGestion({
        gestionId: "g1",
        resultado: "novedad",
        numRemision: "REM-A",
        destinatario: "Ana Pérez",
        pagoMensajero: "1500.00",
      }),
    ];
    const totales: CierreTotales = {
      efectivo: "150.00",
      simpe: "0.00",
      transferencia: "0.00",
      general: "150.00",
    };
    renderModule({ grupos, totales, totalPagoMensajero: "1500.00" });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith(
        "Esta orden ya fue procesada por la bodega; ya no se puede deshacer.",
      ),
    );
    expect(successMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    // La fila sigue en la lista y las cifras no se movieron (R38; SLT-109 R243).
    const region = listaGestiones();
    expect(region.querySelector('[data-gestion="g1"]')).not.toBeNull();
    expect(
      within(region).getByRole("button", { name: "Devolver a gestión la orden REM-A · Ana Pérez" }),
    ).toBeEnabled();
    // «Recaudado» y su único método (efectivo) dicen ₡150.
    expect(within(cifra("Recaudado")).getAllByText("₡150")).toHaveLength(2);
    expect(within(cifra("Tu ganancia")).getByText("₡1.500")).toBeInTheDocument();
  });

  it("R38: forbidden → mensaje accionable propio (el server no revela motivo) sin refresh", async () => {
    const user = userEvent.setup();
    deshacerMock.mockResolvedValue({ status: "forbidden" });
    const grupos = emptyGrupos();
    grupos.devolucion_a_origen_por_rechazo = [
      makeGestion({ gestionId: "g1", resultado: "devolucion_a_origen_por_rechazo", numRemision: "REM-A", destinatario: "Ana Pérez" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("No puedes deshacer esta gestión."),
    );
    expect(refreshMock).not.toHaveBeenCalled();
    expect(listaGestiones().querySelector('[data-gestion="g1"]')).not.toBeNull();
  });

  it("R38: validation_error → muestra el primer fieldError; unauthenticated → mensaje genérico", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-A", destinatario: "Ana Pérez" }),
    ];

    deshacerMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { estatus: ["catálogo de estados incompleto (seed pendiente)"] },
    });
    renderModule({ grupos });
    let dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));
    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("catálogo de estados incompleto (seed pendiente)"),
    );

    cleanup();
    vi.clearAllMocks();
    deshacerMock.mockResolvedValue({ status: "unauthenticated" });
    renderModule({ grupos });
    dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-A · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));
    await vi.waitFor(() =>
      expect(errorMock).toHaveBeenCalledWith("No se pudo deshacer la gestión. Inténtalo de nuevo."),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R37: tras el éxito, el botón de SU fila queda deshabilitado hasta que el refresh la retire; los demás siguen activos", async () => {
    // Ventana REAL del anti-doble-submit: mientras el modal está abierto, Base UI deja
    // el fondo `inert`/`aria-hidden` (la tabla ni siquiera es alcanzable). El único
    // hueco es entre el `ok` (modal cerrado) y la llegada del `router.refresh()`, que
    // es el que retira la fila. Ahí un segundo envío recibiría el `conflict` "esta
    // gestión ya fue deshecha" (R3): el estado `deshaciendo` lo cierra.
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-1", destinatario: "Ana Pérez" }),
      makeGestion({ gestionId: "g2", resultado: "entregado", numRemision: "REM-2", destinatario: "Beto Ruiz" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-1 · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());

    // El refresh aún no repuso las props (el test las mantiene): la fila sigue visible.
    const region = listaGestiones();
    await vi.waitFor(() =>
      expect(
        within(region).getByRole("button", { name: "Devolver a gestión la orden REM-1 · Ana Pérez" }),
      ).toBeDisabled(),
    );
    expect(
      within(region).getByRole("button", { name: "Devolver a gestión la orden REM-2 · Beto Ruiz" }),
    ).toBeEnabled();
    expect(deshacerMock).toHaveBeenCalledTimes(1);
  });

  it("R38: tras un error, el botón de la fila vuelve a estar disponible para reintentar", async () => {
    const user = userEvent.setup();
    deshacerMock.mockResolvedValue({ status: "conflict", motivo: "Esta gestión ya fue deshecha." });
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-1", destinatario: "Ana Pérez" }),
    ];
    renderModule({ grupos });

    const dialog = await abrirDeshacer(user, "Devolver a gestión la orden REM-1 · Ana Pérez");
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));
    await vi.waitFor(() => expect(errorMock).toHaveBeenCalled());

    await vi.waitFor(() =>
      expect(
        within(listaGestiones()).getByRole("button", {
          name: "Devolver a gestión la orden REM-1 · Ana Pérez",
        }),
      ).toBeEnabled(),
    );
  });
});

// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R242, R255) — AQUÍ VIVÍAN
// dos bloques que probaban la TABLA POR RESULTADO del día, que esta ficha retira:
//   · Feature 213 — la celda «Método» con el desglose de pago. La fila única no tiene columna
//     «Método»: el desglose se pinta en la tarjeta «Recibió el mensajero» de la fila desplegada, con
//     el mismo formateador, y lo vigila `tests/components/FilaGestion.test.tsx` («Efectivo» / «+ SINPE»).
//   · Feature 237/R41 — la marca «La tienda» pegada a la guía. La fila única no la pinta (S3-PA6 de
//     SLT-101, ya vigente en el detalle de un cierre pasado: `CierreDiaComprobanteMarcasDeOrigen`).
//     Lo que queda en /cierre-dia sobre una gestión de la tienda es el «Devolver a gestión»
//     deshabilitado con su motivo, que vigila el bloque de abajo.

// =================================================================================================
// FEATURE 237 (D3/R38) — «DEVOLVER A GESTION» NO SE OFRECE SOBRE LA GESTION DE LA TIENDA.
// =================================================================================================
//
// **El defecto que cierra, y de donde salio.** Lo encontro el recorrido con la app del 2026-08-20,
// no la suite: el boton salia HABILITADO en la fila de la tienda, abria su modal —que promete «la
// orden volvera a tu lista para gestionar»— y el servidor lo rechazaba. Un boton que SIEMPRE falla,
// detras de un modal que afirma lo que no va a pasar.
//
// ⚠️ EL PAR VA EN LA MISMA TABLA: una accion que nunca esta disponible pasa igual de verde que una
// que siempre lo esta. Los dos casos viven sobre el MISMO render.
//
// ⚠️ LOS TEXTOS, A MANO. No se importa `DESHACER_BLOQUEO_TIENDA`: compararlo con la constante que
// lo genera estaria siempre verde.
describe("Cierre del día — 237/D3: la gestión de la tienda no se puede devolver a gestión", () => {
  /** El motivo, escrito a mano. Es el MISMO que devuelve el servidor si se llega por otra vía. */
  const MOTIVO =
    "Esta orden la resolvió la tienda desde su pantalla de ayuda; solo ella puede corregirlo. Escríbele por el chat de la orden.";

  /** La fila única (`[data-gestion]`) que contiene ese número de guía. */
  function fila(guia: string): HTMLElement {
    const tr = screen.getByText(guia).closest("[data-gestion]");
    expect(tr, `no hay ninguna fila con la guía ${guia}`).not.toBeNull();
    return tr as HTMLElement;
  }

  /** El botón de acciones de esa fila, sea cual sea su nombre accesible. */
  function botonDeshacer(guia: string): HTMLElement {
    return within(fila(guia)).getByRole("button", { name: /^Devolver a gestión/ });
  }

  /** Dos rechazos en la MISMA sección: uno de la tienda (5555) y uno del mensajero (7777). */
  function renderConLasDos() {
    const grupos = emptyGrupos();
    grupos.devolucion_a_origen_por_rechazo = [
      makeGestion({
        gestionId: "g-tienda",
        resultado: "devolucion_a_origen_por_rechazo",
        numGuia: 5555,
        numRemision: "REM-TIENDA",
        desdeAyudaTienda: true,
      }),
      makeGestion({
        gestionId: "g-mensajero",
        resultado: "devolucion_a_origen_por_rechazo",
        numGuia: 7777,
        numRemision: "REM-MENSAJERO",
        desdeAyudaTienda: false,
      }),
    ];
    renderModule({ grupos });
  }

  it("la fila de la TIENDA lo tiene bloqueado y la del MENSAJERO no (el par, misma tabla)", () => {
    renderConLasDos();

    expect(botonDeshacer("5555")).toBeDisabled();
    // El par: sin esto, «está deshabilitado» pasaría igual con la columna entera apagada, que es
    // otro defecto —y peor: le quitaría al mensajero el deshacer de TODAS sus gestiones—.
    expect(botonDeshacer("7777")).toBeEnabled();
  });

  it("y dice POR QUÉ: el motivo va en el `title` y también en el nombre accesible", () => {
    renderConLasDos();
    const boton = botonDeshacer("5555");

    expect(boton).toHaveAttribute("title", MOTIVO);
    // En el NOMBRE y no sólo en el `title`: un botón `disabled` sale del orden de tabulación, así
    // que su tooltip es inalcanzable con el teclado. Quien navega con lector de pantalla lo lee al
    // recorrer la tabla.
    const nombre = boton.getAttribute("aria-label") as string;
    expect(nombre).toContain("no disponible");
    expect(nombre).toContain(MOTIVO);
    // Y sigue diciendo QUÉ ES y sobre QUÉ orden: el motivo se suma al nombre, no lo sustituye.
    expect(nombre).toContain("Devolver a gestión la orden REM-TIENDA");
  });

  it("el motivo es ACCIONABLE: dice a quién acudir, no un «no se puede» a secas", () => {
    // Anti-degradación. Un «No podés deshacer esta gestión.» pasaría los dos casos de arriba, y
    // dejaría al mensajero con un botón apagado y ninguna salida.
    renderConLasDos();
    const titulo = botonDeshacer("5555").getAttribute("title") as string;

    expect(titulo).toContain("la resolvió la tienda");
    expect(titulo).toContain("Escríbele por el chat de la orden");
  });

  it("pulsarlo NO abre el modal que promete devolver la orden, ni llama al servidor", async () => {
    const user = userEvent.setup();
    renderConLasDos();

    await user.click(botonDeshacer("5555"));

    // El modal es el que afirma «la orden volverá a tu lista para gestionar»: sobre esta fila esa
    // frase es falsa, y no llegar a enseñarla es el punto entero de la tanda.
    expect(screen.queryByRole("dialog", { name: "Devolver la orden a gestión" })).toBeNull();
    expect(deshacerMock).not.toHaveBeenCalled();

    // El par: el mismo gesto sobre la fila del mensajero SÍ abre el modal. Sin esto, «no se abre»
    // pasaría igual con el modal roto para todas las filas.
    await user.click(botonDeshacer("7777"));
    expect(
      await screen.findByRole("dialog", { name: "Devolver la orden a gestión" }),
    ).toBeInTheDocument();
  });

  it("RED DE SEGURIDAD: si se llegara a enviar, el motivo del servidor se muestra tal cual", async () => {
    // Contesta la pregunta del recorrido: ¿el mensajero se entera cuando el servidor rechaza? SÍ —
    // `confirmarDeshacer` pinta el `motivo` del `conflict` sin reescribirlo (67/R38). Hoy ese
    // camino ya no es alcanzable desde esta pantalla (el botón está apagado), y por eso este caso
    // se monta sobre una fila NORMAL con la respuesta de D3 forzada: lo que afirma es que la
    // pantalla no se come el mensaje, no que el botón siga ofreciéndose.
    deshacerMock.mockResolvedValue({ status: "conflict", motivo: MOTIVO });
    const user = userEvent.setup();
    renderConLasDos();

    await user.click(botonDeshacer("7777"));
    const dialog = await screen.findByRole("dialog", { name: "Devolver la orden a gestión" });
    await user.click(within(dialog).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalledWith(MOTIVO));
    expect(successMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
