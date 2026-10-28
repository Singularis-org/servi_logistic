import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { JobRepository, type JobConEmpresa } from "@/lib/repositories/JobRepository";
import { comoApp } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import {
  comoAppSinEmpresa,
  comoDueno,
  conDosEmpresas,
  filasDe,
  intentar,
  sembrarJob,
} from "./_jobs-dos-empresas";

/**
 * SL-19 / T4.1 (design §2.1, §6) — la politica `jobs_por_empresa` contra Postgres real, con dos
 * empresas: R1, R2, R3, R4, R5, R7 y R10.
 *
 * Cada caso siembra como dueno un job de A, uno de B y uno sin empresa, baja a `servi_app` con la
 * empresa A fijada (`comoApp`) y mide; el antes y el despues se miden otra vez como dueno, que ve
 * todo sin depender de la politica. Sin `comoApp` la conexion de los tests es duena de las tablas
 * y la RLS no actua: el test pasaria aunque la politica no existiera.
 *
 * Mutaciones que lo ponen rojo (design §6, anotadas en `progress/impl_SL-19.md`): (a) la migracion
 * sin el `DROP POLICY "jobs_abierta"`; (b) la politica con `OR organizacion_id IS NULL`; (c) sin el
 * `DEFAULT` de M4 dentro de la transaccion del caso R4.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** SQLSTATE de «new row violates row-level security policy». */
const VIOLA_RLS = "42501";

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

interface Tres {
  deA: string;
  deB: string;
  sinEmpresa: string;
}

async function sembrarTres(tx: TxDeTest, a: string, b: string, clave = randomUUID()): Promise<Tres> {
  return {
    deA: await sembrarJob(tx, a, { dedupeKey: `sl19-a-${clave}` }),
    deB: await sembrarJob(tx, b, { dedupeKey: `sl19-b-${clave}` }),
    sinEmpresa: await sembrarJob(tx, null, { dedupeKey: `sl19-n-${clave}` }),
  };
}

