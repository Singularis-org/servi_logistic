import { Prisma } from "@prisma/client";

import { paraLaCentral } from "@/lib/utils/ingreso-empresa";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 — LA FORMULA DEL SALDO SIN CONCILIAR, ESCRITA UNA SOLA VEZ.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// MODULO PURO (sin React, sin repositorio, sin servicio). Existe porque la formula tiene ahora
// DOS lectores en el servidor y ninguno puede importar al otro sin acoplar dos repositorios:
//
//   1. `SaldosSatelitesRepository` — el saldo de una bodega y el `faltaPorRecibir` de cada
//      consolidacion en `/wallet/satelites`;
//   2. `CierreBodegaRepository.toBodegaResumenRow` — el `faltaPorRecibir` que la MISMA
//      consolidacion ensena en las superficies de `/cierres-admin`, que son las que ve la
//      bodega satelite (R26) y la central en su cola.
//
// ⚠️ POR QUE UNA SOLA DEFINICION, Y NO DOS QUE «HACEN LO MISMO»: la pantalla de la satelite y
// la de la central hablan de la MISMA consolidacion. Con dos restas, el dia que una cambie la
// bodega leeria «te faltan ₡15.000» y la central «ya llego completa», sin que nada se pusiera
// rojo. Es exactamente el defecto que la ficha 359 encontro repetido en 13 pantallas.

/**
 * R17/R18 de la 431, R8 de SLT-73 — lo que falta por llegar de lo ESPERADO.
 *
 * ⚠️ SLT-73 (D3) REABRIO LA Q2 DE LA 431. Hasta SLT-73 el minuendo era `total_efectivo`, porque el
 * SINPE «no viaja en el bulto». El humano decidio el 2026-10-31 que la deuda de la satelite cuenta
 * TODOS los metodos de pago (el SINPE es solo el medio por el que ella cobra) menos lo que le
 * pertenece: el pago a sus mensajeros y su ganancia por rechazos (D4/D7). El esperado es, por tanto,
 * `paraLaCentral(total_general, total_pago_mensajero, total_ingreso_bodega_rechazos)`, y quien
 * llama lo calcula con esa funcion; aqui solo se resta lo recibido.
 *
 * Los casos salen de UNA expresion, sin un `if` que los separe:
 *  · `recibido === null` (sin marcar) -> aporta el esperado integro;
 *  · recibido IGUAL al esperado       -> aporta `0.00`;
 *  · recibido MENOR                   -> aporta la diferencia;
 *  · recibido MAYOR, o esperado negativo -> aporta un NEGATIVO, que se devuelve tal cual sin
 *    recortar a cero — mismo criterio con el que la ficha 393 decidio ensenar «Para la central»
 *    en negativo en vez de maquillarlo.
 *
 * Money-safe: `Prisma.Decimal` de punta a punta. Quien lo emite hace el `.toFixed(2)`.
 */
export function saldoDe(
  esperado: Prisma.Decimal,
  recibido: Prisma.Decimal | null,
): Prisma.Decimal {
  return esperado.minus(recibido ?? new Prisma.Decimal(0));
}

/** Los tres snapshots que deciden lo esperado; los tienen `cierre_dia` y `cierre_bodega`. */
export interface SnapshotEsperado {
  totalGeneral: Prisma.Decimal;
  totalPagoMensajero: Prisma.Decimal;
  totalIngresoBodegaRechazos: Prisma.Decimal;
}

/**
 * SLT-73 (R4/R8) — lo que la satelite le debe entregar a la central por este snapshot: la
 * cascada B de la 393 (`paraLaCentral`), sin reescribirla. Con su signo, nunca recortado a cero.
 */
export function esperadoDe(s: SnapshotEsperado): Prisma.Decimal {
  return new Prisma.Decimal(
    paraLaCentral(
      s.totalGeneral.toFixed(2),
      s.totalPagoMensajero.toFixed(2),
      s.totalIngresoBodegaRechazos.toFixed(2),
    ),
  );
}
