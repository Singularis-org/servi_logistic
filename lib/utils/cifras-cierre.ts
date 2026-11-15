import type { CierreTotales, TotalesIngresoEmpresa } from "@/lib/interfaces/services/ICierreDiaService";
import {
  cobradoSobreRecaudado,
  ganaLaTienda,
  gananciaEmpresa,
  netoEmpresa,
  pagoTiendaEmpresa,
  partesPorTienda,
  totalesIngresoEmpresa,
  type GestionDeTienda,
  type ParteDeTienda,
} from "@/lib/utils/ingreso-empresa";
import { facturadoSinIva, ivaFacturado } from "@/lib/utils/iva-cierre";

/**
 * SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (R380, R381) — los tres snapshots
 * del cierre de los que salen sus cifras. Se LEEN de `cierre_dia`; nunca se recomputan.
 */
export interface SnapshotsCierre {
  /** `total_efectivo`, `total_simpe`, `total_transferencia` y `total_general`. */
  totales: CierreTotales;
  /** `total_pago_mensajero` (feature 39). */
  totalPagoMensajero: string;
  /** `total_ingreso_bodega_rechazos` (feature 56). */
  totalIngresoBodegaRechazos: string;
}

/** SLT-140 (R380, R381) — las cifras de un cierre que pintan el detalle y la hoja «Cierres». */
export interface CifrasCierre {
  totalesIngreso: TotalesIngresoEmpresa;
  ivaFacturado: string;
  ganancia: string;
  pagoTienda: string;
  cobradoSobreRecaudado: string;
  netoEmpresa: string;
  ganaLaTienda: string;
  partesPorTienda: ParteDeTienda[];
}

/**
 * SLT-140 (R380, R381) — las cifras de UN cierre a partir de sus snapshots y de sus gestiones con el
 * desglose congelado. Es el bloque que vivia dentro de `CierresAdminService.verCierreDetalle`, movido
 * tal cual (mismas funciones, mismos argumentos): el detalle y el Excel llaman a ESTA funcion, asi que
 * la misma plata no puede leerse distinta segun por donde se entre.
 *
 * Pura y money-safe: cada cifra sale de las funciones de `ingreso-empresa.ts` / `iva-cierre.ts`, que
 * operan con `Prisma.Decimal` sobre STRING. Aqui no se suma ni se resta nada a mano.
 *
 *  - `ganancia` y `netoEmpresa` restan desde lo facturado SIN IVA (SL-39); `totalesIngreso.total` lo lleva.
 *  - `pagoTienda` = recaudado − flete − comision (con IVA): no resta el flete por rechazo (ficha 301).
 *  - `ganaLaTienda` = recaudado − todo lo facturado; puede ser negativo y viaja con su signo (395).
 *  - `partesPorTienda` reparte las dos anteriores por tienda con las MISMAS funciones (396), en el
 *    orden que les da `partesPorTienda` (de mayor a menor pago).
 */
export function cifrasDelCierre(
  c: SnapshotsCierre,
  gestiones: ReadonlyArray<GestionDeTienda>,
): CifrasCierre {
  // Totales por concepto, sumados desde el MISMO desglose por orden que se ve en las tablas.
  const totalesIngreso = totalesIngresoEmpresa([...gestiones]);
  // SL-39 (R21–R23): el IVA de lo facturado no es de la empresa.
  const sinIva = facturadoSinIva(totalesIngreso);
  // Ganancia: lo facturado sin IVA menos el pago al mensajero (snapshot, R4).
  const ganancia = gananciaEmpresa(sinIva, c.totalPagoMensajero);
  // Pago a la tienda: lo RECIBIDO menos flete y comision con IVA.
  const pagoTienda = pagoTiendaEmpresa(
    c.totales.general,
    totalesIngreso.fleteConIva,
    totalesIngreso.comisionConIva,
  );
  // Feature 395: la linea puente y el neto (lo facturado sin IVA menos los DOS pagos de la empresa).
  const cobrado = cobradoSobreRecaudado(totalesIngreso.fleteConIva, totalesIngreso.comisionConIva);
  const neto = netoEmpresa(sinIva, c.totalPagoMensajero, c.totalIngresoBodegaRechazos);
  // Feature 395: lo que la tienda gana en total (`ganaLaTienda + totalesIngreso.total === general`).
  const ganaTienda = ganaLaTienda(c.totales.general, totalesIngreso.total);
  // Ficha 396: la particion por tienda, con las mismas funciones sobre cada subconjunto.
  const partes = partesPorTienda(gestiones);
  return {
    totalesIngreso,
    ivaFacturado: ivaFacturado(totalesIngreso),
    ganancia,
    pagoTienda,
    cobradoSobreRecaudado: cobrado,
    netoEmpresa: neto,
    ganaLaTienda: ganaTienda,
    partesPorTienda: partes,
  };
}
