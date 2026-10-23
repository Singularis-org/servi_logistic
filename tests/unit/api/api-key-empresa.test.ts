import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import { hashApiKey } from "@/lib/utils/api-key-hash";

// SL-17 · R13 — la empresa de una peticion por API key es la de la key.
//
// El cliente de Prisma es un doble que reconoce dos lecturas de `api_key` —la del autenticador
// (por `keyHash`) y la de la empresa (por `id`)— y anota el contexto con el que se hizo cada una.
// Asi se ve a la vez QUE empresa sale de la key y que se leyo en plataforma, porque todavia no hay
// empresa con la que leer.

interface FilaKey {
  id: string;
  secreto: string;
  organizacionId: string | null;
}

const KEYS: FilaKey[] = [
  { id: "key-a", secreto: "svl_secreto_empresa_a_000001", organizacionId: "org-a" },
  { id: "key-b", secreto: "svl_secreto_empresa_b_000002", organizacionId: "org-b" },
  { id: "key-huerfana", secreto: "svl_secreto_sin_empresa_0003", organizacionId: null },
];

const lecturas: { por: "keyHash" | "id"; contexto: ContextoDatos | undefined }[] = [];

function filaPorHash(keyHash: string) {
  const fila = KEYS.find((k) => hashApiKey(k.secreto) === keyHash);
  if (!fila) return null;
  return {
    id: fila.id,
    estado: "activa",
    usuarioId: `usuario-${fila.id}`,
    usuario: { estado: "activo", rol: { value: "apiKey" } },
    tiendaDestinoId: null,
    tiendaDestino: null,
  };
}

const prismaDoble = {
  apiKey: {
    findUnique: vi.fn(async (args: { where: { keyHash?: string; id?: string } }) => {
      if (args.where.keyHash !== undefined) {
        lecturas.push({ por: "keyHash", contexto: contextoActual() });
        return filaPorHash(args.where.keyHash);
      }
      lecturas.push({ por: "id", contexto: contextoActual() });
      const fila = KEYS.find((k) => k.id === args.where.id);
      return fila ? { organizacionId: fila.organizacionId } : null;
    }),
  },
};

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => prismaDoble,
}));

const { buildAutenticar, conEmpresaDeLaKey } = await import("@/lib/api/api-key-request");
const { handleListadoApi } = await import("@/app/api/ordenes/api-key/route");
const { handleCancelarApi } = await import("@/app/api/ordenes/api-key/[numGuia]/cancelar/route");
const { handleCotizacionApi } = await import("@/app/api/ordenes/api-key/cotizacion/route");

function peticion(secreto: string | null, url = "https://x/api/ordenes/api-key", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (secreto !== null) headers.set("authorization", `Bearer ${secreto}`);
  return new Request(url, { ...init, headers });
}

/** Servicio de lectura que solo apunta con que contexto se le llamo. */
function lecturaQueAnota() {
  const vistos: (ContextoDatos | undefined)[] = [];
  return {
    vistos,
    service: {
      listar: vi.fn(async () => {
        vistos.push(contextoActual());
        return { items: [], pagination: { limit: 50, offset: 0, total: 0 } };
      }),
      detallePorOrdenId: vi.fn(),
    },
  };
}

beforeEach(() => {
  lecturas.length = 0;
  prismaDoble.apiKey.findUnique.mockClear();
});

describe("SL-17 · R13 — buildAutenticar devuelve la empresa de la key", () => {
  it("una key valida sale `ok` con el organizacionId de su fila", async () => {
    const resultado = await buildAutenticar()(KEYS[0].secreto);

    expect(resultado).toMatchObject({ status: "ok", apiKeyId: "key-a", organizacionId: "org-a" });
  });

  it("dos keys de dos empresas devuelven cada una la suya", async () => {
    const autenticar = buildAutenticar();
    const a = await autenticar(KEYS[0].secreto);
    const b = await autenticar(KEYS[1].secreto);

    expect(a.status === "ok" && a.organizacionId).toBe("org-a");
    expect(b.status === "ok" && b.organizacionId).toBe("org-b");
  });

  it("las dos lecturas de la key se hacen en plataforma (SL-17), no sin contexto", async () => {
    await buildAutenticar()(KEYS[0].secreto);

    expect(lecturas.map((l) => l.por)).toEqual(["keyHash", "id"]);
    for (const { contexto } of lecturas) {
      expect(contexto).toEqual({ tipo: "plataforma", ficha: "SL-17", motivo: "resolver la API key" });
    }
  });

  it("una key sin empresa responde `unauthenticated`, no `ok`", async () => {
    expect(await buildAutenticar()(KEYS[2].secreto)).toEqual({ status: "unauthenticated" });
  });

  it("una key desconocida no llega a buscar empresa", async () => {
    expect(await buildAutenticar()("svl_que_no_existe_en_la_base")).toEqual({
      status: "unauthenticated",
    });
    expect(lecturas.map((l) => l.por)).toEqual(["keyHash"]);
  });
});

