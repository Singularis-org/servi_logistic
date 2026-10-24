import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// =================================================================================================
// GUARDIA — SL-41: un archivo "use server" no reexporta tipos con una lista local `export { … }`
// =================================================================================================
//
// `export type { RequestContext };` en `lib/actions/password-reset.ts` (un import con `type` inline
// reexportado SIN `from`) hizo que el transform de server actions de Turbopack (Next 16.2) lo
// contara como un export de runtime: el módulo entero reventó al evaluarse con «ReferenceError:
// RequestContext is not defined» y `/recuperar-contrasena` dio 500 en sus cuatro actions. `tsc`,
// eslint y vitest no pasan por ese compilador, así que la suite siguió verde; solo lo vio el E2E.
// Esta guardia lo mide en la fuente: en todo archivo de `lib/` y `app/` cuya primera sentencia es
// "use server", ninguna lista `export type { … }` ni `export { type … }` sin `from`. La forma con
// `from` (`lib/actions/geografia.ts`) sí compila y queda fuera. Declarar el tipo en el archivo
// (`export type X = …`) también vale.
//
// Control de NO-VACUIDAD y CONTRAPRUEBA (la línea que tumbó la pantalla cae).

const RAIZ = path.resolve(__dirname, "../../..");

function recorrer(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...recorrer(ruta));
    else if (/\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

function esUseServer(fuente: string): boolean {
  return /^\s*["']use server["'];?/.test(quitarComentarios(fuente));
}

/** Las listas `export { … }` sin `from` que reexportan algún tipo, como texto normalizado. */
export function reexportsLocalesDeTipos(fuente: string): string[] {
  const codigo = quitarComentarios(fuente);
  const hallazgos: string[] = [];
  for (const m of codigo.matchAll(/^export\s+(type\s+)?\{([^}]*)\}\s*(from\b)?/gm)) {
    if (m[3]) continue;
    const esDeTipos = Boolean(m[1]) || /(^|[,\s])type\s+\w/.test(m[2]);
    if (esDeTipos) hallazgos.push(m[0].replace(/\s+/g, " ").trim());
  }
  return hallazgos;
}

const ARCHIVOS = [...recorrer(path.join(RAIZ, "lib")), ...recorrer(path.join(RAIZ, "app"))]
  .map((abs) => [path.relative(RAIZ, abs).split(path.sep).join("/"), readFileSync(abs, "utf8")] as const)
  .filter(([, fuente]) => esUseServer(fuente));

describe("SL-41 — un archivo \"use server\" no reexporta tipos sin `from`", () => {
  it("control de NO-VACUIDAD: el censo ve los archivos \"use server\", incluido password-reset", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(50);
    expect(ARCHIVOS.map(([r]) => r)).toContain("lib/actions/password-reset.ts");
  });

  it("ninguna lista `export type { … }` ni `export { type … }` sin `from`", () => {
    const infractores = ARCHIVOS.flatMap(([ruta, fuente]) => reexportsLocalesDeTipos(fuente).map((e) => `${ruta}: ${e}`));
    expect(infractores).toEqual([]);
  });

  it("CONTRAPRUEBA: la línea que tumbó /recuperar-contrasena cae; la forma con `from` y la declaración no", () => {
    const antes = [
      '"use server";',
      'import { type RequestContext } from "@/lib/actions/_shared/contexto-peticion";',
      "export type { RequestContext };",
      "export { type Otro, valor };",
      "export {",
      "  type Multilinea,",
      "};",
      'export type { ConFrom } from "@/lib/types/x";',
      "export type Declarado = { a: string };",
      "// export type { SoloEnUnComentario };",
    ].join("\n");
    expect(reexportsLocalesDeTipos(antes)).toEqual([
      "export type { RequestContext }",
      "export { type Otro, valor }",
      "export { type Multilinea, }",
    ]);
  });
});
