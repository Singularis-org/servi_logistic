import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { planificarDivision } from "@/lib/utils/division-csv";
import { crearPaisDePrueba } from "@/tests/fabricas/paises";
import { crearEscenarioGeo43, tiposDeNivel } from "./_fixtures/geo-43";
import { comoDueno, errorEnSavepoint, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-43 (T3.1; design §2.3) — la sincronía de la geografía vieja al nodo, contra Postgres real.
//   · R15: el alta de SL-20 (`GeoRepository.crear`) y la carga CSV (`importarDivision`) crean el nodo
//     con el mismo id y los datos de R13.
//   · R16: renombre (`renombrar`), retiro y reactivación (`cambiarActivacion`), código (la carga
//     completa códigos), cambio de padre y cambio de país se reflejan en el nodo.
//   · R17: el borrado físico borra el nodo, también en cascada desde las zonas y la orden.
//   · R18: `canton.pais_id` sigue saliendo del padre y la sincronía no escribe historial.
//   · Lo que la sincronía puede tumbar: un homónimo normalizado que hoy entra por el único literal
//     ahora falla entero con 23505 (el `conflict` de SL-20), sin dejar la fila vieja.
//
// Los repositorios corren sobre `clienteConSavepoint`, como en las suites de SL-20, dentro de una
// transacción del dueño (el camino del superadmin) que siempre se revierte. Actor `null`: el
// historial de plataforma lo congela como sistema, sin depender de un usuario sembrado.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface FilaNodo {
  id: string;
  pais_id: string;
  tipo_id: string;
  padre_id: string | null;
  profundidad: number;
  nombre: string;
  nombre_normalizado: string;
  codigo_oficial: string | null;
  activo: boolean;
  ruta: string[];
}

async function nodo(tx: TxDeTest, id: string): Promise<FilaNodo | undefined> {
  const filas = await tx.$queryRawUnsafe<FilaNodo[]>(
    `SELECT id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo, ruta
       FROM nodo_geografico WHERE id = $1`,
    id,
  );
  return filas[0];
}

async function contarHistorial(tx: TxDeTest): Promise<{ accion: number; plataforma: number }> {
  const [fila] = await tx.$queryRawUnsafe<{ accion: number; plataforma: number }[]>(
    `SELECT (SELECT count(*) FROM historial_accion)::int AS accion,
            (SELECT count(*) FROM historial_plataforma)::int AS plataforma`,
  );
  return fila;
}

const sufijo = () => randomUUID().replace(/-/g, "").slice(0, 8);

function conGeo<T>(fn: (ctx: { tx: TxDeTest; geo: GeoRepository }) => Promise<T>): Promise<T> {
  return revertida(base, async (tx) => {
    await crearPaisDePrueba(tx, "XA");
    return fn({ tx, geo: new GeoRepository(clienteConSavepoint(tx)) });
  });
}

