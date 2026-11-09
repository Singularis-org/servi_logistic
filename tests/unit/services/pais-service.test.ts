import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type {
  CrearPaisRepoResultado,
  IPaisRepository,
} from "@/lib/interfaces/repositories/IPaisRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { PAIS_TOPE_DE_NIVELES, PaisService } from "@/lib/services/PaisService";
import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";
import { ETIQUETAS_NEUTRAS, etiquetasDePais, type PaisDTO } from "@/lib/types/pais";

// SL-20 (T2.1, T2.3; design §5) — `PaisService` con el repositorio doble.
//   · R23: el alta crea el país del catálogo con el nombre del catálogo; un código o un nombre
//     (normalizado) que ya están son `conflict` sin llamar al repositorio de alta; la entrada inválida
//     no llega al repositorio.
//   · R41 (enmienda 2026-10-26): un código fuera del catálogo es `validation_error` en `id`.
//   · R37: un rol de empresa recibe `forbidden` sin tocar la base (ni para leer).
//   · T2.3: `etiquetasDeEmpresa` da los nombres de nivel del país de la empresa (XA y CR).
//   · R9/R45 (enmienda 2026-10-26): `listarDisponibles` da `{ id, nombre }` de los países con
//     cobertura, solo a la plataforma.
//
// SLT-46 (T4.3; design §4.3) — la entrada del alta pasa de seis nombres fijos a la lista ordenada
// `tipos` (2–10, R23/R24) y el servicio llama a `crear`; los casos de SL-20 conservan su
// desenlace y su mensaje. Nuevos: `renombrarTipo` (R25, R26), `agregarNivel` (R48, R49),
// `cambiarDisponible` sin mirar niveles (R28) y el rol antes de todo con un doble que LANZA (R39).
// El SQL lo miden `pais-repositorio`, `pais-alta-tipos`, `pais-tipos-edicion` y `pais-agregar-nivel`.

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: ROLES_PLATAFORMA[0] };
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

const COSTA_RICA: PaisDTO = {
  id: "CR",
  nombre: "Costa Rica",
  nivel1Singular: "Provincia",
  nivel1Plural: "Provincias",
  nivel2Singular: "Cantón",
  nivel2Plural: "Cantones",
  nivel3Singular: "Distrito",
  nivel3Plural: "Distritos",
  digitosCodigoNivel1: 1,
  digitosCodigoNivel2: 3,
  digitosCodigoNivel3: 5,
  disponible: true,
};

const PAIS_XA: PaisDTO = {
  id: "XA",
  nombre: "País de prueba XA",
  nivel1Singular: "Región",
  nivel1Plural: "Regiones",
  nivel2Singular: "Comuna",
  nivel2Plural: "Comunas",
  nivel3Singular: "Barrio",
  nivel3Plural: "Barrios",
  digitosCodigoNivel1: null,
  digitosCodigoNivel2: null,
  digitosCodigoNivel3: null,
  disponible: true,
};

const TIPO_4: TipoNivelDTO = {
  id: "t-4",
  clave: "nivel_4",
  profundidad: 4,
  nombreSingular: "Sector",
  nombrePlural: "Sectores",
  digitosCodigo: null,
  codigoHeredaPrefijo: false,
};

type Tipo = { singular: string; plural: string };

const TIPOS_PE: Tipo[] = [
  { singular: "Departamento", plural: "Departamentos" },
  { singular: "Provincia", plural: "Provincias" },
  { singular: "Distrito", plural: "Distritos" },
];

/** El alta elige el país del catálogo por su código (R41) y teclea la lista ordenada de tipos (R23). */
function entradaValida(tipos: Tipo[] = TIPOS_PE) {
  return { id: "PE", tipos: tipos.map((t) => ({ ...t })) };
}

/** La lista de tipos con un cambio en la posición `i`. */
function conTipo(i: number, cambio: Partial<Record<keyof Tipo, unknown>>) {
  return { ...entradaValida(), tipos: TIPOS_PE.map((t, j) => (j === i ? { ...t, ...cambio } : { ...t })) };
}

