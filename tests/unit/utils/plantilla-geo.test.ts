import { describe, expect, it } from "vitest";

import { ORDENES_BULK_FIELDS } from "@/app/(app)/ordenes/_components/carga-masiva-fields";
import type { TemplateField } from "@/components/shared/BulkUpload";
import { crearCatalogo, type CatalogoGeografico, type NodoDelCatalogo } from "@/lib/services/geografia-dominio";
import { normalizeName } from "@/lib/utils/normalize";
import {
  COLUMNAS_GEO_DE_FORMA_CR,
  COLUMNAS_NO_GEO_DE_PLANTILLA,
  columnasGeoDePlantilla,
  type ColumnaGeoDePlantilla,
} from "@/lib/utils/plantilla-geo";

import { PAIS_CUATRO_NIVELES, PAIS_DOS_NIVELES, type PaisDePruebaGeo } from "../../fixtures/paises-de-prueba-geo";

// SLT-45 (T6.1; design §8):
//   R29 — un pais de forma CR (3 niveles: provincia, canton, distrito) no cambia la plantilla: `null`.
//   R30 — otro pais: una columna por profundidad 1..max, con el nombre singular de su tipo
//         normalizado; `nivel_{n}` si la profundidad mezcla tipos o la cabecera choca.

interface NodoSimple {
  id: string;
  padreId?: string;
  nombre: string;
  /** Tipo propio; por defecto el de su profundidad (`t<n>`). */
  tipoId?: string;
  activo?: boolean;
}

/** Un catalogo con los tipos indicados (`t1`, `t2`…, uno por nombre singular) y esos nodos. */
function catalogo(nombresSingulares: string[], nodos: NodoSimple[]): CatalogoGeografico {
  const padreDe = new Map(nodos.map((n) => [n.id, n.padreId ?? null]));
  const profundidad = (id: string): number => {
    const padre = padreDe.get(id) ?? null;
    return padre === null ? 1 : 1 + profundidad(padre);
  };
  const enMemoria: NodoDelCatalogo[] = nodos.map((n) => ({
    id: n.id,
    padreId: n.padreId ?? null,
    profundidad: profundidad(n.id),
    tipoId: n.tipoId ?? `t${profundidad(n.id)}`,
    nombre: n.nombre,
    nombreNormalizado: normalizeName(n.nombre),
    codigoOficial: null,
    activo: n.activo ?? true,
  }));
  const tipos = nombresSingulares.map((nombreSingular, i) => ({
    id: `t${i + 1}`,
    clave: `nivel_${i + 1}`,
    nombreSingular,
    nombrePlural: `${nombreSingular}s`,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  }));
  return crearCatalogo("XX", tipos, enMemoria);
}

/** Los paises de prueba de T5.8, en memoria: el id de cada nodo es su ruta. */
function desdePaisDePrueba(def: PaisDePruebaGeo): CatalogoGeografico {
  return catalogo(
    def.tipos.map((t) => t.nombreSingular),
    def.nodos.map((n) => ({
      id: n.ruta.join("/"),
      ...(n.ruta.length > 1 ? { padreId: n.ruta.slice(0, -1).join("/") } : {}),
      nombre: n.ruta[n.ruta.length - 1],
      activo: n.activo ?? true,
    })),
  );
}

const CR = catalogo(
  ["Provincia", "Cantón", "Distrito"],
  [
    { id: "p", nombre: "Cartago" },
    { id: "c", padreId: "p", nombre: "Cartago" },
    { id: "d", padreId: "c", nombre: "Occidental" },
  ],
);

describe("R29 — un pais de forma CR deja la plantilla de hoy", () => {
  it("3 niveles con tipos Provincia, Cantón y Distrito → `null` (acentos y mayusculas no cuentan)", () => {
    expect(columnasGeoDePlantilla(CR)).toBeNull();
  });

  it("CONTRAPRUEBA: 3 niveles con otros tipos no es forma CR", () => {
    const otro = catalogo(
      ["Departamento", "Municipio", "Barrio"],
      [
        { id: "a", nombre: "Antioquia" },
        { id: "b", padreId: "a", nombre: "Medellin" },
        { id: "c", padreId: "b", nombre: "Laureles" },
      ],
    );
    expect(columnasGeoDePlantilla(otro)).toEqual([
      { key: "departamento", example: "Antioquia" },
      { key: "municipio", example: "Medellin" },
      { key: "barrio", example: "Laureles" },
    ]);
  });

  it("CONTRAPRUEBA: los tipos de CR en un pais de 2 niveles no son forma CR", () => {
    const dos = catalogo(
      ["Provincia", "Cantón", "Distrito"],
      [
        { id: "p", nombre: "Cartago" },
        { id: "c", padreId: "p", nombre: "Paraiso" },
      ],
    );
    expect(columnasGeoDePlantilla(dos)).toEqual([
      { key: "provincia", example: "Cartago" },
      { key: "canton", example: "Paraiso" },
    ]);
  });
});

