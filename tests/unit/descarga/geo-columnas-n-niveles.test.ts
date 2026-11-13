import { describe, expect, it } from "vitest";

import {
  celdasDeNivel,
  claveDeColumnaDeNivel,
  columnasDeNivel,
  type NivelDelPais,
  type Ruta,
} from "@/lib/utils/ubicacion-presentacion";
import { columnasDescargaCobertura } from "@/app/(app)/configuracion/zonas/_components/cobertura-descarga-columnas";
import {
  COLUMNAS_DESCARGA_ORDENES,
  columnasDescargaOrdenes,
  filaDescargaOrdenDe,
} from "@/app/(app)/ordenes/_components/ordenes-descarga-columnas";
import {
  columnasDescargaSatelite,
  filaDescargaSateliteDe,
} from "@/app/(app)/recepcion-satelite/_components/satelite-descarga-columnas";
import type { RecepcionSateliteDTO } from "@/lib/interfaces/services/IRecepcionSateliteService";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";
import type { OrdenListItemDTO } from "@/lib/types/orden";
import { ETIQUETAS_CR } from "@/tests/fabricas/etiquetas-geograficas";
import { ORDENES_CR, SATELITE_CR } from "@/tests/fixtures/descargas-cr/entrada";

// SLT-125 T2.1 (design §3; R1–R3) — las columnas de lugar por nivel, la PARTE PURA: cabeceras, claves
// y celdas que las descargas de ordenes, satelite y cobertura ponen en el sitio de las 3 de hoy. Las
// descargas enteras (con su proyeccion de fila) se prueban al final (T3.1).
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

// ─── T3.1 — las descargas enteras: órdenes, satélite y cobertura (R1–R3) ─────────────────────────────

