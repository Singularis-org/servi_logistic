import { beforeEach, describe, expect, it, vi } from "vitest";

// SL-17 / T2.4 — R34 (y R42 en la invalidacion del job): las caches de negocio separan sus
// entradas por empresa.
//
// `next/cache` se simula: el `unstable_cache` falso guarda de verdad por la clave que recibe,
// asi que «dos empresas, misma consulta» es una afirmacion sobre el DATO SERVIDO y no solo
// sobre los argumentos. La cookie (`empresaDeLaPeticion`) tambien se simula: T2.1 la reescribe
// y aqui solo importa su firma.

const almacen = new Map<string, unknown>();
type UnstableCache = (
  fn: () => Promise<unknown>,
  partes: string[],
  opciones: { tags?: string[]; revalidate: number },
) => () => Promise<unknown>;
const unstableCache = vi.fn<UnstableCache>(
  (fn, partes) =>
    async () => {
      const clave = JSON.stringify(partes);
      if (almacen.has(clave)) return almacen.get(clave);
      const valor = await fn();
      almacen.set(clave, valor);
      return valor;
    },
);
const revalidateTag = vi.fn<(tag: string, perfil: string) => void>();
vi.mock("next/cache", () => ({
  unstable_cache: (...a: Parameters<typeof unstableCache>) => unstableCache(...a),
  revalidateTag: (...a: Parameters<typeof revalidateTag>) => revalidateTag(...a),
}));

const empresaDeLaPeticion = vi.fn(async (): Promise<string | null> => null);
vi.mock("@/lib/auth/empresa-de-la-peticion", () => ({
  empresaDeLaPeticion: () => empresaDeLaPeticion(),
}));

import { ANALITICA_TAGS } from "@/lib/analytics/metrics";
import { NextAnaliticaCache } from "@/lib/cache/next-analitica-cache";
import { NextTableroDiaCache } from "@/lib/cache/next-tablero-dia-cache";
import {
  comoPlataforma,
  conEmpresa,
  contextoActual,
  EmpresaNoResuelta,
} from "@/lib/db/contexto-empresa";
import { crearAnaliticaInvalidacionCacheHandler } from "@/lib/services/jobs/analitica-invalidacion-cache-handler";
import type { IAnaliticaCache, OrigenInvalidacion } from "@/lib/interfaces/external/IAnaliticaCache";

const CLAVE = "operativa|entregas|2026-07-20..2026-07-22|global";
const TAGS = [ANALITICA_TAGS.operativa];

beforeEach(() => {
  almacen.clear();
  unstableCache.mockClear();
  revalidateTag.mockClear();
  empresaDeLaPeticion.mockReset();
  empresaDeLaPeticion.mockResolvedValue(null);
});

function partesDe(llamada: number): string[] {
  return unstableCache.mock.calls[llamada][1];
}
function tagsDe(llamada: number): string[] | undefined {
  return unstableCache.mock.calls[llamada][2].tags;
}

