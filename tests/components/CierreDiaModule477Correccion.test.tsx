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

function renderModule(props: {
  correcciones?: CorreccionCierreDTO[];
  bloqueo?: BloqueoDetalle;
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
      />
    </SWRConfig>,
  );
}

/** El cierre rechazado de `bloqueoConRechazado()` se llama `c-viejo` en la fixture. */
const CIERRE = "c-viejo";

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

describe("477 — panel «Corregir el cierre rechazado» (R25/R26)", () => {
  it("sin correcciones no pinta ningún panel", () => {
    renderModule({ correcciones: [] });
    expect(screen.queryByRole("region", { name: REGION })).toBeNull();
  });

  it("R25: muestra el motivo del rechazo y cada gestión vigente con su «Devolver a gestión»", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [
        {
          cierreId: CIERRE,
          motivoRechazo: "Falta el efectivo de la REM-A",
          gestiones: [
            makeGestion({
              gestionId: "g1",
              resultado: "entregado",
              numRemision: "REM-A",
              destinatario: "Ana",
              montoRecibido: "15000.00",
              pagoMensajero: "1500.00",
            }),
            makeGestion({
              gestionId: "g2",
              resultado: "reprogramado",
              numRemision: "REM-B",
              destinatario: "Beto",
            }),
          ],
          ordenesEnCorreccion: [],
        },
      ],
    });

    const panel = screen.getByRole("region", { name: REGION });
    expect(panel).toHaveTextContent("Motivo del rechazo: Falta el efectivo de la REM-A");
    const lista = within(panel).getByRole("list", { name: "Gestiones del cierre" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(panel).getByRole("button", { name: "Devolver a gestión la orden REM-A · Ana" }),
    ).toBeEnabled();
    expect(
      within(panel).getByRole("button", { name: "Devolver a gestión la orden REM-B · Beto" }),
    ).toBeEnabled();
    // El aviso del corte nocturno (Pregunta abierta 1, por defecto) y sin la sigla prohibida.
    expect(panel).toHaveTextContent(
      "Envíalo hoy: si el corte de la noche llega antes, lo que corregiste pasa a un cierre nuevo.",
    );
    expect(panel.textContent ?? "").not.toMatch(/\bSLA\b/);
  });

  it("R25: «Devolver a gestión» usa el mismo modal y la misma action, con el id de la gestión", async () => {
    const user = userEvent.setup();
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [
        {
          cierreId: CIERRE,
          motivoRechazo: null,
          gestiones: [
            makeGestion({ gestionId: "g1", resultado: "entregado", numRemision: "REM-A", destinatario: "Ana" }),
          ],
          ordenesEnCorreccion: [],
        },
      ],
    });

    const panel = screen.getByRole("region", { name: REGION });
    // Sin motivo, el panel no deja un hueco: lo dice.
    expect(panel).toHaveTextContent("Motivo del rechazo: La bodega no indicó un motivo.");
    await user.click(
      within(panel).getByRole("button", { name: "Devolver a gestión la orden REM-A · Ana" }),
    );
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Devolver a gestión" }));

    expect(deshacerMock).toHaveBeenCalledTimes(1);
    expect(deshacerMock).toHaveBeenCalledWith({ gestionId: "g1" });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("R25: la gestión que registró la tienda sale deshabilitada y dice por qué", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [
        {
          cierreId: CIERRE,
          motivoRechazo: "x",
          gestiones: [
            makeGestion({
              gestionId: "g9",
              resultado: "entregado",
              numRemision: "REM-T",
              destinatario: "Tina",
              desdeAyudaTienda: true,
            }),
          ],
          ordenesEnCorreccion: [],
        },
      ],
    });

    const boton = within(screen.getByRole("region", { name: REGION })).getByRole("button", {
      name: /^Devolver a gestión la orden REM-T · Tina — no disponible: /,
    });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute(
      "title",
      "Esta orden la resolvió la tienda desde su pantalla de ayuda; solo ella puede corregirlo. Escribile por el chat de la orden.",
    );
  });

  it("R26: lista las órdenes en corrección con su estado y el enlace a Entregas", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [
        {
          cierreId: CIERRE,
          motivoRechazo: "x",
          gestiones: [],
          ordenesEnCorreccion: [
            orden({ ordenId: "o1", numRemision: "REM-HECHA", regestionada: true }),
            orden({ ordenId: "o2", numRemision: "REM-FALTA", regestionada: false }),
          ],
        },
      ],
    });

    const panel = screen.getByRole("region", { name: REGION });
    const lista = within(panel).getByRole("list", { name: "Órdenes por volver a gestionar" });
    const filas = within(lista).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    const hecha = filas.find((f) => f.textContent?.includes("REM-HECHA"));
    const falta = filas.find((f) => f.textContent?.includes("REM-FALTA"));
    expect(hecha).toHaveTextContent("Ya la volviste a gestionar");
    expect(hecha).not.toHaveTextContent("Falta volver a gestionarla");
    expect(falta).toHaveTextContent("Falta volver a gestionarla");
    expect(within(panel).getByRole("link", { name: "Ir a Entregas" })).toHaveAttribute(
      "href",
      "/mis-asignaciones/reparto",
    );
  });

  it("R25: un panel por cada cierre rechazado", () => {
    renderModule({
      bloqueo: bloqueoConRechazado(),
      correcciones: [
        { cierreId: "c1", motivoRechazo: "uno", gestiones: [], ordenesEnCorreccion: [] },
        { cierreId: "c2", motivoRechazo: "dos", gestiones: [], ordenesEnCorreccion: [] },
      ],
    });
    expect(screen.getByRole("region", { name: `${REGION} (1 de 2)` })).toHaveTextContent(
      "Motivo del rechazo: uno",
    );
    expect(screen.getByRole("region", { name: `${REGION} (2 de 2)` })).toHaveTextContent(
      "Motivo del rechazo: dos",
    );
  });
});

describe("477 — confirmación de re-solicitud del rechazado (R28)", () => {
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
