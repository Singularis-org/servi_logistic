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

import { CLAVES_OCULTAS_EN_SELECTOR } from "@/lib/types/plantilla-datos";
import { ARCHIVOS_NUEVOS_SLT125, ARCHIVOS_SLT125 } from "../../fixtures/archivos-slt125";

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

// SLT-54 (M3 de la revisión F2.2) — un conteo no lleva artículo ni concordancia, así que la excusa de las
// minúsculas no aplica: «8 distritos» se escapó porque la guardia de arriba solo mira la mayúscula inicial.
// Se limita a Tarifas: `ZonasModule` y `GeografiaSelector` llevan el mismo conteo y están fuera de esta ficha.
const NIVEL_EN_MINUSCULA = "(?:provincias?|cant[oó]n(?:es)?|distritos?)";
const CONTEO = new RegExp(`(?:\\d\\s+|^\\s+)${NIVEL_EN_MINUSCULA}(?![\\p{L}\\p{N}_])`, "u");

function conteosDeNivel(fuente: string): string[] {
  const sf = ts.createSourceFile("fuente.tsx", fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hallados: string[] = [];
  const visitar = (nodo: ts.Node) => {
    if (
      ts.isStringLiteral(nodo) ||
      ts.isNoSubstitutionTemplateLiteral(nodo) ||
      ts.isTemplateMiddle(nodo) ||
      ts.isTemplateTail(nodo) ||
      ts.isJsxText(nodo)
    ) {
      if (CONTEO.test(nodo.text)) hallados.push(nodo.text);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return hallados;
}

// SLT-125 (T3.6; R42) — los archivos de la feature fuera de `app/` y `components/` tambien. El barrido de
// arriba ya cubre los de `app/`; aqui se barren TODOS los archivos fuente de SLT-125
// (`tests/fixtures/archivos-slt125.ts`), incluidos los de `lib/` que arman lo que se pinta (la ruta, el
// snapshot, la etiqueta, el PDF de transito, las variables de plantilla). Los tipos de nivel salen del
// pais de la empresa, nunca de un literal.
//
// Lo unico que el barrido no cuenta son las 3 entradas del catalogo de plantillas `{{provincia}}`,
// `{{canton}}` y `{{distrito}}` de `lib/types/plantilla-datos.ts`. Son anteriores a SLT-125 (base
// SLT-47), sus nombres son los internos de SL-20 (decision cerrada: se quedan) y estan ocultas en el
// selector (P2). Cambiarlas cambiaria Costa Rica (`nombresDeVariables`). Cualquier otro literal del
// archivo, y cualquiera que se siembre dentro de otra entrada, sigue siendo hallazgo.
const ENTRADAS_INTERNAS_SL20: Readonly<Record<string, readonly string[]>> = {
  "lib/types/plantilla-datos.ts": ["provincia", "canton", "distrito"],
};

/** `fuente` sin la entrada `definir({ clave: "<clave>", … })` de cada clave. Lanza si falta una. */
export function sinEntradasDelCatalogo(fuente: string, claves: readonly string[]): string {
  let resto = fuente;
  for (const clave of claves) {
    const marca = resto.indexOf(`clave: "${clave}",`);
    const inicio = marca < 0 ? -1 : resto.lastIndexOf("definir({", marca);
    const fin = marca < 0 ? -1 : resto.indexOf("\n  }),", marca);
    if (inicio < 0 || fin < 0) throw new Error(`no se encontro la entrada ${clave}`);
    resto = resto.slice(0, inicio) + resto.slice(fin + "\n  }),".length);
  }
  return resto;
}

describe("SLT-125 / R42 — ningún literal de nivel en los archivos de SLT-125", () => {
  const leerFuente = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

  it("el barrido lee de verdad (anti-vacuidad): cada archivo existe y hay de lib/ y de app/", () => {
    expect(ARCHIVOS_SLT125.length).toBeGreaterThan(60);
    for (const rel of ARCHIVOS_NUEVOS_SLT125) expect(ARCHIVOS_SLT125, rel).toContain(rel);
    for (const rel of ARCHIVOS_SLT125) expect(leerFuente(rel).length, rel).toBeGreaterThan(100);
    expect(ARCHIVOS_SLT125.filter((r) => r.startsWith("lib/")).length).toBeGreaterThan(20);
  });

  it("contraprueba: un literal sembrado en un archivo real de SLT-125 se detecta", () => {
    const rel = "lib/utils/ubicacion-presentacion.ts";
    expect(literalesGeograficos(leerFuente(rel), rel)).toEqual([]);
    const sembrado = `${leerFuente(rel)}\nexport const ROTULO = "Distrito";\nexport const OTRO = \`Cantón: \${x}\`;\n`;
    expect(literalesGeograficos(sembrado, rel).map((h) => h.texto)).toEqual(["Distrito", "Cantón:"]);
  });

  it("contraprueba: solo se recortan las 3 entradas internas; un literal en otra entrada sigue siendo hallazgo", () => {
    const inventado = [
      "const C = [",
      "  definir({",
      '    clave: "provincia",',
      '    nombre: "Provincia",',
      "  }),",
      "  definir({",
      '    clave: "ubicacion",',
      '    nombre: "Distrito",',
      "  }),",
      "];",
      "",
    ].join("\n");
    expect(literalesGeograficos(sinEntradasDelCatalogo(inventado, ["provincia"])).map((h) => h.texto)).toEqual([
      "Distrito",
    ]);
    expect(() => sinEntradasDelCatalogo(inventado, ["canton"])).toThrow(/no se encontro/);
  });

  it("las 3 entradas internas existen, llevan su literal y siguen ocultas en el selector (si no, sobran)", () => {
    for (const [rel, claves] of Object.entries(ENTRADAS_INTERNAS_SL20)) {
      expect(ARCHIVOS_SLT125, rel).toContain(rel);
      const fuente = leerFuente(rel);
      expect(literalesGeograficos(fuente, rel).length).toBeGreaterThan(0);
      for (const clave of claves) {
        expect(CLAVES_OCULTAS_EN_SELECTOR.has(clave), clave).toBe(true);
        const sinLaEntrada = sinEntradasDelCatalogo(fuente, [clave]);
        expect(literalesGeograficos(sinLaEntrada, rel).length, clave).toBeLessThan(literalesGeograficos(fuente, rel).length);
      }
    }
  });

  it("el barrido de los archivos de SLT-125 no encuentra ninguno", () => {
    const hallazgos = ARCHIVOS_SLT125.flatMap((rel) =>
      literalesGeograficos(sinEntradasDelCatalogo(leerFuente(rel), ENTRADAS_INTERNAS_SL20[rel] ?? []), rel),
    ).map((h) => `${h.archivo}:${h.linea} — ${h.texto}`);
    expect(
      hallazgos,
      "El tipo de un nivel sale del país de la empresa (`useNivelesGeograficos()` en el cliente, " +
        "`rutaConTipos` en el servidor), nunca de un literal (R42).",
    ).toEqual([]);
  });
});

describe("SLT-54 / R61 — Tarifas no escribe a mano el nivel en un conteo", () => {
  it("contraprueba: caza el conteo en literal, plantilla y JSX; no una frase", () => {
    expect(conteosDeNivel('const a = "1 distrito";')).toHaveLength(1);
    expect(conteosDeNivel("const b = `${n} distritos`;")).toHaveLength(1);
    expect(conteosDeNivel("const c = <p>{n} cantones</p>;")).toHaveLength(1);
    expect(conteosDeNivel('const d = "Filtrar por cantón y distrito";')).toEqual([]);
    expect(conteosDeNivel("const e = `el distrito ${n} ya está en otro grupo`;")).toEqual([]);
  });

  it("el barrido de la pantalla de Tarifas no encuentra ninguno", () => {
    const fuentes = listarFuentes(path.join(RAIZ, "app/(app)/configuracion/tarifas"));
    expect(fuentes.length, "no se leyó la carpeta de Tarifas").toBeGreaterThan(5);
    expect(fuentes.flatMap((f) => conteosDeNivel(readFileSync(f, "utf8")))).toEqual([]);
  });
});
