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
  verCierrePasado,
} from "@/lib/actions/cierre-dia";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { bloqueoConRechazado, bloqueoConVencido, bloqueoPorAcumular } from "@/tests/fixtures/bloqueo-cierre";
import { SIN_BLOQUEO, type BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import type { CierreReenviable } from "@/components/private/cierres/detalle/detalle-cierre-vista";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierrePasadoDTO,
  CierreResultado,
  CierreTotales,
  CorreccionCierreDTO,
} from "@/lib/interfaces/services/ICierreDiaService";

// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (T3.2) — la parte de arriba
// de `/cierre-dia` es UN detalle único en marco página: el cierre de hoy en curso o, con un cierre por
// reenviar, ése en modo rechazado o vencido (R240). Un caso por requisito de R240 a R253 y R255.
//
// Los literales van escritos a mano: comparar un texto contra la constante que lo genera siempre
// está verde (memoria «aserción contra su propia fuente»).

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

const solicitarMock = vi.mocked(solicitarCierre);
const deshacerMock = vi.mocked(deshacerGestion);
const verMock = vi.mocked(verCierrePasado);

const DETALLE = "Detalle del cierre · Tu cierre del día";

function makeGestion(
  over: Partial<CierreDetalleGestion> & { gestionId: string; resultado: CierreResultado },
): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-11-12",
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
    evidenciaUrl: null,
    evidenciaUrls: [],
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

function vacios(): CierreGrupos {
  return { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
}

/** El día de hoy: dos entregas (8.000 en efectivo y 3.000 por SINPE) y un incidente. */
function gruposDeHoy(): CierreGrupos {
  return {
    ...vacios(),
    entregado: [
      makeGestion({ gestionId: "h1", resultado: "entregado", numRemision: "REM-H1", destinatario: "Ana", montoRecibido: "8000.00", pagoMensajero: "1700.00" }),
      makeGestion({ gestionId: "h2", resultado: "entregado", numRemision: "REM-H2", destinatario: "Beto", montoRecibido: "3000.00", pagoMensajero: "1700.00" }),
    ],
    incidente: [makeGestion({ gestionId: "h3", resultado: "incidente", numRemision: "REM-H3", destinatario: "Ciro", pagoMensajero: "0.00" })],
  };
}

const TOTALES_HOY: CierreTotales = { efectivo: "8000.00", simpe: "3000.00", transferencia: "0.00", general: "11000.00" };

/** Un cierre pasado del mensajero, de los que dan la cola y `verCierrePasado`. */
function pasado(over: Partial<CierrePasadoDTO> & { cierreId: string }): CierrePasadoDTO {
  return {
    estado: "aprobado",
    destinoTipo: "bodega_satelite",
    destinoZonaId: "z1",
    totales: { efectivo: "5000.00", simpe: "0.00", transferencia: "0.00", general: "5000.00" },
    totalPagoMensajero: "1700.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-11-10T23:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    ...over,
  };
}

/** La lectura `ok` que haría `page.tsx` del cierre por reenviar de ese bloqueo. */
function leidoDe(bloqueo: BloqueoDetalle, over: Partial<CierrePasadoDTO> = {}, grupos: CierreGrupos = vacios()): CierreReenviable {
  const r = bloqueo.aReenviarPrimero!;
  return {
    estado: "ok",
    cierre: pasado({ cierreId: r.cierreId, estado: r.estado, ...over }),
    grupos,
    ordenesSinGestion: [],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
  };
}

function montar(p: {
  grupos?: CierreGrupos;
  puedesSolicitar?: boolean;
  motivoBloqueo?: string | null;
  bloqueo?: BloqueoDetalle;
  reenviable?: CierreReenviable;
  correcciones?: CorreccionCierreDTO[];
  cierresPasados?: CierrePasadoDTO[];
} = {}) {
  const pagina = paginaInicial(p.cierresPasados ?? []);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "ok", page: 1, ...pagina });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={p.grupos ?? gruposDeHoy()}
        totales={TOTALES_HOY}
        totalPagoMensajero="3400.00"
        puedesSolicitar={p.puedesSolicitar ?? true}
        motivoBloqueo={p.motivoBloqueo ?? null}
        cierresPasados={pagina}
        bloqueo={p.bloqueo ?? SIN_BLOQUEO}
        correcciones={p.correcciones}
        reenviable={p.reenviable}
      />
    </SWRConfig>,
  );
  return userEvent.setup();
}

