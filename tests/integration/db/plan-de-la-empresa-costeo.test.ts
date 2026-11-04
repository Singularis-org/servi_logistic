import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { MiPlanRepository } from "@/lib/repositories/MiPlanRepository";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type FksDeOrden, type TxDeTest } from "./_postgres-real";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { asignarPlan, capturar, crearPlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-66 (design §3.2, §4.3, §9.1; R18, R22) — el costeo que leen «Mi plan» y el detalle de empresa.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// §3.2: el trigger del cargo, `plan_de_la_empresa` y `PlanesRepository.planDeEmpresa` leen la misma
// `cobro_plataforma_tarifa_de`. Aquí se afirma por su efecto: para cada fuente, el `costo_vigente` que
// lee la empresa (como `servi_app`), el de `MiPlanRepository` y el del superadmin son el monto y la fuente
// del cargo de una orden creada justo después, en la misma transacción. Una regla propia en
// `plan_de_la_empresa` (mutación 6 de §9.4) se ve en el caso con excepción.
//
// R22: la empresa solo lee su costeo por `plan_de_la_empresa`; la de otra da 42501, y la función de la
// tarifa, la tabla `plan` y el valor global siguen cerrados a `servi_app`.
//
// Cada caso corre en una transacción del dueño que se revierte (`revertida`). El valor global es una
// fila para toda la base: se fija bajo el lock de SL-40 (`tomarTarifaGlobal`) y se deja como estaba.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const GLOBAL = "500.00";

let base: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

interface Lectura {
  empresa: { monto: string; fuente: string };
  repositorio: { monto: string; fuente: string };
  superadmin: { monto: string; fuente: string } | undefined;
  costoDelPlan: unknown;
  usoKeys: string[];
  cargo: { monto: string; fuente: string }[];
}

/** Una orden viva de la empresa fijada, por `INSERT` directo: el cargo lo escribe el trigger. */
async function crearOrden(tx: TxDeTest, fks: FksDeOrden): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                          "provincia_id", "canton_id", "producto", "updated_at", "created_at")
     VALUES ($1, $2, $3, 'Destinatario SLT-66', '88880000', $4, $5, $6, $7, 'Caja', now(), now() AT TIME ZONE 'UTC')`,
    id,
    `SLT66-${randomUUID().slice(0, 12)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
  );
  return id;
}

/**
 * La empresa A con un plan de base «monto» y el `costoPorOrden` pedido, y su excepción si la hay. Lee
 * su costeo por las tres vías y, de vuelta como dueño, crea una orden y lee su cargo.
 */
async function leerYCargar(tx: TxDeTest, costoDelPlan: string | null, excepcion: string | null): Promise<Lectura> {
  const { id: A } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, A);
  const plan = await crearPlan(tx, { custom: A });
  await tx.plan.update({ where: { id: plan }, data: { precioMensual: "1000.00", costoPorOrden: costoDelPlan } });
  await asignarPlan(tx, A, plan);
  if (excepcion !== null) {
    await tx.organizacion.update({ where: { id: A }, data: { cobroPlataformaPorOrden: excepcion } });
  }
  const fks = await crearFksDeOrden(tx);

  const superadmin = await planesEnTx(tx).planDeEmpresa(A);

  await comoApp(tx, A);
  const filas = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, A);
  const crudo = filas[0].plan;
  const json = (typeof crudo === "string" ? JSON.parse(crudo) : crudo) as {
    costo_vigente: { monto: string; fuente: string };
    costo_por_orden: unknown;
    uso: Record<string, unknown>;
  };
  const leido = await new MiPlanRepository(tx).planDeLaEmpresa();
  if (leido === null) throw new Error("A tiene plan: MiPlanRepository no puede devolver null");

  // De vuelta al dueño (la orden no es lo que se mide), con la misma empresa fijada.
  await tx.$executeRawUnsafe(`SELECT set_config('role', 'none', true)`);
  const orden = await crearOrden(tx, fks);
  const cargo = await tx.$queryRawUnsafe<{ monto: string; fuente: string }[]>(
    `SELECT "monto"::text AS monto, "fuente"::text AS fuente FROM "cobro_plataforma_movimiento"
      WHERE "orden_id" = $1 AND "tipo" = 'cargo'`,
    orden,
  );
  return {
    empresa: json.costo_vigente,
    repositorio: leido.costoVigente,
    superadmin: superadmin?.plan?.costoVigente,
    costoDelPlan: json.costo_por_orden,
    usoKeys: Object.keys(json.uso).sort(),
    cargo,
  };
}

