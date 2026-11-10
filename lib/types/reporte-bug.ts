import type { BugReportStatus, RolValue } from "@prisma/client";
import { z } from "zod";

import { DESCRIPCION_MAX } from "@/lib/config/reporte-bug";

// SLT-87 (design §4) — el contrato del envío de un reporte de problema y los datos que cruzan las capas.

/** Tope de la ruta: el `VARCHAR(2048)` de `bug_report.page_path`. */
export const PAGINA_MAX = 2048;
/**
 * Tope de cada lado de la ventana: el `CHECK` de `bug_report.viewport_*` (20 000 px). Se escribe como
 * producto porque el literal coincide con el umbral de volumen de R47, y `rollup-guards` prohíbe
 * copiarlo; no es el mismo dato.
 */
export const VENTANA_LADO_MAX = 20 * 1000;

const ladoDeVentana = z.number().int().min(1).max(VENTANA_LADO_MAX);

/**
 * R12. `strict` en los dos niveles: un campo de más (`usuarioId`, `organizacionId`, `rol`…) es un
 * error de validación, porque quién reporta sale de la sesión y nunca de la entrada (R13).
 *
 * La página es solo la ruta (Q2): el cliente manda `location.pathname`, y una ruta con query o con
 * fragmento se rechaza en vez de recortarse, porque solo llegaría así si alguien arma la petición a mano.
 * Tampoco empieza por «//», que un navegador leería como otro origen.
 */
export const enviarReporteBugSchema = z
  .object({
    descripcion: z
      .string()
      .trim()
      .min(1, "Describe el problema.")
      .max(DESCRIPCION_MAX, `La descripción no puede superar los ${DESCRIPCION_MAX} caracteres.`),
    pagina: z
      .string()
      .max(PAGINA_MAX)
      .refine((p) => p.startsWith("/") && !p.startsWith("//"), "La página debe ser una ruta del portal.")
      .refine((p) => !p.includes("?") && !p.includes("#"), "La página no puede llevar query ni fragmento."),
    ventana: z.object({ ancho: ladoDeVentana, alto: ladoDeVentana }).strict().optional(),
    appInstalada: z.boolean().optional(),
  })
  .strict();

export type EnviarReporteBugInput = z.infer<typeof enviarReporteBugSchema>;

/** Lo que el servidor añade a la entrada, de la petición y no del cliente (R13). */
export interface EntornoDelReporte {
  userAgent: string;
}

/** La fila que escribe el repositorio. La empresa, el usuario y el rol son los de la sesión (R13). */
export interface NuevoBugReport {
  organizationId: string;
  reporterUserId: string;
  reporterRole: RolValue;
  description: string;
  pagePath: string;
  userAgent: string;
  viewportWidth: number | null;
  viewportHeight: number | null;
  isStandalone: boolean | null;
}

/** El reporte recién guardado, plano, con lo que pinta el correo (design §6). */
export interface BugReportCreado {
  id: string;
  createdAt: Date;
  description: string;
  reporterName: string;
  reporterEmail: string;
  organizationName: string;
  reporterRole: RolValue;
  pagePath: string;
  userAgent: string;
  viewportWidth: number | null;
  viewportHeight: number | null;
  isStandalone: boolean | null;
}

// ─── SLT-97 (design §4, §6) — el módulo del superadmin: listado, detalle y estado ───────────────────

/** P3. El `CHECK` `bug_report_status_change_note_largo` (20261111120000) usa el mismo número. */
export const NOTA_MAX = 500;
/** P4. */
export const REPORTES_POR_PAGINA = 25;
/** R6: las letras de la descripción que caben en una fila del listado. */
export const RESUMEN_MAX = 120;

/**
 * R17. La misma tabla que el trigger `bug_report_status_solo_adelante`, escrita como datos: el test de
 * integración recorre los 16 pares contra la base y contra esta constante.
 */
export const TRANSICIONES_REPORTE: Readonly<Record<BugReportStatus, readonly BugReportStatus[]>> = {
  new: ["in_review", "resolved", "dismissed"],
  in_review: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};

/** R5, R7: «Pendientes», el filtro con el que abre el listado. */
export const ESTADOS_PENDIENTES = ["new", "in_review"] as const satisfies readonly BugReportStatus[];

