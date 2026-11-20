import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { CASOS_FECHA_LIMITE, unMsAntes } from "./_fixtures/fecha-limite-pago";
import { GRACIA_GLOBAL, comoDueno, empresa, facturaCerrada, fijarGracia } from "./_fixtures/mora-121";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { cero } from "./_fixtures/periodo-calendario";
import { capturar, crearPlan, revertida, sqlstateDe } from "./_fixtures/planes";

// SLT-121 · T1.3 (design §2.1; R1, R6, R33) — `factura_plataforma_mora`, la ÚNICA definición de la fecha límite de
// pago y de «vencida», contra Postgres. Cada caso en una transacción del dueño que se revierte.
//
//   · R1: la tabla de casos compartida con la gemela TS (`_fixtures/fecha-limite-pago.ts`), con la gracia propia y
//     con la global por parámetro; y el ejemplo de R1 con el cierre real de la factura;
//   · R6: vencida desde las 00:00 del día siguiente a la fecha límite, nunca antes; solo las cerradas con saldo > 0
//     (la en curso no aparece; una pagada tampoco; una parcial, con lo que falta; un pago anulado devuelve la
//     factura, SLT-143);
//   · R33: como `servi_app`, solo la empresa del contexto: otra empresa o sin empresa → 42501. Solo esta función
//     de la mora la ejecuta `servi_app`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface FilaMora {
  factura_id: string;
  numero: number;
  saldo: string;
  fecha_limite: string;
  vence_at: string;
  vencida: boolean;
}

/** La función tal cual, con las fechas en texto. */
function leerMora(tx: TxDeTest, org: string, ahora: string, gracia = GRACIA_GLOBAL): Promise<FilaMora[]> {
  return tx.$queryRawUnsafe<FilaMora[]>(
    `SELECT m."factura_id", m."numero", m."saldo"::text AS saldo, m."fecha_limite"::text AS fecha_limite,
            to_char(m."vence_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS vence_at, m."vencida"
       FROM factura_plataforma_mora($1, $2::timestamp, $3) m`,
    org,
    ahora,
    gracia,
  );
}

