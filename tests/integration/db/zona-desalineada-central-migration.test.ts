import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GestionResultado, PrismaClient } from "@prisma/client";

import type { OrderStatusValue } from "@/lib/types/order-status";
import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { sentenciasSql } from "./_fixtures/sql-ejecutable";

/**
 * SLT-224 (T5, design §7.2, R1707-R1712) — la correccion UNICA de la zona de las ordenes en la
 * central, y su `down.sql`, ejecutados TAL CUAL contra Postgres real dentro de una transaccion
 * revertida. Precedente: `liberar-recolecciones-recibidas-migration.test.ts`.
 *
 * La base de test ya tiene la migracion aplicada (`migrate deploy`), asi que cada caso parte del
 * estado PREVIO: borra el esquema del respaldo dentro de su transaccion (el rollback lo devuelve).
 *
 * Matriz sembrada en DOS empresas. Lo que se corrige va escrito LITERAL (por su clave), no derivado
 * de la regla: una regla mutada no puede arrastrar consigo a su propia expectativa.
 *
 * MUTACIONES EJECUTADAS (ver `progress/impl_SLT-224.md`), cada una con su rojo.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const DIR = path.join(process.cwd(), "db", "migrations", "20261121120000_slt224_zona_de_ordenes_en_central");
const UP = fs.readFileSync(path.join(DIR, "migration.sql"), "utf8");
const DOWN = fs.readFileSync(path.join(DIR, "down.sql"), "utf8");

async function ejecutar(tx: TxDeTest, sql: string): Promise<void> {
  for (const s of sentenciasSql(sql)) await tx.$executeRawUnsafe(s);
}

/** El estado previo a la migracion: sin su respaldo. */
async function estadoPrevio(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`DROP SCHEMA IF EXISTS respaldo_slt224 CASCADE`);
}

interface Empresa {
  id: string;
  zonaA: string;
  zonaC: string;
  zonaD: string;
  /** clave -> id de la orden */
  ordenes: Map<string, string>;
}

interface Sembrado {
  empresas: Empresa[];
  /** id de orden -> clave legible «empresa:clave» */
  claveDe: Map<string, string>;
  ids: string[];
}

/**
 * Siembra una empresa: zona A (satelite, la vieja), C (la del distrito), D (para el cambio a mano),
 * un distrito X -> C, un distrito sin zona, y una orden por caso. `completa` = toda la matriz; si no,
 * solo la orden desalineada en la central.
 */
