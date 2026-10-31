// GUARDIA — SLT-65 (T7.1; R21; design §12): NINGUN REPOSITORIO QUE USE EL CATALOGO GEOGRAFICO SE CREA
// A NIVEL DE MODULO EN `lib/` NI EN `app/`. Cierra el m5 de SLT-44.
//
// ## Por que
//
// `CatalogoGeograficoRepository` guarda en memoria el catalogo que carga (una carga por instancia,
// SLT-44 R11), y lo mismo hereda cada repositorio que lo usa. Una instancia creada a nivel de modulo
// vive lo que vive el proceso: serviria el catalogo, las asignaciones y las marcas de una peticion
// (de una empresa) a la siguiente. Nada falla: la siguiente empresa recibe zonas y marcas ajenas o
// viejas, y su dinero se calcula con ellas.
//
// ## Que exige
//
// Una `new` de una clase vigilada solo vale si tiene por encima una funcion (declaracion, expresion,
// flecha, metodo, constructor o accesor) o una propiedad de clase NO estatica (su inicializador corre
// por instancia). Caza la constante de modulo, la instancia dentro de otro objeto creado a nivel de
// modulo y la propiedad estatica.
//
// Las clases vigiladas se CALCULAN, no se escriben a mano: `CatalogoGeograficoRepository` mas cada
// clase exportada de un archivo de `lib/repositories/**` que importa `CatalogoGeograficoRepository`.
// Un repositorio nuevo que lo use entra solo.
//
// ## Como esta hecha
//
// Con el AST de TypeScript (`ts.createSourceFile`, como `sin-estados-retirados.guardia`): un comentario
// o una cadena que nombren la clase no son una `NewExpression`. Lleva contraprueba (los tres casos
// prohibidos y los cuatro permitidos de design §12) y control de no-vacuidad.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../../..");
const DIRECTORIOS = ["lib", "app"] as const;
const REPOSITORIOS = "lib/repositories";
const CATALOGO = "CatalogoGeograficoRepository";

function listarFuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) listarFuentes(completo, acc);
    else if (/\.tsx?$/.test(entrada.name) && !/\.d\.ts$/.test(entrada.name)) acc.push(completo);
  }
  return acc;
}

function fuente(codigo: string, nombre: string): ts.SourceFile {
  return ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** `true` si el archivo importa el VALOR `CatalogoGeograficoRepository` (un `import type` no cuenta). */
export function importaElCatalogo(codigo: string, nombre = "fuente.ts"): boolean {
  return fuente(codigo, nombre).statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      !s.importClause?.isTypeOnly &&
      s.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some(
        (el) => !el.isTypeOnly && (el.propertyName ?? el.name).text === CATALOGO,
      ),
  );
}

/** Los nombres de las clases exportadas del archivo. */
export function clasesExportadas(codigo: string, nombre = "fuente.ts"): string[] {
  return fuente(codigo, nombre)
    .statements.filter(
      (s): s is ts.ClassDeclaration =>
        ts.isClassDeclaration(s) &&
        s.name !== undefined &&
        (ts.getCombinedModifierFlags(s) & ts.ModifierFlags.Export) !== 0,
    )
    .map((s) => s.name!.text);
}

/** `true` si lo que hay en `nodo` corre por llamada o por instancia, no al cargar el modulo. */
function correPorLlamadaOInstancia(nodo: ts.Node): boolean {
  for (let p: ts.Node | undefined = nodo.parent; p; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isConstructorDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p)
    ) {
      return true;
    }
    if (ts.isPropertyDeclaration(p) && (ts.getCombinedModifierFlags(p) & ts.ModifierFlags.Static) === 0) {
      return true;
    }
  }
  return false;
}

export interface NewDeVigilada {
  linea: number;
  clase: string;
  deModulo: boolean;
}

/**
 * Cada `new` de una clase vigilada en `codigo`, con si corre al cargar el modulo. Sigue los alias de
 * import (`import { OrdenRepository as Repo }`): `new Repo(...)` cuenta como `OrdenRepository`.
 */
