import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import {
  cambiarActivacionVehiculoAction,
  crearVehiculoAction,
  listarVehiculosPlataformaAction,
  renombrarVehiculoAction,
  type VehiculosPlataformaDeps,
} from "@/lib/actions/vehiculos-plataforma";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { contextoActual } from "@/lib/db/contexto-empresa";
import { EXCEPCIONES_DE_PLATAFORMA } from "@/lib/db/excepciones-aislamiento";
import type { Actor, IVehiculoService } from "@/lib/interfaces/services/IVehiculoService";
import { MODULO_POR_ACTION } from "@/lib/modulos/reparto";
import type { VehiculoDTO } from "@/lib/types/vehiculos";

// SL-42 (design §4.3; R9–R12, R14) — el borde del catalogo de vehiculos del superadmin, con un
// servicio doble y el actor inyectado: ni sesion ni base. El SQL y el `comoPlataforma` contra el
// cliente real de la app estan en `tests/integration/db/vehiculos-plataforma.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "sa1", rol: "superadmin" };
const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };
const ROLES_DE_EMPRESA: Actor[] = Object.values(RolValue)
  .filter((rol) => !(ROLES_PLATAFORMA as readonly string[]).includes(rol))
  .map((rol) => ({ usuarioId: `u-${rol}`, rol }));

const NOMBRE_SECRETO = "Furgon Secreto";
const MOTO: VehiculoDTO = { id: "veh-1", name: "Moto", activo: true };

function fakeService(overrides: Partial<IVehiculoService> = {}): IVehiculoService {
  return {
    listar: vi.fn().mockResolvedValue({ status: "ok", items: [MOTO] }),
    listarTodos: vi.fn().mockResolvedValue({ status: "ok", items: [MOTO, { ...MOTO, id: "veh-2", activo: false }] }),
    crear: vi.fn().mockResolvedValue({ status: "ok", vehiculo: MOTO }),
    renombrar: vi.fn().mockResolvedValue({ status: "ok", vehiculo: MOTO }),
    cambiarActivacion: vi.fn().mockResolvedValue({ status: "ok", vehiculo: MOTO }),
    ...overrides,
  };
}

function deps(actor: Actor | null, servicio: IVehiculoService): VehiculosPlataformaDeps {
  return { getActor: async () => actor, vehiculoService: servicio };
}

/** Las cuatro actions con una entrada valida, para los barridos de R14. */
const ACCIONES: { nombre: string; llamar: (d: VehiculosPlataformaDeps) => Promise<{ status: string }> }[] = [
  { nombre: "listar", llamar: (d) => listarVehiculosPlataformaAction(d) },
  { nombre: "crear", llamar: (d) => crearVehiculoAction({ name: "Moto" }, d) },
  { nombre: "renombrar", llamar: (d) => renombrarVehiculoAction({ id: "veh-1", name: "Moto" }, d) },
  { nombre: "cambiarActivacion", llamar: (d) => cambiarActivacionVehiculoAction({ id: "veh-1", activo: false }, d) },
];

/** Las tres que escriben, cada una con su metodo del servicio, para los barridos de R11. */
const ESCRITURAS = [
  {
    nombre: "crear",
    metodo: "crear" as const,
    llamar: (d: VehiculosPlataformaDeps) => crearVehiculoAction({ name: NOMBRE_SECRETO }, d),
  },
  {
    nombre: "renombrar",
    metodo: "renombrar" as const,
    llamar: (d: VehiculosPlataformaDeps) => renombrarVehiculoAction({ id: "veh-1", name: NOMBRE_SECRETO }, d),
  },
  {
    nombre: "cambiarActivacion",
    metodo: "cambiarActivacion" as const,
    llamar: (d: VehiculosPlataformaDeps) => cambiarActivacionVehiculoAction({ id: "veh-1", activo: false }, d),
  },
];

/** Una violacion de unico como la da Prisma 7 (P2002). */
function errorDeUnico(): Error {
  return new Prisma.PrismaClientKnownRequestError(`duplicate key value violates unique constraint (${NOMBRE_SECRETO})`, {
    code: "P2002",
    clientVersion: "7",
  });
}

