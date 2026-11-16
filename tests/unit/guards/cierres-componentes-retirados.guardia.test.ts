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
 *
 * SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero» la amplía con
 * cinco bloques `SLT-174 · R…`, con las mismas piezas y su autocomprobación:
 *
 * - R659: `CascadaDinero.tsx` entra en los módulos retirados; sus dos tipos viven en
 *   `cascadas-bodega.ts`.
 * - R658/R663: los 20 rótulos retirados de `cierre-labels.ts` no se exportan, no se re-exportan
 *   desde `cierre-detalle-shared.tsx` y no se nombran en código; `CASCADA_CENTRAL_TITULO` sí sigue.
 * - R650: `ganaLaTienda` en `app/`, `components/` y `lib/` solo como función (llamada, declaración
 *   o import desde `ingreso-empresa`), nunca como campo.
 * - R661: `ParteDeTienda` se declara en `lib/types/parte-de-tienda.ts`, sin imports, y los demás lo
 *   piden de ahí.
 * - R662: `CascadasCierreMensajero` solo aparece en el comentario histórico de `CierresAdminModule`.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const ESTA_GUARDIA = "tests/unit/guards/cierres-componentes-retirados.guardia.test.ts";

const COMPONENTES = "app/(app)/cierres-admin/_components";

/**
 * R640 (SLT-172) y R659 (SLT-174): los módulos retirados, sin extensión y relativos a la raíz.
 */
const MODULOS_RETIRADOS = [
  `${COMPONENTES}/CascadasCierreMensajero`,
  `${COMPONENTES}/DesglosePorTienda`,
  `${COMPONENTES}/CascadaDinero`,
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
    // SLT-174: `./CascadaDinero` pasó a ser un módulo retirado; el vecino vivo es `./cascadas-bodega`.
    expect(hallazgos(`${COMPONENTES}/X.tsx`, 'import { C } from "./cascadas-bodega";')).toEqual([]);
    expect(hallazgos(`${COMPONENTES}/X.tsx`, 'import { L } from "./cierre-labels";')).toEqual([]);
    expect(
      hallazgos(`${COMPONENTES}/X.tsx`, '// import { D } from "./DesglosePorTienda";\nconst a = 1;'),
    ).toEqual([]);
    expect(hallazgos("tests/x.test.ts", 'const ruta = "DesglosePorTienda.tsx";')).toEqual([]);
  });

  it.each([`${COMPONENTES}/DesglosePorTienda.tsx`, `${COMPONENTES}/CascadaDinero.tsx`])(
    "restaurar `%s` se detecta",
    (restaurado) => {
      expect(retiradosPresentes((ruta) => ruta === restaurado)).toEqual([restaurado]);
    },
  );

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

// ---------------------------------------------------------------------------------------------
// SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero»
// ---------------------------------------------------------------------------------------------

const CIERRE_DETALLE_SHARED = `${COMPONENTES}/cierre-detalle-shared.tsx`;
const INGRESO_EMPRESA = "lib/utils/ingreso-empresa.ts";
const PARTE_DE_TIENDA = "lib/types/parte-de-tienda.ts";
const CIERRES_ADMIN_MODULE = `${COMPONENTES}/CierresAdminModule.tsx`;