function nTipos(n: number): Tipo[] {
  return Array.from({ length: n }, (_, i) => ({ singular: `Nivel ${i + 1}`, plural: `Niveles ${i + 1}` }));
}

function repoDoble(
  o: {
    paises?: PaisDTO[];
    crear?: CrearPaisRepoResultado;
    deLaEmpresa?: PaisDTO | null;
    cambiarDisponible?: "no_existe" | "sin_cambio" | "cambiado";
    renombrarTipo?: Awaited<ReturnType<IPaisRepository["renombrarTipo"]>>;
    agregarNivel?: Awaited<ReturnType<IPaisRepository["agregarNivel"]>>;
    reordenarTipos?: Awaited<ReturnType<IPaisRepository["reordenarTipos"]>>;
  } = {},
) {
  const paises = o.paises ?? [COSTA_RICA];
  const repo = {
    listar: vi.fn(async () => paises),
    listarDisponibles: vi.fn(async () => paises.filter((p) => p.disponible).map(({ id, nombre }) => ({ id, nombre }))),
    porId: vi.fn(async (id: string) => paises.find((p) => p.id === id) ?? null),
    deLaEmpresa: vi.fn(async () => (o.deLaEmpresa === undefined ? COSTA_RICA : o.deLaEmpresa)),
    cambiarDisponible: vi.fn<IPaisRepository["cambiarDisponible"]>(async () => o.cambiarDisponible ?? "cambiado"),
    crear: vi.fn<IPaisRepository["crear"]>(async (datos) =>
      o.crear ?? {
        estado: "creado",
        pais: {
          id: datos.id,
          nombre: datos.nombre,
          nivel1Singular: datos.tipos[0].singular,
          nivel1Plural: datos.tipos[0].plural,
          nivel2Singular: datos.tipos[1].singular,
          nivel2Plural: datos.tipos[1].plural,
          nivel3Singular: datos.tipos[2]?.singular ?? "",
          nivel3Plural: datos.tipos[2]?.plural ?? "",
          digitosCodigoNivel1: null,
          digitosCodigoNivel2: null,
          digitosCodigoNivel3: null,
          disponible: true,
        },
        tipos: [],
      },
    ),
    renombrarTipo: vi.fn<IPaisRepository["renombrarTipo"]>(async () => o.renombrarTipo ?? "renombrado"),
    agregarNivel: vi.fn<IPaisRepository["agregarNivel"]>(async () => o.agregarNivel ?? TIPO_4),
    reordenarTipos: vi.fn<IPaisRepository["reordenarTipos"]>(async () => o.reordenarTipos ?? "reordenado"),
  } satisfies IPaisRepository;
  return repo;
}

/** R39: un repositorio que LANZA en cuanto se llama a cualquiera de sus métodos. */
function repoQueLanza(): IPaisRepository {
  return new Proxy({} as IPaisRepository, {
    get: (_t, prop) => () => {
      throw new Error(`R39: el repositorio no se debía tocar (${String(prop)})`);
    },
  });
}

