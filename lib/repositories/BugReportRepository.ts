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
import type { ICupoImagenesReporte } from "@/lib/interfaces/repositories/ICupoImagenesReporte";
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
// SLT-98 (design §2.4, §7; R13, R18, R22) — y el único que escribe y lee `bug_report_image`: solo la
// crea con su reporte, en la misma transacción; aquí no hay ningún `update` ni `delete` de imágenes.
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
//
// SLT-98 (design §16.3; R24–R27, R31) — y el tope diario de imágenes, en `bug_report_upload_quota`. Cada
// método es UNA sentencia: el `WHERE` del `DO UPDATE` es el tope, y la fila `(user_id, day)` es el cerrojo
// que serializa peticiones simultáneas (R26). Un `upsert` de Prisma podría degradar a leer y luego escribir.

const FICHA = "SL-17";
const MOTIVO =
  "SLT-87/SLT-98: guardar un reporte de problema y sus imágenes en `bug_report` y `bug_report_image`, tablas de plataforma que la empresa no puede leer ni escribir; la empresa sale de la sesión, no del cliente (R13, R14)";
const MOTIVO_LEER =
  "SLT-97/SLT-98: el superadmin lee los reportes de problema de todas las empresas en `bug_report`, su historial y sus imágenes, tablas de plataforma (R3)";
const MOTIVO_ESTADO =
  "SLT-97: el superadmin cambia el estado de un reporte de problema y deja su entrada en `bug_report_status_change`, tablas de plataforma (R3, R21)";
const MOTIVO_CUPO =
  "SLT-98: contar los permisos de subida de imágenes de un usuario por día en `bug_report_upload_quota`, tabla de plataforma; el usuario sale de la sesión (R24, R31)";

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

export class BugReportRepository implements IBugReportRepository, ICupoImagenesReporte {
  constructor(private readonly prisma: BugReportPrismaClient) {}

  crear({ imagenes, ...datos }: NuevoBugReport): Promise<BugReportCreado | null> {
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
        // SLT-98 (R13): en la misma transacción; un CHECK o un UNIQUE que falle deshace también el reporte.
        if (imagenes.length > 0) {
          await tx.bugReportImage.createMany({ data: imagenes.map((i) => ({ ...i, bugReportId: fila.id })) });
        }
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
        // Las relaciones se leen EN SERIE, cada una con su `await`, sobre los FK proyectados: un
        // `include` de varias hermanas hace que Prisma las lance a la vez sobre la única conexión de la
        // transacción (brazo C de la guardia de consultas concurrentes; patrón de
        // `leerDescriptivosDeOrdenes` en `CierreDiaRepository`).
        const r = await tx.bugReport.findFirst({ where: { id, deletedAt: null } });
        if (!r) return null;
        const empresa = await tx.organizacion.findUnique({
          where: { id: r.organizationId },
          select: { nombre: true },
        });
        const reportero = await tx.usuario.findUnique({ where: { id: r.reporterUserId }, select: { email: true } });
        // Las dos FK son NOT NULL con CASCADE: si falta una, el reporte se borró entre medias.
        if (!empresa || !reportero) return null;
        const historial = await tx.bugReportStatusChange.findMany({
          where: { bugReportId: r.id },
          orderBy: ORDEN_HISTORIAL,
        });
        // SLT-98 (R22): en orden de adjunto. El `UNIQUE (bug_report_id, position)` es el índice.
        const imagenes = await tx.bugReportImage.findMany({
          where: { bugReportId: r.id },
          orderBy: { position: "asc" },
          select: { id: true, storagePath: true },
        });
        return {
          reporte: {
            id: r.id,
            descripcion: r.description,
            empresa: empresa.nombre,
            usuario: r.reporterName,
            correo: reportero.email,
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
            organizacionId: r.organizationId,
            imagenes: imagenes.map((i) => ({ id: i.id, ruta: i.storagePath })),
          },
          historial: historial.map((h) => ({
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

  /**
   * Tope blando (P9): el `WHERE` mira el conteo de ANTES (sin sumar `EXCLUDED`), así que una petición que
   * entra con 20 deja 25. Con 21 o más no casa, no se escribe nada y vuelven cero filas: `null`.
   * `${fecha}::date` sobre el texto: un `Date` de JS lo movería de día según el huso de la sesión.
   */
  consumir(usuarioId: string, fecha: string, n: number, tope: number): Promise<number | null> {
    return comoPlataforma(FICHA, MOTIVO_CUPO, () =>
      this.prisma.$transaction(async (tx) => {
        const filas = await tx.$queryRaw<{ permits_granted: number }[]>`
          INSERT INTO "bug_report_upload_quota" ("user_id", "day", "permits_granted", "created_at")
          VALUES (${usuarioId}, ${fecha}::date, ${n}, CURRENT_TIMESTAMP)
          ON CONFLICT ("user_id", "day") DO UPDATE
            SET "permits_granted" = "bug_report_upload_quota"."permits_granted" + EXCLUDED."permits_granted"
            WHERE "bug_report_upload_quota"."permits_granted" < ${tope}
          RETURNING "permits_granted"
        `;
        return filas[0]?.permits_granted ?? null;
      }),
    );
  }

  /** Con la misma `fecha` que `consumir`: una devolución pasada la medianoche resta del día en que se contó. */
  devolver(usuarioId: string, fecha: string, n: number): Promise<void> {
    return comoPlataforma(FICHA, MOTIVO_CUPO, () =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "bug_report_upload_quota"
          SET "permits_granted" = GREATEST("permits_granted" - ${n}, 0)
          WHERE "user_id" = ${usuarioId} AND "day" = ${fecha}::date
        `;
      }),
    );
  }
}
