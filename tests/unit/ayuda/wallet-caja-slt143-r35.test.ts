import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// SLT-143 R35 — la ayuda de la wallet (`docs/ayuda/oficina/wallet-caja.md`, sección «Lo que la empresa
// debe a la plataforma») explica el pago registrado por la plataforma y la anulación de un pago
// confirmado por la plataforma. Se lee el .md tal cual, como las guardias 461 y 467.
//
// Comprobado a mano el 2026-11-19: quitar «Registrado por la plataforma» de la ayuda pone esto en rojo.

const RAIZ = path.resolve(__dirname, "../../..");
const AYUDA = path.join(RAIZ, "docs/ayuda/oficina/wallet-caja.md");
const SECCION = "## Lo que la empresa debe a la plataforma";

/** Une los saltos de línea del .md para buscar frases que el texto parte en dos renglones. */
function plano(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function leerAyuda(): string {
  return readFileSync(AYUDA, "utf8").replace(/\r\n/g, "\n");
}

/** Párrafos de la sección (incluye sus `###`), hasta el siguiente `## `. */
function parrafosDeLaSeccion(md: string): string[] {
  const inicio = md.indexOf(`\n${SECCION}\n`);
  if (inicio < 0) return [];
  const resto = md.slice(inicio + SECCION.length + 2);
  const fin = resto.search(/\n## /);
  const cuerpo = fin < 0 ? resto : resto.slice(0, fin);
  return cuerpo.split(/\n\s*\n/).map(plano).filter(Boolean);
}

function parrafoQueEmpiezaCon(parrafos: string[], arranque: string): string {
  const p = parrafos.find((x) => x.startsWith(arranque));
  expect(p, `falta el párrafo «${arranque}» en «${SECCION}»`).toBeDefined();
  return p as string;
}

describe("SLT-143 R35 — ayuda de la wallet: pagos de la plataforma", () => {
  const md = leerAyuda();
  const parrafos = parrafosDeLaSeccion(md);

  it("R35: la sección «Lo que la empresa debe a la plataforma» existe y tiene párrafos", () => {
    expect(parrafos.length).toBeGreaterThan(3);
  });

  it("R35: el pago registrado por la plataforma lleva marca, baja la caja y la deuda, y la empresa no lo anula", () => {
    const p = parrafoQueEmpiezaCon(parrafos, "**Pagos registrados por la plataforma.**");
    expect(p).toContain("**Registrado por la plataforma**");
    expect(p).toContain("la caja baja en el monto");
    expect(p).toContain("la deuda baja");
    expect(p).toContain("la empresa no puede anularlo");
  });

  it("R35: la plataforma puede anular un pago confirmado; el monto vuelve a la caja y la deuda sube", () => {
    const p = parrafoQueEmpiezaCon(parrafos, "**La plataforma puede anular un pago confirmado.**");
    expect(p).toContain("**Anulado por la plataforma**");
    expect(p).toContain("el monto vuelve a la caja");
    expect(p).toContain("la deuda sube en el monto");
  });

  it("R35: el frontmatter dice `actualizado:` con una fecha no anterior a la decisión (2026-11-19)", () => {
    const m = /^---\n[\s\S]*?^actualizado:\s*(\d{4}-\d{2}-\d{2})\s*$[\s\S]*?^---$/m.exec(md);
    expect(m, "falta `actualizado:` en el frontmatter").not.toBeNull();
    expect((m as RegExpExecArray)[1] >= "2026-11-19").toBe(true);
  });
});