describe("R23 — alta de un país del catálogo", () => {
  it("crea el país con el nombre DEL CATÁLOGO, los nombres de nivel normalizados y el actor de la sesión", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(conTipo(0, { singular: "  Depar   tamento " }), SUPERADMIN);

    expect(r.status).toBe("ok");
    expect(repo.crear).toHaveBeenCalledTimes(1);
    expect(repo.crear.mock.calls[0]).toEqual([
      { id: "PE", nombre: "Perú", tipos: TIPOS_PE.map((t, i) => (i === 0 ? { ...t, singular: "Depar tamento" } : t)) },
      { usuarioId: "u-super" },
    ]);
    // (SLT-46, decisión 2026-11-09: retirada la aserción «el `crear` de seis nombres no se llama»;
    // ese método ya no existe y `crear` es la única alta.)
  });

  it("R23: el orden de la lista se conserva tal cual hasta el repositorio (el primero es `nivel_1`)", async () => {
    const repo = repoDoble();
    const invertida = [...TIPOS_PE].reverse();
    await new PaisService(repo).crear(entradaValida(invertida), SUPERADMIN);
    expect(repo.crear.mock.calls[0][0].tipos).toEqual(invertida);
  });

  it("el nombre no se teclea: una entrada con `nombre` es `validation_error` y no toca la base", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...entradaValida(), nombre: "Perusalem" }, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("un código que ya existe es `conflict` por `id` y no crea nada", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...entradaValida(), id: "CR" }, SUPERADMIN);
    expect(r).toEqual({ status: "conflict", campo: "id" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it.each([
    ["con otras mayúsculas", "PERÚ"],
    ["sin acento y con espacios de más", "  peru  "],
  ])("si el nombre del catálogo ya está dado de alta %s, es `conflict` por `nombre` y no crea nada", async (_t, nombre) => {
    const repo = repoDoble({ paises: [COSTA_RICA, { ...PAIS_XA, nombre }] });
    const r = await new PaisService(repo).crear(entradaValida(), SUPERADMIN);
    expect(r).toEqual({ status: "conflict", campo: "nombre" });
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it.each<["id" | "nombre"]>([["id"], ["nombre"]])(
    "si la base rechaza el único (%s, una carrera), es `conflict` con ese campo",
    async (campo) => {
      const repo = repoDoble({ crear: { estado: "duplicado", campo } });
      expect(await new PaisService(repo).crear(entradaValida(), SUPERADMIN)).toEqual({ status: "conflict", campo });
    },
  );

  it("un error del repositorio que no es de único no se traga", async () => {
    const repo = repoDoble();
    repo.crear.mockRejectedValueOnce(new Error("la base se cayó"));
    await expect(new PaisService(repo).crear(entradaValida(), SUPERADMIN)).rejects.toThrow("la base se cayó");
  });

  // SLT-46: los nombres de nivel viven en `tipos[i]`; el error se nombra en `tipos` (antes, en
  // `nivelN…`). El desenlace es el mismo: `validation_error` sin tocar la base.
  const invalidas: Array<[string, Record<string, unknown>, string]> = [
    ["nombre de nivel de 1 carácter", conTipo(0, { plural: " P " }), "tipos"],
    ["nombre de nivel de 41 caracteres", conTipo(1, { singular: "a".repeat(41) }), "tipos"],
    ["nombre de nivel vacío", conTipo(1, { plural: "   " }), "tipos"],
    ["falta un nombre de nivel", conTipo(2, { singular: undefined }), "tipos"],
    ["falta la lista de tipos", { id: "PE" }, "tipos"],
  ];

  it.each(invalidas)("%s → validation_error en `%s`, sin tocar la base", async (_titulo, entrada, campo) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(entrada, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    if (r.status !== "validation_error") return;
    expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("un campo de más (la regla de código) se rechaza: el alta no la ofrece", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...entradaValida(), digitosCodigoNivel1: 2 }, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("SLT-46: un campo de más dentro de un tipo (la regla de código) también se rechaza", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(conTipo(0, { digitosCodigo: 2 } as Record<string, unknown>), SUPERADMIN);
    expect(r.status).toBe("validation_error");
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("SLT-46: la entrada de seis nombres fijos de SL-20 ya no vale (`validation_error`, sin tocar la base)", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(
      {
        id: "PE",
        nivel1Singular: "Departamento",
        nivel1Plural: "Departamentos",
        nivel2Singular: "Provincia",
        nivel2Plural: "Provincias",
        nivel3Singular: "Distrito",
        nivel3Plural: "Distritos",
      },
      SUPERADMIN,
    );
    expect(r.status).toBe("validation_error");
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("los bordes de un nombre de nivel valen: 2 y 40 caracteres", async () => {
    for (const singular of ["Ab", "a".repeat(40)]) {
      const repo = repoDoble();
      expect((await new PaisService(repo).crear(conTipo(0, { singular }), SUPERADMIN)).status).toBe("ok");
    }
  });
});

describe("R24 — de 2 a 10 tipos", () => {
  it.each([2, 10])("%i tipos: `ok`, y el repositorio recibe exactamente esos", async (n) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(entradaValida(nTipos(n)), SUPERADMIN);
    expect(r.status).toBe("ok");
    expect(repo.crear).toHaveBeenCalledTimes(1);
    expect(repo.crear.mock.calls[0][0].tipos).toEqual(nTipos(n));
  });

  it.each([
    [0, "Un país tiene al menos 2 niveles."],
    [1, "Un país tiene al menos 2 niveles."],
    [11, "Un país tiene como mucho 10 niveles."],
  ])("%i tipos: `validation_error` en `tipos` («%s»), sin tocar la base", async (n, mensaje) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(entradaValida(nTipos(n)), SUPERADMIN);
    expect(r).toEqual({ status: "validation_error", fieldErrors: { tipos: [mensaje] } });
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });
});

describe("R41 — un código fuera del catálogo es `validation_error` en `id`, sin tocar la base", () => {
  it.each([
    ["en minúsculas", "pe"],
    ["de tres letras", "PER"],
    ["con dígitos", "X1"],
    ["vacío", ""],
    ["de usuario (XA), el de los tests", "XA"],
    ["reservado (ZZ)", "ZZ"],
    ["retirado de ISO 3166-1 (AN, Antillas Neerlandesas)", "AN"],
    ["de usuario (QQ, rango QM–QZ)", "QQ"],
  ])("%s: %j", async (_titulo, id) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...entradaValida(), id }, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    if (r.status !== "validation_error") return;
    expect(Object.keys(r.fieldErrors)).toEqual(["id"]);
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("un código que no es texto también es `validation_error` en `id`", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...entradaValida(), id: 506 }, SUPERADMIN);
    expect(r.status === "validation_error" && Object.keys(r.fieldErrors)).toEqual(["id"]);
    expect(repo.crear).not.toHaveBeenCalled();
  });
});

describe("R25/R26 — renombrar un tipo de nivel", () => {
  // SLT-46 (2026-11-09, §4.1): la entrada gana `anterior`, los nombres que el modal mostró como «antes».
  const ANTERIOR = { nombreSingular: "Cantón", nombrePlural: "Cantones" };
  const entrada = { tipoId: "t-2", nombreSingular: "  Muni   cipio ", nombrePlural: "Municipios", anterior: ANTERIOR };

  it.each(["renombrado", "sin_cambio"] as const)(
    "el repositorio responde `%s` → `ok`; recibe el tipo, los nombres normalizados y el actor",
    async (resultado) => {
      const repo = repoDoble({ renombrarTipo: resultado });
      expect(await new PaisService(repo).renombrarTipo(entrada, SUPERADMIN)).toEqual({ status: "ok" });
      expect(repo.renombrarTipo).toHaveBeenCalledWith(
        "t-2",
        { nombreSingular: "Muni cipio", nombrePlural: "Municipios" },
        ANTERIOR,
        { usuarioId: "u-super" },
      );
    },
  );

  it("R26: un tipo que no existe es `not_found`", async () => {
    const repo = repoDoble({ renombrarTipo: "no_existe" });
    expect(await new PaisService(repo).renombrarTipo(entrada, SUPERADMIN)).toEqual({ status: "not_found" });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["singular de 1 carácter", { nombreSingular: " M " }, "nombreSingular"],
    ["plural de 41 caracteres", { nombrePlural: "a".repeat(41) }, "nombrePlural"],
    ["sin tipo", { tipoId: "" }, "tipoId"],
    ["un campo de más (`padreId`)", { padreId: "x" }, "entrada"],
  ])("R26: %s → validation_error en `%s`, sin tocar la base", async (_t, cambio, campo) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).renombrarTipo({ ...entrada, ...cambio }, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    if (r.status !== "validation_error") return;
    expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(repo.renombrarTipo).not.toHaveBeenCalled();
  });

  it("R26: los bordes valen (2 y 40 caracteres)", async () => {
    for (const nombreSingular of ["Ab", "a".repeat(40)]) {
      const repo = repoDoble();
      expect((await new PaisService(repo).renombrarTipo({ ...entrada, nombreSingular }, SUPERADMIN)).status).toBe("ok");
    }
  });
});

