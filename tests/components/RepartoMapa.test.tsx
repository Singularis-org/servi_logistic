// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { escogerParaGestion } from "@/lib/actions/mis-asignaciones";
import { KpisMensajero } from "@/app/(app)/mis-asignaciones/_components/KpisMensajero";
import { RepartoModule } from "@/app/(app)/mis-asignaciones/_components/RepartoModule";
import type { RutaMapaProps } from "@/app/(app)/mis-asignaciones/_components/RutaMapa";
import type {
  MiAsignacionDTO,
  RutaResumenDTO,
} from "@/lib/interfaces/services/IMisAsignacionesService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";

// SLT-166 «PWA del mensajero: mapa de ruta» — lo que el MÓDULO de Reparto hace con el mapa:
//   - R542: la tarjeta a la vista del carrusel es la parada activa del mapa (solo en Mosaico);
//   - R543: una parada sin coordenadas sigue en la lista y fuera del mapa, y cuenta en el total;
//   - R540: tocar un marcador abre su hoja, y su «Gestionar» lleva al MISMO modo foco que la
//     tarjeta, sin llamar al servidor antes de «Confirmar guía»;
//   - R544: «Mostrar mapa» / «Ocultar mapa» con sus textos, a 44 px.
// SLT-192 «Mapa de ruta según el canvas» (R881-R885): con el mapa abierto, «Ocultar mapa» y la nota
// del punto de partida van al pie del mapa (`RutaMapa` recibe la acción y la nota); el rótulo
// «Mapa de ruta» se ve siempre; cerrado, «Mostrar mapa» en su sitio de hoy.
// El mapa (Leaflet) y el carrusel (embla) se sustituyen por dobles que exponen sus props: aquí se
// prueba el cableado del módulo; los dos componentes tienen sus propios tests.

vi.mock("@/hooks/use-etiquetas-geograficas", async () => {
  const { ETIQUETAS_CR } = await import("../fabricas/etiquetas-geograficas");
  return { useEtiquetasGeograficas: () => ETIQUETAS_CR };
});

