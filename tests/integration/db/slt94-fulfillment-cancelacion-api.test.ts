import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { appendCambioEstado } from "@/lib/repositories/registrar-cambio-estado";

import { fijarEmpresa } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  serializarEscriturasReales,
} from "./_postgres-real";
import {
  activar,
  crearOrdenes,
  estatusId,
  fijarFulfillment,
  geoCartago,
  librosDe,
  limpiarEmpresas,
  movimientosDe,
  ordenRepo,
  resumenDe,
  saldoTienda,
  sembrarEmpresa,
  sembrarUsuario,
  sqlstateDe,
  type EmpresaDePrueba,
  type Geo,
} from "./_fixtures/fulfillment-94";

// SLT-94 (T1.4; R30, R39, D12) — la cancelación por API devuelve el cobro de fulfillment, una sola vez,
// en la misma transacción que la cancelación. Se cancela con `OrdenRepository.cancelarViaApi` REAL (el
// que construye `ApiOrdenCancelacionService`), se elimina con `softDelete` y se restaura con `restore`.
//
// Empresa A activada, tienda A1 con fulfillment 1000.00 + 13 %. Las órdenes nacen en
// `por_recolectar_en_tienda` por la ruta con guía (la cancelación las busca por guía) y se pasan a
// `en_bodega_central`, el estado cancelable por API.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

let base: PrismaClient;
let app: PrismaClient;
let geo: Geo;
let porRecolectar: string;
let enBodega: string;
let devolviendo: string;
let A: EmpresaDePrueba;
let A1: string;

const COBRO = "1 cargo creacion 1000.00 130.00";

async function crearEnBodega(nombre: string): Promise<{ id: string; numGuia: number }> {
  const remision = `SLT94C-${nombre}-${RUN}`;
  const { ids } = await crearOrdenes(app, base, A, A1, [remision], { conGuia: true, estatusId: porRecolectar, geo });
  const id = ids[remision];
  if (id === undefined) throw new Error(`la orden ${nombre} no se creó`);
  const { numGuia } = await base.orden.findUniqueOrThrow({ where: { id }, select: { numGuia: true } });
  if (numGuia === null) throw new Error(`la orden ${nombre} nació sin guía`);
  // La llegada a bodega no es lo que se mide: se fija como dueño, sin pasar por la recepción.
  await base.orden.update({ where: { id }, data: { estatusId: enBodega } });
  return { id, numGuia };
}

function cancelar(numGuia: number) {
  return conEmpresa(A.id, () =>
    ordenRepo(app).cancelarViaApi({ numGuia, ownerId: A1, devueltaOrigenEstatusId: devolviendo }),
  );
}

function eliminar(ordenId: string) {
  return conEmpresa(A.id, () => ordenRepo(app).softDelete({ ids: [ordenId], ownerId: null, actorUsuarioId: A.maestroId }));
}

function restaurar(ordenId: string) {
  return conEmpresa(A.id, () => ordenRepo(app).restore([ordenId], A.maestroId));
}

class Revertir extends Error {
  constructor(readonly valor: unknown = null) {
    super("rollback deliberado del test");
  }
}

