import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-46 (R1, design §9) — NADIE ESCRIBE LA GEOGRAFÍA VIEJA DESDE LA APP.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ PROTEGE. Desde SLT-46 la geografía del superadmin se escribe en `nodo_geografico` y el trigger
// `nodo_geografico_copia_a_geografia_vieja` (T2.2) deja `provincia`, `canton` y `distrito` iguales a
// los nodos de profundidad 1–3, en la misma sentencia. Una escritura directa a una tabla vieja desde
// la app la propagaría la sincronía de SLT-43 al nodo, pero se saltaría las reglas del service
// (tipo de la profundidad, nombre normalizado, código del tipo) y el historial con entidad
// `nodo_geografico`; y en `comoPlataforma` corre como dueño, así que nada la frenaría.
//
// LO QUE EXIGE. Ningún archivo de `lib/`, `app/` ni `components/` llama a un método de Prisma que
// escribe (`create*`, `update*`, `upsert`, `delete*`) sobre `provincia`, `canton` o `distrito`, ni
// escribe `INSERT INTO`, `UPDATE` o `DELETE FROM` SQL sobre ellas. `GeoRepository` tampoco: ya no
// tiene esos delegados en su `Pick`. Las migraciones (`db/`), los tests y `scripts/` quedan fuera.
//
// Se mide sobre el código sin comentarios: la prosa del árbol nombra a propósito lo prohibido.
// CON CONTRAPRUEBA sobre líneas y un archivo inventados: un detector roto que no encontrara nada
// dejaría la guardia verde para siempre.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app", "components"] as const;
const EXTENSIONES = /\.(ts|tsx|mts|js|jsx)$/;

// `(?<![A-Za-z])` por `zonaDistrito` y `distritoZonaEspecial`, que son otras tablas y se escriben.
const ESCRITURA_PRISMA =
  /(?<![A-Za-z])(provincia|canton|distrito)\s*\??\.\s*(create\w*|update\w*|upsert|delete\w*)\s*\(/;
// `(?!_)` por `distrito_zona_especial` y las columnas `*_id`.
const ESCRITURA_SQL =
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?(provincia|canton|distrito)\b(?!_)/i;

interface Fuente {
  ruta: string;
  codigo: string;
}

/** Las líneas de `texto` que escriben la geografía vieja, con su número de línea. */
function escriturasEn(texto: string): string[] {
  const hallazgos: string[] = [];
  texto.split("\n").forEach((linea, i) => {
    if (ESCRITURA_PRISMA.test(linea) || ESCRITURA_SQL.test(linea)) hallazgos.push(`${i + 1}: ${linea.trim()}`);
  });
  return hallazgos;
}

function fallosEn(fuentes: readonly Fuente[]): string[] {
  return fuentes.flatMap((f) => escriturasEn(f.codigo).map((h) => `${f.ruta}:${h}`));
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

describe("SLT-46 R1 — contraprueba del detector", () => {
  it.each([
    "await tx.provincia.create({ data })",
    "prisma.provincia.createMany({ data: filas })",
    "await tx.canton.update({ where: { id }, data: { nombre } })",
    "prisma.canton?.updateMany({ where, data })",
    "prisma.distrito.upsert({ where, create, update })",
    "prisma.distrito.delete({ where })",
    "prisma.distrito\t.deleteMany({})",
    'await tx.$executeRaw`INSERT INTO "provincia" ("id") VALUES (1)`',
    "insert into canton (id) values (1)",
    'UPDATE "distrito" SET "activo" = false',
    'DELETE FROM public."canton" WHERE id = $1',
    'update "public"."provincia" set nombre = $1',
  ])("encuentra la escritura en: %s", (linea) => {
    expect(escriturasEn(`const x = 1;\n${linea}\n`)).toEqual([`2: ${linea}`]);
  });

  it.each([
    "prisma.provincia.findMany({ where })",
    "tx.distrito.findUnique({ where: { id } })",
    "await tx.zonaDistrito.deleteMany({ where: { zonaId } })",
    "await tx.distritoZonaEspecial.create({ data })",
    'DELETE FROM "distrito_zona_especial" WHERE id = $1',
    'UPDATE "orden" SET "distrito_id" = $1',
    'SELECT * FROM "provincia" WHERE pais_id = $1',
    'INSERT INTO "nodo_geografico" ("id") VALUES (1)',
    'entidadTipo: "distrito",',
  ])("no confunde una lectura, otra tabla o una columna con una escritura: %s", (linea) => {
    expect(escriturasEn(linea)).toEqual([]);
  });

  it("un archivo inventado de lib/ que hace tx.distrito.update sale rojo, tambien en GeoRepository", () => {
    const inventados: Fuente[] = [
      {
        ruta: "lib/repositories/DistritoInventado.ts",
        codigo: ["export async function retirar(tx, id) {", "  await tx.distrito.update({ where: { id }, data: { activo } });", "}"].join("\n"),
      },
      { ruta: "lib/repositories/GeoRepository.ts", codigo: 'await tx.$executeRaw`UPDATE "canton" SET nombre = $1`;' },
    ];
    expect(fallosEn([...FUENTES, ...inventados])).toEqual([
      "lib/repositories/DistritoInventado.ts:2: await tx.distrito.update({ where: { id }, data: { activo } });",
      'lib/repositories/GeoRepository.ts:1: await tx.$executeRaw`UPDATE "canton" SET nombre = $1`;',
    ]);
  });
});

describe("SLT-46 R1 — ningún archivo de lib/, app/ ni components/ escribe provincia, canton ni distrito", () => {
  it("control: el árbol se leyó y alcanza al escritor de la geografía y a la pantalla del superadmin", () => {
    expect(FUENTES.length).toBeGreaterThan(500);
    const rutas = FUENTES.map((f) => f.ruta);
    expect(rutas).toContain("lib/repositories/GeoRepository.ts");
    expect(rutas.some((r) => r.startsWith("app/(app)/plataforma/geografia/"))).toBe(true);
    expect(rutas.some((r) => r.startsWith("components/"))).toBe(true);
  });

  it("control positivo: el detector ve las LECTURAS que siguen existiendo sobre las tablas viejas", () => {
    // Si no hubiera ninguna mención de los delegados viejos, el cero de abajo no diría nada.
    const lecturas = FUENTES.filter((f) => /(?<![A-Za-z])(provincia|canton|distrito)\s*\.\s*find\w*\s*\(/.test(f.codigo));
    expect(lecturas.length).toBeGreaterThan(0);
  });

  it("cero escrituras en todo el árbol", () => {
    expect(
      fallosEn(FUENTES),
      "Desde SLT-46 la geografía se escribe en nodo_geografico y el trigger copia las profundidades 1–3 " +
        "a la geografía vieja (R1, design §2.2). Una escritura directa se salta el service y el historial.",
    ).toEqual([]);
  });
});
