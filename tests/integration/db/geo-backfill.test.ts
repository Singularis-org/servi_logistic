import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  FKS_SIN_VALIDAR,
  LOTE_POR_DEFECTO,
  aplicar,
  aplicarLote,
  comprobar,
  ejecutar,
  leerArgumentos,
  validar,
  type Argumentos,
} from "@/scripts/geo-backfill-nodo";
import { crearEscenarioGeo43, crearOrdenGeo43, vaciarColumnasNuevas, type EscenarioGeo43 } from "./_fixtures/geo-43";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-43 (T5.2; design §4) — `scripts/geo-backfill-nodo.ts` contra Postgres real.
//   · R24: las tres FK nacen sin validar; `--validar` no valida con filas pendientes y sí tras `--aplicar`.
//   · R25, R26: cifras de la comprobación; con la jerarquía rota, `--aplicar` no escribe y sale con error.
//   · R27, R28: lotes de 2 sobre 7 órdenes, corte tras el primer lote y relanzar; con todo lleno, 0.
//   · R29, R30: el resto de columnas de `orden` (con `updated_at`) y los cargos de plataforma, iguales.
//   · R31: forma del snapshot, nombres congelados e ids de las FK de la orden.
//   · R33: `--aplicar`/`--validar` sin `--base` o con otro nombre no escriben.
//   · R40: sin trigger en `cierre_detail`; un cierre nuevo nace NULL y relanzar lo llena.
//
// Cada caso corre en una transacción del dueño que siempre se revierte (`revertida`): el script corre
// sobre la conexión del test, así que lo que escribe (y el `VALIDATE`) se deshace al terminar. Las filas
// «previas a la migración» se simulan vaciando las columnas nuevas del escenario `XA`
// (`vaciarColumnasNuevas`). El script es global (no filtra por empresa), por eso las cifras se miden
// como diferencias y las filas se comprueban por id.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

function args(argv: string[]): Argumentos {
  const a = leerArgumentos(argv);
  if (a === null) throw new Error(`argumentos inválidos: ${argv.join(" ")}`);
  return a;
}

async function nombreDeLaBase(tx: TxDeTest): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ base: string }[]>(`SELECT current_database() AS base`);
  return f.base;
}

async function fksValidadas(tx: TxDeTest): Promise<Record<string, boolean>> {
  const filas = await tx.$queryRawUnsafe<{ conname: string; convalidated: boolean }[]>(
    `SELECT conname, convalidated FROM pg_constraint WHERE conname = ANY($1::text[])`,
    FKS_SIN_VALIDAR.map((f) => f.restriccion),
  );
  return Object.fromEntries(filas.map((f) => [f.conname, f.convalidated]));
}

async function nodos(tx: TxDeTest, tabla: string, ids: string[]): Promise<Record<string, string | null>> {
  const filas = await tx.$queryRawUnsafe<{ id: string; nodo: string | null }[]>(
    `SELECT id, nodo_geografico_id AS nodo FROM ${tabla} WHERE id = ANY($1::text[])`,
    ids,
  );
  return Object.fromEntries(filas.map((f) => [f.id, f.nodo]));
}

/** `ctid` de cada fila: cambia con cualquier `UPDATE`, también dentro de la misma transacción. */
async function ctids(tx: TxDeTest, tabla: string, ids: string[]): Promise<Record<string, string>> {
  const filas = await tx.$queryRawUnsafe<{ id: string; ctid: string }[]>(
    `SELECT id, ctid::text AS ctid FROM ${tabla} WHERE id = ANY($1::text[])`,
    ids,
  );
  return Object.fromEntries(filas.map((f) => [f.id, f.ctid]));
}

interface Snapshot {
  v: number;
  niveles: { profundidad: number; tipo: string; nombre: string; id: string | null }[];
}

