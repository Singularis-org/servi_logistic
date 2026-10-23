import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import {
  EmpresaCruzada,
  EmpresaNoResuelta,
  UsuarioSinEmpresa,
  comoPlataforma,
  conEmpresa,
  contextoActual,
  traducirErrorDeEmpresa,
} from "@/lib/db/contexto-empresa";

// SL-17 / T1.4 (R7–R11, R14, R35) — la extension contra un `PrismaClient` DOBLE. El doble imita
// lo que importa de Prisma 7 para este codigo:
//  - `$extends({ query: { $allOperations } })` devuelve un cliente cuyas operaciones de modelo y
//    de SQL a mano pasan por el hook con `model` en PascalCase (o `undefined` en el SQL a mano);
//  - las operaciones son PEREZOSAS (se ejecutan en el primer `then`), como las `PrismaPromise`,
//    para que un lote se comporte como en Prisma: el hook corre dentro del `$transaction`;
//  - `query(args)` es lo que llegaria a la base: se registra y ese registro es lo que se asierta.
// Lo que el doble NO puede probar (que la RLS filtra, que el lote va en una conexion) lo midio
// T1.1 contra Postgres (`tests/integration/db/aislamiento-mecanismo.test.ts`) y lo prueba T3.1.

type Ejecutada = { model?: string; operation: string; args: unknown };
type Hook = (p: {
  model?: string;
  operation: string;
  args: unknown;
  query: (a: unknown) => Promise<unknown>;
}) => Promise<unknown>;

const SET_CONFIG = Symbol("set_config");
type MarcaSetConfig = { [SET_CONFIG]: true; valores: unknown[]; sql: string };

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

const pascal = (s: string) => s[0].toUpperCase() + s.slice(1);

function crearDoble(opciones: { resultado?: unknown; falla?: unknown } = {}) {
  const ejecutadas: Ejecutada[] = [];
  const lotes: unknown[][] = [];
  const interactivas: unknown[] = [];
  let hook: Hook | undefined;

  const query = (model: string | undefined, operation: string) => (args: unknown) => {
    ejecutadas.push({ model, operation, args });
    if (opciones.falla !== undefined) return Promise.reject(opciones.falla);
    return Promise.resolve(opciones.resultado ?? { de: `${model ?? ""}.${operation}` });
  };

  const operacionDeModelo = (modelo: string, operation: string) => (args?: unknown) =>
    perezosa(() => hook!({ model: pascal(modelo), operation, args, query: query(pascal(modelo), operation) }));

  const sqlAMano = (operation: string) => (...args: unknown[]) =>
    perezosa(() => hook!({ model: undefined, operation, args, query: query(undefined, operation) }));

  const extendido: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_o, prop) {
        if (prop === "then") return undefined;
        if (typeof prop !== "string") return undefined;
        if (prop.startsWith("$queryRaw") || prop.startsWith("$executeRaw")) return sqlAMano(prop);
        if (prop === "$transaction") {
          return async (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
            interactivas.push(opts);
            return fn(extendido);
          };
        }
        return new Proxy({}, { get: (_m, op) => operacionDeModelo(prop, String(op)) });
      },
    },
  );

  const base = {
    $extends(ext: { query: { $allOperations: Hook } }) {
      hook = ext.query.$allOperations;
      return extendido;
    },
    $executeRaw(strings: TemplateStringsArray, ...valores: unknown[]): MarcaSetConfig {
      return { [SET_CONFIG]: true, valores, sql: strings.join("?") };
    },
    $transaction: vi.fn(async (lote: unknown[]) => {
      lotes.push(lote);
      const salida: unknown[] = [];
      for (const item of lote) {
        salida.push(
          typeof item === "object" && item !== null && SET_CONFIG in item ? 1 : await (item as Promise<unknown>),
        );
      }
      return salida;
    }),
  };

  return { base: base as unknown as PrismaClient, ejecutadas, lotes, interactivas, $transaction: base.$transaction };
}

/** Lo que se espera que la envoltura anteponga (design §6.3). */
function esSetConfigDe(item: unknown, id: string): boolean {
  const m = item as MarcaSetConfig;
  return (
    m?.[SET_CONFIG] === true &&
    m.valores.length === 1 &&
    m.valores[0] === id &&
    m.sql.includes("set_config('app.organizacion_id', ?, true)") &&
    m.sql.includes("set_config('role', 'servi_app', true)")
  );
}

