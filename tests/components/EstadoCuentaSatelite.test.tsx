// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RolValue } from "@prisma/client";
import { SWRConfig } from "swr";

import { ToastProvider } from "@/providers/ToastProvider";
import { FORMA_UUID, UUID_BODEGA, UUID_MOV, estado, fila } from "@/tests/fixtures/estado-cuenta";
import { casillasOfrecidas, ponerCasillas } from "@/tests/fixtures/barra-libro-wallet";

// =================================================================================================
// FICHA 458-D (T D.4; R17, R24, R30, R31, R81) — EL ESTADO DE CUENTA DE UNA BODEGA SATÉLITE.
//
//  - El extracto «Declarado / Recibido» con lo que la bodega tiene por entregar tras cada fila.
//  - R31: DEBAJO, la conciliación de hoy (marcar y desmarcar lo recibido) con su mismo efecto y sus
//    mismos textos (los tests de la 431 en `tests/integration/wallet-satelites.test.tsx` siguen verdes
//    sobre `ConciliacionSatelite`). Su «Pendiente de llegar» es el saldo actual del estado de cuenta.
//  - R30: tras marcar se relee el estado de cuenta de ESTA bodega.
//  - R81: la página, solo acceso total.
//
// SLT-114 «Estado de cuenta de la satélite: conciliación en pestaña» (R230-R233, R239): la conciliación y
// el libro pasan a dos pestañas bajo las tarjetas; «Conciliación» abre seleccionada y cuenta las que
// quedan sin conciliar. Los tests que leen el libro pulsan antes «Movimientos». PA1: sin la tarjeta
// «Pendiente de llegar»; PA2: columnas «Debe llegar» y «Falta».
// =================================================================================================

const verEstadoCuentaMock = vi.fn();
// SL-23 (design §10): las puertas de módulo, todas encendidas; esta prueba no es sobre ellas.
vi.mock("@/lib/modulos/exigir-modulo", async () =>
  (await import("@/tests/fabricas/modulos")).puertasAbiertas());

vi.mock("@/lib/actions/estado-cuenta", () => ({
  verEstadoCuentaAction: (...a: unknown[]) => verEstadoCuentaMock(...a),
}));
const listarConsolidacionesMock = vi.fn();
const marcarMock = vi.fn();
vi.mock("@/lib/actions/conciliacion-satelites", () => ({
  listarConsolidacionesSateliteAction: (...a: unknown[]) => listarConsolidacionesMock(...a),
  listarConsolidacionesSateliteCompletoAction: vi.fn(),
  marcarConsolidacionRecibidaAction: (...a: unknown[]) => marcarMock(...a),
  revertirConciliacionAction: vi.fn(),
}));
vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));
class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { EstadoCuentaSatelite, ROTULOS_BODEGA } from "@/app/(app)/wallet/satelites/_components/EstadoCuentaSatelite";
import { ESTADO_CUENTA_BODEGA_PAGINA } from "@/app/(app)/wallet/satelites/_components/satelites-labels";
import { lineaDeFila } from "@/components/shared/estado-cuenta/estado-cuenta-lineas";
import { filaBaseCuenta } from "@/components/shared/estado-cuenta/estado-cuenta-descarga-columnas";
import EstadoCuentaSatelitePage from "@/app/(app)/wallet/satelites/[zonaId]/page";

const actorMock = vi.mocked(resolveActorFromSession);

const INICIAL = estado({
  tipo: "bodega",
  nombre: "FGAM Puntarenas",
  saldoActual: "115000.00",
  saldoFinal: "115000.00",
  abonos: "0.00",
  cargos: "115000.00",
  filas: [
    fila({
      ref: null,
      consolidacionId: UUID_MOV(7),
      fecha: "2026-09-16",
      categoria: "declarado",
      origenTipo: "cierre_bodega",
      chip: "declarado",
      cargo: "115000.00",
      abono: null,
      saldoCorrido: "115000.00",
      registro: { nombre: null, automatico: null },
      naceDeUnCierre: false,
    }),
  ],
  total: 1,
});

