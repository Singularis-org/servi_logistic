import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  aprobarCierre,
  listarCierresAdmin,
  listarPendientesCierresAdminPaginado,
  rechazarCierre,
  verCierreDetalle,
} from "@/lib/actions/cierres-admin";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SL-17 (T3.3, design §9.2, R30) — los cierres del dia de una empresa no se ven ni se resuelven
// desde otra.
//
// POR QUE POR LAS SERVER ACTIONS Y COMMITEANDO. La pantalla de cierres del admin llama a estas
// actions, y cada una arma su servicio con `getPrismaClient()`: el cliente con la extension (filtro
// por empresa) y la envoltura (`set_config` + rol `servi_app`, que activa la RLS). Envolverlas en una
// transaccion revertida obligaria a sustituir ese cliente y ya no se mediria el aislamiento real. El
// precio es commitear la siembra y borrarla en el `afterAll`.
//
// QUE SE MIDE EN LA BASE, con el cliente BASE (dueno de las tablas, sin extension ni RLS): la foto
// de A —sus cierres, sus ordenes y el numero de filas de A en CADA tabla con `organizacion_id`—
// antes y despues de que B intente resolver cierres de A. Contar todas las tablas, y no una lista a
// mano, es lo que permite afirmar «no se creo nada en A» (movimientos, historial, avisos) sin saber
// que escribe hoy la aprobacion.
//
// CONTROL POSITIVO: B tiene sus propios cierres; los lista, los abre, aprueba uno y rechaza otro.
// Sin eso, un «no encontrado» seria indistinguible de una accion rota que no encuentra nada.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAGINA = { page: 1, pageSize: 50 };

interface Empresa {
  organizacionId: string;
  maestro: Actor;
  /** Dos cierres `solicitado`: el control positivo de B aprueba uno y rechaza el otro. */
  solicitado: string;
  solicitado2: string;
  /**
   * Cierre `vencido`: esta en la cola pero no se puede resolver, asi que su propia empresa recibe
   * `conflict`. Desde otra empresa tiene que dar `no_encontrada`: si diera `conflict`, B lo estaria
   * viendo.
   */
  vencido: string;
  ordenes: string[];
}

const idsDe = (e: Empresa): string[] => [e.solicitado, e.solicitado2, e.vencido].sort();

/** Las tablas con `organizacion_id`: la foto de una empresa las cuenta todas. */
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

/**
 * Siembra COMMITEADA de una empresa: maestro, mensajero, tienda, zona, dos ordenes en mano del
 * mensajero y dos cierres abiertos. Todo en una transaccion con la empresa fijada: el `DEFAULT` de
 * `organizacion_id` la pone en cada fila, como en la app.
 */
async function sembrarEmpresa(base: PrismaClient, letra: string): Promise<Empresa> {
  const organizacionId = (await crearOrganizacion(base, { nombre: `Empresa ${letra} de R30` })).id;
  return base.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
      const fks = await crearFksDeOrden(tx);
      const ordenes: string[] = [];
      for (const n of [1, 2]) {
        const o = await tx.orden.create({
          data: {
            numRemision: `R30-${letra}-${n}-${organizacionId.slice(0, 8)}`,
            destinatario: `Destinatario ${letra}`,
            telefonoDest: "88880000",
            producto: "Producto",
            estatusId: fks.estatusId,
            mensajeroAsignadoId: mensajero.id,
            tiendaId: fks.tiendaId,
            zonaId: fks.zonaId,
            provinciaId: fks.provinciaId,
            cantonId: fks.cantonId,
          },
          select: { id: true },
        });
        ordenes.push(o.id);
      }
      const cierre = (estado: "solicitado" | "vencido") =>
        tx.cierreDia.create({
          data: {
            mensajeroId: mensajero.id,
            estado,
            destinoTipo: "bodega_central",
            destinoZonaId: fks.zonaId,
          },
          select: { id: true },
        });
      const solicitado = (await cierre("solicitado")).id;
      const solicitado2 = (await cierre("solicitado")).id;
      const vencido = (await cierre("vencido")).id;
      return {
        organizacionId,
        maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
        solicitado,
        solicitado2,
        vencido,
        ordenes,
      };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}

/**
 * Borra todo lo de las empresas sembradas. No hay un orden fijo que conozca este test (la
 * aprobacion de B escribe en tablas que dependen unas de otras), asi que se reintenta por pasadas,
 * cada borrado en su SAVEPOINT, hasta que no queda nada o una pasada no avanza (y entonces falla).
 */
