import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { asentarCierreDia } from "@/lib/repositories/_shared/asientos-cierre-dia";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  aprobar,
  consolidar,
  filasDeLibros,
  marcarRecibido,
  sembrarCierreAprobable,
  type CierreAprobable,
} from "./_fixtures/slt73-cierre-aprobable";

// SLT-73 · T8 · R16–R20 — LA MIGRACION C RETIRA LOS ASIENTOS DE LOS CIERRES SATELITE SIN CONCILIAR,
// LOS RESPALDA, Y SU `down.sql` LOS DEVUELVE TAL CUAL.
//
// Se ejecuta el SQL REAL de los dos archivos (leidos de disco) dentro de una transaccion que SIEMPRE
// se revierte: ni el borrado, ni el esquema `respaldo`, ni las filas restauradas sobreviven al test.
// Cada `migration.sql`/`down.sql` es UN bloque `DO`, asi que corre como una sola sentencia.
//
// ESCENARIO (todo por el camino real: aprobar, `asentarCierreDia`, consolidar, marcar recibido):
//   central        cierre de la central aprobado: la aprobacion escribe sus asientos (R3).
//   sinConsolidar  satelite aprobado SIN consolidar, con los asientos que escribia la aprobacion de
//                  antes del hotfix (`asentarCierreDia`), mas un INCENTIVO y un PREMIO del ranking
//                  posteriores al cierre en el libro del mensajero.
//   consolidado    satelite aprobado, asentado y CONSOLIDADO, sin conciliar.
//   conciliado     satelite aprobado, consolidado y CONCILIADO (la marca escribe sus asientos, R10).
//   solicitado     satelite en `solicitado` con UNA fila de caja forzada a mano: estado que el flujo no
//                  produce, centinela del filtro `estado = 'aprobado'`.
//
// Las filas esperadas van ESCRITAS A MANO (memoria «asercion contra su propia fuente»): son las de la
// aprobacion de la central, las mismas de `slt73-marcar-asienta.int.test.ts`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const DIR = path.join(process.cwd(), "db", "migrations", "20261031140200_slt73_retirar_asientos_satelite");
const UP = fs.readFileSync(path.join(DIR, "migration.sql"), "utf8");
const DOWN = fs.readFileSync(path.join(DIR, "down.sql"), "utf8");

const CAJA = [
  { tipo: "egreso", categoria: "egreso_indemnizacion", monto: "6000.00" },
  { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "1500.00" },
  { tipo: "ingreso", categoria: "ingreso_cod_recaudado", monto: "20000.00" },
  { tipo: "ingreso", categoria: "ingreso_comision_cod", monto: "700.00" },
  { tipo: "ingreso", categoria: "ingreso_flete", monto: "2500.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_comision_cod", monto: "91.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_flete", monto: "325.00" },
];

const TIENDA = [
  { tipo: "credito", categoria: "cod_recaudado", monto: "20000.00" },
  { tipo: "debito", categoria: "comision_cod", monto: "700.00" },
  { tipo: "debito", categoria: "flete", monto: "2500.00" },
  { tipo: "debito", categoria: "iva_comision_cod", monto: "91.00" },
  { tipo: "debito", categoria: "iva_flete", monto: "325.00" },
];

const MENSAJERO = [
  { tipo: "devengo", categoria: "pago_devengado", monto: "1500.00" },
  { tipo: "pago", categoria: "pago_efectivo", monto: "1500.00" },
];

/** Los devengos posteriores al cierre que la migracion NO retira (la conciliacion no los re-escribe). */
const POSTERIORES = [
  { tipo: "devengo", categoria: "incentivo", monto: "400.00" },
  { tipo: "devengo", categoria: "premio_ranking", monto: "800.00" },
];

/** El libro del mensajero del cierre con los posteriores, en el orden de `filasDeLibros` (categoria). */
const MENSAJERO_CON_POSTERIORES = [POSTERIORES[0], ...MENSAJERO, POSTERIORES[1]];

