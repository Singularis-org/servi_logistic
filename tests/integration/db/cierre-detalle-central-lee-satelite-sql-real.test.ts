import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { aprobarCierre, rechazarCierre, verCierreDetalle } from "@/lib/actions/cierres-admin";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, tomarLockDeEscrituraReal } from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — PA1 / R116, contra la base.
 *
 * La central (acceso total) LEE el detalle de un cierre del día de una bodega satélite de SU
 * empresa, y nada más:
 *  - un cierre de satélite de OTRA empresa no se devuelve (dos empresas sembradas);
 *  - el adminSatelite de otra zona sigue sin leerlo (y el de su zona, sí: control positivo);
 *  - aprobar y rechazar ese cierre siguen dando `no_encontrada`, y el cierre no cambia.
 *
 * POR LAS SERVER ACTIONS Y COMMITEANDO, como `aislamiento-cierres.test.ts`: cada action arma su
 * servicio con `getPrismaClient()` (extension por empresa + `set_config` + rol `servi_app`, que
 * activa la RLS). Envolverlas en una transaccion revertida obligaria a cambiar ese cliente y ya no
 * se mediria el filtro real. La siembra se borra en el `afterAll`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Empresa {
  organizacionId: string;
  maestro: Actor;
  admin: Actor;
  /** adminSatelite de la zona del cierre de satelite. */
  satDeSuZona: Actor;
  /** adminSatelite de otra zona satelite de la misma empresa. */
  satDeOtraZona: Actor;
  /** Cierre del dia `solicitado` con destino bodega satelite. */
  cierreSatelite: string;
  /** Cierre del dia `solicitado` con destino bodega central (control). */
  cierreCentral: string;
}

