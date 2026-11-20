import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RolValue } from "@prisma/client";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RUTA_DESCARGA_GUIA_API_PDF, RUTA_DESCARGA_POSTMAN } from "@/lib/ayuda/guia-api";

// SLT-80 «Guía de integración por API en la ayuda» — R1307, R1309, R1312 y R1315 sobre los dos
// handlers de descarga, llamados de verdad. Se dobla SOLO la sesión: el catálogo, el `.md`, el
// generador del PDF y la colección de Postman son los reales.
//
// ⚠️ El nombre del adjunto y los roles se comparan contra LITERALES del spec, no contra constantes
// del código: compararlos contra su propia fuente dejaría el test verde aunque cambiaran.

const { resolverActor, catalogo } = vi.hoisted(() => ({
  resolverActor: vi.fn(),
  catalogo: { inexistente: false },
}));

vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: resolverActor }));

// Para el caso «documento que no existe»: el catálogo real, salvo cuando el test lo apaga.
vi.mock("@/lib/ayuda/catalogo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ayuda/catalogo")>();
  return {
    ...real,
    leerDocumentoAyuda: async (slug: string) => (catalogo.inexistente ? null : real.leerDocumentoAyuda(slug)),
  };
});

const { GET: descargarPdf } = await import("@/app/(app)/ayuda/descargas/guia-integracion-api/route");
const { GET: descargarPostman } = await import("@/app/(app)/ayuda/descargas/postman/route");

const RAIZ = path.resolve(__dirname, "../../..");
const POSTMAN = path.join(RAIZ, "docs", "api", "servi-logistic-api-key.postman_collection.json");

const conRol = (rol: RolValue | null): void => {
  resolverActor.mockResolvedValue(rol === null ? null : { id: "u-slt80", rol });
};

/** Lo que lanza `notFound()` de Next: lo que el router convierte en el 404. */
function errorDeNotFound(): { digest?: string; message: string } {
  try {
    notFound();
  } catch (e) {
    return e as { digest?: string; message: string };
  }
  throw new Error("notFound() no lanzó");
}

async function rechazoDe(handler: () => Promise<Response>): Promise<{ digest?: string; message: string }> {
  try {
    const res = await handler();
    throw new Error(`SLT-80: se esperaba un 404 y el handler respondió ${res.status}`);
  } catch (e) {
    return e as { digest?: string; message: string };
  }
}

const HANDLERS = [
  ["PDF de la guía", () => descargarPdf()],
  ["colección de Postman", () => descargarPostman()],
] as const;

beforeEach(() => {
  catalogo.inexistente = false;
  resolverActor.mockReset();
});

describe("SLT-80 · descargas de la guía de integración (R1307, R1309, R1312, R1315)", () => {
  it("R1307 · CONTROL: `notFound()` lanza el error de 404 de Next (si no, todo lo de abajo es vacuo)", () => {
    expect(errorDeNotFound().digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  describe.each(HANDLERS)("%s", (_nombre, handler) => {
    it.each([null, "mensajero", "adminTienda", "adminSatelite"] as const)(
      "R1307 · %s → el mismo 404 que un documento que no existe",
      async (rol) => {
        conRol(rol);
        const sinPermiso = await rechazoDe(handler);

        catalogo.inexistente = true;
        conRol("maestro");
        const inexistente = await rechazoDe(handler);

        expect(sinPermiso.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
        expect(sinPermiso.digest).toBe(inexistente.digest);
        expect(sinPermiso.message).toBe(inexistente.message);
      },
    );
  });

  it.each(["maestro", "admin"] as const)(
    "R1309 · %s → 200, application/pdf, adjunto con el `actualizado` del frontmatter",
    async (rol) => {
      conRol(rol);
      const res = await descargarPdf();
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");

      const actualizado = /^actualizado:\s*(\S+)/m.exec(
        readFileSync(path.join(RAIZ, "docs", "ayuda", "oficina", "guia-integracion-api.md"), "utf8"),
      )?.[1];
      expect(actualizado, "SLT-80: la guía declara `actualizado`").toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.headers.get("Content-Disposition")).toBe(
        `attachment; filename="Guia-Integracion-API-Servi-Logistic-${actualizado}.pdf"`,
      );

      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder("latin1").decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(20_000);
    },
    60_000,
  );

  it.each(["maestro", "admin"] as const)(
    "R1312 · %s → 200 con los bytes EXACTOS de la colección del repositorio, como adjunto .json",
    async (rol) => {
      conRol(rol);
      const res = await descargarPostman();
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="[^"]+\.json"$/);
      expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);

      const recibido = Buffer.from(await res.arrayBuffer());
      const delDisco = readFileSync(POSTMAN);
      expect(delDisco.length, "SLT-80: la colección no está vacía").toBeGreaterThan(1000);
      expect(recibido.equals(delDisco)).toBe(true);
    },
  );

  it("R1312 · la colección viaja a producción con su ruta (si no, 500 en Vercel y verde en local)", async () => {
    const { default: nextConfig } = await import("@/next.config");
    expect(nextConfig.outputFileTracingIncludes?.[RUTA_DESCARGA_POSTMAN]).toEqual([
      "./docs/api/servi-logistic-api-key.postman_collection.json",
    ]);
  });

  it("R1315 · las rutas de descarga viven donde dicen las constantes que usan pantalla y enlaces", () => {
    // Literales del spec (R1308): si la constante cambiara sin mover la ruta, esto se pone rojo.
    expect(RUTA_DESCARGA_GUIA_API_PDF).toBe("/ayuda/descargas/guia-integracion-api");
    expect(RUTA_DESCARGA_POSTMAN).toBe("/ayuda/descargas/postman");
    for (const ruta of [RUTA_DESCARGA_GUIA_API_PDF, RUTA_DESCARGA_POSTMAN]) {
      expect(existsSync(path.join(RAIZ, "app", "(app)", ...ruta.split("/").filter(Boolean), "route.ts")), ruta).toBe(
        true,
      );
    }
  });
});
