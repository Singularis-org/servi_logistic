import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import { RolValue } from "@prisma/client";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { claveDeTipo, PaisService } from "@/lib/services/PaisService";
import type { PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";

// SLT-81 (T1.4; design §4.2, §11) — `PaisService` con el repositorio doble: los datos del país y su
// catálogo de documentos. Los códigos son REALES y no sembrados (`PA`, `GT`), con su prefijo oficial:
// desde R26 los de prueba `XA`–`XZ` no tienen prefijo aceptable. El SQL lo mide
// `tests/integration/db/pais-datos-plataforma.test.ts`.

const SUPERADMIN: Actor = { usuarioId: "u-super", rol: ROLES_PLATAFORMA[0] };
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

const PANAMA: PaisDTO = {
  id: "PA",
  nombre: "Panamá",
  nivel1Singular: "Provincia",
  nivel1Plural: "Provincias",
  nivel2Singular: "Distrito",
  nivel2Plural: "Distritos",
  nivel3Singular: "Corregimiento",
  nivel3Plural: "Corregimientos",
  digitosCodigoNivel1: null,
  digitosCodigoNivel2: null,
  digitosCodigoNivel3: null,
  disponible: true,
  prefijoTelefonico: "507",
  telefonoDigitosNacionales: 8,
  zonaHoraria: "America/Panama",
};

const ID_CEDULA = randomUUID();
const CEDULA_PA: TipoDocumentoDTO = {
  id: ID_CEDULA,
  value: "PA_cedula",
  paisId: "PA",
  clave: "cedula",
  nombre: "Cédula  Física",
  caracteres: "digitos",
  largoMin: 9,
  largoMax: 9,
  activo: true,
};

function altaGT() {
  return {
    id: "GT",
    nivel1Singular: "Departamento",
    nivel1Plural: "Departamentos",
    nivel2Singular: "Municipio",
    nivel2Plural: "Municipios",
    nivel3Singular: "Aldea",
    nivel3Plural: "Aldeas",
    prefijoTelefonico: "502",
    telefonoDigitosNacionales: 8,
    zonaHoraria: "America/Guatemala",
    tiposDocumento: [{ nombre: "DPI", caracteres: "digitos", largoMin: 13, largoMax: 13 }],
  };
}

const datosPA = (o: Record<string, unknown> = {}) => ({
  id: "PA",
  prefijoTelefonico: "507",
  telefonoDigitosNacionales: 8,
  zonaHoraria: "America/Bogota",
  ...o,
});

function repoDoble(o: { empresas?: number; zonaEnBase?: boolean; paises?: PaisDTO[]; tipos?: TipoDocumentoDTO[] } = {}) {
  const paises = o.paises ?? [PANAMA];
  const tipos = o.tipos ?? [CEDULA_PA];
  return {
    listar: vi.fn<IPaisRepository["listar"]>(async () => paises),
    listarDisponibles: vi.fn<IPaisRepository["listarDisponibles"]>(async () => []),
    porId: vi.fn<IPaisRepository["porId"]>(async (id) => paises.find((p) => p.id === id) ?? null),
    crear: vi.fn<IPaisRepository["crear"]>(async ({ tiposDocumento: _t, ...d }) => ({
      estado: "creado",
      pais: { ...d, digitosCodigoNivel1: null, digitosCodigoNivel2: null, digitosCodigoNivel3: null, disponible: true },
    })),
    cambiarDisponible: vi.fn<IPaisRepository["cambiarDisponible"]>(async () => "cambiado"),
    deLaEmpresa: vi.fn<IPaisRepository["deLaEmpresa"]>(async () => null),
    tipoDocumentoDelPais: vi.fn<IPaisRepository["tipoDocumentoDelPais"]>(async () => null),
    tieneTipoDocumentoActivo: vi.fn<IPaisRepository["tieneTipoDocumentoActivo"]>(async () => true),
    zonasConEmpresas: vi.fn<IPaisRepository["zonasConEmpresas"]>(async () => []),
    actualizarDatos: vi.fn<IPaisRepository["actualizarDatos"]>(async (id, datos) => ({
      estado: "cambiado",
      pais: { ...(paises.find((p) => p.id === id) as PaisDTO), ...datos },
    })),
    contarEmpresas: vi.fn<IPaisRepository["contarEmpresas"]>(async () => o.empresas ?? 0),
    listarTiposDocumento: vi.fn<IPaisRepository["listarTiposDocumento"]>(async (paisId) => tipos.filter((t) => t.paisId === paisId)),
    tipoDocumentoPorId: vi.fn<IPaisRepository["tipoDocumentoPorId"]>(async (id) => tipos.find((t) => t.id === id) ?? null),
    crearTipoDocumento: vi.fn<IPaisRepository["crearTipoDocumento"]>(async (paisId, d) => ({
      estado: "creado",
      tipo: { id: randomUUID(), paisId, activo: true, ...d },
    })),
    editarTipoDocumento: vi.fn<IPaisRepository["editarTipoDocumento"]>(async (id, d) => ({
      estado: "cambiado",
      tipo: { ...(tipos.find((t) => t.id === id) as TipoDocumentoDTO), ...d },
    })),
    cambiarActivoTipoDocumento: vi.fn<IPaisRepository["cambiarActivoTipoDocumento"]>(async (id, activo) => ({
      estado: "cambiado",
      tipo: { ...(tipos.find((t) => t.id === id) as TipoDocumentoDTO), activo },
    })),
    listarDisponiblesParaAlta: vi.fn<IPaisRepository["listarDisponiblesParaAlta"]>(async () => []),
    zonaConocidaPorLaBase: vi.fn<IPaisRepository["zonaConocidaPorLaBase"]>(async () => o.zonaEnBase ?? true),
  } satisfies IPaisRepository;
}

type Repo = ReturnType<typeof repoDoble>;

/** Ningún método de escritura del repositorio se llamó. */
function sinEscribir(repo: Repo) {
  for (const m of ["crear", "actualizarDatos", "crearTipoDocumento", "editarTipoDocumento", "cambiarActivoTipoDocumento"] as const) {
    expect(repo[m], m).not.toHaveBeenCalled();
  }
}

function camposConError(r: { status: string; fieldErrors?: Record<string, string[]> }): string[] {
  expect(r.status).toBe("validation_error");
  return Object.keys(r.fieldErrors ?? {});
}

describe("SLT-81 R1 — solo el superadmin escribe los datos del país", () => {
  const rolesDeEmpresa = Object.values(RolValue).filter((r) => !(ROLES_PLATAFORMA as readonly string[]).includes(r));

  it("hay roles de empresa que probar, el maestro entre ellos", () => {
    expect(rolesDeEmpresa).toContain("maestro");
  });

  it.each(rolesDeEmpresa)("%s recibe forbidden en cada método nuevo y el repositorio no se llama", async (rol) => {
    const repo = repoDoble();
    const s = new PaisService(repo);
    const actor: Actor = { usuarioId: "u-empresa", rol };
    const resultados = [
      await s.crear(altaGT(), actor),
      await s.actualizarDatos(datosPA(), actor),
      await s.listarTiposDocumento("PA", actor),
      await s.crearTipoDocumento({ paisId: "PA", nombre: "Pasaporte", caracteres: "alfanumerico", largoMin: 6, largoMax: 12 }, actor),
      await s.editarTipoDocumento({ id: ID_CEDULA, nombre: "Cédula", caracteres: "digitos", largoMin: 9, largoMax: 9 }, actor),
      await s.cambiarActivoTipoDocumento({ id: ID_CEDULA, activo: false }, actor),
      await s.listarDisponiblesParaAlta(actor),
    ];
    expect(resultados).toEqual(resultados.map(() => ({ status: "forbidden" })));
    for (const [nombre, espia] of Object.entries(repo)) expect(espia, nombre).not.toHaveBeenCalled();
  });
});

describe("SLT-81 R5 — el alta exige prefijo, dígitos, zona y al menos un tipo", () => {
  it.each([
    ["prefijoTelefonico", { prefijoTelefonico: undefined }],
    ["telefonoDigitosNacionales", { telefonoDigitosNacionales: undefined }],
    ["zonaHoraria", { zonaHoraria: undefined }],
    ["tiposDocumento", { tiposDocumento: undefined }],
    ["tiposDocumento", { tiposDocumento: [] }],
  ])("falta %s → validation_error en ese campo, sin llamar a crear", async (campo, cambio) => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear({ ...altaGT(), ...cambio }, SUPERADMIN);
    expect(camposConError(r)).toEqual([campo]);
    sinEscribir(repo);
  });

  it("un alta completa crea el país con sus tipos, cada uno con su clave y su value", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(
      { ...altaGT(), tiposDocumento: [...altaGT().tiposDocumento, { nombre: "Cédula de residencia", caracteres: "alfanumerico", largoMin: 5, largoMax: 20 }] },
      SUPERADMIN,
    );
    expect(r.status).toBe("ok");
    expect(repo.crear.mock.calls[0][0]).toMatchObject({
      id: "GT",
      nombre: "Guatemala",
      prefijoTelefonico: "502",
      telefonoDigitosNacionales: 8,
      zonaHoraria: "America/Guatemala",
      tiposDocumento: [
        { nombre: "DPI", clave: "dpi", value: "GT_dpi", caracteres: "digitos", largoMin: 13, largoMax: 13 },
        { nombre: "Cédula de residencia", clave: "cedula_de_residencia", value: "GT_cedula_de_residencia" },
      ],
    });
  });

  it("R9 en el alta: dos tipos con el mismo nombre plegado → validation_error en el segundo, sin crear", async () => {
    const repo = repoDoble();
    const tipo = { caracteres: "digitos", largoMin: 8, largoMax: 8 };
    const r = await new PaisService(repo).crear(
      { ...altaGT(), tiposDocumento: [{ ...tipo, nombre: "Cédula  Física" }, { ...tipo, nombre: "cedula fisica" }] },
      SUPERADMIN,
    );
    expect(camposConError(r)).toEqual(["tiposDocumento.1.nombre"]);
    sinEscribir(repo);
  });

  it("los errores de un tipo del alta llegan con su ruta (`tiposDocumento.0.largoMax`)", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crear(
      { ...altaGT(), tiposDocumento: [{ nombre: "DPI", caracteres: "digitos", largoMin: 9, largoMax: 8 }] },
      SUPERADMIN,
    );
    expect(camposConError(r)).toEqual(["tiposDocumento.0.largoMax"]);
  });
});