async function sembrarEmpresa(base: PrismaClient, letra: string): Promise<Empresa> {
  const organizacionId = (await crearOrganizacion(base, { nombre: `Empresa ${letra} de SLT-104` })).id;
  return base.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const admin = await crearUsuarioDePrueba(tx, "admin");
      const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
      const zona = (nombre: string) =>
        tx.zona.create({
          data: { nombre: `${nombre} ${letra} ${organizacionId.slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        });
      const zonaCentral = await zona("Central SLT-104");
      const zonaSat = await zona("Satelite SLT-104");
      const otraZonaSat = await zona("Otra satelite SLT-104");
      const satDeSuZona = await crearUsuarioDePrueba(tx, "adminSatelite");
      const satDeOtraZona = await crearUsuarioDePrueba(tx, "adminSatelite");
      await tx.usuario.update({ where: { id: satDeSuZona.id }, data: { zonaId: zonaSat.id } });
      await tx.usuario.update({ where: { id: satDeOtraZona.id }, data: { zonaId: otraZonaSat.id } });

      const cierre = (destinoTipo: "bodega_central" | "bodega_satelite", destinoZonaId: string) =>
        tx.cierreDia.create({
          data: { mensajeroId: mensajero.id, estado: "solicitado", destinoTipo, destinoZonaId },
          select: { id: true },
        });
      const cierreSatelite = (await cierre("bodega_satelite", zonaSat.id)).id;
      const cierreCentral = (await cierre("bodega_central", zonaCentral.id)).id;
      return {
        organizacionId,
        maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
        admin: { usuarioId: admin.id, rol: "admin", organizacionId },
        satDeSuZona: { usuarioId: satDeSuZona.id, rol: "adminSatelite", organizacionId },
        satDeOtraZona: { usuarioId: satDeOtraZona.id, rol: "adminSatelite", organizacionId },
        cierreSatelite,
        cierreCentral,
      };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}

/** Tablas con `organizacion_id`, para borrar todo lo de las empresas sembradas. */
async function tablasDeNegocio(base: PrismaClient): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ t: string }[]>(
    `SELECT c.table_name AS t
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'organizacion_id'
        AND t.table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  return filas.map((f) => f.t);
}

/** Borra por pasadas (cada borrado en su SAVEPOINT) hasta que no queda nada; si una pasada no avanza, falla. */
async function limpiar(base: PrismaClient, tablas: string[], ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await base.$transaction(
    async (tx) => {
      let pendientes = [...tablas];
      while (pendientes.length > 0) {
        const fallidas: string[] = [];
        for (const t of pendientes) {
          await tx.$executeRawUnsafe(`SAVEPOINT limpiar_slt104`);
          try {
            await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organizacion_id = ANY($1::text[])`, ids);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT limpiar_slt104`);
          } catch {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT limpiar_slt104`);
            fallidas.push(t);
          }
        }
        if (fallidas.length === pendientes.length) {
          throw new Error(`SLT-104: no se pudo limpiar ${fallidas.join(", ")}`);
        }
        pendientes = fallidas;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE id = ANY($1::text[])`, ids);
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

describeSiHayBase("SLT-104 R116 — la central lee el cierre del día de satélite de su empresa, solo para leer", () => {
  let base: PrismaClient;
  let tablas: string[];
  let A: Empresa;
  let B: Empresa;
  let soltarLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    soltarLock = await tomarLockDeEscrituraReal();
    base = crearPrismaDeTest();
    tablas = await tablasDeNegocio(base);
    if (!tablas.includes("cierre_dia")) {
      throw new Error("`cierre_dia` no tiene `organizacion_id`: aplica las migraciones");
    }
    A = await sembrarEmpresa(base, "A");
    B = await sembrarEmpresa(base, "B");
  }, 120_000);

  afterAll(async () => {
    try {
      await limpiar(
        base,
        tablas,
        [A?.organizacionId, B?.organizacionId].filter((x): x is string => x !== undefined),
      );
    } finally {
      await base.$disconnect();
      await soltarLock?.();
    }
  }, 120_000);

  const ver = (e: Empresa, quien: Actor, cierreId: string) =>
    conEmpresa(e.organizacionId, () => verCierreDetalle({ cierreId }, { getActor: async () => quien }));

  it("la siembra existe: dos empresas, cada una con su cierre de satélite `solicitado` (sin esto el test no mide nada)", async () => {
    const filas = await base.cierreDia.findMany({
      where: { id: { in: [A.cierreSatelite, B.cierreSatelite] } },
      select: { id: true, organizacionId: true, destinoTipo: true, estado: true },
    });
    expect(new Map(filas.map((f) => [f.id, [f.organizacionId, f.destinoTipo, f.estado]]))).toEqual(
      new Map([
        [A.cierreSatelite, [A.organizacionId, "bodega_satelite", "solicitado"]],
        [B.cierreSatelite, [B.organizacionId, "bodega_satelite", "solicitado"]],
      ]),
    );
  });

  it("maestro y admin de A abren el cierre de satélite de A (y el de central, como siempre)", async () => {
    for (const quien of [A.maestro, A.admin]) {
      const sat = await ver(A, quien, A.cierreSatelite);
      expect(sat.status).toBe("ok");
      if (sat.status !== "ok") return;
      expect([sat.cierre.cierreId, sat.cierre.destinoTipo]).toEqual([A.cierreSatelite, "bodega_satelite"]);

      const central = await ver(A, quien, A.cierreCentral);
      expect(central.status).toBe("ok");
    }
  });

  it("dos empresas: el maestro de B no lee el cierre de satélite de A, ni el de A el de B", async () => {
    expect(await ver(B, B.maestro, A.cierreSatelite)).toEqual({ status: "no_encontrada" });
    expect(await ver(A, A.maestro, B.cierreSatelite)).toEqual({ status: "no_encontrada" });
    // Control: cada uno sí lee el suyo.
    expect((await ver(B, B.maestro, B.cierreSatelite)).status).toBe("ok");
  });

  it("el adminSatelite de otra zona sigue sin leerlo; el de su zona, sí", async () => {
    expect(await ver(A, A.satDeOtraZona, A.cierreSatelite)).toEqual({ status: "no_encontrada" });
    expect((await ver(A, A.satDeSuZona, A.cierreSatelite)).status).toBe("ok");
    // Y la satélite no gana la lectura del cierre de central.
    expect(await ver(A, A.satDeSuZona, A.cierreCentral)).toEqual({ status: "no_encontrada" });
  });

  it("la central NO escribe: aprobar y rechazar el cierre de satélite dan `no_encontrada` y el cierre no cambia", async () => {
    const antes = await base.cierreDia.findUniqueOrThrow({
      where: { id: A.cierreSatelite },
      select: { estado: true, resueltoPor: true, resueltoAt: true, motivoRechazo: true, updatedAt: true },
    });
    expect(antes.estado).toBe("solicitado");

    const deps = { getActor: async () => A.maestro };
    const r = await conEmpresa(A.organizacionId, async () => ({
      aprobar: await aprobarCierre({ cierreId: A.cierreSatelite }, deps),
      rechazar: await rechazarCierre({ cierreId: A.cierreSatelite, motivo: "intento de la central" }, deps),
    }));
    expect(r.aprobar).toEqual({ status: "no_encontrada" });
    expect(r.rechazar).toEqual({ status: "no_encontrada" });

    const despues = await base.cierreDia.findUniqueOrThrow({
      where: { id: A.cierreSatelite },
      select: { estado: true, resueltoPor: true, resueltoAt: true, motivoRechazo: true, updatedAt: true },
    });
    expect(despues).toEqual(antes);
  });
});
