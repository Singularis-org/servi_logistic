// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OrdenesCargaUpload } from "@/app/(app)/ordenes/_components/OrdenesCargaUpload";
import { OrdenesCargaPreview } from "@/app/(app)/ordenes/_components/OrdenesCargaPreview";
import {
  COLUMNAS_GEO_DE_HOY,
  ORDENES_BULK_FIELDS,
  camposDePlantilla,
} from "@/app/(app)/ordenes/_components/carga-masiva-fields";
import {
  COLUMNA_MOTIVO_ERROR,
  ERRORES_EXPORT_FIELDS,
  camposExportErrores,
  construirFilasErrorExport,
} from "@/app/(app)/ordenes/_components/carga-masiva-export-errores";
import type { ArchivoParseado } from "@/app/(app)/ordenes/_components/carga-masiva-parser";
import type { ClasificacionCarga } from "@/app/(app)/ordenes/_components/carga-masiva-clasificacion";
import { REQUIRED_HEADERS, cabecerasObligatorias, findMissingHeaders } from "@/lib/types/carga-masiva";
import type { RowResult } from "@/lib/types/carga-masiva";
import { COLUMNAS_GEO_DE_FORMA_CR, type ColumnaGeoDePlantilla } from "@/lib/utils/plantilla-geo";

// SLT-45 (T6.3; design §8):
//   R29/R32 — sin columnas (pais de forma CR) la plantilla, las cabeceras obligatorias, la ayuda y
//             el export de errores son los de hoy.
//   R30     — con las columnas de un pais que no es de forma CR, las columnas de nivel ocupan el
//             sitio de `provincia` + `canton_distrito` en las cuatro puntas: plantilla descargada,
//             cabeceras obligatorias, export de errores y ayuda.

const { parseArchivoMock, procesarEnChunksMock, buildXlsxTemplateMock, buildXlsxRowsMock } = vi.hoisted(
  () => ({
    parseArchivoMock: vi.fn(),
    procesarEnChunksMock: vi.fn(),
    buildXlsxTemplateMock: vi.fn(),
    buildXlsxRowsMock: vi.fn(),
  }),
);

vi.mock("@/app/(app)/ordenes/_components/carga-masiva-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(app)/ordenes/_components/carga-masiva-parser")>();
  return { ...actual, parseArchivo: parseArchivoMock };
});
vi.mock("@/app/(app)/ordenes/_components/carga-masiva-chunks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(app)/ordenes/_components/carga-masiva-chunks")>();
  return { ...actual, procesarEnChunks: procesarEnChunksMock };
});
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("@/lib/utils/xlsx-template", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/xlsx-template")>();
  return { ...actual, buildXlsxTemplate: buildXlsxTemplateMock, buildXlsxRows: buildXlsxRowsMock };
});

/** Las columnas de un pais de dos niveles (`columnasGeoDePlantilla` de un Departamento/Municipio). */
const COLUMNAS_DOS_NIVELES: ColumnaGeoDePlantilla[] = [
  { key: "departamento", example: "Guatemala" },
  { key: "municipio", example: "Mixco" },
];

const CABECERAS_NO_CR = [
  "destinatario",
  "telefono",
  "departamento",
  "municipio",
  "direccion",
  "monto_cobrar",
  "producto",
  "num_remision",
  "peso",
  "notas",
];

const CABECERAS_CR = ORDENES_BULK_FIELDS.map((f) => f.key);

