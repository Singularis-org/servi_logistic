import { randomUUID } from "node:crypto";

import { Prisma, type CierreDestinoTipo } from "@prisma/client";

import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import type { AsientosCierreDiaDeps } from "@/lib/repositories/_shared/asientos-cierre-dia";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";

import { clienteConSavepoint, type TxDeTest } from "../_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./orden-minima";

// SLT-73 · T3 — UN CIERRE DEL DIA LISTO PARA APROBAR, igual para la central y para la satelite.
//
// La siembra es la MISMA para los dos destinos; lo unico que cambia es `destino_tipo` (y quien
// aprueba: el maestro tiene alcance `bodega_central`, el adminSatelite el de su zona). Asi lo que
// difiere entre los dos tests es exactamente lo que la ficha cambia.
//
//   ENTREGA   orden de 20.000,00 contra-entrega, cobrada en efectivo; gestion de CALLE (con su
//             evento `gestion_registrada`), asi que la aprobacion la APLICA (`en_reparto` →
//             `entregado`) y escribe su historial.
//   INCIDENTE orden de 7.000,00 perdida en ruta; se indemniza al aprobar con 6.000,00.
//   CIERRE    total general 20.000,00 en efectivo; pago al mensajero 1.500,00.
//   TARIFA    congelada en `cierre_detail`: flete 2.500,00 (normal y GAM iguales, para que la
//             columna que elija `resolverFlete` no cambie la cifra), comision 3,50 %, IVA 13,00 %.
//
// Los servicios son los REALES, cableados como su composition root sobre la tx del test.

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

export const INDEMNIZACION_SLT73 = "6000.00";

export interface CierreAprobable {
  cierreId: string;
  ordenEntregaId: string;
  gestionEntregaId: string;
  gestionIncidenteId: string;
  /** Quien aprueba: el maestro (central) o el adminSatelite de la zona (satelite). */
  aprobador: Actor;
  /** T4: el maestro sembrado, quien marca recibida la consolidacion (acceso total). */
  maestroId: string;
  /** T4: el adminSatelite de la zona, quien consolida. */
  adminSatelite: Actor;
  zonaId: string;
  admin: CierresAdminService;
  estatus: { enReparto: string; entregado: string };
}

