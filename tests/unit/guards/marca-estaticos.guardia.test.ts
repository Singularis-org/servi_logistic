import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { MARCA } from "@/lib/config/marca";
import { RAIZ_DEL_REPO } from "../../fixtures/raices-de-codigo";
import { contieneNombreHeredado } from "../../fixtures/nombre-heredado";

// SL-15 (R5, R6) — el nombre de la plataforma sale de un solo sitio.
//
// R5: en el codigo de la app el nombre se lee de `MARCA.nombre`; escribirlo a mano en otro archivo
// es una segunda fuente que un cambio de marca no ve. La unica excepcion es el propio modulo.
//
// R6: `public/sw.js`, `public/offline.html` y `public/manifest.json` se sirven tal cual y no pueden
// importar el modulo, asi que llevan el nombre literal. Esta guardia los compara con
// `MARCA.nombre`: si alguien cambia uno de los dos lados, sale en rojo.
//
// Las comprobaciones de R6 que aun nombran a la plataforma con el nombre heredado estan en
// `PENDIENTES_T2` (las cambia la tanda 2 de SL-15). Una pendiente que ya se cumple sale en rojo
// pidiendo quitarla: la lista solo encoge. La tanda 2 la dejo vacia.

const LITERAL_MARCA = /Servi\s+Logistic/i;
const RAICES_R5 = ["app/", "lib/", "components/", "hooks/"];
const ARCHIVOS_R5 = ["middleware.ts"];
const MODULO_DE_MARCA = "lib/config/marca.ts";

/** Lineas (desde 1) donde aparece el nombre de la plataforma escrito a mano. */
export function lineasConLiteralDeMarca(texto: string): number[] {
  if (!LITERAL_MARCA.test(texto)) return [];
  const lineas: number[] = [];
  texto.split(/\r?\n/).forEach((l, i) => {
    if (LITERAL_MARCA.test(l)) lineas.push(i + 1);
  });
  return lineas;
}

/** Archivos de texto de R5, versionados o nuevos sin ignorar. */
function universoR5(): string[] {
  const salida = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...RAICES_R5, ...ARCHIVOS_R5],
    { cwd: RAIZ_DEL_REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return [...new Set(salida.split("\0").filter(Boolean))].filter((r) =>
    fs.existsSync(path.join(RAIZ_DEL_REPO, r)),
  );
}

function leer(ruta: string): string {
  return fs.readFileSync(path.join(RAIZ_DEL_REPO, ruta), "utf8");
}

/** Un valor de `public/` que nombra a la plataforma y como debe compararse con `MARCA.nombre`. */
interface ComprobacionR6 {
  id: string;
  /** Los textos que nombran a la plataforma en ese archivo. */
  valores: () => string[];
  /** `igual`: el valor es el nombre; `contiene`: el nombre esta dentro de una frase. */
  modo: "igual" | "contiene";
}

const manifiesto = () => JSON.parse(leer("public/manifest.json")) as Record<string, unknown>;

const COMPROBACIONES_R6: readonly ComprobacionR6[] = [
  { id: "manifest.name", modo: "igual", valores: () => [String(manifiesto().name)] },
  { id: "manifest.short_name", modo: "igual", valores: () => [String(manifiesto().short_name)] },
  { id: "manifest.description", modo: "contiene", valores: () => [String(manifiesto().description)] },
  {
    id: "manifest.screenshots.label",
    modo: "contiene",
    valores: () =>
      ((manifiesto().screenshots as { label?: string }[] | undefined) ?? []).map((s) => String(s.label)),
  },
  {
    id: "offline.html <title>",
    modo: "contiene",
    valores: () => [...leer("public/offline.html").matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]),
  },
  {
    id: "sw.js TITULO_RESERVA",
    modo: "igual",
    valores: () => [...leer("public/sw.js").matchAll(/\bTITULO_RESERVA\s*=\s*"([^"]*)"/g)].map((m) => m[1]),
  },
];

/** Pendientes de la tanda 2 de SL-15: hoy dicen el nombre heredado. Se borran al cambiarlas. */
const PENDIENTES_T2 = new Set<string>();

function cumple(c: ComprobacionR6, nombre: string): boolean {
  return c.valores().every((v) => (c.modo === "igual" ? v === nombre : v.includes(nombre)));
}

describe("SL-15 — el nombre de la plataforma sale de lib/config/marca.ts (R5, R6)", () => {
  it("autocomprobacion: el detector de R5 marca el literal con otras mayusculas y espacios", () => {
    expect(lineasConLiteralDeMarca('a\nconst t = "Servi Logistic";')).toEqual([2]);
    expect(lineasConLiteralDeMarca("// SERVI  logistic")).toEqual([1]);
    expect(lineasConLiteralDeMarca('const clave = "servi-logistic:x"; const base = "servi_logistic";')).toEqual([]);
  });

  it("R5: ningun archivo de app/, lib/, components/, hooks/ ni middleware.ts escribe el nombre a mano", () => {
    const rutas = universoR5();
    expect(rutas.length).toBeGreaterThan(500);
    expect(rutas).toContain(MODULO_DE_MARCA);
    const hallazgos: string[] = [];
    for (const ruta of rutas) {
      if (ruta === MODULO_DE_MARCA) continue;
      for (const l of lineasConLiteralDeMarca(leer(ruta))) hallazgos.push(`${ruta}:${l}`);
    }
    expect(hallazgos, `Usa MARCA.nombre de ${MODULO_DE_MARCA}:\n${hallazgos.join("\n")}`).toEqual([]);
  });

  it("R5: el modulo de marca si contiene el literal (la excepcion no esta vacia)", () => {
    expect(lineasConLiteralDeMarca(leer(MODULO_DE_MARCA)).length).toBeGreaterThan(0);
  });

  describe("R6: public/ nombra a la plataforma con el mismo valor que MARCA.nombre", () => {
    for (const c of COMPROBACIONES_R6) {
      it(`${c.id} tiene valores que leer`, () => {
        expect(c.valores().length, c.id).toBeGreaterThan(0);
      });

      if (PENDIENTES_T2.has(c.id)) {
        it(`${c.id}: pendiente de la tanda 2 de SL-15, todavia con el nombre heredado`, () => {
          expect(
            c.valores().some(contieneNombreHeredado),
            `${c.id} ya no lleva el nombre heredado: quitala de PENDIENTES_T2`,
          ).toBe(true);
        });
      } else {
        it(`${c.id} coincide con MARCA.nombre`, () => {
          expect(cumple(c, MARCA.nombre), `${c.id}: ${JSON.stringify(c.valores())} frente a «${MARCA.nombre}»`).toBe(
            true,
          );
        });
      }
    }

    it("toda pendiente es una comprobacion que existe", () => {
      const ids = new Set(COMPROBACIONES_R6.map((c) => c.id));
      for (const p of PENDIENTES_T2) expect(ids.has(p), p).toBe(true);
    });
  });
});
