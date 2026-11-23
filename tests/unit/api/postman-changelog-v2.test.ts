import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { openApiSpec } from "@/lib/api/openapi-spec";

// SLT-45 T7.2 (design §9; R35) — los otros dos artefactos del canal para v2: la colección de Postman
// tiene una carpeta «v2» con UNA petición por operación de v2, y el CHANGELOG tiene la entrada
// fechada que presenta v2 como aditiva y dice que v1 no cambia. Las operaciones esperadas salen del
// contrato publicado (`openApiSpec.paths`), cuyo censo firmado vive en
// `openapi-177-paths-pdf-y-carga-id.test.ts`: aquí se afirma que Postman las cubre todas.

const DIR_API = path.resolve(__dirname, "..", "..", "..", "docs", "api");
const CHANGELOG = fs.readFileSync(path.join(DIR_API, "CHANGELOG.md"), "utf8");
const TITULO_ENTRADA = "## 2026-11-xx — API v2 (aditiva): ubicación por nodo";

interface PostmanUrl {
  raw: string;
  host?: string[];
  path?: string[];
}

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: { method: string; url: PostmanUrl; header?: { key: string; value: string }[]; body?: { raw?: string } };
}

const coleccion = JSON.parse(
  fs.readFileSync(path.join(DIR_API, "servi-logistic-api-key.postman_collection.json"), "utf8"),
) as { item: PostmanItem[]; variable: { key: string }[]; auth: unknown };

const carpetaV2 = coleccion.item.find((i) => i.name === "v2");
const peticionesV2 = carpetaV2?.item ?? [];

/** Las operaciones de v2 del contrato, como `VERBO /path` con `{param}`. */
const OPERACIONES_V2 = Object.entries(openApiSpec.paths as unknown as Record<string, Record<string, unknown>>)
  .filter(([p]) => p.startsWith("/api/v2/"))
  .flatMap(([p, item]) => Object.keys(item).filter((k) => k !== "parameters").map((v) => `${v.toUpperCase()} ${p}`))
  .sort();

/** La operación que pide una petición de Postman: el path sin query y con `{{x}}` como `{x}`. */
function operacionDe(i: PostmanItem): string {
  const sinBase = (i.request?.url.raw ?? "").replace("{{baseUrl}}", "").split("?")[0];
  const comoContrato = sinBase.replace(/\/\{\{[^}]+\}\}/g, "/{id}");
  return `${i.request?.method} ${comoContrato}`;
}

/** La entrada del CHANGELOG, de su titulo a la siguiente. */
function entrada(): string {
  const desde = CHANGELOG.indexOf(TITULO_ENTRADA);
  if (desde === -1) return "";
  const hasta = CHANGELOG.indexOf("\n## ", desde + 1);
  return hasta === -1 ? CHANGELOG.slice(desde) : CHANGELOG.slice(desde, hasta);
}

describe("SLT-45 R35 — la colección de Postman tiene una petición por operación de v2", () => {
  it("anti-vacuidad: el contrato publica cinco operaciones de v2", () => {
    expect(OPERACIONES_V2).toHaveLength(5);
  });

  it("existe la carpeta «v2», sin subcarpetas, con exactamente una petición por operación", () => {
    expect(carpetaV2, "la colección no tiene la carpeta «v2»").toBeDefined();
    expect(peticionesV2.every((i) => i.item === undefined && i.request !== undefined)).toBe(true);
    expect(peticionesV2.map(operacionDe).sort()).toEqual(OPERACIONES_V2);
  });

  it("ninguna petición de v2 queda fuera de la carpeta, ni una de v1 dentro", () => {
    const fuera = coleccion.item.filter((i) => i.request?.url.raw.includes("/api/v2/"));
    expect(fuera).toEqual([]);
    for (const i of peticionesV2) expect(i.request?.url.raw).toMatch(/^\{\{baseUrl\}\}\/api\/v2\//);
  });

  it("usa las variables de la colección: ni URL real, ni clave, ni auth propia", () => {
    const variables = new Set(coleccion.variable.map((v) => v.key));
    for (const i of peticionesV2) {
      const raw = i.request?.url.raw ?? "";
      expect(i.request?.url.host).toEqual(["{{baseUrl}}"]);
      for (const m of raw.matchAll(/\{\{([^}]+)\}\}/g)) expect(variables, `variable desconocida ${m[1]}`).toContain(m[1]);
      expect(i).not.toHaveProperty("auth");
      expect(JSON.stringify(i)).not.toMatch(/svl_|Authorization|https?:\/\//);
    }
  });

  it("los cuerpos de ejemplo son JSON válido con la fila de v2 (ubicacion, sin la terna)", () => {
    const conCuerpo = peticionesV2.filter((i) => i.request?.method === "POST");
    expect(conCuerpo).toHaveLength(3);
    for (const i of conCuerpo) {
      expect(i.request?.header).toContainEqual({ key: "Content-Type", value: "application/json" });
      const cuerpo = JSON.parse(i.request?.body?.raw ?? "") as { ordenes?: Record<string, unknown>[]; orden?: Record<string, unknown> };
      const filas = cuerpo.ordenes ?? [cuerpo.orden ?? {}];
      expect(filas.length).toBeGreaterThan(0);
      for (const f of filas) {
        expect(Array.isArray(f.ubicacion) || typeof f.ubicacion_codigo === "string", i.name).toBe(true);
        for (const clave of ["provincia", "canton", "distrito"]) expect(f, i.name).not.toHaveProperty(clave);
      }
    }
  });
});

describe("SLT-45 R35 — el CHANGELOG presenta v2 como aditiva y dice que v1 no cambia", () => {
  it("la entrada existe, va arriba del todo y lleva la fecha de la release sin inventarla", () => {
    expect(entrada()).not.toBe("");
    const primera = [...CHANGELOG.matchAll(/^## .+$/gm)][0]?.[0];
    expect(primera).toBe(TITULO_ENTRADA);
  });

  it("dice que es aditiva y que v1 no cambia", () => {
    expect(entrada()).toContain("**Aditivo.**");
    expect(entrada()).toContain("v1 no cambia");
  });

  it("trae la tabla de operaciones con las cinco de v2", () => {
    const filas = entrada()
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| Operación") && !l.startsWith("|---"));
    expect(filas).toHaveLength(5);
    for (const op of OPERACIONES_V2) {
      const [verbo, ruta] = op.split(" ");
      expect(
        filas.some((f) => f.includes(`\`${verbo} ${ruta}`)),
        `la tabla no nombra ${op}`,
      ).toBe(true);
    }
  });
});
