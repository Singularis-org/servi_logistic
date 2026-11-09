import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { IBugReportRepository } from "@/lib/interfaces/repositories/IBugReportRepository";
import type { BugReportCreado, NuevoBugReport } from "@/lib/types/reporte-bug";
import { NOMBRE_USUARIO_SELECT, nombreCompletoUsuario } from "@/lib/utils/nombre-usuario";

export type BugReportPrismaClient = Pick<PrismaClient, "$transaction">;

// SLT-87 (design §2.3, §6; R11, R13, R14) — el único punto que escribe `bug_report`.
//
// Corre en `comoPlataforma`, como dueño: `servi_app` no tiene ningún privilegio sobre la tabla, y en
// contexto de empresa la extensión envolvería también este modelo de plataforma y lo bajaría a
// `servi_app` (42501). Por eso el archivo está en `EXCEPCIONES_DE_PLATAFORMA`.
//
// Sin el filtro de la extensión, el filtro de empresa va escrito: el usuario se busca con su id Y la
// empresa de la sesión. Si no está ahí, no se escribe nada y el servicio responde `forbidden`.

const FICHA = "SL-17";
const MOTIVO =
  "SLT-87: guardar un reporte de problema en `bug_report`, tabla de plataforma que la empresa no puede leer ni escribir; la empresa sale de la sesión, no del cliente (R13, R14)";

/** El ancho de `bug_report.reporter_name`. */
const NOMBRE_MAX = 120;

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
}
