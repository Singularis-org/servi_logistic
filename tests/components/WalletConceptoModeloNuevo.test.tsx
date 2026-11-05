// @vitest-environment jsdom
/**
 * SLT-54 (menor 6 de la revisión F2.2, tanda H2) — el concepto del cobro del cierre en el libro de la caja.
 *
 * Con el modelo nuevo ese cobro suma también reprogramado, novedad e incidente, así que «devolución a origen» es
 * falso. El campo sale del servidor (`tests/integration/db/cierre-incluye-modelo-nuevo.test.ts`); aquí se mide lo
 * que cada lector del libro hace con él: fila, nombre del desplegable, detalle y descarga. Los textos del viejo
 * van literales a propósito.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { WalletMovimientoDTO } from "@/lib/types/wallet";

vi.mock("@/lib/actions/pago-por-cuenta-tienda", () => ({
  anularPagoPorCuentaTiendaAction: vi.fn(),
  obtenerComprobantePagoPorCuentaAction: vi.fn(),
}));
vi.mock("@/lib/actions/aporte-capital", () => ({
  anularAporteCapitalAction: vi.fn(),
  obtenerComprobanteAporteCapitalAction: vi.fn(),
}));
vi.mock("@/lib/actions/wallet-egresos", () => ({
  reversarEgresoAdministrativoAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

import { conceptoDeCaja } from "@/app/(app)/wallet/_components/libro-caja-kardex";
import { detalleDeFilaCaja } from "@/app/(app)/wallet/_components/VerMovimientoCaja";
import { WalletLedger } from "@/app/(app)/wallet/_components/WalletLedger";
import { DETALLE_MOVIMIENTO_NOMBRE } from "@/app/(app)/wallet/_components/detalle-movimiento-labels";
import { fechaDiaMovimientoCR } from "@/lib/utils/fecha-dia-iso";
import { CATEGORIA_LABEL, conceptoDeMovimientoCaja } from "@/lib/constants/wallet-rotulos";

afterEach(() => cleanup());

const FLETE_VIEJO = "Flete por devolución a origen cobrado a la tienda";
const IVA_VIEJO = "IVA del flete por devolución a origen cobrado a la tienda";
const FLETE_NUEVO = "Flete de gestiones no entregadas cobrado a la tienda";
const IVA_NUEVO = "IVA del flete de gestiones no entregadas cobrado a la tienda";

const nombreDesplegable = (concepto: string, fecha: string): string =>
  DETALLE_MOVIMIENTO_NOMBRE.abrir(concepto, fechaDiaMovimientoCR(fecha));

function fila(over: Partial<WalletMovimientoDTO>): WalletMovimientoDTO {
  return {
    id: "m-1",
    tipo: "ingreso",
    categoria: "ingreso_flete_devolucion",
    monto: "500.00",
    origenTipo: "cierre_dia",
    origenId: "c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1",
    descripcion: null,
    registradoPor: null,
    fechaMovimiento: "2026-09-20T12:00:00.000Z",
    dueno: "propio",
    documento: null,
    ...over,
  };
}

describe("menor 6 — el rótulo de una fila", () => {
  it("nuevo: flete e IVA nombran lo que suman, con el texto de R65", () => {
    expect(conceptoDeMovimientoCaja({ categoria: "ingreso_flete_devolucion", incluyeModeloNuevo: true })).toBe(FLETE_NUEVO);
    expect(conceptoDeMovimientoCaja({ categoria: "ingreso_iva_flete_devolucion", incluyeModeloNuevo: true })).toBe(IVA_NUEVO);
  });

  it.each([
    ["falso", false],
    ["ausente", undefined],
  ])("viejo, con el campo %s: los textos de siempre, literales", (_n, campo) => {
    expect(conceptoDeMovimientoCaja({ categoria: "ingreso_flete_devolucion", incluyeModeloNuevo: campo })).toBe(FLETE_VIEJO);
    expect(conceptoDeMovimientoCaja({ categoria: "ingreso_iva_flete_devolucion", incluyeModeloNuevo: campo })).toBe(IVA_VIEJO);
  });

  it("el diccionario de la categoría no cambia: lo leen el filtro y los servicios", () => {
    expect(CATEGORIA_LABEL.ingreso_flete_devolucion).toBe(FLETE_VIEJO);
    expect(CATEGORIA_LABEL.ingreso_iva_flete_devolucion).toBe(IVA_VIEJO);
  });

  it("con el campo verdadero, las demás categorías dicen lo de siempre", () => {
    const categorias = Object.keys(CATEGORIA_LABEL) as WalletMovimientoDTO["categoria"][];
    const cambian = categorias.filter(
      (categoria) => conceptoDeMovimientoCaja({ categoria, incluyeModeloNuevo: true }) !== CATEGORIA_LABEL[categoria],
    );
    expect(cambian).toEqual(["ingreso_flete_devolucion", "ingreso_iva_flete_devolucion"]);
  });
});

describe("menor 6 — el libro de la caja", () => {
  it("nuevo: la fila y el nombre de su desplegable no hablan de devolución a origen", () => {
    render(<WalletLedger movimientos={[fila({ incluyeModeloNuevo: true })]} />);
    expect(screen.getAllByText(FLETE_NUEVO).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("devolución a origen");
    expect(screen.getByRole("button", { name: nombreDesplegable(FLETE_NUEVO, "2026-09-20T12:00:00.000Z") })).toBeInTheDocument();
  });

  it("mixto: en la misma página, cada fila sigue a su cierre", () => {
    render(
      <WalletLedger
        movimientos={[
          fila({ id: "m-1", fechaMovimiento: "2026-09-20T12:00:00.000Z", incluyeModeloNuevo: true }),
          fila({ id: "m-2", fechaMovimiento: "2026-09-10T12:00:00.000Z", incluyeModeloNuevo: false }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: nombreDesplegable(FLETE_NUEVO, "2026-09-20T12:00:00.000Z") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: nombreDesplegable(FLETE_VIEJO, "2026-09-10T12:00:00.000Z") })).toBeInTheDocument();
  });

  it.each([
    ["falso", false],
    ["ausente", undefined],
  ])("viejo, con el campo %s: la fila dice lo de siempre, literal", (_n, campo) => {
    render(<WalletLedger movimientos={[fila({ incluyeModeloNuevo: campo })]} />);
    expect(screen.getAllByText(FLETE_VIEJO).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("gestiones no entregadas");
  });

  it("el cobro por rechazo de una tienda sale falso del servidor y sigue diciendo devolución a origen", () => {
    render(<WalletLedger movimientos={[fila({ origenTipo: "gestion_orden", incluyeModeloNuevo: false })]} />);
    expect(screen.getAllByText(FLETE_VIEJO).length).toBeGreaterThan(0);
  });
});

describe("menor 6 — el detalle de la fila y la descarga dicen lo mismo que la tabla", () => {
  it("nuevo", () => {
    const m = fila({ incluyeModeloNuevo: true });
    expect(detalleDeFilaCaja(m).concepto).toBe(FLETE_NUEVO);
    expect(conceptoDeCaja(m)).toBe(FLETE_NUEVO);
  });

  it("mixto: el IVA del cierre nuevo y el flete del viejo, cada uno con el suyo", () => {
    expect(conceptoDeCaja(fila({ categoria: "ingreso_iva_flete_devolucion", incluyeModeloNuevo: true }))).toBe(IVA_NUEVO);
    expect(conceptoDeCaja(fila({ incluyeModeloNuevo: false }))).toBe(FLETE_VIEJO);
  });

  it.each([
    ["falso", false],
    ["ausente", undefined],
  ])("viejo, con el campo %s: literal", (_n, campo) => {
    const m = fila({ incluyeModeloNuevo: campo });
    expect(detalleDeFilaCaja(m).concepto).toBe(FLETE_VIEJO);
    expect(conceptoDeCaja(m)).toBe(FLETE_VIEJO);
  });
});
