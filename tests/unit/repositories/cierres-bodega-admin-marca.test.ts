import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import type { AsientosCierreDiaDeps } from "@/lib/repositories/_shared/asientos-cierre-dia";
import type { CrearMovimientoInput } from "@/lib/interfaces/repositories/IWalletMovimientoRepository";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 / T7 — `marcarConciliado` y `revertirConciliacion`: LA FORMA DE LA ESCRITURA.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUE MIDE ESTE ARCHIVO Y QUE NO. Aqui se afirma el `WHERE` EXACTO de las dos guardas, el `data`
// que se escribe y los TRES desenlaces. Lo que NO se puede medir con un doble —que la base acepte
// la escritura, que el `CHECK` muerda, que la fila del historial quede— vive en
// `tests/integration/db/marca-conciliacion.int.test.ts`, contra Postgres.
//
// ⚠️ Y HAY UNA TERCERA COSA QUE NO CAZA NI ESTE ARCHIVO NI AQUEL: `appendAccion(this.prisma, …)` en
// vez de `appendAccion(tx, …)`. Con dobles, `this.prisma` y `tx` son el mismo objeto de mentira; en
// integracion, `this.prisma` ES la transaccion del test. Lo unico que lo caza es la guardia
// estatica del censo. Esta escrito aqui para que nadie crea que este archivo lo cubre.
//
// EL DOBLE ES HONESTO EN UN PUNTO CONCRETO: `$transaction` ejecuta el callback con un `tx` cuyo
// `updateMany` devuelve el `count` que el caso decide. Asi, «`count !== 1` -> conflict» se mide de
// verdad y no por lo que el doble tenga ganas de devolver.

/**
 * Las formas de los argumentos que el doble recibe. Se declaran para que `mock.calls[0][0]` tenga
 * tipo: sin esto, TypeScript ve una tupla VACIA y las aserciones de este archivo no compilarian —
 * que es, de paso, la razon por la que compilan de verdad y no por un `any` que las tape.
 */
interface DataMarca {
  estado?: string;
  conciliadoAt?: Date | null;
  conciliadoPor?: string | null;
  montoRecibido?: Prisma.Decimal | null;
  conciliadoNota?: string | null;
  resueltoAt?: Date | null;
  resueltoPor?: string | null;
}

interface ArgsUpdateMany {
  where: Record<string, unknown>;
  data: DataMarca;
}

interface FilaHistorial {
  accion: string;
  entidadTipo: string;
  entidadId: string;
  entidadEtiqueta: string;
  monto: Prisma.Decimal | null;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  actorUsuarioId: string | null;
}

interface OpcionesDoble {
  /** Filas afectadas por el `updateMany` guardado. 1 = la guarda paso. */
  count?: number;
  /** `count` de `cierre_bodega` por id, para distinguir `conflict` de `fuera_de_alcance`. */
  existe?: number;
  /** La fila que se relee (o se preleer, al revertir). */
  fila?: Record<string, unknown> | null;
  /** SLT-73: los cierres del dia de la consolidacion que devuelve `cierreDia.findMany`. */
  cierresDia?: { id: string }[];
  /** SLT-73: filas de caja con origen `cierre_dia` que cuenta `revertirConciliacion`. */
  asentados?: number;
  /** SLT-73: Σ `diferencia` de los ajustes previos (null = no hay). */
  yaAsentado?: string | null;
}

