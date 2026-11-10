import { z } from "zod";
import { BUCKETS } from "@/lib/storage/buckets";

// SLT-87 (design §9) — la configuración del reporte de problemas. Este archivo lo importa también el
// panel del navegador (`DESCRIPCION_MAX`), así que no importa nada del servidor.
// SLT-98 (design §6): `process.env` solo lo lee `bucketReporteBug`, que el navegador no llama.

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

// ─── SLT-98 (design §6): imágenes del reporte ────────────────────────────────────────────────────

/** R3: máximo de imágenes por reporte. El `CHECK` `bug_report_image_position_rango` usa el mismo 5. */
export const IMAGENES_MAX = 5;

/**
 * P4: 5 MB por imagen. El `CHECK` `bug_report_image_size_bytes_rango` de la migración `20261112120000`
 * lo escribe como 5242880, y `createBucket` lo pone de `fileSizeLimit`. Si cambia aquí, cambia allí
 * con otra migración.
 */
export const IMAGEN_BYTES_MAX = 5 * 1024 * 1024;

/** Los tipos que se aceptan, los mismos del `CHECK` `bug_report_image_content_type_permitido`. */
export const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp"] as const;
export type TipoImagenReporte = (typeof TIPOS_IMAGEN)[number];

/** La extensión del objeto la pone el servidor por el tipo, nunca la del archivo del usuario. */
export const EXTENSION_POR_TIPO: Record<TipoImagenReporte, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** R20: vida de los enlaces del correo (decisión del 2026-11-10). */
export const ENLACE_CORREO_SEGUNDOS = 24 * 60 * 60;
/** R22, P3: vida de los enlaces del detalle del superadmin, igual que la del correo. */
export const ENLACE_DETALLE_SEGUNDOS = 24 * 60 * 60;

/** R15: `BUG_REPORT_BUCKET` recortada o, vacía o ausente, `BUCKETS.BUG_REPORTS`. Solo en el servidor. */
export function bucketReporteBug(valor: string | undefined = process.env.BUG_REPORT_BUCKET): string {
  const recortado = valor?.trim() ?? "";
  return recortado === "" ? BUCKETS.BUG_REPORTS : recortado;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const FIRMA_JPEG = [0xff, 0xd8, 0xff] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

function empiezaCon(bytes: Uint8Array, firma: readonly number[], desde = 0): boolean {
  if (bytes.length < desde + firma.length) return false;
  return firma.every((b, i) => bytes[desde + i] === b);
}

/** R10: el tipo que dicen los primeros bytes, o `null`. Con menos bytes de los que mira, `null`. */
export function tipoPorFirma(bytes: Uint8Array): TipoImagenReporte | null {
  if (empiezaCon(bytes, FIRMA_PNG)) return "image/png";
  if (empiezaCon(bytes, FIRMA_JPEG)) return "image/jpeg";
  if (empiezaCon(bytes, RIFF) && empiezaCon(bytes, WEBP, 8)) return "image/webp";
  return null;
}
