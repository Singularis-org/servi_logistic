import { randomBytes } from "node:crypto";
import type { z } from "zod";

import type { IOrganizacionRepository } from "@/lib/interfaces/repositories/IOrganizacionRepository";
import type { IOrganizacionService } from "@/lib/interfaces/services/IOrganizacionService";
import { altaEmpresaInputSchema, type AltaEmpresaResultado } from "@/lib/types/organizacion";
import { hashPassword } from "@/lib/utils/password";

/**
 * SL-17 (design §7.7, R44–R46) — el alta de una empresa con su primer maestro.
 *
 * El maestro nace sin contraseña utilizable: `usuario.password_hash` es NOT NULL, así que se
 * guarda el hash de un secreto aleatorio que nadie conoce. Pasa por el MISMO hasher del login
 * para que la fila tenga la forma de siempre y ningún camino la trate como especial. El maestro
 * fija la suya con «recuperar contraseña» (`PasswordResetService`), que no mira el estado.
 */
export class OrganizacionService implements IOrganizacionService {
  constructor(private readonly repo: IOrganizacionRepository) {}

  async altaEmpresa(input: unknown): Promise<AltaEmpresaResultado> {
    const validada = altaEmpresaInputSchema.safeParse(input);
    if (!validada.success) return { estado: "invalida", campo: campoRechazado(validada.error) };

    const passwordHash = await hashNoUtilizable();
    const { maestro, ...empresa } = validada.data;
    return this.repo.altaEmpresa({ ...empresa, maestro: { ...maestro, passwordHash } });
  }
}

// 32 bytes de `crypto.randomBytes`: el secreto vive solo en esta función. No se devuelve, no se
// registra y no entra en ningún error; en cuanto se hashea, nadie puede reproducirlo.
async function hashNoUtilizable(): Promise<string> {
  return hashPassword(randomBytes(32).toString("base64url"));
}

/** La ruta del primer dato rechazado, para que la pantalla señale el campo (R46). */
function campoRechazado(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "entrada";
  // Un campo de más (`.strict()`) se nombra a sí mismo, no al objeto que lo contiene.
  const extra = issue.code === "unrecognized_keys" ? issue.keys[0] : undefined;
  const ruta = [...issue.path, ...(extra ? [extra] : [])].map(String);
  return ruta.length > 0 ? ruta.join(".") : "entrada";
}
