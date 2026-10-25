import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import { SQLSTATE_EMPRESA_CRUZADA } from "@/lib/db/contexto-empresa";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-36 T1.3 (design §2.1-2.4; R5, R8, R10, R11) — la migracion `20261025120000_integracion`
// contra Postgres real: RLS activa y con efecto en las dos tablas, y los CHECK que solo la base puede
// sostener.
//
// POR QUE CONTRA LA BASE. RLS y CHECK son hechos del motor: un test de servicio con dobles no los
// ve, y una regex sobre el SQL se satisface reescribiendo la linea.
//
// SIEMBRA OBLIGATORIA. Cada caso crea sus filas en una transaccion que se revierte y, antes de medir
// lo que B no ve, comprueba como dueno que la fila de A esta ahi: ningun caso pasa «porque no habia
// nada». Las dos empresas se crean en `beforeAll`, y si no hay base el archivo sale SKIPPED con
// nombre, no en verde.
//
// Mutaciones medidas (progress/impl_SL-36.md): sin el CHECK `integracion_secretos_cifrados` caen
// los casos de valor en claro; sin la politica, los de `comoApp(B)`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let A: string;
let B: string;

/** Un valor con la forma REAL de la boveda: el CHECK y el cifrador tienen que estar de acuerdo. */
const boveda = new BovedaIntegraciones(() => ({
  activa: "v1",
  claves: new Map([["v1", Buffer.alloc(32, 0x5a)]]),
}));

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transaccion del dueno que siempre se revierte, bajo el lock de escritura real de la 227. */
async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/** SQLSTATE de un error de SQL a mano por Prisma 7 + adapter-pg. */
function sqlstateDe(e: unknown): string {
  const o = e as { message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } };
  const causa = o.meta?.driverAdapterError?.cause;
  return causa?.originalCode ?? causa?.code ?? /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ?? `?? ${String(o.message ?? e).slice(0, 160)}`;
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transaccion del caso. SQLSTATE o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
}

async function secretoValido(id: string, campo: string): Promise<string> {
  return boveda.cifrar(`texto-${campo}`, { organizacionId: A, integracionId: id, campo });
}

const INSERTAR = `INSERT INTO integracion
  (id, servicio, estado, secretos, whatsapp_numero_id, whatsapp_resumen_verificacion)
  VALUES ($1, $2::servicio_integracion, 'conectada', $3::jsonb, $4, $5)`;

const RESUMEN = "a".repeat(64);

/** Inserta, con la empresa ya fijada, una integracion de WhatsApp valida. */
async function insertarWhatsapp(tx: TxDeTest, numero: string, resumen = RESUMEN): Promise<string> {
  const id = randomUUID();
  const secretos = JSON.stringify({
    token_acceso: await secretoValido(id, "token_acceso"),
    app_secret: await secretoValido(id, "app_secret"),
  });
  await tx.$executeRawUnsafe(INSERTAR, id, "whatsapp", secretos, numero, resumen);
  return id;
}

/** Las integraciones de A y B medidas como dueno: `[organizacion_id, servicio]`. */
async function filasDeAyB(tx: TxDeTest): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ organizacion_id: string; servicio: string }[]>(
    `SELECT organizacion_id, servicio::text AS servicio FROM integracion
      WHERE organizacion_id = ANY($1::text[]) ORDER BY organizacion_id, servicio`,
    [A, B],
  );
  // Se ordena por la etiqueta y no por el id: los ids de A y B son UUID al azar.
  return filas.map((f) => `${f.organizacion_id === A ? "A" : "B"}:${f.servicio}`).sort();
}

