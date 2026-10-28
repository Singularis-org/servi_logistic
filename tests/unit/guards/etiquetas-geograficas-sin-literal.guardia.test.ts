// GUARDIA — SL-20 (design §7; R19): NINGÚN LITERAL VISIBLE «Provincia», «Cantón» O «Distrito» EN LA UI.
//
// Los tres niveles geográficos se llaman como los llama el país de la empresa: «Departamento» en uno,
// «Provincia» en Costa Rica. Lo que se pinta sale de `useEtiquetasGeograficas`
// (`hooks/use-etiquetas-geograficas.ts`), que lee lo que `app/(app)/layout.tsx` resolvió del país. Un
// literal con el nombre de Costa Rica en `app/` o `components/` es un país implícito colado: esta
// guardia mantiene cerrada la lista de R19.
//
// Qué cuenta como literal VISIBLE: el texto de un string (comillas o plantilla, sin las partes `${…}`)
// o de un texto JSX, leído con el escáner de TypeScript (AST), así que los comentarios no cuentan. Se
// buscan las palabras con mayúscula inicial («Provincia», «Provincias», «Cantón», «Canton»,
// «Cantones», «Distrito», «Distritos») como palabra suelta: `ProvinciaArbolDTO` o
// `"listarCoberturaDistritos"` no son texto para una persona. Los especificadores de módulo
// (`import … from "…"`) no cuentan.
//
// Las minúsculas dentro de una frase («el distrito está marcado…») quedan fuera: llevan artículo y
// concordancia de género, que el dato del país no trae (pregunta abierta en `progress/impl_SL-20-T5b.md`).
//
// Excepciones: `EXCEPCIONES`, cada una con su motivo. Una entrada que ya no encuentra nada también
// falla, para que la lista no engorde en silencio.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["app", "components"] as const;

/** Las palabras vigiladas, como palabra suelta (letras Unicode a los lados no cuentan). */
const PALABRA = /(?<![\p{L}\p{N}_])(Provincias?|Cant[oó]n(?:es)?|Distritos?)(?![\p{L}\p{N}_])/u;

/**
 * Archivo → motivo. Vacía hoy: toda la lista de R19 pasó a los nombres del país. Una entrada nueva
 * tiene que decir por qué ese texto no es de una empresa (p. ej. una pantalla de plataforma que no
 * tiene país).
 */
const EXCEPCIONES: Readonly<Record<string, string>> = {};

export interface Hallazgo {
  archivo: string;
  linea: number;
  texto: string;
}

function listarFuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) listarFuentes(completo, acc);
    else if (/\.tsx?$/.test(entrada.name) && !/\.d\.ts$/.test(entrada.name)) acc.push(completo);
  }
  return acc;
}

function esEspecificadorDeModulo(nodo: ts.Node): boolean {
  const padre = nodo.parent;
  if (!padre) return false;
  if ((ts.isImportDeclaration(padre) || ts.isExportDeclaration(padre)) && padre.moduleSpecifier === nodo) {
    return true;
  }
  // `import("…")` tampoco es texto para nadie.
  return ts.isCallExpression(padre) && padre.expression.kind === ts.SyntaxKind.ImportKeyword;
}

/** Los literales visibles de una fuente que nombran un nivel con el nombre de Costa Rica. */
export function literalesGeograficos(fuente: string, archivo = "fuente.tsx"): Hallazgo[] {
  const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hallazgos: Hallazgo[] = [];
  const mirar = (nodo: ts.Node, texto: string) => {
    if (!PALABRA.test(texto)) return;
    const { line } = sf.getLineAndCharacterOfPosition(nodo.getStart(sf));
    hallazgos.push({ archivo, linea: line + 1, texto: texto.trim().slice(0, 120) });
  };
  const visitar = (nodo: ts.Node) => {
    if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) {
      if (!esEspecificadorDeModulo(nodo)) mirar(nodo, nodo.text);
    } else if (ts.isTemplateHead(nodo) || ts.isTemplateMiddle(nodo) || ts.isTemplateTail(nodo)) {
      mirar(nodo, nodo.text);
    } else if (ts.isJsxText(nodo)) {
      mirar(nodo, nodo.text);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return hallazgos;
}

function rutaRelativa(archivo: string): string {
  return path.relative(RAIZ, archivo).split(path.sep).join("/");
}

function barrer(): Hallazgo[] {
  return ARBOLES.flatMap((arbol) => listarFuentes(path.join(RAIZ, arbol)))
    .sort()
    .flatMap((archivo) => literalesGeograficos(readFileSync(archivo, "utf8"), rutaRelativa(archivo)));
}

describe("SL-20 / R19 — ningún literal «Provincia», «Cantón» o «Distrito» visible en app/ ni components/", () => {
  it("contraprueba: el detector caza el literal en un string, una plantilla y un texto JSX", () => {
    const inventado = [
      'const a = { label: "Provincia" };',
      "const b = `Distritos seleccionados: ${n}.`;",
      "const c = `Total: ${n} Cantones`;",
      "const d = <Campo label=\"x\">Canton</Campo>;",
    ].join("\n");
    expect(literalesGeograficos(inventado).map((h) => h.linea)).toEqual([1, 2, 3, 4]);
  });

  it("contraprueba: no caza comentarios, identificadores, minúsculas ni especificadores de módulo", () => {
    const inventado = [
      "// Provincia en un comentario",
      "/* Cantón */",
      "type ProvinciaArbolDTO = { distrito: string };",
      'const e = "listarCoberturaDistritos";',
      'const f = "Filtrar por cantón y distrito";',
      'import { FiltroCantonDistrito } from "./FiltroCantonDistrito";',
      "const g = <p>{etiquetas.provincia.singular}</p>;",
    ].join("\n");
    expect(literalesGeograficos(inventado)).toEqual([]);
  });

  it("el barrido de app/ y components/ no encuentra ninguno fuera de las excepciones", () => {
    const hallazgos = barrer();
    const sinMotivo = hallazgos
      .filter((h) => !(h.archivo in EXCEPCIONES))
      .map((h) => `${h.archivo}:${h.linea} — ${h.texto}`);
    expect(
      sinMotivo,
      "Estos textos nombran un nivel geográfico con el nombre de Costa Rica. Usa " +
        "`useEtiquetasGeograficas()` (o recibe las `etiquetas` por parámetro) y pinta " +
        "`etiquetas.provincia|canton|distrito.singular|plural`. Si de verdad no es texto de una " +
        "empresa, añádelo a EXCEPCIONES con su motivo.",
    ).toEqual([]);

    // Una excepción que ya no encuentra nada sobra.
    const conHallazgo = new Set(hallazgos.map((h) => h.archivo));
    const sobrantes = Object.keys(EXCEPCIONES).filter((archivo) => !conHallazgo.has(archivo));
    expect(sobrantes, "excepciones sin ningún literal: quítalas de EXCEPCIONES").toEqual([]);
  });

  it("el barrido lee el árbol: hay fuentes en app/ y en components/", () => {
    // Una guardia estática rota no falla, calla: si el recorrido no leyera nada, pasaría verde.
    for (const arbol of ARBOLES) {
      expect(listarFuentes(path.join(RAIZ, arbol)).length, `no se leyó ${arbol}/`).toBeGreaterThan(10);
    }
  });
});
