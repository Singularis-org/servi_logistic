import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { codigoSinComentarios, quitarComentarios } from "../../fixtures/sin-comentarios";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-38 / R22 — LA MARCA DE ZONA ESPECIAL SE LEE POR UN UNICO PUNTO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// LA REGLA, en una frase mecanicamente comprobable:
//
//   NINGUN archivo de `lib/` ni de `app/` fuera de `_shared/zona-especial.ts` y de
//   `DistritoZonaEspecialRepository.ts` puede nombrar la relacion de marcas (`zonasEspeciales`,
//   `distritoZonasEspeciales`) ni el modelo (`distritoZonaEspecial`).
//
// POR QUE ASI. Las ocho lecturas de la marca deciden el flete del pacto especial. Si una de ellas
// arma su propio `select` o su propio predicado, es una segunda definicion de «especial para la
// empresa» que puede divergir —leer otra relacion, olvidar el `take`, o leer la tabla sin pasar por
// la relacion que acota la RLS— y tarifar mal sin romper ningun test. Prohibiendo el NOMBRE, la
// lectura solo puede componerse con `SELECT_MARCA_ZONA_ESPECIAL` y `esZonaEspecialDeLaEmpresa`, y
// la escritura solo puede vivir en su repositorio.
//
// QUE NO HACE, para que no se suponga:
//   - NO barre `tests/` ni `db/`: los dobles de Prisma y los tests de integracion construyen la
//     forma de la fila a proposito.
//   - NO vigila la columna vieja `distrito.zona_especial`: eso lo garantiza el typecheck desde que
//     T7 la retira del esquema.
//
// La selecciona `pnpm run test:guardias` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app"].map((d) => path.join(RAIZ, d));
const FUENTE_UNICA = "lib/repositories/_shared/zona-especial.ts";
const PERMITIDOS = new Set([FUENTE_UNICA, "lib/repositories/DistritoZonaEspecialRepository.ts"]);

/** EL DETECTOR. Cada nombre prohibido que aparece en el codigo (ya sin comentarios). */
export function nombresDeLaMarcaEn(codigo: string): string[] {
  return [
    ...codigo.matchAll(/\b(zonasEspeciales|distritoZonasEspeciales|distritoZonaEspecial)\b/g),
  ].map((m) => m[1]);
}

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) fuentes(completo, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(completo);
  }
  return acc;
}

function relativo(archivo: string): string {
  return path.relative(RAIZ, archivo).split(path.sep).join("/");
}

/** Los hallazgos de un conjunto de fuentes `{ ruta → codigo }`, fuera de los permitidos. */
export function hallazgosEn(fuentesPorRuta: ReadonlyMap<string, string>): string[] {
  const hallazgos: string[] = [];
  for (const [rel, codigo] of fuentesPorRuta) {
    if (PERMITIDOS.has(rel)) continue;
    for (const nombre of nombresDeLaMarcaEn(codigo)) hallazgos.push(`${rel}: ${nombre}`);
  }
  return hallazgos;
}

function arbolReal(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const arbol of ARBOLES) {
    for (const archivo of fuentes(arbol)) {
      const rel = relativo(archivo);
      mapa.set(rel, codigoSinComentarios(rel));
    }
  }
  return mapa;
}

// ---------------------------------------------------------------------------------------------
// 0 — El detector, contra respuestas conocidas
// ---------------------------------------------------------------------------------------------

