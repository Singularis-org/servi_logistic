import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import * as accionesDelModulo from "@/lib/actions/geografia-plataforma";
import {
  agregarNivelPaisAction,
  arbolDePaisAction,
  cambiarActivacionNodoAction,
  cambiarDisponibilidadPaisAction,
  cargarDivisionAction,
  contarOrdenesSinEntregarAction,
  crearNodoAction,
  crearPaisAction,
  listarPaisesAction,
  renombrarNodoAction,
  renombrarTipoNivelAction,
  type GeografiaPlataformaDeps,
} from "@/lib/actions/geografia-plataforma";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { ICargaDivisionService } from "@/lib/interfaces/services/ICargaDivisionService";
import type { IGeografiaService } from "@/lib/interfaces/services/IGeografiaService";
import type { IPaisService } from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { PAIS_TOPE_DE_NIVELES, PaisService } from "@/lib/services/PaisService";

// SL-20 (T4.3, T4.6; design §4, §5, §6) — el borde de la geografía y los países del superadmin.
//
// Lo que fija este archivo, y ningún test de servicio puede: el ORDEN de la puerta (sesión →
// `exigirSuperadmin` → zod → servicio), que el servicio corre dentro de `comoPlataforma` (R32) y la
// traducción de errores del borde: solo el único violado es `conflict` (R16, R52); cualquier otro
// fallo es `error` y queda en el log (R36, R51).
//
// SLT-46 (T4.4; design §4.1, §4.2): los nodos viajan por id, sin `nivel` (`{paisId}` o `{padreId}` en
// el alta; `{id}` en el resto). Los casos de SL-20 conservan su desenlace con la forma nueva. Se suman
// `renombrarTipoNivelAction` y `agregarNivelPaisAction`, y la lista de exports del módulo (R22, R50).

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: ROLES_PLATAFORMA[0] };
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: RolValue.maestro };

type Espia = ReturnType<typeof vi.fn>;

function geografiaDoble(o: Partial<Record<keyof IGeografiaService, Espia>> = {}) {
  return {
    listarArbol: vi.fn(async () => ({ status: "ok" as const, provincias: [] })),
    listarArbolDePais: vi.fn(async () => ({ status: "ok" as const, provincias: [] })),
    crear: vi.fn(async () => ({ status: "ok" as const, id: "n1", nivel: "provincia" as const })),
    cambiarActivacion: vi.fn(async () => ({ status: "ok" as const, nivel: "distrito" as const, id: "d1", activo: false })),
    renombrar: vi.fn(async () => ({ status: "ok" as const, nivel: "distrito" as const, id: "d1", nombre: "Otro" })),
    contarOrdenesSinEntregar: vi.fn(async () => ({ status: "ok" as const, ordenes: 3 })),
    ...o,
  } satisfies Record<keyof IGeografiaService, Espia>;
}

function cargaDoble(cargar: Espia = vi.fn(async () => ({ status: "not_found" as const }))) {
  return { cargar } satisfies Record<keyof ICargaDivisionService, Espia>;
}

function paisDoble(o: Partial<Record<keyof IPaisService, Espia>> = {}) {
  return {
    listar: vi.fn(async () => ({ status: "ok" as const, paises: [] })),
    listarDisponibles: vi.fn(async () => ({ status: "ok" as const, paises: [] })),
    crear: vi.fn(async () => ({ status: "conflict" as const, campo: "id" as const })),
    cambiarDisponible: vi.fn(async () => ({ status: "ok" as const, id: "CR", disponible: false })),
    etiquetasDeEmpresa: vi.fn(),
    // SLT-46 (T4.4): los llaman `renombrarTipoNivelAction` y `agregarNivelPaisAction`.
    renombrarTipo: vi.fn(async () => ({ status: "ok" as const })),
    agregarNivel: vi.fn(async () => ({ status: "not_found" as const })),
    // SLT-46 (T4.6): lo llama `reordenarTiposAction`.
    reordenarTipos: vi.fn(async () => ({ status: "ok" as const })),
    ...o,
  } satisfies Record<keyof IPaisService, Espia>;
}

function todosLosDobles(actor: Actor | null) {
  const geografiaService = geografiaDoble();
  const cargaDivisionService = cargaDoble();
  const paisService = paisDoble();
  const deps = {
    getActor: async () => actor,
    geografiaService: geografiaService as unknown as IGeografiaService,
    cargaDivisionService: cargaDivisionService as unknown as ICargaDivisionService,
    paisService: paisService as unknown as IPaisService,
  } satisfies GeografiaPlataformaDeps;
  const espias = [
    ...Object.values(geografiaService),
    ...Object.values(cargaDivisionService),
    ...Object.values(paisService),
  ];
  return { deps, geografiaService, cargaDivisionService, paisService, espias };
}

