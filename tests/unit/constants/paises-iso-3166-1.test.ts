import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PAISES_ISO_3166_1, paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import { normalizeName } from "@/lib/utils/normalize";

// SL-20 (T2.4; design §2.1; R40; decisión 10) — el catálogo ISO 3166-1 que genera una vez
// `scripts/generar-paises-iso-3166-1.mjs`. Lee el archivo COMMITEADO: no llama a `Intl`, así que no
// depende del ICU de la máquina que corre el test (SL-37).

const RUTA = path.resolve(__dirname, "../../../lib/constants/paises-iso-3166-1.ts");

describe("R40 — catálogo de países ISO 3166-1 en el repo", () => {
  it("tiene los 249 códigos alfa-2 asignados", () => {
    expect(PAISES_ISO_3166_1).toHaveLength(249);
  });

  it("cada código son dos letras mayúsculas", () => {
    const malos = PAISES_ISO_3166_1.filter((p) => !/^[A-Z]{2}$/.test(p.id)).map((p) => p.id);
    expect(malos).toEqual([]);
  });

  it("no repite códigos", () => {
    expect(new Set(PAISES_ISO_3166_1.map((p) => p.id)).size).toBe(PAISES_ISO_3166_1.length);
  });

  it("no repite nombres normalizados (el alta compara así, R23)", () => {
    const vistos = new Map<string, string>();
    const repetidos: string[] = [];
    for (const p of PAISES_ISO_3166_1) {
      const clave = normalizeName(p.nombre);
      const otro = vistos.get(clave);
      if (otro) repetidos.push(`${otro}/${p.id}: ${p.nombre}`);
      vistos.set(clave, p.id);
    }
    expect(repetidos).toEqual([]);
  });

  it("cada país tiene un nombre que no es su código ni está vacío", () => {
    const malos = PAISES_ISO_3166_1.filter((p) => p.nombre.trim() === "" || p.nombre === p.id).map((p) => p.id);
    expect(malos).toEqual([]);
  });

  it("CR es «Costa Rica», el nombre que ya tiene la fila sembrada por la migración", () => {
    expect(paisDelCatalogo("CR")).toEqual({ id: "CR", nombre: "Costa Rica" });
  });

  it("no tiene ningún código de usuario XA–XZ (los de los tests) ni AA, QM–QZ o ZZ", () => {
    const deUsuario = PAISES_ISO_3166_1.filter((p) => /^(X[A-Z]|AA|Q[M-Z]|ZZ)$/.test(p.id)).map((p) => p.id);
    expect(deUsuario).toEqual([]);
  });

  it("paisDelCatalogo da `null` para un código que no está", () => {
    expect(paisDelCatalogo("XA")).toBeNull();
    expect(paisDelCatalogo("cr")).toBeNull();
    expect(paisDelCatalogo("")).toBeNull();
  });

  it("el archivo es estático: ninguna línea de código llama a `Intl` en runtime", () => {
    const codigo = readFileSync(RUTA, "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("/*"));
    expect(codigo.filter((l) => l.includes("Intl"))).toEqual([]);
  });
});
