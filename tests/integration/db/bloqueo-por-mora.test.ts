import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { GRACIA_GLOBAL, aLas, cero, comoDueno, congelar, empresa, facturaCerrada, intentar } from "./_fixtures/mora-121";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-121 · T1.4 (design §2.5, §6; R10, R12, R16, R18) — el bloqueo en la base: el trigger `<tabla>_bloqueo_por_mora`.
// Todo por SQL a mano y por el cliente de Prisma, como `servi_app` (`comoApp`: la empresa en el contexto y el rol
// sin BYPASSRLS, como la envoltura de producción). Cada caso en una transacción del dueño que se revierte.
//
// Dos empresas, A y B, cada una con una tienda, una zona, una orden y un valor de tarifa. A queda congelada:
//   · R10: sus lecturas pasan;
//   · R12, R16: toda escritura de `servi_app` falla con SL121 `empresa_congelada`, por SQL a mano y por Prisma,
//     también una sentencia que no toca filas (el trigger es por sentencia) y sin efectos;
//   · R16: pasan el dueño y un camino con `app.mora_permitida` (§6.1);
//   · R18: B escribe igual, y A vuelve a escribir al descongelarse.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Datos {
  org: string;
  zona: string;
  orden: string;
  tarifa: string;
  fks: Awaited<ReturnType<typeof crearFksDeOrden>>;
}

const insertarOrden = (d: Datos) => [
  `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                        "provincia_id", "canton_id", "producto", "monto_cobrar", "updated_at", "created_at")
   VALUES ($1, $2, $3, 'Destinatario SLT121', '88880000', $4, $5, $6, $7, 'Caja', 10000, now(), now() AT TIME ZONE 'UTC')`,
  randomUUID(),
  `SLT121-${randomUUID().slice(0, 12)}`,
  d.fks.estatusId,
  d.fks.tiendaId,
  d.fks.zonaId,
  d.fks.provinciaId,
  d.fks.cantonId,
] as const;

/** Una empresa con una tienda, una zona, una orden y un valor de tarifa, escritos como dueño. */
async function sembrar(tx: TxDeTest): Promise<Datos> {
  const org = await empresa(tx);
  await fijarEmpresa(tx, org);
  const fks = await crearFksDeOrden(tx);
  const orden = randomUUID();
  const [sql, , ...resto] = insertarOrden({ org, zona: fks.zonaId, orden, tarifa: "", fks });
  await tx.$executeRawUnsafe(sql, orden, ...resto);
  const { id: tarifa } = await tx.tarifaValor.create({
    data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct: "13.00", tiendaId: fks.tiendaId },
    select: { id: true },
  });
  await fijarEmpresa(tx, "");
  return { org, zona: fks.zonaId, orden, tarifa, fks };
}

