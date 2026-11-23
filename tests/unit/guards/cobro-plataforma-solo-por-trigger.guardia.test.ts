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
//
// SLT-85 (R25, design §5) — LA TRAZA DE FACTURACIÓN, IGUAL. `cobro_plataforma_traza` la escribe solo
// el trigger `cobro_plataforma_traza_al_registrar` sobre `cobro_plataforma_movimiento`, y no se edita.
// El detector mira las dos tablas y cada una tiene su `it`, para que el rojo nombre la tabla.
//
// SLT-118 (R22, design §1.3) — LAS FACTURAS DE LA PLATAFORMA, IGUAL. `factura_plataforma` la escriben solo
// las funciones del dueño en la base (`factura_plataforma_abrir`, `_avanzar`, `_tomar_cambio`, `_cerrar`);
// la app solo las llama y lee. Llamar a una función (`SELECT factura_plataforma_cerrar(…)`) no es escribir
// la tabla: el detector exige el nombre exacto de la tabla tras `INSERT INTO`, `UPDATE` o `DELETE FROM`.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app"] as const;
const EXTENSIONES = /\.(ts|tsx|mts|js|jsx)$/;

/** Por tabla que solo escribe la base: el detector de Prisma y el de SQL (con o sin comillas y `public.`). */
const DETECTORES = {
  cobro_plataforma_movimiento: [
    /\bcobroPlataformaMovimiento\s*\??\.\s*(create\w*|update\w*|upsert|delete\w*)\b/,
    /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?cobro_plataforma_movimiento\b/i,
  ],
  // SLT-85 (R25).
  cobro_plataforma_traza: [
    /\bcobroPlataformaTraza\s*\??\.\s*(create\w*|update\w*|upsert|delete\w*)\b/,
    /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?cobro_plataforma_traza\b/i,
  ],
  // SLT-118 (R22).
  factura_plataforma: [
    /\bfacturaPlataforma\s*\??\.\s*(create\w*|update\w*|upsert|delete\w*)\b/,
    /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?public"?\.)?"?factura_plataforma\b/i,
  ],
} as const satisfies Record<string, readonly RegExp[]>;
type Tabla = keyof typeof DETECTORES;
const TODAS = Object.keys(DETECTORES) as Tabla[];