describe("SLT-81 R7 — formato del prefijo y de los dígitos", () => {
  it.each([
    ["prefijo con 0 inicial", { prefijoTelefonico: "0507" }, "prefijoTelefonico"],
    ["prefijo con +", { prefijoTelefonico: "+507" }, "prefijoTelefonico"],
    ["prefijo de 4 dígitos", { prefijoTelefonico: "5077" }, "prefijoTelefonico"],
    ["prefijo vacío", { prefijoTelefonico: "" }, "prefijoTelefonico"],
    ["3 dígitos nacionales", { telefonoDigitosNacionales: 3 }, "telefonoDigitosNacionales"],
    ["15 dígitos nacionales", { telefonoDigitosNacionales: 15 }, "telefonoDigitosNacionales"],
    ["8.5 dígitos nacionales", { telefonoDigitosNacionales: 8.5 }, "telefonoDigitosNacionales"],
  ])("%s → validation_error en ese campo, sin escribir (alta y edición)", async (_t, cambio, campo) => {
    const repo = repoDoble();
    const s = new PaisService(repo);
    expect(camposConError(await s.crear({ ...altaGT(), ...cambio }, SUPERADMIN))).toEqual([campo]);
    expect(camposConError(await s.actualizarDatos(datosPA(cambio), SUPERADMIN))).toEqual([campo]);
    sinEscribir(repo);
  });

  it("los bordes valen: 4 y 14 dígitos", async () => {
    const s = new PaisService(repoDoble());
    for (const telefonoDigitosNacionales of [4, 14]) {
      expect((await s.actualizarDatos(datosPA({ telefonoDigitosNacionales }), SUPERADMIN)).status).toBe("ok");
    }
  });
});

