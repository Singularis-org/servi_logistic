import { readFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  COLUMNAS_DESCARGA_DIA_DEVUELTAS,
  COLUMNAS_DESCARGA_DIA_ENTREGADAS,
  COLUMNAS_DESCARGA_DIA_INCIDENTES,
  COLUMNAS_DESCARGA_DIA_RECHAZADAS,
  COLUMNAS_DESCARGA_DIA_REPROGRAMADAS,
  filaDescargaDiaDevuelta,
  filaDescargaDiaEntregada,
  filaDescargaDiaIncidente,
  filaDescargaDiaRechazada,
  filaDescargaDiaReprogramada,
} from "@/app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas";
import {
  columnasDescargaGestionesFundidaPara,
  filaDescargaGestionFundida,
} from "@/app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas";
import { COLUMNAS_DESCARGA_AYUDA, filaDescargaAyuda } from "@/app/(app)/novedades/_components/ayuda-descarga-columnas";
import {
  COLUMNAS_DESCARGA_NOVEDADES,
  filaDescargaNovedad,
} from "@/app/(app)/novedades/_components/novedades-descarga-columnas";
import { leerUbicacionCongelada } from "@/lib/types/ubicacion-snapshot";
import {
  columnasDescargaCobertura,
  filaCobertura,
} from "@/app/(app)/configuracion/zonas/_components/cobertura-descarga-columnas";
import {
  columnasDescargaOrdenes,
  filaDescargaOrdenDe,
} from "@/app/(app)/ordenes/_components/ordenes-descarga-columnas";
import {
  columnasDescargaSatelite,
  filaDescargaSateliteDe,
} from "@/app/(app)/recepcion-satelite/_components/satelite-descarga-columnas";
import type { CoberturaDistritoDTO } from "@/lib/types/cobertura";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import { buildCsvRows } from "@/lib/utils/csv-template";
import { buildXlsxRows } from "@/lib/utils/xlsx-template";
import {
  CASOS_CR,
  CIERRE_DIA_CR,
  CIERRES_ADMIN_CR,
  COBERTURA_CR,
  ETIQUETAS_CR_DESCARGAS,
  NOVEDADES_CR,
  ORDENES_CR,
  SATELITE_CR,
  SNAPSHOTS_CIERRES_ADMIN_CR,
  rutaDeLugar,
} from "@/tests/fixtures/descargas-cr/entrada";

// SLT-125 (design §7; R4, R6) — EN COSTA RICA LAS DESCARGAS DE ÓRDENES, SATÉLITE Y COBERTURA SALEN
// IGUAL QUE ANTES DE SLT-125.
//
// La referencia (`tests/fixtures/descargas-cr/referencia.json`) la capturó UNA vez
// `scripts/capturar-referencia-descargas.ts` con el código de antes, sobre `entrada.ts`. Este test pasa
// esa misma entrada, ya con su ruta (`lugarRuta` en órdenes y satélite, `ruta` en cobertura, armadas
// desde el `lugar` de cada caso sin inventar nombres), por el código nuevo con los niveles de Costa Rica,
// y exige el CSV byte a byte y, del XLSX, las mismas cabeceras y celdas en el mismo orden. El XLSX no se
// compara en bytes: el libro lleva la fecha de creación en sus metadatos.
//
// La referencia NO se regenera nunca: si este test se pone rojo, el código cambió lo que descarga CR.

type Celda = string | number | boolean | null;

interface DescargaCapturada {
  columnas: DescargaColumna[];
  csv: string;
  xlsx: Celda[][];
}

const REFERENCIA = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../fixtures/descargas-cr/referencia.json"), "utf8"),
) as { v: number; descargas: Record<string, DescargaCapturada> };

/** Los niveles de Costa Rica tal como los da el país: los mismos tipos que sus etiquetas. */
const NIVELES_CR: NivelDeFiltroDTO[] = (["provincia", "canton", "distrito"] as const).map((clave, i) => ({
  profundidad: i + 1,
  singular: ETIQUETAS_CR_DESCARGAS[clave].singular,
  plural: ETIQUETAS_CR_DESCARGAS[clave].plural,
}));

// Cambio solo de ENTRADA: los DTO ganan la ruta que el servidor ya envía (T2.3).
const ORDENES_CON_RUTA = ORDENES_CR.map((orden, i) => ({ ...orden, lugarRuta: rutaDeLugar(CASOS_CR[i]!.lugar) }));
const SATELITE_CON_RUTA = SATELITE_CR.map((orden, i) => ({ ...orden, lugarRuta: rutaDeLugar(CASOS_CR[i]!.lugar) }));
const COBERTURA_CON_RUTA: CoberturaDistritoDTO[] = COBERTURA_CR.map((fila, i) => ({
  ...fila,
  ruta: [
    { id: `p-${i}`, nombre: fila.provincia },
    { id: `c-${i}`, nombre: fila.canton },
    { id: `d-${i}`, nombre: fila.distrito },
  ],
}));

