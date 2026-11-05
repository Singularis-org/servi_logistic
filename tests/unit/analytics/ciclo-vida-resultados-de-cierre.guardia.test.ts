import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { GestionResultado } from "@prisma/client";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import { RESULTADOS_DE_CIERRE } from "@/lib/types/conteo-ciclo-vida";

// SLT-64 / T1.2 — GUARDIA de R10: «resultado de cierre» se declara en un solo sitio.
//
// Una lista copiada en el repositorio no rompe nada al copiarla: rompe el dia que cambie la otra, y
// la pantalla seguiria dando una cifra plausible. El censo mira solo el codigo porque la cabecera del
// repositorio tiene que poder explicar que resultados cierran.

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const REPOSITORIO = "lib/repositories/CicloVidaRepository.ts";

// Escrita a mano a proposito: ES el contrato de R10. Derivarla de la constante daria siempre verde.
const CONTRATO = ["entregado", "devolucion_a_origen_por_rechazo", "incidente"];

function literalesEscritos(fuente: string): string[] {
  const codigo = quitarComentarios(fuente);
  return CONTRATO.filter((valor) => new RegExp(`["'\`]${valor}["'\`]`).test(codigo));
}

function importaLaConstante(fuente: string): boolean {
  const codigo = quitarComentarios(fuente);
  return /import\s+\{[^}]*\bRESULTADOS_DE_CIERRE\b[^}]*\}\s+from\s+["']@\/lib\/types\/conteo-ciclo-vida["']/.test(
    codigo,
  );
}

function usaLaConstante(fuente: string): boolean {
  return /\[\.\.\.RESULTADOS_DE_CIERRE\]/.test(quitarComentarios(fuente));
}

function leerRepositorio(): string {
  return fs.readFileSync(path.join(REPO_ROOT, ...REPOSITORIO.split("/")), "utf8");
}

describe("R10 · los resultados que cierran una orden", () => {
  it("son exactamente `entregado`, `devolucion_a_origen_por_rechazo` e `incidente`", () => {
    expect([...RESULTADOS_DE_CIERRE]).toEqual(CONTRATO);
  });

  it("cada uno existe en el enum `GestionResultado` de Prisma", () => {
    const delEnum: string[] = Object.values(GestionResultado);
    expect(delEnum.length).toBeGreaterThan(0);
    for (const valor of RESULTADOS_DE_CIERRE) expect(delEnum, valor).toContain(valor);
  });
});

describe("R10 · el repositorio del ciclo de vida importa la lista y no la escribe", () => {
  it("el archivo censado existe (si no, el guardia estaria verde por vacio)", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, ...REPOSITORIO.split("/")))).toBe(true);
  });

  it("no contiene ninguno de los valores como literal", () => {
    const escritos = literalesEscritos(leerRepositorio());
    expect(
      escritos,
      `${REPOSITORIO} escribe a mano ${escritos.join(", ")}: importa \`RESULTADOS_DE_CIERRE\`.`,
    ).toEqual([]);
  });

  it("importa `RESULTADOS_DE_CIERRE` y la rinde a SQL", () => {
    const fuente = leerRepositorio();
    expect(importaLaConstante(fuente)).toBe(true);
    expect(usaLaConstante(fuente)).toBe(true);
  });

  it("ya no depende de la transicion terminal", () => {
    const codigo = quitarComentarios(leerRepositorio());
    expect(codigo).not.toContain("ESTADOS_TERMINALES");
    expect(codigo).not.toContain("orden_historial_estado");
  });
});

describe("R10 · autocomprobacion: el detector muerde", () => {
  it("cae el que escribe la lista a mano, y basta uno de los tres", () => {
    expect(literalesEscritos(`const R = Prisma.join(["entregado", "incidente"]);`)).toEqual([
      "entregado",
      "incidente",
    ]);
    expect(literalesEscritos("const w = Prisma.sql`g.resultado = 'devolucion_a_origen_por_rechazo'`;")).toEqual([
      "devolucion_a_origen_por_rechazo",
    ]);
    expect(importaLaConstante(`const R = ["incidente"];`)).toBe(false);
  });

  it("pasa el que la importa y no se deja enganar por un comentario", () => {
    const legitimo = `
// cierran "entregado", "devolucion_a_origen_por_rechazo" e "incidente"
import { RESULTADOS_DE_CIERRE } from "@/lib/types/conteo-ciclo-vida";
const R = Prisma.join([...RESULTADOS_DE_CIERRE]);
`;
    expect(literalesEscritos(legitimo)).toEqual([]);
    expect(importaLaConstante(legitimo)).toBe(true);
    expect(usaLaConstante(legitimo)).toBe(true);
  });
});