describe("R48/R49 — agregar un nivel al final", () => {
  // SLT-46 (2026-11-09, §4.1): la entrada gana `profundidad`, la P+1 que el modal mostró.
  const entrada = { paisId: "XA", nombreSingular: " Sector ", nombrePlural: "Sectores", profundidad: 4 };

  it("R48: el tipo creado vuelve en `ok`; el repositorio recibe el país, los nombres normalizados y el actor", async () => {
    const repo = repoDoble({ agregarNivel: TIPO_4 });
    expect(await new PaisService(repo).agregarNivel(entrada, SUPERADMIN)).toEqual({ status: "ok", tipo: TIPO_4 });
    expect(repo.agregarNivel).toHaveBeenCalledWith("XA", { nombreSingular: "Sector", nombrePlural: "Sectores" }, 4, {
      usuarioId: "u-super",
    });
  });

  it("R49: con 10 tipos (`tope`) es `validation_error` en `paisId` con «Este país ya tiene 10 niveles»", async () => {
    const repo = repoDoble({ agregarNivel: "tope" });
    expect(await new PaisService(repo).agregarNivel(entrada, SUPERADMIN)).toEqual({
      status: "validation_error",
      fieldErrors: { paisId: ["Este país ya tiene 10 niveles"] },
    });
    expect(PAIS_TOPE_DE_NIVELES).toBe("Este país ya tiene 10 niveles");
  });

  it("R49: un país que no existe es `not_found`", async () => {
    const repo = repoDoble({ agregarNivel: "no_existe" });
    expect(await new PaisService(repo).agregarNivel(entrada, SUPERADMIN)).toEqual({ status: "not_found" });
  });

  it("R49: el único de una carrera (P2002) sube tal cual: lo hace `conflict` la action", async () => {
    const repo = repoDoble();
    const unico = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    repo.agregarNivel.mockRejectedValueOnce(unico);
    await expect(new PaisService(repo).agregarNivel(entrada, SUPERADMIN)).rejects.toBe(unico);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["singular de 1 carácter", { nombreSingular: "S" }, "nombreSingular"],
    ["plural de 41 caracteres", { nombrePlural: "a".repeat(41) }, "nombrePlural"],
    ["código de país en minúsculas", { paisId: "xa" }, "paisId"],
    // SLT-46 (2026-11-09, §4.1): `profundidad` pasa a ser campo (el «antes», 3–10); una profundidad 2
    // sigue rechazada, ahora en su propio campo y no como campo de más.
    ["una posición (`profundidad`): siempre va al final", { profundidad: 2 }, "profundidad"],
  ])("R49: %s → validation_error en `%s`, sin tocar la base", async (_t, cambio, campo) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).agregarNivel({ ...entrada, ...cambio }, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    if (r.status !== "validation_error") return;
    expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(repo.agregarNivel).not.toHaveBeenCalled();
  });
});