async function limpiar(base: PrismaClient, tablas: string[], ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await base.$transaction(
    async (tx) => {
      let pendientes = [...tablas];
      while (pendientes.length > 0) {
        const fallidas: string[] = [];
        for (const t of pendientes) {
          await tx.$executeRawUnsafe(`SAVEPOINT limpiar_r30`);
          try {
            await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organizacion_id = ANY($1::text[])`, ids);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT limpiar_r30`);
          } catch {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT limpiar_r30`);
            fallidas.push(t);
          }
        }
        if (fallidas.length === pendientes.length) {
          throw new Error(`R30: no se pudo limpiar ${fallidas.join(", ")}`);
        }
        pendientes = fallidas;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE id = ANY($1::text[])`, ids);
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

describeSiHayBase("SL-17 R30 — cierres del dia de dos empresas", () => {
  let base: PrismaClient;
  let tablas: string[];
  let A: Empresa;
  let B: Empresa;

  beforeAll(async () => {
    base = crearPrismaDeTest();
    tablas = await tablasDeNegocio(base);
    if (!tablas.includes("cierre_dia")) {
      throw new Error("`cierre_dia` no tiene `organizacion_id`: aplica las migraciones de SL-17");
    }
    A = await sembrarEmpresa(base, "A");
    B = await sembrarEmpresa(base, "B");
  }, 60_000);

  afterAll(async () => {
    try {
      await limpiar(
        base,
        tablas,
        [A?.organizacionId, B?.organizacionId].filter((x): x is string => x !== undefined),
      );
    } finally {
      await base.$disconnect();
    }
  }, 60_000);

  const comoB = <T>(fn: (deps: { getActor: () => Promise<Actor> }) => Promise<T>): Promise<T> =>
    conEmpresa(B.organizacionId, () => fn({ getActor: async () => B.maestro }));

  /** La foto de A en la base, leida como dueno: lo que B no debe poder cambiar. */
  async function fotoDeA() {
    const cierres = await base.cierreDia.findMany({
      where: { organizacionId: A.organizacionId },
      select: {
        id: true,
        estado: true,
        resueltoPor: true,
        resueltoAt: true,
        motivoRechazo: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    });
    const ordenes = await base.orden.findMany({
      where: { organizacionId: A.organizacionId },
      select: { id: true, estatusId: true, mensajeroAsignadoId: true, prioridad: true, updatedAt: true },
      orderBy: { id: "asc" },
    });
    const filas: Record<string, number> = {};
    for (const t of tablas) {
      const [{ n }] = await base.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${t}" WHERE organizacion_id = $1`,
        A.organizacionId,
      );
      if (n > 0) filas[t] = n;
    }
    return { cierres, ordenes, filas };
  }

  it("R30: B lista los cierres pendientes y ve solo los suyos (y SI los suyos)", async () => {
    const { paginado, completo } = await comoB(async (deps) => ({
      paginado: await listarPendientesCierresAdminPaginado(PAGINA, deps),
      completo: await listarCierresAdmin(deps),
    }));

    expect(paginado.status).toBe("ok");
    if (paginado.status !== "ok") return;
    // Conjunto EXACTO: los dos de B y ninguno mas. Un cierre de A colado lo rompe, y un listado
    // vacio tambien.
    expect(paginado.items.map((c) => c.cierreId).sort()).toEqual(idsDe(B));
    expect(paginado.total).toBe(3);

    expect(completo.status).toBe("ok");
    if (completo.status !== "ok") return;
    expect(completo.pendientes.map((c) => c.cierreId).sort()).toEqual(idsDe(B));
    expect(completo.historico).toEqual([]);

    // Y desde A, la simetrica: A ve los suyos, no los de B.
    const deA = await conEmpresa(A.organizacionId, () =>
      listarPendientesCierresAdminPaginado(PAGINA, { getActor: async () => A.maestro }),
    );
    expect(deA.status).toBe("ok");
    if (deA.status !== "ok") return;
    expect(deA.items.map((c) => c.cierreId).sort()).toEqual(idsDe(A));
  });

  it("R30: el detalle de un cierre de A, pedido desde B, es «no encontrado»; el suyo se abre", async () => {
    const { ajeno, propio } = await comoB(async (deps) => ({
      ajeno: await verCierreDetalle({ cierreId: A.solicitado }, deps),
      propio: await verCierreDetalle({ cierreId: B.solicitado }, deps),
    }));

    expect(ajeno).toEqual({ status: "no_encontrada" });
    expect(propio.status).toBe("ok");
  });

  it("R30: B aprueba y rechaza por id cierres de A → «no encontrado», y en A no cambia ni se crea nada", async () => {
    const antes = await fotoDeA();
    // Sin las filas de A el test no mide nada: falla, no pasa por vacio.
    expect(antes.cierres.map((c) => c.id).sort()).toEqual(idsDe(A));
    expect(antes.cierres.every((c) => c.estado === "solicitado" || c.estado === "vencido")).toBe(true);
    expect(antes.ordenes).toHaveLength(2);

    const r = await comoB(async (deps) => ({
      aprobarSolicitado: await aprobarCierre({ cierreId: A.solicitado }, deps),
      aprobarVencido: await aprobarCierre({ cierreId: A.vencido }, deps),
      rechazarSolicitado: await rechazarCierre({ cierreId: A.solicitado, motivo: "intento de B" }, deps),
      rechazarVencido: await rechazarCierre({ cierreId: A.vencido, motivo: "intento de B" }, deps),
      // Control positivo, entre las dos fotos de A: una resolucion que SI ocurre, en B, tampoco
      // toca A.
      aprobarPropio: await aprobarCierre({ cierreId: B.solicitado }, deps),
      rechazarPropio: await rechazarCierre({ cierreId: B.solicitado2, motivo: "rechazo de B" }, deps),
      vencidoPropio: await aprobarCierre({ cierreId: B.vencido }, deps),
    }));

    expect(r.aprobarSolicitado).toEqual({ status: "no_encontrada" });
    expect(r.aprobarVencido).toEqual({ status: "no_encontrada" });
    expect(r.rechazarSolicitado).toEqual({ status: "no_encontrada" });
    expect(r.rechazarVencido).toEqual({ status: "no_encontrada" });

    expect(r.aprobarPropio.status).toBe("ok");
    expect(r.rechazarPropio.status).toBe("ok");
    // El `vencido` propio SE VE y por eso da `conflict`; el de A, `no_encontrada`.
    expect(r.vencidoPropio).toEqual({ status: "conflict" });
    const deB = await base.cierreDia.findMany({
      where: { id: { in: idsDe(B) } },
      select: { id: true, estado: true },
    });
    expect(new Map(deB.map((c) => [c.id, c.estado]))).toEqual(
      new Map([
        [B.solicitado, "aprobado"],
        [B.solicitado2, "rechazado"],
        [B.vencido, "vencido"],
      ]),
    );

    expect(await fotoDeA()).toEqual(antes);
  });
});