export function newsDeVigiladas(codigo: string, vigiladas: ReadonlySet<string>, nombre = "fuente.ts"): NewDeVigilada[] {
  const sf = fuente(codigo, nombre);
  const alias = new Map<string, string>();
  for (const s of sf.statements) {
    const nb = ts.isImportDeclaration(s) ? s.importClause?.namedBindings : undefined;
    if (nb === undefined || !ts.isNamedImports(nb)) continue;
    for (const el of nb.elements) {
      const original = (el.propertyName ?? el.name).text;
      if (vigiladas.has(original)) alias.set(el.name.text, original);
    }
  }
  const salida: NewDeVigilada[] = [];
  const visitar = (nodo: ts.Node): void => {
    if (ts.isNewExpression(nodo) && ts.isIdentifier(nodo.expression)) {
      const local = nodo.expression.text;
      const clase = alias.get(local) ?? (vigiladas.has(local) ? local : undefined);
      if (clase !== undefined) {
        const { line } = sf.getLineAndCharacterOfPosition(nodo.getStart(sf));
        salida.push({ linea: line + 1, clase, deModulo: !correPorLlamadaOInstancia(nodo) });
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return salida;
}

/** Las instancias de modulo, como `archivo:linea Clase`. */
export function instanciasDeModulo(codigo: string, vigiladas: ReadonlySet<string>, nombre = "fuente.ts"): string[] {
  return newsDeVigiladas(codigo, vigiladas, nombre)
    .filter((n) => n.deModulo)
    .map((n) => `${nombre}:${n.linea} ${n.clase}`);
}

const FUENTES = DIRECTORIOS.flatMap((d) => listarFuentes(path.join(RAIZ, d))).map((completo) => ({
  ruta: path.relative(RAIZ, completo).split(path.sep).join("/"),
  codigo: readFileSync(completo, "utf8"),
}));

/** `CatalogoGeograficoRepository` y las clases exportadas de los repositorios que lo importan. */
const VIGILADAS: ReadonlySet<string> = new Set([
  CATALOGO,
  ...FUENTES.filter((f) => f.ruta.startsWith(`${REPOSITORIOS}/`) && importaElCatalogo(f.codigo, f.ruta)).flatMap(
    (f) => clasesExportadas(f.codigo, f.ruta),
  ),
]);

// =============================================================================================
// 0 — el detector no esta roto
// =============================================================================================

describe("SLT-65 R21 — el detector se prueba a si mismo", () => {
  const V = new Set(["OrdenRepository", "GeoRepository", "ZonaRepository"]);

  it("CONTRAPRUEBA: los tres casos prohibidos se detectan, con archivo, linea y clase", () => {
    const prohibido = [
      `import { prisma } from "@/lib/db/prisma-client";`,
      `const x = new OrdenRepository(prisma);`,
      `export const servicio = new Servicio(new GeoRepository(prisma));`,
      `class Holder {`,
      `  static repo = new ZonaRepository(prisma);`,
      `}`,
    ].join("\n");
    expect(instanciasDeModulo(prohibido, V)).toEqual([
      "fuente.ts:2 OrdenRepository",
      "fuente.ts:3 GeoRepository",
      "fuente.ts:5 ZonaRepository",
    ]);
  });

  it("CONTRAPRUEBA: los cuatro casos permitidos no se detectan (pero el detector SI los ve)", () => {
    const permitido = [
      `const crear = () => new OrdenRepository(prisma);`,
      `function fabricar() { return new OrdenRepository(prisma); }`,
      `class Servicio {`,
      `  leer() { return new OrdenRepository(this.prisma); }`,
      `  private repo = new OrdenRepository(this.prisma);`,
      `}`,
    ].join("\n");
    expect(instanciasDeModulo(permitido, V)).toEqual([]);
    // No-vacuidad del caso: las cuatro `new` estan, y las cuatro corren por llamada o por instancia.
    expect(newsDeVigiladas(permitido, V)).toEqual([
      { linea: 1, clase: "OrdenRepository", deModulo: false },
      { linea: 2, clase: "OrdenRepository", deModulo: false },
      { linea: 4, clase: "OrdenRepository", deModulo: false },
      { linea: 5, clase: "OrdenRepository", deModulo: false },
    ]);
  });

  it("un comentario, una cadena o una clase no vigilada no cuentan; un alias de import si", () => {
    const codigo = [
      `import { OrdenRepository as Repo } from "@/lib/repositories/OrdenRepository";`,
      `// const x = new OrdenRepository(prisma);`,
      `const texto = "new OrdenRepository(prisma)";`,
      `const otro = new TiendaRepository(prisma);`,
      `const y = new Repo(prisma);`,
    ].join("\n");
    expect(instanciasDeModulo(codigo, V)).toEqual(["fuente.ts:5 OrdenRepository"]);
  });

  it("la lista de vigiladas sale de los imports de codigo: un `import type` o un comentario no la amplian", () => {
    expect(importaElCatalogo(`import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";`)).toBe(true);
    expect(
      importaElCatalogo(`import {\n  EMPRESA,\n  CatalogoGeograficoRepository,\n  type CatalogoPrismaClient,\n} from "./CatalogoGeograficoRepository";`),
    ).toBe(true);
    expect(importaElCatalogo(`import type { CatalogoGeograficoRepository } from "./CatalogoGeograficoRepository";`)).toBe(false);
    expect(importaElCatalogo(`// lo carga \`CatalogoGeograficoRepository\`\nexport const a = 1;`)).toBe(false);
    expect(clasesExportadas(`export class A {}\nclass B {}\nexport default class C {}`)).toEqual(["A", "C"]);
  });
});

// =============================================================================================
// R21 — el arbol
// =============================================================================================

describe("SLT-65 R21 — ningun repositorio del catalogo geografico se crea a nivel de modulo", () => {
  it("las clases vigiladas estan calculadas y no vacias (antivacio)", () => {
    expect(FUENTES.length).toBeGreaterThan(500);
    expect([...VIGILADAS]).toEqual(
      expect.arrayContaining([
        CATALOGO,
        "GeoRepository",
        "OrdenRepository",
        "CoberturaRepository",
        "ZonaRepository",
        "CierreDiaRepository",
      ]),
    );
  });

  it("el barrido ve las `new` de las vigiladas que el codigo SI hace (por llamada o por instancia)", () => {
    const todas = FUENTES.flatMap((f) => newsDeVigiladas(f.codigo, VIGILADAS, f.ruta));
    // Hay construcciones reales en `lib/` y `app/`: si el detector no las viera, la guardia estaria
    // verde sin mirar nada.
    expect(todas.length).toBeGreaterThan(10);
    expect(todas.some((n) => n.clase === "OrdenRepository")).toBe(true);
    expect(todas.some((n) => n.clase === CATALOGO)).toBe(true);
  });

  it("ninguna `new` de una clase vigilada corre al cargar el modulo", () => {
    const hallazgos = FUENTES.flatMap((f) => instanciasDeModulo(f.codigo, VIGILADAS, f.ruta));
    expect(
      hallazgos,
      "una instancia de modulo de un repositorio que usa el catalogo geografico sirve el catalogo, las " +
        "asignaciones y las marcas de una peticion (y de una empresa) a la siguiente. Creala dentro de " +
        "la funcion, el metodo o el constructor que la usa (R21, design §12)",
    ).toEqual([]);
  });
});