function csv(texto: string, nombre = "division.csv", paisId: string | null = "XA"): FormData {
  const fd = new FormData();
  if (paisId !== null) fd.set("paisId", paisId);
  fd.set("archivo", new File([texto], nombre, { type: "text/csv" }));
  return fd;
}

/** Cada action con una entrada BASURA: sin la puerta delante, devolvería `validation_error`. */
const ACCIONES: [string, (deps: GeografiaPlataformaDeps) => Promise<{ status: string }>][] = [
  ["listarPaisesAction", (d) => listarPaisesAction(d)],
  ["crearPaisAction", (d) => crearPaisAction({ basura: true }, d)],
  ["cambiarDisponibilidadPaisAction", (d) => cambiarDisponibilidadPaisAction({ basura: true }, d)],
  ["arbolDePaisAction", (d) => arbolDePaisAction({ basura: true }, d)],
  ["crearNodoAction", (d) => crearNodoAction({ basura: true }, d)],
  ["renombrarNodoAction", (d) => renombrarNodoAction({ basura: true }, d)],
  ["cambiarActivacionNodoAction", (d) => cambiarActivacionNodoAction({ basura: true }, d)],
  ["contarOrdenesSinEntregarAction", (d) => contarOrdenesSinEntregarAction({ basura: true }, d)],
  ["cargarDivisionAction", (d) => cargarDivisionAction(new FormData(), d)],
  ["renombrarTipoNivelAction", (d) => renombrarTipoNivelAction({ basura: true }, d)],
  ["agregarNivelPaisAction", (d) => agregarNivelPaisAction({ basura: true }, d)],
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SL-20 — sin sesión: `unauthenticated` antes de validar y sin tocar ningún servicio", () => {
  it.each(ACCIONES)("%s", async (_nombre, accion) => {
    const { deps, espias } = todosLosDobles(null);
    expect(await accion(deps)).toEqual({ status: "unauthenticated" });
    for (const e of espias) expect(e).not.toHaveBeenCalled();
  });
});

describe("SL-20/R37 — un rol de empresa recibe `forbidden` antes de validar y sin tocar ningún servicio", () => {
  it.each(ACCIONES)("%s (maestro)", async (_nombre, accion) => {
    const { deps, espias } = todosLosDobles(MAESTRO);
    expect(await accion(deps)).toEqual({ status: "forbidden" });
    for (const e of espias) expect(e).not.toHaveBeenCalled();
  });

  it("control positivo: con el superadmin la misma basura SÍ llega a la validación", async () => {
    const { deps } = todosLosDobles(SUPERADMIN);
    expect((await crearNodoAction({ basura: true }, deps)).status).toBe("validation_error");
  });
});

