// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import { formatearMontoEn, MONEDA_PLATAFORMA, type FormatoMoneda } from "@/lib/config/moneda";
import { MONEDA_CR, MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { EtiquetaGuia } from "@/app/(app)/ordenes/_components/EtiquetaGuia";
import type { EtiquetaGuiaDTO } from "@/lib/types/etiqueta-guia";

// SLT-240 — Moneda del país en pantallas: órdenes, novedades e incidentes
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Un archivo para toda la ficha (design §9). Cada caso se monta con `MonedaDelPaisProvider` y la
// moneda de prueba (impuesto «IGV»), con la de CR («IVA») y sin proveedor: con CR el texto debe ser
// el mismo que sin proveedor (R12, R13). Las piezas comunes van arriba; un `describe` por pantalla.

// Stubs de QR/barcode de la etiqueta: evitan el canvas real, que jsdom no trae.
vi.mock("qrcode.react", () => ({
  QRCodeCanvas: () => <canvas data-testid="qr-stub" />,
}));
vi.mock("react-barcode", () => ({
  default: ({ value }: { value: string }) => <div data-testid="barcode-stub" data-value={value} />,
}));

/** El nombre de impuesto del país de prueba: otro que el de la plataforma. */
const IMPUESTO_DE_PRUEBA = "IGV";

/** Envoltorio con el proveedor del portal para `moneda` (y el impuesto que le corresponde). */
function conPais(moneda: FormatoMoneda) {
  const impuestoNombre = moneda === MONEDA_DE_PRUEBA ? IMPUESTO_DE_PRUEBA : "IVA";
  return function Envoltorio({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MonedaDelPaisProvider moneda={moneda} impuestoNombre={impuestoNombre}>
        {children}
      </MonedaDelPaisProvider>
    );
  };
}

/**
 * Un importe con cola y miles: con la moneda de prueba (0 decimales, espacio de miles) se pinta
 * redondo y con otro aspecto que con la de CR, así que un caso no pasa por casualidad.
 */
const IMPORTE = 12500.5;

afterEach(() => {
  cleanup();
});

// ── R5: la vista previa de la etiqueta ────────────────────────────────────────────────────────

function makeEtiqueta(montoCobrar: number | null): EtiquetaGuiaDTO {
  return {
    ordenId: "o1",
    numGuia: 1042,
    numRemision: "REM-1",
    destinatario: "Ana Perez",
    telefonoDest: "0999999999",
    direccion: "Av. Central 100",
    producto: "Caja x2",
    montoCobrar,
    tiendaNombre: "Tienda Uno",
    zonaNombre: "GAM",
    provinciaNombre: "San Jose",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    fechaCreacion: "2026-08-27",
    qrValue: "1042",
    barcodeValue: "1042",
  };
}

/** El texto del importe de la vista previa con el proveedor de `moneda`, o sin proveedor. */
function montoDeLaEtiqueta(montoCobrar: number | null, moneda?: FormatoMoneda): string {
  const { unmount } = render(
    <EtiquetaGuia etiqueta={makeEtiqueta(montoCobrar)} />,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
  const texto = (screen.getByTestId("etiqueta-monto").textContent ?? "").trim();
  unmount();
  return texto;
}

describe("SLT-240 R5 — vista previa de la etiqueta (EtiquetaGuia)", () => {
  it("con la moneda de prueba, el monto a cobrar sale en la moneda del país", () => {
    const texto = montoDeLaEtiqueta(IMPORTE, MONEDA_DE_PRUEBA);
    expect(texto).toBe(formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE));
    expect(texto).not.toBe(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
  });

  it("R13: sin proveedor, con la moneda de la plataforma", () => {
    expect(montoDeLaEtiqueta(IMPORTE)).toBe(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
  });

  it("R12: con la moneda de CR, el mismo texto que sin proveedor", () => {
    expect(montoDeLaEtiqueta(IMPORTE, MONEDA_CR)).toBe(montoDeLaEtiqueta(IMPORTE));
  });

  it("sin monto pinta `-`, con la moneda de prueba, con la de CR y sin proveedor", () => {
    expect(montoDeLaEtiqueta(null, MONEDA_DE_PRUEBA)).toBe("-");
    expect(montoDeLaEtiqueta(null, MONEDA_CR)).toBe("-");
    expect(montoDeLaEtiqueta(null)).toBe("-");
  });
});