/** La misma traducción de vocabulario que hace `construirDescarga` antes de llamar a los generadores. */
function columnasDelGenerador(columnas: DescargaColumna[]) {
  return columnas.map((c) => ({ key: c.clave, header: c.encabezado, ...(c.formato !== undefined ? { formato: c.formato } : {}) }));
}

/** Las celdas del libro, leídas igual que en la captura de la referencia. */
async function celdasDelXlsx(binario: ArrayBuffer, columnas: number): Promise<Celda[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(binario);
  const hoja = libro.worksheets[0]!;
  const filas: Celda[][] = [];
  for (let r = 1; r <= hoja.rowCount; r++) {
    const fila: Celda[] = [];
    for (let c = 1; c <= columnas; c++) {
      const valor = hoja.getRow(r).getCell(c).value;
      fila.push(valor === undefined ? null : (valor as Celda));
    }
    filas.push(fila);
  }
  return filas;
}

async function descargar(columnas: DescargaColumna[], filas: DescargaFila[]): Promise<DescargaCapturada> {
  const generador = columnasDelGenerador(columnas);
  return {
    columnas,
    csv: buildCsvRows(generador, filas),
    xlsx: await celdasDelXlsx(await buildXlsxRows(generador, filas), generador.length),
  };
}

const CASOS = [
  {
    nombre: "ordenes",
    nuevo: () =>
      descargar(
        columnasDescargaOrdenes(ETIQUETAS_CR_DESCARGAS, NIVELES_CR),
        ORDENES_CON_RUTA.map(filaDescargaOrdenDe(NIVELES_CR)),
      ),
  },
  {
    nombre: "satelite",
    nuevo: () =>
      descargar(
        columnasDescargaSatelite(ETIQUETAS_CR_DESCARGAS, NIVELES_CR),
        SATELITE_CON_RUTA.map(filaDescargaSateliteDe(NIVELES_CR)),
      ),
  },
  {
    nombre: "cobertura",
    nuevo: () =>
      descargar(
        columnasDescargaCobertura(ETIQUETAS_CR_DESCARGAS, NIVELES_CR),
        COBERTURA_CON_RUTA.map(filaCobertura(ETIQUETAS_CR_DESCARGAS, NIVELES_CR)),
      ),
  },
] as const;

describe("R4/R6 — Costa Rica: órdenes, satélite y cobertura descargan lo mismo que antes de SLT-125", () => {
  it("la referencia es la de T1.2 y trae las tres descargas", () => {
    expect(REFERENCIA.v).toBe(1);
    for (const { nombre } of CASOS) expect(REFERENCIA.descargas[nombre], nombre).toBeDefined();
  });

  it.each(CASOS)("$nombre: mismas columnas (claves, encabezados y orden)", async ({ nombre, nuevo }) => {
    expect((await nuevo()).columnas).toEqual(REFERENCIA.descargas[nombre]!.columnas);
  });

  it.each(CASOS)("$nombre: el CSV, byte a byte", async ({ nombre, nuevo }) => {
    const csv = (await nuevo()).csv;
    expect(Buffer.from(csv, "utf8").equals(Buffer.from(REFERENCIA.descargas[nombre]!.csv, "utf8"))).toBe(true);
    expect(csv).toBe(REFERENCIA.descargas[nombre]!.csv);
  });

  it.each(CASOS)("$nombre: el XLSX, mismas cabeceras y celdas en el mismo orden", async ({ nombre, nuevo }) => {
    expect((await nuevo()).xlsx).toEqual(REFERENCIA.descargas[nombre]!.xlsx);
  });

  it("sin niveles (sin proveedor) también sale la referencia: las tres de las etiquetas", async () => {
    const ordenes = await descargar(
      columnasDescargaOrdenes(ETIQUETAS_CR_DESCARGAS),
      ORDENES_CON_RUTA.map(filaDescargaOrdenDe()),
    );
    expect(ordenes.csv).toBe(REFERENCIA.descargas.ordenes!.csv);
  });
});

// ─── T3.2 (R10, R26): las descargas con una «Ubicación» de una línea ─────────────────────────────
//
// Cambio solo de ENTRADA, como arriba: novedades y cierre de día ganan la `lugarRuta` del catálogo;
// cierres admin, la que el servidor lee de su `ubicacion_snapshot` (`leerUbicacionCongelada`), con
// snapshot en unas filas y sin él en otras (`SNAPSHOTS_CIERRES_ADMIN_CR`). En Costa Rica las dos
// lecturas dan los mismos nombres, así que el archivo sale idéntico al de la referencia (R26).