describeSiHayBase("SLT-94 — la cancelación por API devuelve el cobro de fulfillment (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    geo = await geoCartago(base);
    porRecolectar = await estatusId(base, "por_recolectar_en_tienda");
    enBodega = await estatusId(base, "en_bodega_central");
    devolviendo = await estatusId(base, "devolviendo_a_tienda");
    await bajoLockDeEscrituraReal(async () => {
      A = await sembrarEmpresa(base, `C ${RUN}`);
      A1 = await sembrarUsuario(base, A.id, "adminTienda", "C-A1");
      await activar(base, A.id);
      await fijarFulfillment(base, A.id, A1, "1000.00", "13.00");
    });
  }, 120_000);

  afterAll(async () => {
    if (base === undefined) return;
    if (A?.id) await bajoLockDeEscrituraReal(() => limpiarEmpresas(base, [A.id]));
    await base.$disconnect();
  }, 180_000);

  it("R30: cancelar por API devuelve 1000.00 + 130.00 a la tienda, con la fecha de la cancelación, sin tocar el cobro", async () => {
    const o = await crearEnBodega("c1");
    const cargo = (await movimientosDe(base, o.id))[0];
    const saldo = await saldoTienda(base, A1);

    expect((await cancelar(o.numGuia)).status).toBe("ok");

    const movs = await movimientosDe(base, o.id);
    expect(movs.map((m) => `${m.secuencia} ${m.tipo} ${m.causa} ${m.monto} ${m.iva} ${m.tienda_id}`)).toEqual([
      `${COBRO} ${A1}`,
      `2 reverso cancelacion_api 1000.00 130.00 ${A1}`,
    ]);
    expect(movs[0]).toEqual(cargo);
    const [fila] = await base.$queryRawUnsafe<{ created_at: Date }[]>(
      `SELECT "created_at" FROM "orden_historial_estado" WHERE "orden_id" = $1 AND "origen_tipo" = 'cancelacion_api'`,
      o.id,
    );
    expect(movs[1].ocurrido_at).toEqual(fila.created_at);
    const libros = await librosDe(base, movs[1].id);
    expect(libros.map((f) => [f.libro, f.tipo, f.categoria, f.monto, f.tienda_id])).toEqual([
      ["caja", "egreso", "egreso_reverso_fulfillment", "1000.00", null],
      ["caja", "egreso", "egreso_reverso_iva_fulfillment", "130.00", null],
      ["tienda", "credito", "fulfillment_anulado", "1000.00", A1],
      ["tienda", "credito", "iva_fulfillment_anulado", "130.00", A1],
    ]);
    for (const f of libros) expect(f.fecha_movimiento).toEqual(fila.created_at);
    expect(Number(await saldoTienda(base, A1)) - Number(saldo)).toBeCloseTo(1130, 2);

    // Una segunda cancelación es `conflict` (ya está en devolviendo_a_tienda) y no devuelve otra vez.
    expect((await cancelar(o.numGuia)).status).toBe("conflict");
    expect(await movimientosDe(base, o.id)).toHaveLength(2);

    // R39: aunque una segunda fila `cancelacion_api` llegara a la bitácora (un camino futuro que no
    // pasara por el `conflict`), el último movimiento ya es un reverso y no se devuelve otra vez.
    await base.$executeRawUnsafe(
      `INSERT INTO "orden_historial_estado" ("id", "orden_id", "estatus_origen_id", "estatus_destino_id", "actor_usuario_id",
         "origen_tipo", "motivo", "organizacion_id")
       VALUES ($1, $2, $3, $3, $4, 'cancelacion_api', 'cancelada por tienda', $5)`,
      randomUUID(),
      o.id,
      devolviendo,
      A1,
      A.id,
    );
    expect(await resumenDe(base, o.id)).toEqual([COBRO, "2 reverso cancelacion_api 1000.00 130.00"]);
  });

  it("R30: la devolución va en la MISMA transacción que la cancelación: si la transacción revierte, no queda reverso ni cambio de estado", async () => {
    const o = await crearEnBodega("c2");
    const resultado = await base
      .$transaction(
        async (tx) => {
          await serializarEscriturasReales(tx);
          await fijarEmpresa(tx, A.id);
          const repo = new OrdenRepository(clienteConSavepoint(tx));
          const r = await repo.cancelarViaApi({ numGuia: o.numGuia, ownerId: A1, devueltaOrigenEstatusId: devolviendo });
          const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM "orden_fulfillment_movimiento" WHERE "orden_id" = $1 AND "tipo" = 'reverso'`,
            o.id,
          );
          throw new Revertir([r.status, n]);
        },
        { timeout: 60_000, maxWait: 30_000 },
      )
      .catch((e: unknown) => (e instanceof Revertir ? e.valor : sqlstateDe(e)));
    // Control de no vacuidad: dentro de la transacción la cancelación sí devolvió.
    expect(resultado).toEqual(["ok", 1]);
    expect(await resumenDe(base, o.id)).toEqual([COBRO]);
    const { estatusId: actual } = await base.orden.findUniqueOrThrow({ where: { id: o.id }, select: { estatusId: true } });
    expect(actual).toBe(enBodega);
  });

  it("R39: cancelar → eliminar → una sola devolución; → restaurar → sin re-cobro (sigue cancelada)", async () => {
    const o = await crearEnBodega("c3");
    expect((await cancelar(o.numGuia)).status).toBe("ok");
    expect(await eliminar(o.id)).toBe(1);
    expect(await resumenDe(base, o.id)).toEqual([COBRO, "2 reverso cancelacion_api 1000.00 130.00"]);
    expect(await restaurar(o.id)).toBe(1);
    expect(await resumenDe(base, o.id)).toEqual([COBRO, "2 reverso cancelacion_api 1000.00 130.00"]);
    const { estatusId: actual } = await base.orden.findUniqueOrThrow({ where: { id: o.id }, select: { estatusId: true } });
    expect(actual).toBe(devolviendo);
  });

  it("R39: eliminar → restaurar → cancelar → cargo, reverso, cargo, reverso (uno por cada cobro)", async () => {
    const o = await crearEnBodega("c4");
    expect(await eliminar(o.id)).toBe(1);
    expect(await restaurar(o.id)).toBe(1);
    expect((await cancelar(o.numGuia)).status).toBe("ok");
    expect((await movimientosDe(base, o.id)).map((m) => `${m.secuencia} ${m.tipo} ${m.causa} ${m.monto} ${m.iva}`)).toEqual([
      COBRO,
      "2 reverso eliminacion 1000.00 130.00",
      "3 cargo restauracion 1000.00 130.00",
      "4 reverso cancelacion_api 1000.00 130.00",
    ]);
  });

  it("R30/D12: una devolución real a devolviendo_a_tienda (`ajuste_estado`, #42) NO devuelve el cobro", async () => {
    const o = await crearEnBodega("c5");
    await base.$transaction(async (tx) => {
      await fijarEmpresa(tx, A.id);
      await tx.orden.update({ where: { id: o.id }, data: { estatusId: devolviendo } });
      await appendCambioEstado(tx, [
        {
          ordenId: o.id,
          estatusOrigenId: enBodega,
          estatusDestinoId: devolviendo,
          actorUsuarioId: A.maestroId,
          origenTipo: "ajuste_estado",
          motivo: "devolución real",
        },
      ]);
    });
    const filas = await base.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "orden_historial_estado" WHERE "orden_id" = $1 AND "origen_tipo" = 'ajuste_estado'`,
      o.id,
    );
    expect(filas[0].n).toBe(1); // la transición se escribió de verdad
    expect(await resumenDe(base, o.id)).toEqual([COBRO]);
  });
});