async function snapshots(tx: TxDeTest, ids: string[]) {
  const filas = await tx.$queryRawUnsafe<
    {
      id: string;
      snap: Snapshot | null;
      provincia_nombre: string;
      canton_nombre: string;
      distrito_nombre: string | null;
    }[]
  >(
    `SELECT id, ubicacion_snapshot AS snap, provincia_nombre, canton_nombre, distrito_nombre
       FROM cierre_detail WHERE id = ANY($1::text[])`,
    ids,
  );
  return Object.fromEntries(filas.map((f) => [f.id, f]));
}

/** Escenario `XA` con las columnas nuevas de todas sus filas vaciadas, como antes de migrar. */
async function escenarioPrevio(tx: TxDeTest): Promise<EscenarioGeo43> {
  const e = await crearEscenarioGeo43(tx);
  await comoDueno(tx);
  await vaciarColumnasNuevas(tx, {
    orden: [e.ordenConDistritoId, e.ordenSinDistritoId],
    zonaDistrito: [e.zonaDistritoId],
    distritoZonaEspecial: [e.distritoZonaEspecialId],
    cierreDetail: [e.cierreDetailConDistritoId, e.cierreDetailSinDistritoId],
  });
  return e;
}

/** Un cierre nuevo de una orden nueva del escenario, creado como lo crea la app (sin snapshot). */
async function cierreDetailNuevo(tx: TxDeTest, e: EscenarioGeo43): Promise<string> {
  const ordenId = await crearOrdenGeo43(tx, e, { distritoId: e.geo.distritoId });
  const fila = await tx.cierreDetail.create({
    data: {
      cierreId: e.cierreId,
      ordenId,
      montoCobrar: null,
      cobraComision: false,
      zonaId: e.zonaId,
      tiendaId: e.tiendaId,
      esCentral: true,
      numGuia: null,
      numRemision: `SLT43-${ordenId.slice(0, 8)}`,
      destinatario: "Destinatario SLT-43",
      direccion: null,
      producto: "caja",
      tiendaNombre: "Tienda congelada",
      zonaNombre: "Zona congelada",
      provinciaNombre: "Región nueva congelada",
      cantonNombre: "Comuna nueva congelada",
      distritoNombre: "Barrio nuevo congelado",
    },
    select: { id: true },
  });
  return fila.id;
}

