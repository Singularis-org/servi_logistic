import { randomUUID } from "node:crypto";

import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import type { FksDeOrden, TxDeTest } from "../_postgres-real";
import { crearFksDeOrden } from "./orden-minima";
import { asignarPlan, crearPlan } from "./planes";

// SLT-83 — lo que comparten los tests de integración del cobro porcentual (design §9.1).
//
// Todo va como DUEÑO dentro de la transacción revertida del caso (`revertida` de `_fixtures/planes`):
// quien escribe las condiciones y los movimientos es el trigger, y aquí solo se crean empresas, planes y
// órdenes y se cambian sus columnas con SQL a mano, que es lo que hacen todas las vías de la app al final
// (un INSERT o un UPDATE de `orden`). El SQL de dueño cubre también los casos a los que la app no llega
// hoy (recuperar una orden en estado final, `entregado → incidente`; design §3.3, R12, R14).
//
// No es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.

export type EstadoDeOrden =
  | "en_preparacion"
  | "en_reparto"
  | "entregado"
  | "devuelta_a_tienda"
  | "incidente";

export interface MovimientoPorcentual {
  tipo: string;
  fuente: string;
  monto: string;
  secuencia: number;
}

export interface Condicion {
  porcentaje: string;
  minimo: string | null;
}

/** Una empresa de prueba con las FK de sus órdenes, creadas con su empresa fijada. */
export interface EmpresaPorcentual {
  id: string;
  fks: FksDeOrden;
}

export async function crearEmpresa(tx: TxDeTest): Promise<EmpresaPorcentual> {
  const { id } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, id);
  const fks = await crearFksDeOrden(tx);
  return { id, fks };
}

/** El costo por orden de un plan, escrito como el superadmin (dueño). `null` en las tres = vacío. */
export interface CostoDelPlan {
  fijo?: string | null;
  pct?: string | null;
  minimo?: string | null;
}

export async function fijarCostoDelPlan(tx: TxDeTest, planId: string, c: CostoDelPlan): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "plan" SET "costo_por_orden" = $2::numeric, "costo_por_orden_pct" = $3::numeric,
                       "costo_por_orden_minimo" = $4::numeric WHERE "id" = $1`,
    planId,
    c.fijo ?? null,
    c.pct ?? null,
    c.minimo ?? null,
  );
}

/** Un plan público con costo base «monto» (50.000 al mes) y el costo por orden pedido. */
export async function crearPlanConCosto(tx: TxDeTest, c: CostoDelPlan): Promise<string> {
  const plan = await crearPlan(tx);
  await tx.$executeRawUnsafe(`UPDATE "plan" SET "precio_mensual" = 50000.00 WHERE "id" = $1`, plan);
  // SLT-86 (R15): el precio del período sale del historial; la fila «desde siempre» lleva el mismo precio.
  await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = 50000.00 WHERE "plan_id" = $1`, plan);
  await fijarCostoDelPlan(tx, plan, c);
  return plan;
}

export async function asignar(tx: TxDeTest, e: EmpresaPorcentual, planId: string): Promise<void> {
  await asignarPlan(tx, e.id, planId);
}

export async function fijarExcepcion(tx: TxDeTest, e: EmpresaPorcentual, monto: string | null): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "organizacion" SET "cobro_plataforma_por_orden" = $2::numeric WHERE "id" = $1`,
    e.id,
    monto,
  );
}

const estatusCache = new Map<string, string>();

export async function idDeEstado(tx: TxDeTest, valor: EstadoDeOrden): Promise<string> {
  const guardado = estatusCache.get(valor);
  if (guardado !== undefined) return guardado;
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "order_status" WHERE "value" = $1`, valor);
  if (filas.length === 0) throw new Error(`falta el estado «${valor}»: aplica las migraciones`);
  estatusCache.set(valor, filas[0].id);
  return filas[0].id;
}

export interface OrdenNueva {
  estado?: EstadoDeOrden;
  /** Entero (CHECK de la 305) o `null` = vacío. */
  montoCobrar?: string | null;
  /** Nace anulada. */
  anulada?: boolean;
}

/** Las columnas de un INSERT de orden, sin `organizacion_id`: lo pone el DEFAULT desde la empresa fijada. */
async function valoresDeOrden(tx: TxDeTest, e: EmpresaPorcentual, o: OrdenNueva): Promise<unknown[]> {
  const id = randomUUID();
  return [
    id,
    `SLT83-${id.slice(0, 12)}`,
    await idDeEstado(tx, o.estado ?? "en_preparacion"),
    e.fks.tiendaId,
    e.fks.zonaId,
    e.fks.provinciaId,
    e.fks.cantonId,
    o.montoCobrar ?? null,
    o.anulada ? new Date().toISOString() : null,
  ];
}

