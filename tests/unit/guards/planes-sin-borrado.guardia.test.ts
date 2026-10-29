import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { codigoSinComentarios } from "@/tests/fixtures/sin-comentarios";

/**
 * SL-24 · T8 (design §2.8, §11, §16.1; R6, R29) — GUARDIA: UN PLAN NO SE BORRA, SU RASTRO SOLO SE
 * AÑADE, Y EL CAMBIO PROGRAMADO SOLO LO ESCRIBE `PlanesRepository`.
 *
 * - **`plan`:** quitarlo es ARCHIVARLO (R6). Un borrado arrastraría en cascada sus topes y su
 *   rastro, y dejaría a las empresas que lo tienen sin límites sin que nadie lo decidiera.
 * - **`plan_rastro`:** es la historia de cada cambio (R29). Editarla o borrarla es reescribir quién
 *   cambió qué; por eso ningún código hace `update` ni `delete` sobre ella.
 * - **`plan_cambio_programado`** (ampliación de T10): programar, reemplazar, cancelar y aplicar van
 *   en la misma transacción que el rastro, dentro de `PlanesRepository`. Una escritura desde otro
 *   archivo se saltaría el cerrojo y el rastro.
 *
 * Barrido ESTÁTICO de `lib/` y `app/` sin comentarios (la prosa nombra a propósito lo prohibido). Los
 * detectores son funciones puras para que la contraprueba los ejerza sobre texto en memoria: una
 * guardia estática rota no falla, calla.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app"];
const UNICO_ESCRITOR_DEL_CAMBIO = "lib/repositories/PlanesRepository.ts";

/**
 * Lo prohibido en TODO archivo: borrar un plan, y editar o borrar su rastro, por delegado o por SQL.
 * `(?<![A-Za-z0-9_])` acota el delegado: `planCambioProgramado.deleteMany` no es `plan.deleteMany`.
 */
export function borradosDePlanEn(codigo: string): string[] {
  const hallazgos: string[] = [];
  const delegado = /(?<![A-Za-z0-9_])(plan\s*\.\s*(?:delete|deleteMany)|planRastro\s*\.\s*(?:update|updateMany|upsert|delete|deleteMany))\s*\(/g;
  for (const m of codigo.matchAll(delegado)) hallazgos.push(m[1].replace(/\s+/g, ""));
  const sql = /\b(DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+"(plan|plan_rastro)"|\bUPDATE\s+"(plan_rastro)"/gi;
  for (const m of codigo.matchAll(sql)) {
    hallazgos.push(m[3] ? `UPDATE "${m[3]}"` : `${m[1].toUpperCase().replace(/\s+/g, " ")} "${m[2]}"`);
  }
  return hallazgos;
}

/** Las escrituras sobre `plan_cambio_programado`, por delegado o por SQL. Solo valen en un archivo. */
export function escriturasDelCambioEn(codigo: string): string[] {
  const hallazgos: string[] = [];
  const delegado =
    /(?<![A-Za-z0-9_])planCambioProgramado\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/g;
  for (const m of codigo.matchAll(delegado)) hallazgos.push(`planCambioProgramado.${m[1]}`);
  const sql = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+"plan_cambio_programado"/gi;
  for (const m of codigo.matchAll(sql)) hallazgos.push(`${m[1].toUpperCase().replace(/\s+/g, " ")} "plan_cambio_programado"`);
  return hallazgos;
}

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) fuentes(completo, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(completo);
  }
  return acc;
}

function relativo(archivo: string): string {
  return path.relative(RAIZ, archivo).split(path.sep).join("/");
}

const ARCHIVOS = ARBOLES.flatMap((a) => fuentes(path.join(RAIZ, a))).map(relativo);

