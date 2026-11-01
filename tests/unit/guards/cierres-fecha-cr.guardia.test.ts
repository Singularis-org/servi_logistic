import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// =================================================================================================
// GUARDIA — SLT-76 (R2) — LOS CIERRES NO SACAN EL DÍA RECORTANDO LA FECHA EN UTC
// =================================================================================================
//
// Las fechas de un cierre (`solicitadoAt`, `resueltoAt`, `conciliadoAt`) viajan como ISO en UTC.
// Recortarlas a 10 caracteres da el día UTC: todo cierre hecho después de las 18:00 de Costa Rica
// salía fechado al día siguiente. El día se saca con `fechaCalendarioCR` (`lib/utils/fecha-cr.ts`).
//
// El detector es el de `wallet-fecha-cr-459.guardia.test.ts` (mismas PROHIBIDAS, sin comentarios),
// pasado por `app/(app)/cierres-admin/**` y `app/(app)/cierre-dia/**`. Con contraprueba y suelo de
// archivos revisados.
//
// Las columnas de las DESCARGAS de cierres usaban `fechaDiaISO(<x>At)`, el mismo recorte; la
// enmienda R21 las pasó al día de Costa Rica y `DESCARGAS_PENDIENTES` quedó VACÍA. Se conserva la
// comparación EXACTA contra ella: cualquier línea que vuelva a recortar pone la guardia en rojo.

const RAIZ = path.resolve(__dirname, "../../..");
const CARPETAS = ["app/(app)/cierres-admin", "app/(app)/cierre-dia"];

/** Las formas prohibidas: un recorte de 10 caracteres o `fechaDiaISO` sobre un campo de fecha. */
const PROHIBIDAS: readonly RegExp[] = [
  /\.(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/,
  /fechaDiaISO\(\s*[\w.?]*\b(?:fecha\w*|\w+At)\s*\)/,
];

/** Recortes tolerados en las descargas: NINGUNO desde la enmienda R21 de SLT-76. */
const DESCARGAS_PENDIENTES: readonly string[] = [];

function archivosDe(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDe(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

/** Líneas de código (sin comentarios) que recortan una fecha en UTC. */
function recortesEn(fuente: string): string[] {
  return quitarComentarios(fuente)
    .split("\n")
    .filter((linea) => PROHIBIDAS.some((re) => re.test(linea)))
    .map((linea) => linea.trim());
}

describe("GUARDIA SLT-76/R2 — los cierres no recortan fechas en UTC", () => {
  it("contraprueba: el detector encuentra las formas de antes de la ficha", () => {
    expect(
      recortesEn("aria-label={`Ver detalle del cierre del ${c.solicitadoAt.slice(0, 10)}`}"),
    ).toHaveLength(1);
    expect(
      recortesEn("? `${ESTADO_LABEL[x.estado]} · ${cierreAbierto.solicitadoAt.slice(0, 10)}`"),
    ).toHaveLength(1);
    expect(recortesEn('  return iso ? iso.slice(0, 10) : "—";')).toHaveLength(1);
    expect(recortesEn("const dia = cierre.conciliadoAt.substring(0, 10);")).toHaveLength(1);
    expect(recortesEn("fecha: fechaDiaISO(cierre.solicitadoAt),")).toHaveLength(1);
    // Lo que SÍ se puede escribir no salta.
    expect(recortesEn("del cierre del ${fechaCalendarioCR(new Date(c.solicitadoAt))}")).toEqual([]);
    expect(recortesEn("return cierreId.slice(-8).toUpperCase();")).toEqual([]);
    // Y en un comentario no cuenta.
    expect(recortesEn("// antes: iso.slice(0, 10)")).toEqual([]);
  });

  it("ningún archivo de /cierres-admin ni de /cierre-dia corta una fecha así", () => {
    const hallazgos: string[] = [];
    const revisados: string[] = [];
    const revisadosPorCarpeta = new Map<string, number>();
    for (const carpeta of CARPETAS) {
      let cuantos = 0;
      for (const ruta of archivosDe(path.join(RAIZ, carpeta))) {
        cuantos += 1;
        const relativa = path.relative(RAIZ, ruta).split(path.sep).join("/");
        revisados.push(relativa);
        for (const linea of recortesEn(readFileSync(ruta, "utf8"))) {
          hallazgos.push(`${relativa}: ${linea}`);
        }
      }
      revisadosPorCarpeta.set(carpeta, cuantos);
    }
    // Sin archivos que mirar la guardia sería verde por vacía (hoy: 34 y 3).
    expect(revisadosPorCarpeta.get("app/(app)/cierres-admin")).toBeGreaterThanOrEqual(30);
    expect(revisadosPorCarpeta.get("app/(app)/cierre-dia")).toBeGreaterThanOrEqual(3);
    // Las dos superficies que arregló SLT-76 están entre los revisados.
    expect(revisados).toContain("app/(app)/cierres-admin/_components/cierre-factura.tsx");
    expect(revisados).toContain("app/(app)/cierre-dia/_components/CierreDiaModule.tsx");
    // Las descargas de cierres (R21) también están entre los revisados.
    expect(revisados).toEqual(
      expect.arrayContaining([
        "app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts",
        "app/(app)/cierres-admin/_components/cierres-admin-descarga-columnas.ts",
        "app/(app)/cierres-admin/_components/cierres-bodega-descarga-columnas.ts",
        "app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts",
      ]),
    );
    expect(hallazgos.sort()).toEqual([...DESCARGAS_PENDIENTES].sort());
  });
});