describeSiHayBase("SL-19 — jobs separados por empresa en la base (R1–R5, R7, R10)", () => {
  it("la politica aplicada es solo jobs_por_empresa (si no, el resto mediria otra cosa)", async () => {
    const filas = await prisma.$queryRawUnsafe<{ policyname: string }[]>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' ORDER BY 1`,
    );
    expect(filas.map((f) => f.policyname)).toEqual(["jobs_por_empresa"]);
  });

  it("R1 — con A fijada, leer jobs devuelve solo los de A, aunque el SQL no filtre", async () => {
    const { visto, total } = await conDosEmpresas(prisma, async (tx, a, b) => {
      const t = await sembrarTres(tx, a, b);
      await comoApp(tx, a);
      const visto = (await filasDe(tx, [t.deA, t.deB, t.sinEmpresa])).map((f) => f.id);
      // Sin ningun WHERE: lo que la politica deja ver de toda la tabla.
      const todas = await tx.$queryRawUnsafe<{ organizacion_id: string | null }[]>(
        `SELECT "organizacion_id" FROM "jobs"`,
      );
      return { visto: { ids: visto, t, a }, total: todas };
    });
    expect(visto.ids).toEqual([visto.t.deA]);
    expect(total).toEqual([{ organizacion_id: visto.a }]);
  });

  it("R2 — con A fijada, actualizar o borrar un job de B o sin empresa afecta cero filas y lo deja intacto", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a, b) => {
      const t = await sembrarTres(tx, a, b);
      const ajenos = [t.deB, t.sinEmpresa];
      const antes = await filasDe(tx, ajenos);
      await comoApp(tx, a);
      const actualizadas = await tx.$executeRawUnsafe(
        `UPDATE "jobs" SET "estado" = 'failed', "last_error" = 'sl19' WHERE "id" = ANY($1::text[])`,
        ajenos,
      );
      const borradas = await tx.$executeRawUnsafe(`DELETE FROM "jobs" WHERE "id" = ANY($1::text[])`, ajenos);
      // Control: la misma sentencia SI alcanza al job propio.
      const propias = await tx.$executeRawUnsafe(
        `UPDATE "jobs" SET "last_error" = 'sl19' WHERE "id" = $1`,
        t.deA,
      );
      await comoDueno(tx);
      return { actualizadas, borradas, propias, antes, despues: await filasDe(tx, ajenos) };
    });
    expect(r.actualizadas).toBe(0);
    expect(r.borradas).toBe(0);
    expect(r.propias).toBe(1);
    expect(r.antes).toHaveLength(2);
    expect(r.despues).toEqual(r.antes);
  });

  it("R3 — con A fijada, insertar un job de B o con organizacion_id NULL explicito se rechaza y no escribe nada", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a, b) => {
      const idB = randomUUID();
      const idNull = randomUUID();
      const insertar = (id: string, org: string | null) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "jobs" ("id", "tipo", "payload", "estado", "intentos", "max_intentos", "organizacion_id")
           VALUES ($1, 'geocodificacion', '{}'::jsonb, 'pending', 0, 5, $2)`,
          id,
          org,
        );
      await comoApp(tx, a);
      const conB = await intentar(tx, () => insertar(idB, b));
      const conNull = await intentar(tx, () => insertar(idNull, null));
      await comoDueno(tx);
      return { conB, conNull, escritas: await filasDe(tx, [idB, idNull]) };
    });
    expect(r.conB).toBe(VIOLA_RLS);
    expect(r.conNull).toBe(VIOLA_RLS);
    expect(r.escritas).toEqual([]);
  });

  it("R4 — encolar dentro de A sin nombrar la empresa guarda el job con A y devuelve el job creado", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a) => {
      await comoApp(tx, a);
      const job = (await repoDe(tx).enqueue("geocodificacion", { ordenId: "sl19" }, { maxIntentos: 3 })) as
        | JobConEmpresa
        | null;
      await comoDueno(tx);
      const guardada = job ? await filasDe(tx, [job.id]) : [];
      return { a, job, guardada };
    });
    expect(r.job).not.toBeNull();
    expect(r.job?.organizacionId).toBe(r.a);
    expect(r.job?.payload).toEqual({ ordenId: "sl19" });
    expect(r.guardada).toHaveLength(1);
    expect(r.guardada[0].organizacion_id).toBe(r.a);
  });

  it("R5 — con servi_app y sin empresa fijada, jobs devuelve cero filas y rechaza toda insercion", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a, b) => {
      const t = await sembrarTres(tx, a, b);
      await comoAppSinEmpresa(tx);
      const vistas = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "jobs"`);
      const deLasSembradas = await filasDe(tx, [t.deA, t.deB, t.sinEmpresa]);
      const clave = `sl19-sin-empresa-${randomUUID()}`;
      const encolar = await intentar(tx, () =>
        repoDe(tx).enqueue("geocodificacion", {}, { maxIntentos: 3, dedupeKey: clave }),
      );
      await comoDueno(tx);
      const escritas = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "jobs" WHERE "dedupe_key" = $1`,
        clave,
      );
      const sembradas = await filasDe(tx, [t.deA, t.deB, t.sinEmpresa]);
      return { vistas: vistas[0].n, deLasSembradas, encolar, escritas: escritas[0].n, sembradas };
    });
    expect(r.sembradas).toHaveLength(3);
    expect(r.vistas).toBe(0);
    expect(r.deLasSembradas).toEqual([]);
    expect(r.encolar).toBe(VIOLA_RLS);
    expect(r.escritas).toBe(0);
  });

  it("R7 — dentro de A, encolar dos veces la misma clave deja una sola fila y el segundo devuelve omitido", async () => {
    const r = await conDosEmpresas(prisma, async (tx, a) => {
      const clave = `sl19-dedupe-${randomUUID()}`;
      await comoApp(tx, a);
      const primero = await repoDe(tx).enqueue("geocodificacion", { n: 1 }, { maxIntentos: 3, dedupeKey: clave });
      const segundo = await repoDe(tx).enqueue("geocodificacion", { n: 2 }, { maxIntentos: 3, dedupeKey: clave });
      await comoDueno(tx);
      const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; payload: unknown }[]>(
        `SELECT "organizacion_id", "payload" FROM "jobs" WHERE "dedupe_key" = $1`,
        clave,
      );
      return { a, primero, segundo, filas };
    });
    expect(r.primero).not.toBeNull();
    expect(r.segundo).toBeNull();
    expect(r.filas).toEqual([{ organizacion_id: r.a, payload: { n: 1 } }]);
  });

  it("R10 — A busca por claves de deduplicacion y recibe solo sus jobs, aunque pida claves de B y sin empresa", async () => {
    // `dedupe_key` es unica en toda la tabla (design §2.4): B no puede tener la MISMA clave que A.
    // Lo que se mide es que, pidiendo claves que en la tabla existen para B y sin empresa, A no las
    // recibe.
    const r = await conDosEmpresas(prisma, async (tx, a, b) => {
      const sufijo = randomUUID();
      const t = await sembrarTres(tx, a, b, sufijo);
      await comoApp(tx, a);
      const encontrados = await repoDe(tx).findByDedupeKeys([
        `sl19-a-${sufijo}`,
        `sl19-b-${sufijo}`,
        `sl19-n-${sufijo}`,
      ]);
      await comoDueno(tx);
      const existen = await filasDe(tx, [t.deA, t.deB, t.sinEmpresa]);
      return { t, ids: encontrados.map((j) => j.id), existen: existen.length };
    });
    expect(r.existen).toBe(3);
    expect(r.ids).toEqual([r.t.deA]);
  });
});