describe("SLT-81 R8 — la zona está en la lista del servidor y la base la conoce", () => {
  it("una zona fuera de la lista → validation_error en zonaHoraria, sin preguntar a la base ni escribir", async () => {
    const repo = repoDoble();
    const s = new PaisService(repo);
    expect(camposConError(await s.crear({ ...altaGT(), zonaHoraria: "Mars/Olympus" }, SUPERADMIN))).toEqual(["zonaHoraria"]);
    expect(camposConError(await s.actualizarDatos(datosPA({ zonaHoraria: "america/panama" }), SUPERADMIN))).toEqual(["zonaHoraria"]);
    expect(repo.zonaConocidaPorLaBase).not.toHaveBeenCalled();
    sinEscribir(repo);
  });

  it("una zona de la lista que la base no conoce → validation_error en zonaHoraria, sin escribir", async () => {
    const repo = repoDoble({ zonaEnBase: false });
    const s = new PaisService(repo);
    expect(camposConError(await s.crear(altaGT(), SUPERADMIN))).toEqual(["zonaHoraria"]);
    expect(camposConError(await s.actualizarDatos(datosPA(), SUPERADMIN))).toEqual(["zonaHoraria"]);
    expect(repo.zonaConocidaPorLaBase).toHaveBeenCalledWith("America/Guatemala");
    sinEscribir(repo);
  });
});

