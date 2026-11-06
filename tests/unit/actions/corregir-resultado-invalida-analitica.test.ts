import { afterEach, beforeEach, describe, it, expect, vi, type MockInstance } from "vitest";

import { corregirResultadoGestion } from "@/lib/actions/cierres-admin";
import { conRegistroDeInvalidacion } from "@/lib/cache/registro-invalidacion";
import { crearAnaliticaCacheDeNext } from "@/lib/cache/next-analitica-cache";
import { defaultLogger } from "@/lib/errors/logger";
import type { IAnaliticaCache } from "@/lib/interfaces/external/IAnaliticaCache";
import type {
  CorregirResultadoGestionServiceResult,
  ICierresAdminService,
} from "@/lib/interfaces/services/ICierresAdminService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-64 / T4.5 — R13, R14, R15, R16: corregir el resultado de una gestión invalida las lecturas de
// entregas. El caso «cableado» comprueba que la acción PASA el puerto de producción a la invalidación
// cuando nadie inyecta otro: importarlo no basta (memoria «composition root que no inyecta»).

vi.mock("@/lib/cache/next-analitica-cache", () => ({ crearAnaliticaCacheDeNext: vi.fn() }));

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const GESTION = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const ENTRADA = { gestionId: GESTION, motivo: "el cliente rechazo el paquete" };
const OK: CorregirResultadoGestionServiceResult = {
  status: "ok",
  gestionId: GESTION,
  totales: { efectivo: "6000.00", simpe: "4000.00", transferencia: "0.00", general: "10000.00" },
};

// Escrita a mano: es el contrato de R13. Derivarla de la constante estaría siempre verde.
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

function serviceQueDevuelve(resultado: CorregirResultadoGestionServiceResult) {
  const corregir = vi.fn(async () => resultado);
  return {
    service: { corregirResultadoGestion: corregir } as unknown as ICierresAdminService,
    corregir,
  };
}

const getActor = async () => MAESTRO;

let logError: MockInstance<(err: unknown) => void>;

beforeEach(() => {
  vi.mocked(crearAnaliticaCacheDeNext).mockReset();
  logError = vi.spyOn(defaultLogger, "logError").mockImplementation(() => {});
});

afterEach(() => {
  logError.mockRestore();
});

describe("R13, R16 · corregir con éxito invalida", () => {
  it("una vez, con origen `correccion_gestion` y las ocho etiquetas", async () => {
    const { cache, invalidar } = cacheEspia();
    const { service } = serviceQueDevuelve(OK);

    const r = await corregirResultadoGestion(ENTRADA, { service, getActor, cache });

    expect(r).toEqual(OK);
    expect(invalidar).toHaveBeenCalledTimes(1);
    const [origen, tags] = invalidar.mock.calls[0];
    expect(origen).toBe("correccion_gestion");
    expect([...tags].sort()).toEqual(OCHO_ETIQUETAS);
    expect(logError).not.toHaveBeenCalled();
  });

  it("R13: invalida después de la escritura y responde cuando la invalidación ya terminó", async () => {
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
      corregirResultadoGestion: async () => {
        orden.push("servicio");
        return OK;
      },
    } as unknown as ICierresAdminService;

    await corregirResultadoGestion(ENTRADA, { service, getActor, cache });
    orden.push("respuesta");

    expect(orden).toEqual(["servicio", "invalidar-empieza", "invalidar-termina", "respuesta"]);
  });

  it("R16: el puerto con registro deja una línea con el origen y las ocho etiquetas", async () => {
    const { cache } = cacheEspia();
    const registrar = vi.fn();
    const { service } = serviceQueDevuelve(OK);

    await corregirResultadoGestion(ENTRADA, {
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

    const r = await corregirResultadoGestion(ENTRADA, { service, getActor });

    expect(r).toEqual(OK);
    expect(crearAnaliticaCacheDeNext).toHaveBeenCalledTimes(1);
    expect(invalidar).toHaveBeenCalledTimes(1);
    expect(invalidar.mock.calls[0][0]).toBe("correccion_gestion");
  });
});

describe("R14 · si no se aplica, no invalida", () => {
  const NO_OK: readonly [string, CorregirResultadoGestionServiceResult][] = [
    ["forbidden", { status: "forbidden" }],
    ["conflict", { status: "conflict" }],
    ["no_encontrada", { status: "no_encontrada" }],
    ["validation_error", { status: "validation_error", fieldErrors: { motivo: ["x"] } }],
  ];

  it.each(NO_OK)("`%s` del servicio → cero invalidaciones", async (_nombre, resultado) => {
    const { cache, invalidar } = cacheEspia();
    const { service, corregir } = serviceQueDevuelve(resultado);

    const r = await corregirResultadoGestion(ENTRADA, { service, getActor, cache });

    expect(r).toEqual(resultado);
    expect(corregir).toHaveBeenCalledTimes(1);
    expect(invalidar).not.toHaveBeenCalled();
    expect(crearAnaliticaCacheDeNext).not.toHaveBeenCalled();
  });

  it("`unauthenticated` → cero invalidaciones y el servicio no se toca", async () => {
    const { cache, invalidar } = cacheEspia();
    const { service, corregir } = serviceQueDevuelve(OK);

    const r = await corregirResultadoGestion(ENTRADA, {
      service,
      getActor: async () => null,
      cache,
    });

    expect(r).toEqual({ status: "unauthenticated" });
    expect(corregir).not.toHaveBeenCalled();
    expect(invalidar).not.toHaveBeenCalled();
  });

  it("`validation_error` del borde → cero invalidaciones y el servicio no se toca", async () => {
    const { cache, invalidar } = cacheEspia();
    const { service, corregir } = serviceQueDevuelve(OK);

    const r = await corregirResultadoGestion({ gestionId: "no-es-uuid" }, { service, getActor, cache });

    expect(r.status).toBe("validation_error");
    expect(corregir).not.toHaveBeenCalled();
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

    const r = await corregirResultadoGestion(ENTRADA, { service, getActor, cache });

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

    const r = await corregirResultadoGestion(ENTRADA, { service, getActor });

    expect(r).toEqual(OK);
    expect(crearAnaliticaCacheDeNext).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(textoDelLog()).toContain("RangeError");
  });
});
