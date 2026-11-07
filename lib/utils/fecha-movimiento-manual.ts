import { fechaCalendario, inicioDelDiaEnUtc } from "@/lib/utils/calendario-zona";

/**
 * Ficha 334 (R22/R23, design §8.2) — traduce la FECHA que el usuario eligio (`YYYY-MM-DD`) al
 * INSTANTE que se guarda en `wallet_movimiento.fecha_movimiento`.
 *
 * ── Los dos casos, y por que ──────────────────────────────────────────────────────────────
 *
 * SLT-42: «hoy» y el comienzo del dia son los de `zona`, la del pais de la empresa.
 *
 * - **Fecha = hoy en la zona (o sin fecha):** `undefined`. La clave NO viaja al repositorio y manda el
 *   `DEFAULT CURRENT_TIMESTAMP` de la columna, asi que el caso normal es byte a byte el de hoy:
 *   el movimiento sigue llevando la hora real y sigue encabezando el libro. Fijar el
 *   comienzo del dia tambien para hoy lo hundiria por debajo de todos los automaticos del dia y el
 *   usuario NO lo veria donde espera verlo — un fallo mudo, que es la familia que este repo tiene medida.
 *
 * - **Fecha anterior:** `inicioDelDiaEnUtc(fecha, zona)`, el instante en que ese dia EMPIEZA en la
 *   zona. Es la misma frontera que usan el rollup diario (`FinanzasDiarioRepository`, que
 *   agrupa por dia local) y los cubos de la analitica financiera para
 *   decidir a que dia pertenece una fila, asi que el movimiento cuenta en el dia elegido y en
 *   ningun otro (R25).
 *
 * ── La convencion `00:00Z` esta descartada CON RAZON MEDIDA ───────────────────────────────
 *
 * La ficha 172 eligio medianoche UTC para los ledgers de tienda y mensajero, y para AQUELLOS
 * consumidores es correcto. Aqui no: en una zona al oeste de UTC, `00:00Z` es del dia ANTERIOR, o sea que el
 * gasto de ayer se contaria como de anteayer en el rollup y en los cubos. Un numero mal puesto
 * en un informe es peor que una fila que no entra por un filtro. No se reintroduzca.
 *
 * ── Por que aqui y no como metodo privado de cada servicio ────────────────────────────────
 *
 * La usan los DOS servicios que escriben dinero a mano (`WalletService` y `WalletEgresoService`)
 * y es la definicion del instante de un movimiento: escrita dos veces, puede divergir en una
 * sola de ellas y la mitad del libro quedaria fechada con otra convencion sin que nada falle.
 * Sigue siendo logica de servicio —pura, sin HTTP ni Prisma—, solo que con un unico ejemplar.
 */
export function instanteDelMovimientoManual(
  fecha: string | undefined,
  zona: string,
  now: Date = new Date(),
): Date | undefined {
  if (fecha === undefined || fecha === fechaCalendario(now, zona)) return undefined; // R23
  return inicioDelDiaEnUtc(fecha, zona); // R22
}
