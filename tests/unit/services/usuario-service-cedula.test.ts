import { describe, it, expect, vi } from "vitest";

import { UsuarioService } from "@/lib/services/UsuarioService";
import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IUsuarioService";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import {
  UsuarioDuplicadoError,
  type IUserRepository,
  type RolItem,
  type UsuarioPublico,
} from "@/lib/interfaces/repositories/IUserRepository";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-221 (T1.4; R1601-R1603) — el maestro corrige la cedula de un usuario desde la edicion.
// Dobles: el repositorio (para ver QUE recibe `update` y si se llama) y el puerto de reglas del pais
// (`reglasPaisFijas`, Costa Rica). El SQL —el UPDATE, el indice unico y la fila del Historico— lo
// prueba `tests/integration/db/usuario-cedula-corregida.test.ts` contra Postgres real.

const MAESTRO: Actor = { usuarioId: "maestro-1", rol: "maestro" };
const ROLES: RolItem[] = [
  { id: "rol-maestro", value: "maestro" },
  { id: "rol-admin", value: "admin" },
];

const TIPO_CEDULA = "tipo-cr-cedula"; // 9 digitos
const TIPO_DIMEX = "tipo-cr-dimex"; // 11 a 12 digitos
const TIPO_PASAPORTE = "tipo-cr-pasaporte"; // alfanumerico, se guarda en mayusculas

function usuario(overrides: Partial<UsuarioPublico> = {}): UsuarioPublico {
  return {
    id: "usr-1",
    nombre: "Ana Torres",
    email: "ana@example.com",
    telefono: "88887777",
    estado: "activo",
    cedula: "123456789",
    tipoIdentificacionId: TIPO_CEDULA,
    rolId: "rol-admin",
    seRecogeEnTienda: true,
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
    create: vi.fn(),
    restablecerContrasena: vi.fn(),
    updatePasswordHash: vi.fn(),
    listMensajeros: vi.fn(),
    listMensajerosParaFiltro: vi.fn(),
    listByRol: vi.fn(),
    listCuentasTienda: vi.fn(),
    obtenerCuentaTienda: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    update: vi.fn().mockResolvedValue(actual),
    setEstado: vi.fn(),
    listTiposIdentificacion: vi.fn().mockResolvedValue([]),
    listRoles: vi.fn().mockResolvedValue(ROLES),
    contarAdminSatelitesActivos: vi.fn(),
  };
}

function servicio(repo: IUserRepository, reglas: IReglasPaisEmpresa = reglasPaisFijas()): UsuarioService {
  return new UsuarioService(repo, undefined, undefined, undefined, undefined, reglas);
}