vi.mock("@/lib/actions/mis-asignaciones", () => ({
  recogerAsignaciones: vi.fn(),
  escogerParaGestion: vi.fn(),
  gestionar: vi.fn(),
  liberarGestion: vi.fn(),
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

const { rutaMapaMock } = vi.hoisted(() => ({ rutaMapaMock: vi.fn() }));
vi.mock("@/app/(app)/mis-asignaciones/_components/RutaMapa", () => ({
  RutaMapa: (props: RutaMapaProps) => {
    rutaMapaMock(props);
    return (
      <div data-testid="ruta-mapa">
        {props.paradas.map((p) => (
          <button key={p.id} type="button" onClick={() => props.onSeleccionarParada?.(p.id)}>
            {`marcador ${p.id}`}
          </button>
        ))}
        {/* SLT-192: en la app, «Ocultar mapa» del pie y la nota bajo la leyenda (RutaMapaInner). */}
        {props.onOcultar ? (
          <button type="button" onClick={props.onOcultar}>
            plegar (doble)
          </button>
        ) : null}
        {props.nota ? <p data-testid="nota-doble">{props.nota}</p> : null}
      </div>
    );
  },
}));

vi.mock("@/components/shared/CarruselCards", () => ({
  CarruselCards: (props: {
    items: unknown[];
    getKey: (item: unknown) => string;
    renderItem: (item: unknown) => ReactNode;
    ariaLabel: string;
    onIndiceChange?: (indice: number) => void;
  }) => (
    <div role="region" aria-label={props.ariaLabel}>
      {props.items.map((item, i) => (
        <div key={props.getKey(item)}>
          {props.renderItem(item)}
          <button type="button" onClick={() => props.onIndiceChange?.(i)}>
            {`deslizar a la tarjeta ${i}`}
          </button>
        </div>
      ))}
    </div>
  ),
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
    error: vi.fn(),
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
    numGuia: 1001,
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

const TRES = [
  orden({ id: "g1", numRemision: "REM-G1", destinatario: "Uno", secuenciaRuta: 1 }),
  orden({ id: "g2", numRemision: "REM-G2", destinatario: "Dos", secuenciaRuta: 2, latitud: 9.95, longitud: -84.11 }),
  // R543: sin coordenadas.
  orden({ id: "g3", numRemision: "REM-G3", destinatario: "Tres", secuenciaRuta: 3, latitud: null, longitud: null }),
];

function montar(porGestionar: MiAsignacionDTO[] = TRES) {
  return render(
    <RepartoModule
      kpis={<KpisMensajero kpis={{ pendientes: 3, entregadas: 0, porCobrar: 0, totalACobrar: 0 }} />}
      porGestionar={porGestionar}
      conAyuda={[]}
      porRecoger={[]}
      ordenEnGestionId={null}
      ruta={RUTA}
      bloqueo={SIN_BLOQUEO}
    />,
  );
}

function ultimasPropsDelMapa(): RutaMapaProps {
  const props = rutaMapaMock.mock.calls.at(-1)?.[0] as RutaMapaProps | undefined;
  expect(props, "el mapa tiene que estar montado").toBeDefined();
  return props!;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("SLT-166 R542 — el carrusel manda la parada activa del mapa", () => {
  it("en Mosaico, al deslizar a otra tarjeta su parada pasa a ser la activa", async () => {
    const user = userEvent.setup();
    montar();
    expect(ultimasPropsDelMapa().paradaActivaId).toBe("g1");
    expect(screen.getByText("El mapa se centra en la orden del carrusel.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "deslizar a la tarjeta 1" }));

    expect(ultimasPropsDelMapa().paradaActivaId).toBe("g2");
  });

  it("en Detalle no hay carrusel: el módulo no impone parada activa (el mapa marca la primera)", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "deslizar a la tarjeta 1" }));
    const conmutador = screen.getByRole("group", { name: "Vista de las órdenes" });
    await user.click(within(conmutador).getByRole("button", { name: /Detalle/ }));

    // El cambio de vista va animado (`useTransicionVista`): se espera a que se vaya el carrusel.
    await vi.waitFor(() => expect(screen.queryByRole("region", { name: "Órdenes en reparto" })).toBeNull());
    expect(ultimasPropsDelMapa().paradaActivaId).toBeNull();
  });
});

describe("SLT-166 R543 — una parada sin coordenadas sigue en la lista y fuera del mapa", () => {
  it("el mapa recibe g1 y g2; la lista tiene las tres y el total del mapa cuenta las tres", () => {
    montar();
    const props = ultimasPropsDelMapa();
    expect(props.paradas.map((p) => p.id)).toEqual(["g1", "g2"]);
    expect(props.totalParadas).toBe(3);
    expect(screen.getByRole("article", { name: /Orden REM-G3/ })).toBeInTheDocument();
  });
});

describe("SLT-166 R540 — el marcador abre su hoja y «Gestionar» sigue el camino de la tarjeta", () => {
  it("tocar el marcador de g2 abre su hoja; «Gestionar» → «Aceptar» → modo foco, sin llamar al servidor", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "marcador g2" }));
    const hoja = screen.getByRole("dialog", { name: "Parada 2" });
    expect(within(hoja).getByText("REM-G2")).toBeInTheDocument();
    expect(within(hoja).getByText("Dos")).toBeInTheDocument();

    await user.click(within(hoja).getByRole("button", { name: "Gestionar la orden REM-G2" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "¿Gestionar esta orden?" })).getByRole("button", {
        name: "Aceptar",
      }),
    );

    // Modo foco de esa orden (R510): el panel con «Confirmar guía» y sin la lista.
    const panel = screen.getByRole("region", { name: "Detalle de la orden" });
    // Y es la de la hoja (g2, «Dos»), no la primera de la lista que el panel tomaría solo.
    expect(panel).toHaveTextContent("Dos");
    expect(panel).not.toHaveTextContent("Uno");
    expect(screen.getByRole("button", { name: "Confirmar guía" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Órdenes en reparto" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Parada 2" })).toBeNull();
    // Como desde la tarjeta: el servidor no se entera hasta confirmar la guía.
    expect(vi.mocked(escogerParaGestion)).not.toHaveBeenCalled();
  });

  it("cerrar la hoja (Escape; SLT-192 R889: ya no hay «Cerrar») vuelve al mapa", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "marcador g1" }));
    const hoja = screen.getByRole("dialog", { name: "Parada 1" });
    expect(within(hoja).queryByRole("button", { name: "Cerrar" })).toBeNull();
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Parada 1" })).toBeNull());
    expect(screen.getByTestId("ruta-mapa")).toBeInTheDocument();
  });
});

describe("SLT-166 R544 + SLT-192 R882/R883 — «Mostrar mapa» (44 px) y la acción de plegar del pie", () => {
  it("plegar desde el pie muestra «Mostrar mapa» (44 px, aria-expanded=false) y este reabre el mapa", async () => {
    const user = userEvent.setup();
    montar();
    const grupo = screen.getByRole("group", { name: "Mapa de ruta" });

    await user.click(within(grupo).getByRole("button", { name: "plegar (doble)" }));
    const mostrar = within(grupo).getByRole("button", { name: "Mostrar mapa" });
    expect(mostrar).toHaveAttribute("aria-expanded", "false");
    expect(mostrar.className).toContain("h-11");
    // El foco pasa a «Mostrar mapa»: el botón pulsado desaparece con el mapa.
    expect(mostrar).toHaveFocus();

    await user.click(mostrar);
    expect(within(grupo).queryByRole("button", { name: "Mostrar mapa" })).toBeNull();
    expect(await screen.findByTestId("ruta-mapa")).toBeInTheDocument();
  });
});