function detalle(): HTMLElement {
  return screen.getByRole("region", { name: DETALLE });
}

function cifra(rotulo: string): HTMLElement {
  return within(detalle()).getByRole("group", { name: rotulo });
}

/** El texto del valor de una cifra (sin los métodos ni el contexto). */
function valorDe(rotulo: string): string {
  return cifra(rotulo).querySelector("[data-cifra]")?.textContent ?? "";
}

function cabecera(): string {
  return within(detalle()).getByRole("heading", { level: 2 }).closest("header")?.textContent ?? "";
}

/**
 * SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (R452, R453, R455): los
 * pares [rótulo, valor] de la cabecera de un detalle, en orden.
 */
function paresDe(raiz: HTMLElement): [string, string][] {
  const header = raiz.querySelector("header") as HTMLElement;
  const terminos = within(header).queryAllByRole("term");
  const definiciones = within(header).queryAllByRole("definition");
  expect(definiciones).toHaveLength(terminos.length);
  return terminos.map((t, i) => [t.textContent ?? "", definiciones[i]!.textContent ?? ""]);
}

beforeEach(() => {
  vi.clearAllMocks();
  solicitarMock.mockResolvedValue({ status: "ok", via: "creado" } as unknown as Awaited<ReturnType<typeof solicitarCierre>>);
  deshacerMock.mockResolvedValue({ status: "ok", ordenId: "o-h1" });
});

afterEach(() => {
  cleanup();
});

