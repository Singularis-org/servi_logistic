// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { KpisMensajero } from "@/app/(app)/mis-asignaciones/_components/KpisMensajero";
import { RepartoModule } from "@/app/(app)/mis-asignaciones/_components/RepartoModule";
import type {
  MiAsignacionDTO,
  RutaResumenDTO,
} from "@/lib/interfaces/services/IMisAsignacionesService";
import { SIN_BLOQUEO, type BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import { bloqueoConVencido } from "@/tests/fixtures/bloqueo-cierre";

// SLT-156 rebanada B (SLT-163), B7 — el escáner de la LISTA de Reparto (R500, R503, R514-R516):
//   - R500/R503: «Escanear o escribir guía» arranca cerrado, bajo el encabezado y encima de los KPI
//     y de la barra de filtros;
//   - R514: la guía de una orden propia → «¿Gestionar esta orden?» → foco en «¿Cómo terminó la
//     gestión?», con la guía ya confirmada;
//   - R515: una guía ajena avisa «La guía {n} no está en tu lista de reparto.» y no cambia de vista;
//   - R516: bloqueado, no hay disparador.

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

const { escogerMock, gestionarMock, liberarMock, errorMock } = vi.hoisted(() => ({
  escogerMock: vi.fn(),
  gestionarMock: vi.fn(),
  liberarMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/hooks/use-etiquetas-geograficas", async () => {
  const { ETIQUETAS_CR } = await import("../fabricas/etiquetas-geograficas");
  return { useEtiquetasGeograficas: () => ETIQUETAS_CR };
});

vi.mock("@/lib/actions/mis-asignaciones", () => ({
  recogerAsignaciones: vi.fn(),
  escogerParaGestion: escogerMock,
  gestionar: gestionarMock,
  liberarGestion: liberarMock,
}));

vi.mock("@/lib/actions/orden-ayuda", () => ({
  solicitarAyudaOrden: vi.fn(),
  recuperarOrdenAyuda: vi.fn(),
}));

vi.mock("@/lib/actions/orden-notas", () => ({
  listarNotasOrden: vi.fn().mockResolvedValue({ status: "ok", notas: [], puedeEscribir: false }),
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
  marcarGestionarLuego: vi.fn(),
}));

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
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function orden(over: Partial<MiAsignacionDTO> & { id: string }): MiAsignacionDTO {
  return {
    numGuia: 4817,
    numRemision: "REM-001",
    estatusValue: "en_reparto",
    destinatario: "Ana Perez",
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
    provinciaNombre: "San Jose",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    ...over,
  };
}

const RUTA: RutaResumenDTO = {
  estado: "vigente",
  calculadaAt: null,
  origenFuente: "gps",
  secuenciaFuente: null,
  paradasSinOptimizar: 0,
  trazado: null,
  tramoSiguiente: null,
};

function montar(opciones?: { bloqueo?: BloqueoDetalle; conAyuda?: MiAsignacionDTO[] }) {
  return render(
    <RepartoModule
      kpis={<KpisMensajero kpis={{ pendientes: 2, entregadas: 0, porCobrar: 0, totalACobrar: 0 }} />}
      porGestionar={[
        orden({ id: "g1", numRemision: "REM-G1", destinatario: "Primera Persona" }),
        orden({
          id: "g2",
          numRemision: "REM-G2",
          destinatario: "Segunda Persona",
          numGuia: 7305,
          secuenciaRuta: 2,
        }),
      ]}
      conAyuda={opciones?.conAyuda ?? []}
      porRecoger={[]}
      ordenEnGestionId={null}
      ruta={RUTA}
      bloqueo={opciones?.bloqueo ?? SIN_BLOQUEO}
    />,
  );
}

const disparador = () => screen.getByRole("button", { name: "Escanear o escribir guía" });

/** Abre el escáner y escribe la guía en su campo, como la pistola o el mensajero. */
async function leerGuia(user: ReturnType<typeof userEvent.setup>, guia: string) {
  await user.click(disparador());
  const escaner = await screen.findByRole("dialog", { name: "Escanear o escribir guía" });
  await user.type(within(escaner).getByLabelText("Número de guía"), guia);
  await user.click(within(escaner).getByRole("button", { name: "Abrir orden" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  escogerMock.mockResolvedValue({ status: "ok", ordenId: "g2" });
});
afterEach(cleanup);

describe("SLT-156 R500/R503 — el disparador del escáner", () => {
  it("arranca cerrado y va encima de los KPI y de la barra de filtros", () => {
    montar();
    const boton = disparador();
    expect(screen.queryByRole("dialog")).toBeNull();
    const kpis = screen.getByRole("region", { name: "Indicadores de mis asignaciones" });
    const barra = screen.getByRole("searchbox", { name: "Buscar guías" });
    expect(boton.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(kpis.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});

describe("SLT-156 R514 — la guía de una orden propia", () => {
  it("cierra el escáner, pide «¿Gestionar esta orden?» y al aceptar abre el foco en los resultados", async () => {
    const user = userEvent.setup();
    montar();

    await leerGuia(user, "7305");
    const dialogo = await screen.findByRole("dialog", { name: "¿Gestionar esta orden?" });
    expect(screen.queryByRole("dialog", { name: "Escanear o escribir guía" })).toBeNull();
    // Hasta aceptar no se fija nada.
    expect(escogerMock).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Aceptar" }));

    expect(await screen.findByText("¿Cómo terminó la gestión?")).toBeInTheDocument();
    expect(escogerMock).toHaveBeenCalledWith({ ordenId: "g2" });
    const panel = screen.getByRole("region", { name: "Detalle de la orden" });
    expect(panel).toHaveTextContent("Segunda Persona");
    // La guía ya está confirmada: ni campo de guía ni «Volver a la lista».
    expect(within(panel).queryByLabelText("Número de guía")).toBeNull();
    expect(screen.queryByRole("button", { name: "Volver a la lista" })).toBeNull();
  });

  it("«Cancelar» en el diálogo no fija nada y deja la lista como estaba", async () => {
    const user = userEvent.setup();
    montar();

    await leerGuia(user, "7305");
    const dialogo = await screen.findByRole("dialog", { name: "¿Gestionar esta orden?" });
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    expect(escogerMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Detalle de la orden" })).toBeNull();
    expect(screen.getAllByRole("article", { name: /^Orden REM-G/ })).toHaveLength(2);
  });
});

describe("SLT-156 R515 — una guía que no es de su reparto", () => {
  it("avisa «La guía {n} no está en tu lista de reparto.» y no cambia de vista", async () => {
    const user = userEvent.setup();
    montar();

    await leerGuia(user, "9461");

    expect(errorMock).toHaveBeenCalledWith("La guía 9461 no está en tu lista de reparto.");
    expect(screen.queryByRole("dialog", { name: "¿Gestionar esta orden?" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Detalle de la orden" })).toBeNull();
    expect(escogerMock).not.toHaveBeenCalled();
  });

  it("la guía de una orden con ayuda solicitada tampoco abre nada", async () => {
    const user = userEvent.setup();
    montar({
      conAyuda: [
        orden({ id: "a1", numRemision: "REM-A1", numGuia: 5923 }),
      ],
    });

    await leerGuia(user, "5923");

    expect(errorMock).toHaveBeenCalledWith("La guía 5923 no está en tu lista de reparto.");
    expect(screen.queryByRole("dialog", { name: "¿Gestionar esta orden?" })).toBeNull();
  });
});

describe("SLT-156 R516 — bloqueado por un cierre pendiente", () => {
  it("no hay «Escanear o escribir guía»", () => {
    montar({ bloqueo: bloqueoConVencido() });
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Escanear o escribir guía" })).toBeNull();
  });
});
