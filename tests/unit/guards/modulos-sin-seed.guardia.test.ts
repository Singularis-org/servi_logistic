import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

/**
 * SL-23 · T4 (design §8; R28) — GUARDIA: LA SEMILLA NO ENCIENDE MÓDULOS.
 *
 * Una empresa nueva nace solo con el núcleo (R6), y la decisión cerrada de SL-17 D10 dice que cada test
 * crea su empresa y enciende lo que necesita. Si `pnpm run db:seed` escribiera activaciones, los tests
 * pasarían por datos que la app nunca tendría, y una base de despliegue nacería con módulos encendidos.
 *
 * El archivo se lee del script `db:seed` de `package.json`, no de una ruta escrita aquí: si la semilla
 * cambia de archivo, la guardia la sigue. También se leen los módulos locales que la semilla importa
 * directamente: una activación escondida en un helper es la misma activación.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const NOMBRA_LA_TABLA = /\borganizacionModulo\b|\borganizacion_modulo\b/;

function nombraActivaciones(fuente: string): boolean {
  return NOMBRA_LA_TABLA.test(quitarComentarios(fuente));
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

describe("SL-23 · R28 — la semilla no crea activaciones de módulos", () => {
  const semilla = archivoDeLaSemilla();
  const fuente = readFileSync(path.join(RAIZ, semilla), "utf8");
  const importados = importsLocales(semilla, fuente);

  it("control positivo: db:seed es scripts/seed-catalogos.ts y siembra catálogos de verdad", () => {
    expect(semilla).toBe("scripts/seed-catalogos.ts");
    expect(quitarComentarios(fuente)).toMatch(/ROLES_SEED/);
    expect(importados).toContain("lib/types/roles.ts");
  });

  it("ni la semilla ni lo que importa nombran organizacionModulo / organizacion_modulo", () => {
    const culpables = [semilla, ...importados].filter((rel) =>
      nombraActivaciones(readFileSync(path.join(RAIZ, rel), "utf8")),
    );
    expect(culpables).toEqual([]);
  });

  it("autocomprobación: la escritura por modelo o por SQL la pone roja; la cita en un comentario no", () => {
    expect(nombraActivaciones(`await prisma.organizacionModulo.createMany({ data });`)).toBe(true);
    expect(nombraActivaciones(`await prisma.$executeRawUnsafe('INSERT INTO "organizacion_modulo" …');`)).toBe(true);
    expect(nombraActivaciones(`// aquí no se siembra organizacion_modulo (SL-23 R28)\nconst a = 1;`)).toBe(false);
    expect(nombraActivaciones(`await prisma.organizacion.findMany();`)).toBe(false);
  });
});
