// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import {
  formatearMontoEn,
  montoExacto,
  MONEDA_PLATAFORMA,
  SIN_MONTO_RAYA,
  type FormatoMoneda,
} from "@/lib/config/moneda";
import { MONEDA_CR, MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { ETIQUETAS_CR } from "@/tests/fabricas/etiquetas-geograficas";
import { DataTable } from "@/components/shared/DataTable";
import { EtiquetaGuia } from "@/app/(app)/ordenes/_components/EtiquetaGuia";
import { OrdenesCargaResumen } from "@/app/(app)/ordenes/_components/OrdenesCargaResumen";
import { OrdenesConMontoAjustadoTabla } from "@/app/(app)/ordenes/_components/OrdenesConMontoAjustadoTabla";
import {
  AVISO_SIN_TARIFA,
  CorregirUbicacionAviso,
} from "@/app/(app)/ordenes/_components/CorregirUbicacionAviso";
import { ordenesColumnsDe } from "@/app/(app)/ordenes/_components/ordenes-columns";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import {
  novedadAOrdenCard,
  SECCIONES_NOVEDAD,
} from "@/app/(app)/novedades/_components/novedad-a-orden-card";
import type { EtiquetaGuiaDTO } from "@/lib/types/etiqueta-guia";
import type { ResumenCargaOrdenDTO } from "@/lib/types/carga-masiva-resumen";
import type { OrdenListItemDTO } from "@/lib/types/orden";
import type { NovedadDTO } from "@/lib/types/novedad";
import type {
  AvisoCambioUbicacion,
  UbicacionConCostos,
} from "@/lib/interfaces/services/ICorregirDatosClienteService";

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

// Dobles del resumen de la carga masiva (R2), los mismos que `OrdenesCargaResumen.test.tsx`: la
// lectura del lote, el toast del botón de manifiesto y la acción del modal de etiquetas.
const { resumenCargaMasivaMock } = vi.hoisted(() => ({ resumenCargaMasivaMock: vi.fn() }));
vi.mock("@/lib/actions/carga-masiva-resumen", () => ({
  resumenCargaMasiva: resumenCargaMasivaMock,
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));
vi.mock("@/lib/actions/etiquetas-guia", () => ({
  generarEtiquetas: vi.fn(async () => ({ status: "ok", etiquetas: [], omitidas: [] })),
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

// ── Piezas comunes de las tablas ─────────────────────────────────────────────────────────────

/** El texto de cada celda (`td`) de lo que pinta `ui`, con el proveedor de `moneda` o sin él. */
function celdasDe(ui: ReactElement, moneda?: FormatoMoneda): string[] {
  const { unmount } = render(ui, moneda ? { wrapper: conPais(moneda) } : undefined);
  const celdas = screen.getAllByRole("cell").map((td) => (td.textContent ?? "").trim());
  unmount();
  return celdas;
}

// ── R1: las celdas de importe del listado de órdenes (ordenes-columns) ─────────────────────────

/** Una orden del listado con los cuatro importes que pinta (ya cumple por SLT-235: solo test). */
function makeOrdenListado(): OrdenListItemDTO {
  return {
    id: "o1",
    numGuia: 1000,
    numRemision: "REM-R1",
    estatusId: "est-id",
    estatusValue: undefined,
    destinatario: "Destino",
    telefonoDest: "0999999999",
    tiendaId: "tienda-uuid",
    tiendaNombre: "Tienda X",
    zonaId: "zona-1",
    provinciaId: "prov-1",
    cantonId: "canton-1",
    distritoId: null,
    producto: "Producto",
    peso: 1,
    notas: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    montoCobrar: IMPORTE,
    fleteConIva: "3450.75",
    fulfillment: "1200.40",
    comisionConIva: "980.25",
  };
}

/** Los cuatro importes de la orden del listado: monto a cobrar, flete, fulfillment y comisión. */
const IMPORTES_LISTADO: (string | number)[] = [IMPORTE, "3450.75", "1200.40", "980.25"];

function celdasDelListado(moneda?: FormatoMoneda): string[] {
  return celdasDe(
    <DataTable
      columns={ordenesColumnsDe(ETIQUETAS_CR)}
      data={[makeOrdenListado()]}
      rowKey="id"
      ariaLabel="Órdenes"
    />,
    moneda,
  );
}

describe("SLT-240 R1 — celdas de importe del listado de órdenes (ordenes-columns)", () => {
  it("con la moneda de prueba, monto, flete, fulfillment y comisión salen en la moneda del país", () => {
    const celdas = celdasDelListado(MONEDA_DE_PRUEBA);
    for (const valor of IMPORTES_LISTADO) {
      expect(celdas).toContain(formatearMontoEn(MONEDA_DE_PRUEBA, valor));
      expect(celdas).not.toContain(formatearMontoEn(MONEDA_PLATAFORMA, valor));
    }
  });

  it("R13: sin proveedor, con la moneda de la plataforma", () => {
    const celdas = celdasDelListado();
    for (const valor of IMPORTES_LISTADO) {
      expect(celdas).toContain(formatearMontoEn(MONEDA_PLATAFORMA, valor));
    }
  });

  it("R12: con la moneda de CR, las mismas celdas que sin proveedor", () => {
    expect(celdasDelListado(MONEDA_CR)).toEqual(celdasDelListado());
  });
});

// ── R2: el resumen de la carga masiva (OrdenesCargaResumen) ──────────────────────────────────

function unaOrdenDelLote(montoCobrar: number | null): ResumenCargaOrdenDTO[] {
  return [
    {
      id: "o1",
      numGuia: 1,
      numRemision: "REM-0001",
      destinatario: "Juan Pérez",
      telefonoDest: "0999999999",
      producto: "Camiseta",
      montoCobrar,
      direccion: "Avenida Principal",
      estatusValue: "en_preparacion",
      zonaId: "z1",
      zonaNombre: "Norte",
    },
  ];
}

/** Las celdas del resumen de un lote doblado con `montoCobrar`, ya resuelto. */
async function celdasDelResumen(montoCobrar: number | null, moneda?: FormatoMoneda): Promise<string[]> {
  resumenCargaMasivaMock.mockResolvedValue({ status: "ok", ordenes: unaOrdenDelLote(montoCobrar) });
  const { unmount } = render(
    <OrdenesCargaResumen numRemisiones={["REM-0001"]} />,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
  await screen.findByText("REM-0001");
  const celdas = screen.getAllByRole("cell").map((td) => (td.textContent ?? "").trim());
  unmount();
  return celdas;
}

describe("SLT-240 R2 — resumen de la carga masiva (OrdenesCargaResumen)", () => {
  it("con la moneda de prueba, el monto sale en «€» con espacio de miles", async () => {
    const celdas = await celdasDelResumen(IMPORTE, MONEDA_DE_PRUEBA);
    expect(celdas).toContain(formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE));
    expect(celdas).toContain("€12 501");
    expect(celdas).not.toContain(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
  });

  it("R13: sin proveedor, con la moneda de la plataforma", async () => {
    expect(await celdasDelResumen(IMPORTE)).toContain(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
  });

  it("R12: con la moneda de CR, las mismas celdas que sin proveedor", async () => {
    expect(await celdasDelResumen(IMPORTE, MONEDA_CR)).toEqual(await celdasDelResumen(IMPORTE));
  });

  it("sin monto pinta `-`, con la moneda de prueba, con la de CR y sin proveedor", async () => {
    expect(await celdasDelResumen(null, MONEDA_DE_PRUEBA)).toContain("-");
    expect(await celdasDelResumen(null, MONEDA_CR)).toContain("-");
    expect(await celdasDelResumen(null)).toContain("-");
  });
});

// ── R3: la tabla del monto redondeado (OrdenesConMontoAjustadoTabla) ──────────────────────────

const ORIGINAL = 11898.81;
const APLICADO = 11899;

/** Los textos de «Monto del archivo» y «Monto aplicado» de la única fila de la tabla. */
function montosAjustados(moneda?: FormatoMoneda): { original: string; aplicado: string } {
  const { unmount } = render(
    <OrdenesConMontoAjustadoTabla
      ajustadas={[{ fila: 3, numRemision: "REM-3", original: ORIGINAL, aplicado: APLICADO }]}
      descripcion="Descripción"
    />,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
  const fila = screen.getByRole("row", { name: /REM-3/ });
  const celdas = within(fila).getAllByRole("cell").map((td) => (td.textContent ?? "").trim());
  unmount();
  // Columnas: Fila, Nº Remisión, Monto del archivo, Monto aplicado.
  return { original: celdas[2], aplicado: celdas[3] };
}

describe("SLT-240 R3 — tabla del monto redondeado (OrdenesConMontoAjustadoTabla)", () => {
  it("con la moneda de prueba (0 decimales), símbolo y miles del país y la cola de 2 decimales", () => {
    const { original, aplicado } = montosAjustados(MONEDA_DE_PRUEBA);
    expect(original).toBe("€11 898.81");
    expect(aplicado).toBe("€11 899");
    // Dos montos distintos no salen con el mismo texto, aunque la moneda no tenga decimales.
    expect(original).not.toBe(aplicado);
  });

  it("R13: sin proveedor, byte a byte lo de `montoExacto`", () => {
    expect(montosAjustados()).toEqual({
      original: montoExacto(ORIGINAL),
      aplicado: montoExacto(APLICADO),
    });
  });

  it("R12: con la moneda de CR, el mismo texto que sin proveedor", () => {
    expect(montosAjustados(MONEDA_CR)).toEqual(montosAjustados());
  });
});

// ── R4: el aviso de cambio de ubicación (CorregirUbicacionAviso) ──────────────────────────────

function ubicacion(over: Partial<UbicacionConCostos>): UbicacionConCostos {
  return {
    zonaId: "z1",
    zonaNombre: "Zona actual",
    distritoNombre: "Distrito actual",
    esCentral: true,
    esZonaEspecial: false,
    tarifa: "resuelta",
    fleteConIva: "3450.75",
    comisionConIva: "980.25",
    fleteOrigen: "normal",
    ...over,
  };
}

/** La actual con tarifa y la propuesta sin ella: los importes solo pueden salir de la actual. */
const AVISO: AvisoCambioUbicacion = {
  actual: ubicacion({}),
  propuesta: ubicacion({
    zonaId: "z2",
    zonaNombre: "Zona propuesta",
    distritoNombre: "Distrito propuesto",
    tarifa: "sin_tarifa",
    fleteConIva: "0.00",
    comisionConIva: "0.00",
  }),
  yaEnUnCierre: false,
};

function celdasDelAviso(moneda?: FormatoMoneda): string[] {
  return celdasDe(<CorregirUbicacionAviso aviso={AVISO} onConfirmar={() => {}} />, moneda);
}

/** Flete y comisión de la ubicación actual como los pinta el aviso (raya larga sin importe). */
const importesDelAviso = (moneda: FormatoMoneda) => [
  formatearMontoEn(moneda, "3450.75", SIN_MONTO_RAYA),
  formatearMontoEn(moneda, "980.25", SIN_MONTO_RAYA),
];

describe("SLT-240 R4 — aviso de cambio de ubicación (CorregirUbicacionAviso)", () => {
  it("con la moneda de prueba, flete y comisión salen en la moneda del país", () => {
    const celdas = celdasDelAviso(MONEDA_DE_PRUEBA);
    for (const texto of importesDelAviso(MONEDA_DE_PRUEBA)) expect(celdas).toContain(texto);
    for (const texto of importesDelAviso(MONEDA_PLATAFORMA)) expect(celdas).not.toContain(texto);
  });

  it("la ubicación sin tarifa sigue diciendo «Sin tarifa configurada», con la de prueba, la de CR y sin proveedor", () => {
    for (const moneda of [MONEDA_DE_PRUEBA, MONEDA_CR, undefined]) {
      const celdas = celdasDelAviso(moneda);
      expect(celdas.filter((c) => c === AVISO_SIN_TARIFA)).toHaveLength(2);
    }
  });

  it("R13: sin proveedor, con la moneda de la plataforma", () => {
    const celdas = celdasDelAviso();
    for (const texto of importesDelAviso(MONEDA_PLATAFORMA)) expect(celdas).toContain(texto);
  });

  it("R12: con la moneda de CR, las mismas celdas que sin proveedor", () => {
    expect(celdasDelAviso(MONEDA_CR)).toEqual(celdasDelAviso());
  });
});

// ── R8: las tarjetas de novedades (PosOrderCardDetalle con novedadAOrdenCard) ──────────────────

function makeNovedad(): NovedadDTO {
  return {
    id: "n1",
    numGuia: 12345,
    numRemision: "REM-90210",
    estatusValue: "novedad",
    intentosContacto: 0,
    mensajeroNombre: "Marta Mensajera",
    destinatario: "Ana Cliente",
    telefonoDest: "88887777",
    causa: "not_found",
    producto: "Zapatos deportivos",
    peso: 1.5,
    direccion: "Av. Central 120",
    montoCobrar: IMPORTE,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre: "Tienda Demo",
    zonaNombre: "GAM Oeste",
    provinciaNombre: "Provincia",
    cantonNombre: "Cantón",
    distritoNombre: "Distrito",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: null,
  };
}

/** El texto entero de la tarjeta de detalle tal como la monta `NovedadesModule`. */
function textoDeLaTarjeta(moneda?: FormatoMoneda): string {
  const { container, unmount } = render(
    <PosOrderCardDetalle
      orden={novedadAOrdenCard(makeNovedad())}
      total={1}
      mostrarRuta={false}
      secciones={SECCIONES_NOVEDAD}
    />,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
  const texto = container.textContent ?? "";
  unmount();
  return texto;
}

describe("SLT-240 R8 — tarjeta de novedades (PosOrderCardDetalle + novedadAOrdenCard)", () => {
  it("con la moneda de prueba, el monto a cobrar sale en la moneda del país", () => {
    const texto = textoDeLaTarjeta(MONEDA_DE_PRUEBA);
    expect(texto).toContain(formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE));
    expect(texto).not.toContain(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
  });

  it("R13: sin proveedor, con la moneda de la plataforma", () => {
    expect(textoDeLaTarjeta()).toContain(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
  });

  it("R12: con la moneda de CR, el mismo texto que sin proveedor", () => {
    expect(textoDeLaTarjeta(MONEDA_CR)).toBe(textoDeLaTarjeta());
  });
});
