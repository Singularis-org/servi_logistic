import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { consultarMetricaFinanciera } from "@/lib/actions/analitica-financiera";
import { verDeudaPlataformaAction } from "@/lib/actions/deuda-plataforma";
import { registrarMovimientoManualAction } from "@/lib/actions/wallet";
import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { registrarEgresoAdministrativoAction } from "@/lib/actions/wallet-egresos";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ConciliacionCierresAnaliticaRepository } from "@/lib/repositories/ConciliacionCierresAnaliticaRepository";
import { CuentasPorPagarAnaliticaRepository } from "@/lib/repositories/CuentasPorPagarAnaliticaRepository";
import { IngresosAnaliticaRepository } from "@/lib/repositories/IngresosAnaliticaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoPlataformaRepository } from "@/lib/repositories/PagoPlataformaRepository";
import { RecaudoAnaliticaRepository } from "@/lib/repositories/RecaudoAnaliticaRepository";
import { AnaliticaFinancieraService } from "@/lib/services/AnaliticaFinancieraService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

import { comoApp } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, urlDeBaseDeDatos } from "./_postgres-real";
import { conectar, type Conexion } from "./_fixtures/ida-y-vuelta-32";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { asignarPlan, crearPlan } from "./_fixtures/planes";
import { cerrarFacturaEnCurso, confirmarComoDueno } from "./_fixtures/factura-cerrada";

import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
// SLT-42 (T5.4): la zona del pais de la empresa es la de CR, como antes. Las reglas reales leen el pais
// de la empresa en curso con el cliente global, que no ve la empresa de una transaccion revertida ni
// tiene empresa fuera de `conEmpresa`; la zona por pais la miden `hora-por-pais-wallet` y `demo-qa`.
vi.mock("@/lib/services/ReglasPaisEmpresaService", async (importOriginal) => {
  const { reglasPaisFijas } = await import("@/tests/fabricas/reglas-pais");
  return {
    ...(await importOriginal<typeof import("@/lib/services/ReglasPaisEmpresaService")>()),
    construirReglasPaisEmpresa: () => reglasPaisFijas(),
  };
});

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-45 (review B1 y B2) — la deuda con la plataforma no se baja con SQL a mano como `servi_app`, y
// la métrica `egresos` cuenta el pago y su anulación.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// B1. Los cuatro ataques de la review, reproducidos como `servi_app` con la empresa fijada (lo que
// tiene cualquiera con la conexión de la app). Los cierra `20261024140000_pago_plataforma_blindaje`:
//   a) UPDATE del monto de un pago                  → 42501 (REVOKE UPDATE)
//   b) DELETE del contra-asiento de un pago anulado → 42501 (REVOKE DELETE)
//   c) INSERT de un pago mayor que la deuda         → 23514 (trigger del tope), también con dos
//      inserts a la vez y con un INSERT de varias filas
//   d) UPDATE de la categoría de un sueldo a pago   → 42501 (REVOKE UPDATE)
// Cada ataque corre en su transacción REVERTIDA: si una mutación lo deja pasar, el test se pone rojo
// y la base queda igual. Después de cada uno se mira que la deuda sigue en 400,00.
//
// Punto de partida de A, el de la review: cargos 1.000 (dos órdenes de 500), pago P1 de 600 vigente,
// pago P2 de 300 anulado y un sueldo S1 de 400. Deuda: 400,00.
//
// B2. `egresos` (tablero de /analitica y exportación financiera) cuenta el pago: pagar 600 baja su
// neto en 600, y anularlo lo deja como estaba. Se mide por diferencia en una empresa B propia.
//
// SLT-60 (design §8.1): solo se paga lo de facturas cerradas y la deuda baja al CONFIRMAR. La factura de cada
// empresa (1 000) se cierra en la siembra con el fixture `factura-cerrada.ts`, y P1 se confirma como dueño:
// así la deuda de partida sigue siendo 400,00 y lo disponible para registrar también (1 000 − 600 aplicados),
// que es el número contra el que choca el tope de los ataques c).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const MOTIVO = `Pago mal registrado SL45-B ${RUN}`;

