// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { codigoSinComentarios } from "@/tests/fixtures/sin-comentarios";

// SLT-257 (R5) — la franja «Sandbox» es el PRIMER hijo de `<body>` del layout raiz, antes de
// `<ZodEnEspanol />` y de `{children}`: asi sale arriba en todas las pantallas, publicas y
// autenticadas, porque todas cuelgan de `app/layout.tsx`.

// Las fuentes y el `<Script>` de Next no corren fuera de su compilador: dobles minimos (como
// `marca-layout.test.ts`).
vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "font-sans" }),
  JetBrains_Mono: () => ({ variable: "font-mono" }),
}));
vi.mock("next/script", () => ({ default: () => null }));

const ORIGINAL = process.env.AMBIENTE_PRUEBAS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AMBIENTE_PRUEBAS;
  else process.env.AMBIENTE_PRUEBAS = ORIGINAL;
});

/** Fuente del layout sin comentarios y sin los `{ }` que deja un comentario JSX vaciado. */
function fuenteDelLayout(): string {
  return codigoSinComentarios("app/layout.tsx").replace(/\{\s*\}/g, "");
}

describe("SLT-257 — la franja en el layout raiz (R5)", () => {
  it("R5: <BannerAmbientePruebas /> es lo primero dentro de <body>, antes de ZodEnEspanol y {children}", () => {
    const fuente = fuenteDelLayout();
    const body = fuente.indexOf("<body");
    expect(body).toBeGreaterThan(-1);
    const finDeLaEtiqueta = fuente.indexOf(">", body) + 1;
    const etiqueta = fuente.indexOf("<BannerAmbientePruebas />");
    expect(etiqueta).toBeGreaterThan(body);
    // Entre la apertura de <body> y la franja no hay nada mas que espacio.
    expect(fuente.slice(finDeLaEtiqueta, etiqueta).trim()).toBe("");
    expect(etiqueta).toBeLessThan(fuente.indexOf("<ZodEnEspanol />"));
    expect(etiqueta).toBeLessThan(fuente.indexOf("{children}"));
    expect(etiqueta).toBeLessThan(fuente.indexOf("</body>"));
  });

  it("R5: la importa del componente compartido", () => {
    expect(fuenteDelLayout()).toContain(
      'import { BannerAmbientePruebas } from "@/components/shared/BannerAmbientePruebas";',
    );
  });

  it("R5: con AMBIENTE_PRUEBAS=true el primer hijo del body renderizado es la franja «Sandbox», antes del contenido", async () => {
    process.env.AMBIENTE_PRUEBAS = "true";
    const { default: RootLayout } = await import("@/app/layout");
    const html = renderToStaticMarkup(RootLayout({ children: createElement("main", null, "contenido") }));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const primero = doc.body.firstElementChild;
    expect(primero?.textContent).toBe("Sandbox");
    expect(primero?.nextElementSibling?.tagName).toBe("MAIN");
  });
});
