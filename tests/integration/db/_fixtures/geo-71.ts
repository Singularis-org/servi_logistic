import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { CLAVE_LOCK_ESCRITURA_REAL, type TxDeTest } from "../_postgres-real";
import {
  crearEscenarioGeo65,
  DATOS_PERSONALES_GEO65,
  sembrarOrdenIncoherente,
  type EmpresaGeo65,
  type EscenarioGeo65,
} from "./geo-65";
import { comoDueno } from "./pais-20";

// SLT-71 (T0.2; design §11) — el escenario de las lecturas de analitica y de transito que pasan al
// catalogo, sobre `geo-65.ts`. Lo comparten los tests de analitica (T3.4), transito (T4.2), el script
// de equivalencia (T5.2) y el de rendimiento (T6.2).
//
// Por empresa (Costa Rica y `XA`), ademas de lo de `geo-65` (todo en su provincia), se siembra una
// SEGUNDA provincia con un canton y un distrito, y:
//
//   orden                     provincia  lugar             zona     estado              gestion vigente      transicion
//   ────────────────────────  ─────────  ────────────────  ───────  ──────────────────  ───────────────────  ──────────────────────
//   segundaEntregada          segunda    distrito          central  entregado (term.)   entregado            -> entregado (terminal)
//   segundaDevuelta           segunda    canton            central  novedad             novedad (devuelta)   —
//   primeraDevuelta           primera    d. dos zonas      norte    novedad             novedad (devuelta)   —
//   transitoConDistrito       primera    d. central        norte    en_bodega_central   —                    -> en_bodega_central, hace 30 dias
//   transitoSinDistrito       segunda    canton            central  en_bodega_central   —                    -> en_bodega_central, hace 30 dias
//
// - La orden `entregada` de `geo-65` gana su transicion terminal (`entregado`), para que la cohorte de
//   carga tenga un desenlace en la primera provincia.
// - Las dos de transito se cargaron hace 40 dias y entraron a la bodega central hace 30: con los
//   parametros por defecto (hito «entrada a bodega central») estan vencidas en cualquier zona.
// - Las gestiones son del mensajero de `geo-65`, sin cierre.
// - La orden incoherente de `sembrarOrdenIncoherente` (cadena rota) va solo en Costa Rica: es la que
//   el bloque `cadena-incoherente` del script tiene que nombrar.
// - Los datos personales son los de `geo-65` (`DATOS_PERSONALES_GEO65`): los tests de los scripts y
//   del log de R12 comprueban que no salen.
//
// Se escribe como DUEÑO dentro del `tx` de un test que se revierte, y deja la transaccion como dueño.

export interface SegundaProvinciaGeo71 {
  provinciaId: string;
  cantonId: string;
  distritoId: string;
}

export interface OrdenesGeo71 {
  segundaEntregadaId: string;
  segundaDevueltaId: string;
  primeraDevueltaId: string;
  transitoConDistritoId: string;
  transitoSinDistritoId: string;
}

export interface EmpresaGeo71 {
  base: EmpresaGeo65;
  segunda: SegundaProvinciaGeo71;
  ordenes: OrdenesGeo71;
  /** Las gestiones `novedad` vigentes: las que cuenta el anillo de devoluciones. */
  gestionesDevueltasIds: string[];
}

export interface EscenarioGeo71 {
  geo65: EscenarioGeo65;
  cr: EmpresaGeo71;
  xa: EmpresaGeo71;
  /** La orden con cadena incoherente, en Costa Rica (`null` si se pidio sin ella). */
  incoherenteId: string | null;
}

const DIA_MS = 86_400_000;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'caja', $13, $13)`;

interface NuevaOrden {
  estado: string;
  zonaId: string;
  provinciaId: string;
  cantonId: string;
  distritoId: string | null;
  monto: string;
  createdAt: Date;
}

async function idDeEstado(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: aplica las migraciones`);
  return fila.id;
}

async function insertarOrden(tx: TxDeTest, e: EmpresaGeo65, o: NuevaOrden): Promise<string> {
  const id = randomUUID();
  const [destinatario, telefono, direccion] = DATOS_PERSONALES_GEO65;
  await tx.$executeRawUnsafe(
    INSERTAR_ORDEN,
    id,
    `SLT71-${id.slice(0, 8)}`,
    await idDeEstado(tx, o.estado),
    destinatario,
    telefono,
    direccion,
    e.base.tiendaId,
    o.zonaId,
    o.provinciaId,
    o.cantonId,
    o.distritoId,
    o.monto,
    o.createdAt,
  );
  return id;
}

async function gestion(
  tx: TxDeTest,
  ordenId: string,
  mensajeroId: string,
  resultado: "entregado" | "novedad",
  monto: string,
): Promise<string> {
  const fila = await tx.gestionOrden.create({
    data: {
      ordenId,
      mensajeroId,
      resultado,
      ...(resultado === "entregado"
        ? {
            montoRecibido: new Prisma.Decimal(monto),
            pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(monto) }] },
          }
        : { motivo: "devuelta del fixture SLT-71" }),
    },
    select: { id: true },
  });
  return fila.id;
}

async function transicion(
  tx: TxDeTest,
  ordenId: string,
  origen: string | null,
  destino: string,
  at: Date,
): Promise<void> {
  await tx.ordenHistorialEstado.create({
    data: {
      ordenId,
      estatusOrigenId: origen === null ? null : await idDeEstado(tx, origen),
      estatusDestinoId: await idDeEstado(tx, destino),
      origenTipo: origen === null ? "creacion_manual" : "ajuste_estado",
      createdAt: at,
    },
  });
}

