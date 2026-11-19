// SLT-48 (review vuelta 2, «tope corto a mover») — los fallos con los que una transaccion CEDE ante
// otras escrituras y que se arreglan reintentando: no dicen nada de los datos, solo que habia alguien
// mas. `GeoRepository.mover` los provoca a proposito con su tope (`TOPE_MOVER_MS`), y la action de
// mover los traduce a `ocupado` («intenta de nuevo») en vez de a un `error` con log:
//   - 55P03 `lock_not_available`: el `lock_timeout` vencio esperando a una escritura en vuelo;
//   - 57014 `query_canceled`: el `statement_timeout` corto una sentencia con los bloqueos tomados;
//   - 40P01 `deadlock_detected`: Postgres eligio esta transaccion para deshacer el interbloqueo;
//   - P2028 (Prisma): el `timeout` de la transaccion interactiva vencio y Prisma la revirtio;
//   - P2034 (Prisma): conflicto de escritura o interbloqueo, con la forma de Prisma.
// En todos la transaccion se revierte entera: nada quedo escrito.
//
// El SQLSTATE llega de varias formas segun el camino (modelo, SQL a mano, driver adapter): en `code`,
// en `originalCode` de algun `cause`, o dentro del mensaje (`Code: \`55P03\``). Se busca en todas, como
// `esViolacionDeUnico` busca el 23505.

const SQLSTATE_OCUPADO = new Set(["55P03", "57014", "40P01"]);
const CODIGOS_PRISMA_OCUPADO = new Set(["P2028", "P2034"]);
const CLAVES_ANIDADAS = ["cause", "meta", "driverAdapterError"] as const;
const SQLSTATE_EN_MENSAJE = /Code: `([0-9A-Z]{5})`/;

function llevaOcupado(e: unknown, vistos: Set<unknown>, profundidad: number): boolean {
  if (e === null || typeof e !== "object" || vistos.has(e) || profundidad > 6) return false;
  vistos.add(e);
  const o = e as Record<string, unknown>;
  for (const codigo of [o.code, o.originalCode]) {
    if (typeof codigo === "string" && (SQLSTATE_OCUPADO.has(codigo) || CODIGOS_PRISMA_OCUPADO.has(codigo))) {
      return true;
    }
  }
  const enMensaje = typeof o.message === "string" ? SQLSTATE_EN_MENSAJE.exec(o.message)?.[1] : undefined;
  if (enMensaje !== undefined && SQLSTATE_OCUPADO.has(enMensaje)) return true;
  return CLAVES_ANIDADAS.some((k) => llevaOcupado(o[k], vistos, profundidad + 1));
}

/** `true` si el error es de los que se arreglan reintentando (la transaccion cedio y no escribio nada). */
export function esMoverOcupado(error: unknown): boolean {
  return llevaOcupado(error, new Set(), 0);
}
