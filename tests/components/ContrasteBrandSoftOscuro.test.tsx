// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import { CifrasCierre } from "@/components/private/cierres/detalle/CifrasCierre";
import type { Cifra } from "@/components/private/cierres/detalle/detalle-cierre-vista";
import { HiloNotasOrden } from "@/components/shared/HiloNotasOrden";
import { BulkUpload } from "@/components/shared/BulkUpload";
import { componer, contraste, token, utilidad } from "../fixtures/contraste";

// SLT-170 «Contraste en modo oscuro de la tarjeta «Le queda a la empresa»». `--color-brand-soft`
// es un crema FIJO (#FFF8D9) sin variante oscura: una superficie `bg-brand-soft` sin tinta propia
// hereda `--foreground`, que en oscuro es casi blanco (1.01:1). Aquí se mide, con la aritmética de
// `tests/fixtures/contraste.ts`, la tinta REAL de cada texto contra el fondo REAL de su caja, en
// los dos temas. Se lee el DOM renderizado: las clases que pinta el componente, no una copia.

type Tema = "claro" | "oscuro";

/** Un color de utilidad (`foreground`, `brand-soft`, `accent/40`) o `null` si la clase no es color. */
function colorDe(tema: Tema, valor: string, base: string): string | null {
  const [nombre, alfa] = valor.split("/");
  let hex: string;
  try {
    hex = utilidad(tema, nombre!);
  } catch {
    return null;
  }
  return alfa ? componer(hex, base, Number(alfa) / 100) : hex;
}

/** La clase de `prop` (`bg`, `text`) que gana en ese tema y estado (`""`, `"hover:"`). */
function claseGanadora(tema: Tema, clases: string[], prop: string, estado: string, base: string) {
  const orden = tema === "oscuro" ? [`dark:${estado}${prop}-`, `${estado}${prop}-`] : [`${estado}${prop}-`];
  for (const prefijo of orden) {
    for (const c of clases) {
      if (!c.startsWith(prefijo)) continue;
      const color = colorDe(tema, c.slice(prefijo.length), base);
      if (color) return color;
    }
  }
  return null;
}

const clasesDe = (el: Element) => el.className.toString().split(/\s+/).filter(Boolean);

/** Fondo de la caja: se compone sobre `base` si lleva alfa. */
function fondoDe(caja: Element, tema: Tema, base: string, estado = ""): string {
  const color =
    claseGanadora(tema, clasesDe(caja), "bg", estado, base) ??
    (estado ? claseGanadora(tema, clasesDe(caja), "bg", "", base) : null);
  if (!color) throw new Error(`la caja no pinta fondo en ${tema}`);
  return color;
}

/** Tinta de un texto: la suya o la del ancestro más cercano hasta la caja; si no, `--foreground`. */
function tintaDe(el: Element, caja: Element, tema: Tema, estado = ""): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const color =
      (n === caja && estado ? claseGanadora(tema, clasesDe(n), "text", estado, "#000000") : null) ??
      claseGanadora(tema, clasesDe(n), "text", "", "#000000");
    if (color) return color;
    if (n === caja) break;
  }
  return token(tema, "foreground");
}

/** El peor contraste de todos los textos visibles de la caja, sobre las bases dadas. */
function peorContraste(caja: Element, tema: Tema, estado = ""): number {
  const textos = [...caja.querySelectorAll("span, p, dt, dd, time")].filter(
    (el) => !clasesDe(el).includes("sr-only") && (el.textContent ?? "").trim() !== "",
  );
  expect(textos.length).toBeGreaterThan(0);
  const bases = [token(tema, "card"), token(tema, "background")];
  let peor = Infinity;
  for (const base of bases) {
    const fondo = fondoDe(caja, tema, base, estado);
    for (const el of textos) peor = Math.min(peor, contraste(tintaDe(el, caja, tema, estado), fondo));
  }
  return peor;
}

afterEach(() => cleanup());

const TEMAS: Tema[] = ["claro", "oscuro"];

