import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { EmpresaCruzada, EmpresaNoResuelta, conEmpresa } from "@/lib/db/contexto-empresa";
import { MOTIVOS_EN_MORA, permisoEnMoraActual, permitidoEnMora, type MotivoEnMora } from "@/lib/db/permiso-en-mora";
import { withErrorHandler } from "@/lib/errors";
import { toActionError } from "@/lib/actions/_shared/to-action-error";
import {
  EmpresaCongelada,
  MENSAJE_EMPRESA_CONGELADA,
  exigirEmpresaOperativa,
  traducirErrorDeMora,
} from "@/lib/planes/empresa-congelada";

// SLT-121 (design §6.1, §6.2; R11, R13, R16) — la envoltura de la extension lleva el permiso de la mora en
// la misma sentencia que la empresa, y el SQLSTATE `SL121` del trigger `bloqueo_por_mora` llega como
// `EmpresaCongelada`. Que el trigger rechace y deje pasar con el permiso lo prueba la base real en
// `tests/integration/db/bloqueo-por-mora.test.ts`; aqui, con un cliente doble, que la app le manda lo que
// el trigger lee.

type SetConfig = { sql: string; valores: unknown[] };
const MARCA = Symbol("set_config");

function perezosa<T>(ejecutar: () => Promise<T>): Promise<T> {
  let p: Promise<T> | undefined;
  const correr = () => (p ??= ejecutar());
  return {
    then: (ok, ko) => correr().then(ok, ko),
    catch: (ko) => correr().catch(ko),
    finally: (f) => correr().finally(f),
    [Symbol.toStringTag]: "PrismaPromise",
  } as Promise<T>;
}

