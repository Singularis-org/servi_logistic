import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { EfectoElegido } from "@/lib/interfaces/repositories/IPlanesRepository";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { CobroPlataformaMovimientoRepository } from "@/lib/repositories/CobroPlataformaMovimientoRepository";
import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import { PagoPlataformaRepository } from "@/lib/repositories/PagoPlataformaRepository";
import { TopePagoPlataformaService } from "@/lib/services/TopePagoPlataformaService";
import type { TipoCobro } from "@/lib/types/planes";
import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, clienteConTransaccionAnidada, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { crearEmpresa, crearOrden, type EmpresaPorcentual } from "./_fixtures/cobro-porcentual";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { cero } from "./_fixtures/periodo-calendario";
import { crearPlan, planesEnTx, revertida, sqlstateDe } from "./_fixtures/planes";
import { confirmarComoDueno, type AplicacionDePrueba } from "./_fixtures/factura-cerrada";

// SLT-118 · T9.1 (design §2.7, §5; R18–R20, R40) — la deuda de la empresa con la plataforma cuando se cierran
// facturas con cuota, contra Postgres. La deuda se mide en sus cuatro sitios, que tienen que dar lo mismo:
//   · la wallet de la empresa: `derivarDeudaPlataforma` sobre `CobroPlataformaMovimientoRepository.sumasPorTipo`
//     y `PagoPlataformaRepository.sumaPagosConfirmados` (lo que pinta `DeudaPlataformaService`);
//   · el tope del pago en la app: `TopePagoPlataformaService.comprobar` (`cabe` / `supera`);
//   · el tope del pago en la base: un INSERT del pago como `servi_app`; uno que la supera → 23514
//     (`wallet_movimiento_tope_pago_plataforma`);
//   · el listado de empresas del superadmin: `EmpresasPlataformaRepository.listar`.
//
// SLT-60 (design §8.1): el tope ya no es la deuda sino lo DISPONIBLE (Σ saldo de las facturas cerradas − Σ pagos
// por confirmar), y la deuda baja al CONFIRMAR un pago. Para que los cuatro sitios sigan comparándose con el mismo
// número, cada pago que entra se confirma como dueño (`confirmarComoDueno`) contra las cerradas antes de medir, y
// el cargo del primer caso cae en la primera factura (la del alta), que se cierra antes de pagar. Así la deuda y
// lo disponible coinciden en cada medida.
//
// El escenario de dos cuotas es el de R16 con P18 (`factura-plataforma-cambio-plan.test.ts`): alta el 16 de
// octubre sin plan y un plan quincenal de 15 500 con inicio el 1 de noviembre aplicado el 12. La factura del
// 1 al 15 se emite el 16 con la primera cuota (15 500.00, del 1 al 15) y la de la quincena del 16 (15 500.00).
//
// Cada caso en una transacción que se revierte; el reloj va por parámetro. Las 00:00 del día D son `cero(D)`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const MINUTO_MS = 60_000;
const ACTOR = randomUUID();
const mas = (iso: string, minutos: number) => new Date(new Date(iso).getTime() + minutos * MINUTO_MS).toISOString();
/** La corrida de las 00:10 de la plataforma del día `fecha`. */
const corrida = (fecha: string) => mas(cero(fecha), 10);

let base: PrismaClient;

/* -------------------------------------------------------------------------- */
/* Escritura (como dueño)                                                      */
/* -------------------------------------------------------------------------- */

