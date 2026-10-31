import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-43 (R37, design §2.3) — LA GEOGRAFÍA JERÁRQUICA NO TIENE ESCRITOR EN LA APP.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ PROTEGE. En SLT-43 la geografía vieja (`provincia`, `canton`, `distrito`, `pais`) es la única
// fuente: `nodo_geografico` y `tipo_nivel_geografico` los llenan la migración y los triggers de
// sincronía. Una escritura directa desde la app abriría una segunda fuente que la sincronía pisaría
// o contradiría (un nodo sin fila vieja, un nombre que el próximo `UPDATE` de la provincia borra):
//   · como `servi_app`, la base la rechaza (`REVOKE`, R12), pero solo cuando alguien la ejecuta;
//   · en `comoPlataforma` corre como dueño, y ahí nada la frena.
// Esta guardia lo convierte en un rojo al escribirlo. SLT-46 la retirará cuando el modelo nuevo
// pase a ser la fuente.
//
// LO QUE EXIGE. Ningún archivo de `lib/`, `app/` ni `components/` llama a un método que escribe de
// los dos modelos (`create*`, `update*`, `upsert`, `delete*`) ni escribe `INSERT INTO`, `UPDATE` o
// `DELETE FROM` sobre sus tablas. Las migraciones (`db/`), los tests y `scripts/` quedan fuera, como
// dice el design (§7, R37): el script `geo:backfill` solo escribe columnas de las tablas de negocio.
//
// CON CONTRAPRUEBA: el detector, sobre líneas y un archivo inventados, tiene que encontrar cada
// patrón. Sin ella, un detector roto que no encontrara nada dejaría la guardia verde para siempre.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app", "components"] as const;
const EXTENSIONES = /\.(ts|tsx|mts|js|jsx)$/;

const ESCRITURA_PRISMA = /\b(?:nodoGeografico|tipoNivelGeografico)\s*\??\.\s*(create\w*|update\w*|upsert|delete\w*)\b/;
const ESCRITURA_SQL =
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?(?:nodo_geografico|tipo_nivel_geografico)\b(?!_)/i;

interface Fuente {
  ruta: string;
  codigo: string;
}

/** Las líneas de `texto` que escriben en los dos modelos, con su número de línea. */
function escriturasEn(texto: string): string[] {
  const hallazgos: string[] = [];
  texto.split("\n").forEach((linea, i) => {
    if (ESCRITURA_PRISMA.test(linea) || ESCRITURA_SQL.test(linea)) hallazgos.push(`${i + 1}: ${linea.trim()}`);
  });
  return hallazgos;
}

/** `ruta:línea: código` de cada escritura en `fuentes`. Es lo que la guardia exige vacío. */
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
  codigo: readFileSync(a, "utf8"),
}));

describe("SLT-43 R37 — contraprueba del detector", () => {
  it.each([
    "await prisma.nodoGeografico.create({ data })",
    "await tx.nodoGeografico.createMany({ data: filas })",
    "prisma.nodoGeografico.createManyAndReturn({ data: filas })",
    "prisma.nodoGeografico.update({ where, data })",
    "prisma.nodoGeografico.updateMany({ where, data })",
    "prisma.nodoGeografico.upsert({ where, create, update })",
    "prisma.nodoGeografico.delete({ where })",
    "prisma.nodoGeografico?.deleteMany({})",
    "await tx.tipoNivelGeografico.create({ data })",
    "prisma.tipoNivelGeografico.updateMany({ where, data })",
    "prisma.tipoNivelGeografico.upsert({ where, create, update })",
    "prisma.tipoNivelGeografico.deleteMany({})",
    'await tx.$executeRaw`INSERT INTO "nodo_geografico" ("id") VALUES (1)`',
    "insert into nodo_geografico (id) values (1)",
    'UPDATE "nodo_geografico" SET "nombre" = $1',
    'DELETE FROM public."nodo_geografico" WHERE id = $1',
    'INSERT INTO "tipo_nivel_geografico" ("id") VALUES (1)',
    "update tipo_nivel_geografico set nombre_singular = $1",
    'DELETE FROM "public"."tipo_nivel_geografico"',
  ])("encuentra la escritura en: %s", (linea) => {
    expect(escriturasEn(`const x = 1;\n${linea}\n`)).toEqual([`2: ${linea}`]);
  });

  it.each([
    "prisma.nodoGeografico.findMany({ where })",
    "prisma.tipoNivelGeografico.findUnique({ where })",
    "nodoGeograficoSchema.safeParse(input)",
    'SELECT * FROM "nodo_geografico" WHERE padre_id = $1',
    'accion: "nodo_geografico_creado",',
    'UPDATE "orden" SET "nodo_geografico_id" = COALESCE(distrito_id, canton_id)',
    'INSERT INTO "provincia" ("id", "nombre") VALUES ($1, $2)',
  ])("no confunde una lectura, otra tabla o una columna con una escritura: %s", (linea) => {
    expect(escriturasEn(linea)).toEqual([]);
  });

  it("un archivo inventado de lib/ que hace prisma.nodoGeografico.create sale rojo", () => {
    const inventado: Fuente = {
      ruta: "lib/repositories/NodoInventado.ts",
      codigo: [
        'import { prisma } from "@/lib/db/prisma";',
        "",
        "export async function crearNodo(data: { id: string; nombre: string }) {",
        "  return prisma.nodoGeografico.create({ data });",
        "}",
      ].join("\n"),
    };
    expect(fallosEn([...FUENTES, inventado])).toEqual([
      "lib/repositories/NodoInventado.ts:4: return prisma.nodoGeografico.create({ data });",
    ]);
  });
});

describe("SLT-43 R37 — nadie escribe nodo_geografico ni tipo_nivel_geografico desde la app", () => {
  it("control: el árbol se leyó y el registro de modelos de plataforma nombra los dos modelos", () => {
    expect(FUENTES.length).toBeGreaterThan(500);
    const registro = FUENTES.find((f) => f.ruta === "lib/db/modelos-de-negocio.ts");
    expect(registro).toBeDefined();
    expect(registro?.codigo).toMatch(/modelo: "NodoGeografico", tabla: "nodo_geografico"/);
    expect(registro?.codigo).toMatch(/modelo: "TipoNivelGeografico", tabla: "tipo_nivel_geografico"/);
  });

  it("ningún archivo de lib/, app/ ni components/ escribe en los dos modelos", () => {
    expect(
      fallosEn(FUENTES),
      "En SLT-43 la app escribe la geografía vieja y la sincronía lo propaga (R37, design §2.3). Un cambio en el modelo nuevo va en una migración o en un trigger, no en la app.",
    ).toEqual([]);
  });
});
