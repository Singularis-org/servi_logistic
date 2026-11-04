// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RepartoModule } from "@/app/(app)/mis-asignaciones/_components/RepartoModule";
import { escogerParaGestion } from "@/lib/actions/mis-asignaciones";
import type {
  MiAsignacionDTO,
  RutaResumenDTO,
} from "@/lib/interfaces/services/IMisAsignacionesService";
import type { BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { bloqueoConRechazado } from "@/tests/fixtures/bloqueo-cierre";

// FICHA 477 (T5.4, R27) — con el mensajero bloqueado, la pantalla de Entregas deja habilitadas
// SOLO las tarjetas de las órdenes en corrección de un cierre rechazado propio (`enCorreccion`).
// Mocks: los mismos módulos `"use server"` que `RepartoModule.test.tsx` (arrastrarían Prisma).

vi.mock("@/lib/actions/mis-asignaciones", () => ({
  recogerAsignaciones: vi.fn(),
  escogerParaGestion: vi.fn(),
  gestionar: vi.fn(),
  liberarGestion: vi.fn(),
}));

vi.mock("@/lib/actions/orden-notas", () => ({
  listarNotasOrden: vi
    .fn()
    .mockResolvedValue({ status: "ok", notas: [], puedeEscribir: false }),
  publicarNotaOrden: vi.fn(),
  borrarNotaOrden: vi.fn(),
}));

vi.mock("@/app/(app)/mis-asignaciones/_components/RutaMapa", () => ({
  RutaMapa: () => <div data-testid="ruta-mapa" />,
}));

vi.mock("@/lib/actions/ruta-mensajero", () => ({
  sincronizarRuta: vi.fn().mockResolvedValue({ status: "ok", omitida: false }),
}));

vi.mock("@/lib/actions/orden-mensajero-meta", () => ({
  marcarGestionarLuego: vi
    .fn()
    .mockResolvedValue({ status: "ok", ordenId: "g1", marcarLuego: true }),
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

const escogerMock = vi.mocked(escogerParaGestion);

function makeAsignacion(over: Partial<MiAsignacionDTO> & { id: string }): MiAsignacionDTO {
  return {
    numGuia: 1001,
    numRemision: "REM-001",
    estatusValue: "en_reparto",
    destinatario: "Ana Pérez",
    telefonoDest: "88880000",
    direccion: "Calle 1, casa 2",
    producto: "Caja mediana",
    peso: 1.5,
    montoCobrar: 150,
    latitud: 9.9281244,
    longitud: -84.0907246,
    notas: null,
    tiendaNombre: "Tienda X",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: null,
    ...over,
  };
}

const RUTA_VIGENTE: RutaResumenDTO = {
  estado: "vigente",
  calculadaAt: null,
  origenFuente: "gps",
  secuenciaFuente: null,
  paradasSinOptimizar: 0,
  trazado: null,
  tramoSiguiente: null,
};

function renderModule(props: {
  porGestionar: MiAsignacionDTO[];
  bloqueo?: BloqueoDetalle;
  ordenEnGestionId?: string | null;
}) {
  return render(
    <RepartoModule
      porGestionar={props.porGestionar}
      conAyuda={[]}
      porRecoger={[]}
      ordenEnGestionId={props.ordenEnGestionId ?? null}
      ruta={RUTA_VIGENTE}
      bloqueo={props.bloqueo ?? SIN_BLOQUEO}
    />,
  );
}

function botonGestionar(numRemision: string): HTMLElement {
  const card = screen.getByRole("article", { name: new RegExp(`Orden ${numRemision}`) });
  return within(card).getByRole("button", { name: /^Gestionar la orden / });
}

/**
 * Tres órdenes: la PRIMERA es la que el panel toma por defecto (su botón va apagado por eso, no
 * por el bloqueo), así que las que miden el bloqueo son la segunda y la tercera.
 */
function tresOrdenes(terceraEnCorreccion: boolean): MiAsignacionDTO[] {
  return [
    makeAsignacion({ id: "g1", numRemision: "REM-G1", destinatario: "Uno" }),
    makeAsignacion({ id: "g2", numRemision: "REM-G2", destinatario: "Dos", enCorreccion: false }),
    makeAsignacion({
      id: "g3",
      numRemision: "REM-G3",
      destinatario: "Tres",
      enCorreccion: terceraEnCorreccion,
    }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  escogerMock.mockResolvedValue({ status: "ok" } as Awaited<
    ReturnType<typeof escogerParaGestion>
  >);
});

afterEach(() => {
  cleanup();
});

describe("477 — Entregas con el mensajero bloqueado (R27)", () => {
  it("habilita la tarjeta de la orden en corrección y deja deshabilitadas las demás", () => {
    renderModule({ bloqueo: bloqueoConRechazado(), porGestionar: tresOrdenes(true) });

    expect(botonGestionar("REM-G3")).toBeEnabled();
    expect(botonGestionar("REM-G2")).toBeDisabled();
    // El aviso de bloqueo sigue: la exención es por objeto, el mensajero sigue bloqueado.
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    // La primera (bloqueada) no abre el panel de gestión.
    expect(screen.queryByRole("region", { name: "Detalle de la orden" })).toBeNull();
  });

  it("contraprueba: sin `enCorreccion`, la misma tarjeta queda deshabilitada (R13)", () => {
    renderModule({ bloqueo: bloqueoConRechazado(), porGestionar: tresOrdenes(false) });

    expect(botonGestionar("REM-G3")).toBeDisabled();
    expect(botonGestionar("REM-G2")).toBeDisabled();
  });

  it("la orden en corrección se lleva al panel y se puede escoger para gestión", async () => {
    const user = userEvent.setup();
    renderModule({ bloqueo: bloqueoConRechazado(), porGestionar: tresOrdenes(true) });

    await user.click(botonGestionar("REM-G3"));
    await user.click(await screen.findByRole("button", { name: "Aceptar" }));

    const panel = screen.getByRole("region", { name: "Detalle de la orden" });
    expect(panel).toHaveTextContent("NombreTres");
    await user.click(within(panel).getByRole("button", { name: "Gestionar esta orden" }));
    await user.type(within(panel).getByLabelText("Número de guía"), "1001");
    await user.click(within(panel).getByRole("button", { name: "Gestionar" }));

    expect(escogerMock).toHaveBeenCalledWith({ ordenId: "g3" });
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("con la orden en corrección ya escogida, abre el modo foco aunque esté bloqueado", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      porGestionar: tresOrdenes(true),
      ordenEnGestionId: "g3",
    });

    expect(screen.getByRole("region", { name: "Detalle de la orden" })).toHaveTextContent(
      "NombreTres",
    );
    // Modo foco: la lista de tarjetas no se pinta.
    expect(screen.queryByRole("region", { name: "En reparto / por gestionar" })).toBeNull();
  });

  it("sin bloqueo, `enCorreccion` no cambia nada", () => {
    renderModule({ porGestionar: tresOrdenes(false) });

    expect(botonGestionar("REM-G2")).toBeEnabled();
    expect(botonGestionar("REM-G3")).toBeEnabled();
  });
});

// FICHA 479 — el aviso de bloqueo de Entregas ya no dice «no puedes entregar» a secas cuando hay
// órdenes en corrección que SÍ se gestionan. Los textos son LITERALES a propósito: son el contrato
// de lo que lee el mensajero (no se comparan contra la función que los compone).
describe("479 — aviso de bloqueo en Entregas con órdenes en corrección", () => {
  function textoDelAviso(): string {
    const avisos = screen
      .getAllByRole("alert")
      .map((a) => a.textContent ?? "")
      .filter((t) => t.startsWith("Tienes "));
    expect(avisos).toHaveLength(1);
    return avisos[0];
  }

  it("sin órdenes en corrección, el aviso no cambia", () => {
    renderModule({ bloqueo: bloqueoConRechazado(), porGestionar: tresOrdenes(false) });

    expect(textoDelAviso()).toBe(
      "Tienes un cierre sin enviar a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Ve a «Cierre del día» para enviarlo a aprobación.",
    );
  });

  it("con una orden en corrección, dice que esa sí se puede volver a gestionar", () => {
    renderModule({ bloqueo: bloqueoConRechazado(), porGestionar: tresOrdenes(true) });

    expect(textoDelAviso()).toBe(
      "Tienes un cierre sin enviar a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo; solo puedes volver a gestionar la orden de tu cierre rechazado. Ve a «Cierre del día» para enviarlo a aprobación.",
    );
  });

  it("con varias órdenes en corrección, dice cuántas", () => {
    const ordenes = tresOrdenes(true).map((o) =>
      o.id === "g2" ? { ...o, enCorreccion: true } : o,
    );
    renderModule({ bloqueo: bloqueoConRechazado(), porGestionar: ordenes });

    expect(textoDelAviso()).toBe(
      "Tienes un cierre sin enviar a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo; solo puedes volver a gestionar las 2 órdenes de tu cierre rechazado. Ve a «Cierre del día» para enviarlo a aprobación.",
    );
  });
});