describe("SL-20 — entrada inválida: `validation_error` por campo, sin llamar al servicio", () => {
  it.each([
    // SLT-46: el `nivel` ya no viaja; traerlo (aunque sea uno desconocido) es una clave de más.
    ["alta: nivel desconocido", { nivel: "region", nombre: "Chorotega" }],
    ["alta: raíz sin país", { nombre: "Puntarenas" }],
    ["alta: raíz con país que no es ISO alfa-2", { nombre: "Puntarenas", paisId: "cr" }],
    ["alta: hijo con el padre por nivel (`provinciaId`) en vez de `padreId`", { nombre: "Buenos Aires", provinciaId: "p1" }],
    ["alta: nombre de un carácter", { nombre: "a", paisId: "CR" }],
    ["alta: clave desconocida", { nombre: "Puntarenas", paisId: "CR", cantonId: "c1" }],
    ["alta: país y padre a la vez", { nombre: "Puntarenas", paisId: "CR", padreId: "n1" }],
  ])("%s", async (_caso, entrada) => {
    const { deps, geografiaService } = todosLosDobles(SUPERADMIN);
    const r = await crearNodoAction(entrada, deps);
    expect(r.status).toBe("validation_error");
    expect(geografiaService.crear).not.toHaveBeenCalled();
  });

  it("el `validation_error` del alta trae el campo que falla", async () => {
    const { deps } = todosLosDobles(SUPERADMIN);
    const r = await crearNodoAction({ nombre: "a", paisId: "CR" }, deps);
    if (r.status !== "validation_error") throw new Error(`se esperaba validation_error: ${r.status}`);
    expect(Object.keys(r.fieldErrors)).toContain("nombre");
  });

  it.each([
    ["renombrado sin nombre", () => renombrarNodoAction({ id: "d1" }, todosLosDobles(SUPERADMIN).deps)],
    ["retiro sin `activo`", () => cambiarActivacionNodoAction({ id: "d1" }, todosLosDobles(SUPERADMIN).deps)],
    ["conteo con id vacío", () => contarOrdenesSinEntregarAction({ id: "" }, todosLosDobles(SUPERADMIN).deps)],
    ["SLT-46: renombrado con `nivel`", () => renombrarNodoAction({ nivel: "distrito", id: "d1", nombre: "Otro" }, todosLosDobles(SUPERADMIN).deps)],
    ["SLT-46: conteo con `nivel`", () => contarOrdenesSinEntregarAction({ nivel: "canton", id: "c1" }, todosLosDobles(SUPERADMIN).deps)],
    ["árbol con país inválido", () => arbolDePaisAction({ paisId: "Costa Rica" }, todosLosDobles(SUPERADMIN).deps)],
  ])("%s", async (_caso, llamar) => {
    expect((await llamar()).status).toBe("validation_error");
  });

  it.each([
    ["sin `disponible`", { id: "CR" }],
    ["`disponible` como texto", { id: "CR", disponible: "false" }],
    ["código que no es alfa-2", { id: "CRI", disponible: false }],
    ["clave de más", { id: "CR", disponible: false, nombre: "Costa Rica" }],
  ])("R47 — disponibilidad %s", async (_caso, entrada) => {
    const { deps, paisService } = todosLosDobles(SUPERADMIN);
    const r = await cambiarDisponibilidadPaisAction(entrada, deps);
    expect(r.status).toBe("validation_error");
    expect(paisService.cambiarDisponible).not.toHaveBeenCalled();
  });

  it("carga sin archivo: `validation_error` en `archivo`", async () => {
    const { deps, cargaDivisionService } = todosLosDobles(SUPERADMIN);
    const fd = new FormData();
    fd.set("paisId", "XA");
    fd.set("archivo", "no soy un archivo");
    expect(await cargarDivisionAction(fd, deps)).toEqual({
      status: "validation_error",
      fieldErrors: { archivo: ["Falta el archivo CSV."] },
    });
    expect(cargaDivisionService.cargar).not.toHaveBeenCalled();
  });

  it("carga sin país: `validation_error` en `paisId`", async () => {
    const { deps, cargaDivisionService } = todosLosDobles(SUPERADMIN);
    const r = await cargarDivisionAction(csv("x", "division.csv", null), deps);
    if (r.status !== "validation_error") throw new Error(`se esperaba validation_error: ${r.status}`);
    expect(Object.keys(r.fieldErrors)).toEqual(["paisId"]);
    expect(cargaDivisionService.cargar).not.toHaveBeenCalled();
  });
});

describe("SL-20/R32 — el servicio corre dentro de `comoPlataforma` y recibe la entrada normalizada", () => {
  it("el alta llega al servicio con el nombre recortado, el actor y el contexto de plataforma SL-20", async () => {
    let contexto: unknown;
    const crear = vi.fn(async () => {
      contexto = contextoActual();
      return { status: "ok" as const, id: "n1", nivel: "distrito" as const };
    });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ crear }) as unknown as IGeografiaService };
    const r = await crearNodoAction({ padreId: "c1", nombre: "  Cabagra  ", codigo: "60305" }, deps);

    expect(r).toEqual({ status: "ok", id: "n1", nivel: "distrito" });
    // SLT-46 (T4.4): el borde y el servicio hablan la misma forma por nodo; no hay traducción.
    expect(crear).toHaveBeenCalledWith({ padreId: "c1", nombre: "Cabagra", codigo: "60305" }, SUPERADMIN);
    expect(contexto).toMatchObject({ tipo: "plataforma", ficha: "SL-20" });
  });

  it.each([
    ["listarPaisesAction", (d: GeografiaPlataformaDeps) => listarPaisesAction(d), "paisService", "listar"],
    ["arbolDePaisAction", (d: GeografiaPlataformaDeps) => arbolDePaisAction({ paisId: "XA" }, d), "geografiaService", "listarArbolDePais"],
    ["cambiarActivacionNodoAction", (d: GeografiaPlataformaDeps) => cambiarActivacionNodoAction({ id: "c1", activo: true }, d), "geografiaService", "cambiarActivacion"],
    ["contarOrdenesSinEntregarAction", (d: GeografiaPlataformaDeps) => contarOrdenesSinEntregarAction({ id: "d1" }, d), "geografiaService", "contarOrdenesSinEntregar"],
    ["renombrarNodoAction", (d: GeografiaPlataformaDeps) => renombrarNodoAction({ id: "d1", nombre: "Otro", nombreAnterior: "Cabagra" }, d), "geografiaService", "renombrar"],
    ["renombrarTipoNivelAction", (d: GeografiaPlataformaDeps) => renombrarTipoNivelAction({ tipoId: "t1" }, d), "paisService", "renombrarTipo"],
    ["agregarNivelPaisAction", (d: GeografiaPlataformaDeps) => agregarNivelPaisAction({ paisId: "XA" }, d), "paisService", "agregarNivel"],
    ["crearPaisAction", (d: GeografiaPlataformaDeps) => crearPaisAction({ id: "XA" }, d), "paisService", "crear"],
    ["cambiarDisponibilidadPaisAction", (d: GeografiaPlataformaDeps) => cambiarDisponibilidadPaisAction({ id: "CR", disponible: false }, d), "paisService", "cambiarDisponible"],
    ["cargarDivisionAction", (d: GeografiaPlataformaDeps) => cargarDivisionAction(csv("x"), d), "cargaDivisionService", "cargar"],
  ] as const)("%s corre en plataforma", async (_n, accion, servicio, metodo) => {
    const { deps, geografiaService, cargaDivisionService, paisService } = todosLosDobles(SUPERADMIN);
    const dobles = { geografiaService, cargaDivisionService, paisService } as Record<string, Record<string, Espia>>;
    let contexto: unknown;
    dobles[servicio][metodo].mockImplementationOnce(async () => {
      contexto = contextoActual();
      return { status: "ok" };
    });
    await accion(deps);
    expect(dobles[servicio][metodo]).toHaveBeenCalledTimes(1);
    expect(contexto).toMatchObject({ tipo: "plataforma", ficha: "SL-20" });
  });

  it("listarPaisesAction y crearPaisAction pasan el actor; el alta de país pasa la entrada tal cual (la valida el servicio)", async () => {
    const { deps, paisService } = todosLosDobles(SUPERADMIN);
    const entrada = { id: "XA", nombre: "País XA" };
    await listarPaisesAction(deps);
    await crearPaisAction(entrada, deps);
    expect(paisService.listar).toHaveBeenCalledWith(SUPERADMIN);
    expect(paisService.crear).toHaveBeenCalledWith(entrada, SUPERADMIN);
  });
});

