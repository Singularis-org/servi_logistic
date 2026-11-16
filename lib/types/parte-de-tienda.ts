// SLT-174 (R661) — `ParteDeTienda` vive aquí, en un módulo de tipos SIN UN SOLO IMPORT.
//
// Antes se declaraba en `lib/utils/ingreso-empresa.ts`, que importa `Prisma` como valor. Pedirle el
// tipo a ese módulo metía `@prisma/client` en el árbol del panel del mensajero que vigila
// `pagos-captura.guardia` (R19), y por eso `marcaDeVariasTiendas` tuvo que recibir `unknown[]`.
// Este módulo no importa nada, ni de valor ni de tipo: entra en ese árbol sin hijos.
// `ingreso-empresa.ts` re-exporta ESTE tipo, no una copia.

/**
 * 💰 Ficha 396 — UNA TIENDA de un cierre, con SUS cifras. Todas STRING escala 2.
 *
 * CINCO CLAVES Y NI UNA MAS (R5). `fleteConIva` y `comisionConIva` por tienda se calculan
 * DENTRO de `partesPorTienda` —hacen falta para derivar `pagoTienda`— y NO se emiten: un
 * contrato que ofrece lo que la pantalla no debe ensenar acaba ensenandose, porque bastaria con
 * que alguien las pintara «ya que estan».
 */
export interface ParteDeTienda {
  /** La CLAVE del grupo: `cierre_detail.tienda_id`, congelado (R7). Nunca el nombre. */
  tiendaId: string;
  /** El nombre congelado, SOLO para mostrarlo. No agrupa nada (R7). */
  tiendaNombre: string;
  /**
   * Lo RECAUDADO atribuido a esta tienda. Sale de `computeTotales` sobre SUS gestiones, o sea
   * con EXACTAMENTE el mismo criterio que el `total general` del cierre entero (R13): solo las
   * `entregada`, y solo por sus lineas de pago. Puede ser "0.00" (una tienda que solo trajo
   * rechazos recauda cero y aun asi aparece, R9).
   */
  recaudado: string;
  /**
   * «Se le paga hoy» A ESTA TIENDA: lo recaudado menos TODO lo que la empresa le factura,
   * flete por rechazo + IVA incluido (SLT-169 R621). `ganaLaTienda(recaudado, total)` sobre SU
   * subconjunto. Puede ser NEGATIVO (la tienda debe) y viaja con su signo, nunca "0.00".
   */
  pagoTienda: string;
  /**
   * ALIAS de `pagoTienda`, con el MISMO valor desde SLT-169 (antes era la unica cifra que restaba
   * el flete por rechazo). Se mantiene para no ensanchar el PR; se retira en la ficha de limpieza
   * (P3 de SLT-169).
   */
  ganaLaTienda: string;
}