/** El rechazo del aislamiento que antes se traducia a «ya existe»: `permission denied` (42501). */
function errorDePermiso(): Error {
  const e = new Error(`permission denied for table vehiculos (name=${NOMBRE_SECRETO})`);
  e.name = "DriverAdapterError";
  Object.assign(e, { cause: { originalCode: "42501", originalMessage: "permission denied for table vehiculos" } });
  return e;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R14 — sin sesion o con un rol de empresa, el borde corta antes del servicio", () => {
  it.each(ACCIONES.map((a) => [a.nombre, a] as const))("%s: sin sesion -> unauthenticated", async (_n, accion) => {
    const servicio = fakeService();
    expect(await accion.llamar(deps(null, servicio))).toEqual({ status: "unauthenticated" });
    for (const fn of Object.values(servicio)) expect(fn).not.toHaveBeenCalled();
  });

  it.each(ACCIONES.map((a) => [a.nombre, a] as const))(
    "%s: cada rol de empresa (maestro incluido) -> forbidden",
    async (_n, accion) => {
      expect(ROLES_DE_EMPRESA.map((a) => a.rol)).toContain("maestro");
      const servicio = fakeService();
      for (const actor of ROLES_DE_EMPRESA) {
        expect(await accion.llamar(deps(actor, servicio)), actor.rol).toEqual({ status: "forbidden" });
      }
      for (const fn of Object.values(servicio)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it("el maestro no recibe un `validation_error` que le cuente la forma del borde", async () => {
    const servicio = fakeService();
    expect(await crearVehiculoAction({ name: "" }, deps(MAESTRO, servicio))).toEqual({ status: "forbidden" });
  });
});

describe("R9 — `validation_error` con el error en su campo, sin llamar al servicio", () => {
  it("crear: nombre vacio, <2 o >40 tras normalizar -> error en `name`", async () => {
    const servicio = fakeService();
    for (const name of ["   ", " a ", "x".repeat(41)]) {
      const r = await crearVehiculoAction({ name }, deps(SUPERADMIN, servicio));
      expect(r.status, name).toBe("validation_error");
      if (r.status === "validation_error") expect(r.fieldErrors.name, name).toBeDefined();
    }
    expect(servicio.crear).not.toHaveBeenCalled();
  });

  it("renombrar: id vacio -> error en `id`; nombre corto -> error en `name`", async () => {
    const servicio = fakeService();
    const sinId = await renombrarVehiculoAction({ id: "", name: "Moto" }, deps(SUPERADMIN, servicio));
    expect(sinId.status === "validation_error" && sinId.fieldErrors.id).toBeTruthy();
    const corto = await renombrarVehiculoAction({ id: "veh-1", name: "x" }, deps(SUPERADMIN, servicio));
    expect(corto.status === "validation_error" && corto.fieldErrors.name).toBeTruthy();
    expect(servicio.renombrar).not.toHaveBeenCalled();
  });

  it("cambiarActivacion: `activo` no booleano -> error en `activo`", async () => {
    const servicio = fakeService();
    const r = await cambiarActivacionVehiculoAction({ id: "veh-1", activo: "no" }, deps(SUPERADMIN, servicio));
    expect(r.status === "validation_error" && r.fieldErrors.activo).toBeTruthy();
    expect(servicio.cambiarActivacion).not.toHaveBeenCalled();
  });

  it("un campo desconocido es validation_error en las tres escrituras", async () => {
    const servicio = fakeService();
    const entradas = [
      await crearVehiculoAction({ name: "Moto", activo: false }, deps(SUPERADMIN, servicio)),
      await renombrarVehiculoAction({ id: "veh-1", name: "Moto", extra: 1 }, deps(SUPERADMIN, servicio)),
      await cambiarActivacionVehiculoAction({ id: "veh-1", activo: true, name: "x" }, deps(SUPERADMIN, servicio)),
    ];
    for (const r of entradas) {
      expect(r.status).toBe("validation_error");
      if (r.status === "validation_error") expect(Object.keys(r.fieldErrors).length).toBeGreaterThan(0);
    }
    for (const fn of Object.values(servicio)) expect(fn).not.toHaveBeenCalled();
  });

  it("R4: el servicio recibe el nombre ya normalizado", async () => {
    const servicio = fakeService();
    await crearVehiculoAction({ name: "  Furgon   3/4 " }, deps(SUPERADMIN, servicio));
    expect(servicio.crear).toHaveBeenCalledWith({ name: "Furgon 3/4" }, SUPERADMIN);
  });
});

describe("el superadmin pasa la puerta y el servicio corre dentro de `comoPlataforma` (R7)", () => {
  it.each(ACCIONES.map((a) => [a.nombre, a] as const))("%s", async (_n, accion) => {
    const contextos: unknown[] = [];
    const registra = <T,>(resultado: T) =>
      vi.fn(async () => {
        contextos.push(contextoActual());
        return resultado;
      });
    const servicio = fakeService({
      listarTodos: registra({ status: "ok" as const, items: [] }),
      crear: registra({ status: "ok" as const, vehiculo: MOTO }),
      renombrar: registra({ status: "ok" as const, vehiculo: MOTO }),
      cambiarActivacion: registra({ status: "ok" as const, vehiculo: MOTO }),
    });
    expect((await accion.llamar(deps(SUPERADMIN, servicio))).status).toBe("ok");
    expect(contextos).toEqual([expect.objectContaining({ tipo: "plataforma", ficha: "SL-42" })]);
  });

  it("R2: listar devuelve activos e inactivos tal cual los da el servicio", async () => {
    const servicio = fakeService();
    const r = await listarVehiculosPlataformaAction(deps(SUPERADMIN, servicio));
    expect(r.status === "ok" && r.items.map((v) => v.activo)).toEqual([true, false]);
    expect(servicio.listarTodos).toHaveBeenCalledWith(SUPERADMIN);
  });
});

describe("R10, R12 — los desenlaces del servicio pasan tal cual", () => {
  it("R10: conflict del servicio (nombre repetido) en crear y renombrar", async () => {
    const servicio = fakeService({
      crear: vi.fn().mockResolvedValue({ status: "conflict" }),
      renombrar: vi.fn().mockResolvedValue({ status: "conflict" }),
    });
    expect(await crearVehiculoAction({ name: "Moto" }, deps(SUPERADMIN, servicio))).toEqual({ status: "conflict" });
    expect(await renombrarVehiculoAction({ id: "veh-1", name: "Moto" }, deps(SUPERADMIN, servicio))).toEqual({
      status: "conflict",
    });
  });

  it("R12: not_found del servicio en renombrar y cambiarActivacion", async () => {
    const servicio = fakeService({
      renombrar: vi.fn().mockResolvedValue({ status: "not_found" }),
      cambiarActivacion: vi.fn().mockResolvedValue({ status: "not_found" }),
    });
    expect(await renombrarVehiculoAction({ id: "nadie", name: "Moto" }, deps(SUPERADMIN, servicio))).toEqual({
      status: "not_found",
    });
    expect(await cambiarActivacionVehiculoAction({ id: "nadie", activo: false }, deps(SUPERADMIN, servicio))).toEqual({
      status: "not_found",
    });
  });
});

describe("R10, R11 — un fallo de la base: `conflict` solo por el unico; lo demas, `error` con log limpio", () => {
  it("R10: el unico violado en carrera es conflict en crear y renombrar, sin log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const e of ESCRITURAS.filter((x) => x.metodo !== "cambiarActivacion")) {
      const servicio = fakeService({ [e.metodo]: vi.fn().mockRejectedValue(errorDeUnico()) });
      expect(await e.llamar(deps(SUPERADMIN, servicio)), e.nombre).toEqual({ status: "conflict" });
    }
    expect(log).not.toHaveBeenCalled();
  });

  it.each(ESCRITURAS.map((e) => [e.nombre, e] as const))(
    "R11 %s: permission denied -> error (nunca conflict ni in_use), con log sin nombre ni mensaje de la base",
    async (_n, e) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const servicio = fakeService({ [e.metodo]: vi.fn().mockRejectedValue(errorDePermiso()) });
      const r = await e.llamar(deps(SUPERADMIN, servicio));
      expect(r).toEqual({ status: "error" });
      expect(log).toHaveBeenCalledTimes(1);
      const linea = String(log.mock.calls[0][0]);
      expect(linea).toMatch(/^\[vehiculos-plataforma\] fallo .*vehiculo causa=DriverAdapterError$/);
      expect(linea).not.toContain(NOMBRE_SECRETO);
      expect(linea).not.toMatch(/permission denied/i);
      expect(log.mock.calls[0]).toHaveLength(1);
    },
  );

  it("R11: un fallo que no es un Error tambien es `error`, con causa=desconocido", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const servicio = fakeService({ crear: vi.fn().mockRejectedValue("cadena") });
    expect(await crearVehiculoAction({ name: "Moto" }, deps(SUPERADMIN, servicio))).toEqual({ status: "error" });
    expect(String(log.mock.calls[0][0])).toContain("causa=desconocido");
  });

  it("R11: cambiar el estado nunca es conflict, ni siquiera con un error de unico", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const servicio = fakeService({ cambiarActivacion: vi.fn().mockRejectedValue(errorDeUnico()) });
    const r = await cambiarActivacionVehiculoAction({ id: "veh-1", activo: true }, deps(SUPERADMIN, servicio));
    expect(r).toEqual({ status: "error" });
  });
});

describe("R8, R14 — el borde no ofrece borrar, y esta declarado donde debe", () => {
  it("R8: el modulo exporta exactamente las cuatro actions, ninguna de borrado", async () => {
    const modulo = await import("@/lib/actions/vehiculos-plataforma");
    const funciones = Object.keys(modulo).filter((k) => typeof (modulo as Record<string, unknown>)[k] === "function");
    expect(funciones.sort()).toEqual(
      [
        "cambiarActivacionVehiculoAction",
        "crearVehiculoAction",
        "listarVehiculosPlataformaAction",
        "renombrarVehiculoAction",
      ].sort(),
    );
  });

  it("la action es nucleo en el reparto de modulos", () => {
    expect(MODULO_POR_ACTION["vehiculos-plataforma"]).toBe("nucleo");
  });

  it("el archivo esta en EXCEPCIONES_DE_PLATAFORMA con su ficha (design §3)", () => {
    const e = EXCEPCIONES_DE_PLATAFORMA.find((x) => x.archivo === "lib/actions/vehiculos-plataforma.ts");
    expect(e?.ficha).toBe("SL-42");
  });
});
