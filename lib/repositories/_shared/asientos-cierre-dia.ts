import type {
  IWalletMovimientoRepository,
  WalletTxClient,
} from "@/lib/interfaces/repositories/IWalletMovimientoRepository";
import type {
  IWalletTiendaMovimientoRepository,
  WalletTiendaTxClient,
} from "@/lib/interfaces/repositories/IWalletTiendaMovimientoRepository";
import type {
  IPagoMensajeroMovimientoRepository,
  PagoMensajeroTxClient,
} from "@/lib/interfaces/repositories/IPagoMensajeroMovimientoRepository";
import type { IWalletFeedService, WalletFeedTxClient } from "@/lib/interfaces/services/IWalletFeedService";
import type {
  IWalletTiendaFeedService,
  WalletTiendaFeedTxClient,
} from "@/lib/interfaces/services/IWalletTiendaFeedService";
import type {
  IWalletMensajeroFeedService,
  WalletMensajeroFeedTxClient,
} from "@/lib/interfaces/services/IWalletMensajeroFeedService";
import type {
  IWalletIndemnizacionFeedService,
  WalletIndemnizacionFeedTxClient,
} from "@/lib/interfaces/services/IWalletIndemnizacionFeedService";
import type { CajaCodFeedTxClient, ICajaCodFeedService } from "@/lib/interfaces/services/ICajaCodFeedService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { CajaCodFeedService } from "@/lib/services/CajaCodFeedService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";

/**
 * SLT-73 (design §2.1) — LOS ASIENTOS DE DINERO DE UN CIERRE DEL DIA, en un solo sitio.
 *
 * Es el bloque que la aprobacion de un cierre ejecutaba dentro de su transaccion
 * (`CierresAdminRepository.resolverCierre`), MOVIDO SIN CAMBIOS y en el MISMO orden. Lo llaman:
 *   · la aprobacion de un cierre con destino `bodega_central` (R3), igual que antes de la ficha;
 *   · la marca de conciliacion de una consolidacion satelite (R10, T4), por cada cierre que incluye.
 * Asi un cierre satelite conciliado queda en los tres libros EXACTAMENTE como uno de la central:
 * mismas categorias, mismos montos y mismo origen (`cierre_dia`, su id).
 *
 * EL ORDEN NO ES ESTETICO: la 173 (COD a la caja) LEE del libro por tienda lo que la 43 acaba de
 * escribir, y la 158 (egreso de indemnizacion) LEE `gestion_orden.indemnizacion`, que el llamador
 * tiene que haber persistido ANTES de llamar aqui (la aprobacion lo hace; es dato de la gestion).
 *
 * IDEMPOTENTE por el unico parcial `(origen_tipo, origen_id, categoria)` de cada libro y el
 * `skipDuplicates` de los tres `crearMovimientos`: llamarlo dos veces para el mismo cierre no
 * duplica ninguna fila (R12).
 *
 * Todo corre sobre el `tx` del llamador: si un insert falla, la transaccion entera revierte.
 */

/** Lo que el bloque toca del `tx`: la union de lo que piden los cinco feeds y los tres libros. */
export type AsientosCierreDiaTx = WalletTxClient &
  WalletTiendaTxClient &
  PagoMensajeroTxClient &
  WalletFeedTxClient &
  WalletTiendaFeedTxClient &
  WalletMensajeroFeedTxClient &
  WalletIndemnizacionFeedTxClient &
  CajaCodFeedTxClient;

/**
 * Las dependencias del bloque: los feeds que construyen los movimientos y los repositorios que los
 * insertan. De los repositorios solo se usa `crearMovimientos`, que escribe en el `tx` que recibe.
 */
export interface AsientosCierreDiaDeps {
  walletMovimientoRepo: Pick<IWalletMovimientoRepository, "crearMovimientos">;
  walletFeedService: IWalletFeedService;
  walletTiendaMovimientoRepo: Pick<IWalletTiendaMovimientoRepository, "crearMovimientos">;
  walletTiendaFeedService: IWalletTiendaFeedService;
  pagoMensajeroMovimientoRepo: Pick<IPagoMensajeroMovimientoRepository, "crearMovimientos">;
  walletMensajeroFeedService: IWalletMensajeroFeedService;
  walletIndemnizacionFeedService: IWalletIndemnizacionFeedService;
  cajaCodFeed: ICajaCodFeedService;
}

