import { describe, it, expect, vi, beforeEach } from "vitest";

import { UsuarioService } from "@/lib/services/UsuarioService";
import type { Actor } from "@/lib/interfaces/services/IUsuarioService";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type {
  IUserRepository,
  RolItem,
  UsuarioPublico,
} from "@/lib/interfaces/repositories/IUserRepository";
import type { CrearUsuarioInput } from "@/lib/types/usuario";
import type { TipoDocumentoDTO } from "@/lib/types/pais";
import { CR, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (T4.1; R5, R9-R12, R14-R16) — `UsuarioService` valida tipo, documento y telefono con las
// reglas del pais de la empresa. Dobles: el repositorio (para contar escrituras) y el puerto de
// reglas (`reglasPaisFijas`). La validacion del telefono es la real (`libphonenumber-js`).
//
// `hashPassword` es un espia: «sin escribir nada» incluye no pagar el hash de un alta rechazada.

const hashPassword = vi.hoisted(() => vi.fn(async () => "hash"));
vi.mock("@/lib/utils/password", () => ({ hashPassword }));

const MAESTRO: Actor = { usuarioId: "maestro-1", rol: "maestro" };

const ROLES: RolItem[] = [
  { id: "rol-maestro", value: "maestro" },
  { id: "rol-admin", value: "admin" },
];

const TIPO_CEDULA = "tipo-cr-cedula";
const TIPO_RUC = "tipo-cr-ruc";
const TIPO_DIMEX = "tipo-cr-dimex";
const TIPO_PASAPORTE = "tipo-cr-pasaporte";

/** Un tipo de CR que ya no se puede elegir (desvio aceptado 2: llega con `activo: false`). */
const TIPO_CR_INACTIVO: TipoDocumentoDTO = {
  id: "tipo-cr-viejo",
  value: "viejo",
  paisId: "CR",
  clave: "viejo",
  nombre: "Viejo",
  caracteres: "digitos",
  largoMin: 9,
  largoMax: 9,
  activo: false,
};

/** Un tipo de OTRO pais: la empresa de CR no lo puede usar (R11). */
const TIPO_XA: TipoDocumentoDTO = {
  id: "tipo-xa-nacional",
  value: "XA_nacional",
  paisId: "XA",
  clave: "nacional",
  nombre: "Nacional XA",
  caracteres: "digitos",
  largoMin: 9,
  largoMax: 9,
  activo: true,
};

/** Costa Rica con un tipo inactivo y, en el catalogo, un tipo de otro pais. */
function reglasCR(): IReglasPaisEmpresa {
  return reglasPaisFijas({ ...CR, tiposDocumento: [...CR.tiposDocumento, TIPO_CR_INACTIVO, TIPO_XA] });
}

/** Un pais de prueba que libphonenumber no conoce (R16). */
function reglasXA(): IReglasPaisEmpresa {
  return reglasPaisFijas({
    paisId: "XA",
    zonaHoraria: "Europe/Madrid",
    telefono: { prefijo: "999", digitosNacionales: 7 },
    tiposDocumento: [TIPO_XA],
  });
}

function usuario(overrides: Partial<UsuarioPublico> = {}): UsuarioPublico {
  return {
    id: "usr-1",
    nombre: "Ana Torres",
    email: "ana@example.com",
    // Guardados ANTES de esta ficha: ni el telefono ni la cedula cumplen la regla de CR (R9, P1).
    telefono: "099",
    estado: "activo",
    cedula: "123456789",
    tipoIdentificacionId: TIPO_CEDULA,
    rolId: "rol-admin",
    fulfillment: false,
    zonaId: null,
    vehiculoId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function repoDoble(actual: UsuarioPublico = usuario()): IUserRepository {
  return {
    findCuentasPorEmailConHash: vi.fn(),
    findById: vi.fn().mockResolvedValue(actual),
    findCuentasPorEmail: vi.fn(),
    findCuentaPorId: vi.fn(),
    create: vi.fn().mockResolvedValue(usuario()),
    restablecerContrasena: vi.fn(),
    updatePasswordHash: vi.fn(),
    listMensajeros: vi.fn(),
    listMensajerosParaFiltro: vi.fn(),
    listByRol: vi.fn(),
    listCuentasTienda: vi.fn(),
    obtenerCuentaTienda: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    update: vi.fn().mockResolvedValue(usuario()),
    setEstado: vi.fn(),
    listTiposIdentificacion: vi.fn().mockResolvedValue([]),
    listRoles: vi.fn().mockResolvedValue(ROLES),
    contarAdminSatelitesActivos: vi.fn(),
  };
}

function servicio(repo: IUserRepository, reglas: IReglasPaisEmpresa = reglasCR()): UsuarioService {
  return new UsuarioService(repo, undefined, undefined, undefined, undefined, reglas);
}

function alta(overrides: Partial<CrearUsuarioInput> = {}): CrearUsuarioInput {
  return {
    nombre: "Luis Mora",
    email: "luis@example.com",
    telefono: "88887777",
    tipoIdentificacionId: TIPO_CEDULA,
    cedula: "112340567",
    rolId: "rol-admin",
    passwordMode: "manual",
    password: "Contrasena-Segura-123!",
    ...overrides,
  } as CrearUsuarioInput;
}

/** Lo que el repositorio recibio en `create`. */
function creado(repo: IUserRepository): Record<string, unknown> {
  return (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
}

/** Lo que el repositorio recibio en `update`. */
function actualizado(repo: IUserRepository): Record<string, unknown> {
  return (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
}

beforeEach(() => {
  hashPassword.mockClear();
});

describe("SLT-42 R5 — la lista de tipos es la del pais de la empresa", () => {
  it("R5: pide al repositorio los tipos del pais de la empresa en curso, y cada empresa los de su pais", async () => {
    const repoCR = repoDoble();
    const repoXA = repoDoble();

    await servicio(repoCR, reglasCR()).listarTiposIdentificacion(MAESTRO);
    await servicio(repoXA, reglasXA()).listarTiposIdentificacion(MAESTRO);

    expect(repoCR.listTiposIdentificacion).toHaveBeenCalledWith("CR");
    expect(repoXA.listTiposIdentificacion).toHaveBeenCalledWith("XA");
  });
});

describe("SLT-42 R10 — el documento del alta cumple la regla de su tipo", () => {
  it("R10: una cedula fisica de 8 digitos es validation_error en `cedula`, sin hash ni escritura", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ cedula: "12345678" }), MAESTRO);

    expect(r).toEqual({ status: "validation_error", fieldErrors: { cedula: ["Debe tener 9 dígitos."] } });
    expect(repo.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("R10: un DIMEX con letras es validation_error en `cedula`", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(
      alta({ tipoIdentificacionId: TIPO_DIMEX, cedula: "1234567890A" }),
      MAESTRO,
    );

    expect(r.status).toBe("validation_error");
    expect(r.status === "validation_error" && r.fieldErrors).toHaveProperty("cedula");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("R10: un DIMEX de 11 digitos entra tal cual", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(
      alta({ tipoIdentificacionId: TIPO_DIMEX, cedula: "12345678901" }),
      MAESTRO,
    );

    expect(r.status).toBe("ok");
    expect(creado(repo)).toMatchObject({ cedula: "12345678901", tipoIdentificacionId: TIPO_DIMEX });
  });

  it("R10: el pasaporte se guarda en mayusculas (P5)", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(
      alta({ tipoIdentificacionId: TIPO_PASAPORTE, cedula: "ab12345" }),
      MAESTRO,
    );

    expect(r.status).toBe("ok");
    expect(creado(repo)).toMatchObject({ cedula: "AB12345" });
  });

  it("R10: el tipo puede llegar por su `value` y se guarda su `id`", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ tipoIdentificacionId: "cedula" }), MAESTRO);

    expect(r.status).toBe("ok");
    expect(creado(repo)).toMatchObject({ tipoIdentificacionId: TIPO_CEDULA });
  });
});

