import type { BugReportStatus } from "@prisma/client";

import { esPlataforma } from "@/lib/auth/plataforma";
import type { IBugReportRepository } from "@/lib/interfaces/repositories/IBugReportRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  CambiarEstadoReporteServiceResult,
  IReportesBugPlataformaService,
  ListarReportesServiceResult,
  VerReporteServiceResult,
} from "@/lib/interfaces/services/IReportesBugPlataformaService";
import {
  ESTADOS_PENDIENTES,
  REPORTES_POR_PAGINA,
  TRANSICIONES_REPORTE,
  type CambiarEstadoReporteInput,
  type FiltroEstadoReporte,
  type FiltrosReportes,
} from "@/lib/types/reporte-bug";

// SLT-97 (design §3, §4; R2, R4, R5, R7–R11, R17, R18, R20) — el módulo de reportes del superadmin.
//
// La puerta de la action es la primera, no la única: aquí se vuelve a mirar que el actor sea de la
// plataforma (R2). El constructor solo recibe el repositorio: no hay emisor de correo ni cola, así que
// un cambio de estado no puede avisar a nadie (R4).
//
// La transición se comprueba DENTRO de la transacción del repositorio, no aquí con una lectura previa:
// esa ventana dejaría pasar dos cambios a la vez desde dos pestañas (design §4).

const FORBIDDEN = { status: "forbidden" } as const;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

function estadosDe(filtro: FiltroEstadoReporte): readonly BugReportStatus[] | null {
  if (filtro === "pendientes") return ESTADOS_PENDIENTES;
  if (filtro === "todos") return null;
  return [filtro];
}

/** `AAAA-MM-DD` (ya validado) a las 00:00 UTC de ese día, sin depender de la zona del proceso (§7). */
function inicioDelDiaUtc(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export class ReportesBugPlataformaService implements IReportesBugPlataformaService {
  constructor(private readonly repo: IBugReportRepository) {}

  async listar(actor: Actor, filtros: FiltrosReportes): Promise<ListarReportesServiceResult> {
    if (!esPlataforma(actor.rol)) return FORBIDDEN;
    const consulta = {
      estados: estadosDe(filtros.estado),
      organizationId: filtros.empresa ?? null,
      desde: filtros.desde ? inicioDelDiaUtc(filtros.desde) : null,
      // R9: «Hasta» incluye el día entero, así que el corte es el inicio del día siguiente.
      hastaExclusivo: filtros.hasta ? new Date(inicioDelDiaUtc(filtros.hasta).getTime() + UN_DIA_MS) : null,
      tamano: REPORTES_POR_PAGINA,
    };
    const pedida = Math.max(1, filtros.pagina);
    const primera = await this.repo.listar({ ...consulta, pagina: pedida });
    // R11: el total llega con la primera lectura; solo si la página pedida pasa de la última se lee otra.
    const ultima = Math.max(1, Math.ceil(primera.total / REPORTES_POR_PAGINA));
    if (pedida <= ultima) return { status: "ok", items: primera.filas, total: primera.total, pagina: pedida };
    const recortada = await this.repo.listar({ ...consulta, pagina: ultima });
    return { status: "ok", items: recortada.filas, total: recortada.total, pagina: ultima };
  }

  async detalle(actor: Actor, reporteId: string): Promise<VerReporteServiceResult> {
    if (!esPlataforma(actor.rol)) return FORBIDDEN;
    const d = await this.repo.detalle(reporteId);
    if (d === null) return { status: "not_found" };
    // SLT-98: la ruta y la empresa no cruzan al navegador. La firma de las imágenes llega con T8.
    const { organizacionId: _empresa, imagenes, ...reporte } = d.reporte;
    return {
      status: "ok",
      reporte: {
        ...reporte,
        destinosPermitidos: [...TRANSICIONES_REPORTE[reporte.estado]],
        imagenes: imagenes.map((i) => ({ id: i.id, url: null })),
      },
      historial: d.historial,
    };
  }

  async cambiarEstado(actor: Actor, entrada: CambiarEstadoReporteInput): Promise<CambiarEstadoReporteServiceResult> {
    if (!esPlataforma(actor.rol)) return FORBIDDEN;
    const r = await this.repo.cambiarEstado({
      reporteId: entrada.reporteId,
      destino: entrada.estado,
      // R20: la nota llega recortada por el zod; vacía es «sin nota».
      nota: entrada.nota === "" ? null : entrada.nota,
      actorUsuarioId: actor.usuarioId,
    });
    if (r.resultado === "ok") return { status: "ok", estado: entrada.estado };
    if (r.resultado === "transicion_invalida") return { status: "transicion_invalida", actual: r.actual };
    return { status: "not_found" };
  }
}
