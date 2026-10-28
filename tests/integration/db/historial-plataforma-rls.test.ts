import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { appendAccionPlataforma } from "@/lib/repositories/registrar-accion-plataforma";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { comoDueno, errorEnSavepoint, intentar, revertida, sqlstateDe } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SL-20 (T1.5, T1.7; design §2.6) — el historial de plataforma, contra Postgres real.
//   · R34: una empresa (`servi_app`) no lee ni escribe `historial_plataforma`. Con el REVOKE ALL, el
//     SELECT no devuelve «cero filas»: lo rechaza con 42501, que R34 admite («cero filas o rechazar»).
//     La RLS sin políticas es la segunda red y se comprueba aparte, devolviendo el SELECT a `servi_app`
//     dentro de la transacción: sin ninguna política, ve cero filas.
//   · R33 (la base de la escritura): `appendAccionPlataforma` escribe una fila por entrada como dueño,
//     con el actor y los valores congelados, recorta la etiqueta a la columna y no escribe nada con un
//     lote vacío. Lo que escribe cada acción del superadmin lo miden T3.4 y T4.1.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function filasDe(tx: TxDeTest, entidadId: string) {
  return tx.historialPlataforma.findMany({
    where: { entidadId },
    select: {
      accion: true,
      entidadTipo: true,
      entidadEtiqueta: true,
      paisId: true,
      actorUsuarioId: true,
      actorNombre: true,
      valorAnterior: true,
      valorNuevo: true,
      detalle: true,
    },
    orderBy: { accion: "asc" },
  });
}

describeSiHayBase("SL-20 — historial_plataforma", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R34: una empresa no puede leer, escribir, cambiar ni borrar el historial de plataforma (42501)", async () => {
    const r = await revertida(base, async (tx) => {
      const entidadId = randomUUID();
      await appendAccionPlataforma(tx, [
        {
          accion: "nodo_geografico_creado",
          entidadTipo: "provincia",
          entidadId,
          entidadEtiqueta: "Provincia SL20",
          paisId: "CR",
          actorUsuarioId: null,
          actorNombre: null,
        },
      ]);
      const { id } = await crearOrganizacion(tx);
      await comoApp(tx, id);
      const resultado = {
        lee: await intentar(tx, `SELECT count(*) FROM historial_plataforma`),
        escribe: await intentar(
          tx,
          `INSERT INTO historial_plataforma (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, pais_id)
           VALUES ($1, 'pais_creado', 'pais', 'CR', 'Costa Rica', 'CR')`,
          randomUUID(),
        ),
        cambia: await intentar(tx, `UPDATE historial_plataforma SET entidad_etiqueta = 'x' WHERE entidad_id = $1`, entidadId),
        borra: await intentar(tx, `DELETE FROM historial_plataforma WHERE entidad_id = $1`, entidadId),
        porPrisma: await errorEnSavepoint(tx, () => tx.historialPlataforma.findMany({ where: { entidadId } })).then(
          (e) => (e === null ? "leyó" : sqlstateDe(e)),
        ),
      };
      await comoDueno(tx);
      return { ...resultado, quedan: (await filasDe(tx, entidadId)).length };
    });
    expect(r).toEqual({ lee: "42501", escribe: "42501", cambia: "42501", borra: "42501", porPrisma: "42501", quedan: 1 });
  });

  it("R34: aunque alguien le devolviera el SELECT, la RLS sin políticas le deja ver cero filas", async () => {
    const r = await revertida(base, async (tx) => {
      const entidadId = randomUUID();
      await appendAccionPlataforma(tx, [
        {
          accion: "pais_creado",
          entidadTipo: "pais",
          entidadId,
          entidadEtiqueta: "Costa Rica",
          paisId: "CR",
          actorUsuarioId: null,
          actorNombre: null,
        },
      ]);
      // Se revierte con la transacción: no sobrevive al caso.
      await tx.$executeRawUnsafe(`GRANT SELECT ON historial_plataforma TO servi_app`);
      const { id } = await crearOrganizacion(tx);
      await comoApp(tx, id);
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*) AS n FROM historial_plataforma WHERE entidad_id = $1`, entidadId);
      await comoDueno(tx);
      return { vistas: Number(n), reales: (await filasDe(tx, entidadId)).length };
    });
    expect(r).toEqual({ vistas: 0, reales: 1 });
  });

  it("R33: appendAccionPlataforma escribe una fila por entrada con el actor y los valores congelados", async () => {
    const r = await revertida(base, async (tx) => {
      const entidadId = randomUUID();
      await appendAccionPlataforma(tx, [
        {
          accion: "nodo_geografico_renombrado",
          entidadTipo: "distrito",
          entidadId,
          entidadEtiqueta: "x".repeat(200),
          paisId: "CR",
          actorUsuarioId: null,
          actorNombre: "Superadmin de prueba",
          valorAnterior: "Viejo",
          valorNuevo: "Nuevo",
        },
        {
          accion: "division_cargada",
          entidadTipo: "pais",
          entidadId,
          entidadEtiqueta: "Costa Rica",
          paisId: "CR",
          actorUsuarioId: null,
          actorNombre: null,
          detalle: { creados: { provincia: 1, canton: 2, distrito: 3 }, existentes: 4, codigosCompletados: 5 },
        },
      ]);
      // Lote vacío: no-op, no escribe nada.
      await appendAccionPlataforma(tx, []);
      return filasDe(tx, entidadId);
    });
    expect(r).toEqual([
      {
        accion: "division_cargada",
        entidadTipo: "pais",
        entidadEtiqueta: "Costa Rica",
        paisId: "CR",
        actorUsuarioId: null,
        actorNombre: null,
        valorAnterior: null,
        valorNuevo: null,
        detalle: { creados: { provincia: 1, canton: 2, distrito: 3 }, existentes: 4, codigosCompletados: 5 },
      },
      {
        accion: "nodo_geografico_renombrado",
        entidadTipo: "distrito",
        entidadEtiqueta: "x".repeat(120),
        paisId: "CR",
        actorUsuarioId: null,
        actorNombre: "Superadmin de prueba",
        valorAnterior: "Viejo",
        valorNuevo: "Nuevo",
        detalle: null,
      },
    ]);
  });

  it("R33: una fila con un país inexistente no entra (FK RESTRICT)", async () => {
    const r = await revertida(base, async (tx) =>
      intentar(
        tx,
        `INSERT INTO historial_plataforma (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, pais_id)
         VALUES ($1, 'pais_creado', 'pais', 'XZ', 'Nadie', 'XZ')`,
        randomUUID(),
      ),
    );
    expect(r).toBe("23503");
  });
});
