import { describe, expect, it } from "vitest";

import { filaDescargaDiaEntregada } from "@/app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas";
import { filaDescargaGestionFundida } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas";
import { filaDescargaAyuda } from "@/app/(app)/novedades/_components/ayuda-descarga-columnas";
import { filaDescargaNovedad } from "@/app/(app)/novedades/_components/novedades-descarga-columnas";
import type { DescargaFila } from "@/lib/types/descarga";
import { CIERRE_DIA_CR, CIERRES_ADMIN_CR, NOVEDADES_CR } from "@/tests/fixtures/descargas-cr/entrada";

// SLT-125 (design §3, §5; R7, R8) — LA COLUMNA «UBICACIÓN» DE LAS DESCARGAS DE NOVEDADES, AYUDA, CIERRE DE
// DÍA Y CIERRES ADMIN, EN PAÍSES DE 2, 3, 4 Y 10 NIVELES.
//
// Es una sola celda: la zona y TODOS los nombres de la ruta (`lugarRuta`, del nivel 1 al lugar), unidos
// por « · » y sin tramos vacíos. Sin ningún tramo, celda vacía (`null`). Los nombres de lugar de este
// archivo son inventados a propósito: ninguno es un tipo de nivel (R42).

const paso = (nombre: string, i: number) => ({ id: `n-${i}`, nombre });

const RUTAS = {
  "2 niveles": ["Alfa", "Beta"],
  "3 niveles": ["Alfa", "Beta", "Gama"],
  "4 niveles": ["Alfa", "Beta", "Gama", "Delta"],
  "10 niveles": ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10"],
} as const;

/** Las cuatro descargas, cada una con su fila de ejemplo (de la entrada CR) y su función de fila. */
const DESCARGAS: readonly { nombre: string; fila: (lugarRuta: unknown, zona: string) => DescargaFila }[] = [
  {
    nombre: "novedades",
    fila: (lugarRuta, zona) => filaDescargaNovedad({ ...NOVEDADES_CR[0]!, zonaNombre: zona, lugarRuta } as never),
  },
  {
    nombre: "ayuda",
    fila: (lugarRuta, zona) => filaDescargaAyuda({ ...NOVEDADES_CR[0]!, zonaNombre: zona, lugarRuta } as never),
  },
  {
    nombre: "cierre de día",
    fila: (lugarRuta, zona) =>
      filaDescargaDiaEntregada({ ...CIERRE_DIA_CR[0]!, zonaNombre: zona, lugarRuta } as never),
  },
  {
    nombre: "cierres admin (fundida)",
    fila: (lugarRuta, zona) =>
      filaDescargaGestionFundida({ ...CIERRES_ADMIN_CR[0]!, zonaNombre: zona, lugarRuta } as never),
  },
];

describe("R7 — «Ubicación» de una línea con toda la ruta, en países de 2, 3, 4 y 10 niveles", () => {
  for (const d of DESCARGAS) {
    describe(d.nombre, () => {
      it.each(Object.entries(RUTAS))("%s: la zona y todos los nombres, unidos por « · »", (_, nombres) => {
        const ruta = nombres.map(paso);
        expect(d.fila(ruta, "Zona Uno").ubicacion).toBe(["Zona Uno", ...nombres].join(" · "));
      });

      it("los tramos vacíos se omiten (zona vacía y un nombre vacío en medio)", () => {
        const ruta = [paso("Alfa", 0), paso("", 1), paso("Gama", 2), paso("Delta", 3)];
        expect(d.fila(ruta, "").ubicacion).toBe("Alfa · Gama · Delta");
      });

      it("sin ningún tramo, la celda queda vacía (null)", () => {
        expect(d.fila([], "").ubicacion).toBeNull();
      });

      it("la ruta manda sobre los tres nombres de hoy: no se mezclan", () => {
        const ruta = RUTAS["4 niveles"].map(paso);
        const celda = d.fila(ruta, "Zona Uno").ubicacion as string;
        expect(celda.split(" · ")).toHaveLength(5);
        expect(celda).not.toContain("San José");
      });

      it("sin `lugarRuta`, los tres nombres de hoy", () => {
        expect(d.fila(undefined, "Zona Central").ubicacion).toBe("Zona Central · San José · San José · Carmen");
      });
    });
  }
});
