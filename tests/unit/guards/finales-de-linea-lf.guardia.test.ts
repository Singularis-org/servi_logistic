import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";

// SL-10 (R1, D1) — lo que el gate EJECUTA o IMPORTA tiene finales de linea LF en el disco.
//
// Un `scripts/*.mjs` con CRLF rompe al importarse con un `SyntaxError: Invalid or unexpected
// token` y 0 tests ejecutados, sin nombrar el archivo (el `\r` del hashbang). Un `.sh` con CRLF
// revienta en bash con errores igual de cripticos. `.gitattributes` ya normaliza el BLOB a LF,
// pero no corrige un arbol de trabajo escrito con CRLF antes de que la regla aplicara: por eso se
// mira el disco, no el indice.
//
// El alcance es `init.sh`, `scripts/*.sh` y `scripts/*.mjs` (lo que rompe con un error criptico),
// no todo `* text=auto`: en el resto el CRLF solo ensucia el diff.

/** La orden que re-materializa un archivo con LF sin tocar su contenido (D1). */
export const ordenDeRematerializar = (archivo: string) =>
  `rm -- "${archivo}" && git checkout -- "${archivo}"`;

/** `true` si el texto tiene algun fin de linea CRLF. */
export const tieneCrlf = (texto: string): boolean => texto.includes("\r\n");

/** Los archivos vigilados, relativos a `raiz` y con `/`. */
export function archivosVigilados(raiz: string): string[] {
  const enScripts = fs
    .readdirSync(path.join(raiz, "scripts"))
    .filter((n) => n.endsWith(".sh") || n.endsWith(".mjs"))
    .map((n) => `scripts/${n}`);
  return ["init.sh", ...enScripts].filter((r) => fs.statSync(path.join(raiz, r)).isFile()).sort();
}

/** Mensaje de error: un archivo por linea, con la orden que lo arregla. Vacio si no hay ninguno. */
export function mensajeCrlf(afectados: string[]): string {
  if (afectados.length === 0) return "";
  return [
    `${afectados.length} archivo(s) con finales de linea CRLF en el arbol de trabajo.`,
    "Re-materializalos con LF (solo si no tienen cambios locales; mira `git status -- <f>`):",
    ...afectados.map((f) => `  ${ordenDeRematerializar(f)}`),
  ].join("\n");
}

describe("SL-10 — init.sh y scripts/ tienen finales de linea LF en el disco (R1)", () => {
  it("la deteccion muerde: un texto con CRLF se marca y uno LF no", () => {
    expect(tieneCrlf("#!/usr/bin/env node\r\nconsole.log(1);\r\n")).toBe(true);
    expect(tieneCrlf("#!/usr/bin/env node\nconsole.log(1);\n")).toBe(false);
  });

  it("el mensaje nombra cada archivo y la orden de re-materializar", () => {
    const m = mensajeCrlf(["init.sh", "scripts/x.mjs"]);
    expect(m).toContain('rm -- "init.sh" && git checkout -- "init.sh"');
    expect(m).toContain('rm -- "scripts/x.mjs" && git checkout -- "scripts/x.mjs"');
  });

  it("el barrido tiene sujetos: init.sh y al menos un .sh y un .mjs de scripts/", () => {
    const vigilados = archivosVigilados(RAIZ_DEL_REPO);
    expect(vigilados).toContain("init.sh");
    expect(vigilados.some((r) => r.endsWith(".sh") && r.startsWith("scripts/"))).toBe(true);
    expect(vigilados.some((r) => r.endsWith(".mjs"))).toBe(true);
  });

  it("ningun archivo vigilado tiene CRLF", () => {
    const afectados = archivosVigilados(RAIZ_DEL_REPO).filter((r) =>
      tieneCrlf(fs.readFileSync(path.join(RAIZ_DEL_REPO, r), "utf8")),
    );
    expect(afectados, mensajeCrlf(afectados)).toEqual([]);
  });
});
