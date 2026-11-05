import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { asignar, crearEmpresa, crearOrden, crearPlanConCosto, movimientos } from "./_fixtures/cobro-porcentual";
import { revertida } from "./_fixtures/planes";

// SLT-83 (design §2.3 punto 2; R9) — el importe porcentual en decimal exacto, contra Postgres.
//
// La misma tabla de ejemplos dos veces: sobre `cobro_plataforma_importe_porcentual` y sobre el cargo real
// de una orden que nace en `entregado` con ese `monto_cobrar` y un plan con ese porcentaje y mínimo. Los
// dos casos de mitad exacta (1 % de 1.050 = 10,50; 0,5 % de 1.001 = 5,005 → 5,01) y el 290,11 matan
// `round` → `trunc`; el «0 con mínimo» y el «vacío con mínimo» matan `GREATEST` → `LEAST` y un mínimo
// que cayera al global (design §9.4).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Caso {
  caso: string;
  monto: string | null;
  pct: string;
  minimo: string | null;
  importe: string;
}

const CASOS: readonly Caso[] = [
  { caso: "2 % de 10.000 con mínimo 500 → el mínimo", monto: "10000", pct: "2", minimo: "500", importe: "500.00" },
  { caso: "2 % de 100.000 con mínimo 500", monto: "100000", pct: "2", minimo: "500", importe: "2000.00" },
  { caso: "2 % de 0 con mínimo 500 → el mínimo", monto: "0", pct: "2", minimo: "500", importe: "500.00" },
  { caso: "2 % de vacío con mínimo 500 → el mínimo", monto: null, pct: "2", minimo: "500", importe: "500.00" },
  { caso: "2,35 % de 12.345 sin mínimo", monto: "12345", pct: "2.35", minimo: null, importe: "290.11" },
  { caso: "2 % de 0 sin mínimo", monto: "0", pct: "2", minimo: null, importe: "0.00" },
  { caso: "mitad exacta: 1 % de 1.050", monto: "1050", pct: "1", minimo: null, importe: "10.50" },
  { caso: "mitad exacta: 0,5 % de 1.001 sube", monto: "1001", pct: "0.5", minimo: null, importe: "5.01" },
  { caso: "100 % de 9.999.999.999 cabe en DECIMAL(12,2)", monto: "9999999999", pct: "100", minimo: null, importe: "9999999999.00" },
];

describeSiHayBase("SLT-83 R9 — el importe porcentual, exacto y sin caer al global", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it.each(CASOS)("R9 (función): $caso → $importe", async ({ monto, pct, minimo, importe }) => {
    const [fila] = await base.$queryRawUnsafe<{ i: string }[]>(
      `SELECT cobro_plataforma_importe_porcentual($1::numeric, $2::numeric, $3::numeric)::text AS i`,
      monto,
      pct,
      minimo,
    );
    expect(fila.i).toBe(importe);
  });

  it.each(CASOS)("R9 (cargo real): $caso → $importe", async ({ monto, pct, minimo, importe }) => {
    const m = await revertida(base, async (tx) => {
      const e = await crearEmpresa(tx);
      await asignar(tx, e, await crearPlanConCosto(tx, { pct, minimo }));
      const id = await crearOrden(tx, e, { estado: "entregado", montoCobrar: monto });
      return movimientos(tx, id);
    });
    expect(m).toEqual([{ tipo: "cargo", fuente: "plan", monto: importe, secuencia: 1 }]);
  });
});
