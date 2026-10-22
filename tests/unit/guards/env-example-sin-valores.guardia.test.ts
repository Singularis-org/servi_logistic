import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";

// SL-10 (R18, R19, D10) — `.env.example` esta versionado y no lleva ningun valor.
//
// Antes vivia solo en el checkout principal (`.gitignore` ignora `.env*`), y los tests que lo leen
// fallaban en cualquier copia recien materializada: worktrees y CI. Ahora se versiona, y como el
// repo es publico, un valor pegado ahi por descuido acabaria en la historia. Por eso:
//   - toda linea es vacia, un comentario `#` o un `NOMBRE=` sin nada detras;
//   - el mensaje nombra el NUMERO de linea y nunca su contenido: si alguien pega un secreto, el
//     log del CI no lo debe repetir.

const LINEA_VALIDA = /^[A-Z][A-Z0-9_]*=$/;

/** Numeros de linea (desde 1) que no son vacias, comentario ni `NOMBRE=` sin valor. */
export function lineasConValor(texto: string): number[] {
  const malas: number[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    const l = linea.trim();
    if (l === "" || l.startsWith("#") || LINEA_VALIDA.test(l)) return;
    malas.push(i + 1);
  });
  return malas;
}

/** Mensaje sin contenido: solo los numeros de linea. */
export const mensajeSinValores = (lineas: number[]) =>
  lineas.length === 0
    ? ""
    : `.env.example tiene ${lineas.length} linea(s) que no son vacias, comentario ni NOMBRE= sin ` +
      `valor: lineas ${lineas.join(", ")}. Deja solo el nombre; el valor va en tu .env local.`;

describe("SL-10 — .env.example versionado y sin valores", () => {
  it("la deteccion muerde: CLAVE=algo se marca; CLAVE= y comentarios no", () => {
    const texto = ["# comentario", "", "CLAVE=", "OTRA_CLAVE_2=", "CLAVE=algo", "  # sangrado"].join("\n");
    expect(lineasConValor(texto)).toEqual([5]);
    expect(lineasConValor("minuscula=\n")).toEqual([1]);
  });

  it("el mensaje nombra la linea sin imprimir su contenido", () => {
    const m = mensajeSinValores(lineasConValor("A=\nCLAVE=secreto-de-prueba\n"));
    expect(m).toContain("lineas 2");
    expect(m).not.toContain("secreto-de-prueba");
  });

  it("ninguna linea de .env.example tiene valor (R19)", () => {
    const texto = fs.readFileSync(path.join(RAIZ_DEL_REPO, ".env.example"), "utf8");
    const malas = lineasConValor(texto);
    expect(malas, mensajeSinValores(malas)).toEqual([]);
  });

  it("git versiona .env.example (R18)", () => {
    const salida = execFileSync("git", ["ls-files", ".env.example"], {
      cwd: RAIZ_DEL_REPO,
      encoding: "utf8",
    });
    expect(salida.trim()).toBe(".env.example");
  });
});
