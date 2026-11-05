// El puerto de lectura del ciclo de vida. Contrato NEUTRAL: sin Prisma y sin Next.

import type { ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";

/**
 * Numerador y denominador, JAMAS el promedio.
 *
 * Es la regla que ya sigue el rollup diario para esta misma metrica, y no es estilo: dos
 * recortes se suman por numerador y denominador; promediar promedios da un numero que no
 * corresponde a nada. El promedio lo deriva el servicio, una vez, al final.
 */
export interface CicloCrudo {
  /** Suma de segundos entre creacion y cierre de todas las ordenes contadas. */
  readonly segundosAcum: number;
  /** Cuantas ordenes CERRADAS entraron en la suma. */
  readonly n: number;
}

export interface ICicloVidaRepository {
  /**
   * Acumula el tiempo de ciclo de las ordenes cuya GESTION FINAL (ultima gestion vigente con un
   * resultado de `RESULTADOS_DE_CIERRE`) cae en la ventana de la consulta.
   *
   * Recibe la MISMA `ConsultaConteoEntregas` que el resto de la vertical —el filtro es
   * identico a proposito, para que la barra mueva todas las lecturas a la vez—. Dos
   * diferencias con las demas, las dos deliberadas:
   *
   *   1. la VENTANA cae sobre la gestion final (`gestion_orden.created_at`), no sobre la fecha
   *      de carga de la orden;
   *   2. solo entran ordenes CERRADAS. Una orden sin gestion final no tiene fin de reloj, y no
   *      hay forma honesta de asignarle una duracion.
   */
  acumularCiclos(consulta: ConsultaConteoEntregas): Promise<CicloCrudo>;
}
