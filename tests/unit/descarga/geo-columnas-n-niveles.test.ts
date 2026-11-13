import { describe, expect, it } from "vitest";

import {
  celdasDeNivel,
  claveDeColumnaDeNivel,
  columnasDeNivel,
  type NivelDelPais,
  type Ruta,
} from "@/lib/utils/ubicacion-presentacion";

// SLT-125 T2.1 (design §3; R1–R3) — las columnas de lugar por nivel, la PARTE PURA: cabeceras, claves
// y celdas que las descargas de ordenes, satelite y cobertura ponen en el sitio de las 3 de hoy. Las
// descargas enteras (con su proyeccion de fila) se prueban en T3.
//
// Los textos de Costa Rica van literales (R42: solo los tests de CR los llevan).

const niveles = (...singulares: string[]): NivelDelPais[] =>
  singulares.map((singular, i) => ({ profundidad: i + 1, singular }));

const CR = niveles("Provincia", "Cantón", "Distrito");
const DOS = niveles("Región", "Comuna");
const CUATRO = niveles("Región", "Comuna", "Barrio", "Sector");
const DIEZ = niveles(...Array.from({ length: 10 }, (_, i) => `Tramo ${i + 1}`));

// Las demas cabeceras de la descarga de ordenes de hoy, para el choque (R2).
const OTRAS = ["Guía", "Remisión", "Destinatario", "Dirección", "Tienda", "Zona", "Monto a cobrar"];

const ruta = (...nombres: string[]): Ruta => nombres.map((nombre, i) => ({ id: `n${i + 1}`, nombre }));

describe("R1/R3: una columna por nivel, de 1 a P y en ese orden", () => {
  it("Costa Rica (3 niveles): las claves y cabeceras de hoy", () => {
    expect(columnasDeNivel(CR, OTRAS)).toEqual([
      { clave: "provincia", encabezado: "Provincia" },
      { clave: "canton", encabezado: "Cantón" },
      { clave: "distrito", encabezado: "Distrito" },
    ]);
  });

  it("pais de 2 niveles: dos columnas con los tipos del pais", () => {
    expect(columnasDeNivel(DOS, OTRAS)).toEqual([
      { clave: "provincia", encabezado: "Región" },
      { clave: "canton", encabezado: "Comuna" },
    ]);
  });

  it("pais de 4 niveles: la cuarta columna tiene clave nivel_4", () => {
    expect(columnasDeNivel(CUATRO, OTRAS)).toEqual([
      { clave: "provincia", encabezado: "Región" },
      { clave: "canton", encabezado: "Comuna" },
      { clave: "distrito", encabezado: "Barrio" },
      { clave: "nivel_4", encabezado: "Sector" },
    ]);
  });

  it("pais de 10 niveles: diez columnas, claves nivel_4..nivel_10 desde el cuarto", () => {
    const columnas = columnasDeNivel(DIEZ, OTRAS);
    expect(columnas.map((c) => c.clave)).toEqual([
      "provincia",
      "canton",
      "distrito",
      ...Array.from({ length: 7 }, (_, i) => `nivel_${i + 4}`),
    ]);
    expect(columnas.map((c) => c.encabezado)).toEqual(DIEZ.map((n) => n.singular));
  });

  it("el orden sale de la profundidad, no del orden en que llegan los niveles", () => {
    expect(columnasDeNivel([...CUATRO].reverse(), OTRAS).map((c) => c.encabezado)).toEqual([
      "Región",
      "Comuna",
      "Barrio",
      "Sector",
    ]);
  });

  it("R3: clave del nivel k = provincia, canton, distrito y nivel_<k> desde 4", () => {
    expect([1, 2, 3, 4, 10].map(claveDeColumnaDeNivel)).toEqual(["provincia", "canton", "distrito", "nivel_4", "nivel_10"]);
  });
});

describe("R2: una cabecera que choca pasa a nivel_<k>", () => {
  it("un nivel llamado «Zona» choca con la columna Zona del archivo", () => {
    expect(columnasDeNivel(niveles("Región", "Zona", "Barrio"), OTRAS)).toEqual([
      { clave: "provincia", encabezado: "Región" },
      { clave: "canton", encabezado: "nivel_2" },
      { clave: "distrito", encabezado: "Barrio" },
    ]);
  });

  it("el choque se compara normalizado: mayusculas, tildes y espacios no lo evitan", () => {
    expect(columnasDeNivel(niveles("Región", " ZONA "), OTRAS)[1].encabezado).toBe("nivel_2");
    expect(columnasDeNivel(niveles("Region", "Direccion"), OTRAS)[1].encabezado).toBe("nivel_2");
  });

  it("dos niveles con el mismo nombre: los dos pasan a nivel_<k>", () => {
    expect(columnasDeNivel(niveles("Región", "Distrito", "Distrito", "Sector"), OTRAS)).toEqual([
      { clave: "provincia", encabezado: "Región" },
      { clave: "canton", encabezado: "nivel_2" },
      { clave: "distrito", encabezado: "nivel_3" },
      { clave: "nivel_4", encabezado: "Sector" },
    ]);
  });

  it("un tipo que se llama como la reserva de otro nivel tambien choca", () => {
    expect(columnasDeNivel(niveles("nivel_2", "Comuna"), OTRAS)[0].encabezado).toBe("nivel_1");
  });

  it("un tipo vacio pasa a nivel_<k>", () => {
    expect(columnasDeNivel(niveles("Región", ""), OTRAS)[1].encabezado).toBe("nivel_2");
  });

  it("sin choque, el encabezado es el singular tal cual, sin normalizar", () => {
    expect(columnasDeNivel(niveles("Región Metropolitana", "Comuna"), OTRAS)[0].encabezado).toBe(
      "Región Metropolitana",
    );
  });
});

describe("R1: la celda del nivel k es el nombre del paso k de la ruta, o vacia", () => {
  it("Costa Rica con distrito y sin distrito", () => {
    expect(celdasDeNivel(ruta("San José", "San José", "Carmen"), CR)).toEqual({
      provincia: "San José",
      canton: "San José",
      distrito: "Carmen",
    });
    expect(celdasDeNivel(ruta("San José", "Escazú"), CR)).toEqual({
      provincia: "San José",
      canton: "Escazú",
      distrito: null,
    });
  });

  it("pais de 2 niveles", () => {
    expect(celdasDeNivel(ruta("Norte", "Arica"), DOS)).toEqual({ provincia: "Norte", canton: "Arica" });
  });

  it("pais de 4 niveles: la ruta llega al 3 (P1) y la cuarta celda sale vacia", () => {
    expect(celdasDeNivel(ruta("Metropolitana", "Providencia", "Bellavista"), CUATRO)).toEqual({
      provincia: "Metropolitana",
      canton: "Providencia",
      distrito: "Bellavista",
      nivel_4: null,
    });
  });

  it("pais de 10 niveles: las celdas que la ruta no alcanza salen vacias", () => {
    const celdas = celdasDeNivel(ruta("A", "B", "C"), DIEZ);
    expect(Object.keys(celdas)).toHaveLength(10);
    expect(celdas.distrito).toBe("C");
    expect(celdas.nivel_10).toBeNull();
  });

  it("lugar fuera del catalogo (ruta vacia, R18) o nombre vacio: celdas vacias, sin fallar", () => {
    expect(celdasDeNivel([], CR)).toEqual({ provincia: null, canton: null, distrito: null });
    expect(celdasDeNivel(ruta("San José", ""), CR).canton).toBeNull();
  });
});