describe("SLT-81 R26 — solo el prefijo oficial según libphonenumber", () => {
  it("alta de PA con 506 → validation_error en prefijoTelefonico, que dice el oficial, y no llama a crear", async () => {
    const repo = repoDoble({ paises: [] });
    const r = await new PaisService(repo).crear({ ...altaGT(), id: "PA", prefijoTelefonico: "506" }, SUPERADMIN);
    expect(r).toEqual({ status: "validation_error", fieldErrors: { prefijoTelefonico: ["El prefijo de Panamá es +507."] } });
    sinEscribir(repo);
  });

  it.each(["5070", "508"])("editar PA con %s → validation_error en prefijoTelefonico", async (prefijoTelefonico) => {
    const repo = repoDoble();
    expect(camposConError(await new PaisService(repo).actualizarDatos(datosPA({ prefijoTelefonico }), SUPERADMIN))).toEqual([
      "prefijoTelefonico",
    ]);
    sinEscribir(repo);
  });

  it("XA, que libphonenumber no conoce, no tiene prefijo aceptable", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).actualizarDatos(datosPA({ id: "XA", prefijoTelefonico: "999" }), SUPERADMIN);
    expect(r).toEqual({ status: "validation_error", fieldErrors: { prefijoTelefonico: ["No hay prefijo oficial conocido para este país."] } });
    sinEscribir(repo);
  });

  it("PA con 507 → ok", async () => {
    expect((await new PaisService(repoDoble()).actualizarDatos(datosPA(), SUPERADMIN)).status).toBe("ok");
  });
});

describe("SLT-81 R10/R11 — confirmación por número de empresas", () => {
  it("R10: con 3 empresas y sin confirmar → requiere_confirmacion {empresas: 3} y no escribe", async () => {
    const repo = repoDoble({ empresas: 3 });
    expect(await new PaisService(repo).actualizarDatos(datosPA(), SUPERADMIN)).toEqual({ status: "requiere_confirmacion", empresas: 3 });
    sinEscribir(repo);
  });

  it("R10: confirmando 2 cuando son 3 → vuelve a pedir con el número de hoy", async () => {
    const repo = repoDoble({ empresas: 3 });
    expect(await new PaisService(repo).actualizarDatos(datosPA({ empresasConfirmadas: 2 }), SUPERADMIN)).toEqual({
      status: "requiere_confirmacion",
      empresas: 3,
    });
    sinEscribir(repo);
  });

  it("R10: confirmando 3 → guarda, y el repositorio recibe el número para el historial", async () => {
    const repo = repoDoble({ empresas: 3 });
    const r = await new PaisService(repo).actualizarDatos(datosPA({ empresasConfirmadas: 3 }), SUPERADMIN);
    expect(r).toMatchObject({ status: "ok", cambiado: true, pais: { zonaHoraria: "America/Bogota" } });
    expect(repo.actualizarDatos).toHaveBeenCalledWith(
      "PA",
      { prefijoTelefonico: "507", telefonoDigitosNacionales: 8, zonaHoraria: "America/Bogota" },
      3,
      { usuarioId: "u-super" },
    );
  });

  it("R11: un país sin empresas guarda sin confirmación", async () => {
    const repo = repoDoble({ empresas: 0 });
    expect((await new PaisService(repo).actualizarDatos(datosPA(), SUPERADMIN)).status).toBe("ok");
    expect(repo.actualizarDatos).toHaveBeenCalledTimes(1);
  });

  it("sin nada distinto: ok sin contar empresas ni escribir, aunque haya empresas", async () => {
    const repo = repoDoble({ empresas: 3 });
    const r = await new PaisService(repo).actualizarDatos(datosPA({ zonaHoraria: "America/Panama" }), SUPERADMIN);
    expect(r).toEqual({ status: "ok", pais: PANAMA, cambiado: false });
    expect(repo.contarEmpresas).not.toHaveBeenCalled();
    sinEscribir(repo);
  });

  it("un país que no existe es not_found", async () => {
    const repo = repoDoble({ paises: [] });
    expect(await new PaisService(repo).actualizarDatos(datosPA(), SUPERADMIN)).toEqual({ status: "not_found" });
    sinEscribir(repo);
  });
});

