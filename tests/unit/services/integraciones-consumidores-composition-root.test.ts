import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// SL-36 (design §9.1; R23, R28, R30) — EL COMPOSITION ROOT QUE NO INYECTA, para Maps, rutas y el
// asistente. Los tres clientes de Google y el de Anthropic aceptan la clave y el `fetch` como
// parametros sueltos: un builder que los arme con una clave de otro sitio, una cache de proceso o el
// `fetch` global compila, sale a la red… y o presta la clave de una empresa a otra (R28), o deja de
// marcar los rechazos (R30). Nada falla a la vista.
//
// Dos capas, como `whatsapp-composition-root.test.ts`:
//   1. ESTATICA: cada construccion de esos clientes y de sus services en app/ y lib/ (fuera de
//      lib/clients/) esta en un sitio revisado y recibe lo de la empresa.
//   2. DINAMICA: los builders de PRODUCCION, sin ninguna dependencia inyectada, con la base y la red
//      dobladas por debajo: cada job o peticion usa la clave de SU empresa y un rechazo la marca ahi.

const RAIZ = path.resolve(__dirname, "..", "..", "..");

function archivos(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : archivos(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

function argumentos(codigo: string, desde: number): string {
  const abre = codigo.indexOf("(", desde);
  let nivel = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === "(") nivel += 1;
    if (codigo[i] === ")" && --nivel === 0) return codigo.slice(abre + 1, i);
  }
  throw new Error("parentesis sin cerrar");
}

const FUENTES = [...archivos("app"), ...archivos("lib")]
  .filter((a) => !a.startsWith("lib/clients/"))
  .map((archivo) => ({ archivo, codigo: quitarComentarios(fs.readFileSync(path.join(RAIZ, archivo), "utf8")) }));

/** Cada `new <Clase>(` del arbol, con sus argumentos. */
function construccionesDe(clase: string): { archivo: string; args: string }[] {
  const re = new RegExp(`new ${clase}\\(`, "g");
  return FUENTES.flatMap(({ archivo, codigo }) =>
    [...codigo.matchAll(re)].map((m) => ({ archivo, args: argumentos(codigo, m.index ?? 0) })),
  );
}

/**
 * Por clase: donde se construye y que tiene que aparecer en sus argumentos. Un sitio nuevo obliga a
 * mirar esta tabla; un argumento que deje de ser el de la empresa la pone roja.
 */
const ESPERADO: Record<string, { archivo: string; debeLlevar: RegExp[] }[]> = {
  GoogleGeocodeClient: [
    { archivo: "lib/services/jobs/geocodificacion-handler.ts", debeLlevar: [/apiKey:\s*claveApi\b/] },
  ],
  GeocodificacionService: [
    {
      archivo: "lib/services/jobs/geocodificacion-handler.ts",
      debeLlevar: [/credencialesIntegracionReales\(\)/, /\bcrearCliente\b/],
    },
  ],
  RutasPorEmpresa: [
    {
      archivo: "lib/services/jobs/optimizacion-ruta-handler.ts",
      debeLlevar: [/credencialesIntegracionReales\(\)/],
    },
  ],
  GoogleRouteOptimizationClient: [
    {
      archivo: "lib/services/jobs/optimizacion-ruta-handler.ts",
      debeLlevar: [/projectId:\s*empresa\.projectId/, /getToken:\s*empresa\.getToken/, /fetchImpl:\s*empresa\.fetchOptimizacion/],
    },
  ],
  GoogleRoutesClient: [
    { archivo: "lib/services/jobs/optimizacion-ruta-handler.ts", debeLlevar: [/rutas\.deLaEmpresa\(\)/] },
  ],
  AnthropicAsistenteClient: [
    {
      archivo: "app/api/asistente/route.ts",
      debeLlevar: [/apiKey:\s*asistente\.claveApi/, /fetchImpl:\s*asistente\.fetchImpl/],
    },
  ],
};

