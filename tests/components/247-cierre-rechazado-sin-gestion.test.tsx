// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import { filasAConfirmar } from "@/app/(app)/cierres-admin/_components/cierre-confirmacion-fisica";
import { listarCierresPasadosPaginado } from "@/lib/actions/cierre-dia";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import type {
  CierreGrupos,
  CierreOrdenSinGestion,
  CorreccionCierreDTO,
  OrdenEnCorreccionDTO,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import { bloqueoConRechazado, bloqueoConVencido } from "@/tests/fixtures/bloqueo-cierre";
import type { CierreReenviable } from "@/components/private/cierres/detalle/detalle-cierre-vista";

// SLT-247 «Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna antes de
// reenviarlo» (T3.4) — R1791 (pantalla), R1795-R1798. Los literales de las aserciones están ESCRITOS
// aquí a propósito, no importados de las etiquetas (memoria «aserción contra su propia fuente»).

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
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

/** El cierre de `bloqueoConRechazado()` / `bloqueoConVencido()` se llama `c-viejo` en la fixture. */
const CIERRE = "c-viejo";
const BOTON_RECHAZADO = "Solicitar aprobación del cierre rechazado";

function emptyGrupos(): CierreGrupos {
  return { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
}

function orden(over: Partial<OrdenEnCorreccionDTO> & { ordenId: string }): OrdenEnCorreccionDTO {
  return { numGuia: 2002, numRemision: `REM-${over.ordenId}`, destinatario: "Beto Ruiz", regestionada: false, ...over };
}

function barrida(over: Partial<CierreOrdenSinGestion> & { ordenId: string }): CierreOrdenSinGestion {
  return {
    numGuia: 3003,
    numRemision: `REM-${over.ordenId}`,
    destinatario: "Carla Mora",
    producto: "Caja",
    tiendaNombre: "Tienda X",
    zonaNombre: "GAM",
    estatusOrigen: "en_reparto",
    ...over,
  };
}

function leido(estado: "rechazado" | "vencido", ordenesSinGestion: CierreOrdenSinGestion[] = []): CierreReenviable {
  return {
    estado: "ok",
    cierre: {
      cierreId: CIERRE,
      estado,
      destinoTipo: "bodega_satelite",
      destinoZonaId: "z1",
      totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
      totalPagoMensajero: "0.00",
      totalIngresoBodegaRechazos: "0.00",
      solicitadoAt: "2026-11-19T23:00:00.000Z",
      resueltoAt: "2026-11-20T14:00:00.000Z",
      motivoRechazo: null,
    },
    grupos: emptyGrupos(),
    ordenesSinGestion,
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
  } as CierreReenviable;
}

function correccion(ordenes: OrdenEnCorreccionDTO[]): CorreccionCierreDTO[] {
  return [{ cierreId: CIERRE, motivoRechazo: "x", gestiones: [], ordenesEnCorreccion: ordenes }];
}

function renderModule(p: { bloqueo: BloqueoDetalle; reenviable: CierreReenviable; correcciones?: CorreccionCierreDTO[] }) {
  const pagina = paginaInicial([]);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "ok", page: 1, ...pagina });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={emptyGrupos()}
        totales={{ efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" }}
        totalPagoMensajero="0.00"
        puedesSolicitar={false}
        motivoBloqueo={null}
        cierresPasados={pagina}
        bloqueo={p.bloqueo}
        correcciones={p.correcciones}
        reenviable={p.reenviable}
      />
    </SWRConfig>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SLT-247 — «Corregir» con las órdenes que pasaron a Novedad interna (R1795)", () => {
  it("Corregir lista las obligatorias aparte, con estado y enlace", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido("rechazado"),
      correcciones: correccion([
        orden({ ordenId: "o1", numGuia: 1201, numRemision: "REM-OBL-HECHA", destinatario: "Ana", obligatoria: true, regestionada: true }),
        orden({ ordenId: "o2", numGuia: 1202, numRemision: "REM-OBL-FALTA", destinatario: "Beto", obligatoria: true }),
        orden({ ordenId: "o3", numRemision: "REM-DESHECHA", destinatario: "Ciro" }),
      ]),
    });

    const panel = screen.getByRole("tabpanel", { name: "Corregir" });
    const obligatorias = within(panel).getByRole("region", { name: "Órdenes que pasaron a Novedad interna" });
    expect(obligatorias).toHaveTextContent("Tienes que gestionarlas antes de enviar de nuevo el cierre.");
    const filas = within(obligatorias).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    const hecha = filas.find((f) => f.textContent?.includes("REM-OBL-HECHA")) as HTMLElement;
    const falta = filas.find((f) => f.textContent?.includes("REM-OBL-FALTA")) as HTMLElement;
    expect(hecha).toHaveTextContent("1201");
    expect(hecha).toHaveTextContent("Ana");
    expect(hecha).toHaveTextContent("Ya la gestionaste");
    expect(within(hecha).queryByRole("link")).toBeNull();
    expect(falta).toHaveTextContent("1202");
    expect(falta).toHaveTextContent("Beto");
    expect(falta).toHaveTextContent("Falta gestionarla");
    expect(within(falta).getByRole("link", { name: "Ir a Entregas" })).toHaveAttribute("href", "/mis-asignaciones/reparto");
    expect(obligatorias).not.toHaveTextContent("REM-DESHECHA");

    // Las deshechas de la 477 siguen en su sección, sin las obligatorias, y DESPUÉS.
    const deshechas = within(panel).getByRole("region", { name: "Órdenes por volver a gestionar" });
    expect(within(deshechas).getAllByRole("listitem")).toHaveLength(1);
    expect(deshechas).toHaveTextContent("REM-DESHECHA");
    expect(deshechas).toHaveTextContent("Falta volver a gestionarla");
    expect(deshechas).not.toHaveTextContent("REM-OBL");
    expect(obligatorias.compareDocumentPosition(deshechas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sin obligatorias no pinta su sección (la 477 queda como hoy)", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido("rechazado"),
      correcciones: correccion([orden({ ordenId: "o3", numRemision: "REM-DESHECHA" })]),
    });
    expect(screen.queryByRole("region", { name: "Órdenes que pasaron a Novedad interna" })).toBeNull();
    expect(screen.getByRole("region", { name: "Órdenes por volver a gestionar" })).toHaveTextContent("REM-DESHECHA");
  });
});

