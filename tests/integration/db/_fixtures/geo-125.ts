import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import type { TxDeTest } from "../_postgres-real";
import { crearEscenarioGeo47, DATOS_PERSONALES_GEO47, type EmpresaGeo47, type EscenarioGeo47 } from "./geo-47";
import { crearUsuarioDePrueba } from "./orden-minima";
import { comoDueno } from "./pais-20";

// SLT-125 (T1.3; design §13) — el escenario de la presentacion con la ruta del catalogo, sobre `geo-47.ts`
// (Costa Rica y `XA`, que tiene su nivel 4 «Sector» solo en el catalogo).
//
// Por empresa, ademas de lo de `geo-47`, un mensajero PROPIO con tres ordenes y una gestion vigente sin
// cierre en cada una:
//
//   orden                     lugar                                       gestion
//   ────────────────────────  ──────────────────────────────────────────  ───────────────────────────────
//   conDistrito               provincia (geo-44) · Central · San Rafael    entregado
//   sinDistrito               provincia (geo-44) · Central                 entregado
//   conDistritoOtraProvincia  Central · Central · San Rafael               devolucion_a_origen_por_rechazo
//
// - El mensajero es nuevo para que un cierre suyo se lleve SOLO estas tres gestiones, y no las de
//   `geo-65`.
// - El cierre no se crea aqui: lo pide el test por el repositorio (`paraSolicitarCierre`), porque lo
//   que se prueba es lo que escribe `crearCierre`.
// - Las ordenes estan en la zona central y en `en_preparacion`, como las de `geo-47`. Ninguna esta en
//   el nivel 4: las FK de `orden` llegan como mucho a `distrito` (P1 = B).
//
// Los datos personales son los de `geo-65`. Se escribe como DUEÑO dentro del `tx` de un test que se
// revierte, y deja la transaccion como dueño.

export interface OrdenesGeo125 {
  conDistritoId: string;
  sinDistritoId: string;
  conDistritoOtraProvinciaId: string;
}

/** Lo que `CierreDiaRepository.crearCierre` necesita para cerrar las gestiones de este fixture. */
export interface SolicitudCierreGeo125 {
  mensajeroId: string;
  destinoTipo: "bodega_central";
  destinoZonaId: string;
}

export interface EmpresaGeo125 {
  geo47: EmpresaGeo47;
  empresaId: string;
  mensajeroId: string;
  ordenes: OrdenesGeo125;
  /** Las gestiones vigentes sin cierre del mensajero, en el orden de `ordenes`. */
  gestionesSinCierreIds: string[];
  paraSolicitarCierre: SolicitudCierreGeo125;
}

export interface EscenarioGeo125 {
  geo47: EscenarioGeo47;
  cr: EmpresaGeo125;
  xa: EmpresaGeo125;
}

export { DATOS_PERSONALES_GEO47 as DATOS_PERSONALES_GEO125 };

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'caja', now(), now())`;

async function idDeEstado(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: aplica las migraciones`);
  return fila.id;
}

type ResultadoGeo125 = "entregado" | "devolucion_a_origen_por_rechazo";

async function gestion(tx: TxDeTest, ordenId: string, mensajeroId: string, resultado: ResultadoGeo125, monto: string): Promise<string> {
  const entregado = resultado === "entregado";
  const fila = await tx.gestionOrden.create({
    data: {
      ordenId,
      mensajeroId,
      resultado,
      ...(entregado
        ? {
            montoRecibido: new Prisma.Decimal(monto),
            pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(monto) }] },
          }
        : { motivo: "rechazo del fixture SLT-125" }),
    },
    select: { id: true },
  });
  return fila.id;
}

/** Siembra lo de SLT-125 sobre una empresa de `geo-47` ya creada. */
export async function sembrarEmpresaGeo125(tx: TxDeTest, e: EmpresaGeo47): Promise<EmpresaGeo125> {
  const { base } = e.base;
  await comoDueno(tx);
  await fijarEmpresa(tx, base.empresaId);

  const estado = await idDeEstado(tx, "en_preparacion");
  const [destinatario, telefono, direccion] = DATOS_PERSONALES_GEO47;
  const orden = async (provinciaId: string, cantonId: string, distritoId: string | null, monto: string) => {
    const ordenId = randomUUID();
    await tx.$executeRawUnsafe(
      INSERTAR_ORDEN,
      ordenId,
      `SLT125-${ordenId.slice(0, 8)}`,
      estado,
      destinatario,
      telefono,
      direccion,
      base.tiendaId,
      base.zonas.centralId,
      provinciaId,
      cantonId,
      distritoId,
      monto,
    );
    return ordenId;
  };

  const h = e.homonimos;
  const ordenes: OrdenesGeo125 = {
    conDistritoId: await orden(base.geo.provinciaId, h.cantonCentral1Id, h.sanRafael1Id, "12500"),
    sinDistritoId: await orden(base.geo.provinciaId, h.cantonCentral1Id, null, "12510"),
    conDistritoOtraProvinciaId: await orden(h.provinciaCentralId, h.cantonCentral2Id, h.sanRafael2Id, "12520"),
  };

  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const gestionesSinCierreIds = [
    await gestion(tx, ordenes.conDistritoId, mensajero.id, "entregado", "12500"),
    await gestion(tx, ordenes.sinDistritoId, mensajero.id, "entregado", "12510"),
    await gestion(tx, ordenes.conDistritoOtraProvinciaId, mensajero.id, "devolucion_a_origen_por_rechazo", "0"),
  ];

  return {
    geo47: e,
    empresaId: base.empresaId,
    mensajeroId: mensajero.id,
    ordenes,
    gestionesSinCierreIds,
    paraSolicitarCierre: { mensajeroId: mensajero.id, destinoTipo: "bodega_central", destinoZonaId: base.zonas.centralId },
  };
}

export async function crearEscenarioGeo125(tx: TxDeTest): Promise<EscenarioGeo125> {
  const geo47 = await crearEscenarioGeo47(tx);
  const cr = await sembrarEmpresaGeo125(tx, geo47.cr);
  const xa = await sembrarEmpresaGeo125(tx, geo47.xa);
  await comoDueno(tx);
  return { geo47, cr, xa };
}