/** R658 (los 8 primeros) y R663 (los 12 restantes): rótulos retirados de `cierre-labels.ts`. */
const NOMBRES_RETIRADOS_SLT174 = [
  "GANA_LA_TIENDA_LABEL",
  "GANA_LA_TIENDA_NOTA",
  "GANA_LA_TIENDA_NOTA_MODELO_NUEVO",
  "GANA_LA_TIENDA_NEGATIVO_NOTA",
  "COBRADO_SOBRE_RECAUDADO_LABEL",
  "COBRADO_SOBRE_RECAUDADO_NOTA",
  "IVA_FACTURADO_NOTA",
  "FLETE_NO_ENTREGADAS_NOTA",
  "PAGO_TIENDA_HOY_NOTA",
  "PAGO_TIENDA_HOY_NOTA_MODELO_NUEVO",
  "FLETE_RECHAZO_YA_COBRADO_NOTA",
  "FLETE_RECHAZO_AUN_NO_COBRADO_NOTA",
  "FLETE_RECHAZO_NO_SE_COBRARA_NOTA",
  "FLETE_RECHAZO_NO_DEDUCIBLE_NOTA",
  "NETO_EMPRESA_NOTA",
  "NETO_EMPRESA_NOTA_MODELO_NUEVO",
  "NETO_EMPRESA_NEGATIVO_NOTA",
  "CASCADA_DUENO_TITULO",
  "CASCADA_FACTURA_TIENDA_TITULO",
  "CASCADA_NETO_EMPRESA_TITULO",
] as const;

/** R658/R663: los nombres retirados que un fuente nombra como identificador, sin comentarios. */
function rotulosRetiradosNombrados(texto: string): string[] {
  const codigo = quitarComentarios(texto.replace(/\r\n/g, "\n"));
  return NOMBRES_RETIRADOS_SLT174.filter((nombre) => new RegExp(`\\b${nombre}\\b`).test(codigo));
}

/** R650: el módulo de la función, relativo a la raíz y sin extensión. */
const MODULO_INGRESO_EMPRESA = "lib/utils/ingreso-empresa";

/** Los `import { … } from "…"` (también `import type`) de un fuente sin comentarios. */
const IMPORT_CON_LLAVES = /\bimport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/**
 * R650: las apariciones de `ganaLaTienda` que NO son la función. Es legítima si le sigue `(`
 * (llamada o `export function ganaLaTienda(`), o si está dentro de las llaves de un import desde
 * `ingreso-empresa`. Cualquier otra (`.ganaLaTienda`, clave, cadena, desestructuración, shorthand)
 * es hallazgo, con su línea.
 */
