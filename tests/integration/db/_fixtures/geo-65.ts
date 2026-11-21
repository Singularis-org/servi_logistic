import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import type { TxDeTest } from "../_postgres-real";
import { crearEscenarioGeo44, type EmpresaGeo44, type EscenarioGeo44 } from "./geo-44";
import { crearUsuarioDePrueba } from "./orden-minima";
import { comoDueno } from "./pais-20";

// SLT-65 (T0.2; design §14) — el escenario de las consultas que pasan al catalogo, sobre `geo-44.ts`.
// Lo comparten los tests de ordenes (T2.4), cierres y conteo (T3) y zona (T4).
//
// Por empresa (Costa Rica y `XA`), ademas de lo de `geo-44` (cuya geografia se dibuja alli):
//
//   orden                          lugar                      zona     estado             gestion vigente
//   ─────────────────────────────  ─────────────────────────  ───────  ─────────────────  ───────────────
//   conDistritoConMarca (geo-44)   d. central (marca)         central  en_preparacion     entregado
//   sinDistrito (geo-44)           canton                     central  en_preparacion     —
//   conDistritoSinMarca            d. dos zonas               norte    en_preparacion     rechazo
//   enDistritoSinZona              d. sin zona                central  en_preparacion     —
//   bajoCantonRetirado             d. bajo retirado (marca)   sur      en_preparacion     entregado
//   sinDistritoGestionada          canton                     central  en_preparacion     entregado
//   sinDistritoCantonRetirado      canton retirado            sur      en_preparacion     —
//   entregada                      d. dos zonas               norte    entregado (term.)  —
//   desalineada                    d. central                 norte    en_preparacion     —
//   desalineadaEnEstante           d. central                 norte    en_bodega_satelite —
//   desalineadaEnCierre            d. central                 norte    en_preparacion     entregado, en el cierre
//
// - Las cuatro gestiones vigentes sin cierre son del mismo mensajero: es lo que se lleva un cierre
//   nuevo (T3).
// - El cierre creado (`cierreId`) tiene una gestion y una fila de `cierre_detail` con lo que hoy se
//   congela, para la orden `desalineadaEnCierre`.
// - La zona central cubre el distrito central. Las tres «desalineadas» estan en la zona norte: un
//   guardado de la zona central mueve `desalineada`, retiene la del estante y no toca la del cierre
//   (T4). `sinDistrito` y `enDistritoSinZona` no tienen gestion que las excluya, para la herencia de
//   la zona inyectada en el canton.
// - Todas las ordenes tienen la cadena coherente. La incoherente se siembra aparte, con
//   `sembrarOrdenIncoherente`, porque solo la quieren la contraprueba de R11 y el script (R22).
//
// Se escribe como DUEÑO dentro del `tx` de un test que se revierte, y deja la transaccion como dueño.

export interface OrdenesGeo65 {
  conDistritoConMarcaId: string;
  sinDistritoId: string;
  conDistritoSinMarcaId: string;
  enDistritoSinZonaId: string;
  bajoCantonRetiradoId: string;
  sinDistritoGestionadaId: string;
  sinDistritoCantonRetiradoId: string;
  entregadaId: string;
  desalineadaId: string;
  desalineadaEnEstanteId: string;
  desalineadaEnCierreId: string;
}

export interface EmpresaGeo65 {
  base: EmpresaGeo44;
  mensajeroId: string;
  ordenes: OrdenesGeo65;
  /** Las gestiones vigentes sin cierre del mensajero: las que se lleva un cierre nuevo. */
  gestionesSinCierreIds: string[];
  /** El cierre ya creado, con su gestion y su fila de `cierre_detail`. */
  cierreId: string;
  gestionEnCierreId: string;
  cierreDetailId: string;
}

export interface EscenarioGeo65 {
  geo44: EscenarioGeo44;
  cr: EmpresaGeo65;
  xa: EmpresaGeo65;
}

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-65', '70706565', 'Direccion SLT-65', $4, $5, $6, $7, $8, $9, 'caja', now(), now())`;