describeSiHayBase("SL-36 T1.3 — migracion integracion contra Postgres (RLS y CHECK)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    await bajoLockDeEscrituraReal(async () => {
      A = (await crearOrganizacion(base, { nombre: "Empresa A SL36" })).id;
      B = (await crearOrganizacion(base, { nombre: "Empresa B SL36" })).id;
    });
    expect(await base.organizacion.count({ where: { id: { in: [A, B] } } })).toBe(2);
  }, 60_000);

  afterAll(async () => {
    if (A !== undefined && B !== undefined) {
      await bajoLockDeEscrituraReal(async () => {
        for (const tabla of ["integracion", "integracion_prueba_minuto"]) {
          await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE organizacion_id = ANY($1::text[])`, [A, B]);
        }
        await base.$executeRawUnsafe(`DELETE FROM organizacion WHERE id = ANY($1::text[])`, [A, B]);
      });
    }
    await base?.$disconnect();
  }, 60_000);

  /* ------------------------------- RLS activa ------------------------------- */

  it("R8: las dos tablas tienen RLS activa y su politica por empresa para servi_app", async () => {
    const rls = await base.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('integracion', 'integracion_prueba_minuto') AND relkind = 'r' ORDER BY relname`,
    );
    expect(rls).toEqual([
      { relname: "integracion", relrowsecurity: true },
      { relname: "integracion_prueba_minuto", relrowsecurity: true },
    ]);
    const politicas = await base.$queryRawUnsafe<{ tablename: string; policyname: string; roles: string; cmd: string }[]>(
      `SELECT tablename::text, policyname::text, roles::text AS roles, cmd::text FROM pg_policies
        WHERE tablename IN ('integracion', 'integracion_prueba_minuto') ORDER BY tablename`,
    );
    expect(politicas).toEqual([
      { tablename: "integracion", policyname: "integracion_por_empresa", roles: "{servi_app}", cmd: "ALL" },
      {
        tablename: "integracion_prueba_minuto",
        policyname: "integracion_prueba_minuto_por_empresa",
        roles: "{servi_app}",
        cmd: "ALL",
      },
    ]);
  });

  it("R8: con comoApp(B), la integracion de A no se lee, no se edita y no se borra; B ve la suya", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, A);
      const idA = await insertarWhatsapp(tx, `num-a-${randomUUID()}`);
      await fijarEmpresa(tx, B);
      const idB = randomUUID();
      await tx.$executeRawUnsafe(
        INSERTAR,
        idB,
        "google_maps",
        JSON.stringify({ clave_api: await secretoValido(idB, "clave_api") }),
        null,
        null,
      );
      const sembradas = await filasDeAyB(tx);

      await comoApp(tx, B);
      const visibles = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM integracion`);
      const editadas = await tx.$executeRawUnsafe(`UPDATE integracion SET estado = 'error' WHERE id = $1`, idA);
      const borradas = await tx.$executeRawUnsafe(`DELETE FROM integracion WHERE id = $1`, idA);
      const conEmpresaA = await intentar(
        tx,
        `INSERT INTO integracion (id, organizacion_id, servicio, estado, secretos)
         VALUES ($1, $2, 'asistente', 'conectada', '{}'::jsonb)`,
        randomUUID(),
        A,
      );
      await comoDueno(tx);
      const [estadoA] = await tx.$queryRawUnsafe<{ estado: string }[]>(
        `SELECT estado::text AS estado FROM integracion WHERE id = $1`,
        idA,
      );
      return { idB, sembradas, visibles, editadas, borradas, conEmpresaA, estadoA, despues: await filasDeAyB(tx) };
    });
    expect(r.sembradas).toEqual(["A:whatsapp", "B:google_maps"]);
    expect(r.visibles).toEqual([{ id: r.idB }]);
    expect(r.editadas).toBe(0);
    expect(r.borradas).toBe(0);
    expect(r.conEmpresaA).toBe("42501");
    expect(r.estadoA).toEqual({ estado: "conectada" });
    expect(r.despues).toEqual(["A:whatsapp", "B:google_maps"]);
  });

  it("R8: con comoApp(B), el contador de pruebas de A no se lee ni se escribe", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, A);
      await tx.$executeRawUnsafe(
        `INSERT INTO integracion_prueba_minuto (id, minuto, intentos) VALUES ($1, date_trunc('minute', now()), 3)`,
        randomUUID(),
      );
      const [sembrada] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM integracion_prueba_minuto WHERE organizacion_id = $1`,
        A,
      );
      await comoApp(tx, B);
      const [visibles] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM integracion_prueba_minuto`);
      const editadas = await tx.$executeRawUnsafe(`UPDATE integracion_prueba_minuto SET intentos = 0`);
      const conEmpresaA = await intentar(
        tx,
        `INSERT INTO integracion_prueba_minuto (id, organizacion_id, minuto) VALUES ($1, $2, now())`,
        randomUUID(),
        A,
      );
      const propia = await intentar(
        tx,
        `INSERT INTO integracion_prueba_minuto (id, minuto) VALUES ($1, date_trunc('minute', now()))`,
        randomUUID(),
      );
      await comoDueno(tx);
      const [intentosA] = await tx.$queryRawUnsafe<{ intentos: number }[]>(
        `SELECT intentos FROM integracion_prueba_minuto WHERE organizacion_id = $1`,
        A,
      );
      return { sembrada: Number(sembrada.n), visibles: Number(visibles.n), editadas, conEmpresaA, propia, intentosA };
    });
    expect(r.sembrada).toBe(1);
    expect(r.visibles).toBe(0);
    expect(r.editadas).toBe(0);
    expect(r.conEmpresaA).toBe("42501");
    // Control: la de B por el mismo camino pasa, o el 42501 no diria nada de la politica.
    expect(r.propia).toBeNull();
    expect(r.intentosA).toEqual({ intentos: 3 });
  });

  it("cambiar la empresa de una integracion da SL017 y no la mueve", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, A);
      const idA = await insertarWhatsapp(tx, `num-a-${randomUUID()}`);
      const mover = await intentar(tx, `UPDATE integracion SET organizacion_id = $1 WHERE id = $2`, B, idA);
      return { mover, filas: await filasDeAyB(tx) };
    });
    expect(r.mover).toBe(SQLSTATE_EMPRESA_CRUZADA);
    expect(r.filas).toEqual(["A:whatsapp"]);
  });

  /* ----------------------------- CHECK de secretos ---------------------------- */

  it("R5: el CHECK de secretos rechaza un valor en claro y deja pasar el valor real de la boveda", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, A);
      const id = randomUUID();
      const real = await secretoValido(id, "clave_api");
      const probar = (secretos: unknown) =>
        intentar(tx, INSERTAR, randomUUID(), "google_maps", JSON.stringify(secretos), null, null);
      const [iv, tag, cifrado] = real.split(":").slice(1);
      return {
        // Control: el valor que produce el cifrador pasa. Si no pasara, los rechazos de abajo no
        // dirian nada del CHECK.
        real: await intentar(tx, INSERTAR, id, "google_maps", JSON.stringify({ clave_api: real }), null, null),
        enClaro: await probar({ clave_api: "AIzaSyA-clave-en-claro" }),
        prefijoYClaro: await probar({ clave_api: "v1:AIzaSyA-clave-en-claro" }),
        sinCifrado: await probar({ clave_api: `v1:${iv}:${tag}:` }),
        versionCero: await probar({ clave_api: `v0:${iv}:${tag}:${cifrado}` }),
        basuraAlFinal: await probar({ clave_api: `${real}!` }),
        unoBuenoYUnoEnClaro: await probar({ clave_api: real, otra: "en-claro" }),
        numero: await probar({ clave_api: 12345 }),
        objeto: await probar({ clave_api: { valor: real } }),
        noEsObjeto: await probar([real]),
        filas: await filasDeAyB(tx),
      };
    });
    expect(r.real).toBeNull();
    expect(r.enClaro).toBe("23514");
    expect(r.prefijoYClaro).toBe("23514");
    expect(r.sinCifrado).toBe("23514");
    expect(r.versionCero).toBe("23514");
    expect(r.basuraAlFinal).toBe("23514");
    expect(r.unoBuenoYUnoEnClaro).toBe("23514");
    expect(r.numero).toBe("23514");
    expect(r.objeto).toBe("23514");
    expect(r.noEsObjeto).toBe("23514");
    expect(r.filas).toEqual(["A:google_maps"]);
  });

  it("R5: un UPDATE que pone un secreto en claro tambien se rechaza", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, A);
      const id = await insertarWhatsapp(tx, `num-a-${randomUUID()}`);
      return intentar(
        tx,
        `UPDATE integracion SET secretos = jsonb_set(secretos, '{app_secret}', '"secreto-en-claro"') WHERE id = $1`,
        id,
      );
    });
    expect(r).toBe("23514");
  });

  /* ------------------------- CHECK de columnas de WhatsApp ------------------------- */

  it("las columnas de WhatsApp solo existen en su servicio, y en el siempre", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, A);
      const conSecreto = async (servicio: string, numero: string | null, resumen: string | null) => {
        const id = randomUUID();
        const secretos = JSON.stringify({ clave_api: await secretoValido(id, "clave_api") });
        return intentar(tx, INSERTAR, id, servicio, secretos, numero, resumen);
      };
      return {
        mapsConNumero: await conSecreto("google_maps", `num-${randomUUID()}`, null),
        mapsConResumen: await conSecreto("google_maps", null, RESUMEN),
        asistenteConLasDos: await conSecreto("asistente", `num-${randomUUID()}`, RESUMEN),
        whatsappSinNumero: await conSecreto("whatsapp", null, RESUMEN),
        whatsappSinResumen: await conSecreto("whatsapp", `num-${randomUUID()}`, null),
        // Control: con las dos, el mismo servicio pasa.
        whatsappCompleto: await conSecreto("whatsapp", `num-${randomUUID()}`, RESUMEN),
        filas: await filasDeAyB(tx),
      };
    });
    expect(r.mapsConNumero).toBe("23514");
    expect(r.mapsConResumen).toBe("23514");
    expect(r.asistenteConLasDos).toBe("23514");
    expect(r.whatsappSinNumero).toBe("23514");
    expect(r.whatsappSinResumen).toBe("23514");
    expect(r.whatsappCompleto).toBeNull();
    expect(r.filas).toEqual(["A:whatsapp"]);
  });

  it("R5: el resumen del token es hex minuscula de 64, nunca el token", async () => {
    const r = await revertida(async (tx) => {
      await fijarEmpresa(tx, A);
      const con = async (resumen: string) => {
        try {
          await tx.$executeRawUnsafe(`SAVEPOINT sp_resumen`);
          await insertarWhatsapp(tx, `num-${randomUUID()}`, resumen);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT sp_resumen`);
          return null;
        } catch (e) {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sp_resumen`);
          return sqlstateDe(e);
        }
      };
      return {
        mayusculas: await con("A".repeat(64)),
        noHex: await con("z".repeat(64)),
        token: await con(`${"x".repeat(43)}${" ".repeat(21)}`),
        bueno: await con("0123456789abcdef".repeat(4)),
      };
    });
    expect(r.mayusculas).toBe("23514");
    expect(r.noHex).toBe("23514");
    expect(r.token).toBe("23514");
    expect(r.bueno).toBeNull();
  });

  /* --------------------------------- Unicos --------------------------------- */

  it("R10/R11: una por empresa y servicio; el numero de WhatsApp es unico entre empresas", async () => {
    const r = await revertida(async (tx) => {
      const numero = `num-${randomUUID()}`;
      await fijarEmpresa(tx, A);
      await insertarWhatsapp(tx, numero, "1".repeat(64));
      const segundaEnA = await intentar(
        tx,
        INSERTAR,
        randomUUID(),
        "whatsapp",
        "{}",
        `num-${randomUUID()}`,
        "2".repeat(64),
      );
      await fijarEmpresa(tx, B);
      const mismoNumeroEnB = await intentar(tx, INSERTAR, randomUUID(), "whatsapp", "{}", numero, "3".repeat(64));
      const otroNumeroEnB = await intentar(
        tx,
        INSERTAR,
        randomUUID(),
        "whatsapp",
        "{}",
        `num-${randomUUID()}`,
        "4".repeat(64),
      );
      return { segundaEnA, mismoNumeroEnB, otroNumeroEnB, filas: await filasDeAyB(tx) };
    });
    expect(r.segundaEnA).toBe("23505");
    expect(r.mismoNumeroEnB).toBe("23505");
    expect(r.otroNumeroEnB).toBeNull();
    expect(r.filas).toEqual(["A:whatsapp", "B:whatsapp"]);
  });
});
