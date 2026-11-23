import { describe, expect, it, vi } from "vitest";

import {
  pedirIdempotente,
  pedirUnaVez,
  traducirFalla,
  type FallaProveedor,
  type TransporteDeps,
} from "@/lib/clients/cobro/http-proveedor";
import { RebillProveedorCobro } from "@/lib/clients/cobro/rebill-proveedor";
import { RegistroProveedoresCobro } from "@/lib/clients/cobro/registro-proveedores";
import { entornoDeCobro, ESPERAS_REINTENTO_CONSULTA_MS, TIEMPO_MAXIMO_COBRO_MS } from "@/lib/config/cobro";
import type { LeerCredencialesCobro } from "@/lib/interfaces/external/IProveedorCobro";
import {
  ProveedorCobroError,
  type CodigoErrorProveedor,
  type OperacionProveedor,
  type ProveedorCobroId,
} from "@/lib/types/cobro";

// SLT-227 — el transporte (design §5), el entorno (§2) y el registro (§7), sin red: `fetch` y `esperar` son dobles,
// y ningún test espera de verdad. El host es inventado (`.invalid`): ningún test nombra el de Rebill (R26).

const URL_DOBLE = "http://rebill-doble.invalid/v3/payments/pay_1";

type Paso = number | "red" | "colgado";

/** Un `fetch` que responde los pasos en orden; `colgado` no responde nunca y solo lo corta la `signal`. */
function fetchDoble(...pasos: Paso[]) {
  let i = 0;
  const llamadas: RequestInit[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    llamadas.push(init ?? {});
    const paso = pasos[Math.min(i++, pasos.length - 1)];
    if (paso === "red") throw new TypeError(`fetch failed ${String(_url)}`);
    if (paso === "colgado") {
      return new Promise<Response>((_resolver, rechazar) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => rechazar(signal.reason));
      });
    }
    return new Response(paso >= 200 && paso <= 299 ? JSON.stringify({ id: "pay_1" }) : "{\"apiKey\":\"sk_x\"}", {
      status: paso,
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, llamadas, veces: () => fetchImpl.mock.calls.length };
}

function transporte(fetchImpl: typeof fetch, extra: Partial<TransporteDeps> = {}) {
  const esperas: number[] = [];
  const deps: TransporteDeps = {
    fetchImpl,
    esperar: async (ms) => {
      esperas.push(ms);
    },
    tiempoMaximoMs: TIEMPO_MAXIMO_COBRO_MS,
    esperasReintentoMs: ESPERAS_REINTENTO_CONSULTA_MS,
    ...extra,
  };
  return { deps, esperas };
}

async function errorDe(promesa: Promise<unknown>): Promise<ProveedorCobroError> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProveedorCobroError);
  return error as ProveedorCobroError;
}

const GET: RequestInit = { method: "GET" };
const POST: RequestInit = { method: "POST", body: "{}" };

describe("R3: el entorno es produccion solo con VERCEL_ENV=production", () => {
  it.each<[string, Record<string, string | undefined>, string]>([
    ["producción", { VERCEL_ENV: "production" }, "produccion"],
    ["preview", { VERCEL_ENV: "preview" }, "sandbox"],
    ["local, sin VERCEL_ENV", {}, "sandbox"],
    ["el E2E de CI: NODE_ENV=production sin VERCEL_ENV", { NODE_ENV: "production" }, "sandbox"],
    ["development en Vercel", { VERCEL_ENV: "development", NODE_ENV: "production" }, "sandbox"],
  ])("%s ⇒ %s", (_caso, env, esperado) => {
    expect(entornoDeCobro(env)).toBe(esperado);
  });
});

