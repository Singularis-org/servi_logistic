import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { recalcularCongelamiento } from "@/lib/planes/mora-recalcular";
import { PagoPlataformaConfirmacionRepository } from "@/lib/repositories/PagoPlataformaConfirmacionRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "../db/_postgres-real";
import { GRACIA_GLOBAL, aLas, cero, comoDueno, congelar, empresa, estadoDe, facturaCerrada } from "../db/_fixtures/mora-121";
import { limpiar459, sembrarPersonas459, type Personas459 } from "../db/_fixtures/escrituras-459";
import { crearUsuarioDePrueba } from "../db/_fixtures/orden-minima";
import { capturar, revertida, superadminEnTx } from "../db/_fixtures/planes";
import { idDeRol, insertarUsuario, obtenerOCrearSuperadmin, tomarLockDeSuperadmin } from "../db/_fixtures/superadmin-32";

// La anulación del cruce va por la action real de la wallet (molde `pago-plataforma-confirmacion.test.ts`): la zona
// del país fija y la puerta de módulo abierta. Los casos con `revertida` no pasan por ninguna de las dos.
vi.mock("@/lib/services/ReglasPaisEmpresaService", async (importOriginal) => {
  const { reglasPaisFijas } = await import("@/tests/fabricas/reglas-pais");
  return {
    ...(await importOriginal<typeof import("@/lib/services/ReglasPaisEmpresaService")>()),
    construirReglasPaisEmpresa: () => reglasPaisFijas(),
  };
});
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());

// SLT-121 · T2.5 (design §5.2; R19, R20, R21, R34) — el enganche de la mora en `PagoPlataformaConfirmacionRepository`,
// contra Postgres real. Confirmar, registrar por fuera y anular corren ahora en una transacción que, si el
// resultado es `ok`, llama a `recalcularCongelamiento`: el descongelamiento, su fila del historial y su correo se
// confirman con el pago o se pierden con él.
//
// Cada caso en una transacción del dueño que se revierte. El repositorio recibe la `tx` del caso con un
// `$transaction` que abre un SAVEPOINT real (`clienteConSavepoint`). La empresa tiene una factura cerrada de 1000 con
// `hasta` = 16 nov: con la gracia global (7) está vencida desde las 00:00 del 24, y se congela a las 00:30.
// Los pagos se confirman a las 10:00 del 24.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

const MADRUGADA = aLas("2026-11-24", "00:30");
const AHORA = new Date(aLas("2026-11-24", "10:00"));

const repoEn = (tx: TxDeTest, romperRegistro = false) =>
  new PagoPlataformaConfirmacionRepository(clienteConSavepoint(tx, romperRegistro));

interface Caso {
  org: string;
  factura: string;
  superadmin: string;
  maestro: string;
}

/** Una empresa congelada por su factura vencida de 1000, su maestro y el superadmin. */
async function empresaCongelada(tx: TxDeTest, congelarla = true): Promise<Caso> {
  const superadmin = await superadminEnTx(tx);
  const org = await empresa(tx);
  const factura = await facturaCerrada(tx, org, { numero: 1, hasta: cero("2026-11-16"), total: "1000.00" });
  await comoApp(tx, org);
  const { id: maestro } = await crearUsuarioDePrueba(tx, "maestro");
  await comoDueno(tx);
  if (congelarla) {
    const r = await congelar(tx, org, MADRUGADA, GRACIA_GLOBAL);
    if (r.resultado !== "congelada") throw new Error(`la siembra no congeló: ${JSON.stringify(r)}`);
  }
  return { org, factura, superadmin, maestro };
}

/**
 * El pago de la empresa por confirmar, registrado como lo haría la wallet: `servi_app`, su empresa y el permiso
 * del pago a la plataforma (R11), sin el cual el trigger de la mora lo rechazaría con la empresa congelada.
 */