const ASENTADO = { caja: CAJA, tienda: TIENDA, mensajero: MENSAJERO };
const VACIO = { caja: [], tienda: [], mensajero: [] };

type Fila = { tabla: string; fila: Record<string, unknown> };

interface Escenario {
  central: CierreAprobable;
  sinConsolidar: CierreAprobable;
  consolidado: CierreAprobable;
  consolidadoBodegaId: string;
  conciliado: CierreAprobable;
  solicitado: CierreAprobable;
  ids: string[];
}

async function aprobado(tx: TxDeTest, destino: "bodega_central" | "bodega_satelite") {
  const k = await sembrarCierreAprobable(tx, destino);
  if ((await aprobar(k)) !== "ok") throw new Error(`no se aprobo el cierre ${destino}`);
  return k;
}

async function mensajeroDe(tx: TxDeTest, cierreId: string): Promise<string> {
  return (await tx.cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { mensajeroId: true } }))
    .mensajeroId;
}

async function sembrarEscenario(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);

  const central = await aprobado(tx, "bodega_central");

  const sinConsolidar = await aprobado(tx, "bodega_satelite");
  await asentarCierreDia(clienteConSavepoint(tx), sinConsolidar.cierreId);
  const mensajero = await mensajeroDe(tx, sinConsolidar.cierreId);
  await tx.pagoMensajeroMovimiento.create({
    data: {
      mensajeroId: mensajero,
      tipo: "devengo",
      categoria: "incentivo",
      monto: new Prisma.Decimal("400.00"),
      origenTipo: "cierre_dia",
      origenId: sinConsolidar.cierreId,
    },
  });
  await tx.pagoMensajeroMovimiento.create({
    data: {
      mensajeroId: mensajero,
      tipo: "devengo",
      categoria: "premio_ranking",
      monto: new Prisma.Decimal("800.00"),
      origenTipo: "cierre_dia",
      origenId: sinConsolidar.cierreId,
      premioDia: new Date("2026-10-30T00:00:00.000Z"),
    },
  });

  const consolidado = await aprobado(tx, "bodega_satelite");
  await asentarCierreDia(clienteConSavepoint(tx), consolidado.cierreId);
  const consolidadoBodegaId = await consolidar(tx, consolidado.adminSatelite);

  const conciliado = await aprobado(tx, "bodega_satelite");
  const conciliadoBodegaId = await consolidar(tx, conciliado.adminSatelite);
  if ((await marcarRecibido(tx, conciliadoBodegaId, "18500.00", conciliado.maestroId)) !== "updated") {
    throw new Error("no se concilio la consolidacion");
  }

  const solicitado = await sembrarCierreAprobable(tx, "bodega_satelite");
  await tx.walletMovimiento.create({
    data: {
      tipo: "ingreso",
      categoria: "ingreso_flete",
      monto: new Prisma.Decimal("2500.00"),
      origenTipo: "cierre_dia",
      origenId: solicitado.cierreId,
    },
  });

  return {
    central,
    sinConsolidar,
    consolidado,
    consolidadoBodegaId,
    conciliado,
    solicitado,
    ids: [central, sinConsolidar, consolidado, conciliado, solicitado].map((k) => k.cierreId),
  };
}

/** TODAS las columnas de las filas `cierre_dia` de esos cierres en los tres libros, en orden estable. */
async function blob(tx: TxDeTest, ids: string[]): Promise<Fila[]> {
  return tx.$queryRawUnsafe<Fila[]>(
    `SELECT u.tabla, u.fila FROM (
       SELECT 'wallet_movimiento' AS tabla, to_jsonb(w) AS fila FROM wallet_movimiento w
        WHERE w.origen_tipo = 'cierre_dia' AND w.origen_id = ANY($1::text[])
       UNION ALL
       SELECT 'wallet_tienda_movimiento', to_jsonb(t) FROM wallet_tienda_movimiento t
        WHERE t.origen_tipo = 'cierre_dia' AND t.origen_id = ANY($1::text[])
       UNION ALL
       SELECT 'pago_mensajero_movimiento', to_jsonb(m) FROM pago_mensajero_movimiento m
        WHERE m.origen_tipo = 'cierre_dia' AND m.origen_id = ANY($1::text[])
     ) u
     ORDER BY u.tabla, u.fila ->> 'id'`,
    ids,
  );
}