describe("SLT-192 R881/R884/R885 — rótulo, control único y nota en el pie", () => {
  const RUTA_CON_AVISOS: RutaResumenDTO = { ...RUTA, estado: "desactualizada", secuenciaFuente: "local" };
  const NOTA = "El punto de partida es aproximado (no se usó tu ubicación GPS reciente).";

  function montarCon(ruta: RutaResumenDTO) {
    return render(
      <RepartoModule
        kpis={<KpisMensajero kpis={{ pendientes: 3, entregadas: 0, porCobrar: 0, totalACobrar: 0 }} />}
        porGestionar={TRES}
        conAyuda={[]}
        porRecoger={[]}
        ordenEnGestionId={null}
        ruta={ruta}
        bloqueo={SIN_BLOQUEO}
      />,
    );
  }

  it("R881: abierto, el módulo no pinta ningún «Ocultar mapa»/«Mostrar mapa»; `RutaMapa` recibe la acción", () => {
    montar();
    expect(screen.queryByRole("button", { name: /Ocultar mapa|Mostrar mapa/ })).toBeNull();
    expect(typeof ultimasPropsDelMapa().onOcultar).toBe("function");
  });

  it("R881: con avisos y el mapa abierto, la fila del aviso no tiene control del mapa", () => {
    montarCon(RUTA_CON_AVISOS);
    const [primero] = screen.getAllByRole("alert") as [HTMLElement];
    expect(within(primero).getByRole("button", { name: /^Ver más/ })).toBeInTheDocument();
    expect(within(primero).queryByRole("button", { name: /Ocultar mapa|Mostrar mapa/ })).toBeNull();
  });

  it("R883: con avisos y el mapa cerrado, «Mostrar mapa» va en la fila del primer aviso", async () => {
    const user = userEvent.setup();
    montarCon(RUTA_CON_AVISOS);
    await user.click(screen.getByRole("button", { name: "plegar (doble)" }));
    const [primero] = screen.getAllByRole("alert") as [HTMLElement];
    expect(within(primero).getByRole("button", { name: "Mostrar mapa" })).toBeInTheDocument();
    const grupo = screen.getByRole("group", { name: "Mapa de ruta" });
    expect(within(grupo).queryByRole("button", { name: "Mostrar mapa" })).toBeNull();
  });

  it("R884: el rótulo «Mapa de ruta» se ve con y sin avisos, abierto y cerrado", async () => {
    const user = userEvent.setup();
    for (const ruta of [RUTA, RUTA_CON_AVISOS]) {
      const { unmount } = montarCon(ruta);
      const grupo = screen.getByRole("group", { name: "Mapa de ruta" });
      expect(within(grupo).getByText("Mapa de ruta")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "plegar (doble)" }));
      expect(within(grupo).getByText("Mapa de ruta")).toBeVisible();
      unmount();
    }
  });

  it("R885: con origen aproximado, la nota va al mapa (bajo su leyenda), no encima del mapa", () => {
    montarCon({ ...RUTA, origenFuente: "centroide" });
    expect(ultimasPropsDelMapa().nota).toBe(NOTA);
    // Una sola vez y DENTRO del mapa (el doble la pinta donde la pinta `RutaMapaInner`).
    const notas = screen.getAllByText(NOTA);
    expect(notas).toHaveLength(1);
    expect(screen.getByTestId("ruta-mapa").contains(notas[0]!)).toBe(true);
  });

  it("R885: con origen GPS no hay nota", () => {
    montar();
    expect(ultimasPropsDelMapa().nota).toBeUndefined();
    expect(screen.queryByText(NOTA)).toBeNull();
  });
});

describe("SLT-166 (review m3) — un solo total: el de la ruta sin filtrar", () => {
  it("con la búsqueda activa, la tarjeta, la hoja y el mapa cuentan las mismas 3 órdenes", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByRole("searchbox", { name: "Buscar guías" }), "Dos");
    // El filtro está puesto: solo queda la tarjeta de g2.
    await vi.waitFor(() => expect(screen.queryByRole("article", { name: /Orden REM-G1/ })).toBeNull());

    const tarjeta = screen.getByRole("article", { name: /Orden REM-G2/ });
    expect(tarjeta).toHaveTextContent("2 de 3");
    expect(ultimasPropsDelMapa().totalParadas).toBe(3);
    await user.click(screen.getByRole("button", { name: "marcador g2" }));
    expect(screen.getByRole("dialog", { name: "Parada 2" })).toBeInTheDocument();
  });
});
