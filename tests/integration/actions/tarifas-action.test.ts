import { describe, it, expect, vi, type Mock } from "vitest";

import * as acciones from "@/lib/actions/tarifas";
import {
  borrarGrupoDistritos,
  cambiarDistritosDeGrupo,
  crearGrupoDistritos,
  guardarTopeIntentos,
  guardarValoresTarifa,
  renombrarGrupoDistritos,
} from "@/lib/actions/tarifas";
import type { IGrupoDistritosRepository } from "@/lib/interfaces/repositories/IGrupoDistritosRepository";
import type { ITarifaValorRepository } from "@/lib/interfaces/repositories/ITarifaValorRepository";
import type { Actor } from "@/lib/interfaces/services/ITarifaValorService";
import { GrupoDistritosService } from "@/lib/services/GrupoDistritosService";
import { TarifaValorService } from "@/lib/services/TarifaValorService";
import { TopeIntentosService } from "@/lib/services/TopeIntentosService";
import { MAX_CAMBIOS_DE_VALOR } from "@/lib/types/tarifa-flexible";

// SLT-54 T2.4, T2.5 (design §7, §8; R26, R35-R38) — el borde de Tarifas. Reescrito: lo que aqui se probaba
// de `crearTarifa`, `listarTarifas`, `actualizarTarifa` y `borrarTarifa` se fue con ellas. Se usa el service
// REAL sobre un doble del repositorio: `ivaPct` y la carrera los decide el service, y un doble suyo no
// veria nada. Lo que dice Postgres esta en `tests/integration/db/tarifa-activacion.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-m", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-a", rol: "admin" };
const conActor = (actor: Actor) => async () => actor;

