import { describe, it, expect, vi, type Mock } from "vitest";
import { Prisma, type RolValue } from "@prisma/client";

import { TarifaValorService } from "@/lib/services/TarifaValorService";
import { TarifaValorRepository } from "@/lib/repositories/TarifaValorRepository";
import type { ITarifaValorRepository } from "@/lib/interfaces/repositories/ITarifaValorRepository";
import type { Actor } from "@/lib/interfaces/services/ITarifaValorService";
import type { FijarValorInput } from "@/lib/types/tarifa-flexible";

// SLT-52 T6.2 (design §8) — TarifaValorService. Cubre R3, R4, R5, R6, R7, R8, R9, R13, R14, R45.
// Las reglas del service se prueban con un doble del repositorio; el historial «en la misma
// transaccion» (R14) con el repositorio REAL sobre un doble de Prisma, porque es el repositorio quien
// abre la transaccion y un doble del repositorio no la veria.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const NO_ESCRIBEN: Actor[] = [
  ADMIN,
  { usuarioId: "u-tienda", rol: "adminTienda" },
  { usuarioId: "u-mens", rol: "mensajero" },
  { usuarioId: "u-sat", rol: "adminSatelite" },
  { usuarioId: "u-key", rol: "apiKey" },
  { usuarioId: "u-super", rol: "superadmin" },
  { usuarioId: "u-x", rol: "invitado" as RolValue },
];
const NO_LEEN = NO_ESCRIBEN.filter((a) => a.rol !== "admin");

type RepoDoble = ITarifaValorRepository & { [K in keyof ITarifaValorRepository]: Mock };

function repoDoble(overrides: Partial<RepoDoble> = {}): RepoDoble {
  const repo = {
    existeZona: vi.fn().mockResolvedValue(true),
    grupoEnZona: vi.fn().mockResolvedValue(true),
    esTiendaTarifable: vi.fn().mockResolvedValue(true),
    existeVehiculo: vi.fn().mockResolvedValue(true),
    fijar: vi.fn().mockResolvedValue({ id: "tv-1", reemplazo: false }),
    quitar: vi.fn().mockResolvedValue("ok" as const),
    listar: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return repo;
}

function cobro(overrides: Partial<FijarValorInput> = {}): FijarValorInput {
  return {
    concepto: "tienda_flete_entregado",
    modo: "monto",
    valor: "1500",
    ivaPct: "13",
    zonaId: "zona-1",
    grupoId: null,
    tiendaId: null,
    vehiculoId: null,
    ...overrides,
  };
}

function pago(overrides: Partial<FijarValorInput> = {}): FijarValorInput {
  return {
    concepto: "mensajero_entregado",
    modo: "monto",
    valor: "900",
    zonaId: "zona-1",
    grupoId: null,
    tiendaId: null,
    vehiculoId: null,
    ...overrides,
  };
}

describe("R13 — matriz de roles", () => {
  it("el maestro fija un valor y llega al repositorio con su usuario", async () => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).fijarValor(cobro(), MAESTRO);
    expect(res).toEqual({ status: "ok", id: "tv-1" });
    expect(repo.fijar).toHaveBeenCalledTimes(1);
    expect(repo.fijar.mock.calls[0][1]).toBe("u-maestro");
  });

  it.each(NO_ESCRIBEN)("$rol recibe forbidden al fijar y no se escribe ni se consulta nada", async (actor) => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).fijarValor(cobro(), actor);
    expect(res).toEqual({ status: "forbidden" });
    expect(repo.fijar).not.toHaveBeenCalled();
    expect(repo.existeZona).not.toHaveBeenCalled();
  });

  it.each(NO_ESCRIBEN)("$rol recibe forbidden al quitar y no se borra nada", async (actor) => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).quitarValor("tv-1", actor);
    expect(res).toEqual({ status: "forbidden" });
    expect(repo.quitar).not.toHaveBeenCalled();
  });

  it.each([MAESTRO, ADMIN])("$rol lee los valores", async (actor) => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).listarValores({ zonaId: "zona-1" }, actor);
    expect(res).toEqual({ status: "ok", items: [] });
    expect(repo.listar).toHaveBeenCalledWith({ zonaId: "zona-1" });
  });

  it.each(NO_LEEN)("$rol recibe forbidden al leer y no se consulta", async (actor) => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).listarValores({}, actor);
    expect(res).toEqual({ status: "forbidden" });
    expect(repo.listar).not.toHaveBeenCalled();
  });
});

