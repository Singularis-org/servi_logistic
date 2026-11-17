import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { ubicacionSnapshotV1Schema } from "@/lib/types/ubicacion-snapshot";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo125, type EmpresaGeo125 } from "./_fixtures/geo-125";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-48 (T2.6; design §5; R27) — EL CIERRE NOMBRA Y CONGELA DESDE LA RUTA DEL NODO, NO DESDE LAS 3 FK.
//
// Sobre el fixture `geo-125` (tres ordenes con gestion sin cierre por empresa). Antes de cerrar:
//  - en CR, las 3 FK de las tres ordenes se vacian (el nodo intacto): son ordenes viejas leidas como
//    nuevas. El cierre debe dar los mismos nombres y el mismo snapshot que da con las FK (R27, «igual
//    que hoy»), que es lo que prueba `geo-125-cierre-snapshot` sobre las ordenes con FK;
//  - en XA, la orden con distrito pasa a un sector de nivel 4 (FK en NULL). Sus 3 columnas de nombre son
//    los niveles 1, 2 y 3 de la ruta y el snapshot llega al nivel 4.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function cerrar(tx: TxDeTest, e: EmpresaGeo125): Promise<string> {
  await comoApp(tx, e.empresaId);
  try {
    const cierreId = await conEmpresa(e.empresaId, () => {
      const cliente = clienteConSavepoint(tx);
      return new CierreDiaRepository(cliente, new TarifaVigenteRepository(cliente)).crearCierre({
        ...e.paraSolicitarCierre,
        totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
        pagoByGestionId: {},
        totalPagoMensajero: "0.00",
        ingresoByGestionId: {},
        totalIngresoBodegaRechazos: "0.00",
      });
    });
    if (cierreId === null) throw new Error("el cierre del fixture no vinculo ninguna gestion");
    return cierreId;
  } finally {
    await comoDueno(tx);
  }
}

async function filas(tx: TxDeTest, cierreId: string) {
  const f = await tx.cierreDetail.findMany({
    where: { cierreId },
    select: { ordenId: true, provinciaNombre: true, cantonNombre: true, distritoNombre: true, ubicacionSnapshot: true },
  });
  return new Map(f.map((x) => [x.ordenId, x]));
}

async function vaciarFks(tx: TxDeTest, ids: string[]): Promise<void> {
  await comoDueno(tx);
  await tx.$executeRawUnsafe(
    `UPDATE orden SET provincia_id = NULL, canton_id = NULL, distrito_id = NULL WHERE id = ANY($1::text[])`,
    ids,
  );
}

describeSiHayBase("SLT-48 R27 — el cierre escribe nombres y snapshot desde la ruta del nodo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("CR: con y sin las 3 FK, las ordenes viejas congelan los mismos nombres y el mismo snapshot", async () => {
    const r = await revertida(base, async (tx) => {
      const conFk = await (async () => {
        const e = await crearEscenarioGeo125(tx);
        return { e, filas: await filas(tx, await cerrar(tx, e.cr)) };
      })();
      return conFk;
    });
    const sinFk = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      await vaciarFks(tx, Object.values(e.cr.ordenes));
      return { e, filas: await filas(tx, await cerrar(tx, e.cr)) };
    });

    // Los fixtures de las dos corridas son distintos (ids nuevos): se compara por papel de la orden.
    const porPapel = (x: typeof r) =>
      Object.fromEntries(
        Object.entries(x.e.cr.ordenes).map(([papel, id]) => {
          const f = x.filas.get(id);
          const snap = ubicacionSnapshotV1Schema.parse(f?.ubicacionSnapshot);
          return [
            papel,
            {
              provinciaNombre: f?.provinciaNombre.replace(/[0-9a-f]{10}/g, "*"),
              cantonNombre: f?.cantonNombre.replace(/[0-9a-f]{10}/g, "*"),
              distritoNombre: f?.distritoNombre?.replace(/[0-9a-f]{10}/g, "*") ?? null,
              niveles: snap.niveles.map((n) => ({ profundidad: n.profundidad, tipo: n.tipo })),
            },
          ];
        }),
      );
    expect(Object.keys(porPapel(r))).toHaveLength(3);
    expect(porPapel(sinFk)).toEqual(porPapel(r));
    // Los ids del snapshot son los del nodo y sus ancestros, no las FK (que ya no estan).
    for (const id of Object.values(sinFk.e.cr.ordenes)) {
      const snap = ubicacionSnapshotV1Schema.parse(sinFk.filas.get(id)?.ubicacionSnapshot);
      expect(snap.niveles.length).toBeGreaterThanOrEqual(2);
      expect(snap.niveles.every((n) => typeof n.id === "string" && n.id.length > 0)).toBe(true);
    }
  }, 240_000);

  it("XA: una orden en un sector de nivel 4 congela los niveles 1–3 en las 3 columnas y los 4 niveles en el snapshot", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      const ordenId = e.xa.ordenes.conDistritoId;
      const [orden] = await tx.$queryRawUnsafe<{ distrito: string }[]>(
        `SELECT nodo_geografico_id AS distrito FROM orden WHERE id = $1`,
        ordenId,
      );
      await comoDueno(tx);
      const [tipo] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM tipo_nivel_geografico WHERE pais_id = (SELECT pais_id FROM nodo_geografico WHERE id = $1) AND clave = 'nivel_4'`,
        orden.distrito,
      );
      const sectorId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, activo)
         SELECT $1, pais_id, $2, id, 4, 'Sector SLT48', '', true FROM nodo_geografico WHERE id = $3`,
        sectorId,
        tipo.id,
        orden.distrito,
      );
      await tx.$executeRawUnsafe(
        `UPDATE orden SET provincia_id = NULL, canton_id = NULL, distrito_id = NULL, nodo_geografico_id = $2 WHERE id = $1`,
        ordenId,
        sectorId,
      );
      const ruta = await tx.$queryRawUnsafe<{ id: string; nombre: string; profundidad: number }[]>(
        `WITH RECURSIVE r AS (
           SELECT id, padre_id, nombre, profundidad FROM nodo_geografico WHERE id = $1
           UNION ALL SELECT n.id, n.padre_id, n.nombre, n.profundidad FROM nodo_geografico n JOIN r ON n.id = r.padre_id)
         SELECT id, nombre, profundidad FROM r ORDER BY profundidad`,
        sectorId,
      );
      const f = (await filas(tx, await cerrar(tx, e.xa))).get(ordenId);
      return { ruta, f };
    });

    expect(r.ruta).toHaveLength(4);
    expect(r.f).toMatchObject({
      provinciaNombre: r.ruta[0].nombre,
      cantonNombre: r.ruta[1].nombre,
      distritoNombre: r.ruta[2].nombre,
    });
    const snap = ubicacionSnapshotV1Schema.parse(r.f?.ubicacionSnapshot);
    expect(snap.niveles.map((n) => [n.profundidad, n.id, n.nombre, n.tipo])).toEqual(
      r.ruta.map((p, i) => [p.profundidad, p.id, p.nombre, i === 3 ? "Sector" : expect.any(String)]),
    );
  }, 240_000);
});
