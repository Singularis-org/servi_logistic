import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ESTADOS_TERMINALES } from "@/lib/types/order-status-transiciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SLT-83 (design §3.4; R19) — la base no puede importar `ESTADOS_TERMINALES`: su copia vive en
// `orden_estado_es_final`. Este test las ata.
//
//   · recorre TODOS los `value` de `order_status` y afirma que la función devuelve `true` exactamente para
//     el literal de abajo, escrito a mano como contrato;
//   · afirma que ese literal es igual a `ESTADOS_TERMINALES`. Si el dominio gana un cuarto estado final,
//     este test cae y obliga a una migración que actualice la función.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** El contrato, a mano. */
const FINALES_DEL_CONTRATO = ["entregado", "devuelta_a_tienda", "incidente"];

let base: PrismaClient;

describe("SLT-83 R19 — el contrato de estados finales es ESTADOS_TERMINALES", () => {
  it("R19: el literal del contrato es exactamente ESTADOS_TERMINALES", () => {
    expect([...FINALES_DEL_CONTRATO].sort()).toEqual([...ESTADOS_TERMINALES].sort());
  });
});

describeSiHayBase("SLT-83 R19 — orden_estado_es_final contra todos los estados de la base", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R19: la función es verdadera exactamente para los estados finales del contrato", async () => {
    const filas = await base.$queryRawUnsafe<{ value: string; final: boolean }[]>(
      `SELECT s."value", orden_estado_es_final(s."id") AS final FROM "order_status" s ORDER BY s."value"`,
    );
    // Control de no vacuidad: el catálogo trae más estados que los finales.
    expect(filas.length).toBeGreaterThan(FINALES_DEL_CONTRATO.length);
    expect(filas.filter((f) => f.final).map((f) => f.value).sort()).toEqual([...FINALES_DEL_CONTRATO].sort());
  });

  it("R19: un estatus que no existe no es final", async () => {
    const [fila] = await base.$queryRawUnsafe<{ final: boolean }[]>(`SELECT orden_estado_es_final('no-existe') AS final`);
    expect(fila.final).toBe(false);
  });
});
