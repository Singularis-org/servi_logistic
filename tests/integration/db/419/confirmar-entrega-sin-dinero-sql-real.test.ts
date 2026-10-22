import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS, type TxDeTest } from "../_postgres-real";
import {
  FOTO,
  clienteConSavepoint419,
  conEscenario419,
  crearPersonas419,
  montarServicio419,
  prepararMundo419,
  type Mundo419,
} from "./_escenario-419";

/**
 * FICHA 419 (B6; R15) — confirmar un lote NO crea, modifica ni anula ningun movimiento de dinero.
 *
 * COMO SE MIDE, y por que no con `count()`: la base local es compartida y otras suites confirman y
 * borran filas de estos libros en paralelo (un `count()` global ya dio `-1` en un `--rapido`). Se
 * mide con `pg_stat_xact_user_tables`, que cuenta las filas insertadas / actualizadas / borradas
 * POR ESTA TRANSACCION y por nadie mas. Delta 0 en las tablas de dinero alrededor de la llamada =
 * el lote no las toco.
 *
 * NO VERDE POR VACIO: antes de medir, el test SIEMBRA filas de dinero en esta misma transaccion
 * (tienda, caja, mensajero) y comprueba que el contador las VE (`n_tup_ins` > 0). Si la medicion
 * no viera las escrituras de la propia transaccion, ese paso fallaria.
 *
 * Y la fila de la orden: todas sus columnas quedan iguales salvo `estatus_id` y `updated_at`
 * (ningun apunte de flete ni de cobro sobre la orden).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const TABLAS_DINERO = [
  "wallet_tienda_movimiento",
  "wallet_movimiento",
  "pago_mensajero_movimiento",
  "rechazo_tienda_cobro",
  "rechazo_tienda_cobro_anulacion",
  "liquidacion_pago",
] as const;

type Contadores = Record<string, { ins: number; upd: number; del: number }>;

async function contadores(tx: TxDeTest): Promise<Contadores> {
  const filas = await tx.$queryRawUnsafe<
    { relname: string; ins: bigint; upd: bigint; del: bigint }[]
  >(
    `SELECT relname, n_tup_ins AS ins, n_tup_upd AS upd, n_tup_del AS del
       FROM pg_stat_xact_user_tables
      WHERE schemaname = 'public' AND relname = ANY($1::text[])`,
    [...TABLAS_DINERO],
  );
  const out: Contadores = {};
  for (const t of TABLAS_DINERO) out[t] = { ins: 0, upd: 0, del: 0 };
  for (const f of filas) out[f.relname] = { ins: Number(f.ins), upd: Number(f.upd), del: Number(f.del) };
  return out;
}

describeSiHayBase("419/R15 — el lote central no mueve dinero (Postgres real)", () => {
  let mundo: Mundo419;
  let r: Awaited<ReturnType<typeof correr>>;

  function correr() {
    return conEscenario419(mundo, async (tx) => {
      const p = await crearPersonas419(mundo, tx);
      const inicial = await contadores(tx);

      // Semilla de dinero de ESTE escenario (prueba de que el contador ve la propia tx).
      await tx.walletTiendaMovimiento.create({
        data: {
          tiendaId: p.tiendaA,
          tipo: "debito",
          categoria: "flete",
          monto: new Prisma.Decimal("2000.00"),
          origenTipo: "cierre_dia",
          origenId: randomUUID(),
          descripcion: "419 semilla flete",
        },
      });
      await tx.walletMovimiento.create({
        data: {
          tipo: "ingreso",
          categoria: "ingreso_ajuste",
          monto: new Prisma.Decimal("1000.00"),
          origenTipo: "manual",
          origenId: null,
          descripcion: "419 semilla caja",
        },
      });
      await tx.pagoMensajeroMovimiento.create({
        data: {
          mensajeroId: p.mensajeroId,
          tipo: "devengo",
          categoria: "pago_devengado",
          monto: new Prisma.Decimal("1500.00"),
          origenTipo: "cierre_dia",
          origenId: randomUUID(),
          registradoPor: null,
        },
      });
      const sembrado = await contadores(tx);

      const e1 = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
      const e2 = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
      const ya = await p.sembrarOrden({ estatus: "devuelta_a_tienda" });
      const filaAntes = await tx.orden.findUniqueOrThrow({ where: { id: e1.ordenId } });

      const antes = await contadores(tx);
      const m = montarServicio419(clienteConSavepoint419(tx));
      const res = await m.service.confirmarEntrega(
        { tiendaId: p.tiendaA, ordenIds: [e1.ordenId, e2.ordenId, ya.ordenId], evidencias: FOTO },
        p.actorAdmin,
      );
      const despues = await contadores(tx);
      const filaDespues = await tx.orden.findUniqueOrThrow({ where: { id: e1.ordenId } });

      return { inicial, sembrado, antes, despues, res, filaAntes, filaDespues };
    });
  }

  beforeAll(async () => {
    mundo = await prepararMundo419();
    r = await correr();
  }, 120_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  it("la medicion NO es vacia: ve las filas de dinero sembradas en esta transaccion", () => {
    expect(r.sembrado.wallet_tienda_movimiento.ins - r.inicial.wallet_tienda_movimiento.ins).toBe(1);
    expect(r.sembrado.wallet_movimiento.ins - r.inicial.wallet_movimiento.ins).toBe(1);
    expect(r.sembrado.pago_mensajero_movimiento.ins - r.inicial.pago_mensajero_movimiento.ins).toBe(1);
  });

  it("confirmar el lote: delta 0 (insert, update, delete) en todas las tablas de dinero", () => {
    expect(r.res.status).toBe("ok");
    expect(r.despues).toEqual(r.antes);
  });

  it("la fila de la orden solo cambia `estatus_id` y `updated_at`", () => {
    const { estatusId: _a, updatedAt: _b, ...antes } = r.filaAntes;
    const { estatusId: _c, updatedAt: _d, ...despues } = r.filaDespues;
    void _a;
    void _b;
    void _c;
    void _d;
    expect(JSON.parse(JSON.stringify(despues))).toEqual(JSON.parse(JSON.stringify(antes)));
    expect(r.filaDespues.estatusId).not.toBe(r.filaAntes.estatusId);
  });
});
