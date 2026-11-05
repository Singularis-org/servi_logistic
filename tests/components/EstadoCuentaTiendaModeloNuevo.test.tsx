// @vitest-environment jsdom
/**
 * SLT-54 (R71, D38; tanda I2) — el cobro del modelo nuevo en el estado de cuenta de una tienda.
 *
 * Medido en la revisión: un reprogramado de flete 250 al 13 % se le presentaba a la tienda como «te cobró el flete
 * por devolución a origen», 250,00, más 32,50 de IVA, sin que hubiera ninguna devolución. El campo sale del servidor
 * (`tests/integration/db/estado-cuenta-tienda-modelo-nuevo.test.ts`); aquí se mide lo que cada superficie hace con
 * él: tabla, nombre del desplegable y las dos hojas de la descarga. Los textos van literales a propósito.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";

import type { CierresDeLaTienda } from "@/app/(app)/mi-wallet/_components/mi-wallet-cierres";
import type { EstadoCuentaDTO, FilaEstadoCuentaDTO } from "@/lib/types/estado-cuenta";
import type { DetallePorGuiaDTO, KardexDTO } from "@/lib/types/libro-kardex";
import { ToastProvider } from "@/providers/ToastProvider";
import { UUID_MOV, UUID_TIENDA, estado, fila } from "@/tests/fixtures/estado-cuenta";

const H = vi.hoisted(() => ({
  kardex: vi.fn(),
  conDetalle: vi.fn(),
  miKardex: vi.fn(),
  miConDetalle: vi.fn(),
}));

vi.mock("@/lib/actions/estado-cuenta", () => ({
  verEstadoCuentaAction: vi.fn(),
  estadoCuentaKardexAction: (...a: unknown[]) => H.kardex(...a),
  estadoCuentaKardexConDetalleAction: (...a: unknown[]) => H.conDetalle(...a),
  verMiEstadoCuentaAction: vi.fn(),
  miEstadoCuentaKardexAction: (...a: unknown[]) => H.miKardex(...a),
  miEstadoCuentaKardexConDetalleAction: (...a: unknown[]) => H.miConDetalle(...a),
  verOrdenesDeFilaAction: vi.fn(),
  verDetalleDeMiMovimientoAction: vi.fn(),
  verDetalleDeMiMovimientoCompletoAction: vi.fn(),
}));
vi.mock("@/lib/actions/wallet-filtros", () => ({
  cierresDeLaCuentaAction: vi.fn(async () => ({ status: "ok", opciones: [], hayMas: false })),
  conceptosConMovimientosAction: vi.fn(async () => ({ status: "ok", conceptos: [] })),
  quienesDelLibroCajaAction: vi.fn(),
}));
vi.mock("@/lib/actions/como-quedo", () => ({ comoQuedoAction: vi.fn() }));
vi.mock("@/lib/actions/wallet-comprobante", () => ({ verComprobanteAction: vi.fn(), adjuntarComprobanteAction: vi.fn() }));
vi.mock("@/lib/actions/wallet-anulacion", () => ({ anularMovimientoAction: vi.fn() }));
vi.mock("@/lib/actions/wallet-tienda", () => ({
  verDetalleDeMiMovimientoAction: vi.fn(),
  verDetalleDeMiMovimientoCompletoAction: vi.fn(),
}));
vi.mock("@/app/(app)/wallet/tiendas/_components/EstadoCuentaAcciones", () => ({ EstadoCuentaAcciones: () => null }));
vi.mock("@/app/(app)/wallet/tiendas/_components/PagosTiendaEstadoCuenta", () => ({ PagosTiendaEstadoCuenta: () => null }));

import { filasDelPeriodo, lectorDeLaCuenta } from "@/components/shared/estado-cuenta/EstadoCuenta";
import { LECTOR_MI_TIENDA, MiEstadoCuenta, ROTULOS_MI_WALLET } from "@/app/(app)/mi-wallet/_components/MiEstadoCuenta";
import { DETALLE_DESCARGA_MI_WALLET } from "@/app/(app)/mi-wallet/_components/mi-estado-cuenta-descarga-columnas";
import { CATEGORIA_MI_WALLET_LABEL } from "@/app/(app)/mi-wallet/_components/mi-wallet-labels";
import { EstadoCuentaTienda, PANEL_TIENDA, ROTULOS_TIENDA } from "@/app/(app)/wallet/tiendas/_components/EstadoCuentaTienda";
import { CATEGORIA_TIENDA_LABEL } from "@/app/(app)/wallet/tiendas/_components/desglose-tienda-labels";
import { DETALLE_DESCARGA_WALLET_TIENDA } from "@/app/(app)/wallet/tiendas/_components/estado-cuenta-tienda-descarga-columnas";
import { conceptoDeMovimientoCaja } from "@/lib/constants/wallet-rotulos";
import type { WalletTiendaMovimientoCategoria } from "@/lib/types/wallet-tienda";

/** Las cifras de la revisión: reprogramado, flete 250, IVA 32,50 al 13 %. */
const FLETE = (n: number, over: Partial<FilaEstadoCuentaDTO>) =>
  fila({ n, categoria: "flete_devolucion", abono: null, cargo: "250.00", saldoCorrido: "-1250.00", chip: "cierres", ...over });
