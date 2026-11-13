// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

import CierreDiaPage from "@/app/(app)/cierre-dia/page";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import {
  listarCierreDia,
  estadoBloqueoMensajero,
  verCierrePasado,
  resumenGananciaMensajero,
} from "@/lib/actions/cierre-dia";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";

// Feature 37 (T14, R1) — la página resuelve el rol SOLO server-side; rol ≠
// mensajero (o sin sesión) → `notFound`. Se mockea el resolver, la action de
// listado y next/navigation (notFound lanza; useRouter lo consume el módulo).
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: vi.fn(),
}));
vi.mock("@/lib/actions/cierre-dia", () => ({
  listarCierreDia: vi.fn(),
  estadoBloqueoMensajero: vi.fn(),
  solicitarCierre: vi.fn(),
  // Feature 170 — FASE 2 (T I.2): la página pre-carga la PÁGINA 1 de «Cierres solicitados».
  listarCierresPasadosPaginado: vi.fn(async () => ({
    status: "ok" as const,
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  })),
  deshacerGestion: vi.fn(),
  // SLT-109 (R240): la lectura del cierre por reenviar.
  verCierrePasado: vi.fn(),
  // SLT-112 (R357, R358): las cifras de las tarjetas de la ganancia.
  resumenGananciaMensajero: vi.fn(),
}));

class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
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

const resolveActorMock = vi.mocked(resolveActorFromSession);
const listarMock = vi.mocked(listarCierreDia);
const bloqueoMock = vi.mocked(estadoBloqueoMensajero);
const verMock = vi.mocked(verCierrePasado);
const gananciaMock = vi.mocked(resumenGananciaMensajero);

/** Resultado `ok` del listado, con los 4 grupos VACÍOS. */
function resultadoBase() {
  return {
    status: "ok" as const,
    grupos: { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] },
    totales: {
      efectivo: "0.00",
      simpe: "0.00",
      transferencia: "0.00",
      general: "0.00",
    },
    totalPagoMensajero: "0.00", // feature 39/R11
    totalIngresoBodegaRechazos: "0.00", // feature 56/R10
    puedesSolicitar: false,
    motivoBloqueo: "No hay gestiones para cerrar.",
    cierresPasados: [],
  };
}

/** Una gestión entregada mínima: solo para que la sección "Entregado" exista. */
function gestionEntregada(): CierreDetalleGestion {
  return {
    gestionId: "g1",
    ordenId: "o1",
    fechaGestion: "2026-07-11",
    numGuia: 1,
    numRemision: "REM-1",
    destinatario: "Ana",
    direccion: null,
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: null,
    producto: "Caja",
    tiendaNombre: "Tienda X",
    resultado: "entregado",
    montoRecibido: "10.00",
    metodoPago: "efectivo",
    // Feature 212/R31: el DTO gana el desglose y CONSERVA el escalar de arriba (aqui,
    // un cobro de un solo metodo: una linea que cuadra con montoRecibido).
    pagos: [{ metodo: "efectivo" as const, monto: "10.00" }],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: "0.00",
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false, // feature 102
    desdeAyudaTienda: false, // feature 237 (D6/R41): la registro el mensajero, no la tienda
    // Feature 158/R9/R19: campos POR RAMA del incidente; los casos del incidente los
    // sobreescriben.
    causaIncidente: null,
    indemnizacion: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bloqueoMock.mockResolvedValue({ status: "ok", bloqueo: SIN_BLOQUEO });
  listarMock.mockResolvedValue(resultadoBase());
  gananciaMock.mockResolvedValue({ status: "sin_dato" });
});

afterEach(() => {
  cleanup();
});

