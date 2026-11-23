import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * SLT-149 (D69) · R438-R439 — GUARDIA: NINGUN DOBLE A MANO DE `ICierresAdminRepository`.
 *
 * El doble se construye con `dobleCierresAdmin` (`tests/fixtures/dobles/cierres-admin-repository.ts`).
 * Un doble a mano vuelve a obligar a tocar ese archivo cada vez que el interfaz gana un metodo
 * (12-13 archivos por metodo antes de SLT-149), o esconde con un cast el metodo que no dobla.
 *
 * Formas prohibidas fuera de la fabrica:
 *  - un cast `as ICierresAdminRepository` o `as unknown as ICierresAdminRepository` (tambien con `& {…}`);
 *  - `satisfies ICierresAdminRepository`;
 *  - una variable anotada con el interfaz (o un alias local) a la que se asigna un literal de objeto;
 *  - una funcion con ese tipo de retorno (o un alias local, `type X = ICierresAdminRepository`) que
 *    devuelve un literal de objeto.
 *
 * Es una guardia de texto: la fabrica tipada es la defensa principal (el typecheck rompe en un solo
 * sitio). Esta cubre lo que el tipo no ve: un cast nuevo compila siempre.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const FABRICA = "tests/fixtures/dobles/cierres-admin-repository.ts";
const ESTA_GUARDIA = "tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts";
const INTERFAZ = "ICierresAdminRepository";

const AVISO =
  "Doble a mano de ICierresAdminRepository: usa `dobleCierresAdmin(sobrescrituras)` de " +
  `\`${FABRICA}\` (SLT-149).`;

function lineaDe(texto: string, indice: number): number {
  return texto.slice(0, indice).split("\n").length;
}

/** Indice de la llave que cierra la que abre en `abre`, o -1. Salta cadenas y comentarios. */
function cierreDeLlave(texto: string, abre: number): number {
  let profundidad = 0;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === "`") {
      i = finDeCadena(texto, i);
      continue;
    }
    if (c === "/" && texto[i + 1] === "/") {
      i = texto.indexOf("\n", i);
      if (i < 0) return -1;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      i = texto.indexOf("*/", i + 2) + 1;
      if (i <= 0) return -1;
      continue;
    }
    if (c === "{") profundidad++;
    if (c === "}") {
      profundidad--;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

function finDeCadena(texto: string, inicio: number): number {
  const comilla = texto[inicio];
  for (let i = inicio + 1; i < texto.length; i++) {
    if (texto[i] === "\\") {
      i++;
      continue;
    }
    if (texto[i] === comilla) return i;
  }
  return texto.length;
}

/** `return {` al primer nivel del cuerpo `[abre, cierra]` (no dentro de callbacks anidados). */
function devuelveLiteral(texto: string, abre: number, cierra: number): number | null {
  for (let i = abre + 1; i < cierra; i++) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === "`") {
      i = finDeCadena(texto, i);
      continue;
    }
    if (c === "{") {
      const fin = cierreDeLlave(texto, i);
      if (fin < 0) return null;
      i = fin;
      continue;
    }
    if (/^return\s*\{/.test(texto.slice(i, i + 40)) && !/\w/.test(texto[i - 1] ?? "")) return i;
  }
  return null;
}

/** Las lineas (1-based) donde `texto` construye a mano un doble del interfaz. */
function dobleAMano(texto: string): number[] {
  const t = texto.replace(/\r\n/g, "\n");
  const lineas = new Set<number>();

  const casts = new RegExp(
    `\\b(?:as\\s+(?:unknown\\s+as\\s+)?|satisfies\\s+)${INTERFAZ}\\b(?!\\s*\\[)`,
    "g",
  );
  for (const m of t.matchAll(casts)) lineas.add(lineaDe(t, m.index));

  const alias = [...t.matchAll(new RegExp(`\\btype\\s+(\\w+)\\s*=\\s*${INTERFAZ}\\s*;`, "g"))].map(
    (m) => m[1],
  );
  const tipos = [INTERFAZ, ...alias].join("|");

  const variable = new RegExp(`:\\s*(?:${tipos})\\s*=\\s*\\{`, "g");
  for (const m of t.matchAll(variable)) lineas.add(lineaDe(t, m.index));

  const firma = new RegExp(`\\)\\s*:\\s*(?:${tipos})\\s*(=>)?\\s*(\\(\\s*\\{|\\{)`, "g");
  for (const m of t.matchAll(firma)) {
    const flecha = m[1] !== undefined;
    const apertura = m[2];
    const abre = m.index + m[0].length - 1;
    if (flecha && apertura.startsWith("(")) {
      lineas.add(lineaDe(t, m.index));
      continue;
    }
    const cierra = cierreDeLlave(t, abre);
    if (cierra < 0) continue;
    const ret = devuelveLiteral(t, abre, cierra);
    if (ret !== null) lineas.add(lineaDe(t, ret));
  }
  return [...lineas].sort((a, b) => a - b);
}

