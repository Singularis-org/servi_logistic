import type { BugReportStatus } from "@prisma/client";

import { esPlataforma } from "@/lib/auth/plataforma";
import { ENLACE_DETALLE_SEGUNDOS } from "@/lib/config/reporte-bug";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { IAlmacenImagenesReporte } from "@/lib/interfaces/external/IAlmacenImagenesReporte";
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
  type ImagenDelReporteDTO,
  type ReporteDetalleDatos,
} from "@/lib/types/reporte-bug";

// SLT-97 (design §3, §4; R2, R4, R5, R7–R11, R17, R18, R20) — el módulo de reportes del superadmin.
//
// La puerta de la action es la primera, no la única: aquí se vuelve a mirar que el actor sea de la
// plataforma (R2). El constructor solo recibe el repositorio: no hay emisor de correo ni cola, así que
// un cambio de estado no puede avisar a nadie (R4).
// SLT-98 (design §7; R22, R23): y el almacén de imágenes, solo para firmar los enlaces del detalle.
// Sigue sin emisor ni cola.
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
  constructor(
    private readonly repo: IBugReportRepository,
    private readonly almacen: IAlmacenImagenesReporte,
    private readonly log: (linea: string) => void = (linea) => console.error(linea),
  ) {}

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
    // SLT-98 (design §6): la ruta y la empresa no cruzan al navegador.
    const { organizacionId, imagenes, ...reporte } = d.reporte;
    return {
      status: "ok",
      reporte: {
        ...reporte,
        destinosPermitidos: [...TRANSICIONES_REPORTE[reporte.estado]],
        imagenes: await this.enlacesDe(reporte.id, organizacionId, imagenes),
      },
      historial: d.historial,
    };
  }

  /**
   * R22, R23. Enlaces nuevos en cada llamada, que vencen en `ENLACE_DETALLE_SEGUNDOS` (P3). El superadmin
   * no tiene empresa y el adaptador trabaja en la carpeta de la del contexto: se abre con la del reporte,
   * que sale de la base y no de la entrada (design §7). Un fallo al firmar deja todas las `url` en `null`
   * y el detalle se pinta igual; una ruta que el almacén no firmó, solo esa.
   */
  private async enlacesDe(
    reporteId: string,
    organizacionId: string,
    imagenes: ReporteDetalleDatos["imagenes"],
  ): Promise<ImagenDelReporteDTO[]> {
    if (imagenes.length === 0) return [];
    let firmadas: Record<string, string> = {};
    try {
      firmadas = await conEmpresa(organizacionId, () =>
        this.almacen.firmar(
          imagenes.map((i) => i.ruta),
          ENLACE_DETALLE_SEGUNDOS,
        ),
      );
    } catch (e) {
      const causa = e instanceof Error ? e.name : "desconocido";
      this.log(`[reportes-bug-plataforma] fallo al firmar imagenes reporte=${reporteId} causa=${causa}`);
    }
    return imagenes.map((i) => ({ id: i.id, url: firmadas[i.ruta] ?? null }));
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