async function pagoDeLaEmpresa(tx: TxDeTest, c: Caso, monto: string): Promise<string> {
  const id = randomUUID();
  await comoApp(tx, c.org);
  await tx.$executeRawUnsafe(`SELECT set_config('app.mora_permitida', 'pago_plataforma', true)`);
  await tx.$executeRawUnsafe(
    `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por")
     VALUES ($1, 'egreso', 'egreso_pago_plataforma', $2::numeric, 'gasto', 'Pago SLT121', $3, $4)`,
    id,
    monto,
    c.org,
    c.maestro,
  );
  await tx.$executeRawUnsafe(`SELECT set_config('app.mora_permitida', '', true)`);
  await comoDueno(tx);
  return id;
}

async function accionesDeMora(tx: TxDeTest, org: string): Promise<{ accion: string; actor: string | null }[]> {
  return tx.$queryRawUnsafe(
    `SELECT "accion"::text AS accion, "actor_usuario_id" AS actor FROM "historial_accion"
      WHERE "organizacion_id" = $1 AND "accion"::text LIKE 'empresa_%' ORDER BY "created_at"`,
    org,
  );
}

async function avisosDe(tx: TxDeTest, org: string): Promise<Record<string, unknown>[]> {
  const filas = await tx.$queryRawUnsafe<{ payload: Record<string, unknown> }[]>(
    `SELECT "payload" FROM "jobs" WHERE "tipo" = 'mora_aviso_correo' AND "organizacion_id" = $1 ORDER BY "created_at"`,
    org,
  );
  return filas.map((f) => f.payload);
}