function archivosDeTests(): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(path.join(RAIZ, "tests"), { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
    salida.push(path.relative(RAIZ, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
  }
  return salida;
}

describe("SLT-149 · R438 — ningun doble a mano de ICierresAdminRepository en tests/", () => {
  const archivos = archivosDeTests();

  it("el barrido no esta vacio: ve la fabrica y las suites del servicio", () => {
    // Sin esto, una ruta mal escrita dejaria la guardia verde sin mirar nada.
    expect(archivos).toContain(FABRICA);
    expect(archivos).toContain("tests/unit/services/cierres-admin-service.test.ts");
    expect(archivos.length).toBeGreaterThan(100);
  });

  it("ningun archivo de tests/ salvo la fabrica construye el doble a mano", () => {
    const infractores = archivos
      .filter((ruta) => ruta !== FABRICA && ruta !== ESTA_GUARDIA)
      .flatMap((ruta) =>
        dobleAMano(readFileSync(path.join(RAIZ, ruta), "utf8")).map((l) => `${ruta}:${l}`),
      );
    expect(infractores, AVISO).toEqual([]);
  });
});

describe("SLT-149 · R439 — la guardia muerde", () => {
  const PROHIBIDOS: Record<string, string> = {
    "cast con unknown": [
      "const repo = {",
      "  findCierresByAlcance: vi.fn(async () => []),",
      "} as unknown as ICierresAdminRepository;",
    ].join("\n"),
    "cast directo": "const repo = { leerTopeIntentos: vi.fn() } as ICierresAdminRepository;",
    "cast con interseccion": [
      "return { findX } as unknown as ICierresAdminRepository & {",
      "  findX: typeof findX;",
      "};",
    ].join("\n"),
    satisfies: "const repo = { leerTopeIntentos: vi.fn() } satisfies ICierresAdminRepository;",
    "variable anotada": "const repo: ICierresAdminRepository = {\n  leerTopeIntentos: vi.fn(),\n};",
    "funcion con tipo de retorno": [
      "function fakeRepo(o: Partial<ICierresAdminRepository> = {}): ICierresAdminRepository {",
      "  const x = vi.fn(async () => { return { a: 1 }; });",
      "  return {",
      "    leerTopeIntentos: x,",
      "    ...o,",
      "  };",
      "}",
    ].join("\n"),
    "funcion con alias local": [
      "type Repo = ICierresAdminRepository;",
      "function fakeRepo(): Repo {",
      "  return { leerTopeIntentos: vi.fn() };",
      "}",
    ].join("\n"),
    "flecha con alias local": [
      "type Repo = ICierresAdminRepository;",
      "const fakeRepo = (): Repo => ({ leerTopeIntentos: vi.fn() });",
    ].join("\n"),
  };

  it.each(Object.entries(PROHIBIDOS))("detecta: %s", (_forma, texto) => {
    expect(dobleAMano(texto).length).toBeGreaterThan(0);
  });

  it("nombra la linea del cast", () => {
    expect(dobleAMano(PROHIBIDOS["cast con unknown"])).toEqual([3]);
    expect(dobleAMano(PROHIBIDOS["funcion con tipo de retorno"])).toEqual([3]);
  });

  const PERMITIDOS: Record<string, string> = {
    "la fabrica directa": "const repo = dobleCierresAdmin({ findCierresByAlcance });",
    "envoltorio local con tipo de retorno": [
      "type Repo = ICierresAdminRepository;",
      "function fakeRepo(traza: string[], o: Partial<Repo> = {}): Repo {",
      "  return dobleCierresAdmin({",
      "    resolverCierre: vi.fn(async () => { traza.push('r'); return 'updated' as const; }),",
      "    findCierreByIdEnAlcance: vi.fn(async () => { return { cierre: fila() }; }),",
      "    ...o,",
      "  });",
      "}",
    ].join("\n"),
    "envoltorio sobre otro envoltorio": [
      "function repoCon(c: Fila): ICierresAdminRepository {",
      "  return fakeRepo({ findCierreByIdEnAlcance: vi.fn(async () => ({ cierre: c })) });",
      "}",
    ].join("\n"),
    "tipo derivado del interfaz": [
      "type Detalle = Awaited<ReturnType<ICierresAdminRepository[\"findCierreByIdEnAlcance\"]>>;",
      "const d = { cierre: fila() } as unknown as Detalle;",
    ].join("\n"),
    "repositorio real": "const repo: ICierresAdminRepository = new CierresAdminRepository(prisma);",
  };

  it.each(Object.entries(PERMITIDOS))("no detecta: %s", (_forma, texto) => {
    expect(dobleAMano(texto)).toEqual([]);
  });
});