async function sembrarEmpresa(
  tx: TxDeTest,
  organizacionId: string,
  prefijo: string,
  casos: readonly string[],
): Promise<Empresa> {
  await fijarEmpresa(tx, organizacionId);
  const fks = await crearFksDeOrden(tx);
  const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const suf = randomUUID().slice(0, 8);
  const zona = async (n: string) =>
    (
      await tx.zona.create({
        data: { nombre: `slt224m ${prefijo} ${n} ${suf}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
        select: { id: true },
      })
    ).id;
  const zonaA = await zona("A");
  const zonaC = await zona("C");
  const zonaD = await zona("D");
  const distrito = async (zonaId: string | null) => {
    const d = await tx.distrito.create({
      data: { nombre: `slt224m D ${randomUUID().slice(0, 8)}`, cantonId: fks.cantonId },
      select: { id: true },
    });
    if (zonaId !== null) await tx.zonaDistrito.create({ data: { zonaId, distritoId: d.id } });
    return d.id;
  };
  const distritoX = await distrito(zonaC);
  const distritoSinZona = await distrito(null);
  const estatus = async (value: OrderStatusValue) =>
    (await tx.orderStatus.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;

  const crear = async (
    clave: string,
    o: { estado: OrderStatusValue; zonaId?: string; distritoId?: string; sinGuia?: boolean; borrada?: boolean },
  ) => {
    const guia = o.sinGuia
      ? null
      : (await tx.$queryRawUnsafe<{ g: number }[]>(`SELECT nextval('orden_num_guia_seq')::int AS g`))[0].g;
    return (
      await tx.orden.create({
        data: {
          numRemision: `REM-${prefijo}-${clave}-${suf}`,
          numGuia: guia,
          destinatario: "Destinataria 224",
          telefonoDest: "8888-0000",
          producto: "caja",
          estatusId: await estatus(o.estado),
          tiendaId: fks.tiendaId,
          zonaId: o.zonaId ?? zonaA,
          provinciaId: fks.provinciaId,
          cantonId: fks.cantonId,
          distritoId: o.distritoId ?? distritoX,
          direccion: "avenida 224",
          montoCobrar: 12_000,
          intentosContacto: 2,
          deletedAt: o.borrada ? new Date() : null,
        },
        select: { id: true },
      })
    ).id;
  };
  const gestion = async (ordenId: string, resultado: GestionResultado) => {
    await tx.gestionOrden.create({ data: { ordenId, mensajeroId: mensajero, resultado }, select: { id: true } });
  };
  const cierre = async (ordenId: string) => {
    const c = await tx.cierreDia.create({
      data: { mensajeroId: mensajero, estado: "solicitado", destinoTipo: "bodega_central", destinoZonaId: zonaA },
      select: { id: true },
    });
    await tx.cierreDetail.create({
      data: {
        cierreId: c.id,
        ordenId,
        cobraComision: false,
        zonaId: zonaA,
        tiendaId: fks.tiendaId,
        esCentral: false,
        numRemision: `CD-${randomUUID().slice(0, 8)}`,
        destinatario: "Destinataria 224",
        producto: "caja",
        tiendaNombre: "Tienda",
        zonaNombre: "Zona congelada",
        provinciaNombre: "Provincia",
        cantonNombre: "Canton",
      },
      select: { id: true },
    });
  };

  const ordenes = new Map<string, string>();
  for (const caso of casos) {
    switch (caso) {
      case "central":
        ordenes.set(caso, await crear(caso, { estado: "en_bodega_central" }));
        break;
      case "ruta-sin-guia":
        ordenes.set(caso, await crear(caso, { estado: "en_ruta_bodega_central", sinGuia: true }));
        break;
      case "estante":
        ordenes.set(caso, await crear(caso, { estado: "en_bodega_satelite" }));
        break;
      case "entregado":
        ordenes.set(caso, await crear(caso, { estado: "entregado" }));
        break;
      case "por-devolver-central":
        ordenes.set(caso, await crear(caso, { estado: "por_devolver_a_bodega_central" }));
        break;
      case "devolviendo-central":
        ordenes.set(caso, await crear(caso, { estado: "devolviendo_a_bodega_central" }));
        break;
      case "por-devolver-tienda":
        ordenes.set(caso, await crear(caso, { estado: "por_devolver_a_tienda" }));
        break;
      case "borrada":
        ordenes.set(caso, await crear(caso, { estado: "en_bodega_central", borrada: true }));
        break;
      case "distrito-sin-zona":
        ordenes.set(caso, await crear(caso, { estado: "en_bodega_central", distritoId: distritoSinZona }));
        break;
      case "con-cierre": {
        const id = await crear(caso, { estado: "en_bodega_central" });
        await cierre(id);
        ordenes.set(caso, id);
        break;
      }
      case "con-gestion": {
        const id = await crear(caso, { estado: "en_bodega_central" });
        await gestion(id, "entregado");
        ordenes.set(caso, id);
        break;
      }
      case "alineada":
        ordenes.set(caso, await crear(caso, { estado: "en_bodega_central", zonaId: zonaC }));
        break;
      default:
        throw new Error(`caso desconocido ${caso}`);
    }
  }
  return { id: organizacionId, zonaA, zonaC, zonaD, ordenes };
}

const MATRIZ = [
  "central",
  "ruta-sin-guia",
  "estante",
  "entregado",
  "por-devolver-central",
  "devolviendo-central",
  "por-devolver-tienda",
  "borrada",
  "distrito-sin-zona",
  "con-cierre",
  "con-gestion",
  "alineada",
] as const;

const SIN_CANDIDATAS = MATRIZ.filter((c) => c !== "central" && c !== "ruta-sin-guia");

async function sembrar(tx: TxDeTest, casos2: readonly string[] = ["central"], casos1: readonly string[] = MATRIZ): Promise<Sembrado> {
  await serializarEscriturasReales(tx);
  // DESPUES del lock: `serializarEscriturasReales` vuelve a un SAVEPOINT y desharia el DROP.
  await estadoPrevio(tx);
  const [{ org }] = await tx.$queryRawUnsafe<{ org: string }[]>(
    `SELECT current_setting('app.organizacion_id') AS org`,
  );
  const org2 = (await crearOrganizacion(tx)).id;
  const e1 = await sembrarEmpresa(tx, org, "e1", casos1);
  const e2 = await sembrarEmpresa(tx, org2, "e2", casos2);
  await fijarEmpresa(tx, org);
  const claveDe = new Map<string, string>();
  for (const [n, e] of [["e1", e1], ["e2", e2]] as const) {
    for (const [clave, id] of e.ordenes) claveDe.set(id, `${n}:${clave}`);
  }
  return { empresas: [e1, e2], claveDe, ids: [...claveDe.keys()] };
}

async function zonas(tx: TxDeTest, ids: string[]): Promise<Map<string, string | null>> {
  const filas = await tx.orden.findMany({ where: { id: { in: ids } }, select: { id: true, zonaId: true } });
  return new Map(filas.map((f) => [f.id, f.zonaId]));
}

async function acciones(tx: TxDeTest, ids: string[]) {
  return tx.historialAccion.findMany({
    where: { accion: "orden_zona_reconciliada", entidadId: { in: ids } },
    select: {
      entidadId: true,
      entidadEtiqueta: true,
      actorUsuarioId: true,
      actorNombre: true,
      actorRol: true,
      loteId: true,
      organizacionId: true,
      monto: true,
      valorAnterior: true,
      valorNuevo: true,
    },
  });
}

/** Las claves cuya zona cambio entre dos fotos, ordenadas. */
function cambiadas(s: Sembrado, antes: Map<string, string | null>, despues: Map<string, string | null>): string[] {
  return s.ids
    .filter((id) => antes.get(id) !== despues.get(id))
    .map((id) => s.claveDe.get(id) ?? id)
    .sort();
}

describeSiHayBase("SLT-224 — la correccion unica de la zona en la central (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R1708/R1709: corrige SOLO las desalineadas elegibles en la central o en ruta, en las dos empresas", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const antes = await zonas(tx, s.ids);
      await ejecutar(tx, UP);
      const despues = await zonas(tx, s.ids);
      return { s, cambiadas: cambiadas(s, antes, despues), despues };
    });
    // LITERAL: estas tres y ninguna mas.
    expect(r.cambiadas).toEqual(["e1:central", "e1:ruta-sin-guia", "e2:central"]);
    const [e1, e2] = r.s.empresas;
    expect(r.despues.get(e1.ordenes.get("central") ?? "")).toBe(e1.zonaC);
    expect(r.despues.get(e1.ordenes.get("ruta-sin-guia") ?? "")).toBe(e1.zonaC);
    expect(r.despues.get(e2.ordenes.get("central") ?? "")).toBe(e2.zonaC);
  }, 60_000);

  it("R1710: una accion por orden corregida, actor sistema, etiqueta guia o remision, un lote por empresa", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      await ejecutar(tx, UP);
      const guias = new Map(
        (await tx.orden.findMany({ where: { id: { in: s.ids } }, select: { id: true, numGuia: true, numRemision: true } })).map(
          (o) => [o.id, o],
        ),
      );
      return { s, acciones: await acciones(tx, s.ids), guias };
    });
    const [e1, e2] = r.s.empresas;
    expect(r.acciones.map((a) => r.s.claveDe.get(a.entidadId)).sort()).toEqual([
      "e1:central",
      "e1:ruta-sin-guia",
      "e2:central",
    ]);
    for (const a of r.acciones) {
      expect({ actor: a.actorUsuarioId, nombre: a.actorNombre, rol: a.actorRol }).toEqual({ actor: null, nombre: null, rol: null });
      expect({ monto: a.monto, anterior: a.valorAnterior, nuevo: a.valorNuevo }).toEqual({ monto: null, anterior: null, nuevo: null });
      const o = r.guias.get(a.entidadId);
      expect(a.entidadEtiqueta).toBe(o?.numGuia != null ? String(o.numGuia) : o?.numRemision);
    }
    const de = (clave: string, e: Empresa) => r.acciones.find((a) => a.entidadId === e.ordenes.get(clave));
    // La de sin guia lleva su remision.
    expect(de("ruta-sin-guia", e1)?.entidadEtiqueta).toMatch(/^REM-e1-ruta-sin-guia-/);
    // Un lote por empresa, distinto entre empresas; la empresa es la de la orden.
    expect(de("central", e1)?.loteId).toBe(de("ruta-sin-guia", e1)?.loteId);
    expect(de("central", e1)?.loteId).not.toBe(de("central", e2)?.loteId);
    expect(de("central", e1)?.organizacionId).toBe(e1.id);
    expect(de("central", e2)?.organizacionId).toBe(e2.id);
  }, 60_000);

  it("R1707: la fila de la orden solo cambia en zona y fecha de actualizacion; las tablas de dinero no cambian", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const id = s.empresas[0].ordenes.get("central") ?? "";
      const fila = async () => (await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM orden WHERE id = $1`, id))[0];
      const dinero = async () =>
        tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT (SELECT count(*) FROM cierre_detail)::int + (SELECT count(*) FROM cierre_detail_concepto)::int
                + (SELECT count(*) FROM gestion_orden)::int + (SELECT count(*) FROM gestion_pago_congelado)::int
                + (SELECT count(*) FROM wallet_movimiento)::int AS n`,
        );
      const antes = await fila();
      const dineroAntes = await dinero();
      await ejecutar(tx, UP);
      return { antes, despues: await fila(), dineroAntes, dineroDespues: await dinero() };
    });
    expect(r.despues.zona_id).not.toBe(r.antes.zona_id);
    const resto = (f: Record<string, unknown>) => {
      const otras = Object.fromEntries(Object.entries(f).filter(([k]) => !["zona_id", "updated_at"].includes(k)));
      return otras;
    };
    expect(resto(r.despues)).toEqual(resto(r.antes));
    expect(r.dineroDespues).toEqual(r.dineroAntes);
  }, 60_000);

  it("R1711: el down restaura, no pisa una zona cambiada despues y borra solo las acciones de sus lotes", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx);
      const [e1, e2] = s.empresas;
      // Una `orden_zona_reconciliada` PREVIA de la misma orden, de otro lote: el down la deja.
      const previa = randomUUID();
      await tx.historialAccion.create({
        data: {
          accion: "orden_zona_reconciliada",
          entidadTipo: "orden",
          entidadId: e1.ordenes.get("central") ?? "",
          entidadEtiqueta: "previa",
          loteId: previa,
        },
      });
      const antes = await zonas(tx, s.ids);
      await ejecutar(tx, UP);
      // A mano, tras la migracion: la de la empresa 2 pasa a la zona D.
      await tx.orden.update({ where: { id: e2.ordenes.get("central") ?? "" }, data: { zonaId: e2.zonaD } });
      await ejecutar(tx, DOWN);
      const despues = await zonas(tx, s.ids);
      const [{ existe }] = await tx.$queryRawUnsafe<{ existe: boolean }[]>(
        `SELECT to_regnamespace('respaldo_slt224') IS NOT NULL AS existe`,
      );
      return {
        s,
        cambiadas: cambiadas(s, antes, despues),
        zonaE2: despues.get(e2.ordenes.get("central") ?? ""),
        acciones: await acciones(tx, s.ids),
        previa,
        existe,
      };
    });
    // Todas vuelven a su zona salvo la que se cambio a mano, que se queda en D.
    expect(r.cambiadas).toEqual(["e2:central"]);
    expect(r.zonaE2).toBe(r.s.empresas[1].zonaD);
    // Solo queda la accion previa.
    expect(r.acciones.map((a) => a.loteId)).toEqual([r.previa]);
    expect(r.existe).toBe(false);
  }, 60_000);

  it("R1712: sin candidatas no cambia ninguna orden ni registra acciones", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx, ["alineada"], SIN_CANDIDATAS);
      const antes = await zonas(tx, s.ids);
      await ejecutar(tx, UP);
      const respaldo = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM respaldo_slt224.orden_zona WHERE organizacion_id = ANY($1::text[])`,
        s.empresas.map((e) => e.id),
      );
      return { cambiadas: cambiadas(s, antes, await zonas(tx, s.ids)), acciones: await acciones(tx, s.ids), respaldo };
    });
    expect(r.cambiadas).toEqual([]);
    expect(r.acciones).toEqual([]);
    expect(r.respaldo).toEqual([{ n: 0 }]);
  }, 60_000);

  it("R1708 (en su empresa): con el MISMO distrito mapeado por la otra empresa a otra zona, cada orden toma la zona de SU empresa", async () => {
    // La geografia es de la plataforma: dos empresas que mapean el mismo distrito es lo normal. La
    // migracion corre como dueño, sin RLS, asi que el JOIN por `organizacion_id` es la unica defensa.
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const s = await sembrar(tx, ["central"], ["central", "alineada"]);
      const [e1, e2] = s.empresas;
      const central = e1.ordenes.get("central") ?? "";
      const { distritoId } = await tx.orden.findUniqueOrThrow({ where: { id: central }, select: { distritoId: true } });
      if (distritoId === null) throw new Error("la orden sembrada no tiene distrito");
      // La empresa 2 mapea el distrito de la empresa 1 a una zona SUYA.
      await fijarEmpresa(tx, e2.id);
      await tx.zonaDistrito.create({ data: { zonaId: e2.zonaD, distritoId } });
      await fijarEmpresa(tx, e1.id);
      const antes = await zonas(tx, s.ids);
      await ejecutar(tx, UP);
      const despues = await zonas(tx, s.ids);
      const respaldo = await tx.$queryRawUnsafe<{ orden_id: string }[]>(
        `SELECT orden_id FROM respaldo_slt224.orden_zona WHERE orden_id = ANY($1::text[])`,
        s.ids,
      );
      return { s, e1, cambiadas: cambiadas(s, antes, despues), despues, central, respaldo };
    });
    expect(r.cambiadas).toEqual(["e1:central", "e2:central"]);
    expect(r.despues.get(r.central)).toBe(r.e1.zonaC);
    expect(r.despues.get(r.e1.ordenes.get("alineada") ?? "")).toBe(r.e1.zonaC);
    // Una fila de respaldo por orden corregida, sin duplicados por la otra empresa.
    expect(r.respaldo.map((f) => r.s.claveDe.get(f.orden_id)).sort()).toEqual(["e1:central", "e2:central"]);
  }, 60_000);
});
