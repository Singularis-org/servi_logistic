// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MARCA } from "@/lib/config/marca";

// Las fuentes y el `<Script>` de Next no corren fuera de su compilador: dobles mínimos.
vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "font-sans" }),
  JetBrains_Mono: () => ({ variable: "font-mono" }),
}));
vi.mock("next/script", () => ({ default: () => null }));

// Literal a propósito: es el contrato de R23. Compararlo solo contra `MARCA.nombre` seguiría
// verde aunque la constante cambiara.
const NOMBRE = "Servi Logistic";

async function cargarLayout() {
  return import("@/app/layout");
}

describe("app/layout.tsx — el nombre de la marca en la cabecera del documento (R23)", () => {
  it("el title es el nombre de la marca", async () => {
    const { metadata } = await cargarLayout();
    expect(metadata.title).toBe(NOMBRE);
    expect(metadata.title).toBe(MARCA.nombre);
  });

  it("la description contiene el nombre de la marca", async () => {
    const { metadata } = await cargarLayout();
    expect(typeof metadata.description).toBe("string");
    expect(metadata.description).toContain(NOMBRE);
  });

  it("apple-mobile-web-app-title lleva el nombre de la marca", async () => {
    // No vive en `metadata`: es un `<meta>` escrito a mano en el `<head>` del layout.
    const { default: RootLayout } = await cargarLayout();
    const html = renderToStaticMarkup(RootLayout({ children: null }));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const meta = doc.querySelector('meta[name="apple-mobile-web-app-title"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute("content")).toBe(NOMBRE);
  });
});