describe("R3/R4/R45 — rangos e IVA, sin escribir", () => {
  it.each([
    ["valor negativo", cobro({ valor: "-1" }), "valor"],
    ["porcentaje mayor que 100", cobro({ modo: "porcentaje", valor: "100.01" }), "valor"],
    ["IVA mayor que 100", cobro({ ivaPct: "101" }), "ivaPct"],
    ["IVA negativo", cobro({ ivaPct: "-1" }), "ivaPct"],
    ["cobro a la tienda sin IVA (ausente)", cobro({ ivaPct: undefined }), "ivaPct"],
    ["cobro a la tienda sin IVA (null)", cobro({ ivaPct: null }), "ivaPct"],
    ["pago al mensajero con IVA 0", pago({ ivaPct: "0" }), "ivaPct"],
    ["pago al mensajero con IVA 13", pago({ ivaPct: "13" }), "ivaPct"],
    ["pago a la satelite con IVA 0", pago({ concepto: "satelite_rechazo", ivaPct: "0" }), "ivaPct"],
  ] as const)("%s → validation_error en %s y no se escribe", async (_caso, input, campo) => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).fijarValor(input, MAESTRO);
    expect(res.status).toBe("validation_error");
    if (res.status !== "validation_error") throw new Error("inalcanzable");
    expect(Object.keys(res.fieldErrors)).toEqual([campo]);
    expect(repo.fijar).not.toHaveBeenCalled();
  });

  it("un monto de 150 es valido: el tope de 100 solo aplica al porcentaje", async () => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).fijarValor(cobro({ valor: "150" }), MAESTRO);
    expect(res).toEqual({ status: "ok", id: "tv-1" });
  });

  it("guarda el modo, el valor y el IVA del cobro tal como llegan (R3)", async () => {
    const repo = repoDoble();
    await new TarifaValorService(repo).fijarValor(
      cobro({ modo: "porcentaje", valor: "7.5", ivaPct: "13.00" }),
      MAESTRO,
    );
    expect(repo.fijar.mock.calls[0][0]).toMatchObject({ modo: "porcentaje", valor: "7.5", ivaPct: "13.00" });
  });

  it("un pago sin IVA se guarda con ivaPct null (R45)", async () => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).fijarValor(pago(), MAESTRO);
    expect(res).toEqual({ status: "ok", id: "tv-1" });
    expect(repo.fijar.mock.calls[0][0]).toMatchObject({ concepto: "mensajero_entregado", ivaPct: null });
  });
});

describe("R5/R6 — los niveles que cada actor admite", () => {
  it.each([
    ["cobro: zona", cobro(), "zona"],
    ["cobro: grupo", cobro({ grupoId: "g-1" }), "grupo"],
    ["cobro: tienda en zona", cobro({ tiendaId: "t-1" }), "tienda_zona"],
    ["cobro: tienda en grupo", cobro({ tiendaId: "t-1", grupoId: "g-1" }), "tienda_grupo"],
    ["cobro: tienda en todas sus zonas", cobro({ tiendaId: "t-1", zonaId: null }), "tienda_general"],
    ["mensajero: zona", pago(), "zona"],
    ["mensajero: zona + vehiculo", pago({ vehiculoId: "v-1" }), "zona_vehiculo"],
    ["mensajero: grupo", pago({ grupoId: "g-1" }), "grupo"],
    ["mensajero: grupo + vehiculo", pago({ grupoId: "g-1", vehiculoId: "v-1" }), "grupo_vehiculo"],
    ["satelite: grupo + vehiculo", pago({ concepto: "satelite_entregado", grupoId: "g-1", vehiculoId: "v-1" }), "grupo_vehiculo"],
  ] as const)("%s → nivel %s", async (_caso, input, nivel) => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).fijarValor(input, MAESTRO);
    expect(res).toEqual({ status: "ok", id: "tv-1" });
    expect(repo.fijar.mock.calls[0][0].nivel).toBe(nivel);
  });
});

