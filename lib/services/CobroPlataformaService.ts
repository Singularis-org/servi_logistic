import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import type { ICobroPlataformaTarifaRepository } from "@/lib/interfaces/repositories/ICobroPlataformaTarifaRepository";
import type { ICobroPlataformaService } from "@/lib/interfaces/services/ICobroPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  fijarCobroEmpresaSchema,
  fijarCobroGlobalSchema,
  type FijarCobroResult,
  type VerCobroGlobalResult,
} from "@/lib/types/cobro-plataforma";

// SL-40 (design §5, §6) — el orden es fijo y es parte del contrato: primero quién (R6), luego qué
// (R4), luego si la empresa existe (R7), y al final la escritura. Así un rol de empresa no llega a
// la base ni siquiera para recibir un error de validación.

function validationError(error: z.ZodError): FijarCobroResult {
  return { status: "validation_error", fieldErrors: error.flatten().fieldErrors as Record<string, string[]> };
}

function esSuperadmin(actor: Actor | null): boolean {
  return actor !== null && esPlataforma(actor.rol);
}

export class CobroPlataformaService implements ICobroPlataformaService {
  constructor(private readonly tarifas: ICobroPlataformaTarifaRepository) {}

  async verGlobal(actor: Actor | null): Promise<VerCobroGlobalResult> {
    if (!esSuperadmin(actor)) return { status: "forbidden" };
    return { status: "ok", cobroGlobal: { monto: await this.tarifas.leerGlobal() } };
  }

  async fijarGlobal(actor: Actor | null, input: unknown): Promise<FijarCobroResult> {
    if (!esSuperadmin(actor)) return { status: "forbidden" };
    const parsed = fijarCobroGlobalSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await this.tarifas.fijarGlobal(parsed.data.monto);
    return { status: "ok" };
  }

  async fijarDeEmpresa(actor: Actor | null, input: unknown): Promise<FijarCobroResult> {
    if (!esSuperadmin(actor)) return { status: "forbidden" };
    const parsed = fijarCobroEmpresaSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const { organizacionId, monto } = parsed.data;
    if (!(await this.tarifas.existeEmpresa(organizacionId))) return { status: "not_found" };
    const escrita = await this.tarifas.fijarDeEmpresa(organizacionId, monto);
    return escrita ? { status: "ok" } : { status: "not_found" };
  }
}
