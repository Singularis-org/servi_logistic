import { existsSync, readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { censoPantalla, rutaAbsoluta } from "../../fixtures/censo-cierres";

/**
 * SLT-103 «Diálogos del módulo de cierres y trato tú» — guardia estructural de R53 y R137, con los
 * huecos de D65 cerrados en SLT-134 «Textos de pantalla de cierres en tú, con guardia» (R390-R392).
 *
 * - R53 / R390: todo diálogo del módulo de cierres se monta sobre `components/shared/Modal.tsx`.
 *   Ningún archivo del censo de pantalla importa, reexporta ni carga con `import()` un diálogo que no
 *   es el `Modal` compartido: `@/components/ui/(alert-dialog|dialog|sheet)`,
 *   `@radix-ui/react-(alert-)?dialog`, o una ruta relativa que acaba en `/ui/(alert-dialog|dialog|sheet)`.
 *   Única excepción: el marco modal del detalle (D1), que no es un diálogo de R53.
 * - R137 / R391: hay UN solo visor de evidencia. El título «Evidencia de la gestión» (literal, partido
 *   en una concatenación de literales con `+`, o plantilla) vive solo en `dialogos-labels.ts`;
 *   `VISOR_EVIDENCIA_TEXTO.titulo` se lee solo en `VisorEvidencia.tsx`, y `VisorEvidencia` (función,
 *   `const` con flecha o con `function` anónima) se declara solo allí, una vez.
 * - R392: el censo sale de `tests/fixtures/censo-cierres.ts > censoPantalla()`, el mismo que usa la
 *   guardia de trato.
 *
 * Todo se lee por AST (`typescript`): los comentarios no son nodos, así que un comentario que cita el
 * título o el import no es un hallazgo. Control positivo y contraprueba al final.
 */

/** Única excepción de R53, con su motivo. */
const EXCEPCIONES_UI_DIALOG: Readonly<Record<string, string>> = {
  "components/private/cierres/detalle/DetalleCierre.tsx":
    "marco modal del detalle de cierre (D1): no es uno de los diálogos de R53",
};

const DUENO_TITULO = "components/private/cierres/dialogos/dialogos-labels.ts";
const DUENO_VISOR = "components/private/cierres/dialogos/VisorEvidencia.tsx";
const TITULO_VISOR = "Evidencia de la gestión";

const DIALOGO_PROHIBIDO = [
  /^@\/components\/ui\/(?:alert-dialog|dialog|sheet)$/,
  /^@radix-ui\/react-(?:alert-)?dialog$/,
  /^\.\.?\/(?:.*\/)?ui\/(?:alert-dialog|dialog|sheet)(?:\.tsx?)?$/,
];

function fuente(codigo: string, ruta: string): ts.SourceFile {
  const tipo = ruta.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(ruta, codigo, ts.ScriptTarget.Latest, true, tipo);
}

function leer(ruta: string): string {
  return readFileSync(rutaAbsoluta(ruta), "utf8");
}

function recorrer(nodo: ts.Node, visita: (n: ts.Node) => boolean | void): void {
  if (visita(nodo) === false) return;
  ts.forEachChild(nodo, (hijo) => recorrer(hijo, visita));
}

/** R390: especificadores de `import`, `export … from` e `import()` que son un diálogo prohibido. */
function importsDeDialogo(codigo: string, ruta: string): string[] {
  const out: string[] = [];
  recorrer(fuente(codigo, ruta), (n) => {
    let especificador: ts.Expression | undefined;
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) especificador = n.moduleSpecifier;
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      especificador = n.arguments[0];
    }
    if (especificador && ts.isStringLiteralLike(especificador)) {
      const texto = especificador.text;
      if (DIALOGO_PROHIBIDO.some((re) => re.test(texto))) out.push(texto);
    }
  });
  return out;
}

/** Pliega literales, plantillas sin interpolación y sus concatenaciones con `+` en un solo texto. */
function plegar(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isParenthesizedExpression(n)) return plegar(n.expression);
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const izquierda = plegar(n.left);
    const derecha = izquierda === null ? null : plegar(n.right);
    return izquierda === null || derecha === null ? null : izquierda + derecha;
  }
  return null;
}

function apariciones(texto: string, buscado: string): number {
  return texto.split(buscado).length - 1;
}