type ClienteLibre = Record<string, Record<string, (a?: unknown) => Promise<unknown>>> & {
  $transaction: (a: unknown, o?: unknown) => Promise<unknown>;
  $queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
  $executeRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (sql: string, ...v: unknown[]) => Promise<unknown>;
  $executeRawUnsafe: (sql: string, ...v: unknown[]) => Promise<unknown>;
};

function montar(resolver: () => Promise<string | null> = async () => null, opciones = {}) {
  const doble = crearDoble(opciones);
  const resolverSpy = vi.fn(resolver);
  const cliente = conAislamientoPorEmpresa(doble.base, resolverSpy) as unknown as ClienteLibre;
  return { ...doble, cliente, resolverSpy };
}

const A = "org-a";
const B = "org-b";
const filtroDe = (where: unknown, id: string) => ({ AND: [where ?? {}, { organizacionId: id }] });

/* -------------------------------------------------------------------------- */

describe("R7 — lecturas de negocio con empresa en contexto: filtro AND y envoltura", () => {
  it.each(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"])(
    "%s recibe el where AND organizacionId y va envuelto con set_config",
    async (op) => {
      const { cliente, ejecutadas, lotes } = montar();
      const where = { estado: "ACTIVA" };
      await conEmpresa(A, () => cliente.orden[op]({ where, take: 5 }));

      expect(ejecutadas).toEqual([{ model: "Orden", operation: op, args: { where: filtroDe(where, A), take: 5 } }]);
      expect(lotes).toHaveLength(1);
      expect(lotes[0]).toHaveLength(2);
      expect(esSetConfigDe(lotes[0][0], A)).toBe(true);
    },
  );

  it("sin args (count()) tambien filtra", async () => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.orden.count());
    expect(ejecutadas[0].args).toEqual({ where: filtroDe(undefined, A) });
  });

  it.each(["findUnique", "findUniqueOrThrow"])("%s anade organizacionId al where unico", async (op) => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.orden[op]({ where: { id: "o1" } }));
    expect(ejecutadas[0].args).toEqual({ where: { id: "o1", organizacionId: A } });
  });

  it("un where unico que ya pide otra empresa no se reescribe a la propia: se suman las dos", async () => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.orden.findUnique({ where: { id: "o1", organizacionId: B } }));
    expect(ejecutadas[0].args).toEqual({ where: { id: "o1", organizacionId: B, AND: [{ organizacionId: A }] } });
  });

  it("devuelve el resultado de la consulta, no el del set_config", async () => {
    const { cliente } = montar(undefined, { resultado: [{ id: "o1" }] });
    expect(await conEmpresa(A, () => cliente.orden.findMany({}))).toEqual([{ id: "o1" }]);
  });
});

describe("R8 — escrituras de negocio solo sobre filas de la empresa", () => {
  it.each(["updateMany", "updateManyAndReturn", "deleteMany"])("%s filtra el where con AND", async (op) => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.orden[op]({ where: { id: { in: ["o1"] } }, data: { nota: "x" } }));
    expect((ejecutadas[0].args as { where: unknown }).where).toEqual(filtroDe({ id: { in: ["o1"] } }, A));
  });

  it.each(["update", "delete"])("%s anade organizacionId al where unico", async (op) => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.orden[op]({ where: { id: "o1" }, data: { nota: "x" } }));
    expect((ejecutadas[0].args as { where: unknown }).where).toEqual({ id: "o1", organizacionId: A });
  });

  it("upsert: where unico con empresa, y la empresa en create", async () => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () =>
      cliente.zona.upsert({ where: { id: "z1" }, create: { nombre: "Z" }, update: { nombre: "Z2" } }),
    );
    expect(ejecutadas[0].args).toEqual({
      where: { id: "z1", organizacionId: A },
      create: { nombre: "Z", organizacionId: A },
      update: { nombre: "Z2" },
    });
  });
});

