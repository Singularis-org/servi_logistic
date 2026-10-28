import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";
import { EmpresasPlataformaService } from "@/lib/services/EmpresasPlataformaService";
import type { IEmpresasPlataformaRepository } from "@/lib/interfaces/repositories/IEmpresasPlataformaRepository";
import type { EmpresaListada } from "@/lib/types/empresas-plataforma";

// SL-32 T14a — el listado de la pantalla «Empresas» (R29, R35), con un repositorio doble. El
// predicado de plataforma es uno de test: el real (`esPlataforma`) llega en T4 y lo cablea T14b.
// Datos ficticios: dominio `example.test`.

const soloSuperadmin = (rol: string) => rol === "superadmin";

// Los roles de empresa salen del enum generado, no de una lista escrita aqui: si mañana el enum
// gana un rol de empresa, este test lo cubre sin tocarlo. `superadmin` se excluye por si T3 ya
// lo anadio.
const ROLES_DE_EMPRESA = (Object.values(RolValue) as string[]).filter((rol) => rol !== "superadmin");

const EMPRESAS: EmpresaListada[] = [
  {
    id: "00000000-0000-4000-8000-000000000002",
    nombre: "Empresa Ficticia B",
    slug: "empresa-ficticia-b",
    creadaEn: new Date("2026-10-21T10:00:00Z"),
    maestros: [{ nombre: "Maestro B", email: "maestro-b@example.test" }],
    cobroPorOrden: null,
    // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
    // SL-20 (R9): el país de la empresa.
    pais: { id: "CR", nombre: "Costa Rica" },
  },
  {
    id: "00000000-0000-4000-8000-000000000001",
    nombre: "Empresa Ficticia A",
    slug: "empresa-ficticia-a",
    creadaEn: new Date("2026-10-20T10:00:00Z"),
    maestros: [],
    cobroPorOrden: null,
    // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
    deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
    pagadoPlataforma: "0.00",
    // SL-20 (R9): el país de la empresa.
    pais: { id: "CR", nombre: "Costa Rica" },
  },
];

function repoDoble(empresas: EmpresaListada[] = EMPRESAS) {
  const listar = vi.fn<IEmpresasPlataformaRepository["listar"]>(async () => empresas);
  // SL-36: el contrato suma `estadoIntegraciones`; este archivo prueba solo el listado.
  const repo: IEmpresasPlataformaRepository = {
    listar,
    estadoIntegraciones: vi.fn<IEmpresasPlataformaRepository["estadoIntegraciones"]>(async () => []),
  };
  return { repo, listar };
}

describe("EmpresasPlataformaService — acceso (R35)", () => {
  it("los roles de empresa del enum son los seis conocidos", () => {
    expect([...ROLES_DE_EMPRESA].sort()).toEqual(
      ["admin", "adminSatelite", "adminTienda", "apiKey", "maestro", "mensajero"].sort(),
    );
  });

  it.each(ROLES_DE_EMPRESA)("el rol %s recibe forbidden y el repositorio no se llama", async (rol) => {
    const { repo, listar } = repoDoble();
    const service = new EmpresasPlataformaService(repo, soloSuperadmin);

    const resultado = await service.listarEmpresas({ rol });

    expect(resultado).toEqual({ status: "forbidden" });
    expect(listar).not.toHaveBeenCalled();
  });

  it("sin actor recibe forbidden y el repositorio no se llama", async () => {
    const { repo, listar } = repoDoble();
    const service = new EmpresasPlataformaService(repo, soloSuperadmin);

    expect(await service.listarEmpresas(null)).toEqual({ status: "forbidden" });
    expect(listar).not.toHaveBeenCalled();
  });

  it("usa el predicado inyectado: si dice que no, ni el superadmin pasa", async () => {
    const { repo, listar } = repoDoble();
    const nadie = vi.fn<(rol: string) => boolean>(() => false);
    const service = new EmpresasPlataformaService(repo, nadie);

    expect(await service.listarEmpresas({ rol: "superadmin" })).toEqual({ status: "forbidden" });
    expect(nadie).toHaveBeenCalledWith("superadmin");
    expect(listar).not.toHaveBeenCalled();
  });

  it("usa el predicado inyectado: si dice que si, pasa un rol cualquiera", async () => {
    const { repo, listar } = repoDoble();
    const rolInventado = "rol-de-plataforma-de-test";
    const service = new EmpresasPlataformaService(repo, (rol) => rol === rolInventado);

    expect(await service.listarEmpresas({ rol: rolInventado })).toEqual({
      status: "ok",
      empresas: EMPRESAS,
    });
    expect(listar).toHaveBeenCalledTimes(1);
  });
});

describe("EmpresasPlataformaService — listado (R29)", () => {
  it("el actor de plataforma recibe exactamente lo del repositorio", async () => {
    const { repo, listar } = repoDoble();
    const service = new EmpresasPlataformaService(repo, soloSuperadmin);

    const resultado = await service.listarEmpresas({ rol: "superadmin" });

    expect(resultado).toEqual({ status: "ok", empresas: EMPRESAS });
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it("sin empresas, devuelve la lista vacia", async () => {
    const { repo } = repoDoble([]);
    const service = new EmpresasPlataformaService(repo, soloSuperadmin);

    expect(await service.listarEmpresas({ rol: "superadmin" })).toEqual({
      status: "ok",
      empresas: [],
    });
  });
});
