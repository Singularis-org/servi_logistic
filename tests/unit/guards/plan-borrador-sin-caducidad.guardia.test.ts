import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { codigoSinComentarios } from "@/tests/fixtures/sin-comentarios";

/**
 * SLT-129 · T7 (design §7; R15) — GUARDIA: UN BORRADOR DE PLAN NO CADUCA.
 *
 * Solo lo borran descartarlo, confirmarlo (los dos en `PlanesRepository`) o el borrado en cascada del plan del
 * cambio. Por eso:
 * - `DELETE FROM "plan_borrador"`, `TRUNCATE "plan_borrador"` y `planBorrador.delete*` solo en `PlanesRepository`;
 * - ningún archivo de trabajos o crons (`lib/planes/jobs-*.ts`, `app/api/cron/**`) nombra la tabla ni el delegado.
 *
 * Barrido ESTÁTICO de `lib/` y `app/` sin comentarios, como `planes-sin-borrado`. Los detectores son puros para que
 * la contraprueba los ejerza sobre texto en memoria: una guardia estática rota no falla, calla.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOLES = ["lib", "app"];
const UNICO_QUE_BORRA = "lib/repositories/PlanesRepository.ts";

/** Los borrados de `plan_borrador`, por delegado o por SQL. */
export function borradosDeBorradorEn(codigo: string): string[] {
  const hallazgos: string[] = [];
  for (const m of codigo.matchAll(/(?<![A-Za-z0-9_])planBorrador\s*\.\s*(delete|deleteMany)\s*\(/g)) {
    hallazgos.push(`planBorrador.${m[1]}`);
  }
  for (const m of codigo.matchAll(/\b(DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+"?plan_borrador"?(?![A-Za-z0-9_])/gi)) {
    hallazgos.push(`${m[1].toUpperCase().replace(/\s+/g, " ")} "plan_borrador"`);
  }
  return hallazgos;
}

/** Cualquier mención de la tabla o del delegado: en un trabajo o un cron, ninguna vale. */
export function mencionesDelBorradorEn(codigo: string): string[] {
  return [...codigo.matchAll(/(?<![A-Za-z0-9_])(plan_borrador|planBorrador)(?![A-Za-z0-9_])/g)].map((m) => m[1]);
}

/** Los archivos de trabajos y crons (design §7). */
export function esTrabajoOCron(relativo: string): boolean {
  return /^lib\/planes\/jobs-[^/]+\.ts$/.test(relativo) || relativo.startsWith("app/api/cron/");
}

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) fuentes(completo, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(completo);
  }
  return acc;
}

const ARCHIVOS = ARBOLES.flatMap((a) => fuentes(path.join(RAIZ, a))).map((a) =>
  path.relative(RAIZ, a).split(path.sep).join("/"),
);

describe("SLT-129 · R15 — los detectores se prueban a sí mismos", () => {
  const SANO = `
    await tx.$queryRaw\`SELECT "id" FROM "plan_borrador" WHERE "id" = \${id} FOR UPDATE\`;
    await tx.planBorrador.findMany({});
    await tx.planBorradorX.deleteMany({});
    await tx.plan.update({ where: { id }, data: { archivadoAt: new Date() } });`;

  it("CONTRAPRUEBA (control positivo): leer y bloquear NO es borrar", () => {
    expect(borradosDeBorradorEn(SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA: un DELETE fuera de PlanesRepository SE DETECTA, por SQL y por delegado", () => {
    expect(borradosDeBorradorEn(`await tx.$executeRaw\`DELETE FROM "plan_borrador" WHERE "updated_at" < now()\`;`)).toEqual([
      'DELETE FROM "plan_borrador"',
    ]);
    expect(borradosDeBorradorEn(`$executeRawUnsafe('truncate table plan_borrador')`)).toEqual(['TRUNCATE TABLE "plan_borrador"']);
    expect(borradosDeBorradorEn("prisma.planBorrador\n  .deleteMany({ where: { updatedAt: { lt } } })")).toEqual([
      "planBorrador.deleteMany",
    ]);
    expect(borradosDeBorradorEn(`await tx.planBorrador.delete({ where: { id } });`)).toEqual(["planBorrador.delete"]);
    const ajeno = { "lib/services/Limpieza.ts": `await tx.$executeRaw\`DELETE FROM "plan_borrador"\`;` };
    const hallazgos = Object.entries(ajeno)
      .filter(([a]) => a !== UNICO_QUE_BORRA)
      .flatMap(([a, c]) => borradosDeBorradorEn(c).map((h) => `${a}: ${h}`));
    expect(hallazgos).toEqual(['lib/services/Limpieza.ts: DELETE FROM "plan_borrador"']);
  });

  it("CONTRAPRUEBA: plan_borrador en un cron o un trabajo SE DETECTA", () => {
    expect(esTrabajoOCron("app/api/cron/purga-borradores/route.ts")).toBe(true);
    expect(esTrabajoOCron("lib/planes/jobs-cambio-plan.ts")).toBe(true);
    expect(esTrabajoOCron("lib/repositories/PlanesRepository.ts")).toBe(false);
    expect(mencionesDelBorradorEn(`await prisma.planBorrador.findMany({});`)).toEqual(["planBorrador"]);
    expect(mencionesDelBorradorEn(`SELECT 1 FROM "plan_borrador"`)).toEqual(["plan_borrador"]);
    expect(mencionesDelBorradorEn(`await prisma.plan.findMany({}); const planBorradorX = 1;`)).toEqual([]);
  });
});

describe("SLT-129 · R15 — el barrido no está vacío", () => {
  it("lib/ y app/ tienen fuentes, y hay trabajos y crons que barrer", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(200);
    expect(ARCHIVOS.filter(esTrabajoOCron).length).toBeGreaterThan(5);
  });

  it("control positivo sobre el árbol real: PlanesRepository SÍ borra borradores (descartar y confirmar)", () => {
    expect(ARCHIVOS).toContain(UNICO_QUE_BORRA);
    const propios = borradosDeBorradorEn(codigoSinComentarios(UNICO_QUE_BORRA));
    expect(propios).toContain('DELETE FROM "plan_borrador"');
    expect(propios).toContain("planBorrador.deleteMany");
  });
});

describe("SLT-129 · R15 — el árbol real", () => {
  it("solo PlanesRepository borra plan_borrador", () => {
    const hallazgos = ARCHIVOS.filter((a) => a !== UNICO_QUE_BORRA).flatMap((a) =>
      borradosDeBorradorEn(codigoSinComentarios(a)).map((h) => `${a}: ${h}`),
    );
    expect(hallazgos, "un borrador no caduca: solo lo borran descartar y confirmar, en PlanesRepository (R15)").toEqual([]);
  });

  it("ningún trabajo ni cron nombra plan_borrador", () => {
    const hallazgos = ARCHIVOS.filter(esTrabajoOCron).flatMap((a) =>
      mencionesDelBorradorEn(codigoSinComentarios(a)).map((h) => `${a}: ${h}`),
    );
    expect(hallazgos, "ningún trabajo ni cron borra ni vence borradores (R15)").toEqual([]);
  });
});
