// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement, ReactNode } from "react";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import {
  formatearMontoEn,
  formatearTopeEn,
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
import { OrdenesModule } from "@/app/(app)/ordenes/_components/OrdenesModule";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import {
  novedadAOrdenCard,
  SECCIONES_NOVEDAD,
} from "@/app/(app)/novedades/_components/novedad-a-orden-card";
import {
  IncidentesAdminModule,
  APROBAR_CONFIRMAR,
  MONTO_LABEL,
  montoAyuda,
  montoExcede,
} from "@/app/(app)/incidentes/_components/IncidentesAdminModule";
import { HistorialAccionesModule } from "@/app/(app)/historico/acciones/_components/HistorialAccionesModule";
import { columnasHistorialAcciones } from "@/app/(app)/historico/acciones/_components/historial-acciones-columnas";
import { montoValido } from "@/app/(app)/wallet/_components/wallet-labels";
import { verIncidente } from "@/lib/actions/incidentes";
import { INDEMNIZACION_MONTO_MAX } from "@/lib/types/cierres-admin";
import type { IncidenteAdminDTO } from "@/lib/interfaces/services/IIncidenteAdminService";
import type { HistorialAccionDTO, ListarHistorialAccionesResult } from "@/lib/types/historial-accion";
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
// Dobles de la cola de incidentes (R9, R10), los mismos que `IncidentesAdminModule.test.tsx`: las
// acciones del servidor y el router del refresco.
vi.mock("@/lib/actions/incidentes", () => ({
  verIncidente: vi.fn(),
  aprobarIncidente: vi.fn(),
  rechazarIncidente: vi.fn(),
  retractarIncidente: vi.fn(),
  listarHistoricoIncidentesPaginado: vi.fn(),
  listarPendientesIncidentesPaginado: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// El registro de acciones (R11) recibe su listado por la prop `acciones`; esto solo evita que el
// módulo arrastre las acciones reales del servidor.
vi.mock("@/lib/actions/historial-acciones", () => ({
  listarHistorialAccionesPaginado: vi.fn(),
  listarHistorialAccionesCompleto: vi.fn(),
  obtenerCatalogoActoresHistorial: vi.fn(),
}));
vi.mock("@/lib/actions/etiquetas-guia", () => ({
  generarEtiquetas: vi.fn(async () => ({ status: "ok", etiquetas: [], omitidas: [] })),
}));
// El listado de órdenes (R16) se monta con `OrdenesModule` real; esto solo dobla sus lecturas, como
// `OrdenesDescargaColumnas.test.tsx`.
const { listarOrdenesMock } = vi.hoisted(() => ({ listarOrdenesMock: vi.fn() }));
vi.mock("@/lib/actions/ordenes", () => ({
  listarOrdenes: listarOrdenesMock,
  listarOrdenesCompleto: vi.fn(),
}));
vi.mock("@/lib/actions/order-status", () => ({
  listarOrderStatus: vi.fn(async () => ({ status: "ok", estatus: [] })),
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

// ── R16: los rótulos con impuesto de órdenes (listado, su descarga y el aviso) ──────────────────

/** Los rótulos de las filas del aviso (`th scope="row"`), con el proveedor de `moneda` o sin él. */
function rotulosDelAviso(moneda?: FormatoMoneda): string[] {
  const { unmount } = render(
    <CorregirUbicacionAviso aviso={AVISO} onConfirmar={() => {}} />,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
  const rotulos = screen.getAllByRole("rowheader").map((th) => (th.textContent ?? "").trim());
  unmount();
  return rotulos;
}

/** Monta el listado REAL (`OrdenesModule`) con la descarga, con el proveedor de `moneda` o sin él. */
async function montarListado(moneda?: FormatoMoneda) {
  listarOrdenesMock.mockResolvedValue({
    status: "ok",
    items: [makeOrdenListado()],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  const utils = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <OrdenesModule permitirDescarga />
    </SWRConfig>,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
  await screen.findByText("REM-R1");
  return utils;
}

/** Los encabezados de columna del listado montado por `OrdenesModule`. */
async function encabezadosDelListado(moneda?: FormatoMoneda): Promise<string[]> {
  const { unmount } = await montarListado(moneda);
  const encabezados = screen.getAllByRole("columnheader").map((th) => (th.textContent ?? "").trim());
  unmount();
  return encabezados;
}

describe("SLT-240 R16 — rótulos con impuesto de órdenes", () => {
  it("listado (OrdenesModule): con el país de prueba, «Flete + IGV» y «Comisión + IGV»", async () => {
    const encabezados = await encabezadosDelListado(MONEDA_DE_PRUEBA);
    expect(encabezados).toContain(`Flete + ${IMPUESTO_DE_PRUEBA}`);
    expect(encabezados).toContain(`Comisión + ${IMPUESTO_DE_PRUEBA}`);
    expect(encabezados).not.toContain(`Flete + ${IMPUESTO_ROTULO}`);
    expect(encabezados).not.toContain(`Comisión + ${IMPUESTO_ROTULO}`);
  });

  it("listado, R13 y R12: sin proveedor «Flete + IVA», y con CR los mismos encabezados", async () => {
    const sinProveedor = await encabezadosDelListado();
    expect(sinProveedor).toContain("Flete + IVA");
    expect(sinProveedor).toContain("Comisión + IVA");
    expect(await encabezadosDelListado(MONEDA_CR)).toEqual(sinProveedor);
  });

  it("descarga del listado (OrdenesModule): el selector de columnas ofrece «Flete + IGV» y «Comisión + IGV»", async () => {
    const user = userEvent.setup();
    const { unmount } = await montarListado(MONEDA_DE_PRUEBA);
    await user.click(screen.getAllByRole("button", { name: "Elegir columnas de la descarga" })[0]!);
    expect(screen.getByRole("checkbox", { name: `Flete + ${IMPUESTO_DE_PRUEBA}` })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: `Comisión + ${IMPUESTO_DE_PRUEBA}` })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: `Flete + ${IMPUESTO_ROTULO}` })).toBeNull();
    unmount();
  });

  it("aviso de cambio de ubicación: con el país de prueba, «Flete + IGV» y «Comisión + IGV»", () => {
    const rotulos = rotulosDelAviso(MONEDA_DE_PRUEBA);
    expect(rotulos).toContain(`Flete + ${IMPUESTO_DE_PRUEBA}`);
    expect(rotulos).toContain(`Comisión + ${IMPUESTO_DE_PRUEBA}`);
    expect(rotulos).not.toContain(`Flete + ${IMPUESTO_ROTULO}`);
  });

  it("aviso, R13 y R12: sin proveedor «Flete + IVA», y con CR los mismos rótulos", () => {
    const sinProveedor = rotulosDelAviso();
    expect(sinProveedor).toContain("Flete + IVA");
    expect(sinProveedor).toContain("Comisión + IVA");
    expect(rotulosDelAviso(MONEDA_CR)).toEqual(sinProveedor);
  });
});

/** Los cuatro archivos de design §5 que pintan los rótulos con impuesto de órdenes. */
const CENSO_SIN_IVA = [
  "app/(app)/ordenes/_components/ordenes-columns.tsx",
  "app/(app)/ordenes/_components/ordenes-descarga-columnas.ts",
  "app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx",
  "app/(app)/ordenes/_components/rotulos-con-impuesto.ts",
];

/** ¿Escribe el código (sin comentarios) la palabra «IVA»? */
const escribeIva = (fuente: string) => /\bIVA\b/.test(quitarComentarios(fuente));

describe("SLT-240 R16 — censo «sin IVA» de los rótulos con impuesto de órdenes", () => {
  it.each(CENSO_SIN_IVA)("%s no escribe «IVA» fuera de los comentarios", (archivo) => {
    expect(escribeIva(readFileSync(join(process.cwd(), archivo), "utf8"))).toBe(false);
  });

  it("contraprueba: un «IVA» en el código se detecta; en un comentario, no; `fleteConIva`, tampoco", () => {
    expect(escribeIva('export const ROTULO = "Flete + IVA";')).toBe(true);
    expect(escribeIva("const r = <th>Comisión + IVA</th>;")).toBe(true);
    expect(escribeIva('// el flete + IVA\n/* comisión + IVA */\nexport const r = "Flete";')).toBe(false);
    expect(escribeIva("const v = orden.fleteConIva;")).toBe(false);
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

// ── R9 y R10: la cola de incidentes (IncidentesAdminModule + IncidentesHistoricoTabla) ─────────

/** Una indemnización con cola y miles, en el STRING de escala 2 que entrega el servidor. */
const INDEMNIZACION = "12500.50";

function makeIncidente(over: Partial<IncidenteAdminDTO> & { incidenteId: string }): IncidenteAdminDTO {
  return {
    ordenId: `o-${over.incidenteId}`,
    numGuia: 1001,
    numRemision: "REM-001",
    destinatario: "Beto Ruiz",
    zonaNombre: "GAM",
    estatusValue: "incidente",
    causa: "danado",
    motivo: "Caja aplastada",
    estado: "solicitado",
    indemnizacion: null,
    reportadoPorNombre: "Ana Admin",
    resueltoPorNombre: null,
    resueltoAt: null,
    motivoRechazo: null,
    createdAt: "2026-07-30T10:00:00.000Z",
    evidenciaUrls: [],
    esPropio: false,
    ...over,
  };
}

const PENDIENTE = makeIncidente({ incidenteId: "i1" });
const RESUELTO = makeIncidente({
  incidenteId: "i2",
  numRemision: "REM-002",
  estado: "aprobado",
  indemnizacion: INDEMNIZACION,
  resueltoPorNombre: "Carla Admin",
  resueltoAt: "2026-07-30T12:00:00.000Z",
});
const RESUELTO_SIN_IMPORTE = makeIncidente({
  incidenteId: "i3",
  numRemision: "REM-003",
  estado: "rechazado",
  motivoRechazo: "No procede",
});

function pagina<T>(items: T[]) {
  return { items, total: items.length, pageSize: 25 };
}

/** Monta la cola con un pendiente y dos resueltos, con el proveedor de `moneda` o sin él. */
function montarIncidentes(moneda?: FormatoMoneda) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnMount: false }}>
      <IncidentesAdminModule
        pendientes={pagina([PENDIENTE])}
        historico={pagina([RESUELTO, RESUELTO_SIN_IMPORTE])}
        sinZona={false}
      />
    </SWRConfig>,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
}

/** La celda «Indemnización» de cada fila del histórico, en orden. */
function indemnizacionesDelHistorico(moneda?: FormatoMoneda): string[] {
  const { unmount } = montarIncidentes(moneda);
  const tabla = screen.getByRole("table", { name: "Histórico" });
  const columna = within(tabla)
    .getAllByRole("columnheader")
    .findIndex((th) => (th.textContent ?? "").trim() === "Indemnización");
  const celdas = within(tabla)
    .getAllByRole("row")
    .slice(1)
    .map((tr) => (within(tr).getAllByRole("cell")[columna].textContent ?? "").trim());
  unmount();
  return celdas;
}

const VER_RESUELTO = "Ver el incidente de la orden REM-002";
const VER_PENDIENTE = "Ver o decidir el incidente de la orden REM-001";

/** El valor del dato «Indemnización» del detalle de `incidente`, abierto desde su botón. */
async function indemnizacionDelDetalle(
  incidente: IncidenteAdminDTO,
  boton: string,
  moneda?: FormatoMoneda,
): Promise<string> {
  vi.mocked(verIncidente).mockResolvedValue({ status: "ok", incidente });
  const user = userEvent.setup();
  const { unmount } = montarIncidentes(moneda);
  await user.click(screen.getByRole("button", { name: boton }));
  const dialogo = await screen.findByRole("dialog", { name: "Detalle del incidente" });
  const rotulo = within(dialogo).getByText(/^Indemnización:/);
  const texto = (rotulo.nextElementSibling?.textContent ?? "").trim();
  unmount();
  return texto;
}

describe("SLT-240 R9 — indemnización de la cola de incidentes", () => {
  it("columna del histórico: con la moneda de prueba, en la moneda del país; sin importe, `—`", () => {
    const [conImporte, sinImporte] = indemnizacionesDelHistorico(MONEDA_DE_PRUEBA);
    expect(conImporte).toBe(formatearMontoEn(MONEDA_DE_PRUEBA, INDEMNIZACION));
    expect(conImporte).not.toBe(formatearMontoEn(MONEDA_PLATAFORMA, INDEMNIZACION));
    expect(sinImporte).toBe(SIN_MONTO_RAYA);
  });

  it("columna del histórico, R13: sin proveedor, con la moneda de la plataforma", () => {
    expect(indemnizacionesDelHistorico()).toEqual([
      formatearMontoEn(MONEDA_PLATAFORMA, INDEMNIZACION),
      SIN_MONTO_RAYA,
    ]);
  });

  it("columna del histórico, R12: con la moneda de CR, las mismas celdas que sin proveedor", () => {
    expect(indemnizacionesDelHistorico(MONEDA_CR)).toEqual(indemnizacionesDelHistorico());
  });

  it("detalle: con la moneda de prueba, en la moneda del país", async () => {
    const texto = await indemnizacionDelDetalle(RESUELTO, VER_RESUELTO, MONEDA_DE_PRUEBA);
    expect(texto).toBe(formatearMontoEn(MONEDA_DE_PRUEBA, INDEMNIZACION));
    expect(texto).not.toBe(formatearMontoEn(MONEDA_PLATAFORMA, INDEMNIZACION));
  });

  it("detalle sin importe (pendiente): `—`, con la moneda de prueba, con la de CR y sin proveedor", async () => {
    expect(await indemnizacionDelDetalle(PENDIENTE, VER_PENDIENTE, MONEDA_DE_PRUEBA)).toBe(SIN_MONTO_RAYA);
    expect(await indemnizacionDelDetalle(PENDIENTE, VER_PENDIENTE, MONEDA_CR)).toBe(SIN_MONTO_RAYA);
    expect(await indemnizacionDelDetalle(PENDIENTE, VER_PENDIENTE)).toBe(SIN_MONTO_RAYA);
  });

  it("detalle, R13 y R12: sin proveedor la de la plataforma, y con la de CR el mismo texto", async () => {
    const sinProveedor = await indemnizacionDelDetalle(RESUELTO, VER_RESUELTO);
    expect(sinProveedor).toBe(formatearMontoEn(MONEDA_PLATAFORMA, INDEMNIZACION));
    expect(await indemnizacionDelDetalle(RESUELTO, VER_RESUELTO, MONEDA_CR)).toBe(sinProveedor);
  });
});

/** La ayuda y el error de «excede» del formulario de aprobación, con el proveedor de `moneda`. */
async function textosDelTope(moneda?: FormatoMoneda): Promise<{ ayuda: string; excede: string }> {
  vi.mocked(verIncidente).mockResolvedValue({ status: "ok", incidente: PENDIENTE });
  const user = userEvent.setup();
  const { unmount } = montarIncidentes(moneda);
  await user.click(screen.getByRole("button", { name: VER_PENDIENTE }));
  await screen.findByRole("dialog", { name: "Detalle del incidente" });
  await user.click(screen.getByRole("button", { name: "Aprobar" }));
  await screen.findByRole("button", { name: APROBAR_CONFIRMAR });
  const campo = screen.getByLabelText(MONTO_LABEL);
  const ayuda = (document.getElementById("incidente-monto-ayuda")?.textContent ?? "").trim();
  fireEvent.change(campo, { target: { value: "99999999999.99" } }); // 11 dígitos enteros
  const excede = (screen.getByRole("alert").textContent ?? "").trim();
  unmount();
  return { ayuda, excede };
}

describe("SLT-240 R10 — tope de la indemnización en el formulario de aprobación", () => {
  it("con la moneda de prueba (0 decimales), la ayuda y el error escriben el tope en la moneda del país", async () => {
    const { ayuda, excede } = await textosDelTope(MONEDA_DE_PRUEBA);
    expect(ayuda).toBe(montoAyuda(MONEDA_DE_PRUEBA));
    expect(excede).toBe(montoExcede(MONEDA_DE_PRUEBA));
    // Cuadrado hacia el cero a la escala de la moneda: sin cola y sin subir a 10 000 000 000.
    expect(excede).toContain("€9 999 999 999 (");
    expect(ayuda).toContain("€9 999 999 999,");
    expect(excede).not.toBe(montoExcede(MONEDA_PLATAFORMA));
  });

  it("el tope anunciado con una moneda de 0 decimales NUNCA queda por encima del que acepta el validador", () => {
    const anunciado = formatearTopeEn(MONEDA_DE_PRUEBA, INDEMNIZACION_MONTO_MAX, SIN_MONTO_RAYA);
    expect(montoExcede(MONEDA_DE_PRUEBA)).toContain(anunciado);
    const comoSeTeclearia = anunciado
      .replace(MONEDA_DE_PRUEBA.simbolo, "")
      .split(MONEDA_DE_PRUEBA.separadorMiles)
      .join("");
    expect(montoValido(comoSeTeclearia, INDEMNIZACION_MONTO_MAX)).toBe(true);
  });

  it("R13: sin proveedor, el tope en la moneda de la plataforma", async () => {
    const { ayuda, excede } = await textosDelTope();
    expect(ayuda).toBe(montoAyuda(MONEDA_PLATAFORMA));
    expect(excede).toBe(montoExcede(MONEDA_PLATAFORMA));
  });

  it("R12: con la moneda de CR, los mismos textos que sin proveedor", async () => {
    expect(await textosDelTope(MONEDA_CR)).toEqual(await textosDelTope());
  });
});

// ── R11: el registro de acciones (HistorialAccionesModule) ──────────────────────────────────

/** El monto del registro: STRING de escala 2, como lo entrega el servidor. */
const MONTO_REGISTRO = "1234.50";

function filaDelRegistro(id: string, monto: string | null): HistorialAccionDTO {
  return {
    id,
    fecha: "2026-09-02T05:30:00.000Z",
    accion: "orden_eliminada",
    accionLabel: "Eliminó una orden",
    categoria: "hace_desaparecer",
    entidadTipo: "orden",
    entidadEtiqueta: `Guía ${id}`,
    actorNombre: "Ana Mora",
    actorRol: "admin",
    monto,
    valorAnterior: null,
    valorNuevo: null,
    loteId: `l-${id}`,
  };
}

/** La columna «Importe» de las filas del registro, montado con el proveedor de `moneda` o sin él. */
async function importesDelRegistro(moneda?: FormatoMoneda): Promise<string[]> {
  const listar = vi.fn(
    async (): Promise<ListarHistorialAccionesResult> => ({
      status: "ok",
      items: [filaDelRegistro("f1", MONTO_REGISTRO), filaDelRegistro("f2", null)],
      page: 1,
      pageSize: 25,
      total: 2,
    }),
  );
  const { unmount } = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <HistorialAccionesModule
        actores={[]}
        acciones={{ listar }}
        ahora={new Date("2026-09-02T18:00:00Z")}
        debounceMs={0}
      />
    </SWRConfig>,
    moneda ? { wrapper: conPais(moneda) } : undefined,
  );
  await screen.findByText("Guía f1");
  const columna = columnasHistorialAcciones(MONEDA_PLATAFORMA).findIndex((c) => c.id === "monto");
  const importes = within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((tr) => (within(tr).getAllByRole("cell")[columna].textContent ?? "").trim());
  unmount();
  return importes;
}

describe("SLT-240 R11 — importe del registro de acciones (HistorialAccionesModule)", () => {
  it("con la moneda de prueba, el monto sale en la moneda del país; sin monto, `—`", async () => {
    const [conMonto, sinMonto] = await importesDelRegistro(MONEDA_DE_PRUEBA);
    expect(conMonto).toBe(formatearMontoEn(MONEDA_DE_PRUEBA, MONTO_REGISTRO));
    expect(conMonto).not.toBe(formatearMontoEn(MONEDA_PLATAFORMA, MONTO_REGISTRO));
    expect(sinMonto).toBe(SIN_MONTO_RAYA);
  });

  it("R13: sin proveedor, con la moneda de la plataforma", async () => {
    expect(await importesDelRegistro()).toEqual([
      formatearMontoEn(MONEDA_PLATAFORMA, MONTO_REGISTRO),
      SIN_MONTO_RAYA,
    ]);
  });

  it("R12: con la moneda de CR, los mismos importes que sin proveedor", async () => {
    expect(await importesDelRegistro(MONEDA_CR)).toEqual(await importesDelRegistro());
  });
});
