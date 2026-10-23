import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { ArranqueSuperadminService } from "@/lib/services/ArranqueSuperadminService";
import type {
  CrearSuperadminResultado,
  IArranqueSuperadminRepository,
} from "@/lib/interfaces/repositories/IArranqueSuperadminRepository";
import {
  codigoSalidaArranqueSuperadmin,
  mensajeArranqueSuperadmin,
  REGLA_OBLIGATORIA,
  VARIABLES_ARRANQUE_SUPERADMIN,
  type ArranqueSuperadminResultado,
  type VariableArranqueSuperadmin,
} from "@/lib/types/arranque-superadmin";
import { strongPasswordSchema } from "@/lib/types/password-policy";

// SL-32 T2 — la regla del comando `pnpm arranque:superadmin` (R12–R16), con un repositorio doble.
// Todos los valores son ficticios: dominio `example.test` y documentos que no son de nadie.

const PASSWORD = "Ficticia#2026x";
const EMAIL = "superadmin-ficticio@example.test";
const DOCUMENTO = "FICTICIO-000-111";

const ENTORNO_VALIDO: Record<VariableArranqueSuperadmin, string> = {
  SUPERADMIN_EMAIL: EMAIL,
  SUPERADMIN_PASSWORD: PASSWORD,
  SUPERADMIN_NOMBRE: "Nombre Ficticio",
  SUPERADMIN_TELEFONO: "0000000000",
  SUPERADMIN_DOCUMENTO: DOCUMENTO,
  SUPERADMIN_TIPO_DOCUMENTO: "cedula",
};

function repoDoble(resultado: CrearSuperadminResultado = { status: "creado" }) {
  const crearSiNoExiste = vi.fn<IArranqueSuperadminRepository["crearSiNoExiste"]>(
    async () => resultado,
  );
  const repo: IArranqueSuperadminRepository = { crearSiNoExiste };
  return { repo, crearSiNoExiste };
}

function sin(variable: VariableArranqueSuperadmin): Record<string, string | undefined> {
  const entorno: Record<string, string | undefined> = { ...ENTORNO_VALIDO };
  delete entorno[variable];
  return entorno;
}

/** Todo lo que el script podria imprimir de un desenlace: el objeto y su mensaje. */
function salida(resultado: ArranqueSuperadminResultado): string {
  return JSON.stringify(resultado) + "\n" + mensajeArranqueSuperadmin(resultado);
}

function expectSinValoresSensibles(texto: string, extra: string[] = []) {
  for (const valor of [PASSWORD, EMAIL, DOCUMENTO, ...extra]) {
    expect(texto).not.toContain(valor);
  }
}