beforeEach(() => {
  vi.clearAllMocks();
  buildXlsxTemplateMock.mockResolvedValue(new ArrayBuffer(8));
  buildXlsxRowsMock.mockResolvedValue(new ArrayBuffer(8));
  // jsdom no implementa las URLs de objeto; la descarga solo necesita que existan.
  URL.createObjectURL = vi.fn(() => "blob:prueba");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => cleanup());

describe("camposDePlantilla (R29, R30)", () => {
  it("R29: sin columnas son los campos de hoy, la misma referencia", () => {
    expect(camposDePlantilla()).toBe(ORDENES_BULK_FIELDS);
    expect(camposDePlantilla(null)).toBe(ORDENES_BULK_FIELDS);
  });

  it("R30: las columnas de nivel ocupan, en su orden, el sitio de provincia y canton_distrito", () => {
    const campos = camposDePlantilla(COLUMNAS_DOS_NIVELES);
    expect(campos.map((f) => f.key)).toEqual(CABECERAS_NO_CR);
    expect(campos.slice(2, 4)).toEqual(COLUMNAS_DOS_NIVELES);
    // El resto de la plantilla no se toca: mismos campos, mismos ejemplos.
    const resto = ORDENES_BULK_FIELDS.filter((f) => !COLUMNAS_GEO_DE_HOY.includes(f.key));
    expect(campos.filter((f) => !["departamento", "municipio"].includes(f.key))).toEqual(resto);
  });

  it("R30: con cuatro niveles la plantilla crece en el mismo sitio", () => {
    const cuatro = ["region", "provincia_2", "comuna", "sector"].map((key) => ({ key }));
    const keys = camposDePlantilla(cuatro).map((f) => f.key);
    expect(keys.slice(0, 7)).toEqual(["destinatario", "telefono", "region", "provincia_2", "comuna", "sector", "direccion"]);
    expect(keys).not.toContain("canton_distrito");
  });

  it("las columnas de geografia de hoy son las mismas que conoce `plantilla-geo`", () => {
    expect([...COLUMNAS_GEO_DE_HOY]).toEqual([...COLUMNAS_GEO_DE_FORMA_CR]);
  });
});

describe("cabeceras obligatorias (R29, R30)", () => {
  it("R29: sin columnas son REQUIRED_HEADERS y findMissingHeaders responde como hoy", () => {
    expect(cabecerasObligatorias()).toEqual([...REQUIRED_HEADERS]);
    expect(cabecerasObligatorias(null)).toEqual([...REQUIRED_HEADERS]);
    expect(findMissingHeaders(CABECERAS_CR, null)).toEqual(findMissingHeaders(CABECERAS_CR));
    expect(findMissingHeaders(["num_remision"], null)).toEqual(findMissingHeaders(["num_remision"]));
  });

  it("R30: exige todas las columnas de nivel en lugar de provincia y canton_distrito", () => {
    const claves = COLUMNAS_DOS_NIVELES.map((c) => c.key);
    expect(cabecerasObligatorias(claves)).toEqual([
      "num_remision",
      "destinatario",
      "telefono",
      "departamento",
      "municipio",
      "direccion",
    ]);
    expect(findMissingHeaders(CABECERAS_NO_CR, claves)).toEqual([]);
    // La plantilla de hoy no es la de este pais.
    expect(findMissingHeaders(CABECERAS_CR, claves)).toEqual(["departamento", "municipio"]);
    // Una columna de nivel posterior tambien es obligatoria en cabecera.
    expect(findMissingHeaders(CABECERAS_NO_CR.filter((h) => h !== "municipio"), claves)).toEqual(["municipio"]);
  });

  it("R30: sigue comprobando PRESENCIA: la columna extra del export de errores no estorba", () => {
    const claves = COLUMNAS_DOS_NIVELES.map((c) => c.key);
    expect(findMissingHeaders([...CABECERAS_NO_CR, COLUMNA_MOTIVO_ERROR], claves)).toEqual([]);
  });
});

describe("export de errores (R29, R30)", () => {
  const error = { fila: 1, numRemision: "REM-1", errores: { departamento: ["no existe"] } };
  const filas = [
    {
      linea: 1,
      row: { num_remision: "REM-1", departamento: "Guatemal", municipio: "Mixco", provincia: "X" },
    },
  ];

  it("R29: con los campos de hoy las columnas son ERRORES_EXPORT_FIELDS", () => {
    expect(camposExportErrores(ORDENES_BULK_FIELDS)).toEqual(ERRORES_EXPORT_FIELDS);
    expect(construirFilasErrorExport([error], filas, ORDENES_BULK_FIELDS)).toEqual(
      construirFilasErrorExport([error], filas),
    );
  });

  it("R30: columnas y valores son los de la plantilla de la empresa, y vuelven a pasar la cabecera", () => {
    const campos = camposDePlantilla(COLUMNAS_DOS_NIVELES);
    const columnas = camposExportErrores(campos);
    expect(columnas.map((c) => c.key)).toEqual([...CABECERAS_NO_CR, COLUMNA_MOTIVO_ERROR]);
    expect(columnas.every((c) => c.label === undefined && c.example === undefined)).toBe(true);

    const [registro] = construirFilasErrorExport([error], filas, campos);
    expect(registro.departamento).toBe("Guatemal");
    expect(registro.municipio).toBe("Mixco");
    expect(registro).not.toHaveProperty("provincia");
    expect(registro).not.toHaveProperty("canton_distrito");

    // El archivo de errores se puede volver a subir.
    expect(findMissingHeaders(Object.keys(registro), COLUMNAS_DOS_NIVELES.map((c) => c.key))).toEqual([]);
  });
});

function archivo(headers: string[]): ArchivoParseado {
  return { headers, filas: [{ row: { num_remision: "REM-1" }, linea: 1 }] };
}

const csv = () => new File(["num_remision\nREM-1"], "carga.csv", { type: "text/csv" });
const fileInput = () => screen.getByLabelText(/archivo de órdenes/i);

describe("OrdenesCargaUpload con columnas de geografia", () => {
  it("R29: sin la prop, la plantilla descargada lleva los campos de hoy", async () => {
    const user = userEvent.setup();
    render(<OrdenesCargaUpload onValidated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /descargar plantilla/i }));
    await waitFor(() => expect(buildXlsxTemplateMock).toHaveBeenCalledTimes(1));
    expect(buildXlsxTemplateMock.mock.calls[0][0]).toBe(ORDENES_BULK_FIELDS);
    expect(screen.getByText("canton_distrito")).toBeInTheDocument();
  });

  it("R30: la plantilla descargada lleva las columnas de nivel y la ayuda las nombra", async () => {
    const user = userEvent.setup();
    render(<OrdenesCargaUpload onValidated={vi.fn()} columnasGeo={COLUMNAS_DOS_NIVELES} />);
    await user.click(screen.getByRole("button", { name: /descargar plantilla/i }));
    await waitFor(() => expect(buildXlsxTemplateMock).toHaveBeenCalledTimes(1));
    expect(buildXlsxTemplateMock.mock.calls[0][0]).toEqual(camposDePlantilla(COLUMNAS_DOS_NIVELES));

    expect(screen.getByText("departamento")).toBeInTheDocument();
    expect(screen.getByText("municipio")).toBeInTheDocument();
    expect(screen.queryByText("canton_distrito")).not.toBeInTheDocument();
  });

  it("R30: acepta un archivo con las columnas de nivel y lo valida", async () => {
    const user = userEvent.setup();
    parseArchivoMock.mockResolvedValue(archivo(CABECERAS_NO_CR));
    procesarEnChunksMock.mockResolvedValue([
      { fila: 1, numRemision: "REM-1", resultado: "creada" },
    ] satisfies RowResult[]);
    const onValidated = vi.fn();

    render(<OrdenesCargaUpload onValidated={onValidated} columnasGeo={COLUMNAS_DOS_NIVELES} />);
    await user.upload(fileInput(), csv());

    await waitFor(() => expect(onValidated).toHaveBeenCalledTimes(1));
  });

  it("R30: rechaza la plantilla de hoy nombrando las columnas de nivel que faltan, sin peticion", async () => {
    const user = userEvent.setup();
    parseArchivoMock.mockResolvedValue(archivo(CABECERAS_CR));
    const onValidated = vi.fn();

    render(<OrdenesCargaUpload onValidated={onValidated} columnasGeo={COLUMNAS_DOS_NIVELES} />);
    await user.upload(fileInput(), csv());

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Faltan columnas obligatorias: departamento, municipio.");
    expect(procesarEnChunksMock).not.toHaveBeenCalled();
    expect(onValidated).not.toHaveBeenCalled();
  });
});