/** Las líneas de `texto` que escriben en las `tablas` (por defecto, todas), con su número de línea. */
function escriturasEn(texto: string, tablas: readonly Tabla[] = TODAS): string[] {
  const detectores = tablas.flatMap((t) => DETECTORES[t]);
  const hallazgos: string[] = [];
  texto.split("\n").forEach((linea, i) => {
    if (detectores.some((d) => d.test(linea))) hallazgos.push(`${i + 1}: ${linea.trim()}`);
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
    expect(escriturasEn(linea, ["cobro_plataforma_movimiento"])).toEqual([`1: ${linea}`]);
  });

  // SLT-85 (R25): la traza de facturación.
  it.each([
    "await tx.cobroPlataformaTraza.create({ data })",
    "prisma.cobroPlataformaTraza.createMany({ data: filas })",
    "prisma.cobroPlataformaTraza.createManyAndReturn({ data: filas })",
    "prisma.cobroPlataformaTraza.update({ where, data })",
    "prisma.cobroPlataformaTraza.updateMany({ where, data })",
    "prisma.cobroPlataformaTraza.upsert({ where, create, update })",
    "prisma.cobroPlataformaTraza.delete({ where })",
    "prisma.cobroPlataformaTraza.deleteMany({})",
    "prisma.cobroPlataformaTraza?.deleteMany({})",
    'await tx.$executeRaw`INSERT INTO "cobro_plataforma_traza" ("id") VALUES (1)`',
    "insert into cobro_plataforma_traza (id) values (1)",
    'UPDATE "cobro_plataforma_traza" SET "tipo_cobro" = NULL',
    "update public.cobro_plataforma_traza set tipo_cobro = null",
    'DELETE FROM public."cobro_plataforma_traza"',
    "delete from cobro_plataforma_traza where true",
  ])("encuentra la escritura en la traza: %s", (linea) => {
    expect(escriturasEn(`const x = 1;\n${linea}\n`, ["cobro_plataforma_traza"])).toEqual([`2: ${linea}`]);
    expect(escriturasEn(linea, ["cobro_plataforma_movimiento"])).toEqual([]);
  });

  // SLT-118 (R22): las facturas de la plataforma.
  it.each([
    "await tx.facturaPlataforma.create({ data })",
    "prisma.facturaPlataforma.createMany({ data: filas })",
    "prisma.facturaPlataforma.createManyAndReturn({ data: filas })",
    "prisma.facturaPlataforma.update({ where, data })",
    "prisma.facturaPlataforma.updateMany({ where, data })",
    "prisma.facturaPlataforma.upsert({ where, create, update })",
    "prisma.facturaPlataforma.delete({ where })",
    "prisma.facturaPlataforma.deleteMany({})",
    "prisma.facturaPlataforma?.deleteMany({})",
    'await tx.$executeRaw`INSERT INTO "factura_plataforma" ("id") VALUES (1)`',
    "insert into factura_plataforma (id) values (1)",
    'UPDATE "factura_plataforma" SET "cuota" = 0',
    "update public.factura_plataforma set estado = 'cerrada'",
    'DELETE FROM public."factura_plataforma"',
    "delete from factura_plataforma where true",
  ])("encuentra la escritura en las facturas: %s", (linea) => {
    expect(escriturasEn(`const x = 1;\n${linea}\n`, ["factura_plataforma"])).toEqual([`2: ${linea}`]);
    expect(escriturasEn(linea, ["cobro_plataforma_movimiento", "cobro_plataforma_traza"])).toEqual([]);
  });

  it.each([
    "prisma.cobroPlataformaMovimiento.groupBy({ by: ['tipo'] })",
    "prisma.cobroPlataformaMovimiento.findMany({ where })",
    'SELECT * FROM "cobro_plataforma_movimiento"',
    'INSERT INTO "cobro_plataforma_tarifa" ("id") VALUES (true)',
    "prisma.cobroPlataformaTraza.findMany({ where })",
    "prisma.cobroPlataformaTraza.groupBy({ by: ['tipo_cobro'] })",
    'SELECT * FROM "cobro_plataforma_traza" WHERE "orden_id" = $1',
    'UPDATE "cobro_plataforma_traza_x" SET "a" = 1',
    "prisma.facturaPlataforma.findMany({ where })",
    "prisma.facturaPlataforma.aggregate({ _sum: { cuota: true } })",
    'SELECT * FROM "factura_plataforma" WHERE "estado" = $1',
    "await tx.$queryRaw`SELECT factura_plataforma_cerrar(${id}, ${ahora}::timestamp)`",
    "await tx.$executeRaw`SELECT factura_plataforma_tomar_cambio(${id}, ${efecto}::timestamp, ${plan}, ${tipo})`",
    'UPDATE "factura_plataforma_x" SET "a" = 1',
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
      escriturasEn(readFileSync(a, "utf8"), ["cobro_plataforma_movimiento"]).map((h) => `${relativa(a)}:${h}`),
    );
    expect(
      fallos,
      "Los cargos y reversos los escriben los triggers sobre `orden` (SL-40 design §2.2). Si hace falta otra vía, va en una migración, no en la app.",
    ).toEqual([]);
  });

  it("ningún archivo de lib/ ni de app/ escribe en cobro_plataforma_traza (SLT-85, R25)", () => {
    const fallos = ARCHIVOS.flatMap((a) =>
      escriturasEn(readFileSync(a, "utf8"), ["cobro_plataforma_traza"]).map((h) => `${relativa(a)}:${h}`),
    );
    expect(
      fallos,
      "La traza de facturación la escribe solo el trigger sobre `cobro_plataforma_movimiento` y no se edita (SLT-85 design §5). Si hace falta otra vía, va en una migración, no en la app.",
    ).toEqual([]);
  });

  it("ningún archivo de lib/ ni de app/ escribe en factura_plataforma (SLT-118, R22)", () => {
    const fallos = ARCHIVOS.flatMap((a) =>
      escriturasEn(readFileSync(a, "utf8"), ["factura_plataforma"]).map((h) => `${relativa(a)}:${h}`),
    );
    expect(
      fallos,
      "Las facturas de la plataforma las escriben solo las funciones del dueño en la base (SLT-118 design §1.3, §2). La app las llama y las lee; si hace falta otra vía, va en una migración.",
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
