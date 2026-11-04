import { Prisma } from "@prisma/client";

/**
 * SLT-56 (design §4.3 paso 5; R8, R9, R16) — decide si un ajuste del pago al mensajero se puede
 * aplicar, comparando importes en `Prisma.Decimal`.
 *
 * Vive en su propio modulo para que la guardia money-safe
 * (`tests/unit/guards/ajuste-pago-mensajero-money-safe.guardia.test.ts`) pueda barrerlo ENTERO: ni
 * `Number(`, ni `parseFloat(`, ni `.toNumber(`. Comparar como texto tampoco vale: `"1500"` y
 * `"1500.00"` son el mismo importe y un `===` diria que no.
 *
 * Desenlaces:
 *  - `sin_cambio` (R8): el valor nuevo es el pago vigente. Un ajuste que no cambia nada no es un
 *    hecho que registrar (la base lo prohibe tambien con un CHECK).
 *  - `desfasado` (R9): el pago vigente ya no es el que la pantalla mostraba (otro ajuste o una
 *    correccion entre medias), o la gestion no tiene pago congelado. Se ajustaria sobre un valor que
 *    quien ajusta no vio.
 *  - `ok`: se puede aplicar.
 *
 * El orden importa: sin pago vigente no hay con que comparar el nuevo, asi que `null` sale antes.
 */
export type ResultadoValidacionAjuste = "ok" | "sin_cambio" | "desfasado";

export function validarAjustePago(
  pagoVigente: string | null,
  pagoAnterior: string,
  pagoNuevo: string,
): ResultadoValidacionAjuste {
  if (pagoVigente === null) return "desfasado";
  const vigente = new Prisma.Decimal(pagoVigente);
  if (new Prisma.Decimal(pagoNuevo).equals(vigente)) return "sin_cambio";
  if (!new Prisma.Decimal(pagoAnterior).equals(vigente)) return "desfasado";
  return "ok";
}