const CLASIFICACION_CON_ERROR: ClasificacionCarga = {
  numRemisionesNuevas: [],
  existentes: [],
  errores: [{ fila: 1, numRemision: "REM-1", errores: { departamento: ["no existe"] } }],
  ajustadas: [],
  normalizadas: [],
};

function renderPreview(columnasGeo?: ColumnaGeoDePlantilla[] | null) {
  return render(
    <OrdenesCargaPreview
      clasificacion={CLASIFICACION_CON_ERROR}
      filas={[{ linea: 1, row: { num_remision: "REM-1", departamento: "Guatemal", municipio: "Mixco" } }]}
      confirmando={false}
      onConfirmar={vi.fn()}
      columnasGeo={columnasGeo}
    />,
  );
}

describe("OrdenesCargaPreview: export de errores con columnas de geografia", () => {
  it("R29: sin la prop, el export lleva las columnas de hoy", async () => {
    const user = userEvent.setup();
    renderPreview();
    await user.click(screen.getByRole("button", { name: /descargar filas con error/i }));
    await waitFor(() => expect(buildXlsxRowsMock).toHaveBeenCalledTimes(1));
    const [columnas] = buildXlsxRowsMock.mock.calls[0];
    expect((columnas as { key: string }[]).map((c) => c.key)).toEqual(ERRORES_EXPORT_FIELDS.map((c) => c.key));
  });

  it("R30: con la prop, el export lleva las columnas de nivel y sus valores", async () => {
    const user = userEvent.setup();
    renderPreview(COLUMNAS_DOS_NIVELES);
    await user.click(screen.getByRole("button", { name: /descargar filas con error/i }));
    await waitFor(() => expect(buildXlsxRowsMock).toHaveBeenCalledTimes(1));
    const [columnas, filasExport] = buildXlsxRowsMock.mock.calls[0];
    expect((columnas as { key: string }[]).map((c) => c.key)).toEqual([...CABECERAS_NO_CR, COLUMNA_MOTIVO_ERROR]);
    expect((filasExport as Record<string, string>[])[0]).toMatchObject({
      departamento: "Guatemal",
      municipio: "Mixco",
    });
  });
});
