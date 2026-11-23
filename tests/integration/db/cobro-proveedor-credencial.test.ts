import { randomUUID } from "node:crypto";

import { RolValue, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AnilloDeClaves } from "@/lib/config/integraciones";
import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import type { TrioCredencialCobro } from "@/lib/interfaces/external/IProveedorCobro";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroCredencialRepository } from "@/lib/repositories/CobroCredencialRepository";
import { CobroCredencialService, crearLectorCredencialesCobro } from "@/lib/services/CobroCredencialService";
import { ProveedorCobroError } from "@/lib/types/cobro";
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-227 T2.4 (design §8; R5, R7, R8, R9) — el servicio, el repositorio y el lector reales, con la bóveda real.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Todo dentro de `revertida`: el repositorio recibe la transacción del dueño (sin extensión), así que su
// `comoPlataforma` solo deja el rastro y nada sale de la transacción.
//
// Mutación medida (design §12, n.º 5): el contexto de la bóveda sin el id de la fila ⇒ cae el caso R7 de la copia
// entre tríos (progress/impl_SLT-227.md).

const ANILLO: AnilloDeClaves = { activa: "v1", claves: new Map([["v1", Buffer.alloc(32, 0x27)]]) };
const SUPERADMIN: Actor = { usuarioId: "u-superadmin-227", rol: RolValue.superadmin };
const API_KEY_1 = "sk_test_PRIMERA_227";
const API_KEY_2 = "sk_test_SEGUNDA_227";
const WEBHOOK = `whsec_${"c0ffee".repeat(10)}c0ff`;

type ClienteDelRepositorio = ConstructorParameters<typeof CobroCredencialRepository>[0];

function enTx(tx: TxDeTest, reloj: { ahora: Date }) {
  const repo = new CobroCredencialRepository(tx as unknown as ClienteDelRepositorio);
  const cifrador = new BovedaIntegraciones(() => ANILLO);
  const servicio = new CobroCredencialService({
    repo,
    cifrador,
    fuente: { nuevoId: () => randomUUID() },
    ahora: () => reloj.ahora,
  });
  return { repo, servicio, leer: crearLectorCredencialesCobro({ repo, cifrador }) };
}

interface FilaDeRebill {
  id: string;
  entorno: string;
  secretos: Record<string, string>;
  actualizado_por: string | null;
  updated_at: string;
}

function filasDe(tx: TxDeTest, pais: string): Promise<FilaDeRebill[]> {
  return tx.$queryRawUnsafe<FilaDeRebill[]>(
    `SELECT "id", "entorno", "secretos", "actualizado_por",
            to_char("updated_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updated_at"
       FROM "${TABLA}" WHERE "proveedor" = 'rebill' AND "pais_id" = $1 ORDER BY "entorno"`,
    pais,
  );
}

function contar(tx: TxDeTest): Promise<number> {
  return tx
    .$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${TABLA}"`)
    .then(([f]) => f.n);
}

const entradaDe = (pais: string, entorno: "sandbox" | "produccion", apiKey: string) => ({
  proveedor: "rebill",
  paisId: pais,
  entorno,
  secretos: { apiKey, secretoWebhook: WEBHOOK },
});

const trioDe = (pais: string, entorno: "sandbox" | "produccion"): TrioCredencialCobro => ({
  proveedor: "rebill",
  paisId: pais,
  entorno,
});