describe("SL-36/R23 — Maps, rutas y asistente se construyen con lo de la empresa (estático)", () => {
  it("autocomprobación: el detector encuentra construcciones y ve un argumento que falta", () => {
    expect(FUENTES.length).toBeGreaterThan(100);
    const mutado = "x = new GoogleGeocodeClient({ apiKey: process.env.X ?? '', timeoutMs: 1 });";
    const m = [...mutado.matchAll(/new GoogleGeocodeClient\(/g)][0];
    expect(argumentos(mutado, m.index ?? 0)).not.toMatch(/apiKey:\s*claveApi\b/);
  });

  for (const [clase, sitios] of Object.entries(ESPERADO)) {
    it(`⭑ ${clase}: solo en los sitios revisados y con la credencial de la empresa`, () => {
      const encontradas = construccionesDe(clase);
      expect(encontradas.map((c) => c.archivo).sort()).toEqual(sitios.map((s) => s.archivo).sort());
      for (const { archivo, args } of encontradas) {
        const sitio = sitios.find((s) => s.archivo === archivo)!;
        for (const patron of sitio.debeLlevar) expect(args, `${archivo}: ${clase}`).toMatch(patron);
      }
    });
  }

  it("el token de rutas solo se arma en `rutas-de-la-empresa.ts` (la cache por empresa)", () => {
    const sitios = FUENTES.filter(
      ({ archivo, codigo }) => !archivo.startsWith("lib/auth/") && /\bconstruirTokenProvider\(/.test(codigo),
    ).map((f) => f.archivo);
    expect(sitios).toEqual(["lib/services/integraciones/rutas-de-la-empresa.ts"]);
  });
});

// ---- Capa dinamica -------------------------------------------------------------------------

function pem() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  }).privateKey;
}

const DOBLE = vi.hoisted(() => ({
  /** Lo guardado por empresa y servicio, ya «en claro» (la boveda doblada quita el prefijo). */
  guardado: {} as Record<string, Record<string, Record<string, string>>>,
  marcas: [] as { organizacionId: string | undefined; servicio: string; codigo: string }[],
  rutas: {} as object,
  paradas: {} as object,
}));

vi.mock("@/lib/repositories/IntegracionRepository", async () => {
  const { contextoActual } = await import("@/lib/db/contexto-empresa");
  const empresa = () => {
    const c = contextoActual();
    return c?.tipo === "empresa" ? c.organizacionId : undefined;
  };
  return {
    IntegracionRepository: class {
      async porServicio(servicio: string) {
        const secretos = DOBLE.guardado[empresa() ?? ""]?.[servicio];
        if (secretos === undefined) return null;
        return {
          id: `int-${servicio}-${empresa()}`,
          servicio,
          estado: "conectada",
          whatsappNumeroId: null,
          datosPublicos: {},
          secretos: Object.fromEntries(Object.entries(secretos).map(([k, v]) => [k, `cifrado:${v}`])),
        };
      }
      async marcarError(servicio: string, codigo: string) {
        DOBLE.marcas.push({ organizacionId: empresa(), servicio, codigo });
      }
    },
  };
});

vi.mock("@/lib/crypto/boveda-integraciones", async (original) => ({
  ...(await original<typeof import("@/lib/crypto/boveda-integraciones")>()),
  BovedaIntegraciones: class {
    async descifrar(valor: string): Promise<string> {
      return valor.slice("cifrado:".length);
    }
  },
}));

vi.mock("@/lib/db/prisma-client", () => ({ getPrismaClient: () => ({}) }));

const ORDEN = { id: "orden-1", direccion: "Calle 1", distritoNombre: "D", cantonNombre: "C", provinciaNombre: "P" };
vi.mock("@/lib/repositories/OrdenGeocodeRepository", () => ({
  OrdenGeocodeRepository: class {
    async findParaGeocodificar() {
      return ORDEN;
    }
    async guardarResultado() {}
  },
}));
vi.mock("@/lib/repositories/GeocodeCacheRepository", () => ({
  GeocodeCacheRepository: class {
    async findByHash() {
      return null;
    }
    async upsert() {}
  },
}));
vi.mock("@/lib/repositories/RutaOptimizadaRepository", () => ({
  RutaOptimizadaRepository: class {
    constructor() {
      return DOBLE.rutas;
    }
  },
}));
vi.mock("@/lib/repositories/OrdenRepository", () => ({
  OrdenRepository: class {
    constructor() {
      return DOBLE.paradas;
    }
  },
}));

const { buildGeocodificacionService } = await import("@/lib/services/jobs/geocodificacion-handler");
const { buildOptimizacionRutaService, crearOptimizacionRutaHandler } = await import(
  "@/lib/services/jobs/optimizacion-ruta-handler"
);
const { handleAsistente } = await import("@/app/api/asistente/route");
const { conEmpresa } = await import("@/lib/db/contexto-empresa");

