import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

// SLT-48 (T2.9; R29; design §5) — NINGUN ARCHIVO DE PRODUCCION LEE NI ESCRIBE LAS 3 FK DE LA ORDEN.
//
// Sustituye a `geografia-lecturas-sin-nodo-fk.guardia.test.ts` (SLT-44), que prohibia lo contrario: leer
// `orden.nodo_geografico_id`. Desde SLT-48 el lugar de una orden ES su nodo (R22) y una orden nueva deja
// `provincia_id`, `canton_id` y `distrito_id` en NULL (R15). Leerlas daria un lugar vacio en toda orden
// nueva sin que nada fallara; escribirlas volveria a tener dos verdades del lugar.
//
// LO QUE EXIGE, en `lib/`, `app/` y `components/`, sobre el codigo sin comentarios:
//  1. Prisma: ninguna clave `provinciaId`, `cantonId` ni `distritoId` dentro de lo que se le pasa a un
//     delegado de `orden` (`x.orden.findMany(…)`, `…update(…)`) ni dentro de una relacion anidada
//     `orden: { select | include | is | isNot … }`. Las constantes y funciones del mismo archivo que se esparcen o se llaman ahi
//     (`...WITH_X`, `select: apiOrdenSelect(id)`) se resuelven y se barren tambien.
//  2. SQL crudo: ninguna columna `provincia_id`, `canton_id` ni `distrito_id` con el alias de `orden`
//     (`FROM "orden" o` → `o."distrito_id"`) ni como `"orden"."distrito_id"`.
//
// UNA SOLA EXCEPCION, la de R16: asignar `null` (corregir la ubicacion de una orden vieja vacia sus
// 3 FK). `distritoId: null` no lee ni escribe un lugar; lo borra.
//
// Lo que NO entra: `zona_distrito.distrito_id`, `distrito_zona_especial.distrito_id` y los grupos
// (otras tablas; se retiran en SLT-196 «Geografia jerarquica: borrar el modelo viejo»), y `distritoId`
// como nombre interno de `ParTarifa` (decision heredada, design §6). Ninguno es una clave de `orden`.
//
// CON CONTRAPRUEBA sobre codigo inventado: un detector roto que no encontrara nada dejaria la guardia
// verde para siempre.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app", "components"] as const;
const EXTENSIONES = /\.(ts|tsx|mts)$/;

const CLAVE_FK = /\b(provinciaId|cantonId|distritoId)\s*:(?!\s*null\b)/g;
const METODOS_DE_ORDEN =
  /\borden\s*\.\s*(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy|create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
// Una relacion de Prisma, no un DTO que se llame `orden`: `orden: { select | include | is | isNot … }`.
const RELACION_ORDEN = /\borden\s*:\s*\{(?=\s*(?:select|include|is|isNot)\s*:)/g;
const ALIAS_DE_ORDEN = /\b(?:FROM|JOIN)\s+"?orden"?\s+(?:AS\s+)?"?([a-z_]\w*)"?/gi;
const PALABRAS_SQL = new Set(["where", "join", "left", "inner", "on", "group", "order", "limit", "cross", "using"]);

interface Fuente {
  ruta: string;
  codigo: string;
}

/** El texto entre el `{` o `(` que abre en `inicio` y su cierre, contando anidados. `""` si no cierra. */
export function bloqueBalanceado(codigo: string, inicio: number): string {
  const abre = codigo[inicio];
  const cierra = abre === "{" ? "}" : ")";
  let nivel = 0;
  for (let i = inicio; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === abre) nivel++;
    else if (c === cierra) {
      nivel--;
      if (nivel === 0) return codigo.slice(inicio, i + 1);
    }
  }
  return "";
}

/** El cuerpo de la constante o funcion de nivel de archivo `nombre`, o `null` si no la hay. */
function definicionDe(codigo: string, nombre: string): string | null {
  const re = new RegExp(`(?:const\\s+${nombre}\\b[^=]*=|function\\s+${nombre}\\s*\\([^)]*\\)[^{]*)\\s*\\{`);
  const m = re.exec(codigo);
  if (m === null) return null;
  return bloqueBalanceado(codigo, m.index + m[0].length - 1);
}

/** El bloque, con las constantes y funciones del archivo que esparce o llama, resueltas una vez. */
function conReferencias(codigo: string, bloque: string, vistos = new Set<string>()): string {
  let total = bloque;
  for (const m of bloque.matchAll(/(?:\.\.\.|:\s*)([A-Za-z_]\w*)\b/g)) {
    const nombre = m[1];
    if (vistos.has(nombre)) continue;
    vistos.add(nombre);
    const def = definicionDe(codigo, nombre);
    if (def !== null) total += `\n${conReferencias(codigo, def, vistos)}`;
  }
  return total;
}

/** Los bloques de Prisma de `orden` de un archivo: argumentos de sus delegados y relaciones anidadas. */
export function bloquesDeOrden(codigo: string): string[] {
  const bloques: string[] = [];
  for (const m of codigo.matchAll(METODOS_DE_ORDEN)) {
    bloques.push(conReferencias(codigo, bloqueBalanceado(codigo, (m.index ?? 0) + m[0].length - 1)));
  }
  for (const m of codigo.matchAll(RELACION_ORDEN)) {
    bloques.push(conReferencias(codigo, bloqueBalanceado(codigo, (m.index ?? 0) + m[0].length - 1)));
  }
  return bloques;
}

/** Las columnas viejas de `orden` en el SQL crudo del archivo, por alias o por nombre de tabla. */
export function columnasSqlDeOrden(codigo: string): string[] {
  const alias = new Set<string>();
  for (const m of codigo.matchAll(ALIAS_DE_ORDEN)) {
    if (!PALABRAS_SQL.has(m[1].toLowerCase())) alias.add(m[1]);
  }
  const hallazgos: string[] = [];
  for (const a of [...alias, "orden"]) {
    const re = new RegExp(`(?<![\\w"])"?${a}"?\\."?(provincia_id|canton_id|distrito_id)\\b"?`, "g");
    for (const m of codigo.matchAll(re)) hallazgos.push(m[0]);
  }
  return hallazgos;
}

/** Todo lo que el archivo hace con las 3 FK de la orden. */
export function usosDeLasFk(codigo: string): string[] {
  const prisma = bloquesDeOrden(codigo).flatMap((b) => [...b.matchAll(CLAVE_FK)].map((m) => m[0].replace(/\s+/g, "")));
  return [...prisma, ...columnasSqlDeOrden(codigo)];
}

function archivosDe(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDe(ruta));
    else if (EXTENSIONES.test(entrada.name)) salida.push(ruta);
  }
  return salida;
}

