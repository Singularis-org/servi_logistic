// @vitest-environment jsdom
// SLT-136 (design §6; R14, R15, R20) — LOS BOTONES DE DESCARGA DE UNA FACTURA CERRADA.
//
// El componente pide los datos con la función que le pasa la pantalla (aquí un doble), comprueba el cuadre con el
// `resumirFactura` real (R15), carga el logo con `fetch` (R14) y entrega el archivo con `descargarBlob`. Los
// constructores del PDF y del Excel son dobles: su contenido lo prueban `pdf.test.ts` y `excel.test.ts`; aquí se mide
// qué reciben y qué se entrega.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DescargaFacturaResult } from "@/lib/types/factura-plataforma";

import { datosDescarga, factura } from "./_facturas-plataforma";

const { descargarBlobMock, construirPdfMock, construirExcelMock } = vi.hoisted(() => ({
  descargarBlobMock: vi.fn(),
  construirPdfMock: vi.fn(),
  construirExcelMock: vi.fn(),
}));
vi.mock("@/components/shared/descargar-blob", () => ({ descargarBlob: descargarBlobMock }));
vi.mock("@/lib/facturas-plataforma/pdf", () => ({ construirPdfFactura: construirPdfMock }));
vi.mock("@/lib/facturas-plataforma/excel", () => ({ construirExcelFactura: construirExcelMock }));

import { DescargarFactura } from "@/components/shared/facturas/DescargarFactura";
import { MARCA_FACTURA } from "@/lib/config/marca";
import { XLSX_MIME } from "@/lib/utils/xlsx-template";

type Descargar = (i: { facturaId: string }) => Promise<DescargaFacturaResult>;

