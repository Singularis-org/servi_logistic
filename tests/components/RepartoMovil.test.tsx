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

// SLT-156 rebanada B (SLT-163) — Reparto en el móvil, lo que cambia la PANTALLA:
//   - R503: el orden de las secciones (aviso → KPI → barra fija → «En reparto» → «Con ayuda»);
//   - R504: fuera del modo foco no hay panel de gestión;
//   - R507: la lista arranca en Mosaico;
//   - R509: cada aviso de ruta en una línea con «Ver más» y «Mostrar mapa» en la misma fila;
//   - R493: los botones de las tarjetas (Gestionar, Gestionar más tarde, Recuperar,
//     Conversación) y los del diálogo de confirmación miden 44 px.
// Archivo aparte de `RepartoModule.test.tsx`, que mide el comportamiento de cada pieza y ya es
// largo. El andamiaje de mocks es el mismo: sin él, las Server Actions reales arrastrarían Prisma.

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

const KPIS = { pendientes: 3, entregadas: 7, porCobrar: 12500, totalACobrar: 48000 };

function montar(opciones?: {
  porGestionar?: MiAsignacionDTO[];
  conAyuda?: MiAsignacionDTO[];
  ruta?: RutaResumenDTO;
  bloqueo?: BloqueoDetalle;
  ordenEnGestionId?: string | null;
}) {
  return render(
    <RepartoModule
      kpis={<KpisMensajero kpis={KPIS} />}
      porGestionar={opciones?.porGestionar ?? [orden({ id: "g1", numRemision: "REM-G1" })]}
      conAyuda={opciones?.conAyuda ?? []}
      porRecoger={[]}
      ordenEnGestionId={opciones?.ordenEnGestionId ?? null}
      ruta={opciones?.ruta ?? RUTA}
      bloqueo={opciones?.bloqueo ?? SIN_BLOQUEO}
    />,
  );
}