describe("R34 · analitica: dos empresas con la misma consulta no comparten entrada", () => {
  it("claves y etiquetas distintas, y cada empresa recibe SU valor", async () => {
    const cache = new NextAnaliticaCache();

    const a = await conEmpresa("emp-a", () => cache.envolver(CLAVE, TAGS, async () => "datos de A"));
    const b = await conEmpresa("emp-b", () => cache.envolver(CLAVE, TAGS, async () => "datos de B"));

    expect(partesDe(0)).toEqual(["org:emp-a", CLAVE]);
    expect(partesDe(1)).toEqual(["org:emp-b", CLAVE]);
    expect(tagsDe(0)).toEqual([`org:emp-a:${ANALITICA_TAGS.operativa}`]);
    expect(tagsDe(1)).toEqual([`org:emp-b:${ANALITICA_TAGS.operativa}`]);
    // Si compartieran entrada, B recibiria lo que produjo A.
    expect(a).toBe("datos de A");
    expect(b).toBe("datos de B");
  });

  it("sin contexto, la empresa sale de la peticion (cookie), resuelta antes de unstable_cache", async () => {
    empresaDeLaPeticion.mockResolvedValue("emp-cookie");
    const cache = new NextAnaliticaCache();

    await cache.envolver(CLAVE, TAGS, async () => 1);

    expect(empresaDeLaPeticion).toHaveBeenCalledTimes(1);
    expect(partesDe(0)).toEqual(["org:emp-cookie", CLAVE]);
  });

  it("un contexto de empresa gana a la cookie y no la consulta", async () => {
    empresaDeLaPeticion.mockResolvedValue("emp-cookie");
    const cache = new NextAnaliticaCache();

    await conEmpresa("emp-a", () => cache.envolver(CLAVE, TAGS, async () => 1));

    expect(empresaDeLaPeticion).not.toHaveBeenCalled();
    expect(partesDe(0)).toEqual(["org:emp-a", CLAVE]);
  });

  it("la produccion corre con la empresa en contexto, aunque llegue de la cookie", async () => {
    empresaDeLaPeticion.mockResolvedValue("emp-cookie");
    const cache = new NextAnaliticaCache();
    let visto: unknown = "sin ejecutar";

    await cache.envolver(CLAVE, TAGS, async () => {
      visto = contextoActual();
      return 1;
    });

    expect(visto).toEqual({ tipo: "empresa", organizacionId: "emp-cookie" });
  });

  it("sin empresa: no se llama a unstable_cache, no se produce y se lanza EmpresaNoResuelta", async () => {
    const cache = new NextAnaliticaCache();
    const producir = vi.fn(async () => "no deberia");

    await expect(cache.envolver(CLAVE, TAGS, producir)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(unstableCache).not.toHaveBeenCalled();
    expect(producir).not.toHaveBeenCalled();
  });

  it("un contexto de plataforma no es una empresa: tambien lanza, sin mirar la cookie", async () => {
    empresaDeLaPeticion.mockResolvedValue("emp-cookie");
    const cache = new NextAnaliticaCache();

    await expect(
      comoPlataforma("SL-17", "test", () => cache.envolver(CLAVE, TAGS, async () => 1)),
    ).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(unstableCache).not.toHaveBeenCalled();
  });
});

describe("R34/R42 · la invalidacion alcanza solo la etiqueta de la empresa", () => {
  it("invalida la misma etiqueta con la que se escribio, y no la de otra empresa", async () => {
    const cache = new NextAnaliticaCache();
    await conEmpresa("emp-a", () => cache.envolver(CLAVE, TAGS, async () => 1));

    await conEmpresa("emp-a", () => cache.invalidar("manual", TAGS));

    expect(revalidateTag.mock.calls).toEqual([[`org:emp-a:${ANALITICA_TAGS.operativa}`, "max"]]);
    expect(revalidateTag.mock.calls[0][0]).toBe(tagsDe(0)?.[0]);
  });

  it("sin empresa, invalidar lanza EmpresaNoResuelta y no llama a revalidateTag", async () => {
    const cache = new NextAnaliticaCache();

    await expect(cache.invalidar("manual", TAGS)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("R42 · el job de invalidacion usa la empresa del job", () => {
  function cacheQueApunta(): IAnaliticaCache & { llamadas: { origen: OrigenInvalidacion; empresa: unknown }[] } {
    const llamadas: { origen: OrigenInvalidacion; empresa: unknown }[] = [];
    return {
      llamadas,
      envolver: (_c, _t, producir) => producir(),
      async invalidar(origen) {
        llamadas.push({ origen, empresa: contextoActual() });
      },
    };
  }

  it("dentro de conEmpresa(job.organizacionId) invalida con esa empresa en contexto", async () => {
    const cache = cacheQueApunta();
    const avisar = vi.fn();
    await conEmpresa("emp-job", () => crearAnaliticaInvalidacionCacheHandler(cache, avisar)({} as never));

    expect(cache.llamadas).toEqual([
      { origen: "backfill", empresa: { tipo: "empresa", organizacionId: "emp-job" } },
    ]);
    expect(avisar).not.toHaveBeenCalled();
  });

  it("de punta a punta con el adaptador real: revalida la etiqueta de la empresa del job", async () => {
    await conEmpresa("emp-job", () =>
      crearAnaliticaInvalidacionCacheHandler(new NextAnaliticaCache(), vi.fn())({} as never),
    );
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual([
      expect.stringMatching(/^org:emp-job:/),
    ]);
  });

  it("un job sin empresa (plataforma o sin contexto) no invalida nada y lo dice en el log", async () => {
    const cache = cacheQueApunta();
    const avisar = vi.fn();
    const handler = crearAnaliticaInvalidacionCacheHandler(cache, avisar);

    await comoPlataforma("SL-17", "job sin empresa", () => handler({} as never));
    await handler({} as never);

    expect(cache.llamadas).toEqual([]);
    expect(avisar).toHaveBeenCalledTimes(2);
    expect(avisar.mock.calls[0][0]).toMatch(/sin empresa/);
  });
});

describe("R34 · tablero del dia: dos empresas con la misma clave no comparten entrada", () => {
  it("claves distintas, sin tags, y cada empresa recibe SU valor", async () => {
    const cache = new NextTableroDiaCache();

    const a = await conEmpresa("emp-a", () => cache.envolver(CLAVE, async () => "tablero A"));
    const b = await conEmpresa("emp-b", () => cache.envolver(CLAVE, async () => "tablero B"));

    expect(partesDe(0)).toEqual(["org:emp-a", CLAVE]);
    expect(partesDe(1)).toEqual(["org:emp-b", CLAVE]);
    expect(tagsDe(0)).toBeUndefined();
    expect(a).toBe("tablero A");
    expect(b).toBe("tablero B");
  });

  it("la produccion corre con la empresa de la cookie en contexto", async () => {
    empresaDeLaPeticion.mockResolvedValue("emp-cookie");
    let visto: unknown;
    await new NextTableroDiaCache().envolver(CLAVE, async () => {
      visto = contextoActual();
      return 1;
    });
    expect(visto).toEqual({ tipo: "empresa", organizacionId: "emp-cookie" });
  });

  it("sin empresa: no se llama a unstable_cache y se lanza EmpresaNoResuelta", async () => {
    const producir = vi.fn(async () => 1);
    await expect(new NextTableroDiaCache().envolver(CLAVE, producir)).rejects.toBeInstanceOf(
      EmpresaNoResuelta,
    );
    expect(unstableCache).not.toHaveBeenCalled();
    expect(producir).not.toHaveBeenCalled();
  });
});
