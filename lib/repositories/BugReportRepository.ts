import type { BugReportStatus, Prisma, PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type {
  ConsultaDeReportes,
  DetalleDeReporte,
  IBugReportRepository,
  PaginaDeReportes,
  PedidoDeCambioDeEstado,
  ResultadoDeCambioDeEstado,
} from "@/lib/interfaces/repositories/IBugReportRepository";
import {
  resumenDeDescripcion,
  TRANSICIONES_REPORTE,
  type BugReportCreado,
  type NuevoBugReport,
} from "@/lib/types/reporte-bug";
import { NOMBRE_USUARIO_SELECT, nombreCompletoUsuario } from "@/lib/utils/nombre-usuario";

export type BugReportPrismaClient = Pick<PrismaClient, "$transaction">;

// SLT-87 (design §2.3, §6; R11, R13, R14) — el único punto que escribe `bug_report`.
// SLT-97 (design §5; R13–R15, R17, R18, R21, R23) — y el único que lo lee y escribe su historial.
//
// Corre en `comoPlataforma`, como dueño: `servi_app` no tiene ningún privilegio sobre las dos tablas, y
// en contexto de empresa la extensión envolvería también estos modelos de plataforma y los bajaría a
// `servi_app` (42501). Por eso el archivo está en `EXCEPCIONES_DE_PLATAFORMA`.
//
// Sin el filtro de la extensión, el filtro de empresa va escrito: el usuario se busca con su id Y la
// empresa de la sesión. Si no está ahí, no se escribe nada y el servicio responde `forbidden`. Las
// lecturas del superadmin cruzan empresas a propósito: es la plataforma la que las lee.
//
// El historial solo se crea: aquí no hay ningún `update` ni `delete` de `bugReportStatusChange`, y la
// base los rechaza con SL097 aunque llegaran (R23).

const FICHA = "SL-17";
const MOTIVO =
  "SLT-87: guardar un reporte de problema en `bug_report`, tabla de plataforma que la empresa no puede leer ni escribir; la empresa sale de la sesión, no del cliente (R13, R14)";
const MOTIVO_LEER =
  "SLT-97: el superadmin lee los reportes de problema de todas las empresas en `bug_report` y su historial, tablas de plataforma (R3)";
const MOTIVO_ESTADO =
  "SLT-97: el superadmin cambia el estado de un reporte de problema y deja su entrada en `bug_report_status_change`, tablas de plataforma (R3, R21)";

/** El ancho de `bug_report.reporter_name` y de `bug_report_status_change.actor_name`. */
const NOMBRE_MAX = 120;

/** Si el superadmin ya no está en `usuario` (no debería), la entrada no puede quedar sin autor. */
const ACTOR_DESCONOCIDO = "Superadmin";

/** Del más reciente al más antiguo; el id desempata, como el índice `(created_at DESC, id)`. */
const ORDEN_LISTADO = [{ createdAt: "desc" }, { id: "asc" }] satisfies Prisma.BugReportOrderByWithRelationInput[];
const ORDEN_HISTORIAL = [
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.BugReportStatusChangeOrderByWithRelationInput[];

function whereDeConsulta(c: ConsultaDeReportes): Prisma.BugReportWhereInput {
  return {
    deletedAt: null,
    ...(c.estados !== null ? { status: { in: [...c.estados] } } : {}),
    ...(c.organizationId !== null ? { organizationId: c.organizationId } : {}),
    ...(c.desde !== null || c.hastaExclusivo !== null
      ? {
          createdAt: {
            ...(c.desde !== null ? { gte: c.desde } : {}),
            ...(c.hastaExclusivo !== null ? { lt: c.hastaExclusivo } : {}),
          },
        }
      : {}),
  };
}

function permite(actual: BugReportStatus, destino: BugReportStatus): boolean {
  return TRANSICIONES_REPORTE[actual].includes(destino);
}

export class BugReportRepository implements IBugReportRepository {
  constructor(private readonly prisma: BugReportPrismaClient) {}

  crear(datos: NuevoBugReport): Promise<BugReportCreado | null> {
    return comoPlataforma(FICHA, MOTIVO, () =>
      this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.findFirst({
          where: { id: datos.reporterUserId, organizacionId: datos.organizationId },
          select: { ...NOMBRE_USUARIO_SELECT, email: true },
        });
        if (!usuario) return null;
        const empresa = await tx.organizacion.findUnique({
          where: { id: datos.organizationId },
          select: { nombre: true },
        });
        if (!empresa) return null;

        const fila = await tx.bugReport.create({
          data: { ...datos, reporterName: nombreCompletoUsuario(usuario).slice(0, NOMBRE_MAX) },
          select: { id: true, createdAt: true, reporterName: true },
        });
        return {
          id: fila.id,
          createdAt: fila.createdAt,
          description: datos.description,
          reporterName: fila.reporterName,
          reporterEmail: usuario.email,
          organizationName: empresa.nombre,
          reporterRole: datos.reporterRole,
          pagePath: datos.pagePath,
          userAgent: datos.userAgent,
          viewportWidth: datos.viewportWidth,
          viewportHeight: datos.viewportHeight,
          isStandalone: datos.isStandalone,
        };
      }),
    );
  }

  listar(c: ConsultaDeReportes): Promise<PaginaDeReportes> {
    const where = whereDeConsulta(c);
    return comoPlataforma(FICHA, MOTIVO_LEER, () =>
      this.prisma.$transaction(async (tx) => {
        const total = await tx.bugReport.count({ where });
        const filas = await tx.bugReport.findMany({
          where,
          orderBy: ORDEN_LISTADO,
          skip: (c.pagina - 1) * c.tamano,
          take: c.tamano,
          select: {
            id: true,
            createdAt: true,
            status: true,
            reporterName: true,
            reporterRole: true,
            description: true,
            organization: { select: { nombre: true } },
          },
        });
        return {
          total,
          // La descripción se recorta aquí: el cliente no recibe el texto entero de 25 filas (design §5).
          filas: filas.map((f) => ({
            id: f.id,
            creadoEn: f.createdAt.toISOString(),
            estado: f.status,
            empresa: f.organization.nombre,
            usuario: f.reporterName,
            rol: f.reporterRole,
            resumen: resumenDeDescripcion(f.description),
          })),
        };
      }),
    );
  }

  detalle(id: string): Promise<DetalleDeReporte | null> {
    return comoPlataforma(FICHA, MOTIVO_LEER, () =>
      this.prisma.$transaction(async (tx) => {
        const r = await tx.bugReport.findFirst({
          where: { id, deletedAt: null },
          include: {
            organization: { select: { nombre: true } },
            reporter: { select: { email: true } },
            statusChanges: { orderBy: ORDEN_HISTORIAL },
          },
        });
        if (!r) return null;
        return {
          reporte: {
            id: r.id,
            descripcion: r.description,
            empresa: r.organization.nombre,
            usuario: r.reporterName,
            correo: r.reporter.email,
            rol: r.reporterRole,
            pagina: r.pagePath,
            navegador: r.userAgent,
            ventana:
              r.viewportWidth !== null && r.viewportHeight !== null
                ? { ancho: r.viewportWidth, alto: r.viewportHeight }
                : null,
            appInstalada: r.isStandalone,
            creadoEn: r.createdAt.toISOString(),
            estado: r.status,
          },
          historial: r.statusChanges.map((h) => ({
            id: h.id,
            desde: h.fromStatus,
            hacia: h.toStatus,
            nota: h.note,
            actor: h.actorName,
            creadoEn: h.createdAt.toISOString(),
          })),
        };
      }),
    );
  }

  cambiarEstado(p: PedidoDeCambioDeEstado): Promise<ResultadoDeCambioDeEstado> {
    return comoPlataforma(FICHA, MOTIVO_ESTADO, () =>
      this.prisma.$transaction(async (tx): Promise<ResultadoDeCambioDeEstado> => {
        const leer = () =>
          tx.bugReport.findFirst({ where: { id: p.reporteId, deletedAt: null }, select: { status: true } });
        const fila = await leer();
        if (!fila) return { resultado: "not_found" };
        const actual = fila.status;
        if (!permite(actual, p.destino)) return { resultado: "transicion_invalida", actual };

        // UPDATE condicionado al estado leído: si otra pestaña lo cambió entre medias, no toca nada y se
        // responde con el estado que dejó, sin cerrojo explícito (design §5).
        const { count } = await tx.bugReport.updateMany({
          where: { id: p.reporteId, status: actual, deletedAt: null },
          data: { status: p.destino },
        });
        if (count === 0) {
          const ahora = await leer();
          return ahora ? { resultado: "transicion_invalida", actual: ahora.status } : { resultado: "not_found" };
        }

        const usuario = await tx.usuario.findUnique({ where: { id: p.actorUsuarioId }, select: NOMBRE_USUARIO_SELECT });
        const actorName = usuario ? nombreCompletoUsuario(usuario).slice(0, NOMBRE_MAX) : ACTOR_DESCONOCIDO;
        // Si esta escritura falla, la transacción deshace el UPDATE de arriba (R21).
        await tx.bugReportStatusChange.create({
          data: {
            bugReportId: p.reporteId,
            fromStatus: actual,
            toStatus: p.destino,
            note: p.nota,
            actorUserId: p.actorUsuarioId,
            actorName,
          },
          select: { id: true },
        });
        return { resultado: "ok" };
      }),
    );
  }
}