// SLT-46 (2026-11-09, design §4.3, §4.7) — reordenar niveles (R55–R57) y el cambio concurrente (R61).

const REORDEN_VALIDO = {
  paisId: "XA",
  niveles: [
    { tipoId: "t-2", nombreSingular: " Comuna ", nombrePlural: "Comunas" },
    { tipoId: "t-1", nombreSingular: "Región", nombrePlural: "Regiones" },
  ],
};

describe("R55–R57 — reordenar los niveles de un país", () => {
  it.each(["reordenado", "sin_cambio"] as const)(
    "el repositorio responde `%s` → `ok`; recibe el país, la lista normalizada en su orden y el actor",
    async (resultado) => {
      const repo = repoDoble({ reordenarTipos: resultado });
      expect(await new PaisService(repo).reordenarTipos(REORDEN_VALIDO, SUPERADMIN)).toEqual({ status: "ok" });
      expect(repo.reordenarTipos).toHaveBeenCalledWith(
        "XA",
        [
          { tipoId: "t-2", nombreSingular: "Comuna", nombrePlural: "Comunas" },
          { tipoId: "t-1", nombreSingular: "Región", nombrePlural: "Regiones" },
        ],
        { usuarioId: "u-super" },
      );
    },
  );

  it("R57: un país que no existe es `not_found`", async () => {
    const repo = repoDoble({ reordenarTipos: "no_existe" });
    expect(await new PaisService(repo).reordenarTipos(REORDEN_VALIDO, SUPERADMIN)).toEqual({ status: "not_found" });
  });

  it("R57: la lista ya no es la del país (o un nombre cambió) → `conflict` con motivo de cambio concurrente", async () => {
    const repo = repoDoble({ reordenarTipos: "cambio_concurrente" });
    expect(await new PaisService(repo).reordenarTipos(REORDEN_VALIDO, SUPERADMIN)).toEqual({
      status: "conflict",
      motivo: "cambio_concurrente",
    });
  });

  it.each<[string, unknown[]]>([
    ["un tipo repetido", [REORDEN_VALIDO.niveles[0], REORDEN_VALIDO.niveles[0]]],
    ["un solo nivel", [REORDEN_VALIDO.niveles[0]]],
    ["once niveles", nTipos(11).map((t, i) => ({ tipoId: `t-${i}`, nombreSingular: t.singular, nombrePlural: t.plural }))],
  ])("R57: %s → `validation_error` en `niveles`, sin tocar la base", async (_c, niveles) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).reordenarTipos({ paisId: "XA", niveles }, SUPERADMIN);
    expect(r.status).toBe("validation_error");
    if (r.status !== "validation_error") return;
    expect(Object.keys(r.fieldErrors)).toContain("niveles");
    expect(repo.reordenarTipos).not.toHaveBeenCalled();
  });
});

