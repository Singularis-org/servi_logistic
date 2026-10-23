import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { EXCEPCIONES_DE_PLATAFORMA } from "@/lib/db/excepciones-aislamiento";

import {
  archivosDeCodigo,
  archivosQueLlamanAComoPlataforma,
  archivosRepetidos,
  CARPETAS_PLATAFORMA,
  llamaAComoPlataforma,
  problemasDeExcepcion,
} from "./_aislamiento-por-empresa";

/**
 * SL-17 · R27, R26 — GUARDIA: SOLO LOS ARCHIVOS DE LA LISTA ABREN EL CONTEXTO DE PLATAFORMA.
 *
 * `comoPlataforma` apaga el filtro de empresa: lo que corre dentro ve todas las empresas (como
 * dueño de las tablas). Cada archivo que lo llama tiene que estar en `EXCEPCIONES_DE_PLATAFORMA`
 * con su ficha y su motivo, para que abrirlo sea una decisión revisada y no un atajo.
 *
 * El sentido es uno: quien llama tiene que estar en la lista. Una entrada que aún no llama no
 * falla: en SL-17 la lista se escribe a la vez que los puntos de entrada que la usarán.
 */

describe("SL-17 · comoPlataforma solo en la lista (R27, R26)", () => {
  const llaman = archivosQueLlamanAComoPlataforma();
  const enLista = new Set(EXCEPCIONES_DE_PLATAFORMA.map((e) => e.archivo));

  it("control positivo: el barrido recorre lib/, app/ y scripts/ y encuentra llamadas", () => {
    expect(archivosDeCodigo(CARPETAS_PLATAFORMA).length).toBeGreaterThan(200);
    // `lib/db/para-cada-empresa.ts` llama desde la tanda 1: si el barrido no lo ve, está ciego.
    expect(llaman).toContain("lib/db/para-cada-empresa.ts");
  });

  it("todo archivo que llama a comoPlataforma está en EXCEPCIONES_DE_PLATAFORMA", () => {
    const fuera = llaman.filter((rel) => !enLista.has(rel));
    expect(
      fuera,
      "Abre el contexto de empresa (conEmpresa) o añade el archivo a EXCEPCIONES_DE_PLATAFORMA con ficha y motivo",
    ).toEqual([]);
  });

  it("cada excepción trae ficha SL-<n>, motivo y un archivo que existe (R26)", () => {
    expect(EXCEPCIONES_DE_PLATAFORMA.flatMap((e) => problemasDeExcepcion(e))).toEqual([]);
    expect(archivosRepetidos(EXCEPCIONES_DE_PLATAFORMA)).toEqual([]);
  });

  describe("autocomprobación con fuentes inventadas", () => {
    it("detecta la llamada, también con genérico y con salto de línea", () => {
      expect(llamaAComoPlataforma('await comoPlataforma("SL-1", "x", () => f());')).toBe(true);
      expect(llamaAComoPlataforma("comoPlataforma<number>(\n  'SL-1', 'x', g)")).toBe(true);
    });

    it("no confunde una cita en comentario ni otro identificador", () => {
      expect(llamaAComoPlataforma("// aquí no se llama a comoPlataforma(…)\nconst a = 1;")).toBe(false);
      expect(llamaAComoPlataforma("/* comoPlataforma( */ const a = 1;")).toBe(false);
      expect(llamaAComoPlataforma("noComoPlataforma('SL-1')")).toBe(false);
    });

    describe("el barrido de un árbol inventado", () => {
      const raiz = mkdtempSync(path.join(tmpdir(), "sl17-plataforma-"));
      afterAll(() => rmSync(raiz, { recursive: true, force: true }));

      it("nombra al que llama e ignora la definición y los tests", () => {
        const escribir = (rel: string, texto: string) => {
          mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
          writeFileSync(path.join(raiz, rel), texto);
        };
        const llamada = 'await comoPlataforma("SL-1", "motivo", () => leer());\n';
        escribir("lib/db/contexto-empresa.ts", `export function comoPlataforma(f, m, fn) {}\n${llamada}`);
        escribir("lib/x/intruso.ts", llamada);
        escribir("scripts/tarea.ts", llamada);
        escribir("app/y/page.test.tsx", llamada);
        escribir("app/y/page.tsx", "export default function P() { return null; }\n");
        expect(archivosQueLlamanAComoPlataforma(raiz)).toEqual(["lib/x/intruso.ts", "scripts/tarea.ts"]);
      });
    });

    it("una excepción sin ficha válida, sin motivo o con archivo inexistente falla (R26)", () => {
      const mala = { archivo: "app/no-existe.ts", ficha: "SL17" as `SL-${number}`, motivo: "" };
      expect(problemasDeExcepcion(mala)).toHaveLength(3);
    });
  });
});
