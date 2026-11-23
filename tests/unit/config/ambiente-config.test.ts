import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ambienteDePruebas } from "@/lib/config/ambiente";
import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";

// SLT-257 — el sandbox se detecta SOLO por `AMBIENTE_PRUEBAS` con el valor exacto `true`.

const VARIABLES = ["AMBIENTE_PRUEBAS", "VERCEL_ENV"] as const;
const ORIGINAL = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));

function poner(nombre: (typeof VARIABLES)[number], valor: string | undefined): void {
  if (valor === undefined) delete process.env[nombre];
  else process.env[nombre] = valor;
}

afterEach(() => {
  for (const v of VARIABLES) poner(v, ORIGINAL[v]);
});

describe("SLT-257 — ambienteDePruebas()", () => {
  it("R1: con AMBIENTE_PRUEBAS=true devuelve true", () => {
    poner("VERCEL_ENV", undefined);
    poner("AMBIENTE_PRUEBAS", "true");
    expect(ambienteDePruebas()).toBe(true);
  });

  it("R2: sin AMBIENTE_PRUEBAS definida devuelve false", () => {
    poner("VERCEL_ENV", undefined);
    poner("AMBIENTE_PRUEBAS", undefined);
    expect(ambienteDePruebas()).toBe(false);
  });

  it.each(["", "TRUE", "True", "1", "yes", "false", " true", "true "])(
    "R2: con AMBIENTE_PRUEBAS=%j devuelve false",
    (valor) => {
      poner("VERCEL_ENV", undefined);
      poner("AMBIENTE_PRUEBAS", valor);
      expect(ambienteDePruebas()).toBe(false);
    },
  );

  it("R3: con VERCEL_ENV=production y AMBIENTE_PRUEBAS=true devuelve true", () => {
    poner("VERCEL_ENV", "production");
    poner("AMBIENTE_PRUEBAS", "true");
    expect(ambienteDePruebas()).toBe(true);
  });

  it.each(["preview", "development"])(
    "R3: con VERCEL_ENV=%s y sin AMBIENTE_PRUEBAS devuelve false",
    (entorno) => {
      poner("VERCEL_ENV", entorno);
      poner("AMBIENTE_PRUEBAS", undefined);
      expect(ambienteDePruebas()).toBe(false);
    },
  );
});

describe("SLT-257 — .env.example documenta AMBIENTE_PRUEBAS (R10)", () => {
  const lineas = readFileSync(path.join(RAIZ_DEL_REPO, ".env.example"), "utf8").split(/\r?\n/);

  it("R10: tiene la linea AMBIENTE_PRUEBAS= sin valor", () => {
    expect(lineas).toContain("AMBIENTE_PRUEBAS=");
  });

  it("R10: un comentario encima dice que solo se pone true en el proyecto Vercel del sandbox", () => {
    const i = lineas.indexOf("AMBIENTE_PRUEBAS=");
    const comentarios: string[] = [];
    for (let j = i - 1; j >= 0 && lineas[j]!.startsWith("#"); j--) comentarios.unshift(lineas[j]!);
    const bloque = comentarios.join(" ");
    expect(bloque).toContain("`true`");
    expect(bloque).toMatch(/proyecto Vercel del sandbox/);
  });
});