const IVA = (n: number, over: Partial<FilaEstadoCuentaDTO>) =>
  fila({ n, categoria: "iva_flete_devolucion", abono: null, cargo: "32.50", saldoCorrido: "-1282.50", chip: "cierres", ...over });

const KARDEX_DOS: KardexDTO = {
  saldoInicial: "0.00",
  saldoFinal: "-282.50",
  totales: { entra: "0.00", sale: "282.50", cobradoATiendas: null },
  conOtrosFiltros: false,
  filas: [
    { monto: { columna: "sale", monto: "250.00" }, saldo: "-250.00", ordenes: 1 },
    { monto: { columna: "sale", monto: "32.50" }, saldo: "-282.50", ordenes: 1 },
  ],
};

/** Las dos filas de la hoja «Detalle por guía», colgadas de la misma guía. */
const POR_GUIA: DetallePorGuiaDTO = {
  bloques: [
    {
      guia: "1001",
      remision: "R-1",
      destinatario: "Ana",
      producto: "Camisa",
      tiendaNombre: null,
      mensajeroNombre: null,
      cierres: ["2026-09-12T20:00:00.000Z"],
      resultados: ["reprogramado"],
      filas: [1, 2].map((n) => ({
        movimientoId: UUID_MOV(n),
        cierreFecha: "2026-09-12T20:00:00.000Z",
        resultados: ["reprogramado" as const],
        monto: { columna: "sale" as const, monto: n === 1 ? "250.00" : "32.50" },
      })),
      total: { entra: "0.00", sale: "282.50", cobradoATiendas: null },
    },
  ],
  sinGuia: [],
  totalGeneral: { entra: "0.00", sale: "282.50", cobradoATiendas: null },
};

const CIERRES: CierresDeLaTienda = { opciones: [], hayMas: false, disponible: true };

function envolver(ui: ReactNode) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>,
  );
}

/** Cada superficie con sus lectores reales, para que nada de lo que se afirma pase por un doble de rótulo. */
const SUPERFICIES = [
  {
    nombre: "/mi-wallet, la lee la tienda",
    flete: { nuevo: "La empresa te cobró el flete de gestiones no entregadas", viejo: "La empresa te cobró el flete por devolución a origen" },
    iva: {
      nuevo: "La empresa te cobró el IVA del flete de gestiones no entregadas",
      viejo: "La empresa te cobró el IVA del flete por devolución a origen",
    },
    rotulos: ROTULOS_MI_WALLET,
    lector: LECTOR_MI_TIENDA,
    detalle: DETALLE_DESCARGA_MI_WALLET,
    mockKardex: H.miKardex,
    mockDetalle: H.miConDetalle,
    montar: (inicial: EstadoCuentaDTO) => envolver(<MiEstadoCuenta inicial={inicial} cierres={CIERRES} />),
    diccionario: CATEGORIA_MI_WALLET_LABEL,
  },
  {
    nombre: "/wallet/tiendas, la lee la oficina",
    flete: { nuevo: "Flete de gestiones no entregadas cobrado a la tienda", viejo: "Flete por devolución a origen cobrado a la tienda" },
    iva: {
      nuevo: "IVA del flete de gestiones no entregadas cobrado a la tienda",
      viejo: "IVA del flete por devolución a origen cobrado a la tienda",
    },
    rotulos: ROTULOS_TIENDA,
    lector: lectorDeLaCuenta({ tipo: "tienda", id: UUID_TIENDA }),
    detalle: DETALLE_DESCARGA_WALLET_TIENDA,
    mockKardex: H.kardex,
    mockDetalle: H.conDetalle,
    montar: (inicial: EstadoCuentaDTO) => envolver(<EstadoCuentaTienda inicial={inicial} puedeRegistrar={false} />),
    diccionario: CATEGORIA_TIENDA_LABEL,
  },
] as const;