describe("R1–R3: descargas de órdenes, satélite y cobertura con P columnas de lugar", () => {
  const dto = (n: readonly NivelDelPais[]): NivelDeFiltroDTO[] => n.map((x) => ({ ...x, plural: x.singular }));
  const CLAVES_DE_HOY = ["provincia", "canton", "distrito"];

  /** Las claves que quedan entre `antes` y `despues`: el sitio de las tres de hoy. */
  const tramo = (claves: string[], antes: string, despues: string) =>
    claves.slice(claves.indexOf(antes) + 1, claves.indexOf(despues));

  const pasos = (r: Ruta) => r.map((p) => ({ id: p.id ?? "", nombre: p.nombre }));
  // Las relaciones de hoy se vacían: la celda tiene que salir de la ruta.
  const orden = (r: Ruta): OrdenListItemDTO => ({
    ...ORDENES_CR[0]!,
    relaciones: { ...ORDENES_CR[0]!.relaciones!, provincia: null, canton: null, distrito: null },
    lugarRuta: pasos(r),
  });
  const satelite = (r: Ruta): RecepcionSateliteDTO => ({
    ...SATELITE_CR[0]!,
    provinciaNombre: "",
    cantonNombre: "",
    distritoNombre: null,
    lugarRuta: pasos(r),
  });

  const NIVEL_4_A_10 = Array.from({ length: 7 }, (_, i) => `nivel_${i + 4}`);

  it.each([
    ["2", DOS, ["provincia", "canton"]],
    ["3 (Costa Rica)", CR, CLAVES_DE_HOY],
    ["4", CUATRO, [...CLAVES_DE_HOY, "nivel_4"]],
    ["10", DIEZ, [...CLAVES_DE_HOY, ...NIVEL_4_A_10]],
  ] as const)("país de %s niveles: columnas de lugar en su sitio, en orden y con el tipo", (_, n, claves) => {
    const esDeLugar = (c: { clave: string }) => (claves as readonly string[]).includes(c.clave);

    const ordenes = columnasDescargaOrdenes(ETIQUETAS_CR, dto(n));
    expect(tramo(ordenes.map((c) => c.clave), "zona", "montoCobrar")).toEqual(claves);
    expect(ordenes.filter(esDeLugar).map((c) => c.encabezado)).toEqual(n.map((x) => x.singular));
    // El resto del archivo no se mueve.
    expect(ordenes.filter((c) => !esDeLugar(c))).toEqual(
      COLUMNAS_DESCARGA_ORDENES.filter((c) => !CLAVES_DE_HOY.includes(c.clave)),
    );

    const sat = columnasDescargaSatelite(ETIQUETAS_CR, dto(n));
    expect(tramo(sat.map((c) => c.clave), "zona", "montoCobrar")).toEqual(claves);
    expect(sat.filter(esDeLugar).map((c) => c.encabezado)).toEqual(n.map((x) => x.singular));

    const cob = columnasDescargaCobertura(ETIQUETAS_CR, dto(n));
    expect(cob.slice(0, n.length).map((c) => c.clave)).toEqual(claves);
    expect(cob.slice(0, n.length).map((c) => c.encabezado)).toEqual(n.map((x) => x.singular));
    expect(cob[n.length]!.clave).toBe("activo");
  });

  it("país de 4 niveles: la celda del nivel k es el paso k de la ruta; la cuarta, vacía (P1)", () => {
    const fila = filaDescargaOrdenDe(dto(CUATRO))(orden(ruta("Metropolitana", "Providencia", "Bellavista")));
    expect([fila.provincia, fila.canton, fila.distrito, fila.nivel_4]).toEqual([
      "Metropolitana",
      "Providencia",
      "Bellavista",
      null,
    ]);
    const filaSat = filaDescargaSateliteDe(dto(CUATRO))(satelite(ruta("Metropolitana", "Providencia")));
    expect([filaSat.provincia, filaSat.canton, filaSat.distrito, filaSat.nivel_4]).toEqual([
      "Metropolitana",
      "Providencia",
      null,
      null,
    ]);
  });

  it("país de 2 niveles: dos celdas, sin una tercera vacía", () => {
    const fila = filaDescargaOrdenDe(dto(DOS))(orden(ruta("Norte", "Arica")));
    expect(fila).toMatchObject({ provincia: "Norte", canton: "Arica" });
    expect("distrito" in fila).toBe(false);
    const filaSat = filaDescargaSateliteDe(dto(DOS))(satelite(ruta("Norte", "Arica")));
    expect(filaSat).toMatchObject({ provincia: "Norte", canton: "Arica" });
    expect("distrito" in filaSat).toBe(false);
  });

  it("país de 10 niveles: diez celdas; las que la ruta no alcanza, vacías", () => {
    const fila = filaDescargaSateliteDe(dto(DIEZ))(satelite(ruta("A", "B", "C")));
    expect([fila.provincia, fila.canton, fila.distrito]).toEqual(["A", "B", "C"]);
    expect(NIVEL_4_A_10.map((clave) => fila[clave])).toEqual(Array(7).fill(null));
    const filaOrden = filaDescargaOrdenDe(dto(DIEZ))(orden(ruta("A", "B", "C")));
    expect(NIVEL_4_A_10.map((clave) => filaOrden[clave])).toEqual(Array(7).fill(null));
  });

  it("R2: un nivel «Zona» choca con la columna Zona del archivo; dos niveles iguales pasan los dos a nivel_<k>", () => {
    const conZona = columnasDescargaOrdenes(ETIQUETAS_CR, dto(niveles("Región", "Zona", "Barrio")));
    expect(conZona.find((c) => c.clave === "canton")?.encabezado).toBe("nivel_2");
    expect(conZona.filter((c) => c.encabezado === "Zona")).toEqual([{ clave: "zona", encabezado: "Zona" }]);
    const satZona = columnasDescargaSatelite(ETIQUETAS_CR, dto(niveles("Región", "Zona", "Barrio")));
    expect(satZona.find((c) => c.clave === "canton")?.encabezado).toBe("nivel_2");
    const cobZona = columnasDescargaCobertura(ETIQUETAS_CR, dto(niveles("Región", "Zona", "Barrio")));
    expect(cobZona.find((c) => c.clave === "canton")?.encabezado).toBe("nivel_2");

    const repetidos = columnasDescargaCobertura(ETIQUETAS_CR, dto(niveles("Región", "Distrito", "Distrito", "Sector")));
    expect(repetidos.slice(0, 4).map((c) => c.encabezado)).toEqual(["Región", "nivel_2", "nivel_3", "Sector"]);
  });

  it("R3: las claves de hoy no cambian en ningún país, así que una preferencia guardada sigue aplicándose", () => {
    for (const n of [DOS, CR, CUATRO, DIEZ]) {
      const claves = columnasDescargaOrdenes(ETIQUETAS_CR, dto(n)).map((c) => c.clave);
      const deHoy = COLUMNAS_DESCARGA_ORDENES.map((c) => c.clave).filter((c) => c !== "distrito" || n.length >= 3);
      expect(claves.filter((c) => !/^nivel_\d+$/.test(c))).toEqual(deHoy);
    }
  });

  it("sin niveles (sin proveedor): las tres columnas de las etiquetas y las celdas de hoy, como antes", () => {
    expect(columnasDescargaOrdenes(ETIQUETAS_CR, [])).toEqual(columnasDescargaOrdenes(ETIQUETAS_CR));
    expect(tramo(columnasDescargaOrdenes(ETIQUETAS_CR).map((c) => c.encabezado), "Zona", "Monto a cobrar")).toEqual([
      "Provincia",
      "Cantón",
      "Distrito",
    ]);
    // Un DTO sin ruta (lector que no la anota): los nombres de `relaciones`.
    expect(filaDescargaOrdenDe()({ ...ORDENES_CR[0]!, lugarRuta: undefined })).toMatchObject({ provincia: "San José", canton: "San José", distrito: "Carmen" });
  });
});