describeSiHayBase("SLT-66 — plan_de_la_empresa: el costeo de la empresa (R18, R22)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    tarifaGlobal = await tomarTarifaGlobal();
    await tarifaGlobal.fijar(GLOBAL);
  }, 60_000);

  afterAll(async () => {
    await tarifaGlobal?.soltar();
    await base?.$disconnect();
  });

  // §3.2: lectura = cargo, por fuente. El caso con excepción es el que mata la mutación 6.
  it.each([
    { fuente: "empresa", plan: "100.00", excepcion: "80.00", monto: "80.00" },
    { fuente: "plan", plan: "100.00", excepcion: null, monto: "100.00" },
    { fuente: "global", plan: null, excepcion: null, monto: GLOBAL },
  ] as const)(
    "R18, §3.2: fuente $fuente — el costo vigente de la lectura es el cargo de la orden creada justo después",
    async ({ fuente, plan, excepcion, monto }) => {
      const r = await revertida(base, (tx) => leerYCargar(tx, plan, excepcion));
      const esperado = { monto, fuente };
      expect(r.cargo).toEqual([esperado]);
      expect(r.empresa).toEqual(esperado);
      expect(r.repositorio).toEqual(esperado);
      expect(r.superadmin).toEqual(esperado);
      // El costo del plan sale aparte, tal cual (con excepción también: es el del plan, no el vigente).
      expect(r.costoDelPlan).toBe(plan);
    },
  );

  it("R18, §3.2: fuente sin_configurar — sin global ni costo del plan, la lectura dice 0.00 y el cargo también", async () => {
    await tarifaGlobal?.fijar(null);
    try {
      const r = await revertida(base, (tx) => leerYCargar(tx, null, null));
      const esperado = { monto: "0.00", fuente: "sin_configurar" };
      expect(r.cargo).toEqual([esperado]);
      expect(r.empresa).toEqual(esperado);
      expect(r.repositorio).toEqual(esperado);
      expect(r.superadmin).toEqual(esperado);
    } finally {
      await tarifaGlobal?.fijar(GLOBAL);
    }
  });

  it("R18 (R5): el uso que lee la empresa ya no trae al maestro", async () => {
    const r = await revertida(base, (tx) => leerYCargar(tx, "100.00", null));
    expect(r.usoKeys).toEqual(["admin", "admin_satelite", "admin_tienda", "api_keys", "mensajero", "ordenes"]);
  });

  it("R22: la de otra empresa da 42501; la función de la tarifa, la tabla plan y el global siguen cerrados a servi_app", async () => {
    const r = await revertida(base, async (tx) => {
      const { id: A } = await crearOrganizacion(tx);
      const { id: B } = await crearOrganizacion(tx);
      const plan = await crearPlan(tx, { custom: A });
      await tx.plan.update({ where: { id: plan }, data: { precioMensual: "1000.00", costoPorOrden: "100.00" } });
      await asignarPlan(tx, A, plan);

      await comoApp(tx, B);
      const otra = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT plan_de_la_empresa($1)`, A));
      const tarifaDeOtra = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT * FROM cobro_plataforma_tarifa_de($1)`, A));
      await comoApp(tx, A);
      const tarifaPropia = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT * FROM cobro_plataforma_tarifa_de($1)`, A));
      const tablaPlan = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT "costo_por_orden" FROM "plan" WHERE "id" = $1`, plan));
      const tablaGlobal = await capturar(tx, () => tx.$queryRawUnsafe(`SELECT "monto" FROM "cobro_plataforma_tarifa"`));
      // Control de no vacuidad: la propia sí se lee, con el mismo rol.
      const propia = await tx.$queryRawUnsafe<{ plan: unknown }[]>(`SELECT plan_de_la_empresa($1) AS plan`, A);
      const rol = await tx.$queryRawUnsafe<{ r: string }[]>(`SELECT current_user::text AS r`);
      return { otra, tarifaDeOtra, tarifaPropia, tablaPlan, tablaGlobal, propia: propia[0].plan, rol: rol[0].r };
    });
    expect(r.rol).toBe("servi_app");
    expect(r.propia).not.toBeNull();
    expect(sqlstateDe(r.otra)).toBe("42501");
    expect(sqlstateDe(r.tarifaDeOtra)).toBe("42501");
    expect(sqlstateDe(r.tarifaPropia)).toBe("42501");
    expect(sqlstateDe(r.tablaPlan)).toBe("42501");
    expect(sqlstateDe(r.tablaGlobal)).toBe("42501");
  });

  it("R22: servi_app no tiene EXECUTE sobre cobro_plataforma_tarifa_de, y sí sobre plan_de_la_empresa", async () => {
    const filas = await base.$queryRawUnsafe<{ tarifa: boolean; lectura: boolean }[]>(
      `SELECT has_function_privilege('servi_app', 'cobro_plataforma_tarifa_de(text)', 'EXECUTE') AS tarifa,
              has_function_privilege('servi_app', 'plan_de_la_empresa(text)', 'EXECUTE') AS lectura`,
    );
    expect(filas[0]).toEqual({ tarifa: false, lectura: true });
  });
});