describe("R9 — las creaciones llevan la empresa del contexto", () => {
  it("create inyecta organizacionId", async () => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.zona.create({ data: { nombre: "Norte" } }));
    expect(ejecutadas[0].args).toEqual({ data: { nombre: "Norte", organizacionId: A } });
  });

  it.each(["createMany", "createManyAndReturn"])("%s inyecta organizacionId en cada fila", async (op) => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.zona[op]({ data: [{ nombre: "N" }, { nombre: "S" }] }));
    expect(ejecutadas[0].args).toEqual({
      data: [
        { nombre: "N", organizacionId: A },
        { nombre: "S", organizacionId: A },
      ],
    });
  });

  it("con escrituras de relacion (forma «checked») no se mete la columna: la pone el DEFAULT", async () => {
    const { cliente, ejecutadas, lotes } = montar();
    const data = { nombre: "N", tienda: { connect: { id: "u1" } } };
    await conEmpresa(A, () => cliente.zona.create({ data }));
    expect(ejecutadas[0].args).toEqual({ data });
    // El DEFAULT sale del set_config: que siga ahi es lo que hace valer R9 en este caso.
    expect(esSetConfigDe(lotes[0][0], A)).toBe(true);
  });

  it("conectar con la propia empresa por la relacion pasa", async () => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.zona.create({ data: { nombre: "N", organizacion: { connect: { id: A } } } }));
    expect(ejecutadas).toHaveLength(1);
  });
});

describe("R10 — datos de otra empresa: EmpresaCruzada sin ejecutar", () => {
  const casos: [string, string, Record<string, unknown>][] = [
    ["create", "zona", { data: { nombre: "N", organizacionId: B } }],
    ["createMany", "zona", { data: [{ nombre: "N" }, { nombre: "S", organizacionId: B }] }],
    ["upsert.create", "zona", { where: { id: "z" }, create: { organizacionId: B }, update: {} }],
    ["upsert.update", "zona", { where: { id: "z" }, create: {}, update: { organizacionId: B } }],
    ["update", "orden", { where: { id: "o1" }, data: { organizacionId: B } }],
    ["update {set}", "orden", { where: { id: "o1" }, data: { organizacionId: { set: B } } }],
    ["updateMany", "orden", { where: {}, data: { organizacionId: B } }],
    ["create organizacion.connect", "zona", { data: { organizacion: { connect: { id: B } } } }],
    ["update organizacion.disconnect", "usuario", { where: { id: "u" }, data: { organizacion: { disconnect: true } } }],
  ];

  it.each(casos)("%s", async (nombre, modelo, args) => {
    const { cliente, ejecutadas, $transaction } = montar();
    const op = nombre.split(/[ .]/)[0];
    const error = await conEmpresa(A, () => cliente[modelo][op](args)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaCruzada);
    expect(ejecutadas).toEqual([]);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("organizacionId igual al del contexto pasa", async () => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.orden.update({ where: { id: "o1" }, data: { organizacionId: A } }));
    expect(ejecutadas).toHaveLength(1);
  });
});

