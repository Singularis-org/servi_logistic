import { randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import type { DetalleDeFactura, FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";
import { LINEAS_POR_PAGINA } from "@/lib/types/factura-plataforma";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearOrden, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { cero } from "./_fixtures/periodo-calendario";
import { revertida } from "./_fixtures/planes";

// SLT-119 · T1.3 (design §2, §8; R7, R8, R10, R11, R12, R14) — el detalle de una factura de la plataforma
// contra Postgres: la cabecera de `deLaEmpresa()` y una página de sus líneas de `cobro_plataforma_traza`.
//
// Dos bloques, con el molde de `factura-plataforma-cierre.test.ts` y `factura-plataforma-aislamiento.test.ts`:
//   · en una transacción del dueño que se revierte (`revertida`): empresas con su alta fijada, órdenes sin el
//     cargo de su alta (lleva el reloj real) y movimientos escritos a mano con su `ocurrido_at` (el trigger de
//     SLT-85 escribe la traza con `cobrado_at` = ese instante); los cierres, por `factura_plataforma_cerrar` con
//     `p_ahora`. La lectura va como la app: `servi_app` con la empresa en el contexto (`comoApp`), así que es la
//     RLS la que acota la traza. El repositorio recibe el `tx`: su `$transaction` de página y total es una
//     transacción anidada (un SAVEPOINT) dentro de la del caso;
//   · el superadmin (R12, R14) por el cliente de la app (`conAislamientoPorEmpresa`), que abre sus propias
//     transacciones en otra conexión: no vería lo de una revertida. Ese bloque commitea su siembra bajo el lock
//     de escritura real y la borra en su `afterAll`. Ahí corre además la transacción `repeatable read` del
//     repositorio de verdad.
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

/** Una empresa sin plan con su alta en `alta`: factura quincenal y sin cuota. */
async function empresa(tx: TxDeTest, alta: string): Promise<EmpresaPorcentual> {
  const e = await crearEmpresa(tx);
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "created_at" = $2::timestamp WHERE "id" = $1`, e.id, alta);
  return e;
}

/**
 * Una orden de la empresa con su número de guía (o sin él) y sin movimientos: el cargo de su alta lleva el
 * reloj real y se borra (su traza se va con él).
 */
async function orden(tx: TxDeTest, e: EmpresaPorcentual, conGuia = true): Promise<{ id: string; guia: number | null }> {
  const id = await crearOrden(tx, e);
  await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, id);
  const guia = conGuia ? guiaNueva() : null;
  await tx.$executeRawUnsafe(`UPDATE "orden" SET "num_guia" = $2 WHERE "id" = $1`, id, guia);
  return { id, guia };
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
    `slt119-${randomUUID()}`,
    e.id,
    m.orden,
    m.secuencia,
    m.tipo,
    m.monto,
    m.en,
  );
}

function cerrar(tx: TxDeTest, organizacionId: string, ahora: string): Promise<number> {
  return new FacturaPlataformaRepository(tx).cerrar(organizacionId, new Date(ahora));
}

/** Las trazas de la empresa en `[desde, hasta)`, como dueño, en el orden que pide R7 (el de la base). */
async function trazaComoDueno(tx: TxDeTest, organizacionId: string, desde: Date, hasta: Date): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "cobro_plataforma_traza"
      WHERE "organizacion_id" = $1 AND "cobrado_at" >= $2::timestamp AND "cobrado_at" < $3::timestamp
      ORDER BY "cobrado_at", "id"`,
    organizacionId,
    desde.toISOString(),
    hasta.toISOString(),
  );
  return filas.map((f) => f.id);
}

/* -------------------------------------------------------------------------- */
/* Lectura como la app                                                         */
/* -------------------------------------------------------------------------- */

/** Corre `fn` como `servi_app` con la empresa en el contexto (lo que hace la extensión). Vuelve al dueño. */
async function comoEmpresa<T>(tx: TxDeTest, organizacionId: string, fn: (repo: FacturaPlataformaRepository) => Promise<T>): Promise<T> {
  await comoApp(tx, organizacionId);
  try {
    return await fn(new FacturaPlataformaRepository(tx));
  } finally {
    await tx.$executeRawUnsafe(`RESET ROLE`);
  }
}

/** Una línea en forma comparable. */
const linea = (l: DetalleDeFactura["lineas"]["lineas"][number]) => ({
  instante: l.instante.toISOString(),
  numGuia: l.numGuia,
  tipo: l.tipo,
  valor: l.valor,
});

/** Σ de valores en céntimos (enteros: sin redondeos de coma flotante). */
const centimos = (valores: string[]) => valores.reduce((s, v) => s + Math.round(Number(v) * 100), 0);
const enCentimos = (v: string) => Math.round(Number(v) * 100);

describeSiHayBase("SLT-119 — el detalle de una factura de la plataforma (R7, R8, R10, R11, R14)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R7, R8: líneas por instante (y por id al mismo instante) con guía, tipo y valor con signo; Σ = total de órdenes y número = movimientos; el reverso del 17 solo en la segunda", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, cero("2026-11-01"));
      const [o1, o2, o3, o4, o5, o6] = [
        await orden(tx, e),
        await orden(tx, e),
        await orden(tx, e),
        await orden(tx, e),
        await orden(tx, e),
        await orden(tx, e, false),
      ];
      await movimiento(tx, e, { orden: o1.id, secuencia: 1, tipo: "cargo", monto: "100.00", en: "2026-11-14T15:00:00.000Z" });
      await movimiento(tx, e, { orden: o2.id, secuencia: 1, tipo: "cargo", monto: "250.00", en: "2026-11-03T12:00:00.000Z" });
      // Dos al mismo instante: el orden lo cierra el id (R7).
      await movimiento(tx, e, { orden: o5.id, secuencia: 1, tipo: "cargo", monto: "5.25", en: "2026-11-05T10:00:00.000Z" });
      await movimiento(tx, e, { orden: o6.id, secuencia: 1, tipo: "cargo", monto: "7.10", en: "2026-11-05T10:00:00.000Z" });
      // El último milisegundo del 15 (hora de la plataforma) y el primero del 16.
      await movimiento(tx, e, { orden: o3.id, secuencia: 1, tipo: "cargo", monto: "10.00", en: "2026-11-16T05:59:59.999Z" });
      await movimiento(tx, e, { orden: o4.id, secuencia: 1, tipo: "cargo", monto: "20.00", en: cero("2026-11-16") });
      await cerrar(tx, e.id, corrida("2026-11-16"));
      // SLT-118 R6: el reverso del cargo del 14 llega el 17.
      await movimiento(tx, e, { orden: o1.id, secuencia: 2, tipo: "reverso", monto: "100.00", en: "2026-11-17T15:00:00.000Z" });
      await cerrar(tx, e.id, corrida("2026-12-01"));
      const lista = await comoEmpresa(tx, e.id, (repo) => repo.deLaEmpresa());
      const cerradas = lista.filter((f) => f.estado === "cerrada");
      // Una tras otra: dentro de la transacción del caso, cada detalle abre la suya anidada (un SAVEPOINT) y
      // Prisma no admite dos a la vez.
      const detalles = await comoEmpresa(tx, e.id, async (repo) => {
        const leidos: (DetalleDeFactura | null)[] = [];
        for (const f of cerradas) leidos.push(await repo.detalleDeLaEmpresa(f.id, 1));
        return leidos;
      });
      const empate = await trazaComoDueno(tx, e.id, new Date("2026-11-05T10:00:00.000Z"), new Date("2026-11-05T10:00:00.001Z"));
      return { o: { o1, o2, o3, o4, o5, o6 }, cerradas, detalles, empate };
    });
    const [d1, d2] = r.detalles as [DetalleDeFactura, DetalleDeFactura];
    expect(r.cerradas.map((f) => f.numero)).toEqual([1, 2]);
    // La cabecera es la de la lista (la misma lectura).
    expect(d1.factura).toEqual(r.cerradas[0]);
    expect(d2.factura).toEqual(r.cerradas[1]);

    // R7: del 3 al 15, por instante; al mismo instante, por id.
    const empatados = [r.o.o5, r.o.o6];
    const idDe = new Map(d1.lineas.lineas.map((l) => [l.id, l]));
    const ordenDelEmpate = r.empate.map((id) => idDe.get(id)?.numGuia);
    expect(ordenDelEmpate).toHaveLength(2);
    expect(new Set(ordenDelEmpate)).toEqual(new Set(empatados.map((o) => o.guia)));
    expect(d1.lineas.lineas.map((l) => l.id).slice(1, 3)).toEqual(r.empate);
    const delEmpate = r.empate.map((id) => linea(idDe.get(id) as DetalleDeFactura["lineas"]["lineas"][number]));
    expect(d1.lineas.lineas.map(linea)).toEqual([
      { instante: "2026-11-03T12:00:00.000Z", numGuia: r.o.o2.guia, tipo: "cargo", valor: "250.00" },
      ...delEmpate,
      { instante: "2026-11-14T15:00:00.000Z", numGuia: r.o.o1.guia, tipo: "cargo", valor: "100.00" },
      { instante: "2026-11-16T05:59:59.999Z", numGuia: r.o.o3.guia, tipo: "cargo", valor: "10.00" },
    ]);
    // La línea sin guía sale con `null`, no se oculta (la pinta R9).
    expect(delEmpate.map((l) => l.numGuia)).toContain(null);
    expect(delEmpate.map((l) => l.valor).sort()).toEqual(["5.25", "7.10"]);

    // R7, R8: el reverso en negativo, y solo en la factura de su instante; su cargo solo en la anterior.
    expect(d2.lineas.lineas.map(linea)).toEqual([
      { instante: cero("2026-11-16"), numGuia: r.o.o4.guia, tipo: "cargo", valor: "20.00" },
      { instante: "2026-11-17T15:00:00.000Z", numGuia: r.o.o1.guia, tipo: "reverso", valor: "-100.00" },
    ]);
    expect(d1.lineas.lineas.filter((l) => l.numGuia === r.o.o1.guia).map((l) => l.tipo)).toEqual(["cargo"]);

    // R8: Σ de las líneas = total de órdenes y número de líneas = movimientos, en las dos.
    for (const d of [d1, d2]) {
      expect(centimos(d.lineas.lineas.map((l) => l.valor))).toBe(enCentimos(d.factura.totalOrdenes));
      expect(d.lineas.lineas).toHaveLength(d.factura.movimientos);
      expect(d.lineas.total).toBe(d.factura.movimientos);
      expect(d.lineas).toMatchObject({ pagina: 1, porPagina: LINEAS_POR_PAGINA });
    }
    expect([d1.factura.totalOrdenes, d1.factura.movimientos]).toEqual(["372.35", 5]);
    expect([d2.factura.totalOrdenes, d2.factura.movimientos]).toEqual(["-80.00", 2]);
  });

  it("R10: 230 líneas en páginas de 100, 100 y 30, sin repetir ni saltar; la 4, vacía y sin error; el resumen es el de la factura entera", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, cero("2026-11-01"));
      const o = await orden(tx, e);
      // Una sola orden: los movimientos alternan cargo y reverso (SL-40). 115 cargos de 3.00 y 115 reversos de
      // 1.00, uno por minuto desde el 2 de noviembre.
      for (let s = 1; s <= 230; s++) {
        const tipo = s % 2 === 1 ? "cargo" : "reverso";
        await movimiento(tx, e, {
          orden: o.id,
          secuencia: s,
          tipo,
          monto: tipo === "cargo" ? "3.00" : "1.00",
          en: mas(cero("2026-11-02"), s * MINUTO_MS),
        });
      }
      await cerrar(tx, e.id, corrida("2026-11-16"));
      const paginas = await comoEmpresa(tx, e.id, async (repo) => {
        const [f] = (await repo.deLaEmpresa()).filter((x) => x.estado === "cerrada");
        const leidas: DetalleDeFactura[] = [];
        for (const p of [1, 2, 3, 4, 50]) leidas.push((await repo.detalleDeLaEmpresa(f.id, p)) as DetalleDeFactura);
        return leidas;
      });
      const [f] = paginas.map((p) => p.factura);
      return { paginas, todas: await trazaComoDueno(tx, e.id, f.desde, f.hasta) };
    });
    expect(r.paginas.map((p) => p.lineas.lineas.length)).toEqual([100, 100, 30, 0, 0]);
    expect(r.paginas.map((p) => [p.lineas.pagina, p.lineas.porPagina, p.lineas.total])).toEqual([
      [1, 100, 230],
      [2, 100, 230],
      [3, 100, 230],
      [4, 100, 230],
      [50, 100, 230],
    ]);
    // Seguidas, son todas las de la factura en el orden de R7: ni repetidas ni saltadas.
    expect(r.paginas.flatMap((p) => p.lineas.lineas.map((l) => l.id))).toEqual(r.todas);
    expect(r.todas).toHaveLength(230);
    // El resumen es el de la factura entera en todas las páginas, también en la vacía.
    for (const p of r.paginas) {
      expect(p.factura).toEqual(r.paginas[0].factura);
      expect([p.factura.cargos, p.factura.reversos, p.factura.movimientos, p.factura.totalOrdenes]).toEqual([
        "345.00",
        "115.00",
        230,
        "230.00",
      ]);
    }
  });

  it("R11: la en curso lista las líneas desde su `desde` hasta la lectura, y su total de órdenes es el parcial de ese momento", async () => {
    // El día de hoy en la plataforma: la en curso de una empresa dada de alta hoy contiene el momento de la lectura.
    const hoy = new Date(Date.now() - 6 * 60 * MINUTO_MS).toISOString().slice(0, 10);
    const alta = cero(hoy);
    const r = await revertida(base, async (tx) => {
      const e = await empresa(tx, alta);
      const [o1, o2] = [await orden(tx, e), await orden(tx, e)];
      // Antes del alta: fuera de cualquier factura de la empresa.
      await movimiento(tx, e, { orden: o2.id, secuencia: 1, tipo: "cargo", monto: "40.00", en: mas(alta, -1) });
      await movimiento(tx, e, { orden: o2.id, secuencia: 2, tipo: "reverso", monto: "40.00", en: mas(alta, -1) });
      await movimiento(tx, e, { orden: o1.id, secuencia: 1, tipo: "cargo", monto: "12.34", en: alta });
      await movimiento(tx, e, { orden: o2.id, secuencia: 3, tipo: "cargo", monto: "20.00", en: mas(alta, 1) });
      await movimiento(tx, e, { orden: o1.id, secuencia: 2, tipo: "reverso", monto: "12.34", en: mas(alta, 2) });
      // Abre la primera factura de la empresa (SLT-118 R26), en curso, con el reloj de ahora.
      await cerrar(tx, e.id, new Date().toISOString());
      return comoEmpresa(tx, e.id, async (repo) => {
        const lista = await repo.deLaEmpresa();
        const enCurso = lista.find((f) => f.estado === "en_curso") as FacturaPlataformaDTO;
        return { o: { o1, o2 }, lista, detalle: (await repo.detalleDeLaEmpresa(enCurso.id, 1)) as DetalleDeFactura };
      });
    });
    expect(r.lista.map((f) => f.estado)).toEqual(["en_curso"]);
    const d = r.detalle;
    expect(d.factura).toMatchObject({ estado: "en_curso", numero: null, desde: new Date(alta), hastaPrevisto: true });
    expect(d.lineas.lineas.map(linea)).toEqual([
      { instante: alta, numGuia: r.o.o1.guia, tipo: "cargo", valor: "12.34" },
      { instante: mas(alta, 1), numGuia: r.o.o2.guia, tipo: "cargo", valor: "20.00" },
      { instante: mas(alta, 2), numGuia: r.o.o1.guia, tipo: "reverso", valor: "-12.34" },
    ]);
    // El parcial de `factura_plataforma_en_curso` y las líneas cuentan lo mismo.
    expect([d.factura.cargos, d.factura.reversos, d.factura.movimientos, d.factura.totalOrdenes]).toEqual([
      "32.34",
      "12.34",
      3,
      "20.00",
    ]);
    expect(centimos(d.lineas.lineas.map((l) => l.valor))).toBe(enCentimos(d.factura.totalOrdenes));
    expect(d.lineas.total).toBe(d.factura.movimientos);
  });

  it("R14: el maestro de A no ve el detalle de una factura de B (cerrada ni en curso) ni de un id que no existe: null, sin líneas", async () => {
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx, cero("2026-11-01"));
      const b = await empresa(tx, cero("2026-11-01"));
      const ob = await orden(tx, b);
      await movimiento(tx, b, { orden: ob.id, secuencia: 1, tipo: "cargo", monto: "99.00", en: "2026-11-03T12:00:00.000Z" });
      await cerrar(tx, a.id, corrida("2026-11-16"));
      await cerrar(tx, b.id, corrida("2026-11-16"));
      const deB = await comoEmpresa(tx, b.id, (repo) => repo.deLaEmpresa());
      const desdeA = await comoEmpresa(tx, a.id, async (repo) => {
        const ajenas: (DetalleDeFactura | null)[] = [];
        for (const f of deB) ajenas.push(await repo.detalleDeLaEmpresa(f.id, 1));
        return { ajenas, inexistente: await repo.detalleDeLaEmpresa(randomUUID(), 1) };
      });
      const desdeB = await comoEmpresa(tx, b.id, (repo) => repo.detalleDeLaEmpresa(deB[0].id, 1));
      return { deB, desdeA, desdeB };
    });
    expect(r.deB.map((f) => f.estado)).toEqual(["cerrada", "en_curso"]);
    expect(r.desdeA.ajenas).toEqual([null, null]);
    expect(r.desdeA.inexistente).toBeNull();
    // Control: la misma factura sí la ve su empresa, con su línea.
    expect(r.desdeB?.lineas.lineas.map((l) => l.valor)).toEqual(["99.00"]);
  });
});

