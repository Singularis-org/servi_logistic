import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearGeografiaDePrueba, crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SL-20 (T1.8; enmienda 2026-10-26, decisión 6; design §2.1, §2.6, §3) — `pais.disponible` contra
// Postgres real (migración 20261026120500_pais_disponible).
//   · R44: Costa Rica queda disponible tras migrar, y un país que se inserta sin la columna nace
//     disponible.
//   · R3: una empresa (`servi_app`) no puede cambiar la disponibilidad de ningún país.
//   · R46: con `XA` apagado, su empresa sigue en `XA`, lee su geografía y crea una orden como
//     `servi_app`: nada de la RLS ni de los triggers de la geografía lee la columna.
//   · R47 (base): el enum del historial acepta `pais_disponibilidad_activada`/`_desactivada`.
//
// Cada caso corre en una transacción del dueño que se revierte (`revertida`). Los de R3 y R46 bajan a
// `servi_app` con `comoApp`: con la conexión del dueño ni el REVOKE ni la RLS actúan.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SL20', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`;

describeSiHayBase("SL-20 — pais.disponible", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R44: tras migrar, Costa Rica está disponible y un país insertado sin la columna nace disponible", async () => {
    const r = await revertida(base, async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO pais (id, nombre, nivel_1_singular, nivel_1_plural, nivel_2_singular,
        nivel_2_plural, nivel_3_singular, nivel_3_plural) VALUES ('XA', 'País XA', 'a', 'b', 'c', 'd', 'e', 'f')`);
      const filas = await tx.$queryRawUnsafe<{ id: string; disponible: boolean }[]>(
        `SELECT id, disponible FROM pais WHERE id IN ('CR', 'XA') ORDER BY id`,
      );
      return filas.map((f) => `${f.id}=${f.disponible}`);
    });
    expect(r).toEqual(["CR=true", "XA=true"]);
  });

  it("R3: una empresa no puede cambiar la disponibilidad de un país (42501) y el país queda como estaba", async () => {
    const r = await revertida(base, async (tx) => {
      const { id } = await crearOrganizacion(tx);
      await comoApp(tx, id);
      const apaga = await intentar(tx, `UPDATE pais SET disponible = false WHERE id = 'CR'`);
      await comoDueno(tx);
      const cr = await tx.pais.findUnique({ where: { id: "CR" }, select: { disponible: true } });
      return { apaga, disponibleTras: cr?.disponible };
    });
    expect(r).toEqual({ apaga: "42501", disponibleTras: true });
  });

  it("R46: con XA apagado, su empresa sigue en XA, lee su geografía y crea una orden como servi_app", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const geo = await crearGeografiaDePrueba(tx, "XA");
      const empresa = await crearOrganizacionEnPais(tx, "XA");
      await fijarEmpresa(tx, empresa.id);
      const fks = await crearFksDeOrden(tx);

      await tx.pais.update({ where: { id: "XA" }, data: { disponible: false } });

      await comoApp(tx, empresa.id);
      const nodos = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT (SELECT count(*) FROM provincia WHERE id = $1) + (SELECT count(*) FROM canton WHERE id = $2)
           + (SELECT count(*) FROM distrito WHERE id = $3) AS n`,
        geo.provinciaId,
        geo.cantonId,
        geo.distritoId,
      );
      const paisVisto = await tx.$queryRawUnsafe<{ id: string; disponible: boolean }[]>(
        `SELECT p.id, p.disponible FROM organizacion o JOIN pais p ON p.id = o.pais_id WHERE o.id = $1`,
        empresa.id,
      );
      const ordenId = randomUUID();
      const orden = await intentar(
        tx,
        INSERTAR_ORDEN,
        ordenId,
        `SL20-${ordenId.slice(0, 8)}`,
        fks.estatusId,
        fks.tiendaId,
        fks.zonaId,
        geo.provinciaId,
        geo.cantonId,
        geo.distritoId,
      );
      const ordenVista = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM orden WHERE id = $1`, ordenId);
      await comoDueno(tx);
      return {
        nodos: Number(nodos[0]?.n),
        pais: paisVisto.map((f) => `${f.id}=${f.disponible}`),
        orden,
        ordenVista: ordenVista.length,
      };
    });
    expect(r).toEqual({ nodos: 3, pais: ["XA=false"], orden: null, ordenVista: 1 });
  });

  it("R47 (base): el historial de plataforma acepta las dos acciones de disponibilidad de un país", async () => {
    const r = await revertida(base, async (tx) => {
      const insertar = (accion: string) =>
        intentar(
          tx,
          `INSERT INTO historial_plataforma (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, pais_id)
            VALUES ($1, $2::historial_plataforma_accion, 'pais', 'CR', 'Costa Rica', 'CR')`,
          randomUUID(),
          accion,
        );
      return {
        activada: await insertar("pais_disponibilidad_activada"),
        desactivada: await insertar("pais_disponibilidad_desactivada"),
        inventada: await insertar("pais_disponibilidad_inventada"),
      };
    });
    expect(r).toEqual({ activada: null, desactivada: null, inventada: "22P02" });
  });
});
