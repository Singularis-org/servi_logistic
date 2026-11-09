import { ROL_LABELS } from "@/lib/auth/rol-label";
import { MARCA } from "@/lib/config/marca";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { componerCorreo, type Bloque } from "@/lib/services/email/plantillas/plantilla-marca";
import type { BugReportCreado } from "@/lib/types/reporte-bug";

// SLT-87 (design §7; R15, R18) — la copia por correo de un reporte de problema, sobre la plantilla de
// marca. Va a la plataforma (`BUG_REPORT_EMAILS`), nunca a quien reporta ni a su empresa.
//
// No arma HTML propio: todo dato variable entra en un bloque de `componerCorreo`, que lo escapa con
// `escaparHtml` (R18). La descripción se parte por líneas en párrafos porque `parrafo` no convierte
// `\n`; así se conservan los saltos sin tocar la plantilla común.
//
// La fecha va en UTC y no en la zona de un país: el correo lo lee la plataforma, no una empresa, y
// `pais-sin-literales` impide fijar una zona en el servidor.

const ASUNTO_MAX = 150;
const PREHEADER_MAX = 90;

export interface ReporteBugCorreoParams {
  /** Un destinatario de `BUG_REPORT_EMAILS`: un mensaje por dirección. */
  to: string;
  reporte: BugReportCreado;
}

/** `AAAA-MM-DD HH:mm UTC`. */
function fechaUtc(instante: Date): string {
  return `${instante.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function dispositivo(r: BugReportCreado): string {
  const partes: string[] = [];
  if (r.viewportWidth !== null && r.viewportHeight !== null) partes.push(`${r.viewportWidth} × ${r.viewportHeight}`);
  if (r.isStandalone !== null) partes.push(`app instalada: ${r.isStandalone ? "sí" : "no"}`);
  return partes.length > 0 ? partes.join(" · ") : "Sin datos";
}

export function plantillaReporteBug({ to, reporte: r }: ReporteBugCorreoParams): EmailMessage {
  const asunto = `Reporte de un problema · ${r.organizationName} · ${ROL_LABELS[r.reporterRole]}`.slice(0, ASUNTO_MAX);
  const lineasDescripcion: Bloque[] = r.description
    .split(/\r?\n/)
    .filter((linea) => linea.trim() !== "")
    .map((linea) => ({ tipo: "parrafo", texto: linea }));
  const contexto: Bloque[] = [
    `Empresa: ${r.organizationName}`,
    `Usuario: ${r.reporterName} (${r.reporterEmail})`,
    `Rol: ${ROL_LABELS[r.reporterRole]}`,
    `Página: ${r.pagePath}`,
    `Navegador: ${r.userAgent}`,
    `Dispositivo: ${dispositivo(r)}`,
    `Fecha: ${fechaUtc(r.createdAt)}`,
    `Reporte: ${r.id}`,
  ].map((texto) => ({ tipo: "nota", texto }));

  return componerCorreo({
    to,
    asunto,
    preheader: r.description.slice(0, PREHEADER_MAX),
    bloques: [{ tipo: "parrafo", texto: `Nuevo reporte de un problema en ${MARCA.nombre}.` }, ...lineasDescripcion, ...contexto],
    contacto: null,
  });
}
