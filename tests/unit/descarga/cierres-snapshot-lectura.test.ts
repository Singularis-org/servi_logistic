import { describe, expect, it } from "vitest";

import { ubicacion } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { filaDescargaGestionFundida } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";
import { leerUbicacionCongelada } from "@/lib/types/ubicacion-snapshot";
import { CIERRE_DIA_CR, CIERRES_ADMIN_CR, SNAPSHOTS_CIERRES_ADMIN_CR } from "@/tests/fixtures/descargas-cr/entrada";

// SLT-125 (design §4.4; R24–R26) — EL DETALLE Y LA DESCARGA DE CIERRES ADMIN LEEN LA UBICACIÓN CONGELADA.
//
// El servidor (`CierresAdminRepository`) pone en cada fila `lugarRuta = leerUbicacionCongelada(fila)`.
// Aquí se compone ese mismo paso con las dos superficies de presentación —la línea del detalle
// (`ubicacion`, que también usa el comprobante) y la celda «Ubicación» de la hoja fundida— para fijar
// lo que una persona ve:
//  · con un snapshot v1, los nombres de `niveles[].nombre`, en su orden, aunque las columnas digan otra
//    cosa y aunque un `id` sea nulo (R24);
//  · sin snapshot o con uno que no es v1, las tres columnas de nombre, como hoy (R25);
//  · en Costa Rica, lo mismo con snapshot que sin él (R26).
// Los nombres de lugar de las filas de 4 y 10 niveles son inventados: ninguno es un tipo de nivel (R42).

/** Lo que el repositorio hace con una fila: le pone la ruta congelada. */
function conRutaCongelada<T extends { provinciaNombre: string; cantonNombre: string; distritoNombre: string | null }>(
  fila: T,
  ubicacionSnapshot: unknown,
): T & { lugarRuta: ReturnType<typeof leerUbicacionCongelada> } {
  return { ...fila, lugarRuta: leerUbicacionCongelada({ ...fila, ubicacionSnapshot }) };
}

const snapshotDe = (nombres: readonly string[], ids: (string | null)[] = []) => ({
  v: 1,
  niveles: nombres.map((nombre, k) => ({ profundidad: k + 1, tipo: `T${k + 1}`, nombre, id: ids[k] ?? null })),
});

const ADMIN = CIERRES_ADMIN_CR[0]!; // Zona Central · San José · San José · Carmen
const DETALLE: CierreDetalleGestion = CIERRE_DIA_CR[0]!;

function lineas(snapshot: unknown): { detalle: string; descarga: unknown } {
  return {
    detalle: ubicacion(conRutaCongelada(DETALLE, snapshot)),
    descarga: filaDescargaGestionFundida(conRutaCongelada(ADMIN, snapshot)).ubicacion,
  };
}

describe("R24 — con un snapshot v1, la ruta sale de niveles[].nombre", () => {
  it("4 niveles, con ids nulos: los nombres del snapshot y no los de las columnas", () => {
    const l = lineas(snapshotDe(["Alfa", "Beta", "Gama", "Delta"], [null, "b", null, null]));
    expect(l.detalle).toBe("Zona Central · Alfa · Beta · Gama · Delta");
    expect(l.descarga).toBe("Zona Central · Alfa · Beta · Gama · Delta");
  });

  it("10 niveles, en el orden del snapshot", () => {
    const nombres = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10"];
    const l = lineas(snapshotDe(nombres));
    expect(l.detalle).toBe(["Zona Central", ...nombres].join(" · "));
    expect(l.descarga).toBe(["Zona Central", ...nombres].join(" · "));
  });

  it("2 niveles: solo esos dos, aunque las columnas traigan tres", () => {
    const l = lineas(snapshotDe(["Alfa", "Beta"]));
    expect(l.detalle).toBe("Zona Central · Alfa · Beta");
    expect(l.descarga).toBe("Zona Central · Alfa · Beta");
  });

  it("el nombre es la foto: un id que no existe no cambia nada", () => {
    const l = lineas(snapshotDe(["Viejo"], ["id-que-no-existe"]));
    expect(l.detalle).toBe("Zona Central · Viejo");
  });
});

describe("R25 — sin snapshot o con uno que no es v1, las tres columnas como hoy", () => {
  const HOY = "Zona Central · San José · San José · Carmen";

  it.each([
    ["sin snapshot (null)", null],
    ["versión desconocida", { v: 2, niveles: [{ profundidad: 1, tipo: "T", nombre: "X", id: null }] }],
    ["sin niveles", { v: 1, niveles: [] }],
    ["niveles con forma rota", { v: 1, niveles: [{ nombre: 3 }] }],
    ["texto suelto", "no soy un snapshot"],
  ])("%s: sin error y con los tres nombres", (_, snapshot) => {
    const l = lineas(snapshot);
    expect(l.detalle).toBe(HOY);
    expect(l.descarga).toBe(HOY);
  });
});

describe("R26 — Costa Rica: el detalle y la descarga dan lo mismo con snapshot que sin él", () => {
  it.each(CIERRES_ADMIN_CR.map((fila, i) => [fila.numRemision, i] as const))("%s", (_, i) => {
    const fila = CIERRES_ADMIN_CR[i]!;
    const detalle = CIERRE_DIA_CR[i]!;
    const snapshot = SNAPSHOTS_CIERRES_ADMIN_CR[i] ?? null;
    // La fila con su snapshot de la entrada (o sin él), contra la misma fila sin snapshot y sin ruta.
    expect(filaDescargaGestionFundida(conRutaCongelada(fila, snapshot)).ubicacion).toBe(
      filaDescargaGestionFundida(fila).ubicacion,
    );
    expect(filaDescargaGestionFundida(conRutaCongelada(fila, null)).ubicacion).toBe(
      filaDescargaGestionFundida(fila).ubicacion,
    );
    expect(ubicacion(conRutaCongelada(detalle, snapshot))).toBe(ubicacion(detalle));
  });

  it("con un snapshot armado de las columnas, cada fila CR da lo mismo que sin él", () => {
    for (const fila of CIERRES_ADMIN_CR) {
      const nombres = [fila.provinciaNombre, fila.cantonNombre, fila.distritoNombre].filter(
        (n): n is string => Boolean(n),
      );
      expect(filaDescargaGestionFundida(conRutaCongelada(fila, snapshotDe(nombres))).ubicacion).toBe(
        filaDescargaGestionFundida(conRutaCongelada(fila, null)).ubicacion,
      );
    }
  });
});