describe("SLT-247 — el reenvío del rechazado (R1796, R1797)", () => {
  it("reenvío deshabilitado con el motivo mientras falte alguna", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido("rechazado"),
      correcciones: correccion([
        orden({ ordenId: "o1", obligatoria: true }),
        orden({ ordenId: "o2", obligatoria: true }),
        orden({ ordenId: "o3", obligatoria: true, regestionada: true }),
        // Una deshecha sin rehacer NO bloquea (477/R18: sale del cierre al enviarlo).
        orden({ ordenId: "o4" }),
      ]),
    });
    const boton = screen.getByRole("button", { name: BOTON_RECHAZADO });
    expect(boton).toBeDisabled();
    const motivo =
      "Te faltan 2 órdenes que pasaron a Novedad interna. Gestiónalas en Entregas y vuelve a enviar el cierre.";
    expect(boton).toHaveAttribute("title", motivo);
    expect(boton).toHaveAccessibleDescription(motivo);
  });

  it("en singular con una sola pendiente", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido("rechazado"),
      correcciones: correccion([orden({ ordenId: "o1", obligatoria: true })]),
    });
    expect(screen.getByRole("button", { name: BOTON_RECHAZADO })).toHaveAttribute(
      "title",
      "Te falta 1 orden que pasó a Novedad interna. Gestiónala en Entregas y vuelve a enviar el cierre.",
    );
  });

  it("todas gestionadas: el reenvío vuelve a estar disponible", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido("rechazado"),
      correcciones: correccion([orden({ ordenId: "o1", obligatoria: true, regestionada: true })]),
    });
    const boton = screen.getByRole("button", { name: BOTON_RECHAZADO });
    expect(boton).toBeEnabled();
    expect(boton).not.toHaveAttribute("title");
  });

  it("las obligatorias de OTRO cierre no bloquean el de la página", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido("rechazado"),
      correcciones: [
        { cierreId: "otro-rechazado", motivoRechazo: "x", gestiones: [], ordenesEnCorreccion: [orden({ ordenId: "o9", obligatoria: true })] },
      ],
    });
    expect(screen.getByRole("button", { name: BOTON_RECHAZADO })).toBeEnabled();
  });

  it("la confirmación cuenta solo las deshechas", async () => {
    const user = userEvent.setup();
    // Modo `error` (design §7): sin el detalle, el botón se ofrece aunque falten obligatorias (el
    // servidor responde con el motivo). Es el único camino a la confirmación con obligatorias SIN
    // gestionar: si se contaran, el texto diría 3.
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: { estado: "error", reenviableEstado: "rechazado" },
      correcciones: correccion([
        orden({ ordenId: "o1", obligatoria: true }),
        orden({ ordenId: "o2", obligatoria: true }),
        orden({ ordenId: "o3" }),
      ]),
    });
    await user.click(screen.getByRole("button", { name: BOTON_RECHAZADO }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent(
      "Hay 1 orden que deshiciste y no volviste a gestionar: saldrá del cierre al enviarlo.",
    );
  });
});

describe("SLT-247 — la sección «Novedad interna» sigue (R1798)", () => {
  it("rechazado y vencido siguen mostrando la sección Novedad interna", async () => {
    const user = userEvent.setup();
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido("rechazado", [barrida({ ordenId: "b1", numRemision: "REM-BARRIDA-R" })]),
      correcciones: correccion([]),
    });
    await user.click(screen.getByRole("tab", { name: /^Gestiones/ }));
    expect(screen.getByRole("region", { name: "Pasaron a Novedad interna" })).toHaveTextContent("REM-BARRIDA-R");
    cleanup();

    renderModule({
      bloqueo: bloqueoConVencido(),
      reenviable: leido("vencido", [barrida({ ordenId: "b2", numRemision: "REM-BARRIDA-V" })]),
    });
    const gestiones = screen.getByRole("tab", { name: /^Gestiones/ });
    if (gestiones.getAttribute("aria-selected") !== "true") await user.click(gestiones);
    expect(screen.getByRole("region", { name: "Pasaron a Novedad interna" })).toHaveTextContent("REM-BARRIDA-V");
  });
});

describe("SLT-247 — confirmación física solo de lo que sigue en Novedad interna (R1791)", () => {
  it("filasAConfirmar descarta fueraDeNovedadInterna", () => {
    const filas = filasAConfirmar(emptyGrupos(), [
      barrida({ ordenId: "viva" }),
      barrida({ ordenId: "de-vuelta-a-entregas", fueraDeNovedadInterna: true }),
    ]);
    expect(filas.map((f) => f.clave)).toEqual(["viva"]);
  });

  it("con todas en Novedad interna, la lista es la de siempre", () => {
    const filas = filasAConfirmar(emptyGrupos(), [barrida({ ordenId: "a" }), barrida({ ordenId: "b" })]);
    expect(filas.map((f) => [f.origen, f.clave])).toEqual([
      ["barrida", "a"],
      ["barrida", "b"],
    ]);
  });
});
