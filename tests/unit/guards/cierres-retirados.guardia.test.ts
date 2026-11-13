import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import * as columnasCierreDia from "@/app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas";
import * as desglosePago from "@/app/(app)/cierres-admin/_components/desglose-pago";

/**
 * SLT-115 «Retirar los componentes de cierre sustituidos» — R400, R404, R405, R408.
 *
 * GUARDIA: LO RETIRADO DEL CIERRE NO VUELVE.
 *
 * - R400: las tres colas viejas de comprobantes (sustituidas por `ColaCierres`) y su contenedor
 *   común no existen, y ningún archivo de `app/`, `components/`, `lib/`, `tests/` ni `e2e/` las
 *   importa (`import`, `import type`, `export … from`, `import()`, `vi.mock`), ni con alias `@/`
 *   ni con ruta relativa.
 * - R404: `cierre-dia-descarga-columnas.ts` exporta EXACTAMENTE lo que tiene consumidor vivo. Los
 *   cinco catálogos por resultado los dejó sin uso SLT-109 (su R256).
 * - R405: `desglose-pago.ts` ya no exporta `desgloseDescarga` (solo lo usaban esos catálogos).
 * - R408: control positivo (el barrido lee de verdad) y contraprueba (el detector ve cada forma).
 *
 * Las rutas retiradas se declaran aquí y en ningún otro sitio: la guardia se excluye a sí misma.
 *
 * Mientras T4 no borre los cuatro archivos, los dos casos de R400 van con `it.fails`: se ESPERA que
 * fallen. Cuando T4 los borre, `it.fails` se pondrá ROJO por sí solo, y T4 debe cambiarlos a `it`.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const ESTA_GUARDIA = "tests/unit/guards/cierres-retirados.guardia.test.ts";

/** R400: los cuatro módulos retirados, sin extensión y relativos a la raíz. */
const MODULOS_RETIRADOS = [
  "app/(app)/cierres-admin/_components/CierresAdminHistoricoLista",
  "app/(app)/cierres-admin/_components/CierresBodegaResueltosLista",
  "app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista",
  "app/(app)/cierres-admin/_components/ListaComprobantes",
] as const;

const CARPETAS_BARRIDAS = ["app", "components", "lib", "tests", "e2e"] as const;

const EXTENSIONES_DE_CODIGO = /\.(tsx?|jsx?|mjs|cjs)$/;

const AVISO =
  "SLT-115 retiró las colas viejas de comprobantes: las sustituye `ColaCierres`. Lo que aún " +
  "tenía consumidor (descargas, etiquetas de paginación, tipos de página) vive en el módulo que lo usa.";

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

