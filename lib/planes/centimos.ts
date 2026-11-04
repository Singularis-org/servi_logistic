// SLT-66 (design §4.3, R19) — importes en céntimos exactos. Los comparten el total estimado del ciclo
// (`costeo.ts`) y el monto del período de cobro (`cobro.ts`, ajuste planes-custom D7).
//
// Sin `@prisma/client`: estos módulos llegan a componentes cliente, y `Prisma.Decimal` arrastraría el
// runtime de Prisma al bundle (decisión del humano, 2026-10-31). La aritmética va en céntimos enteros,
// como `lib/utils/pagos-recaudo.ts`, pero en `bigint`: un `DECIMAL(12,2)` por cien mil órdenes pasa de
// 2^53 y un `number` perdería céntimos. Ni `Number(` ni `parseFloat`.

const IMPORTE = /^(\d+)(?:\.(\d{1,2}))?$/;
export const CIEN = BigInt(100);

/** Un importe en texto (`"7"`, `"0.1"`, `"9999999999.99"`) a céntimos exactos. */
export function aCentimos(importe: string): bigint {
  const partes = IMPORTE.exec(importe);
  // Los importes vienen de columnas `DECIMAL(12,2)` no negativas: otra forma es un error del llamador.
  if (partes === null) throw new Error(`aCentimos: importe no válido: ${importe}`);
  return BigInt(partes[1]) * CIEN + BigInt((partes[2] ?? "").padEnd(2, "0"));
}

/** Céntimos a texto con dos decimales (`"0.30"`, `"50300.00"`). */
export function aTexto(centimos: bigint): string {
  const digitos = centimos.toString().padStart(3, "0");
  return `${digitos.slice(0, -2)}.${digitos.slice(-2)}`;
}