const FACTURA_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const PDF = new ArrayBuffer(4);
const XLSX = new ArrayBuffer(8);
const LOGO = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  construirPdfMock.mockReturnValue(PDF);
  construirExcelMock.mockResolvedValue(XLSX);
  fetchMock.mockResolvedValue(new Response(LOGO, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function pintar(descargar: Descargar) {
  render(<DescargarFactura facturaId={FACTURA_ID} descargar={descargar} />);
  return {
    pdf: screen.getByRole("button", { name: "Descargar PDF" }),
    excel: screen.getByRole("button", { name: "Descargar Excel" }),
  };
}

const respondeOk = () => vi.fn<Descargar>(async () => ({ estado: "ok", datos: datosDescarga() }));

/** Una promesa que el test resuelve cuando quiere: la descarga queda «en curso» mientras tanto. */
function pendiente() {
  let resolver: (r: DescargaFacturaResult) => void = () => {};
  const promesa = new Promise<DescargaFacturaResult>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe("SLT-136 R20 — al pulsar, los dos botones quedan deshabilitados hasta que termina", () => {
  it.each([
    ["Descargar PDF", "pdf"],
    ["Descargar Excel", "excel"],
  ] as const)("R20: al pulsar «%s» se deshabilitan los dos y vuelven al terminar", async (_nombre, cual) => {
    const user = userEvent.setup();
    const espera = pendiente();
    const descargar = vi.fn<Descargar>(() => espera.promesa);
    const botones = pintar(descargar);

    await user.click(botones[cual]);

    expect(botones.pdf).toBeDisabled();
    expect(botones.excel).toBeDisabled();
    expect(screen.getByRole("group", { name: "Descargar la factura" })).toHaveAttribute("aria-busy", "true");
    // Un segundo clic mientras tanto no lanza otra lectura.
    await user.click(botones.pdf);
    expect(descargar).toHaveBeenCalledTimes(1);

    espera.resolver({ estado: "ok", datos: datosDescarga() });

    await waitFor(() => expect(botones.pdf).toBeEnabled());
    expect(botones.excel).toBeEnabled();
    expect(descargarBlobMock).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-136 R16, R18, R20 — una descarga que sale bien", () => {
  it("R20: «Descargar PDF» pide solo la factura, arma el PDF con el resumen y el logo, y lo entrega con su nombre", async () => {
    const user = userEvent.setup();
    const descargar = respondeOk();
    const { pdf } = pintar(descargar);

    await user.click(pdf);

    await waitFor(() => expect(descargarBlobMock).toHaveBeenCalledTimes(1));
    expect(descargar).toHaveBeenCalledWith({ facturaId: FACTURA_ID });
    expect(fetchMock).toHaveBeenCalledWith(MARCA_FACTURA.logo.ruta);
    const [datos, resumen, logo] = construirPdfMock.mock.calls[0];
    expect(datos).toEqual(datosDescarga());
    expect(resumen).toMatchObject({ movimientos: 3, total: "300.00" });
    expect(logo).toEqual(LOGO);
    expect(descargarBlobMock).toHaveBeenCalledWith(PDF, "application/pdf", "factura-1-mensajeria-nandu-s-a.pdf");
    expect(construirExcelMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("R20: «Descargar Excel» arma el libro y lo entrega como .xlsx, sin pedir el logo", async () => {
    const user = userEvent.setup();
    const { excel } = pintar(respondeOk());

    await user.click(excel);

    await waitFor(() => expect(descargarBlobMock).toHaveBeenCalledTimes(1));
    expect(construirExcelMock).toHaveBeenCalledWith(datosDescarga());
    expect(descargarBlobMock).toHaveBeenCalledWith(XLSX, XLSX_MIME, "factura-1-mensajeria-nandu-s-a.xlsx");
    expect(construirPdfMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SLT-136 R14 — si el logo no se puede cargar, el PDF se genera igual", () => {
  it.each<[string, () => void]>([
    ["el fetch lanza", () => fetchMock.mockRejectedValue(new TypeError("sin red"))],
    ["el logo no existe (404)", () => fetchMock.mockResolvedValue(new Response(null, { status: 404 }))],
  ])("R14: si %s, el PDF se arma con logo `null` y se descarga sin error", async (_caso, preparar) => {
    preparar();
    const user = userEvent.setup();
    const { pdf } = pintar(respondeOk());

    await user.click(pdf);

    await waitFor(() => expect(descargarBlobMock).toHaveBeenCalledTimes(1));
    expect(construirPdfMock.mock.calls[0][2]).toBeNull();
    expect(descargarBlobMock.mock.calls[0][2]).toBe("factura-1-mensajeria-nandu-s-a.pdf");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SLT-136 R15 — si los movimientos no cuadran con la base, no se genera el archivo", () => {
  it.each<[string, () => DescargaFacturaResult]>([
    [
      "la suma de los días no es el total de órdenes",
      () => ({ estado: "ok", datos: datosDescarga({ factura: factura({ totalOrdenes: "999.00" }) }) }),
    ],
    [
      "los movimientos contados no son los de la base",
      () => ({ estado: "ok", datos: datosDescarga({ factura: factura({ movimientos: 4 }) }) }),
    ],
  ])("R15: si %s, dice «No se pudo descargar la factura» y no arma ni entrega nada", async (_caso, respuesta) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const botones = pintar(vi.fn<Descargar>(async () => respuesta()));

    for (const boton of [botones.pdf, botones.excel]) {
      await user.click(boton);
      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo descargar la factura");
      await waitFor(() => expect(boton).toBeEnabled());
    }

    expect(construirPdfMock).not.toHaveBeenCalled();
    expect(construirExcelMock).not.toHaveBeenCalled();
    expect(descargarBlobMock).not.toHaveBeenCalled();
  });
});

describe("SLT-136 R20 — si la lectura o la generación fallan", () => {
  it.each<[string, () => Descargar]>([
    ["la lectura lanza", () => vi.fn<Descargar>().mockRejectedValue(new Error("db caída"))],
    ["la lectura responde not_found", () => vi.fn<Descargar>().mockResolvedValue({ estado: "not_found" })],
    ["la lectura responde forbidden", () => vi.fn<Descargar>().mockResolvedValue({ estado: "forbidden" })],
    [
      "la lectura responde validation_error",
      () => vi.fn<Descargar>().mockResolvedValue({ estado: "validation_error", errores: { facturaId: "inválido" } }),
    ],
    [
      "el PDF no se puede generar",
      () => {
        construirPdfMock.mockImplementation(() => {
          throw new Error("jsPDF falló");
        });
        return respondeOk();
      },
    ],
  ])("R20: si %s, dice «No se pudo descargar la factura» y los botones vuelven", async (_caso, crear) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const { pdf, excel } = pintar(crear());

    await user.click(pdf);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo descargar la factura");
    await waitFor(() => expect(pdf).toBeEnabled());
    expect(excel).toBeEnabled();
    expect(descargarBlobMock).not.toHaveBeenCalled();
  });

  it("R20: el Excel que no se puede generar también lo dice; el siguiente intento que sale bien borra el aviso", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    construirExcelMock.mockRejectedValueOnce(new Error("exceljs falló"));
    const user = userEvent.setup();
    const { pdf, excel } = pintar(respondeOk());

    await user.click(excel);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo descargar la factura");
    await waitFor(() => expect(pdf).toBeEnabled());

    await user.click(pdf);

    await waitFor(() => expect(descargarBlobMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
