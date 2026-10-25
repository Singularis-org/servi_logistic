import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// SL-36 (design §9.1; R23, R28, R30) — el composition root que NO inyecta: los clientes de Meta
// aceptan `fetchImpl` como OPCIONAL, asi que construir uno sin el `fetch` de la empresa compila, envia
// con el token correcto… y un 401 de Meta ya no deja la marca de R30. Nada falla a la vista.
//
// Dos capas:
//   1. ESTATICA: cada `new Whatsapp*Client(` de app/ y lib/ (fuera de lib/clients/) pasa `fetchImpl`,
//      y la lista de sitios es la esperada (un consumidor nuevo obliga a mirar esta tabla).
//   2. DINAMICA: la Meta de los cinco handlers de envios (`metaReal`) construida de verdad, con la
//      credencial de la empresa del job; un 401 al enviar y al subir deja la marca en ESA empresa.

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const CLIENTES = /new (WhatsappCloudClient|WhatsappMediaUploadClient|WhatsappMediaClient|WhatsappPlantillasClient|WhatsappSubidaReanudableClient)\(/g;

/** Los sitios que construyen clientes de Meta, con cuantos construye cada uno. */
const SITIOS_ESPERADOS: Record<string, number> = {
  "app/api/chat/media/[mensajeId]/route.ts": 1,
  "app/api/cron/sync-plantillas-whatsapp/route.ts": 1,
  "lib/actions/chat-whatsapp.ts": 2,
  "lib/actions/plantillas-sync.ts": 1,
  "lib/services/jobs/whatsapp-bienvenida-handler.ts": 1,
  "lib/services/jobs/whatsapp-chat-envio-handler.ts": 1,
  "lib/services/jobs/whatsapp-envio-deps.ts": 2,
  "lib/services/whatsapp/construir-template-port.ts": 2,
};

function archivos(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : archivos(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

/** El texto de los argumentos de la llamada que empieza en `desde` (hasta su parentesis de cierre). */
function argumentos(codigo: string, desde: number): string {
  const abre = codigo.indexOf("(", desde);
  let nivel = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === "(") nivel += 1;
    if (codigo[i] === ")" && --nivel === 0) return codigo.slice(abre + 1, i);
  }
  throw new Error("parentesis sin cerrar");
}

function construcciones(): { archivo: string; clase: string; args: string }[] {
  return [...archivos("app"), ...archivos("lib")]
    .filter((a) => !a.startsWith("lib/clients/"))
    .flatMap((archivo) => {
      const codigo = quitarComentarios(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      return [...codigo.matchAll(CLIENTES)].map((m) => ({ archivo, clase: m[1], args: argumentos(codigo, m.index ?? 0) }));
    });
}

describe("SL-36/R30 — cada cliente de Meta se construye con el fetch de la empresa (estático)", () => {
  const todas = construcciones();

  it("autocomprobación: el detector encuentra construcciones y ve la falta de fetchImpl", () => {
    expect(todas.length).toBeGreaterThan(5);
    const mutado = "x = new WhatsappCloudClient({ config, logger: consoleLogger });";
    const m = [...mutado.matchAll(CLIENTES)][0];
    expect(argumentos(mutado, m.index ?? 0)).not.toContain("fetchImpl");
  });

  it("⭑ ninguna construcción olvida `fetchImpl`", () => {
    const sinFetch = todas.filter((c) => !/\bfetchImpl\b/.test(c.args)).map((c) => `${c.archivo}: ${c.clase}`);
    expect(sinFetch).toEqual([]);
  });

  it("los sitios que construyen clientes son exactamente los revisados en SL-36", () => {
    const porArchivo: Record<string, number> = {};
    for (const c of todas) porArchivo[c.archivo] = (porArchivo[c.archivo] ?? 0) + 1;
    expect(porArchivo).toEqual(SITIOS_ESPERADOS);
  });
});

// ---- Capa dinamica -------------------------------------------------------------------------

const DOBLE = vi.hoisted(() => ({ marcas: [] as { servicio: string; codigo: string; contexto: unknown }[] }));

vi.mock("@/lib/repositories/IntegracionRepository", async () => {
  const { contextoActual } = await import("@/lib/db/contexto-empresa");
  return {
    IntegracionRepository: class {
      async porServicio(servicio: string) {
        return {
          id: "int-1",
          servicio,
          estado: "conectada",
          whatsappNumeroId: "111",
          datosPublicos: { wabaId: "222", nombreVisible: "n", telefonoVisible: "t", nombreVerificado: "v" },
          secretos: { token_acceso: "cifrado-token", app_secret: "cifrado-secreto" },
        };
      }
      async marcarError(servicio: string, codigo: string) {
        DOBLE.marcas.push({ servicio, codigo, contexto: contextoActual() });
      }
    },
  };
});

vi.mock("@/lib/crypto/boveda-integraciones", async (original) => ({
  ...(await original<typeof import("@/lib/crypto/boveda-integraciones")>()),
  BovedaIntegraciones: class {
    async descifrar(valor: string): Promise<string> {
      return valor.replace("cifrado-", "claro-");
    }
  },
}));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));

const { metaReal } = await import("@/lib/services/jobs/whatsapp-envio-deps");
const { conEmpresa } = await import("@/lib/db/contexto-empresa");

let red: ReturnType<typeof vi.spyOn>;
let avisos: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  DOBLE.marcas.length = 0;
  red = vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify({ error: { code: 190, type: "OAuthException" } }), { status: 401 }),
  );
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  red.mockRestore();
  avisos.mockRestore();
});

describe("SL-36/R23+R30 — la Meta de los envíos usa la credencial y el fetch de la empresa del job", () => {
  const marcaDeB = { servicio: "whatsapp", codigo: "whatsapp.credencial_rechazada", contexto: { tipo: "empresa", organizacionId: "org-b" } };

  it("⭑ enviar: va con el token de la empresa y un 401 la marca en ESA empresa", async () => {
    const meta = await conEmpresa("org-b", () => metaReal());
    await meta.enviador.enviarPlantilla("50688887777", "aviso", "es");
    const [url, init] = red.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/111/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer claro-token");
    expect(DOBLE.marcas).toEqual([marcaDeB]);
  });

  it("⭑ subir el PDF: un 401 también la marca", async () => {
    const meta = await conEmpresa("org-b", () => metaReal());
    await meta.subidor.subir({ mime: "application/pdf", nombre: "x.pdf", cuerpo: new Blob([new Uint8Array([1])]) });
    expect(DOBLE.marcas).toEqual([marcaDeB]);
  });
});
