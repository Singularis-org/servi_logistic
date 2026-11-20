import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { AHORA_SQL, PROVEEDOR } from "./_fixtures/cobro";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-226 (design §1.2, §3.8, §8) — LOS EVENTOS DEL PROVEEDOR (capa 2 de la idempotencia), contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `cobro_webhook_evento` es de plataforma: sin empresa y sin FK, así que todo cabe en transacciones del dueño que se
// revierten (`revertida`) y no hace falta limpiar nada. Cada caso usa un `log_id` propio.
//
// Lo que se mide es la base: el único (proveedor, log_id), lo que se guarda y lo que no (R12), los tres resultados
// de `cobro_evento_registrar` y el cierre una sola vez (R13), el trigger de inmutabilidad y que `servi_app` no lo
// toca (R26). Que el servicio ignore un `repetido` sin consultar al proveedor lo afirma
// `tests/unit/services/cobro-intento-service.test.ts`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const logId = () => `log-${randomUUID()}`;

interface EventoLeido {
  proveedor: string;
  logId: string;
  tipo: string;
  pagoProveedorId: string | null;
  intentoId: string | null;
  recibido: boolean;
  procesado: boolean;
  resultado: string | null;
}

async function registrar(c: TxDeTest, log: string, tipo = "payment.updated", pago: string | null = "pp-1"): Promise<string> {
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT cobro_evento_registrar($1, $2, $3, $4, ${AHORA_SQL}) AS r`,
    PROVEEDOR,
    log,
    tipo,
    pago,
  );
  return f.r;
}

async function cerrar(c: TxDeTest, log: string, resultado: string, intentoId: string | null = null): Promise<string> {
  const [f] = await c.$queryRawUnsafe<{ r: string }[]>(
    `SELECT cobro_evento_cerrar($1, $2, $3, $4, ${AHORA_SQL}) AS r`,
    PROVEEDOR,
    log,
    resultado,
    intentoId,
  );
  return f.r;
}

async function leer(c: TxDeTest, log: string): Promise<EventoLeido[]> {
  return c.$queryRawUnsafe<EventoLeido[]>(
    `SELECT "proveedor", "log_id" AS "logId", "tipo", "pago_proveedor_id" AS "pagoProveedorId", "intento_id" AS "intentoId",
            "recibido_at" IS NOT NULL AS "recibido", "procesado_at" IS NOT NULL AS "procesado", "resultado"
       FROM "cobro_webhook_evento" WHERE "proveedor" = $1 AND "log_id" = $2`,
    PROVEEDOR,
    log,
  );
}

/** La fila entera en texto: para afirmar que una llamada no cambió nada, ni la hora. */
async function foto(c: TxDeTest, log: string): Promise<string> {
  const [f] = await c.$queryRawUnsafe<{ t: string }[]>(
    `SELECT e::text AS t FROM "cobro_webhook_evento" e WHERE e."proveedor" = $1 AND e."log_id" = $2`,
    PROVEEDOR,
    log,
  );
  return f.t;
}

async function errorEnTx(tx: TxDeTest, fn: () => Promise<unknown>): Promise<string | null> {
  const e = await capturar(tx, fn);
  return e === null ? null : sqlstateDe(e);
}

describeSiHayBase("SLT-226 — los eventos del proveedor: una vez por (proveedor, logId), sin datos sensibles y sin acceso de la empresa (Postgres)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("control: la tabla, su único y las dos funciones existen", async () => {
    const funciones = await base.$queryRawUnsafe<{ proname: string }[]>(
      `SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
      ["cobro_evento_registrar", "cobro_evento_cerrar", "cobro_webhook_evento_inmutable"],
    );
    expect(funciones).toHaveLength(3);
    const [indice] = await base.$queryRawUnsafe<{ def: string }[]>(
      `SELECT indexdef AS def FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'cobro_webhook_evento_proveedor_log_key'`,
    );
    expect(indice.def).toMatch(/UNIQUE INDEX .* \(proveedor, log_id\)/);
  });

  /* ------------------------------ lo que se guarda (R12) --------------------- */

  it("R12: guarda el evento una vez con su tipo, el pago al que se refiere y la hora de llegada; la tabla no tiene columnas para el cuerpo ni para datos de la tarjeta o del pagador", async () => {
    const columnas = await base.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cobro_webhook_evento' ORDER BY column_name`,
    );
    expect(columnas.map((c) => c.column_name)).toEqual([
      "id",
      "intento_id",
      "log_id",
      "pago_proveedor_id",
      "procesado_at",
      "proveedor",
      "recibido_at",
      "resultado",
      "tipo",
    ]);

    const log = logId();
    const r = await revertida(base, async (tx) => ({ registro: await registrar(tx, log, "payment.updated", "pp-12"), filas: await leer(tx, log) }));
    expect(r.registro).toBe("nuevo");
    expect(r.filas).toEqual([
      { proveedor: PROVEEDOR, logId: log, tipo: "payment.updated", pagoProveedorId: "pp-12", intentoId: null, recibido: true, procesado: false, resultado: null },
    ]);
  });

  it("R12: el único (proveedor, log_id) también para el dueño que inserta a mano (23505), y solo se admite el proveedor conocido (23514)", async () => {
    const log = logId();
    const r = await revertida(base, async (tx) => {
      await registrar(tx, log);
      const insertar = (proveedor: string, l: string) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "cobro_webhook_evento" ("proveedor", "log_id", "tipo", "recibido_at") VALUES ($1, $2, 'x', ${AHORA_SQL})`,
          proveedor,
          l,
        );
      return {
        repetido: await errorEnTx(tx, () => insertar(PROVEEDOR, log)),
        otroProveedor: await errorEnTx(tx, () => insertar("otro", logId())),
        otroLog: await errorEnTx(tx, () => insertar(PROVEEDOR, logId())),
        filas: (await leer(tx, log)).length,
      };
    });
    expect(r).toEqual({ repetido: "23505", otroProveedor: "23514", otroLog: null, filas: 1 });
  });

  /* ------------------------- repetido y pendiente (R13) ---------------------- */

  it("R13: si llegó antes y su proceso no terminó responde `pendiente` (se procesa otra vez) sin escribir otra fila ni cambiar la que hay", async () => {
    const log = logId();
    const r = await revertida(base, async (tx) => {
      await registrar(tx, log, "payment.updated", "pp-13");
      const antes = await foto(tx, log);
      const otraVez = await registrar(tx, log, "payment.created", "pp-otro");
      return { otraVez, igual: (await foto(tx, log)) === antes, filas: (await leer(tx, log)).length };
    });
    expect(r).toEqual({ otraVez: "pendiente", igual: true, filas: 1 });
  });

  it("R13: cerrado, el mismo (proveedor, logId) responde `repetido` y nada cambia; el cierre es una sola vez (`ya_cerrado`)", async () => {
    const log = logId();
    const intento = randomUUID();
    const r = await revertida(base, async (tx) => {
      await registrar(tx, log, "payment.updated", "pp-13b");
      const cierre = await cerrar(tx, log, "aplicado", intento);
      const cerrado = await foto(tx, log);
      const otraVez = await registrar(tx, log, "payment.updated", "pp-13b");
      const segundoCierre = await cerrar(tx, log, "requiere_revision", randomUUID());
      return {
        cierre,
        otraVez,
        segundoCierre,
        sinCambios: (await foto(tx, log)) === cerrado,
        filas: await leer(tx, log),
        sinEvento: await cerrar(tx, logId(), "aplicado"),
      };
    });
    expect(r).toMatchObject({ cierre: "ok", otraVez: "repetido", segundoCierre: "ya_cerrado", sinCambios: true, sinEvento: "sin_evento" });
    expect(r.filas).toEqual([
      { proveedor: PROVEEDOR, logId: log, tipo: "payment.updated", pagoProveedorId: "pp-13b", intentoId: intento, recibido: true, procesado: true, resultado: "aplicado" },
    ]);
  });

  it("R13: lo recibido no cambia, y la hora, el resultado y el intento del cierre solo pasan de vacío a un valor (SL226); el cierre va con hora y resultado juntos (23514)", async () => {
    const log = logId();
    const r = await revertida(base, async (tx) => {
      await registrar(tx, log);
      const cambio = (set: string, ...args: unknown[]) =>
        errorEnTx(tx, () => tx.$executeRawUnsafe(`UPDATE "cobro_webhook_evento" SET ${set} WHERE "proveedor" = $1 AND "log_id" = $2`, PROVEEDOR, log, ...args));
      return {
        tipo: await cambio(`"tipo" = 'otro'`),
        pago: await cambio(`"pago_proveedor_id" = 'otro'`),
        recibido: await cambio(`"recibido_at" = "recibido_at" - interval '1 minute'`),
        logId: await cambio(`"log_id" = $3`, logId()),
        soloResultado: await cambio(`"resultado" = 'aplicado'`),
        cierre: await cerrar(tx, log, "sin_cambio"),
        otroResultado: await cambio(`"resultado" = 'aplicado'`),
        otraHora: await cambio(`"procesado_at" = "procesado_at" + interval '1 minute'`),
        intentoPrimero: await cambio(`"intento_id" = $3`, randomUUID()),
        intentoOtro: await cambio(`"intento_id" = $3`, randomUUID()),
        reabrir: await cambio(`"procesado_at" = NULL, "resultado" = NULL`),
      };
    });
    expect(r).toEqual({
      tipo: "SL226",
      pago: "SL226",
      recibido: "SL226",
      logId: "SL226",
      soloResultado: "23514",
      cierre: "ok",
      otroResultado: "SL226",
      otraHora: "SL226",
      intentoPrimero: null,
      intentoOtro: "SL226",
      reabrir: "SL226",
    });
  });

  /* ------------------------------- acceso (R26) ------------------------------ */

  it("R26: como `servi_app` de cualquier empresa, ni se leen ni se escriben los eventos, ni se llaman sus funciones (42501)", async () => {
    const log = logId();
    const r = await revertida(base, async (tx) => {
      await registrar(tx, log);
      const { id: org } = await crearOrganizacion(tx);
      await comoApp(tx, org);
      const res = {
        leer: await errorEnTx(tx, () => tx.$queryRawUnsafe(`SELECT count(*) FROM "cobro_webhook_evento"`)),
        insertar: await errorEnTx(tx, () =>
          tx.$executeRawUnsafe(`INSERT INTO "cobro_webhook_evento" ("proveedor", "log_id", "tipo", "recibido_at") VALUES ($1, $2, 'x', ${AHORA_SQL})`, PROVEEDOR, logId()),
        ),
        cambiar: await errorEnTx(tx, () => tx.$executeRawUnsafe(`UPDATE "cobro_webhook_evento" SET "resultado" = 'aplicado' WHERE "log_id" = $1`, log)),
        borrar: await errorEnTx(tx, () => tx.$executeRawUnsafe(`DELETE FROM "cobro_webhook_evento" WHERE "log_id" = $1`, log)),
        registrar: await errorEnTx(tx, () => registrar(tx, logId())),
        cerrar: await errorEnTx(tx, () => cerrar(tx, log, "aplicado")),
      };
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { ...res, filas: await leer(tx, log) };
    });
    expect(r).toMatchObject({ leer: "42501", insertar: "42501", cambiar: "42501", borrar: "42501", registrar: "42501", cerrar: "42501" });
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ procesado: false, resultado: null });
  });
});