describe("SL-20/R36, R52 — solo el único violado es `conflict`; cualquier otro fallo es `error` con log", () => {
  const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" });
  const delDriver = () => Object.assign(new Error("fallo del driver"), { cause: { kind: "postgres", originalCode: "23505" } });
  const otro = () => new Error("la base se cayó; nombre=Juan Pérez");

  function silenciarLog() {
    return vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it.each([
    ["P2002 (único de un modelo)", p2002],
    ["23505 dentro del `cause` del driver", delDriver],
  ])("alta con %s → conflict (R16, R52), sin log", async (_c, error) => {
    const log = silenciarLog();
    const crear = vi.fn(async () => {
      throw error();
    });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ crear }) as unknown as IGeografiaService };
    expect(await crearNodoAction({ nombre: "Puntarenas", paisId: "CR", codigo: "6" }, deps)).toEqual({
      status: "conflict",
    });
    expect(log).not.toHaveBeenCalled();
  });

  // SLT-46 (§4.1): la entrada ya no trae nivel; el log nombra el id que sí trae.
  it("⭑ R36: alta que falla por otra causa → `error`, NO `conflict`, y el log dice operación e id, sin datos de la fila", async () => {
    const log = silenciarLog();
    const crear = vi.fn(async () => {
      throw otro();
    });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ crear }) as unknown as IGeografiaService };
    expect(await crearNodoAction({ padreId: "c1", nombre: "Cabagra" }, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain("alta de nodo");
    expect(linea).toContain("padre=c1");
    expect(linea).not.toContain("Juan");
  });

  it("R36: renombrado — único → conflict; otra causa → error", async () => {
    silenciarLog();
    const entrada = { id: "d1", nombre: "Boruca", nombreAnterior: "Cabagra" };
    const conUnico = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ renombrar: vi.fn(async () => { throw p2002(); }) }) as unknown as IGeografiaService };
    const conOtro = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ renombrar: vi.fn(async () => { throw otro(); }) }) as unknown as IGeografiaService };
    expect(await renombrarNodoAction(entrada, conUnico)).toEqual({ status: "conflict" });
    expect(await renombrarNodoAction(entrada, conOtro)).toEqual({ status: "error" });
  });

  it("CONTRAPRUEBA: un Error con el texto «Unique constraint failed» pero sin código ya no es conflict (era el `catch {}` de D12)", async () => {
    silenciarLog();
    const crear = vi.fn(async () => {
      throw new Error("Unique constraint failed on the fields: (`canton_id`,`nombre`)");
    });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ crear }) as unknown as IGeografiaService };
    expect(await crearNodoAction({ padreId: "c1", nombre: "Cabagra" }, deps)).toEqual({ status: "error" });
  });

  it("alta de país y disponibilidad: un fallo del servicio es `error` con log", async () => {
    const log = silenciarLog();
    const paisService = paisDoble({
      crear: vi.fn(async () => { throw otro(); }),
      cambiarDisponible: vi.fn(async () => { throw otro(); }),
    });
    const deps = { getActor: async () => SUPERADMIN, paisService: paisService as unknown as IPaisService };
    expect(await crearPaisAction({ id: "XA" }, deps)).toEqual({ status: "error" });
    expect(await cambiarDisponibilidadPaisAction({ id: "XA", disponible: false }, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["retiro", false, "retiro de nodo"],
    ["reactivación", true, "reactivacion de nodo"],
  ])("R36 (decisión de la tanda 4): un fallo de la base en el %s es `error` con log, sin datos de la fila", async (_t, activo, operacion) => {
    const log = silenciarLog();
    const cambiarActivacion = vi.fn(async () => {
      throw otro();
    });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ cambiarActivacion }) as unknown as IGeografiaService };
    expect(await cambiarActivacionNodoAction({ id: "d1", activo }, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain(operacion);
    expect(linea).toContain("nodo=d1");
    expect(linea).not.toContain("Juan");
  });

  it("R36 (decisión de la tanda 4): un fallo de la base en el conteo es `error` con log, sin datos de la fila", async () => {
    const log = silenciarLog();
    const contarOrdenesSinEntregar = vi.fn(async () => {
      throw otro();
    });
    const deps = {
      getActor: async () => SUPERADMIN,
      geografiaService: geografiaDoble({ contarOrdenesSinEntregar }) as unknown as IGeografiaService,
    };
    expect(await contarOrdenesSinEntregarAction({ id: "c1" }, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain("conteo de ordenes");
    expect(linea).toContain("nodo=c1");
    expect(linea).not.toContain("Juan");
  });

  it("el retiro y el conteo que salen bien no escriben en el log", async () => {
    const log = silenciarLog();
    const { deps } = todosLosDobles(SUPERADMIN);
    expect((await cambiarActivacionNodoAction({ id: "d1", activo: false }, deps)).status).toBe("ok");
    expect(await contarOrdenesSinEntregarAction({ id: "d1" }, deps)).toEqual({ status: "ok", ordenes: 3 });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("SL-20/R24–R28, R48, R51 — la carga CSV pasa tal cual el contrato del servicio", () => {
  const resultados = [
    { status: "ok", creados: { provincia: 1, canton: 2, distrito: 3 }, existentes: 0, codigosCompletados: 0, avisos: ["La columna «x» no es del formato y se ignoró."] },
    { status: "invalido", errores: [{ linea: 3, mensaje: "falta nivel_2" }], total: 1, avisos: [] },
    { status: "archivo_rechazado", motivo: "El archivo no es .csv." },
    { status: "not_found" },
    { status: "forbidden" },
  ] as const;

  it.each(resultados)("$status", async (resultado) => {
    const cargar = vi.fn(async () => resultado);
    const deps = { getActor: async () => SUPERADMIN, cargaDivisionService: cargaDoble(cargar) as unknown as ICargaDivisionService };
    expect(await cargarDivisionAction(csv("nivel_1\n"), deps)).toEqual(resultado);
  });

  it("el servicio recibe el país, el nombre del archivo y sus bytes, y el actor", async () => {
    const cargar = vi.fn(async () => ({ status: "not_found" as const }));
    const deps = { getActor: async () => SUPERADMIN, cargaDivisionService: cargaDoble(cargar) as unknown as ICargaDivisionService };
    await cargarDivisionAction(csv("nivel_1,codigo_nivel_1\nSan José,1\n", "cr.csv", "CR"), deps);
    expect(cargar).toHaveBeenCalledTimes(1);
    const [paisId, archivo, actor] = cargar.mock.calls[0] as unknown as [string, { nombre: string; bytes: Uint8Array }, Actor];
    expect(paisId).toBe("CR");
    expect(archivo.nombre).toBe("cr.csv");
    expect(new TextDecoder().decode(archivo.bytes)).toBe("nivel_1,codigo_nivel_1\nSan José,1\n");
    expect(actor).toBe(SUPERADMIN);
  });

  it("R51: un fallo de la base al escribir es `error`, con el país en el log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cargar = vi.fn(async () => {
      throw new Error("conexión perdida");
    });
    const deps = { getActor: async () => SUPERADMIN, cargaDivisionService: cargaDoble(cargar) as unknown as ICargaDivisionService };
    expect(await cargarDivisionAction(csv("x"), deps)).toEqual({ status: "error" });
    expect(String(log.mock.calls[0][0])).toContain("pais=XA");
  });
});

describe("SL-20/R47 — disponibilidad de un país por el borde, con el servicio REAL", () => {
  function repoDoble(resultado: "no_existe" | "sin_cambio" | "cambiado") {
    return {
      listar: vi.fn(),
      listarDisponibles: vi.fn(),
      porId: vi.fn(),
      deLaEmpresa: vi.fn(),
      cambiarDisponible: vi.fn(async () => resultado),
      crear: vi.fn(),
      renombrarTipo: vi.fn(),
      agregarNivel: vi.fn(),
      reordenarTipos: vi.fn(),
    } satisfies Record<keyof IPaisRepository, Espia>;
  }

  it("pedir el estado que ya tiene es `ok` (el repositorio no escribió: `sin_cambio`)", async () => {
    const repo = repoDoble("sin_cambio");
    const deps = { getActor: async () => SUPERADMIN, paisService: new PaisService(repo as unknown as IPaisRepository) };
    expect(await cambiarDisponibilidadPaisAction({ id: "CR", disponible: true }, deps)).toEqual({
      status: "ok",
      id: "CR",
      disponible: true,
    });
    expect(repo.cambiarDisponible).toHaveBeenCalledWith("CR", true, { usuarioId: SUPERADMIN.usuarioId });
  });

  it("apagar un país que cambia es `ok` con el estado nuevo", async () => {
    const deps = { getActor: async () => SUPERADMIN, paisService: new PaisService(repoDoble("cambiado") as unknown as IPaisRepository) };
    expect(await cambiarDisponibilidadPaisAction({ id: "XA", disponible: false }, deps)).toEqual({
      status: "ok",
      id: "XA",
      disponible: false,
    });
  });

  it("un país que no existe es `not_found`", async () => {
    const deps = { getActor: async () => SUPERADMIN, paisService: new PaisService(repoDoble("no_existe") as unknown as IPaisRepository) };
    expect(await cambiarDisponibilidadPaisAction({ id: "XZ", disponible: false }, deps)).toEqual({ status: "not_found" });
  });
});

describe("SL-20/R23, R41 — alta de país del catálogo por el borde, con el servicio REAL", () => {
  function repoDoble() {
    return {
      listar: vi.fn(async () => []),
      listarDisponibles: vi.fn(),
      porId: vi.fn(),
      deLaEmpresa: vi.fn(),
      cambiarDisponible: vi.fn(),
      // SLT-46 (T4.3): el servicio da el alta con `crear`; el `pais` del doble solo lleva lo que mira el caso.
      crear: vi.fn(async (datos: { id: string; nombre: string }) => ({
        estado: "creado" as const,
        pais: { id: datos.id, nombre: datos.nombre },
        tipos: [],
      })),
      renombrarTipo: vi.fn(),
      agregarNivel: vi.fn(),
      reordenarTipos: vi.fn(),
    } satisfies Record<keyof IPaisRepository, Espia>;
  }

  // SLT-46 (T4.3): los nombres de nivel viajan como lista ordenada `tipos` (antes, seis campos fijos).
  const NIVELES = {
    tipos: [
      { singular: "Departamento", plural: "Departamentos" },
      { singular: "Municipio", plural: "Municipios" },
      { singular: "Aldea", plural: "Aldeas" },
    ],
  };

  it("R23: el país se crea con el nombre del catálogo", async () => {
    const repo = repoDoble();
    const deps = { getActor: async () => SUPERADMIN, paisService: new PaisService(repo as unknown as IPaisRepository) };
    const r = await crearPaisAction({ id: "GT", ...NIVELES }, deps);
    expect(r.status === "ok" && r.pais.nombre).toBe("Guatemala");
    expect(repo.crear).toHaveBeenCalledWith({ id: "GT", nombre: "Guatemala", ...NIVELES }, { usuarioId: SUPERADMIN.usuarioId });
  });

  it("R41: un código fuera del catálogo es `validation_error` en `id` y no toca la base", async () => {
    const repo = repoDoble();
    const deps = { getActor: async () => SUPERADMIN, paisService: new PaisService(repo as unknown as IPaisRepository) };
    const r = await crearPaisAction({ id: "XA", ...NIVELES }, deps);
    expect(r.status === "validation_error" && Object.keys(r.fieldErrors)).toEqual(["id"]);
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });
});

describe("SLT-46 R25, R48, R49 — renombrar un tipo y agregar un nivel por el borde, con el servicio REAL", () => {
  const TIPO = {
    id: "t4",
    clave: "nivel_4",
    profundidad: 4,
    nombreSingular: "Barrio",
    nombrePlural: "Barrios",
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  };
  const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" });
  const delDriver = () => Object.assign(new Error("fallo del driver"), { cause: { kind: "postgres", originalCode: "23505" } });
  const otro = () => new Error("la base se cayó; nombre=Juan Pérez");

  function repoDoble(o: Partial<Record<keyof IPaisRepository, Espia>> = {}) {
    return {
      listar: vi.fn(),
      listarDisponibles: vi.fn(),
      porId: vi.fn(),
      deLaEmpresa: vi.fn(),
      cambiarDisponible: vi.fn(),
      crear: vi.fn(),
      renombrarTipo: vi.fn(async () => "renombrado" as const),
      agregarNivel: vi.fn(async () => TIPO),
      reordenarTipos: vi.fn(),
      ...o,
    } satisfies Record<keyof IPaisRepository, Espia>;
  }

  function conRepo(repo: ReturnType<typeof repoDoble>) {
    return { getActor: async () => SUPERADMIN, paisService: new PaisService(repo as unknown as IPaisRepository) };
  }

  // SLT-46 (2026-11-09, §4.1): el renombre gana `anterior` y agregar nivel, `profundidad` (el «antes»).
  const ANTERIOR = { nombreSingular: "Provincia", nombrePlural: "Provincias" };
  const RENOMBRE = { tipoId: "t1", nombreSingular: "  Región ", nombrePlural: "Regiones", anterior: ANTERIOR };
  const NIVEL = { paisId: "XA", nombreSingular: " Barrio ", nombrePlural: "Barrios", profundidad: 4 };

  it("R25: renombrar un tipo pasa la entrada validada y el actor al repositorio y responde `ok`", async () => {
    const repo = repoDoble();
    expect(await renombrarTipoNivelAction(RENOMBRE, conRepo(repo))).toEqual({ status: "ok" });
    expect(repo.renombrarTipo).toHaveBeenCalledWith("t1", { nombreSingular: "Región", nombrePlural: "Regiones" }, ANTERIOR, {
      usuarioId: SUPERADMIN.usuarioId,
    });
  });

  it("R26: los nombres que ya tiene (`sin_cambio`) también son `ok`", async () => {
    const repo = repoDoble({ renombrarTipo: vi.fn(async () => "sin_cambio" as const) });
    expect(await renombrarTipoNivelAction(RENOMBRE, conRepo(repo))).toEqual({ status: "ok" });
  });

  it("R25: un tipo que no existe es `not_found`", async () => {
    const repo = repoDoble({ renombrarTipo: vi.fn(async () => "no_existe" as const) });
    expect(await renombrarTipoNivelAction(RENOMBRE, conRepo(repo))).toEqual({ status: "not_found" });
  });

  it.each([
    ["un nombre de un carácter", { ...RENOMBRE, nombreSingular: "R" }, "nombreSingular"],
    ["un tipo vacío", { ...RENOMBRE, tipoId: "" }, "tipoId"],
    ["una clave de más", { ...RENOMBRE, clave: "nivel_2" }, "entrada"],
  ])("R25: renombrar con %s es `validation_error` y no toca el repositorio", async (_c, entrada, campo) => {
    const repo = repoDoble();
    const r = await renombrarTipoNivelAction(entrada, conRepo(repo));
    if (r.status !== "validation_error") throw new Error(`se esperaba validation_error: ${r.status}`);
    expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(repo.renombrarTipo).not.toHaveBeenCalled();
  });

  it("R36: renombrar un tipo que falla en la base es `error` con log, sin datos de la fila", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = repoDoble({ renombrarTipo: vi.fn(async () => { throw otro(); }) });
    expect(await renombrarTipoNivelAction(RENOMBRE, conRepo(repo))).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain("renombrado de tipo de nivel");
    expect(linea).not.toContain("Juan");
    expect(linea).not.toContain("Región");
  });

  it("R48: agregar un nivel pasa la entrada validada y el actor, y devuelve el tipo creado", async () => {
    const repo = repoDoble();
    expect(await agregarNivelPaisAction(NIVEL, conRepo(repo))).toEqual({ status: "ok", tipo: TIPO });
    expect(repo.agregarNivel).toHaveBeenCalledWith("XA", { nombreSingular: "Barrio", nombrePlural: "Barrios" }, 4, {
      usuarioId: SUPERADMIN.usuarioId,
    });
  });

  it("R49: un país que no existe es `not_found`", async () => {
    const repo = repoDoble({ agregarNivel: vi.fn(async () => "no_existe" as const) });
    expect(await agregarNivelPaisAction(NIVEL, conRepo(repo))).toEqual({ status: "not_found" });
  });

  it("R49: el tope de 10 niveles es `validation_error` en `paisId`", async () => {
    const repo = repoDoble({ agregarNivel: vi.fn(async () => "tope" as const) });
    expect(await agregarNivelPaisAction(NIVEL, conRepo(repo))).toEqual({
      status: "validation_error",
      fieldErrors: { paisId: [PAIS_TOPE_DE_NIVELES] },
    });
  });

  it.each([
    ["un nombre de un carácter", { ...NIVEL, nombreSingular: "B" }, "nombreSingular"],
    ["un nombre de 41 caracteres", { ...NIVEL, nombrePlural: "x".repeat(41) }, "nombrePlural"],
    ["una posición (siempre va al final)", { ...NIVEL, posicion: 2 }, "entrada"],
    ["un país que no es alfa-2", { ...NIVEL, paisId: "xa" }, "paisId"],
  ])("R49: agregar un nivel con %s es `validation_error` y no toca el repositorio", async (_c, entrada, campo) => {
    const repo = repoDoble();
    const r = await agregarNivelPaisAction(entrada, conRepo(repo));
    if (r.status !== "validation_error") throw new Error(`se esperaba validation_error: ${r.status}`);
    expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(repo.agregarNivel).not.toHaveBeenCalled();
  });

  it.each([
    ["P2002 (único de un modelo)", p2002],
    ["23505 dentro del `cause` del driver", delDriver],
  ])("R49: dos altas de nivel en paralelo — %s → `conflict`, sin log", async (_c, error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = repoDoble({ agregarNivel: vi.fn(async () => { throw error(); }) });
    expect(await agregarNivelPaisAction(NIVEL, conRepo(repo))).toEqual({ status: "conflict" });
    expect(log).not.toHaveBeenCalled();
  });

  it("R36: agregar un nivel que falla por otra causa es `error`, NO `conflict`, con log sin datos de la fila", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = repoDoble({ agregarNivel: vi.fn(async () => { throw otro(); }) });
    expect(await agregarNivelPaisAction(NIVEL, conRepo(repo))).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain("alta de nivel");
    expect(linea).not.toContain("Juan");
    expect(linea).not.toContain("Barrio");
  });

  it("R39: un rol de empresa recibe `forbidden` del borde sin tocar el repositorio", async () => {
    const repo = repoDoble();
    const deps = { getActor: async () => MAESTRO, paisService: new PaisService(repo as unknown as IPaisRepository) };
    expect(await renombrarTipoNivelAction(RENOMBRE, deps)).toEqual({ status: "forbidden" });
    expect(await agregarNivelPaisAction(NIVEL, deps)).toEqual({ status: "forbidden" });
    for (const e of Object.values(repo)) expect(e).not.toHaveBeenCalled();
  });
});

