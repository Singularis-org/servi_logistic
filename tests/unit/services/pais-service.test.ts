import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type { CrearPaisRepoResultado, IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { PaisService } from "@/lib/services/PaisService";
import { ETIQUETAS_NEUTRAS, etiquetasDePais, type PaisDTO } from "@/lib/types/pais";

// SL-20 (T2.1, T2.3; design §5) — `PaisService` con el repositorio doble.
//   · R23: el alta crea el país del catálogo con el nombre del catálogo; un código o un nombre
//     (normalizado) que ya están son `conflict` sin llamar a `crear`; la entrada inválida no llega al
//     repositorio.
//   · R41 (enmienda 2026-10-26): un código fuera del catálogo es `validation_error` en `id`.
//   · R37: un rol de empresa recibe `forbidden` sin tocar la base (ni para leer).
//   · T2.3: `etiquetasDeEmpresa` da los nombres de nivel del país de la empresa (XA y CR).
//   · R9/R45 (enmienda 2026-10-26): `listarDisponibles` da `{ id, nombre }` de los países con
//     cobertura, solo a la plataforma.
// El SQL (único, historial, RLS) lo mide `tests/integration/db/pais-repositorio.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: ROLES_PLATAFORMA[0] };

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

/** El alta elige el país del catálogo por su código (R41) y teclea los seis nombres de nivel. */
function entradaValida() {
  return {
    id: "PE",
    nivel1Singular: "Departamento",
    nivel1Plural: "Departamentos",
    nivel2Singular: "Provincia",
    nivel2Plural: "Provincias",
    nivel3Singular: "Distrito",
    nivel3Plural: "Distritos",
  };
}

function repoDoble(
  o: {
    paises?: PaisDTO[];
    crear?: CrearPaisRepoResultado;
    deLaEmpresa?: PaisDTO | null;
    cambiarDisponible?: "no_existe" | "sin_cambio" | "cambiado";
  } = {},
) {
  const paises = o.paises ?? [COSTA_RICA];
  const repo = {
    listar: vi.fn(async () => paises),
    listarDisponibles: vi.fn(async () => paises.filter((p) => p.disponible).map(({ id, nombre }) => ({ id, nombre }))),
    porId: vi.fn(async (id: string) => paises.find((p) => p.id === id) ?? null),
    crear: vi.fn<IPaisRepository["crear"]>(async (datos) =>
      o.crear ?? { estado: "creado", pais: { ...datos, digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null, disponible: true } },
    ),
    deLaEmpresa: vi.fn(async () => (o.deLaEmpresa === undefined ? COSTA_RICA : o.deLaEmpresa)),
    cambiarDisponible: vi.fn<IPaisRepository["cambiarDisponible"]>(async () => o.cambiarDisponible ?? "cambiado"),
  } satisfies IPaisRepository;
  return repo;
}

describe("R23 — alta de un país del catálogo", () => {
  it("crea el país con el nombre DEL CATÁLOGO, los nombres de nivel normalizados y el actor de la sesión", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...entradaValida(), nivel1Singular: "  Depar   tamento " }, SUPERADMIN);

    expect(r.status).toBe("ok");
    expect(repo.crear).toHaveBeenCalledTimes(1);
    expect(repo.crear.mock.calls[0]).toEqual([
      { ...entradaValida(), nombre: "Perú", nivel1Singular: "Depar tamento" },
      { usuarioId: "u-super" },
    ]);
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

  const invalidas: Array<[string, Record<string, unknown>, string]> = [
    ["nombre de nivel de 1 carácter", { nivel1Plural: " P " }, "nivel1Plural"],
    ["nombre de nivel de 41 caracteres", { nivel2Singular: "a".repeat(41) }, "nivel2Singular"],
    ["nombre de nivel vacío", { nivel2Plural: "   " }, "nivel2Plural"],
    ["falta un nombre de nivel", { nivel3Singular: undefined }, "nivel3Singular"],
  ];

  it.each(invalidas)("%s → validation_error en `%s`, sin tocar la base", async (_titulo, cambio, campo) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...entradaValida(), ...cambio }, SUPERADMIN);
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

  it("los bordes de un nombre de nivel valen: 2 y 40 caracteres", async () => {
    for (const nivel1Singular of ["Ab", "a".repeat(40)]) {
      const repo = repoDoble();
      expect((await new PaisService(repo).crear({ ...entradaValida(), nivel1Singular }, SUPERADMIN)).status).toBe("ok");
    }
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

describe("R37 — un rol de empresa no gestiona países", () => {
  const rolesDeEmpresa = Object.values(RolValue).filter((r) => !(ROLES_PLATAFORMA as readonly string[]).includes(r));

  it("hay roles de empresa que probar", () => {
    expect(rolesDeEmpresa.length).toBeGreaterThan(0);
    expect(rolesDeEmpresa).toContain("maestro");
  });

  it.each(rolesDeEmpresa)("%s: crear y listar son `forbidden` sin tocar la base", async (rol) => {
    const repo = repoDoble();
    const servicio = new PaisService(repo);
    const actor: Actor = { usuarioId: "u-empresa", rol };

    expect(await servicio.crear(entradaValida(), actor)).toEqual({ status: "forbidden" });
    expect(await servicio.listar(actor)).toEqual({ status: "forbidden" });
    expect(await servicio.listarDisponibles(actor)).toEqual({ status: "forbidden" });
    expect(repo.listar).not.toHaveBeenCalled();
    expect(repo.listarDisponibles).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
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