/** Las filas del respaldo de esos cierres; `null` si la tabla del respaldo no existe. */
async function respaldo(tx: TxDeTest, ids: string[]): Promise<Fila[] | null> {
  const [{ existe }] = await tx.$queryRawUnsafe<{ existe: boolean }[]>(
    `SELECT to_regclass('respaldo.slt73_asientos') IS NOT NULL AS existe`,
  );
  if (!existe) return null;
  return tx.$queryRawUnsafe<Fila[]>(
    `SELECT tabla, fila FROM respaldo.slt73_asientos
      WHERE fila ->> 'origen_id' = ANY($1::text[])
      ORDER BY tabla, id`,
    ids,
  );
}

/**
 * La tabla del respaldo de ESTA ficha. El esquema `respaldo` es compartido (SLT-75 guarda ahi su
 * propio respaldo): el down quita la tabla y el esquema solo si queda vacio, asi que se mide la
 * tabla. La convivencia de los dos respaldos: `respaldo-convivencia-slt73-slt75.test.ts`.
 */
async function tablaRespaldo(tx: TxDeTest): Promise<boolean> {
  const [{ existe }] = await tx.$queryRawUnsafe<{ existe: boolean }[]>(
    `SELECT to_regclass('respaldo.slt73_asientos') IS NOT NULL AS existe`,
  );
  return existe;
}

const up = (tx: TxDeTest) => tx.$executeRawUnsafe(UP);
const down = (tx: TxDeTest) => tx.$executeRawUnsafe(DOWN);