describe("R20: una petición que pasa del tiempo máximo se corta con tiempo_agotado", () => {
  it("el fetch doble que respeta la signal se corta y da tiempo_agotado, sin esperar el tiempo real", async () => {
    const { fetchImpl, llamadas } = fetchDoble("colgado");
    const { deps } = transporte(fetchImpl, { tiempoMaximoMs: 20 });

    const error = await errorDe(pedirUnaVez(deps, "rebill", "crearEnlace", URL_DOBLE, POST));

    expect(error.codigo).toBe("tiempo_agotado");
    expect(llamadas[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(llamadas[0]?.signal?.aborted).toBe(true);
  });

  it("cada intento de la consulta lleva su propia signal con el tiempo máximo", async () => {
    const { fetchImpl, llamadas } = fetchDoble("colgado", "colgado", 200);
    const { deps, esperas } = transporte(fetchImpl, { tiempoMaximoMs: 20 });

    const respuesta = await pedirIdempotente(deps, "rebill", "consultarPago", URL_DOBLE, GET);

    expect(respuesta).toEqual({ estado: 200, cuerpo: { id: "pay_1" } });
    expect(llamadas).toHaveLength(3);
    expect(new Set(llamadas.map((l) => l.signal)).size).toBe(3);
    expect(esperas).toEqual([250, 1000]);
  });
});

describe("R21: consultarPago con 503, 503 y 200 hace 3 peticiones y espera [250, 1000]; con tres 503, proveedor_caido", () => {
  it("503, 503 y 200 ⇒ devuelve el cuerpo tras 3 peticiones y 2 esperas crecientes", async () => {
    const doble = fetchDoble(503, 503, 200);
    const { deps, esperas } = transporte(doble.fetchImpl);

    const respuesta = await pedirIdempotente(deps, "rebill", "consultarPago", URL_DOBLE, GET);

    expect(respuesta.cuerpo).toEqual({ id: "pay_1" });
    expect(doble.veces()).toBe(3);
    expect(esperas).toEqual([250, 1000]);
  });

  it("tres 503 ⇒ proveedor_caido tras 3 peticiones, reintentable y nunca incierto", async () => {
    const doble = fetchDoble(503, 503, 503);
    const { deps, esperas } = transporte(doble.fetchImpl);

    const error = await errorDe(pedirIdempotente(deps, "rebill", "consultarPago", URL_DOBLE, GET));

    expect(error.codigo).toBe("proveedor_caido");
    expect(error.estadoHttp).toBe(503);
    expect(error.reintentable).toBe(true);
    expect(error.incierto).toBe(false);
    expect(doble.veces()).toBe(3);
    expect(esperas).toEqual([250, 1000]);
  });

  it.each<[string, Paso, CodigoErrorProveedor]>([
    ["429", 429, "limite_de_peticiones"],
    ["fallo de red", "red", "sin_conexion"],
  ])("también reintenta ante %s", async (_caso, paso, codigo) => {
    const doble = fetchDoble(paso, paso, paso);
    const { deps } = transporte(doble.fetchImpl);

    const error = await errorDe(pedirIdempotente(deps, "rebill", "consultarPago", URL_DOBLE, GET));

    expect(error.codigo).toBe(codigo);
    expect(doble.veces()).toBe(3);
  });

  it("pedirIdempotente no admite un método con efecto, sin hacer ninguna petición", async () => {
    const doble = fetchDoble(200);
    const { deps } = transporte(doble.fetchImpl);

    await expect(pedirIdempotente(deps, "rebill", "devolver", URL_DOBLE, POST)).rejects.toThrow(/solo admite GET/);
    expect(doble.veces()).toBe(0);
  });
});

describe("R22: crearEnlace y devolver hacen una sola petición, y la falla con efecto posible es incierta", () => {
  it.each<[OperacionProveedor, Paso, CodigoErrorProveedor]>([
    ["devolver", 503, "proveedor_caido"],
    ["crearEnlace", 503, "proveedor_caido"],
    ["devolver", "red", "sin_conexion"],
    ["crearEnlace", "red", "sin_conexion"],
  ])("%s con %s ⇒ 1 petición, %s e incierto", async (operacion, paso, codigo) => {
    const doble = fetchDoble(paso, 200);
    const { deps, esperas } = transporte(doble.fetchImpl);

    const error = await errorDe(pedirUnaVez(deps, "rebill", operacion, URL_DOBLE, POST));

    expect(doble.veces()).toBe(1);
    expect(esperas).toEqual([]);
    expect(error.codigo).toBe(codigo);
    expect(error.incierto).toBe(true);
  });
});

describe("R23: un 401, un 404 o un 422 no se reintentan", () => {
  it.each<[number, CodigoErrorProveedor]>([
    [401, "credencial_rechazada"],
    [403, "credencial_rechazada"],
    [404, "no_encontrado"],
    [422, "solicitud_rechazada"],
  ])("consultarPago con %i ⇒ 1 petición y %s", async (estado, codigo) => {
    const doble = fetchDoble(estado, 200);
    const { deps, esperas } = transporte(doble.fetchImpl);

    const error = await errorDe(pedirIdempotente(deps, "rebill", "consultarPago", URL_DOBLE, GET));

    expect(doble.veces()).toBe(1);
    expect(esperas).toEqual([]);
    expect(error.codigo).toBe(codigo);
    expect(error.estadoHttp).toBe(estado);
  });

  it("un 200 que no es JSON ⇒ respuesta_invalida al primer intento", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    const { deps } = transporte(fetchImpl);

    const error = await errorDe(pedirIdempotente(deps, "rebill", "consultarPago", URL_DOBLE, GET));

    expect(error.codigo).toBe("respuesta_invalida");
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(1);
  });
});

describe("R24: la tabla de traducción da el código, reintentable e incierto de cada falla", () => {
  // [falla, código, reintentable, incierto en crearEnlace/devolver]. La consulta nunca es incierta.
  const TABLA: Array<[string, FallaProveedor, CodigoErrorProveedor, boolean, boolean]> = [
    ["401", { tipo: "http", estadoHttp: 401 }, "credencial_rechazada", false, false],
    ["403", { tipo: "http", estadoHttp: 403 }, "credencial_rechazada", false, false],
    ["404", { tipo: "http", estadoHttp: 404 }, "no_encontrado", false, false],
    ["400", { tipo: "http", estadoHttp: 400 }, "solicitud_rechazada", false, false],
    ["422", { tipo: "http", estadoHttp: 422 }, "solicitud_rechazada", false, false],
    ["429", { tipo: "http", estadoHttp: 429 }, "limite_de_peticiones", true, false],
    ["500", { tipo: "http", estadoHttp: 500 }, "proveedor_caido", true, true],
    ["503", { tipo: "http", estadoHttp: 503 }, "proveedor_caido", true, true],
    ["tiempo agotado", { tipo: "tiempo_agotado" }, "tiempo_agotado", true, true],
    ["red", { tipo: "sin_conexion" }, "sin_conexion", true, true],
    ["respuesta sin forma", { tipo: "respuesta_invalida" }, "respuesta_invalida", false, false],
    ["bóveda ilegible", { tipo: "credencial_ilegible" }, "credencial_ilegible", false, false],
  ];

  const OPERACIONES: OperacionProveedor[] = ["crearEnlace", "consultarPago", "verificarFirma", "devolver"];

  it.each(TABLA)("%s", (_caso, falla, codigo, reintentable, inciertoConEfecto) => {
    for (const operacion of OPERACIONES) {
      const error = traducirFalla("rebill", operacion, falla);
      const conEfecto = operacion === "crearEnlace" || operacion === "devolver";
      expect({ codigo: error.codigo, reintentable: error.reintentable, incierto: error.incierto }).toEqual({
        codigo,
        reintentable,
        incierto: conEfecto && inciertoConEfecto,
      });
      expect(error.proveedor).toBe("rebill");
      expect(error.operacion).toBe(operacion);
    }
  });

  it("el error lleva la operación y el estado HTTP en el mensaje, y nada del cuerpo", async () => {
    const doble = fetchDoble(503);
    const { deps } = transporte(doble.fetchImpl);

    const error = await errorDe(pedirUnaVez(deps, "rebill", "devolver", URL_DOBLE, POST));

    expect(error.message).toBe("rebill devolver: proveedor_caido (HTTP 503)");
    expect(JSON.stringify(error)).not.toContain("sk_x");
    expect(error.cause).toBeUndefined();
  });

  it("el fallo de red no arrastra el mensaje de fetch, que trae la URL", async () => {
    const doble = fetchDoble("red");
    const { deps } = transporte(doble.fetchImpl);

    const error = await errorDe(pedirUnaVez(deps, "rebill", "crearEnlace", URL_DOBLE, POST));

    expect(`${error.message} ${error.stack ?? ""} ${JSON.stringify(error)}`).not.toContain("rebill-doble.invalid");
  });
});

describe("R2: el registro da el adaptador de rebill para CR; wompi y global66 dan proveedor_no_disponible sin leer credenciales", () => {
  function registro(entorno: "sandbox" | "produccion" = "sandbox") {
    const leerCredenciales = vi.fn<LeerCredencialesCobro>(async () => null);
    const doble = fetchDoble(200);
    const { deps } = transporte(doble.fetchImpl);
    const reg = new RegistroProveedoresCobro({
      entorno,
      leerCredenciales,
      transporte: deps,
      urlsBase: { rebill: "http://rebill-doble.invalid" },
    });
    return { reg, leerCredenciales, doble };
  }

  it("rebill para CR ⇒ el adaptador de Rebill, ligado a CR y al entorno del registro", () => {
    const { reg, leerCredenciales, doble } = registro("produccion");

    const adaptador = reg.obtener("rebill", "CR");

    expect(adaptador).toBeInstanceOf(RebillProveedorCobro);
    expect(adaptador.proveedor).toBe("rebill");
    expect((adaptador as RebillProveedorCobro).paisId).toBe("CR");
    expect((adaptador as RebillProveedorCobro).entorno).toBe("produccion");
    expect(leerCredenciales).not.toHaveBeenCalled();
    expect(doble.veces()).toBe(0);
  });

  it.each<[ProveedorCobroId, string]>([
    ["wompi", "CO"],
    ["global66", "CL"],
  ])("%s para %s ⇒ proveedor_no_disponible, sin operación, 0 lecturas y 0 peticiones", (proveedor, pais) => {
    const { reg, leerCredenciales, doble } = registro();

    let error: unknown;
    try {
      reg.obtener(proveedor, pais);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ProveedorCobroError);
    expect((error as ProveedorCobroError).codigo).toBe("proveedor_no_disponible");
    expect((error as ProveedorCobroError).proveedor).toBe(proveedor);
    expect((error as ProveedorCobroError).operacion).toBeNull();
    expect(leerCredenciales).toHaveBeenCalledTimes(0);
    expect(doble.veces()).toBe(0);
  });

  it("un país sin la forma de dos letras mayúsculas ⇒ solicitud_invalida, sin leer credenciales", () => {
    const { reg, leerCredenciales } = registro();

    expect(() => reg.obtener("rebill", "cr")).toThrow(ProveedorCobroError);
    expect(leerCredenciales).not.toHaveBeenCalled();
  });
});