describeSiHayBase("SLT-43 — script de datos geo:backfill (R24–R31, R33, R40)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R24: tras migrar, las tres FK nuevas existen sin validar", async () => {
    const r = await revertida(base, (tx) => fksValidadas(tx));
    expect(r).toEqual({
      orden_nodo_geografico_id_fkey: false,
      zona_distrito_nodo_geografico_id_fkey: false,
      distrito_zona_especial_nodo_geografico_id_fkey: false,
    });
  });

  it("R24: --validar con filas pendientes sale con error y no valida; tras --aplicar las valida", async () => {
    const r = await revertida(base, async (tx) => {
      await escenarioPrevio(tx);
      const nombre = await nombreDeLaBase(tx);
      const conPendientes = await ejecutar(tx, args(["--validar", "--base", nombre]));
      const directo = await validar(tx);
      const fksConPendientes = await fksValidadas(tx);
      const aplicado = await ejecutar(tx, args(["--aplicar", "--base", nombre]));
      const trasAplicar = await ejecutar(tx, args(["--validar", "--base", nombre]));
      return { conPendientes, directo, fksConPendientes, aplicado, trasAplicar, fksFinal: await fksValidadas(tx) };
    });
    expect(r.conPendientes.codigoDeSalida).toBe(1);
    expect(r.directo.validadas).toEqual([]);
    expect(r.directo.pendientes.orden).toBeGreaterThanOrEqual(2);
    expect(Object.values(r.fksConPendientes)).toEqual([false, false, false]);
    expect(r.aplicado.codigoDeSalida).toBe(0);
    expect(r.trasAplicar.codigoDeSalida).toBe(0);
    expect(Object.values(r.fksFinal)).toEqual([true, true, true]);
  }, 60_000);

  it("R25: sin opciones informa las cifras y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const antes = await comprobar(tx);
      const e = await escenarioPrevio(tx);
      const despues = await comprobar(tx);
      const salida = await ejecutar(tx, args([]));
      const trasEjecutar = await comprobar(tx);
      return { e, antes, despues, salida, trasEjecutar };
    });
    expect(r.despues.totalOrdenes - r.antes.totalOrdenes).toBe(2);
    expect(r.despues.ordenesSinDistrito - r.antes.ordenesSinDistrito).toBe(1);
    expect(r.despues.ordenesConDistritoDeOtroCanton).toBe(r.antes.ordenesConDistritoDeOtroCanton);
    expect(r.despues.ordenesConCantonDeOtraProvincia).toBe(r.antes.ordenesConCantonDeOtraProvincia);
    expect(r.despues.pendientes.orden - r.antes.pendientes.orden).toBe(2);
    expect(r.despues.pendientes.zona_distrito - r.antes.pendientes.zona_distrito).toBe(1);
    expect(r.despues.pendientes.distrito_zona_especial - r.antes.pendientes.distrito_zona_especial).toBe(1);
    expect(r.despues.pendientes.cierre_detail - r.antes.pendientes.cierre_detail).toBe(2);
    expect(r.salida.codigoDeSalida).toBe(0);
    expect(r.salida.lineas).toContain(`ordenes total=${r.despues.totalOrdenes}`);
    expect(r.salida.lineas).toContain(`pendientes orden=${r.despues.pendientes.orden}`);
    expect(r.trasEjecutar).toEqual(r.despues);
  }, 60_000);

  it("R26: con una orden cuyo distrito es de otro cantón, o cuyo cantón es de otra provincia, --aplicar sale con error y no escribe", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioPrevio(tx);
      const nombre = await nombreDeLaBase(tx);
      // Otra rama de la geografía de `XA`: un cantón con su distrito y otra provincia con su cantón.
      const sufijo = randomUUID().slice(0, 8);
      const canton2 = await tx.canton.create({
        data: { nombre: `Comuna B ${sufijo}`, provinciaId: e.geo.provinciaId },
        select: { id: true },
      });
      const distrito2 = await tx.distrito.create({
        data: { nombre: `Barrio B ${sufijo}`, cantonId: canton2.id },
        select: { id: true },
      });
      const provincia2 = await tx.provincia.create({
        data: { nombre: `Región B ${sufijo}`, paisId: e.paisId },
        select: { id: true },
      });
      const canton3 = await tx.canton.create({
        data: { nombre: `Comuna C ${sufijo}`, provinciaId: provincia2.id },
        select: { id: true },
      });

      const distritoMal = await crearOrdenGeo43(tx, e, { distritoId: distrito2.id });
      const tras1 = await comprobar(tx);
      const conDistritoMal = await ejecutar(tx, args(["--aplicar", "--base", nombre]));
      const pendientes1 = await comprobar(tx);

      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = NULL, canton_id = $2 WHERE id = $1`, distritoMal, e.geo.cantonId);
      await crearOrdenGeo43(tx, e, { cantonId: canton3.id, distritoId: null });
      const tras2 = await comprobar(tx);
      const conCantonMal = await aplicar(tx);
      const pendientes2 = await comprobar(tx);
      const escenario = await nodos(tx, "orden", [e.ordenConDistritoId, e.ordenSinDistritoId]);
      return { tras1, conDistritoMal, pendientes1, tras2, conCantonMal, pendientes2, escenario };
    });
    expect(r.tras1.ordenesConDistritoDeOtroCanton).toBeGreaterThanOrEqual(1);
    expect(r.conDistritoMal.codigoDeSalida).toBe(1);
    expect(r.pendientes1.pendientes).toEqual(r.tras1.pendientes);

    expect(r.tras2.ordenesConCantonDeOtraProvincia).toBeGreaterThanOrEqual(1);
    expect(r.conCantonMal.rechazado).toBe(true);
    expect(r.conCantonMal.lotes).toBe(0);
    expect(Object.values(r.conCantonMal.escritas)).toEqual([0, 0, 0, 0]);
    expect(r.pendientes2.pendientes).toEqual(r.tras2.pendientes);
    expect(Object.values(r.escenario)).toEqual([null, null]);
  }, 60_000);

  it("R27, R28: lotes de 2 sobre 7 órdenes, corte tras el primer lote, relanzar sigue y con todo lleno escribe 0", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo43(tx);
      await comoDueno(tx);
      const extra: string[] = [];
      for (let i = 0; i < 5; i++) {
        extra.push(await crearOrdenGeo43(tx, e, { distritoId: i % 2 === 0 ? e.geo.otroDistritoId : null }));
      }
      const ids = [e.ordenConDistritoId, e.ordenSinDistritoId, ...extra];
      await vaciarColumnasNuevas(tx, { orden: ids });
      const pendientesAntes = (await comprobar(tx)).pendientes.orden;

      // Corte simulado: un solo lote y se deja de ejecutar.
      const primero = await aplicarLote(tx, "orden", { lote: 2 });
      const llenasTrasCorte = Object.entries(await nodos(tx, "orden", ids))
        .filter(([, n]) => n !== null)
        .map(([id]) => id);
      const ctidAntes = await ctids(tx, "orden", llenasTrasCorte);

      const tamanos: number[] = [];
      const relanzado = await aplicar(tx, { tabla: "orden", lote: 2, alTerminarLote: (_, l) => tamanos.push(l.leidas) });
      const ctidDespues = await ctids(tx, "orden", llenasTrasCorte);
      const finales = await nodos(tx, "orden", ids);
      const esperados = await tx.$queryRawUnsafe<{ id: string; esperado: string }[]>(
        `SELECT id, COALESCE(distrito_id, canton_id) AS esperado FROM orden WHERE id = ANY($1::text[])`,
        ids,
      );
      // Las demás tablas (los cierres del escenario nacen sin snapshot) y, ya con todo lleno, otra vez.
      await aplicar(tx, { lote: 2 });
      const otraVez = await aplicar(tx, { lote: 2 });
      return { pendientesAntes, primero, llenasTrasCorte, ctidAntes, ctidDespues, relanzado, tamanos, finales, esperados, otraVez };
    });
    expect(r.pendientesAntes).toBeGreaterThanOrEqual(7);
    expect(r.primero).toMatchObject({ leidas: 2, escritas: 2 });
    expect(r.relanzado.rechazado).toBe(false);
    expect(r.relanzado.escritas.orden).toBe(r.pendientesAntes - 2);
    expect(r.tamanos.every((n) => n <= 2)).toBe(true);
    expect(r.tamanos.reduce((a, b) => a + b, 0)).toBe(r.pendientesAntes - 2);
    // Lo ya lleno no se reescribe (sin nueva versión de la fila).
    expect(r.ctidDespues).toEqual(r.ctidAntes);
    expect(r.finales).toEqual(Object.fromEntries(r.esperados.map((f) => [f.id, f.esperado])));
    expect(r.otraVez.lotes).toBe(0);
    expect(Object.values(r.otraVez.escritas)).toEqual([0, 0, 0, 0]);
  }, 60_000);

  it("R27: llena las zonas con su distrito y, sin --lote, el lote es de 1000", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioPrevio(tx);
      const res = await aplicar(tx);
      return {
        e,
        res,
        zona: await nodos(tx, "zona_distrito", [e.zonaDistritoId]),
        especial: await nodos(tx, "distrito_zona_especial", [e.distritoZonaEspecialId]),
      };
    });
    expect(leerArgumentos([])?.lote).toBe(1000);
    expect(LOTE_POR_DEFECTO).toBe(1000);
    expect(r.res.escritas.zona_distrito).toBeGreaterThanOrEqual(1);
    expect(r.res.escritas.distrito_zona_especial).toBeGreaterThanOrEqual(1);
    expect(r.zona[r.e.zonaDistritoId]).toBe(r.e.geo.distritoId);
    expect(r.especial[r.e.distritoZonaEspecialId]).toBe(r.e.geo.otroDistritoId);
  }, 60_000);

  it("R29, R30: el resto de columnas de orden (updated_at incluido) y los cargos de plataforma quedan iguales", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioPrevio(tx);
      const ids = [e.ordenConDistritoId, e.ordenSinDistritoId];
      const filas = () =>
        tx.$queryRawUnsafe<{ id: string; fila: Record<string, unknown> }[]>(
          `SELECT id, to_jsonb(o) - 'nodo_geografico_id' AS fila FROM orden o WHERE id = ANY($1::text[]) ORDER BY id`,
          ids,
        );
      const cargos = () =>
        tx.$queryRawUnsafe<{ fila: Record<string, unknown> }[]>(
          `SELECT to_jsonb(m) AS fila FROM cobro_plataforma_movimiento m ORDER BY id`,
        );
      const ordenesAntes = await filas();
      const cargosAntes = await cargos();
      const res = await aplicar(tx);
      return { res, ordenesAntes, ordenesDespues: await filas(), cargosAntes, cargosDespues: await cargos(), nodos: await nodos(tx, "orden", ids) };
    });
    expect(r.res.escritas.orden).toBeGreaterThanOrEqual(2);
    expect(Object.values(r.nodos).every((n) => n !== null)).toBe(true);
    expect(r.ordenesDespues).toEqual(r.ordenesAntes);
    expect(r.ordenesDespues.every((f) => "updated_at" in f.fila)).toBe(true);
    expect(r.cargosDespues).toEqual(r.cargosAntes);
  }, 60_000);

  it("R31: snapshot con y sin distrito, nombres congelados aunque el distrito se renombre, ids de la orden", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioPrevio(tx);
      const ids = [e.cierreDetailConDistritoId, e.cierreDetailSinDistritoId];
      const antes = await snapshots(tx, ids);
      // Renombre posterior al cierre: la sincronía lo lleva al nodo; el snapshot no debe moverse.
      await tx.$executeRawUnsafe(`UPDATE distrito SET nombre = nombre || ' renombrado' WHERE id = $1`, e.geo.distritoId);
      await aplicar(tx);
      const tipos = await tx.$queryRawUnsafe<{ clave: string; nombre_singular: string }[]>(
        `SELECT clave, nombre_singular FROM tipo_nivel_geografico WHERE pais_id = $1`,
        e.paisId,
      );
      const [nodoDistrito] = await tx.$queryRawUnsafe<{ nombre: string }[]>(
        `SELECT nombre FROM nodo_geografico WHERE id = $1`,
        e.geo.distritoId,
      );
      return { e, antes, despues: await snapshots(tx, ids), tipos, nodoDistrito };
    });
    const tipo = (clave: string) => r.tipos.find((t) => t.clave === clave)?.nombre_singular;
    const con = r.despues[r.e.cierreDetailConDistritoId];
    const sin = r.despues[r.e.cierreDetailSinDistritoId];
    const conAntes = r.antes[r.e.cierreDetailConDistritoId];
    const sinAntes = r.antes[r.e.cierreDetailSinDistritoId];

    expect(conAntes.snap).toBeNull();
    expect(con.snap).toEqual({
      v: 1,
      niveles: [
        { profundidad: 1, tipo: tipo("nivel_1"), nombre: conAntes.provincia_nombre, id: r.e.geo.provinciaId },
        { profundidad: 2, tipo: tipo("nivel_2"), nombre: conAntes.canton_nombre, id: r.e.geo.cantonId },
        { profundidad: 3, tipo: tipo("nivel_3"), nombre: conAntes.distrito_nombre, id: r.e.geo.distritoId },
      ],
    });
    expect(sin.snap).toEqual({
      v: 1,
      niveles: [
        { profundidad: 1, tipo: tipo("nivel_1"), nombre: sinAntes.provincia_nombre, id: r.e.geo.provinciaId },
        { profundidad: 2, tipo: tipo("nivel_2"), nombre: sinAntes.canton_nombre, id: r.e.geo.cantonId },
      ],
    });
    // El nombre es la foto y el id solo enlaza: el nodo tiene el nombre nuevo, el snapshot el congelado.
    expect(r.nodoDistrito.nombre).toMatch(/ renombrado$/);
    expect(con.snap?.niveles[2].nombre).not.toBe(r.nodoDistrito.nombre);
    // Las tres columnas congeladas, sin cambio.
    for (const id of [r.e.cierreDetailConDistritoId, r.e.cierreDetailSinDistritoId]) {
      const congeladas = (f: (typeof r.antes)[string]) => [f.provincia_nombre, f.canton_nombre, f.distrito_nombre];
      expect(congeladas(r.despues[id])).toEqual(congeladas(r.antes[id]));
    }
  }, 60_000);

  it("R33: --aplicar y --validar sin --base, o con otro nombre, no escriben", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await escenarioPrevio(tx);
      const nombre = await nombreDeLaBase(tx);
      const antes = await comprobar(tx);
      const salidas = [
        await ejecutar(tx, args(["--aplicar"])),
        await ejecutar(tx, args(["--aplicar", "--base", `${nombre}_otra`])),
        await ejecutar(tx, args(["--validar"])),
        await ejecutar(tx, args(["--validar", "--base", "postgres"])),
      ];
      return {
        e,
        salidas,
        antes,
        despues: await comprobar(tx),
        fks: await fksValidadas(tx),
        orden: await nodos(tx, "orden", [e.ordenConDistritoId]),
      };
    });
    expect(r.salidas.map((s) => s.codigoDeSalida)).toEqual([1, 1, 1, 1]);
    expect(r.salidas.every((s) => s.lineas.some((l) => l.startsWith("Rechazado: --base")))).toBe(true);
    expect(r.despues).toEqual(r.antes);
    expect(Object.values(r.fks)).toEqual([false, false, false]);
    expect(r.orden[r.e.ordenConDistritoId]).toBeNull();
  }, 60_000);

  it("R40: no hay trigger sobre cierre_detail que llene el snapshot; un cierre nuevo nace NULL y relanzar lo llena sin tocar los demás", async () => {
    const r = await revertida(base, async (tx) => {
      const [triggers] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n
           FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = 'cierre_detail'::regclass AND NOT t.tgisinternal
            AND (t.tgname ~* 'nodo|ubicacion|snapshot|geo' OR p.prosrc ILIKE '%ubicacion_snapshot%')`,
      );
      const e = await escenarioPrevio(tx);
      await aplicar(tx);
      const viejas = [e.cierreDetailConDistritoId, e.cierreDetailSinDistritoId];
      const ctidViejas = await ctids(tx, "cierre_detail", viejas);
      const nueva = await cierreDetailNuevo(tx, e);
      const recienCreada = (await snapshots(tx, [nueva]))[nueva].snap;
      const relanzado = await aplicar(tx);
      return {
        e,
        triggers: triggers.n,
        recienCreada,
        relanzado,
        nueva: (await snapshots(tx, [nueva]))[nueva].snap,
        ctidViejas,
        ctidViejasDespues: await ctids(tx, "cierre_detail", viejas),
      };
    });
    expect(r.triggers).toBe(0);
    expect(r.recienCreada).toBeNull();
    expect(r.relanzado.escritas.cierre_detail).toBe(1);
    expect(r.nueva?.niveles.map((n) => [n.nombre, n.id])).toEqual([
      ["Región nueva congelada", r.e.geo.provinciaId],
      ["Comuna nueva congelada", r.e.geo.cantonId],
      ["Barrio nuevo congelado", r.e.geo.distritoId],
    ]);
    expect(r.ctidViejasDespues).toEqual(r.ctidViejas);
  }, 60_000);
});