function esLecturaDelTitulo(n: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(n)) {
    return ts.isIdentifier(n.expression) && n.expression.text === "VISOR_EVIDENCIA_TEXTO" && n.name.text === "titulo";
  }
  if (ts.isElementAccessExpression(n)) {
    return (
      ts.isIdentifier(n.expression) &&
      n.expression.text === "VISOR_EVIDENCIA_TEXTO" &&
      ts.isStringLiteralLike(n.argumentExpression) &&
      n.argumentExpression.text === "titulo"
    );
  }
  return false;
}

function esDeclaracionDelVisor(n: ts.Node): boolean {
  if (ts.isFunctionDeclaration(n)) return n.name?.text === "VisorEvidencia";
  if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "VisorEvidencia") {
    const inicial = n.initializer;
    return !!inicial && (ts.isArrowFunction(inicial) || ts.isFunctionExpression(inicial));
  }
  return false;
}

type Rastros = { titulo: number; lecturaTitulo: number; declaracion: number };

/** R391: título (plegado), lecturas de `VISOR_EVIDENCIA_TEXTO.titulo` y declaraciones del visor. */
function rastrosDeVisor(codigo: string, ruta: string): Rastros {
  const r: Rastros = { titulo: 0, lecturaTitulo: 0, declaracion: 0 };
  recorrer(fuente(codigo, ruta), (n) => {
    if (esLecturaDelTitulo(n)) r.lecturaTitulo += 1;
    if (esDeclaracionDelVisor(n)) r.declaracion += 1;
    const plegado = plegar(n);
    if (plegado !== null) {
      r.titulo += apariciones(plegado, TITULO_VISOR);
      return false; // ya plegado: no contar otra vez sus tramos
    }
    if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      r.titulo += apariciones(n.text, TITULO_VISOR);
    } else if (ts.isJsxText(n)) {
      r.titulo += apariciones(n.text.replace(/\s+/g, " "), TITULO_VISOR);
    }
  });
  return r;
}

function rastros(ruta: string): Rastros {
  return rastrosDeVisor(leer(ruta), ruta);
}