describe("SLT-170 — CifrasCierre: la caja destacada se lee en los dos temas", () => {
  function cajaDestacada(valor: string, aviso = false): Element {
    const cifras: Cifra[] = [
      {
        id: "leQueda",
        label: "Le queda a la empresa",
        valor,
        esMonto: true,
        contexto: "Lo que queda después de pagar",
        conMetodos: false,
        destacada: true,
        aviso,
      },
    ];
    const { container } = render(<CifrasCierre cifras={cifras} />);
    const caja = container.querySelector('[data-cifra="leQueda"]')!.parentElement!;
    return caja;
  }

  for (const tema of TEMAS) {
    it(`monto positivo ≥ 4.5:1 en ${tema}`, () => {
      expect(peorContraste(cajaDestacada("125000.00"), tema)).toBeGreaterThanOrEqual(4.5);
    });
    it(`monto negativo ≥ 4.5:1 en ${tema}`, () => {
      expect(peorContraste(cajaDestacada("-5000.00"), tema)).toBeGreaterThanOrEqual(4.5);
    });
    // SLT-106 «La central debe»: la caja `aviso` pisa a la destacada con `bg-warning-soft`, otro
    // tono FIJO sin variante oscura (rótulo 1.91, cifra `warning-strong` 1.50 en oscuro).
    it(`caja aviso, monto positivo ≥ 4.5:1 en ${tema}`, () => {
      expect(peorContraste(cajaDestacada("125000.00", true), tema)).toBeGreaterThanOrEqual(4.5);
    });
    it(`caja aviso, monto negativo ≥ 4.5:1 en ${tema}`, () => {
      expect(peorContraste(cajaDestacada("-5000.00", true), tema)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// SLT-170 — CENSO de `bg-warning-soft` (#fef3c7) y `bg-danger-soft` (#fee2e2), los dos fijos. Cada lista de clases del árbol que lo use se
// pinta tal cual en una caja con un texto sin clase propia (hereda la tinta de la lista o
// `--foreground`) y se mide en los dos temas. Una lista sin `dark:bg-*` cae aquí: su tinta gira con
// el tema y el fondo no. Quedan fuera los colores arbitrarios (`text-[color-mix(…)]`, `Toast`), que
// este lector no resuelve; y los comentarios.
describe("SLT-170 — censo de bg-warning-soft y bg-danger-soft: toda lista se lee en los dos temas", () => {
  const RAIZ = path.resolve(__dirname, "../..");
  const listas: { archivo: string; clases: string }[] = [];
  function recorrer(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.(tsx?|ts)$/.test(e.name)) {
        for (const linea of readFileSync(p, "utf8").split("\n")) {
          if (/^\s*(\/\/|\*|\/\*)/.test(linea)) continue;
          for (const m of linea.matchAll(/["`]([^"`]*\bbg-(?:warning|danger)-soft\b[^"`]*)["`]/g)) {
            if (/text-\[(?:color|#|rgb|var)/.test(m[1]!)) continue;
            listas.push({ archivo: path.relative(RAIZ, p).replaceAll("\\", "/"), clases: m[1]! });
          }
        }
      }
    }
  }
  recorrer(path.join(RAIZ, "app"));
  recorrer(path.join(RAIZ, "components"));

  it("el censo encuentra las listas (si baja de golpe, el lector se rompió)", () => {
    expect(listas.length).toBeGreaterThanOrEqual(28);
  });

  for (const { archivo, clases } of listas) {
    for (const tema of TEMAS) {
      it(`${archivo} «${clases.slice(0, 60)}» ≥ 4.5:1 en ${tema}`, () => {
        const { container } = render(
          <div className={clases}>
            <span>Texto</span>
          </div>,
        );
        expect(peorContraste(container.firstElementChild!, tema)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("SLT-170 — HiloNotasOrden: la nota propia se lee en los dos temas", () => {
  function notaPropia(): Element {
    const { container } = render(
      <HiloNotasOrden
        ordenId="6d5f6b6e-0000-4000-8000-000000000001"
        notas={[
          {
            id: "n1",
            cuerpo: "El cliente no estaba en la casa.",
            autorNombre: "Tienda Central",
            rolAutor: "adminTienda",
            createdAt: "2026-08-14T15:30:00.000Z",
            esPropia: true,
            eliminada: false,
          },
        ]}
        puedeEscribir={false}
        onPublicar={vi.fn()}
        onBorrar={vi.fn()}
        onRefrescar={vi.fn()}
      />,
    );
    return container.querySelector('[data-propia="true"]')!;
  }

  for (const tema of TEMAS) {
    it(`≥ 4.5:1 en ${tema}`, () => {
      expect(peorContraste(notaPropia(), tema)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("SLT-170 — BulkUpload: la zona de carga se lee al arrastrar y al pasar el ratón", () => {
  function zona(): Element {
    const { container } = render(<BulkUpload accept={["csv"]} onFileSelected={vi.fn()} />);
    return container.querySelector(".border-dashed")!;
  }

  for (const tema of TEMAS) {
    it(`arrastrando ≥ 4.5:1 en ${tema}`, () => {
      const z = zona();
      fireEvent.dragOver(z);
      expect(peorContraste(z, tema)).toBeGreaterThanOrEqual(4.5);
    });
    it(`hover ≥ 4.5:1 en ${tema}`, () => {
      expect(peorContraste(zona(), tema, "hover:")).toBeGreaterThanOrEqual(4.5);
    });
  }
});
