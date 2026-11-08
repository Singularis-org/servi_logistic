import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";

import { comoApp, fijarEmpresa } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, serializarEscriturasReales } from "./_postgres-real";
import {
  activar,
  cajaFulfillment,
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

// SLT-94 (T1.4) — el cobro de fulfillment por paquete al crear la orden y su devolución al eliminar,
// contra Postgres. Los triggers de 20261108120300 son el código bajo prueba.
//
// Las órdenes nacen por `OrdenRepository.createManyOrdenes` / `createManyOrdenesConGuia` (las dos
// rutas a las que llegan pantalla, carga masiva y API key) y se eliminan y restauran con
// `softDelete`, `softDeleteViaApi` y `restore` (los tres escritores de `deleted_at`). La cancelación
// por API vive en `slt94-fulfillment-cancelacion-api.test.ts`.
//
// Empresa A ACTIVADA:  tienda A1 (1000.00 + 13 %), A2 (valor 0), A3 (sin valor), A4 (marca «no se
//                      recoge», 500.00 + 0 %), A5 (otra tienda para R31).
// Empresa B SIN ACTIVAR al principio: tienda B1 (700.00 + 13 % en el modelo nuevo y 900.00 en el viejo).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

let base: PrismaClient;
let app: PrismaClient;
let geo: Geo;
let enPreparacion: string;

let A: EmpresaDePrueba;
let B: EmpresaDePrueba;
const t: Record<string, string> = {};
let valorA1: string;
const orden: Record<string, string> = {};

const rem = (n: string) => `SLT94-${n}-${RUN}`;

async function crearUna(e: EmpresaDePrueba, tiendaId: string, nombre: string, conGuia = true): Promise<string> {
  const { ids } = await crearOrdenes(app, base, e, tiendaId, [rem(nombre)], { conGuia, estatusId: enPreparacion, geo });
  const id = ids[rem(nombre)];
  if (id === undefined) throw new Error(`la orden ${nombre} no se creó`);
  return id;
}

function eliminar(e: EmpresaDePrueba, ordenId: string) {
  return conEmpresa(e.id, () => ordenRepo(app).softDelete({ ids: [ordenId], ownerId: null, actorUsuarioId: e.maestroId }));
}

function restaurar(e: EmpresaDePrueba, ordenId: string) {
  return conEmpresa(e.id, () => ordenRepo(app).restore([ordenId], e.maestroId));
}

class Revertir extends Error {
  constructor() {
    super("rollback deliberado del test");
  }
}

describeSiHayBase("SLT-94 — cobro de fulfillment por paquete (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    geo = await geoCartago(base);
    enPreparacion = await estatusId(base, "en_preparacion");

    await bajoLockDeEscrituraReal(async () => {
      A = await sembrarEmpresa(base, `A ${RUN}`);
      B = await sembrarEmpresa(base, `B ${RUN}`);
      t.A1 = await sembrarUsuario(base, A.id, "adminTienda", "A1");
      t.A2 = await sembrarUsuario(base, A.id, "adminTienda", "A2");
      t.A3 = await sembrarUsuario(base, A.id, "adminTienda", "A3");
      t.A4 = await sembrarUsuario(base, A.id, "adminTienda", "A4", false);
      t.A5 = await sembrarUsuario(base, A.id, "adminTienda", "A5");
      t.B1 = await sembrarUsuario(base, B.id, "adminTienda", "B1");
      await activar(base, A.id);
      valorA1 = await fijarFulfillment(base, A.id, t.A1, "1000.00", "13.00");
      await fijarFulfillment(base, A.id, t.A2, "0.00", "13.00");
      await fijarFulfillment(base, A.id, t.A4, "500.00", "0.00");
      await fijarFulfillment(base, B.id, t.B1, "700.00", "13.00");
      // El modelo viejo de B1 también tiene fulfillment: tampoco cuenta (R16).
      await base.tarifa.create({
        data: {
          valorFlete: "2000.00",
          valorFleteDevuelto: "1000.00",
          valorFleteGam: "2000.00",
          valorFleteDevueltoGam: "1000.00",
          comisionCod: "0.00",
          ivaFlete: "0.00",
          ivaComisionCod: "0.00",
          fulfillment: "900.00",
          tiendaId: t.B1,
          zonaId: B.zonaId,
          organizacionId: B.id,
        },
      });
    });
  }, 120_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.id, B?.id].filter((x): x is string => typeof x === "string");
    await bajoLockDeEscrituraReal(() => limpiarEmpresas(base, orgs));
    await base.$disconnect();
  }, 180_000);

  it("control: los tres triggers están instalados", async () => {
    const filas = await base.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'fulfillment_al_%' ORDER BY tgname`,
    );
    expect(filas.map((f) => f.tgname)).toEqual([
      "fulfillment_al_cambiar_borrado",
      "fulfillment_al_cancelar_por_api",
      "fulfillment_al_crear_orden",
    ]);
  });

  /* ----------------------------- R15 / R19 -------------------------------- */

  it("R15/R19: A1 (1000.00 + 13 %) crea por la ruta con guía → un cobro de 1000.00 + 130.00, con sus cuatro filas y la fecha de creación", async () => {
    const saldoAntes = await saldoTienda(base, t.A1);
    orden.o1 = await crearUna(A, t.A1, "o1", true);

    const movs = await movimientosDe(base, orden.o1);
    expect(movs.map((m) => [m.secuencia, m.tipo, m.causa, m.monto, m.iva_pct, m.iva, m.tienda_id, m.tarifa_valor_id, m.organizacion_id])).toEqual([
      [1, "cargo", "creacion", "1000.00", "13.00", "130.00", t.A1, valorA1, A.id],
    ]);
    const { createdAt } = await base.orden.findUniqueOrThrow({ where: { id: orden.o1 }, select: { createdAt: true } });
    expect(movs[0].ocurrido_at).toEqual(createdAt);

    const libros = await librosDe(base, movs[0].id);
    expect(libros.map((f) => [f.libro, f.tipo, f.categoria, f.monto, f.tienda_id, f.origen_tipo, f.organizacion_id])).toEqual([
      ["caja", "ingreso", "ingreso_fulfillment", "1000.00", null, "orden_fulfillment", A.id],
      ["caja", "ingreso", "ingreso_iva_fulfillment", "130.00", null, "orden_fulfillment", A.id],
      ["tienda", "debito", "fulfillment", "1000.00", t.A1, "orden_fulfillment", A.id],
      ["tienda", "debito", "iva_fulfillment", "130.00", t.A1, "orden_fulfillment", A.id],
    ]);
    for (const f of libros) expect(f.fecha_movimiento).toEqual(createdAt);
    // R19: el disponible baja exactamente monto + IVA.
    expect(Number(await saldoTienda(base, t.A1)) - Number(saldoAntes)).toBeCloseTo(-1130, 2);
  });

  it("R15: la ruta sin guía (carga masiva a bodega) también cobra, una vez por orden", async () => {
    orden.o2 = await crearUna(A, t.A1, "o2", false);
    expect(await resumenDe(base, orden.o2)).toEqual(["1 cargo creacion 1000.00 130.00"]);
  });

  /* ------------------------------- R17 ------------------------------------ */

  it("R17: valor 0 (A2) o sin valor (A3) → ningún movimiento ni fila de libro", async () => {
    const o = await crearUna(A, t.A2, "a2");
    const p = await crearUna(A, t.A3, "a3");
    expect(await movimientosDe(base, o)).toEqual([]);
    expect(await movimientosDe(base, p)).toEqual([]);
    expect(await saldoTienda(base, t.A2)).toBe("0.00");
    expect(await saldoTienda(base, t.A3)).toBe("0.00");
  });

  /* ------------------------------- R18 ------------------------------------ */

  it("R18: el cobro no depende de la marca ni de la ruta: A4 («no se recoge», 0 % IVA) se cobra 500.00 y sin filas de IVA", async () => {
    const o = await crearUna(A, t.A4, "a4", false);
    const movs = await movimientosDe(base, o);
    expect(movs.map((m) => `${m.monto} ${m.iva_pct} ${m.iva}`)).toEqual(["500.00 0.00 0.00"]);
    const libros = await librosDe(base, movs[0].id);
    expect(libros.map((f) => `${f.libro} ${f.categoria} ${f.monto}`)).toEqual([
      "caja ingreso_fulfillment 500.00",
      "tienda fulfillment 500.00",
    ]);
    // A1 tiene la marca en «sí» (por defecto) y también se cobró (R15).
    expect((await base.usuario.findUniqueOrThrow({ where: { id: t.A1 }, select: { seRecogeEnTienda: true } })).seRecogeEnTienda).toBe(true);
  });

  /* ------------------------------- R16 ------------------------------------ */

  it("R16: B sin activar no cobra, aunque B1 tenga valor en el modelo nuevo y en el viejo", async () => {
    orden.b0 = await crearUna(B, t.B1, "b0");
    expect(await movimientosDe(base, orden.b0)).toEqual([]);
    expect(await saldoTienda(base, t.B1)).toBe("0.00");
    expect(await cajaFulfillment(base, B.id)).toBe("0.00");
  });

  /* ------------------------------- R23 ------------------------------------ */

  it("R23: carga parcial con skipDuplicates → solo se cobran las creadas; un reintento no escribe nada", async () => {
    const r = await crearOrdenes(app, base, A, t.A1, [rem("o1"), rem("p1"), rem("p2")], { conGuia: true, estatusId: enPreparacion, geo });
    expect(r.omitidas).toEqual([rem("o1")]);
    expect(await resumenDe(base, orden.o1)).toEqual(["1 cargo creacion 1000.00 130.00"]);
    expect(await resumenDe(base, r.ids[rem("p1")])).toEqual(["1 cargo creacion 1000.00 130.00"]);
    expect(await resumenDe(base, r.ids[rem("p2")])).toEqual(["1 cargo creacion 1000.00 130.00"]);

    const caja = await cajaFulfillment(base, A.id);
    const otra = await crearOrdenes(app, base, A, t.A1, [rem("p1"), rem("p2")], { conGuia: false, estatusId: enPreparacion, geo });
    expect(otra.omitidas.sort()).toEqual([rem("p1"), rem("p2")].sort());
    expect(await cajaFulfillment(base, A.id)).toBe(caja);
    expect((await movimientosDe(base, r.ids[rem("p1")])).length).toBe(1);
  });

  it("R23: la base rechaza un segundo cobro inicial de la misma orden (único por secuencia)", async () => {
    const [m] = await movimientosDe(base, orden.o1);
    const estado = await base
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "orden_fulfillment_movimiento" ("id", "organizacion_id", "orden_id", "tienda_id", "secuencia", "tipo",
             "causa", "monto", "iva_pct", "iva", "ocurrido_at") VALUES ($1, $2, $3, $4, 1, 'cargo', 'creacion', 1, 0, 0, now())`,
          randomUUID(),
          A.id,
          orden.o1,
          m.tienda_id,
        );
        throw new Revertir();
      })
      .catch((e: unknown) => (e instanceof Revertir ? "insertó" : sqlstateDe(e)));
    expect(estado).toBe("23505");
  });

  /* ------------------------------- R24 ------------------------------------ */

  it("R24: si la transacción que crea la orden se deshace, no queda ningún movimiento ni fila de libro", async () => {
    const id = randomUUID();
    const saldo = await saldoTienda(base, t.A1);
    const visto = await base
      .$transaction(async (tx) => {
        await serializarEscriturasReales(tx);
        await fijarEmpresa(tx, A.id);
        await tx.$executeRawUnsafe(
          `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
             "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id")
           VALUES ($1, $2, $3, 'SLT94', '88887777', $4, $5, $6, $7, 'Caja', now(), $8)`,
          id,
          rem("r24"),
          enPreparacion,
          t.A1,
          A.zonaId,
          geo.provinciaId,
          geo.cantonId,
          A.id,
        );
        // Control de no vacuidad: dentro de la transacción el cobro SÍ existe.
        const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "orden_fulfillment_movimiento" WHERE "orden_id" = $1`,
          id,
        );
        expect(n).toBe(1);
        throw new Revertir();
      })
      .catch((e: unknown) => (e instanceof Revertir ? "revertida" : sqlstateDe(e)));
    expect(visto).toBe("revertida");
    expect(await movimientosDe(base, id)).toEqual([]);
    expect(await saldoTienda(base, t.A1)).toBe(saldo);
  });

  /* ------------------------------ R21 / R22 ------------------------------- */

  it("R21/R22: cambiar el valor a 1200.00 + 10 % no toca los cobros escritos y solo cuenta para órdenes nuevas", async () => {
    const antes = await movimientosDe(base, orden.o1);
    await fijarFulfillment(base, A.id, t.A1, "1200.00", "10.00");
    expect(await movimientosDe(base, orden.o1)).toEqual(antes);

    orden.o3 = await crearUna(A, t.A1, "o3");
    expect(await resumenDe(base, orden.o3)).toEqual(["1 cargo creacion 1200.00 120.00"]);
  });

  /* ------------------------------ R26 / R31 ------------------------------- */

  it("R26/R31: o1 pasa a A5 y se elimina → la devolución va a A1 (la congelada) por 1000.00 + 130.00, con la fecha del borrado", async () => {
    await base.orden.update({ where: { id: orden.o1 }, data: { tiendaId: t.A5 } });
    const saldoA1 = await saldoTienda(base, t.A1);
    const cargo = (await movimientosDe(base, orden.o1))[0];

    expect(await eliminar(A, orden.o1)).toBe(1);

    const movs = await movimientosDe(base, orden.o1);
    expect(movs.map((m) => [m.secuencia, m.tipo, m.causa, m.monto, m.iva_pct, m.iva, m.tienda_id, m.tarifa_valor_id])).toEqual([
      [1, "cargo", "creacion", "1000.00", "13.00", "130.00", t.A1, valorA1],
      [2, "reverso", "eliminacion", "1000.00", "13.00", "130.00", t.A1, valorA1],
    ]);
    expect(movs[0]).toEqual(cargo); // el cobro no se modifica
    const { deletedAt } = await base.orden.findUniqueOrThrow({ where: { id: orden.o1 }, select: { deletedAt: true } });
    expect(deletedAt).not.toBeNull();
    expect(movs[1].ocurrido_at).toEqual(deletedAt);

    const libros = await librosDe(base, movs[1].id);
    expect(libros.map((f) => [f.libro, f.tipo, f.categoria, f.monto, f.tienda_id])).toEqual([
      ["caja", "egreso", "egreso_reverso_fulfillment", "1000.00", null],
      ["caja", "egreso", "egreso_reverso_iva_fulfillment", "130.00", null],
      ["tienda", "credito", "fulfillment_anulado", "1000.00", t.A1],
      ["tienda", "credito", "iva_fulfillment_anulado", "130.00", t.A1],
    ]);
    for (const f of libros) expect(f.fecha_movimiento).toEqual(deletedAt);
    expect(Number(await saldoTienda(base, t.A1)) - Number(saldoA1)).toBeCloseTo(1130, 2);
    expect(await saldoTienda(base, t.A5)).toBe("0.00");
  });

  it("R26: la devolución lleva la fecha de la eliminación aunque no sea «ahora» (un escritor que fija una fecha pasada)", async () => {
    const o = await crearUna(A, t.A1, "r26-fecha");
    await base.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = '2026-01-15 10:30:00' WHERE "id" = $1`, o);
    const movs = await movimientosDe(base, o);
    expect(movs.map((m) => `${m.tipo} ${m.causa}`)).toEqual(["cargo creacion", "reverso eliminacion"]);
    const esperada = new Date("2026-01-15T10:30:00.000Z");
    expect(movs[1].ocurrido_at).toEqual(esperada);
    for (const f of await librosDe(base, movs[1].id)) expect(f.fecha_movimiento).toEqual(esperada);
  });

  /* ------------------------------- R27 ------------------------------------ */

  it("R27: repetir la eliminación (repositorio y una fecha reescrita) no escribe otra devolución", async () => {
    expect(await eliminar(A, orden.o1)).toBe(0);
    await base.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = "deleted_at" + interval '1 minute' WHERE "id" = $1`, orden.o1);
    expect((await movimientosDe(base, orden.o1)).map((m) => m.tipo)).toEqual(["cargo", "reverso"]);
  });

  it("R27: dos eliminaciones a la vez de la misma orden → una sola devolución", async () => {
    const id = orden.o2;
    await Promise.all([
      eliminar(A, id),
      conEmpresa(A.id, () =>
        ordenRepo(app).softDeleteViaApi({ ordenId: id, ownerId: t.A1, estadosPermitidos: ["en_preparacion"], actorUsuarioId: t.A1 }),
      ),
      base.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = now() WHERE "id" = $1`, id),
    ]);
    expect(await resumenDe(base, id)).toEqual(["1 cargo creacion 1000.00 130.00", "2 reverso eliminacion 1000.00 130.00"]);
  });

  /* ------------------------------- R29 ------------------------------------ */

  it("R29: restaurar o1 re-cobra el MISMO 1000.00 + 130.00 congelado (no el 1200.00 vigente), a la tienda congelada, con la fecha de la restauración", async () => {
    const antes = Date.now();
    expect(await restaurar(A, orden.o1)).toBe(1);
    const movs = await movimientosDe(base, orden.o1);
    expect(movs.map((m) => [m.secuencia, m.tipo, m.causa, m.monto, m.iva_pct, m.iva, m.tienda_id])).toEqual([
      [1, "cargo", "creacion", "1000.00", "13.00", "130.00", t.A1],
      [2, "reverso", "eliminacion", "1000.00", "13.00", "130.00", t.A1],
      [3, "cargo", "restauracion", "1000.00", "13.00", "130.00", t.A1],
    ]);
    // El instante de la restauración, no el de la creación (tolerancia por reloj del servidor).
    expect(Math.abs(movs[2].ocurrido_at.getTime() - antes)).toBeLessThan(5 * 60_000);
    expect(movs[2].ocurrido_at.getTime()).toBeGreaterThan(movs[1].ocurrido_at.getTime() - 1);
    const libros = await librosDe(base, movs[2].id);
    expect(libros.map((f) => `${f.libro} ${f.tipo} ${f.categoria} ${f.monto}`)).toEqual([
      "caja ingreso ingreso_fulfillment 1000.00",
      "caja ingreso ingreso_iva_fulfillment 130.00",
      "tienda debito fulfillment 1000.00",
      "tienda debito iva_fulfillment 130.00",
    ]);
    // Eliminar otra vez devuelve otra vez (cargo, reverso, cargo, reverso).
    expect(await eliminar(A, orden.o1)).toBe(1);
    expect((await movimientosDe(base, orden.o1)).map((m) => `${m.secuencia} ${m.tipo} ${m.causa}`)).toEqual([
      "1 cargo creacion",
      "2 reverso eliminacion",
      "3 cargo restauracion",
      "4 reverso eliminacion",
    ]);
  });

  /* ------------------------------- R28 ------------------------------------ */

  it("R28: una orden sin cobro (A3 sin valor) se elimina y se restaura sin escribir nada", async () => {
    const o = await crearUna(A, t.A3, "r28");
    expect(await eliminar(A, o)).toBe(1);
    expect(await restaurar(A, o)).toBe(1);
    expect(await movimientosDe(base, o)).toEqual([]);
    expect(await saldoTienda(base, t.A3)).toBe("0.00");
  });

  /* ------------------------------- R34 ------------------------------------ */

  it("R34: una orden creada antes del despliegue (sin el trigger de alta) no se cobra ni al eliminarla ni al restaurarla", async () => {
    const id = randomUUID();
    const resultado = await base
      .$transaction(
        async (tx) => {
          await serializarEscriturasReales(tx);
          await fijarEmpresa(tx, A.id);
          // «Antes del despliegue»: el trigger de alta no existía.
          await tx.$executeRawUnsafe(`ALTER TABLE "orden" DISABLE TRIGGER "fulfillment_al_crear_orden"`);
          await tx.$executeRawUnsafe(
            `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
               "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id")
             VALUES ($1, $2, $3, 'SLT94', '88887777', $4, $5, $6, $7, 'Caja', now(), $8)`,
            id,
            rem("r34"),
            enPreparacion,
            t.A1,
            A.zonaId,
            geo.provinciaId,
            geo.cantonId,
            A.id,
          );
          await tx.$executeRawUnsafe(`ALTER TABLE "orden" ENABLE TRIGGER "fulfillment_al_crear_orden"`);
          await tx.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = now() WHERE "id" = $1`, id);
          await tx.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = NULL WHERE "id" = $1`, id);
          const filas = await tx.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM "orden_fulfillment_movimiento" WHERE "orden_id" = $1`,
            id,
          );
          // Control: con el trigger ya activo, una orden nueva de A1 SÍ se cobra en esta misma tx.
          const otra = randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
               "provincia_id", "canton_id", "producto", "updated_at", "organizacion_id")
             VALUES ($1, $2, $3, 'SLT94', '88887777', $4, $5, $6, $7, 'Caja', now(), $8)`,
            otra,
            rem("r34-control"),
            enPreparacion,
            t.A1,
            A.zonaId,
            geo.provinciaId,
            geo.cantonId,
            A.id,
          );
          const control = await tx.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM "orden_fulfillment_movimiento" WHERE "orden_id" = $1`,
            otra,
          );
          throw Object.assign(new Revertir(), { valor: [filas[0].n, control[0].n] });
        },
        { timeout: 60_000, maxWait: 30_000 },
      )
      .catch((e: unknown) => (e instanceof Revertir ? (e as Revertir & { valor: number[] }).valor : sqlstateDe(e)));
    expect(resultado).toEqual([0, 1]);
  });

  /* ------------------------------ R38 / R25 ------------------------------- */

  it("R38: activada B, su orden se cobra con el valor de B (700.00 + 91.00), en B, sin mover la caja de A", async () => {
    const cajaA = await cajaFulfillment(base, A.id);
    await activar(base, B.id);
    orden.b1 = await crearUna(B, t.B1, "b1");
    const movs = await movimientosDe(base, orden.b1);
    expect(movs.map((m) => [m.organizacion_id, m.tienda_id, m.monto, m.iva])).toEqual([[B.id, t.B1, "700.00", "91.00"]]);
    const libros = await librosDe(base, movs[0].id);
    expect(new Set(libros.map((f) => f.organizacion_id))).toEqual(new Set([B.id]));
    expect(await cajaFulfillment(base, B.id)).toBe("791.00");
    expect(await cajaFulfillment(base, A.id)).toBe(cajaA);
    // La orden de B creada antes de activar sigue sin cobro.
    expect(await movimientosDe(base, orden.b0)).toEqual([]);
  });

  it("R38: como servi_app, A no ve los movimientos de fulfillment de B (y sí los suyos)", async () => {
    const vistos = await base
      .$transaction(async (tx) => {
        await comoApp(tx, A.id);
        const filas = await tx.$queryRawUnsafe<{ org: string; n: number }[]>(
          `SELECT "organizacion_id" AS org, count(*)::int AS n FROM "orden_fulfillment_movimiento"
            WHERE "organizacion_id" = ANY($1::text[]) GROUP BY 1`,
          [A.id, B.id],
        );
        throw Object.assign(new Revertir(), { valor: filas });
      })
      .catch((e: unknown) => (e instanceof Revertir ? (e as Revertir & { valor: { org: string; n: number }[] }).valor : sqlstateDe(e)));
    expect(Array.isArray(vistos)).toBe(true);
    const orgs = (vistos as { org: string; n: number }[]).map((f) => f.org);
    expect(orgs).toEqual([A.id]);
  });

  /* ------------------------------- R12 ------------------------------------ */

  it("R12: la base rechaza (23514) un fulfillment nuevo o modificado que no sea de la tienda en todas sus zonas y en monto", async () => {
    const intentar = (sql: string, ...args: unknown[]) =>
      base
        .$transaction(async (tx) => {
          await fijarEmpresa(tx, A.id);
          await tx.$executeRawUnsafe(sql, ...args);
          throw new Revertir();
        })
        .catch((e: unknown) => (e instanceof Revertir ? "permitido" : sqlstateDe(e)));
    const insertar = `INSERT INTO "tarifa_valor" ("id", "organizacion_id", "concepto", "modo", "valor", "iva_pct", "zona_id", "tienda_id")
      VALUES ($1, $2, $3::tarifa_concepto, $4::tarifa_modo, 10, 13, $5, $6)`;
    // Nivel zona (sin tienda) y nivel tienda en una zona.
    expect(await intentar(insertar, randomUUID(), A.id, "tienda_fulfillment", "monto", A.zonaId, null)).toBe("23514");
    expect(await intentar(insertar, randomUUID(), A.id, "tienda_fulfillment", "monto", A.zonaId, t.A3)).toBe("23514");
    // Tienda en todas sus zonas, pero en porcentaje.
    expect(await intentar(insertar, randomUUID(), A.id, "tienda_fulfillment", "porcentaje", null, t.A3)).toBe("23514");
    // Modificar un valor válido a porcentaje.
    expect(await intentar(`UPDATE "tarifa_valor" SET "modo" = 'porcentaje' WHERE "id" = $1`, valorA1)).toBe("23514");
    // Controles: el nivel válido entra, y el CHECK no frena a los demás conceptos en zona.
    expect(await intentar(insertar, randomUUID(), A.id, "tienda_fulfillment", "monto", null, t.A3)).toBe("permitido");
    expect(await intentar(insertar, randomUUID(), A.id, "tienda_flete_entregado", "monto", A.zonaId, null)).toBe("permitido");
  });

  it("R25: servi_app no puede insertar, modificar ni borrar movimientos de fulfillment (42501)", async () => {
    const [m] = await movimientosDe(base, orden.o3);
    const intentar = (sql: string, ...args: unknown[]) =>
      base
        .$transaction(async (tx) => {
          await comoApp(tx, A.id);
          await tx.$executeRawUnsafe(sql, ...args);
          throw new Revertir();
        })
        .catch((e: unknown) => (e instanceof Revertir ? "permitido" : sqlstateDe(e)));
    expect(await intentar(`UPDATE "orden_fulfillment_movimiento" SET "monto" = 1 WHERE "id" = $1`, m.id)).toBe("42501");
    expect(await intentar(`DELETE FROM "orden_fulfillment_movimiento" WHERE "id" = $1`, m.id)).toBe("42501");
    expect(
      await intentar(
        `INSERT INTO "orden_fulfillment_movimiento" ("id", "orden_id", "tienda_id", "secuencia", "tipo", "causa", "monto",
           "iva_pct", "iva", "ocurrido_at") VALUES ($1, $2, $3, 9, 'cargo', 'restauracion', 1, 0, 0, now())`,
        randomUUID(),
        orden.o3,
        t.A1,
      ),
    ).toBe("42501");
    expect(await movimientosDe(base, orden.o3)).toHaveLength(1);
  });
});