describeSiHayBase("SLT-73 T8 — migracion C: retirar los asientos de los cierres satelite sin conciliar", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: antes del up, cada cierre del escenario tiene sus asientos", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarEscenario(tx);
      return {
        central: await filasDeLibros(tx, e.central.cierreId),
        sinConsolidar: await filasDeLibros(tx, e.sinConsolidar.cierreId),
        consolidado: await filasDeLibros(tx, e.consolidado.cierreId),
        conciliado: await filasDeLibros(tx, e.conciliado.cierreId),
        solicitado: await filasDeLibros(tx, e.solicitado.cierreId),
      };
    });
    expect(r.central).toEqual(ASENTADO);
    expect(r.sinConsolidar).toEqual({ caja: CAJA, tienda: TIENDA, mensajero: MENSAJERO_CON_POSTERIORES });
    expect(r.consolidado).toEqual(ASENTADO);
    expect(r.conciliado).toEqual(ASENTADO);
    expect(r.solicitado).toEqual({
      caja: [{ tipo: "ingreso", categoria: "ingreso_flete", monto: "2500.00" }],
      tienda: [],
      mensajero: [],
    });
  });

  it("R16/R17: el up retira y respalda integras las filas de los satelite sin conciliar, y no toca la central, el conciliado ni el no aprobado", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarEscenario(tx);
      const retirables = [e.sinConsolidar.cierreId, e.consolidado.cierreId];
      const intactos = [e.central.cierreId, e.conciliado.cierreId, e.solicitado.cierreId];
      const antesRetirables = await blob(tx, retirables);
      const antesIntactos = await blob(tx, intactos);
      await up(tx);
      const [{ usage }] = await tx.$queryRawUnsafe<{ usage: boolean }[]>(
        `SELECT has_schema_privilege('servi_app', 'respaldo', 'USAGE') AS usage`,
      );
      return {
        antesRetirables,
        antesIntactos,
        sinConsolidar: await filasDeLibros(tx, e.sinConsolidar.cierreId),
        consolidado: await filasDeLibros(tx, e.consolidado.cierreId),
        despuesIntactos: await blob(tx, intactos),
        respaldoRetirables: await respaldo(tx, retirables),
        respaldoIntactos: await respaldo(tx, intactos),
        usage,
      };
    });
    // R16: fuera de los tres libros…
    expect(r.consolidado).toEqual(VACIO);
    // …salvo los devengos posteriores al cierre, que la conciliacion no re-escribe.
    expect(r.sinConsolidar).toEqual({ caja: [], tienda: [], mensajero: POSTERIORES });
    // …y cada fila retirada esta en el respaldo, con TODAS sus columnas iguales.
    const retiradas = r.antesRetirables.filter(
      (f) => !["incentivo", "premio_ranking"].includes(String(f.fila.categoria)),
    );
    expect(retiradas).toHaveLength(2 * (CAJA.length + TIENDA.length + MENSAJERO.length));
    expect(r.respaldoRetirables).toEqual(retiradas);
    // R17: la central, el satelite conciliado y el no aprobado, intactos y sin respaldo.
    expect(r.antesIntactos).toHaveLength(2 * (CAJA.length + TIENDA.length + MENSAJERO.length) + 1);
    expect(r.despuesIntactos).toEqual(r.antesIntactos);
    expect(r.respaldoIntactos).toEqual([]);
    // El respaldo no es de la app: `servi_app` no puede ni entrar al esquema.
    expect(r.usage).toBe(false);
  });

  it("R19: el down devuelve exactamente las filas retiradas y quita el respaldo; up → down → up deja el mismo blob", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarEscenario(tx);
      const antes = await blob(tx, e.ids);
      await up(tx);
      const trasUp = await blob(tx, e.ids);
      await down(tx);
      const trasDown = await blob(tx, e.ids);
      const tablaTrasDown = await tablaRespaldo(tx);
      await up(tx);
      const trasSegundoUp = await blob(tx, e.ids);
      return { antes, trasUp, trasDown, tablaTrasDown, trasSegundoUp };
    });
    expect(r.trasUp.length).toBeLessThan(r.antes.length);
    expect(r.trasDown).toEqual(r.antes);
    expect(r.tablaTrasDown).toBe(false);
    expect(r.trasSegundoUp).toEqual(r.trasUp);
  });

  it("R18: con un pago al mensajero contra un cierre de S, el up aborta con el conteo y nada cambia", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarEscenario(tx);
      await tx.liquidacionPago.create({
        data: {
          claveIdempotencia: randomUUID(),
          mensajeroId: await mensajeroDe(tx, e.consolidado.cierreId),
          cierreId: e.consolidado.cierreId,
          monto: new Prisma.Decimal("100.00"),
          metodo: "efectivo",
          fechaPago: new Date("2026-10-31T00:00:00.000Z"),
          registradoPor: e.consolidado.maestroId,
        },
        select: { id: true },
      });
      const antes = await blob(tx, e.ids);
      const respaldoAntes = await respaldo(tx, e.ids);
      await tx.$executeRawUnsafe("SAVEPOINT slt73_guarda");
      let error: unknown = null;
      try {
        await up(tx);
      } catch (err) {
        error = err;
      }
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT slt73_guarda");
      return {
        error: error instanceof Error ? error.message : String(error),
        antes,
        despues: await blob(tx, e.ids),
        respaldoAntes,
        respaldoDespues: await respaldo(tx, e.ids),
      };
    });
    expect(r.error).toContain("slt73: 1 cierres satelite sin conciliar tienen un pago al mensajero");
    expect(r.despues).toEqual(r.antes);
    expect(r.respaldoDespues).toEqual(r.respaldoAntes);
  });

  it("R16/D15: la compensacion de un premio anulado (`ajuste_pago` con `premio_dia`) se queda en el libro, fuera del respaldo, y el down no la duplica", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarEscenario(tx);
      const cierre = e.sinConsolidar.cierreId;
      // La compensacion por el camino real: el MISMO escritor y la MISMA forma que usa
      // `PremioRankingDevengoService.anularPremio` (tipo `pago`, mismo importe, mismo cierre, `premio_dia`
      // del premio sembrado en el escenario).
      const repo = new PagoMensajeroMovimientoRepository(tx as never);
      const escritas = await repo.crearMovimientos(tx as never, [
        {
          mensajeroId: await mensajeroDe(tx, cierre),
          tipo: "pago",
          categoria: "ajuste_pago",
          monto: "800.00",
          origenTipo: "cierre_dia",
          origenId: cierre,
          premioDia: new Date("2026-10-30T00:00:00.000Z"),
          descripcion: "anulacion del premio (test SLT-73)",
        },
      ]);
      const compensaciones = await tx.pagoMensajeroMovimiento.findMany({
        where: { origenTipo: "cierre_dia", origenId: cierre, categoria: "ajuste_pago", premioDia: { not: null } },
        select: { id: true },
      });
      if (escritas !== 1 || compensaciones.length !== 1) {
        throw new Error(`no se sembro la compensacion del premio (escritas=${escritas}, filas=${compensaciones.length})`);
      }
      const id = compensaciones[0].id;
      const contar = async () =>
        (
          await tx.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM pago_mensajero_movimiento WHERE id = $1`,
            id,
          )
        )[0].n;
      const antes = await contar();
      await up(tx);
      const trasUp = await contar();
      const [{ enRespaldo }] = await tx.$queryRawUnsafe<{ enRespaldo: number }[]>(
        `SELECT count(*)::int AS "enRespaldo" FROM respaldo.slt73_asientos WHERE fila ->> 'id' = $1`,
        id,
      );
      const respaldadas = await respaldo(tx, [cierre]);
      await down(tx);
      const trasDown = await contar();
      return { antes, trasUp, enRespaldo, respaldadas, trasDown };
    });
    expect(r.antes).toBe(1);
    // (a) tras el up sigue en el libro…
    expect(r.trasUp).toBe(1);
    // (b) …no esta en el respaldo (que si tiene las filas del cierre, para que el (b) no sea vacuo)…
    expect(r.enRespaldo).toBe(0);
    expect(r.respaldadas).toHaveLength(CAJA.length + TIENDA.length + MENSAJERO.length);
    expect(r.respaldadas?.some((f) => f.fila.premio_dia != null)).toBe(false);
    // (c) …y tras el down hay exactamente UNA fila con su id.
    expect(r.trasDown).toBe(1);
  });

  it("R20: tras el up, conciliar la consolidacion re-escribe los asientos del cierre retirado; el down no los duplica", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarEscenario(tx);
      await up(tx);
      const retirado = await filasDeLibros(tx, e.consolidado.cierreId);
      const res = await marcarRecibido(tx, e.consolidadoBodegaId, "18500.00", e.consolidado.maestroId);
      const conciliado = await filasDeLibros(tx, e.consolidado.cierreId);
      await down(tx);
      return {
        retirado,
        res,
        conciliado,
        trasDown: await filasDeLibros(tx, e.consolidado.cierreId),
        sinConsolidarTrasDown: await filasDeLibros(tx, e.sinConsolidar.cierreId),
      };
    });
    expect(r.retirado).toEqual(VACIO);
    expect(r.res).toBe("updated");
    expect(r.conciliado).toEqual(ASENTADO);
    // El down se topa con los asientos re-escritos y los unicos por origen descartan el respaldo.
    expect(r.trasDown).toEqual(ASENTADO);
    // El que sigue sin conciliar si vuelve del respaldo.
    expect(r.sinConsolidarTrasDown).toEqual({
      caja: CAJA,
      tienda: TIENDA,
      mensajero: MENSAJERO_CON_POSTERIORES,
    });
  });
});