/** Los especificadores de módulo que cita un fuente, en cualquiera de las formas de R400. */
function especificadores(texto: string): string[] {
  const fuente = texto.replace(/\r\n/g, "\n");
  const patrones = [
    // import X from "…", import { … } from "…", import type { … } from "…", export … from "…"
    /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
    // import "…" (efecto lateral)
    /\bimport\s*["']([^"']+)["']/g,
    // import("…"), también dentro de `typeof import("…")`
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    // vi.mock("…"), vi.doMock("…"), vi.importActual("…"), vi.importMock("…")
    /\bvi\.(?:mock|doMock|importActual|importMock)\s*(?:<[^>]*>)?\s*\(\s*["']([^"']+)["']/g,
  ];
  const salida: string[] = [];
  for (const patron of patrones) {
    for (const m of fuente.matchAll(patron)) salida.push(m[1]);
  }
  return salida;
}

/** Ruta relativa a la raíz, sin extensión, a la que apunta `spec` desde `archivo`; o `null`. */
function resolver(archivo: string, spec: string): string | null {
  let ruta: string;
  if (spec.startsWith("@/")) ruta = spec.slice(2);
  else if (spec.startsWith(".")) ruta = path.posix.join(path.posix.dirname(archivo), spec);
  else return null;
  return path.posix.normalize(ruta).replace(EXTENSIONES_DE_CODIGO, "");
}

/** Hallazgos `archivo -> especificador` de un fuente que importa algo retirado. */
function hallazgos(archivo: string, texto: string): string[] {
  const retirados = new Set<string>(MODULOS_RETIRADOS);
  return especificadores(texto)
    .filter((spec) => {
      const destino = resolver(archivo, spec);
      return destino !== null && retirados.has(destino);
    })
    .map((spec) => `${archivo} -> ${spec}`);
}

const ARCHIVOS_POR_CARPETA = Object.fromEntries(
  CARPETAS_BARRIDAS.map((carpeta) => [carpeta, archivosDeCodigoBajo(carpeta)]),
) as Record<(typeof CARPETAS_BARRIDAS)[number], string[]>;

const ARCHIVOS_BARRIDOS = Object.values(ARCHIVOS_POR_CARPETA)
  .flat()
  .filter((archivo) => archivo !== ESTA_GUARDIA);

describe("SLT-115 (R408) — autocomprobación del detector", () => {
  it("control positivo: barre más de 50 archivos de app/ y más de 200 de tests/, sin incluirse", () => {
    expect(ARCHIVOS_POR_CARPETA.app.length).toBeGreaterThan(50);
    expect(ARCHIVOS_POR_CARPETA.tests.length).toBeGreaterThan(200);
    // Se ve a sí misma en el recorrido, pero no entra en el barrido: declara las rutas.
    expect(ARCHIVOS_POR_CARPETA.tests).toContain(ESTA_GUARDIA);
    expect(ARCHIVOS_BARRIDOS).not.toContain(ESTA_GUARDIA);
  });

  it("contraprueba: da hallazgo, con archivo y especificador, para cada forma de R400", () => {
    const enApp = "app/(app)/cierres-admin/_components/CierresAdminModule.tsx";
    const enTests = "tests/components/Muestra.test.tsx";
    const casos: { archivo: string; fuente: string; esperado: string }[] = [
      {
        archivo: enApp,
        fuente:
          'import {\n  VACIO_HISTORICO,\n} from "@/app/(app)/cierres-admin/_components/CierresAdminHistoricoLista";',
        esperado: `${enApp} -> @/app/(app)/cierres-admin/_components/CierresAdminHistoricoLista`,
      },
      {
        archivo: enApp,
        fuente: 'import type { CierresBodegaResueltosPagina } from "./CierresBodegaResueltosLista";',
        esperado: `${enApp} -> ./CierresBodegaResueltosLista`,
      },
      {
        archivo: enApp,
        fuente: 'export { ListaComprobantes } from "./ListaComprobantes.tsx";',
        esperado: `${enApp} -> ./ListaComprobantes.tsx`,
      },
      {
        archivo: enTests,
        fuente:
          'const m = await import("../../app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista");',
        esperado: `${enTests} -> ../../app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista`,
      },
      {
        archivo: enTests,
        fuente:
          'vi.mock("@/app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista", () => ({}));',
        esperado: `${enTests} -> @/app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista`,
      },
      {
        archivo: enTests,
        fuente:
          'import "@/app/(app)/cierres-admin/_components/ListaComprobantes";\r\nconst x = 1;\r\n',
        esperado: `${enTests} -> @/app/(app)/cierres-admin/_components/ListaComprobantes`,
      },
    ];
    for (const { archivo, fuente, esperado } of casos) {
      expect(hallazgos(archivo, fuente), fuente).toEqual([esperado]);
    }
  });

  it("contraprueba: no marca un homónimo, un comentario ni otra carpeta", () => {
    const enApp = "app/(app)/cierres-admin/_components/CierresAdminModule.tsx";
    expect(
      hallazgos(enApp, 'import { X } from "./CierresAdminHistoricoListaNueva";'),
    ).toEqual([]);
    expect(hallazgos(enApp, "// antes vivía en CierresAdminHistoricoLista.tsx")).toEqual([]);
    // Misma basename en otra carpeta: no es el módulo retirado.
    expect(
      hallazgos("components/private/cierres/Algo.tsx", 'import { L } from "./ListaComprobantes";'),
    ).toEqual([]);
  });
});

describe("SLT-115 (R400) — las colas viejas de comprobantes siguen retiradas", () => {
  // `it.fails` hasta T4: los cuatro archivos aún existen. T4 los cambia a `it`.
  it.fails("ninguno de los cuatro archivos existe", () => {
    const presentes = MODULOS_RETIRADOS.map((ruta) => `${ruta}.tsx`).filter((ruta) =>
      existsSync(path.join(RAIZ, ruta)),
    );
    expect(presentes, `${AVISO}\nExisten: ${presentes.join(", ")}`).toEqual([]);
  });

  it.fails("ningún archivo de app/, components/, lib/, tests/ ni e2e/ los importa", () => {
    const culpables = ARCHIVOS_BARRIDOS.flatMap((archivo) =>
      hallazgos(archivo, readFileSync(path.join(RAIZ, archivo), "utf8")),
    );
    expect(culpables, `${AVISO}\nLos importan:\n${culpables.join("\n")}`).toEqual([]);
  });
});

describe("SLT-115 (R404, R405) — columnas de descarga sin consumidor, retiradas", () => {
  it("R404: cierre-dia-descarga-columnas.ts exporta exactamente lo que tiene consumidor", () => {
    // Literal a mano: GANANCIA_COL lo usa el detalle de un cierre; los otros tres, «Cierres
    // solicitados» de /cierre-dia (CierreDiaModule).
    expect(Object.keys(columnasCierreDia).sort()).toEqual([
      "AMBITO_DESCARGA_DIA_CIERRES_PASADOS",
      "COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS",
      "GANANCIA_COL",
      "filaDescargaDiaCierrePasado",
    ]);
  });

  it("R405: desglose-pago.ts no exporta desgloseDescarga y sigue exportando lo vivo", () => {
    const exportados = Object.keys(desglosePago);
    expect(exportados).not.toContain("desgloseDescarga");
    expect(exportados).toContain("desglosePantalla");
    expect(exportados).toContain("montoPorMetodo");
  });
});