describe("SLT-81 R9/R13 — alta y edición de un tipo de documento", () => {
  const nuevo = (o: Record<string, unknown> = {}) => ({ paisId: "PA", nombre: "Pasaporte", caracteres: "alfanumerico", largoMin: 6, largoMax: 12, ...o });
  const edicion = (o: Record<string, unknown> = {}) => ({ id: ID_CEDULA, nombre: "Cédula", caracteres: "digitos", largoMin: 9, largoMax: 10, ...o });

  it("R13: alta de un tipo en un país existente con value PA_<clave>", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).crearTipoDocumento(nuevo({ nombre: "Carné de extranjería" }), SUPERADMIN);
    expect(r.status).toBe("ok");
    expect(repo.crearTipoDocumento).toHaveBeenCalledWith(
      "PA",
      { nombre: "Carné de extranjería", caracteres: "alfanumerico", largoMin: 6, largoMax: 12, clave: "carne_de_extranjeria", value: "PA_carne_de_extranjeria" },
      { usuarioId: "u-super" },
    );
  });

  it.each([
    ["sin nombre", { nombre: "" }, "nombre"],
    ["caracteres desconocidos", { caracteres: "letras" }, "caracteres"],
    ["mínimo > máximo", { largoMin: 9, largoMax: 8 }, "largoMax"],
    ["máximo 31", { largoMax: 31 }, "largoMax"],
    ["mínimo 0", { largoMin: 0 }, "largoMin"],
  ])("R9: %s → validation_error en ese campo, sin escribir (alta y edición)", async (_t, cambio, campo) => {
    const repo = repoDoble();
    const s = new PaisService(repo);
    expect(camposConError(await s.crearTipoDocumento(nuevo(cambio), SUPERADMIN))).toEqual([campo]);
    expect(camposConError(await s.editarTipoDocumento(edicion(cambio), SUPERADMIN))).toEqual([campo]);
    sinEscribir(repo);
  });

  it("R9: «cedula fisica» contra «Cédula  Física» en el mismo país → conflict en el nombre", async () => {
    const repo = repoDoble();
    expect(await new PaisService(repo).crearTipoDocumento(nuevo({ nombre: "cedula fisica" }), SUPERADMIN)).toEqual({
      status: "conflict",
      campo: "nombre",
    });
    sinEscribir(repo);
  });

  it("R9: el mismo nombre en otro país no choca", async () => {
    const repo = repoDoble({ paises: [PANAMA, { ...PANAMA, id: "GT", nombre: "Guatemala" }] });
    expect((await new PaisService(repo).crearTipoDocumento(nuevo({ paisId: "GT", nombre: "cedula fisica" }), SUPERADMIN)).status).toBe("ok");
  });

  it("R9: renombrar a un nombre de otro tipo del país → conflict; a su propio nombre plegado, no", async () => {
    const otro: TipoDocumentoDTO = { ...CEDULA_PA, id: randomUUID(), clave: "pasaporte", value: "PA_pasaporte", nombre: "Pasaporte" };
    const repo = repoDoble({ tipos: [CEDULA_PA, otro] });
    const s = new PaisService(repo);
    expect(await s.editarTipoDocumento(edicion({ nombre: "PASAPORTE" }), SUPERADMIN)).toEqual({ status: "conflict", campo: "nombre" });
    expect((await s.editarTipoDocumento(edicion({ nombre: "cédula física" }), SUPERADMIN)).status).toBe("ok");
  });

  it("R13: editar cambia nombre y regla; el repositorio no recibe clave ni value", async () => {
    const repo = repoDoble();
    const r = await new PaisService(repo).editarTipoDocumento(edicion({ largoMin: 10, largoMax: 12 }), SUPERADMIN);
    expect(r).toMatchObject({ status: "ok", cambiado: true, tipo: { clave: "cedula", value: "PA_cedula", largoMin: 10, largoMax: 12 } });
    expect(repo.editarTipoDocumento).toHaveBeenCalledWith(
      ID_CEDULA,
      { nombre: "Cédula", caracteres: "digitos", largoMin: 10, largoMax: 12 },
      { usuarioId: "u-super" },
    );
  });

  it("un tipo o un país que no existen son not_found", async () => {
    const repo = repoDoble();
    const s = new PaisService(repo);
    expect(await s.crearTipoDocumento(nuevo({ paisId: "GT" }), SUPERADMIN)).toEqual({ status: "not_found" });
    expect(await s.editarTipoDocumento(edicion({ id: randomUUID() }), SUPERADMIN)).toEqual({ status: "not_found" });
    sinEscribir(repo);
  });

  it("si la base rechaza la clave (carrera, o un nombre distinto con la misma clave), es conflict en el nombre", async () => {
    const repo = repoDoble();
    repo.crearTipoDocumento.mockResolvedValueOnce({ estado: "duplicado" });
    expect(await new PaisService(repo).crearTipoDocumento(nuevo({ nombre: "Pasa-porte" }), SUPERADMIN)).toEqual({
      status: "conflict",
      campo: "nombre",
    });
  });

  it("un nombre sin letras ni dígitos no da clave: validation_error en el nombre", async () => {
    const repo = repoDoble();
    expect(camposConError(await new PaisService(repo).crearTipoDocumento(nuevo({ nombre: "--" }), SUPERADMIN))).toEqual(["nombre"]);
    sinEscribir(repo);
  });

  it("claveDeTipo pliega acentos y mayúsculas y pasa a «_» lo que no es [a-z0-9]", () => {
    expect(claveDeTipo("Cédula de residencia")).toBe("cedula_de_residencia");
    expect(claveDeTipo("  N.I.T. ")).toBe("n_i_t");
    expect(claveDeTipo("¡¡")).toBe("");
  });
});

