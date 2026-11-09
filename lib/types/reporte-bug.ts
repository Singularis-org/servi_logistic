import type { RolValue } from "@prisma/client";
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
