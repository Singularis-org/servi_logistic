import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contraste, cssSinComentarios, token, utilidad } from "../../fixtures/contraste";

/**
 * FICHA 458 — F3 del recorrido final (`progress/recorrido_458-final.md`).
 *
 * axe midió 2,99:1 en los enlaces `text-primary` (#f26419) sobre la página (#f7f8fc) de las
 * pantallas nuevas de la wallet: «Volver a los saldos…» de los tres estados de cuenta y el «Ver»
 * del origen en el extracto. El arreglo es `text-primary-strong`, un alias de `--chart-11-strong`
 * (el tono más oscuro del naranja que ya existía, con su par por tema).
 *
 * Se declara como GUARDIA porque lee archivos (el CSS y el fuente), no módulos importados.
 * Cubre dos cosas: que el token llegue a 4,5 en los DOS temas, y que los cuatro enlaces lo usen.
 *
 * SL-8 — con la marca, `--primary` es `#111111` en claro y `#FFD000` en oscuro, y la tinta de
 * marca de un enlace ya no necesita un tono aparte: `--color-primary-strong` pasa a ser el alias
 * de `--primary` (`specs/SL-8-marca-logo-paleta-fuente/design.md`, D3). Re-medido el 2026-10-22:
 * 17.60 sobre la página y 18.88 sobre la tarjeta en claro; 12.84 y 11.60 en oscuro.
 *
 * La medición histórica de axe se queda como control del método, con el fondo de entonces
 * (`#f7f8fc`) escrito como literal: el fondo de hoy (`#F7F7F5`) ya no es el que midió axe, y
 * medir contra él daría otro número sin que la aritmética hubiera cambiado.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const AA_TEXTO = 4.5;

describe("458/F3 — el enlace en color de marca cumple AA sobre la página", () => {
  it("la herramienta reproduce el 2,99 que midió axe con el token viejo (control del método)", () => {
    // Si esto no diera ~2,99, la aritmética no es la de axe y lo de abajo no vale nada. Los dos
    // hexes son los de la medición de axe, no los del CSS de hoy (ver la cabecera).
    expect(contraste("#f26419", "#f7f8fc")).toBeCloseTo(2.99, 1);
  });

  it("`--color-primary-strong` es el alias de `--primary` (SL-8)", () => {
    expect(cssSinComentarios).toMatch(/--color-primary-strong:\s*var\(--primary\)\s*;/);
  });

  it.each(["claro", "oscuro"] as const)(
    "tema %s: `text-primary-strong` sobre --background y sobre --card ≥ 4,5",
    (tema) => {
      // `utilidad()` resuelve el alias con el mismo lector de los tokens: es la tinta que pinta la
      // clase en ese tema.
      const tinta = utilidad(tema, "primary-strong");
      expect(contraste(tinta, token(tema, "background"))).toBeGreaterThanOrEqual(AA_TEXTO);
      expect(contraste(tinta, token(tema, "card"))).toBeGreaterThanOrEqual(AA_TEXTO);
    },
  );

  it.each([
    "app/(app)/wallet/tiendas/[tiendaId]/page.tsx",
    "app/(app)/wallet/mensajeros/[mensajeroId]/page.tsx",
    "app/(app)/wallet/satelites/[zonaId]/page.tsx",
    "components/shared/estado-cuenta/EstadoCuenta.tsx",
  ])("%s: sus enlaces usan text-primary-strong y ninguno el text-primary a secas", (archivo) => {
    const fuente = readFileSync(path.join(RAIZ, archivo), "utf8");
    expect(fuente).toContain("text-primary-strong");
    // `text-primary` seguido de espacio o comilla: el naranja base como tinta.
    expect(fuente).not.toMatch(/\btext-primary(?=[\s"'`])/);
  });
});
