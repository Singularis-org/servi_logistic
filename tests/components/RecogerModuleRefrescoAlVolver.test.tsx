// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { RecogerModule } from "@/app/(app)/mis-asignaciones/_components/RecogerModule";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { bloqueoConVencido } from "@/tests/fixtures/bloqueo-cierre";

// SLT-69 (R6, R11) — la pantalla Recoger en bodega relee del servidor al volver a ella
// (`router.refresh()`), también bloqueada o con la lista vacía; y el bloqueo por cierre sigue
// ocultando los controles de recogida como hasta hoy.
vi.mock("@/lib/actions/mis-asignaciones", () => ({
  recogerAsignaciones: vi.fn(),
  listarMisAsignaciones: vi.fn(),
}));

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

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
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

function makeAsignacion(
  over: Partial<MiAsignacionDTO> & { id: string; numGuia: number },
): MiAsignacionDTO {
  return {
    secuenciaRuta: null,
    numRemision: "REM-001",
    estatusValue: "mensajero_recogiendo_en_bodega",
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
    ...over,
  };
}

function volverALaApp() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RecogerModule — relee al volver a la app (R6)", () => {
  it("al volver a estar visible pasado el intervalo, relee la pantalla con router.refresh()", () => {
    render(
      <RecogerModule
        porRecoger={[makeAsignacion({ id: "r1", numGuia: 1001 })]}
        bloqueo={SIN_BLOQUEO}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    volverALaApp();

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("con la lista VACÍA también relee: así aparece la tarjeta en cuanto hay órdenes nuevas", () => {
    render(<RecogerModule porRecoger={[]} bloqueo={SIN_BLOQUEO} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    volverALaApp();

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("bloqueado también relee: un bloqueo resuelto se refleja al volver", () => {
    render(
      <RecogerModule
        porRecoger={[makeAsignacion({ id: "r1", numGuia: 1001 })]}
        bloqueo={bloqueoConVencido()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    volverALaApp();

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("RecogerModule — el bloqueo por cierre se conserva (R11)", () => {
  it("bloqueado: no hay acceso «Recoger paquete» y el aviso de bloqueo sí está", () => {
    render(
      <RecogerModule
        porRecoger={[makeAsignacion({ id: "r1", numGuia: 1001 })]}
        bloqueo={bloqueoConVencido()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Recoger paquete" })).toBeNull();
    expect(screen.queryByLabelText("Número de guía")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tienes un cierre sin enviar a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Ve a «Cierre del día» para enviarlo a aprobación.",
    );
  });
});
