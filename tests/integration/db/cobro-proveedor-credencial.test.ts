import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { sentenciasDe, sqlDe } from "./_fixtures/ida-y-vuelta-32";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-227 (design §1, §1.1; R5, R6) — LAS CREDENCIALES DE LOS PROVEEDORES DE COBRO, contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `cobro_proveedor_credencial` es de plataforma: todo cabe en transacciones del dueño que se revierten
// (`revertida`), sin limpiar nada. Lo que se mide aquí es la base: el CHECK de forma cifrada y el único del trío
// (R5), que `servi_app` no la toca (R6) y la migración de ida y vuelta, con el `down` que aborta con filas.
//
// La ida y vuelta corre DENTRO de la transacción revertida: el DDL de Postgres es transaccional, así que bajar y
// volver a subir no deja rastro en la base compartida y no hace falta una base propia.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const MIGRACION = "20261127120000_cobro_proveedor_credencial";
const TABLA = "cobro_proveedor_credencial";

/** Un valor con la forma de la bóveda (`v<n>:<iv 12 B>:<tag 16 B>:<cifrado>`), sin ser un cifrado real. */
const CIFRADO = "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AAAA";

let base: PrismaClient;

async function unPais(tx: TxDeTest): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "pais" ORDER BY "id" LIMIT 1`);
  return f.id;
}

function insertar(tx: TxDeTest, paisId: string, secretos: unknown, entorno = "sandbox", proveedor = "rebill") {
  return tx.$executeRawUnsafe(
    `INSERT INTO "${TABLA}" ("id", "proveedor", "pais_id", "entorno", "secretos", "updated_at")
     VALUES ($1, $2, $3, $4, $5::jsonb, now() AT TIME ZONE 'UTC')`,
    randomUUID(),
    proveedor,
    paisId,
    entorno,
    JSON.stringify(secretos),
  );
}

async function errorEnTx(tx: TxDeTest, fn: () => Promise<unknown>): Promise<string | null> {
  const e = await capturar(tx, fn);
  return e === null ? null : sqlstateDe(e);
}

/** Corre un archivo de la migración sentencia a sentencia, sin su `BEGIN`/`COMMIT`: la transacción es la del test. */
async function correr(tx: TxDeTest, archivo: "migration.sql" | "down.sql"): Promise<void> {
  for (const s of sentenciasDe(sqlDe(MIGRACION, archivo))) {
    if (/^(BEGIN|COMMIT)$/i.test(s)) continue;
    await tx.$executeRawUnsafe(s);
  }
}

/** Lo que la migración define de la tabla: columnas, restricciones, índices, RLS, políticas y privilegios. */
async function catalogo(tx: TxDeTest): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT 'col ' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || COALESCE(column_default, '-') AS l
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1
     UNION ALL
     SELECT 'con ' || conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = to_regclass($1)
     UNION ALL
     SELECT 'idx ' || indexname || ' ' || indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1
     UNION ALL
     SELECT 'rls ' || relrowsecurity::text FROM pg_class WHERE oid = to_regclass($1)
     UNION ALL
     SELECT 'pol ' || policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = $1
     UNION ALL
     SELECT 'priv ' || grantee || ' ' || privilege_type FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = $1`,
    TABLA,
  );
  return filas.map((f) => f.l).sort();
}

