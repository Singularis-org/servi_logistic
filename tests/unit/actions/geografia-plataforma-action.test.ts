import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import {
  arbolDePaisAction,
  cambiarActivacionNodoAction,
  cambiarDisponibilidadPaisAction,
  cargarDivisionAction,
  contarOrdenesSinEntregarAction,
  crearNodoAction,
  crearPaisAction,
  listarPaisesAction,
  renombrarNodoAction,
  type GeografiaPlataformaDeps,
} from "@/lib/actions/geografia-plataforma";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { ICargaDivisionService } from "@/lib/interfaces/services/ICargaDivisionService";
import type { IGeografiaService } from "@/lib/interfaces/services/IGeografiaService";
import type { IPaisService } from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { PaisService } from "@/lib/services/PaisService";

// SL-20 (T4.3, T4.6; design §4, §5, §6) — el borde de la geografía y los países del superadmin.
//
// Lo que fija este archivo, y ningún test de servicio puede: el ORDEN de la puerta (sesión →
// `exigirSuperadmin` → zod → servicio), que el servicio corre dentro de `comoPlataforma` (R32) y la
// traducción de errores del borde: solo el único violado es `conflict` (R16, R52); cualquier otro
// fallo es `error` y queda en el log (R36, R51).

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
    ["alta: nivel desconocido", { nivel: "region", nombre: "Chorotega" }],
    ["alta: provincia sin país", { nivel: "provincia", nombre: "Puntarenas" }],
    ["alta: provincia con país que no es ISO alfa-2", { nivel: "provincia", nombre: "Puntarenas", paisId: "cr" }],
    ["alta: cantón sin padre", { nivel: "canton", nombre: "Buenos Aires" }],
    ["alta: nombre de un carácter", { nivel: "provincia", nombre: "a", paisId: "CR" }],
    ["alta: clave desconocida", { nivel: "provincia", nombre: "Puntarenas", paisId: "CR", cantonId: "c1" }],
  ])("%s", async (_caso, entrada) => {
    const { deps, geografiaService } = todosLosDobles(SUPERADMIN);
    const r = await crearNodoAction(entrada, deps);
    expect(r.status).toBe("validation_error");
    expect(geografiaService.crear).not.toHaveBeenCalled();
  });

  it("el `validation_error` del alta trae el campo que falla", async () => {
    const { deps } = todosLosDobles(SUPERADMIN);
    const r = await crearNodoAction({ nivel: "provincia", nombre: "a", paisId: "CR" }, deps);
    if (r.status !== "validation_error") throw new Error(`se esperaba validation_error: ${r.status}`);
    expect(Object.keys(r.fieldErrors)).toContain("nombre");
  });

  it.each([
    ["renombrado sin nombre", () => renombrarNodoAction({ nivel: "distrito", id: "d1" }, todosLosDobles(SUPERADMIN).deps)],
    ["retiro sin `activo`", () => cambiarActivacionNodoAction({ nivel: "distrito", id: "d1" }, todosLosDobles(SUPERADMIN).deps)],
    ["conteo con id vacío", () => contarOrdenesSinEntregarAction({ nivel: "canton", id: "" }, todosLosDobles(SUPERADMIN).deps)],
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
    const r = await crearNodoAction({ nivel: "distrito", nombre: "  Cabagra  ", cantonId: "c1", codigo: "60305" }, deps);

    expect(r).toEqual({ status: "ok", id: "n1", nivel: "distrito" });
    expect(crear).toHaveBeenCalledWith({ nivel: "distrito", nombre: "Cabagra", cantonId: "c1", codigo: "60305" }, SUPERADMIN);
    expect(contexto).toMatchObject({ tipo: "plataforma", ficha: "SL-20" });
  });

  it.each([
    ["listarPaisesAction", (d: GeografiaPlataformaDeps) => listarPaisesAction(d), "paisService", "listar"],
    ["arbolDePaisAction", (d: GeografiaPlataformaDeps) => arbolDePaisAction({ paisId: "XA" }, d), "geografiaService", "listarArbolDePais"],
    ["cambiarActivacionNodoAction", (d: GeografiaPlataformaDeps) => cambiarActivacionNodoAction({ nivel: "canton", id: "c1", activo: true }, d), "geografiaService", "cambiarActivacion"],
    ["contarOrdenesSinEntregarAction", (d: GeografiaPlataformaDeps) => contarOrdenesSinEntregarAction({ nivel: "distrito", id: "d1" }, d), "geografiaService", "contarOrdenesSinEntregar"],
    ["renombrarNodoAction", (d: GeografiaPlataformaDeps) => renombrarNodoAction({ nivel: "distrito", id: "d1", nombre: "Otro" }, d), "geografiaService", "renombrar"],
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
    expect(await crearNodoAction({ nivel: "provincia", nombre: "Puntarenas", paisId: "CR", codigo: "6" }, deps)).toEqual({
      status: "conflict",
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("⭑ R36: alta que falla por otra causa → `error`, NO `conflict`, y el log dice operación y nivel sin datos de la fila", async () => {
    const log = silenciarLog();
    const crear = vi.fn(async () => {
      throw otro();
    });
    const deps = { getActor: async () => SUPERADMIN, geografiaService: geografiaDoble({ crear }) as unknown as IGeografiaService };
    expect(await crearNodoAction({ nivel: "distrito", nombre: "Cabagra", cantonId: "c1" }, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain("alta de nodo");
    expect(linea).toContain("nivel=distrito");
    expect(linea).not.toContain("Juan");
  });

  it("R36: renombrado — único → conflict; otra causa → error", async () => {
    silenciarLog();
    const entrada = { nivel: "distrito", id: "d1", nombre: "Boruca" };
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
    expect(await crearNodoAction({ nivel: "distrito", nombre: "Cabagra", cantonId: "c1" }, deps)).toEqual({ status: "error" });
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
    expect(await cambiarActivacionNodoAction({ nivel: "distrito", id: "d1", activo }, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain(operacion);
    expect(linea).toContain("nivel=distrito");
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
    expect(await contarOrdenesSinEntregarAction({ nivel: "canton", id: "c1" }, deps)).toEqual({ status: "error" });
    expect(log).toHaveBeenCalledTimes(1);
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toContain("conteo de ordenes");
    expect(linea).toContain("nivel=canton");
    expect(linea).not.toContain("Juan");
  });

  it("el retiro y el conteo que salen bien no escriben en el log", async () => {
    const log = silenciarLog();
    const { deps } = todosLosDobles(SUPERADMIN);
    expect((await cambiarActivacionNodoAction({ nivel: "distrito", id: "d1", activo: false }, deps)).status).toBe("ok");
    expect(await contarOrdenesSinEntregarAction({ nivel: "distrito", id: "d1" }, deps)).toEqual({ status: "ok", ordenes: 3 });
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
      crear: vi.fn(),
      deLaEmpresa: vi.fn(),
      cambiarDisponible: vi.fn(async () => resultado),
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
      crear: vi.fn(async (datos: Record<string, unknown>) => ({
        estado: "creado" as const,
        pais: { ...datos, digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null, disponible: true },
      })),
      deLaEmpresa: vi.fn(),
      cambiarDisponible: vi.fn(),
    } satisfies Record<keyof IPaisRepository, Espia>;
  }

  const NIVELES = {
    nivel1Singular: "Departamento",
    nivel1Plural: "Departamentos",
    nivel2Singular: "Municipio",
    nivel2Plural: "Municipios",
    nivel3Singular: "Aldea",
    nivel3Plural: "Aldeas",
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
