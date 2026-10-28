import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { EXCEPCIONES_SQL_DINAMICO, fallosDeExcepcion, hallazgosSqlDinamico } from "./_mutaciones-sql-dinamicas";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-40 (design §2.2, §11.3) — LOS CARGOS DEL COBRO DE LA PLATAFORMA LOS ESCRIBE SOLO LA BASE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ PROTEGE. Los cargos y reversos de `cobro_plataforma_movimiento` los registran los triggers
// sobre `orden`, y así se cumple «por cualquier vía» por construcción (D3). Un `create` o un `INSERT`
// desde la app abriría una segunda vía de escritura:
//   · en contexto de empresa, la base lo rechaza (`REVOKE`, R8), pero solo cuando alguien lo ejecuta;
//   · en `comoPlataforma` corre como dueño, y ahí nada lo frena: una deuda duplicada o borrada sin
//     que la suite lo note.
// Esta guardia lo convierte en un rojo al escribirlo.
//
// LO QUE EXIGE. Ningún archivo de `lib/` ni de `app/` llama a un método que escribe del modelo
// (`create*`, `update*`, `upsert`, `delete*`) ni escribe `INSERT INTO`, `UPDATE` o `DELETE FROM`
// sobre la tabla. Las migraciones (`db/`) y los tests quedan fuera: ahí viven los triggers y las
// limpiezas.
//
// CON CONTRAPRUEBA: el mismo detector, sobre textos sintéticos, tiene que encontrar cada patrón. Sin
// ella, un detector roto que no encontrara nada dejaría la guardia verde para siempre.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.
//
// EL `DELETE` CON TABLA DINÁMICA (review SL-43, m5). `DELETE FROM ${tabla}` no nombra la tabla de
// cargos y el detector de arriba no lo ve. Se mira aparte, en `lib/`, `app/` y también `scripts/`:
// sale rojo salvo las excepciones de `_mutaciones-sql-dinamicas.ts`. Hoy, solo el borrado de las
// empresas demo (`scripts/demo-qa/borrar.ts`, SL-43 D12), que borra sus cargos como dueño y solo de
// empresas con `es_demo`. No es una vía de escritura de cargos: no inserta ni cambia, solo borra
// empresas demo enteras.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app"] as const;
const EXTENSIONES = /\.(ts|tsx|mts|js|jsx)$/;

const ESCRITURA_PRISMA = /\bcobroPlataformaMovimiento\s*\??\.\s*(create\w*|update\w*|upsert|delete\w*)\b/;
const ESCRITURA_SQL = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?cobro_plataforma_movimiento\b/i;

/** Las líneas de `texto` que escriben en la tabla de cargos, con su número de línea. */
function escriturasEn(texto: string): string[] {
  const hallazgos: string[] = [];
  texto.split("\n").forEach((linea, i) => {
    if (ESCRITURA_PRISMA.test(linea) || ESCRITURA_SQL.test(linea)) hallazgos.push(`${i + 1}: ${linea.trim()}`);
  });
  return hallazgos;
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

const ARCHIVOS = ARBOLES.flatMap((a) => archivosDe(path.join(RAIZ, a)));
const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");

describe("SL-40 — contraprueba del detector", () => {
  it.each([
    "await tx.cobroPlataformaMovimiento.create({ data })",
    "prisma.cobroPlataformaMovimiento.createMany({ data: filas })",
    "prisma.cobroPlataformaMovimiento.createManyAndReturn({ data: filas })",
    "prisma.cobroPlataformaMovimiento.update({ where, data })",
    "prisma.cobroPlataformaMovimiento.updateMany({ where, data })",
    "prisma.cobroPlataformaMovimiento.upsert({ where, create, update })",
    "prisma.cobroPlataformaMovimiento.delete({ where })",
    "prisma.cobroPlataformaMovimiento.deleteMany({})",
    "prisma.cobroPlataformaMovimiento?.deleteMany({})",
    'await tx.$executeRaw`INSERT INTO "cobro_plataforma_movimiento" ("id") VALUES (1)`',
    "insert into cobro_plataforma_movimiento (id) values (1)",
    'UPDATE "cobro_plataforma_movimiento" SET "monto" = 0',
    'DELETE FROM public."cobro_plataforma_movimiento"',
  ])("encuentra la escritura en: %s", (linea) => {
    expect(escriturasEn(`const x = 1;\n${linea}\n`)).toEqual([`2: ${linea}`]);
  });

  it.each([
    "prisma.cobroPlataformaMovimiento.groupBy({ by: ['tipo'] })",
    "prisma.cobroPlataformaMovimiento.findMany({ where })",
    'SELECT * FROM "cobro_plataforma_movimiento"',
    'INSERT INTO "cobro_plataforma_tarifa" ("id") VALUES (true)',
  ])("no confunde una lectura u otra tabla con una escritura: %s", (linea) => {
    expect(escriturasEn(linea)).toEqual([]);
  });
});

describe("SL-40 — nadie escribe cargos desde la app (R8, D3)", () => {
  it("control: el árbol se leyó y el repositorio de lectura del modelo está en él", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(500);
    const repo = ARCHIVOS.find((a) => relativa(a) === "lib/repositories/CobroPlataformaMovimientoRepository.ts");
    expect(repo).toBeDefined();
    expect(readFileSync(repo as string, "utf8")).toMatch(/cobroPlataformaMovimiento\.groupBy/);
  });

  it("ningún archivo de lib/ ni de app/ escribe en cobro_plataforma_movimiento", () => {
    const fallos = ARCHIVOS.flatMap((a) =>
      escriturasEn(readFileSync(a, "utf8")).map((h) => `${relativa(a)}:${h}`),
    );
    expect(
      fallos,
      "Los cargos y reversos los escriben los triggers sobre `orden` (SL-40 design §2.2). Si hace falta otra vía, va en una migración, no en la app.",
    ).toEqual([]);
  });

  it("ningún archivo de lib/, app/ ni scripts/ borra o cambia con tabla dinámica, salvo las excepciones (m5 de SL-43)", () => {
    const conScripts = [...ARCHIVOS, ...archivosDe(path.join(RAIZ, "scripts"))];
    const fuentes = conScripts.map((a) => ({ ruta: relativa(a), codigo: readFileSync(a, "utf8") }));
    // Control: el borrado de la demo está en el censo y lo ve el detector (sin la excepción, rojo).
    const demo = fuentes.find((f) => f.ruta === "scripts/demo-qa/borrar.ts");
    expect(demo).toBeDefined();
    expect(hallazgosSqlDinamico([demo as (typeof fuentes)[number]], [])).not.toEqual([]);
    expect(hallazgosSqlDinamico(fuentes)).toEqual([]);
    for (const e of EXCEPCIONES_SQL_DINAMICO) {
      const f = fuentes.find((x) => x.ruta === e.archivo);
      expect(f, e.archivo).toBeDefined();
      expect(fallosDeExcepcion(e, (f as (typeof fuentes)[number]).codigo)).toEqual([]);
    }
  });
});
