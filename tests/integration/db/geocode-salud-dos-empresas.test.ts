import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { MARCADOR_FALLO_CONFIG_GEOCODE } from "@/lib/geo/fallo-config-geocode";
import { GeocodeSaludRepository } from "@/lib/repositories/GeocodeSaludRepository";
import { comoApp } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { comoDueno, conDosEmpresas, filasDe, sembrarJob } from "./_jobs-dos-empresas";

/**
 * SL-19 / T4.3 (design §2.2, §6) — R8: la salud de la geocodificacion de A cuenta y revive solo
 * jobs de A, aunque B y la plataforma tengan jobs que cumplen las mismas condiciones.
 *
 * El handler de geocodificacion corre en la empresa del job: aqui, `servi_app` con A (`comoApp`).
 * Hay DOS barreras: la politica `jobs_por_empresa` (SL-19) y el filtro por empresa en el SQL de
 * `GeocodeSaludRepository` (SL-36, R42/R43). Este test tiene que seguir verde con cualquiera de las
 * dos sola, y ponerse rojo sin ninguna: es la mutacion de design §6, variante «despues del merge».
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const TOCADO = new Date("2001-01-01T00:00:00Z");
const DESDE = new Date("2000-01-01T00:00:00Z");
const AHORA = new Date("2001-06-01T00:00:00Z");
const ERROR_CONFIG = `${MARCADOR_FALLO_CONFIG_GEOCODE} sl19: clave rechazada`;

let prisma: PrismaClient;

beforeAll(() => {
  prisma = crearPrismaDeTest();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

function repoDe(tx: TxDeTest): GeocodeSaludRepository {
  return new GeocodeSaludRepository(tx as unknown as PrismaClient);
}

/** Un job de geocodificacion muerto por configuracion, como los que cuenta y revive la salud. */
function muerto(tx: TxDeTest, org: string | null): Promise<string> {
  return sembrarJob(tx, org, { estado: "failed", lastError: ERROR_CONFIG, updatedAt: TOCADO });
}

describeSiHayBase("SL-19 — salud de la geocodificacion con dos empresas (R8)", () => {
  it("R8 — A cuenta solo sus fallos de configuracion, aunque B y la plataforma tengan los mismos", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a, b) => {
      await muerto(tx, a);
      await muerto(tx, b);
      await muerto(tx, b);
      await muerto(tx, null);
      await comoApp(tx, a);
      return repoDe(tx).contarFallosConfigDesde(a, DESDE, "sl19-ninguno");
    });
    expect(r).toBe(1);
  });

  it("R8 — A revive solo sus jobs muertos por configuracion; los de B y los sin empresa siguen muertos", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a, b) => {
      const deA = await muerto(tx, a);
      const deB = await muerto(tx, b);
      const sinEmpresa = await muerto(tx, null);
      await comoApp(tx, a);
      const revividos = await repoDe(tx).revivirFallosConfig({
        organizacionId: a,
        ahora: AHORA,
        limite: 100,
        espaciadoMs: 1000,
        tocadoAntesDe: AHORA,
      });
      await comoDueno(tx);
      const filas = new Map((await filasDe(tx, [deA, deB, sinEmpresa])).map((f) => [f.id, f]));
      return { revividos, a: filas.get(deA), b: filas.get(deB), n: filas.get(sinEmpresa) };
    });
    expect(r.revividos).toBe(1);
    expect(r.a).toMatchObject({ estado: "pending", last_error: null });
    expect(r.b).toMatchObject({ estado: "failed", last_error: ERROR_CONFIG });
    expect(r.n).toMatchObject({ estado: "failed", last_error: ERROR_CONFIG });
  });
});
