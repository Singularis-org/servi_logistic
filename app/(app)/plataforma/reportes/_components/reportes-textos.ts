import type { BugReportStatus } from "@prisma/client";

import type { FiltroEstadoReporte } from "@/lib/types/reporte-bug";

// SLT-97 (design §7, §9) — los textos del listado y del detalle de reportes, en un solo sitio para que
// una pasada de i18n tenga uno que tocar. Los tests los comparan literalmente: son el contrato de
// pantalla.

export const TEXTOS_REPORTES = {
  titulo: "Reportes",
  descripcion: "Problemas que reportan los usuarios de las empresas. Solo los ve la plataforma.",
  filtroEstado: "Estado",
  filtroEmpresa: "Empresa",
  todasLasEmpresas: "Todas las empresas",
  desde: "Desde",
  hasta: "Hasta",
  limpiarFiltros: "Limpiar filtros",
  columnaFecha: "Fecha",
  columnaEmpresa: "Empresa",
  columnaUsuario: "Usuario",
  columnaRol: "Rol",
  columnaDescripcion: "Descripción",
  columnaEstado: "Estado",
  paginacion: "Paginación de reportes",
  vacioPendientes: "No hay reportes pendientes.",
  vacioFiltros: "Ningún reporte coincide con los filtros.",
  cargaError: "No se pudo cargar el listado de reportes.",
  fechasInvalidas: "Revisa las fechas: «Desde» no puede ser posterior a «Hasta».",
} as const;

export const TEXTOS_REPORTE_DETALLE = {
  titulo: "Reporte",
  volver: "Volver a reportes",
  bloqueDescripcion: "Descripción",
  bloqueContexto: "Contexto",
  bloqueEstado: "Estado",
  bloqueHistorial: "Historial",
  empresa: "Empresa",
  usuario: "Usuario",
  correo: "Correo",
  rol: "Rol",
  pagina: "Página",
  navegador: "Navegador",
  dispositivo: "Dispositivo",
  fecha: "Fecha",
  reporte: "Reporte",
  sinDatos: "Sin datos",
  nuevoEstado: "Nuevo estado",
  nota: "Nota interna (opcional)",
  cambiarEstado: "Cambiar estado",
  exito: "Estado actualizado.",
  otroFallo: "No se pudo cambiar el estado. Inténtalo de nuevo.",
  cerrado:
    "Este reporte está cerrado y ya no cambia de estado. Si el problema vuelve, entrará como un reporte nuevo.",
  sinNota: "Sin nota",
  historialVacio: "Todavía no hay cambios de estado.",
  // SLT-98 (design §9.2, §9.3; R22, R23).
  bloqueImagenes: "Imágenes",
  sinImagenes: "Este reporte no trae imágenes.",
  imagenSinEnlace: "No se pudo cargar esta imagen.",
} as const;

/** SLT-98 (R22): el `alt` de la miniatura `n` (desde 1) del detalle. */
export function textoAltImagenReporte(n: number): string {
  return `Imagen ${n} del reporte`;
}

/** SLT-98 (R22): el nombre accesible del enlace que abre la imagen `n` en grande. */
export function textoAbrirImagenReporte(n: number): string {
  return `Abrir la imagen ${n} en grande`;
}

export const ETIQUETA_ESTADO: Readonly<Record<BugReportStatus, string>> = {
  new: "Nuevo",
  in_review: "En revisión",
  resolved: "Resuelto",
  dismissed: "Descartado",
};

/** R7: las seis opciones del filtro de estado, en el orden del requisito. */
export const OPCIONES_FILTRO_ESTADO: ReadonlyArray<{ value: FiltroEstadoReporte; label: string }> = [
  { value: "pendientes", label: "Pendientes" },
  { value: "todos", label: "Todos" },
  { value: "new", label: ETIQUETA_ESTADO.new },
  { value: "in_review", label: ETIQUETA_ESTADO.in_review },
  { value: "resolved", label: ETIQUETA_ESTADO.resolved },
  { value: "dismissed", label: ETIQUETA_ESTADO.dismissed },
];

/** R20: «0/500», «120/500». */
export function textoContadorNota(n: number, max: number): string {
  return `${n}/${max}`;
}

/** R18: el aviso dice el estado en el que quedó el reporte. */
export function textoTransicionInvalida(actual: BugReportStatus): string {
  return `Este reporte ya está en «${ETIQUETA_ESTADO[actual]}» y no puede pasar a ese estado. Se muestra su estado actual.`;
}

/** R22: la cabecera de una entrada del historial. */
export function textoTransicion(desde: BugReportStatus, hacia: BugReportStatus): string {
  return `${ETIQUETA_ESTADO[desde]} → ${ETIQUETA_ESTADO[hacia]}`;
}

/**
 * R6: el nombre accesible del enlace de cada fila. La fecha visible va dentro tal cual, así que quien
 * dicta «2026-11-09 14:05 UTC» sigue dando con el enlace (WCAG 2.5.3).
 */
export function textoEnlaceFila(empresa: string, creadoEn: string): string {
  return `Ver reporte de ${empresa} del ${fechaUtc(creadoEn)}`;
}

/** R22: quién y cuándo. */
export function textoAutoria(actor: string, creadoEn: string): string {
  return `${actor} · ${fechaUtc(creadoEn)}`;
}

/**
 * Design §7: «AAAA-MM-DD HH:mm UTC», con `getUTC*` y no con `Intl`, que en jsdom y en Node puede
 * cambiar de formato según la zona y el ICU del proceso.
 */
export function fechaUtc(iso: string): string {
  const f = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())} ${dos(f.getUTCHours())}:${dos(f.getUTCMinutes())} UTC`;
}

/**
 * R14: el mismo formato que el correo de SLT-87: «390 × 844 · app instalada: sí». Lo que falte se
 * omite, y sin nada queda «Sin datos».
 */
export function textoDispositivo(
  ventana: { ancho: number; alto: number } | null,
  appInstalada: boolean | null,
): string {
  const partes: string[] = [];
  if (ventana !== null) partes.push(`${ventana.ancho} × ${ventana.alto}`);
  if (appInstalada !== null) partes.push(`app instalada: ${appInstalada ? "sí" : "no"}`);
  return partes.length > 0 ? partes.join(" · ") : TEXTOS_REPORTE_DETALLE.sinDatos;
}
