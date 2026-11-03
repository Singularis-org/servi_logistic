import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { appendRastroVehiculo } from "@/lib/repositories/registrar-rastro-vehiculo";
import { comoApp, datosDeOrganizacionDePrueba } from "@/tests/fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { intentar, revertida } from "./_fixtures/pais-20";

// SL-42 — el catálogo de vehículos como dato de plataforma, contra Postgres real.
//
// T1.2 (design §2.2, R22): una empresa no lee ni escribe `vehiculo_rastro` por ninguna vía. La conexión
// del test es la del dueño; `comoApp` baja la transacción a `servi_app`, como hace la app, y el cliente
// de la app (`conAislamientoPorEmpresa` + `conEmpresa`) prueba además la vía por modelo.
//
// SIEMBRA DENTRO DE LA TRANSACCIÓN REVERTIDA: la fila de rastro se escribe como dueño con el escritor
// único y se COMPRUEBA antes de bajar a `servi_app`. Un 42501 sobre una tabla vacía diría lo mismo,
// pero «no lee la fila que existe» necesita que exista.
//
// T2 añade aquí R6, R7 y R21.

describe.skipIf(!HAY_BASE_DE_DATOS)("SL-42 — `vehiculo_rastro` sin acceso para servi_app (R22)", () => {
  let base: PrismaClient;
  let app: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R22 — SQL a mano con servi_app: SELECT, INSERT, UPDATE y DELETE de `vehiculo_rastro` dan 42501", async () => {
    const r = await revertida(base, async (tx) => {
      const vehiculoId = randomUUID();
      await appendRastroVehiculo(tx, {
        accion: "vehiculo_creado",
        vehiculoId,
        vehiculoNombre: "sl42 rastro",
        actorUsuarioId: randomUUID(),
        actorNombre: "Superadmin de prueba",
      });
      // Control como dueño: la fila está y la tabla se lee (el 42501 de abajo es de privilegios).
      const sembradas = await tx.vehiculoRastro.count({ where: { vehiculoId } });
      const { id } = await tx.organizacion.create({
        data: datosDeOrganizacionDePrueba(),
        select: { id: true },
      });
      await comoApp(tx, id);
      return {
        sembradas,
        leer: await intentar(tx, `SELECT * FROM "vehiculo_rastro"`),
        leerLaPropia: await intentar(
          tx,
          `SELECT * FROM "vehiculo_rastro" WHERE "vehiculo_id" = $1`,
          vehiculoId,
        ),
        insertar: await intentar(
          tx,
          `INSERT INTO "vehiculo_rastro" ("id", "vehiculo_id", "vehiculo_nombre", "accion", "actor_usuario_id", "actor_nombre")
           VALUES ($1, $2, 'x', 'vehiculo_activado', 'x', 'x')`,
          randomUUID(),
          vehiculoId,
        ),
        actualizar: await intentar(
          tx,
          `UPDATE "vehiculo_rastro" SET "vehiculo_nombre" = 'x' WHERE "vehiculo_id" = $1`,
          vehiculoId,
        ),
        borrar: await intentar(tx, `DELETE FROM "vehiculo_rastro" WHERE "vehiculo_id" = $1`, vehiculoId),
      };
    });
    const { sembradas, ...sqlstates } = r;
    expect(sembradas).toBe(1);
    for (const [caso, sqlstate] of Object.entries(sqlstates)) expect(sqlstate, caso).toBe("42501");
  });

  it("R22 — por el cliente de la app en contexto de empresa: leer o escribir el rastro se rechaza", async () => {
    const rechazo = /42501|permiso denegado|permission denied/;
    const A = randomUUID();
    await expect(conEmpresa(A, () => app.vehiculoRastro.findMany())).rejects.toThrow(rechazo);
    await expect(
      conEmpresa(A, () =>
        app.vehiculoRastro.create({
          data: {
            accion: "vehiculo_creado",
            vehiculoId: randomUUID(),
            vehiculoNombre: "x",
            actorUsuarioId: "x",
            actorNombre: "x",
          },
        }),
      ),
    ).rejects.toThrow(rechazo);
  });
});