const CONSOLIDACION = {
  cierreBodegaId: UUID_MOV(7),
  solicitadoAt: "2026-09-16T14:00:00.000Z",
  totales: { efectivo: "115000.00", simpe: "0.00", transferencia: "0.00", general: "115000.00" },
  pagoMensajero: "0.00",
  gananciaSatelite: "0.00",
  paraLaCentral: "115000.00", // SLT-73: campos del DTO que la conciliación pinta
  montoRecibido: null,
  faltaPorRecibir: "115000.00",
  conciliado: false,
  conciliadoAt: null,
  conciliadoPorNombre: null,
  nota: null,
  cantidadCierres: 1,
};

/** El libro vive en «Movimientos» (R231): se abre esa pestaña antes de leerlo. */
async function abrirMovimientos(user = userEvent.setup()) {
  await user.click(screen.getByRole("tab", { name: "Movimientos" }));
  return user;
}

function montar(puedeConciliar = true, inicial = INICIAL) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>
        <EstadoCuentaSatelite inicial={inicial} puedeConciliar={puedeConciliar} />
      </ToastProvider>
    </SWRConfig>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  verEstadoCuentaMock.mockResolvedValue({ status: "ok", estado: INICIAL });
  listarConsolidacionesMock.mockResolvedValue({ status: "ok", items: [CONSOLIDACION], total: 1, page: 1, pageSize: 25 });
  marcarMock.mockResolvedValue({ status: "ok", cierreBodegaId: UUID_MOV(7) });
});
afterEach(() => cleanup());

describe("el extracto de la bodega: Declarado / Recibido / Por entregar", () => {
  it("columnas y fila en el vocabulario de la bodega; sin «Ver» (no hay fila de libro) y sin uuid", async () => {
    const { container } = montar();
    await abrirMovimientos();
    const tabla = screen.getByRole("table", { name: "Estado de cuenta de FGAM Puntarenas" });
    const cabeceras = within(tabla).getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabeceras).toEqual(["Fecha", "Movimiento", "Declarado", "Recibido", "Por entregar", "Ver"]);
    const filas = within(tabla).getAllByRole("row");
    // FICHA 463 (R39): con «Más recientes» la primera fila es el movimiento; el saldo inicial, la última.
    expect(filas[1].textContent).toContain("Consolidación declarada");
    expect(filas[1].textContent).toContain("₡115.000");
    expect(within(tabla).queryByRole("button", { name: /^Ver / })).toBeNull();
    expect(screen.getByText("FGAM Puntarenas tiene ₡115.000 por entregar")).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(FORMA_UUID);
  });
});

// SLT-73 (R32/R33, pintado en T14) — la fila de un cierre aprobado SIN CONSOLIDAR: chip propio, origen
// `cierre_dia`, sin consolidación, y su aporte en `cargo`, que puede ser NEGATIVO (jornada prepagada).
const FILA_SIN_CONSOLIDAR = fila({
  ref: null,
  consolidacionId: null,
  fecha: "2026-09-18",
  categoria: "sin_consolidar",
  origenTipo: "cierre_dia",
  chip: "sin_consolidar",
  cargo: "-1250.50",
  abono: null,
  saldoCorrido: "113749.50",
  registro: { nombre: null, automatico: null },
  naceDeUnCierre: false,
});
const INICIAL_SIN_CONSOLIDAR = estado({
  ...INICIAL,
  saldoActual: "113749.50",
  saldoFinal: "113749.50",
  cargos: "113749.50",
  filas: [FILA_SIN_CONSOLIDAR, ...INICIAL.filas],
  total: 2,
});