function buildPrisma(opciones: OpcionesDoble = {}) {
  const updateMany = vi.fn(async (_args: ArgsUpdateMany) => ({ count: opciones.count ?? 1 }));
  const findUnique = vi.fn(async () =>
    opciones.fila === undefined
      ? {
          totalGeneral: new Prisma.Decimal("600.00"),
          montoRecibido: new Prisma.Decimal("485.00"),
          solicitadoAt: new Date("2026-09-10T12:00:00.000Z"),
          zona: { nombre: "Cartago" },
        }
      : opciones.fila,
  );
  const count = vi.fn(async () => opciones.existe ?? 1);
  const createMany = vi.fn(async (_args: { data: FilaHistorial[] }) => ({ count: 1 }));
  const usuarioFindUnique = vi.fn(async () => ({
    nombre: "Ana",
    primerApellido: "Solis",
    rol: { value: "maestro" },
  }));

  // SLT-73: el snapshot de la consolidacion del que sale el esperado (`paraLaCentral`):
  // 600,00 − 40,00 − 10,00 = 550,00.
  const findUniqueOrThrow = vi.fn(async () => ({
    totalGeneral: new Prisma.Decimal("600.00"),
    totalPagoMensajero: new Prisma.Decimal("40.00"),
    totalIngresoBodegaRechazos: new Prisma.Decimal("10.00"),
  }));
  const cierreDiaFindMany = vi.fn<(args: unknown) => Promise<{ id: string }[]>>(async () => opciones.cierresDia ?? []);
  const walletCount = vi.fn<(args: unknown) => Promise<number>>(async () => opciones.asentados ?? 0);
  const ajusteAggregate = vi.fn(async () => ({
    _sum: {
      diferencia:
        opciones.yaAsentado === undefined || opciones.yaAsentado === null
          ? null
          : new Prisma.Decimal(opciones.yaAsentado),
    },
  }));
  const ajusteCreate = vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(
    async () => ({ id: "aj-1" }),
  );

  const tx = {
    cierreBodega: { updateMany, findUnique, findUniqueOrThrow, count },
    cierreDia: { findMany: cierreDiaFindMany },
    walletMovimiento: { count: walletCount },
    conciliacionBodegaAjuste: { aggregate: ajusteAggregate, create: ajusteCreate },
    historialAccion: { createMany },
    usuario: { findUnique: usuarioFindUnique },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return {
    prisma,
    tx,
    updateMany,
    findUnique,
    count,
    createMany,
    cierreDiaFindMany,
    walletCount,
    ajusteCreate,
  };
}

/**
 * SLT-73: los asientos de mentira. Los feeds devuelven listas vacias (el contenido de los asientos
 * se mide en integracion, `slt73-marcar-asienta.int.test.ts`); aqui se cuenta QUE se pidieron y la
 * fila de diferencia que llega al repo de la caja.
 */
function asientosDoble() {
  const caja = vi.fn<(tx: unknown, movs: CrearMovimientoInput[]) => Promise<number>>(async () => 0);
  const ingreso = vi.fn<(cierreId: string, tx?: unknown) => Promise<never[]>>(async () => []);
  const deps = {
    walletMovimientoRepo: { crearMovimientos: caja },
    walletFeedService: { construirMovimientosDeIngreso: ingreso },
    walletTiendaMovimientoRepo: { crearMovimientos: vi.fn(async () => 0) },
    walletTiendaFeedService: { construirMovimientosPorTienda: vi.fn(async () => []) },
    pagoMensajeroMovimientoRepo: { crearMovimientos: vi.fn(async () => 0) },
    walletMensajeroFeedService: {
      construirMovimientosDePago: vi.fn(async () => ({ libro: [], egresoCaja: [] })),
    },
    walletIndemnizacionFeedService: { construirEgresoIndemnizacion: vi.fn(async () => []) },
    cajaCodFeed: { construirIngresoCod: vi.fn(async () => []) },
  } as unknown as AsientosCierreDiaDeps;
  return { deps, caja, ingreso };
}

function repoCon(prisma: unknown, asientos: AsientosCierreDiaDeps = asientosDoble().deps) {
  return new CierresBodegaAdminRepository(prisma as unknown as PrismaClient, asientos);
}

describe("431/T7 — CierresBodegaAdminRepository.marcarConciliado", () => {
  it("⭑ R11: la guarda del `WHERE` son LOS DOS predicados, no uno", async () => {
    // `estado: 'solicitado'` Y `conciliadoAt: null`. El estado es lo que las pantallas leen;
    // `conciliado_at` es EL predicado de la marca. Con uno solo, una fila incoherente —que el
    // `CHECK` impide, pero el `WHERE` no deberia necesitar— se dejaria marcar dos veces.
    const { prisma, updateMany } = buildPrisma();
    await repoCon(prisma).marcarConciliado({
      id: "cb1",
      montoRecibido: "485.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });

    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "cb1",
      estado: "solicitado",
      conciliadoAt: null,
    });
  });

  it("⭑ R8/R9: escribe los cuatro datos, el estado y el ESPEJO, con el monto como Decimal", async () => {
    const { prisma, updateMany } = buildPrisma();
    await repoCon(prisma).marcarConciliado({
      id: "cb1",
      montoRecibido: "485.00",
      nota: "faltaron 15",
      actorUsuarioId: "u-maestro",
    });

    const data = updateMany.mock.calls[0][0].data;
    expect(data.estado).toBe("aprobado"); // D2: se LEE «Recibido»
    expect(data.conciliadoPor).toBe("u-maestro");
    expect(data.conciliadoNota).toBe("faltaron 15");
    // Money-safe: el importe entra como STRING y se convierte AQUI, en el borde de la escritura.
    expect(data.montoRecibido).toBeInstanceOf(Prisma.Decimal);
    expect(data.montoRecibido?.toFixed(2)).toBe("485.00");
    // El espejo, sin el cual los cierres de bodega desaparecen de la analitica financiera.
    expect(data.resueltoPor).toBe("u-maestro");
    expect(data.resueltoAt).toBeInstanceOf(Date);
    // Y el MISMO instante en las dos marcas de tiempo: son el mismo acto.
    expect(data.resueltoAt?.getTime()).toBe(data.conciliadoAt?.getTime());
  });

  it("⭑ R13: registra `cierre_bodega_conciliado` con el monto RECIBIDO y sin la nota", async () => {
    const { prisma, createMany } = buildPrisma();
    await repoCon(prisma).marcarConciliado({
      id: "cb1",
      montoRecibido: "485.00",
      nota: "una nota que NO viaja",
      actorUsuarioId: "u-maestro",
    });

    const fila = createMany.mock.calls[0][0].data[0];
    expect(fila.accion).toBe("cierre_bodega_conciliado");
    expect(fila.entidadTipo).toBe("cierre_bodega");
    expect(fila.entidadId).toBe("cb1");
    // El monto RECIBIDO (485), NO el consolidado (600): es lo que la persona afirma haber contado.
    expect(fila.monto?.toFixed(2)).toBe("485.00");
    expect(fila.entidadEtiqueta).toContain("Cartago");
    // R5 de la 362: el texto libre no entra en el historial.
    expect(JSON.stringify(fila)).not.toContain("una nota que NO viaja");
  });

  it("R11: `count !== 1` con la fila existente -> `conflict`, y NO registra nada", async () => {
    const { prisma, createMany } = buildPrisma({ count: 0, existe: 1 });
    const r = await repoCon(prisma).marcarConciliado({
      id: "cb1",
      montoRecibido: "1.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });

    expect(r).toBe("conflict");
    // Una accion que no ocurrio no deja rastro de que ocurrio.
    expect(createMany).not.toHaveBeenCalled();
  });

  it("`count !== 1` y la fila NO existe -> `fuera_de_alcance`", async () => {
    const { prisma } = buildPrisma({ count: 0, existe: 0 });
    const r = await repoCon(prisma).marcarConciliado({
      id: "no-existe",
      montoRecibido: "1.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });

    expect(r).toBe("fuera_de_alcance");
  });
});

describe("431/T7 — CierresBodegaAdminRepository.revertirConciliacion", () => {
  it("⭑ R12: la guarda del `WHERE` exige que de verdad estuviera marcada", async () => {
    const { prisma, updateMany } = buildPrisma();
    await repoCon(prisma).revertirConciliacion({ id: "cb1", actorUsuarioId: "u-maestro" });

    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "cb1",
      estado: "aprobado",
      conciliadoAt: { not: null },
    });
  });

  it("⭑ R12: pone a NULL las cuatro columnas de la marca Y las dos del espejo", async () => {
    const { prisma, updateMany } = buildPrisma();
    await repoCon(prisma).revertirConciliacion({ id: "cb1", actorUsuarioId: "u-maestro" });

    expect(updateMany.mock.calls[0][0].data).toEqual({
      estado: "solicitado", // se LEE «Pendiente de conciliar»
      conciliadoAt: null,
      conciliadoPor: null,
      montoRecibido: null,
      conciliadoNota: null,
      resueltoAt: null,
      resueltoPor: null,
    });
  });

  it("⭑ R13: el monto de la fila del historial es EL QUE SE BORRA, leido ANTES del update", async () => {
    // Es el unico sitio donde sobrevive: tras el `updateMany`, `monto_recibido` es NULL. Si la
    // lectura se hiciera despues, este monto seria `null` y el rastro diria «alguien deshizo algo».
    const { prisma, createMany, findUnique, updateMany } = buildPrisma();
    await repoCon(prisma).revertirConciliacion({ id: "cb1", actorUsuarioId: "u-maestro" });

    const fila = createMany.mock.calls[0][0].data[0];
    expect(fila.accion).toBe("cierre_bodega_conciliacion_revertida");
    expect(fila.monto?.toFixed(2)).toBe("485.00");
    // Y el ORDEN importa: la lectura va ANTES del `updateMany`.
    expect(findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[0],
    );
  });

  it("revertir algo que no estaba marcado -> `conflict`, sin registrar", async () => {
    const { prisma, createMany } = buildPrisma({ count: 0, existe: 1 });
    const r = await repoCon(prisma).revertirConciliacion({
      id: "cb1",
      actorUsuarioId: "u-maestro",
    });

    expect(r).toBe("conflict");
    expect(createMany).not.toHaveBeenCalled();
  });

  it("revertir algo que no existe -> `fuera_de_alcance`", async () => {
    const { prisma } = buildPrisma({ count: 0, existe: 0 });
    const r = await repoCon(prisma).revertirConciliacion({
      id: "no-existe",
      actorUsuarioId: "u-maestro",
    });

    expect(r).toBe("fuera_de_alcance");
  });

  it("⭑ SLT-73 R14: con asientos de sus cierres en la caja -> `con_asientos`, sin update ni historial", async () => {
    const { prisma, updateMany, createMany, walletCount } = buildPrisma({
      cierresDia: [{ id: "cd1" }, { id: "cd2" }],
      asentados: 7,
    });
    const r = await repoCon(prisma).revertirConciliacion({ id: "cb1", actorUsuarioId: "u-maestro" });

    expect(r).toBe("con_asientos");
    expect(walletCount.mock.calls[0][0]).toEqual({
      where: { origenTipo: "cierre_dia", origenId: { in: ["cd1", "cd2"] } },
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("SLT-73 R14: con cierres pero SIN asientos en la caja, revierte como siempre", async () => {
    const { prisma, updateMany } = buildPrisma({ cierresDia: [{ id: "cd1" }], asentados: 0 });
    const r = await repoCon(prisma).revertirConciliacion({ id: "cb1", actorUsuarioId: "u-maestro" });
    expect(r).toBe("updated");
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-73 — marcarConciliado asienta y escribe la diferencia", () => {
  it("R10: busca los cierres aprobados satelite DE ESTA consolidacion, por fecha de solicitud", async () => {
    const { prisma, cierreDiaFindMany } = buildPrisma();
    await repoCon(prisma).marcarConciliado({
      id: "cb1",
      montoRecibido: "550.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });
    expect(cierreDiaFindMany.mock.calls[0][0]).toEqual({
      where: { cierreBodegaId: "cb1", estado: "aprobado", destinoTipo: "bodega_satelite" },
      select: { id: true },
      orderBy: { solicitadoAt: "asc" },
    });
  });

  it("R10: asienta cada cierre con los asientos inyectados, en el orden devuelto", async () => {
    const { prisma } = buildPrisma({ cierresDia: [{ id: "cd-a" }, { id: "cd-b" }] });
    const a = asientosDoble();
    await repoCon(prisma, a.deps).marcarConciliado({
      id: "cb1",
      montoRecibido: "550.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });
    expect(a.ingreso.mock.calls.map((c) => c[0])).toEqual(["cd-a", "cd-b"]);
  });

  it("R12: los asientos y la diferencia se escriben con el `tx` de la marca, no con el cliente del constructor", async () => {
    // En integracion `this.prisma` y `tx` son la misma conexion (savepoint), asi que esto solo se ve
    // aqui: el doble distingue el objeto `tx` del `prisma` que recibe el constructor.
    const { prisma, tx } = buildPrisma({ cierresDia: [{ id: "cd-a" }] });
    const a = asientosDoble();
    await repoCon(prisma, a.deps).marcarConciliado({
      id: "cb1",
      montoRecibido: "485.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });
    expect(a.ingreso.mock.calls[0][1]).toBe(tx);
    expect(a.caja.mock.calls.length).toBeGreaterThan(0);
    for (const llamada of a.caja.mock.calls) expect(llamada[0]).toBe(tx);
  });

  it("R11/R22: recibido 485 con esperado 550 -> UN egreso de 65,00 fechado en la marca", async () => {
    const { prisma, updateMany, ajusteCreate } = buildPrisma();
    const a = asientosDoble();
    await repoCon(prisma, a.deps).marcarConciliado({
      id: "cb1",
      montoRecibido: "485.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });
    const conciliadoAt = updateMany.mock.calls[0][0].data.conciliadoAt;
    const ajuste = ajusteCreate.mock.calls[0][0].data;
    expect(ajuste.evento).toBe("marca");
    expect((ajuste.diferencia as Prisma.Decimal).toFixed(2)).toBe("65.00");
    expect((ajuste.montoEsperado as Prisma.Decimal).toFixed(2)).toBe("550.00");
    expect(a.caja).toHaveBeenCalledTimes(1);
    expect(a.caja.mock.calls[0][1]).toEqual([
      {
        tipo: "egreso",
        categoria: "egreso_diferencia_satelite",
        monto: "65.00",
        origenTipo: "conciliacion_bodega_ajuste",
        origenId: "aj-1",
        descripcion: null,
        registradoPor: "u-maestro",
        fechaMovimiento: conciliadoAt,
      },
    ]);
  });

  it("R11: recibido igual al esperado -> ni ajuste ni movimiento", async () => {
    const { prisma, ajusteCreate } = buildPrisma();
    const a = asientosDoble();
    await repoCon(prisma, a.deps).marcarConciliado({
      id: "cb1",
      montoRecibido: "550.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });
    expect(ajusteCreate).not.toHaveBeenCalled();
    expect(a.caja).not.toHaveBeenCalled();
  });

  it("R11: `conflict` no asienta nada", async () => {
    const { prisma, cierreDiaFindMany, ajusteCreate } = buildPrisma({ count: 0, existe: 1 });
    await repoCon(prisma).marcarConciliado({
      id: "cb1",
      montoRecibido: "1.00",
      nota: null,
      actorUsuarioId: "u-maestro",
    });
    expect(cierreDiaFindMany).not.toHaveBeenCalled();
    expect(ajusteCreate).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 473 / T1 (R4/R8) — `corregirConciliacion`: el WHERE, el data y la fila del historial.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// El doble devuelve por defecto `montoRecibido: 485.00` en el `findUnique` previo: es el monto
// ANTERIOR que el compare-and-swap tiene que exigir en el `WHERE`.

describe("473/T1 — CierresBodegaAdminRepository.corregirConciliacion", () => {
  const INPUT = {
    id: "cb1",
    montoRecibido: "600.00",
    nota: "una nota que NO viaja",
    actorUsuarioId: "u-maestro",
  };

  it("⭑ R8: el WHERE de corregirConciliacion exige aprobado, conciliadoAt no nulo y el monto leido", async () => {
    const { prisma, updateMany, findUnique } = buildPrisma();
    await repoCon(prisma).corregirConciliacion(INPUT);

    const where = updateMany.mock.calls[0][0].where;
    expect(Object.keys(where).sort()).toEqual(["conciliadoAt", "estado", "id", "montoRecibido"]);
    expect(where.id).toBe("cb1");
    expect(where.estado).toBe("aprobado");
    expect(where.conciliadoAt).toEqual({ not: null });
    // Compare-and-swap: el monto LEIDO en la misma transaccion, no el nuevo.
    expect((where.montoRecibido as Prisma.Decimal).toFixed(2)).toBe("485.00");
    // La lectura del previo va ANTES del update.
    expect(findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[0],
    );
  });

  it("R1/R2/R3: escribe monto nuevo (Decimal), nota, autor/instante y espejo; NO toca `estado`", async () => {
    const { prisma, updateMany } = buildPrisma();
    await repoCon(prisma).corregirConciliacion(INPUT);

    const data = updateMany.mock.calls[0][0].data;
    expect(data.estado).toBeUndefined(); // sigue `aprobado`: nunca pasa por pendiente
    expect(data.montoRecibido).toBeInstanceOf(Prisma.Decimal);
    expect(data.montoRecibido?.toFixed(2)).toBe("600.00");
    expect(data.conciliadoNota).toBe("una nota que NO viaja");
    expect(data.conciliadoPor).toBe("u-maestro");
    expect(data.resueltoPor).toBe("u-maestro");
    expect(data.conciliadoAt).toBeInstanceOf(Date);
    expect(data.resueltoAt?.getTime()).toBe(data.conciliadoAt?.getTime());
  });

  it("R3: sin nota, la escribe como NULL", async () => {
    const { prisma, updateMany } = buildPrisma();
    await repoCon(prisma).corregirConciliacion({ ...INPUT, nota: null });
    expect(updateMany.mock.calls[0][0].data.conciliadoNota).toBeNull();
  });

  it("⭑ R4: corregirConciliacion registra el monto nuevo y el anterior y no la nota", async () => {
    const { prisma, createMany } = buildPrisma();
    await repoCon(prisma).corregirConciliacion(INPUT);

    expect(createMany).toHaveBeenCalledTimes(1);
    const filas = createMany.mock.calls[0][0].data;
    expect(filas).toHaveLength(1);
    const fila = filas[0];
    expect(fila.accion).toBe("cierre_bodega_conciliado");
    expect(fila.entidadTipo).toBe("cierre_bodega");
    expect(fila.entidadId).toBe("cb1");
    expect(fila.monto?.toFixed(2)).toBe("600.00");
    expect(fila.valorAnterior).toBe("485.00");
    expect(fila.valorNuevo).toBe("600.00");
    expect(fila.entidadEtiqueta).toContain("Cartago");
    expect(JSON.stringify(fila)).not.toContain("una nota que NO viaja");
  });

  it("⭑ R8: count 0 tras leer responde conflict sin appendAccion", async () => {
    // El monto cambio entre la lectura y la escritura (o ya no esta conciliada): el `WHERE` no casa.
    const { prisma, createMany } = buildPrisma({ count: 0, existe: 1 });
    const r = await repoCon(prisma).corregirConciliacion(INPUT);
    expect(r).toBe("conflict");
    expect(createMany).not.toHaveBeenCalled();
  });

  it("R7: la fila no existe -> `fuera_de_alcance`, sin update ni historial", async () => {
    const { prisma, updateMany, createMany } = buildPrisma({ fila: null, count: 0, existe: 0 });
    const r = await repoCon(prisma).corregirConciliacion({ ...INPUT, id: "no-existe" });
    expect(r).toBe("fuera_de_alcance");
    expect(updateMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("SLT-73 R13: corregir NO vuelve a asentar los cierres; escribe solo la variacion (ingreso 115,00)", async () => {
    // esperado 550; recibido nuevo 600 -> objetivo = 550 − 600 = −50. Ya asentado +65 (la marca de
    // 485). delta = −50 − 65 = −115 -> UN ingreso de 115,00.
    const { prisma, cierreDiaFindMany, ajusteCreate } = buildPrisma({ yaAsentado: "65.00" });
    const a = asientosDoble();
    await expect(repoCon(prisma, a.deps).corregirConciliacion(INPUT)).resolves.toBe("updated");
    expect(cierreDiaFindMany).not.toHaveBeenCalled();
    expect(a.ingreso).not.toHaveBeenCalled();
    expect(ajusteCreate.mock.calls[0][0].data.evento).toBe("correccion");
    expect(a.caja.mock.calls[0][1]).toMatchObject([
      { tipo: "ingreso", categoria: "ingreso_diferencia_satelite", monto: "115.00" },
    ]);
  });
});