const AHORA = new Date("2026-10-25T12:00:00.000Z");

let red: ReturnType<typeof vi.spyOn>;
let avisos: ReturnType<typeof vi.spyOn>;
let errores: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  DOBLE.guardado = {};
  DOBLE.marcas.length = 0;
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  red?.mockRestore();
  avisos.mockRestore();
  errores.mockRestore();
});

/** El `fetch` GLOBAL doblado: los builders de produccion no reciben otro. */
function redGlobal(responder: (url: string, init?: RequestInit) => Response) {
  red = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => responder(String(url), init));
  return red;
}

const jsonRes = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

function jobGeo() {
  return {
    id: "job-geo",
    tipo: "geocodificacion" as const,
    payload: { ordenId: "orden-1" },
    estado: "processing" as const,
    intentos: 1,
    maxIntentos: 8,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
  };
}

describe("SL-36/R23+R28+R30 — geocodificación: un service para todas, la clave de cada job", () => {
  it("⭑ dos jobs de dos empresas con el MISMO service: cada uno sale con SU clave", async () => {
    DOBLE.guardado = { "org-a": { google_maps: { clave_api: "maps-a" } }, "org-b": { google_maps: { clave_api: "maps-b" } } };
    const fetchGlobal = redGlobal(() => jsonRes(200, { status: "ZERO_RESULTS", results: [] }));
    const service = buildGeocodificacionService(() => AHORA);

    await conEmpresa("org-a", () => service.ejecutar(jobGeo()));
    await conEmpresa("org-b", () => service.ejecutar(jobGeo()));

    const claves = fetchGlobal.mock.calls.map((c: unknown[]) => new URL(String(c[0])).searchParams.get("key"));
    expect(claves).toEqual(["maps-a", "maps-b"]);
  });

  it("⭑ REQUEST_DENIED: la integración de ESA empresa queda marcada", async () => {
    DOBLE.guardado = { "org-b": { google_maps: { clave_api: "maps-b" } } };
    redGlobal(() => jsonRes(200, { status: "REQUEST_DENIED" }));
    const service = buildGeocodificacionService(() => AHORA);

    await expect(conEmpresa("org-b", () => service.ejecutar(jobGeo()))).rejects.toThrow();

    expect(DOBLE.marcas).toEqual([
      { organizacionId: "org-b", servicio: "google_maps", codigo: "google_maps.credencial_rechazada" },
    ]);
  });

  it("sin Google Maps en la empresa: ninguna llamada a la red", async () => {
    const fetchGlobal = redGlobal(() => jsonRes(200, {}));
    const service = buildGeocodificacionService(() => AHORA);

    await expect(conEmpresa("org-a", () => service.ejecutar(jobGeo()))).rejects.toThrow(/Google Maps no está configurado/);
    expect(fetchGlobal).not.toHaveBeenCalled();
  });
});

const PEM_A = pem();
const PEM_B = pem();
const claveRutas = (proyecto: string, email: string, privateKey: string) => ({
  clave_cuenta_servicio: JSON.stringify({ type: "service_account", project_id: proyecto, client_email: email, private_key: privateKey }),
});

function armarReposDeRutas() {
  const rutas = {
    findByMensajero: vi.fn(async () => null),
    upsertOrigen: vi.fn(async () => {}),
    reemplazarSecuencia: vi.fn(async () => {}),
    guardarTrazado: vi.fn(async () => {}),
    marcarTramoVivo: vi.fn(async () => {}),
    reducirSecuencia: vi.fn(async () => true),
    marcarDesactualizada: vi.fn(async () => {}),
  };
  DOBLE.rutas = rutas;
  DOBLE.paradas = {
    findParadasEnReparto: async () => [
      { ordenId: "o1", latitud: 9.9281, longitud: -84.0907, createdAt: AHORA },
      { ordenId: "o2", latitud: 9.9355, longitud: -84.0839, createdAt: AHORA },
      { ordenId: "o3", latitud: 9.9412, longitud: -84.1012, createdAt: AHORA },
    ],
  };
  return rutas;
}

function jobRuta() {
  return { ...jobGeo(), id: "job-ruta", tipo: "optimizacion_ruta" as const, payload: { mensajeroId: "m-1" } };
}