describe("SLT-42 R11 — el tipo existe, esta activo y es del pais de la empresa", () => {
  it("R11: un tipo inexistente es validation_error en `tipoIdentificacionId`, sin escribir", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ tipoIdentificacionId: "no-existe" }), MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { tipoIdentificacionId: ["El tipo de documento indicado no existe"] },
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("R11: un tipo inactivo se rechaza con su propio mensaje", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ tipoIdentificacionId: TIPO_CR_INACTIVO.id }), MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { tipoIdentificacionId: ["El tipo de documento indicado ya no está activo"] },
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("R11: un tipo de otro pais no existe para la empresa, aunque el documento cumpla su regla", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(
      alta({ tipoIdentificacionId: TIPO_XA.id, cedula: "123456789" }),
      MAESTRO,
    );

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { tipoIdentificacionId: ["El tipo de documento indicado no existe"] },
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("R11: en la edicion, pasar a un tipo de otro pais es validation_error en el tipo, sin escribir", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar("usr-1", { tipoIdentificacionId: TIPO_XA.id }, MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { tipoIdentificacionId: ["El tipo de documento indicado no existe"] },
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("R11: en la edicion, pasar a un tipo inactivo es validation_error en el tipo", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar(
      "usr-1",
      { tipoIdentificacionId: TIPO_CR_INACTIVO.id },
      MAESTRO,
    );

    expect(r.status === "validation_error" && r.fieldErrors.tipoIdentificacionId).toEqual([
      "El tipo de documento indicado ya no está activo",
    ]);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe("SLT-42 R12 — cambiar el tipo valida el documento guardado con el tipo nuevo", () => {
  it("R12: una cedula de 9 digitos no pasa a DIMEX: validation_error en el tipo, sin escribir", async () => {
    const repo = repoDoble(usuario({ cedula: "123456789" }));
    const r = await servicio(repo).actualizar("usr-1", { tipoIdentificacionId: TIPO_DIMEX }, MAESTRO);

    expect(r.status).toBe("validation_error");
    const errores = r.status === "validation_error" ? r.fieldErrors : {};
    expect(Object.keys(errores)).toEqual(["tipoIdentificacionId"]);
    expect(errores.tipoIdentificacionId?.[0]).toContain("Debe tener entre 11 y 12 dígitos.");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("R12: un documento de 10 digitos si pasa a cedula juridica, y el documento no se toca", async () => {
    const repo = repoDoble(usuario({ cedula: "3101123456" }));
    const r = await servicio(repo).actualizar("usr-1", { tipoIdentificacionId: TIPO_RUC }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(actualizado(repo)).toMatchObject({ tipoIdentificacionId: TIPO_RUC });
    expect(actualizado(repo)).not.toHaveProperty("cedula");
  });
});

describe("SLT-42 R9 — la edicion no revalida lo que no cambia", () => {
  function reglasEspia(): IReglasPaisEmpresa & { llamadas: () => number } {
    const base = reglasCR();
    const deLaEmpresa = vi.fn(base.deLaEmpresa);
    const tipoDocumento = vi.fn(base.tipoDocumento);
    return {
      ...base,
      deLaEmpresa,
      tipoDocumento,
      llamadas: () => deLaEmpresa.mock.calls.length + tipoDocumento.mock.calls.length,
    };
  }

  it("R9: editar solo el nombre de un usuario con telefono y cedula que no cumplen la regla guarda sin consultar el pais", async () => {
    const repo = repoDoble();
    const reglas = reglasEspia();
    const r = await servicio(repo, reglas).actualizar("usr-1", { nombre: "Ana Torres Mora" }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(reglas.llamadas()).toBe(0);
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it("R9: reenviar el mismo telefono y el mismo tipo que ya tiene no los revalida", async () => {
    const repo = repoDoble();
    const reglas = reglasEspia();
    const r = await servicio(repo, reglas).actualizar(
      "usr-1",
      { nombre: "Ana", telefono: "099", tipoIdentificacionId: TIPO_CEDULA },
      MAESTRO,
    );

    expect(r.status).toBe("ok");
    expect(reglas.llamadas()).toBe(0);
    expect(actualizado(repo)).toMatchObject({ telefono: "099", tipoIdentificacionId: TIPO_CEDULA });
  });

  it("R9: cambiar solo el telefono no revalida el documento guardado", async () => {
    const repo = repoDoble(usuario({ cedula: "1" }));
    const reglas = reglasEspia();
    const r = await servicio(repo, reglas).actualizar("usr-1", { telefono: "60001234" }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(reglas.tipoDocumento).not.toHaveBeenCalled();
  });
});

describe("SLT-42 R14 — el telefono se valida con libphonenumber para la region del pais", () => {
  it("R14: un telefono que no es de CR es validation_error en `telefono`, sin hash ni escritura", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ telefono: "11112222" }), MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { telefono: ["El teléfono no es válido para el país de la empresa"] },
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("R14: un numero valido de OTRO pais (Panama, +507) no pasa como de CR", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ telefono: "+50761234567" }), MAESTRO);

    expect(r.status === "validation_error" && r.fieldErrors).toHaveProperty("telefono");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("R14: cambiar el telefono a uno no valido es validation_error en `telefono`, sin escribir", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar("usr-1", { telefono: "12" }, MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { telefono: ["El teléfono no es válido para el país de la empresa"] },
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("R10, R11, R14: el alta junta todos los errores en una sola respuesta", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ telefono: "1", cedula: "1" }), MAESTRO);

    expect(r.status === "validation_error" && Object.keys(r.fieldErrors).sort()).toEqual(["cedula", "telefono"]);
  });
});

describe("SLT-42 R15 — el telefono valido se guarda como numero nacional en digitos", () => {
  it("R15: en el alta, «+506 8888-7777» se guarda como «88887777»", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).crear(alta({ telefono: "+506 8888-7777" }), MAESTRO);

    expect(r.status).toBe("ok");
    expect(creado(repo)).toMatchObject({ telefono: "88887777" });
  });

  it("R15: en la edicion, «8888 6666» se guarda como «88886666»", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar("usr-1", { telefono: "8888 6666" }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(actualizado(repo)).toMatchObject({ telefono: "88886666" });
  });
});

describe("SLT-42 R16 — un pais sin reglas de telefono en libphonenumber", () => {
  it("R16: el alta en una empresa de XA es validation_error en `telefono` con el mensaje del pais sin reglas", async () => {
    const repo = repoDoble();
    const r = await servicio(repo, reglasXA()).crear(
      alta({ telefono: "1234567", tipoIdentificacionId: TIPO_XA.id, cedula: "123456789" }),
      MAESTRO,
    );

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { telefono: ["El país de la empresa no tiene reglas de teléfono"] },
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("R16: cambiar el telefono en una empresa de XA tambien se rechaza con ese mensaje", async () => {
    const repo = repoDoble();
    const r = await servicio(repo, reglasXA()).actualizar("usr-1", { telefono: "1234567" }, MAESTRO);

    expect(r.status === "validation_error" && r.fieldErrors.telefono).toEqual([
      "El país de la empresa no tiene reglas de teléfono",
    ]);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe("SLT-42 — sin las reglas del pais el servicio no guarda sin validar", () => {
  it("crear lanza si el composition root no paso las reglas del pais", async () => {
    const repo = repoDoble();
    await expect(new UsuarioService(repo).crear(alta(), MAESTRO)).rejects.toThrow(/reglas del pais/);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