/* -------------------------------------------------------------------------- */
/* R12, R14: el superadmin por el cliente de la app                            */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-119 — el superadmin lee el mismo detalle que el maestro (R12, R14)", () => {
  let dueno: PrismaClient;
  /** El cliente de la app sin sesión: la empresa solo sale de `conEmpresa` (el superadmin no tiene). */
  let superadmin: FacturaPlataformaRepository;
  /** El cliente de la app con la sesión del maestro de A: la empresa sale del resolutor, como en «Mi plan». */
  let maestroA: FacturaPlataformaRepository;
  let maestroB: FacturaPlataformaRepository;
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
            await movimiento(tx, e, { orden: o1.id, secuencia: 2, tipo: "reverso", monto: "100.00", en: "2026-11-20T12:00:00.000Z" });
            await cerrar(tx, e.id, corrida("2026-12-01"));
          }
          await fijarEmpresa(tx, "");
        },
        { timeout: 60_000, maxWait: 15_000 },
      ),
    );
    maestroA = new FacturaPlataformaRepository(conAislamientoPorEmpresa(dueno, async () => a));
    maestroB = new FacturaPlataformaRepository(conAislamientoPorEmpresa(dueno, async () => b));
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

  it("R12: el superadmin ve las mismas facturas y, de cada una, la misma cabecera y las mismas líneas que el maestro; también desde un contexto de plataforma", async () => {
    const delMaestro = await maestroA.deLaEmpresa();
    const delSuper = await superadmin.deEmpresaParaPlataforma(a);
    expect(delSuper).toEqual(delMaestro);
    expect(delMaestro.map((f) => [f.estado, f.numero])).toEqual([
      ["cerrada", 1],
      ["cerrada", 2],
      ["en_curso", null],
    ]);
    for (const f of delMaestro) {
      const m = await maestroA.detalleDeLaEmpresa(f.id, 1);
      const s = await superadmin.detalleParaPlataforma(a, f.id, 1);
      const enPlataforma = await comoPlataforma("SL-24", "SLT-119 test: el superadmin lee el detalle de una factura de A", () =>
        superadmin.detalleParaPlataforma(a, f.id, 1),
      );
      expect(s).toEqual(m);
      expect(enPlataforma).toEqual(m);
    }
    // No vacuidad: las dos cerradas traen sus líneas (cargos el 3 y el 5; el reverso el 20).
    const [l1, l2] = await Promise.all(delMaestro.slice(0, 2).map((f) => superadmin.detalleParaPlataforma(a, f.id, 1)));
    expect(l1?.lineas.lineas.map((l) => [l.tipo, l.valor])).toEqual([
      ["cargo", "100.00"],
      ["cargo", "250.50"],
    ]);
    expect(l2?.lineas.lineas.map((l) => [l.tipo, l.valor])).toEqual([["reverso", "-100.00"]]);
    expect(l2?.lineas.total).toBe(1);
  });

  it("R14: el superadmin que nombra B no ve una factura de A, y el maestro de B tampoco: null", async () => {
    const deA = await maestroA.deLaEmpresa();
    for (const f of deA) {
      expect(await superadmin.detalleParaPlataforma(b, f.id, 1)).toBeNull();
      expect(await maestroB.detalleDeLaEmpresa(f.id, 1)).toBeNull();
    }
    // Control: con la empresa que sí es, la ve.
    expect((await superadmin.detalleParaPlataforma(a, deA[0].id, 1))?.factura.id).toBe(deA[0].id);
  });
});