async function idEstatus(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: aplica las migraciones`);
  return fila.id;
}

export async function sembrarCierreAprobable(
  tx: TxDeTest,
  destinoTipo: CierreDestinoTipo,
): Promise<CierreAprobable> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const fks = await crearFksDeOrden(tx);
  const enReparto = await idEstatus(tx, "en_reparto");
  const entregado = await idEstatus(tx, "entregado");
  const incidente = await idEstatus(tx, "incidente");
  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const adminSat = await crearUsuarioDePrueba(tx, "adminSatelite");
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  await tx.usuario.update({ where: { id: adminSat.id }, data: { zonaId: fks.zonaId } });

  const tarifa = await tx.tarifa.create({
    data: {
      tiendaId: fks.tiendaId,
      zonaId: null,
      valorFlete: new Prisma.Decimal("2500.00"),
      valorFleteGam: new Prisma.Decimal("2500.00"),
      valorFleteDevuelto: new Prisma.Decimal("2000.00"),
      valorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
      fulfillment: new Prisma.Decimal("0.00"),
      comisionCod: new Prisma.Decimal("3.50"),
      ivaFlete: new Prisma.Decimal("13.00"),
      ivaComisionCod: new Prisma.Decimal("13.00"),
    },
    select: { id: true },
  });

  // El destino es la UNICA diferencia entre los dos tests. La zona no la lee ningun feed de dinero y
  // el alcance del maestro no filtra por zona.
  const cierre = await tx.cierreDia.create({
    data: {
      mensajeroId: mensajero.id,
      estado: "solicitado",
      destinoTipo,
      destinoZonaId: fks.zonaId,
      totalEfectivo: new Prisma.Decimal("20000.00"),
      totalSimpe: new Prisma.Decimal("0.00"),
      totalTransferencia: new Prisma.Decimal("0.00"),
      totalGeneral: new Prisma.Decimal("20000.00"),
      totalPagoMensajero: new Prisma.Decimal("1500.00"),
      totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
    },
    select: { id: true },
  });

  const orden = async (clave: string, montoCobrar: string, estatusId: string) => {
    const numRemision = `SLT73-${clave}-${sufijo}`;
    const o = await tx.orden.create({
      data: {
        numRemision,
        destinatario: `Destinatario ${clave}`,
        telefonoDest: "88880000",
        producto: `Producto ${clave}`,
        montoCobrar: new Prisma.Decimal(montoCobrar),
        cobraComision: true,
        estatusId,
        mensajeroAsignadoId: mensajero.id,
        tiendaId: fks.tiendaId,
        zonaId: fks.zonaId,
        provinciaId: fks.provinciaId,
        cantonId: fks.cantonId,
      },
      select: { id: true },
    });
    await tx.cierreDetail.create({
      data: {
        cierreId: cierre.id,
        ordenId: o.id,
        montoCobrar: new Prisma.Decimal(montoCobrar),
        cobraComision: true,
        zonaId: fks.zonaId,
        tiendaId: fks.tiendaId,
        esCentral: false,
        esZonaEspecial: false,
        tarifaId: tarifa.id,
        tarifaValorFlete: new Prisma.Decimal("2500.00"),
        tarifaValorFleteGam: new Prisma.Decimal("2500.00"),
        tarifaValorFleteDevuelto: new Prisma.Decimal("2000.00"),
        tarifaValorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
        tarifaComisionCod: new Prisma.Decimal("3.50"),
        tarifaIvaFlete: new Prisma.Decimal("13.00"),
        tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
        tarifaFulfillment: new Prisma.Decimal("0.00"),
        numRemision,
        destinatario: `Destinatario ${clave}`,
        producto: `Producto ${clave}`,
        tiendaNombre: "Tienda SLT-73",
        zonaNombre: "Zona SLT-73",
        provinciaNombre: "Cartago",
        cantonNombre: "Cartago",
      },
      select: { id: true },
    });
    return o.id;
  };

  // ENTREGA: gestion de CALLE pendiente (modelo 454): la orden sigue `en_reparto` y la aprobacion
  // la aplica.
  const ordenEntregaId = await orden("entrega", "20000.00", enReparto);
  const gEntrega = await tx.gestionOrden.create({
    data: {
      ordenId: ordenEntregaId,
      mensajeroId: mensajero.id,
      resultado: "entregado",
      cierreId: cierre.id,
      montoRecibido: new Prisma.Decimal("20000.00"),
      metodoPago: "efectivo",
      pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal("20000.00") }] },
    },
    select: { id: true },
  });
  await tx.ordenEvento.create({
    data: {
      ordenId: ordenEntregaId,
      tipo: "gestion_registrada",
      gestionOrdenId: gEntrega.id,
      familiaAplicacion: "gestion",
      resultado: "entregado",
      mensajeroId: mensajero.id,
      actorUsuarioId: mensajero.id,
      actorRol: "mensajero",
    },
  });

  // INCIDENTE: gestion LEGADA (ya aplicada al registrarse), solo para la indemnizacion.
  const ordenIncidenteId = await orden("incidente", "7000.00", incidente);
  const gIncidente = await tx.gestionOrden.create({
    data: {
      ordenId: ordenIncidenteId,
      mensajeroId: mensajero.id,
      resultado: "incidente",
      cierreId: cierre.id,
      motivo: "Paquete perdido en ruta",
      causaIncidente: "perdido",
    },
    select: { id: true },
  });

  const organizacionId = (
    await tx.cierreDia.findUniqueOrThrow({ where: { id: cierre.id }, select: { organizacionId: true } })
  ).organizacionId;

  const c = clienteConSavepoint(tx);
  const mensajeroRepo = new PagoMensajeroMovimientoRepository(c);
  const admin = new CierresAdminService(
    new CierresAdminRepository(
      c,
      new WalletMovimientoRepository(c),
      new WalletFeedService(),
      new WalletTiendaMovimientoRepository(c),
      new WalletTiendaFeedService(),
      mensajeroRepo,
      new WalletMensajeroFeedService(),
      new WalletIndemnizacionFeedService(),
    ),
    new ZonaRepository(c),
    new OrdenRepository(c),
    URLS_NO_USADAS,
    new LiquidacionPagoRepository(c),
    mensajeroRepo,
    sinRetenidas(),
  );

  return {
    cierreId: cierre.id,
    ordenEntregaId,
    gestionEntregaId: gEntrega.id,
    gestionIncidenteId: gIncidente.id,
    maestroId: maestro.id,
    adminSatelite: { usuarioId: adminSat.id, rol: "adminSatelite", organizacionId },
    zonaId: fks.zonaId,
    aprobador:
      destinoTipo === "bodega_central"
        ? { usuarioId: maestro.id, rol: "maestro", organizacionId }
        : { usuarioId: adminSat.id, rol: "adminSatelite", organizacionId },
    admin,
    estatus: { enReparto, entregado },
  };
}

/** Aprueba con la indemnizacion del incidente y sin paquetes que confirmar (no hay retornables). */
export async function aprobar(k: CierreAprobable): Promise<string> {
  const r = await k.admin.aprobarCierre(
    k.cierreId,
    k.aprobador,
    [{ gestionId: k.gestionIncidenteId, monto: INDEMNIZACION_SLT73 }],
    [],
  );
  return r.status;
}

/** Las filas de los TRES libros con origen `cierre_dia` y este cierre, en forma comparable. */
export async function filasDeLibros(tx: TxDeTest, cierreId: string) {
  const caja = await tx.$queryRawUnsafe<{ tipo: string; categoria: string; monto: string }[]>(
    `SELECT tipo::text, categoria::text, monto::text FROM wallet_movimiento
      WHERE origen_tipo = 'cierre_dia' AND origen_id = $1 ORDER BY categoria, tipo, monto`,
    cierreId,
  );
  const tienda = await tx.$queryRawUnsafe<{ tipo: string; categoria: string; monto: string }[]>(
    `SELECT tipo::text, categoria::text, monto::text FROM wallet_tienda_movimiento
      WHERE origen_tipo = 'cierre_dia' AND origen_id = $1 ORDER BY categoria, tipo, monto`,
    cierreId,
  );
  const mensajero = await tx.$queryRawUnsafe<{ tipo: string; categoria: string; monto: string }[]>(
    `SELECT tipo::text, categoria::text, monto::text FROM pago_mensajero_movimiento
      WHERE origen_tipo = 'cierre_dia' AND origen_id = $1 ORDER BY categoria, tipo, monto`,
    cierreId,
  );
  return { caja, tienda, mensajero };
}

/** Lo que NO es dinero de la aprobacion (R2): estado, actor, fecha, indemnizacion, aplicacion, historial. */
export async function efectosNoDinero(tx: TxDeTest, k: CierreAprobable) {
  const cierre = await tx.cierreDia.findUniqueOrThrow({
    where: { id: k.cierreId },
    select: { estado: true, resueltoPor: true, resueltoAt: true },
  });
  const incidente = await tx.gestionOrden.findUniqueOrThrow({
    where: { id: k.gestionIncidenteId },
    select: { indemnizacion: true },
  });
  const ordenEntrega = await tx.orden.findUniqueOrThrow({
    where: { id: k.ordenEntregaId },
    select: { estatusId: true },
  });
  const historialEntrega = await tx.ordenHistorialEstado.count({
    where: {
      ordenId: k.ordenEntregaId,
      gestionOrdenId: k.gestionEntregaId,
      estatusOrigenId: k.estatus.enReparto,
      estatusDestinoId: k.estatus.entregado,
    },
  });
  const accion = await tx.historialAccion.count({
    where: { accion: "cierre_dia_aprobado", entidadId: k.cierreId },
  });
  return {
    estado: cierre.estado,
    resueltoPorAprobador: cierre.resueltoPor === k.aprobador.usuarioId,
    conFecha: cierre.resueltoAt !== null,
    indemnizacion: incidente.indemnizacion?.toFixed(2) ?? null,
    ordenEntregaAplicada: ordenEntrega.estatusId === k.estatus.entregado,
    historialEntrega,
    accion,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SLT-73 · T4 — EL FLUJO REAL DESPUES DE APROBAR UN CIERRE SATELITE: consolidar y marcar recibido.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * CONSOLIDA la cola de la zona del adminSatelite con el servicio REAL (`solicitarCierreBodega`):
 * suma los snapshots de los cierres aprobados sin consolidar y los enlaza, como en produccion.
 * Lanza si no consolida: un test que siga sin consolidacion no probaria nada.
 */
export async function consolidar(tx: TxDeTest, adminSatelite: Actor): Promise<string> {
  const c = clienteConSavepoint(tx);
  const r = await new CierreBodegaService(
    new CierreBodegaRepository(c),
    new OrdenRepository(c),
  ).solicitarCierreBodega(adminSatelite);
  if (r.status !== "ok") throw new Error(`no se pudo consolidar: ${JSON.stringify(r)}`);
  return r.cierreBodegaId;
}

/**
 * MARCA RECIBIDA la consolidacion con el repositorio REAL. Sin `asientos`, cae en el default del
 * constructor (`ASIENTOS_POR_DEFECTO`), exactamente como las dos construcciones de produccion.
 */
export async function marcarRecibido(
  tx: TxDeTest,
  cierreBodegaId: string,
  montoRecibido: string,
  actorUsuarioId: string,
  asientos?: AsientosCierreDiaDeps,
): Promise<string> {
  const c = clienteConSavepoint(tx);
  const repo =
    asientos === undefined
      ? new CierresBodegaAdminRepository(c)
      : new CierresBodegaAdminRepository(c, asientos);
  return repo.marcarConciliado({ id: cierreBodegaId, montoRecibido, nota: null, actorUsuarioId });
}
