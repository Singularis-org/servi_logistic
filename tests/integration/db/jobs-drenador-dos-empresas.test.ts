import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { JobRepository, type JobConEmpresa } from "@/lib/repositories/JobRepository";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { HACE_MUCHO, conDosEmpresas, filasDe, sembrarJob } from "./_jobs-dos-empresas";

/**
 * SL-19 / T4.2 (design §2.2, §6) — R6: con la politica por empresa aplicada, el drenador sigue
 * reclamando y cerrando en la misma corrida los jobs de todas las empresas y los sin empresa.
 *
 * El drenador corre el reclamo y el cierre en `comoPlataforma`, que en la base es el DUENO de las
 * tablas (sin RLS): aqui, la conexion del test sin `comoApp`. El reloj va inyectado en 1990, asi que
 * el reclamo solo alcanza lo sembrado por el caso (ningun job real tiene un `run_after` tan viejo).
 *
 * Mutacion que lo pone rojo (design §6): reclamar con `comoApp(tx, A)` en vez de como dueno; deja
 * de ver los jobs de B y los sin empresa.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const AHORA = new Date(HACE_MUCHO.getTime() + 24 * 3600_000);
const REINTENTO = new Date(AHORA.getTime() + 3600_000);

let prisma: PrismaClient;

beforeAll(() => {
  prisma = crearPrismaDeTest();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

function repoDe(tx: TxDeTest): JobRepository {
  return new JobRepository(tx as unknown as PrismaClient);
}

describeSiHayBase("SL-19 — el drenador con dos empresas y jobs sin empresa (R6)", () => {
  it("la politica vigente es jobs_por_empresa: R6 se mide con ella, no con la abierta", async () => {
    const filas = await prisma.$queryRawUnsafe<{ policyname: string }[]>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' ORDER BY 1`,
    );
    expect(filas.map((f) => f.policyname)).toEqual(["jobs_por_empresa"]);
  });

  it("R6 — reclama en una corrida los vencidos de A, de B y sin empresa, y los cierra: completado, reintento y fallo terminal", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a, b) => {
      const deA = await sembrarJob(tx, a);
      const deB = await sembrarJob(tx, b);
      const sinEmpresa = await sembrarJob(tx, null);
      const sembrados = [deA, deB, sinEmpresa];

      const reclamados = (await repoDe(tx).claimBatch(1000, {
        now: AHORA,
        visibilityCutoff: HACE_MUCHO,
      })) as JobConEmpresa[];
      const nuestros = reclamados.filter((j) => sembrados.includes(j.id));
      const trasReclamo = await filasDe(tx, sembrados);

      await repoDe(tx).complete(deA);
      await repoDe(tx).fail(deB, "sl19: reintento", REINTENTO);
      await repoDe(tx).fail(sinEmpresa, "sl19: agotado", null);
      const trasCierre = await filasDe(tx, sembrados);
      return { a, b, deA, deB, sinEmpresa, nuestros, trasReclamo, trasCierre };
    });

    // Reclamo: los tres, cada uno con su empresa, y en `processing` con el intento contado.
    const porId = new Map(r.nuestros.map((j) => [j.id, j]));
    expect([...porId.keys()].sort()).toEqual([r.deA, r.deB, r.sinEmpresa].sort());
    expect(porId.get(r.deA)?.organizacionId).toBe(r.a);
    expect(porId.get(r.deB)?.organizacionId).toBe(r.b);
    expect(porId.get(r.sinEmpresa)?.organizacionId).toBeNull();
    expect(r.trasReclamo.map((f) => [f.estado, f.intentos])).toEqual([
      ["processing", 1],
      ["processing", 1],
      ["processing", 1],
    ]);

    // Cierre: cada rama del cierre llega a su fila, sea de la empresa que sea.
    const cierre = new Map(r.trasCierre.map((f) => [f.id, f]));
    expect(cierre.get(r.deA)?.estado).toBe("done");
    expect(cierre.get(r.deB)).toMatchObject({ estado: "pending", last_error: "sl19: reintento", run_after: REINTENTO });
    expect(cierre.get(r.sinEmpresa)).toMatchObject({ estado: "failed", last_error: "sl19: agotado" });
  });
});