async function planConPrecio(tx: TxDeTest, mensual: string): Promise<string> {
  const id = await crearPlan(tx);
  await tx.$executeRawUnsafe(`UPDATE "plan" SET "precio_mensual" = $2::numeric WHERE "id" = $1`, id, mensual);
  await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = $2::numeric WHERE "plan_id" = $1`, id, mensual);
  return id;
}

/** Una empresa con su alta en `alta`; con plan, como si lo tuviera desde el alta (sin marca de primera cuota). */
async function empresa(tx: TxDeTest, alta: string, plan?: { id: string; tipo: TipoCobro }): Promise<EmpresaPorcentual> {
  const e = await crearEmpresa(tx);
  await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "created_at" = $2::timestamp WHERE "id" = $1`, e.id, alta);
  if (plan) {
    await tx.$executeRawUnsafe(
      `UPDATE "organizacion" SET "plan_id" = $2, "plan_tipo_cobro" = $3, "plan_ciclo_ancla_at" = $4::timestamp WHERE "id" = $1`,
      e.id,
      plan.id,
      plan.tipo,
      alta,
    );
  }
  return e;
}

/** Un cargo de una orden nueva con su instante (el cargo del alta de la orden, con el reloj real, se borra). */
async function cargo(tx: TxDeTest, e: EmpresaPorcentual, monto: string, en: string): Promise<void> {
  const orden = await crearOrden(tx, e);
  await tx.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, orden);
  await tx.$executeRawUnsafe(
    `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
     VALUES ($1, $2, $3, 1, 'cargo', 'plan', $4::numeric, $5::timestamp)`,
    `slt118-${randomUUID()}`,
    e.id,
    orden,
    monto,
    en,
  );
}

function cerrar(tx: TxDeTest, organizacionId: string, ahora: string): Promise<number> {
  return new FacturaPlataformaRepository(tx).cerrar(organizacionId, new Date(ahora));
}

/** «Asignar» del superadmin por el repositorio real; `ahora` decide si se aplica en el acto o queda pendiente. */
async function asignar(
  tx: TxDeTest,
  organizacionId: string,
  plan: string,
  clase: EfectoElegido["clase"],
  fecha: string,
  tipo: TipoCobro,
  ahora: string,
): Promise<{ pendiente: boolean }> {
  await fijarEmpresa(tx, "");
  const efecto: EfectoElegido = { clase, fecha, desde: inicioDelDiaPlataforma(fecha), elegida: true };
  const r = await planesEnTx(tx).asignar(organizacionId, plan, ACTOR, efecto, tipo, new Date(ahora));
  if (r.estado !== "ok") throw new Error(`asignar: ${JSON.stringify(r)}`);
  return { pendiente: r.pendiente };
}

/* -------------------------------------------------------------------------- */
/* La deuda en sus cuatro sitios                                               */
/* -------------------------------------------------------------------------- */

/** La deuda de la wallet: la misma derivación que `DeudaPlataformaService`. */
async function deudaDeLaWallet(tx: TxDeTest, organizacionId: string): Promise<string> {
  const sumas = await new CobroPlataformaMovimientoRepository(tx).sumasPorTipo(organizacionId, tx);
  const pagos = await new PagoPlataformaRepository(tx).sumaPagosConfirmados(organizacionId, tx);
  return derivarDeudaPlataforma(sumas, pagos).deuda;
}

/** El tope del pago en la app, con la empresa fijada (el candado la lee de `app.organizacion_id`). */
async function topeDeLaApp(tx: TxDeTest, organizacionId: string, monto: string): Promise<string> {
  await fijarEmpresa(tx, organizacionId);
  const tope = new TopePagoPlataformaService(new PagoPlataformaRepository(tx));
  return tope.comprobar(tx, { organizacionId, monto, claveIdempotencia: randomUUID() });
}

/** La deuda del listado de empresas del superadmin. */
async function deudaDelListado(tx: TxDeTest, organizacionId: string): Promise<string | undefined> {
  await fijarEmpresa(tx, "");
  const listado = await new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx)).listar();
  return listado.find((f) => f.id === organizacionId)?.deudaPlataforma.deuda;
}

/**
 * Un pago a la plataforma escrito por SQL a mano como `servi_app`, en un SAVEPOINT: el tope de la base es el
 * trigger, no la app. `null` si entró; si no, el SQLSTATE.
 */