export const filtroEstadoReporteSchema = z.enum(["pendientes", "todos", "new", "in_review", "resolved", "dismissed"]);
export type FiltroEstadoReporte = z.infer<typeof filtroEstadoReporteSchema>;

/** `2026-02-30` tiene la forma pero no existe: `Date.UTC` lo pasaría al 2 de marzo. */
function esFechaReal(dia: string): boolean {
  const [a, m, d] = dia.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

const fechaDia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe ser AAAA-MM-DD.")
  .refine(esFechaReal, "La fecha no existe.");

/**
 * R9–R11. Llega de los `searchParams` de la página. Un estado desconocido, una fecha inválida o
 * «Desde» posterior a «Hasta» son error de validación; una página que no es un entero es la 1, y el
 * servicio la recorta a la última (R11). Las fechas son días UTC: compararlas como texto basta.
 */
export const filtrosReportesSchema = z
  .object({
    estado: filtroEstadoReporteSchema.default("pendientes"),
    empresa: z.string().uuid().optional(),
    desde: fechaDia.optional(),
    hasta: fechaDia.optional(),
    pagina: z.coerce.number().int().catch(1).default(1),
  })
  .strict()
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    path: ["hasta"],
    message: "«Desde» no puede ser posterior a «Hasta».",
  });
export type FiltrosReportes = z.infer<typeof filtrosReportesSchema>;

/** R15: un id que no es uuid no llega a la base. */
export const verReporteSchema = z.object({ reporteId: z.string().uuid() }).strict();
export type VerReporteInput = z.infer<typeof verReporteSchema>;

/**
 * R17, R20. `new` nunca es destino. `.trim()` va antes de `.max`: 500 letras con espacios alrededor
 * pasan, con el mismo criterio que el `CHECK` sobre `btrim`. La nota vacía la pasa a `null` el servicio.
 */
export const cambiarEstadoReporteSchema = z
  .object({
    reporteId: z.string().uuid(),
    estado: z.enum(["in_review", "resolved", "dismissed"]),
    nota: z
      .string()
      .trim()
      .max(NOTA_MAX, `La nota no puede superar los ${NOTA_MAX} caracteres.`)
      .optional()
      .default(""),
  })
  .strict();
export type CambiarEstadoReporteInput = z.infer<typeof cambiarEstadoReporteSchema>;

/**
 * R6. Las primeras `RESUMEN_MAX` letras y «…» si se cortó. Cuenta puntos de código y no unidades
 * UTF-16, para no partir un emoji por la mitad.
 */
export function resumenDeDescripcion(descripcion: string): string {
  const letras = Array.from(descripcion);
  return letras.length > RESUMEN_MAX ? `${letras.slice(0, RESUMEN_MAX).join("")}…` : descripcion;
}

/** R6. Una fila del listado. Las fechas cruzan el borde RSC como texto ISO (design §6). */
export interface ReporteFilaDTO {
  id: string;
  creadoEn: string;
  estado: BugReportStatus;
  empresa: string;
  usuario: string;
  rol: RolValue;
  resumen: string;
}

/** R14. El detalle tal como lo lee el repositorio; el servicio le añade los destinos (R17). */
export interface ReporteDetalleDatos {
  id: string;
  descripcion: string;
  empresa: string;
  /** El nombre del momento del reporte (R14). */
  usuario: string;
  correo: string;
  rol: RolValue;
  pagina: string;
  navegador: string;
  /** `null` si el cliente no mandó la ventana. */
  ventana: { ancho: number; alto: number } | null;
  appInstalada: boolean | null;
  creadoEn: string;
  estado: BugReportStatus;
}

/** R14, R17: `destinosPermitidos` es `TRANSICIONES_REPORTE[estado]`, calculado en el servidor. */
export interface ReporteDetalleDTO extends ReporteDetalleDatos {
  destinosPermitidos: BugReportStatus[];
}

/** R21, R22. Una entrada del historial; `nota` `null` es «sin nota». */
export interface CambioEstadoDTO {
  id: string;
  desde: BugReportStatus;
  hacia: BugReportStatus;
  nota: string | null;
  actor: string;
  creadoEn: string;
}