describe("R61 — el cambio concurrente es un `conflict` NUEVO, con motivo; los de antes no cambian", () => {
  const RENOMBRE = {
    tipoId: "t-2",
    nombreSingular: "Municipio",
    nombrePlural: "Municipios",
    anterior: { nombreSingular: "Cantón", nombrePlural: "Cantones" },
  };
  const NIVEL = { paisId: "XA", nombreSingular: "Sector", nombrePlural: "Sectores", profundidad: 4 };

  it("renombrar un tipo con un «antes» que ya no es el de la base → `conflict` con motivo", async () => {
    const repo = repoDoble({ renombrarTipo: "cambio_concurrente" });
    expect(await new PaisService(repo).renombrarTipo(RENOMBRE, SUPERADMIN)).toEqual({
      status: "conflict",
      motivo: "cambio_concurrente",
    });
  });

  it("agregar nivel con una profundidad que ya no es P+1 → `conflict` con motivo", async () => {
    const repo = repoDoble({ agregarNivel: "cambio_concurrente" });
    expect(await new PaisService(repo).agregarNivel(NIVEL, SUPERADMIN)).toEqual({
      status: "conflict",
      motivo: "cambio_concurrente",
    });
  });

  it("CONTRAPRUEBA (R12): el `conflict` del alta de país (código o nombre repetido) sigue SIN motivo", async () => {
    const r = await new PaisService(repoDoble()).crear({ ...entradaValida(), id: "CR" }, SUPERADMIN);
    expect(r).toEqual({ status: "conflict", campo: "id" });
    expect(r).not.toHaveProperty("motivo");
    const duplicado = await new PaisService(repoDoble({ crear: { estado: "duplicado", campo: "nombre" } })).crear(
      entradaValida(),
      SUPERADMIN,
    );
    expect(duplicado).toEqual({ status: "conflict", campo: "nombre" });
  });
});

