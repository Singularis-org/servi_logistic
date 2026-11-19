import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  htmlMarcador,
  nombreMarcador,
  type TipoMarcador,
} from "@/app/(app)/mis-asignaciones/_components/ruta-mapa-iconos";

import { contraste, paleta } from "../../fixtures/contraste";

// SLT-166 «PWA del mensajero: mapa de ruta» (R539, design §11) — el HTML de los marcadores.
//
// Dos cosas que el ojo no ve en un test de componente: que no quede ningún hex (los de antes,
// `#2563eb` y `#16a34a`, no son de la marca) y que cada `var()` apunte a una variable que EXISTE. Un
// `var(--navy)` —el nombre que sugería el diseño— no existe en `app/globals.css`: el navegador lo
// pinta transparente sin ningún error, y el marcador desaparece del mapa.

const RAIZ = path.resolve(__dirname, "../../..");
const CSS_APP = readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
// `--color-white` es del tema por defecto de Tailwind, que `globals.css` importa.
const CSS_TAILWIND = readFileSync(path.join(RAIZ, "node_modules/tailwindcss/theme.css"), "utf8");

const TIPOS: TipoMarcador[] = ["siguiente", "pendiente", "gestionada", "origen"];

function variables(html: string): string[] {
  return Array.from(html.matchAll(/var\((--[a-z0-9-]+)\)/g), (m) => m[1]!);
}

function definida(nombre: string): boolean {
  const decl = new RegExp(`(^|[\\s;{])${nombre}\\s*:`, "m");
  return decl.test(CSS_APP) || decl.test(CSS_TAILWIND);
}

describe("SLT-166 R539 — htmlMarcador", () => {
  it.each(TIPOS)("«%s»: ningún hex, solo variables de la paleta que existen", (tipo) => {
    const html = htmlMarcador(tipo, 7);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    const usadas = variables(html);
    expect(usadas.length).toBeGreaterThan(0);
    expect(usadas.filter((v) => !definida(v))).toEqual([]);
  });

  it("siguiente: Amarillo Señal con número negro y anillo", () => {
    const html = htmlMarcador("siguiente", 2);
    expect(html).toContain("background:var(--color-brand-light)");
    expect(html).toContain("color:var(--color-brand-dark)");
    expect(html).toContain("0 0 0 5px var(--color-brand-dark)");
    expect(html).toContain(">2<");
  });

  it("pendiente: negra con número blanco; sin posición, «·» como la tarjeta", () => {
    const html = htmlMarcador("pendiente", 4);
    expect(html).toContain("background:var(--color-brand-dark)");
    expect(html).toContain("color:var(--color-white)");
    expect(html).toContain(">4<");
    expect(htmlMarcador("pendiente", null)).toContain(">·<");
  });

  it("gestionada: gris con check, sin número", () => {
    const html = htmlMarcador("gestionada", 5);
    expect(html).toContain("background:var(--color-asfalto-4)");
    expect(html).toContain(">✓<");
    expect(html).not.toContain(">5<");
  });

  it("origen: el punto con borde blanco y la etiqueta «Tú»", () => {
    const html = htmlMarcador("origen");
    expect(html).toContain("border:3px solid var(--color-white)");
    expect(html).toContain(">Tú<");
  });

  // SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview» (punto 4): el «Tú»
  // (11 px, 700) iba blanco sobre el verde de éxito, 2.54:1. En Negro Servi sobre ese verde pasa 4.5:1.
  it("origen: «Tú» en Negro Servi sobre el verde, legible (≥ 4.5:1)", () => {
    const html = htmlMarcador("origen");
    const etiqueta = /<span aria-hidden="true" style="([^"]*)">Tú<\/span>/.exec(html)?.[1] ?? "";
    expect(etiqueta).toContain("background:var(--color-success)");
    expect(etiqueta).toContain("color:var(--color-brand-dark)");
    expect(etiqueta).not.toContain("color:var(--color-white)");
    expect(contraste(paleta("brand-dark"), paleta("success"))).toBeGreaterThanOrEqual(4.5);
  });

  it("las paradas ocupan 44 × 44 px de área táctil", () => {
    expect(htmlMarcador("pendiente", 1)).toContain("width:44px;height:44px");
  });

  it("el nombre accesible es la posición, sin datos de la orden", () => {
    expect(nombreMarcador("siguiente", 3)).toBe("Parada 3, siguiente");
    expect(nombreMarcador("pendiente", null)).toBe("Parada sin posición");
    expect(htmlMarcador("pendiente", 3)).toContain('<span class="sr-only">Parada 3</span>');
  });
});
