import { afterEach, beforeEach, describe, it, expect, vi, type MockInstance } from "vitest";

import { deshacerGestion } from "@/lib/actions/cierre-dia";
import { conRegistroDeInvalidacion } from "@/lib/cache/registro-invalidacion";
import { crearAnaliticaCacheDeNext } from "@/lib/cache/next-analitica-cache";
import { defaultLogger } from "@/lib/errors/logger";
import type { IAnaliticaCache } from "@/lib/interfaces/external/IAnaliticaCache";
import type {
  DeshacerGestionServiceResult,
  ICierreDiaService,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-64 / T4.4 — R12, R14, R15, R16: deshacer una gestión invalida las lecturas de entregas.
//
// Este borde no ve por qué vía anuló el servicio (pendiente, cierre rechazado propio o legada): las
// tres devuelven el mismo `ok`, y eso es lo que aquí decide invalidar.

vi.mock("@/lib/cache/next-analitica-cache", () => ({ crearAnaliticaCacheDeNext: vi.fn() }));

const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };
const GESTION = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const ENTRADA = { gestionId: GESTION };
const OK: DeshacerGestionServiceResult = { status: "ok", ordenId: "o1" };

// Escrita a mano: es el contrato de R12. Derivarla de la constante estaría siempre verde.
const OCHO_ETIQUETAS = [
  "ciclo-vida",
  "cohorte-carga",
  "conteo-cargadas-por-dia",
  "conteo-devoluciones",
  "conteo-entregas",
  "conteo-hoy-gestion",
  "conteo-por-status",
  "conteo-productos",
];

function cacheEspia() {
  const invalidar = vi.fn<IAnaliticaCache["invalidar"]>(async () => {});
  const cache: IAnaliticaCache = { envolver: async (_c, _t, producir) => producir(), invalidar };
  return { cache, invalidar };
}

function serviceQueDevuelve(resultado: DeshacerGestionServiceResult) {
  const deshacer = vi.fn(async () => resultado);
  return { service: { deshacerGestion: deshacer } as unknown as ICierreDiaService, deshacer };
}

const getActor = async () => MENSAJERO;

let logError: MockInstance<(err: unknown) => void>;

beforeEach(() => {
  vi.mocked(crearAnaliticaCacheDeNext).mockReset();
  logError = vi.spyOn(defaultLogger, "logError").mockImplementation(() => {});
});

afterEach(() => {
  logError.mockRestore();
});

describe("R12, R16 · deshacer con éxito invalida", () => {
  it("una vez, con origen `correccion_gestion` y las ocho etiquetas", async () => {
    const { cache, invalidar } = cacheEspia();
    const { service } = serviceQueDevuelve(OK);

    const r = await deshacerGestion(ENTRADA, { service, getActor, cache });

    expect(r).toEqual(OK);
    expect(invalidar).toHaveBeenCalledTimes(1);
    const [origen, tags] = invalidar.mock.calls[0];
    expect(origen).toBe("correccion_gestion");
    expect([...tags].sort()).toEqual(OCHO_ETIQUETAS);
    expect(logError).not.toHaveBeenCalled();
  });

  it("R12: invalida después de la escritura y responde cuando la invalidación ya terminó", async () => {
    const orden: string[] = [];
    const cache: IAnaliticaCache = {
      envolver: async (_c, _t, producir) => producir(),
      invalidar: async () => {
        orden.push("invalidar-empieza");
        await new Promise((resolver) => setTimeout(resolver, 5));
        orden.push("invalidar-termina");
      },
    };
    const service = {
      deshacerGestion: async () => {
        orden.push("servicio");
        return OK;
      },
    } as unknown as ICierreDiaService;

    await deshacerGestion(ENTRADA, { service, getActor, cache });
    orden.push("respuesta");

    expect(orden).toEqual(["servicio", "invalidar-empieza", "invalidar-termina", "respuesta"]);
  });

  it("R16: el puerto con registro deja una línea con el origen y las ocho etiquetas", async () => {
    const { cache } = cacheEspia();
    const registrar = vi.fn();
    const { service } = serviceQueDevuelve(OK);

    await deshacerGestion(ENTRADA, {
      service,
      getActor,
      cache: conRegistroDeInvalidacion(cache, { registrar }),
    });

    expect(registrar).toHaveBeenCalledTimes(1);
    const registro = registrar.mock.calls[0][0] as { origen: string; tags: string[] };
    expect(Object.keys(registro).sort()).toEqual(["origen", "tags"]);
    expect(registro.origen).toBe("correccion_gestion");
    expect([...registro.tags].sort()).toEqual(OCHO_ETIQUETAS);
  });

  it("cableado: sin caché inyectada, la acción invalida con el puerto de producción", async () => {
    const { cache, invalidar } = cacheEspia();
    vi.mocked(crearAnaliticaCacheDeNext).mockReturnValue(cache);
    const { service } = serviceQueDevuelve(OK);

    const r = await deshacerGestion(ENTRADA, { service, getActor });

    expect(r).toEqual(OK);
    expect(crearAnaliticaCacheDeNext).toHaveBeenCalledTimes(1);
    expect(invalidar).toHaveBeenCalledTimes(1);
    expect(invalidar.mock.calls[0][0]).toBe("correccion_gestion");
  });
});

