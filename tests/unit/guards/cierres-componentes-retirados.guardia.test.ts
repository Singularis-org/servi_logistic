import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";
import { LLAMADAS_PROHIBIDAS_EN_DINERO } from "@/tests/fixtures/money-safe";

/**
 * SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso» (R640, R641,
 * R644) — lee el árbol REAL:
 *
 * - R640: `CascadasCierreMensajero.tsx` y `DesglosePorTienda.tsx` no existen, y ningún fuente de
 *   `app/`, `components/`, `lib/` ni `tests/` los cita por ninguna vía (alias `@/`, ruta relativa,
 *   `export … from`, `import()`, `require`, `vi.mock`).
 * - R641: `cascadas-bodega.ts` solo exporta como valor `lineasCascadaCentral`.
 * - R644: `cierre-labels.ts` no exporta ninguno de los textos que solo usaba el desglose retirado.
 *
 * Cada detector tiene su contraprueba con un infractor inyectado EN MEMORIA: sin ella, un barrido
 * que no leyera nada estaría igual de verde.
 *
 * Además rescata (T1) la vigilancia money-safe de `cierre-labels.ts`, que solo hacían los dos tests
 * borrados con los componentes.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const ESTA_GUARDIA = "tests/unit/guards/cierres-componentes-retirados.guardia.test.ts";

const COMPONENTES = "app/(app)/cierres-admin/_components";

/** R640: los dos módulos retirados, sin extensión y relativos a la raíz. */
const MODULOS_RETIRADOS = [
  `${COMPONENTES}/CascadasCierreMensajero`,
  `${COMPONENTES}/DesglosePorTienda`,
] as const;

const CARPETAS_BARRIDAS = ["app", "components", "lib", "tests"] as const;

const EXTENSIONES_DE_CODIGO = /\.(tsx?|jsx?|mjs|cjs)$/;

const CASCADAS_BODEGA = `${COMPONENTES}/cascadas-bodega.ts`;
const CIERRE_LABELS = `${COMPONENTES}/cierre-labels.ts`;

/** R644: lo que `cierre-labels.ts` ya no exporta. */
const NOMBRES_RETIRADOS_DE_LABELS = [
  "DESGLOSE_POR_TIENDA_TITULO",
  "DESGLOSE_POR_TIENDA_NOTA",
  "DESGLOSE_POR_TIENDA_NOTA_MODELO_NUEVO",
  "DESGLOSE_NO_REPARTIDO_NOTA",
  "DESGLOSE_NO_REPARTIDO_NOTA_MODELO_NUEVO",
  "TIENDA_RECAUDADO_LABEL",
  "TIENDA_PAGO_HOY_LABEL",
  "TIENDA_GANA_TOTAL_LABEL",
  "nombreAccesibleDeTienda",
] as const;

/** Rutas relativas (con `/`) de los archivos de código bajo `carpeta`, recursivo. */
function archivosDeCodigoBajo(carpeta: string): string[] {
  const absoluta = path.join(RAIZ, carpeta);
  if (!existsSync(absoluta)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(absoluta, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile()) continue;
    if (!EXTENSIONES_DE_CODIGO.test(entrada.name)) continue;
    const ruta = path.relative(RAIZ, path.join(entrada.parentPath, entrada.name));
    salida.push(ruta.split(path.sep).join("/"));
  }
  return salida;
}