describe("R30 — otro pais: una columna por profundidad", () => {
  it("pais de 2 niveles: departamento y municipio; el tipo sin nodos (Aldea) no tiene columna", () => {
    expect(columnasGeoDePlantilla(desdePaisDePrueba(PAIS_DOS_NIVELES))).toEqual([
      { key: "departamento", example: "Alta Verapaz" },
      { key: "municipio", example: "Cobán" },
    ]);
  });

  it("pais de 4 niveles: region, provincia, comuna y sector (normalizados, en orden de profundidad)", () => {
    expect(columnasGeoDePlantilla(desdePaisDePrueba(PAIS_CUATRO_NIVELES))).toEqual([
      { key: "region", example: "Valparaíso" },
      { key: "provincia", example: "Marga Marga" },
      { key: "comuna", example: "Quilpué" },
      { key: "sector", example: "El Belloto" },
    ]);
  });

  it("espacios a `_`: «Región Metropolitana» → `region_metropolitana`", () => {
    const cat = catalogo(
      ["Región Metropolitana", "Comuna"],
      [
        { id: "r", nombre: "Santiago" },
        { id: "c", padreId: "r", nombre: "Maipu" },
      ],
    );
    expect(columnasGeoDePlantilla(cat)?.map((c) => c.key)).toEqual(["region_metropolitana", "comuna"]);
  });

  it("el ejemplo es el primer nodo ACTIVO EN CASCADA de la profundidad; sin ninguno, no hay ejemplo", () => {
    const cat = catalogo(
      ["Departamento", "Municipio", "Barrio"],
      [
        { id: "a", nombre: "Retirado", activo: false },
        { id: "a1", padreId: "a", nombre: "Hijo de retirado" },
        { id: "a11", padreId: "a1", nombre: "Nieto de retirado" },
        { id: "b", nombre: "Vigente" },
        { id: "b1", padreId: "b", nombre: "Hijo vigente" },
      ],
    );
    expect(columnasGeoDePlantilla(cat)).toEqual([
      { key: "departamento", example: "Vigente" },
      { key: "municipio", example: "Hijo vigente" },
      { key: "barrio" },
    ]);
  });

  it("las columnas encajan en `TemplateField` (la pantalla las pone en lugar de provincia + canton_distrito)", () => {
    const columnas: ColumnaGeoDePlantilla[] = columnasGeoDePlantilla(desdePaisDePrueba(PAIS_DOS_NIVELES)) ?? [];
    const campos: TemplateField[] = columnas;
    expect(campos).toHaveLength(2);
  });
});

describe("R30 — `nivel_{n}` cuando la profundidad mezcla tipos o la cabecera choca", () => {
  it("la copia de las demas columnas es exactamente `ORDENES_BULK_FIELDS` sin las dos de geografia", () => {
    const keys = ORDENES_BULK_FIELDS.map((f) => f.key);
    expect(keys.filter((k) => COLUMNAS_GEO_DE_FORMA_CR.includes(k))).toEqual([...COLUMNAS_GEO_DE_FORMA_CR]);
    expect(keys.filter((k) => !COLUMNAS_GEO_DE_FORMA_CR.includes(k))).toEqual([...COLUMNAS_NO_GEO_DE_PLANTILLA]);
  });

  it("una profundidad con nodos de dos tipos → `nivel_{n}` solo en esa profundidad", () => {
    const cat = catalogo(
      ["Departamento", "Municipio", "Distrito municipal"],
      [
        { id: "a", nombre: "Uno" },
        { id: "a1", padreId: "a", nombre: "Municipio uno" },
        { id: "a2", padreId: "a", nombre: "Distrito uno", tipoId: "t3" },
      ],
    );
    expect(columnasGeoDePlantilla(cat)).toEqual([
      { key: "departamento", example: "Uno" },
      { key: "nivel_2", example: "Municipio uno" },
    ]);
  });

  it.each(ORDENES_BULK_FIELDS.map((f) => f.key).filter((k) => k !== "provincia" && k !== "canton_distrito"))(
    "un tipo cuya cabecera choca con la columna `%s` de la plantilla → `nivel_{n}`",
    (columna) => {
      const cat = catalogo(
        ["Departamento", columna.replace(/_/g, " ")],
        [
          { id: "a", nombre: "Uno" },
          { id: "a1", padreId: "a", nombre: "Dos" },
        ],
      );
      expect(columnasGeoDePlantilla(cat)?.map((c) => c.key)).toEqual(["departamento", "nivel_2"]);
    },
  );

  it("dos profundidades con el mismo nombre singular → `nivel_{n}` en las dos", () => {
    const cat = catalogo(
      ["Zona", "Zona"],
      [
        { id: "a", nombre: "Norte" },
        { id: "a1", padreId: "a", nombre: "Norte alto" },
      ],
    );
    expect(columnasGeoDePlantilla(cat)?.map((c) => c.key)).toEqual(["nivel_1", "nivel_2"]);
  });

  it("un tipo llamado como la reserva de OTRA profundidad (`Nivel 2` en la 1) no se la quita", () => {
    const cat = catalogo(
      ["Nivel 2", "Municipio", "Barrio"],
      [
        { id: "a", nombre: "Uno" },
        { id: "a1", padreId: "a", nombre: "Dos" },
        { id: "a2", padreId: "a", nombre: "Dos bis", tipoId: "t3" },
      ],
    );
    expect(columnasGeoDePlantilla(cat)?.map((c) => c.key)).toEqual(["nivel_1", "nivel_2"]);
  });

  it("`provincia` y `canton_distrito` no chocan: son las columnas que se sustituyen", () => {
    const cat = catalogo(
      ["Provincia", "Canton distrito"],
      [
        { id: "a", nombre: "Uno" },
        { id: "a1", padreId: "a", nombre: "Dos" },
      ],
    );
    expect(columnasGeoDePlantilla(cat)?.map((c) => c.key)).toEqual(["provincia", "canton_distrito"]);
  });
});