describeSiHayBase("SLT-43 — sincronía de la geografía vieja al nodo (R15–R18)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R15: el alta de SL-20 crea el nodo de cada nivel con el mismo id, país, tipo, padre, código y ruta", async () => {
    const r = await conGeo(async ({ tx, geo }) => {
      const s = sufijo();
      const t = await tiposDeNivel(tx, "XA");
      const p = await geo.crear("provincia", `Región Ñuble ${s}`, null, { paisId: "XA", codigo: "7" }, null);
      const c = await geo.crear("canton", `Comuna ${s}`, p, { paisId: "XA", codigo: "7" }, null);
      const d = await geo.crear("distrito", `Barrio ${s}`, c, { paisId: "XA", codigo: null }, null);
      return { t, s, p, c, d, np: await nodo(tx, p), nc: await nodo(tx, c), nd: await nodo(tx, d) };
    });
    expect(r.np).toEqual({
      id: r.p, pais_id: "XA", tipo_id: r.t.nivel1, padre_id: null, profundidad: 1,
      nombre: `Región Ñuble ${r.s}`, nombre_normalizado: `region nuble ${r.s}`, codigo_oficial: "7", activo: true,
      ruta: [r.p],
    });
    // Provincia y cantón con el mismo código «7»: conviven, como en SL-20 (único por país y tipo).
    expect(r.nc).toMatchObject({ id: r.c, pais_id: "XA", tipo_id: r.t.nivel2, padre_id: r.p, profundidad: 2, codigo_oficial: "7", ruta: [r.p, r.c] });
    expect(r.nd).toMatchObject({ id: r.d, pais_id: "XA", tipo_id: r.t.nivel3, padre_id: r.c, profundidad: 3, codigo_oficial: null, activo: true, ruta: [r.p, r.c, r.d] });
  });

  it("R15, R16: la carga CSV (`importarDivision`) crea los nodos de sus altas y les pasa los códigos que completa", async () => {
    const r = await conGeo(async ({ tx, geo }) => {
      // Un existente sin código, que la carga completa (R26 de SL-20): el UPDATE llega al nodo.
      const existente = await tx.provincia.create({ data: { nombre: "Región Norte", paisId: "XA" }, select: { id: true } });
      const division = await geo.leerDivisionDePais("XA");
      const plan = planificarDivision(
        [
          { linea: 2, nivel1: "Región Norte", codigoNivel1: "RN", nivel2: "Comuna Uno", codigoNivel2: "RN-1", nivel3: "Barrio A", codigoNivel3: "RN-1-A" },
          { linea: 3, nivel1: "Región Sur", codigoNivel1: "RS", nivel2: "Comuna Dos", codigoNivel2: "", nivel3: "", codigoNivel3: "" },
        ],
        division!.arbol,
        division!.regla,
      );
      if (!("plan" in plan)) throw new Error("el plan de prueba tenia errores");
      const resumen = await geo.importarDivision("XA", plan.plan, null);

      const nodos = await tx.$queryRawUnsafe<{ nombre: string; profundidad: number; codigo_oficial: string | null; padre: string | null }[]>(
        `SELECT n.nombre, n.profundidad, n.codigo_oficial, p.nombre AS padre
           FROM nodo_geografico n LEFT JOIN nodo_geografico p ON p.id = n.padre_id
          WHERE n.pais_id = 'XA' ORDER BY n.profundidad, n.nombre`,
      );
      // Mismos ids que la geografía vieja, nivel por nivel.
      const [faltan] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM (
           SELECT id FROM provincia WHERE pais_id = 'XA' UNION ALL
           SELECT id FROM canton WHERE pais_id = 'XA' UNION ALL
           SELECT id FROM distrito WHERE pais_id = 'XA') v
          WHERE NOT EXISTS (SELECT 1 FROM nodo_geografico n WHERE n.id = v.id)`,
      );
      return { resumen, nodos, faltan: faltan.n, existente: (await nodo(tx, existente.id))?.codigo_oficial };
    });
    expect(r.resumen).toMatchObject({ creados: { provincia: 1, canton: 2, distrito: 1 }, codigosCompletados: 1 });
    expect(r.faltan).toBe(0);
    expect(r.existente).toBe("RN");
    expect(r.nodos).toEqual([
      { nombre: "Región Norte", profundidad: 1, codigo_oficial: "RN", padre: null },
      { nombre: "Región Sur", profundidad: 1, codigo_oficial: "RS", padre: null },
      { nombre: "Comuna Dos", profundidad: 2, codigo_oficial: null, padre: "Región Sur" },
      { nombre: "Comuna Uno", profundidad: 2, codigo_oficial: "RN-1", padre: "Región Norte" },
      { nombre: "Barrio A", profundidad: 3, codigo_oficial: "RN-1-A", padre: "Comuna Uno" },
    ]);
  });

  it("R16: `renombrar` y `cambiarActivacion` de SL-20/374 llegan al nodo (nombre, normalizado, retiro y reactivación)", async () => {
    const r = await conGeo(async ({ tx, geo }) => {
      const s = sufijo();
      const p = await geo.crear("provincia", `Región ${s}`, null, { paisId: "XA", codigo: null }, null);
      const c = await geo.crear("canton", `Comuna ${s}`, p, { paisId: "XA", codigo: null }, null);

      const renombrado = await geo.renombrar("canton", c, `Comuna Peñalolén ${s}`, null);
      const trasRenombrar = await nodo(tx, c);
      const retiro = await geo.cambiarActivacion("provincia", p, false, null);
      const trasRetirar = (await nodo(tx, p))?.activo;
      const hijoTrasRetirar = (await nodo(tx, c))?.activo;
      const reactivacion = await geo.cambiarActivacion("provincia", p, true, null);
      const trasReactivar = (await nodo(tx, p))?.activo;
      return { s, renombrado, trasRenombrar, retiro, trasRetirar, hijoTrasRetirar, reactivacion, trasReactivar };
    });
    expect(r.renombrado).toBe("renombrado");
    expect(r.trasRenombrar).toMatchObject({ nombre: `Comuna Peñalolén ${r.s}`, nombre_normalizado: `comuna penalolen ${r.s}` });
    expect([r.retiro, r.trasRetirar, r.reactivacion, r.trasReactivar]).toEqual(["cambiado", false, "cambiado", true]);
    // El flag es de la fila, como en 374: retirar la provincia no toca el nodo del cantón.
    expect(r.hijoTrasRetirar).toBe(true);
  });

  it("R16: cambio de padre (con la ruta de los descendientes), de código y de país se reflejan en el nodo", async () => {
    const r = await conGeo(async ({ tx }) => {
      await crearPaisDePrueba(tx, "XB");
      const xb = await tiposDeNivel(tx, "XB");
      const s = sufijo();
      const p1 = (await tx.provincia.create({ data: { nombre: `Uno ${s}`, paisId: "XA" }, select: { id: true } })).id;
      const p2 = (await tx.provincia.create({ data: { nombre: `Dos ${s}`, paisId: "XA" }, select: { id: true } })).id;
      const c = (await tx.canton.create({ data: { nombre: `Comuna ${s}`, provinciaId: p1 }, select: { id: true } })).id;
      const d = (await tx.distrito.create({ data: { nombre: `Barrio ${s}`, cantonId: c }, select: { id: true } })).id;

      await tx.canton.update({ where: { id: c }, data: { provinciaId: p2 } });
      const cantonMovido = await nodo(tx, c);
      const distritoDelMovido = await nodo(tx, d);

      await tx.distrito.update({ where: { id: d }, data: { codigoDta: "B-9" } });
      const codigo = (await nodo(tx, d))?.codigo_oficial;

      // Una provincia sin hijos puede cambiar de país (con hijos lo impiden las FK de SL-20).
      await tx.provincia.update({ where: { id: p1 }, data: { paisId: "XB" } });
      const cambiada = await nodo(tx, p1);
      return { p1, p2, c, d, xb, cantonMovido, distritoDelMovido, codigo, cambiada };
    });
    expect(r.cantonMovido).toMatchObject({ padre_id: r.p2, ruta: [r.p2, r.c] });
    expect(r.distritoDelMovido?.ruta).toEqual([r.p2, r.c, r.d]);
    expect(r.codigo).toBe("B-9");
    expect(r.cambiada).toMatchObject({ pais_id: "XB", tipo_id: r.xb.nivel1, ruta: [r.p1] });
  });

  it("R16: un UPDATE que no cambia nada del nodo no lo reescribe", async () => {
    const r = await conGeo(async ({ tx }) => {
      const p = (await tx.provincia.create({ data: { nombre: `Quieta ${sufijo()}`, paisId: "XA" }, select: { id: true } })).id;
      const xmin = async () =>
        (await tx.$queryRawUnsafe<{ x: string }[]>(`SELECT xmin::text AS x FROM nodo_geografico WHERE id = $1`, p))[0].x;
      // Se fuerza otra subtransacción: un UPDATE del nodo dentro de ella cambiaría su xmin.
      await tx.$executeRawUnsafe(`SAVEPOINT quieta`);
      const antes = await xmin();
      await tx.$executeRawUnsafe(`UPDATE provincia SET nombre = nombre, activo = activo WHERE id = $1`, p);
      const despues = await xmin();
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT quieta`);
      // Contraprueba: con un cambio de verdad, el xmin sí cambia.
      await tx.$executeRawUnsafe(`SAVEPOINT movida`);
      await tx.$executeRawUnsafe(`UPDATE provincia SET nombre = nombre || ' bis' WHERE id = $1`, p);
      const conCambio = await xmin();
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT movida`);
      return { antes, despues, conCambio };
    });
    expect(r.despues).toBe(r.antes);
    expect(r.conCambio).not.toBe(r.antes);
  });

  it("R17: el borrado físico borra el nodo, también con zonas y una orden colgando del distrito", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo43(tx);
      await comoDueno(tx);
      const ids = [e.geo.provinciaId, e.geo.cantonId, e.geo.distritoId, e.geo.otroDistritoId];
      const antes = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM nodo_geografico WHERE id = ANY($1::text[])`, ids);

      // El distrito con zona y orden: sus filas de zona caen en cascada, la orden se queda sin distrito
      // (FK vieja SET NULL) y su nodo se va. Luego el resto, de abajo arriba como exige la FK vieja.
      await tx.$executeRawUnsafe(`DELETE FROM distrito WHERE id = $1`, e.geo.distritoId);
      const sinDistrito = await nodo(tx, e.geo.distritoId);
      const zonaDistrito = await tx.zonaDistrito.count({ where: { id: e.zonaDistritoId } });
      const orden = await tx.$queryRawUnsafe<{ distrito_id: string | null }[]>(`SELECT distrito_id FROM orden WHERE id = $1`, e.ordenConDistritoId);

      await tx.$executeRawUnsafe(`DELETE FROM distrito WHERE id = $1`, e.geo.otroDistritoId);
      const especial = await tx.distritoZonaEspecial.count({ where: { id: e.distritoZonaEspecialId } });
      // El cantón y la provincia tienen órdenes (FK vieja RESTRICT): se borran sin ellas.
      await tx.$executeRawUnsafe(`DELETE FROM cierre_detail WHERE cierre_id = $1`, e.cierreId);
      await tx.$executeRawUnsafe(`DELETE FROM orden WHERE id = ANY($1::text[])`, [e.ordenConDistritoId, e.ordenSinDistritoId]);
      await tx.$executeRawUnsafe(`DELETE FROM canton WHERE id = $1`, e.geo.cantonId);
      await tx.$executeRawUnsafe(`DELETE FROM provincia WHERE id = $1`, e.geo.provinciaId);
      const despues = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM nodo_geografico WHERE id = ANY($1::text[])`, ids);
      return { antes: antes[0].n, sinDistrito, zonaDistrito, orden: orden[0], especial, despues: despues[0].n };
    });
    expect(r).toEqual({ antes: 4, sinDistrito: undefined, zonaDistrito: 0, orden: { distrito_id: null }, especial: 0, despues: 0 });
  });

  it("R18: `canton.pais_id` sigue saliendo del padre y la sincronía no escribe historial", async () => {
    const r = await conGeo(async ({ tx }) => {
      const antes = await contarHistorial(tx);
      const s = sufijo();
      const p = (await tx.provincia.create({ data: { nombre: `Región ${s}`, paisId: "XA" }, select: { id: true } })).id;
      // El país que se manda se ignora: lo pisa `canton_pais_del_padre`, y el nodo nace con el del padre.
      const c = randomUUID();
      await tx.$executeRawUnsafe(`INSERT INTO canton (id, nombre, provincia_id, pais_id) VALUES ($1, $2, $3, 'CR')`, c, `Comuna ${s}`, p);
      const paisCanton = (await tx.canton.findUniqueOrThrow({ where: { id: c }, select: { paisId: true } })).paisId;
      const paisNodo = (await nodo(tx, c))?.pais_id;
      await tx.canton.update({ where: { id: c }, data: { nombre: `Comuna otra ${s}`, activo: false } });
      await tx.$executeRawUnsafe(`DELETE FROM canton WHERE id = $1`, c);
      return { antes, despues: await contarHistorial(tx), paisCanton, paisNodo };
    });
    expect(r.paisCanton).toBe("XA");
    expect(r.paisNodo).toBe("XA");
    expect(r.despues).toEqual(r.antes);
  });

  it("lo que la sincronía tumba: un homónimo normalizado que el único literal deja pasar falla entero con 23505", async () => {
    const r = await conGeo(async ({ tx, geo }) => {
      const s = sufijo();
      const p = await geo.crear("provincia", `Región ${s}`, null, { paisId: "XA", codigo: null }, null);
      await geo.crear("canton", `San Jose ${s}`, p, { paisId: "XA", codigo: null }, null);
      const historialAntes = await contarHistorial(tx);

      const error = await errorEnSavepoint(tx, () => geo.crear("canton", `San José ${s}`, p, { paisId: "XA", codigo: null }, null));
      const sql = await intentar(tx, `INSERT INTO canton (id, nombre, provincia_id) VALUES ($1, $2, $3)`, randomUUID(), `SAN JOSÉ ${s}`, p);
      const cantones = await tx.canton.count({ where: { provinciaId: p } });
      return {
        prisma: (error as { code?: string } | null)?.code,
        sql,
        cantones,
        historialAntes,
        historialDespues: await contarHistorial(tx),
      };
    });
    // P2002 es lo que la action de SL-20 traduce a `conflict`, igual que con los únicos viejos.
    expect(r.prisma).toBe("P2002");
    expect(r.sql).toBe("23505");
    // Ni la fila vieja ni el historial del alta: la escritura entera se deshace.
    expect(r.cantones).toBe(1);
    expect(r.historialDespues).toEqual(r.historialAntes);
  });
});