/**
 * Los repositorios reales, construidos la PRIMERA vez que hacen falta y no al importar el modulo:
 * importar este archivo no debe abrir un cliente de base (lo importan suites sin base).
 * `crearMovimientos` escribe en el `tx` que recibe, no en el cliente del constructor; el cliente es
 * el de la app, como en el composition root (`lib/actions/cierres-admin.ts`).
 */
let reposReales: {
  caja: WalletMovimientoRepository;
  tienda: WalletTiendaMovimientoRepository;
  mensajero: PagoMensajeroMovimientoRepository;
} | null = null;

function repos() {
  if (reposReales === null) {
    const prisma = getPrismaClient();
    reposReales = {
      caja: new WalletMovimientoRepository(prisma),
      tienda: new WalletTiendaMovimientoRepository(prisma),
      mensajero: new PagoMensajeroMovimientoRepository(prisma),
    };
  }
  return reposReales;
}

/**
 * Las implementaciones REALES, por defecto. Sigue el molde de `CAJA_COD_FEED`
 * (`CierresAdminRepository`): un llamador que no inyecta nada escribe de verdad y no deja un camino
 * mudo (los feeds no tienen estado ni dependencias propias).
 */
export const ASIENTOS_POR_DEFECTO: AsientosCierreDiaDeps = {
  walletMovimientoRepo: { crearMovimientos: (tx, movs) => repos().caja.crearMovimientos(tx, movs) },
  walletFeedService: new WalletFeedService(),
  walletTiendaMovimientoRepo: { crearMovimientos: (tx, movs) => repos().tienda.crearMovimientos(tx, movs) },
  walletTiendaFeedService: new WalletTiendaFeedService(),
  pagoMensajeroMovimientoRepo: { crearMovimientos: (tx, movs) => repos().mensajero.crearMovimientos(tx, movs) },
  walletMensajeroFeedService: new WalletMensajeroFeedService(),
  walletIndemnizacionFeedService: new WalletIndemnizacionFeedService(),
  cajaCodFeed: new CajaCodFeedService(),
};

/**
 * SLT-73 (R22) — la FECHA de los asientos. La aprobacion de la central NO la pasa: sus filas caen en
 * el `DEFAULT CURRENT_TIMESTAMP` de cada libro, exactamente como antes de la ficha (R3). La marca de
 * conciliacion de una satelite SI la pasa —el instante de la marca—, porque el dinero entra a los
 * libros cuando se concilia y no cuando se aprobo el cierre del dia. Con el default, ademas, la fila
 * quedaria con el inicio de la transaccion y no con el instante que la marca escribe en
 * `cierre_bodega.conciliado_at`.
 */
function fechar<T extends { fechaMovimiento?: Date }>(movs: T[], fechaMovimiento: Date | undefined): T[] {
  if (fechaMovimiento === undefined) return movs;
  return movs.map((m) => ({ ...m, fechaMovimiento }));
}

