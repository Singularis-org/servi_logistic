import type { z } from "zod";

import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";
import { esPlataforma } from "@/lib/auth/plataforma";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import type { IFacturaPlataformaService } from "@/lib/interfaces/services/IFacturaPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  type DetalleDeFactura,
  type DetalleFacturaResult,
  type FacturaPlataformaDTO,
  type FacturasResult,
  detalleFacturaEmpresaSchema,
  detalleFacturaSchema,
  facturasDeEmpresaSchema,
} from "@/lib/types/factura-plataforma";

// SLT-119 (design §4) — las facturas de la plataforma, por empresa. Orden de cada método: actor → `forbidden`
// (R13); esquema → `validation_error` (R15); repositorio → `null` = `not_found` (R14). Ninguno de los dos
// rechazos llega al repositorio. Los errores de la base se propagan: los aísla la página (R17).
//
// El maestro (`ROLES_MI_PLAN`, SLT-91) ve las de su empresa, la de la sesión; el superadmin (`esPlataforma`) las
// de la empresa que nombra. Ninguno entra por la vía del otro: `ROLES_MI_PLAN` no tiene al superadmin.

const FORBIDDEN = { estado: "forbidden" } as const;
const NOT_FOUND = { estado: "not_found" } as const;

function esMaestro(actor: Actor | null): actor is Actor {
  return actor !== null && (ROLES_MI_PLAN as readonly string[]).includes(actor.rol);
}

function esSuperadmin(actor: Actor | null): actor is Actor {
  return actor !== null && esPlataforma(actor.rol);
}

/** Campo → primer mensaje (design §3). */
function errores(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.length > 0 ? issue.path.join(".") : "_";
    campos[clave] ??= issue.message;
  }
  return campos;
}

/** R1: el repositorio las da por `desde` ascendente (las no cerradas al final); se muestran al revés. */
const masRecientePrimero = (facturas: FacturaPlataformaDTO[]): FacturaPlataformaDTO[] => [...facturas].reverse();

function detalle(leido: DetalleDeFactura | null): DetalleFacturaResult {
  return leido === null ? NOT_FOUND : { estado: "ok", detalle: leido };
}

export class FacturaPlataformaService implements IFacturaPlataformaService {
  constructor(private readonly repo: IFacturaPlataformaRepository) {}

  async deMiEmpresa(actor: Actor | null): Promise<FacturasResult> {
    if (!esMaestro(actor)) return FORBIDDEN;
    return { estado: "ok", facturas: masRecientePrimero(await this.repo.deLaEmpresa()) };
  }

  async detalleDeMiEmpresa(actor: Actor | null, input: unknown): Promise<DetalleFacturaResult> {
    if (!esMaestro(actor)) return FORBIDDEN;
    const parsed = detalleFacturaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: errores(parsed.error) };
    return detalle(await this.repo.detalleDeLaEmpresa(parsed.data.facturaId, parsed.data.pagina));
  }

  async deEmpresa(actor: Actor | null, input: unknown): Promise<FacturasResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    // `FacturasResult` no tiene `validation_error` (design §3): una empresa que no es uuid lanza sin leer.
    const { organizacionId } = facturasDeEmpresaSchema.parse(input);
    return { estado: "ok", facturas: masRecientePrimero(await this.repo.deEmpresaParaPlataforma(organizacionId)) };
  }

  async detalleDeEmpresa(actor: Actor | null, input: unknown): Promise<DetalleFacturaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = detalleFacturaEmpresaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: errores(parsed.error) };
    const { organizacionId, facturaId, pagina } = parsed.data;
    return detalle(await this.repo.detalleParaPlataforma(organizacionId, facturaId, pagina));
  }
}
