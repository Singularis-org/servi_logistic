import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { crearEscenarioGeo43, type EscenarioGeo43 } from "./_fixtures/geo-43";
import { crearBasePropia43, type BasePropia43 } from "./_fixtures/base-propia-43";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, type TxDeTest } from "./_postgres-real";
import { crearNodoDeNivel } from "@/tests/fabricas/paises";

// SLT-43 (T4.1; design §2.4) — `nodo_geografico_id` de `orden`, `zona_distrito` y
// `distrito_zona_especial`, contra Postgres real.
//   · R20: la orden apunta a `COALESCE(distrito_id, canton_id)` al crearla y al corregirla; un nodo puesto
//     a mano se pisa.
//   · R21: las dos tablas de zona apuntan a su `distrito_id`, igual.
//   · Lo que estos triggers pueden tumbar (regla 6 de la épica), dejado a la vista: la orden sin cantón
//     falla como antes (NOT NULL, no el trigger); una orden previa al script (nodo NULL) sigue
//     escribiéndose. (SLT-48 T5.1 retiró «borrar un distrito con orden no falla» y «la FK nueva solo
//     rechaza un distrito sin nodo»: el borrado por la tabla vieja es `SL048` y esa FK ya no existe,
//     SLT-48 R2 y R4.)
//   · `cierre_detail` no tiene trigger (R40) y las tres FK nacen sin validar (R24).
//
// Todo dentro de una transacción del dueño que siempre se revierte, sobre el escenario `XA` de
// `geo-43.ts`. Los triggers que se apagan se apagan dentro de esa transacción; el último caso
// comprueba que quedan activos. BASE PROPIA (`slt43_oz_…`, design §7): el `DISABLE TRIGGER` toma
// AccessExclusiveLock sobre `orden` y `distrito`, y en la base compartida bloquearía a otros archivos.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let propia: BasePropia43;
let base: PrismaClient;

async function nodoDe(tx: TxDeTest, tabla: "orden" | "zona_distrito" | "distrito_zona_especial", id: string) {
  const [fila] = await tx.$queryRawUnsafe<{ nodo_geografico_id: string | null }[]>(
    `SELECT nodo_geografico_id FROM ${tabla} WHERE id = $1`,
    id,
  );
  return fila?.nodo_geografico_id;
}

function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo43) => Promise<T>): Promise<T> {
  return revertida(base, async (tx) => {
    const e = await crearEscenarioGeo43(tx);
    await comoDueno(tx);
    return fn(tx, e);
  });
}

/** Un cantón nuevo bajo la provincia del escenario, con su nodo (lo crea la sincronía). */
async function otroCanton(tx: TxDeTest, e: EscenarioGeo43): Promise<string> {
  const c = await crearNodoDeNivel(tx, 2, { nombre: `Comuna otra ${randomUUID().slice(0, 8)}`, padreId: e.geo.provinciaId });
  return c.id;
}

// SLT-48 R5: `distrito_sincroniza_nodo_geografico` (la sincronia vieja → nodo) ya no existe; los otros
// tres siguen.
const TRIGGERS_SLT43 = [
  "orden_nodo_geografico",
  "zona_distrito_nodo_geografico",
  "distrito_zona_especial_nodo_geografico",
];

