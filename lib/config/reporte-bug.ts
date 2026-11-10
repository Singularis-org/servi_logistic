import { z } from "zod";

// SLT-87 (design §9) — la configuración del reporte de problemas. Este archivo lo importa también el
// panel del navegador (`DESCRIPCION_MAX`), así que no importa nada del servidor.

/**
 * Q3 (decisión del 2026-11-09): máximo de la descripción. Lo comparten el zod de
 * `lib/types/reporte-bug.ts`, el `Textarea` y el contador del panel, y el `CHECK`
 * `bug_report_description_largo` de la migración `20261110120000`, escrito con el mismo número.
 */
export const DESCRIPCION_MAX = 500;

const esEmail = (valor: string): boolean => z.email().safeParse(valor).success;

/**
 * R15, R16: los destinatarios de la copia por correo, de `BUG_REPORT_EMAILS` (lista separada por «,»).
 * Recorta, descarta lo vacío y lo que no es un email, y quita duplicados sin distinguir mayúsculas.
 * Vacía, ausente o sin ninguna válida: `[]`, y el reporte se guarda sin correo.
 *
 * Si descartó alguna dirección lo dice en una línea con la cifra, nunca con las direcciones: una mal
 * escrita puede ser casi la buena y el log no es sitio para listas de correos.
 */
export function destinatariosReporteBug(valor: string | undefined = process.env.BUG_REPORT_EMAILS): string[] {
  if (valor === undefined) return [];
  const vistos = new Set<string>();
  const validos: string[] = [];
  let descartados = 0;
  for (const parte of valor.split(",")) {
    const direccion = parte.trim();
    if (direccion === "") continue;
    if (!esEmail(direccion)) {
      descartados += 1;
      continue;
    }
    const clave = direccion.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    validos.push(direccion);
  }
  if (descartados > 0) {
    console.warn(`[reporte-bug] BUG_REPORT_EMAILS: ${descartados} direccion(es) no valida(s) descartada(s)`);
  }
  return validos;
}
