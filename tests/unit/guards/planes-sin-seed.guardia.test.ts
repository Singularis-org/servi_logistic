import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

/**
 * SL-24 · T8 (design §11; R32) — GUARDIA: LA SEMILLA NO CREA PLANES NI ASIGNACIONES.
 *
 * Una empresa nace sin plan (sin límites), y cada test que necesita un plan lo crea. Si
 * `pnpm run db:seed` sembrara planes, topes o asignaciones, los tests pasarían por datos que la app
 * nunca tendría, y una base de despliegue nacería con empresas topadas sin que nadie lo decidiera.
 *
 * El archivo se lee del script `db:seed` de `package.json`, no de una ruta escrita aquí: si la
 * semilla cambia de archivo, la guardia la sigue. También se leen los módulos locales que la semilla
 * importa directamente: un plan escondido en un helper es el mismo plan.
 */

const RAIZ = path.resolve(__dirname, "../../..");

/**
 * Los delegados de Prisma de las tablas del plan, sus nombres SQL y la columna de asignación
 * (`organizacion.plan_id` / `planId`). Cada nombre se acota con bordes de identificador para no
 * casar con `plantillaMensaje` ni `plantilla_estado`.
 */
const NOMBRA_PLANES =
  /(?<![A-Za-z0-9_])(plan|planId|planTopeRol|planModulo|planRastro|planCambioProgramado|plan_id|plan_tope_rol|plan_modulo|plan_rastro|plan_cambio_programado)(?![A-Za-z0-9_])/;

function nombraPlanes(fuente: string): boolean {
  return NOMBRA_PLANES.test(quitarComentarios(fuente));
}

function archivoDeLaSemilla(): string {
  const pkg = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const m = /\b(scripts\/[\w./-]+\.ts)\b/.exec(pkg.scripts["db:seed"] ?? "");
  if (!m) throw new Error(`no se encuentra el archivo de "db:seed": ${pkg.scripts["db:seed"]}`);
  return m[1];
}

/** Los imports locales (`@/…` o relativos) de un fuente, resueltos a archivo `.ts` desde la raíz. */
function importsLocales(rel: string, fuente: string): string[] {
  const salida: string[] = [];
  for (const [, origen] of quitarComentarios(fuente).matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
    let base: string | null = null;
    if (origen.startsWith("@/")) base = origen.slice(2);
    else if (origen.startsWith(".")) base = path.posix.join(path.posix.dirname(rel), origen);
    if (!base) continue;
    const candidato = [`${base}.ts`, `${base}/index.ts`].find((c) => existsSync(path.join(RAIZ, c)));
    if (candidato) salida.push(candidato);
  }
  return salida;
}

describe("SL-24 · R32 — la semilla no crea planes ni asignaciones", () => {
  const semilla = archivoDeLaSemilla();
  const fuente = readFileSync(path.join(RAIZ, semilla), "utf8");
  const importados = importsLocales(semilla, fuente);

  it("control positivo: db:seed es scripts/seed-catalogos.ts y siembra catálogos de verdad", () => {
    expect(semilla).toBe("scripts/seed-catalogos.ts");
    expect(quitarComentarios(fuente)).toMatch(/ROLES_SEED/);
    expect(importados).toContain("lib/types/roles.ts");
  });

  it("ni la semilla ni lo que importa nombran plan, planTopeRol, planModulo ni plan_id", () => {
    const culpables = [semilla, ...importados].filter((rel) =>
      nombraPlanes(readFileSync(path.join(RAIZ, rel), "utf8")),
    );
    expect(culpables).toEqual([]);
  });

  it("CONTRAPRUEBA: la escritura por modelo, por SQL o por asignación la pone roja", () => {
    expect(nombraPlanes(`await prisma.plan.create({ data: { nombre: "Básico" } });`)).toBe(true);
    expect(nombraPlanes(`await tx.planTopeRol.createMany({ data });`)).toBe(true);
    expect(nombraPlanes(`await tx.planModulo.createMany({ data });`)).toBe(true);
    expect(nombraPlanes(`await prisma.organizacion.update({ where: { id }, data: { planId } });`)).toBe(true);
    expect(nombraPlanes(`await prisma.$executeRawUnsafe('UPDATE "organizacion" SET "plan_id" = $1');`)).toBe(true);
    expect(nombraPlanes(`await prisma.$executeRawUnsafe('INSERT INTO "plan_tope_rol" …');`)).toBe(true);
  });

  it("CONTRAPRUEBA: la cita en un comentario y los nombres vecinos NO la ponen roja", () => {
    expect(nombraPlanes(`// aquí no se siembra ningún plan (SL-24 R32)\nconst a = 1;`)).toBe(false);
    expect(nombraPlanes(`await prisma.plantillaMensaje.findMany();`)).toBe(false);
    expect(nombraPlanes(`await prisma.organizacion.findMany();`)).toBe(false);
  });
});
