import { aprobarCierre, solicitarCierre } from "./cierres";
import {
  baseReparto,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  llevarA,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./reparto";

/**
 * SL-44 T6.3 (design D4/D5; R7, R8) — EL ESCENARIO DE CAJA de `wallet`, `mi-wallet` y
 * `wallet-mensajeros`. Ningún movimiento de dinero se escribe a mano: todos nacen de APROBAR un
 * cierre real (`CierresAdminService.aprobarCierre`, por `./cierres.ts`), que es lo que alimenta, en la
 * misma transacción, la caja de la empresa, el libro de la tienda y el del mensajero.
 *
 * ── API ──────────────────────────────────────────────────────────────────────────────────────────
 *
 *   crearEscenarioCaja(etiqueta) → CajaE2E
 *     Empresa nueva (`crearEscenarioReparto`) con la tarifa de abajo, un mensajero de la zona
 *     CENTRAL y dos órdenes de la tienda, las dos llevadas a `en_reparto` y ENTREGADAS por
 *     `MisAsignacionesService.gestionar`:
 *       - `conCod`: cobra 8.000, pagados 1.000 en efectivo + 7.000 por transferencia;
 *       - `sinCod`: sin cobro.
 *     El mensajero solicita el cierre (`CierreDiaService`) y lo aprueba el maestro (zona central).
 *
 *   importe(n) → RegExp del importe entero `n` como lo pinta la pantalla (separadores tolerantes).
 *
 *   movimientosCajaDe(r) → filas de `wallet_movimiento` de la empresa (lectura, para el diagnóstico
 *     y para comprobar lo que registró la pantalla).
 *
 * ── Lo que el escenario FIJA (de ahí salen las cifras que cada spec escribe a mano) ───────────────
 *   - flete 2.000 en las cuatro columnas de la tarifa (central o no, GAM o no: el mismo número),
 *     sin comisión ni IVA;
 *   - pago al mensajero 1.500 por entrega (las dos zonas);
 *   - nada más mueve la caja de esta empresa: es nueva y no tiene saldo inicial.
 *
 * El cobro de la plataforma por orden (SL-40) NO entra en ninguna cifra de la caja (D10 de SL-40:
 * «no sale de la caja»), así que ningún spec de este escenario depende de su valor global ni lo afirma.
 */

export const TARIFA_CAJA = {
  valorFlete: 2000,
  valorFleteGam: 2000,
  valorFleteDevuelto: 1000,
  valorFleteDevueltoGam: 1000,
  comisionCod: 0,
  ivaFlete: 0,
  ivaComisionCod: 0,
} as const;

export const PAGO_MENSAJERO_CAJA = { cobroEntregado: 1500, cobroRechazado: 164 } as const;

export interface CajaE2E {
  r: RepartoE2E;
  mensajero: MensajeroE2E;
  conCod: OrdenE2E;
  sinCod: OrdenE2E;
  cierreId: string;
}

export async function crearEscenarioCaja(etiqueta: string): Promise<CajaE2E> {
  const r = await crearEscenarioReparto(etiqueta, { tarifa: TARIFA_CAJA, tarifaMensajero: PAGO_MENSAJERO_CAJA });
  const mensajero = await crearMensajero(r, "central");

  const conCod = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 8000 }), "en_reparto", { mensajero });
  const sinCod = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero });

  await gestionar(r, conCod, mensajero, {
    resultado: "entregado",
    pagos: [
      { metodo: "efectivo", monto: 1000 },
      { metodo: "transferencia", monto: 7000 },
    ],
  });
  await gestionar(r, sinCod, mensajero, { resultado: "entregado" });

  const cierreId = await solicitarCierre(r, mensajero);
  await aprobarCierre(r, cierreId);

  for (const o of [conCod, sinCod]) {
    const estado = await estadoDe(o);
    // La aprobación es la que mueve la orden (ficha 454): si sigue en reparto, el cierre no se aplicó.
    if (estado === "en_reparto") {
      throw new Error(`SL-44 E2E caja: la orden ${o.numRemision} sigue «${estado}» tras aprobar el cierre.`);
    }
  }
  return { r, mensajero, conCod, sinCod, cierreId };
}

/**
 * Un importe entero tal como lo pinta la pantalla, tolerante al separador de miles y a los decimales
 * en cero: el símbolo y los separadores salen de configuración (`lib/config/moneda`), no del contrato.
 * `importe(4500)` casa «4.500», «4,500», «4 500» y «4.500,00», y no casa «14.500» ni «4.5001».
 */
export function importe(n: number): RegExp {
  if (!Number.isInteger(n) || n < 0) throw new Error(`importe(${n}): solo enteros no negativos`);
  const digitos = String(n);
  const grupos: string[] = [];
  for (let fin = digitos.length; fin > 0; fin -= 3) grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin));
  return new RegExp(`(?<![\\d.,])${grupos.join("[.,\\s\\u00a0\\u202f]?")}(?:[.,]00)?(?![\\d.,]\\d)(?!\\d)`);
}

export async function movimientosCajaDe(r: RepartoE2E) {
  return baseReparto().walletMovimiento.findMany({
    where: { organizacionId: r.empresa.organizacionId },
    orderBy: { createdAt: "asc" },
    select: { tipo: true, categoria: true, monto: true, origenTipo: true, descripcion: true },
  });
}