describe("SLT-73 R32/R33 — la fila del cierre aprobado sin consolidar", () => {
  it("se rotula «Cierre aprobado sin consolidar» (no «Consolidación declarada») y pinta su importe negativo", async () => {
    verEstadoCuentaMock.mockResolvedValue({ status: "ok", estado: INICIAL_SIN_CONSOLIDAR });
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ToastProvider>
          <EstadoCuentaSatelite inicial={INICIAL_SIN_CONSOLIDAR} puedeConciliar />
        </ToastProvider>
      </SWRConfig>,
    );
    await abrirMovimientos();
    const tabla = screen.getByRole("table", { name: "Estado de cuenta de FGAM Puntarenas" });
    const filas = within(tabla).getAllByRole("row");
    // «Más recientes»: la fila del 18 va primero, la consolidación del 16 después.
    expect(filas[1].textContent).toContain("Cierre aprobado sin consolidar");
    expect(filas[1].textContent).not.toContain("Consolidación declarada");
    expect(filas[1].textContent).toContain("-₡1.250,50");
    expect(filas[2].textContent).toContain("Consolidación declarada");
  });

  it("la descarga lleva el mismo concepto (la fila rotulada por la superficie)", () => {
    const linea = lineaDeFila(FILA_SIN_CONSOLIDAR, ROTULOS_BODEGA);
    expect(filaBaseCuenta(linea).concepto).toBe("Cierre aprobado sin consolidar");
    expect(linea.cargo).toBe("-1250.50");
  });

  it("la descripción de la página ya no habla de lo declarado como efectivo de la consolidación", () => {
    expect(ESTADO_CUENTA_BODEGA_PAGINA.descripcion).toBe(
      "Lo que la bodega tiene que entregar a la central por cada consolidación y por cada cierre aprobado sin consolidar, y lo que llegó, con lo que tiene por entregar tras cada movimiento",
    );
  });
});

describe("R31, R239 — la conciliación de hoy, en su pestaña", () => {
  it("la sección de conciliación está, con sus acciones", async () => {
    montar();
    const region = await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    expect(
      await within(region).findByRole("button", { name: /Marcar recibido la consolidación de FGAM Puntarenas/ }),
    ).toBeInTheDocument();
  });

  it("R239 — sin «Pendiente de llegar» y columnas «Debe llegar» y «Falta» (PA1, PA2)", async () => {
    montar();
    const region = await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    const tabla = await within(region).findByRole("table", { name: "Consolidaciones de FGAM Puntarenas" });
    await within(tabla).findByRole("button", { name: /Marcar recibido la consolidación/ });
    expect(within(region).queryByText("Pendiente de llegar")).toBeNull();
    const cabeceras = within(tabla)
      .getAllByRole("columnheader")
      .map((c) => c.textContent ?? "");
    // R239: solo cambian los dos títulos; las demás columnas y su orden, como estaban.
    expect(cabeceras).toEqual(["Desglose", "Consolidada", "Debe llegar", "Recibido", "Falta", "Estado", "Conciliado por", ""]);
  });

  it("R239 — con dos incompletas, el aviso dice el `saldoActual` del estado de cuenta", async () => {
    // Tres importes distintos a propósito: el de cada fila (₡20.000 y ₡12.000), su suma (₡32.000) y el
    // saldo actual (₡48.250,75). Solo el último es el del aviso.
    const conSaldo = estado({ ...INICIAL, saldoActual: "48250.75", saldoFinal: "48250.75", cargos: "48250.75" });
    verEstadoCuentaMock.mockResolvedValue({ status: "ok", estado: conSaldo });
    const incompleta = (n: number, debe: string, llego: string, falta: string) => ({
      ...CONSOLIDACION,
      cierreBodegaId: UUID_MOV(n),
      paraLaCentral: debe,
      totales: { ...CONSOLIDACION.totales, efectivo: debe, general: debe },
      montoRecibido: llego,
      faltaPorRecibir: falta,
      conciliado: true,
      conciliadoAt: "2026-09-17T15:00:00.000Z",
      conciliadoPorNombre: "Carla Central",
    });
    listarConsolidacionesMock.mockResolvedValue({
      status: "ok",
      items: [incompleta(7, "60000.00", "40000.00", "20000.00"), incompleta(8, "30000.00", "18000.00", "12000.00")],
      total: 2,
      page: 1,
      pageSize: 25,
    });
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ToastProvider>
          <EstadoCuentaSatelite inicial={conSaldo} puedeConciliar />
        </ToastProvider>
      </SWRConfig>,
    );
    const region = await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    const titulo = await within(region).findByText("2 consolidaciones llegaron incompletas");
    const aviso = titulo.closest('[role="status"]');
    expect(aviso).not.toBeNull();
    expect(aviso?.textContent).toBe(
      "2 consolidaciones llegaron incompletas" +
        "Entre todas falta por llegar ₡48.250,75. Esa diferencia sigue contando como pendiente de esta " +
        "bodega hasta que llegue o se corrija la marca.",
    );
  });

  it("R30: marcar recibido relee el estado de cuenta de ESTA bodega", async () => {
    const user = userEvent.setup();
    montar();
    const region = await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    await user.click(await within(region).findByRole("button", { name: /Marcar recibido la consolidación/ }));
    const dialogo = await screen.findByRole("dialog");
    const lecturasAntes = verEstadoCuentaMock.mock.calls.length;
    await user.click(within(dialogo).getByRole("button", { name: "Marcar recibido" }));
    await waitFor(() => expect(marcarMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(verEstadoCuentaMock.mock.calls.length).toBeGreaterThan(lecturasAntes));
    for (const [input] of verEstadoCuentaMock.mock.calls.slice(lecturasAntes)) {
      expect((input as { cuenta: unknown }).cuenta).toEqual({ tipo: "bodega", id: UUID_BODEGA });
    }
  });

  it("sin permiso de conciliar, ningún botón de marcar", async () => {
    montar(false);
    const region = await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    await waitFor(() => expect(listarConsolidacionesMock).toHaveBeenCalled());
    expect(within(region).queryByRole("button", { name: /Marcar recibido/ })).toBeNull();
  });
});

