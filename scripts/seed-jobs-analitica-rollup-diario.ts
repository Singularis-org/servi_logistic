import { pathToFileURL } from "node:url";
import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { recurrenciaAnaliticaRollupDiario } from "@/lib/services/jobs/analitica-rollup-diario-handler";

// Feature 124 (D4->C1, R36) — seed inicial IDEMPOTENTE de la PRIMERA fila
// `analitica_rollup_diario`. Siembra la proxima corrida (proximas 00:30 locales de la zona que
// antes llega, SLT-42) con la MISMA `dedupe_key` que la recurrencia: la zona y la FECHA QUE ESA
// CORRIDA AGREGARA (D-1 respecto de la corrida, no la
// fecha de la corrida). `enqueue` hace `ON CONFLICT DO NOTHING`, asi que re-ejecutarlo NO
// duplica. Payload vacio `{}`: el handler deriva la fecha objetivo de `now` al ejecutar. A
// partir de ahi la cola se auto-perpetua (la recurrencia re-agenda cada corrida). Recibe el
// repo por parametro para testear sin conexion real.
//
// Este script NO nombra la tabla del rollup ni la consulta de ninguna forma: solo encola.
//
// SLT-42 (design §6.1; R25): `zonas` son las de los paises con empresas
// (`IPaisRepository.zonasConEmpresas`), las mismas que la cola le pasa a la recurrencia.
export async function seedJobAnaliticaRollupDiario(
  repo: IJobRepository,
  now: Date,
  zonas: readonly string[],
): Promise<JobDTO | null> {
  const { runAfter, dedupeKey } = recurrenciaAnaliticaRollupDiario.siguiente(now, zonas);
  return repo.enqueue("analitica_rollup_diario", {}, { runAfter, dedupeKey });
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }

  const prisma = getPrismaClient();
  try {
    // SL-17: script de consola, sin sesion: la siembra va en plataforma y la fila nace sin
    // empresa, como la del build (`scripts/siembra-jobs-recurrentes.ts`).
    const zonas = await new PaisRepository(prisma).zonasConEmpresas();
    const fila = await comoPlataforma("SL-17", "siembra manual de un job recurrente", () =>
      seedJobAnaliticaRollupDiario(new JobRepository(prisma), new Date(), zonas),
    );
    console.log(
      fila === null
        ? "Seed analitica_rollup_diario: la fila ya existia (idempotente, sin cambios)."
        : `Seed analitica_rollup_diario: fila sembrada (run_after=${fila.runAfter.toISOString()}, dedupe_key=${fila.dedupeKey ?? "-"}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Solo auto-ejecuta cuando este archivo es el entrypoint (no cuando un test lo importa).
const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error("Fallo el seed de analitica_rollup_diario:", error);
    process.exit(1);
  });
}
