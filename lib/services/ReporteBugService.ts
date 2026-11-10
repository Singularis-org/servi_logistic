import { esPlataforma } from "@/lib/auth/plataforma";
import { destinatariosReporteBug } from "@/lib/config/reporte-bug";
import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { IBugReportRepository } from "@/lib/interfaces/repositories/IBugReportRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EnviarReporteBugServiceResult, IReporteBugService } from "@/lib/interfaces/services/IReporteBugService";
import { plantillaReporteBug } from "@/lib/services/email/plantillas/reporte-bug";
import type { EntornoDelReporte, EnviarReporteBugDatos } from "@/lib/types/reporte-bug";

// SLT-87 (design §5; R11, R13, R15–R17) — enviar un reporte de problema.
//
// La puerta de verdad está aquí, no en el layout que pinta el botón: solo un usuario de empresa
// reporta. Primero se guarda; la copia por correo va después y es un extra (decisión cerrada «Si el
// correo falla»): un fallo se registra con el id del reporte y el nombre del error, sin reintento, sin
// marca y sin cambiar la respuesta. Un mensaje por destinatario porque `EmailMessage.to` es una sola
// dirección, y en paralelo para que el usuario espere al SMTP una vez y no una por destinatario.

/** El ancho de `bug_report.user_agent`. */
const USER_AGENT_MAX = 512;

const FORBIDDEN = { status: "forbidden" } as const;

export class ReporteBugService implements IReporteBugService {
  constructor(
    private readonly repo: IBugReportRepository,
    private readonly sender: IEmailSender,
    private readonly destinatarios: () => string[] = () => destinatariosReporteBug(),
    private readonly log: (linea: string) => void = (linea) => console.error(linea),
  ) {}

  async enviar(
    actor: Actor,
    entrada: EnviarReporteBugDatos,
    entorno: EntornoDelReporte,
  ): Promise<EnviarReporteBugServiceResult> {
    const organizacionId = actor.organizacionId ?? null;
    if (esPlataforma(actor.rol) || organizacionId === null) return FORBIDDEN;

    const creado = await this.repo.crear({
      organizationId: organizacionId,
      reporterUserId: actor.usuarioId,
      reporterRole: actor.rol,
      description: entrada.descripcion,
      pagePath: entrada.pagina,
      userAgent: entorno.userAgent.slice(0, USER_AGENT_MAX),
      viewportWidth: entrada.ventana?.ancho ?? null,
      viewportHeight: entrada.ventana?.alto ?? null,
      isStandalone: entrada.appInstalada ?? null,
      // SLT-98: las imágenes las valida y las pasa T7 (design §5.2); hasta entonces, ninguna.
      imagenes: [],
    });
    if (creado === null) return FORBIDDEN;

    // `async` dentro del map: si componer el correo lanzara, también cae en el `allSettled`.
    const envios = await Promise.allSettled(
      this.destinatarios().map(async (to) => this.sender.enviar(plantillaReporteBug({ to, reporte: creado }))),
    );
    for (const e of envios) {
      if (e.status === "rejected") {
        const causa = e.reason instanceof Error ? e.reason.name : "desconocido";
        this.log(`[reporte-bug] fallo la copia por correo reporte=${creado.id} causa=${causa}`);
      }
    }
    return { status: "enviado" };
  }
}