function repoValores(overrides: Partial<Record<keyof ITarifaValorRepository, Mock>> = {}) {
  return {
    existeZona: vi.fn().mockResolvedValue(true),
    grupoEnZona: vi.fn().mockResolvedValue(true),
    esTiendaTarifable: vi.fn().mockResolvedValue(true),
    vehiculoEsElegibleONivelOcupado: vi.fn().mockResolvedValue(true),
    mensajeroEsElegibleONivelOcupado: vi.fn().mockResolvedValue(true),
    fijar: vi.fn().mockResolvedValue({ id: "tv-1", reemplazo: false }),
    quitar: vi.fn().mockResolvedValue("ok"),
    listar: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function guardar(repo: ReturnType<typeof repoValores>, cambios: unknown[], actor: Actor = MAESTRO) {
  const servicio = new TarifaValorService(repo as unknown as ITarifaValorRepository);
  return guardarValoresTarifa({ cambios }, { getActor: conActor(actor), servicio });
}

const NIVEL = { zonaId: "z1", grupoId: null, tiendaId: null, vehiculoId: null };
const COBRO = { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500", ivaPct: "13", ...NIVEL };
const PAGO = { concepto: "mensajero_entregado", modo: "monto", valor: "900", ...NIVEL };

describe("SLT-54 R26, R28 — las acciones viejas ya no existen", () => {
  it.each(["crearTarifa", "actualizarTarifa", "borrarTarifa", "listarTarifas", "obtenerTarifa"])(
    "%s no se exporta",
    (nombre) => {
      expect(Object.keys(acciones)).not.toContain(nombre);
    },
  );

  it("control positivo: las acciones nuevas sí", () => {
    expect(Object.keys(acciones)).toEqual(
      expect.arrayContaining([
        "activarTarifasNuevas",
        "cargarPantallaTarifas",
        "cargarZonaTarifas",
        "guardarValoresTarifa",
        "guardarTopeIntentos",
        "crearGrupoDistritos",
        "renombrarGrupoDistritos",
        "cambiarDistritosDeGrupo",
        "borrarGrupoDistritos",
      ]),
    );
  });
});

describe("SLT-54 R35, R38 — guardar valores", () => {
  it("fija y quita cada concepto, cada uno por su lado, y responde por su clave", async () => {
    const repo = repoValores();
    const res = await guardar(repo, [
      { accion: "fijar", clave: "a", datos: COBRO },
      { accion: "quitar", clave: "b", id: "tv-9" },
    ]);
    expect(res).toEqual({
      status: "ok",
      resultados: [
        { clave: "a", status: "ok" },
        { clave: "b", status: "ok" },
      ],
    });
    expect(repo.fijar).toHaveBeenCalledTimes(1);
    expect(repo.quitar).toHaveBeenCalledWith("tv-9", "u-m");
  });

  it("una lista vacía no escribe nada", async () => {
    const repo = repoValores();
    expect(await guardar(repo, [])).toEqual({ status: "ok", resultados: [] });
    expect(repo.fijar).not.toHaveBeenCalled();
  });

  it("R38: un concepto con error conserva los demás y dice su campo", async () => {
    const repo = repoValores();
    const res = await guardar(repo, [
      { accion: "fijar", clave: "a", datos: COBRO },
      { accion: "fijar", clave: "b", datos: { ...COBRO, concepto: "tienda_flete_rechazo", valor: "-1" } },
      { accion: "fijar", clave: "c", datos: PAGO },
    ]);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.resultados.map((r) => [r.clave, r.status])).toEqual([
      ["a", "ok"],
      ["b", "validation_error"],
      ["c", "ok"],
    ]);
    expect(Object.keys(res.resultados[1].fieldErrors ?? {})).toEqual(["valor"]);
    expect(repo.fijar).toHaveBeenCalledTimes(2);
  });

  it("R38: una excepción en una fila se queda en esa fila y las siguientes se guardan", async () => {
    const fijar = vi
      .fn()
      .mockRejectedValueOnce(new Error("base caida"))
      .mockResolvedValue({ id: "tv-2", reemplazo: false });
    const res = await guardar(repoValores({ fijar }), [
      { accion: "fijar", clave: "a", datos: COBRO },
      { accion: "fijar", clave: "b", datos: PAGO },
    ]);
    expect(res).toEqual({
      status: "ok",
      resultados: [
        { clave: "a", status: "error" },
        { clave: "b", status: "ok" },
      ],
    });
    expect(fijar).toHaveBeenCalledTimes(2);
  });

  it("quitar un valor que ya no está se dice en su fila", async () => {
    const res = await guardar(repoValores({ quitar: vi.fn().mockResolvedValue("not_found") }), [
      { accion: "quitar", clave: "a", id: "tv-x" },
    ]);
    expect(res).toEqual({ status: "ok", resultados: [{ clave: "a", status: "not_found" }] });
  });

  it("escritura por rol: el admin no escribe, fila por fila", async () => {
    const repo = repoValores();
    const res = await guardar(
      repo,
      [
        { accion: "fijar", clave: "a", datos: COBRO },
        { accion: "quitar", clave: "b", id: "tv-1" },
      ],
      ADMIN,
    );
    expect(res).toEqual({
      status: "ok",
      resultados: [
        { clave: "a", status: "forbidden" },
        { clave: "b", status: "forbidden" },
      ],
    });
    expect(repo.fijar).not.toHaveBeenCalled();
    expect(repo.quitar).not.toHaveBeenCalled();
  });

  it("sin sesión responde unauthenticated sin escribir", async () => {
    const repo = repoValores();
    const servicio = new TarifaValorService(repo as unknown as ITarifaValorRepository);
    const res = await guardarValoresTarifa(
      { cambios: [{ accion: "fijar", clave: "a", datos: COBRO }] },
      { getActor: async () => null, servicio },
    );
    expect(res).toEqual({ status: "unauthenticated" });
    expect(repo.fijar).not.toHaveBeenCalled();
  });

  it.each([
    ["sin cambios", {}],
    ["una acción desconocida", { cambios: [{ accion: "borrar", clave: "a", id: "x" }] }],
    ["sin clave", { cambios: [{ accion: "quitar", id: "x" }] }],
    ["sin datos", { cambios: [{ accion: "fijar", clave: "a" }] }],
  ])("%s es validation_error y no escribe", async (_caso, entrada) => {
    const repo = repoValores();
    const servicio = new TarifaValorService(repo as unknown as ITarifaValorRepository);
    const res = await guardarValoresTarifa(entrada, { getActor: conActor(MAESTRO), servicio });
    expect(res).toMatchObject({ status: "validation_error" });
    expect(repo.fijar).not.toHaveBeenCalled();
    expect(repo.quitar).not.toHaveBeenCalled();
  });

  it(`el tope es ${MAX_CAMBIOS_DE_VALOR} entradas: una más se rechaza entera`, async () => {
    const repo = repoValores();
    const cambios = (n: number) => Array.from({ length: n }, (_, i) => ({ accion: "quitar", clave: `c${i}`, id: "x" }));
    expect((await guardar(repo, cambios(200))).status).toBe("ok");
    expect(repo.quitar).toHaveBeenCalledTimes(200);
    repo.quitar.mockClear();
    expect((await guardar(repo, cambios(201))).status).toBe("validation_error");
    expect(repo.quitar).not.toHaveBeenCalled();
  });
});

describe("SLT-54 R36 — `ivaPct` en un pago", () => {
  it("sin la clave se guarda sin IVA", async () => {
    const repo = repoValores();
    const res = await guardar(repo, [{ accion: "fijar", clave: "a", datos: PAGO }]);
    expect(res).toEqual({ status: "ok", resultados: [{ clave: "a", status: "ok" }] });
    expect(repo.fijar.mock.calls[0][0]).toMatchObject({ concepto: "mensajero_entregado", ivaPct: null });
  });

  it.each([
    ["null", null],
    ["0", "0"],
    ["13", "13"],
  ])("con `ivaPct: %s` se rechaza en ese campo, sin escribir", async (_caso, ivaPct) => {
    const repo = repoValores();
    const res = await guardar(repo, [{ accion: "fijar", clave: "a", datos: { ...PAGO, ivaPct } }]);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.resultados[0].status).toBe("validation_error");
    expect(Object.keys(res.resultados[0].fieldErrors ?? {})).toEqual(["ivaPct"]);
    expect(repo.fijar).not.toHaveBeenCalled();
  });
});

describe("SLT-54 R37 — dos cambios del mismo concepto y nivel", () => {
  it("la carrera llega como validation_error en `concepto`, para pintarla en su fila", async () => {
    const res = await guardar(repoValores({ fijar: vi.fn().mockResolvedValue("nivel_ocupado") }), [
      { accion: "fijar", clave: "a", datos: COBRO },
    ]);
    expect(res).toEqual({
      status: "ok",
      resultados: [
        {
          clave: "a",
          status: "validation_error",
          fieldErrors: {
            concepto: ["Otro cambio fijó este concepto en el mismo nivel al mismo tiempo. Recarga y vuelve a intentarlo."],
          },
        },
      ],
    });
  });
});

// SLT-55 T3.3 (design §8). Lo mismo por el cliente de produccion, sin ningun doble, esta en
// `tests/integration/db/tarifas-valor-propio-pantalla.test.ts`.
describe("SLT-55 — guardar un valor propio del mensajero", () => {
  const PROPIO = {
    concepto: "mensajero_entregado",
    modo: "monto",
    valor: "2900",
    zonaId: null,
    grupoId: null,
    tiendaId: null,
    vehiculoId: null,
    mensajeroId: "m-1",
  };
  const NO_ELEGIBLE = "El mensajero no existe, no es de la empresa o está dado de baja: no admite un valor nuevo.";

  it("R1: la entrada del contrato llega al repositorio con su mensajero, en el nivel `mensajero` y sin IVA", async () => {
    const repo = repoValores();
    const res = await guardar(repo, [
      { accion: "fijar", clave: "mensajero_entregado:todos", datos: PROPIO },
      { accion: "quitar", clave: "mensajero_novedad:todos", id: "tv-9" },
    ]);
    expect(res).toEqual({
      status: "ok",
      resultados: [
        { clave: "mensajero_entregado:todos", status: "ok" },
        { clave: "mensajero_novedad:todos", status: "ok" },
      ],
    });
    expect(repo.mensajeroEsElegibleONivelOcupado).toHaveBeenCalledWith({ concepto: "mensajero_entregado", mensajeroId: "m-1" });
    expect(repo.fijar.mock.calls[0][0]).toMatchObject({
      concepto: "mensajero_entregado",
      modo: "monto",
      ivaPct: null,
      nivel: "mensajero",
      mensajeroId: "m-1",
      zonaId: null,
      grupoId: null,
      tiendaId: null,
      vehiculoId: null,
    });
    expect(repo.fijar.mock.calls[0][1]).toBe("u-m");
    expect(repo.quitar).toHaveBeenCalledWith("tv-9", "u-m");
  });

  it("R10: el admin recibe forbidden al fijar y al quitar, sin escribir", async () => {
    const repo = repoValores();
    const res = await guardar(
      repo,
      [
        { accion: "fijar", clave: "a", datos: PROPIO },
        { accion: "quitar", clave: "b", id: "tv-9" },
      ],
      ADMIN,
    );
    expect(res).toEqual({
      status: "ok",
      resultados: [
        { clave: "a", status: "forbidden" },
        { clave: "b", status: "forbidden" },
      ],
    });
    expect(repo.fijar).not.toHaveBeenCalled();
    expect(repo.quitar).not.toHaveBeenCalled();
  });

  it("R7, R8: un mensajero no elegible se dice en `mensajeroId`, en su fila, y las demás se guardan", async () => {
    const repo = repoValores({
      mensajeroEsElegibleONivelOcupado: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
    });
    const res = await guardar(repo, [
      { accion: "fijar", clave: "a", datos: PROPIO },
      { accion: "fijar", clave: "b", datos: { ...PROPIO, concepto: "mensajero_rechazo" } },
    ]);
    expect(res).toEqual({
      status: "ok",
      resultados: [
        { clave: "a", status: "validation_error", fieldErrors: { mensajeroId: [NO_ELEGIBLE] } },
        { clave: "b", status: "ok" },
      ],
    });
    expect(repo.fijar).toHaveBeenCalledTimes(1);
  });

  it("R5: con la clave `ivaPct`, aunque valga 0, se rechaza sin escribir", async () => {
    const repo = repoValores();
    const res = await guardar(repo, [{ accion: "fijar", clave: "a", datos: { ...PROPIO, ivaPct: "0" } }]);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.resultados[0].status).toBe("validation_error");
    expect(Object.keys(res.resultados[0].fieldErrors ?? {})).toEqual(["ivaPct"]);
    expect(repo.fijar).not.toHaveBeenCalled();
  });

  it("R6: mensajero con zona se rechaza: nunca se guarda como valor de la zona", async () => {
    const repo = repoValores();
    const res = await guardar(repo, [{ accion: "fijar", clave: "a", datos: { ...PROPIO, zonaId: "z1" } }]);
    if (res.status !== "ok") throw new Error(res.status);
    expect(res.resultados[0].status).toBe("validation_error");
    expect(repo.fijar).not.toHaveBeenCalled();
  });
});

