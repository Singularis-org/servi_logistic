// SLT-138 (R171) — el texto del buscador por folio de «Cierres solicitados», normalizado. Puro: sin
// Prisma, sin React. El folio es el de R156: los últimos 8 caracteres del id del cierre en mayúsculas.

/** Largo del folio (R156). Un texto más largo no puede estar contenido en él. */
const LARGO_FOLIO = 8;

/**
 * SLT-113 (R375) — el folio de un cierre: los últimos 8 caracteres del id, en mayúsculas (R156).
 * Una sola definición para la pantalla (`folioDe`), el comprobante y el archivo descargado: si cada
 * uno lo recortara por su lado, el mismo cierre podría salir con dos folios distintos.
 */
export function folioCierre(id: string): string {
  return id.slice(-LARGO_FOLIO).toUpperCase();
}

/** Solo dígitos hexadecimales en mayúsculas, de principio a fin. */
const SOLO_HEX = /^[0-9A-F]+$/;

export type FolioFiltro =
  /** Vacío tras normalizar: el filtro no se aplica. */
  | { tipo: "ignorar" }
  /** Un carácter que no puede estar en un folio, o más de 8: cero cierres sin leer la base. */
  | { tipo: "imposible" }
  /** 1-8 caracteres `0-9A-F`, en mayúsculas. */
  | { tipo: "buscar"; texto: string };

/**
 * `trim()` → quita UN «#» inicial → mayúsculas. El tope de 20 caracteres lo aplica antes el borde
 * (zod). Un texto imposible no se distingue de «no hay coincidencias» (R171), y nunca llega al SQL.
 */
export function normalizarFolio(entrada: string): FolioFiltro {
  const recortado = entrada.trim();
  const sinAlmohadilla = recortado.startsWith("#") ? recortado.slice(1) : recortado;
  const texto = sinAlmohadilla.toUpperCase();
  if (texto === "") return { tipo: "ignorar" };
  if (texto.length > LARGO_FOLIO || !SOLO_HEX.test(texto)) return { tipo: "imposible" };
  return { tipo: "buscar", texto };
}
