import { randomUUID } from "node:crypto";

import { Prisma, type CierreDestinoTipo, type CierreEstado } from "@prisma/client";

import type { TxDeTest } from "../_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba, type UsuarioDePrueba } from "./orden-minima";

// SLT-56 — el corpus de un cierre del dia con tres gestiones, creado DENTRO de la transaccion revertida
// del test (la base recien migrada no trae usuarios, zonas ni ordenes: `orden-minima.ts`).
//
// Numeros CONOCIDOS y distintos entre si, para que cada total se pueda comprobar a mano:
//   · entrega A: pago congelado 1500.00, cobro 10000.00 en efectivo;
//   · entrega B: pago congelado 900.00 (con OTRA tarifa: si alguien re-derivara, cambiaria), cobro
//     4000.00 por SINPE;
//   · rechazo: pago 0.00, ingreso de bodega 1000.00 (lo que hoy paga 0, R6).
// Totales congelados del cierre: recaudo 14000.00, pago al mensajero 2400.00, ingreso de bodega 1000.00.
//
// La tarifa viva de la zona (1500/1000) se siembra para poder afirmar que el ajuste NO la toca (R12).

export const PAGO_A = "1500.00";
export const PAGO_B = "900.00";
export const PAGO_RECHAZO = "0.00";
export const TOTAL_PAGO_INICIAL = "2400.00";
export const INGRESO_BODEGA_INICIAL = "1000.00";

export interface Corpus56 {
  organizacionId: string;
  cierreId: string;
  destinoZonaId: string;
  gestionA: string;
  gestionB: string;
  gestionRechazo: string;
  numGuiaA: number;
  mensajero: UsuarioDePrueba;
  /** Quien ajusta: un `admin` de la misma empresa. */
  admin: UsuarioDePrueba;
  tarifaId: string;
}

export interface OpcionesCorpus56 {
  estado?: CierreEstado;
  destinoTipo?: CierreDestinoTipo;
}

/** Guia unica por corrida: `orden.num_guia` es UNIQUE global (SL-18). */
let siguienteGuia = 960_000_000 + Math.floor(Math.random() * 30_000_000);

export async function sembrarCierre56(tx: TxDeTest, opciones: OpcionesCorpus56 = {}): Promise<Corpus56> {
  const { estado = "solicitado", destinoTipo = "bodega_central" } = opciones;
  const [{ org }] = await tx.$queryRawUnsafe<{ org: string }[]>(
    `SELECT current_setting('app.organizacion_id', true) AS org`,
  );
  if (!org) throw new Error("sembrarCierre56: la transaccion no tiene empresa fijada");

  const fks = await crearFksDeOrden(tx);
  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const admin = await crearUsuarioDePrueba(tx, "admin");

  const tarifa = await tx.tarifaZonaMensajero.create({
    data: {
      zonaId: fks.zonaId,
      vehiculoId: null,
      cobroEntregado: new Prisma.Decimal("1500.00"),
      cobroRechazado: new Prisma.Decimal("1000.00"),
    },
    select: { id: true },
  });

  const resuelto = estado === "aprobado" || estado === "rechazado";
  const cierre = await tx.cierreDia.create({
    data: {
      mensajeroId: mensajero.id,
      estado,
      destinoTipo,
      destinoZonaId: fks.zonaId,
      totalEfectivo: new Prisma.Decimal("10000.00"),
      totalSimpe: new Prisma.Decimal("4000.00"),
      totalTransferencia: new Prisma.Decimal("0.00"),
      totalGeneral: new Prisma.Decimal("14000.00"),
      totalPagoMensajero: new Prisma.Decimal(TOTAL_PAGO_INICIAL),
      totalIngresoBodegaRechazos: new Prisma.Decimal(INGRESO_BODEGA_INICIAL),
      ...(resuelto
        ? {
            resueltoPor: admin.id,
            resueltoAt: new Date(),
            motivoRechazo: estado === "rechazado" ? "faltan comprobantes" : null,
          }
        : {}),
    },
    select: { id: true },
  });

  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const nuevaOrden = async (clave: string) => {
    siguienteGuia += 1;
    const numGuia = siguienteGuia;
    const o = await tx.orden.create({
      data: {
        numGuia,
        numRemision: `R-56-${sufijo}-${clave}`,
        destinatario: "Corpus 56",
        telefonoDest: "88880000",
        producto: "caja",
        estatusId: fks.estatusId,
        tiendaId: fks.tiendaId,
        zonaId: fks.zonaId,
        provinciaId: fks.provinciaId,
        cantonId: fks.cantonId,
      },
      select: { id: true },
    });
    return { id: o.id, numGuia };
  };

  const ordenA = await nuevaOrden("a");
  const gestionA = await tx.gestionOrden.create({
    data: {
      ordenId: ordenA.id,
      mensajeroId: mensajero.id,
      resultado: "entregado",
      montoRecibido: new Prisma.Decimal("10000.00"),
      cierreId: cierre.id,
      pagoMensajero: new Prisma.Decimal(PAGO_A),
      ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
      pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal("10000.00") }] },
    },
    select: { id: true },
  });

  const ordenB = await nuevaOrden("b");
  const gestionB = await tx.gestionOrden.create({
    data: {
      ordenId: ordenB.id,
      mensajeroId: mensajero.id,
      resultado: "entregado",
      montoRecibido: new Prisma.Decimal("4000.00"),
      cierreId: cierre.id,
      pagoMensajero: new Prisma.Decimal(PAGO_B),
      ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
      pagos: { create: [{ metodo: "SINPE", monto: new Prisma.Decimal("4000.00") }] },
    },
    select: { id: true },
  });

  const ordenR = await nuevaOrden("r");
  const gestionRechazo = await tx.gestionOrden.create({
    data: {
      ordenId: ordenR.id,
      mensajeroId: mensajero.id,
      resultado: "devolucion_a_origen_por_rechazo",
      motivo: "el cliente no lo quiso",
      cierreId: cierre.id,
      pagoMensajero: new Prisma.Decimal(PAGO_RECHAZO),
      ingresoBodegaRechazo: new Prisma.Decimal(INGRESO_BODEGA_INICIAL),
    },
    select: { id: true },
  });

  return {
    organizacionId: org,
    cierreId: cierre.id,
    destinoZonaId: fks.zonaId,
    gestionA: gestionA.id,
    gestionB: gestionB.id,
    gestionRechazo: gestionRechazo.id,
    numGuiaA: ordenA.numGuia,
    mensajero,
    admin,
    tarifaId: tarifa.id,
  };
}