describeSiHayBase("SLT-227 — las credenciales de los proveedores de cobro: cifradas, una por trío y sin acceso de la empresa (Postgres)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("control: la tabla existe con RLS encendida, sin políticas, y una fila con la forma cifrada entra", async () => {
    const r = await revertida(base, async (tx) => {
      const cat = await catalogo(tx);
      const ok = await errorEnTx(tx, async () => insertar(tx, await unPais(tx), { apiKey: CIFRADO, secretoWebhook: CIFRADO }));
      return { cat, ok };
    });
    expect(r.cat).toContain("rls true");
    expect(r.cat.filter((l) => l.startsWith("pol "))).toEqual([]);
    expect(r.cat.some((l) => l.startsWith(`idx ${TABLA}_trio_key CREATE UNIQUE INDEX`))).toBe(true);
    expect(r.ok).toBeNull();
  });

  /* ---------------------------------- R5 ------------------------------------ */

  it("R5: el dueño no puede escribir un secreto en claro, un valor que no es texto ni un objeto vacío (23514)", async () => {
    const r = await revertida(base, async (tx) => {
      const pais = await unPais(tx);
      return {
        enClaro: await errorEnTx(tx, () => insertar(tx, pais, { apiKey: "sk_en_claro", secretoWebhook: CIFRADO })),
        unoEnClaro: await errorEnTx(tx, () => insertar(tx, pais, { apiKey: CIFRADO, secretoWebhook: "whsec_x" })),
        noTexto: await errorEnTx(tx, () => insertar(tx, pais, { apiKey: 1 })),
        vacio: await errorEnTx(tx, () => insertar(tx, pais, {})),
        lista: await errorEnTx(tx, () => insertar(tx, pais, [CIFRADO])),
        // Y el UPDATE tampoco: el CHECK corre en las dos escrituras.
        actualizar: await errorEnTx(tx, async () => {
          await insertar(tx, pais, { apiKey: CIFRADO }, "produccion");
          await tx.$executeRawUnsafe(
            `UPDATE "${TABLA}" SET "secretos" = '{"apiKey":"sk_en_claro"}'::jsonb WHERE "pais_id" = $1 AND "entorno" = 'produccion'`,
            pais,
          );
        }),
      };
    });
    expect(r).toEqual({
      enClaro: "23514",
      unoEnClaro: "23514",
      noTexto: "23514",
      vacio: "23514",
      lista: "23514",
      actualizar: "23514",
    });
  });

  it("R5: un trío, una fila — un segundo (proveedor, país, entorno) igual da 23505; otro entorno u otro proveedor, no", async () => {
    const r = await revertida(base, async (tx) => {
      const pais = await unPais(tx);
      const primero = await errorEnTx(tx, () => insertar(tx, pais, { apiKey: CIFRADO }));
      const repetido = await errorEnTx(tx, () => insertar(tx, pais, { apiKey: CIFRADO }));
      const otroEntorno = await errorEnTx(tx, () => insertar(tx, pais, { apiKey: CIFRADO }, "produccion"));
      const otroProveedor = await errorEnTx(tx, () => insertar(tx, pais, { apiKey: CIFRADO }, "sandbox", "wompi"));
      const entornoInventado = await errorEnTx(tx, () => insertar(tx, pais, { apiKey: CIFRADO }, "staging"));
      const paisInexistente = await errorEnTx(tx, () => insertar(tx, "ZZ", { apiKey: CIFRADO }));
      return { primero, repetido, otroEntorno, otroProveedor, entornoInventado, paisInexistente };
    });
    expect(r).toEqual({
      primero: null,
      repetido: "23505",
      otroEntorno: null,
      otroProveedor: null,
      entornoInventado: "23514",
      paisInexistente: "23503",
    });
  });

  /* ---------------------------------- R6 ------------------------------------ */

  it("R6: como servi_app, leer y escribir cobro_proveedor_credencial da 42501 (SELECT, INSERT, UPDATE y DELETE)", async () => {
    const r = await revertida(base, async (tx) => {
      const pais = await unPais(tx);
      await insertar(tx, pais, { apiKey: CIFRADO });
      const { id: org } = await crearOrganizacion(tx);
      await comoApp(tx, org);
      const res = {
        leer: await errorEnTx(tx, () => tx.$queryRawUnsafe(`SELECT count(*) FROM "${TABLA}"`)),
        insertar: await errorEnTx(tx, () => insertar(tx, pais, { apiKey: CIFRADO }, "produccion")),
        cambiar: await errorEnTx(tx, () => tx.$executeRawUnsafe(`UPDATE "${TABLA}" SET "actualizado_por" = 'x'`)),
        borrar: await errorEnTx(tx, () => tx.$executeRawUnsafe(`DELETE FROM "${TABLA}"`)),
      };
      await tx.$executeRawUnsafe(`RESET ROLE`);
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${TABLA}" WHERE "pais_id" = $1 AND "actualizado_por" IS NULL`,
        pais,
      );
      return { ...res, filasIntactas: n };
    });
    expect(r).toEqual({ leer: "42501", insertar: "42501", cambiar: "42501", borrar: "42501", filasIntactas: 1 });
  });

  /* ------------------------------ la migración ------------------------------- */

  it("la migración va detrás de 20261126120100_mora_congelamiento y su nombre no lleva «125»", () => {
    expect(MIGRACION > "20261126120100_mora_congelamiento").toBe(true);
    expect(MIGRACION).not.toContain("125");
  });

  it("ida y vuelta: el down quita la tabla sin filas, y la migración la deja igual que antes", async () => {
    const r = await revertida(base, async (tx) => {
      const antes = await catalogo(tx);
      await correr(tx, "down.sql");
      const [{ existe }] = await tx.$queryRawUnsafe<{ existe: boolean }[]>(
        `SELECT to_regclass($1) IS NOT NULL AS existe`,
        TABLA,
      );
      await correr(tx, "migration.sql");
      return { antes, existe, despues: await catalogo(tx) };
    });
    expect(r.antes.length).toBeGreaterThan(10);
    expect(r.existe).toBe(false);
    expect(r.despues).toEqual(r.antes);
  });

  it("el down aborta con filas y no borra nada", async () => {
    const r = await revertida(base, async (tx) => {
      await insertar(tx, await unPais(tx), { apiKey: CIFRADO });
      const e = await capturar(tx, () => correr(tx, "down.sql"));
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${TABLA}"`);
      return { codigo: e === null ? null : sqlstateDe(e), mensaje: String((e as Error | null)?.message ?? ""), n };
    });
    expect(r.codigo).toBe("P0001");
    expect(r.mensaje).toContain("rollback SLT-227");
    expect(r.n).toBeGreaterThanOrEqual(1);
  });
});