const COLUMNAS_DE_ORDEN = `(id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id, provincia_id,
                           canton_id, producto, monto_cobrar, deleted_at, created_at, updated_at)`;

function filaDeOrden(base: number): string {
  const p = (i: number) => `$${base + i}`;
  return `(${p(1)}, ${p(2)}, ${p(3)}, 'Destinatario SLT-83', '88880000', ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, 'caja',
           ${p(8)}::numeric, ${p(9)}::timestamp, now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')`;
}

/** Crea UNA orden de la empresa por SQL a mano (un INSERT, como la app). Devuelve su id. */
export async function crearOrden(tx: TxDeTest, e: EmpresaPorcentual, o: OrdenNueva = {}): Promise<string> {
  return (await crearOrdenes(tx, e, [o]))[0];
}

/**
 * Crea VARIAS órdenes en un solo INSERT multi-fila: la forma de `createMany` de la carga masiva (R6, R16).
 * El trigger de alta es `FOR EACH ROW`, así que congela fila a fila dentro de la misma sentencia.
 */
export async function crearOrdenes(tx: TxDeTest, e: EmpresaPorcentual, ordenes: OrdenNueva[]): Promise<string[]> {
  await fijarEmpresa(tx, e.id);
  const valores: unknown[] = [];
  const filas: string[] = [];
  const ids: string[] = [];
  for (const o of ordenes) {
    const v = await valoresDeOrden(tx, e, o);
    filas.push(filaDeOrden(valores.length));
    valores.push(...v);
    ids.push(v[0] as string);
  }
  await tx.$executeRawUnsafe(`INSERT INTO orden ${COLUMNAS_DE_ORDEN} VALUES ${filas.join(", ")}`, ...valores);
  return ids;
}

export async function cambiarEstado(tx: TxDeTest, ordenId: string, estado: EstadoDeOrden): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE orden SET estatus_id = $2 WHERE id = $1`, ordenId, await idDeEstado(tx, estado));
}

export async function cambiarMonto(tx: TxDeTest, ordenId: string, monto: string | null): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE orden SET monto_cobrar = $2::numeric WHERE id = $1`, ordenId, monto);
}

/** Anula (`deleted_at` = ahora, en UTC como la app) o recupera (`null`). */
export async function anular(tx: TxDeTest, ordenId: string, anulada: boolean): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE orden SET deleted_at = CASE WHEN $2 THEN now() AT TIME ZONE 'UTC' ELSE NULL END WHERE id = $1`,
    ordenId,
    anulada,
  );
}

export async function movimientos(tx: TxDeTest, ordenId: string): Promise<MovimientoPorcentual[]> {
  return tx.$queryRawUnsafe<MovimientoPorcentual[]>(
    `SELECT "tipo"::text AS tipo, "fuente"::text AS fuente, "monto"::text AS monto, "secuencia" AS secuencia
       FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1 ORDER BY "secuencia"`,
    ordenId,
  );
}

export async function condicionDe(tx: TxDeTest, ordenId: string): Promise<Condicion | null> {
  const filas = await tx.$queryRawUnsafe<Condicion[]>(
    `SELECT "porcentaje"::text AS porcentaje, "minimo"::text AS minimo
       FROM "cobro_plataforma_porcentual_orden" WHERE "orden_id" = $1`,
    ordenId,
  );
  return filas[0] ?? null;
}

/** Σ cargo − Σ reverso de la empresa (la deuda de la wallet, SL-40), con dos decimales. */
export async function deuda(tx: TxDeTest, organizacionId: string): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ d: string }[]>(
    `SELECT COALESCE(SUM(CASE WHEN "tipo" = 'cargo' THEN "monto" ELSE -"monto" END), 0)::numeric(14, 2)::text AS d
       FROM "cobro_plataforma_movimiento" WHERE "organizacion_id" = $1`,
    organizacionId,
  );
  return filas[0].d;
}

export const cargo = (monto: string, secuencia = 1, fuente = "plan"): MovimientoPorcentual => ({ tipo: "cargo", fuente, monto, secuencia });
export const reverso = (monto: string, secuencia: number, fuente = "plan"): MovimientoPorcentual => ({ tipo: "reverso", fuente, monto, secuencia });
