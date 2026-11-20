import { Prisma } from "@prisma/client";

/**
 * SLT-111 (R70, R260-R262) — el reparto de lo recaudado en porcentajes ENTEROS que suman 100.
 *
 * Regla del mayor resto, sobre centimos exactos (`Prisma.Decimal`, nunca coma flotante):
 *   1. a cada parte le toca la parte entera de `parte × 100 / total`;
 *   2. los puntos que faltan hasta 100 van, de uno en uno, a las partes con mayor resto;
 *   3. a igual resto gana la parte que va ANTES (el orden de entrada manda).
 *
 * Devuelve `null` —y la pantalla pinta solo la leyenda con los importes, sin barra— si el total
 * es cero o negativo, si alguna parte es negativa, si algun importe no es un numero entero de
 * centimos, si no hay partes, o si las partes no suman el total al centimo (R261). Esto ultimo es
 * a proposito: repartir sobre la suma de las partes maquillaria un snapshot descuadrado.
 *
 * Solo el entero resultante (0-100) sale como `number`: es un porcentaje, no un importe (R262).
 */
export function porcentajesReparto(partes: readonly string[], total: string): number[] | null {
  if (partes.length === 0) return null;
  const totalCentimos = centimos(total);
  if (totalCentimos === null || totalCentimos.lte(0)) return null;

  const partesCentimos: Prisma.Decimal[] = [];
  for (const parte of partes) {
    const c = centimos(parte);
    if (c === null || c.isNegative()) return null;
    partesCentimos.push(c);
  }
  const suma = partesCentimos.reduce((s, c) => s.plus(c), new Prisma.Decimal(0));
  if (!suma.eq(totalCentimos)) return null;

  // `parte × 100 / total` en enteros: piso y resto exactos, sin division con decimales.
  const pisos = partesCentimos.map((c) => c.times(100).divToInt(totalCentimos));
  const restos = partesCentimos.map((c) => c.times(100).mod(totalCentimos));
  const faltan = 100 - pisos.reduce((s, p) => s.plus(p), new Prisma.Decimal(0)).toNumber();

  // Mayor resto primero; a igual resto, el indice menor (la parte que va antes).
  const orden = restos
    .map((resto, indice) => ({ resto, indice }))
    .sort((a, b) => b.resto.comparedTo(a.resto) || a.indice - b.indice);
  const resultado = pisos.map((p) => p.toNumber());
  for (const { indice } of orden.slice(0, faltan)) resultado[indice] += 1;
  return resultado;
}

/** El importe en centimos, o `null` si no es un numero o no es un entero de centimos. */
function centimos(importe: string): Prisma.Decimal | null {
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(importe);
  } catch {
    return null;
  }
  const c = d.times(100);
  return c.isFinite() && c.isInteger() ? c : null;
}
