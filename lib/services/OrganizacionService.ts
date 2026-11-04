import { randomBytes } from "node:crypto";
import type { z } from "zod";

import type { IOrganizacionRepository } from "@/lib/interfaces/repositories/IOrganizacionRepository";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { IOrganizacionService } from "@/lib/interfaces/services/IOrganizacionService";
import { validarPersonaDelPais } from "@/lib/services/validacion-documento-telefono";
import {
  altaEmpresaInputSchema,
  type AltaEmpresaInput,
  type AltaEmpresaResultado,
} from "@/lib/types/organizacion";
import type { PaisDTO } from "@/lib/types/pais";
import { hashPassword } from "@/lib/utils/password";

/** SLT-42: lo que el alta lee del país elegido. Corre en plataforma: no hay empresa de la que sacarlo. */
export type PaisesDelAlta = Pick<IPaisRepository, "porId" | "tipoDocumentoDelPais" | "tieneTipoDocumentoActivo">;

/** SLT-42: el campo de cada dato del maestro en `{ estado: "invalida", campo }`. */
const CAMPOS_DEL_MAESTRO = {
  telefono: "maestro.telefono",
  documento: "maestro.documento",
  tipo: "maestro.tipoDocumento",
} as const;

/**
 * SL-17 (design §7.7, R44–R46) — el alta de una empresa con su primer maestro.
 *
 * El maestro nace sin contraseña utilizable: `usuario.password_hash` es NOT NULL, así que se
 * guarda el hash de un secreto aleatorio que nadie conoce. Pasa por el MISMO hasher del login
 * para que la fila tenga la forma de siempre y ningún camino la trate como especial. El maestro
 * fija la suya con «recuperar contraseña» (`PasswordResetService`), que no mira el estado.
 */
export class OrganizacionService implements IOrganizacionService {
  constructor(
    private readonly repo: IOrganizacionRepository,
    // SLT-42 (R6, R10, R11, R14-R16): el país elegido y sus tipos de documento.
    private readonly paises: PaisesDelAlta,
  ) {}

  async altaEmpresa(input: unknown): Promise<AltaEmpresaResultado> {
    const validada = altaEmpresaInputSchema.safeParse(input);
    if (!validada.success) return { estado: "invalida", campo: campoRechazado(validada.error) };

    // SLT-42: todo lo que depende del país se decide antes de hashear y de escribir nada.
    const conElPais = await this.validarConElPais(validada.data);
    if (!conElPais.ok) return { estado: "invalida", campo: conElPais.campo };

    const passwordHash = await hashNoUtilizable();
    const { maestro, ...empresa } = validada.data;
    return this.repo.altaEmpresa({ ...empresa, maestro: { ...maestro, ...conElPais.maestro, passwordHash } });
  }

  /**
   * SLT-42 (R6): el país tiene que tener todo lo que necesita una empresa para funcionar. Después,
   * R10, R11, R14-R16 del maestro con las reglas de ESE país. Si falla, el primer campo rechazado:
   * el contrato del alta señala uno solo.
   */
  private async validarConElPais(
    entrada: AltaEmpresaInput,
  ): Promise<
    | { ok: true; maestro: Pick<AltaEmpresaInput["maestro"], "telefono" | "documento" | "tipoDocumento"> }
    | { ok: false; campo: string }
  > {
    const pais = await this.paises.porId(entrada.paisId);
    // Un país que no existe también es `paisId`, como lo respondía el repositorio (SL-20 R6).
    if (pais === null || paisIncompleto(pais) || !(await this.paises.tieneTipoDocumentoActivo(pais.id))) {
      return { ok: false, campo: "paisId" };
    }

    const { maestro } = entrada;
    const tipo = await this.paises.tipoDocumentoDelPais(pais.id, maestro.tipoDocumento);
    const r = validarPersonaDelPais(
      pais.id,
      { telefono: maestro.telefono, documento: maestro.documento, tipo },
      CAMPOS_DEL_MAESTRO,
    );
    if (!r.ok) return { ok: false, campo: Object.keys(r.fieldErrors)[0] ?? CAMPOS_DEL_MAESTRO.tipo };
    // El repositorio busca el tipo por `value`; se le pasa el del tipo resuelto aunque llegara el `id`.
    return { ok: true, maestro: { telefono: r.telefono, documento: r.documento, tipoDocumento: r.tipo.value } };
  }
}

/** R6: sin prefijo, sin dígitos nacionales o sin zona, el país aún no admite empresas (SLT-81 los carga). */
function paisIncompleto(pais: PaisDTO): boolean {
  return pais.prefijoTelefonico === null || pais.telefonoDigitosNacionales === null || pais.zonaHoraria === null;
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
