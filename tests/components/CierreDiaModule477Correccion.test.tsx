// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import {
  deshacerGestion,
  listarCierresPasadosPaginado,
  solicitarCierre,
} from "@/lib/actions/cierre-dia";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreResultado,
  CorreccionCierreDTO,
  OrdenEnCorreccionDTO,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { bloqueoConRechazado } from "@/tests/fixtures/bloqueo-cierre";
import type { CierreReenviable } from "@/components/private/cierres/detalle/detalle-cierre-vista";

// FICHA 477 (T5.4) — R25, R26 y R28 en la pantalla «Cierre del día». Los literales de las
// aserciones están ESCRITOS aquí a propósito y no importados del módulo: comparar un texto contra
// la constante que lo genera siempre está verde (memoria «aserción contra su propia fuente»).

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
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

const deshacerMock = vi.mocked(deshacerGestion);
const solicitarMock = vi.mocked(solicitarCierre);

const REGION = "Corregir el cierre rechazado";

function makeGestion(
  over: Partial<CierreDetalleGestion> & { gestionId: string; resultado: CierreResultado },
): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-10-14",
    numGuia: 1001,
    numRemision: "REM-001",
    destinatario: "Ana Pérez",
    direccion: "Calle 1",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja",
    tiendaNombre: "Tienda X",
    montoRecibido: null,
    metodoPago: null,
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  };
}

function orden(
  over: Partial<OrdenEnCorreccionDTO> & { ordenId: string },
): OrdenEnCorreccionDTO {
  return {
    numGuia: 2002,
    numRemision: `REM-${over.ordenId}`,
    destinatario: "Beto Ruiz",
    regestionada: false,
    ...over,
  };
}

function emptyGrupos(): CierreGrupos {
  return {
    entregado: [],
    reprogramado: [],
    novedad: [],
    devolucion_a_origen_por_rechazo: [],
    incidente: [],
  };
}

/** El cierre rechazado de `bloqueoConRechazado()` se llama `c-viejo` en la fixture. */
const CIERRE = "c-viejo";

/**
 * SLT-109 (R240): la lectura `ok` del rechazado por reenviar que haría `page.tsx` con
 * `verCierrePasado`: sus gestiones vigentes, su motivo y sus importes congelados.
 */
function leido(p: { motivo?: string | null; grupos?: CierreGrupos } = {}): CierreReenviable {
  return {
    estado: "ok",
    cierre: {
      cierreId: CIERRE,
      estado: "rechazado",
      destinoTipo: "bodega_satelite",
      destinoZonaId: "z1",
      totales: { efectivo: "15000.00", simpe: "0.00", transferencia: "0.00", general: "15000.00" },
      totalPagoMensajero: "1500.00",
      totalIngresoBodegaRechazos: "0.00",
      solicitadoAt: "2026-10-14T23:00:00.000Z",
      resueltoAt: "2026-10-15T14:00:00.000Z",
      motivoRechazo: p.motivo ?? null,
    },
    grupos: p.grupos ?? emptyGrupos(),
    ordenesSinGestion: [],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
  };
}

function renderModule(props: {
  correcciones?: CorreccionCierreDTO[];
  bloqueo?: BloqueoDetalle;
  reenviable?: CierreReenviable;
}) {
  const pagina = paginaInicial([]);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...pagina,
  });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={emptyGrupos()}
        totales={{ efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" }}
        totalPagoMensajero="0.00"
        puedesSolicitar={false}
        motivoBloqueo={null}
        cierresPasados={pagina}
        bloqueo={props.bloqueo ?? SIN_BLOQUEO}
        correcciones={props.correcciones}
        reenviable={props.reenviable ?? (props.bloqueo?.aReenviarPrimero ? leido() : undefined)}
      />
    </SWRConfig>,
  );
}

/** El detalle de la página (SLT-109: «Tu cierre del día» en marco página). */
function detalle(): HTMLElement {
  return screen.getByRole("region", { name: "Detalle del cierre · Tu cierre del día" });
}

beforeEach(() => {
  vi.clearAllMocks();
  deshacerMock.mockResolvedValue({ status: "ok", ordenId: "o-g1" });
  solicitarMock.mockResolvedValue({
    status: "ok",
    via: "resolicitado",
    cierreId: CIERRE,
  } as unknown as Awaited<ReturnType<typeof solicitarCierre>>);
});

afterEach(() => {
  cleanup();
});

// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R62, R247, R248): el
// panel suelto «Corregir el cierre rechazado» de la 477 pasa a ser el detalle único del rechazado en
// marco página. El motivo va en la franja; la explicación y las órdenes en corrección, en la pestaña
// «Corregir»; el «Devolver a gestión», en la fila de «Gestiones» (canvas). Las gestiones del cierre
// salen de su lectura (`verCierrePasado`), no de `correcciones`.
describe("477 → SLT-109 — el rechazado como página, con «Corregir» (R62, R247, R248)", () => {
  it("sin nada que reenviar no hay «Corregir» ni la región vieja", () => {
    renderModule({ correcciones: [] });
    expect(screen.queryByRole("region", { name: REGION })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Corregir" })).toBeNull();
  });

  it("R247: la franja dice el motivo entre comillas y el detalle abre en «Corregir», con sus tres pestañas", () => {
    const grupos = emptyGrupos();
    grupos.entregado = [makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-A", destinatario: "Ana" })];
    grupos.reprogramado = [makeGestion({ gestionId: "g2", resultado: "reprogramado", numRemision: "REM-B", destinatario: "Beto" })];
    renderModule({
      bloqueo: bloqueoConRechazado(),
      reenviable: leido({ motivo: "Falta el efectivo de la REM-A", grupos }),
      correcciones: [{ cierreId: CIERRE, motivoRechazo: "Falta el efectivo de la REM-A", gestiones: [], ordenesEnCorreccion: [] }],
    });

    expect(screen.queryByRole("region", { name: REGION })).toBeNull();
    const franja = within(detalle()).getByText("Motivo del rechazo:").closest('[role="status"]');
    expect(franja).toHaveTextContent("«Falta el efectivo de la REM-A»");
    expect(within(detalle()).getByText("Rechazado")).toBeInTheDocument();
    expect(within(detalle()).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Corregir",
      "Gestiones (2)",
      "Rechazados por la tienda (0)",
    ]);
    expect(screen.getByRole("tab", { name: "Corregir" })).toHaveAttribute("aria-selected", "true");
    // Importes congelados de ESE cierre (15.000 / 1.500), no los de hoy (0).
    expect(within(screen.getByRole("group", { name: "Recaudado" })).getAllByText("₡15.000").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("group", { name: "Tu ganancia" })).getByText("₡1.500")).toBeInTheDocument();
  });

  it("R248: «Corregir» explica cómo y avisa del corte, sin la sigla prohibida", () => {
    renderModule({ bloqueo: bloqueoConRechazado(), correcciones: [] });

    const panel = screen.getByRole("tabpanel", { name: "Corregir" });
    expect(within(panel).getByRole("region", { name: "Cómo corregir" })).toHaveTextContent(
      "Si una gestión quedó mal, devuélvela a gestión: sale de este cierre, sus totales se recalculan y la orden vuelve a Entregas para que la gestiones de nuevo. Cuando termines, vuelve a enviar el cierre a aprobación.",
    );
    expect(panel).toHaveTextContent(
      "Envíalo hoy: si el corte de la noche llega antes, lo que corregiste pasa a un cierre nuevo.",
    );
    expect(panel.textContent ?? "").not.toMatch(/\bSLA\b/);
  });

  it("R247: sin motivo, la franja no deja un hueco: lo dice", () => {
    renderModule({ bloqueo: bloqueoConRechazado(), reenviable: leido({ motivo: null }) });
    const franja = within(detalle()).getByText("Motivo del rechazo:").closest('[role="status"]');
    expect(franja).toHaveTextContent("La bodega no indicó un motivo.");
  });

  it("R243, R247: «Devolver a gestión» va en la fila de «Gestiones» y usa el mismo modal y la misma action", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-A", destinatario: "Ana" })];
    renderModule({ bloqueo: bloqueoConRechazado(), reenviable: leido({ grupos }) });

    await user.click(screen.getByRole("tab", { name: "Gestiones (1)" }));
    await user.click(screen.getByRole("button", { name: "Devolver a gestión la orden REM-A · Ana" }));
    const dialogo = await screen.findByRole("dialog", { name: "Devolver la orden a gestión" });
    await user.click(within(dialogo).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(deshacerMock).toHaveBeenCalledWith({ gestionId: "g1" }));
    expect(deshacerMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(successMock).toHaveBeenCalledWith("Gestión deshecha; la orden volvió a tu lista para gestionar."));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("R244: la gestión que registró la tienda sale deshabilitada y dice por qué", async () => {
    const user = userEvent.setup();
    const grupos = emptyGrupos();
    grupos.entregado = [
      makeGestion({ gestionId: "g9", resultado: "entregado", numRemision: "REM-T", destinatario: "Tina", desdeAyudaTienda: true }),
    ];
    renderModule({ bloqueo: bloqueoConRechazado(), reenviable: leido({ grupos }) });

    await user.click(screen.getByRole("tab", { name: "Gestiones (1)" }));
    const boton = screen.getByRole("button", { name: /^Devolver a gestión la orden REM-T · Tina — no disponible: / });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute(
      "title",
      "Esta orden la resolvió la tienda desde su pantalla de ayuda; solo ella puede corregirlo. Escríbele por el chat de la orden.",
    );
  });

  it("R248: lista las órdenes en corrección con su estado, y «Ir a Entregas» solo en la que falta", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [
        {
          cierreId: CIERRE,
          motivoRechazo: "x",
          gestiones: [],
          ordenesEnCorreccion: [
            orden({ ordenId: "o1", numRemision: "REM-HECHA", destinatario: "Ana", regestionada: true }),
            orden({ ordenId: "o2", numRemision: "REM-FALTA", destinatario: "Beto", regestionada: false }),
          ],
        },
      ],
    });

    const seccion = screen.getByRole("region", { name: "Órdenes por volver a gestionar" });
    const filas = within(seccion).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    const hecha = filas.find((f) => f.textContent?.includes("REM-HECHA")) as HTMLElement;
    const falta = filas.find((f) => f.textContent?.includes("REM-FALTA")) as HTMLElement;
    expect(hecha).toHaveTextContent("Ya la volviste a gestionar");
    expect(hecha).toHaveTextContent("Ana");
    expect(hecha).not.toHaveTextContent("Falta volver a gestionarla");
    expect(within(hecha).queryByRole("link")).toBeNull();
    expect(falta).toHaveTextContent("Falta volver a gestionarla");
    expect(falta).toHaveTextContent("Beto");
    expect(within(falta).getByRole("link", { name: "Ir a Entregas" })).toHaveAttribute("href", "/mis-asignaciones/reparto");
  });

  it("R248: sin órdenes en corrección, esa sección no se pinta", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [{ cierreId: CIERRE, motivoRechazo: "x", gestiones: [], ordenesEnCorreccion: [] }],
    });
    expect(screen.getByRole("region", { name: "Cómo corregir" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Órdenes por volver a gestionar" })).toBeNull();
  });

  it("R240 (PA1): «Corregir» es la del cierre que se pinta; las órdenes de otro rechazado no salen", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [
        { cierreId: "otro-rechazado", motivoRechazo: "dos", gestiones: [], ordenesEnCorreccion: [orden({ ordenId: "o9", numRemision: "REM-OTRO" })] },
        { cierreId: CIERRE, motivoRechazo: "uno", gestiones: [], ordenesEnCorreccion: [orden({ ordenId: "o1", numRemision: "REM-ESTE" })] },
      ],
    });
    const seccion = screen.getByRole("region", { name: "Órdenes por volver a gestionar" });
    expect(seccion).toHaveTextContent("REM-ESTE");
    expect(seccion).not.toHaveTextContent("REM-OTRO");
  });
});