const NOVEDADES_CON_RUTA = NOVEDADES_CR.map((n, i) => ({ ...n, lugarRuta: rutaDeLugar(CASOS_CR[i]!.lugar) }));
const CIERRE_DIA_CON_RUTA = CIERRE_DIA_CR.map((g, i) => ({ ...g, lugarRuta: rutaDeLugar(CASOS_CR[i]!.lugar) }));
const CIERRES_ADMIN_CON_RUTA = CIERRES_ADMIN_CR.map((g, i) => ({
  ...g,
  lugarRuta: leerUbicacionCongelada({ ...g, ubicacionSnapshot: SNAPSHOTS_CIERRES_ADMIN_CR[i] }),
}));

const CASOS_UNA_LINEA = [
  { nombre: "novedades", nuevo: () => descargar(COLUMNAS_DESCARGA_NOVEDADES, NOVEDADES_CON_RUTA.map(filaDescargaNovedad)) },
  { nombre: "ayuda", nuevo: () => descargar(COLUMNAS_DESCARGA_AYUDA, NOVEDADES_CON_RUTA.map(filaDescargaAyuda)) },
  {
    nombre: "cierre-dia-entregadas",
    nuevo: () => descargar(COLUMNAS_DESCARGA_DIA_ENTREGADAS, CIERRE_DIA_CON_RUTA.map(filaDescargaDiaEntregada)),
  },
  {
    nombre: "cierre-dia-reprogramadas",
    nuevo: () => descargar(COLUMNAS_DESCARGA_DIA_REPROGRAMADAS, CIERRE_DIA_CON_RUTA.map(filaDescargaDiaReprogramada)),
  },
  {
    nombre: "cierre-dia-devueltas",
    nuevo: () => descargar(COLUMNAS_DESCARGA_DIA_DEVUELTAS, CIERRE_DIA_CON_RUTA.map(filaDescargaDiaDevuelta)),
  },
  {
    nombre: "cierre-dia-rechazadas",
    nuevo: () => descargar(COLUMNAS_DESCARGA_DIA_RECHAZADAS, CIERRE_DIA_CON_RUTA.map(filaDescargaDiaRechazada)),
  },
  {
    nombre: "cierre-dia-incidentes",
    nuevo: () => descargar(COLUMNAS_DESCARGA_DIA_INCIDENTES, CIERRE_DIA_CON_RUTA.map(filaDescargaDiaIncidente)),
  },
  {
    nombre: "cierres-admin-fundida",
    nuevo: () =>
      descargar(columnasDescargaGestionesFundidaPara("admin"), CIERRES_ADMIN_CON_RUTA.map(filaDescargaGestionFundida)),
  },
  {
    nombre: "cierres-admin-fundida-satelite",
    nuevo: () =>
      descargar(columnasDescargaGestionesFundidaPara("satelite"), CIERRES_ADMIN_CON_RUTA.map(filaDescargaGestionFundida)),
  },
] as const;

describe("R10/R26 — Costa Rica: novedades, ayuda, cierre de día y cierres admin descargan lo mismo que antes", () => {
  it("la referencia trae las nueve descargas", () => {
    for (const { nombre } of CASOS_UNA_LINEA) expect(REFERENCIA.descargas[nombre], nombre).toBeDefined();
  });

  it("la entrada de cierres admin mezcla filas con snapshot y sin él", () => {
    expect(SNAPSHOTS_CIERRES_ADMIN_CR.some((s) => s === null)).toBe(true);
    expect(SNAPSHOTS_CIERRES_ADMIN_CR.some((s) => s !== null)).toBe(true);
  });

  it.each(CASOS_UNA_LINEA)("$nombre: mismas columnas", async ({ nombre, nuevo }) => {
    expect((await nuevo()).columnas).toEqual(REFERENCIA.descargas[nombre]!.columnas);
  });

  it.each(CASOS_UNA_LINEA)("$nombre: el CSV, byte a byte", async ({ nombre, nuevo }) => {
    expect((await nuevo()).csv).toBe(REFERENCIA.descargas[nombre]!.csv);
  });

  it.each(CASOS_UNA_LINEA)("$nombre: el XLSX, mismas cabeceras y celdas", async ({ nombre, nuevo }) => {
    expect((await nuevo()).xlsx).toEqual(REFERENCIA.descargas[nombre]!.xlsx);
  });

  it("sin `lugarRuta` (lector que no la anota) también sale la referencia", async () => {
    const novedades = await descargar(COLUMNAS_DESCARGA_NOVEDADES, NOVEDADES_CR.map(filaDescargaNovedad));
    expect(novedades.csv).toBe(REFERENCIA.descargas.novedades!.csv);
    const fundida = await descargar(
      columnasDescargaGestionesFundidaPara("admin"),
      CIERRES_ADMIN_CR.map(filaDescargaGestionFundida),
    );
    expect(fundida.csv).toBe(REFERENCIA.descargas["cierres-admin-fundida"]!.csv);
  });
});
