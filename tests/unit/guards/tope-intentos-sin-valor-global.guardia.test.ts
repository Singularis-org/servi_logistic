import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// SLT-77 (R31, R40, design §2.1, §5) — EL TOPE TIENE UNA SOLA FUENTE, Y NO SE LE ATRIBUYE A UNA LEY.
//
// Se lee el disco porque lo que hay que impedir es justo lo que no falla en ejecucion: una segunda lectura del
// valor global dejaria decisiones de dinero sin la empresa, con los tests por empresa todavia en verde en sus casos.

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const ESTE_ARCHIVO = path.normalize(__filename);

function archivosDe(carpeta: string): string[] {
  const salida: string[] = [];
  const pendientes = [path.join(RAIZ, carpeta)];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const e of fs.readdirSync(actual, { withFileTypes: true })) {
      const ruta = path.join(actual, e.name);
      if (e.isDirectory()) pendientes.push(ruta);
      else if (/\.(ts|tsx|md|json|css|sql)$/.test(e.name)) salida.push(ruta);
    }
  }
  return salida;
}

/** Sin comentarios: el comentario puede explicar la historia; el codigo no puede nombrarla. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");

const archivosDeCodigo = () => ["lib", "app", "components", "hooks"].flatMap(archivosDe);

/** Rutas en cuyo codigo aparece alguno de los nombres. */
function queNombran(archivos: string[], nombres: RegExp): string[] {
  return archivos.filter((a) => nombres.test(sinComentarios(fs.readFileSync(a, "utf8")))).map(relativa);
}

const VALOR_GLOBAL = /reintentosConfig|REINTENTOS_MIN_INTENTOS|MIN_INTENTOS_ENTREGA|lib\/config\/reintentos/;
const COLUMNA = /tope_intentos_entrega/;
// Se arma por partes: este archivo tambien vive en `tests/`, y escribirlo seguido seria un falso positivo si se
// dejara de excluir.
const ATRIBUCION_LEGAL = new RegExp(["por le" + "y", "cota le" + "gal", "umbral le" + "gal"].join("|"), "i");

describe("SLT-77 R31 — ningun punto lee un tope global", () => {
  it("en `lib/`, `app/`, `components/` y `hooks/` nadie nombra la configuracion retirada, en codigo", () => {
    expect(queNombran(archivosDeCodigo(), VALOR_GLOBAL)).toEqual([]);
  });

  it("el modulo de la configuracion ya no existe", () => {
    expect(fs.existsSync(path.join(RAIZ, "lib", "config", "reintentos.ts"))).toBe(false);
  });

  it("la columna solo se nombra en los dos archivos de la lectura y la escritura", () => {
    expect(queNombran(archivosDeCodigo(), COLUMNA).sort()).toEqual([
      "lib/repositories/TopeIntentosRepository.ts",
      "lib/repositories/_shared/tope-intentos-empresa.ts",
    ]);
  });

  it("control: el recorrido entra en las cuatro carpetas y el detector ve un archivo real con el nombre", () => {
    const vistos = archivosDeCodigo().map(relativa);
    for (const conocido of [
      "lib/services/mensajes-bloqueo.ts",
      "app/(app)/ordenes/_components/guia-decision-error-messages.ts",
      "components/ui/button.tsx",
      "hooks/use-mobile.ts",
    ]) {
      expect(vistos).toContain(conocido);
    }
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "slt77-r31-"));
    try {
      const muestra = path.join(carpeta, "muestra.ts");
      fs.writeFileSync(muestra, "export const u = reintentosConfig.MIN_INTENTOS_ENTREGA;\n");
      expect(queNombran([muestra], VALOR_GLOBAL)).toHaveLength(1);
    } finally {
      fs.rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it("control: el detector ve una lectura de muestra, y no la misma en un comentario", () => {
    expect(VALOR_GLOBAL.test(sinComentarios("const u = reintentosConfig.MIN_INTENTOS_ENTREGA;"))).toBe(true);
    expect(VALOR_GLOBAL.test(sinComentarios("// antes: reintentosConfig"))).toBe(false);
    expect(VALOR_GLOBAL.test(sinComentarios('const v = process.env["REINTENTOS_MIN_INTENTOS"];'))).toBe(true);
    expect(COLUMNA.test(sinComentarios('SELECT "tope_intentos_entrega" FROM x'))).toBe(true);
  });
});

describe("SLT-77 R40 — el codigo no afirma que el numero viene de una ley", () => {
  it("ni en `lib/`, `app/`, `components/`, `e2e/` ni `tests/`", () => {
    const archivos = ["lib", "app", "components", "e2e", "tests"]
      .flatMap(archivosDe)
      .filter((a) => path.normalize(a) !== ESTE_ARCHIVO);
    const conAtribucion = archivos
      .filter((a) => ATRIBUCION_LEGAL.test(fs.readFileSync(a, "utf8")))
      .map(relativa);
    expect(conAtribucion).toEqual([]);
  });

  it("control: el detector ve las tres frases, en mayusculas o minusculas", () => {
    for (const muestra of ["minimo por ley", "la COTA LEGAL de intentos", "Umbral Legal"]) {
      expect(ATRIBUCION_LEGAL.test(muestra), muestra).toBe(true);
    }
    expect(ATRIBUCION_LEGAL.test("el tope de la empresa")).toBe(false);
  });
});
