import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { verDeudaPlataformaAction } from "@/lib/actions/deuda-plataforma";
import { verMiPlan } from "@/lib/actions/_shared/mi-plan";
import { registrarMovimientoManualAction, verResumenCajaAction } from "@/lib/actions/wallet";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { EliminarOrdenService } from "@/lib/services/EliminarOrdenService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { menos } from "./_fixtures/caja-459";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-66 (design §8, §9.1; R17, R21) — LA DEUDA DE LA WALLET CON CARGOS DEL PLAN, Y LO QUE NO SE MUEVE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Mismo molde que `deuda-plataforma-wallet.test.ts` (SL-40, molde 459 que commitea): la caja, la deuda y
// «Mi plan» se leen por sus puertas reales SIN servicio inyectado, así que cada una construye el suyo con
// `getPrismaClient()`, la extensión y la bajada a `servi_app`, como en una petición. Solo se inyecta el
// actor; la empresa sale de `conEmpresa`, como de la sesión.
//
// Lo que se prueba es que `WalletService`, `DeudaPlataformaService` y `derivarDeudaPlataforma` NO
// necesitan cambiar (design §8): suman todos los movimientos sin mirar la fuente, así que un cargo de
// fuente `plan` cuenta como cualquier otro (R17). Ninguno de los tres se toca en esta ficha.
//
// La empresa tiene el plan con costo por orden 100,00 y el global está en 500,00: si la deuda saliera
// del global, la cifra no sería 100,00. La caja tiene dinero (un ajuste real), porque dos resúmenes en
// cero son iguales aunque la deuda se hubiera sumado a una cifra que no se mira.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const FILTRO_SIN_FILTROS = { page: 1, pageSize: 10 };

let base: PrismaClient;
let app: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;
let A: { p: Personas459; zonaId: string } | undefined;
let planId: string | undefined;
let geo: { provinciaId: string; cantonId: string; distritoId: string };
let estatusInicialId: string;

const deps = (actor: Actor) => ({ getActor: async () => actor });
const empresa = () => {
  if (A === undefined) throw new Error("la siembra de A no terminó");
  return A;
};
const org = () => empresa().p.organizacionId;

/** Una orden creada por la empresa, por el cliente extendido (`servi_app`). El trigger la carga. */
async function crearOrden(nombre: string): Promise<string> {
  const o = await conEmpresa(org(), () =>
    app.orden.create({
      data: {
        numRemision: `SLT66D-${nombre}-${RUN}`,
        estatusId: estatusInicialId,
        destinatario: `Cliente SLT66 ${RUN}`,
        telefonoDest: "88887777",
        tiendaId: empresa().p.tiendaId,
        zonaId: empresa().zonaId,
        provinciaId: geo.provinciaId,
        cantonId: geo.cantonId,
        distritoId: geo.distritoId,
        producto: "Caja",
      },
      select: { id: true },
    }),
  );
  return o.id;
}

/** La anulación por pantalla, cableada como su composition root. */
function eliminar(ordenId: string) {
  const repo = new OrdenRepository(app);
  const historial = new OrdenHistorialService(
    repo,
    new OrdenHistorialRepository(app),
    new OrdenDiaRepartoCambioRepository(app),
    new OrdenTraspasoRepository(app),
  );
  return conEmpresa(org(), () => new EliminarOrdenService(repo, historial).eliminar({ ordenIds: [ordenId] }, empresa().p.maestro));
}

async function leerCaja() {
  const r = await conEmpresa(org(), () => verResumenCajaAction(FILTRO_SIN_FILTROS, deps(empresa().p.maestro)));
  if (r.status !== "ok") throw new Error(`verResumenCajaAction respondió ${JSON.stringify(r)}`);
  return { resumen: r.resumen, composicion: r.composicion };
}

async function leerDeuda(): Promise<string> {
  const r = await conEmpresa(org(), () => verDeudaPlataformaAction(deps(empresa().p.maestro)));
  if (r.status !== "ok") throw new Error(`verDeudaPlataformaAction respondió ${JSON.stringify(r)}`);
  return r.deudaPlataforma.deuda;
}

/** Filas de A en las dos tablas que R21 prohíbe escribir al leer, contadas como dueño. */
async function filasDeA(): Promise<{ cobro: number; wallet: number }> {
  const [cobro, wallet] = await Promise.all([
    base.cobroPlataformaMovimiento.count({ where: { organizacionId: org() } }),
    base.walletMovimiento.count({ where: { organizacionId: org() } }),
  ]);
  return { cobro, wallet };
}

const movimientosDeA = () =>
  base.$queryRawUnsafe<{ tipo: string; fuente: string; monto: string }[]>(
    `SELECT "tipo"::text AS tipo, "fuente"::text AS fuente, "monto"::text AS monto FROM "cobro_plataforma_movimiento"
      WHERE "organizacion_id" = $1 ORDER BY "created_at", "secuencia"`,
    org(),
  );

