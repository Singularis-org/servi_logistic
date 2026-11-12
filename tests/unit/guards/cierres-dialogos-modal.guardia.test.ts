import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

/**
 * SLT-103 «Diálogos del módulo de cierres y trato tú» — guardia estructural de R53 y R137.
 *
 * - R53: todo diálogo del módulo de cierres se monta sobre `components/shared/Modal.tsx`. Ningún
 *   archivo del censo importa `@/components/ui/dialog` ni `@/components/ui/alert-dialog`, salvo el
 *   marco modal del detalle (D1), que no es un diálogo de R53.
 * - R137: hay UN solo visor de evidencia. El título «Evidencia de la gestión» vive solo en
 *   `dialogos-labels.ts` y `function VisorEvidencia` solo en `VisorEvidencia.tsx`: no puede volver
 *   a nacer un cuarto visor en línea.
 *
 * Se mira el código SIN comentarios (`quitarComentarios`): un comentario que cita el título o el
 * import no es un hallazgo. Control positivo (el censo no está vacío ni le faltan los módulos que
 * vigila) y contraprueba (las detecciones sí encuentran el patrón en una muestra) al final.
 */

const RAIZ = path.resolve(__dirname, "../../..");

/** Censo: los `.ts`/`.tsx` de pantalla del módulo de cierres (`requirements.md > Definiciones`). */
const ARBOLES = [
  "app/(app)/cierres-admin",
  "app/(app)/cierre-dia",
  "app/(app)/wallet/satelites",
  "components/private/cierres",
  "components/shared/conciliacion",
  "components/shared/liquidacion",
] as const;

/** Única excepción de R53, con su motivo. */
const EXCEPCIONES_UI_DIALOG: Readonly<Record<string, string>> = {
  "components/private/cierres/detalle/DetalleCierre.tsx":
    "marco modal del detalle de cierre (D1): no es uno de los diálogos de R53",
};

const DUENO_TITULO = "components/private/cierres/dialogos/dialogos-labels.ts";
const DUENO_VISOR = "components/private/cierres/dialogos/VisorEvidencia.tsx";

function listar(relativo: string, acc: string[] = []): string[] {
  const absoluto = path.join(RAIZ, relativo);
  if (!existsSync(absoluto)) return acc;
  for (const entrada of readdirSync(absoluto, { withFileTypes: true })) {
    const hijo = `${relativo}/${entrada.name}`;
    if (entrada.isDirectory()) listar(hijo, acc);
    else if (/\.tsx?$/.test(entrada.name) && !entrada.name.endsWith(".d.ts")) acc.push(hijo);
  }
  return acc;
}

function censo(): string[] {
  return ARBOLES.flatMap((arbol) => listar(arbol)).sort();
}

function codigo(ruta: string): string {
  return quitarComentarios(readFileSync(path.join(RAIZ, ruta), "utf8"));
}

/** R53: especificadores de import/export de `ui/dialog` o `ui/alert-dialog` en un código ya limpio. */
function importsDeDialogoUi(fuente: string): string[] {
  const patron = /from\s+["'](@\/components\/ui\/(?:alert-)?dialog)["']|import\s*\(\s*["'](@\/components\/ui\/(?:alert-)?dialog)["']\s*\)/g;
  return [...fuente.matchAll(patron)].map((m) => m[1] ?? m[2]);
}

/** R137: apariciones del título del visor o de la declaración de un visor, en un código ya limpio. */
function rastrosDeVisor(fuente: string): { titulo: number; declaracion: number } {
  return {
    titulo: fuente.split("Evidencia de la gestión").length - 1,
    declaracion: [...fuente.matchAll(/\bfunction\s+VisorEvidencia\b/g)].length,
  };
}

describe("SLT-103 · guardia de diálogos de cierres (R53, R137)", () => {
  it("R53: ningún archivo del censo importa ui/dialog ni ui/alert-dialog, salvo el marco del detalle", () => {
    const hallazgos = censo()
      .filter((ruta) => !(ruta in EXCEPCIONES_UI_DIALOG))
      .flatMap((ruta) => importsDeDialogoUi(codigo(ruta)).map((imp) => `${ruta} → ${imp}`));
    expect(hallazgos).toEqual([]);
  });

  it("R53: la excepción sigue existiendo y sigue usando ui/dialog (si no, sobra en la lista)", () => {
    for (const ruta of Object.keys(EXCEPCIONES_UI_DIALOG)) {
      expect(existsSync(path.join(RAIZ, ruta)), `${ruta} no existe`).toBe(true);
      expect(importsDeDialogoUi(codigo(ruta)).length, `${ruta} ya no usa ui/dialog`).toBeGreaterThan(0);
    }
  });

  it("R137: «Evidencia de la gestión» solo vive en dialogos-labels.ts", () => {
    const fuera = censo().filter((ruta) => ruta !== DUENO_TITULO && rastrosDeVisor(codigo(ruta)).titulo > 0);
    expect(fuera).toEqual([]);
    expect(rastrosDeVisor(codigo(DUENO_TITULO)).titulo).toBe(1);
  });

  it("R137: `function VisorEvidencia` solo se declara en VisorEvidencia.tsx", () => {
    const fuera = censo().filter((ruta) => ruta !== DUENO_VISOR && rastrosDeVisor(codigo(ruta)).declaracion > 0);
    expect(fuera).toEqual([]);
    expect(rastrosDeVisor(codigo(DUENO_VISOR)).declaracion).toBe(1);
  });

  it("control positivo: el censo pasa de 40 archivos e incluye los módulos que vigila", () => {
    const archivos = censo();
    expect(archivos.length).toBeGreaterThan(40);
    expect(archivos).toEqual(
      expect.arrayContaining([
        "app/(app)/cierres-admin/_components/CierresAdminModule.tsx",
        "app/(app)/cierre-dia/_components/CierreDiaModule.tsx",
        "components/shared/conciliacion/ConciliacionAcciones.tsx",
        DUENO_TITULO,
        DUENO_VISOR,
      ]),
    );
  });

  it("contraprueba: las detecciones encuentran el patrón en una muestra y no en la misma comentada", () => {
    const muestra = [
      'import { Dialog } from "@/components/ui/dialog";',
      'import { AlertDialog } from "@/components/ui/alert-dialog";',
      "export function VisorEvidencia() {",
      '  return <Modal title="Evidencia de la gestión" />;',
      "}",
    ].join("\n");
    expect(importsDeDialogoUi(quitarComentarios(muestra))).toEqual([
      "@/components/ui/dialog",
      "@/components/ui/alert-dialog",
    ]);
    expect(rastrosDeVisor(quitarComentarios(muestra))).toEqual({ titulo: 1, declaracion: 1 });

    const comentada = muestra
      .split("\n")
      .map((linea) => `// ${linea}`)
      .join("\n");
    expect(importsDeDialogoUi(quitarComentarios(comentada))).toEqual([]);
    expect(rastrosDeVisor(quitarComentarios(comentada))).toEqual({ titulo: 0, declaracion: 0 });
  });
});
