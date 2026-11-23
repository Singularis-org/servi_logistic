import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-46 (R43, design §9) — LA GEOGRAFÍA JERÁRQUICA TIENE UN ESCRITOR POR TABLA.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// SUSTITUYE A `nodo-geografico-sin-escritor.guardia.test.ts` (SLT-43, R37), que prohibía toda
// escritura de `nodo_geografico` y `tipo_nivel_geografico` desde la app porque la fuente era la
// geografía vieja. Desde SLT-46 la fuente es el nodo: la app lo escribe y un trigger copia las
// profundidades 1–3 a `provincia`/`canton`/`distrito`. La prohibición pasa a ser un punto único:
//   · solo `lib/repositories/GeoRepository.ts` escribe `nodoGeografico`;
//   · solo `lib/repositories/PaisRepository.ts` escribe `tipoNivelGeografico`.
//
// QUÉ PROTEGE. Una escritura del nodo fuera de `GeoRepository` se saltaría las reglas del service
// (tipo de su profundidad, nombre normalizado entre hermanos, código del tipo) y no dejaría fila en
// el historial de plataforma; una del tipo fuera de `PaisRepository` no copiaría el nombre a
// `pais.nivel_N_*`. En `comoPlataforma` se corre como dueño: nada en la base la frenaría.
//
// MISMOS DETECTORES que la guardia de SLT-43: métodos de Prisma que escriben (`create*`, `update*`,
// `upsert`, `delete*`) y `INSERT INTO`/`UPDATE`/`DELETE FROM` SQL sobre las dos tablas, en `lib/`,
// `app/` y `components/`. Las migraciones (`db/`), los tests y `scripts/` quedan fuera.
//
// CON CONTRAPRUEBA: el detector, sobre líneas y un archivo inventados, tiene que encontrar cada
// patrón y señalar al infractor. Sin ella, un detector roto dejaría la guardia verde para siempre.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app", "components"] as const;
const EXTENSIONES = /\.(ts|tsx|mts|js|jsx)$/;

type Modelo = "nodoGeografico" | "tipoNivelGeografico";

/** El único archivo que puede escribir cada modelo (R43). */
const ESCRITOR_UNICO: Record<Modelo, string> = {
  nodoGeografico: "lib/repositories/GeoRepository.ts",
  tipoNivelGeografico: "lib/repositories/PaisRepository.ts",
};

const ESCRITURA_PRISMA = /\b(nodoGeografico|tipoNivelGeografico)\s*\??\.\s*(?:create\w*|update\w*|upsert|delete\w*)\b/;
const ESCRITURA_SQL =
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?(nodo_geografico|tipo_nivel_geografico)\b(?!_)/i;

const MODELO_DE_TABLA: Record<string, Modelo> = {
  nodo_geografico: "nodoGeografico",
  tipo_nivel_geografico: "tipoNivelGeografico",
};

interface Fuente {
  ruta: string;
  codigo: string;
}

interface Escritura {
  modelo: Modelo;
  linea: string;
}

/** Las líneas de `texto` que escriben en los dos modelos, con su número de línea y su modelo. */
function escriturasEn(texto: string): Escritura[] {
  const hallazgos: Escritura[] = [];
  texto.split("\n").forEach((linea, i) => {
    const prisma = ESCRITURA_PRISMA.exec(linea);
    const sql = ESCRITURA_SQL.exec(linea);
    const modelo = prisma ? (prisma[1] as Modelo) : sql ? MODELO_DE_TABLA[sql[1].toLowerCase()] : null;
    if (modelo) hallazgos.push({ modelo, linea: `${i + 1}: ${linea.trim()}` });
  });
  return hallazgos;
}

