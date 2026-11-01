// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RolValue } from "@prisma/client";
import { SWRConfig } from "swr";

import { ToastProvider } from "@/providers/ToastProvider";
import { FORMA_UUID, UUID_BODEGA, UUID_MOV, estado, fila } from "@/tests/fixtures/estado-cuenta";

// =================================================================================================
// FICHA 458-D (T D.4; R17, R24, R30, R31, R81) — EL ESTADO DE CUENTA DE UNA BODEGA SATÉLITE.
//
//  - El extracto «Declarado / Recibido» con lo que la bodega tiene por entregar tras cada fila.
//  - R31: DEBAJO, la conciliación de hoy (marcar y desmarcar lo recibido) con su mismo efecto y sus
//    mismos textos (los tests de la 431 en `tests/integration/wallet-satelites.test.tsx` siguen verdes
//    sobre `ConciliacionSatelite`). Su «Pendiente de llegar» es el saldo actual del estado de cuenta.
//  - R30: tras marcar se relee el estado de cuenta de ESTA bodega.
//  - R81: la página, solo acceso total.
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

function montar(puedeConciliar = true) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>
        <EstadoCuentaSatelite inicial={INICIAL} puedeConciliar={puedeConciliar} />
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
  it("columnas y fila en el vocabulario de la bodega; sin «Ver» (no hay fila de libro) y sin uuid", () => {
    const { container } = montar();
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
  it("se rotula «Cierre aprobado sin consolidar» (no «Consolidación declarada») y pinta su importe negativo", () => {
    verEstadoCuentaMock.mockResolvedValue({ status: "ok", estado: INICIAL_SIN_CONSOLIDAR });
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ToastProvider>
          <EstadoCuentaSatelite inicial={INICIAL_SIN_CONSOLIDAR} puedeConciliar />
        </ToastProvider>
      </SWRConfig>,
    );
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

describe("R31 — la conciliación de hoy, debajo del extracto, con su «Pendiente de llegar»", () => {
  it("la sección de conciliación está y su pendiente es el saldo actual del estado de cuenta", async () => {
    montar();
    const region = await screen.findByRole("region", { name: "Conciliación de FGAM Puntarenas" });
    expect(within(region).getByText("Pendiente de llegar").nextSibling?.textContent).toBe("₡115.000");
    expect(
      await within(region).findByRole("button", { name: /Marcar recibido la consolidación de FGAM Puntarenas/ }),
    ).toBeInTheDocument();
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