describe("SL-38/R22 — el detector se prueba a si mismo", () => {
  const LECTURA_SANA = `
    async findDistritosByCantonIds(ids: string[]) {
      const rows = await this.prisma.distrito.findMany({
        where: { cantonId: { in: ids } },
        select: { id: true, nombre: true, ...SELECT_MARCA_ZONA_ESPECIAL },
      });
      return rows.map((r) => ({ id: r.id, esZonaEspecial: esZonaEspecialDeLaEmpresa(r) }));
    }`;

  it("CONTRAPRUEBA (control positivo): la lectura por el punto unico NO produce hallazgos", () => {
    const mapa = new Map([["lib/repositories/OrdenRepository.ts", LECTURA_SANA]]);
    expect(hallazgosEn(mapa)).toEqual([]);
  });

  it("CASO NEGATIVO: una fuente inventada que lee la relacion por su cuenta DEBE fallar", () => {
    // La mutacion que el design nombra: alguien arma su propio `select` y su propio predicado.
    const inventada = `
      const rows = await this.prisma.distrito.findMany({
        select: { id: true, zonasEspeciales: { select: { id: true } } },
      });
      return rows.map((r) => ({ id: r.id, esZonaEspecial: r.zonasEspeciales.length > 0 }));`;
    const mapa = new Map([["lib/repositories/InventadoRepository.ts", inventada]]);
    expect(hallazgosEn(mapa)).toEqual([
      "lib/repositories/InventadoRepository.ts: zonasEspeciales",
      "lib/repositories/InventadoRepository.ts: zonasEspeciales",
    ]);
  });

  it("CASO NEGATIVO: leer el modelo o la relacion inversa de la empresa fuera de su repositorio DEBE fallar", () => {
    const mapa = new Map([
      ["app/(app)/x/page.tsx", "await prisma.distritoZonaEspecial.findMany({});"],
      ["lib/services/X.ts", "organizacion.findUnique({ select: { distritoZonasEspeciales: true } })"],
    ]);
    expect(hallazgosEn(mapa)).toEqual([
      "app/(app)/x/page.tsx: distritoZonaEspecial",
      "lib/services/X.ts: distritoZonasEspeciales",
    ]);
  });

  it("el repositorio de escritura y el punto unico SI pueden nombrarlos", () => {
    const mapa = new Map([
      ["lib/repositories/DistritoZonaEspecialRepository.ts", "tx.distritoZonaEspecial.deleteMany({})"],
      [FUENTE_UNICA, "zonasEspeciales: { select: { id: true }, take: 1 }"],
    ]);
    expect(hallazgosEn(mapa)).toEqual([]);
  });

  it("no confunde el DTO de salida ni los nombres de clase o de dependencia", () => {
    expect(nombresDeLaMarcaEn("return { zonaEspecial: esZonaEspecialDeLaEmpresa(d) };")).toEqual([]);
    expect(nombresDeLaMarcaEn("new DistritoZonaEspecialRepository(getPrismaClient())")).toEqual([]);
    expect(nombresDeLaMarcaEn("deps.distritoZonaEspecialService ?? build()")).toEqual([]);
    expect(nombresDeLaMarcaEn("import type { IDistritoZonaEspecialRepository } from 'x';")).toEqual([]);
  });

  it("un comentario que nombra la relacion no cuenta: se mide sobre el codigo sin comentarios", () => {
    expect(nombresDeLaMarcaEn(quitarComentarios("// lee zonasEspeciales por el punto unico\nconst a = 1;"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 1 — Anti-vacuidad
// ---------------------------------------------------------------------------------------------

describe("SL-38/R22 — el barrido lee de verdad", () => {
  it("la FUENTE UNICA existe y SI nombra la relacion: es suya", () => {
    expect(existsSync(path.join(RAIZ, FUENTE_UNICA))).toBe(true);
    expect(nombresDeLaMarcaEn(codigoSinComentarios(FUENTE_UNICA))).toContain("zonasEspeciales");
  });

  it("`lib/` y `app/` tienen un numero razonable de fuentes", () => {
    const mapa = arbolReal();
    expect([...mapa.keys()].filter((r) => r.startsWith("lib/")).length).toBeGreaterThan(200);
    expect([...mapa.keys()].filter((r) => r.startsWith("app/")).length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------------------------
// 2 — R22: el arbol real
// ---------------------------------------------------------------------------------------------

describe("SL-38/R22 — toda lectura de la marca pasa por `_shared/zona-especial.ts`", () => {
  it("ningun otro archivo de `lib/` ni de `app/` nombra la relacion de marcas ni su modelo", () => {
    expect(
      hallazgosEn(arbolReal()),
      "la marca de zona especial de la empresa se lee SOLO con `SELECT_MARCA_ZONA_ESPECIAL` y " +
        "`esZonaEspecialDeLaEmpresa` (lib/repositories/_shared/zona-especial.ts), y se escribe SOLO " +
        "en `DistritoZonaEspecialRepository`. Una segunda lectura a mano es una segunda definicion " +
        "de «especial» que puede tarifar mal sin romper ningun test",
    ).toEqual([]);
  });
});
