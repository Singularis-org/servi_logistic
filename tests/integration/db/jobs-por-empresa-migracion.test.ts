import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";

import { HAY_BASE_DE_DATOS, urlDeBaseDeDatos } from "./_postgres-real";

/**
 * SL-19 / T2.2 (design §2.1, §6) — R11: `20261025150000_jobs_por_empresa` de ida y vuelta contra
 * Postgres real. Sobre la base ya migrada: `down.sql` → solo `jobs_abierta`, abierta como en SL-17
 * M1; `migration.sql` otra vez → las politicas de `jobs` iguales que tras la primera aplicacion.
 *
 * Se mide en `pg_policies`, no leyendo el SQL: comparar el down con el texto del up estaria verde
 * aunque Postgres hiciera otra cosa.
 *
 * POR QUE EN UNA TRANSACCION REVERTIDA DE LA BASE COMPARTIDA Y NO EN UNA BASE PROPIA (como SL-17 y
 * SL-38): la migracion solo toca las politicas de UNA tabla, y todo el DDL de Postgres es
 * transaccional. Los `BEGIN`/`COMMIT` del archivo se quitan para que no cierren la transaccion del
 * test. El `LOCK TABLE` va primero: los demas archivos que leen `jobs` a la vez esperan al
 * `ROLLBACK` en vez de ver la tabla con la politica abierta, y no hay ciclo de espera posible porque
 * esta transaccion no pide ningun otro lock de tabla.
 *
 * Mutacion que lo pone rojo (design §6): quitar el `CREATE POLICY "jobs_abierta"` del `down.sql`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const CARPETA = path.resolve(__dirname, "../../../db/migrations/20261025150000_jobs_por_empresa");

interface Conexion {
  query(texto: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

let db: Conexion;

beforeAll(async () => {
  const adaptador = await new PrismaPg({ connectionString: urlDeBaseDeDatos() as string, max: 1 }).connect();
  db = adaptador.underlyingDriver() as unknown as Conexion;
});

afterAll(async () => {
  await db?.end();
});

/** El archivo sin sus `BEGIN;`/`COMMIT;`, para correrlo dentro de la transaccion del test. */
function cuerpoDe(archivo: "migration.sql" | "down.sql"): string {
  const sql = readFileSync(path.join(CARPETA, archivo), "utf8");
  const cuerpo = sql.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, "");
  expect(cuerpo, `${archivo} no traia BEGIN/COMMIT que quitar`).not.toBe(sql);
  expect(/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(cuerpo), `${archivo}: queda un control de transaccion`).toBe(false);
  return cuerpo;
}

interface Politica {
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

async function politicasDeJobs(): Promise<Politica[]> {
  const { rows } = await db.query(
    `SELECT policyname, permissive, roles::text AS roles, cmd, qual, with_check
       FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' ORDER BY policyname`,
  );
  return rows as unknown as Politica[];
}

describeSiHayBase("SL-19 — jobs_por_empresa de ida y vuelta (R11)", () => {
  it("R11 — la migracion trae su down.sql", () => {
    expect(existsSync(path.join(CARPETA, "migration.sql"))).toBe(true);
    expect(existsSync(path.join(CARPETA, "down.sql"))).toBe(true);
  });

  it("R11 — up → down deja solo jobs_abierta; down → up deja las politicas igual que la primera vez", async () => {
    await db.query("BEGIN");
    try {
      await db.query(`LOCK TABLE "jobs" IN ACCESS EXCLUSIVE MODE`);
      const conMigracion = await politicasDeJobs();
      // Precondicion: la base esta migrada con SL-19. Si no, lo de abajo no mediria R11.
      expect(conMigracion.map((p) => p.policyname)).toEqual(["jobs_por_empresa"]);
      expect(conMigracion[0]).toMatchObject({ permissive: "PERMISSIVE", roles: "{servi_app}", cmd: "ALL" });
      expect(conMigracion[0].qual).toMatch(/organizacion_id = NULLIF\(current_setting\('app\.organizacion_id'/);
      expect(conMigracion[0].with_check).toBe(conMigracion[0].qual);

      await db.query(cuerpoDe("down.sql"));
      expect(await politicasDeJobs()).toEqual([
        {
          policyname: "jobs_abierta",
          permissive: "PERMISSIVE",
          roles: "{servi_app}",
          cmd: "ALL",
          qual: "true",
          with_check: "true",
        },
      ]);

      await db.query(cuerpoDe("migration.sql"));
      expect(await politicasDeJobs()).toEqual(conMigracion);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
