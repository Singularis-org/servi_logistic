import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";

/**
 * SLT-147 (D63) · R410 — GUARDIA: LA LECTURA DE IMPUTABLES SIN ALCANCE NO VUELVE.
 *
 * `ILiquidacionPagoRepository` tenia dos lecturas de cierres imputables de un mensajero: una con el
 * alcance del actor en el WHERE y otra sin el. La segunda se quedo sin consumidores (SLT-124) y se
 * borro: mientras existiera, un consumidor nuevo podia volver a mezclar cierres de satelite con
 * dinero de la central.
 *
 * El compilador es la guardia principal (no se puede llamar lo que no existe). Esta guardia cubre
 * lo que el compilador no ve: que alguien VUELVA a declarar el metodo en la interfaz, en el
 * repositorio o en un doble de test. Busca el nombre como palabra completa, asi que
 * `listarCierresImputablesEnAlcance` no cuenta.
 *
 * El nombre se declara aqui y en ningun otro sitio: por eso esta guardia se excluye del barrido.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const NOMBRE_RETIRADO = "listarCierresImputables";
const PATRON = new RegExp(`\\b${NOMBRE_RETIRADO}\\b`);

/** R410: carpetas donde el nombre no puede aparecer. */
const CARPETAS = ["lib", "app", "tests"] as const;

const ESTA_GUARDIA = "tests/unit/guards/imputables-solo-en-alcance.guardia.test.ts";

const EXTENSIONES = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs"]);

const AVISO =
  "SLT-147 (D63) borro la lectura de cierres imputables SIN alcance. Usa " +
  "`listarCierresImputablesEnAlcance(mensajeroId, alcance, tx?)`: el alcance del actor va en el WHERE.";

/** Rutas relativas (con `/`) de los archivos de codigo bajo `carpeta`, recursivo. */
function archivosBajo(carpeta: string): string[] {
  const absoluta = path.join(RAIZ, carpeta);
  if (!existsSync(absoluta)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(absoluta, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile()) continue;
    if (!EXTENSIONES.has(path.extname(entrada.name))) continue;
    const completa = path.join(entrada.parentPath, entrada.name);
    salida.push(path.relative(RAIZ, completa).split(path.sep).join("/"));
  }
  return salida;
}

describe("SLT-147 · R410 — la lectura de imputables sin alcance no vuelve", () => {
  const archivos = CARPETAS.flatMap(archivosBajo).filter((ruta) => ruta !== ESTA_GUARDIA);

  it("el barrido no esta vacio: lee la interfaz y el repositorio, y ve el nombre CON alcance", () => {
    // Sin esto, una carpeta mal escrita dejaria la guardia verde sin mirar nada.
    expect(archivos).toContain("lib/interfaces/repositories/ILiquidacionPagoRepository.ts");
    expect(archivos).toContain("lib/repositories/LiquidacionPagoRepository.ts");
    const interfaz = readFileSync(
      path.join(RAIZ, "lib/interfaces/repositories/ILiquidacionPagoRepository.ts"),
      "utf8",
    );
    expect(interfaz).toContain("listarCierresImputablesEnAlcance(");
  });

  it("ningun archivo de lib/, app/ ni tests/ nombra la lectura sin alcance", () => {
    const infractores = archivos.filter((ruta) =>
      PATRON.test(readFileSync(path.join(RAIZ, ruta), "utf8")),
    );
    expect(infractores, AVISO).toEqual([]);
  });

  it("el repositorio no la expone en tiempo de ejecucion", () => {
    // Cubre un alta que esquive el texto (`["listar" + "..."]`) en la clase concreta.
    expect(NOMBRE_RETIRADO in LiquidacionPagoRepository.prototype, AVISO).toBe(false);
    expect("listarCierresImputablesEnAlcance" in LiquidacionPagoRepository.prototype).toBe(true);
  });
});