describe("R240 — qué cierre pinta la página", () => {
  it("sin nada que reenviar: UN detalle en página, el de hoy, en curso", () => {
    montar();
    expect(screen.getAllByRole("region", { name: DETALLE })).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(detalle()).getByText("Sin solicitar")).toBeInTheDocument();
    expect(within(detalle()).getByRole("button", { name: "Solicitar cierre" })).toBeInTheDocument();
  });

  it("con un vencido por reenviar: pinta ESE, en modo vencido, y NO el de hoy", () => {
    const bloqueo = bloqueoConVencido("2026-11-10");
    montar({ bloqueo, reenviable: leidoDe(bloqueo) });
    expect(screen.getAllByRole("region", { name: DETALLE })).toHaveLength(1);
    expect(within(detalle()).getByText("Vencido")).toBeInTheDocument();
    expect(within(detalle()).queryByText("Sin solicitar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar cierre" })).toBeNull();
    // Las cifras son las de ESE cierre (5.000), no las de hoy (11.000).
    expect(valorDe("Recaudado")).toBe("₡5.000");
  });

  it("con un rechazado por reenviar: pinta ESE, en modo rechazado", () => {
    const bloqueo = bloqueoConRechazado();
    montar({ bloqueo, reenviable: leidoDe(bloqueo, { motivoRechazo: "Faltan 2 paquetes" }) });
    expect(within(detalle()).getByText("Rechazado")).toBeInTheDocument();
    expect(within(detalle()).getByRole("button", { name: "Solicitar aprobación del cierre rechazado" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Solicitar cierre" })).toBeNull();
  });
});

describe("R61, R241, R242 — el cierre de hoy", () => {
  it("R241, SLT-153 R453: cabecera «Tu cierre del día», «Sin solicitar», «Folio» → «Solicitud nueva» y «Día» → «Hoy», sin destino", () => {
    montar();
    const texto = cabecera();
    expect(texto).toContain("Tu cierre del día");
    expect(texto).toContain("Sin solicitar");
    expect(paresDe(detalle())).toEqual([
      ["Folio", "Solicitud nueva"],
      ["Día", "Hoy"],
    ]);
    expect(texto).not.toContain("Solicitud nueva · Hoy · sin solicitar");
    expect(texto).not.toContain("Destino");
  });

  it("R241: tres cifras — Recaudado 11.000 con sus métodos, 3 gestiones y Tu ganancia 3.400 — y nada de la empresa", () => {
    montar();
    expect(within(within(detalle()).getByRole("group", { name: "Cifras del cierre" })).getAllByRole("group").map((g) => g.firstElementChild?.textContent)).toEqual([
      "Recaudado",
      "Gestiones",
      "Tu ganancia",
    ]);
    expect(valorDe("Recaudado")).toBe("₡11.000");
    expect(within(cifra("Recaudado")).getByText("₡8.000")).toBeInTheDocument();
    expect(within(cifra("Recaudado")).getByText("₡3.000")).toBeInTheDocument();
    // Transferencia vale 0: no se pinta (R7).
    expect(within(cifra("Recaudado")).queryByText("Transferencia")).toBeNull();
    expect(valorDe("Gestiones")).toBe("3");
    expect(valorDe("Tu ganancia")).toBe("₡3.400");
    expect(within(detalle()).queryByText(/Le queda a/)).toBeNull();
    expect(within(detalle()).queryByRole("tab", { name: "Dinero" })).toBeNull();
  });

  it("R242: pestañas «Gestiones (3)» y «Rechazados por la tienda (0)», abre en «Gestiones» con la lista y la «Ganancia»", async () => {
    const user = montar();
    expect(within(detalle()).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Gestiones (3)",
      "Rechazados por la tienda (0)",
    ]);
    expect(screen.getByRole("tab", { name: "Gestiones (3)" })).toHaveAttribute("aria-selected", "true");
    const lista = screen.getByRole("region", { name: "Órdenes del cierre" });
    expect(lista.querySelectorAll("[data-gestion]")).toHaveLength(3);
    expect(within(lista).getByText("Ganancia")).toBeInTheDocument();
    expect(screen.getByText("Entregado 2")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Rechazados por la tienda (0)" }));
    expect(screen.getByText("Este cierre no tiene paquetes rechazados por la tienda.")).toBeInTheDocument();
  });

  it("R61, R243: «Devolver a gestión» en cada fila, y su `ok` avisa y relee la página", async () => {
    const user = montar();
    await user.click(screen.getByRole("button", { name: "Devolver a gestión la orden REM-H1 · Ana" }));
    const dialogo = await screen.findByRole("dialog", { name: "Devolver la orden a gestión" });
    expect(dialogo).toHaveTextContent("Orden REM-H1 · Ana.");
    await user.click(within(dialogo).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(deshacerMock).toHaveBeenCalledWith({ gestionId: "h1" }));
    await vi.waitFor(() =>
      expect(successMock).toHaveBeenCalledWith("Gestión deshecha; la orden volvió a tu lista para gestionar."),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("R243: si falla, avisa con el motivo del servidor y no toca la lista ni las cifras", async () => {
    deshacerMock.mockResolvedValue({ status: "conflict", motivo: "Esta gestión ya está en un cierre solicitado." });
    const user = montar();
    await user.click(screen.getByRole("button", { name: "Devolver a gestión la orden REM-H2 · Beto" }));
    const dialogo = await screen.findByRole("dialog", { name: "Devolver la orden a gestión" });
    await user.click(within(dialogo).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(errorMock).toHaveBeenCalledWith("Esta gestión ya está en un cierre solicitado."));
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Órdenes del cierre" }).querySelectorAll("[data-gestion]")).toHaveLength(3);
    expect(valorDe("Recaudado")).toBe("₡11.000");
    expect(screen.getByRole("button", { name: "Devolver a gestión la orden REM-H2 · Beto" })).toBeEnabled();
  });
});

describe("R245 — «Solicitar cierre» en el pie", () => {
  it("con la línea de contexto, y su confirmación resume Gestiones / Recaudado / Tu ganancia y llama a `solicitarCierre`", async () => {
    const user = montar();
    expect(within(detalle()).getByText("Se agrupan todas tus gestiones pendientes. No se puede deshacer.")).toBeInTheDocument();
    await user.click(within(detalle()).getByRole("button", { name: "Solicitar cierre" }));
    const dialogo = await screen.findByRole("dialog", { name: "Solicitar cierre del día" });
    const resumen = dialogo.querySelector('dl[aria-label="Resumen del cierre a solicitar"]');
    expect(Array.from(resumen?.children ?? []).map((el) => el.textContent?.trim())).toEqual([
      "Gestiones",
      "3",
      "Recaudado",
      "₡11.000",
      "Tu ganancia",
      "₡3.400",
    ]);
    await user.click(within(dialogo).getByRole("button", { name: "Solicitar cierre" }));
    await vi.waitFor(() => expect(solicitarMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(successMock).toHaveBeenCalledWith("Cierre solicitado correctamente."));
  });

  it("sin poder solicitar: deshabilitado con el motivo como descripción, y la franja «Antes de cerrar:»", async () => {
    const motivo = "Tienes 2 paquetes en reparto sin gestionar.";
    const user = montar({ puedesSolicitar: false, motivoBloqueo: motivo });
    const boton = within(detalle()).getByRole("button", { name: "Solicitar cierre" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription(motivo);
    expect(within(detalle()).getByText("Antes de cerrar:").closest('[role="status"]')).toHaveTextContent(motivo);
    await user.click(boton);
    expect(screen.queryByRole("dialog", { name: "Solicitar cierre del día" })).toBeNull();
  });
});

describe("R246 — el bloqueo vive en la franja del detalle", () => {
  it("bloqueado sin nada que reenviar: «Tu cierre está bloqueado:» dentro del detalle, y ningún aviso fuera", () => {
    montar({ bloqueo: bloqueoPorAcumular("2026-11-10") });
    const franja = within(detalle()).getByText("Tu cierre está bloqueado:").closest('[role="status"]');
    expect(franja).toHaveTextContent("Tienes 2 cierres esperando aprobación.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("también en un rechazado, detrás del motivo", () => {
    const bloqueo = bloqueoConRechazado();
    montar({ bloqueo, reenviable: leidoDe(bloqueo, { motivoRechazo: "Faltan 2 paquetes" }) });
    const titulos = Array.from(detalle().querySelectorAll('[role="status"] strong')).map((s) => s.textContent);
    expect(titulos).toEqual(["Motivo del rechazo:", "Tu cierre está bloqueado:"]);
  });
});

describe("R247, R250 — el rechazado como página", () => {
  it("R247: «Rechazado», destino, folio, fechas de solicitud y rechazo, motivo entre comillas y abre en «Corregir»", () => {
    const bloqueo = bloqueoConRechazado();
    montar({
      bloqueo,
      reenviable: leidoDe(bloqueo, {
        motivoRechazo: "Faltan 2 paquetes",
        solicitadoAt: "2026-11-10T23:00:00.000Z",
        resueltoAt: "2026-11-11T15:30:00.000Z",
      }),
    });
    expect(cabecera()).toContain("Rechazado");
    // SLT-153 (R452): el DTO no trae zona ni quién lo rechazó: esos pares no se pintan.
    const pares = paresDe(detalle());
    expect(pares).toEqual([
      // El id del doble de `bloqueoConRechazado` es «c-viejo»: su folio son sus 8 últimos, en mayúsculas.
      ["Folio", "#C-VIEJO"],
      ["Destino", "Bodega satélite"],
      ["Solicitado", "2026-11-10 17:00"],
      ["Rechazado", "2026-11-11 09:30"],
    ]);
    expect(within(detalle()).getByText("Motivo del rechazo:").closest('[role="status"]')).toHaveTextContent("«Faltan 2 paquetes»");
    expect(screen.getByRole("tab", { name: "Corregir" })).toHaveAttribute("aria-selected", "true");
  });

  it("R250: el pie abre la confirmación de hoy y, con `ok`, avisa y relee", async () => {
    solicitarMock.mockResolvedValue({ status: "ok", via: "resolicitado" } as unknown as Awaited<ReturnType<typeof solicitarCierre>>);
    const bloqueo = bloqueoConRechazado();
    const user = montar({ bloqueo, reenviable: leidoDe(bloqueo) });
    await user.click(within(detalle()).getByRole("button", { name: "Solicitar aprobación del cierre rechazado" }));
    const dialogo = await screen.findByRole("dialog", { name: "Solicitar aprobación del cierre rechazado" });
    await user.click(within(dialogo).getByRole("button", { name: "Solicitar aprobación" }));
    await vi.waitFor(() => expect(successMock).toHaveBeenCalledWith("Cierre rechazado enviado a aprobación."));
    expect(refreshMock).toHaveBeenCalled();
  });
});

describe("R63, R249, R251 — el vencido como página", () => {
  it("R249, SLT-153 R452: «Vencido», «Del día» en lugar de «Solicitado», franja de bloqueo y SIN «Devolver a gestión»", () => {
    const bloqueo = bloqueoConVencido("2026-11-10");
    const grupos = { ...vacios(), entregado: [makeGestion({ gestionId: "v1", resultado: "entregado", numRemision: "REM-V1", destinatario: "Vera" })] };
    montar({ bloqueo, reenviable: leidoDe(bloqueo, {}, grupos) });
    const texto = cabecera();
    expect(texto).toContain("Vencido");
    const pares = paresDe(detalle());
    expect(pares.map(([r]) => r)).toEqual(["Folio", "Destino", "Del día"]);
    expect(pares[2]).toEqual(["Del día", "2026-11-10 17:00"]);
    expect(within(detalle()).getByText("Tu cierre está bloqueado:")).toBeInTheDocument();
    expect(within(detalle()).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Gestiones (1)",
      "Rechazados por la tienda (0)",
    ]);
    expect(screen.getByRole("region", { name: "Órdenes del cierre" }).querySelector('[data-gestion="v1"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Devolver a gestión/ })).toBeNull();
  });

  it("R251: el pie abre «Se enviará tu cierre vencido…» y, con `ok`, avisa «Cierre vencido enviado a aprobación.»", async () => {
    solicitarMock.mockResolvedValue({ status: "ok", via: "resolicitado" } as unknown as Awaited<ReturnType<typeof solicitarCierre>>);
    const bloqueo = bloqueoConVencido("2026-11-10");
    const user = montar({ bloqueo, reenviable: leidoDe(bloqueo) });
    await user.click(within(detalle()).getByRole("button", { name: "Solicitar aprobación del cierre vencido" }));
    const dialogo = await screen.findByRole("dialog", { name: "Solicitar aprobación del cierre vencido" });
    expect(dialogo).toHaveTextContent(
      "Se enviará tu cierre vencido a tu bodega para aprobación. No se recalculan los montos ya registrados.",
    );
    await user.click(within(dialogo).getByRole("button", { name: "Solicitar aprobación" }));
    await vi.waitFor(() => expect(solicitarMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(successMock).toHaveBeenCalledWith("Cierre vencido enviado a aprobación."));
    expect(refreshMock).toHaveBeenCalled();
  });
});

describe("SLT-153 (R452) — un cierre pasado aprobado, abierto desde la cola", () => {
  const APROBADO = "dddddddd-0000-4000-8000-00000000a7b3";
  const aprobado = pasado({
    cierreId: APROBADO,
    estado: "aprobado",
    solicitadoAt: "2026-11-09T23:00:00.000Z",
    resueltoAt: "2026-11-10T15:30:00.000Z",
  });

  it("Folio, Destino, Solicitado y Aprobado; sin «Zona» ni «Aprobado por» (el DTO no los trae)", async () => {
    verMock.mockResolvedValue({
      status: "ok" as const,
      cierre: aprobado,
      grupos: vacios(),
      ordenesSinGestion: [],
      sinGestionRegistrado: true,
      rechazosDeTienda: [],
    });
    const user = montar({ cierresPasados: [aprobado] });
    await user.click(await screen.findByRole("button", { name: "Ver del cierre del 2026-11-09" }));
    const dialogo = await screen.findByRole("dialog", { name: DETALLE });
    expect(paresDe(dialogo)).toEqual([
      ["Folio", "#0000A7B3"],
      ["Destino", "Bodega satélite"],
      ["Solicitado", "2026-11-09 17:00"],
      ["Aprobado", "2026-11-10 09:30"],
    ]);
    const header = dialogo.querySelector("header") as HTMLElement;
    expect(within(header).queryByText("Zona")).toBeNull();
    expect(within(header).queryByText("Aprobado por")).toBeNull();
  });
});

describe("R252 — un rechazado de la cola se abre en modal, sin envío", () => {
  const OTRO = "dddddddd-0000-4000-8000-0000000000f2";
  const otroRechazado = pasado({ cierreId: OTRO, estado: "rechazado", motivoRechazo: "Falta un sobre", solicitadoAt: "2026-11-09T23:00:00.000Z" });
  const lectura = (grupos: CierreGrupos) => ({
    status: "ok" as const,
    cierre: otroRechazado,
    grupos,
    ordenesSinGestion: [],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
  });

  it("modo rechazado: «Corregir» con SUS órdenes, «Devolver a gestión» y en el pie solo «Cerrar»", async () => {
    const grupos = { ...vacios(), entregado: [makeGestion({ gestionId: "r1", resultado: "entregado", numRemision: "REM-R1", destinatario: "Rita" })] };
    verMock.mockResolvedValue(lectura(grupos));
    const user = montar({
      cierresPasados: [otroRechazado],
      correcciones: [
        {
          cierreId: OTRO,
          motivoRechazo: "Falta un sobre",
          gestiones: [],
          ordenesEnCorreccion: [{ ordenId: "o9", numGuia: 9, numRemision: "REM-CORR", destinatario: "Raúl", regestionada: false }],
        },
      ],
    });

    await user.click(await screen.findByRole("button", { name: "Ver del cierre del 2026-11-09" }));
    const dialogo = await screen.findByRole("dialog", { name: DETALLE });
    expect(within(dialogo).getByText("Motivo del rechazo:").closest('[role="status"]')).toHaveTextContent("«Falta un sobre»");
    expect(within(dialogo).getByRole("tab", { name: "Corregir" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialogo).getByRole("region", { name: "Órdenes por volver a gestionar" })).toHaveTextContent("REM-CORR");
    const pie = within(dialogo).getByText("Lo envías desde esta página cuando sea el siguiente por enviar.").parentElement!;
    expect(within(pie).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cerrar"]);
    expect(within(dialogo).queryByRole("button", { name: "Solicitar aprobación del cierre rechazado" })).toBeNull();

    await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (1)" }));
    expect(within(dialogo).getByRole("button", { name: "Devolver a gestión la orden REM-R1 · Rita" })).toBeEnabled();
  });

  it("tras un «Devolver a gestión» `ok` en el modal, relee ese cierre y deja el modal abierto con la lectura nueva", async () => {
    const antes = { ...vacios(), entregado: [makeGestion({ gestionId: "r1", resultado: "entregado", numRemision: "REM-R1", destinatario: "Rita" })] };
    verMock.mockResolvedValueOnce(lectura(antes)).mockResolvedValueOnce(lectura(vacios()));
    const user = montar({ cierresPasados: [otroRechazado] });

    await user.click(await screen.findByRole("button", { name: "Ver del cierre del 2026-11-09" }));
    let dialogo = await screen.findByRole("dialog", { name: DETALLE });
    await user.click(within(dialogo).getByRole("tab", { name: "Gestiones (1)" }));
    await user.click(within(dialogo).getByRole("button", { name: "Devolver a gestión la orden REM-R1 · Rita" }));
    const confirmar = await screen.findByRole("dialog", { name: "Devolver la orden a gestión" });
    await user.click(within(confirmar).getByRole("button", { name: "Devolver a gestión" }));

    await vi.waitFor(() => expect(verMock).toHaveBeenCalledTimes(2));
    expect(verMock).toHaveBeenLastCalledWith({ cierreId: OTRO });
    dialogo = await screen.findByRole("dialog", { name: DETALLE });
    expect(await within(dialogo).findByRole("tab", { name: "Gestiones (0)" })).toBeInTheDocument();
  });

  it("un cierre aprobado de la cola sigue abriéndose en solo lectura, sin «Corregir»", async () => {
    const aprobado = pasado({ cierreId: "eeeeeeee-0000-4000-8000-0000000000a1", estado: "aprobado", solicitadoAt: "2026-11-08T23:00:00.000Z" });
    verMock.mockResolvedValue({ status: "ok", cierre: aprobado, grupos: vacios(), ordenesSinGestion: [], sinGestionRegistrado: true, rechazosDeTienda: [] });
    const user = montar({ cierresPasados: [aprobado] });
    await user.click(await screen.findByRole("button", { name: "Ver del cierre del 2026-11-08" }));
    const dialogo = await screen.findByRole("dialog", { name: DETALLE });
    expect(within(dialogo).queryByRole("tab", { name: "Corregir" })).toBeNull();
    expect(within(dialogo).getByText("Los montos son los que quedaron congelados al solicitar el cierre.")).toBeInTheDocument();
  });
});

describe("R253 — la lectura del cierre por reenviar falló", () => {
  it("aviso `alert` con el envío de su estado y su confirmación; sin el cierre de hoy", async () => {
    const user = montar({ bloqueo: bloqueoConVencido("2026-11-10"), reenviable: { estado: "error", reenviableEstado: "vencido" } });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el cierre que tienes que enviar. Recarga la página.");
    expect(screen.queryByRole("region", { name: DETALLE })).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar cierre" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Solicitar aprobación del cierre vencido" }));
    expect(await screen.findByRole("dialog", { name: "Solicitar aprobación del cierre vencido" })).toBeInTheDocument();
  });

  it("con un rechazado, el botón es el del rechazado", () => {
    montar({ bloqueo: bloqueoConRechazado(), reenviable: { estado: "error", reenviableEstado: "rechazado" } });
    expect(screen.getByRole("button", { name: "Solicitar aprobación del cierre rechazado" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Solicitar aprobación del cierre vencido" })).toBeNull();
  });
});

describe("R255 — lo que la página ya no monta", () => {
  it.each([
    ["en curso", () => montar()],
    ["vencido", () => {
      const b = bloqueoConVencido("2026-11-10");
      montar({ bloqueo: b, reenviable: leidoDe(b) });
    }],
    ["rechazado", () => {
      const b = bloqueoConRechazado();
      montar({ bloqueo: b, reenviable: leidoDe(b), correcciones: [{ cierreId: b.aReenviarPrimero!.cierreId, motivoRechazo: null, gestiones: [], ordenesEnCorreccion: [] }] });
    }],
  ])("%s: ninguna de las regiones viejas ni una tabla por resultado", (_modo, montarModo) => {
    montarModo();
    for (const nombre of [
      "Totales del día",
      "Ganancia",
      "Cierre vencido",
      "Cierre rechazado",
      "Solicitar cierre",
      "Corregir el cierre rechazado",
      "Entregado",
      "Incidente",
    ]) {
      expect(screen.queryByRole("region", { name: nombre }), nombre).toBeNull();
    }
    expect(screen.queryByRole("table", { name: "Entregado" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Incidente" })).toBeNull();
  });
});
