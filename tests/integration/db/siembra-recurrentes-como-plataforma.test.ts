import { describe, it, expect, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { sembrarJobsRecurrentesEnBase, SIEMBRAS_RECURRENTES } from "@/scripts/siembra-jobs-recurrentes";

// SL-17 (hotfix del build de Vercel) — la siembra de los jobs recurrentes corre en el paso de
// despliegue (`scripts/migrate-deploy.ts`), fuera de toda peticion: no hay sesion de la que sacar
// la empresa. Con la extension de aislamiento, el `$queryRaw` de `JobRepository.enqueue` sin
// contexto moria con `EmpresaNoResuelta` y el build de Vercel caia en la siembra.
//
// Lo que se mide aqui, sin dobles: la funcion de entrada REAL (`sembrarJobsRecurrentesEnBase`),
// con el cliente REAL de la app (`getPrismaClient()`, con la extension puesta) contra la base de
// `DATABASE_URL`. Tiene que terminar, y cada fila que siembre tiene que quedar con
// `organizacion_id` NULL: un recurrente sin empresa es el que el drenador itera con
// `paraCadaEmpresa` (design §6.2, R16). Si quedara con una empresa, solo correria para esa.
//
// Las filas se COMMITEAN (la funcion abre su propio cliente), asi que todo, de la siembra a la
// limpieza, va bajo el lock de escritura real: un `down.sql` de `job_tipo` serializado no puede ver
// estas filas vivas. El `now` es de 2031 para que las `dedupe_key` no choquen con las de una
// siembra real de la misma base; al acabar se borran justo las filas que sembro este test.

const AHORA = new Date("2031-03-10T15:00:00.000Z");

const describeDb = HAY_BASE_DE_DATOS ? describe : describe.skip;
let prisma: PrismaClient | null = null;

afterAll(async () => {
  await prisma?.$disconnect();
});

type FilaJob = { tipo: string; organizacion_id: string | null };

describeDb("SL-17 · la siembra de recurrentes del despliegue corre como plataforma", () => {
  it("sembrarJobsRecurrentesEnBase termina sin empresa en contexto y deja las filas con organizacion_id NULL", async () => {
    prisma ??= crearPrismaDeTest();
    const cliente = prisma;

    await bajoLockDeEscrituraReal(async () => {
      const resultados = await sembrarJobsRecurrentesEnBase(AHORA);
      const claves = resultados
        .filter((r) => r.creada)
        .map((r) => r.dedupeKey)
        .filter((k): k is string => k !== null);
      try {
        // Un resultado por siembra registrada, y todas nuevas: con `now` en 2031 ninguna existia.
        expect(resultados.map((r) => r.tipo)).toEqual(SIEMBRAS_RECURRENTES.map((s) => s.tipo));
        expect(resultados.every((r) => r.creada)).toBe(true);
        expect(claves).toHaveLength(SIEMBRAS_RECURRENTES.length);

        const filas = await cliente.$queryRawUnsafe<FilaJob[]>(
          `SELECT "tipo"::text AS tipo, "organizacion_id" FROM "jobs" WHERE "dedupe_key" = ANY($1::text[]) ORDER BY "tipo"`,
          claves,
        );
        expect(filas).toHaveLength(SIEMBRAS_RECURRENTES.length);
        expect(filas.map((f) => f.organizacion_id)).toEqual(filas.map(() => null));

        // Idempotente tambien por este camino: la segunda siembra del mismo instante no crea nada.
        const segunda = await sembrarJobsRecurrentesEnBase(AHORA);
        expect(segunda.some((r) => r.creada)).toBe(false);
      } finally {
        if (claves.length > 0) {
          await cliente.$executeRawUnsafe(`DELETE FROM "jobs" WHERE "dedupe_key" = ANY($1::text[])`, claves);
        }
      }
    });
  });
});