/** `true` si `a` va ANTES que `b` en el documento y no lo contiene. */
function vaAntes(a: Element, b: Element): boolean {
  const posicion = a.compareDocumentPosition(b);
  return (
    (posicion & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
    (posicion & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0
  );
}

const kpis = () => screen.getByRole("region", { name: "Indicadores de mis asignaciones" });
const buscador = () => screen.getByRole("searchbox", { name: "Buscar guías" });
const seccionReparto = () => screen.getByRole("region", { name: "En reparto / por gestionar" });
/** La barra de `BuscadorFiltros`: el contenedor que lleva `sticky` (su raíz). */
const barra = () => buscador().closest(".sticky") as HTMLElement | null;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("SLT-156 R503 — el orden de Reparto, de arriba abajo", () => {
  it("bloqueado: aviso de bloqueo → KPI → barra fija → «En reparto» → «Con ayuda»", () => {
    montar({
      bloqueo: bloqueoConVencido(),
      conAyuda: [orden({ id: "a1", numRemision: "REM-A1" })],
    });

    const aviso = screen.getByRole("alert");
    const ayuda = screen.getByRole("region", { name: "Con ayuda solicitada" });
    const fija = barra();
    expect(fija).not.toBeNull();

    expect(vaAntes(aviso, kpis())).toBe(true);
    expect(vaAntes(kpis(), fija!)).toBe(true);
    expect(vaAntes(fija!, seccionReparto())).toBe(true);
    // «Con ayuda» cierra la sección de «En reparto»: va después de su lista.
    const lista = screen.getByRole("region", { name: "Órdenes en reparto" });
    expect(lista.compareDocumentPosition(ayuda) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("la barra está pegada arriba (`sticky top-0`) y es hija directa del módulo, para seguir pegada toda la lista", () => {
    const { container } = montar();
    const fija = barra();
    expect(fija).not.toBeNull();
    expect(fija!.className.split(/\s+/)).toEqual(expect.arrayContaining(["sticky", "top-0"]));
    // `sticky` solo se pega dentro de su padre: si la barra viviera en una caja del tamaño de la
    // barra, se iría con el desplazamiento.
    expect(fija!.parentElement).toBe(container.firstElementChild);
  });
});

describe("SLT-156 R504 — fuera del modo foco no hay panel de gestión", () => {
  it("con órdenes por gestionar, la lista va sola: sin región «Detalle de la orden»", () => {
    montar({
      porGestionar: [
        orden({ id: "g1", numRemision: "REM-G1" }),
        orden({ id: "g2", numRemision: "REM-G2", secuenciaRuta: 2 }),
      ],
    });
    expect(screen.getAllByRole("article", { name: /^Orden REM-G/ })).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "Detalle de la orden" })).toBeNull();
  });

  it("en modo foco solo queda el panel: sin KPI ni barra de búsqueda", () => {
    montar({ ordenEnGestionId: "g1" });
    expect(screen.getByRole("region", { name: "Detalle de la orden" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Indicadores de mis asignaciones" })).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "Buscar guías" })).toBeNull();
  });
});

describe("SLT-156 R507 — la lista arranca en Mosaico", () => {
  it("al abrir Reparto: carrusel montado y «Mosaico» pulsado; «Detalle» cambia a la lista", async () => {
    const user = userEvent.setup();
    montar();

    const conmutador = screen.getByRole("group", { name: "Vista de las órdenes" });
    expect(within(conmutador).getByRole("button", { name: /Mosaico/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "Órdenes en reparto" })).toBeInTheDocument();

    await user.click(within(conmutador).getByRole("button", { name: /Detalle/ }));
    // Detalle: tarjetas compactas en lista (R508), con su fila desplegable.
    expect(
      await screen.findByRole("button", { expanded: false, name: /REM-G1/ }),
    ).toBeInTheDocument();
  });
});

describe("SLT-156 R509 — avisos de ruta en una línea", () => {
  const RUTA_CON_AVISOS: RutaResumenDTO = {
    ...RUTA,
    estado: "desactualizada",
    secuenciaFuente: "local",
  };
  const TEXTO_DESACTUALIZADA = /La ruta cambió desde el último cálculo/;

  it("cada aviso: título a la vista, descripción oculta tras «Ver más» y «Mostrar mapa» en la fila del primero", async () => {
    const user = userEvent.setup();
    montar({ ruta: RUTA_CON_AVISOS });

    const avisos = within(seccionReparto()).getAllByRole("alert");
    expect(avisos).toHaveLength(2);
    const [desactualizada, aproximado] = avisos as [HTMLElement, HTMLElement];
    expect(within(desactualizada).getByText("El orden mostrado no está actualizado")).toBeInTheDocument();
    expect(within(aproximado).getByText("El orden de las paradas es aproximado")).toBeInTheDocument();

    // Plegado: la descripción no está.
    const verMas = within(desactualizada).getByRole("button", { name: /^Ver más/ });
    expect(verMas).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(TEXTO_DESACTUALIZADA)).toBeNull();

    // «Mostrar mapa» en la MISMA fila que el título del primer aviso, y una sola vez.
    const mapa = within(desactualizada).getByRole("button", { name: /Ocultar mapa|Mostrar mapa/ });
    expect(mapa.parentElement).toBe(verMas.parentElement);
    expect(screen.getAllByRole("button", { name: /Ocultar mapa|Mostrar mapa/ })).toHaveLength(1);

    await user.click(verMas);
    expect(
      within(desactualizada).getByRole("button", { name: /^Ver menos/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(within(desactualizada).getByText(TEXTO_DESACTUALIZADA)).toBeInTheDocument();
    // El otro aviso sigue plegado: cada uno se despliega por su cuenta.
    expect(within(aproximado).getByRole("button", { name: /^Ver más/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("sin avisos, «Mostrar mapa» sigue en la cabecera del mapa", () => {
    montar();
    const mapa = screen.getByRole("group", { name: "Mapa de ruta" });
    expect(within(mapa).getByRole("button", { name: /Ocultar mapa|Mostrar mapa/ })).toBeInTheDocument();
  });
});

describe("SLT-156 R493 — los botones de las tarjetas de Reparto miden 44 px", () => {
  const ALTO_TACTIL = "h-11";

  it("«Gestionar», «Gestionar más tarde», «Recuperar» y «Conversación» llevan `h-11`", () => {
    montar({
      porGestionar: [orden({ id: "g1", numRemision: "REM-G1" })],
      conAyuda: [orden({ id: "a1", numRemision: "REM-A1" })],
    });

    const botones = [
      screen.getByRole("button", { name: "Gestionar la orden REM-G1" }),
      screen.getByRole("button", { name: "Marcar la orden REM-G1 para gestionar más tarde" }),
      screen.getByRole("button", { name: "Retirar la solicitud de ayuda de la orden REM-A1" }),
      within(screen.getByRole("region", { name: "Con ayuda solicitada" })).getByRole("button", {
        name: "Conversación",
      }),
    ];
    for (const boton of botones) {
      expect(boton.className.split(/\s+/)).toContain(ALTO_TACTIL);
    }
  });

  it("el diálogo «¿Gestionar esta orden?» (ConfirmarGestionDialog): «Cancelar» y «Aceptar» de 44 px", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Gestionar la orden REM-G1" }));
    const dialogo = await screen.findByRole("dialog", { name: "¿Gestionar esta orden?" });
    for (const nombre of ["Cancelar", "Aceptar"]) {
      expect(within(dialogo).getByRole("button", { name: nombre }).className.split(/\s+/)).toContain(
        ALTO_TACTIL,
      );
    }
  });
});