function aliasGanaLaTienda(archivo: string, texto: string): string[] {
  const codigo = quitarComentarios(texto.replace(/\r\n/g, "\n"));
  const rangosDeImport: [number, number][] = [];
  for (const m of codigo.matchAll(IMPORT_CON_LLAVES)) {
    if (resolver(archivo, m[2]) !== MODULO_INGRESO_EMPRESA) continue;
    const inicio = (m.index ?? 0) + m[0].indexOf("{");
    rangosDeImport.push([inicio, inicio + m[1].length + 1]);
  }
  const salida: string[] = [];
  for (const m of codigo.matchAll(/\bganaLaTienda\b/g)) {
    const i = m.index ?? 0;
    if (/^\s*\(/.test(codigo.slice(i + m[0].length))) continue;
    if (rangosDeImport.some(([a, b]) => i > a && i < b)) continue;
    salida.push(`${archivo}:${codigo.slice(0, i).split("\n").length}`);
  }
  return salida;
}

/** R661: el fuente, sin comentarios, tiene algún `import` o `require(`. */
function tieneImports(texto: string): boolean {
  const codigo = quitarComentarios(texto.replace(/\r\n/g, "\n"));
  return /\bimport\b|\brequire\s*\(/.test(codigo);
}

/** R661: declara `interface ParteDeTienda` (o un `type ParteDeTienda =`). */
function declaraParteDeTienda(texto: string): boolean {
  const codigo = quitarComentarios(texto.replace(/\r\n/g, "\n"));
  return /\binterface\s+ParteDeTienda\b|\btype\s+ParteDeTienda\s*=/.test(codigo);
}

/** R661: importa `ParteDeTienda` de `lib/types/parte-de-tienda` (por alias o ruta relativa). */
function importaParteDeTiendaDelModuloDeTipos(archivo: string, texto: string): boolean {
  const codigo = quitarComentarios(texto.replace(/\r\n/g, "\n"));
  for (const m of codigo.matchAll(IMPORT_CON_LLAVES)) {
    if (resolver(archivo, m[2]) !== "lib/types/parte-de-tienda") continue;
    if (/\bParteDeTienda\b/.test(m[1])) return true;
  }
  return false;
}

/** R662: cuántas veces nombra cada fuente `CascadasCierreMensajero`, comentarios INCLUIDOS. */
function censoCascadasCierreMensajero(
  archivos: readonly string[],
  leerArchivo: (ruta: string) => string,
): Record<string, number> {
  const censo: Record<string, number> = {};
  for (const archivo of archivos) {
    const n = (leerArchivo(archivo).match(/CascadasCierreMensajero/g) ?? []).length;
    if (n > 0) censo[archivo] = n;
  }
  return censo;
}

const ARCHIVOS_DE_PRODUCCION = [
  ...ARCHIVOS_POR_CARPETA.app,
  ...ARCHIVOS_POR_CARPETA.components,
  ...ARCHIVOS_POR_CARPETA.lib,
];

describe("SLT-174 — autocomprobación de los detectores nuevos", () => {
  it("R659: el import de tipo que existía de verdad se detecta", () => {
    expect(
      hallazgos(`${COMPONENTES}/cascadas-bodega.ts`, 'import type { LineaCascada } from "./CascadaDinero";'),
    ).toHaveLength(1);
    expect(
      hallazgos("tests/components/X.test.tsx", `vi.mock("@/${COMPONENTES}/CascadaDinero", () => ({}));`),
    ).toHaveLength(1);
  });

  it.each(NOMBRES_RETIRADOS_SLT174)("R658/R663: `%s` inyectado se detecta", (nombre) => {
    const labels = leer(CIERRE_LABELS);
    expect(exportsDeValor(`${labels}\nexport const ${nombre} = "x";\n`)).toContain(nombre);
    expect(exportsDeValor(`${labels}\nexport { a as ${nombre} };\n`)).toContain(nombre);
    const shared = leer(CIERRE_DETALLE_SHARED);
    expect(exportsDeValor(`${shared}\nexport { ${nombre} };\n`)).toContain(nombre);
    expect(rotulosRetiradosNombrados(`import { ${nombre} } from "./cierre-labels";`)).toEqual([nombre]);
  });

  it("R658/R663: un comentario o un nombre más largo no cuentan", () => {
    expect(rotulosRetiradosNombrados("// GANA_LA_TIENDA_LABEL se retiró\nconst a = 1;")).toEqual([]);
    expect(rotulosRetiradosNombrados("const NETO_EMPRESA_NOTA_X = 1;")).toEqual([]);
  });

  it.each([
    ["acceso", "lib/x.ts", "const v = fila.ganaLaTienda;"],
    ["clave de interfaz", "lib/x.ts", "interface D {\n  ganaLaTienda: string;\n}"],
    ["clave opcional", "lib/x.ts", "interface D {\n  ganaLaTienda?: string;\n}"],
    ["clave de columna", "lib/x.ts", 'const C = { key: "ganaLaTienda", header: "x" };'],
    ["desestructuración", "lib/x.ts", "const { pagoTienda, ganaLaTienda } = r;"],
    ["shorthand", "lib/x.ts", "const o = { pagoTienda, ganaLaTienda };"],
    ["CRLF", "lib/x.ts", "interface D {\r\n  ganaLaTienda: string;\r\n}"],
  ])("R650: el alias como %s se detecta", (_forma, archivo, fuente) => {
    expect(aliasGanaLaTienda(archivo, fuente)).toHaveLength(1);
  });

  it.each([
    ["llamada", "lib/x.ts", "const p = ganaLaTienda(a, b);"],
    ["llamada con espacio", "lib/x.ts", "const p = ganaLaTienda (a, b);"],
    ["declaración", INGRESO_EMPRESA, "export function ganaLaTienda(a: string, b: string): string {}"],
    ["import por alias", "lib/x.ts", 'import {\n  netoEmpresa,\n  ganaLaTienda,\n} from "@/lib/utils/ingreso-empresa";'],
    ["import relativo", "lib/utils/x.ts", 'import { ganaLaTienda } from "./ingreso-empresa";'],
    ["comentario", "lib/x.ts", "// antes: fila.ganaLaTienda\nconst a = 1;"],
  ])("R650: la función como %s no es hallazgo", (_forma, archivo, fuente) => {
    expect(aliasGanaLaTienda(archivo, fuente)).toEqual([]);
  });

  it("R650: el mismo nombre importado de OTRO módulo no se salva por estar entre llaves", () => {
    expect(aliasGanaLaTienda("lib/x.ts", 'import { ganaLaTienda } from "@/lib/utils/otro";')).toHaveLength(1);
  });

  it("R661: una copia de la interfaz en ingreso-empresa se detecta", () => {
    const real = leer(INGRESO_EMPRESA);
    expect(declaraParteDeTienda(`${real}\ninterface ParteDeTienda {\n  tiendaId: string;\n}\n`)).toBe(true);
    expect(declaraParteDeTienda(`${real}\nexport type ParteDeTienda = { tiendaId: string };\n`)).toBe(true);
  });

  it("R661: un import en el módulo de tipos se detecta", () => {
    const real = leer(PARTE_DE_TIENDA);
    expect(tieneImports(`import type { Prisma } from "@prisma/client";\n${real}`)).toBe(true);
    expect(tieneImports(`${real}\nconst p = require("x");\n`)).toBe(true);
  });

  it("R662: un comentario nuevo que lo presenta como consumidor vivo se detecta", () => {
    const sucio = censoCascadasCierreMensajero([CIERRES_ADMIN_MODULE, CIERRE_DETALLE_SHARED], (ruta) =>
      ruta === CIERRE_DETALLE_SHARED ? `${leer(ruta)}\n// lo pinta \`CascadasCierreMensajero\`\n` : leer(ruta),
    );
    expect(sucio).toEqual({ [CIERRES_ADMIN_MODULE]: 1, [CIERRE_DETALLE_SHARED]: 1 });
  });
});

describe("SLT-174 · R659 — CascadaDinero retirado y sus tipos en cascadas-bodega", () => {
  it("el archivo no existe y nadie lo cita", () => {
    expect(existsSync(path.join(RAIZ, `${COMPONENTES}/CascadaDinero.tsx`))).toBe(false);
    const citas = ARCHIVOS_BARRIDOS.flatMap((archivo) => hallazgos(archivo, leer(archivo))).filter((h) =>
      h.includes("CascadaDinero"),
    );
    expect(citas, "un fuente sigue citando CascadaDinero").toEqual([]);
  });

  it("`SignoCascada` y `LineaCascada` se exportan como tipos desde cascadas-bodega", () => {
    const codigo = quitarComentarios(leer(CASCADAS_BODEGA));
    expect(codigo).toMatch(/\bexport\s+type\s+SignoCascada\s*=/);
    expect(codigo).toMatch(/\bexport\s+interface\s+LineaCascada\b/);
    // Y siguen sin contar como valor (R641 de SLT-172).
    expect(exportsDeValor(leer(CASCADAS_BODEGA))).toEqual(["lineasCascadaCentral"]);
  });
});

describe("SLT-174 · R658/R663 — los 20 rótulos retirados no vuelven", () => {
  it("cierre-labels no exporta ninguno y sigue exportando `CASCADA_CENTRAL_TITULO`", () => {
    const exportados = new Set(exportsDeValor(leer(CIERRE_LABELS)));
    expect(exportados.size, "el lector de exports no encontró nada en cierre-labels").toBeGreaterThan(50);
    expect(NOMBRES_RETIRADOS_SLT174.filter((nombre) => exportados.has(nombre))).toEqual([]);
    expect(exportados.has("CASCADA_CENTRAL_TITULO")).toBe(true);
  });

  it("cierre-detalle-shared no re-exporta ninguno y sigue re-exportando `CASCADA_CENTRAL_TITULO`", () => {
    const exportados = new Set(exportsDeValor(leer(CIERRE_DETALLE_SHARED)));
    expect(exportados.size, "el lector de exports no encontró nada en cierre-detalle-shared").toBeGreaterThan(30);
    expect(exportados.has("*")).toBe(false);
    expect(NOMBRES_RETIRADOS_SLT174.filter((nombre) => exportados.has(nombre))).toEqual([]);
    expect(exportados.has("CASCADA_CENTRAL_TITULO")).toBe(true);
  });

  it("ningún fuente de app/, components/, lib/ ni tests/ los nombra en código", () => {
    const encontrados = ARCHIVOS_BARRIDOS.flatMap((archivo) =>
      rotulosRetiradosNombrados(leer(archivo)).map((nombre) => `${archivo} -> ${nombre}`),
    );
    expect(encontrados).toEqual([]);
  });
});

describe("SLT-174 · R650 — `ganaLaTienda` solo como función", () => {
  it("el barrido leyó archivos que llaman a la función (no-vacuidad)", () => {
    const llamadores = ARCHIVOS_DE_PRODUCCION.filter((archivo) =>
      /\bganaLaTienda\s*\(/.test(quitarComentarios(leer(archivo))),
    );
    expect(llamadores).toContain(INGRESO_EMPRESA);
    expect(llamadores.length).toBeGreaterThan(1);
  });

  it("ningún fuente de app/, components/ ni lib/ lo usa como campo", () => {
    const encontrados = ARCHIVOS_DE_PRODUCCION.flatMap((archivo) => aliasGanaLaTienda(archivo, leer(archivo)));
    expect(encontrados, "`ganaLaTienda` volvió como campo o clave").toEqual([]);
  });
});

describe("SLT-174 · R661 — `ParteDeTienda` vive en un módulo de tipos sin imports", () => {
  it("lib/types/parte-de-tienda.ts existe, no importa nada y declara la interfaz", () => {
    expect(existsSync(path.join(RAIZ, PARTE_DE_TIENDA))).toBe(true);
    const texto = leer(PARTE_DE_TIENDA);
    expect(tieneImports(texto)).toBe(false);
    expect(quitarComentarios(texto)).toMatch(/\bexport\s+interface\s+ParteDeTienda\b/);
  });

  it("ingreso-empresa no la copia: la importa del módulo de tipos y la re-exporta", () => {
    const texto = leer(INGRESO_EMPRESA);
    expect(declaraParteDeTienda(texto)).toBe(false);
    expect(importaParteDeTiendaDelModuloDeTipos(INGRESO_EMPRESA, texto)).toBe(true);
    expect(quitarComentarios(texto)).toMatch(/\bexport\s+type\s*\{[^}]*\bParteDeTienda\b[^}]*\}/);
  });

  it("cierre-labels la pide al módulo de tipos", () => {
    expect(importaParteDeTiendaDelModuloDeTipos(CIERRE_LABELS, leer(CIERRE_LABELS))).toBe(true);
    expect(declaraParteDeTienda(leer(CIERRE_LABELS))).toBe(false);
  });
});

describe("SLT-174 · R662 — `CascadasCierreMensajero` solo en su comentario histórico", () => {
  it("la foto, escrita a mano, es una sola línea en CierresAdminModule y dice «Sustituye»", () => {
    expect(ARCHIVOS_DE_PRODUCCION).toContain(CIERRES_ADMIN_MODULE);
    expect(censoCascadasCierreMensajero(ARCHIVOS_DE_PRODUCCION, leer)).toEqual({
      "app/(app)/cierres-admin/_components/CierresAdminModule.tsx": 1,
    });
    const linea = leer(CIERRES_ADMIN_MODULE)
      .split(/\r?\n/)
      .find((l) => l.includes("CascadasCierreMensajero"));
    expect(linea).toContain("Sustituye");
  });
});
