import { afterEach, describe, expect, it } from "vitest";

import { baseUrlDeLaApp } from "@/lib/config/app-url";
import { baseUrlEnlace } from "@/lib/config/whatsapp-envios";

// SL-41 (design §8) — la URL base de la app sale de un solo sitio: la usan los correos (logo y
// enlace de bienvenida) y el aviso interno de WhatsApp, que delega aquí sin cambiar de conducta.

const VARS = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL"] as const;
const ORIG = new Map(VARS.map((v) => [v, process.env[v]]));

afterEach(() => {
  for (const v of VARS) {
    const original = ORIG.get(v);
    if (original === undefined) delete process.env[v];
    else process.env[v] = original;
  }
});

function fijar(app: string | undefined, site: string | undefined) {
  if (app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = app;
  if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = site;
}

describe("baseUrlDeLaApp", () => {
  it("con las dos variables usa NEXT_PUBLIC_APP_URL", () => {
    fijar("https://app.example.com", "https://www.example.com");
    expect(baseUrlDeLaApp()).toBe("https://app.example.com");
  });

  it("sin NEXT_PUBLIC_APP_URL cae en NEXT_PUBLIC_SITE_URL", () => {
    fijar(undefined, "https://www.example.com");
    expect(baseUrlDeLaApp()).toBe("https://www.example.com");
  });

  it("una NEXT_PUBLIC_APP_URL vacía cuenta como ausente", () => {
    fijar("   ", "https://www.example.com");
    expect(baseUrlDeLaApp()).toBe("https://www.example.com");
  });

  it("sin ninguna de las dos devuelve null, no una cadena vacía", () => {
    fijar(undefined, undefined);
    expect(baseUrlDeLaApp()).toBeNull();
    fijar("", " ");
    expect(baseUrlDeLaApp()).toBeNull();
  });

  it("quita la barra final, también si hay varias", () => {
    fijar("https://app.example.com/", undefined);
    expect(baseUrlDeLaApp()).toBe("https://app.example.com");
    fijar("https://app.example.com//", undefined);
    expect(baseUrlDeLaApp()).toBe("https://app.example.com");
  });

  it("baseUrlEnlace de WhatsApp devuelve lo mismo en cada caso", () => {
    const casos: Array<[string | undefined, string | undefined]> = [
      ["https://app.example.com/", "https://www.example.com"],
      [undefined, "https://www.example.com/"],
      [undefined, undefined],
    ];
    for (const [app, site] of casos) {
      fijar(app, site);
      expect(baseUrlEnlace()).toBe(baseUrlDeLaApp());
    }
  });
});
