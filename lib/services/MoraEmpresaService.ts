import type { z } from "zod";

import { esAccesoTotal } from "@/lib/auth/acceso-total";
import { esPlataforma } from "@/lib/auth/plataforma";
import { diasDeGraciaGlobal } from "@/lib/config/factura-gracia";
import type { IMoraEmpresaRepository } from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import type { IMoraEmpresaService } from "@/lib/interfaces/services/IMoraEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaCalendarioPlataforma } from "@/lib/planes/ciclo";
import { HASTA_MAX_DIAS, MORA_TEXTOS, estadoDeMora, estaVencida, type EstadoMora } from "@/lib/planes/mora";
import {
  descongelarSchema,
  fijarGraciaSchema,
  moraDeEmpresaSchema,
  type DescongelarResult,
  type FijarGraciaResult,
  type MoraDeEmpresaResult,
} from "@/lib/types/mora";
import { sumarDiasCalendario } from "@/lib/utils/calendario-zona";

// SLT-121 (design §5.3) — el orden es parte del contrato, como en `PagoPlataformaConfirmacionService`: primero quién
// (R4: ningún rol de empresa llega a la base, ni para un error de validación), luego qué (zod), y al final el
// repositorio. Las reglas del congelamiento las decide la base; aquí solo el rango de las entradas.
//
// `not_found` antes de escribir: `fijarGracia` del repositorio lanza sin empresa y `descongelarAMano` respondería
// `no_congelada`, que a la pantalla le diría algo falso.

const FORBIDDEN = { estado: "forbidden" } as const;
const NOT_FOUND = { estado: "not_found" } as const;
const ERRORES = MORA_TEXTOS.plataforma.errores;

/** El valor por defecto de la fecha hasta del diálogo «Descongelar» (design §7.2). */
const HASTA_POR_DEFECTO_DIAS = 7;

function esSuperadmin(actor: Actor | null): actor is Actor {
  return actor !== null && esPlataforma(actor.rol);
}

/** Un mensaje por campo; el texto es el de la pantalla, no el de zod. */
function erroresDeCampo(error: z.ZodError): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "_");
    errores[campo] ??= campo in ERRORES ? ERRORES[campo as keyof typeof ERRORES] : issue.message;
  }
  return errores;
}

/** Hoy y hoy + 60, calendario de la plataforma (decisión P4). */
function rangoDeDescongelar(ahora: Date) {
  const desde = fechaCalendarioPlataforma(ahora);
  return {
    desde,
    hasta: sumarDiasCalendario(desde, HASTA_MAX_DIAS),
    porDefecto: sumarDiasCalendario(desde, HASTA_POR_DEFECTO_DIAS),
  };
}

export class MoraEmpresaService implements IMoraEmpresaService {
  constructor(
    private readonly repo: IMoraEmpresaRepository,
    private readonly ahora: () => Date = () => new Date(),
    private readonly graciaGlobal: () => number = diasDeGraciaGlobal,
  ) {}

  async avisoDeMiEmpresa(actor: Actor | null): Promise<EstadoMora | null> {
    // R24: solo maestro y admin de una empresa; el superadmin no es de acceso total y no tiene empresa.
    if (actor === null || !esAccesoTotal(actor.rol)) return null;
    const ahora = this.ahora();
    const mora = await this.repo.moraDeLaEmpresa(ahora, this.graciaGlobal());
    return estadoDeMora(mora, mora.facturas, ahora);
  }

  async moraDeEmpresa(actor: Actor | null, input: unknown): Promise<MoraDeEmpresaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = moraDeEmpresaSchema.safeParse(input);
    // Un id que no es un uuid no nombra ninguna empresa (igual en las escrituras).
    if (!parsed.success) return NOT_FOUND;
    const { organizacionId } = parsed.data;
    if (!(await this.repo.existeEmpresa(organizacionId))) return NOT_FOUND;

    const ahora = this.ahora();
    const global = this.graciaGlobal();
    const mora = await this.repo.moraParaPlataforma(organizacionId, ahora, global);
    const facturas = mora.facturas.map((f) => ({
      facturaId: f.facturaId,
      numero: f.numero,
      fechaLimite: f.fechaLimite,
      saldo: f.saldo,
      vencida: estaVencida(f, ahora),
    }));
    return {
      estado: "ok",
      datos: {
        gracia: {
          dias: mora.graciaPropia ?? global,
          origen: mora.graciaPropia === null ? "global" : "propia",
          propia: mora.graciaPropia,
          global,
        },
        estado: estadoDeMora(mora, mora.facturas, ahora),
        facturas,
        facturasVencidas: facturas
          .filter((f) => f.vencida)
          .map((f) => ({ facturaId: f.facturaId, numero: f.numero, fechaLimite: f.fechaLimite, saldo: f.saldo })),
        descongelar: rangoDeDescongelar(ahora),
        historial: mora.historial,
      },
    };
  }

  async fijarGracia(actor: Actor | null, input: unknown): Promise<FijarGraciaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    if (!moraDeEmpresaSchema.safeParse(input).success) return NOT_FOUND;
    const parsed = fijarGraciaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error) };
    const { organizacionId, dias } = parsed.data;
    if (!(await this.repo.existeEmpresa(organizacionId))) return NOT_FOUND;

    const r = await this.repo.fijarGracia(organizacionId, dias, actor.usuarioId, this.ahora(), this.graciaGlobal());
    return { estado: r };
  }

  async descongelar(actor: Actor | null, input: unknown): Promise<DescongelarResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    if (!moraDeEmpresaSchema.safeParse(input).success) return NOT_FOUND;
    const parsed = descongelarSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error) };
    const { organizacionId, motivo, hasta } = parsed.data;

    // Decisión P4: el rango es del calendario de la plataforma, con el mismo «ahora» que la escritura.
    const ahora = this.ahora();
    const rango = rangoDeDescongelar(ahora);
    if (hasta < rango.desde || hasta > rango.hasta) {
      return { estado: "validation_error", errores: { hasta: ERRORES.hasta } };
    }
    if (!(await this.repo.existeEmpresa(organizacionId))) return NOT_FOUND;

    const r = await this.repo.descongelarAMano(organizacionId, hasta, motivo, actor.usuarioId, ahora);
    return { estado: r };
  }
}
