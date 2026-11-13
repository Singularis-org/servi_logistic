// @vitest-environment jsdom
// SLT-113 «Excel del modelo nuevo de cierres» (T1.2, R370/R373) — el control común con un LIBRO ya
// resuelto por el consumidor. `construirDescarga` va ESPIADO (corre el real por debajo) y su llamada se
// compara con un literal escrito a mano:
//   (a) con `libro` de tres hojas → xlsx con `tituloHoja` y `hojasAdicionales`, y las columnas del
//       selector NO se aplican (las del libro, no las del control);
//   (b) sin `libro` → la llamada de siempre, SIN claves nuevas;
//   (c) con `detalle` declarado y sin `libro` → la llamada de siempre con su hoja de detalle.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DataTableDescargaDetalle, DescargaFilasResult } from "@/components/shared/DataTable";
import type { DescargaColumna, DescargaConfig, DescargaHoja } from "@/lib/types/descarga";

const H = vi.hoisted(() => ({ blob: vi.fn(), toastError: vi.fn(), construir: vi.fn() }));
vi.mock("@/components/shared/descargar-blob", () => ({ descargarBlob: (...a: unknown[]) => H.blob(...a) }));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: H.toastError, info: vi.fn(), warning: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/utils/descarga-dataset", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/utils/descarga-dataset")>();
  return {
    ...real,
    construirDescarga: (config: DescargaConfig, zona: string, fecha?: Date) => {
      H.construir(config, zona);
      return real.construirDescarga(config, zona, fecha);
    },
  };
});

import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";

// Columnas DEL CONTROL (el selector): ninguna está en el libro.
const COLUMNAS_CONTROL: DescargaColumna[] = [
  { clave: "fecha", encabezado: "Fecha" },
  { clave: "monto", encabezado: "Monto", formato: "monto" },
];
const FILAS_CONTROL = [{ fecha: "2026-11-06", monto: "4520.00" }];

const H1: DescargaHoja = {
  titulo: "Gestiones",
  columnas: [
    { clave: "folio", encabezado: "Folio del cierre" },
    { clave: "total", encabezado: "Se le cobra a la tienda", formato: "monto" },
  ],
  filas: [{ folio: "ABCD1234", total: "4520.00" }],
};
const H2: DescargaHoja = {
  titulo: "Rechazados por la tienda",
  columnas: [{ clave: "folio", encabezado: "Folio" }],
  filas: [],
};
const H3: DescargaHoja = {
  titulo: "Gestiones modelo anterior",
  columnas: [{ clave: "fecha", encabezado: "Fecha" }],
  filas: [{ fecha: "2026-11-06" }],
};

const DETALLE: DataTableDescargaDetalle = {
  titulo: "Detalle por guía",
  columnas: [{ clave: "guia", encabezado: "Guía" }],
  ambitoColumnas: "slt113-libro-detalle",
  etiquetaOpcion: "Con detalle · dos hojas",
  etiquetaSinDetalle: "Sin detalle · una hoja",
};

const obtener = vi.fn<(o?: { conDetalle: boolean }) => Promise<DescargaFilasResult>>();

async function descargar(props: Partial<Parameters<typeof DescargarDatasetButton>[0]> = {}) {
  const user = userEvent.setup();
  render(
    <DescargarDatasetButton
      titulo="Gestiones de cierres"
      columnas={COLUMNAS_CONTROL}
      obtenerFilas={obtener}
      ambitoColumnas="slt113-libro-principal"
      {...props}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Descargar Gestiones de cierres" }));
  // El generador se importa en dinámico (exceljs): con la suite en paralelo tarda más de 1 s.
  await waitFor(() => expect(H.blob).toHaveBeenCalled(), { timeout: 15_000 });
}

beforeEach(() => {
  localStorage.clear();
  H.blob.mockReset();
  H.toastError.mockReset();
  H.construir.mockReset();
  obtener.mockReset();
});
afterEach(cleanup);

describe("SLT-113 — DescargarDatasetButton con libro (T1.2)", () => {
  it("(a) con libro de tres hojas: xlsx con tituloHoja y hojasAdicionales; el selector no se aplica (R373)", async () => {
    obtener.mockResolvedValue({ status: "ok", filas: H1.filas, libro: { hojas: [H1, H2, H3] } });
    await descargar();
    expect(H.construir).toHaveBeenCalledTimes(1);
    expect(H.construir).toHaveBeenCalledWith(
      {
        tipo: "xlsx",
        titulo: "Gestiones de cierres",
        tituloHoja: "Gestiones",
        columnas: [
          { clave: "folio", encabezado: "Folio del cierre" },
          { clave: "total", encabezado: "Se le cobra a la tienda", formato: "monto" },
        ],
        filas: [{ folio: "ABCD1234", total: "4520.00" }],
        hojasAdicionales: [
          { titulo: "Rechazados por la tienda", columnas: [{ clave: "folio", encabezado: "Folio" }], filas: [] },
          { titulo: "Gestiones modelo anterior", columnas: [{ clave: "fecha", encabezado: "Fecha" }], filas: [{ fecha: "2026-11-06" }] },
        ],
      },
      "America/Costa_Rica",
    );
    expect(H.toastError).not.toHaveBeenCalled();
  });

  it("(b) sin libro: la llamada de siempre, sin tituloHoja ni hojasAdicionales (R370)", async () => {
    obtener.mockResolvedValue({ status: "ok", filas: FILAS_CONTROL });
    await descargar();
    expect(obtener).toHaveBeenCalledWith();
    expect(H.construir).toHaveBeenCalledTimes(1);
    expect(H.construir.mock.calls[0]).toEqual([
      {
        tipo: "xlsx",
        titulo: "Gestiones de cierres",
        columnas: [
          { clave: "fecha", encabezado: "Fecha" },
          { clave: "monto", encabezado: "Monto", formato: "monto" },
        ],
        filas: [{ fecha: "2026-11-06", monto: "4520.00" }],
      },
      "America/Costa_Rica",
    ]);
    // `toEqual` ignora claves con `undefined`: se afirma además que NO están.
    const config = H.construir.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(["columnas", "filas", "tipo", "titulo"]);
  });

  it("(c) con detalle declarado y sin libro: la llamada de siempre con su hoja de detalle (R370)", async () => {
    obtener.mockResolvedValue({ status: "ok", filas: FILAS_CONTROL, filasDetalle: [{ guia: "1001" }] });
    await descargar({ detalle: DETALLE });
    expect(obtener).toHaveBeenCalledWith({ conDetalle: true });
    expect(H.construir.mock.calls[0]).toEqual([
      {
        tipo: "xlsx",
        titulo: "Gestiones de cierres",
        columnas: [
          { clave: "fecha", encabezado: "Fecha" },
          { clave: "monto", encabezado: "Monto", formato: "monto" },
        ],
        filas: [{ fecha: "2026-11-06", monto: "4520.00" }],
        hojasAdicionales: [{ titulo: "Detalle por guía", columnas: [{ clave: "guia", encabezado: "Guía" }], filas: [{ guia: "1001" }] }],
      },
      "America/Costa_Rica",
    ]);
    const config = H.construir.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(["columnas", "filas", "hojasAdicionales", "tipo", "titulo"]);
  });
});
