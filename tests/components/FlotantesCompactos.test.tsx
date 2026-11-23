// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactElement } from "react";

import { ToastProvider } from "@/providers/ToastProvider";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

// SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (A5; R497-R499) — los dos botones
// flotantes del mensajero («Reportar un problema» y el chat) se reducen a 44 px (`size-11`) y se
// aclaran al bajar por la página, vuelven a su tamaño (48 / 56 px) al subir, y reducidos conservan
// su nombre accesible, el distintivo de no leídos y su acción. El desplazamiento es el de verdad:
// `scroll` en `window`, con `requestAnimationFrame` inmediato.

const resumenNoLeidosChatMock = vi.fn();
vi.mock("@/lib/actions/chat-whatsapp", () => ({
  resumenNoLeidosChat: (...a: unknown[]) => resumenNoLeidosChatMock(...a),
  marcarChatLeido: vi.fn(),
  listarHiloChat: vi.fn(),
  enviarMensajeChat: vi.fn(),
  enviarPlantillaChat: vi.fn(),
}));
vi.mock("@/lib/actions/whatsapp-envio", () => ({ listarPlantillasActivasParaEnvio: vi.fn() }));
vi.mock("@/lib/audio/tono-notificacion", () => ({
  reproducirTono: vi.fn(),
  prepararAudio: vi.fn(),
  reiniciarAudioParaTests: vi.fn(),
}));
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));
vi.mock("@/lib/actions/reporte-bug", () => ({
  enviarReporteBugAction: vi.fn(),
  prepararSubidaImagenesReporteAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/mis-asignaciones/reparto" }));

import { ChatFlotante } from "@/app/(app)/mis-asignaciones/_components/chat/ChatFlotante";
import { agruparContactosChat } from "@/app/(app)/mis-asignaciones/_components/chat/chat-contactos";
import { ReporteBugBoton } from "@/components/shared/ReporteBugBoton";

function orden(id: string): MiAsignacionDTO {
  return {
    id,
    numGuia: 12345,
    numRemision: "R-001",
    estatusValue: "en_reparto",
    destinatario: "María López",
    telefonoDest: "88887777",
    direccion: "Calle 1",
    producto: "Caja",
    peso: 1,
    montoCobrar: 5000,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre: "Tienda",
    zonaNombre: "Zona",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
  };
}

let y = 0;
const onAbiertoChange = vi.fn();

function montar(ui: ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>,
  );
}

async function montarAmbos() {
  montar(
    <>
      <ReporteBugBoton usuarioId="usuario-a" />
      <ChatFlotante
        contactos={agruparContactosChat([orden("orden-1")], [], [])}
        ordenEnDetalleId={null}
        abierto={false}
        onAbiertoChange={onAbiertoChange}
      />
    </>,
  );
  // Resuelve el primer fetch del resumen de no leídos.
  await act(async () => {
    await Promise.resolve();
  });
}

function desplazarA(nuevaY: number) {
  y = nuevaY;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

function clases(el: HTMLElement): string[] {
  return el.className.split(/\s+/);
}

const bug = () => screen.getByRole("button", { name: "Reportar un problema" });
const chat = () => screen.getByRole("button", { name: "Abrir chat con clientes, 4 sin leer" });

beforeEach(() => {
  y = 0;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 1;
  });
  resumenNoLeidosChatMock.mockReset();
  resumenNoLeidosChatMock.mockResolvedValue({ status: "ok", conversaciones: [{ ordenId: "orden-1", noLeidos: 4 }] });
  onAbiertoChange.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("R498 — arriba de la página, el tamaño de hoy", () => {
  it("«Reportar un problema» 48 px (`size-12`) y el chat 56 px (`size-14`), opacos", async () => {
    await montarAmbos();
    expect(clases(bug())).toContain("size-12");
    expect(clases(chat())).toContain("size-14");
    for (const b of [bug(), chat()]) {
      expect(clases(b)).not.toContain("size-11");
      expect(clases(b)).not.toContain("opacity-80");
    }
  });
});

describe("R497 — al bajar, los dos se reducen a 44 px y se aclaran", () => {
  it("`size-11` y `opacity-80`, sin el tamaño de hoy", async () => {
    await montarAmbos();
    desplazarA(240);
    expect(clases(bug())).toContain("size-11");
    expect(clases(bug())).not.toContain("size-12");
    expect(clases(chat())).toContain("size-11");
    expect(clases(chat())).not.toContain("size-14");
    for (const b of [bug(), chat()]) expect(clases(b)).toContain("opacity-80");
  });

  it("R498: al subir más de 8 px vuelven a su tamaño", async () => {
    await montarAmbos();
    desplazarA(240);
    desplazarA(200);
    expect(clases(bug())).toContain("size-12");
    expect(clases(chat())).toContain("size-14");
  });
});

describe("R499 — reducidos conservan nombre, distintivo y acción", () => {
  it("el nombre accesible, el distintivo «4» del chat y los dos `onClick`", async () => {
    await montarAmbos();
    desplazarA(240);
    // Los dos se encuentran por su nombre accesible de siempre (si no, `getByRole` lanzaría).
    expect(chat()).toHaveAttribute("data-compacto");
    expect(bug()).toHaveAttribute("data-compacto");
    expect(screen.getByTestId("chat-no-leidos-total")).toHaveTextContent("4");

    fireEvent.click(chat());
    expect(onAbiertoChange).toHaveBeenCalledWith(true);

    fireEvent.click(bug());
    expect(bug()).toHaveAttribute("aria-expanded", "true");
  });
});