/** Lo que el repositorio recibio en `update`. */
function actualizado(repo: IUserRepository): Record<string, unknown> {
  return (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
}

describe("SLT-221 R1601 — la cedula nueva reemplaza a la guardada, normalizada con la regla del tipo", () => {
  it("R1601: una cedula fisica valida distinta de la guardada llega al repositorio", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar("usr-1", { cedula: "112340567" }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(actualizado(repo)).toEqual({ cedula: "112340567" });
    expect(repo.update).toHaveBeenCalledWith("usr-1", expect.anything(), "maestro-1");
  });

  it("R1601: el pasaporte se normaliza a mayusculas antes de escribirse", async () => {
    const repo = repoDoble(usuario({ tipoIdentificacionId: TIPO_PASAPORTE, cedula: "AB1234" }));
    const r = await servicio(repo).actualizar("usr-1", { cedula: "cd56789" }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(actualizado(repo)).toEqual({ cedula: "CD56789" });
  });

  it("R1601: cambiar a la vez tipo y cedula valida la cedula nueva con el tipo nuevo y escribe los dos", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar(
      "usr-1",
      { tipoIdentificacionId: TIPO_DIMEX, cedula: "12345678901" },
      MAESTRO,
    );

    expect(r.status).toBe("ok");
    expect(actualizado(repo)).toEqual({ tipoIdentificacionId: TIPO_DIMEX, cedula: "12345678901" });
  });

  it("R1605: reenviar la misma cedula no la revalida ni la manda a escribir", async () => {
    // La guardada (8 digitos) NO cumple la regla de la cedula fisica: si se revalidara, fallaria.
    const repo = repoDoble(usuario({ cedula: "12345678" }));
    const r = await servicio(repo).actualizar("usr-1", { nombre: "Ana", cedula: "12345678" }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(actualizado(repo)).toEqual({ nombre: "Ana" });
  });
});

describe("SLT-221 R1602 — una cedula que no cumple la regla del tipo resultante se rechaza sin escribir", () => {
  it("R1602 (tipo guardado): 8 digitos para una cedula fisica es validation_error en `cedula`", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar("usr-1", { nombre: "Ana Mora", cedula: "12345678" }, MAESTRO);

    expect(r.status).toBe("validation_error");
    const errores = r.status === "validation_error" ? r.fieldErrors : {};
    expect(Object.keys(errores)).toEqual(["cedula"]);
    expect(errores.cedula?.[0]).toContain("9");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("R1602 (tipo guardado): letras en una cedula fisica es validation_error en `cedula`", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar("usr-1", { cedula: "12345678A" }, MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { cedula: ["Solo se admiten dígitos, sin espacios ni guiones."] },
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("R1602 (tipo nuevo): una cedula valida para el tipo guardado pero no para el nuevo se rechaza en `cedula`", async () => {
    const repo = repoDoble();
    // 9 digitos: vale como cedula fisica (el tipo guardado), no como DIMEX (el que pide la edicion).
    const r = await servicio(repo).actualizar(
      "usr-1",
      { tipoIdentificacionId: TIPO_DIMEX, cedula: "998877665" },
      MAESTRO,
    );

    expect(r.status).toBe("validation_error");
    const errores = r.status === "validation_error" ? r.fieldErrors : {};
    expect(Object.keys(errores)).toEqual(["cedula"]);
    expect(errores.cedula?.[0]).toContain("Debe tener entre 11 y 12 dígitos.");
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("R1602 (tipo nuevo): una cedula valida para el tipo nuevo pasa aunque no valga para el guardado", async () => {
    const repo = repoDoble();
    const r = await servicio(repo).actualizar(
      "usr-1",
      { tipoIdentificacionId: TIPO_DIMEX, cedula: "998877665544" },
      MAESTRO,
    );

    expect(r.status).toBe("ok");
    expect(actualizado(repo)).toMatchObject({ cedula: "998877665544" });
  });

  it("R1602 (sin empresa): la cedula nueva cae en la regla generica y su error va a `cedula`", async () => {
    const sinEmpresa: IReglasPaisEmpresa = {
      deLaEmpresa: () => Promise.reject(new EmpresaNoResuelta("Pais", "deLaEmpresa")),
      zonaHoraria: () => Promise.reject(new EmpresaNoResuelta("Pais", "zonaHoraria")),
      tipoDocumento: () => Promise.reject(new EmpresaNoResuelta("Pais", "tipoDocumento")),
      moneda: () => Promise.reject(new EmpresaNoResuelta("Pais", "moneda")),
      nombreImpuesto: () => Promise.reject(new EmpresaNoResuelta("Pais", "nombreImpuesto")),
    };
    const repo = repoDoble();
    const rechazo = await servicio(repo, sinEmpresa).actualizar("usr-1", { cedula: "12-AB" }, MAESTRO);
    expect(rechazo.status === "validation_error" && Object.keys(rechazo.fieldErrors)).toEqual(["cedula"]);
    expect(repo.update).not.toHaveBeenCalled();

    const ok = await servicio(repo, sinEmpresa).actualizar("usr-1", { cedula: "1234567890123" }, MAESTRO);
    expect(ok.status).toBe("ok");
    expect(actualizado(repo)).toEqual({ cedula: "1234567890123" });
  });
});

describe("SLT-221 R1603 — la cedula de otro usuario de la empresa es `conflict` en `cedula`", () => {
  it("R1603: el duplicado que traduce el repositorio sale como conflict con su campo", async () => {
    const repo = repoDoble();
    (repo.update as ReturnType<typeof vi.fn>).mockRejectedValue(new UsuarioDuplicadoError("cedula"));
    const r = await servicio(repo).actualizar("usr-1", { cedula: "112340567" }, MAESTRO);

    expect(r).toEqual({ status: "conflict", campo: "cedula" });
  });

  it("R1603: un error que no es de duplicado se propaga tal cual", async () => {
    const repo = repoDoble();
    const fallo = new Error("se cayo la base");
    (repo.update as ReturnType<typeof vi.fn>).mockRejectedValue(fallo);

    await expect(servicio(repo).actualizar("usr-1", { cedula: "112340567" }, MAESTRO)).rejects.toBe(fallo);
  });
});