describe("SLT-81 R13/R15 — activar y desactivar", () => {
  it("R13: desactivar y activar pasan el estado deseado al repositorio", async () => {
    const repo = repoDoble();
    const s = new PaisService(repo);
    expect(await s.cambiarActivoTipoDocumento({ id: ID_CEDULA, activo: false }, SUPERADMIN)).toMatchObject({ status: "ok", tipo: { activo: false } });
    expect(repo.cambiarActivoTipoDocumento).toHaveBeenCalledWith(ID_CEDULA, false, { usuarioId: "u-super" });
  });

  it("R15: desactivar el único activo → validation_error en `activo`", async () => {
    const repo = repoDoble();
    repo.cambiarActivoTipoDocumento.mockResolvedValueOnce({ estado: "ultimo_activo" });
    const r = await new PaisService(repo).cambiarActivoTipoDocumento({ id: ID_CEDULA, activo: false }, SUPERADMIN);
    expect(camposConError(r)).toEqual(["activo"]);
  });

  it("un tipo que no existe es not_found; una entrada sin uuid es validation_error sin llamar al repositorio", async () => {
    const repo = repoDoble();
    repo.cambiarActivoTipoDocumento.mockResolvedValueOnce({ estado: "no_existe" });
    const s = new PaisService(repo);
    expect(await s.cambiarActivoTipoDocumento({ id: randomUUID(), activo: false }, SUPERADMIN)).toEqual({ status: "not_found" });
    expect(camposConError(await s.cambiarActivoTipoDocumento({ id: "x", activo: false }, SUPERADMIN))).toEqual(["id"]);
    expect(repo.cambiarActivoTipoDocumento).toHaveBeenCalledTimes(1);
  });

  it("R13: el servicio no ofrece borrar un tipo", () => {
    const metodos = Object.getOwnPropertyNames(PaisService.prototype);
    expect(metodos.filter((m) => /borrar|eliminar|delete/i.test(m))).toEqual([]);
  });
});

describe("SLT-81 R2/R20 — lecturas del superadmin", () => {
  it("listarTiposDocumento da todos los del país, también los inactivos", async () => {
    const inactivo = { ...CEDULA_PA, id: randomUUID(), activo: false, nombre: "Viejo" };
    const repo = repoDoble({ tipos: [CEDULA_PA, inactivo] });
    expect(await new PaisService(repo).listarTiposDocumento("PA", SUPERADMIN)).toEqual({ status: "ok", tipos: [CEDULA_PA, inactivo] });
  });

  it("listarDisponiblesParaAlta pasa lo del repositorio a la plataforma", async () => {
    const repo = repoDoble();
    const paises = [{ id: "PA", nombre: "Panamá", prefijoTelefonico: "507", tiposDocumento: [{ id: ID_CEDULA, value: "PA_cedula", nombre: "Cédula" }] }];
    repo.listarDisponiblesParaAlta.mockResolvedValueOnce(paises);
    expect(await new PaisService(repo).listarDisponiblesParaAlta(SUPERADMIN)).toEqual({ status: "ok", paises });
  });

  it("el maestro no lee los tipos de la plataforma", async () => {
    expect(await new PaisService(repoDoble()).listarTiposDocumento("PA", MAESTRO)).toEqual({ status: "forbidden" });
  });
});