/** La fila de la tabla que lleva ese concepto; falla si no hay exactamente una. */
function filaDeTabla(concepto: string): HTMLElement {
  const filas = screen.getAllByRole("row").filter((r) => r.textContent?.includes(concepto));
  expect(filas, `filas con «${concepto}»`).toHaveLength(1);
  return filas[0];
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe.each(SUPERFICIES)("R71 / D38 — $nombre", (s) => {
  describe("el rótulo de una fila", () => {
    it("nuevo: nombra lo que se cobró, sin hablar de una devolución que no hubo", () => {
      expect(s.rotulos.concepto(FLETE(1, { incluyeModeloNuevo: true }))).toBe(s.flete.nuevo);
      expect(s.rotulos.concepto(IVA(2, { incluyeModeloNuevo: true }))).toBe(s.iva.nuevo);
    });

    it.each([
      ["falso", false],
      ["ausente", undefined],
    ])("viejo, con el campo %s: el texto de siempre, literal", (_nombre, campo) => {
      expect(s.rotulos.concepto(FLETE(1, { incluyeModeloNuevo: campo }))).toBe(s.flete.viejo);
      expect(s.rotulos.concepto(IVA(2, { incluyeModeloNuevo: campo }))).toBe(s.iva.viejo);
    });

    it("el cobro por rechazo sí fue una devolución, y conserva su texto (el servidor lo manda en falso)", () => {
      const rechazo = { origenTipo: "gestion_orden", incluyeModeloNuevo: false } as const;
      expect(s.rotulos.concepto(FLETE(1, rechazo))).toBe(s.flete.viejo);
      expect(s.rotulos.concepto(IVA(2, rechazo))).toBe(s.iva.viejo);
    });

    it("con el campo verdadero solo cambian esas dos categorías", () => {
      const cambian: string[] = [];
      for (const [categoria, viejo] of Object.entries(s.diccionario) as [WalletTiendaMovimientoCategoria, string][]) {
        if (s.rotulos.concepto(fila({ categoria, incluyeModeloNuevo: true })) !== viejo) cambian.push(categoria);
      }
      expect(cambian.sort()).toEqual(["flete_devolucion", "iva_flete_devolucion"]);
    });

    it("una categoría sin nombre sigue cayendo a su valor, nunca a un texto vacío", () => {
      expect(s.rotulos.concepto(fila({ categoria: "categoria_desconocida", incluyeModeloNuevo: true }))).toBe("categoria_desconocida");
    });
  });

  describe("la tabla", () => {
    it("nuevo: flete 250 e IVA 32,50 con su nombre, y ninguna devolución en pantalla", () => {
      s.montar(estado({ filas: [FLETE(1, { incluyeModeloNuevo: true }), IVA(2, { incluyeModeloNuevo: true })], total: 2 }));
      expect(filaDeTabla(s.flete.nuevo).textContent).toContain("₡250");
      expect(filaDeTabla(s.iva.nuevo).textContent).toContain("₡32,50");
      expect(document.body.textContent).not.toContain("devolución a origen");
    });

    it("viejo: el texto de siempre, literal, sobre los mismos importes", () => {
      s.montar(estado({ filas: [FLETE(1, {}), IVA(2, { incluyeModeloNuevo: false })], total: 2 }));
      expect(filaDeTabla(s.flete.viejo).textContent).toContain("₡250");
      expect(filaDeTabla(s.iva.viejo).textContent).toContain("₡32,50");
      expect(document.body.textContent).not.toContain("gestiones no entregadas");
    });

    it("mixto: cada fila sigue a la suya, y no a su vecina", () => {
      s.montar(
        estado({
          filas: [FLETE(1, { incluyeModeloNuevo: true }), FLETE(2, { incluyeModeloNuevo: false }), IVA(3, { incluyeModeloNuevo: true })],
          total: 3,
        }),
      );
      expect(filaDeTabla(s.flete.nuevo)).toBeTruthy();
      expect(filaDeTabla(s.flete.viejo)).toBeTruthy();
      expect(filaDeTabla(s.iva.nuevo)).toBeTruthy();
    });

    it("el nombre del desplegable dice lo mismo que la fila", () => {
      s.montar(estado({ filas: [FLETE(1, { incluyeModeloNuevo: true })] }));
      const nombres = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
      expect(nombres.filter((n) => n.includes(s.flete.nuevo)).length).toBeGreaterThan(0);
      expect(nombres.filter((n) => n.includes("devolución a origen"))).toEqual([]);
    });
  });

  describe("la descarga", () => {
    /** Las dos hojas, con el dato tal como lo manda el kardex del servidor. */
    async function hojas(filas: FilaEstadoCuentaDTO[]) {
      const respuesta = { status: "ok", estado: estado({ filas, total: filas.length }), kardex: KARDEX_DOS };
      s.mockKardex.mockResolvedValue(respuesta);
      s.mockDetalle.mockResolvedValue({ ...respuesta, porGuia: POR_GUIA });
      const movimientos = await filasDelPeriodo(s.lector, {}, s.rotulos);
      const conDetalle = await filasDelPeriodo(s.lector, {}, s.rotulos, s.detalle);
      if (movimientos.status !== "ok" || conDetalle.status !== "ok") throw new Error("la descarga no dio filas");
      const conceptosDe = (hoja: readonly Record<string, unknown>[] | undefined) =>
        (hoja ?? []).map((f) => f.concepto).filter((c) => typeof c === "string" && /flete/i.test(c));
      return { hoja1: conceptosDe(movimientos.filas), hoja2: conceptosDe(conDetalle.filasDetalle), filas1: movimientos.filas };
    }

    it("nuevo: las dos hojas dicen lo mismo que la tabla, con 250 y 32,50", async () => {
      const r = await hojas([FLETE(1, { incluyeModeloNuevo: true }), IVA(2, { incluyeModeloNuevo: true })]);
      expect(r.hoja1).toEqual([s.flete.nuevo, s.iva.nuevo]);
      expect(r.hoja2).toEqual([s.flete.nuevo, s.iva.nuevo]);
      const conFlete = r.filas1.filter((f) => /flete/i.test(String(f.concepto)));
      expect(conFlete.map((f) => f.sale)).toEqual(["250.00", "32.50"]);
    });

    it("viejo: las dos hojas, literales", async () => {
      const r = await hojas([FLETE(1, {}), IVA(2, { incluyeModeloNuevo: false })]);
      expect(r.hoja1).toEqual([s.flete.viejo, s.iva.viejo]);
      expect(r.hoja2).toEqual([s.flete.viejo, s.iva.viejo]);
    });

    it("mixto: cada fila de cada hoja sigue a la suya", async () => {
      const r = await hojas([FLETE(1, { incluyeModeloNuevo: true }), IVA(2, { incluyeModeloNuevo: false })]);
      expect(r.hoja1).toEqual([s.flete.nuevo, s.iva.viejo]);
      expect(r.hoja2).toEqual([s.flete.nuevo, s.iva.viejo]);
    });
  });
});

describe("R71 / D38 — lo propio de cada lado", () => {
  it("la oficina nombra el cobro igual que su contrapartida en el libro de la caja", () => {
    expect(ROTULOS_TIENDA.concepto(FLETE(1, { incluyeModeloNuevo: true }))).toBe(
      conceptoDeMovimientoCaja({ categoria: "ingreso_flete_devolucion", incluyeModeloNuevo: true }),
    );
    expect(ROTULOS_TIENDA.concepto(IVA(2, { incluyeModeloNuevo: true }))).toBe(
      conceptoDeMovimientoCaja({ categoria: "ingreso_iva_flete_devolucion", incluyeModeloNuevo: true }),
    );
  });

  it("la tienda y la oficina no leen la misma frase: una habla de vos, la otra de la tienda (R44)", () => {
    const nueva = FLETE(1, { incluyeModeloNuevo: true });
    expect(ROTULOS_MI_WALLET.concepto(nueva)).not.toBe(ROTULOS_TIENDA.concepto(nueva));
  });

  it("el nombre con que se pide anular un cobro de la oficina sigue a la fila", () => {
    expect(PANEL_TIENDA.nombreParaAnular(FLETE(1, { incluyeModeloNuevo: true }))).toBe(
      "«Flete de gestiones no entregadas cobrado a la tienda»",
    );
    expect(PANEL_TIENDA.nombreParaAnular(FLETE(1, {}))).toBe("«Flete por devolución a origen cobrado a la tienda»");
  });
});
