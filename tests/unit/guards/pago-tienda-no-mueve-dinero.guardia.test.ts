import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» · R631 — GUARDIA: LAS CIFRAS
 * DE PRESENTACION DEL CIERRE NO ENTRAN EN UN SERVICIO QUE MUEVE DINERO.
 *
 * Desde SLT-169, «Se le paga hoy a la tienda» (`pagoTienda`) resta TODO lo facturado, flete por
 * rechazo incluido. Es solo presentacion: el libro de la tienda ya debita ese flete al aprobar
 * (`WalletTiendaFeedService`, por `derivarIngresoOrden`). Si un servicio que escribe dinero leyera
 * `pagoTienda`, `cifrasDelCierre` o `partesPorTienda`, el flete por rechazo se cobraria DOS veces.
 *
 * Por eso ningun archivo de `lib/services/` que escribe en el libro de la tienda, en la caja o en
 * las liquidaciones puede:
 *  - importar `cifras-cierre` ni `cifras-cierre-bodega` (por alias, por ruta relativa, estatico,
 *    dinamico o con `require`), ni
 *  - nombrar en su codigo (fuera de comentarios) `pagoTiendaEmpresa`, `ganaLaTienda` ni
 *    `partesPorTienda`, que son las derivaciones de presentacion de `ingreso-empresa.ts`.
 *
 * `derivarIngresoOrden`, `paraLaCentral` y demas funciones de `ingreso-empresa.ts` siguen
 * permitidas: son las que el libro usa hoy y esta ficha no las cambia.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const SERVICIOS = path.join(RAIZ, "lib", "services");

/** Servicios que escriben dinero, por nombre exacto. */
const POR_NOMBRE = new Set([
  "LiquidacionService.ts",
  "CobroTiendaService.ts",
  "RechazoTiendaCobroService.ts",
  "RechazoTiendaService.ts",
  "CierreBodegaService.ts",
]);

/** Y todos los feeds del libro (`Wallet*FeedService`) y de la caja (`Caja*FeedService`). */
const POR_PATRON = [/^Wallet\w*FeedService\.ts$/, /^Caja\w*FeedService\.ts$/];

const MODULOS_PROHIBIDOS = ["cifras-cierre", "cifras-cierre-bodega"] as const;
const NOMBRES_PROHIBIDOS = ["pagoTiendaEmpresa", "ganaLaTienda", "partesPorTienda"] as const;

function esServicioDeDinero(nombre: string): boolean {
  return POR_NOMBRE.has(nombre) || POR_PATRON.some((re) => re.test(nombre));
}

/** Quita comentarios de bloque y de linea (lo bastante fino para estos archivos, sin parser). */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Lo que un texto de codigo importa o nombra de lo prohibido. Vacio = limpio. */
function infracciones(texto: string): string[] {
  const codigo = sinComentarios(texto);
  const salida: string[] = [];
  // Especificadores de modulo: `from "…"`, `import("…")`, `require("…")`, `import "…"`.
  const especificadores = [
    ...codigo.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'`]([^"'`]+)["'`]/g),
  ].map((m) => m[1]);
  for (const esp of especificadores) {
    const ultimo = esp.split("/").pop() ?? "";
    const base = ultimo.replace(/\.(ts|tsx|js|mjs)$/, "");
    if ((MODULOS_PROHIBIDOS as readonly string[]).includes(base)) salida.push(`importa ${esp}`);
  }
  for (const nombre of NOMBRES_PROHIBIDOS) {
    if (new RegExp(`\\b${nombre}\\b`).test(codigo)) salida.push(`nombra ${nombre}`);
  }
  return salida;
}

function serviciosDeDinero(): string[] {
  return readdirSync(SERVICIOS)
    .filter(esServicioDeDinero)
    .sort();
}

describe("SLT-169 R631 — las cifras de presentacion del cierre no entran donde se mueve dinero", () => {
  it("el barrido encuentra los servicios que escriben dinero (no pasa en verde por lista vacia)", () => {
    const archivos = serviciosDeDinero();
    // Los que el spec nombra tienen que existir: si uno se renombra, la guardia lo dice.
    for (const nombre of [
      "WalletTiendaFeedService.ts",
      "WalletFeedService.ts",
      "LiquidacionService.ts",
      "CobroTiendaService.ts",
      "RechazoTiendaCobroService.ts",
      "RechazoTiendaService.ts",
      "CierreBodegaService.ts",
      "CajaPagoTiendaFeedService.ts",
    ]) {
      expect(existsSync(path.join(SERVICIOS, nombre)), nombre).toBe(true);
      expect(archivos).toContain(nombre);
    }
    expect(archivos.filter((a) => a.startsWith("Caja")).length).toBeGreaterThan(3);
  });

  it("ningun servicio que escribe dinero importa cifras-cierre ni nombra pagoTienda*/ganaLaTienda/partesPorTienda", () => {
    const culpables = serviciosDeDinero().flatMap((nombre) =>
      infracciones(readFileSync(path.join(SERVICIOS, nombre), "utf8")).map((i) => `${nombre}: ${i}`),
    );
    expect(culpables).toEqual([]);
  });

  describe("la guardia ve lo que vigila (si no, el verde no prueba nada)", () => {
    it("detecta el import por alias de cifras-cierre (mutacion M6)", () => {
      const texto = 'import { cifrasDelCierre } from "@/lib/utils/cifras-cierre";\n';
      expect(infracciones(texto)).toEqual(["importa @/lib/utils/cifras-cierre"]);
    });

    it("detecta la ruta relativa, el import dinamico y el require de cifras-cierre-bodega", () => {
      expect(infracciones('import { x } from "../utils/cifras-cierre-bodega";')).toHaveLength(1);
      expect(infracciones('const m = await import("@/lib/utils/cifras-cierre-bodega");')).toHaveLength(1);
      expect(infracciones('const m = require("../utils/cifras-cierre.ts");')).toHaveLength(1);
    });

    it("detecta los nombres de presentacion importados de ingreso-empresa", () => {
      const texto = `import {
  derivarIngresoOrden,
  ganaLaTienda,
} from "@/lib/utils/ingreso-empresa";
`;
      expect(infracciones(texto)).toEqual(["nombra ganaLaTienda"]);
      expect(infracciones("const p = pagoTiendaEmpresa(a, b, c);")).toEqual(["nombra pagoTiendaEmpresa"]);
      expect(infracciones("const p = partesPorTienda(gs);")).toEqual(["nombra partesPorTienda"]);
    });

    it("no confunde un comentario ni las funciones permitidas con una infraccion", () => {
      const texto = `// Esto NO lee ganaLaTienda ni cifras-cierre.
/* pagoTiendaEmpresa aparece solo aqui */
import { derivarIngresoOrden, paraLaCentral } from "@/lib/utils/ingreso-empresa";
`;
      expect(infracciones(texto)).toEqual([]);
    });
  });
});