let base: PrismaClient;
let app: PrismaClient;

interface Empresa {
  p: Personas459;
  zonaId: string;
}

let A: Empresa;
let B: Empresa;
let geo: { provinciaId: string; cantonId: string; distritoId: string };
let estatusInicialId: string;

const ids = { p1: "", p2: "", contraP2: "", s1: "" };
/** SLT-60: la factura cerrada de cada empresa. */
const factura = { A: "", B: "" };

const deps = (actor: Actor) => ({ getActor: async () => actor });
const org = (e: Empresa) => e.p.organizacionId;

/* -------------------------------------------------------------------------- */
/* Siembra                                                                     */
/* -------------------------------------------------------------------------- */

async function sembrarEmpresa(): Promise<Empresa> {
  const p = await sembrarPersonas459(base);
  const zona = await bajoLockDeEscrituraReal(() =>
    base.zona.create({
      data: { nombre: `Zona SL45-B ${RUN} ${randomUUID().slice(0, 6)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  return { p, zonaId: zona.id };
}

/** `n` órdenes por el repositorio real de la carga masiva: el trigger de SL-40 escribe el cargo. */
async function crearOrdenes(e: Empresa, n: number): Promise<void> {
  const filas = Array.from({ length: n }, (_, i) => ({
    numRemision: `SL45B-${RUN}-${randomUUID().slice(0, 6)}-${i}`,
    estatusId: estatusInicialId,
    destinatario: `Cliente SL45-B ${RUN}`,
    telefonoDest: "88887777",
    tiendaId: e.p.tiendaId,
    zonaId: e.zonaId,
    provinciaId: geo.provinciaId,
    cantonId: geo.cantonId,
    distritoId: geo.distritoId,
    producto: "Caja",
    peso: null,
    notas: null,
    direccion: null,
    montoCobrar: null,
  }));
  const r = await conEmpresa(org(e), () =>
    new OrdenRepository(app).createManyOrdenes(
      filas,
      100,
      { actorUsuarioId: e.p.tiendaId, origenTipo: "carga_masiva" },
      { cargaId: null, usuarioCargaId: e.p.tiendaId, totalFiles: n, name: null },
    ),
  );
  expect(r.inserted, JSON.stringify(r.omitidas)).toBe(n);
}

async function pagarOk(e: Empresa, monto: string): Promise<string> {
  const r = await conEmpresa(org(e), () =>
    registrarEgresoAdministrativoAction(
      { tipoEgreso: "pago_plataforma", monto, descripcion: `Transferencia SL45-B ${RUN} ${monto}`, claveIdempotencia: randomUUID() },
      deps(e.p.maestro),
    ),
  );
  if (r.status !== "ok") throw new Error(`el pago de ${monto} respondió ${JSON.stringify(r)}`);
  return r.movimiento.id;
}

async function anularOk(e: Empresa, movimientoId: string): Promise<void> {
  const r = await conEmpresa(org(e), () =>
    anularMovimientoAction({ destino: { libro: "caja", movimientoId }, motivo: MOTIVO }, deps(e.p.maestro)),
  );
  expect(r).toEqual({ status: "ok", camino: "egreso_caja" });
}

/** SLT-60: el pago entero contra la factura cerrada de la empresa, como dueño y commiteado. */
function confirmar(e: Empresa, facturaId: string, pagoId: string, monto: string): Promise<void> {
  return bajoLockDeEscrituraReal(() => confirmarComoDueno(base, org(e), pagoId, [{ facturaId, monto }], e.p.maestro.usuarioId));
}

async function deudaDe(e: Empresa): Promise<string> {
  const r = await conEmpresa(org(e), () => verDeudaPlataformaAction(deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verDeudaPlataformaAction respondió ${JSON.stringify(r)}`);
  return r.deudaPlataforma.deuda;
}

/* -------------------------------------------------------------------------- */
/* El atacante: `servi_app` con la empresa fijada                              */
/* -------------------------------------------------------------------------- */

/** SQLSTATE de un error de Prisma con driver adapter o de `pg`. */
function sqlstateDe(error: unknown): string {
  const texto = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) + String((error as Error)?.message ?? "");
  const conCode = /Code: `([0-9A-Z]{5})`/.exec(texto) ?? /"code":"([0-9A-Z]{5})"/.exec(texto);
  return conCode?.[1] ?? `?? ${String((error as Error)?.message ?? error).replace(/\s+/g, " ").slice(0, 160)}`;
}

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/**
 * Corre `sql` como `servi_app` de la empresa, en una transacción REVERTIDA. Devuelve el SQLSTATE si
 * la base lo rechaza, o `ACEPTADO (n filas)` si pasó (y entonces se deshace igual).
 */
function atacarComo(e: Empresa, sql: string, ...args: unknown[]): Promise<string> {
  return base
    .$transaction(async (tx) => {
      await comoApp(tx, org(e));
      const n = await tx.$executeRawUnsafe(sql, ...args);
      throw new Revertir(`ACEPTADO (${n} filas)`);
    })
    .catch((err: unknown) => (err instanceof Revertir ? String(err.valor) : sqlstateDe(err)));
}

/** Lo que `servi_app` de la empresa ve de una fila: control de que el ataque apunta a algo real. */
function visibleComo(e: Empresa, id: string): Promise<number> {
  return base
    .$transaction(async (tx) => {
      await comoApp(tx, org(e));
      const filas = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "wallet_movimiento" WHERE "id" = $1`, id);
      throw new Revertir(filas[0].n);
    })
    .catch((err: unknown) => {
      if (err instanceof Revertir) return Number(err.valor);
      throw err;
    });
}

const INSERTAR_PAGO = `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por")
  VALUES (gen_random_uuid()::text, 'egreso', 'egreso_pago_plataforma', $1::numeric, 'gasto', 'Pago a mano SL45-B', $2, $3)`;

/* -------------------------------------------------------------------------- */
/* B2: la métrica `egresos`                                                    */
/* -------------------------------------------------------------------------- */

async function egresosNetoDeHoy(e: Empresa): Promise<string> {
  const hoy = fechaCalendarioCR(new Date());
  const r = await conEmpresa(org(e), () =>
    consultarMetricaFinanciera(
      "egresos",
      { rango: "personalizado", desde: hoy, hasta: hoy },
      {
        service: new AnaliticaFinancieraService(
          new IngresosAnaliticaRepository(app),
          new RecaudoAnaliticaRepository(app),
          new CuentasPorPagarAnaliticaRepository(app),
          new ConciliacionCierresAnaliticaRepository(app),
          { logError: () => {} }, undefined, reglasPaisFijas(),
        ),
        getActor: async () => e.p.maestro,
        logger: { logError: () => {} },
      },
    ),
  );
  if (r.status !== "ok" || r.datos.tipo !== "vistas") throw new Error(`egresos respondió ${JSON.stringify(r)}`);
  const total = r.datos.vistas[0].total;
  if (total.forma !== "bruto_y_neto") throw new Error(`egresos sin neto: ${total.forma}`);
  return total.neto;
}

const restar = (a: string, b: string) => (Math.round(Number(a) * 100 - Number(b) * 100) / 100).toFixed(2);

/* -------------------------------------------------------------------------- */

describeSiHayBase("SL-45 review B1/B2 — la deuda no se baja con SQL a mano, y `egresos` cuenta el pago", () => {
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

    A = await sembrarEmpresa();
    B = await sembrarEmpresa();
    // Un plan custom fijo por empresa (SLT-126: antes, una excepción del mismo importe): el cargo no
    // depende del valor global, que comparten otros archivos. El custom se va con su empresa.
    for (const e of [A, B]) {
      const plan = await crearPlan(base, { custom: org(e) });
      await base.$executeRawUnsafe(`UPDATE "plan" SET "costo_por_orden" = 500.00 WHERE "id" = $1`, plan);
      await asignarPlan(base, org(e), plan);
      const r = await conEmpresa(org(e), () =>
        registrarMovimientoManualAction(
          { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto: "5000.00", descripcion: `Ajuste SL45-B ${RUN}` },
          deps(e.p.maestro),
        ),
      );
      if (r.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(r)}`);
      await crearOrdenes(e, 2);
    }
    // SLT-60 (R3): sin factura cerrada no se puede pagar nada.
    factura.A = (await cerrarFacturaEnCurso(base, org(A))).id;
    factura.B = (await cerrarFacturaEnCurso(base, org(B))).id;

    // El estado de la review, por las actions de la app. SLT-60: P1 confirmado, para que baje la deuda.
    ids.p1 = await pagarOk(A, "600.00");
    ids.p2 = await pagarOk(A, "300.00");
    await anularOk(A, ids.p2);
    await confirmar(A, factura.A, ids.p1, "600.00");
    const contra = await base.walletMovimiento.findFirstOrThrow({
      where: { organizacionId: org(A), tipo: "ingreso", categoria: "ingreso_ajuste", origenTipo: "gasto", origenId: ids.p2 },
      select: { id: true },
    });
    ids.contraP2 = contra.id;
    // El sueldo, como dueño: lo que importa es que exista una fila de otra categoría que recalificar.
    const s1 = await base.walletMovimiento.create({
      data: {
        organizacionId: org(A),
        tipo: "egreso",
        categoria: "egreso_sueldo",
        monto: "400.00",
        origenTipo: "gasto",
        descripcion: `Sueldo SL45-B ${RUN}`,
        registradoPor: A.p.maestro.usuarioId,
      },
      select: { id: true },
    });
    ids.s1 = s1.id;
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.p.organizacionId, B?.p.organizacionId].filter((x): x is string => typeof x === "string");
    try {
      if (orgs.length > 0) {
        await bajoLockDeEscrituraReal(async () => {
          // SLT-60: la FK del pago a su confirmación no tiene acción; las confirmaciones se van antes que el libro.
          for (const tabla of ["pago_plataforma_aplicacion", "pago_plataforma_confirmacion"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      await limpiar459(base, A?.p ?? null);
      await limpiar459(base, B?.p ?? null);
    } finally {
      await base.$disconnect();
    }
  }, 180_000);

  /* ------------------------- control de no vacuidad ------------------------ */

  it("control: A parte de la deuda de la review (400,00), con 400,00 disponibles, y servi_app de A ve las tres filas que se atacan", async () => {
    expect(await deudaDe(A)).toBe("400.00");
    // SLT-60: la factura de A está cerrada con los dos cargos y P1 confirmado contra ella.
    const f = await base.facturaPlataforma.findUniqueOrThrow({ where: { id: factura.A }, select: { estado: true, total: true } });
    expect({ estado: f.estado, total: f.total?.toFixed(2) }).toEqual({ estado: "cerrada", total: "1000.00" });
    const [d] = await base.$queryRaw<{ d: string }[]>`SELECT pago_plataforma_disponible_de(${org(A)})::text AS d`;
    expect(d.d).toBe("400.00");
    expect(await visibleComo(A, ids.p1)).toBe(1);
    expect(await visibleComo(A, ids.contraP2)).toBe(1);
    expect(await visibleComo(A, ids.s1)).toBe(1);
    // Y servi_app sí puede insertar en el libro: el REVOKE no se llevó el INSERT de la app.
    expect(
      await atacarComo(
        A,
        `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por")
         VALUES (gen_random_uuid()::text, 'egreso', 'egreso_gasto', 10.00, 'gasto', 'Gasto a mano SL45-B', $1, $2)`,
        org(A),
        A.p.maestro.usuarioId,
      ),
    ).toBe("ACEPTADO (1 filas)");
  });

  /* --------------------------------- B1 ----------------------------------- */

  it("B1 a) UPDATE del monto de un pago como servi_app → 42501, y la deuda sigue en 400,00", async () => {
    expect(await atacarComo(A, `UPDATE "wallet_movimiento" SET "monto" = 5000 WHERE "id" = $1`, ids.p1)).toBe("42501");
    expect(await deudaDe(A)).toBe("400.00");
  });

  it("B1 b) DELETE del contra-asiento de un pago anulado como servi_app → 42501, y la deuda sigue en 400,00", async () => {
    expect(await atacarComo(A, `DELETE FROM "wallet_movimiento" WHERE "id" = $1`, ids.contraP2)).toBe("42501");
    // Tampoco el pago vigente (e de la review, en contra de la empresa, pero es el mismo agujero).
    expect(await atacarComo(A, `DELETE FROM "wallet_movimiento" WHERE "id" = $1`, ids.p1)).toBe("42501");
    expect(await deudaDe(A)).toBe("400.00");
  });

  it("B1 c) INSERT a mano de un pago de 5.000 con deuda de 400 como servi_app → 23514 (tope), y la deuda sigue en 400,00", async () => {
    expect(await atacarComo(A, INSERTAR_PAGO, "5000.00", org(A), A.p.maestro.usuarioId)).toBe("23514");
    // El borde: un céntimo de más tampoco; lo justo sí entra (y se revierte).
    expect(await atacarComo(A, INSERTAR_PAGO, "400.01", org(A), A.p.maestro.usuarioId)).toBe("23514");
    expect(await atacarComo(A, INSERTAR_PAGO, "400.00", org(A), A.p.maestro.usuarioId)).toBe("ACEPTADO (1 filas)");
    expect(await deudaDe(A)).toBe("400.00");
  });

  it("B1 c) la vía del reenvío (R11) no cuela un sobrepago: con la clave de P1 y 5.000, el único lo rechaza (23505)", async () => {
    // El tope deja pasar una clave ya registrada para que el ON CONFLICT de la app la descarte. A mano,
    // sin ON CONFLICT, lo que queda es el único `(organizacion_id, clave_idempotencia)`: no entra nada.
    const { claveIdempotencia } = await base.walletMovimiento.findUniqueOrThrow({ where: { id: ids.p1 }, select: { claveIdempotencia: true } });
    expect(claveIdempotencia).not.toBeNull();
    const sql = `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por", "clave_idempotencia")
      VALUES (gen_random_uuid()::text, 'egreso', 'egreso_pago_plataforma', 5000.00, 'gasto', 'Reenvío a mano SL45-B', $1, $2, $3)`;
    expect(await atacarComo(A, sql, org(A), A.p.maestro.usuarioId, claveIdempotencia)).toBe("23505");
    expect(await atacarComo(A, `${sql} ON CONFLICT DO NOTHING`, org(A), A.p.maestro.usuarioId, claveIdempotencia)).toBe("ACEPTADO (0 filas)");
    expect(await deudaDe(A)).toBe("400.00");
  });

  it("B1 c) un INSERT de dos filas de 300 con deuda de 400 → 23514: cada fila ve la anterior", async () => {
    const sql = `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por")
      SELECT gen_random_uuid()::text, 'egreso', 'egreso_pago_plataforma', 300.00, 'gasto', 'Pago doble SL45-B', $1, $2 FROM generate_series(1, 2)`;
    expect(await atacarComo(A, sql, org(A), A.p.maestro.usuarioId)).toBe("23514");
    expect(await deudaDe(A)).toBe("400.00");
  });

  it("B1 d) UPDATE de la categoría de un sueldo a pago a la plataforma como servi_app → 42501, y la deuda sigue en 400,00", async () => {
    expect(await atacarComo(A, `UPDATE "wallet_movimiento" SET "categoria" = 'egreso_pago_plataforma' WHERE "id" = $1`, ids.s1)).toBe("42501");
    expect(await deudaDe(A)).toBe("400.00");
  });

  /* ---------------------------- B2: `egresos` ------------------------------ */

  it("B2: pagar 600 baja el neto de `egresos` en 600, y anular ese pago lo deja en 0 (como antes de pagar)", async () => {
    const antes = await egresosNetoDeHoy(B);
    const pagoB = await pagarOk(B, "600.00");
    const conPago = await egresosNetoDeHoy(B);
    // Se anula ANTES de afirmar: si el primer `expect` cae, B no se queda con un pago vigente que
    // ensucie el caso m3 de abajo.
    await anularOk(B, pagoB);
    const conAnulacion = await egresosNetoDeHoy(B);
    expect(restar(conPago, antes), "el pago").toBe("-600.00");
    expect(restar(conAnulacion, antes), "el pago y su anulación").toBe("0.00");
  });

  /* ------------ m3: el filtro explícito de `sumaPagosConfirmados` ----------- */

  it("m3: con el cliente DUEÑO (sin extensión ni RLS), `sumaPagosConfirmados` solo suma los pagos confirmados de la empresa pedida", async () => {
    // B tiene un pago propio; A, el P1 de 600 confirmado (P2 está anulado). Sin el `organizacionId` en
    // el `where`, el cliente dueño sumaría los de las dos empresas (y los de cualquier otra en la base).
    // SLT-60: el de B no cuenta mientras está por confirmar.
    const pagoB = await pagarOk(B, "200.00");
    const repo = new PagoPlataformaRepository(base);
    expect(await repo.sumaPagosConfirmados(org(B)), "B, por confirmar").toBe("0.00");
    await confirmar(B, factura.B, pagoB, "200.00");
    expect(await repo.sumaPagosConfirmados(org(A))).toBe("600.00");
    expect(await repo.sumaPagosConfirmados(org(B))).toBe("200.00");
  });

  /* ----------------------- B1 c) con dos inserts a la vez ------------------- */

  // Va el último: el primer pago queda COMMITEADO; confirmado (SLT-60), la deuda de A baja a 100,00.
  it("B1 c) dos INSERT a mano de 300 a la vez con deuda de 400 → el segundo espera al primero y choca con el tope (23514)", async () => {
    const url = urlDeBaseDeDatos();
    if (url === undefined) throw new Error("sin DATABASE_URL");
    const c1: Conexion = await conectar(url);
    const c2: Conexion = await conectar(url);
    const comoServiApp = (c: Conexion) =>
      c.query(`SELECT set_config('app.organizacion_id', $1, true), set_config('role', 'servi_app', true)`, [org(A)]);
    try {
      await c1.query("BEGIN");
      await comoServiApp(c1);
      await c1.query(INSERTAR_PAGO, ["300.00", org(A), A.p.maestro.usuarioId]);

      await c2.query("BEGIN");
      await comoServiApp(c2);
      let terminado = false;
      const segundo = c2
        .query(INSERTAR_PAGO, ["300.00", org(A), A.p.maestro.usuarioId])
        .then(
          () => "ACEPTADO",
          (e: unknown) => sqlstateDe(e),
        )
        .finally(() => {
          terminado = true;
        });
      // Con el candado, el segundo sigue esperando mientras el primero no termina.
      await new Promise((r) => setTimeout(r, 750));
      expect(terminado, "el segundo INSERT no esperó al candado del primero").toBe(false);

      await c1.query("COMMIT");
      expect(await segundo).toBe("23514");
      await c2.query("ROLLBACK");
    } finally {
      await c1.query("ROLLBACK").catch(() => {});
      await c2.query("ROLLBACK").catch(() => {});
      await c1.end();
      await c2.end();
    }
    // Solo entró uno, por confirmar (SLT-60): la deuda no se mueve hasta confirmarlo; entonces, 400 − 300.
    const entraron = await base.walletMovimiento.findMany({
      where: { organizacionId: org(A), categoria: "egreso_pago_plataforma", descripcion: "Pago a mano SL45-B" },
      select: { id: true },
    });
    expect(entraron).toHaveLength(1);
    expect(await deudaDe(A)).toBe("400.00");
    await confirmar(A, factura.A, entraron[0].id, "300.00");
    expect(await deudaDe(A)).toBe("100.00");
  }, 60_000);
});