const emisorDe = (init?: RequestInit) => {
  const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
  return JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8")).iss as string;
};

describe("SL-36/R23+R28+R30 — optimización de rutas: un service para todas, el token de cada empresa", () => {
  it("⭑ dos jobs de dos empresas con el MISMO service: cada uno con SU cuenta y SU proyecto, y el 403 marca ESA empresa", async () => {
    DOBLE.guardado = {
      "org-a": { optimizacion_rutas: claveRutas("proyecto-a", "sa@a.iam.gserviceaccount.com", PEM_A) },
      "org-b": { optimizacion_rutas: claveRutas("proyecto-b", "sa@b.iam.gserviceaccount.com", PEM_B) },
    };
    armarReposDeRutas();
    const fetchGlobal = redGlobal((url, init) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonRes(200, { access_token: `tok-de-${emisorDe(init)}`, expires_in: 3600 });
      }
      return jsonRes(403, { error: { status: "PERMISSION_DENIED" } });
    });
    const handler = crearOptimizacionRutaHandler(buildOptimizacionRutaService(() => AHORA));

    await expect(conEmpresa("org-a", () => handler(jobRuta()))).rejects.toThrow();
    await expect(conEmpresa("org-b", () => handler(jobRuta()))).rejects.toThrow();

    const optimizaciones = fetchGlobal.mock.calls
      .filter((c: unknown[]) => String(c[0]).includes(":optimizeTours"))
      .map((c: unknown[]) => ({
        url: String(c[0]),
        token: ((c[1] as RequestInit).headers as Record<string, string>).authorization,
      }));
    expect(optimizaciones).toEqual([
      { url: expect.stringContaining("/projects/proyecto-a:optimizeTours"), token: "Bearer tok-de-sa@a.iam.gserviceaccount.com" },
      { url: expect.stringContaining("/projects/proyecto-b:optimizeTours"), token: "Bearer tok-de-sa@b.iam.gserviceaccount.com" },
    ]);
    expect(DOBLE.marcas).toEqual([
      { organizacionId: "org-a", servicio: "optimizacion_rutas", codigo: "optimizacion_rutas.permiso" },
      { organizacionId: "org-b", servicio: "optimizacion_rutas", codigo: "optimizacion_rutas.permiso" },
    ]);
  });

  it("⭑ invalid_grant en el intercambio: marca credencial_rechazada en ESA empresa", async () => {
    DOBLE.guardado = { "org-a": { optimizacion_rutas: claveRutas("proyecto-a", "sa@a.iam.gserviceaccount.com", PEM_A) } };
    armarReposDeRutas();
    redGlobal(() => jsonRes(400, { error: "invalid_grant" }));
    const handler = crearOptimizacionRutaHandler(buildOptimizacionRutaService(() => AHORA));

    await expect(conEmpresa("org-a", () => handler(jobRuta()))).rejects.toThrow();

    expect(DOBLE.marcas).toContainEqual({
      organizacionId: "org-a",
      servicio: "optimizacion_rutas",
      codigo: "optimizacion_rutas.credencial_rechazada",
    });
  });
});

describe("SL-36/R23+R30 — asistente: el borde real lee la clave de la empresa de la sesión", () => {
  const MENSAJERO = { usuarioId: "u-m", rol: "mensajero" as const, zonaId: null };
  const peticion = () =>
    new Request("https://app.test/api/asistente", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mensajes: [{ autor: "usuario", texto: "hola" }] }),
    });
  const usoRepo = { consumirUnaConsulta: async () => 1, contarNoLoSe: async () => undefined };

  it("⭑ sin inyectar las credenciales: la clave sale de la integración de la empresa, y un 401 la marca ahí", async () => {
    DOBLE.guardado = { "org-a": { asistente: { clave_api: "sk-a" } }, "org-b": { asistente: { clave_api: "sk-b" } } };
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 401 }));

    await handleAsistente(peticion(), {
      getActor: async () => MENSAJERO,
      empresaDeLaSesion: async () => "org-b",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      usoRepo,
    });

    const cabeceras = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(cabeceras["x-api-key"]).toBe("sk-b");
    expect(DOBLE.marcas).toEqual([
      { organizacionId: "org-b", servicio: "asistente", codigo: "asistente.credencial_rechazada" },
    ]);
  });
});