describe("CierreDiaPage — control de acceso por rol (R1)", () => {
  it("R1: el rol mensajero ve el módulo con su título y sus secciones", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "mensajero" });
    // Con una entrega: el módulo ya no pinta las secciones sin registros, así que una
    // sección vacía no probaría nada sobre el acceso al módulo.
    listarMock.mockResolvedValue({
      ...resultadoBase(),
      grupos: {
        entregado: [gestionEntregada()],
        reprogramado: [],
        novedad: [],
        devolucion_a_origen_por_rechazo: [],
        incidente: [],
      },
    });

    const page = await CierreDiaPage();
    render(page);

    expect(
      screen.getByRole("heading", { level: 1, name: "Cierre del día" }),
    ).toBeInTheDocument();
    // SLT-109 (R61, R255): el cierre de hoy es el detalle único en página, con su lista de gestiones;
    // ya no hay «Totales del día» ni una sección por resultado.
    expect(
      screen.getByRole("region", { name: "Detalle del cierre · Tu cierre del día" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Órdenes del cierre" }).querySelector('[data-gestion="g1"]'),
    ).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Totales del día" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Entregado" })).toBeNull();
  });

  it("R1: cualquier rol distinto de mensajero NO ve el módulo (notFound)", async () => {
    const otros: RolValue[] = ["maestro", "admin", "adminTienda", "adminSatelite"];
    for (const rol of otros) {
      resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol });
      await expect(CierreDiaPage()).rejects.toThrow("NEXT_NOT_FOUND");
    }
    // No debe consultar el listado si el rol no está autorizado.
    expect(listarMock).not.toHaveBeenCalled();
  });

  it("R1: sin actor autenticado NO ve el módulo (notFound)", async () => {
    resolveActorMock.mockResolvedValue(null);
    await expect(CierreDiaPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("R1: si el listado responde forbidden, tampoco renderiza el módulo", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "mensajero" });
    listarMock.mockResolvedValue({ status: "forbidden" });
    await expect(CierreDiaPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (T3.1; R240, R253): con un
// cierre por reenviar, la página lo lee en el servidor con `verCierrePasado`, y nunca hace `notFound()`
// por esa lectura.
describe("SLT-109 — la página lee el cierre por reenviar (R240, R253)", () => {
  const ID = "a1b2c3d4-0000-4000-8000-00000000c0de";
  const porReenviar = (estado: "vencido" | "rechazado") => ({
    bloqueado: true,
    cierresAbiertos: 1,
    cierresPorReenviar: 1,
    aResolverPrimero: null,
    aReenviarPrimero: { cierreId: ID, estado, solicitadoAt: "2026-11-10T23:00:00.000Z", jornadaCR: null, resuelve: "mensajero" as const },
  });

  beforeEach(() => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "mensajero" });
  });

  it("sin nada que reenviar no llama a `verCierrePasado` y pinta el cierre de hoy", async () => {
    render(await CierreDiaPage());
    expect(verMock).not.toHaveBeenCalled();
    expect(screen.getByText("Sin solicitar")).toBeInTheDocument();
  });

  it("con un vencido por reenviar lo lee con SU `cierreId` y pinta ese cierre, no el de hoy", async () => {
    bloqueoMock.mockResolvedValue({ status: "ok", bloqueo: porReenviar("vencido") });
    verMock.mockResolvedValue({
      status: "ok",
      cierre: {
        cierreId: ID,
        estado: "vencido",
        destinoTipo: "bodega_satelite",
        destinoZonaId: "z1",
        totales: { efectivo: "7000.00", simpe: "0.00", transferencia: "0.00", general: "7000.00" },
        totalPagoMensajero: "1700.00",
        totalIngresoBodegaRechazos: "0.00",
        solicitadoAt: "2026-11-10T23:00:00.000Z",
      },
      grupos: { entregado: [gestionEntregada()], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] },
      ordenesSinGestion: [],
      sinGestionRegistrado: true,
      rechazosDeTienda: [],
    });

    render(await CierreDiaPage());

    expect(verMock).toHaveBeenCalledTimes(1);
    expect(verMock).toHaveBeenCalledWith({ cierreId: ID });
    expect(screen.getByText("Vencido")).toBeInTheDocument();
    expect(screen.queryByText("Sin solicitar")).toBeNull();
    expect(screen.getByRole("button", { name: "Solicitar aprobación del cierre vencido" })).toBeEnabled();
  });

  it("`no_encontrada` → aviso de error con el botón de reenvío de su estado, sin `notFound()` ni el cierre de hoy", async () => {
    bloqueoMock.mockResolvedValue({ status: "ok", bloqueo: porReenviar("rechazado") });
    verMock.mockResolvedValue({ status: "no_encontrada" });

    render(await CierreDiaPage());

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el cierre que tienes que enviar. Recarga la página.");
    expect(screen.getByRole("button", { name: "Solicitar aprobación del cierre rechazado" })).toBeEnabled();
    expect(screen.queryByText("Sin solicitar")).toBeNull();
    expect(screen.queryByRole("region", { name: "Detalle del cierre · Tu cierre del día" })).toBeNull();
  });

  it("una excepción en la lectura también es `error`, no un fallo de la página", async () => {
    bloqueoMock.mockResolvedValue({ status: "ok", bloqueo: porReenviar("vencido") });
    verMock.mockRejectedValue(new Error("caída de la base"));

    render(await CierreDiaPage());

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el cierre que tienes que enviar.");
    expect(screen.getByRole("button", { name: "Solicitar aprobación del cierre vencido" })).toBeEnabled();
  });
});

// SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» (T5.4; R357, R358, R360): la
// página lee las cifras en cada render y las pasa al módulo; si la lectura no es `ok`, la página carga
// igual, sin tarjetas y sin `notFound()`.
describe("SLT-112 — la página lee las cifras de la ganancia (R357, R358)", () => {
  beforeEach(() => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "mensajero" });
  });

  it("con `ok`, la cola pinta las dos tarjetas con los importes del servidor", async () => {
    gananciaMock.mockResolvedValue({
      status: "ok",
      resumen: {
        pendiente: { monto: "47500.55", conteo: 2 },
        pagadaEsteMes: { monto: "3500.00", conteo: 2 },
      },
    });
    render(await CierreDiaPage());
    expect(gananciaMock).toHaveBeenCalledTimes(1);
    const grupo = screen.getByRole("group", { name: "Ganancia de tus cierres" });
    expect(grupo).toHaveTextContent("Ganancia pendiente de pago₡47.500,552 cierres aprobados sin liquidar");
    expect(grupo).toHaveTextContent("Ganancia pagada este mes₡3.5002 pagos");
  });

  it.each([
    ["error", { status: "error" as const }],
    ["sin_dato", { status: "sin_dato" as const }],
    ["forbidden", { status: "forbidden" as const }],
    ["unauthenticated", { status: "unauthenticated" as const }],
  ])("con `%s`, la página carga sin tarjetas ni ceros en su lugar", async (_n, res) => {
    gananciaMock.mockResolvedValue(res);
    render(await CierreDiaPage());
    expect(screen.getByRole("heading", { level: 1, name: "Cierre del día" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cierres solicitados" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ganancia de tus cierres" })).toBeNull();
    expect(screen.queryByText("Ganancia pendiente de pago")).toBeNull();
    expect(screen.queryByText("Ningún pago este mes")).toBeNull();
  });

  it("una excepción en la lectura tampoco tumba la página", async () => {
    gananciaMock.mockRejectedValue(new Error("caída de la base"));
    render(await CierreDiaPage());
    expect(screen.getByRole("heading", { level: 1, name: "Cierre del día" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Ganancia de tus cierres" })).toBeNull();
  });
});
