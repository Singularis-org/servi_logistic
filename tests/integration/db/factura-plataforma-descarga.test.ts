import { randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import type { DatosDescargaFactura, MovimientoDeFactura } from "@/lib/types/factura-plataforma";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearOrden, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { cero } from "./_fixtures/periodo-calendario";
import { revertida } from "./_fixtures/planes";

// SLT-136 · T1.4 (design §2.2; R1, R2, R4, R6) — los datos de la descarga de una factura cerrada contra Postgres:
// la cabecera de `deLaEmpresa()`, el nombre de la empresa y TODOS los movimientos de `cobro_plataforma_traza`
// en `[desde, hasta)`, sin paginar, con la remisión de su orden (también de una orden eliminada).
//
// El molde es `factura-plataforma-detalle.test.ts`:
//   · en una transacción del dueño que se revierte (`revertida`), con la lectura como la app (`servi_app` con la
//     empresa en el contexto, `comoApp`): es la RLS la que acota la traza, la orden y la empresa;
//   · el superadmin (R2) por el cliente de la app (`conAislamientoPorEmpresa`), con la siembra commiteada bajo el
//     lock de escritura real y borrada en su `afterAll`.
//
// Las horas son las de la plataforma (−06:00): las 00:00 del día D son `cero(D)`, las 06:00 en UTC.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const MINUTO_MS = 60_000;
const mas = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();
/** La corrida de las 00:10 de la plataforma del día `fecha` (margen de cierre de 5 minutos ya pasado). */
const corrida = (fecha: string) => mas(cero(fecha), 10 * MINUTO_MS);

/** Un número de guía que no choca con el UNIQUE global de `orden.num_guia`. */
const guiaNueva = () => 1_900_000_000 + randomInt(0, 99_999_999);

/* -------------------------------------------------------------------------- */
/* Siembra (como dueño)                                                        */
/* -------------------------------------------------------------------------- */

interface OrdenSembrada {
  id: string;
  guia: number;
  remision: string;
}

/** Una empresa sin plan con su alta en `alta`: factura quincenal y sin cuota. */
async function empresa(tx: TxDeTest, alta: string): Promise<EmpresaPorcentual & { nombre: string }> {
  const e = await crearEmpresa(tx);
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "created_at" = $2::timestamp WHERE "id" = $1`, e.id, alta);
  const [{ nombre }] = await tx.$queryRawUnsafe<{ nombre: string }[]>(`SELECT "nombre" FROM "organizacion" WHERE "id" = $1`, e.id);
  return { ...e, nombre };
}

/** Una orden con su número de guía y sin movimientos: el cargo de su alta lleva el reloj real y se borra. */
async function orden(tx: TxDeTest, e: EmpresaPorcentual): Promise<OrdenSembrada> {
  const id = await crearOrden(tx, e);
  await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, id);
  const guia = guiaNueva();
  await tx.$executeRawUnsafe(`UPDATE "orden" SET "num_guia" = $2 WHERE "id" = $1`, id, guia);
  const [{ remision }] = await tx.$queryRawUnsafe<{ remision: string }[]>(
    `SELECT "num_remision" AS remision FROM "orden" WHERE "id" = $1`,
    id,
  );
  return { id, guia, remision };
}

/** Un cargo o un reverso con su instante: el trigger de SLT-85 escribe su traza con `cobrado_at` = `en`. */
async function movimiento(
  tx: TxDeTest,
  e: EmpresaPorcentual,
  m: { orden: string; secuencia: number; tipo: "cargo" | "reverso"; monto: string; en: string },
): Promise<void> {
  await fijarEmpresa(tx, e.id);
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
     VALUES ($1, $2, $3, $4, $5::"cobro_plataforma_tipo", 'plan', $6::numeric, $7::timestamp)`,
    `slt136-${randomUUID()}`,
    e.id,
    m.orden,
    m.secuencia,
    m.tipo,
    m.monto,
    m.en,
  );
}

/**
 * Elimina la orden como la app (borrado lógico, `deleted_at`). Si la base encola su propio reverso con el reloj
 * real, se quita: el caso fija a mano el reverso y su instante.
 */
