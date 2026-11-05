// El DTO del CICLO DE VIDA de una orden y el resultado de su Server Action.
//
// Tipos PUROS y la lista de resultados que cierran una orden: sin Prisma, sin zod, sin React.

import type { OrderStatusValue } from "@/lib/types/order-status";

/**
 * Los resultados de gestion que cierran una orden para el ciclo de vida (SLT-64, D1). Es el unico
 * sitio donde se declaran (R10). `novedad` y `reprogramado` no estan porque la orden puede volver a
 * reparto (Q1). Se tipa contra el catalogo: si cambia un nombre, deja de compilar.
 */
export const RESULTADOS_DE_CIERRE = [
  "entregado",
  "devolucion_a_origen_por_rechazo",
  "incidente",
] as const satisfies readonly OrderStatusValue[];

/**
 * El tiempo de ciclo del recorte, con su denominador delante.
 *
 * ─── QUE MIDE, CON TODAS LAS LETRAS ─────────────────────────────────────────────────────
 *
 * Segundos entre la CREACION de la orden (`orden.created_at`) y el `created_at` de su GESTION
 * FINAL: la ultima gestion vigente, si su resultado es uno de `RESULTADOS_DE_CIERRE`, este o no
 * aprobado su cierre. Mide tiempo de ORDENES, no volumen de gestiones. Sigue a la ultima gestion
 * vigente al consultar: una anulacion mueve la cifra, y una correccion no mueve el fin del reloj.
 *
 * ⚠ NO es la metrica `tiempo_ciclo` del catalogo (`lib/analytics/metrics.ts`, consulta Q5 de
 * `AnaliticaRollupRepository`): esa es contrato de API y para en la transicion terminal (Q3 de
 * SLT-64). La cohorte de carga tampoco cambia (Q2).
 *
 * ⚠ SOLO ENTRAN LAS ORDENES CERRADAS, y esto sesga la cifra hacia arriba de forma conocida: una
 * orden que lleva tres semanas abierta no tiene fin de reloj, asi que NO cuenta — el promedio
 * habla de las que se cerraron, no de todas. Por eso `n` viaja y no es opcional: un promedio
 * sin su denominador no se puede juzgar.
 *
 * ⚠ LA VENTANA CAE SOBRE EL CIERRE (la gestion final), no sobre la creacion. Una orden creada en
 * enero y cerrada en agosto cuenta en AGOSTO. Es la unica atribucion que permite comparar dos
 * meses: atribuyendo por creacion, el mes en curso saldria siempre artificialmente rapido porque
 * solo habrian cerrado las ordenes faciles.
 */
export interface CicloVidaDTO {
  /**
   * Suma de segundos de todas las ordenes contadas. Numerador CRUDO.
   *
   * Viaja junto al promedio —y no en su lugar— porque es lo unico que se puede volver a
   * agregar: dos recortes se suman por numerador y denominador, nunca promediando promedios.
   * Es la misma razon por la que el rollup guarda `segCicloAcum` y `segCicloN` y «jamas el
   * promedio».
   */
  readonly segundosAcum: number;
  /** Cuantas ordenes cerradas entraron. El DENOMINADOR. `0` = no hubo ninguna. */
  readonly n: number;
  /**
   * `segundosAcum / n`, o `null` si `n === 0`.
   *
   * `null` y no `0`: cero segundos de ciclo es una afirmacion —«se cerraron al instante»— y no
   * hubo ninguna orden que cerrar. Es la misma distincion que el resto de la vertical hace
   * entre un cero medido y un dato ausente.
   */
  readonly promedioSegundos: number | null;
  /**
   * Instante ISO-8601 UTC en que estas cifras se leyeron DE LA BASE — no en que se sirvieron.
   * Ver `ConteoEntregasDTO`.
   */
  readonly lastSync: string;
}

/** Lo que devuelve la Server Action. Discriminado, como el resto del repo: nunca `ok` con un
 *  promedio de cero ante un denegado — «prohibido» y «no cerro ninguna» son hechos distintos. */
export type ResultadoCicloVida =
  | { readonly status: "ok"; readonly datos: CicloVidaDTO }
  | { readonly status: "unauthenticated" }
  | { readonly status: "forbidden" }
  | { readonly status: "validation_error"; readonly fieldErrors: Record<string, string[]> };