describeSiHayBase("SLT-66 — la deuda de la wallet con cargos del plan (Postgres, R17, R21)", () => {
  let cajaAntes: Awaited<ReturnType<typeof leerCaja>>;
  let deudaAntes: string;
  let filasAntes: { cobro: number; wallet: number };

  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);

    const estatus = await base.orderStatus.findUnique({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
    if (estatus === null) throw new Error("falta el estatus «por_recolectar_en_tienda»: corre `pnpm run db:seed`");
    estatusInicialId = estatus.id;
    const distrito = await base.distrito.findFirst({
      where: { activo: true },
      select: { id: true, cantonId: true, canton: { select: { provinciaId: true } } },
      orderBy: { id: "asc" },
    });
    if (distrito === null) throw new Error("no hay distritos: aplica las migraciones");
    geo = { provinciaId: distrito.canton.provinciaId, cantonId: distrito.cantonId, distritoId: distrito.id };

    tarifaGlobal = await tomarTarifaGlobal();
    await tarifaGlobal.fijar("500.00");

    const p = await sembrarPersonas459(base);
    const zona = await bajoLockDeEscrituraReal(() =>
      base.zona.create({
        data: { nombre: `Zona SLT66-T7 ${RUN}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
        select: { id: true },
      }),
    );
    A = { p, zonaId: zona.id };

    // El plan custom de A, con costo base concreto y costo por orden 100,00, asignado como dueño (la
    // misma sentencia que `_fixtures/planes.ts > asignarPlan`).
    planId = (
      await base.plan.create({
        data: {
          nombre: `SLT66 T7 ${RUN}`,
          visibilidad: "custom",
          organizacionExclusivaId: p.organizacionId,
          precioMensual: "50000.00",
          costoPorOrden: "100.00",
        },
        select: { id: true },
      })
    ).id;
    await base.$executeRawUnsafe(
      `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '1 hour' WHERE "id" = $2`,
      planId,
      p.organizacionId,
    );

    // El dinero de la caja de A, escrito por su action real: un ajuste que suma.
    const ajuste = await conEmpresa(p.organizacionId, () =>
      registrarMovimientoManualAction(
        { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto: "7777.77", descripcion: "Ajuste SLT-66 T7" },
        deps(p.maestro),
      ),
    );
    if (ajuste.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(ajuste)}`);
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    try {
      if (A !== undefined) {
        const orgs = [A.p.organizacionId];
        // Los movimientos del cobro se van con su orden (ON DELETE CASCADE).
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
        // El plan custom se va con su empresa (ON DELETE CASCADE de `organizacion_exclusiva_id`).
        await limpiar459(base, A.p);
      }
    } finally {
      await tarifaGlobal?.soltar();
      await base.$disconnect();
    }
  }, 180_000);

  it("control: la caja de A tiene dinero, todavía no hay deuda y A tiene el plan de 100.00", async () => {
    cajaAntes = await leerCaja();
    deudaAntes = await leerDeuda();
    filasAntes = await filasDeA();

    expect(cajaAntes.resumen.enCaja).toBe("7777.77");
    expect(filasAntes).toEqual({ cobro: 0, wallet: 1 });
    expect(deudaAntes).toBe("0.00");
    const asignado = await base.organizacion.findUniqueOrThrow({
      where: { id: org() },
      select: { planId: true, cobroPlataformaPorOrden: true, plan: { select: { costoPorOrden: true } } },
    });
    expect(asignado.planId).toBe(planId);
    expect(asignado.cobroPlataformaPorOrden).toBeNull();
    expect(asignado.plan?.costoPorOrden?.toFixed(2)).toBe("100.00");
  });

  it("R17: A crea dos órdenes con el plan de 100.00 y anula una → la deuda sube 100.00, en texto", async () => {
    const o1 = await crearOrden("o1");
    await crearOrden("o2");
    const r = await eliminar(o1);
    expect(r.status, JSON.stringify(r)).toBe("ok");

    // Sin el cargo y el reverso de fuente `plan` en la base, la cifra de abajo no probaría nada.
    expect(await movimientosDeA()).toEqual([
      { tipo: "cargo", fuente: "plan", monto: "100.00" },
      { tipo: "cargo", fuente: "plan", monto: "100.00" },
      { tipo: "reverso", fuente: "plan", monto: "100.00" },
    ]);
    const deuda = await leerDeuda();
    expect(deuda).toBe("100.00");
    expect(menos(deuda, deudaAntes)).toBe("100.00");
  });

  it("R17: todas las cifras del resumen y de la composición de la caja siguen iguales, campo a campo", async () => {
    const cajaDespues = await leerCaja();
    expect(cajaDespues.resumen).toEqual(cajaAntes.resumen);
    expect(cajaDespues.composicion).toEqual(cajaAntes.composicion);
    // Los cargos y el reverso no escriben en la caja.
    expect((await filasDeA()).wallet).toBe(filasAntes.wallet);
  });

  it("R21: leer «Mi plan» (MiPlanService.ver, por su composition root) no escribe en ninguna de las dos tablas", async () => {
    const antes = await filasDeA();
    expect(antes.cobro).toBe(3);

    const r = await conEmpresa(org(), () => verMiPlan(empresa().p.maestro));
    // Control: la lectura llegó a la base y trajo el plan; un `forbidden` no probaría nada.
    expect(r.estado).toBe("ok");
    expect(r.estado === "ok" ? r.plan : null).not.toBeNull();

    expect(await filasDeA()).toEqual(antes);
    expect(await leerDeuda()).toBe("100.00");
  });
});
