import { randomUUID } from "node:crypto";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { UpdateZonaData } from "@/lib/interfaces/repositories/IZonaRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { clienteConSavepoint, type TxDeTest } from "../_postgres-real";
import { antesDeZona } from "./antes-de-zona";
import { insertarNodo } from "./geo-43";
import { crearEscenarioGeo65, type EmpresaGeo65, type EscenarioGeo65 } from "./geo-65";
import { crearUsuarioDePrueba } from "./orden-minima";
import { comoDueno } from "./pais-20";

// SLT-89 (T3.4–T3.6, T4.2, T5.4, T6.1) — EL ESCENARIO DE LAS ZONAS SOBRE EL NODO.
//
// Sobre `geo-65.ts` (y por el, `geo-44.ts`), en la empresa del pais de prueba `XA`:
//
//   Provincia ─┬─ Canton ─────────┬─ «central»       → zona central (propia) + marca
//              │                  ├─ «dos zonas»     → zona norte   (propia)
//              │                  ├─ «sin zona»      → ninguna      ── «sector» (profundidad 4, nuevo)
//              │                  └─ «retirado»      → zona norte   (propia, activo = false)
//              └─ Canton retirado ── «bajo retirado» → zona sur     (propia) + marca
//
// con las ordenes de `geo-65` y una mas: `estanteSinZona`, en el distrito «sin zona», zona central, en
// el estante de una bodega satelite. Mas un tipo de profundidad 4 del pais y un `maestro` de la
// empresa. Se escribe como dueño dentro de la transaccion revertida del test.

export interface EscenarioSlt89 {
  geo65: EscenarioGeo65;
  /** La empresa de `XA` de `geo-65`: geografia, zonas, ordenes. */
  emp: EmpresaGeo65;
  empresaId: string;
  sectorId: string;
  ordenEstanteSinZonaId: string;
  maestroId: string;
}

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-89', '70708989', 'Direccion SLT-89', $4, $5, $6, $7, $8, $9, 'caja', now(), now())`;

export async function crearEscenarioSlt89(tx: TxDeTest): Promise<EscenarioSlt89> {
  const geo65 = await crearEscenarioGeo65(tx);
  const emp = geo65.xa;
  const { base } = emp;
  await comoDueno(tx);
  await fijarEmpresa(tx, base.empresaId);

  const tipo4 = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural)
     VALUES ($1, $2, 'nivel_4', 'Sector', 'Sectores')`,
    tipo4,
    base.paisId,
  );
  const sectorId = await insertarNodo(tx, {
    paisId: base.paisId,
    tipoId: tipo4,
    padreId: base.geo.distritoSinZonaId,
    profundidad: 4,
    nombre: `Sector SLT89 ${randomUUID().slice(0, 8)}`,
  });

  const estante = await tx.orderStatus.findUnique({ where: { value: "en_bodega_satelite" }, select: { id: true } });
  if (estante === null) throw new Error("falta el estado «en_bodega_satelite»: aplica las migraciones");
  const ordenEstanteSinZonaId = randomUUID();
  await tx.$executeRawUnsafe(
    INSERTAR_ORDEN,
    ordenEstanteSinZonaId,
    `SLT89-${ordenEstanteSinZonaId.slice(0, 8)}`,
    estante.id,
    base.tiendaId,
    base.zonas.centralId,
    base.geo.provinciaId,
    base.geo.cantonId,
    base.geo.distritoSinZonaId,
    "2500",
  );

  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  await comoDueno(tx);
  return { geo65, emp, empresaId: base.empresaId, sectorId, ordenEstanteSinZonaId, maestroId: maestro.id };
}

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
export async function comoLaEmpresa<T>(tx: TxDeTest, empresaId: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, empresaId);
  try {
    return await conEmpresa(empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** El repositorio real sobre la transaccion del test. */
export function repoDeZonas(tx: TxDeTest): ZonaRepository {
  return new ZonaRepository(clienteConSavepoint(tx));
}

/**
 * Un guardado de zona sin costos ni marca, con el «antes» leido de la base (lo que el modal
 * mostraria). La forma sirve al repositorio (`UpdateZonaData`) y al service (`ActualizarZonaInput`).
 */
export interface GuardadoDeZona {
  nombre: string;
  distritoIds: string[];
  nodoIds: string[];
  antes: UpdateZonaData["antes"];
}

/** Los datos de un guardado de zona con el «antes» leido de la base (lo que el modal mostraria). */
export async function guardado(
  tx: TxDeTest,
  zonaId: string,
  datos: { distritoIds: string[]; nodoIds: string[]; nombre?: string },
): Promise<GuardadoDeZona> {
  const zona = await tx.zona.findUniqueOrThrow({ where: { id: zonaId }, select: { nombre: true } });
  return {
    nombre: datos.nombre ?? zona.nombre,
    distritoIds: datos.distritoIds,
    nodoIds: datos.nodoIds,
    antes: await antesDeZona(tx, zonaId),
  };
}

/** Los nodos de `zona_nodo` de la zona, ordenados. */
export async function nodosDeZona(tx: TxDeTest, zonaId: string): Promise<string[]> {
  const filas = await tx.zonaNodo.findMany({ where: { zonaId }, select: { nodoGeograficoId: true } });
  return filas.map((f) => f.nodoGeograficoId).sort();
}

/** Los distritos de `zona_distrito` de la zona, ordenados. */
export async function distritosDeZona(tx: TxDeTest, zonaId: string): Promise<string[]> {
  const filas = await tx.zonaDistrito.findMany({ where: { zonaId }, select: { distritoId: true } });
  return filas.map((f) => f.distritoId).sort();
}

/** La zona de cada orden. */
export async function zonasDeOrdenes(tx: TxDeTest, ids: string[]): Promise<Record<string, string>> {
  const filas = await tx.orden.findMany({ where: { id: { in: ids } }, select: { id: true, zonaId: true } });
  return Object.fromEntries(filas.map((f) => [f.id, f.zonaId]));
}