async function congelarAMano(tx: TxDeTest, org: string): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "congelada_at" = '2026-11-24 06:30' WHERE "id" = $1`, org);
}

/** Las escrituras del caso como `servi_app` en la empresa de `d`: el SQLSTATE de cada una, o `null` si pasó. */
async function escrituras(tx: TxDeTest, d: Datos): Promise<Record<string, string | null>> {
  const [sql, ...args] = insertarOrden(d);
  return {
    insertOrden: await intentar(tx, sql, ...args),
    updateTarifa: await intentar(tx, `UPDATE "tarifa_valor" SET "valor" = 2000 WHERE "id" = $1`, d.tarifa),
    deleteZona: await intentar(tx, `DELETE FROM "zona" WHERE "id" = $1 AND false`, d.zona),
    updateTope: await intentar(tx, `UPDATE "organizacion" SET "tope_intentos_entrega" = 5 WHERE "id" = $1`, d.org),
    insertJob: await intentar(
      tx,
      `INSERT INTO "jobs" ("id", "tipo", "payload", "max_intentos") VALUES ($1, 'geocodificacion', '{}'::jsonb, 3)`,
      randomUUID(),
    ),
  };
}

/** Una foto, como dueño, de lo que las escrituras del caso moverían. */
async function foto(tx: TxDeTest, d: Datos): Promise<unknown> {
  const [f] = await tx.$queryRawUnsafe<unknown[]>(
    `SELECT (SELECT count(*)::int FROM "orden" WHERE "organizacion_id" = $1) AS ordenes,
            (SELECT "valor"::text FROM "tarifa_valor" WHERE "id" = $2) AS tarifa,
            (SELECT "nombre" FROM "zona" WHERE "id" = $3) AS zona,
            (SELECT "tope_intentos_entrega" FROM "organizacion" WHERE "id" = $1) AS tope,
            (SELECT count(*)::int FROM "jobs" WHERE "organizacion_id" = $1) AS jobs`,
    d.org,
    d.tarifa,
    d.zona,
  );
  return f;
}

const TODAS_BLOQUEADAS = {
  insertOrden: "SL121",
  updateTarifa: "SL121",
  deleteZona: "SL121",
  updateTope: "SL121",
  insertJob: "SL121",
};
const TODAS_PASAN = { insertOrden: null, updateTarifa: null, deleteZona: null, updateTope: null, insertJob: null };

describeSiHayBase("SLT-121 — el bloqueo por mora en la base (R10, R12, R16, R18)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R10, R16: congelada por la corrida, servi_app lee todo y cada escritura falla con SL121 sin efectos", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await sembrar(tx);
      await facturaCerrada(tx, a.org, { numero: 1, hasta: cero("2026-11-16"), total: "1000.00" });
      const congelada = await congelar(tx, a.org, aLas("2026-11-24", "00:30"));
      const antes = await foto(tx, a);

      await comoApp(tx, a.org);
      const [lecturas] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT (SELECT count(*)::int FROM "orden") AS ordenes, (SELECT count(*)::int FROM "zona") AS zonas,
                (SELECT count(*)::int FROM "tarifa_valor") AS tarifas,
                (SELECT "congelada_at" IS NOT NULL FROM "organizacion" WHERE "id" = $1) AS ve_su_congelamiento,
                (SELECT count(*)::int FROM factura_plataforma_mora($1, $2::timestamp, $3)) AS facturas_en_mora`,
        a.org,
        aLas("2026-11-24", "10:00"),
        GRACIA_GLOBAL,
      );
      const intentos = await escrituras(tx, a);
      await comoDueno(tx);
      return { congelada: congelada.resultado, lecturas, intentos, antes, despues: await foto(tx, a) };
    });
    expect(r.congelada).toBe("congelada");
    expect(r.lecturas).toEqual({ ordenes: 1, zonas: 1, tarifas: 1, ve_su_congelamiento: true, facturas_en_mora: 1 });
    expect(r.intentos).toEqual(TODAS_BLOQUEADAS);
    expect(r.despues).toEqual(r.antes);
  });

  it("R12, R16: por el cliente de Prisma la escritura llega como empresa_congelada (SL121)", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await sembrar(tx);
      await congelarAMano(tx, a.org);
      await comoApp(tx, a.org);
      const actualizar = await capturar(tx, () => tx.zona.update({ where: { id: a.zona }, data: { nombre: "Otra" } }));
      const crear = await capturar(tx, () =>
        tx.tarifaValor.create({
          data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "1.00", ivaPct: "13.00", tiendaId: a.fks.tiendaId },
        }),
      );
      const borrar = await capturar(tx, () => tx.tarifaValor.deleteMany({ where: { id: a.tarifa } }));
      await comoDueno(tx);
      return { actualizar, crear, borrar };
    });
    for (const e of [r.actualizar, r.crear, r.borrar]) {
      expect(sqlstateDe(e)).toBe("SL121");
      expect(String((e as Error).message)).toContain("empresa_congelada");
    }
  });

  it("R16: el dueño y un camino con app.mora_permitida escriben; sin el permiso, vuelve a fallar", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await sembrar(tx);
      await congelarAMano(tx, a.org);
      // El dueño, con la empresa en el contexto (el superadmin, los cierres, las funciones SECURITY DEFINER).
      await fijarEmpresa(tx, a.org);
      const dueno = await escrituras(tx, a);
      await comoApp(tx, a.org);
      await tx.$executeRawUnsafe(`SELECT set_config('app.mora_permitida', 'pago_plataforma', true)`);
      const conPermiso = await escrituras(tx, a);
      await tx.$executeRawUnsafe(`SELECT set_config('app.mora_permitida', '', true)`);
      const sinPermiso = await escrituras(tx, a);
      await comoDueno(tx);
      return { dueno, conPermiso, sinPermiso };
    });
    expect(r.dueno).toEqual(TODAS_PASAN);
    expect(r.conPermiso).toEqual(TODAS_PASAN);
    expect(r.sinPermiso).toEqual(TODAS_BLOQUEADAS);
  });

  it("R18: con A congelada, B escribe; al descongelar A, A vuelve a escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await sembrar(tx);
      const b = await sembrar(tx);
      await congelarAMano(tx, a.org);
      await comoApp(tx, b.org);
      const otra = await escrituras(tx, b);
      await comoApp(tx, a.org);
      const congelada = await escrituras(tx, a);
      await comoDueno(tx);
      const [{ d }] = await tx.$queryRawUnsafe<{ d: string }[]>(
        `SELECT organizacion_mora_descongelar_a_mano($1, '2026-11-30'::date, '2026-11-24 16:00'::timestamp) AS d`,
        a.org,
      );
      await comoApp(tx, a.org);
      const descongelada = await escrituras(tx, a);
      await comoDueno(tx);
      return { otra, congelada, d, descongelada };
    });
    expect(r.otra).toEqual(TODAS_PASAN);
    expect(r.congelada).toEqual(TODAS_BLOQUEADAS);
    expect(r.d).toBe("ok");
    expect(r.descongelada).toEqual(TODAS_PASAN);
  });

  it("sin empresa en el contexto el trigger no aplica: no hay empresa que mirar", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await sembrar(tx);
      await congelarAMano(tx, a.org);
      await comoApp(tx, "");
      const sinEmpresa = await intentar(tx, `UPDATE "zona" SET "nombre" = "nombre" WHERE false`);
      await comoDueno(tx);
      return sinEmpresa;
    });
    expect(r).toBeNull();
  });
});