const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");
const FUENTES: Fuente[] = ARBOLES.flatMap((a) => archivosDe(path.join(RAIZ, a))).map((a) => ({
  ruta: relativa(a),
  codigo: quitarComentarios(readFileSync(a, "utf8")),
}));

function fallosEn(fuentes: readonly Fuente[]): string[] {
  return fuentes.flatMap((f) => usosDeLasFk(f.codigo).map((u) => `${f.ruta}: ${u}`));
}

describe("SLT-48 R29 — contraprueba del detector", () => {
  it.each([
    ["select de un delegado de orden", "await prisma.orden.findMany({ select: { id: true, distritoId: true } });", ["distritoId:"]],
    ["where de un delegado de orden", "tx.orden.count({ where: { cantonId: { in: ids } } });", ["cantonId:"]],
    ["data de una escritura de orden", "tx.orden.updateMany({ where: { id }, data: { provinciaId: p } });", ["provinciaId:"]],
    [
      "relacion anidada `orden` de otro delegado",
      "tx.gestionOrden.findMany({ select: { orden: { select: { cantonId: true } } } });",
      ["cantonId:"],
    ],
    [
      "constante esparcida en el select",
      "const SEL = { select: { distritoId: true } } as const;\nprisma.orden.findFirst({ ...SEL });",
      ["distritoId:"],
    ],
    [
      "funcion llamada como select",
      "function sel(id) {\n  return { provinciaId: true };\n}\nprisma.orden.findMany({ select: sel(id) });",
      ["provinciaId:"],
    ],
  ])("encuentra la FK en %s", (_caso, codigo, esperado) => {
    expect(usosDeLasFk(codigo)).toEqual(esperado);
  });

  it.each([
    ['SELECT o."distrito_id" FROM "orden" o WHERE o."deleted_at" IS NULL', ['o."distrito_id"']],
    ['SELECT c.canton_id FROM orden AS c', ["c.canton_id"]],
    ['UPDATE "orden" SET x = 1 WHERE "orden"."provincia_id" = $1', ['"orden"."provincia_id"']],
  ])("encuentra la columna en el SQL: %s", (sql, esperado) => {
    expect(columnasSqlDeOrden(sql)).toEqual(esperado);
  });

  it.each([
    "tx.zonaDistrito.findMany({ select: { distritoId: true } });",
    "tx.orden.updateMany({ where: { id }, data: { nodoGeograficoId: n, provinciaId: null, cantonId: null, distritoId: null } });",
    "const par: ParTarifa = { tiendaId, zonaId, distritoId: lugar };",
    'SELECT zd."distrito_id" FROM "zona_distrito" zd JOIN "orden" o ON o."zona_id" = zd."zona_id"',
    "prisma.orden.findMany({ select: { nodoGeograficoId: true } });",
    'return { status: "ok", orden: { ordenId, provinciaId: ruta[0]?.id ?? "" } };',
  ])("no confunde otra tabla, un vaciado a null o un nombre interno: %s", (codigo) => {
    expect(usosDeLasFk(codigo)).toEqual([]);
  });

  it("un archivo inventado de lib/ que lee `orden.distrito_id` sale rojo", () => {
    const inventado: Fuente = {
      ruta: "lib/repositories/Inventado.ts",
      codigo: "export function leer(tx) {\n  return tx.orden.findFirst({ select: { distritoId: true } });\n}\n",
    };
    expect(fallosEn([...FUENTES, inventado])).toEqual(["lib/repositories/Inventado.ts: distritoId:"]);
  });
});

describe("SLT-48 R29 — ningun archivo de produccion lee ni escribe las 3 FK de la orden", () => {
  it("control: el arbol se leyo y alcanza a los lectores de la orden", () => {
    expect(FUENTES.length).toBeGreaterThan(500);
    const orden = FUENTES.find((f) => f.ruta === "lib/repositories/OrdenRepository.ts");
    expect(orden, "no se leyo OrdenRepository").toBeDefined();
    // Anti-vacio: el detector ve los bloques de orden de verdad, y en ellos el nodo.
    const bloques = bloquesDeOrden(orden?.codigo ?? "");
    expect(bloques.length).toBeGreaterThan(50);
    expect(bloques.some((b) => b.includes("nodoGeograficoId"))).toBe(true);
    const transito = FUENTES.find((f) => f.ruta === "lib/repositories/InformeTransitoRepository.ts");
    expect(transito?.codigo).toMatch(/FROM "orden" o/);
  });

  it("cero usos en lib/, app/ y components/", () => {
    expect(
      fallosEn(FUENTES),
      "Desde SLT-48 el lugar de una orden es su nodo (R22) y una orden nueva deja las 3 FK en NULL (R15). " +
        "Leerlas da un lugar vacio en toda orden nueva; escribirlas vuelve a tener dos verdades del lugar (R29).",
    ).toEqual([]);
  });
});
