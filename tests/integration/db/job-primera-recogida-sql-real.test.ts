import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { JobRepository } from "@/lib/repositories/JobRepository";
import type { JobTxClient } from "@/lib/interfaces/repositories/IJobRepository";
import { loadRouteOptimizationConfig } from "@/lib/config/route-optimization";
import {
  dedupeKeyPrimeraRecogida,
  encolarPrimeraRutaPorRecogida,
} from "@/lib/services/jobs/optimizacion-ruta-encolado";

/**
 * SLT-59 (R76, R77; review m10) — el `ON CONFLICT ... DO UPDATE ... WHERE estado = 'pending'` de
 * `JobRepository.encolarOMoverPendiente`, contra Postgres REAL.
 *
 * POR QUE AQUI. `tests/unit/repositories/job-repo-posponer.test.ts` afirma el texto del SQL y simula
 * el motor. Lo que de verdad decide R77 es Postgres: que el conflicto lo resuelva el indice unico
 * PARCIAL de `dedupe_key` (no acotado por estado) y que el `WHERE` del `DO UPDATE` deje intacta una
 * fila que ya no esta `pending`. Eso no lo dice ningun doble.
 *
 * ⚠️ MISMA REGLA QUE `ruta-optimizada-reduccion-sql-real.test.ts`: solo `DATABASE_URL` del entorno y
 * solo con host `localhost`/`127.0.0.1`. Los modulos que pueden leer `.env` se importan dentro de
 * `beforeAll`, que solo corre si la condicion pasa. Contra una base remota, jamas: se salta.
 *
 * Todo corre en una transaccion que SIEMPRE se revierte (`conDosEmpresas`). El encolado va como
 * `servi_app` con la empresa A fijada (`comoApp`), como en produccion; lo que se mide se lee como
 * dueno, sin RLS.
 */

/** La URL tal cual llega al proceso. Se lee AQUI, antes de que nada pueda cargar `.env`. */
const URL_DEL_ENTORNO = process.env.DATABASE_URL;

function esHostLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false; // una URL que no se puede leer no es una base local demostrada
  }
}

const HAY_BASE_LOCAL =
  URL_DEL_ENTORNO !== undefined && URL_DEL_ENTORNO !== "" && esHostLocal(URL_DEL_ENTORNO);

const describeSiBaseLocal = HAY_BASE_LOCAL ? describe : describe.skip;

type PostgresReal = typeof import("./_postgres-real");
type DosEmpresas = typeof import("./_jobs-dos-empresas");
type Organizaciones = typeof import("../../fabricas/organizaciones");
type TxDeTest = import("./_postgres-real").TxDeTest;

/** Un dia que ningun job real usa: la clave de la primera recogida lleva el dia dentro. */
const DIA = "1990-03-07";
const AHORA_1 = new Date("1990-03-07T14:00:00.000Z");
const AHORA_2 = new Date("1990-03-07T14:03:00.000Z");

interface FilaJob {
  id: string;
  estado: string;
  run_after: Date;
  updated_at: Date;
  payload: Record<string, unknown>;
  organizacion_id: string | null;
}

