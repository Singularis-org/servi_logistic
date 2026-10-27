import { describe, it, expect, vi, beforeEach } from "vitest";

import type { IOrganizacionRepository } from "@/lib/interfaces/repositories/IOrganizacionRepository";
import type { AltaEmpresaDatos, AltaEmpresaResultado } from "@/lib/types/organizacion";

// SL-17 / T2.8 (design §7.7) — R44, R45, R46 en el servicio, con el repositorio doble.
//
// El hasher se envuelve (no se sustituye): el servicio sigue usando el hash REAL del login, y el
// envoltorio solo deja ver qué secreto le llegó, para probar que es aleatorio y no sale fuera.
const secretosHasheados: string[] = [];
vi.mock("@/lib/utils/password", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/utils/password")>();
  return {
    ...real,
    hashPassword: async (plain: string) => {
      secretosHasheados.push(plain);
      return real.hashPassword(plain);
    },
  };
});

const { OrganizacionService } = await import("@/lib/services/OrganizacionService");
const { verifyPassword } = await import("@/lib/utils/password");

function entradaValida() {
  return {
    nombre: "Envíos del Sur",
    slug: "envios-del-sur",
    paisId: "CR",
    maestro: {
      nombre: "Lucía Mora",
      email: "lucia@ejemplo.test",
      telefono: "88887777",
      documento: "112223333",
      tipoDocumento: "cedula",
    },
  };
}

function repoDoble(resultado: AltaEmpresaResultado = { estado: "creada", organizacionId: "org-1", maestroId: "u-1" }) {
  const altaEmpresa = vi.fn<(datos: AltaEmpresaDatos) => Promise<AltaEmpresaResultado>>(async () => resultado);
  const repo: IOrganizacionRepository = { altaEmpresa };
  return { repo, altaEmpresa };
}

beforeEach(() => {
  secretosHasheados.length = 0;
});