export async function asentarCierreDia(
  tx: AsientosCierreDiaTx,
  cierreId: string,
  deps: AsientosCierreDiaDeps = ASIENTOS_POR_DEFECTO,
  fechaMovimiento?: Date,
): Promise<void> {
  const movs = fechar(
    await deps.walletFeedService.construirMovimientosDeIngreso(cierreId, tx),
    fechaMovimiento,
  );
  await deps.walletMovimientoRepo.crearMovimientos(tx, movs); // R6/R13: idempotente
  // Feature 43/T10 (R5/R7/R12/R13): TRAS alimentar la 42, alimenta el LEDGER por tienda
  // en la MISMA tx (todo-o-nada: si falla, rollback de la aprobacion Y de la 42).
  const movsTienda = fechar(
    await deps.walletTiendaFeedService.construirMovimientosPorTienda(cierreId, tx),
    fechaMovimiento,
  );
  await deps.walletTiendaMovimientoRepo.crearMovimientos(tx, movsTienda); // R6/R13: idempotente

  // Feature 173/T B.2 (design §3.1, R11/R12/R15): TRAS acreditar el ledger por tienda, el
  // CONTRA-ENTREGA entra en la CAJA PRINCIPAL, en la MISMA tx (todo-o-nada: si el insert
  // falla, la aprobacion entera revierte y no queda un cierre aprobado sin su COD).
  //
  // El orden respecto a la linea de arriba NO es estetico y no se sostiene en este
  // comentario: el feed LEE del ledger los creditos que `crearMovimientos` acaba de
  // escribir (R12), asi que invertirlo dejaria la caja sin el ingreso.
  // `cierres-admin-caja-cod.test.ts` lo afirma midiendo el orden real de las llamadas.
  //
  // La guardia es la transcripcion literal del antecedente de R13 —«si un cierre no
  // acredita contra-entrega alguno»—: la acreditacion es exactamente el credito
  // `cod_recaudado` que el feed de la 43 acaba de construir. Si no lo hay, no hay nada
  // que leer ni que emitir. NO decide el MONTO (eso sale del ledger y solo del ledger):
  // decide si hay algo que preguntar.
  const acreditoCod = movsTienda.some(
    (m) => m.tipo === "credito" && m.categoria === "cod_recaudado",
  );
  if (acreditoCod) {
    const ingresoCod = fechar(
      await deps.cajaCodFeed.construirIngresoCod(cierreId, tx),
      fechaMovimiento,
    );
    if (ingresoCod.length > 0) {
      // R14/R48: idempotente por el indice unico parcial (origen_tipo, origen_id,
      // categoria) de la 42. Re-aprobar NO emite un segundo ingreso, y la barrera es la
      // base, no un `if` de aqui.
      await deps.walletMovimientoRepo.crearMovimientos(tx, ingresoCod);
    }
  }

  // Feature 44/T10 (R5/R7/R11/R12/R17): TRAS 42 y 43, alimenta el LIBRO del pago por
  // mensajero EN LA MISMA tx (todo-o-nada). El feed lee el cierre una vez y devuelve el
  // libro (devengo + pago) Y el egreso egreso_pago_mensajero=P para la caja 42 (Qa=SI).
  const movsMensajero = await deps.walletMensajeroFeedService.construirMovimientosDePago(
    cierreId,
    tx,
  );
  await deps.pagoMensajeroMovimientoRepo.crearMovimientos(
    tx,
    fechar(movsMensajero.libro, fechaMovimiento),
  ); // R6/R12: idempotente
  // Qa (R17): el egreso del costo total P se inserta con el repo de la 42, idempotente por
  // el constraint existente (origen_tipo, origen_id, categoria) -> un egreso por cierre. Se
  // toca la caja 42 SOLO si hay egreso (P>0); si P=0 el feed no lo emite y no se re-inserta.
  if (movsMensajero.egresoCaja.length > 0) {
    await deps.walletMovimientoRepo.crearMovimientos(
      tx,
      fechar(movsMensajero.egresoCaja, fechaMovimiento),
    );
  }

  // Feature 158 (T1.14, R26/R27/R28): TRAS 42/43/44, el EGRESO de indemnizacion, en la
  // MISMA tx. El feed lee de la base la suma de `gestion_orden.indemnizacion` de las
  // gestiones `incidente` de ESTE cierre —lo que el llamador acaba de escribir—
  // y devuelve 0 o 1 movimiento. Cierre sin incidentes -> lista vacia -> ni una fila en
  // 0.00 (R27). Se inserta con el repo de la 42, idempotente por el indice unico parcial
  // `(origen_tipo, origen_id, categoria)`: reintentar la aprobacion NO duplica (R28).
  const egresoIndemnizacion = fechar(
    await deps.walletIndemnizacionFeedService.construirEgresoIndemnizacion(cierreId, tx),
    fechaMovimiento,
  );
  if (egresoIndemnizacion.length > 0) {
    await deps.walletMovimientoRepo.crearMovimientos(tx, egresoIndemnizacion);
  }
}