async function pagoEnLaBase(tx: TxDeTest, organizacionId: string, usuarioId: string, monto: string): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await comoApp(tx, organizacionId);
    await tx.$executeRawUnsafe(
      `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por")
       VALUES (gen_random_uuid()::text, 'egreso', 'egreso_pago_plataforma', $1::numeric, 'gasto', 'Pago a mano SLT-118', $2, $3)`,
      monto,
      organizacionId,
      usuarioId,
    );
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  } finally {
    await tx.$executeRawUnsafe(`RESET ROLE`);
  }
}

/** SLT-60: el id del pago escrito a mano por `pagoEnLaBase` con ese monto (uno solo). */
async function pagoDe(tx: TxDeTest, organizacionId: string, monto: string): Promise<string> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "wallet_movimiento"
      WHERE "organizacion_id" = $1 AND "categoria" = 'egreso_pago_plataforma' AND "monto" = $2::numeric`,
    organizacionId,
    monto,
  );
  if (filas.length !== 1) throw new Error(`se esperaba un pago de ${monto} y hay ${filas.length}`);
  return filas[0].id;
}

/** SLT-60: los ids de las facturas cerradas de la empresa, de la más vieja a la más nueva. */
async function idsDeCerradas(tx: TxDeTest, organizacionId: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "factura_plataforma" WHERE "organizacion_id" = $1 AND "estado" = 'cerrada' ORDER BY "desde_at"`,
    organizacionId,
  );
  return filas.map((f) => f.id);
}

/** SLT-60: confirma como dueño el pago de `monto` con el reparto dado (la deuda baja al confirmar). */
async function confirmar(tx: TxDeTest, organizacionId: string, usuarioId: string, monto: string, aplicaciones: AplicacionDePrueba[]): Promise<void> {
  await confirmarComoDueno(tx, organizacionId, await pagoDe(tx, organizacionId, monto), aplicaciones, usuarioId);
}

/** Las filas de la empresa en los tres libros que el cierre no debe tocar (R20). */
async function libros(tx: TxDeTest, organizacionId: string): Promise<{ cargos: string[]; trazas: string[]; wallet: string[] }> {
  const filas = (tabla: string) =>
    tx
      .$queryRawUnsafe<{ l: string }[]>(`SELECT t::text AS l FROM "${tabla}" t WHERE t."organizacion_id" = $1 ORDER BY t::text`, organizacionId)
      .then((r) => r.map((f) => f.l));
  return {
    cargos: await filas("cobro_plataforma_movimiento"),
    trazas: await filas("cobro_plataforma_traza"),
    wallet: await filas("wallet_movimiento"),
  };
}

/** Las cuotas de las facturas de la empresa, leídas como dueño. */
async function cuotas(tx: TxDeTest, organizacionId: string): Promise<{ estado: string; cuota: string | null; primera: string | null }[]> {
  return tx.$queryRawUnsafe(
    `SELECT "estado", "cuota"::text AS cuota, "primera_cuota"::text AS primera
       FROM "factura_plataforma" WHERE "organizacion_id" = $1 ORDER BY "desde_at"`,
    organizacionId,
  );
}

/** Cada fila de factura entera en texto: lo que un cambio movería. */
async function fotoDeFacturas(tx: TxDeTest, organizacionId: string): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ l: string }[]>(
    `SELECT f::text AS l FROM "factura_plataforma" f WHERE f."organizacion_id" = $1 AND f."estado" = 'cerrada' ORDER BY f."desde_at"`,
    organizacionId,
  );
  return filas.map((f) => f.l);
}

