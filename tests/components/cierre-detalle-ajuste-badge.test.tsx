// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierresAdminModule } from "@/app/(app)/cierres-admin/_components/CierresAdminModule";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import {
  CierreFacturaDetalle,
  type CierreFacturaCabecera,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import {
  ajustarPagoMensajeroGestion,
  verCierreDetalle,
  listarHistoricoCierresAdminPaginado,
  listarPendientesCierresAdminPaginado,
} from "@/lib/actions/cierres-admin";
import {
  listarHistoricoCierresBodegaPaginado,
  listarPendientesCierresBodegaPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type {
  CierreBodegaDetalleCierre,
  CierreBodegaResumen,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type {
  AjustePagoGestionDTO,
  CierreDetalleGestion,
  CierreGrupos,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreEstado } from "@/lib/types/cierre";
import { gestion478, grupos478 } from "@/tests/fixtures/gestion-detalle-478";
import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

/**
 * SLT-56 (T8; R11, R19, R20, R21) — LA MARCA «Ajustado», SU HISTORIAL, EL BOTÓN «Ajustar pago» Y
 * LA MARCA «Con ajustes» del cierre de bodega.
 *
 * Los textos esperados son LITERALES escritos a mano (memoria «Aserción contra su propia fuente»).
 */

vi.mock("@/lib/actions/cierres-admin", () => ({
  ajustarPagoMensajeroGestion: vi.fn(),
  corregirResultadoGestion: vi.fn(),
  verCierreDetalle: vi.fn(),
  aprobarCierre: vi.fn(),
  rechazarCierre: vi.fn(),
  forzarSolicitudVencido: vi.fn(),
  listarHistoricoCierresAdminPaginado: vi.fn(),
  listarPendientesCierresAdminPaginado: vi.fn(),
  listarGestionesCierresAdminCompleto: vi.fn(),
  listarPendientesCierresAdminCompleto: vi.fn(),
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

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

const accionMock = vi.mocked(ajustarPagoMensajeroGestion);
const verDetalleMock = vi.mocked(verCierreDetalle);

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const AJUSTE_1: AjustePagoGestionDTO = {
  creadoAt: "2026-10-29T14:30:00.000Z", // 08:30 en Costa Rica
  actorNombre: "Marta Maestra",
  actorRol: "maestro",
  pagoAnterior: "0.00",
  pagoNuevo: "700.00",
  motivo: "Rechazo por dirección errónea de la tienda",
};

const AJUSTE_2: AjustePagoGestionDTO = {
  creadoAt: "2026-10-29T16:05:00.000Z", // 10:05 en Costa Rica
  actorNombre: "Saúl Satélite",
  actorRol: "adminSatelite",
  pagoAnterior: "700.00",
  pagoNuevo: "900.50",
  motivo: "Segundo intento cobrado",
};

function rechazo(over: Partial<CierreDetalleGestion> = {}): CierreDetalleGestion {
  return gestion478({
    gestionId: "11111111-1111-4111-8111-111111111111",
    resultado: "devolucion_a_origen_por_rechazo",
    numGuia: 7001,
    numRemision: "REM-D1",
    destinatario: "Diana Devuelta",
    motivo: "Cliente ausente",
    pagoMensajero: "0.00",
    ...over,
  });
}

const BOTON_FILA_RECHAZO = "Detalle de la orden REM-D1 · Diana Devuelta";
const BOTON_AJUSTAR = "Ajustar pago al mensajero de la orden REM-D1 · Diana Devuelta";

const CABECERA: CierreFacturaCabecera = {
  cierreId: "c1",
  estado: "solicitado",
  destinoTipo: "bodega_central",
  destinoZonaNombre: "GAM",
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-10-29T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
};

async function abrirFila(g: CierreDetalleGestion, onAjustarPago?: (g: CierreDetalleGestion) => void) {
  const user = userEvent.setup();
  render(
    <CierreFacturaDetalle
      cierre={CABECERA}
      grupos={grupos478({ [g.resultado]: [g] })}
      onAjustarPago={onAjustarPago}
    />,
  );
  await user.click(screen.getByRole("button", { name: BOTON_FILA_RECHAZO }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// 1. R19 — la marca «Ajustado» y su historial
// ---------------------------------------------------------------------------

describe("SLT-56 R19 — la marca «Ajustado» en el pago de la gestión", () => {
  it("sin ajustes no hay marca", async () => {
    await abrirFila(rechazo());
    expect(screen.queryByText("Ajustado")).toBeNull();
    expect(screen.queryByRole("button", { name: /Pago ajustado/ })).toBeNull();
  });

  it("con la lista vacía tampoco", async () => {
    await abrirFila(rechazo({ ajustesPago: [] }));
    expect(screen.queryByText("Ajustado")).toBeNull();
  });

  it("con un ajuste se marca «Ajustado» junto al pago vigente", async () => {
    await abrirFila(rechazo({ pagoMensajero: "700.00", ajustesPago: [AJUSTE_1] }));
    const marca = screen.getByRole("button", { name: "Pago ajustado: ver el ajuste" });
    expect(marca).toHaveTextContent("Ajustado");
    expect(marca.parentElement).toHaveTextContent("₡700");
  });

  it("al consultarla lista quién (con rol), cuándo, anterior → nuevo y motivo, en orden", async () => {
    const user = await abrirFila(
      rechazo({ pagoMensajero: "900.50", ajustesPago: [AJUSTE_1, AJUSTE_2] }),
    );
    await user.click(screen.getByRole("button", { name: "Pago ajustado: ver los 2 ajustes" }));

    const lista = await screen.findByRole("list", { name: "Ajustes del pago al mensajero" });
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("2026-10-29 08:30 · Marta Maestra (Maestro)");
    expect(items[0]).toHaveTextContent("₡0 → ₡700");
    expect(items[0]).toHaveTextContent("Motivo: Rechazo por dirección errónea de la tienda");
    expect(items[1]).toHaveTextContent("2026-10-29 10:05 · Saúl Satélite (Admin satélite)");
    expect(items[1]).toHaveTextContent("₡700 → ₡900,50");
    expect(items[1]).toHaveTextContent("Motivo: Segundo intento cobrado");
  });
});

// ---------------------------------------------------------------------------
// 2. R21 — el botón «Ajustar pago» en la fila
// ---------------------------------------------------------------------------

describe("SLT-56 R21 — «Ajustar pago» en la fila", () => {
  it("con el callback del padre se ofrece, también en un rechazo que paga 0 (R6)", async () => {
    const onAjustar = vi.fn();
    const user = await abrirFila(rechazo(), onAjustar);
    await user.click(screen.getByRole("button", { name: BOTON_AJUSTAR }));
    expect(onAjustar).toHaveBeenCalledWith(
      expect.objectContaining({ gestionId: "11111111-1111-4111-8111-111111111111" }),
    );
  });

  it("sin callback no se ofrece (cierre no abierto, otro rol, vista del mensajero)", async () => {
    await abrirFila(rechazo(), undefined);
    expect(screen.queryByRole("button", { name: BOTON_AJUSTAR })).toBeNull();
  });

  it("sin pago congelado no hay nada que ajustar", async () => {
    await abrirFila(rechazo({ pagoMensajero: null }), vi.fn());
    expect(screen.queryByRole("button", { name: BOTON_AJUSTAR })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. R21/R11 — en el módulo: estado del cierre, prop y total sin recargar
// ---------------------------------------------------------------------------

function zeroIngreso(): TotalesIngresoEmpresa {
  return {
    montoCobrar: "0.00",
    fleteConIva: "0.00",
    fleteDevolucionConIva: "0.00",
    comisionConIva: "0.00",
    total: "0.00",
    flete: "0.00",
    ivaFlete: "0.00",
    fleteDevolucion: "0.00",
    ivaFleteDevolucion: "0.00",
    comisionCod: "0.00",
    ivaComisionCod: "0.00",
  };
}

function resumen(estado: CierreEstado): CierreAdminResumen {
  const resuelto = estado === "aprobado" || estado === "rechazado";
  return {
    cierreId: "c1",
    mensajeroId: "m1",
    mensajeroNombre: "Ana Mensajera",
    estado,
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: CABECERA.totales,
    totalPagoMensajero: "1500.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-10-29T10:00:00.000Z",
    resueltoAt: resuelto ? "2026-10-29T18:00:00.000Z" : null,
    motivoRechazo: null,
  };
}

function detalleOk(cierre: CierreAdminResumen, g: CierreDetalleGestion) {
  return {
    status: "ok" as const,
    cierre,
    grupos: grupos478({ [g.resultado]: [g] }),
    totalesIngreso: zeroIngreso(),
    desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "0.00", total: "0.00" },
    ivaFacturado: "0.00",
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    fleteRechazoYaCobradoATienda: false,
    partesPorTienda: [],
    ordenesSinGestion: [],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
  };
}

async function abrirDetalleDelModulo(opciones: {
  estado: CierreEstado;
  puedeAjustarPagoMensajero?: boolean;
}) {
  const user = userEvent.setup();
  const cierre = resumen(opciones.estado);
  const resuelto = opciones.estado === "aprobado" || opciones.estado === "rechazado";
  verDetalleMock.mockResolvedValue(detalleOk(cierre, rechazo()));

  const cola = paginaInicial(resuelto ? [] : [cierre]);
  const historico = paginaInicial(resuelto ? [cierre] : []);
  vi.mocked(listarPendientesCierresAdminPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...cola,
  });
  vi.mocked(listarHistoricoCierresAdminPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...historico,
  });

  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresAdminModule
        pendientes={cola}
        historico={historico}
        sinZona={false}
        puedeAjustarPagoMensajero={opciones.puedeAjustarPagoMensajero ?? true}
      />
    </SWRConfig>,
  );

  if (resuelto) {
    await user.click(screen.getByRole("button", { name: /^Resueltos/ }));
    await user.click(
      screen.getByRole("button", { name: "Ver el cierre resuelto de Ana Mensajera" }),
    );
  } else if (opciones.estado === "vencido") {
    await user.click(screen.getByRole("button", { name: "Ver el cierre de Ana Mensajera" }));
  } else {
    await user.click(screen.getByRole("button", { name: "Ver / decidir" }));
  }

  const dialogo = await screen.findByRole("dialog", { name: "Detalle del cierre" });
  await user.click(within(dialogo).getByRole("button", { name: BOTON_FILA_RECHAZO }));
  return { user, dialogo };
}

describe("SLT-56 R21 — se ofrece sólo con permiso y en un cierre abierto", () => {
  it.each(["solicitado", "vencido"] as const)("en un cierre %s, sí", async (estado) => {
    const { dialogo } = await abrirDetalleDelModulo({ estado });
    expect(within(dialogo).getByRole("button", { name: BOTON_AJUSTAR })).toBeInTheDocument();
  });

  it.each(["aprobado", "rechazado"] as const)("en un cierre %s, no", async (estado) => {
    const { dialogo } = await abrirDetalleDelModulo({ estado });
    expect(within(dialogo).queryByRole("button", { name: BOTON_AJUSTAR })).toBeNull();
  });

  it("con la prop en falso no se ofrece ni en un cierre abierto (falla cerrado)", async () => {
    const { dialogo } = await abrirDetalleDelModulo({
      estado: "solicitado",
      puedeAjustarPagoMensajero: false,
    });
    expect(within(dialogo).queryByRole("button", { name: BOTON_AJUSTAR })).toBeNull();
  });
});

describe("SLT-56 R11 — tras el ajuste, la pantalla cambia sin recargar", () => {
  it("pinta el pago nuevo, la marca y el total de pago al mensajero que devolvió el servidor", async () => {
    const { user, dialogo } = await abrirDetalleDelModulo({ estado: "solicitado" });
    // El total nuevo no está antes de ajustar.
    expect(dialogo).not.toHaveTextContent("₡2.200");

    accionMock.mockResolvedValue({
      status: "ok",
      gestionId: "11111111-1111-4111-8111-111111111111",
      pagoMensajero: "700.00",
      totalPagoMensajero: "2200.00",
      ajuste: AJUSTE_1,
    });
    // La relectura del detalle NO llega: lo que se ve sale del estado local, no de recargar.
    verDetalleMock.mockReturnValueOnce(new Promise(() => {}));

    await user.click(within(dialogo).getByRole("button", { name: BOTON_AJUSTAR }));
    const ajuste = await screen.findByRole("dialog", { name: "Ajustar el pago al mensajero" });
    await user.type(within(ajuste).getByLabelText("Valor nuevo"), "700");
    await user.type(
      within(ajuste).getByLabelText("Motivo del ajuste"),
      "Rechazo por dirección errónea de la tienda",
    );
    await user.click(within(ajuste).getByRole("button", { name: "Guardar ajuste" }));

    await waitFor(() => expect(dialogo).toHaveTextContent("₡2.200"));
    expect(dialogo).toHaveTextContent("Pago al mensajero: ₡700");
    // Se cierra el diálogo del ajuste (mientras está abierto, el detalle de atrás es inerte).
    await user.click(within(ajuste).getByRole("button", { name: "Cerrar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ajustar el pago al mensajero" })).toBeNull(),
    );
    expect(
      within(dialogo).getByRole("button", { name: "Pago ajustado: ver el ajuste" }),
    ).toBeInTheDocument();
    // Y se pidió la relectura del servidor para lo que DERIVA del total.
    expect(verDetalleMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 4. R20 — el detalle del cierre de bodega
// ---------------------------------------------------------------------------

const CABECERA_BODEGA: CierreBodegaResumen = {
  cierreBodegaId: "b5600000-1111-4111-8111-b1b1b1b1b1b1",
  zonaId: "33333333-3333-4333-8333-333333333333",
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
  cantidadCierres: 2,
  solicitadoAt: "2026-10-29T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
  paraLaCentral: "0.00",
  efectivoCubreDescuentos: true,
  ...marcaSinConciliar("0.00"),
};

function dia(
  mensajeroId: string,
  mensajeroNombre: string,
  grupos: CierreGrupos,
  gestionesAjustadas: number,
): CierreBodegaDetalleCierre {
  return {
    cierreDiaId: `cd-${mensajeroId}`,
    mensajeroId,
    mensajeroNombre,
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    gestionesAjustadas,
    grupos,
    totalesIngreso: zeroIngreso(),
    ivaFacturado: "0.00",
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    partesPorTienda: [],
    paraLaCentral: "0.00",
    efectivoCubreDescuentos: true,
    ...marcaSinConciliar("0.00"),
  };
}

async function abrirDetalleBodega() {
  vi.mocked(listarPendientesCierresBodegaPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...paginaInicial([CABECERA_BODEGA]),
  });
  vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...paginaInicial([]),
  });
  vi.mocked(verCierreBodegaDetalle).mockResolvedValue({
    status: "ok" as const,
    cierre: CABECERA_BODEGA,
    cierres: [
      dia(
        "m1",
        "Ana Mensajera",
        grupos478({
          devolucion_a_origen_por_rechazo: [
            rechazo({ pagoMensajero: "700.00", ajustesPago: [AJUSTE_1] }),
          ],
        }),
        1,
      ),
      dia(
        "m2",
        "Beto Mensajero",
        grupos478({
          entregado: [
            gestion478({
              gestionId: "gb1",
              resultado: "entregado",
              numRemision: "REM-B1",
              destinatario: "Bea",
              pagoMensajero: "1000.00",
            }),
          ],
        }),
        0,
      ),
    ],
    totalesIngreso: zeroIngreso(),
    ivaFacturado: "0.00",
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    partesPorTienda: [],
    paraLaCentral: "0.00",
    efectivoCubreDescuentos: true,
    ...marcaSinConciliar("0.00"),
  });

  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresBodegaAdminModule
        pendientes={paginaInicial([CABECERA_BODEGA])}
        historico={paginaInicial([])}
      />
    </SWRConfig>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Ver / decidir el cierre de bodega de Limón" }),
  );
  await screen.findByRole("region", { name: "Cierre del día · Ana Mensajera" });
  return user;
}

describe("SLT-56 R20 — el detalle del cierre de bodega marca los cierres y gestiones ajustados", () => {
  it("«Con ajustes» sólo en el cierre del día con gestiones ajustadas, con cuántas", async () => {
    await abrirDetalleBodega();
    const ana = screen.getByRole("region", { name: "Cierre del día · Ana Mensajera" });
    const beto = screen.getByRole("region", { name: "Cierre del día · Beto Mensajero" });
    expect(within(ana).getByText("Con ajustes")).toBeInTheDocument();
    expect(ana).toHaveTextContent(
      "Con ajustes: 1 gestión de este cierre tiene el pago al mensajero ajustado.",
    );
    expect(within(beto).queryByText("Con ajustes")).toBeNull();
  });

  it("la gestión ajustada lleva «Ajustado» con el mismo historial, y sin «Ajustar pago»", async () => {
    const user = await abrirDetalleBodega();
    const ana = screen.getByRole("region", { name: "Cierre del día · Ana Mensajera" });
    await user.click(within(ana).getByRole("button", { name: BOTON_FILA_RECHAZO }));

    await user.click(within(ana).getByRole("button", { name: "Pago ajustado: ver el ajuste" }));
    const lista = await screen.findByRole("list", { name: "Ajustes del pago al mensajero" });
    expect(lista).toHaveTextContent("2026-10-29 08:30 · Marta Maestra (Maestro)");
    expect(lista).toHaveTextContent("₡0 → ₡700");
    expect(lista).toHaveTextContent("Motivo: Rechazo por dirección errónea de la tienda");
    // El detalle de bodega es de solo lectura: el ajuste se hace en el cierre del mensajero.
    expect(within(ana).queryByRole("button", { name: BOTON_AJUSTAR })).toBeNull();
  });
});