describe("SL-17 · R13 — la ruta ejecuta su cuerpo con la empresa de la key", () => {
  it("cadena real: el listado con la key de A corre con A, y con la de B corre con B", async () => {
    const lectura = lecturaQueAnota();

    const resA = await handleListadoApi(peticion(KEYS[0].secreto), { lecturaService: lectura.service });
    const resB = await handleListadoApi(peticion(KEYS[1].secreto), { lecturaService: lectura.service });

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(lectura.vistos).toEqual([
      { tipo: "empresa", organizacionId: "org-a" },
      { tipo: "empresa", organizacionId: "org-b" },
    ]);
  });

  it("una key sin empresa responde 401 y el cuerpo no se ejecuta", async () => {
    const lectura = lecturaQueAnota();

    const res = await handleListadoApi(peticion(KEYS[2].secreto), { lecturaService: lectura.service });

    expect(res.status).toBe(401);
    expect(lectura.service.listar).not.toHaveBeenCalled();
  });

  it("la cancelacion opera con la empresa que trae el autenticador", async () => {
    let visto: ContextoDatos | undefined;
    const res = await handleCancelarApi(peticion("svl_cualquiera"), "10234", {
      autenticar: async () => ({
        status: "ok",
        apiKeyId: "key-c",
        actor: { usuarioId: "u-c", rol: "apiKey" },
        organizacionId: "org-c",
      }),
      cancelacionService: {
        cancelar: vi.fn(async () => {
          visto = contextoActual();
          return { status: "not_found" as const };
        }),
      },
    });

    // `not_found` del service: lo que importa aqui es con que empresa se le llamo, no el 404.
    expect(res.status).toBe(404);
    expect(visto).toEqual({ tipo: "empresa", organizacionId: "org-c" });
  });

  it("la cotizacion opera con la empresa que trae el autenticador", async () => {
    let visto: ContextoDatos | undefined;
    const res = await handleCotizacionApi(
      peticion("svl_cualquiera", "https://x/api/ordenes/api-key/cotizacion", {
        method: "POST",
        body: JSON.stringify({ ordenes: [{ destinatario: "Ana" }] }),
        headers: { "content-type": "application/json" },
      }),
      {
        autenticar: async () => ({
          status: "ok",
          apiKeyId: "key-d",
          actor: { usuarioId: "u-d", rol: "apiKey" },
          organizacionId: "org-d",
        }),
        cotizacionService: {
          cotizar: vi.fn(async () => {
            visto = contextoActual();
            return { status: "forbidden" as const };
          }),
        },
      },
    );

    // `forbidden` del service: lo que importa aqui es con que empresa se le llamo, no el 403.
    expect(res.status).toBe(403);
    expect(visto).toEqual({ tipo: "empresa", organizacionId: "org-d" });
  });

  it("conEmpresaDeLaKey fija la empresa de la key y nada mas", async () => {
    const visto = await conEmpresaDeLaKey({ organizacionId: "org-e" }, async () => contextoActual());
    expect(visto).toEqual({ tipo: "empresa", organizacionId: "org-e" });
  });
});

describe("SL-17 · R13 — las 9 rutas de API key envuelven su cuerpo", () => {
  const RUTAS = [
    "app/api/ordenes/api-key/route.ts",
    "app/api/ordenes/api-key/[numGuia]/cancelar/route.ts",
    "app/api/ordenes/api-key/orden/[id]/route.ts",
    "app/api/ordenes/api-key/orden/[id]/generate/route.ts",
    "app/api/ordenes/api-key/habilitar/route.ts",
    "app/api/ordenes/api-key/cotizacion/route.ts",
    "app/api/ordenes/api-key/carga/route.ts",
    "app/api/ordenes/api-key/carga/[cargaId]/generate/route.ts",
    "app/api/ordenes/api-key/analitica/route.ts",
  ];

  // Cuenta en el codigo, no en los comentarios: una cita en un comentario no envuelve nada.
  const codigo = (rel: string) =>
    readFileSync(path.resolve(process.cwd(), rel), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");

  for (const rel of RUTAS) {
    it(`${rel}: cada handler que autentica abre el contexto de la key justo despues`, () => {
      const fuente = codigo(rel);
      const autentican = fuente.match(/deps\.autenticar \?\? buildAutenticar\(\)/g)?.length ?? 0;
      const envuelven = fuente.match(/return conEmpresaDeLaKey\(auth, async \(\) => \{/g)?.length ?? 0;

      expect(autentican).toBeGreaterThan(0);
      expect(envuelven).toBe(autentican);
      // Ninguna ruta conserva un autenticador propio que se salte la empresa.
      expect(fuente).not.toMatch(/function buildAutenticar\(/);
    });
  }
});