async function confirmaciones(tx: TxDeTest, org: string): Promise<number> {
  const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "pago_plataforma_confirmacion" WHERE "organizacion_id" = $1`,
    org,
  );
  return n;
}

const porFuera = (c: Caso, monto: string, clave = randomUUID()) => ({
  organizacionId: c.org,
  pagoId: randomUUID(),
  monto,
  fecha: null,
  referencia: "Transferencia SLT121",
  claveIdempotencia: clave,
  aplicaciones: [{ facturaId: c.factura, monto }],
  por: c.superadmin,
  ahora: AHORA,
  comprobante: null,
});

describeSiHayBase("SLT-121 — el pago a la plataforma recalcula la mora (R19, R20, R21, R34)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });
  afterAll(async () => {
    await soltarSuperadmin();
    await base?.$disconnect();
  });

  it("R19, R30, R28: confirmar el pago que salda la vencida descongela en la misma transacción, con la fila y el correo", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "1000.00");
      const resultado = await repoEn(tx).confirmar({
        organizacionId: c.org,
        pagoId,
        aplicaciones: [{ facturaId: c.factura, monto: "1000.00" }],
        por: c.superadmin,
        ahora: AHORA,
      });
      return { c, resultado, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.resultado).toEqual({ estado: "ok" });
    expect(r.estado.congeladaAt).toBeNull();
    // `empresa_congelada` no está: la siembra congela con la función, sin el repositorio.
    expect(r.acciones).toEqual([{ accion: "empresa_descongelada_por_pago", actor: r.c.superadmin }]);
    expect(r.avisos).toEqual([{ tipo: "descongelada", motivo: "pago" }]);
  });

  it("R19: un pago parcial no descongela ni escribe nada de la mora", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "400.00");
      const resultado = await repoEn(tx).confirmar({
        organizacionId: c.org,
        pagoId,
        aplicaciones: [{ facturaId: c.factura, monto: "400.00" }],
        por: c.superadmin,
        ahora: AHORA,
      });
      return { resultado, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.resultado).toEqual({ estado: "ok" });
    expect(r.estado.congeladaAt).toBe(MADRUGADA);
    expect(r.acciones).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("R19: registrar por fuera el pago que salda descongela; repetirlo (ya_registrado) no vuelve a escribir", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const entrada = porFuera(c, "1000.00");
      const repo = repoEn(tx);
      const primero = await repo.registrarPorFuera(entrada);
      const repetido = await repo.registrarPorFuera({ ...entrada, pagoId: randomUUID() });
      return { c, primero, repetido, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.primero).toEqual({ estado: "ok" });
    expect(r.repetido).toEqual({ estado: "ya_registrado" });
    expect(r.estado.congeladaAt).toBeNull();
    expect(r.acciones).toEqual([{ accion: "empresa_descongelada_por_pago", actor: r.c.superadmin }]);
    expect(r.avisos).toHaveLength(1);
  });

  it("R20: un pago de la empresa que sigue por confirmar no la descongela", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      await pagoDeLaEmpresa(tx, c, "1000.00");
      const recalculo = await recalcularCongelamiento(tx, c.org, AHORA, { causa: "pago", actor: null }, GRACIA_GLOBAL);
      return { recalculo, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org) };
    });
    expect(r.recalculo).toBe("sin_cambio");
    expect(r.estado.congeladaAt).toBe(MADRUGADA);
    expect(r.acciones).toEqual([]);
  });

  it("R21: anular un pago confirmado no congela en el acto, aunque la factura vuelva a quedar vencida", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx, false);
      const entrada = porFuera(c, "1000.00");
      const repo = repoEn(tx);
      await repo.registrarPorFuera(entrada);
      const anulado = await repo.anularConfirmado({
        organizacionId: c.org,
        pagoId: entrada.pagoId,
        motivo: "Pago duplicado SLT121",
        por: c.superadmin,
        ahora: AHORA,
      });
      return { anulado, estado: await estadoDe(tx, c.org), acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.anulado).toEqual({ estado: "ok" });
    expect(r.estado.congeladaAt).toBeNull();
    expect(r.acciones).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("R34: si el recálculo falla, la confirmación se deshace con él y la empresa sigue congelada", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "1000.00");
      const error = await capturar(tx, () =>
        repoEn(tx, true).confirmar({
          organizacionId: c.org,
          pagoId,
          aplicaciones: [{ facturaId: c.factura, monto: "1000.00" }],
          por: c.superadmin,
          ahora: AHORA,
        }),
      );
      return { error, confirmaciones: await confirmaciones(tx, c.org), estado: await estadoDe(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.error).toBeInstanceOf(RegistroCaido);
    expect(r.confirmaciones).toBe(0);
    expect(r.estado.congeladaAt).toBe(MADRUGADA);
    expect(r.avisos).toEqual([]);
  });

  it("R34: los resultados sin cambio de saldo no recalculan (ya_confirmado)", async () => {
    const r = await revertida(base, async (tx) => {
      const c = await empresaCongelada(tx);
      const pagoId = await pagoDeLaEmpresa(tx, c, "1000.00");
      const entrada = {
        organizacionId: c.org,
        pagoId,
        aplicaciones: [{ facturaId: c.factura, monto: "1000.00" }],
        por: c.superadmin,
        ahora: AHORA,
      };
      const repo = repoEn(tx);
      const primero = await repo.confirmar(entrada);
      const segundo = await repo.confirmar(entrada);
      return { primero, segundo, acciones: await accionesDeMora(tx, c.org), avisos: await avisosDe(tx, c.org) };
    });
    expect(r.primero).toEqual({ estado: "ok" });
    expect(r.segundo).toEqual({ estado: "ya_confirmado" });
    expect(r.acciones).toHaveLength(1);
    expect(r.avisos).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Design §2 (decisión del 2026-11-20): EL CRUCE CON LA ANULACIÓN DE SLT-60, con la empresa YA congelada y filas
// COMMITEADAS. La empresa anula su pago por confirmar (decisión P3) mientras el superadmin lo confirma.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// El orden malo se FUERZA, no se espera a que salga: la confirmación corre con un cliente que, dentro de su
// transacción, se detiene justo antes del recálculo; ya tiene el candado `pago_plataforma:` y todavía no tomó la
// empresa. Con ella detenida arranca la anulación por la action real: escribe (su FK toma FOR KEY SHARE sobre
// `organizacion`) y se queda esperando el candado. Se espera a VERLA esperar en `pg_locks` y recién entonces se
// suelta la confirmación, que llama a `organizacion_mora_descongelar_si_pagada`.
//   · Con FOR NO KEY UPDATE en la función, la confirmación no choca con el FOR KEY SHARE: termina `ok`, suelta el
//     candado y la anulación, que lo toma después, responde `forbidden` (ya está confirmado: R21 de SLT-60).
//   · Con FOR UPDATE (la mutación, medida en `progress/impl_SLT-121.md` > «Deadlock: opción (a)»), cada una espera
//     a la otra: 40P01.
// Se repite el cruce RONDAS veces, cada una con su pago; la factura de 1 000 000 sigue vencida, así que la empresa
// sigue congelada en todas.

const RONDAS = 5;

/** Una señal de un solo uso. */
function senal() {
  let dar: () => void = () => undefined;
  const p = new Promise<void>((r) => {
    dar = r;
  });
  return { p, dar };
}

/** Espera a que `condicion` se cumpla, mirándola cada 20 ms; si a los 20 s no se cumplió, falla diciendo cuál. */
async function hastaQue(condicion: () => Promise<boolean>, que: string): Promise<void> {
  const limite = Date.now() + 20_000;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error(`no llegó a cumplirse: ${que}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * Un cliente para el repositorio cuya transacción se DETIENE antes de la lectura con la que empieza
 * `recalcularCongelamiento`: avisa con `detenida` y sigue cuando se cumple `seguir`.
 */
function clienteQueSeDetiene(cliente: PrismaClient, detenida: () => void, seguir: Promise<void>): PrismaClient {
  const envoltura = {
    $queryRaw: cliente.$queryRaw.bind(cliente),
    walletMovimiento: cliente.walletMovimiento,
    $transaction: (fn: (tx: TxDeTest) => Promise<unknown>) =>
      cliente.$transaction(
        (tx) =>
          fn(
            new Proxy(tx, {
              get(objetivo, clave, receptor) {
                if (clave !== "$queryRaw") return Reflect.get(objetivo, clave, receptor);
                return async (sql: TemplateStringsArray, ...valores: unknown[]) => {
                  if (sql.join("").includes(`"congelada_at" IS NOT NULL`)) {
                    detenida();
                    await seguir;
                  }
                  return objetivo.$queryRaw(sql, ...valores);
                };
              },
            }),
          ),
        { timeout: 60_000, maxWait: 15_000 },
      ),
  };
  return envoltura as unknown as PrismaClient;
}

/** El desenlace de una promesa sin que un rechazo corte el caso: se compara entero. */
const desenlace = <T>(p: Promise<T>) =>
  p.then(
    (ok) => ({ ok }),
    (e: unknown) => ({ error: String(e) }),
  );

describeSiHayBase("SLT-121 — design §2: anular y confirmar a la vez con la empresa congelada no da 40P01", () => {
  let base2: PrismaClient;
  let confirmador: PrismaClient;
  let soltar: () => Promise<void> = async () => {};
  let p: Personas459 | null = null;
  let superadminId: string | null = null;
  let superadminPropio = false;
  let caso: Caso;

  const org = () => (p as Personas459).organizacionId;

  /** La anulación de la empresa, por la action real (molde de SLT-60). */
  const anular = (movimientoId: string) =>
    conEmpresa(org(), () =>
      anularMovimientoAction(
        { destino: { libro: "caja", movimientoId }, motivo: "Pago mal registrado SLT121" },
        { getActor: async () => (p as Personas459).maestro },
      ),
    );

  /** ¿Hay alguien esperando el candado de los pagos de la empresa? */
  async function alguienEsperaElCandado(): Promise<boolean> {
    const [{ n }] = await base2.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_locks l
       WHERE l.locktype = 'advisory' AND NOT l.granted AND l.objsubid = 1
         AND l.objid::text::bigint = (hashtext('pago_plataforma:' || ${org()})::bigint & 4294967295)`;
    return n > 0;
  }

  beforeAll(async () => {
    base2 = crearPrismaDeTest();
    confirmador = crearPrismaDeTest();
    soltar = await tomarLockDeSuperadmin();
    const s = await obtenerOCrearSuperadmin(base2, () =>
      bajoLockDeEscrituraReal(() =>
        base2.$transaction(async (tx) => {
          const u = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
          if (!u.desenlace.ok) throw new Error(`no se sembró el superadmin: ${JSON.stringify(u.desenlace)}`);
          return u.id;
        }),
      ),
    );
    superadminId = s.id;
    superadminPropio = s.propio;
    p = await sembrarPersonas459(base2);
    const personas = p;
    caso = await bajoLockDeEscrituraReal(() =>
      base2.$transaction(async (tx) => {
        const factura = await facturaCerrada(tx, personas.organizacionId, {
          numero: 1,
          hasta: cero("2026-11-16"),
          total: "1000000.00",
        });
        const r = await congelar(tx, personas.organizacionId, MADRUGADA, GRACIA_GLOBAL);
        if (r.resultado !== "congelada") throw new Error(`la siembra no congeló: ${JSON.stringify(r)}`);
        return { org: personas.organizacionId, factura, superadmin: s.id, maestro: personas.maestro.usuarioId };
      }),
    );
  }, 120_000);

  afterAll(async () => {
    if (base2 === undefined) return;
    try {
      if (p !== null) {
        const id = org();
        // La FK del pago a su confirmación no tiene acción: las aplicaciones y las confirmaciones, antes que el libro.
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["pago_plataforma_aplicacion", "pago_plataforma_confirmacion", "historial_accion", "jobs"]) {
            await base2.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = $1`, id);
          }
        });
        // Las facturas se van con la empresa (ON DELETE CASCADE).
        await limpiar459(base2, p);
      }
      if (superadminId !== null && superadminPropio) {
        const id = superadminId;
        await bajoLockDeEscrituraReal(() => base2.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, id));
      }
    } finally {
      await soltar();
      await Promise.all([base2.$disconnect(), confirmador?.$disconnect()]);
    }
  }, 120_000);

  it(`decisión §2: ${RONDAS} cruces forzados — la confirmación termina sin 40P01, la anulación responde forbidden y la empresa sigue congelada`, async () => {
    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      const pagoId = await bajoLockDeEscrituraReal(() => base2.$transaction((tx) => pagoDeLaEmpresa(tx, caso, "1000.00")));
      const detenida = senal();
      const seguir = senal();
      const repo = new PagoPlataformaConfirmacionRepository(clienteQueSeDetiene(confirmador, detenida.dar, seguir.p));
      const confirmacion = desenlace(
        repo.confirmar({
          organizacionId: caso.org,
          pagoId,
          aplicaciones: [{ facturaId: caso.factura, monto: "1000.00" }],
          por: caso.superadmin,
          ahora: AHORA,
        }),
      );
      // La confirmación tiene el candado y todavía no tomó la empresa.
      await detenida.p;
      expect(await alguienEsperaElCandado(), `ronda ${ronda}: nadie espera todavía el candado`).toBe(false);

      // La anulación escribe y se queda esperando el candado, con su FOR KEY SHARE sobre la empresa.
      const anulacion = desenlace(anular(pagoId));
      await hastaQue(alguienEsperaElCandado, `ronda ${ronda}: la anulación espera el candado de los pagos`);
      seguir.dar();

      expect({ confirmacion: await confirmacion, anulacion: await anulacion }, `ronda ${ronda}`).toEqual({
        confirmacion: { ok: { estado: "ok" } },
        anulacion: { ok: { status: "forbidden" } },
      });
      const [fila] = await base2.$queryRaw<{ confirmado: number; contra: number }[]>`
        SELECT (SELECT count(*)::int FROM "pago_plataforma_confirmacion" WHERE "pago_id" = ${pagoId}) AS confirmado,
               (SELECT count(*)::int FROM "wallet_movimiento"
                 WHERE "origen_tipo" = 'gasto' AND "origen_id" = ${pagoId} AND "categoria" = 'ingreso_ajuste') AS contra`;
      expect(fila, `ronda ${ronda}`).toEqual({ confirmado: 1, contra: 0 });
    }
    const estado = await base2.$transaction((tx) => estadoDe(tx, caso.org));
    expect(estado.congeladaAt).toBe(MADRUGADA);
  }, 180_000);
});
