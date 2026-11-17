// Feature 76 (T9) — etiquetas i18n-ready y helpers de formato del ranking DIARIO,
// separados de la lógica (docs/conventions: textos de UI fuera del componente).
// Money-safe (R12): los montos ya llegan como STRING desde el Server Component; los
// helpers solo anteponen el símbolo, NUNCA parseFloat/Number sobre montos.

/**
 * Símbolo de "sin dato" reutilizable para celdas vacías. Es EL MISMO carácter que
 * `SIN_MONTO_RAYA` (U+2014) y por eso `money` se pudo mudar al helper compartido sin cambiar
 * lo que ve el mensajero; se declara igualmente aquí porque también rotula el PORCENTAJE y la
 * POSICIÓN, que no son dinero y no deben depender de la configuración de moneda.
 *
 * Que los dos no se separen en silencio —una tabla con «—» en el porcentaje y «-» en el
 * premio, en la misma fila— lo vigila `tests/components/RankingHistoricoModule.test.tsx`,
 * que es la pantalla donde ambos se pintan uno al lado del otro.
 */
export const SIN_DATO = "—";

/**
 * Feature 201 (tanda C) — `money` ya NO se declara aquí: era una de las ocho copias byte a
 * byte del mismo helper (de ahí `₡13331832.72` sin separador de miles). Vive en
 * `lib/config/moneda.ts` y se RE-EXPORTA, así que ningún consumidor cambia su import.
 * Money-safe igual que antes, y `null` sigue dando la raya larga (R9).
 */
export { money } from "@/lib/config/moneda";

/** Formatea el porcentaje ya redondeado (STRING) del servidor. `null` → "—" (R3). */
export function porcentaje(value: string | null): string {
  return value === null ? SIN_DATO : `${value}%`;
}

/** Conteo crudo auditable del día: entregadas / asignadas (R6). */
export function conteoCrudo(entregadasHoy: number, asignadasHoy: number): string {
  return `${entregadasHoy}/${asignadasHoy}`;
}

/** Etiquetas de las columnas de la tabla del ranking (R13). */
export const RANKING_COLUMNAS = {
  posicion: "Posición",
  mensajero: "Mensajero",
  porcentaje: "% del día",
  conteo: "Entregados / asignados",
} as const;

/** Iniciales para el avatar del podio: máx. 2 letras a partir del nombre. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/** Ancho (0-100) de la barra de efectividad. SOLO presentacional: el porcentaje
 * mostrado sigue siendo el STRING del servidor (R12), esto no lo reemplaza. */
export function anchoBarra(pct: string | null): number {
  if (pct === null) return 0;
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Etiquetas de la sección de premios del podio (R8/R14). */
export const PREMIOS_LABELS = {
  titulo: "Premios del podio",
  descripcion:
    "Tres posiciones del podio, cada una con un monto y una descripción opcionales.",
  posicion: "Posición",
  ocupante: "Mensajero",
  monto: "Monto del premio",
  descripcionPremio: "Descripción",
  acciones: "Acciones",
  sinOcupante: "Sin ocupante elegible hoy",
  sinMonto: "Sin premio asignado",
  sinDescripcion: "Sin descripción",
  guardar: "Guardar",
  guardando: "Guardando…",
  montoPlaceholder: "Ej. 5000",
  descripcionPlaceholder: "Ej. Bono por mejor desempeño",
} as const;

/** Mensajes de feedback de la edición de premios (R10/R11/R19). */
export const PREMIOS_FEEDBACK = {
  guardado: "Premio actualizado.",
  invalid: "Monto inválido: número no negativo con hasta 2 decimales.",
  forbidden: "No tenés permiso para editar los premios.",
  unauthenticated: "Tu sesión expiró. Iniciá sesión de nuevo.",
} as const;

/** Etiquetas del podio visual (rediseño de la sección de ranking). */
export const PODIO_LABELS = {
  titulo: "Ranking de mensajeros",
  descripcion: "Efectividad · entregados / asignados · hoy",
  conteoSufijo: "entregas",
  sinOcupante: "Sin ocupante",
  lugar: (posicion: number) => `${posicion}º lugar`,
  contador: (total: number) =>
    total === 1 ? "1 mensajero" : `${total} mensajeros`,
  listaAria: "Resto del ranking diario",
  podioAria: "Podio del ranking diario",
  vos: "Tú",
  fueraDelTop: (limite: number) => `Tu posición, fuera del top ${limite}`,
} as const;

/** Textos del estado vacío / encabezados de la tabla del ranking. */
export const RANKING_LABELS = {
  tablaAria: "Ranking diario de mensajeros",
  premiosAria: "Premios del podio",
  vacio: "Todavía no hay mensajeros para mostrar hoy.",
} as const;

/**
 * SLT-162 (R750) — el conteo de la tarjeta de «Ranking del día» en el teléfono: «{entregados} /
 * {asignados}», con espacios, como el rótulo «Entregados / asignados» que lleva encima. La celda de
 * escritorio y el podio siguen con `conteoCrudo`.
 */
export function conteoTarjeta(entregadasHoy: number, asignadasHoy: number): string {
  return `${entregadasHoy} / ${asignadasHoy}`;
}

/** SLT-162 (R752): el puesto del podio de una tarjeta de premios, «1º». */
export function ordinal(posicion: number): string {
  return `${posicion}º`;
}

/** SLT-162 (R769, DC23) — la búsqueda por nombre de «Ranking del día». */
export const BUSQUEDA_RANKING = {
  label: "Buscar mensajero",
  placeholder: "Buscar por nombre del mensajero",
  /** Distinto del vacío del día (`RANKING_LABELS.vacio`): hay mensajeros, pero ninguno coincide. */
  sinResultados: "Ningún mensajero coincide con la búsqueda.",
} as const;
