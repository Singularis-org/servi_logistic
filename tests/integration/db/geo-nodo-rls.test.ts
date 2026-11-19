import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { SQL_INSERTAR_NODO, argumentosDeNodo, crearEscenarioGeo43, insertarNodo } from "./_fixtures/geo-43";
import { comoDueno, intentar, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-43 (T2.2; design §2.2) — R12, lado de los nodos: una empresa lee solo los nodos del país de su
// empresa y no escribe ninguno. (El lado de los tipos está en `geo-tipo-nivel.test.ts`.)
//
// Dos empresas: una en Costa Rica (la geografía que copió la migración) y otra en `XA` (el escenario
// de `_fixtures/geo-43.ts`, con un nodo insertado a mano por el dueño). Cada lectura baja a
// `servi_app` con `comoApp`: con la conexión del dueño ni la RLS ni el REVOKE actúan.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

async function paisesVisibles(tx: TxDeTest): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ pais_id: string }[]>(
    `SELECT DISTINCT pais_id FROM nodo_geografico ORDER BY pais_id`,
  );
  return filas.map((f) => f.pais_id);
}

describeSiHayBase("SLT-43 — nodo_geografico: RLS por país (R12)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("cada empresa lee solo los nodos de su país; sin empresa fijada, ninguno", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo43(tx);
      await comoDueno(tx);
      const nodoXA = await insertarNodo(tx, {
        paisId: "XA",
        tipoId: e.tipos.nivel1,
        padreId: null,
        profundidad: 1,
        nombre: `Raíz RLS ${randomUUID().slice(0, 8)}`,
      });
      const { id: empresaCR } = await crearOrganizacion(tx);

      await comoApp(tx, empresaCR);
      const veCR = await paisesVisibles(tx);
      await comoDueno(tx);

      await comoApp(tx, e.empresaId);
      const veXA = await paisesVisibles(tx);
      const veSuNodo = (await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM nodo_geografico WHERE id = $1`, nodoXA)).length;
      await comoDueno(tx);

      await comoApp(tx, "");
      const sinEmpresa = await paisesVisibles(tx);
      await comoDueno(tx);
      return { veCR, veXA, veSuNodo, sinEmpresa };
    });
    expect(r).toEqual({ veCR: ["CR"], veXA: ["XA"], veSuNodo: 1, sinEmpresa: [] });
  });

  it("una empresa no puede crear, cambiar ni borrar nodos, ni de su país (42501), y nada cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo43(tx);
      await comoDueno(tx);
      const nombre = `Raíz RLS ${randomUUID().slice(0, 8)}`;
      const nodoXA = await insertarNodo(tx, { paisId: "XA", tipoId: e.tipos.nivel1, padreId: null, profundidad: 1, nombre });

      await comoApp(tx, e.empresaId);
      const intentos = {
        crea: await intentar(
          tx,
          SQL_INSERTAR_NODO,
          ...argumentosDeNodo({ id: randomUUID(), paisId: "XA", tipoId: e.tipos.nivel1, padreId: null, profundidad: 1, nombre: "Otra" }),
        ),
        cambia: await intentar(tx, `UPDATE nodo_geografico SET nombre = 'Cambiado' WHERE id = $1`, nodoXA),
        retira: await intentar(tx, `UPDATE nodo_geografico SET activo = false WHERE id = $1`, nodoXA),
        borra: await intentar(tx, `DELETE FROM nodo_geografico WHERE id = $1`, nodoXA),
      };
      await comoDueno(tx);
      const fila = await tx.$queryRawUnsafe<{ nombre: string; activo: boolean }[]>(
        `SELECT nombre, activo FROM nodo_geografico WHERE id = $1`,
        nodoXA,
      );
      return { intentos, fila, nombre };
    });
    expect(r.intentos).toEqual({ crea: "42501", cambia: "42501", retira: "42501", borra: "42501" });
    expect(r.fila).toEqual([{ nombre: r.nombre, activo: true }]);
  });
});