describe("R39 — el rol se mira ANTES de validar y de tocar el repositorio", () => {
  const operaciones: Array<[string, (s: PaisService, a: Actor) => Promise<unknown>]> = [
    ["listar", (s, a) => s.listar(a)],
    ["listarDisponibles", (s, a) => s.listarDisponibles(a)],
    ["crear", (s, a) => s.crear(entradaValida(), a)],
    ["crear (entrada inválida)", (s, a) => s.crear({ basura: true }, a)],
    ["renombrarTipo", (s, a) => s.renombrarTipo({ tipoId: "t-1", nombreSingular: "Uno", nombrePlural: "Unos", anterior: { nombreSingular: "Dos", nombrePlural: "Doses" } }, a)],
    ["renombrarTipo (entrada inválida)", (s, a) => s.renombrarTipo({ basura: true }, a)],
    ["agregarNivel", (s, a) => s.agregarNivel({ paisId: "XA", nombreSingular: "Uno", nombrePlural: "Unos", profundidad: 3 }, a)],
    ["agregarNivel (entrada inválida)", (s, a) => s.agregarNivel({ basura: true }, a)],
    // SLT-46 (2026-11-09, R57): reordenar también mira el rol antes de validar y de tocar la base.
    ["reordenarTipos", (s, a) => s.reordenarTipos(REORDEN_VALIDO, a)],
    ["reordenarTipos (entrada inválida)", (s, a) => s.reordenarTipos({ basura: true }, a)],
    ["cambiarDisponible", (s, a) => s.cambiarDisponible({ id: "XA", disponible: true }, a)],
  ];

  it.each(operaciones)("%s: `maestro` recibe `forbidden` con un repositorio que lanza si se le llama", async (_n, op) => {
    expect(await op(new PaisService(repoQueLanza()), MAESTRO)).toEqual({ status: "forbidden" });
  });

  it.each(operaciones.filter(([n]) => !n.includes("inválida")))(
    "CONTRAPRUEBA %s: con el superadmin, el mismo repositorio SÍ lanza (el doble no es mudo)",
    async (_n, op) => {
      await expect(op(new PaisService(repoQueLanza()), SUPERADMIN)).rejects.toThrow("R39");
    },
  );
});

describe("R37 — un rol de empresa no gestiona países", () => {
  const rolesDeEmpresa = Object.values(RolValue).filter((r) => !(ROLES_PLATAFORMA as readonly string[]).includes(r));

  it("hay roles de empresa que probar", () => {
    expect(rolesDeEmpresa.length).toBeGreaterThan(0);
    expect(rolesDeEmpresa).toContain("maestro");
  });

  it.each(rolesDeEmpresa)("%s: crear, listar, renombrar tipo y agregar nivel son `forbidden` sin tocar la base", async (rol) => {
    const repo = repoDoble();
    const servicio = new PaisService(repo);
    const actor: Actor = { usuarioId: "u-empresa", rol };

    expect(await servicio.crear(entradaValida(), actor)).toEqual({ status: "forbidden" });
    expect(await servicio.listar(actor)).toEqual({ status: "forbidden" });
    expect(await servicio.listarDisponibles(actor)).toEqual({ status: "forbidden" });
    expect(await servicio.renombrarTipo({ tipoId: "t-1", nombreSingular: "Uno", nombrePlural: "Unos", anterior: { nombreSingular: "Dos", nombrePlural: "Doses" } }, actor)).toEqual({
      status: "forbidden",
    });
    expect(await servicio.agregarNivel({ paisId: "XA", nombreSingular: "Uno", nombrePlural: "Unos", profundidad: 3 }, actor)).toEqual({
      status: "forbidden",
    });
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.listarDisponibles).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
    expect(repo.renombrarTipo).not.toHaveBeenCalled();
    expect(repo.agregarNivel).not.toHaveBeenCalled();
  });

  it("la plataforma sí lista", async () => {
    const repo = repoDoble({ paises: [COSTA_RICA, PAIS_XA] });
    expect(await new PaisService(repo).listar(SUPERADMIN)).toEqual({ status: "ok", paises: [COSTA_RICA, PAIS_XA] });
  });
});

describe("R9/R45 — los países que ofrece el alta de empresa", () => {
  it("la plataforma recibe solo los disponibles, con su código y su nombre, tal como los da el repositorio", async () => {
    const repo = repoDoble({ paises: [COSTA_RICA, { ...PAIS_XA, disponible: false }] });
    expect(await new PaisService(repo).listarDisponibles(SUPERADMIN)).toEqual({
      status: "ok",
      paises: [{ id: "CR", nombre: "Costa Rica" }],
    });
    expect(repo.listarDisponibles).toHaveBeenCalledTimes(1);
    expect(repo.listar).not.toHaveBeenCalled();
  });
});