describe("R7 — nivel incompatible con el actor, sin escribir", () => {
  it.each([
    ["cobro con vehiculo", cobro({ vehiculoId: "v-1" }), "vehiculoId"],
    ["pago con tienda", pago({ tiendaId: "t-1" }), "tiendaId"],
    ["cobro con grupo sin zona", cobro({ zonaId: null, grupoId: "g-1" }), "grupoId"],
    ["pago con grupo sin zona", pago({ zonaId: null, grupoId: "g-1" }), "grupoId"],
    ["cobro sin ningun nivel", cobro({ zonaId: null }), "zonaId"],
    ["pago sin zona", pago({ zonaId: null }), "zonaId"],
  ] as const)("%s → validation_error en %s", async (_caso, input, campo) => {
    const repo = repoDoble();
    const res = await new TarifaValorService(repo).fijarValor(input, MAESTRO);
    expect(res.status).toBe("validation_error");
    if (res.status !== "validation_error") throw new Error("inalcanzable");
    expect(Object.keys(res.fieldErrors)).toEqual([campo]);
    expect(repo.fijar).not.toHaveBeenCalled();
  });

  it("la tienda con un rol no tarifable se rechaza en tiendaId sin escribir", async () => {
    const repo = repoDoble({ esTiendaTarifable: vi.fn().mockResolvedValue(false) });
    const res = await new TarifaValorService(repo).fijarValor(cobro({ tiendaId: "mensajero-1" }), MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { tiendaId: ["El valor debe asignarse a un adminTienda o a una API key."] },
    });
    expect(repo.esTiendaTarifable).toHaveBeenCalledWith("mensajero-1");
    expect(repo.fijar).not.toHaveBeenCalled();
  });

  it("un grupo de otra zona se rechaza en grupoId sin escribir", async () => {
    const repo = repoDoble({ grupoEnZona: vi.fn().mockResolvedValue(false) });
    const res = await new TarifaValorService(repo).fijarValor(cobro({ grupoId: "g-otra" }), MAESTRO);
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { grupoId: ["El grupo indicado no es de esa zona."] },
    });
    expect(repo.grupoEnZona).toHaveBeenCalledWith("g-otra", "zona-1");
    expect(repo.fijar).not.toHaveBeenCalled();
  });

  it.each([
    ["zona", { existeZona: vi.fn().mockResolvedValue(false) }, cobro(), "zonaId"],
    ["vehiculo", { existeVehiculo: vi.fn().mockResolvedValue(false) }, pago({ vehiculoId: "v-x" }), "vehiculoId"],
  ] as const)("una %s que no existe en la empresa se rechaza en %s", async (_q, over, input, campo) => {
    const repo = repoDoble(over);
    const res = await new TarifaValorService(repo).fijarValor(input, MAESTRO);
    expect(res.status).toBe("validation_error");
    if (res.status !== "validation_error") throw new Error("inalcanzable");
    expect(Object.keys(res.fieldErrors)).toEqual([campo]);
    expect(repo.fijar).not.toHaveBeenCalled();
  });
});

describe("R9 — quitar", () => {
  it("el maestro quita un valor", async () => {
    const repo = repoDoble();
    expect(await new TarifaValorService(repo).quitarValor("tv-1", MAESTRO)).toEqual({ status: "ok" });
    expect(repo.quitar).toHaveBeenCalledWith("tv-1", "u-maestro");
  });

  it("quitar un valor que no existe es not_found", async () => {
    const repo = repoDoble({ quitar: vi.fn().mockResolvedValue("not_found") });
    expect(await new TarifaValorService(repo).quitarValor("tv-x", MAESTRO)).toEqual({ status: "not_found" });
  });
});

// ---------------------------------------------------------------------------------------------
// R8 y R14 con el repositorio REAL: upsert y el historial en la MISMA transaccion.
// ---------------------------------------------------------------------------------------------