describe("SLT-46 R5 — un único violado en la copia a la geografía vieja es `conflict` en alta y renombre", () => {
  // La copia nodo → provincia/canton/distrito corre en el trigger, en la misma sentencia que el nodo:
  // su único violado sube como el del nodo (P2002 o 23505 en el `cause`) y el borde lo trata igual.
  const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" });
  const delDriver = () => Object.assign(new Error("fallo del driver"), { cause: { kind: "postgres", originalCode: "23505" } });

  it.each([
    ["P2002", p2002],
    ["23505 del driver", delDriver],
  ])("alta de un hijo y renombre con %s → `conflict`, sin log", async (_c, error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const geografiaService = geografiaDoble({
      crear: vi.fn(async () => { throw error(); }),
      renombrar: vi.fn(async () => { throw error(); }),
    });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: geografiaService as unknown as IGeografiaService };
    expect(await crearNodoAction({ padreId: "n9", nombre: "Barrio Uno" }, deps)).toEqual({ status: "conflict" });
    expect(await renombrarNodoAction({ id: "n9", nombre: "Barrio Dos", nombreAnterior: "Barrio Uno" }, deps)).toEqual({ status: "conflict" });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("SLT-46 R22, R50 — la lista de exports del borde", () => {
  it("son exactamente estas actions: ninguna mueve un nodo de padre ni quita un tipo o un nivel", () => {
    expect(Object.keys(accionesDelModulo).sort()).toEqual([
      "agregarNivelPaisAction",
      "arbolDePaisAction",
      "cambiarActivacionNodoAction",
      "cambiarDisponibilidadPaisAction",
      "cargarDivisionAction",
      "contarOrdenesSinEntregarAction",
      "crearNodoAction",
      "crearPaisAction",
      "listarPaisesAction",
      "renombrarNodoAction",
      "renombrarTipoNivelAction",
    ]);
    for (const nombre of Object.keys(accionesDelModulo)) {
      expect(nombre, nombre).not.toMatch(/mover|padre|quitar|borrar|eliminar|retirarNivel|retirarTipo/i);
    }
  });

  it("R22: renombre y cambio de estado con un `padreId` son `validation_error`, sin llamar al servicio", async () => {
    const { deps, geografiaService } = todosLosDobles(SUPERADMIN);
    expect((await renombrarNodoAction({ id: "n1", nombre: "Otro", nombreAnterior: "Uno", padreId: "n0" }, deps)).status).toBe("validation_error");
    expect((await cambiarActivacionNodoAction({ id: "n1", activo: false, padreId: "n0" }, deps)).status).toBe(
      "validation_error",
    );
    expect(geografiaService.renombrar).not.toHaveBeenCalled();
    expect(geografiaService.cambiarActivacion).not.toHaveBeenCalled();
  });
});