/** `ruta:línea: código` de cada escritura que no está en el escritor único de su modelo. */
function fallosEn(fuentes: readonly Fuente[]): string[] {
  return fuentes.flatMap((f) =>
    escriturasEn(f.codigo)
      .filter((e) => ESCRITOR_UNICO[e.modelo] !== f.ruta)
      .map((e) => `${f.ruta}:${e.linea}`),
  );
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

describe("SLT-46 R43 — contraprueba del detector", () => {
  it.each([
    ["await prisma.nodoGeografico.create({ data })", "nodoGeografico"],
    ["await tx.nodoGeografico.createMany({ data: filas })", "nodoGeografico"],
    ["prisma.nodoGeografico.createManyAndReturn({ data: filas })", "nodoGeografico"],
    ["prisma.nodoGeografico.update({ where, data })", "nodoGeografico"],
    ["prisma.nodoGeografico.updateMany({ where, data })", "nodoGeografico"],
    ["prisma.nodoGeografico.upsert({ where, create, update })", "nodoGeografico"],
    ["prisma.nodoGeografico.delete({ where })", "nodoGeografico"],
    ["prisma.nodoGeografico?.deleteMany({})", "nodoGeografico"],
    ["await tx.tipoNivelGeografico.create({ data })", "tipoNivelGeografico"],
    ["prisma.tipoNivelGeografico.updateMany({ where, data })", "tipoNivelGeografico"],
    ["prisma.tipoNivelGeografico.upsert({ where, create, update })", "tipoNivelGeografico"],
    ["prisma.tipoNivelGeografico.deleteMany({})", "tipoNivelGeografico"],
    ['await tx.$executeRaw`INSERT INTO "nodo_geografico" ("id") VALUES (1)`', "nodoGeografico"],
    ["insert into nodo_geografico (id) values (1)", "nodoGeografico"],
    ['UPDATE "nodo_geografico" SET "nombre" = $1', "nodoGeografico"],
    ['DELETE FROM public."nodo_geografico" WHERE id = $1', "nodoGeografico"],
    ['INSERT INTO "tipo_nivel_geografico" ("id") VALUES (1)', "tipoNivelGeografico"],
    ["update tipo_nivel_geografico set nombre_singular = $1", "tipoNivelGeografico"],
    ['DELETE FROM "public"."tipo_nivel_geografico"', "tipoNivelGeografico"],
  ])("encuentra la escritura en: %s", (linea, modelo) => {
    expect(escriturasEn(`const x = 1;\n${linea}\n`)).toEqual([{ modelo, linea: `2: ${linea}` }]);
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

  it("cada escritor solo es único para SU modelo: el nodo en PaisRepository y el tipo en GeoRepository salen rojos", () => {
    const cruzados: Fuente[] = [
      { ruta: ESCRITOR_UNICO.tipoNivelGeografico, codigo: "await tx.nodoGeografico.update({ where, data });" },
      { ruta: ESCRITOR_UNICO.nodoGeografico, codigo: 'await tx.$executeRaw`UPDATE "tipo_nivel_geografico" SET x = 1`;' },
    ];
    expect(fallosEn(cruzados)).toEqual([
      "lib/repositories/PaisRepository.ts:1: await tx.nodoGeografico.update({ where, data });",
      'lib/repositories/GeoRepository.ts:1: await tx.$executeRaw`UPDATE "tipo_nivel_geografico" SET x = 1`;',
    ]);
  });
});

describe("SLT-46 R43 — solo GeoRepository escribe el nodo y solo PaisRepository escribe los tipos", () => {
  it("control: el árbol se leyó, el registro de modelos de plataforma nombra los dos modelos y los dos escritores existen", () => {
    expect(FUENTES.length).toBeGreaterThan(500);
    const registro = FUENTES.find((f) => f.ruta === "lib/db/modelos-de-negocio.ts");
    expect(registro).toBeDefined();
    expect(registro?.codigo).toMatch(/modelo: "NodoGeografico", tabla: "nodo_geografico"/);
    expect(registro?.codigo).toMatch(/modelo: "TipoNivelGeografico", tabla: "tipo_nivel_geografico"/);
    for (const ruta of Object.values(ESCRITOR_UNICO)) {
      expect(FUENTES.map((f) => f.ruta), `no se leyó ${ruta}`).toContain(ruta);
    }
  });

  it("control positivo: GeoRepository SÍ escribe el nodo (si dejara de hacerlo, la guardia miraría al vacío)", () => {
    const geo = FUENTES.find((f) => f.ruta === ESCRITOR_UNICO.nodoGeografico) as Fuente;
    const delNodo = escriturasEn(geo.codigo).filter((e) => e.modelo === "nodoGeografico");
    expect(delNodo.length).toBeGreaterThanOrEqual(3);
  });

  it("control positivo: PaisRepository SÍ escribe los tipos (create, createMany y update) y la guardia lo admite", () => {
    const pais = FUENTES.find((f) => f.ruta === ESCRITOR_UNICO.tipoNivelGeografico) as Fuente;
    const delTipo = escriturasEn(pais.codigo).filter((e) => e.modelo === "tipoNivelGeografico");
    // Las tres escrituras reales de SLT-46: el alta de nivel_4..P, el renombre y agregar un nivel.
    for (const metodo of ["createMany", "update", "create"]) {
      expect(
        delTipo.some((e) => new RegExp(`tipoNivelGeografico\\.${metodo}\\(`).test(e.linea)),
        `la guardia no ve tipoNivelGeografico.${metodo} en PaisRepository`,
      ).toBe(true);
    }
    // Y, por ser su escritor único, ninguna de ellas es un fallo.
    expect(fallosEn([pais])).toEqual([]);
  });

  it("CONTRAPRUEBA: la misma escritura del tipo en un archivo inventado fuera de PaisRepository sale roja", () => {
    const inventado: Fuente = {
      ruta: "lib/services/TipoInventado.ts",
      codigo: [
        "export async function tiposDeMas(tx: Tx, filas: Fila[]) {",
        "  await tx.tipoNivelGeografico.createMany({ data: filas });",
        "  await tx.tipoNivelGeografico.update({ where: { id }, data: { nombreSingular } });",
        "}",
      ].join("\n"),
    };
    expect(fallosEn([...FUENTES, inventado])).toEqual([
      "lib/services/TipoInventado.ts:2: await tx.tipoNivelGeografico.createMany({ data: filas });",
      "lib/services/TipoInventado.ts:3: await tx.tipoNivelGeografico.update({ where: { id }, data: { nombreSingular } });",
    ]);
  });

  it("ningún otro archivo de lib/, app/ ni components/ escribe el nodo ni los tipos", () => {
    expect(
      fallosEn(FUENTES),
      "Solo GeoRepository escribe nodo_geografico y solo PaisRepository escribe tipo_nivel_geografico " +
        "(R43, design §9): una escritura en otro sitio se salta las reglas del service y el historial.",
    ).toEqual([]);
  });
});