function prismaDoble(anterior: { id: string; modo: string; valor: Prisma.Decimal; ivaPct: Prisma.Decimal | null } | null) {
  const tx = {
    tarifaValor: {
      findFirst: vi.fn().mockResolvedValue(anterior),
      findUnique: vi.fn().mockResolvedValue({
        concepto: "tienda_flete_entregado",
        zona: { nombre: "Norte" },
        grupo: null,
        tienda: null,
        vehiculo: null,
      }),
      create: vi.fn().mockResolvedValue({ id: "tv-nuevo" }),
      update: vi.fn().mockResolvedValue({ id: "tv-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ nombre: "Ana", primerApellido: "Mora", rol: { value: "maestro" } }),
    },
    historialAccion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const raiz = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    tarifaValor: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    historialAccion: { createMany: vi.fn() },
    usuario: { findFirst: vi.fn().mockResolvedValue({ id: "t" }), findUnique: vi.fn() },
    zona: { findFirst: vi.fn().mockResolvedValue({ id: "zona-1" }) },
    grupoDistritos: { findFirst: vi.fn().mockResolvedValue({ id: "g" }) },
    vehiculo: { findFirst: vi.fn().mockResolvedValue({ id: "v" }) },
  };
  return { tx, raiz };
}

function servicioReal(raiz: unknown): TarifaValorService {
  return new TarifaValorService(new TarifaValorRepository(raiz as ConstructorParameters<typeof TarifaValorRepository>[0]));
}

describe("R8/R14 — upsert y historial en la misma transaccion (repositorio real)", () => {
  it("fijar un nivel ya ocupado REEMPLAZA la fila y el historial lleva el antes y el despues", async () => {
    const { tx, raiz } = prismaDoble({
      id: "tv-1",
      modo: "monto",
      valor: new Prisma.Decimal("1500"),
      ivaPct: new Prisma.Decimal("13"),
    });
    const res = await servicioReal(raiz).fijarValor(cobro({ valor: "1800" }), MAESTRO);

    expect(res).toEqual({ status: "ok", id: "tv-1" });
    expect(tx.tarifaValor.findFirst.mock.calls[0][0].where).toEqual({
      concepto: "tienda_flete_entregado",
      zonaId: "zona-1",
      grupoId: null,
      tiendaId: null,
      mensajeroId: null,
      vehiculoId: null,
    });
    expect(tx.tarifaValor.update).toHaveBeenCalledTimes(1);
    expect(tx.tarifaValor.update.mock.calls[0][0].where).toEqual({ id: "tv-1" });
    expect(tx.tarifaValor.create).not.toHaveBeenCalled();

    expect(tx.historialAccion.createMany).toHaveBeenCalledTimes(1);
    const [fila] = tx.historialAccion.createMany.mock.calls[0][0].data;
    expect(fila).toMatchObject({
      accion: "tarifa_valor_fijado",
      entidadTipo: "tarifa_valor",
      entidadId: "tv-1",
      entidadEtiqueta: "tienda_flete_entregado · Norte",
      actorUsuarioId: "u-maestro",
      actorNombre: "Ana Mora",
      actorRol: "maestro",
      valorAnterior: "monto 1500.00 IVA 13.00",
      valorNuevo: "monto 1800.00 IVA 13.00",
    });
    // La misma transaccion: nada se escribio por el cliente raiz.
    expect(raiz.$transaction).toHaveBeenCalledTimes(1);
    expect(raiz.historialAccion.createMany).not.toHaveBeenCalled();
    expect(raiz.tarifaValor.update).not.toHaveBeenCalled();
  });

  it("fijar un nivel libre CREA la fila y el historial no tiene antes", async () => {
    const { tx, raiz } = prismaDoble(null);
    const res = await servicioReal(raiz).fijarValor(pago({ valor: "900" }), MAESTRO);

    expect(res).toEqual({ status: "ok", id: "tv-nuevo" });
    expect(tx.tarifaValor.create).toHaveBeenCalledTimes(1);
    expect(tx.tarifaValor.create.mock.calls[0][0].data).toMatchObject({
      concepto: "mensajero_entregado",
      modo: "monto",
      ivaPct: null,
      zonaId: "zona-1",
      mensajeroId: null,
      actualizadoPor: "u-maestro",
    });
    const [fila] = tx.historialAccion.createMany.mock.calls[0][0].data;
    expect(fila).toMatchObject({ valorAnterior: null, valorNuevo: "monto 900.00" });
    expect(raiz.historialAccion.createMany).not.toHaveBeenCalled();
  });

  it("quitar borra la fila y el historial lleva el valor que se fue, en la misma transaccion", async () => {
    const { tx, raiz } = prismaDoble({
      id: "tv-1",
      modo: "porcentaje",
      valor: new Prisma.Decimal("12.5"),
      ivaPct: null,
    });
    const res = await servicioReal(raiz).quitarValor("tv-1", MAESTRO);

    expect(res).toEqual({ status: "ok" });
    expect(tx.tarifaValor.deleteMany).toHaveBeenCalledWith({ where: { id: "tv-1" } });
    const [fila] = tx.historialAccion.createMany.mock.calls[0][0].data;
    expect(fila).toMatchObject({
      accion: "tarifa_valor_quitado",
      entidadId: "tv-1",
      valorAnterior: "porcentaje 12.50",
      valorNuevo: null,
    });
    expect(raiz.historialAccion.createMany).not.toHaveBeenCalled();
    expect(raiz.tarifaValor.deleteMany).not.toHaveBeenCalled();
  });

  it("quitar un id que no existe no borra ni deja historial", async () => {
    const { tx, raiz } = prismaDoble(null);
    const res = await servicioReal(raiz).quitarValor("tv-x", MAESTRO);
    expect(res).toEqual({ status: "not_found" });
    expect(tx.tarifaValor.deleteMany).not.toHaveBeenCalled();
    expect(tx.historialAccion.createMany).not.toHaveBeenCalled();
  });
});