describe("SLT-103 · guardia de diálogos de cierres (R53, R137; D65: R390-R392)", () => {
  it("R53: ningún archivo del censo importa un diálogo que no es el Modal compartido, salvo el marco del detalle", () => {
    const hallazgos = censoPantalla()
      .filter((ruta) => !(ruta in EXCEPCIONES_UI_DIALOG))
      .flatMap((ruta) => importsDeDialogo(leer(ruta), ruta).map((imp) => `${ruta} → ${imp}`));
    expect(hallazgos).toEqual([]);
  });

  it("R53: la excepción sigue existiendo y sigue usando ui/dialog (si no, sobra en la lista)", () => {
    for (const ruta of Object.keys(EXCEPCIONES_UI_DIALOG)) {
      expect(existsSync(rutaAbsoluta(ruta)), `${ruta} no existe`).toBe(true);
      expect(importsDeDialogo(leer(ruta), ruta).length, `${ruta} ya no usa ui/dialog`).toBeGreaterThan(0);
    }
  });

  it("R137: título «Evidencia de la gestión» (literal, partido o plantilla) solo en dialogos-labels.ts", () => {
    const fuera = censoPantalla().filter((ruta) => ruta !== DUENO_TITULO && rastros(ruta).titulo > 0);
    expect(fuera).toEqual([]);
    expect(rastros(DUENO_TITULO).titulo).toBe(1);
  });

  it("R137: VISOR_EVIDENCIA_TEXTO.titulo solo se lee en VisorEvidencia.tsx", () => {
    const fuera = censoPantalla().filter((ruta) => ruta !== DUENO_VISOR && rastros(ruta).lecturaTitulo > 0);
    expect(fuera).toEqual([]);
    expect(rastros(DUENO_VISOR).lecturaTitulo).toBeGreaterThan(0);
  });

  it("R137: declaración de VisorEvidencia (function, flecha o function anónima) solo en VisorEvidencia.tsx, y una", () => {
    const fuera = censoPantalla().filter((ruta) => ruta !== DUENO_VISOR && rastros(ruta).declaracion > 0);
    expect(fuera).toEqual([]);
    expect(rastros(DUENO_VISOR).declaracion).toBe(1);
  });

  it("control positivo: el censo pasa de 40 archivos e incluye los módulos que vigila (R392)", () => {
    const archivos = censoPantalla();
    expect(archivos.length).toBeGreaterThan(40);
    expect(archivos).toEqual(
      expect.arrayContaining([
        "app/(app)/cierres-admin/_components/CierresAdminModule.tsx",
        "app/(app)/cierre-dia/_components/CierreDiaModule.tsx",
        "components/shared/conciliacion/ConciliacionAcciones.tsx",
        "app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx",
        "components/shared/liquidacion/RegistrarPagoDialog.tsx",
        "components/shared/DesglosePagoField.tsx",
        "components/shared/EscanerGuiaCard.tsx",
        DUENO_TITULO,
        DUENO_VISOR,
      ]),
    );
  });

  describe("contraprueba: cada vía se detecta en una muestra y no en la misma comentada", () => {
    const comentar = (codigo: string): string =>
      codigo
        .split("\n")
        .map((linea) => `// ${linea}`)
        .join("\n");

    const IMPORTS: ReadonlyArray<[string, string]> = [
      ['import { Dialog } from "@/components/ui/dialog";', "@/components/ui/dialog"],
      ['import { AlertDialog } from "@/components/ui/alert-dialog";', "@/components/ui/alert-dialog"],
      ['import { Sheet } from "@/components/ui/sheet";', "@/components/ui/sheet"],
      ['import * as D from "@radix-ui/react-dialog";', "@radix-ui/react-dialog"],
      ['import * as A from "@radix-ui/react-alert-dialog";', "@radix-ui/react-alert-dialog"],
      ['import { Dialog } from "../../ui/dialog";', "../../ui/dialog"],
      ['export { Dialog } from "@/components/ui/dialog";', "@/components/ui/dialog"],
      ['const S = import("@/components/ui/sheet");', "@/components/ui/sheet"],
    ];

    it.each(IMPORTS)("R390: %s", (codigo, especificador) => {
      expect(importsDeDialogo(codigo, "muestra.tsx")).toEqual([especificador]);
      expect(importsDeDialogo(comentar(codigo), "muestra.tsx")).toEqual([]);
    });

    it("R390: el Modal compartido y otros ui/ no son diálogo prohibido", () => {
      const codigo = [
        'import { Modal } from "@/components/shared/Modal";',
        'import { Button } from "@/components/ui/button";',
        'import { Sheet } from "@/components/ui/sheet-header";',
      ].join("\n");
      expect(importsDeDialogo(codigo, "muestra.tsx")).toEqual([]);
    });

    const VISOR: ReadonlyArray<[string, string, Partial<Rastros>]> = [
      ["título literal en JSX", '<Modal title="Evidencia de la gestión" />;', { titulo: 1 }],
      ["título partido con +", 'const t = "Evidencia " + "de la gestión";', { titulo: 1 }],
      ["título partido en tres", 'const t = ("Evidencia" + " de la ") + `gestión`;', { titulo: 1 }],
      ["título en plantilla", "const t = `Evidencia de la gestión`;", { titulo: 1 }],
      ["VISOR_EVIDENCIA_TEXTO.titulo", "const t = VISOR_EVIDENCIA_TEXTO.titulo;", { lecturaTitulo: 1 }],
      ['VISOR_EVIDENCIA_TEXTO["titulo"]', 'const t = VISOR_EVIDENCIA_TEXTO["titulo"];', { lecturaTitulo: 1 }],
      ["function VisorEvidencia", "export function VisorEvidencia() { return null; }", { declaracion: 1 }],
      ["const VisorEvidencia = () => …", "const VisorEvidencia = () => null;", { declaracion: 1 }],
      ["const VisorEvidencia = function", "const VisorEvidencia = function () { return null; };", { declaracion: 1 }],
    ];

    it.each(VISOR)("R391: %s", (_nombre, codigo, esperado) => {
      expect(rastrosDeVisor(codigo, "muestra.tsx")).toEqual({ titulo: 0, lecturaTitulo: 0, declaracion: 0, ...esperado });
      expect(rastrosDeVisor(comentar(codigo), "muestra.tsx")).toEqual({ titulo: 0, lecturaTitulo: 0, declaracion: 0 });
    });
  });
});