describe("R46 — la entrada inválida nombra el campo y no llega al repositorio", () => {
  const casos: Array<[string, (e: ReturnType<typeof entradaValida>) => unknown, string]> = [
    ["slug con mayúsculas", (e) => ({ ...e, slug: "Envios-Sur" }), "slug"],
    ["slug con guion al final", (e) => ({ ...e, slug: "envios-" }), "slug"],
    ["slug con guiones dobles", (e) => ({ ...e, slug: "envios--sur" }), "slug"],
    ["slug con espacio", (e) => ({ ...e, slug: "envios sur" }), "slug"],
    ["slug de 2 caracteres", (e) => ({ ...e, slug: "ab" }), "slug"],
    ["slug de 64 caracteres", (e) => ({ ...e, slug: "a".repeat(64) }), "slug"],
    ["nombre vacío", (e) => ({ ...e, nombre: "   " }), "nombre"],
    ["email inválido", (e) => ({ ...e, maestro: { ...e.maestro, email: "lucia@" } }), "maestro.email"],
    ["nombre del maestro vacío", (e) => ({ ...e, maestro: { ...e.maestro, nombre: "" } }), "maestro.nombre"],
    ["teléfono vacío", (e) => ({ ...e, maestro: { ...e.maestro, telefono: "" } }), "maestro.telefono"],
    ["documento vacío", (e) => ({ ...e, maestro: { ...e.maestro, documento: " " } }), "maestro.documento"],
    ["tipo de documento vacío", (e) => ({ ...e, maestro: { ...e.maestro, tipoDocumento: "" } }), "maestro.tipoDocumento"],
    ["sin maestro", (e) => ({ nombre: e.nombre, slug: e.slug, paisId: e.paisId }), "maestro"],
    // SL-20 (R6): el país es obligatorio y con forma de código ISO; sin él no se llega a la base.
    ["sin país", (e) => ({ nombre: e.nombre, slug: e.slug, maestro: e.maestro }), "paisId"],
    ["país vacío", (e) => ({ ...e, paisId: "" }), "paisId"],
    ["país en minúsculas", (e) => ({ ...e, paisId: "cr" }), "paisId"],
    ["país de tres letras", (e) => ({ ...e, paisId: "CRI" }), "paisId"],
    ["país que no es texto", (e) => ({ ...e, paisId: 506 }), "paisId"],
    ["campo de más", (e) => ({ ...e, organizacionId: "otra" }), "organizacionId"],
    ["campo de más en el maestro", (e) => ({ ...e, maestro: { ...e.maestro, passwordHash: "x" } }), "maestro.passwordHash"],
  ];

  it.each(casos)("%s → invalida(%s)", async (_titulo, mutar, campo) => {
    const { repo, altaEmpresa } = repoDoble();
    const r = await new OrganizacionService(repo).altaEmpresa(mutar(entradaValida()));
    expect(r).toEqual({ estado: "invalida", campo });
    expect(altaEmpresa).not.toHaveBeenCalled();
    expect(secretosHasheados).toHaveLength(0);
  });

  it("una entrada que no es objeto también es inválida", async () => {
    const { repo, altaEmpresa } = repoDoble();
    const r = await new OrganizacionService(repo).altaEmpresa(null);
    expect(r.estado).toBe("invalida");
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("los bordes del slug valen: 3 y 63 caracteres", async () => {
    for (const slug of ["abc", "a".repeat(63), "a1-b2-c3"]) {
      const { repo, altaEmpresa } = repoDoble();
      const r = await new OrganizacionService(repo).altaEmpresa({ ...entradaValida(), slug });
      expect(r.estado).toBe("creada");
      expect(altaEmpresa.mock.calls[0][0].slug).toBe(slug);
    }
  });
});

describe("R44 — el maestro nace sin contraseña utilizable", () => {
  it("el repositorio recibe los datos validados y un hash de un secreto de 32 bytes", async () => {
    const { repo, altaEmpresa } = repoDoble();
    await new OrganizacionService(repo).altaEmpresa(entradaValida());

    expect(altaEmpresa).toHaveBeenCalledTimes(1);
    const datos = altaEmpresa.mock.calls[0][0];
    const { passwordHash, ...maestro } = datos.maestro;
    expect({ ...datos, maestro }).toEqual(entradaValida());

    expect(secretosHasheados).toHaveLength(1);
    const secreto = secretosHasheados[0];
    expect(Buffer.from(secreto, "base64url")).toHaveLength(32);
    expect(await verifyPassword(secreto, passwordHash)).toBe(true); // es el hash de ESE secreto
  });

  it("ninguna contraseña que alguien pueda teclear abre la cuenta", async () => {
    const { repo, altaEmpresa } = repoDoble();
    await new OrganizacionService(repo).altaEmpresa(entradaValida());
    const { passwordHash, email, documento, telefono } = altaEmpresa.mock.calls[0][0].maestro;

    for (const intento of ["", " ", "password", "123456", email, documento, telefono, passwordHash]) {
      expect(await verifyPassword(intento, passwordHash)).toBe(false);
    }
  });

  it("el secreto y el hash son distintos en cada alta", async () => {
    const { repo, altaEmpresa } = repoDoble();
    const servicio = new OrganizacionService(repo);
    await servicio.altaEmpresa(entradaValida());
    await servicio.altaEmpresa(entradaValida());

    expect(secretosHasheados).toHaveLength(2);
    expect(secretosHasheados[0]).not.toBe(secretosHasheados[1]);
    const [h1, h2] = altaEmpresa.mock.calls.map((c) => c[0].maestro.passwordHash);
    expect(h1).not.toBe(h2);
  });

  it("ni el secreto ni el hash salen en el resultado", async () => {
    const { repo, altaEmpresa } = repoDoble();
    const r = await new OrganizacionService(repo).altaEmpresa(entradaValida());
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(secretosHasheados[0]);
    expect(texto).not.toContain(altaEmpresa.mock.calls[0][0].maestro.passwordHash);
  });
});

describe("SL-20 R6 — el país validado llega al repositorio", () => {
  it("el repositorio recibe el `paisId` de la entrada, sin cambiarlo", async () => {
    const { repo, altaEmpresa } = repoDoble();
    await new OrganizacionService(repo).altaEmpresa({ ...entradaValida(), paisId: "XA" });
    expect(altaEmpresa.mock.calls[0][0].paisId).toBe("XA");
  });
});

describe("R44–R46 — los cinco desenlaces del repositorio se devuelven tal cual", () => {
  const desenlaces: AltaEmpresaResultado[] = [
    { estado: "creada", organizacionId: "org-1", maestroId: "u-1" },
    { estado: "ya_existe", organizacionId: "org-1" },
    { estado: "conflicto", campo: "slug" },
    { estado: "conflicto", campo: "email" },
    { estado: "conflicto", campo: "documento" },
    { estado: "invalida", campo: "maestro.tipoDocumento" },
    // SL-20: R8 (misma alta en otro país), y R6 (país con buena forma que no existe) o R45 (país
    // apagado en un alta nueva): el servicio no mira la base, el repositorio decide y se devuelve tal cual.
    { estado: "conflicto", campo: "paisId" },
    { estado: "invalida", campo: "paisId" },
  ];

  it.each(desenlaces)("%o", async (desenlace) => {
    const { repo } = repoDoble(desenlace);
    expect(await new OrganizacionService(repo).altaEmpresa(entradaValida())).toEqual(desenlace);
  });

  it("un error del repositorio no se traga", async () => {
    const repo: IOrganizacionRepository = {
      altaEmpresa: vi.fn(async () => {
        throw new Error("la base se cayó");
      }),
    };
    await expect(new OrganizacionService(repo).altaEmpresa(entradaValida())).rejects.toThrow("la base se cayó");
  });
});