describe("ArranqueSuperadminService — entrada (R12, R13)", () => {
  it.each(VARIABLES_ARRANQUE_SUPERADMIN)(
    "sin %s responde entrada_invalida con esa variable y no llama al repositorio",
    async (variable) => {
      const { repo, crearSiNoExiste } = repoDoble();
      const resultado = await new ArranqueSuperadminService(repo).arrancar(sin(variable));

      expect(resultado).toEqual({
        status: "entrada_invalida",
        variables: [{ nombre: variable, regla: REGLA_OBLIGATORIA }],
      });
      expect(crearSiNoExiste).not.toHaveBeenCalled();
      expectSinValoresSensibles(salida(resultado));
    },
  );

  it("sin ninguna variable nombra las seis, sin valor por defecto", async () => {
    const { repo, crearSiNoExiste } = repoDoble();
    const resultado = await new ArranqueSuperadminService(repo).arrancar({});

    expect(resultado.status).toBe("entrada_invalida");
    if (resultado.status !== "entrada_invalida") return;
    expect(resultado.variables.map((v) => v.nombre)).toEqual([...VARIABLES_ARRANQUE_SUPERADMIN]);
    expect(crearSiNoExiste).not.toHaveBeenCalled();
  });

  // Valores invalidos y reconocibles: si el servicio los copiara al mensaje, el test lo veria.
  const INVALIDOS: [VariableArranqueSuperadmin, string, string][] = [
    ["SUPERADMIN_EMAIL", "correo-ficticio-sin-arroba", "Debe ser un email valido"],
    ["SUPERADMIN_PASSWORD", "debilficticia", "Debe incluir al menos un digito"],
    ["SUPERADMIN_NOMBRE", "   ", "No puede estar vacia"],
    ["SUPERADMIN_TELEFONO", "", "No puede estar vacia"],
    ["SUPERADMIN_DOCUMENTO", " \t ", "No puede estar vacia"],
    ["SUPERADMIN_TIPO_DOCUMENTO", "  ", "No puede estar vacia"],
  ];

  it.each(INVALIDOS)(
    "%s invalida responde entrada_invalida con su nombre y su regla, sin su valor",
    async (variable, valor, regla) => {
      const { repo, crearSiNoExiste } = repoDoble();
      const resultado = await new ArranqueSuperadminService(repo).arrancar({
        ...ENTORNO_VALIDO,
        [variable]: valor,
      });

      expect(resultado.status).toBe("entrada_invalida");
      if (resultado.status !== "entrada_invalida") return;
      expect(resultado.variables.every((v) => v.nombre === variable)).toBe(true);
      expect(resultado.variables).toContainEqual({ nombre: variable, regla });
      expect(crearSiNoExiste).not.toHaveBeenCalled();
      const texto = salida(resultado);
      expect(texto).toContain(variable);
      expectSinValoresSensibles(texto, valor.trim() ? [valor] : []);
    },
  );

  it("una contrasena debil se rechaza con todas las reglas que incumple de strongPasswordSchema", async () => {
    const debil = "corta";
    const { repo, crearSiNoExiste } = repoDoble();
    const resultado = await new ArranqueSuperadminService(repo).arrancar({
      ...ENTORNO_VALIDO,
      SUPERADMIN_PASSWORD: debil,
    });

    const politica = strongPasswordSchema.safeParse(debil);
    expect(politica.success).toBe(false);
    const reglas = politica.error?.issues.map((i) => i.message) ?? [];
    // Ancla literal: si la politica cambiara de forma, el test no debe seguir verde por inercia.
    expect(reglas).toEqual([
      "Debe tener al menos 8 caracteres",
      "Debe incluir al menos una letra mayuscula",
      "Debe incluir al menos un digito",
      "Debe incluir al menos un simbolo",
    ]);
    expect(resultado).toEqual({
      status: "entrada_invalida",
      variables: reglas.map((regla) => ({ nombre: "SUPERADMIN_PASSWORD", regla })),
    });
    expect(crearSiNoExiste).not.toHaveBeenCalled();
    expectSinValoresSensibles(salida(resultado), [debil]);
  });

  it("una contrasena que cumple la politica justo en el minimo se acepta", async () => {
    const { repo, crearSiNoExiste } = repoDoble();
    const resultado = await new ArranqueSuperadminService(repo).arrancar({
      ...ENTORNO_VALIDO,
      SUPERADMIN_PASSWORD: "Fic#2026",
    });

    expect(resultado).toEqual({ status: "creado" });
    expect(crearSiNoExiste).toHaveBeenCalledTimes(1);
  });

  it("las variables ajenas a las seis no llegan al repositorio", async () => {
    const { repo, crearSiNoExiste } = repoDoble();
    await new ArranqueSuperadminService(repo).arrancar({
      ...ENTORNO_VALIDO,
      DATABASE_URL: "postgres://ficticio@example.test/nada",
    });

    expect(Object.keys(crearSiNoExiste.mock.calls[0][0]).sort()).toEqual(
      ["documento", "email", "nombre", "passwordHash", "telefono", "tipoDocumento"].sort(),
    );
  });
});