type Hook = (p: { model?: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown>;

/** Un cliente doble: registra cada `set_config` (del lote o de la interactiva) y puede fallar como la base. */
function montar(falla?: unknown) {
  const setConfigs: SetConfig[] = [];
  let hook: Hook | undefined;
  const query = () => () => (falla === undefined ? Promise.resolve({ ok: true }) : Promise.reject(falla));

  const extendido: Record<string, unknown> = new Proxy(
    {},
    {
      get(_o, prop) {
        if (prop === "then" || typeof prop !== "string") return undefined;
        if (prop === "$executeRaw") {
          return (strings: TemplateStringsArray, ...valores: unknown[]) => {
            setConfigs.push({ sql: strings.join("?"), valores });
            return Promise.resolve(1);
          };
        }
        if (prop === "$transaction") return async (fn: (tx: unknown) => Promise<unknown>) => fn(extendido);
        return new Proxy(
          {},
          {
            get: (_m, op) => (args?: unknown) =>
              perezosa(() => hook!({ model: prop[0].toUpperCase() + prop.slice(1), operation: String(op), args, query: query() })),
          },
        );
      },
    },
  );

  const base = {
    $extends(ext: { query: { $allOperations: Hook } }) {
      hook = ext.query.$allOperations;
      return extendido;
    },
    $executeRaw(strings: TemplateStringsArray, ...valores: unknown[]) {
      return { [MARCA]: true, sql: strings.join("?"), valores };
    },
    $transaction: vi.fn(async (lote: unknown[]) => {
      const salida: unknown[] = [];
      for (const item of lote) {
        if (typeof item === "object" && item !== null && MARCA in item) {
          const m = item as unknown as SetConfig;
          setConfigs.push({ sql: m.sql, valores: m.valores });
          salida.push(1);
        } else salida.push(await (item as Promise<unknown>));
      }
      return salida;
    }),
  };
  type Libre = Record<string, Record<string, (a?: unknown) => Promise<unknown>>> & {
    $transaction: (a: unknown) => Promise<unknown>;
  };
  const cliente = conAislamientoPorEmpresa(base as unknown as PrismaClient, async () => null) as unknown as Libre;
  return { cliente, setConfigs };
}

const A = "org-a";

/** El permiso que fijo un `set_config`: el valor que sigue al de la empresa. */
function permisoFijado(s: SetConfig): unknown {
  expect(s.sql).toContain("set_config('app.mora_permitida', ?, true)");
  expect(s.valores[0]).toBe(A);
  return s.valores[1];
}

describe("R16 — sin permiso, la envoltura fija app.mora_permitida vacio (el trigger aplica)", () => {
  it("fuera de una transaccion, en la misma sentencia que la empresa y el rol", async () => {
    const { cliente, setConfigs } = montar();
    await conEmpresa(A, () => cliente.orden.findMany({}));
    expect(setConfigs).toHaveLength(1);
    expect(setConfigs[0].sql).toContain("set_config('app.organizacion_id', ?, true)");
    expect(setConfigs[0].sql).toContain("set_config('role', 'servi_app', true)");
    expect(permisoFijado(setConfigs[0])).toBe("");
  });

  it("en una transaccion en lote y en una interactiva", async () => {
    const { cliente, setConfigs } = montar();
    await conEmpresa(A, () => cliente.$transaction([cliente.orden.findMany({})]));
    await conEmpresa(A, () => cliente.$transaction(async () => "x"));
    expect(setConfigs).toHaveLength(2);
    expect(setConfigs.map(permisoFijado)).toEqual(["", ""]);
  });
});

describe("R11, R15, R17 — con permitidoEnMora, la envoltura fija el motivo", () => {
  it.each(MOTIVOS_EN_MORA)("%s fuera de una transaccion", async (motivo) => {
    const { cliente, setConfigs } = montar();
    await permitidoEnMora(motivo, () => conEmpresa(A, () => cliente.orden.update({ where: { id: "o" }, data: {} })));
    expect(permisoFijado(setConfigs[0])).toBe(motivo);
  });

  it("dentro de una transaccion en lote y de una interactiva", async () => {
    const { cliente, setConfigs } = montar();
    await permitidoEnMora("pago_plataforma", () =>
      conEmpresa(A, async () => {
        await cliente.$transaction([cliente.orden.findMany({})]);
        await cliente.$transaction(async () => "x");
      }),
    );
    expect(setConfigs.map(permisoFijado)).toEqual(["pago_plataforma", "pago_plataforma"]);
  });

  it("el permiso no se escapa: despues de permitidoEnMora, la siguiente operacion va sin el", async () => {
    const { cliente, setConfigs } = montar();
    await permitidoEnMora("cuenta_propia", () => conEmpresa(A, () => cliente.orden.findMany({})));
    await conEmpresa(A, () => cliente.orden.findMany({}));
    expect(setConfigs.map(permisoFijado)).toEqual(["cuenta_propia", ""]);
    expect(permisoEnMoraActual()).toBeNull();
  });

  it("un motivo fuera de la lista se rechaza sin correr nada", async () => {
    const fn = vi.fn(async () => "x");
    await expect(permitidoEnMora("cualquiera" as MotivoEnMora, fn)).rejects.toBeInstanceOf(TypeError);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("R16 — SQLSTATE SL121 → EmpresaCongelada", () => {
  const causa = { kind: "postgres", code: "SL121", originalCode: "SL121", message: "empresa_congelada" };
  const errorDeAdaptador = Object.assign(new Error("empresa_congelada"), { name: "DriverAdapterError", cause: causa });

  it("traduce el error de modelo, el P2010 del SQL a mano y el de pg directo", () => {
    const p2010 = new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `SL121`. Message: `x`", {
      code: "P2010",
      clientVersion: "7.8.0",
    });
    for (const e of [errorDeAdaptador, p2010, Object.assign(new Error("x"), { code: "SL121" })]) {
      const t = traducirErrorDeMora(e);
      expect(t).toBeInstanceOf(EmpresaCongelada);
      expect((t as EmpresaCongelada).cause).toBe(e);
    }
  });

  it("otros errores salen intactos", () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7.8.0" });
    expect(traducirErrorDeMora(p2002)).toBe(p2002);
  });

  it("la extension lo traduce fuera de una transaccion y al salir de una", async () => {
    const { cliente } = montar(errorDeAdaptador);
    const suelta = await conEmpresa(A, () => cliente.orden.create({ data: {} })).catch((e: unknown) => e);
    const enLote = await conEmpresa(A, () => cliente.$transaction([cliente.orden.create({ data: {} })])).catch(
      (e: unknown) => e,
    );
    expect(suelta).toBeInstanceOf(EmpresaCongelada);
    expect(enLote).toBeInstanceOf(EmpresaCongelada);
  });

  it("el SL017 sigue siendo EmpresaCruzada (la traduccion de la mora va despues)", async () => {
    const sl017 = Object.assign(new Error("x"), { code: "SL017" });
    const { cliente } = montar(sl017);
    const e = await conEmpresa(A, () => cliente.orden.create({ data: {} })).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EmpresaCruzada);
  });

  it("withErrorHandler lo da como FORBIDDEN con su mensaje y details.codigo, y toActionError como forbidden", async () => {
    const forma = await withErrorHandler(async () => {
      throw traducirErrorDeMora(errorDeAdaptador);
    });
    expect(forma).toEqual({
      status: "error",
      code: "FORBIDDEN",
      message: MENSAJE_EMPRESA_CONGELADA,
      details: { codigo: "empresa_congelada" },
    });
    expect(toActionError(forma as Parameters<typeof toActionError>[0])).toEqual({ status: "forbidden" });
  });
});

describe("design §6.2 — exigirEmpresaOperativa", () => {
  it("con la empresa congelada lanza EmpresaCongelada", async () => {
    await expect(exigirEmpresaOperativa({ estaCongelada: async () => true })).rejects.toBeInstanceOf(EmpresaCongelada);
  });

  it("operativa, pasa", async () => {
    await expect(exigirEmpresaOperativa({ estaCongelada: async () => false })).resolves.toBeUndefined();
  });

  it("sin empresa no aplica", async () => {
    const lector = { estaCongelada: async () => Promise.reject(new EmpresaNoResuelta("$sql", "$queryRaw")) };
    await expect(exigirEmpresaOperativa(lector)).resolves.toBeUndefined();
  });

  it("cualquier otro fallo de la lectura se propaga: no abre la puerta", async () => {
    const fallo = new Error("base caida");
    await expect(exigirEmpresaOperativa({ estaCongelada: async () => Promise.reject(fallo) })).rejects.toBe(fallo);
  });
});
