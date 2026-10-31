import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { codigoSinComentarios, quitarComentarios } from "../../fixtures/sin-comentarios";

// SLT-44 (T2.3; R1, design §2.2) — EL DOMINIO DE LA GEOGRAFIA ES PURO.
//
// LA REGLA, mecanicamente comprobable:
//
//   `lib/services/geografia-dominio.ts` solo importa `_shared/zona-colapso` y
//   `_shared/geografia-activa`. Nada de `@prisma/client`, `pg`, `@/lib/db/*` ni repositorios.
//   Y esos dos modulos tampoco importan Prisma ni `@/lib/db/*`.
//
// QUE SE PIERDE SI ESTO NO EXISTE. Un dominio que abre una consulta «solo para este caso» deja de
// poder probarse sin base, y la caché por peticion de `CatalogoGeograficoRepository` (R11) deja de
// ser la unica carga: cada llamada del dominio podria volver a leer, y con otro contexto de empresa.

const RAIZ = path.resolve(__dirname, "../../..");
const DOMINIO = "lib/services/geografia-dominio.ts";
const PERMITIDOS = new Set(["@/lib/repositories/_shared/zona-colapso", "@/lib/repositories/_shared/geografia-activa"]);
const COMPARTIDOS = ["lib/repositories/_shared/zona-colapso.ts", "lib/repositories/_shared/geografia-activa.ts"];

/** Cada especificador de modulo del codigo: `import … from`, `export … from`, `import()` y `require()`. */
export function modulosImportados(codigo: string): string[] {
  const patrones = [
    /\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patrones.flatMap((p) => [...codigo.matchAll(p)].map((m) => m[1]));
}

/** Un modulo que da acceso a la base: Prisma, el driver o la capa `lib/db`. */
function esDeBase(modulo: string): boolean {
  // `(lib/)?db` cubre `@/lib/db/x` y la ruta relativa desde `lib/` (`../../db/x`).
  return /^@prisma\//.test(modulo) || modulo === "pg" || /(^|\/)(lib\/)?db(\/|$)/.test(modulo);
}

/** Lo que el dominio no puede importar: todo lo que no sea una de las dos reglas compartidas. */
export function importsProhibidosDelDominio(codigo: string): string[] {
  return modulosImportados(codigo).filter((m) => !PERMITIDOS.has(m));
}

/** Lo que una regla compartida no puede importar: la base. */
export function importsDeBase(codigo: string): string[] {
  return modulosImportados(codigo).filter(esDeBase);
}

describe("SLT-44 R1 — el detector se prueba a si mismo", () => {
  const SANO = `
    import { activoEnCascada } from "@/lib/repositories/_shared/geografia-activa";
    import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";
    export function f() { return 1; }`;

  it("CONTRAPRUEBA (control positivo): las dos reglas compartidas no son hallazgo", () => {
    expect(modulosImportados(SANO)).toHaveLength(2);
    expect(importsProhibidosDelDominio(SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA: un texto que importa `@prisma/client` se detecta", () => {
    expect(importsProhibidosDelDominio(`${SANO}\nimport type { PrismaClient } from "@prisma/client";`)).toEqual([
      "@prisma/client",
    ]);
  });

  it("CONTRAPRUEBA: `@/lib/db/*`, un repositorio, `import()` y `require()` tambien", () => {
    const mutado = `${SANO}
      import { getPrismaClient } from "@/lib/db/prisma-client";
      import { GeoRepository } from "@/lib/repositories/GeoRepository";
      const m = await import("@/lib/db/contexto-empresa");
      const pg = require("pg");`;
    expect(importsProhibidosDelDominio(mutado)).toEqual([
      "@/lib/db/prisma-client",
      "@/lib/repositories/GeoRepository",
      "@/lib/db/contexto-empresa",
      "pg",
    ]);
  });

  it("CONTRAPRUEBA: una regla compartida que importa Prisma se detecta", () => {
    expect(importsDeBase(`import type { Prisma } from "@prisma/client";`)).toEqual(["@prisma/client"]);
    expect(importsDeBase(`import { x } from "../../db/prisma-client";`)).toEqual(["../../db/prisma-client"]);
  });

  it("un import nombrado en un comentario no cuenta: se mide sobre el codigo sin comentarios", () => {
    expect(importsProhibidosDelDominio(quitarComentarios(`// import { P } from "@prisma/client";\n${SANO}`))).toEqual(
      [],
    );
  });
});

describe("SLT-44 R1 — `geografia-dominio.ts` no toca la base", () => {
  it("el modulo existe y el barrido ve sus imports (anti-vacuidad)", () => {
    expect(existsSync(path.join(RAIZ, DOMINIO))).toBe(true);
    expect(modulosImportados(codigoSinComentarios(DOMINIO)).length).toBeGreaterThanOrEqual(2);
  });

  it("solo importa las dos reglas compartidas", () => {
    expect(
      importsProhibidosDelDominio(codigoSinComentarios(DOMINIO)),
      "el dominio de la geografia es puro (R1): recibe el catalogo y las asignaciones como argumentos. " +
        "La carga vive en `CatalogoGeograficoRepository`",
    ).toEqual([]);
  });

  it("las dos reglas compartidas tampoco importan Prisma ni `@/lib/db/*`", () => {
    for (const rel of COMPARTIDOS) {
      expect(importsDeBase(codigoSinComentarios(rel)), rel).toEqual([]);
    }
  });
});
