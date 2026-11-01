import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";
import {
  CONCILIACION_ASIENTA_NOTA,
  CONCILIACION_ASIENTA_TITULO,
} from "@/components/shared/conciliacion/conciliacion-labels";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-73 (R35, D16) — NINGUNA SUPERFICIE DICE QUE DESMARCAR NO MUEVE DINERO
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Con SLT-73 marcar recibido asienta el dinero en la caja (R10–R12) y una marca con asientos ya no
// se desmarca (R14). La nota de la 431 («Desmarcar no mueve dinero. La marca es informativa…») es
// falsa, y basta con que una sola superficie la vuelva a pintar para que alguien se la crea. Los
// tests de componente leen las dos superficies que hoy existen (pie del desglose y confirmación de
// «Desmarcar», `tests/integration/wallet-satelites.test.tsx`); esta guardia cubre la que se monte
// mañana: el texto viejo no puede estar en el CÓDIGO (sin comentarios) de `app/` ni `components/`.

const RAIZ = path.resolve(__dirname, "../../..");
const CARPETAS = ["app", "components"];
const EXTENSIONES = /\.(ts|tsx)$/;
const TEXTOS_VIEJOS = [/desmarcar no mueve dinero/i, /la marca es informativa/i];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return EXTENSIONES.test(nombre) ? [ruta] : [];
  });
}

function infractores(): string[] {
  return CARPETAS.flatMap((c) => archivos(path.join(RAIZ, c))).filter((ruta) => {
    const codigo = quitarComentarios(readFileSync(ruta, "utf8"));
    return TEXTOS_VIEJOS.some((re) => re.test(codigo));
  });
}

describe("SLT-73 R35 — la nota vieja de la conciliación no vuelve", () => {
  it("el corpus mira algo: recorre app/ y components/ y encuentra la constante nueva", () => {
    const todos = CARPETAS.flatMap((c) => archivos(path.join(RAIZ, c)));
    expect(todos.length).toBeGreaterThan(100);
    expect(todos.some((r) => r.endsWith(path.join("conciliacion", "conciliacion-labels.ts")))).toBe(
      true,
    );
  });

  it("ningún archivo de app/ ni components/ lleva en su código «Desmarcar no mueve dinero» ni «La marca es informativa»", () => {
    expect(infractores()).toEqual([]);
  });

  it("CONTRAPRUEBA: el detector ve el texto viejo en código y lo ignora en un comentario", () => {
    const enCodigo = 'export const X = "Desmarcar no mueve dinero.";';
    const enComentario = '// antes decía «Desmarcar no mueve dinero.»\nexport const X = "otra";';
    expect(TEXTOS_VIEJOS.some((re) => re.test(quitarComentarios(enCodigo)))).toBe(true);
    expect(TEXTOS_VIEJOS.some((re) => re.test(quitarComentarios(enComentario)))).toBe(false);
  });

  it("la nota nueva es el texto provisional de Q10, literal y a mano", () => {
    expect(`${CONCILIACION_ASIENTA_TITULO} ${CONCILIACION_ASIENTA_NOTA}`).toBe(
      "Marcar recibido asienta el dinero en la caja. Después no se puede desmarcar: si el monto no es el correcto, usa «Corregir»",
    );
  });
});