async function eliminarOrden(tx: TxDeTest, o: OrdenSembrada, ultimaSecuencia: number): Promise<void> {
  await tx.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = now() AT TIME ZONE 'UTC' WHERE "id" = $1`, o.id);
  await tx.$executeRawUnsafe(
    `DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1 AND "secuencia" > $2`,
    o.id,
    ultimaSecuencia,
  );
}

function cerrar(tx: TxDeTest, organizacionId: string, ahora: string): Promise<number> {
  return new FacturaPlataformaRepository(tx).cerrar(organizacionId, new Date(ahora));
}

/** Corre `fn` como `servi_app` con la empresa en el contexto (lo que hace la extensión). Vuelve al dueño. */
async function comoEmpresa<T>(tx: TxDeTest, organizacionId: string, fn: (repo: FacturaPlataformaRepository) => Promise<T>): Promise<T> {
  await comoApp(tx, organizacionId);
  try {
    return await fn(new FacturaPlataformaRepository(tx));
  } finally {
    await tx.$executeRawUnsafe(`RESET ROLE`);
  }
}

/** Un movimiento en forma comparable. */
const fila = (m: MovimientoDeFactura) => ({
  instante: m.instante.toISOString(),
  numGuia: m.numGuia,
  numRemision: m.numRemision,
  tipo: m.tipo,
  valor: m.valor,
});

/** Σ de valores en céntimos (enteros: sin redondeos de coma flotante). */
const centimos = (valores: string[]) => valores.reduce((s, v) => s + Math.round(Number(v) * 100), 0);
const enCentimos = (v: string) => Math.round(Number(v) * 100);

describeSiHayBase("SLT-136 — los datos de la descarga de una factura cerrada (R1, R4, R6)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1, R6: la cabecera de la lista, el nombre de la empresa y cada movimiento con guía, remisión, tipo y valor, por instante; el reverso de una orden eliminada lleva su remisión", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, cero("2026-11-01"));
      const [o1, o2, o3] = [await orden(tx, e), await orden(tx, e), await orden(tx, e)];
      await movimiento(tx, e, { orden: o1.id, secuencia: 1, tipo: "cargo", monto: "100.00", en: "2026-11-03T12:00:00.000Z" });
      await movimiento(tx, e, { orden: o2.id, secuencia: 1, tipo: "cargo", monto: "250.50", en: "2026-11-05T12:00:00.000Z" });
      await movimiento(tx, e, { orden: o3.id, secuencia: 1, tipo: "cargo", monto: "7.25", en: "2026-11-07T12:00:00.000Z" });
      // R6: la orden 2 se elimina y su cargo se reversa el 9.
      await movimiento(tx, e, { orden: o2.id, secuencia: 2, tipo: "reverso", monto: "250.50", en: "2026-11-09T12:00:00.000Z" });
      await eliminarOrden(tx, o2, 2);
      await cerrar(tx, e.id, corrida("2026-11-16"));
      const lista = await comoEmpresa(tx, e.id, (repo) => repo.deLaEmpresa());
      const cerrada = lista.find((f) => f.estado === "cerrada");
      if (cerrada === undefined) throw new Error("no se cerró la factura");
      const datos = await comoEmpresa(tx, e.id, (repo) => repo.datosDescargaDeLaEmpresa(cerrada.id));
      const [{ eliminada }] = await tx.$queryRawUnsafe<{ eliminada: boolean }[]>(
        `SELECT "deleted_at" IS NOT NULL AS eliminada FROM "orden" WHERE "id" = $1`,
        o2.id,
      );
      return { e, o: { o1, o2, o3 }, cerrada, datos, eliminada };
    });
    expect(r.eliminada).toBe(true);
    const d = r.datos as DatosDescargaFactura;
    expect(d).not.toBeNull();
    // R1: la cabecera es la de la lista (la misma lectura) y el nombre, el de la empresa.
    expect(d.factura).toEqual(r.cerrada);
    expect(d.factura.numero).toBe(1);
    expect(d.empresaNombre).toBe(r.e.nombre);
    // R1, R6: todos, por instante, con la remisión de su orden; la orden eliminada conserva la suya en sus dos.
    expect(d.movimientos.map(fila)).toEqual([
      { instante: "2026-11-03T12:00:00.000Z", numGuia: r.o.o1.guia, numRemision: r.o.o1.remision, tipo: "cargo", valor: "100.00" },
      { instante: "2026-11-05T12:00:00.000Z", numGuia: r.o.o2.guia, numRemision: r.o.o2.remision, tipo: "cargo", valor: "250.50" },
      { instante: "2026-11-07T12:00:00.000Z", numGuia: r.o.o3.guia, numRemision: r.o.o3.remision, tipo: "cargo", valor: "7.25" },
      { instante: "2026-11-09T12:00:00.000Z", numGuia: r.o.o2.guia, numRemision: r.o.o2.remision, tipo: "reverso", valor: "-250.50" },
    ]);
    // Cuadra con la base: Σ = total de órdenes y número = movimientos.
    expect(centimos(d.movimientos.map((m) => m.valor))).toBe(enCentimos(d.factura.totalOrdenes));
    expect(d.movimientos).toHaveLength(d.factura.movimientos);
  });

  it("R1: sin paginar: 230 movimientos salen todos, en el orden de la base (instante y, a igual instante, id)", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, cero("2026-11-01"));
      const o = await orden(tx, e);
      // Una sola orden: cargo y reverso alternan (SL-40). Pares al mismo instante para que el id desempate.
      for (let s = 1; s <= 230; s++) {
        const tipo = s % 2 === 1 ? "cargo" : "reverso";
        await movimiento(tx, e, {
          orden: o.id,
          secuencia: s,
          tipo,
          monto: tipo === "cargo" ? "3.00" : "1.00",
          en: mas(cero("2026-11-02"), Math.ceil(s / 2) * MINUTO_MS),
        });
      }
      await cerrar(tx, e.id, corrida("2026-11-16"));
      const datos = await comoEmpresa(tx, e.id, async (repo) => {
        const [f] = (await repo.deLaEmpresa()).filter((x) => x.estado === "cerrada");
        return repo.datosDescargaDeLaEmpresa(f.id);
      });
      const d = datos as DatosDescargaFactura;
      const enLaBase = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "cobro_plataforma_traza"
          WHERE "organizacion_id" = $1 AND "cobrado_at" >= $2::timestamp AND "cobrado_at" < $3::timestamp
          ORDER BY "cobrado_at", "id"`,
        e.id,
        d.factura.desde.toISOString(),
        d.factura.hasta.toISOString(),
      );
      return { d, orden: enLaBase.map((x) => x.id), remision: o.remision };
    });
    expect(r.d.movimientos).toHaveLength(230);
    expect(r.d.movimientos.map((m) => m.id)).toEqual(r.orden);
    expect(new Set(r.d.movimientos.map((m) => m.numRemision))).toEqual(new Set([r.remision]));
    expect(r.d.factura.movimientos).toBe(230);
    expect(centimos(r.d.movimientos.map((m) => m.valor))).toBe(enCentimos(r.d.factura.totalOrdenes));
  });

  it("R1: una factura cerrada sin movimientos devuelve la lista vacía, con su cabecera y su empresa", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, cero("2026-11-01"));
      await cerrar(tx, e.id, corrida("2026-11-16"));
      const datos = await comoEmpresa(tx, e.id, async (repo) => {
        const [f] = (await repo.deLaEmpresa()).filter((x) => x.estado === "cerrada");
        return repo.datosDescargaDeLaEmpresa(f.id);
      });
      return { e, datos };
    });
    expect(r.datos?.movimientos).toEqual([]);
    expect(r.datos?.empresaNombre).toBe(r.e.nombre);
    expect(r.datos?.factura).toMatchObject({ estado: "cerrada", numero: 1, movimientos: 0 });
  });

  it("R4: la en curso, la por cerrar, la de otra empresa (cerrada) y un id que no existe → null", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx, cero("2026-11-01"));
      const b = await empresa(tx, cero("2026-11-01"));
      const ob = await orden(tx, b);
      await movimiento(tx, b, { orden: ob.id, secuencia: 1, tipo: "cargo", monto: "99.00", en: "2026-11-03T12:00:00.000Z" });
      // A: el fin de su primera factura pasó hace 2 minutos (dentro del margen de 5): queda por cerrar.
      await cerrar(tx, a.id, mas(cero("2026-11-16"), 2 * MINUTO_MS));
      await cerrar(tx, b.id, corrida("2026-11-16"));
      const deA = await comoEmpresa(tx, a.id, (repo) => repo.deLaEmpresa());
      const deB = await comoEmpresa(tx, b.id, (repo) => repo.deLaEmpresa());
      const desdeA = await comoEmpresa(tx, a.id, async (repo) => {
        const leidos: (DatosDescargaFactura | null)[] = [];
        for (const f of [...deA, ...deB]) leidos.push(await repo.datosDescargaDeLaEmpresa(f.id));
        return { leidos, inexistente: await repo.datosDescargaDeLaEmpresa(randomUUID()) };
      });
      const cerradaDeB = deB.find((f) => f.estado === "cerrada");
      const desdeB = await comoEmpresa(tx, b.id, (repo) => repo.datosDescargaDeLaEmpresa(cerradaDeB?.id ?? ""));
      return { deA, deB, desdeA, desdeB };
    });
    expect(r.deA.map((f) => f.estado)).toEqual(["por_cerrar", "en_curso"]);
    expect(r.deB.map((f) => f.estado)).toEqual(["cerrada", "en_curso"]);
    expect(r.desdeA.leidos).toEqual([null, null, null, null]);
    expect(r.desdeA.inexistente).toBeNull();
    // Control: la cerrada de B sí la descarga su empresa, con su movimiento.
    expect(r.desdeB?.movimientos.map((m) => m.valor)).toEqual(["99.00"]);
  });
});

