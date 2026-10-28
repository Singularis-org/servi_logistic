import { describe, it, expect } from "vitest";

import {
  COLUMNAS_DESCARGA_SATELITE,
  columnasDescargaSatelite,
} from "@/app/(app)/recepcion-satelite/_components/satelite-descarga-columnas";
import { ETIQUETAS_CR, ETIQUETAS_XA } from "../../fabricas/etiquetas-geograficas";

// Feature 189 — ORDEN y CENSO de las columnas del archivo descargable del listado de la
// bodega satélite (feature 170, T A.2 / R5).
//
// Trece columnas, y cuatro de ellas son la jerarquía geográfica (zona, provincia, cantón,
// distrito): son el caso de libro de una permuta que NADIE nota leyendo el archivo, porque
// las cuatro celdas llevan nombres de lugar. El esperado se escribe A MANO.

describe("orden de las columnas de descarga del listado de la bodega satélite", () => {
  it("declara sus columnas en el orden de la pantalla (R5)", () => {
    expect(COLUMNAS_DESCARGA_SATELITE.map((c) => c.clave)).toEqual([
      "numGuia",
      "numRemision",
      "estatus",
      "intentos",
      "destinatario",
      "producto",
      "direccion",
      "tienda",
      "zona",
      "provincia",
      "canton",
      "distrito",
      "montoCobrar",
    ]);
    // SL-20 (R19): los encabezados de nivel son los del país de la empresa; éstos, los de Costa Rica.
    expect(columnasDescargaSatelite(ETIQUETAS_CR).map((c) => c.encabezado)).toEqual([
      "Nº Guía",
      "Nº Remisión",
      "Estado",
      "Intentos",
      "Destinatario",
      "Producto",
      "Dirección",
      "Tienda",
      "Zona",
      "Provincia",
      "Cantón",
      "Distrito",
      "Monto a cobrar",
    ]);
  });
});

describe("SL-20/R19 — la descarga de la bodega satélite nombra los niveles con los del país", () => {
  it("con un país de prueba, «Departamento», «Municipio» y «Aldea»; claves y orden sin cambios", () => {
    const columnas = columnasDescargaSatelite(ETIQUETAS_XA);
    const porClave = Object.fromEntries(columnas.map((c) => [c.clave, c.encabezado]));
    expect([porClave.provincia, porClave.canton, porClave.distrito]).toEqual([
      "Departamento",
      "Municipio",
      "Aldea",
    ]);
    expect(columnas.map((c) => c.clave)).toEqual(COLUMNAS_DESCARGA_SATELITE.map((c) => c.clave));
  });
});
