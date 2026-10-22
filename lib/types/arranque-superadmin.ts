import { z } from "zod";
import { strongPasswordSchema } from "@/lib/types/password-policy";

// SL-32 R12: las seis variables de entorno del comando `pnpm arranque:superadmin`. Ninguna tiene
// valor por defecto: un superadmin con datos inventados por el codigo seria peor que no tenerlo.
export const VARIABLES_ARRANQUE_SUPERADMIN = [
  "SUPERADMIN_EMAIL",
  "SUPERADMIN_PASSWORD",
  "SUPERADMIN_NOMBRE",
  "SUPERADMIN_TELEFONO",
  "SUPERADMIN_DOCUMENTO",
  "SUPERADMIN_TIPO_DOCUMENTO",
] as const;

export type VariableArranqueSuperadmin = (typeof VARIABLES_ARRANQUE_SUPERADMIN)[number];

// R13: la regla de una variable ausente. Fija, para que ningun mensaje de zod que describa lo
// recibido llegue a la salida.
export const REGLA_OBLIGATORIA = "Es obligatoria y no tiene valor por defecto";
const REGLA_NO_VACIA = "No puede estar vacia";
const REGLA_EMAIL = "Debe ser un email valido";

/** Entrada ya validada, con los nombres del dominio. */
export type ArranqueSuperadminInput = {
  email: string;
  password: string;
  nombre: string;
  telefono: string;
  documento: string;
  tipoDocumento: string;
};

const textoNoVacio = z.string({ error: REGLA_OBLIGATORIA }).trim().min(1, REGLA_NO_VACIA);

/**
 * Entrada del comando, tal como llega de `process.env`. Las claves ajenas se descartan. El email
 * solo se recorta, igual que el alta de `UsuarioService`; la contrasena no se toca. Que el tipo
 * de documento exista en `tipo_identificacion` lo resuelve el repositorio (`catalogo_incompleto`).
 */
export const arranqueSuperadminEnvSchema = z
  .object({
    SUPERADMIN_EMAIL: z.string({ error: REGLA_OBLIGATORIA }).trim().email(REGLA_EMAIL),
    SUPERADMIN_PASSWORD: strongPasswordSchema,
    SUPERADMIN_NOMBRE: textoNoVacio,
    SUPERADMIN_TELEFONO: textoNoVacio,
    SUPERADMIN_DOCUMENTO: textoNoVacio,
    SUPERADMIN_TIPO_DOCUMENTO: textoNoVacio,
  })
  .transform(
    (env): ArranqueSuperadminInput => ({
      email: env.SUPERADMIN_EMAIL,
      password: env.SUPERADMIN_PASSWORD,
      nombre: env.SUPERADMIN_NOMBRE,
      telefono: env.SUPERADMIN_TELEFONO,
      documento: env.SUPERADMIN_DOCUMENTO,
      tipoDocumento: env.SUPERADMIN_TIPO_DOCUMENTO,
    }),
  );

export type VariableInvalida = { nombre: VariableArranqueSuperadmin; regla: string };

export type CampoEnConflicto = "email" | "documento";
export type CatalogoFaltante = "rol" | "tipo_identificacion";

/** Desenlaces del comando (`design.md > Desenlaces`). Ninguno lleva un valor recibido (R16). */
export type ArranqueSuperadminResultado =
  | { status: "creado" }
  | { status: "ya_existe" }
  | { status: "entrada_invalida"; variables: VariableInvalida[] }
  | { status: "conflicto"; campo: CampoEnConflicto }
  | { status: "catalogo_incompleto"; falta: CatalogoFaltante };

/** R14 y R17: crear y encontrar el que ya existe terminan en 0; el resto, en 1. */
export function codigoSalidaArranqueSuperadmin(resultado: ArranqueSuperadminResultado): 0 | 1 {
  return resultado.status === "creado" || resultado.status === "ya_existe" ? 0 : 1;
}

const NOMBRE_CAMPO: Record<CampoEnConflicto, string> = {
  email: "El email",
  documento: "El documento de identidad",
};

/**
 * Mensaje fijo de cada desenlace. Nombra la variable, la regla o el campo, nunca un valor: ni la
 * contrasena, ni el email, ni el documento (R13 y R16).
 */
export function mensajeArranqueSuperadmin(resultado: ArranqueSuperadminResultado): string {
  switch (resultado.status) {
    case "creado":
      return "Superadmin creado.";
    case "ya_existe":
      return "Ya existe un superadmin. No se ha cambiado nada.";
    case "entrada_invalida":
      return [
        "Variables de entorno invalidas. No se ha escrito nada.",
        ...resultado.variables.map((v) => `- ${v.nombre}: ${v.regla}`),
      ].join("\n");
    case "conflicto":
      return `${NOMBRE_CAMPO[resultado.campo]} ya pertenece a otro usuario. No se ha escrito nada.`;
    case "catalogo_incompleto":
      return resultado.falta === "rol"
        ? "Falta el rol superadmin en el catalogo. Corre `pnpm db:seed` y vuelve a intentarlo."
        : "El tipo de documento de SUPERADMIN_TIPO_DOCUMENTO no esta en el catalogo tipo_identificacion. Corre `pnpm db:seed` o usa un tipo del catalogo.";
  }
}