/** Los especificadores de módulo que cita un fuente, en cualquiera de las formas de R640. */
function especificadores(texto: string): string[] {
  const fuente = quitarComentarios(texto.replace(/\r\n/g, "\n"));
  const patrones = [
    // import X from "…", import { … } from "…", import type …, export … from "…", export * from "…"
    /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
    // import "…" (efecto lateral)
    /\bimport\s*["']([^"']+)["']/g,
    // import("…"), también dentro de `typeof import("…")`
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    // require("…")
    /\brequire\s*\(\s*["']([^"']+)["']/g,
    // vi.mock("…"), vi.doMock("…"), vi.importActual("…"), vi.importMock("…")
    /\bvi\.(?:mock|doMock|importActual|importMock)\s*(?:<[^>]*>)?\s*\(\s*["']([^"']+)["']/g,
  ];
  const salida: string[] = [];
  for (const patron of patrones) {
    for (const m of fuente.matchAll(patron)) salida.push(m[1]);
  }
  return salida;
}

/** Ruta relativa a la raíz, sin extensión ni `/index`, a la que apunta `spec` desde `archivo`. */
function resolver(archivo: string, spec: string): string | null {
  let ruta: string;
  if (spec.startsWith("@/")) ruta = spec.slice(2);
  else if (spec.startsWith(".")) ruta = path.posix.join(path.posix.dirname(archivo), spec);
  else return null;
  return path.posix
    .normalize(ruta)
    .replace(EXTENSIONES_DE_CODIGO, "")
    .replace(/\/index$/, "");
}

/** Hallazgos `archivo -> especificador` de un fuente que cita un módulo retirado. */
function hallazgos(archivo: string, texto: string): string[] {
  const retirados = new Set<string>(MODULOS_RETIRADOS);
  return especificadores(texto)
    .filter((spec) => {
      const destino = resolver(archivo, spec);
      return destino !== null && retirados.has(destino);
    })
    .map((spec) => `${archivo} -> ${spec}`);
}

/** Los módulos retirados que siguen en disco, con cualquier extensión de código. */
function retiradosPresentes(existe: (ruta: string) => boolean): string[] {
  return MODULOS_RETIRADOS.flatMap((modulo) =>
    [".tsx", ".ts", ".jsx", ".js"].map((ext) => `${modulo}${ext}`).filter((ruta) => existe(ruta)),
  );
}

/** Los nombres que un fuente exporta como VALOR (función, constante, clase, enum). */
function exportsDeValor(texto: string): string[] {
  const fuente = quitarComentarios(texto.replace(/\r\n/g, "\n"));
  const nombres: string[] = [];
  for (const m of fuente.matchAll(
    /\bexport\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    nombres.push(m[1]);
  }
  // `export { a, b as c }` y `export { a } from "…"`: cuenta el nombre exportado, salvo los `type`.
  for (const m of fuente.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const parte of m[1].split(",")) {
      const limpio = parte.trim();
      if (!limpio || /^type\s/.test(limpio)) continue;
      const alias = limpio.split(/\s+as\s+/);
      nombres.push((alias[1] ?? alias[0]).trim());
    }
  }
  // `export * from "…"` reexporta todo lo de otro módulo: se marca como comodín.
  if (/\bexport\s*\*\s*(?:as\s+\w+\s*)?from\b/.test(fuente)) nombres.push("*");
  return nombres;
}

function leer(ruta: string): string {
  return readFileSync(path.join(RAIZ, ruta), "utf8");
}

const ARCHIVOS_POR_CARPETA = Object.fromEntries(
  CARPETAS_BARRIDAS.map((carpeta) => [carpeta, archivosDeCodigoBajo(carpeta)]),
) as Record<(typeof CARPETAS_BARRIDAS)[number], string[]>;

const ARCHIVOS_BARRIDOS = Object.values(ARCHIVOS_POR_CARPETA)
  .flat()
  .filter((archivo) => archivo !== ESTA_GUARDIA);

describe("SLT-172 — autocomprobación de los detectores", () => {
  it("el barrido lee archivos de verdad en las cuatro carpetas, sin incluirse", () => {
    expect(ARCHIVOS_POR_CARPETA.app.length).toBeGreaterThan(50);
    expect(ARCHIVOS_POR_CARPETA.components.length).toBeGreaterThan(20);
    expect(ARCHIVOS_POR_CARPETA.lib.length).toBeGreaterThan(50);
    expect(ARCHIVOS_POR_CARPETA.tests.length).toBeGreaterThan(200);
    expect(ARCHIVOS_POR_CARPETA.tests).toContain(ESTA_GUARDIA);
    expect(ARCHIVOS_BARRIDOS).not.toContain(ESTA_GUARDIA);
    // Y lee el árbol de verdad: el consumidor vivo del módulo de al lado sale en el barrido.
    expect(ARCHIVOS_BARRIDOS).toContain("components/private/cierres/detalle/detalle-cierre-vista.ts");
  });

  it.each([
    ["alias", "tests/x.test.tsx", `import { CascadasCierreMensajero } from "@/${COMPONENTES}/CascadasCierreMensajero";`],
    ["alias con extensión", "lib/x.ts", `import { D } from "@/${COMPONENTES}/DesglosePorTienda.tsx";`],
    ["ruta relativa hermana", `${COMPONENTES}/Otro.tsx`, 'import { DesglosePorTienda } from "./DesglosePorTienda";'],
    ["ruta relativa desde tests", "tests/components/X.test.tsx", `import { C } from "../../${COMPONENTES}/CascadasCierreMensajero";`],
    ["import type", "components/x.ts", `import type { DesglosePorTiendaProps } from "@/${COMPONENTES}/DesglosePorTienda";`],
    ["export * from", `${COMPONENTES}/barril.ts`, 'export * from "./CascadasCierreMensajero";'],
    ["export { } from", "components/x.ts", `export { DesglosePorTienda } from "@/${COMPONENTES}/DesglosePorTienda";`],
    ["import()", "app/x.tsx", `const M = await import("@/${COMPONENTES}/CascadasCierreMensajero");`],
    ["require", "lib/x.ts", `const M = require("../${COMPONENTES}/DesglosePorTienda");`],
    ["vi.mock", "tests/x.test.ts", `vi.mock("@/${COMPONENTES}/DesglosePorTienda", () => ({}));`],
    ["CRLF", "tests/x.test.ts", `import {\r\n  D,\r\n} from "@/${COMPONENTES}/DesglosePorTienda";\r\n`],
  ])("un import sintético por %s se detecta", (_forma, archivo, fuente) => {
    expect(hallazgos(archivo, fuente)).toHaveLength(1);
  });

  it("no da falsos positivos: un vecino de nombre parecido, un comentario o un texto suelto", () => {
    expect(hallazgos(`${COMPONENTES}/X.tsx`, 'import { C } from "./CascadaDinero";')).toEqual([]);
    expect(hallazgos(`${COMPONENTES}/X.tsx`, 'import { L } from "./cierre-labels";')).toEqual([]);
    expect(
      hallazgos(`${COMPONENTES}/X.tsx`, '// import { D } from "./DesglosePorTienda";\nconst a = 1;'),
    ).toEqual([]);
    expect(hallazgos("tests/x.test.ts", 'const ruta = "DesglosePorTienda.tsx";')).toEqual([]);
  });

  it("restaurar uno de los dos archivos se detecta", () => {
    const restaurado = `${COMPONENTES}/DesglosePorTienda.tsx`;
    expect(retiradosPresentes((ruta) => ruta === restaurado)).toEqual([restaurado]);
  });

  it("`export function lineasCascadaDueno` inyectado en cascadas-bodega se detecta", () => {
    const real = leer(CASCADAS_BODEGA);
    const sucio = `${real}\nexport function lineasCascadaDueno(): never[] {\n  return [];\n}\n`;
    expect(exportsDeValor(sucio)).toEqual(["lineasCascadaCentral", "lineasCascadaDueno"]);
    expect(exportsDeValor(`${real}\nexport * from "./otro";\n`)).toContain("*");
  });

  it.each(NOMBRES_RETIRADOS_DE_LABELS)("`%s` inyectado en cierre-labels se detecta", (nombre) => {
    const real = leer(CIERRE_LABELS);
    const sucio = /^[A-Z]/.test(nombre)
      ? `${real}\nexport const ${nombre} = "x";\n`
      : `${real}\nexport function ${nombre}(): string {\n  return "x";\n}\n`;
    expect(exportsDeValor(sucio)).toContain(nombre);
    expect(exportsDeValor(`${real}\nexport { a as ${nombre} };\n`)).toContain(nombre);
  });
});

describe("SLT-172 · R640 — los dos componentes retirados no vuelven", () => {
  it("ninguno de los dos archivos existe", () => {
    expect(retiradosPresentes((ruta) => existsSync(path.join(RAIZ, ruta)))).toEqual([]);
  });

  it("ningún fuente de app/, components/, lib/ ni tests/ los cita", () => {
    const encontrados = ARCHIVOS_BARRIDOS.flatMap((archivo) => hallazgos(archivo, leer(archivo)));
    expect(encontrados, "un fuente sigue citando un componente retirado por SLT-172").toEqual([]);
  });
});

describe("SLT-172 · R641 — cascadas-bodega solo exporta la cascada central", () => {
  it("su único export de valor es `lineasCascadaCentral`", () => {
    expect(exportsDeValor(leer(CASCADAS_BODEGA))).toEqual(["lineasCascadaCentral"]);
  });
});

describe("SLT-172 · R644 — cierre-labels ya no exporta los textos del desglose retirado", () => {
  it("ninguno de los nueve nombres sale exportado", () => {
    const exportados = new Set(exportsDeValor(leer(CIERRE_LABELS)));
    expect(exportados.size, "el lector de exports no encontró nada en cierre-labels").toBeGreaterThan(50);
    expect(exportados.has("*"), "cierre-labels reexporta un módulo entero").toBe(false);
    expect(NOMBRES_RETIRADOS_DE_LABELS.filter((nombre) => exportados.has(nombre))).toEqual([]);
    // Y la marca que se mudó aquí (R642) sí sale.
    expect(exportados.has("marcaDeVariasTiendas")).toBe(true);
  });
});

describe("SLT-172 · T1 — cierre-labels sigue money-safe (vigilancia rescatada)", () => {
  it("no convierte ni un importe a número", () => {
    const codigo = quitarComentarios(leer(CIERRE_LABELS));
    expect(codigo.length, "cierre-labels salió vacío: el censo no está leyendo nada").toBeGreaterThan(500);
    for (const prohibida of LLAMADAS_PROHIBIDAS_EN_DINERO) {
      expect(codigo, `cierre-labels usa ${prohibida.source} sobre un importe`).not.toMatch(prohibida);
    }
  });
});
