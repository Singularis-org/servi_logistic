import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// SLT-99 (design §5; R9) — el carrusel y el detalle de planes viven en `components/shared/planes/` y no saben de
// empresa: los monta «Mi plan» y los montará la página pública de SLT-116, sin sesión. Por eso nada de esa carpeta
// importa del servidor (`lib/actions`, `lib/services`, `lib/repositories`, `lib/auth`, `lib/db`, `next/headers`,
// `app/`) ni recibe un `organizacionId`. Lectura estática; el detector se prueba en las dos direcciones y el barrido
// tiene que encontrar los dos componentes, para que una carpeta vacía o un detector roto no pasen en verde.

const RAIZ = process.cwd();
const CARPETA = "components/shared/planes";

const PROHIBIDOS = [
  /^@\/lib\/actions(\/|$)/,
  /^@\/lib\/services(\/|$)/,
  /^@\/lib\/repositories(\/|$)/,
  /^@\/lib\/auth(\/|$)/,
  /^@\/lib\/db(\/|$)/,
  /^next\/headers$/,
  /^@\/app(\/|$)/,
  // Un relativo que sale de `components/` llega a `app/` o a `lib/`: tampoco.
  /^(\.\.\/){3,}/,
];

/** Los especificadores de `import … from "x"`, `export … from "x"`, `import("x")` y `require("x")`. */
function especificadores(fuente: string): string[] {
  const patrones = [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, /^\s*import\s+["']([^"']+)["']/gm];
  return patrones.flatMap((p) => [...fuente.matchAll(p)].map((m) => m[1]));
}

function importsProhibidos(fuente: string): string[] {
  return especificadores(fuente).filter((s) => PROHIBIDOS.some((p) => p.test(s)));
}

const ORGANIZACION_ID = /\borganizacionId\b/;

const archivos = readdirSync(path.join(RAIZ, CARPETA), { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
  .map((e) => path.relative(RAIZ, path.join(e.parentPath, e.name)).replaceAll("\\", "/"))
  .sort();
const leer = (archivo: string) => readFileSync(path.join(RAIZ, archivo), "utf8");

describe("R9 — la autocomprobación del barrido", () => {
  it("encuentra el carrusel y el detalle, y ningún archivo está vacío", () => {
    expect(archivos).toEqual(
      expect.arrayContaining([`${CARPETA}/CarruselDePlanes.tsx`, `${CARPETA}/DetalleDePlan.tsx`, `${CARPETA}/planes-vista.ts`]),
    );
    for (const a of archivos) expect(leer(a).length, a).toBeGreaterThan(0);
  });

  it("el detector marca cada import prohibido y deja pasar los permitidos", () => {
    const rojo = [
      'import { x } from "@/lib/actions/mi-plan";',
      'import type { I } from "@/lib/services/MiPlanCambioService";',
      'export { y } from "@/lib/repositories/PlanesRepository";',
      'import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";',
      'const p = await import("@/lib/db/prisma-client");',
      'import { cookies } from "next/headers";',
      'import { MiPlanModule } from "@/app/(app)/mi-plan/_components/MiPlanModule";',
      'import "../../../lib/db/prisma-client";',
    ].join("\n");
    expect(importsProhibidos(rojo)).toHaveLength(8);

    const verde = [
      'import { Button } from "@/components/ui/button";',
      'import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";',
      'import type { PlanVista } from "@/lib/types/planes";',
      'import { montoDelPeriodo } from "@/lib/planes/cobro";',
      'import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";',
      'import { TriangleAlert } from "lucide-react";',
      'import { x } from "./planes-vista";',
    ].join("\n");
    expect(especificadores(verde)).toHaveLength(7);
    expect(importsProhibidos(verde)).toEqual([]);
  });
});

describe("R9 — `components/shared/planes/` no depende de la empresa", () => {
  it.each(archivos)("%s no importa del servidor", (archivo) => {
    expect(importsProhibidos(leer(archivo))).toEqual([]);
  });

  it.each(archivos)("%s no recibe ni nombra un `organizacionId`", (archivo) => {
    expect(ORGANIZACION_ID.test(leer(archivo))).toBe(false);
  });
});