describeSiHayBase("SLT-118 — la deuda con la plataforma y las cuotas de las facturas (R18–R20, R40)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R18, R19: una factura con las dos cuotas sube la deuda en las dos, igual en la wallet, el tope de la app, el de la base y el listado; la en curso no suma y el pago ya hecho no cambia", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-10-16"));
      await fijarEmpresa(tx, e.id);
      const { id: usuario } = await crearUsuarioDePrueba(tx, "maestro");
      // SLT-60 (R3): solo se paga lo de facturas cerradas. El cargo cae en la factura del alta (del 16 de octubre
      // al 1 de noviembre), que el cierre del 1 deja cerrada antes del pago.
      await cargo(tx, e, "100.00", "2026-10-20T15:00:00.000Z");
      await cerrar(tx, e.id, corrida("2026-11-01"));
      // R16 con P18: la en curso del 1 pasa entera al plan con su marca; aún no suma ninguna cuota.
      await asignar(tx, e.id, quincenal, "inicio", "2026-11-01", "quincenal", "2026-11-12T15:00:00.000Z");
      const pagoPrevio = await pagoEnLaBase(tx, e.id, usuario, "60.00");
      const [delAlta] = await idsDeCerradas(tx, e.id);
      // SLT-60 (R7): la deuda baja al confirmar el pago, no al registrarlo.
      await confirmar(tx, e.id, usuario, "60.00", [{ facturaId: delAlta, monto: "60.00" }]);
      const antes = {
        wallet: await deudaDeLaWallet(tx, e.id),
        listado: await deudaDelListado(tx, e.id),
        appSupera: await topeDeLaApp(tx, e.id, "40.01"),
        appCabe: await topeDeLaApp(tx, e.id, "40.00"),
        baseSupera: await pagoEnLaBase(tx, e.id, usuario, "40.01"),
      };
      const pagosAntes = (await libros(tx, e.id)).wallet;
      const cerradas = await cerrar(tx, e.id, corrida("2026-11-16"));
      const facturas = await cuotas(tx, e.id);
      const pagosDespues = (await libros(tx, e.id)).wallet;
      const despues = {
        wallet: await deudaDeLaWallet(tx, e.id),
        listado: await deudaDelListado(tx, e.id),
        appSupera: await topeDeLaApp(tx, e.id, "31040.01"),
        appCabe: await topeDeLaApp(tx, e.id, "31040.00"),
        baseSupera: await pagoEnLaBase(tx, e.id, usuario, "31040.01"),
        baseCabe: await pagoEnLaBase(tx, e.id, usuario, "31040.00"),
      };
      // SLT-60: el pago que cabe se confirma contra las dos cerradas (40.00 de saldo de la del alta y 31 000.00 de
      // las cuotas) antes de medir la deuda saldada.
      const [primera, segunda] = await idsDeCerradas(tx, e.id);
      await confirmar(tx, e.id, usuario, "31040.00", [
        { facturaId: primera, monto: "40.00" },
        { facturaId: segunda, monto: "31000.00" },
      ]);
      const saldada = {
        wallet: await deudaDeLaWallet(tx, e.id),
        app: await topeDeLaApp(tx, e.id, "0.01"),
        base: await pagoEnLaBase(tx, e.id, usuario, "0.01"),
      };
      return { pagoPrevio, antes, pagosAntes, cerradas, facturas, pagosDespues, despues, saldada };
    });
    expect(r.pagoPrevio).toBeNull();
    // Antes del cierre: 100.00 de cargos − 60.00 pagados y confirmados (lo disponible: 100.00 de la cerrada − 60.00
    // aplicados). La en curso con su marca no suma.
    expect(r.antes).toEqual({ wallet: "40.00", listado: "40.00", appSupera: "supera", appCabe: "cabe", baseSupera: "23514" });
    expect(r.cerradas).toBe(1);
    expect(r.facturas).toEqual([
      { estado: "cerrada", cuota: null, primera: null },
      { estado: "cerrada", cuota: "15500.00", primera: "15500.00" },
      { estado: "en_curso", cuota: null, primera: null },
    ]);
    // Las dos cuotas suben la deuda: 40.00 + 15 500.00 + 15 500.00, igual en los cuatro sitios.
    expect(r.despues).toEqual({
      wallet: "31040.00",
      listado: "31040.00",
      appSupera: "supera",
      appCabe: "cabe",
      baseSupera: "23514",
      baseCabe: null,
    });
    // R19: el pago de antes del cierre sigue igual, y con la cuota pagada y confirmada no cabe ni un céntimo más.
    expect(r.pagosDespues).toEqual(r.pagosAntes);
    expect(r.saldada).toEqual({ wallet: "0.00", app: "supera", base: "23514" });
  });

  it("R20: aplicar una primera asignación (R16) y cerrar una factura con dos cuotas no escriben cargos, trazas ni movimientos de la wallet", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const e = await empresa(tx, cero("2026-10-16"));
      await cerrar(tx, e.id, corrida("2026-11-01"));
      await cargo(tx, e, "100.00", "2026-11-05T15:00:00.000Z");
      const antes = await libros(tx, e.id);
      await asignar(tx, e.id, quincenal, "inicio", "2026-11-01", "quincenal", "2026-11-12T15:00:00.000Z");
      const trasAplicar = await libros(tx, e.id);
      const cerradas = await cerrar(tx, e.id, corrida("2026-11-16"));
      return { antes, trasAplicar, cerradas, despues: await libros(tx, e.id), facturas: await cuotas(tx, e.id) };
    });
    // Control de no vacuidad: el cargo y su traza existen, y el cierre sí emitió las dos cuotas.
    expect(r.antes.cargos).toHaveLength(1);
    expect(r.antes.trazas.length).toBeGreaterThan(0);
    expect(r.cerradas).toBe(1);
    expect(r.facturas[1]).toEqual({ estado: "cerrada", cuota: "15500.00", primera: "15500.00" });
    expect(r.trasAplicar).toEqual(r.antes);
    expect(r.despues).toEqual(r.antes);
  });

  it("R40: un cambio de plan y de tipo de cobro aplicado tras emitir dos cuotas no las devuelve: las cerradas siguen igual y la deuda no baja", async () => {
    const r = await revertida(base, async (tx) => {
      const quincenal = await planConPrecio(tx, "31000.00");
      const barato = await planConPrecio(tx, "10000.00");
      const e = await empresa(tx, cero("2026-11-01"), { id: quincenal, tipo: "quincenal" });
      await fijarEmpresa(tx, e.id);
      const { id: usuario } = await crearUsuarioDePrueba(tx, "maestro");
      // Emitidas el 16 de noviembre y el 1 de diciembre, cada una con la quincena que empieza (15 500.00).
      await cerrar(tx, e.id, corrida("2026-12-01"));
      const antes = { facturas: await fotoDeFacturas(tx, e.id), wallet: await deudaDeLaWallet(tx, e.id) };
      // Con efecto el 1 de diciembre (ya pasado), guardado el 3: se aplica en el acto, al plan barato y mensual.
      const cambio = await asignar(tx, e.id, barato, "cambio", "2026-12-01", "mensual", "2026-12-03T15:00:00.000Z");
      const [org] = await tx.$queryRawUnsafe<{ plan: string; tipo: string }[]>(
        `SELECT "plan_id" AS plan, "plan_tipo_cobro" AS tipo FROM "organizacion" WHERE "id" = $1`,
        e.id,
      );
      const despues = {
        facturas: await fotoDeFacturas(tx, e.id),
        wallet: await deudaDeLaWallet(tx, e.id),
        listado: await deudaDelListado(tx, e.id),
        app: await topeDeLaApp(tx, e.id, "31000.00"),
        base: await pagoEnLaBase(tx, e.id, usuario, "31000.00"),
      };
      return { barato, cambio, org, antes, despues };
    });
    expect(r.cambio.pendiente).toBe(false);
    expect(r.org).toEqual({ plan: r.barato, tipo: "mensual" });
    expect(r.antes.facturas).toHaveLength(2);
    expect(r.antes.wallet).toBe("31000.00");
    // R13, R40: las cerradas no cambian; la deuda sigue con las dos cuotas y se puede pagar entera.
    expect(r.despues).toEqual({ facturas: r.antes.facturas, wallet: "31000.00", listado: "31000.00", app: "cabe", base: null });
  });
});