describe("R11 — sin empresa en contexto: EmpresaNoResuelta sin ejecutar", () => {
  it.each(["findMany", "create", "deleteMany", "upsert"])("negocio: orden.%s", async (op) => {
    const { cliente, ejecutadas, $transaction } = montar();
    const error = await cliente.orden[op]({ where: {}, data: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaNoResuelta);
    expect(error).toMatchObject({ modelo: "Orden", operacion: op });
    expect(ejecutadas).toEqual([]);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("SQL a mano ($queryRaw, $executeRaw, *Unsafe)", async () => {
    const { cliente, ejecutadas, $transaction } = montar();
    const intentos = [
      cliente.$queryRaw`SELECT * FROM orden`,
      cliente.$executeRaw`DELETE FROM orden`,
      cliente.$queryRawUnsafe("SELECT * FROM orden"),
      cliente.$executeRawUnsafe("DELETE FROM orden"),
    ];
    for (const p of intentos) {
      await expect(p).rejects.toBeInstanceOf(EmpresaNoResuelta);
    }
    expect(ejecutadas).toEqual([]);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("los modelos de plataforma no necesitan empresa: sin ella pasan tal cual, sin envoltura", async () => {
    const { cliente, ejecutadas, $transaction, resolverSpy } = montar();
    await cliente.provincia.findMany({ where: { activo: true } });
    expect(ejecutadas).toEqual([{ model: "Provincia", operation: "findMany", args: { where: { activo: true } } }]);
    expect($transaction).not.toHaveBeenCalled();
    // Se pregunta (en una peticion con sesion la empresa sale de ahi, T3.10), y null = tal cual.
    expect(resolverSpy).toHaveBeenCalled();
  });
});

describe("R14 — el superadmin (resolutor null) no tiene empresa por defecto", () => {
  it("el resolutor devuelve null: falla como R11 y no se asigna ninguna", async () => {
    const { cliente, ejecutadas, resolverSpy } = montar(async () => null);
    await expect(cliente.usuario.findMany({})).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(cliente.$queryRaw`SELECT 1`).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(resolverSpy).toHaveBeenCalled();
    expect(ejecutadas).toEqual([]);
  });

  it("si el resolutor da una empresa, se usa esa (la de la sesion)", async () => {
    const { cliente, ejecutadas } = montar(async () => A);
    await cliente.orden.findMany({});
    expect(ejecutadas[0].args).toEqual({ where: filtroDe({}, A) });
  });
});

describe("contexto explicito, plataforma y modelos de plataforma", () => {
  it("el contexto explicito gana al resolutor (que ni se llama)", async () => {
    const { cliente, ejecutadas, resolverSpy } = montar(async () => B);
    await conEmpresa(A, () => cliente.orden.findMany({}));
    expect(ejecutadas[0].args).toEqual({ where: filtroDe({}, A) });
    expect(resolverSpy).not.toHaveBeenCalled();
  });

  it("plataforma: negocio y SQL a mano pasan tal cual, sin filtro ni envoltura", async () => {
    const { cliente, ejecutadas, $transaction, resolverSpy } = montar(async () => A);
    await comoPlataforma("SL-17", "test", async () => {
      await cliente.orden.findMany({ where: { id: "o1" } });
      await cliente.$queryRaw`SELECT 1`;
    });
    expect(ejecutadas.map((e) => e.args)).toEqual([{ where: { id: "o1" } }, expect.anything()]);
    expect($transaction).not.toHaveBeenCalled();
    expect(resolverSpy).not.toHaveBeenCalled();
  });

  // T3.10: sin la envoltura, un modelo de plataforma corria como dueno (sin RLS) y su `select`
  // anidado hacia negocio traia filas de otras empresas; y sus escrituras saltaban R40.
  it.each([
    ["distrito", "findUnique", { where: { id: "d1" }, select: { zonas: true } }],
    ["vehiculo", "create", { data: { name: "Moto" } }],
    ["vehiculo", "updateMany", { where: { id: "v1" }, data: { name: "X" } }],
    ["session", "delete", { where: { id: "s1" } }],
    ["geocodeCache", "upsert", { where: { huella: "h" }, create: {}, update: {} }],
    ["job", "create", { data: { tipo: "x" } }],
    ["organizacion", "findMany", {}],
  ])("empresa: %s.%s (no es de negocio) va envuelto con set_config y sin filtro", async (modelo, op, args) => {
    const { cliente, ejecutadas, lotes } = montar();
    await conEmpresa(A, () => cliente[modelo][op](args));
    expect(ejecutadas).toHaveLength(1);
    expect(ejecutadas[0].args).toEqual(args);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toHaveLength(2);
    expect(esSetConfigDe(lotes[0][0], A)).toBe(true);
  });

  it("empresa resuelta por la sesion: un modelo de plataforma tambien va envuelto", async () => {
    const { cliente, ejecutadas, lotes } = montar(async () => A);
    await cliente.distrito.findMany({ where: { cantonId: "c1" }, include: { zonas: true } });
    expect(ejecutadas[0].args).toEqual({ where: { cantonId: "c1" }, include: { zonas: true } });
    expect(lotes).toHaveLength(1);
    expect(esSetConfigDe(lotes[0][0], A)).toBe(true);
  });

  it("plataforma: un modelo de plataforma pasa tal cual, sin envoltura ni resolutor", async () => {
    const { cliente, ejecutadas, $transaction, resolverSpy } = montar(async () => A);
    await comoPlataforma("SL-17", "test", () => cliente.vehiculo.create({ data: { name: "Moto" } }));
    expect(ejecutadas[0].args).toEqual({ data: { name: "Moto" } });
    expect($transaction).not.toHaveBeenCalled();
    expect(resolverSpy).not.toHaveBeenCalled();
  });

  it("empresa dentro de una $transaction: el modelo de plataforma no se re-envuelve", async () => {
    const { cliente, ejecutadas, $transaction } = montar();
    await conEmpresa(A, () =>
      cliente.$transaction(async (tx: unknown) => {
        await (tx as ClienteLibre).distrito.findMany({ select: { zonas: true } });
      }),
    );
    expect(ejecutadas.map((e) => e.operation)).toEqual(["$executeRaw", "findMany"]);
    expect(ejecutadas[1].args).toEqual({ select: { zonas: true } });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("empresa: el SQL a mano va envuelto con set_config (la RLS filtra)", async () => {
    const { cliente, ejecutadas, lotes } = montar();
    await conEmpresa(A, () => cliente.$queryRaw`SELECT * FROM orden`);
    expect(ejecutadas).toHaveLength(1);
    expect(lotes).toHaveLength(1);
    expect(esSetConfigDe(lotes[0][0], A)).toBe(true);
  });

  it("conEmpresa rechaza un id vacio", async () => {
    await expect(conEmpresa("  ", async () => 1)).rejects.toBeInstanceOf(TypeError);
  });
});

describe("R35 — usuario sin empresa en plataforma", () => {
  const enPlataforma = <T>(fn: () => Promise<T>) => comoPlataforma("SL-32", "arranque del superadmin", fn);

  it.each([
    ["create", { data: { email: "a@b.c" } }],
    ["createMany", { data: [{ email: "a@b.c", organizacionId: A }, { email: "d@e.f" }] }],
    ["createManyAndReturn", { data: { email: "a@b.c" } }],
    ["upsert", { where: { email: "a@b.c" }, create: { email: "a@b.c" }, update: {} }],
    ["create con undefined", { data: { email: "a@b.c", organizacionId: undefined } }],
  ])("%s sin la clave organizacionId: UsuarioSinEmpresa sin ejecutar", async (nombre, args) => {
    const { cliente, ejecutadas } = montar();
    const op = nombre.split(" ")[0];
    await expect(enPlataforma(() => cliente.usuario[op](args))).rejects.toBeInstanceOf(UsuarioSinEmpresa);
    expect(ejecutadas).toEqual([]);
  });

  it("con organizacionId: null explicito pasa (comando de arranque de SL-32)", async () => {
    const { cliente, ejecutadas } = montar();
    await enPlataforma(() => cliente.usuario.create({ data: { email: "s@a.c", organizacionId: null } }));
    expect(ejecutadas[0].args).toEqual({ data: { email: "s@a.c", organizacionId: null } });
  });

  it("con una empresa declarada pasa", async () => {
    const { cliente, ejecutadas } = montar();
    await enPlataforma(() => cliente.usuario.create({ data: { email: "m@a.c", organizacionId: A } }));
    expect(ejecutadas).toHaveLength(1);
  });

  it("en contexto de empresa, crear un usuario le pone la empresa", async () => {
    const { cliente, ejecutadas } = montar();
    await conEmpresa(A, () => cliente.usuario.create({ data: { email: "m@a.c" } }));
    expect(ejecutadas[0].args).toEqual({ data: { email: "m@a.c", organizacionId: A } });
  });

  it("otro modelo en plataforma no exige la clave", async () => {
    const { cliente, ejecutadas } = montar();
    await enPlataforma(() => cliente.zona.create({ data: { nombre: "N" } }));
    expect(ejecutadas[0].args).toEqual({ data: { nombre: "N" } });
  });
});

describe("§6.4 — el Proxy de $transaction", () => {
  it("en lote: antepone set_config, filtra dentro sin re-envolver y quita el primer resultado", async () => {
    const { cliente, ejecutadas, lotes, $transaction } = montar();
    const resultado = await conEmpresa(A, () =>
      cliente.$transaction([cliente.orden.findMany({ where: { id: "o1" } }), cliente.$queryRaw`SELECT 1`]),
    );

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(lotes[0]).toHaveLength(3);
    expect(esSetConfigDe(lotes[0][0], A)).toBe(true);
    expect(resultado).toEqual([{ de: "Orden.findMany" }, { de: ".$queryRaw" }]);
    expect(ejecutadas[0].args).toEqual({ where: filtroDe({ id: "o1" }, A) });
  });

  it("interactiva: set_config primero por el tx, filtra dentro, no re-envuelve y devuelve lo de fn", async () => {
    const { cliente, ejecutadas, $transaction, interactivas } = montar();
    const opciones = { timeout: 10_000 };
    let contextoDentro: unknown;
    const r = await conEmpresa(A, () =>
      cliente.$transaction(async (tx: unknown) => {
        contextoDentro = contextoActual();
        await (tx as ClienteLibre).orden.update({ where: { id: "o1" }, data: { nota: "x" } });
        await (tx as ClienteLibre).$executeRaw`UPDATE orden SET nota = 'y'`;
        return "hecho";
      }, opciones),
    );

    expect(r).toBe("hecho");
    expect(interactivas).toEqual([opciones]);
    expect(contextoDentro).toEqual({ tipo: "empresa", organizacionId: A, enTransaccion: true });
    expect(ejecutadas.map((e) => e.operation)).toEqual(["$executeRaw", "update", "$executeRaw"]);
    const [strings, valor] = ejecutadas[0].args as [TemplateStringsArray, unknown];
    expect(strings.join("?")).toContain("set_config('role', 'servi_app', true)");
    expect(valor).toBe(A);
    expect(ejecutadas[1].args).toEqual({ where: { id: "o1", organizacionId: A }, data: { nota: "x" } });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("sin empresa: el lote pasa tal cual y lo de negocio dentro falla cerrado", async () => {
    const { cliente, lotes } = montar();
    await expect(cliente.$transaction([cliente.orden.findMany({})])).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(lotes[0]).toHaveLength(1);
  });

  it("en plataforma: el lote no lleva set_config", async () => {
    const { cliente, lotes } = montar();
    await comoPlataforma("SL-17", "test", () => cliente.$transaction([cliente.orden.findMany({})]));
    expect(lotes[0]).toHaveLength(1);
  });

  it("el resto del cliente se reenvia (no se rompe el acceso a modelos)", async () => {
    const { cliente } = montar();
    expect(typeof cliente.orden.findMany).toBe("function");
  });
});

describe("SQLSTATE SL017 → EmpresaCruzada", () => {
  const causa = { kind: "postgres", code: "SL017", originalCode: "SL017", message: "referencia a otra empresa" };
  const errorDeAdaptador = Object.assign(new Error("referencia a otra empresa"), {
    name: "DriverAdapterError",
    cause: causa,
  });

  it("SQL a mano: PrismaClientKnownRequestError P2010 con meta.driverAdapterError", () => {
    const e = new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `SL017`. Message: `x`", {
      code: "P2010",
      clientVersion: "7.8.0",
      meta: { driverAdapterError: errorDeAdaptador },
    });
    const t = traducirErrorDeEmpresa(e, "orden");
    expect(t).toBeInstanceOf(EmpresaCruzada);
    expect((t as EmpresaCruzada).cause).toBe(e);
  });

  it("P2010 solo con el mensaje (meta serializada sin el objeto)", () => {
    const e = new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `SL017`. Message: `x`", {
      code: "P2010",
      clientVersion: "7.8.0",
    });
    expect(traducirErrorDeEmpresa(e)).toBeInstanceOf(EmpresaCruzada);
  });

  it("operacion de modelo: el DriverAdapterError relanzado tal cual", () => {
    expect(traducirErrorDeEmpresa(errorDeAdaptador)).toBeInstanceOf(EmpresaCruzada);
  });

  it("error de pg directo con code SL017", () => {
    expect(traducirErrorDeEmpresa(Object.assign(new Error("x"), { code: "SL017" }))).toBeInstanceOf(EmpresaCruzada);
  });

  it("otros errores salen intactos", () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7.8.0" });
    const otroPostgres = Object.assign(new Error("x"), { name: "DriverAdapterError", cause: { ...causa, code: "23514", originalCode: "23514" } });
    expect(traducirErrorDeEmpresa(p2002)).toBe(p2002);
    expect(traducirErrorDeEmpresa(otroPostgres)).toBe(otroPostgres);
  });

  it("la extension lo traduce cuando la base rechaza la escritura", async () => {
    const { cliente } = montar(undefined, { falla: errorDeAdaptador });
    const error = await conEmpresa(A, () => cliente.orden.create({ data: { tiendaId: "u-de-b" } })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaCruzada);
    expect(error).toMatchObject({ modelo: "Orden" });
  });

  it("y en una $transaction de empresa, al salir de ella", async () => {
    const { cliente } = montar(undefined, { falla: errorDeAdaptador });
    const error = await conEmpresa(A, () =>
      cliente.$transaction([cliente.orden.create({ data: { tiendaId: "u-de-b" } })]),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaCruzada);
  });
});