describe("SL-24 · T8 — los detectores se prueban a sí mismos", () => {
  const CUERPO_SANO = `
    await tx.plan.update({ where: { id }, data: { archivadoAt: new Date() } });
    await tx.planRastro.create({ data: rastro });
    await tx.planCambioProgramado.deleteMany({ where: { id: pendiente.id } });
    const filas = await tx.$queryRaw\`SELECT "id" FROM "plan" WHERE "id" = \${planId} FOR UPDATE\`;
    await tx.plantillaMensaje.deleteMany({ where: {} });`;

  it("CONTRAPRUEBA (control positivo): archivar, rastrear y leer NO producen hallazgos", () => {
    expect(borradosDePlanEn(CUERPO_SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA: borrar un plan SE DETECTA, por delegado y por SQL", () => {
    const mutado = CUERPO_SANO.replace(
      "await tx.plan.update({ where: { id }, data: { archivadoAt: new Date() } });",
      "await tx.plan.delete({ where: { id } });",
    );
    expect(borradosDePlanEn(mutado)).toEqual(["plan.delete"]);
    expect(borradosDePlanEn("prisma.plan\n  .deleteMany({})")).toEqual(["plan.deleteMany"]);
    expect(borradosDePlanEn(`await tx.$executeRaw\`DELETE FROM "plan" WHERE "id" = \${id}\`;`)).toEqual([
      'DELETE FROM "plan"',
    ]);
  });

  it("CONTRAPRUEBA: editar o borrar el rastro SE DETECTA, por delegado y por SQL", () => {
    expect(borradosDePlanEn(`await tx.planRastro.update({ where: { id }, data });`)).toEqual(["planRastro.update"]);
    expect(borradosDePlanEn(`await tx.planRastro.updateMany({ data });`)).toEqual(["planRastro.updateMany"]);
    expect(borradosDePlanEn(`await tx.planRastro.deleteMany({});`)).toEqual(["planRastro.deleteMany"]);
    expect(borradosDePlanEn(`$executeRawUnsafe('delete from "plan_rastro"')`)).toEqual(['DELETE FROM "plan_rastro"']);
    expect(borradosDePlanEn(`$executeRawUnsafe('UPDATE "plan_rastro" SET "cambios" = $1')`)).toEqual([
      'UPDATE "plan_rastro"',
    ]);
  });

  it("CONTRAPRUEBA: escribir el cambio programado SE DETECTA; leerlo no", () => {
    expect(escriturasDelCambioEn(CUERPO_SANO)).toEqual(["planCambioProgramado.deleteMany"]);
    expect(escriturasDelCambioEn(`await tx.planCambioProgramado.create({ data });`)).toEqual([
      "planCambioProgramado.create",
    ]);
    expect(escriturasDelCambioEn(`await tx.planCambioProgramado.upsert({ where, create, update });`)).toEqual([
      "planCambioProgramado.upsert",
    ]);
    expect(escriturasDelCambioEn(`$executeRawUnsafe('INSERT INTO "plan_cambio_programado" …')`)).toEqual([
      'INSERT INTO "plan_cambio_programado"',
    ]);
    expect(escriturasDelCambioEn(`await this.prisma.planCambioProgramado.findMany({});`)).toEqual([]);
  });
});

describe("SL-24 · T8 — el barrido no está vacío", () => {
  it("`lib/` y `app/` tienen fuentes y ninguna se lee vacía", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(200);
    expect(ARCHIVOS.some((a) => a.startsWith("app/"))).toBe(true);
    const vacios = ARCHIVOS.filter((a) => codigoSinComentarios(a).trim() === "");
    expect(vacios).toEqual([]);
  });

  it("control positivo sobre el árbol real: el único escritor SÍ escribe el cambio programado", () => {
    // Si el detector no encontrara las escrituras legítimas de `PlanesRepository`, el caso
    // «nadie más lo escribe» estaría verde por no saber buscar.
    expect(ARCHIVOS).toContain(UNICO_ESCRITOR_DEL_CAMBIO);
    const propias = escriturasDelCambioEn(codigoSinComentarios(UNICO_ESCRITOR_DEL_CAMBIO));
    expect(propias).toContain("planCambioProgramado.create");
    expect(propias).toContain("planCambioProgramado.deleteMany");
  });
});

describe("SL-24 · R6, R29 — el árbol real", () => {
  it("ningún archivo de `lib/` ni de `app/` borra un plan ni edita o borra su rastro", () => {
    const hallazgos = ARCHIVOS.flatMap((a) => borradosDePlanEn(codigoSinComentarios(a)).map((h) => `${a}: ${h}`));
    expect(
      hallazgos,
      "un plan se ARCHIVA, no se borra (R6); `plan_rastro` solo se añade (R29)",
    ).toEqual([]);
  });

  it("solo `PlanesRepository` escribe `plan_cambio_programado`", () => {
    const hallazgos = ARCHIVOS.filter((a) => a !== UNICO_ESCRITOR_DEL_CAMBIO).flatMap((a) =>
      escriturasDelCambioEn(codigoSinComentarios(a)).map((h) => `${a}: ${h}`),
    );
    expect(
      hallazgos,
      "programar, reemplazar, cancelar y aplicar van en la transacción de `PlanesRepository`, con su rastro",
    ).toEqual([]);
  });
});
