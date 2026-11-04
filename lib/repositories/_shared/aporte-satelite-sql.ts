import { Prisma } from "@prisma/client";

/**
 * SLT-73 (enmienda 2, D16, R31-R33; design §2.11) — QUE CIERRES FORMAN LA DEUDA DE UNA SATELITE Y
 * CUANTO APORTA CADA UNO, escrito UNA vez para los dos lectores:
 *
 *   - `SaldosSatelitesRepository` (la fila de `/wallet/satelites`, R5) con el `where` de Prisma;
 *   - `EstadoCuentaRepository` (el estado de cuenta de la bodega, `/wallet/satelites/[zonaId]`, R31)
 *     con el fragmento SQL, porque su saldo corrido es una ventana de Postgres.
 *
 * Si cada repositorio escribiera su propio predicado, el «Pendiente de llegar» del estado de cuenta y
 * la deuda de la tabla divergirian en silencio (es lo que paso con `total_efectivo` hasta la enmienda
 * 2). El predicado SQL se construye con los MISMOS valores que el `where` de Prisma.
 */

/** Los `cierre_dia` que cuentan en la deuda: aprobados y con destino satelite (R5), consolidados o no. */
export const APORTE_SATELITE_WHERE = { estado: "aprobado", destinoTipo: "bodega_satelite" } as const;

/**
 * El mismo predicado en SQL, sobre el alias `cd` de `cierre_dia`, acotado a UNA zona destino.
 * La zona va en el `WHERE`: un cierre de otra bodega no entra en el estado de cuenta de esta.
 */
export function cuentaEnLaDeudaSql(zonaId: string): Prisma.Sql {
  return Prisma.sql`cd.estado::text = ${APORTE_SATELITE_WHERE.estado}
    AND cd.destino_tipo::text = ${APORTE_SATELITE_WHERE.destinoTipo}
    AND cd.destino_zona_id = ${zonaId}`;
}

/**
 * El aporte de UN cierre (R4), sobre el alias `cd`: `paraLaCentral(general, pago al mensajero,
 * ganancia de la satelite)` de `lib/utils/ingreso-empresa.ts`, la misma resta que `esperadoDe`.
 * La cascada es lineal, asi que Σ de estos aportes = `esperadoDe(Σ snapshots)`, que es lo que suma
 * `SaldosSatelitesRepository`. Conserva el signo: un aporte negativo NO se recorta a cero.
 * `numeric(12,2)` menos `numeric(12,2)`: exacto, sin pasar por coma flotante.
 */
export const APORTE_SATELITE_SQL = Prisma.sql`(cd.total_general - cd.total_pago_mensajero - cd.total_ingreso_bodega_rechazos)`;