/** Un pago a la plataforma registrado por fuera por el dueño, aplicado entero a una factura. */
async function pagarPorFuera(tx: TxDeTest, org: string, por: string, facturaId: string, monto: string): Promise<string> {
  const pagoId = randomUUID();
  const [{ r }] = await tx.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pago_plataforma_registrar_por_fuera($1, $2, $3::numeric, NULL, 'Transferencia SLT121', NULL, $4::jsonb, $5,
                                               (now() AT TIME ZONE 'UTC')::timestamp, NULL, NULL) AS r`,
    org,
    pagoId,
    monto,
    JSON.stringify([{ factura_id: facturaId, monto }]),
    por,
  );
  if (r !== "ok") throw new Error(`el pago por fuera respondió ${r}`);
  return pagoId;
}

describeSiHayBase("SLT-121 — factura_plataforma_mora (R1, R6, R33)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R1, R6: cada caso de la tabla da su fecha límite y su vencimiento, con la gracia propia y con la global", async () => {
    const r = await revertida(base, async (tx) => {
      const salida: { caso: string; propia: unknown; global: unknown }[] = [];
      for (const c of CASOS_FECHA_LIMITE) {
        const propia = await empresa(tx);
        await facturaCerrada(tx, propia, { numero: 1, hasta: c.hasta, total: "1000.00" });
        await fijarGracia(tx, propia, c.gracia);
        const global = await empresa(tx);
        await facturaCerrada(tx, global, { numero: 1, hasta: c.hasta, total: "1000.00" });
        // La propia manda sobre la global: se le pasa una global distinta a la del caso.
        const otraGlobal = c.gracia === 30 ? 7 : 30;
        const leer = async (org: string, gracia: number) => {
          const antes = await leerMora(tx, org, unMsAntes(c.venceEn), gracia);
          const justo = await leerMora(tx, org, c.venceEn, gracia);
          return {
            fecha: antes.map((f) => f.fecha_limite),
            vence: antes.map((f) => f.vence_at),
            vencidaAntes: antes.map((f) => f.vencida),
            vencidaJusto: justo.map((f) => f.vencida),
          };
        };
        salida.push({ caso: c.caso, propia: await leer(propia, otraGlobal), global: await leer(global, c.gracia) });
      }
      return salida;
    });
    for (const [i, c] of CASOS_FECHA_LIMITE.entries()) {
      const esperado = { fecha: [c.fechaLimite], vence: [c.venceEn], vencidaAntes: [false], vencidaJusto: [true] };
      expect(r[i], c.caso).toEqual({ caso: c.caso, propia: esperado, global: esperado });
    }
  });

  it("R1, R6: con el cierre real, la factura emitida el 16 nov con 7 días paga hasta el 23; la en curso no aparece", async () => {
    const r = await revertida(base, async (tx) => {
      const plan = await crearPlan(tx);
      await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = 31000 WHERE "plan_id" = $1`, plan);
      const org = await empresa(tx);
      await tx.$executeRawUnsafe(
        `UPDATE "organizacion" SET "created_at" = $2::timestamp, "plan_id" = $3, "plan_tipo_cobro" = 'quincenal',
                "plan_ciclo_ancla_at" = $2::timestamp WHERE "id" = $1`,
        org,
        cero("2026-11-01"),
        plan,
      );
      // La corrida de las 00:10 del 17 nov cierra la primera quincena (hasta el 16 a las 00:00) y deja una en curso.
      await tx.$queryRawUnsafe(`SELECT factura_plataforma_cerrar($1, $2::timestamp)`, org, "2026-11-17T06:10:00.000Z");
      const facturas = await tx.$queryRawUnsafe<{ id: string; estado: string; total: string | null; hasta: string | null }[]>(
        `SELECT "id", "estado", "total"::text AS total, to_char("hasta_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS hasta
           FROM "factura_plataforma" WHERE "organizacion_id" = $1 ORDER BY "desde_at"`,
        org,
      );
      const antes = await leerMora(tx, org, "2026-11-24T05:59:59.999Z");
      const despues = await leerMora(tx, org, cero("2026-11-24"));
      return { facturas, antes, despues };
    });
    expect(r.facturas.map((f) => [f.estado, f.hasta])).toEqual([
      ["cerrada", cero("2026-11-16")],
      ["en_curso", null],
    ]);
    const [cerrada] = r.facturas;
    expect(Number(cerrada.total)).toBeGreaterThan(0);
    expect(r.antes).toEqual([
      { factura_id: cerrada.id, numero: 1, saldo: cerrada.total, fecha_limite: "2026-11-23", vence_at: cero("2026-11-24"), vencida: false },
    ]);
    expect(r.despues.map((f) => [f.factura_id, f.vencida])).toEqual([[cerrada.id, true]]);
  });

  it("R6: solo cuentan las cerradas con saldo > 0; un pago parcial deja lo que falta y uno anulado devuelve la factura", async () => {
    const ahora = cero("2026-12-20");
    const r = await revertida(base, async (tx) => {
      const org = await empresa(tx);
      const f1 = await facturaCerrada(tx, org, { numero: 1, hasta: cero("2026-11-16"), total: "1000.00" });
      const f2 = await facturaCerrada(tx, org, { numero: 2, hasta: cero("2026-12-01"), total: "500.00" });
      // Una cerrada de total 0 y otra negativa (reversos > cargos) no son deuda: no aparecen.
      await facturaCerrada(tx, org, { numero: 3, hasta: cero("2026-12-02"), total: "0.00" });
      await facturaCerrada(tx, org, { numero: 4, hasta: cero("2026-12-03"), total: "-50.00" });
      await fijarEmpresa(tx, org);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      await fijarEmpresa(tx, "");

      const inicio = await leerMora(tx, org, ahora);
      const pago1 = await pagarPorFuera(tx, org, maestro.id, f1, "1000.00");
      await pagarPorFuera(tx, org, maestro.id, f2, "200.00");
      const pagada = await leerMora(tx, org, ahora);
      const [{ a }] = await tx.$queryRawUnsafe<{ a: string }[]>(
        `SELECT pago_plataforma_anular_confirmado($1, $2, 'Pago duplicado SLT121', $3, (now() AT TIME ZONE 'UTC')::timestamp) AS a`,
        org,
        pago1,
        maestro.id,
      );
      const anulada = await leerMora(tx, org, ahora);
      return { f1, f2, inicio, pagada, a, anulada };
    });
    const resumen = (filas: FilaMora[]) => filas.map((f) => [f.factura_id, f.saldo, f.vencida]);
    expect(resumen(r.inicio)).toEqual([
      [r.f1, "1000.00", true],
      [r.f2, "500.00", true],
    ]);
    expect(resumen(r.pagada)).toEqual([[r.f2, "300.00", true]]);
    expect(r.a).toBe("ok");
    expect(resumen(r.anulada)).toEqual([
      [r.f1, "1000.00", true],
      [r.f2, "300.00", true],
    ]);
  });

  it("R33: como servi_app lee solo la empresa del contexto; otra empresa o sin empresa → 42501, sin datos", async () => {
    const ahora = cero("2026-12-20");
    const r = await revertida(base, async (tx) => {
      const a = await empresa(tx);
      const b = await empresa(tx);
      await facturaCerrada(tx, a, { numero: 1, hasta: cero("2026-11-16"), total: "1000.00" });
      await facturaCerrada(tx, b, { numero: 1, hasta: cero("2026-11-16"), total: "2000.00" });
      // El dueño lee cualquier empresa, también con otra en el contexto.
      await fijarEmpresa(tx, a);
      const duenoLeeB = await leerMora(tx, b, ahora);

      await comoApp(tx, a);
      const [{ rol }] = await tx.$queryRawUnsafe<{ rol: string }[]>(`SELECT current_user::text AS rol`);
      const propia = await leerMora(tx, a, ahora);
      let otra: FilaMora[] | null = null;
      const errOtra = await capturar(tx, async () => {
        otra = await leerMora(tx, b, ahora);
      });
      await fijarEmpresa(tx, "");
      const errSinEmpresa = await capturar(tx, () => leerMora(tx, a, ahora));
      await comoDueno(tx);
      return { rol, duenoLeeB, propia, otra, errOtra, errSinEmpresa };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.duenoLeeB.map((f) => f.saldo)).toEqual(["2000.00"]);
    expect(r.propia.map((f) => f.saldo)).toEqual(["1000.00"]);
    expect(r.otra).toBeNull();
    expect(sqlstateDe(r.errOtra)).toBe("42501");
    expect(String((r.errOtra as Error).message)).toContain("factura_plataforma_mora: solo se lee la mora de la empresa del contexto");
    expect(sqlstateDe(r.errSinEmpresa)).toBe("42501");
  });

  it("R33: servi_app ejecuta factura_plataforma_mora y ninguna otra función de la mora; todas fijan search_path", async () => {
    const filas = await base.$queryRawUnsafe<
      { nombre: string; app: boolean; publico: boolean; definer: boolean; config: string[] | null }[]
    >(
      `SELECT p.proname::text AS nombre,
              has_function_privilege('servi_app', p.oid, 'EXECUTE') AS app,
              EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
              p.prosecdef AS definer,
              p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('factura_plataforma_mora', 'organizacion_mora_congelar', 'organizacion_mora_descongelar_si_pagada',
                            'organizacion_mora_descongelar_a_mano', 'bloqueo_por_mora')
        ORDER BY 1`,
    );
    const config = ["search_path=public, pg_temp"];
    expect(filas).toEqual([
      // El trigger necesita el `current_user` real: sin SECURITY DEFINER.
      { nombre: "bloqueo_por_mora", app: false, publico: false, definer: false, config },
      { nombre: "factura_plataforma_mora", app: true, publico: false, definer: true, config },
      { nombre: "organizacion_mora_congelar", app: false, publico: false, definer: true, config },
      { nombre: "organizacion_mora_descongelar_a_mano", app: false, publico: false, definer: true, config },
      { nombre: "organizacion_mora_descongelar_si_pagada", app: false, publico: false, definer: true, config },
    ]);
  });
});
