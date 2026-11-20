import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

/**
 * SLT-134 «Textos de pantalla de cierres en tú, con guardia» — censo del módulo de cierres
 * (`specs/SLT-103-dialogos-trato-tu/requirements.md > Definiciones`), en UNA sola definición que
 * comparten la guardia de trato y la de diálogos (R392).
 *
 * - `censoPantalla()`: los seis árboles de pantalla más los dos compartidos sueltos.
 * - `censoModulo()`: la pantalla más los archivos de `lib/` del censo.
 * - `textosDeFuente()`: los textos de un fuente por AST (literales, tramos de plantilla y texto JSX),
 *   sin comentarios ni especificadores de `import`/`export`.
 */

const RAIZ = path.resolve(__dirname, "../..");

export const CENSO_PANTALLA_ARBOLES = [
  "app/(app)/cierres-admin",
  "app/(app)/cierre-dia",
  "app/(app)/wallet/satelites",
  "components/private/cierres",
  "components/shared/conciliacion",
  "components/shared/liquidacion",
] as const;

export const CENSO_PANTALLA_SUELTOS = [
  "components/shared/DesglosePagoField.tsx",
  "components/shared/EscanerGuiaCard.tsx",
] as const;

export const CENSO_LIB = [
  "lib/constants/bloqueo-mensajero.ts",
  "lib/services/CierreDiaService.ts",
  "lib/services/CierreBodegaService.ts",
  "lib/services/CierresAdminService.ts",
  "lib/services/CierresBodegaAdminService.ts",
  "lib/services/ConciliacionSatelitesService.ts",
  "lib/services/LiquidacionService.ts",
  "lib/actions/cierre-dia.ts",
  "lib/actions/cierre-bodega.ts",
  "lib/actions/cierres-admin.ts",
  "lib/actions/conciliacion-satelites.ts",
  "lib/actions/liquidacion.ts",
] as const;

function esFuente(nombre: string): boolean {
  return /\.tsx?$/.test(nombre) && !nombre.endsWith(".d.ts");
}

function listar(relativo: string, acc: string[] = []): string[] {
  const absoluto = path.join(RAIZ, relativo);
  if (!existsSync(absoluto)) return acc;
  for (const entrada of readdirSync(absoluto, { withFileTypes: true })) {
    const hijo = `${relativo}/${entrada.name}`;
    if (entrada.isDirectory()) listar(hijo, acc);
    else if (esFuente(entrada.name)) acc.push(hijo);
  }
  return acc;
}

/** Un archivo suelto que no existe falla: si alguien lo renombra, el censo se revisa. */
function sueltos(rutas: readonly string[]): string[] {
  for (const ruta of rutas) {
    if (!existsSync(path.join(RAIZ, ruta))) {
      throw new Error(`censo-cierres: el archivo suelto «${ruta}» no existe; revisa el censo`);
    }
  }
  return [...rutas];
}

/** Rutas relativas a la raíz, con `/`, ordenadas. */
export function censoPantalla(): string[] {
  return [
    ...CENSO_PANTALLA_ARBOLES.flatMap((arbol) => listar(arbol)),
    ...sueltos(CENSO_PANTALLA_SUELTOS),
  ].sort();
}

/** El censo entero: pantalla más `lib/`. */
export function censoModulo(): string[] {
  return [...censoPantalla(), ...sueltos(CENSO_LIB)].sort();
}

export type TextoDeFuente = { linea: number; texto: string };

/** ¿Es `n` un especificador de módulo (import/export/import()/import type)? */
function esEspecificador(n: ts.Node): boolean {
  const padre = n.parent;
  if (!padre) return false;
  if ((ts.isImportDeclaration(padre) || ts.isExportDeclaration(padre)) && padre.moduleSpecifier === n) {
    return true;
  }
  if (ts.isCallExpression(padre) && padre.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isExternalModuleReference(padre)) return true;
  // `import("x")` en posición de tipo: ImportTypeNode → LiteralTypeNode → StringLiteral.
  if (ts.isLiteralTypeNode(padre) && padre.parent && ts.isImportTypeNode(padre.parent)) return true;
  return false;
}

/**
 * Textos de un fuente con su línea (1-based): `StringLiteral`, `NoSubstitutionTemplateLiteral`,
 * `TemplateHead/Middle/Tail` y `JsxText`. Los comentarios no son nodos: no se leen.
 */
export function textosDeFuente(codigo: string, ruta: string): TextoDeFuente[] {
  const tipo = ruta.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(ruta, codigo, ts.ScriptTarget.Latest, true, tipo);
  const out: TextoDeFuente[] = [];
  const visitar = (n: ts.Node): void => {
    let texto: string | null = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!esEspecificador(n)) texto = n.text;
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      texto = n.text;
    } else if (ts.isJsxText(n)) {
      texto = n.text;
    }
    if (texto !== null) {
      out.push({ linea: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, texto });
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return out;
}

/** Lee un archivo del censo como texto (ruta relativa a la raíz). */
export function rutaAbsoluta(relativa: string): string {
  return path.join(RAIZ, relativa);
}