/* -------------------------------------------------------------------------- */
/* R2, R4: el superadmin por el cliente de la app                              */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-136 — el superadmin descarga lo mismo que el maestro (R2, R4)", () => {
  let dueno: PrismaClient;
  /** El cliente de la app sin sesión: la empresa solo sale de `conEmpresa` (el superadmin no tiene). */
  let superadmin: FacturaPlataformaRepository;
  /** El cliente de la app con la sesión del maestro de A: la empresa sale del resolutor, como en «Mi plan». */
  let maestroA: FacturaPlataformaRepository;
  const empresas: string[] = [];
  let a: string;
  let b: string;

  beforeAll(async () => {
    dueno = crearPrismaDeTest();
    superadmin = new FacturaPlataformaRepository(conAislamientoPorEmpresa(dueno, async () => null));
    await bajoLockDeEscrituraReal(() =>
      dueno.$transaction(
        async (tx) => {
          for (const lado of ["a", "b"] as const) {
            const e = await empresa(tx, cero("2026-11-01"));
            empresas.push(e.id);
            if (lado === "a") a = e.id;
            else b = e.id;
            const [o1, o2] = [await orden(tx, e), await orden(tx, e)];
            await movimiento(tx, e, { orden: o1.id, secuencia: 1, tipo: "cargo", monto: "100.00", en: "2026-11-03T12:00:00.000Z" });
            await movimiento(tx, e, { orden: o2.id, secuencia: 1, tipo: "cargo", monto: "250.50", en: "2026-11-05T12:00:00.000Z" });
            await movimiento(tx, e, { orden: o1.id, secuencia: 2, tipo: "reverso", monto: "100.00", en: "2026-11-06T12:00:00.000Z" });
            // R6 por el cliente de la app: la orden 1 eliminada.
            await eliminarOrden(tx, o1, 2);
            await cerrar(tx, e.id, corrida("2026-11-16"));
          }
          await fijarEmpresa(tx, "");
        },
        { timeout: 60_000, maxWait: 15_000 },
      ),
    );
    maestroA = new FacturaPlataformaRepository(conAislamientoPorEmpresa(dueno, async () => a));
  }, 120_000);

  afterAll(async () => {
    if (dueno === undefined) return;
    try {
      if (empresas.length > 0) {
        // En el orden que piden las FK. Movimientos y traza se van con su orden; las facturas, con la empresa.
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "zona", "usuario", "organizacion"]) {
            const columna = tabla === "organizacion" ? "id" : "organizacion_id";
            await dueno.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "${columna}" = ANY($1::text[])`, empresas);
          }
        });
      }
    } finally {
      await dueno.$disconnect();
    }
  }, 120_000);

  it("R2: el superadmin descarga de A lo mismo que su maestro, también desde un contexto de plataforma, con la remisión de la orden eliminada", async () => {
    const [cerrada] = (await maestroA.deLaEmpresa()).filter((f) => f.estado === "cerrada");
    const delMaestro = await maestroA.datosDescargaDeLaEmpresa(cerrada.id);
    const delSuper = await superadmin.datosDescargaParaPlataforma(a, cerrada.id);
    const enPlataforma = await comoPlataforma("SL-24", "SLT-136 test: el superadmin descarga una factura de A", () =>
      superadmin.datosDescargaParaPlataforma(a, cerrada.id),
    );
    expect(delMaestro).not.toBeNull();
    expect(delSuper).toEqual(delMaestro);
    expect(enPlataforma).toEqual(delMaestro);
    expect(delSuper?.movimientos.map((m) => [m.tipo, m.valor])).toEqual([
      ["cargo", "100.00"],
      ["cargo", "250.50"],
      ["reverso", "-100.00"],
    ]);
    // R6: el cargo y el reverso de la orden eliminada llevan la misma remisión, no vacía.
    const [c1, , r1] = delSuper?.movimientos ?? [];
    expect(c1?.numRemision).toMatch(/\S/);
    expect(r1?.numRemision).toBe(c1?.numRemision);
  });

  it("R2, R4: el superadmin que nombra B no descarga una factura de A: null; con A, sí", async () => {
    const deA = await maestroA.deLaEmpresa();
    for (const f of deA) expect(await superadmin.datosDescargaParaPlataforma(b, f.id)).toBeNull();
    // La en curso de A tampoco, ni con A (R4).
    const enCurso = deA.find((f) => f.estado === "en_curso");
    expect(enCurso).toBeDefined();
    expect(await superadmin.datosDescargaParaPlataforma(a, enCurso?.id ?? "")).toBeNull();
    const cerrada = deA.find((f) => f.estado === "cerrada");
    expect((await superadmin.datosDescargaParaPlataforma(a, cerrada?.id ?? ""))?.factura.id).toBe(cerrada?.id);
  });
});