describe("R47 (T4.6) — encender o apagar la disponibilidad de un país", () => {
  it("la plataforma la cambia: el repositorio recibe el país, el estado deseado y el actor", async () => {
    const repo = repoDoble({ cambiarDisponible: "cambiado" });
    const r = await new PaisService(repo).cambiarDisponible({ id: "XA", disponible: false }, SUPERADMIN);
    expect(r).toEqual({ status: "ok", id: "XA", disponible: false });
    expect(repo.cambiarDisponible).toHaveBeenCalledWith("XA", false, { usuarioId: SUPERADMIN.usuarioId });
  });

  it("pedir el estado que ya tiene es `ok` (el repositorio no escribió nada)", async () => {
    const repo = repoDoble({ cambiarDisponible: "sin_cambio" });
    expect(await new PaisService(repo).cambiarDisponible({ id: "CR", disponible: true }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "CR",
      disponible: true,
    });
  });

  it("un país que no existe es `not_found`", async () => {
    const repo = repoDoble({ cambiarDisponible: "no_existe" });
    expect(await new PaisService(repo).cambiarDisponible({ id: "XZ", disponible: false }, SUPERADMIN)).toEqual({
      status: "not_found",
    });
  });

  it("R28 (SLT-46): no mira los niveles: solo llama a `cambiarDisponible`, y el resto del repositorio lanza", async () => {
    const cambiarDisponible = vi.fn<IPaisRepository["cambiarDisponible"]>(async () => "cambiado");
    const soloDisponible = new Proxy({} as IPaisRepository, {
      get: (_t, prop) =>
        prop === "cambiarDisponible"
          ? cambiarDisponible
          : () => {
              throw new Error(`R28: cambiarDisponible no debía leer ${String(prop)}`);
            },
    });
    expect(await new PaisService(soloDisponible).cambiarDisponible({ id: "XA", disponible: true }, SUPERADMIN)).toEqual({
      status: "ok",
      id: "XA",
      disponible: true,
    });
    expect(cambiarDisponible).toHaveBeenCalledTimes(1);
  });

  it.each(Object.values(RolValue).filter((r) => !(ROLES_PLATAFORMA as readonly string[]).includes(r)))(
    "R37: el rol de empresa %s recibe `forbidden` sin tocar la base",
    async (rol) => {
      const repo = repoDoble();
      expect(await new PaisService(repo).cambiarDisponible({ id: "CR", disponible: false }, { usuarioId: "u", rol })).toEqual({
        status: "forbidden",
      });
      expect(repo.cambiarDisponible).not.toHaveBeenCalled();
    },
  );
});

describe("T2.3 — etiquetas de nivel de la empresa (R19)", () => {
  it("una empresa en XA ve los nombres de XA", async () => {
    const repo = repoDoble({ deLaEmpresa: PAIS_XA });
    expect(await new PaisService(repo).etiquetasDeEmpresa("org-xa")).toEqual({
      provincia: { singular: "Región", plural: "Regiones" },
      canton: { singular: "Comuna", plural: "Comunas" },
      distrito: { singular: "Barrio", plural: "Barrios" },
    });
    expect(repo.deLaEmpresa).toHaveBeenCalledWith("org-xa");
  });

  it("una empresa en CR ve Provincia, Cantón y Distrito", async () => {
    const repo = repoDoble({ deLaEmpresa: COSTA_RICA });
    expect(await new PaisService(repo).etiquetasDeEmpresa("org-cr")).toEqual({
      provincia: { singular: "Provincia", plural: "Provincias" },
      canton: { singular: "Cantón", plural: "Cantones" },
      distrito: { singular: "Distrito", plural: "Distritos" },
    });
  });

  it("si la empresa no se encuentra, falla con su id en vez de inventar etiquetas", async () => {
    const repo = repoDoble({ deLaEmpresa: null });
    await expect(new PaisService(repo).etiquetasDeEmpresa("org-x")).rejects.toThrow("org-x");
  });

  it("ETIQUETAS_NEUTRAS no son las de ningún país: ni las de Costa Rica", () => {
    expect(ETIQUETAS_NEUTRAS).toEqual({
      provincia: { singular: "Nivel 1", plural: "Nivel 1" },
      canton: { singular: "Nivel 2", plural: "Nivel 2" },
      distrito: { singular: "Nivel 3", plural: "Nivel 3" },
    });
    expect(ETIQUETAS_NEUTRAS).not.toEqual(etiquetasDePais(COSTA_RICA));
    expect(ETIQUETAS_NEUTRAS).not.toEqual(etiquetasDePais(PAIS_XA));
  });
});