describeSiBaseLocal("SLT-59 R77 — encolarOMoverPendiente contra Postgres real", () => {
  let pg: PostgresReal;
  let dos: DosEmpresas;
  let orgs: Organizaciones;
  let prisma: PrismaClient;

  beforeAll(async () => {
    pg = await import("./_postgres-real");
    dos = await import("./_jobs-dos-empresas");
    orgs = await import("../../fabricas/organizaciones");
    prisma = pg.crearPrismaDeTest();
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Las filas con la clave, vistas como dueno (sin RLS): todo lo que de verdad quedo. */
  async function filasConClave(tx: TxDeTest, dedupeKey: string): Promise<FilaJob[]> {
    await dos.comoDueno(tx);
    return tx.$queryRawUnsafe<FilaJob[]>(
      `SELECT "id", "estado"::text AS "estado", "run_after", "updated_at", "payload", "organizacion_id"
         FROM "jobs" WHERE "dedupe_key" = $1 ORDER BY "created_at", "id"`,
      dedupeKey,
    );
  }

  it("R76/R77: dos recogidas seguidas dejan UN job `pending`, con el `run_after` de la segunda", async () => {
    const config = loadRouteOptimizationConfig();
    const mensajeroId = randomUUID();
    const clave = dedupeKeyPrimeraRecogida(mensajeroId, DIA);

    const r = await dos.conDosEmpresas(prisma, async (tx, a) => {
      await orgs.comoApp(tx, a);
      const repo = new JobRepository(tx as unknown as PrismaClient);
      const txJob = tx as unknown as JobTxClient;
      // Primera recogida: quedan paquetes -> +RUTA_PRIMERA_DEBOUNCE_MIN.
      await encolarPrimeraRutaPorRecogida(repo, txJob, mensajeroId, {
        ahora: AHORA_1,
        diaCR: DIA,
        quedanPorRecoger: true,
      });
      const trasLaPrimera = await filasConClave(tx, clave);
      // Segunda recogida, la ultima: -> +RUTA_DEBOUNCE_S, sobre el MISMO job.
      await orgs.comoApp(tx, a);
      await encolarPrimeraRutaPorRecogida(repo, txJob, mensajeroId, {
        ahora: AHORA_2,
        diaCR: DIA,
        quedanPorRecoger: false,
      });
      return { a, trasLaPrimera, trasLaSegunda: await filasConClave(tx, clave) };
    });

    // Anti-vacuidad: la primera recogida SI creo el job.
    expect(r.trasLaPrimera).toHaveLength(1);
    expect(r.trasLaPrimera[0].run_after.getTime()).toBe(
      AHORA_1.getTime() + config.RUTA_PRIMERA_DEBOUNCE_MIN * 60_000,
    );

    expect(r.trasLaSegunda).toHaveLength(1);
    const [job] = r.trasLaSegunda;
    expect(job.id).toBe(r.trasLaPrimera[0].id); // movido, no recreado
    expect(job.estado).toBe("pending");
    expect(job.run_after.getTime()).toBe(AHORA_2.getTime() + config.RUTA_DEBOUNCE_S * 1000);
    expect(job.payload).toEqual({ mensajeroId, origen: "recogida" });
    expect(job.organizacion_id).toBe(r.a);
  });

  it.each(["processing", "done", "failed"] as const)(
    "R77: un job del dia ya `%s` no se toca ni se duplica",
    async (estado) => {
      const mensajeroId = randomUUID();
      const clave = dedupeKeyPrimeraRecogida(mensajeroId, DIA);

      const r = await dos.conDosEmpresas(prisma, async (tx, a) => {
        const sembrado = await dos.sembrarJob(tx, a, {
          tipo: "optimizacion_ruta",
          estado,
          dedupeKey: clave,
        });
        const antes = await filasConClave(tx, clave);

        await orgs.comoApp(tx, a);
        const devuelto = await new JobRepository(tx as unknown as PrismaClient).encolarOMoverPendiente(
          "optimizacion_ruta",
          { mensajeroId, origen: "recogida" },
          { runAfter: AHORA_2, dedupeKey: clave },
          tx as unknown as JobTxClient,
        );
        return { sembrado, antes, devuelto, despues: await filasConClave(tx, clave) };
      });

      // Anti-vacuidad: la fila que ocupa la clave existia y estaba en el estado pedido.
      expect(r.antes).toHaveLength(1);
      expect(r.antes[0].id).toBe(r.sembrado);
      expect(r.antes[0].estado).toBe(estado);

      expect(r.devuelto).toBeNull();
      // Ni se movio (run_after, payload, updated_at) ni aparecio otra fila con la clave.
      expect(r.despues).toEqual(r.antes);
    },
  );
});