/** La segunda provincia de la empresa, en su pais. Nombres con sufijo aleatorio. */
async function sembrarSegundaProvincia(tx: TxDeTest, e: EmpresaGeo65): Promise<SegundaProvinciaGeo71> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const id = { select: { id: true } } as const;
  const provincia = await tx.provincia.create({
    data: { nombre: `Provincia SLT71 ${sufijo}`, paisId: e.base.paisId },
    ...id,
  });
  const canton = await tx.canton.create({ data: { nombre: `Canton SLT71 ${sufijo}`, provinciaId: provincia.id }, ...id });
  const distrito = await tx.distrito.create({ data: { nombre: `Distrito SLT71 ${sufijo}`, cantonId: canton.id }, ...id });
  return { provinciaId: provincia.id, cantonId: canton.id, distritoId: distrito.id };
}

/** Siembra lo de SLT-71 sobre una empresa de `geo-65` ya creada. */
export async function sembrarEmpresaGeo71(tx: TxDeTest, e: EmpresaGeo65): Promise<EmpresaGeo71> {
  await comoDueno(tx);
  await fijarEmpresa(tx, e.base.empresaId);
  const { geo, zonas } = e.base;
  const ahora = Date.now();
  const hoy = new Date(ahora);
  const segunda = await sembrarSegundaProvincia(tx, e);
  const orden = (o: NuevaOrden) => insertarOrden(tx, e, o);

  const ordenes: OrdenesGeo71 = {
    segundaEntregadaId: await orden({
      estado: "entregado",
      zonaId: zonas.centralId,
      provinciaId: segunda.provinciaId,
      cantonId: segunda.cantonId,
      distritoId: segunda.distritoId,
      monto: "13000",
      createdAt: hoy,
    }),
    segundaDevueltaId: await orden({
      estado: "novedad",
      zonaId: zonas.centralId,
      provinciaId: segunda.provinciaId,
      cantonId: segunda.cantonId,
      distritoId: null,
      monto: "8500",
      createdAt: hoy,
    }),
    primeraDevueltaId: await orden({
      estado: "novedad",
      zonaId: zonas.norteId,
      provinciaId: geo.provinciaId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoDosZonasId,
      monto: "7500",
      createdAt: hoy,
    }),
    transitoConDistritoId: await orden({
      estado: "en_bodega_central",
      zonaId: zonas.norteId,
      provinciaId: geo.provinciaId,
      cantonId: geo.cantonId,
      distritoId: geo.distritoCentralId,
      monto: "6500",
      createdAt: new Date(ahora - 40 * DIA_MS),
    }),
    transitoSinDistritoId: await orden({
      estado: "en_bodega_central",
      zonaId: zonas.centralId,
      provinciaId: segunda.provinciaId,
      cantonId: segunda.cantonId,
      distritoId: null,
      monto: "5500",
      createdAt: new Date(ahora - 40 * DIA_MS),
    }),
  };

  await gestion(tx, ordenes.segundaEntregadaId, e.mensajeroId, "entregado", "13000");
  const gestionesDevueltasIds = [
    await gestion(tx, ordenes.segundaDevueltaId, e.mensajeroId, "novedad", "0"),
    await gestion(tx, ordenes.primeraDevueltaId, e.mensajeroId, "novedad", "0"),
  ];

  // Desenlaces terminales para la cohorte de carga, uno por provincia.
  await transicion(tx, ordenes.segundaEntregadaId, "en_reparto", "entregado", hoy);
  await transicion(tx, e.ordenes.entregadaId, "en_reparto", "entregado", hoy);

  // Entrada a la bodega central hace 30 dias: vencidas con los parametros por defecto.
  const entrada = new Date(ahora - 30 * DIA_MS);
  await transicion(tx, ordenes.transitoConDistritoId, null, "en_bodega_central", entrada);
  await transicion(tx, ordenes.transitoSinDistritoId, null, "en_bodega_central", entrada);

  return { base: e, segunda, ordenes, gestionesDevueltasIds };
}

/**
 * `incoherente: false` deja fuera la orden de cadena incoherente: la quieren los tests de «misma
 * cifra que hoy» (R4 solo vale con la cadena coherente). Por defecto se siembra.
 */
export async function crearEscenarioGeo71(
  tx: TxDeTest,
  opciones: { incoherente?: boolean } = {},
): Promise<EscenarioGeo71> {
  const geo65 = await crearEscenarioGeo65(tx);
  const cr = await sembrarEmpresaGeo71(tx, geo65.cr);
  const xa = await sembrarEmpresaGeo71(tx, geo65.xa);
  const incoherenteId = opciones.incoherente === false ? null : await sembrarOrdenIncoherente(tx, geo65.cr.base);
  await comoDueno(tx);
  return { geo65, cr, xa, incoherenteId };
}

/** Lo que se tarda, como mucho, una transaccion de un test de SLT-71, cerrojo incluido. */
export const TIEMPO_DE_TEST_LARGO = 300_000;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/**
 * `revertida` de `pais-20.ts` con la transaccion larga (review v1 m3, v2 m6). La espera del cerrojo
 * (`pg_advisory_xact_lock`) corre DENTRO de la transaccion interactiva; con los 30 s del helper
 * compartido, un test de SLT-71 que espera detras de otro largo caducaba antes que su `it`. El helper
 * compartido no se toca: lo usan decenas de archivos.
 */
export async function revertidaLarga<T>(
  base: PrismaClient,
  fn: (tx: TxDeTest) => Promise<T>,
  timeout: number = TIEMPO_DE_TEST_LARGO,
): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx as unknown as TxDeTest));
      },
      { timeout, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}