describe("R14 · si no se aplica, no invalida", () => {
  const NO_OK: readonly [string, DeshacerGestionServiceResult][] = [
    ["forbidden", { status: "forbidden" }],
    ["conflict", { status: "conflict", motivo: "ya deshecha" }],
    ["validation_error", { status: "validation_error", fieldErrors: { gestionId: ["x"] } }],
  ];

  it.each(NO_OK)("`%s` del servicio → cero invalidaciones", async (_nombre, resultado) => {
    const { cache, invalidar } = cacheEspia();
    const { service, deshacer } = serviceQueDevuelve(resultado);

    const r = await deshacerGestion(ENTRADA, { service, getActor, cache });

    expect(r).toEqual(resultado);
    expect(deshacer).toHaveBeenCalledTimes(1);
    expect(invalidar).not.toHaveBeenCalled();
    expect(crearAnaliticaCacheDeNext).not.toHaveBeenCalled();
  });

  it("`unauthenticated` → cero invalidaciones y el servicio no se toca", async () => {
    const { cache, invalidar } = cacheEspia();
    const { service, deshacer } = serviceQueDevuelve(OK);

    const r = await deshacerGestion(ENTRADA, { service, getActor: async () => null, cache });

    expect(r).toEqual({ status: "unauthenticated" });
    expect(deshacer).not.toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
  });

  it("`validation_error` del borde → cero invalidaciones y el servicio no se toca", async () => {
    const { cache, invalidar } = cacheEspia();
    const { service, deshacer } = serviceQueDevuelve(OK);

    const r = await deshacerGestion({ gestionId: "no-es-uuid" }, { service, getActor, cache });

    expect(r.status).toBe("validation_error");
    expect(deshacer).not.toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
  });
});

describe("R15 · si la invalidación falla, la respuesta sigue siendo la de la escritura", () => {
  const ORGANIZACION = "9c1b7c1e-4f3a-4a55-9f33-0d7a8f0c1234";

  function textoDelLog(): string {
    return logError.mock.calls
      .map(([e]) => (e instanceof Error ? `${e.message} ${e.stack ?? ""}` : String(e)))
      .join("\n");
  }

  it("una caché que lanza → `ok`, una línea en el log y sin ids", async () => {
    const cache: IAnaliticaCache = {
      envolver: async (_c, _t, producir) => producir(),
      invalidar: async () => {
        throw new TypeError(`revalidateTag falló en org:${ORGANIZACION}:ciclo-vida`);
      },
    };
    const { service } = serviceQueDevuelve(OK);

    const r = await deshacerGestion(ENTRADA, { service, getActor, cache });

    expect(r).toEqual(OK);
    expect(logError).toHaveBeenCalledTimes(1);
    const texto = textoDelLog();
    expect(texto).toContain("TypeError");
    expect(texto).not.toContain(ORGANIZACION);
    expect(texto).not.toContain(GESTION);
  });

  it("si falla CONSTRUIR el puerto → `ok` y una línea en el log", async () => {
    vi.mocked(crearAnaliticaCacheDeNext).mockImplementation(() => {
      throw new RangeError("sin configuración");
    });
    const { service } = serviceQueDevuelve(OK);

    const r = await deshacerGestion(ENTRADA, { service, getActor });

    expect(r).toEqual(OK);
    expect(crearAnaliticaCacheDeNext).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(textoDelLog()).toContain("RangeError");
  });
});