describeSiHayBase("SLT-43 — nodo de la orden y de las zonas (R20, R21)", () => {
  beforeAll(async () => {
    propia = await crearBasePropia43("oz");
    base = propia.prisma;
  }, 600_000);
  afterAll(async () => {
    await propia?.cerrar();
  }, 60_000);

  it("R20: al crear, la orden con distrito apunta al distrito y la que no tiene, al cantón", async () => {
    const r = await conEscenario(async (tx, e) => ({
      e,
      con: await nodoDe(tx, "orden", e.ordenConDistritoId),
      sin: await nodoDe(tx, "orden", e.ordenSinDistritoId),
    }));
    expect(r.con).toBe(r.e.geo.distritoId);
    expect(r.sin).toBe(r.e.geo.cantonId);
  });

  it("R20: corregir el distrito, quitarlo o cambiar de cantón mueve el nodo; otra columna no lo toca", async () => {
    const r = await conEscenario(async (tx, e) => {
      const id = e.ordenConDistritoId;
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = $2 WHERE id = $1`, id, e.geo.otroDistritoId);
      const otroDistrito = await nodoDe(tx, "orden", id);
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = NULL WHERE id = $1`, id);
      const sinDistrito = await nodoDe(tx, "orden", id);
      const cantonNuevo = await otroCanton(tx, e);
      await tx.$executeRawUnsafe(`UPDATE orden SET canton_id = $2 WHERE id = $1`, id, cantonNuevo);
      const otroCantonNodo = await nodoDe(tx, "orden", id);
      await tx.$executeRawUnsafe(`UPDATE orden SET producto = 'otra caja' WHERE id = $1`, id);
      const trasOtraColumna = await nodoDe(tx, "orden", id);
      return { e, otroDistrito, sinDistrito, cantonNuevo, otroCantonNodo, trasOtraColumna };
    });
    expect(r.otroDistrito).toBe(r.e.geo.otroDistritoId);
    expect(r.sinDistrito).toBe(r.e.geo.cantonId);
    expect(r.otroCantonNodo).toBe(r.cantonNuevo);
    expect(r.trasOtraColumna).toBe(r.cantonNuevo);
  });

  // SLT-48 R9: «SI la orden trae nodo, la base NO DEBE cambiarlo». Un nodo puesto a mano (sin tocar las
  // FK) se conserva, al crear y al actualizar; antes se pisaba con el de las FK.
  it("R20: un nodo puesto a mano, al crear o al actualizar, se conserva (SLT-48 R9; antes se pisaba con el de las FK)", async () => {
    const r = await conEscenario(async (tx, e) => {
      await tx.$executeRawUnsafe(`UPDATE orden SET nodo_geografico_id = $2 WHERE id = $1`, e.ordenConDistritoId, e.geo.provinciaId);
      const trasUpdate = await nodoDe(tx, "orden", e.ordenConDistritoId);
      const nueva = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
             provincia_id, canton_id, distrito_id, producto, nodo_geografico_id, created_at, updated_at)
           SELECT $1, $2, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
                  provincia_id, canton_id, NULL, producto, $3, now(), now()
             FROM orden WHERE id = $4`,
        nueva,
        `SLT43-${nueva.slice(0, 8)}`,
        e.geo.provinciaId,
        e.ordenConDistritoId,
      );
      const trasInsert = await nodoDe(tx, "orden", nueva);
      return { e, trasUpdate, trasInsert };
    });
    expect(r.trasUpdate).toBe(r.e.geo.provinciaId);
    expect(r.trasInsert).toBe(r.e.geo.provinciaId);
  });

  // SLT-48 R4: la migracion quita el NOT NULL de `orden.canton_id` (una orden nueva solo guarda su nodo).
  // Una orden de SQL a mano sin canton ni nodo entra, y el trigger no le inventa un nodo.
  it("orden sin cantón: entra (SLT-48 R4: `canton_id` es nullable) y el trigger no le inventa un nodo", async () => {
    const r = await conEscenario(async (tx, e) => {
      const nueva = randomUUID();
      const estado = await intentar(
        tx,
        `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
             provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
           SELECT $1, $2, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
                  provincia_id, NULL, NULL, producto, now(), now()
             FROM orden WHERE id = $3`,
        nueva,
        `SLT43-${nueva.slice(0, 8)}`,
        e.ordenSinDistritoId,
      );
      const [col] = await tx.$queryRawUnsafe<{ is_nullable: string }[]>(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orden' AND column_name = 'canton_id'`,
      );
      return { estado, nullable: col?.is_nullable, nodo: estado === null ? await nodoDe(tx, "orden", nueva) : "sin fila" };
    });
    expect(r.estado).toBeNull();
    expect(r.nullable).toBe("YES");
    expect(r.nodo).toBeNull();
  });

  it("una orden previa al script (nodo NULL) sigue escribiéndose y solo gana nodo si cambia su geografía", async () => {
    const r = await conEscenario(async (tx, e) => {
      const id = e.ordenConDistritoId;
      // Simula una fila anterior a la migración: el trigger apagado SOLO para dejarla NULL.
      await tx.$executeRawUnsafe(`ALTER TABLE orden DISABLE TRIGGER orden_nodo_geografico`);
      await tx.$executeRawUnsafe(`UPDATE orden SET nodo_geografico_id = NULL WHERE id = $1`, id);
      await tx.$executeRawUnsafe(`ALTER TABLE orden ENABLE TRIGGER orden_nodo_geografico`);
      const previa = await nodoDe(tx, "orden", id);
      const otraColumna = await intentar(tx, `UPDATE orden SET producto = 'otra caja' WHERE id = $1`, id);
      const trasOtraColumna = await nodoDe(tx, "orden", id);
      await tx.$executeRawUnsafe(`UPDATE orden SET distrito_id = distrito_id WHERE id = $1`, id);
      const trasGeografia = await nodoDe(tx, "orden", id);
      return { e, previa, otraColumna, trasOtraColumna, trasGeografia };
    });
    expect(r.previa).toBeNull();
    expect(r.otraColumna).toBeNull();
    expect(r.trasOtraColumna).toBeNull();
    expect(r.trasGeografia).toBe(r.e.geo.distritoId);
  });

  it("R21: `zona_distrito` y `distrito_zona_especial` apuntan a su distrito al crear y al cambiarlo; a mano se pisa", async () => {
    const r = await conEscenario(async (tx, e) => {
      const alta = {
        zona: await nodoDe(tx, "zona_distrito", e.zonaDistritoId),
        especial: await nodoDe(tx, "distrito_zona_especial", e.distritoZonaEspecialId),
      };
      await tx.$executeRawUnsafe(`UPDATE zona_distrito SET distrito_id = $2 WHERE id = $1`, e.zonaDistritoId, e.geo.otroDistritoId);
      await tx.$executeRawUnsafe(
        `UPDATE distrito_zona_especial SET distrito_id = $2 WHERE id = $1`,
        e.distritoZonaEspecialId,
        e.geo.distritoId,
      );
      const cambio = {
        zona: await nodoDe(tx, "zona_distrito", e.zonaDistritoId),
        especial: await nodoDe(tx, "distrito_zona_especial", e.distritoZonaEspecialId),
      };
      await tx.$executeRawUnsafe(`UPDATE zona_distrito SET nodo_geografico_id = $2 WHERE id = $1`, e.zonaDistritoId, e.geo.cantonId);
      await tx.$executeRawUnsafe(
        `UPDATE distrito_zona_especial SET nodo_geografico_id = $2 WHERE id = $1`,
        e.distritoZonaEspecialId,
        e.geo.cantonId,
      );
      const aMano = {
        zona: await nodoDe(tx, "zona_distrito", e.zonaDistritoId),
        especial: await nodoDe(tx, "distrito_zona_especial", e.distritoZonaEspecialId),
      };
      return { e, alta, cambio, aMano };
    });
    const { distritoId, otroDistritoId } = r.e.geo;
    expect(r.alta).toEqual({ zona: distritoId, especial: otroDistritoId });
    expect(r.cambio).toEqual({ zona: otroDistritoId, especial: distritoId });
    expect(r.aMano).toEqual({ zona: otroDistritoId, especial: distritoId });
  });

  it("R40/R24: `cierre_detail` nace con `ubicacion_snapshot` NULL y sin trigger; las tres FK nuevas, sin validar", async () => {
    const r = await conEscenario(async (tx, e) => {
      const detalles = await tx.cierreDetail.findMany({
        where: { id: { in: [e.cierreDetailConDistritoId, e.cierreDetailSinDistritoId] } },
        select: { ubicacionSnapshot: true },
      });
      const triggers = await tx.$queryRawUnsafe<{ tgname: string }[]>(
        `SELECT tgname FROM pg_trigger WHERE tgrelid = 'cierre_detail'::regclass AND NOT tgisinternal
            AND (tgname ILIKE '%nodo%' OR tgname ILIKE '%ubicacion%')`,
      );
      const fks = await tx.$queryRawUnsafe<{ conname: string; convalidated: boolean }[]>(
        `SELECT conname, convalidated FROM pg_constraint
          WHERE conname IN ('orden_nodo_geografico_id_fkey', 'zona_distrito_nodo_geografico_id_fkey',
                            'distrito_zona_especial_nodo_geografico_id_fkey')
            AND connamespace = 'public'::regnamespace
          ORDER BY conname`,
      );
      return { detalles, triggers, fks };
    });
    expect(r.detalles).toEqual([{ ubicacionSnapshot: null }, { ubicacionSnapshot: null }]);
    expect(r.triggers).toEqual([]);
    expect(r.fks).toEqual([
      { conname: "distrito_zona_especial_nodo_geografico_id_fkey", convalidated: false },
      { conname: "orden_nodo_geografico_id_fkey", convalidated: false },
      { conname: "zona_distrito_nodo_geografico_id_fkey", convalidated: false },
    ]);
  });

  it("los triggers que los casos apagan siguen activos tras revertir", async () => {
    const filas = await base.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
      `SELECT t.tgname, t.tgenabled::text AS tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = ANY($1::text[]) AND n.nspname = 'public' ORDER BY t.tgname`,
      TRIGGERS_SLT43,
    );
    expect(filas).toEqual([...TRIGGERS_SLT43].sort().map((tgname) => ({ tgname, tgenabled: "O" })));
  });
});