describe("477 — confirmación de re-solicitud del rechazado (R28; SLT-109 R250: desde el pie del detalle)", () => {
  async function abrirConfirmacion(correcciones: CorreccionCierreDTO[]) {
    const user = userEvent.setup();
    renderModule({ bloqueo: bloqueoConRechazado(), correcciones });
    await user.click(
      screen.getByRole("button", { name: "Solicitar aprobación del cierre rechazado" }),
    );
    return screen.findByRole("dialog");
  }

  it("no afirma que los montos no se recalculan", async () => {
    const dialogo = await abrirConfirmacion([]);
    expect(dialogo).toHaveTextContent(
      "Se enviará de nuevo tu cierre rechazado a tu bodega para aprobación, con los totales de las gestiones que tenga al enviarlo.",
    );
    expect(dialogo.textContent ?? "").not.toMatch(/no se recalculan/i);
    expect(dialogo.textContent ?? "").not.toMatch(/saldr/);
  });

  it("con órdenes sin volver a gestionar, dice cuántas y que saldrán del cierre", async () => {
    const dialogo = await abrirConfirmacion([
      {
        cierreId: CIERRE,
        motivoRechazo: "x",
        gestiones: [],
        ordenesEnCorreccion: [
          orden({ ordenId: "o1", regestionada: false }),
          orden({ ordenId: "o2", regestionada: false }),
          orden({ ordenId: "o3", regestionada: true }),
        ],
      },
    ]);
    expect(dialogo).toHaveTextContent(
      "Hay 2 órdenes que deshiciste y no volviste a gestionar: saldrán del cierre al enviarlo.",
    );
    expect(dialogo.textContent ?? "").not.toMatch(/no se recalculan/i);
  });

  it("en singular con una sola", async () => {
    const dialogo = await abrirConfirmacion([
      {
        cierreId: CIERRE,
        motivoRechazo: "x",
        gestiones: [],
        ordenesEnCorreccion: [orden({ ordenId: "o1", regestionada: false })],
      },
    ]);
    expect(dialogo).toHaveTextContent(
      "Hay 1 orden que deshiciste y no volviste a gestionar: saldrá del cierre al enviarlo.",
    );
  });

  it("todas rehechas: no anuncia ninguna salida", async () => {
    const dialogo = await abrirConfirmacion([
      {
        cierreId: CIERRE,
        motivoRechazo: "x",
        gestiones: [],
        ordenesEnCorreccion: [orden({ ordenId: "o1", regestionada: true })],
      },
    ]);
    expect(dialogo.textContent ?? "").not.toMatch(/saldr/);
  });

  it("solo cuenta las del cierre que el botón reenvía, no las de otro rechazado", async () => {
    const dialogo = await abrirConfirmacion([
      {
        cierreId: "otro-rechazado",
        motivoRechazo: "x",
        gestiones: [],
        ordenesEnCorreccion: [orden({ ordenId: "o9", regestionada: false })],
      },
    ]);
    expect(dialogo.textContent ?? "").not.toMatch(/saldr/);
  });
});