/** Datos personales de las ordenes de este fixture: los tests de los scripts comprueban que no salen. */
export const DATOS_PERSONALES_GEO65 = ["Destinatario SLT-65", "70706565", "Direccion SLT-65"] as const;

interface NuevaOrden {
  estado: string;
  zonaId: string;
  cantonId: string;
  distritoId: string | null;
  monto: string;
}

async function idDeEstado(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: aplica las migraciones`);
  return fila.id;
}

async function insertarOrden(tx: TxDeTest, e: EmpresaGeo44, o: NuevaOrden): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    INSERTAR_ORDEN,
    id,
    `SLT65-${id.slice(0, 8)}`,
    await idDeEstado(tx, o.estado),
    e.tiendaId,
    o.zonaId,
    e.geo.provinciaId,
    o.cantonId,
    o.distritoId,
    o.monto,
  );
  return id;
}

async function gestion(
  tx: TxDeTest,
  ordenId: string,
  mensajeroId: string,
  resultado: "entregado" | "devolucion_a_origen_por_rechazo",
  monto: string,
  cierreId: string | null = null,
): Promise<string> {
  const entregado = resultado === "entregado";
  const fila = await tx.gestionOrden.create({
    data: {
      ordenId,
      mensajeroId,
      resultado,
      cierreId,
      ...(entregado
        ? {
            montoRecibido: new Prisma.Decimal(monto),
            pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(monto) }] },
          }
        : { motivo: "rechazo del fixture SLT-65" }),
    },
    select: { id: true },
  });
  return fila.id;
}

/** Siembra lo de SLT-65 sobre una empresa de `geo-44` ya creada. */
export async function sembrarEmpresaGeo65(tx: TxDeTest, e: EmpresaGeo44): Promise<EmpresaGeo65> {
  await comoDueno(tx);
  await fijarEmpresa(tx, e.empresaId);
  const { geo, zonas } = e;
  const orden = (o: NuevaOrden) => insertarOrden(tx, e, o);
  const vivo = "en_preparacion";

  const ordenes: OrdenesGeo65 = {
    conDistritoConMarcaId: e.ordenConDistritoId,
    sinDistritoId: e.ordenSinDistritoId,
    conDistritoSinMarcaId: await orden({
      estado: vivo,
      zonaId: zonas.norteId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoDosZonasId,
      monto: "12000",
    }),
    enDistritoSinZonaId: await orden({
      estado: vivo,
      zonaId: zonas.centralId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoSinZonaId,
      monto: "11000",
    }),
    bajoCantonRetiradoId: await orden({
      estado: vivo,
      zonaId: zonas.surId,
      cantonId: geo.cantonRetiradoId,
      distritoId: geo.distritoBajoCantonRetiradoId,
      monto: "9000",
    }),
    sinDistritoGestionadaId: await orden({
      estado: vivo,
      zonaId: zonas.centralId,
      cantonId: geo.cantonId,
      distritoId: null,
      monto: "7000",
    }),
    sinDistritoCantonRetiradoId: await orden({
      estado: vivo,
      zonaId: zonas.surId,
      cantonId: geo.cantonRetiradoId,
      distritoId: null,
      monto: "6000",
    }),
    entregadaId: await orden({
      estado: "entregado",
      zonaId: zonas.norteId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoDosZonasId,
      monto: "5000",
    }),
    desalineadaId: await orden({
      estado: vivo,
      zonaId: zonas.norteId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoCentralId,
      monto: "4000",
    }),
    desalineadaEnEstanteId: await orden({
      estado: "en_bodega_satelite",
      zonaId: zonas.norteId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoCentralId,
      monto: "3000",
    }),
    desalineadaEnCierreId: await orden({
      estado: vivo,
      zonaId: zonas.norteId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoCentralId,
      monto: "2000",
    }),
  };

  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const gestionesSinCierreIds = [
    await gestion(tx, ordenes.conDistritoConMarcaId, mensajero.id, "entregado", "15000"),
    await gestion(tx, ordenes.conDistritoSinMarcaId, mensajero.id, "devolucion_a_origen_por_rechazo", "0"),
    await gestion(tx, ordenes.bajoCantonRetiradoId, mensajero.id, "entregado", "9000"),
    await gestion(tx, ordenes.sinDistritoGestionadaId, mensajero.id, "entregado", "7000"),
  ];

  const cierre = await tx.cierreDia.create({
    data: { mensajeroId: mensajero.id, destinoTipo: "bodega_central", destinoZonaId: zonas.centralId },
    select: { id: true },
  });
  const gestionEnCierreId = await gestion(
    tx,
    ordenes.desalineadaEnCierreId,
    mensajero.id,
    "entregado",
    "2000",
    cierre.id,
  );
  const cierreDetailId = await congelarComoHoy(tx, e, cierre.id, ordenes.desalineadaEnCierreId);

  return {
    base: e,
    mensajeroId: mensajero.id,
    ordenes,
    gestionesSinCierreIds,
    cierreId: cierre.id,
    gestionEnCierreId,
    cierreDetailId,
  };
}

/** La fila de `cierre_detail` de una orden con los nombres y la marca que hoy se congelan. */
async function congelarComoHoy(tx: TxDeTest, e: EmpresaGeo44, cierreId: string, ordenId: string): Promise<string> {
  const o = await tx.orden.findUniqueOrThrow({
    where: { id: ordenId },
    select: {
      numGuia: true,
      numRemision: true,
      destinatario: true,
      direccion: true,
      producto: true,
      montoCobrar: true,
      cobraComision: true,
      zonaId: true,
      tiendaId: true,
      distritoId: true,
      tienda: { select: { nombre: true } },
      zona: { select: { nombre: true, esCentral: true } },
      provincia: { select: { nombre: true } },
      canton: { select: { nombre: true } },
      distrito: { select: { nombre: true } },
    },
  });
  const fila = await tx.cierreDetail.create({
    data: {
      cierreId,
      ordenId,
      montoCobrar: o.montoCobrar,
      cobraComision: o.cobraComision,
      zonaId: o.zonaId,
      tiendaId: o.tiendaId,
      esCentral: o.zona.esCentral,
      esZonaEspecial: o.distritoId !== null && e.marcas.includes(o.distritoId),
      numGuia: o.numGuia,
      numRemision: o.numRemision,
      destinatario: o.destinatario,
      direccion: o.direccion,
      producto: o.producto,
      tiendaNombre: o.tienda.nombre,
      zonaNombre: o.zona.nombre,
      provinciaNombre: o.provincia.nombre,
      cantonNombre: o.canton.nombre,
      distritoNombre: o.distrito?.nombre ?? null,
    },
    select: { id: true },
  });
  return fila.id;
}

/**
 * La orden con la cadena INCOHERENTE (design §5, §14): su distrito cuelga del canton retirado, pero
 * su `canton_id` es el canton activo. Ningun trigger lo impide (solo se comprueba el pais). Solo
 * para la contraprueba de R11 y el bloque `cadena-incoherente` del script (R22).
 */
export async function sembrarOrdenIncoherente(tx: TxDeTest, e: EmpresaGeo44): Promise<string> {
  await comoDueno(tx);
  await fijarEmpresa(tx, e.empresaId);
  return insertarOrden(tx, e, {
    estado: "en_preparacion",
    zonaId: e.zonas.surId,
    cantonId: e.geo.cantonId,
    distritoId: e.geo.distritoBajoCantonRetiradoId,
    monto: "1000",
  });
}

export async function crearEscenarioGeo65(tx: TxDeTest): Promise<EscenarioGeo65> {
  const geo44 = await crearEscenarioGeo44(tx);
  const cr = await sembrarEmpresaGeo65(tx, geo44.cr);
  const xa = await sembrarEmpresaGeo65(tx, geo44.xa);
  await comoDueno(tx);
  return { geo44, cr, xa };
}