describe("ArranqueSuperadminService — escritura (R12, R16)", () => {
  it("el repositorio recibe un hash bcrypt de la contrasena y nunca la contrasena en claro", async () => {
    const { repo, crearSiNoExiste } = repoDoble();
    const resultado = await new ArranqueSuperadminService(repo).arrancar(ENTORNO_VALIDO);

    expect(resultado).toEqual({ status: "creado" });
    expect(crearSiNoExiste).toHaveBeenCalledTimes(1);
    const data = crearSiNoExiste.mock.calls[0][0];
    expect(data.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(await bcrypt.compare(PASSWORD, data.passwordHash)).toBe(true);
    expect(JSON.stringify(data)).not.toContain(PASSWORD);
  });

  it("el repositorio recibe los datos recortados, con el tipo de documento tal como se pidio", async () => {
    const { repo, crearSiNoExiste } = repoDoble();
    await new ArranqueSuperadminService(repo).arrancar({
      ...ENTORNO_VALIDO,
      SUPERADMIN_EMAIL: `  ${EMAIL} `,
      SUPERADMIN_NOMBRE: " Nombre Ficticio ",
      SUPERADMIN_DOCUMENTO: ` ${DOCUMENTO}`,
    });

    expect(crearSiNoExiste.mock.calls[0][0]).toMatchObject({
      email: EMAIL,
      nombre: "Nombre Ficticio",
      telefono: "0000000000",
      documento: DOCUMENTO,
      tipoDocumento: "cedula",
    });
  });
});

describe("ArranqueSuperadminService — desenlaces del repositorio (R14, R15)", () => {
  const DEL_REPOSITORIO: CrearSuperadminResultado[] = [
    { status: "creado" },
    { status: "ya_existe" },
    { status: "conflicto", campo: "email" },
    { status: "conflicto", campo: "documento" },
    { status: "catalogo_incompleto", falta: "rol" },
    { status: "catalogo_incompleto", falta: "tipo_identificacion" },
  ];

  it.each(DEL_REPOSITORIO)("propaga $status tal cual ($campo$falta)", async (delRepo) => {
    const { repo } = repoDoble(delRepo);
    const resultado = await new ArranqueSuperadminService(repo).arrancar(ENTORNO_VALIDO);

    expect(resultado).toEqual(delRepo);
    expectSinValoresSensibles(salida(resultado));
  });

  it("si el repositorio devuelve datos de mas, no llegan al desenlace", async () => {
    const conFila = {
      status: "conflicto",
      campo: "email",
      email: EMAIL,
      cedula: DOCUMENTO,
    } as CrearSuperadminResultado;
    const { repo } = repoDoble(conFila);
    const resultado = await new ArranqueSuperadminService(repo).arrancar(ENTORNO_VALIDO);

    expect(resultado).toEqual({ status: "conflicto", campo: "email" });
    expectSinValoresSensibles(salida(resultado));
  });
});

describe("mensajes y codigo de salida del comando (R13–R16)", () => {
  const TODOS: [ArranqueSuperadminResultado, 0 | 1][] = [
    [{ status: "creado" }, 0],
    [{ status: "ya_existe" }, 0],
    [
      {
        status: "entrada_invalida",
        variables: [{ nombre: "SUPERADMIN_EMAIL", regla: "Debe ser un email valido" }],
      },
      1,
    ],
    [{ status: "conflicto", campo: "email" }, 1],
    [{ status: "conflicto", campo: "documento" }, 1],
    [{ status: "catalogo_incompleto", falta: "rol" }, 1],
    [{ status: "catalogo_incompleto", falta: "tipo_identificacion" }, 1],
  ];

  it.each(TODOS)("%j termina con codigo %i", (resultado, codigo) => {
    expect(codigoSalidaArranqueSuperadmin(resultado)).toBe(codigo);
  });

  it("entrada_invalida nombra la variable y la regla en el mensaje", () => {
    expect(
      mensajeArranqueSuperadmin({
        status: "entrada_invalida",
        variables: [{ nombre: "SUPERADMIN_TELEFONO", regla: REGLA_OBLIGATORIA }],
      }),
    ).toContain(`SUPERADMIN_TELEFONO: ${REGLA_OBLIGATORIA}`);
  });

  it("si falta catalogo, el mensaje pide correr pnpm db:seed", () => {
    for (const falta of ["rol", "tipo_identificacion"] as const) {
      expect(mensajeArranqueSuperadmin({ status: "catalogo_incompleto", falta })).toContain(
        "pnpm db:seed",
      );
    }
  });
});