describe("R230-R233 — «Conciliación» y «Movimientos» bajo las tarjetas", () => {
  it("R230 — pestañas Conciliación y Movimientos, abre en Conciliación", async () => {
    montar();
    const lista = screen.getByRole("tablist", { name: "Pestañas del estado de cuenta de FGAM Puntarenas" });
    const pestanas = within(lista).getAllByRole("tab");
    expect(pestanas).toHaveLength(2);
    expect(pestanas[0].textContent).toMatch(/^Conciliación/);
    expect(pestanas[1].textContent).toBe("Movimientos");
    expect(pestanas[0].getAttribute("aria-selected")).toBe("true");
    expect(pestanas[1].getAttribute("aria-selected")).toBe("false");
    // Las pestañas van DEBAJO de las tarjetas del estado de cuenta.
    const tarjetas = screen.getByText("FGAM Puntarenas tiene ₡115.000 por entregar");
    expect(tarjetas.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R231 — cada pestaña muestra lo suyo y las tarjetas siguen", async () => {
    montar();
    expect(await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Estado de cuenta de FGAM Puntarenas" })).toBeNull();
    expect(screen.getByText("FGAM Puntarenas tiene ₡115.000 por entregar")).toBeTruthy();

    await abrirMovimientos();
    expect(screen.getByRole("table", { name: "Estado de cuenta de FGAM Puntarenas" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Conciliación de FGAM Puntarenas" })).toBeNull();
    expect(screen.getByText("FGAM Puntarenas tiene ₡115.000 por entregar")).toBeTruthy();
  });

  it("R232 — volver a una pestaña conserva filtro y página", async () => {
    // Dos páginas: 26 en «Todas», con 25 por página (`cierreBodegaConfig.DEFAULT_PAGE_SIZE`).
    listarConsolidacionesMock.mockImplementation(async (input: { page: number; soloSinConciliar?: boolean }) => ({
      status: "ok",
      items: [CONSOLIDACION],
      total: input.soloSinConciliar ? 1 : 26,
      page: input.page,
      pageSize: 25,
    }));
    const user = userEvent.setup();
    montar();
    const region = await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    await user.click(within(region).getByRole("button", { name: "Todas" }));
    const paginacion = await within(region).findByRole("navigation", {
      name: "Paginación de las consolidaciones de FGAM Puntarenas",
    });
    await user.click(await within(paginacion).findByRole("button", { name: "Página siguiente" }));
    await waitFor(() =>
      expect(listarConsolidacionesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })),
    );

    await abrirMovimientos(user);
    await user.click(screen.getByRole("tab", { name: /^Conciliación/ }));

    const otra = screen.getByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    expect(within(otra).getByRole("button", { name: "Todas" }).getAttribute("aria-pressed")).toBe("true");
    const pag = within(otra).getByRole("navigation", { name: "Paginación de las consolidaciones de FGAM Puntarenas" });
    expect(within(pag).getByText("26-26 de 26")).toBeTruthy();
  });

  it("R232 — volver a «Movimientos» conserva término, casillas y página del libro", async () => {
    // 45 movimientos, 20 por página (el `pageSize` de la primera lectura): hay página 2.
    const largo = estado({ ...INICIAL, total: 45 });
    verEstadoCuentaMock.mockResolvedValue({ status: "ok", estado: largo });
    const user = userEvent.setup();
    montar(true, largo);
    await abrirMovimientos(user);

    await user.type(screen.getByRole("searchbox", { name: "Buscar en el libro" }), "etiquetas");
    await waitFor(() => expect(verEstadoCuentaMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "etiquetas" })), {
      timeout: 3000,
    });
    await ponerCasillas(user, document.body, "Tipo de movimiento");
    const paginacionLibro = () =>
      screen.getByRole("navigation", { name: "Paginación del estado de cuenta de FGAM Puntarenas" });
    await user.click(within(paginacionLibro()).getByRole("button", { name: /siguiente/i }));
    await waitFor(() =>
      expect(verEstadoCuentaMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "etiquetas", page: 2 })),
    );
    const lecturas = verEstadoCuentaMock.mock.calls.length;

    await user.click(screen.getByRole("tab", { name: /^Conciliación/ }));
    expect(screen.queryByRole("searchbox", { name: "Buscar en el libro" })).toBeNull();
    await abrirMovimientos(user);

    expect(screen.getByRole("searchbox", { name: "Buscar en el libro" })).toHaveValue("etiquetas");
    expect((await casillasOfrecidas(user, document.body)).marcadas).toEqual(["Tipo de movimiento"]);
    expect(within(paginacionLibro()).getByText("21-40 de 45")).toBeTruthy();
    // Ir y volver no relee el libro: la selección es la misma.
    expect(verEstadoCuentaMock.mock.calls.length).toBe(lecturas);
  });

  it("R233 — la pestaña dice \"2 sin conciliar\" con total 2 y solo \"Conciliación\" con 0", async () => {
    listarConsolidacionesMock.mockResolvedValue({ status: "ok", items: [CONSOLIDACION], total: 2, page: 1, pageSize: 25 });
    montar();
    expect(await screen.findByRole("tab", { name: "Conciliación 2 sin conciliar" })).toBeTruthy();
    cleanup();

    listarConsolidacionesMock.mockResolvedValue({ status: "ok", items: [], total: 0, page: 1, pageSize: 25 });
    montar();
    await waitFor(() => expect(listarConsolidacionesMock).toHaveBeenCalled());
    await screen.findByText("Esta bodega no tiene consolidaciones que mostrar.");
    expect(screen.getByRole("tab", { name: "Conciliación" })).toBeTruthy();
    expect(screen.queryByText(/sin conciliar$/)).toBeNull();
  });

  it("R233 — si la lectura falla, la pestaña dice solo \"Conciliación\"", async () => {
    listarConsolidacionesMock.mockResolvedValue({ status: "error" });
    montar();
    await screen.findByText("No se pudo cargar el desglose de esta bodega.");
    expect(screen.getByRole("tab", { name: "Conciliación" })).toBeTruthy();
  });
});

describe("R81 — la página, solo acceso total", () => {
  it.each<RolValue>(["adminSatelite", "adminTienda", "mensajero"])("%s → notFound sin leer", async (rol) => {
    actorMock.mockResolvedValue({ usuarioId: "u1", rol });
    await expect(EstadoCuentaSatelitePage({ params: Promise.resolve({ zonaId: UUID_BODEGA }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(verEstadoCuentaMock).not.toHaveBeenCalled();
  });

  it("una zona inexistente o que no es satélite → notFound", async () => {
    actorMock.mockResolvedValue({ usuarioId: "u1", rol: "maestro" });
    verEstadoCuentaMock.mockResolvedValue({ status: "no_encontrado" });
    await expect(EstadoCuentaSatelitePage({ params: Promise.resolve({ zonaId: UUID_BODEGA }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(verEstadoCuentaMock).toHaveBeenCalledWith({ cuenta: { tipo: "bodega", id: UUID_BODEGA } });
  });
});
