import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { verDeudaPlataformaAction } from "@/lib/actions/deuda-plataforma";
import { registrarMovimientoManualAction, verResumenCajaAction } from "@/lib/actions/wallet";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaMovimientoRepository } from "@/lib/repositories/CobroPlataformaMovimientoRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { EliminarOrdenService } from "@/lib/services/EliminarOrdenService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { menos } from "./_fixtures/caja-459";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-40 (design §11.2) — LA DEUDA CON LA PLATAFORMA EN LA WALLET, Y LA CAJA QUE NO SE MUEVE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Molde de la 459 que commitea (`_fixtures/escrituras-459`): la caja y la deuda se leen por sus
// server actions SIN servicio inyectado, así que cada una construye el suyo con `getPrismaClient()`,
// la extensión y la bajada a `servi_app`, como en una petición. Solo se inyecta el actor; la empresa
// sale de `conEmpresa`, como de la sesión.
//
// Las órdenes se crean por el cliente extendido (en `servi_app`, con la RLS de `orden`) y se anulan
// con `EliminarOrdenService` real, el de la pantalla. Quien escribe el cargo y el reverso es el
// trigger: las vías de creación y de anulación ya las cubre `cobro-plataforma-cargos.test.ts`.
//
// Lo que se compara es la caja de A ANTES y DESPUÉS de cargar la deuda, campo a campo (R22). La caja
// no está vacía: un ajuste real la deja con dinero, y un control lo comprueba, porque dos resúmenes
// en cero son iguales aunque la deuda se hubiera sumado a una cifra que no se mira.
//
// B tiene su propia excepción (300.00) y su propia orden: ve lo suyo (no un cero, que pasaría por
// aislamiento aunque no lo hubiera) y nada de A (R24).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const FILTRO_SIN_FILTROS = { page: 1, pageSize: 10 };
/** Un día en el que ni la caja ni la deuda de esta ejecución tienen nada. */
const FILTRO_PERIODO_PASADO = { page: 1, pageSize: 10, desde: "2020-01-01", hasta: "2020-01-31" };

let base: PrismaClient;
let app: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

interface Empresa {
  p: Personas459;
  zonaId: string;
}

let A: Empresa;
let B: Empresa;
let geo: { provinciaId: string; cantonId: string; distritoId: string };
let estatusInicialId: string;

const deps = (actor: Actor) => ({ getActor: async () => actor });

