// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RolValue } from "@prisma/client";

import NovedadesPage from "@/app/(app)/novedades/page";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import {
  listarAyudaTiendaAction,
  listarNovedadesAction,
} from "@/lib/actions/novedades";
import { listarRechazosSlaTiendaAction } from "@/lib/actions/rechazos-sla-tienda";
import { NovedadAcciones } from "@/app/(app)/novedades/_components/NovedadAcciones";
import type { NovedadDTO } from "@/lib/types/novedad";

// Feature 87 (T15) + Feature 102 (T12) + Feature 236 (T4.1/T4.4) — la page resuelve el rol SOLO
// server-side. Cubre R18 (rol != adminTienda / sin sesion -> notFound) y R19 (action principal !=
// ok -> notFound). Se mockean el resolver, las TRES actions (ayuda + novedades + rechazos SLA) y
// next/navigation (notFound lanza). El modulo cliente de pestañas se mockea, pero NO se descarta lo
// que recibe: las props se capturan para poder afirmar que la lectura de cada superficie llega a su
// pestaña, y que un fallo de la de AYUDA cae a vacio en vez de tumbar la pagina (design §5).
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: vi.fn(),
}));
vi.mock("@/lib/actions/novedades", () => ({
  listarNovedadesAction: vi.fn(),
  listarAyudaTiendaAction: vi.fn(),
}));
// SL-23 (design §6.3): las puertas de módulo, abiertas salvo WhatsApp, que cada caso fija.
const { whatsapp } = vi.hoisted(() => ({ whatsapp: { activo: true } }));
vi.mock("@/lib/modulos/exigir-modulo", async () => {
  const abiertas = (await import("@/tests/fabricas/modulos")).puertasAbiertas();
  return {
    ...abiertas,
    moduloActivo: async (m: string) => (m === "whatsapp" ? whatsapp.activo : true),
  };
});
// `NovedadAcciones` se monta de verdad en el bloque de SL-23: sus actions no se llaman, pero se
// importan, y no pueden arrastrar el servidor a jsdom.
vi.mock("@/lib/actions/whatsapp-envio", () => ({
  listarPlantillasParaEnvio: vi.fn(),
  listarPlantillasParaEnvioTienda: vi.fn(),
}));
vi.mock("@/lib/actions/orden-ayuda", () => ({
  solicitarAyudaOrden: vi.fn(),
  recuperarOrdenAyuda: vi.fn(),
  registrarIntentoContactoOrden: vi.fn(),
}));
vi.mock("@/lib/actions/rechazos-sla-tienda", () => ({
  listarRechazosSlaTiendaAction: vi.fn(),
}));
const { propsRecibidas } = vi.hoisted(() => ({
  propsRecibidas: { valor: null as unknown },
}));
vi.mock("@/app/(app)/novedades/_components/NovedadesTabs", () => ({
  NovedadesTabs: (props: unknown) => {
    propsRecibidas.valor = props;
    return <div data-testid="novedades-module" />;
  },
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
  // PageHeader -> LogoutButton usa useRouter; se mockea para el render del caso ok.
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
const listarMock = vi.mocked(listarNovedadesAction);
const listarAyudaMock = vi.mocked(listarAyudaTiendaAction);
const listarRechazosSlaMock = vi.mocked(listarRechazosSlaTiendaAction);

/** Las props que la page bajó a las pestañas en el último render. */
function tabsProps(): {
  novedades: Record<string, { items: unknown[]; total: number; page: number; pageSize: number }>;
} {
  return propsRecibidas.valor as {
    novedades: Record<
      string,
      { items: unknown[]; total: number; page: number; pageSize: number }
    >;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  propsRecibidas.valor = null;
  whatsapp.activo = true;
  listarMock.mockResolvedValue({
    status: "ok",
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  listarAyudaMock.mockResolvedValue({
    status: "ok",
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  listarRechazosSlaMock.mockResolvedValue({
    status: "ok",
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
});

afterEach(() => {
  cleanup();
});

describe("NovedadesPage — control de acceso por rol", () => {
  it("R18: el rol adminTienda ve la pagina con su encabezado y el modulo", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "adminTienda" });

    const page = await NovedadesPage();
    render(page);

    expect(
      screen.getByRole("heading", { level: 1, name: "Novedades" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("novedades-module")).toBeInTheDocument();
  });

  it("R18: cualquier rol distinto de adminTienda -> notFound", async () => {
    const otros: RolValue[] = ["maestro", "admin", "adminSatelite", "mensajero"];
    for (const rol of otros) {
      resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol });
      await expect(NovedadesPage()).rejects.toThrow("NEXT_NOT_FOUND");
    }
    // No debe consultar el listado si el rol no esta autorizado.
    expect(listarMock).not.toHaveBeenCalled();
  });

  it("R18: sin actor autenticado -> notFound", async () => {
    resolveActorMock.mockResolvedValue(null);
    await expect(NovedadesPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("R19: si la action no responde ok (forbidden), la page -> notFound", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "adminTienda" });
    listarMock.mockResolvedValue({ status: "forbidden" });
    await expect(NovedadesPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("R19: si la action responde unauthenticated, la page -> notFound", async () => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "adminTienda" });
    listarMock.mockResolvedValue({ status: "unauthenticated" });
    await expect(NovedadesPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// =================================================================================================
// FEATURE 236 (T4.1/T4.4 — R14/R15/R16) — LA TERCERA LECTURA, Y EL SUBTÍTULO QUE DEJA DE MENTIR.
// =================================================================================================
describe("NovedadesPage — la superficie de AYUDA (236)", () => {
  beforeEach(() => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "adminTienda" });
  });

  it("R14: el subtítulo nombra LAS TRES superficies y ya no dice el de ayer", async () => {
    render(await NovedadesPage());

    // El literal ENTERO, tal como lo lee una tienda. No se compara contra la constante que lo
    // genera: eso estaría verde incluso con el texto mal escrito (es su propia fuente).
    expect(
      screen.getByText(
        "Las órdenes en las que tus mensajeros piden ayuda, tus órdenes en Novedad y las que pasaron a Devolución a origen por rechazo por vencerse el plazo",
      ),
    ).toBeInTheDocument();
    // Y el de hasta el 2026-08-19, que era falso de las órdenes en ayuda —ni están en devolución ni
    // llegaron a rechazo por plazo vencido: siguen en la calle—, ya NO está.
    expect(
      screen.queryByText(
        "Tus órdenes en devolución y las que llegaron a rechazo por vencerse el plazo",
      ),
    ).toBeNull();
  });

  it("pre-fetch de la página 1 de la superficie de ayuda, y baja a SU pestaña", async () => {
    listarAyudaMock.mockResolvedValue({
      status: "ok",
      items: [],
      total: 7,
      page: 1,
      pageSize: 10,
    });
    render(await NovedadesPage());

    expect(listarAyudaMock).toHaveBeenCalledWith({ page: 1 });
    // R15: el total viaja para que la paginación pueda decirlo. Y va a la clave `ayuda`, no a la
    // de devoluciones: si se cruzaran, cada pestaña listaría la población de la otra.
    expect(tabsProps().novedades.ayuda.total).toBe(7);
    expect(tabsProps().novedades.devolucion.total).toBe(0);
  });

  it("R16: si la lectura de ayuda falla, la página NO se cae — su pestaña queda vacía", async () => {
    // Es una superficie SECUNDARIA (design §5): tumbar `/novedades` entera por ella sería peor que
    // enseñarla vacía, y ese vacío ya tiene texto propio. La principal —las devoluciones— sigue
    // haciendo `notFound`, y eso NO cambia (los casos R19 de arriba lo fijan).
    for (const fallo of [
      { status: "forbidden" } as const,
      { status: "unauthenticated" } as const,
    ]) {
      cleanup();
      listarAyudaMock.mockResolvedValue(fallo);
      render(await NovedadesPage());

      expect(screen.getByTestId("novedades-module")).toBeInTheDocument();
      expect(tabsProps().novedades.ayuda).toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });
    }
  });
});

// =================================================================================================
// SL-23 (T8, design §6.3) — LA ACCIÓN DE PLANTILLA ES DEL MÓDULO WHATSAPP; `/novedades` ES NÚCLEO.
// =================================================================================================
describe("NovedadesPage — con el módulo WhatsApp apagado (SL-23)", () => {
  const DESTINATARIO = "Ana Cliente";
  const novedad = {
    id: "o1",
    numGuia: 12345,
    numRemision: "REM-001",
    estatusValue: "novedad",
    intentosContacto: 0,
    mensajeroNombre: "Marta Mensajera",
    destinatario: DESTINATARIO,
    telefonoDest: "88887777",
    direccion: "Av. Central 120",
    producto: "Zapatos",
    peso: 1.5,
    montoCobrar: 24500,
    latitud: 9.9281,
    longitud: -84.0907,
    notas: null,
    tiendaNombre: "Tienda Demo",
    zonaNombre: "GAM Oeste",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: null,
    causa: "not_found",
    intentosEntrega: 2,
  } satisfies NovedadDTO;
  const handlers = {
    onReprogramar: vi.fn(),
    onHabilitar: vi.fn(),
    onRechazar: vi.fn(),
    onConversacion: vi.fn(),
    onGestionarDesdeAyuda: vi.fn(),
    onCorregirDatos: vi.fn(),
  };

  beforeEach(() => {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "adminTienda" });
  });

  it("la página baja a las pestañas si WhatsApp está encendido o no", async () => {
    whatsapp.activo = false;
    render(await NovedadesPage());
    expect((propsRecibidas.valor as { whatsappActivo: boolean }).whatsappActivo).toBe(false);
    // El resto de la pantalla sigue: encabezado y pestañas con sus listados.
    expect(screen.getByRole("heading", { level: 1, name: "Novedades" })).toBeInTheDocument();
    expect(screen.getByTestId("novedades-module")).toBeInTheDocument();
    expect(listarMock).toHaveBeenCalledTimes(1);

    cleanup();
    whatsapp.activo = true;
    render(await NovedadesPage());
    expect((propsRecibidas.valor as { whatsappActivo: boolean }).whatsappActivo).toBe(true);
  });

  it("con WhatsApp apagado la acción de plantilla no se pinta y el resto de la fila sí", () => {
    render(
      <NovedadAcciones
        whatsappActivo={false}
        novedad={novedad}
        grupoListado="devolucion"
        {...handlers}
      />,
    );
    expect(screen.queryByRole("button", { name: `WhatsApp a ${DESTINATARIO}` })).toBeNull();
    expect(screen.getByRole("button", { name: `Llamar a ${DESTINATARIO}` })).toBeInTheDocument();
    // Las acciones del núcleo de esta fila siguen ahí.
    expect(screen.getAllByRole("button").length).toBeGreaterThan(1);
  });

  it("con WhatsApp encendido la acción de plantilla se pinta", () => {
    render(
      <NovedadAcciones whatsappActivo novedad={novedad} grupoListado="devolucion" {...handlers} />,
    );
    expect(
      screen.getByRole("button", { name: `WhatsApp a ${DESTINATARIO}` }),
    ).toBeInTheDocument();
  });
});
