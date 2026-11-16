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
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";

// SLT-156 rebanada B (SLT-163), B6 — el MODO FOCO de Reparto (R510-R513):
//   - R510: «Gestionar» + «Aceptar» deja solo el panel de esa orden, con la verificación abierta;
//   - R511: el bloque es el escáner único y su botón es «Confirmar guía», el único de la pantalla:
//     ni «Gestionar» ni «Gestionar esta orden»;
//   - R512: la guía correcta pasa a «¿Cómo terminó la gestión?»; la incorrecta avisa y se queda;
//   - R513: «Volver a la lista» sale del foco sin tocar el servidor.

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

function montar() {
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
      conAyuda={[]}
      porRecoger={[]}
      ordenEnGestionId={null}
      ruta={RUTA}
      bloqueo={SIN_BLOQUEO}
    />,
  );
}

const panel = () => screen.getByRole("region", { name: "Detalle de la orden" });

/** «Gestionar» de la tarjeta de la SEGUNDA orden + «Aceptar»: no es la que el panel tomaría solo. */
async function entrarEnFoco(user: ReturnType<typeof userEvent.setup>) {
  const card = screen.getByRole("article", { name: /Orden REM-G2/ });
  await user.click(within(card).getByRole("button", { name: /^Gestionar la orden / }));
  await user.click(await screen.findByRole("button", { name: "Aceptar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  escogerMock.mockResolvedValue({ status: "ok", ordenId: "g2" });
});
afterEach(cleanup);

describe("SLT-156 R510/R511 — «Gestionar» lleva al modo foco con la guía por confirmar", () => {
  it("solo queda el panel de esa orden: sin KPI, sin barra, sin tarjetas", async () => {
    const user = userEvent.setup();
    montar();
    await entrarEnFoco(user);

    expect(panel()).toHaveTextContent("Segunda Persona");
    expect(screen.queryByRole("region", { name: "Indicadores de mis asignaciones" })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryAllByRole("article", { name: /^Orden REM-G/ })).toHaveLength(0);
    // Elegirla no fija nada en el servidor: eso llega al confirmar la guía.
    expect(escogerMock).not.toHaveBeenCalled();
  });

  it("la verificación ya está abierta: cámara, «o», «Número de guía» (Ej. 1024), «Confirmar guía» y su nota", async () => {
    const user = userEvent.setup();
    montar();
    await entrarEnFoco(user);

    const p = panel();
    expect(within(p).getByRole("button", { name: "Escanear con cámara" })).toBeInTheDocument();
    expect(within(p).getByText("o")).toBeInTheDocument();
    const campo = within(p).getByLabelText("Número de guía");
    expect(campo).toHaveAttribute("placeholder", "Ej. 1024");
    expect(within(p).getByText("Con la pistola o la cámara se confirma sola.")).toBeInTheDocument();
  });

  it("un único botón «Confirmar guía» y ningún «Gestionar» ni «Gestionar esta orden» en la pantalla", async () => {
    const user = userEvent.setup();
    montar();
    await entrarEnFoco(user);

    expect(screen.getAllByRole("button", { name: /Confirmar guía/ })).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: /^Gestionar/ })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Gestionar esta orden/ })).toHaveLength(0);
  });
});

describe("SLT-156 R512 — confirmar la guía en el foco", () => {
  it("la guía de la orden pasa a «¿Cómo terminó la gestión?» y fija esa orden", async () => {
    const user = userEvent.setup();
    montar();
    await entrarEnFoco(user);

    await user.type(within(panel()).getByLabelText("Número de guía"), "7305");
    await user.click(within(panel()).getByRole("button", { name: "Confirmar guía" }));

    expect(await screen.findByText("¿Cómo terminó la gestión?")).toBeInTheDocument();
    expect(escogerMock).toHaveBeenCalledWith({ ordenId: "g2" });
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("otra guía avisa «La guía {n} no corresponde a esta orden.» y se queda en la verificación", async () => {
    const user = userEvent.setup();
    montar();
    await entrarEnFoco(user);

    // 4817 es la guía de la OTRA orden de la lista: tampoco vale aquí.
    await user.type(within(panel()).getByLabelText("Número de guía"), "4817");
    await user.click(within(panel()).getByRole("button", { name: "Confirmar guía" }));

    expect(errorMock).toHaveBeenCalledWith("La guía 4817 no corresponde a esta orden.");
    expect(escogerMock).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Cómo terminó la gestión?")).toBeNull();
    expect(within(panel()).getByLabelText("Número de guía")).toBeInTheDocument();
  });
});

describe("SLT-156 R513 — «Volver a la lista»", () => {
  it("sale del foco y restaura la vista completa sin llamar al servidor", async () => {
    const user = userEvent.setup();
    montar();
    await entrarEnFoco(user);

    const volver = screen.getByRole("button", { name: "Volver a la lista" });
    expect(volver.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-full"]));
    await user.click(volver);

    expect(screen.queryByRole("region", { name: "Detalle de la orden" })).toBeNull();
    expect(screen.getByRole("region", { name: "Indicadores de mis asignaciones" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar guías" })).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: /^Orden REM-G/ })).toHaveLength(2);
    expect(escogerMock).not.toHaveBeenCalled();
    expect(liberarMock).not.toHaveBeenCalled();
    expect(gestionarMock).not.toHaveBeenCalled();
  });
});