async function sembrarEmpresa(): Promise<Empresa> {
  const p = await sembrarPersonas459(base);
  const zona = await bajoLockDeEscrituraReal(() =>
    base.zona.create({
      data: { nombre: `Zona SL40-T6 ${RUN} ${randomUUID().slice(0, 6)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  return { p, zonaId: zona.id };
}

/** Una orden creada por la empresa, por el cliente extendido (`servi_app`). El trigger la carga. */
async function crearOrden(e: Empresa, nombre: string): Promise<string> {
  const o = await conEmpresa(e.p.organizacionId, () =>
    app.orden.create({
      data: {
        numRemision: `SL40T6-${nombre}-${RUN}`,
        estatusId: estatusInicialId,
        destinatario: `Cliente SL40 ${RUN}`,
        telefonoDest: "88887777",
        tiendaId: e.p.tiendaId,
        zonaId: e.zonaId,
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
function eliminar(e: Empresa, ordenId: string) {
  const repo = new OrdenRepository(app);
  const historial = new OrdenHistorialService(
    repo,
    new OrdenHistorialRepository(app),
    new OrdenDiaRepartoCambioRepository(app),
    new OrdenTraspasoRepository(app),
  );
  return conEmpresa(e.p.organizacionId, () =>
    new EliminarOrdenService(repo, historial).eliminar({ ordenIds: [ordenId] }, e.p.maestro),
  );
}

async function leerCaja(e: Empresa, filtro: Record<string, unknown>) {
  const r = await conEmpresa(e.p.organizacionId, () => verResumenCajaAction(filtro, deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verResumenCajaAction respondió ${JSON.stringify(r)}`);
  return { resumen: r.resumen, composicion: r.composicion };
}

async function leerDeuda(e: Empresa, actor: Actor = e.p.maestro): Promise<string> {
  const r = await conEmpresa(e.p.organizacionId, () => verDeudaPlataformaAction(deps(actor)));
  if (r.status !== "ok") throw new Error(`verDeudaPlataformaAction respondió ${JSON.stringify(r)}`);
  return r.deudaPlataforma.deuda;
}

const filasDeCaja = (e: Empresa) => base.walletMovimiento.count({ where: { organizacionId: e.p.organizacionId } });

const movimientosDe = (e: Empresa) =>
  base.$queryRawUnsafe<{ tipo: string; monto: string }[]>(
    `SELECT "tipo"::text AS tipo, "monto"::text AS monto FROM "cobro_plataforma_movimiento"
      WHERE "organizacion_id" = $1 ORDER BY "created_at", "secuencia"`,
    e.p.organizacionId,
  );

describeSiHayBase("SL-40 — la deuda con la plataforma en la wallet (Postgres, R22–R27)", () => {
  let cajaAntes: Awaited<ReturnType<typeof leerCaja>>;
  let deudaAntes: string;
  let filasDeCajaAntes: number;

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
    A = await sembrarEmpresa();
    B = await sembrarEmpresa();
    await base.$executeRawUnsafe(
      `UPDATE "organizacion" SET "cobro_plataforma_por_orden" = 300.00 WHERE "id" = $1`,
      B.p.organizacionId,
    );

    // El dinero de la caja de A, escrito por su action real: un ajuste que suma.
    const ajuste = await conEmpresa(A.p.organizacionId, () =>
      registrarMovimientoManualAction(
        { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto: "7777.77", descripcion: "Ajuste SL-40 T6" },
        deps(A.p.maestro),
      ),
    );
    if (ajuste.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(ajuste)}`);
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.p.organizacionId, B?.p.organizacionId].filter((x): x is string => typeof x === "string");
    try {
      if (orgs.length > 0) {
        // Los movimientos del cobro se van con su orden (ON DELETE CASCADE).
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      await limpiar459(base, A?.p ?? null);
      await limpiar459(base, B?.p ?? null);
    } finally {
      await tarifaGlobal?.soltar();
      await base.$disconnect();
    }
  }, 180_000);

  it("control: la caja de A tiene dinero y todavía no hay deuda", async () => {
    cajaAntes = await leerCaja(A, FILTRO_SIN_FILTROS);
    deudaAntes = await leerDeuda(A);
    filasDeCajaAntes = await filasDeCaja(A);

    expect(cajaAntes.resumen.enCaja).toBe("7777.77");
    expect(cajaAntes.resumen.deEmpresa).toBe("7777.77");
    expect(filasDeCajaAntes).toBe(1);
    expect(deudaAntes).toBe("0.00");
  });

  it("R21/R26: A crea dos órdenes con el global en 500.00 y anula una → la deuda sube 500.00, en texto", async () => {
    const o1 = await crearOrden(A, "o1");
    await crearOrden(A, "o2");
    const r = await eliminar(A, o1);
    expect(r.status, JSON.stringify(r)).toBe("ok");

    // Sin el cargo y el reverso en la base, la cifra de abajo no probaría nada.
    expect(await movimientosDe(A)).toEqual([
      { tipo: "cargo", monto: "500.00" },
      { tipo: "cargo", monto: "500.00" },
      { tipo: "reverso", monto: "500.00" },
    ]);
    const deuda = await leerDeuda(A);
    expect(deuda).toBe("500.00");
    expect(menos(deuda, deudaAntes)).toBe("500.00");
  });

  it("R22: todas las cifras del resumen y de la composición de la caja siguen iguales, campo a campo", async () => {
    const cajaDespues = await leerCaja(A, FILTRO_SIN_FILTROS);
    expect(cajaDespues.resumen).toEqual(cajaAntes.resumen);
    expect(cajaDespues.composicion).toEqual(cajaAntes.composicion);
  });

  it("R27: los cargos y el reverso no escriben ninguna fila en wallet_movimiento", async () => {
    expect(await filasDeCaja(A)).toBe(filasDeCajaAntes);
    expect(await filasDeCaja(B)).toBe(0);
  });

  it("R23: con los filtros de período del libro la caja cambia, y la deuda no", async () => {
    const cajaFiltrada = await leerCaja(A, FILTRO_PERIODO_PASADO);
    // Control: el filtro sí actúa sobre la caja (el ajuste de hoy queda fuera del período).
    expect(cajaFiltrada.resumen).not.toEqual(cajaAntes.resumen);
    expect(await leerDeuda(A)).toBe("500.00");
  });

  it("R23: la deuda cuenta los movimientos desde el principio, sin corte de fechas", async () => {
    // Como dueño, los movimientos de A se llevan a 2020: siguen contando igual.
    await base.$executeRawUnsafe(
      `UPDATE "cobro_plataforma_movimiento" SET "ocurrido_at" = '2020-01-15', "created_at" = '2020-01-15'
        WHERE "organizacion_id" = $1`,
      A.p.organizacionId,
    );
    expect(await leerDeuda(A)).toBe("500.00");
    expect(await leerDeuda(A, A.p.admin)).toBe("500.00");
  });

  it("R24: B ve solo su deuda (300.00, su excepción) y nada de la de A", async () => {
    await crearOrden(B, "p1");
    expect(await movimientosDe(B)).toEqual([{ tipo: "cargo", monto: "300.00" }]);

    // Por la action: la extensión y la RLS, con la empresa de la sesión.
    expect(await leerDeuda(B)).toBe("300.00");
    expect(await leerDeuda(A)).toBe("500.00");
  });

  it("R24: el filtro del repositorio aísla por sí solo, también con el cliente dueño (sin extensión ni RLS)", async () => {
    const repo = new CobroPlataformaMovimientoRepository(base);
    expect(derivarDeudaPlataforma(await repo.sumasPorTipo(B.p.organizacionId), "0.00").deuda).toBe("300.00");
    expect(derivarDeudaPlataforma(await repo.sumasPorTipo(A.p.organizacionId), "0.00").deuda).toBe("500.00");
  });

  it("R25: un rol sin acceso total no lee la deuda", async () => {
    const r = await conEmpresa(A.p.organizacionId, () => verDeudaPlataformaAction(deps(A.p.mensajero)));
    expect(r).toEqual({ status: "forbidden" });
  });
});