describeSiHayBase("SLT-227 T2.4 — guardar, leer y consultar las credenciales con la bóveda real (Postgres)", () => {
  beforeAll(() => {
    // Cliente propio: el `afterAll` del bloque de arriba ya desconectó el suyo.
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R5: guardar cifra los dos campos; el lector los devuelve en claro y ninguna columna lleva un valor", async () => {
    const r = await revertida(base, async (tx) => {
      const pais = await unPais(tx);
      const { servicio, leer } = enTx(tx, { ahora: new Date("2026-11-21T10:00:00.000Z") });
      const guardado = await servicio.guardar(SUPERADMIN, entradaDe(pais, "sandbox", API_KEY_1));
      const [fila] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${TABLA}" WHERE "proveedor" = 'rebill' AND "pais_id" = $1 AND "entorno" = 'sandbox'`,
        pais,
      );
      return { pais, guardado, fila, leido: await leer(trioDe(pais, "sandbox")) };
    });
    expect(r.pais).toMatch(/^[A-Z]{2}$/);
    expect(r.guardado).toEqual({ estado: "ok", campos: ["apiKey", "secretoWebhook"] });
    const secretos = r.fila.secretos as Record<string, string>;
    expect(Object.keys(secretos).sort()).toEqual(["apiKey", "secretoWebhook"]);
    for (const valor of Object.values(secretos)) expect(valor).toMatch(/^v1:/);
    const textoDeLaFila = JSON.stringify(r.fila);
    expect(textoDeLaFila).not.toContain(API_KEY_1);
    expect(textoDeLaFila).not.toContain(WEBHOOK);
    expect(r.leido).toEqual({ apiKey: API_KEY_1, secretoWebhook: WEBHOOK });
  });

  it("R8: guardar dos veces reemplaza sin otra fila y registra quién y cuándo", async () => {
    const r = await revertida(base, async (tx) => {
      const pais = await unPais(tx);
      const reloj = { ahora: new Date("2026-11-21T10:00:00.000Z") };
      const { servicio, leer } = enTx(tx, reloj);
      const primero = await servicio.guardar(SUPERADMIN, entradaDe(pais, "sandbox", API_KEY_1));
      const antes = await filasDe(tx, pais);
      reloj.ahora = new Date("2026-11-21T11:30:00.250Z");
      const otro: Actor = { ...SUPERADMIN, usuarioId: "u-otro-227" };
      const segundo = await servicio.guardar(otro, entradaDe(pais, "sandbox", API_KEY_2));
      const despues = await filasDe(tx, pais);
      return { primero, segundo, antes, despues, leido: await leer(trioDe(pais, "sandbox")) };
    });
    expect([r.primero.estado, r.segundo.estado]).toEqual(["ok", "ok"]);
    expect(r.antes).toHaveLength(1);
    expect(r.despues).toHaveLength(1);
    expect(r.despues[0].id).toBe(r.antes[0].id);
    expect(r.antes[0]).toMatchObject({ actualizado_por: "u-superadmin-227", updated_at: "2026-11-21T10:00:00.000Z" });
    expect(r.despues[0]).toMatchObject({ actualizado_por: "u-otro-227", updated_at: "2026-11-21T11:30:00.250Z" });
    expect(r.despues[0].secretos.apiKey).not.toBe(r.antes[0].secretos.apiKey);
    expect(r.leido).toEqual({ apiKey: API_KEY_2, secretoWebhook: WEBHOOK });
  });

  it("R8: un país inexistente da pais_no_existe y no escribe nada", async () => {
    const r = await revertida(base, async (tx) => {
      const { servicio } = enTx(tx, { ahora: new Date("2026-11-21T10:00:00.000Z") });
      const [{ existe }] = await tx.$queryRawUnsafe<{ existe: boolean }[]>(
        `SELECT EXISTS (SELECT 1 FROM "pais" WHERE "id" = 'ZZ') AS existe`,
      );
      const antes = await contar(tx);
      // En un SAVEPOINT: el rechazo de la FK aborta la transacción, y después hay que contar.
      await tx.$executeRawUnsafe(`SAVEPOINT pais_no_existe`);
      const guardado = await servicio.guardar(SUPERADMIN, entradaDe("ZZ", "sandbox", API_KEY_1));
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT pais_no_existe`);
      return { existe, guardado, antes, despues: await contar(tx) };
    });
    expect(r.existe).toBe(false);
    expect(r.guardado).toEqual({ estado: "pais_no_existe" });
    expect(r.despues).toBe(r.antes);
  });

  it("R7: un secreto copiado a otro trío o a otro campo da credencial_ilegible", async () => {
    const r = await revertida(base, async (tx) => {
      const pais = await unPais(tx);
      const { servicio, leer } = enTx(tx, { ahora: new Date("2026-11-21T10:00:00.000Z") });
      await servicio.guardar(SUPERADMIN, entradaDe(pais, "sandbox", API_KEY_1));
      await servicio.guardar(SUPERADMIN, entradaDe(pais, "produccion", API_KEY_2));
      // Control: antes de copiar, cada trío se lee con lo suyo.
      const control = [await leer(trioDe(pais, "sandbox")), await leer(trioDe(pais, "produccion"))];

      // La API key cifrada de sandbox, copiada tal cual a la fila de produccion (otro trío, otro id).
      await tx.$executeRawUnsafe(
        `UPDATE "${TABLA}" p SET "secretos" = jsonb_set(p."secretos", '{apiKey}', s."secretos"->'apiKey')
           FROM "${TABLA}" s
          WHERE p."proveedor" = 'rebill' AND p."pais_id" = $1 AND p."entorno" = 'produccion'
            AND s."proveedor" = 'rebill' AND s."pais_id" = $1 AND s."entorno" = 'sandbox'`,
        pais,
      );
      const entreTrios = await leer(trioDe(pais, "produccion")).catch((e: unknown) => e);

      // Dentro de la fila de sandbox, la API key cifrada copiada al campo del webhook.
      await tx.$executeRawUnsafe(
        `UPDATE "${TABLA}" SET "secretos" = jsonb_set("secretos", '{secretoWebhook}', "secretos"->'apiKey')
          WHERE "proveedor" = 'rebill' AND "pais_id" = $1 AND "entorno" = 'sandbox'`,
        pais,
      );
      const entreCampos = await leer(trioDe(pais, "sandbox")).catch((e: unknown) => e);
      return { control, entreTrios, entreCampos };
    });
    expect(r.control).toEqual([
      { apiKey: API_KEY_1, secretoWebhook: WEBHOOK },
      { apiKey: API_KEY_2, secretoWebhook: WEBHOOK },
    ]);
    expect(r.entreTrios, "copia entre tríos").toBeInstanceOf(ProveedorCobroError);
    expect(r.entreTrios).toMatchObject({ codigo: "credencial_ilegible", proveedor: "rebill" });
    expect(r.entreCampos, "copia entre campos").toBeInstanceOf(ProveedorCobroError);
    expect(r.entreCampos).toMatchObject({ codigo: "credencial_ilegible", proveedor: "rebill" });
    expect(String(r.entreTrios) + String(r.entreCampos)).not.toContain(API_KEY_1);
  });

  it("R9: estado devuelve los campos y el último cambio, y ningún valor; un trío sin fila, configurada: false", async () => {
    const r = await revertida(base, async (tx) => {
      const pais = await unPais(tx);
      const { servicio } = enTx(tx, { ahora: new Date("2026-11-21T12:00:00.000Z") });
      await servicio.guardar(SUPERADMIN, entradaDe(pais, "sandbox", API_KEY_1));
      const [fila] = await filasDe(tx, pais);
      return {
        fila,
        conFila: await servicio.estado(SUPERADMIN, trioDe(pais, "sandbox")),
        sinFila: await servicio.estado(SUPERADMIN, trioDe(pais, "produccion")),
      };
    });
    expect(r.conFila).toEqual({
      estado: "ok",
      configurada: true,
      campos: ["apiKey", "secretoWebhook"],
      actualizadoAt: new Date("2026-11-21T12:00:00.000Z"),
      actualizadoPor: "u-superadmin-227",
    });
    expect(r.sinFila).toEqual({ estado: "ok", configurada: false });
    const texto = JSON.stringify(r.conFila);
    for (const prohibido of [API_KEY_1, WEBHOOK, "v1:", ...Object.values(r.fila.secretos)]) {
      expect(texto).not.toContain(prohibido);
    }
  });
});