function repoGrupos(overrides: Partial<Record<keyof IGrupoDistritosRepository, Mock>> = {}) {
  return {
    existeZona: vi.fn().mockResolvedValue(true),
    nombreOcupado: vi.fn().mockResolvedValue(false),
    distritosDeLaZona: vi.fn().mockResolvedValue(["d1"]),
    distritosEnOtroGrupo: vi.fn().mockResolvedValue([]),
    nombresDeDistritos: vi.fn().mockResolvedValue(new Map()),
    buscar: vi.fn().mockResolvedValue({ id: "g1", zonaId: "z1", nombre: "Sur" }),
    crear: vi.fn().mockResolvedValue({ status: "ok", id: "g1" }),
    renombrar: vi.fn().mockResolvedValue("ok"),
    fijarDistritos: vi.fn().mockResolvedValue("ok"),
    borrar: vi.fn().mockResolvedValue("ok"),
    listar: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function depsDeGrupos(repo: ReturnType<typeof repoGrupos>, actor: Actor | null = MAESTRO) {
  return {
    getActor: async () => actor,
    servicio: new GrupoDistritosService(repo as unknown as IGrupoDistritosRepository),
  };
}

describe("SLT-54 R42 — las cuatro actions de grupos", () => {
  it("crear, renombrar, cambiar distritos y borrar llegan al repositorio con el actor", async () => {
    const repo = repoGrupos();
    const deps = depsDeGrupos(repo);
    expect(await crearGrupoDistritos({ zonaId: "z1", nombre: "Sur", distritoIds: ["d1"] }, deps)).toEqual({
      status: "ok",
      id: "g1",
    });
    expect(repo.crear).toHaveBeenCalledWith({ zonaId: "z1", nombre: "Sur", distritoIds: ["d1"] }, "u-m");
    expect(await renombrarGrupoDistritos({ id: "g1", nombre: "Norte" }, deps)).toEqual({ status: "ok" });
    expect(repo.renombrar).toHaveBeenCalledWith("g1", "Norte", "u-m");
    expect(await cambiarDistritosDeGrupo({ id: "g1", distritoIds: ["d1"] }, deps)).toEqual({ status: "ok" });
    expect(repo.fijarDistritos).toHaveBeenCalledWith("g1", ["d1"], "u-m");
    expect(await borrarGrupoDistritos({ id: "g1" }, deps)).toEqual({ status: "ok" });
    expect(repo.borrar).toHaveBeenCalledWith("g1", "u-m");
  });

  it("un rechazo de SLT-52 R11 nombra el distrito sin la palabra del nivel, que depende del país", async () => {
    const repo = repoGrupos({
      distritosEnOtroGrupo: vi.fn().mockResolvedValue([{ distritoNombre: "Hatillo", grupoNombre: "Sur" }]),
    });
    const res = await cambiarDistritosDeGrupo({ id: "g1", distritoIds: ["d1"] }, depsDeGrupos(repo));
    expect(res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Hatillo ya está en el grupo Sur."] },
    });
    expect(repo.fijarDistritos).not.toHaveBeenCalled();
  });

  it.each([
    ["crear", () => crearGrupoDistritos],
    ["renombrar", () => renombrarGrupoDistritos],
    ["cambiar distritos", () => cambiarDistritosDeGrupo],
    ["borrar", () => borrarGrupoDistritos],
  ] as const)("%s con una entrada inválida es validation_error y no escribe", async (_caso, accion) => {
    const repo = repoGrupos();
    const res = await accion()({ nada: true }, depsDeGrupos(repo));
    expect(res).toMatchObject({ status: "validation_error" });
    expect(repo.crear).not.toHaveBeenCalled();
    expect(repo.renombrar).not.toHaveBeenCalled();
    expect(repo.fijarDistritos).not.toHaveBeenCalled();
    expect(repo.borrar).not.toHaveBeenCalled();
  });

  it("escritura por rol: el admin recibe forbidden en las cuatro, sin escribir", async () => {
    const repo = repoGrupos();
    const deps = depsDeGrupos(repo, ADMIN);
    const forbidden = { status: "forbidden" };
    expect(await crearGrupoDistritos({ zonaId: "z1", nombre: "Sur", distritoIds: [] }, deps)).toEqual(forbidden);
    expect(await renombrarGrupoDistritos({ id: "g1", nombre: "Norte" }, deps)).toEqual(forbidden);
    expect(await cambiarDistritosDeGrupo({ id: "g1", distritoIds: [] }, deps)).toEqual(forbidden);
    expect(await borrarGrupoDistritos({ id: "g1" }, deps)).toEqual(forbidden);
    for (const metodo of [repo.crear, repo.renombrar, repo.fijarDistritos, repo.borrar]) {
      expect(metodo).not.toHaveBeenCalled();
    }
  });

  it("sin sesión las cuatro responden unauthenticated", async () => {
    const repo = repoGrupos();
    const deps = depsDeGrupos(repo, null);
    const sinSesion = { status: "unauthenticated" };
    expect(await crearGrupoDistritos({}, deps)).toEqual(sinSesion);
    expect(await renombrarGrupoDistritos({}, deps)).toEqual(sinSesion);
    expect(await cambiarDistritosDeGrupo({}, deps)).toEqual(sinSesion);
    expect(await borrarGrupoDistritos({}, deps)).toEqual(sinSesion);
  });

  it("un fallo inesperado es `error`", async () => {
    const repo = repoGrupos({ borrar: vi.fn().mockRejectedValue(new Error("base caida")) });
    expect(await borrarGrupoDistritos({ id: "g1" }, depsDeGrupos(repo))).toEqual({ status: "error" });
  });
});

describe("SLT-77 R3-R5, R27 — guardar el tope de intentos", () => {
  function montar(guardar = vi.fn().mockResolvedValue({ cambio: true })) {
    return { guardar, servicio: new TopeIntentosService({ guardar }) };
  }

  it("el maestro guarda, y la empresa no viaja en ningun argumento: solo el valor y su actor", async () => {
    const { guardar, servicio } = montar();
    const res = await guardarTopeIntentos({ tope: 5 }, { getActor: conActor(MAESTRO), servicio });
    expect(res).toEqual({ status: "ok", tope: 5 });
    expect(guardar).toHaveBeenCalledExactlyOnceWith(5, "u-m");
  });

  it("R3: una entrada que nombra otra empresa se rechaza, sin escribir", async () => {
    const { guardar, servicio } = montar();
    const res = await guardarTopeIntentos(
      { tope: 5, organizacionId: "otra-empresa" },
      { getActor: conActor(MAESTRO), servicio },
    );
    expect(res).toMatchObject({ status: "validation_error" });
    expect(guardar).not.toHaveBeenCalled();
  });

  it("R4: el admin recibe forbidden, tambien con una entrada invalida", async () => {
    const { guardar, servicio } = montar();
    const deps = { getActor: conActor(ADMIN), servicio };
    expect(await guardarTopeIntentos({ tope: 5 }, deps)).toEqual({ status: "forbidden" });
    expect(await guardarTopeIntentos({ tope: 99 }, deps)).toEqual({ status: "forbidden" });
    expect(guardar).not.toHaveBeenCalled();
  });

  it.each([0, 11, 2.5])("R5: %s es validation_error, en el campo tope y sin escribir", async (tope) => {
    const { guardar, servicio } = montar();
    const res = await guardarTopeIntentos({ tope }, { getActor: conActor(MAESTRO), servicio });
    if (res.status !== "validation_error") throw new Error(res.status);
    expect(Object.keys(res.fieldErrors)).toEqual(["tope"]);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("sin sesión responde unauthenticated sin tocar el servicio", async () => {
    const { guardar, servicio } = montar();
    expect(await guardarTopeIntentos({ tope: 5 }, { getActor: async () => null, servicio })).toEqual({
      status: "unauthenticated",
    });
    expect(guardar).not.toHaveBeenCalled();
  });

  it("R27: un fallo es `error`, no un ok", async () => {
    const { servicio } = montar(vi.fn().mockRejectedValue(new Error("sin empresa")));
    expect(await guardarTopeIntentos({ tope: 5 }, { getActor: conActor(MAESTRO), servicio })).toEqual({
      status: "error",
    });
  });
});
