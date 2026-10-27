import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { verDeudaPlataformaAction } from "@/lib/actions/deuda-plataforma";
import { registrarMovimientoManualAction, verResumenCajaAction } from "@/lib/actions/wallet";
import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { registrarEgresoAdministrativoAction } from "@/lib/actions/wallet-egresos";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { EliminarOrdenService } from "@/lib/services/EliminarOrdenService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, etiquetasDeEnum } from "./_postgres-real";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { menos } from "./_fixtures/caja-459";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-45 (design §12.1) — EL PAGO A LA PLATAFORMA DESDE LA WALLET, contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Se recorre la tabla de design §3 paso a paso, y después de cada paso se mira la deuda de A y de B,
// la caja de A y la huella de los cargos.
//
// TODO VA POR LAS SERVER ACTIONS, SIN SERVICIO INYECTADO (molde de `deuda-plataforma-wallet.test.ts`).
// Cada action construye su servicio en su composition root, con `getPrismaClient()`, la extensión y la
// bajada a `servi_app`, como en una petición. Solo se inyecta el actor, y la empresa sale de
// `conEmpresa`, como de la sesión. Por eso el tope que T5 cablea en `buildService` es el que se prueba
// aquí: si el composition root no lo pasa, los pasos R9 se ponen en rojo.
//
// Las órdenes nacen por `OrdenRepository.createManyOrdenes` real (el trigger de SL-40 escribe el
// cargo), y se anulan con `EliminarOrdenService`, el de la pantalla. El valor global y la excepción de
// B los fija el repositorio real del superadmin, bajo el lock del valor global de SL-40.
//
// Lo que se mide se lee con el cliente BASE (dueño, sin extensión ni RLS): las filas que hay de verdad.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const SIN_FILTROS = { page: 1, pageSize: 10 };
const MOTIVO = `Pago mal registrado SL45 ${RUN}`;
/** R9, copiado a mano del requisito: es el texto que ve la persona bajo el monto. */
const MENSAJE_TOPE = "El pago no puede ser mayor que lo que la empresa debe a la plataforma.";

let base: PrismaClient;
let app: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

interface Empresa {
  p: Personas459;
  zonaId: string;
  ordenes: string[];
}

let A: Empresa;
let B: Empresa;
let geo: { provinciaId: string; cantonId: string; distritoId: string };
let estatusInicialId: string;

/** Los pagos de A por su nombre en la tabla de design §3. */
const pago: Record<string, string> = {};
let clavePago1000: string;

const deps = (actor: Actor) => ({ getActor: async () => actor });
const org = (e: Empresa) => e.p.organizacionId;

/* -------------------------------------------------------------------------- */
/* Siembra                                                                     */
/* -------------------------------------------------------------------------- */

async function sembrarEmpresa(): Promise<Empresa> {
  const p = await sembrarPersonas459(base);
  const zona = await bajoLockDeEscrituraReal(() =>
    base.zona.create({
      data: { nombre: `Zona SL45 ${RUN} ${randomUUID().slice(0, 6)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  return { p, zonaId: zona.id, ordenes: [] };
}

/** `n` órdenes de la empresa por el repositorio real de la carga masiva. El trigger las carga. */
async function crearOrdenes(e: Empresa, n: number): Promise<void> {
  const filas = Array.from({ length: n }, (_, i) => ({
    numRemision: `SL45-${RUN}-${randomUUID().slice(0, 6)}-${i}`,
    estatusId: estatusInicialId,
    destinatario: `Cliente SL45 ${RUN}`,
    telefonoDest: "88887777",
    tiendaId: e.p.tiendaId,
    zonaId: e.zonaId,
    provinciaId: geo.provinciaId,
    cantonId: geo.cantonId,
    distritoId: geo.distritoId,
    producto: "Caja",
    peso: null,
    notas: null,
    // Sin dirección: no hay nada que geocodificar y la cola no entra en juego.
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
  const creadas = await base.orden.findMany({
    where: { organizacionId: org(e), numRemision: { in: filas.map((f) => f.numRemision) } },
    select: { id: true },
  });
  e.ordenes.push(...creadas.map((o) => o.id));
}

/** La anulación de una orden por pantalla, cableada como su composition root. */
function eliminarOrden(e: Empresa, ordenId: string) {
  const repo = new OrdenRepository(app);
  const historial = new OrdenHistorialService(
    repo,
    new OrdenHistorialRepository(app),
    new OrdenDiaRepartoCambioRepository(app),
    new OrdenTraspasoRepository(app),
  );
  return conEmpresa(org(e), () => new EliminarOrdenService(repo, historial).eliminar({ ordenIds: [ordenId] }, e.p.maestro));
}

/* -------------------------------------------------------------------------- */
/* Las acciones de la persona                                                  */
/* -------------------------------------------------------------------------- */

/** Registrar un pago a la plataforma por la action del diálogo, sin «a quién» (R6). */
function pagar(e: Empresa, monto: string, opciones: { clave?: string; fecha?: string; actor?: Actor } = {}) {
  const input = {
    tipoEgreso: "pago_plataforma",
    monto,
    descripcion: `Transferencia SL45 ${RUN} ${monto}`,
    claveIdempotencia: opciones.clave ?? randomUUID(),
    ...(opciones.fecha !== undefined ? { fecha: opciones.fecha } : {}),
  };
  return conEmpresa(org(e), () => registrarEgresoAdministrativoAction(input, deps(opciones.actor ?? e.p.maestro)));
}

/** El id del pago registrado, o el rojo con lo que respondió el servidor. */
async function pagarOk(e: Empresa, monto: string, opciones: Parameters<typeof pagar>[2] = {}): Promise<string> {
  const r = await pagar(e, monto, opciones);
  expect(r.status, JSON.stringify(r)).toBe("ok");
  if (r.status !== "ok") throw new Error(`el pago de ${monto} respondió ${JSON.stringify(r)}`);
  return r.movimiento.id;
}

/** «Anular…» del libro de la caja, con motivo. */
function anular(e: Empresa, movimientoId: string) {
  return conEmpresa(org(e), () =>
    anularMovimientoAction({ destino: { libro: "caja", movimientoId }, motivo: MOTIVO }, deps(e.p.maestro)),
  );
}

/* -------------------------------------------------------------------------- */
/* Lecturas                                                                    */
/* -------------------------------------------------------------------------- */

function verDeuda(e: Empresa) {
  return conEmpresa(org(e), () => verDeudaPlataformaAction(deps(e.p.maestro)));
}

/** Lo que el servidor debe entregar (R14): la deuda con signo, su estado y el importe en positivo. */
const deuda = (conSigno: string, estado: "debe" | "al_dia" | "a_favor", importe: string) => ({
  status: "ok",
  deudaPlataforma: { deuda: conSigno, estado, importe },
});

/** Las siete cifras de la caja que mira R8/R15. */
async function caja(e: Empresa) {
  const r = await conEmpresa(org(e), () => verResumenCajaAction(SIN_FILTROS, deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verResumenCajaAction respondió ${JSON.stringify(r)}`);
  const { enCaja, salidas, entradas, ganancia, deTerceros, capital, iva } = r.resumen;
  return { enCaja, salidas, entradas, ganancia, deTerceros, capital, iva };
}
type Caja = Awaited<ReturnType<typeof caja>>;

function delta(antes: Caja, despues: Caja): Caja {
  const d = {} as Caja;
  for (const k of Object.keys(antes) as (keyof Caja)[]) d[k] = menos(despues[k], antes[k]);
  return d;
}

const CAJA_QUIETA: Caja = { enCaja: "0.00", salidas: "0.00", entradas: "0.00", ganancia: "0.00", deTerceros: "0.00", capital: "0.00", iva: "0.00" };
/** R8: un pago de M es un egreso propio en efectivo. */
const sale = (m: string): Caja => ({ ...CAJA_QUIETA, enCaja: `-${m}`, salidas: m, ganancia: `-${m}` });
/** R15: su anulación es el `ingreso_ajuste` de siempre, propio y en efectivo. */
const vuelve = (m: string): Caja => ({ ...CAJA_QUIETA, enCaja: m, entradas: m, ganancia: m });

/** R22: filas y sumas de los cargos de las dos empresas, y un hash de cada fila. */
function huellaDeCargos() {
  return base.$queryRawUnsafe<{ organizacion_id: string; n: number; suma: string; hash: string }[]>(
    `SELECT "organizacion_id", count(*)::int AS n, sum("monto")::text AS suma,
            md5(string_agg("id" || '|' || "tipo"::text || '|' || "monto"::text || '|' || "secuencia" || '|' || "ocurrido_at"::text, ',' ORDER BY "id")) AS hash
       FROM "cobro_plataforma_movimiento" WHERE "organizacion_id" = ANY($1::text[]) GROUP BY 1 ORDER BY 1`,
    [org(A), org(B)],
  );
}

/** Lo que un pago rechazado o una anulación repetida no deben tocar (R9, R16, R21). */
async function escrituras() {
  const orgs = [org(A), org(B)];
  const [libro, historial, constancias] = await Promise.all([
    base.walletMovimiento.count({ where: { organizacionId: { in: orgs } } }),
    base.historialAccion.count({ where: { organizacionId: { in: orgs } } }),
    base.ajusteCajaAnulacion.count({ where: { organizacionId: { in: orgs } } }),
  ]);
  return { libro, historial, constancias };
}

/* -------------------------------------------------------------------------- */

describeSiHayBase("SL-45 — el pago a la plataforma desde la wallet (Postgres, design §3)", () => {
  let cajaA: Caja;
  let cajaB: Caja;
  let huella: Awaited<ReturnType<typeof huellaDeCargos>>;

  /** Cierra un paso: la deuda de las dos empresas, la caja de A, la de B y la huella de los cargos. */
  async function tras(esperado: { deudaA: object; deudaB: object; cajaA: Caja; cajaB?: Caja; cargosCambian?: boolean }) {
    expect(await verDeuda(A), "deuda de A").toEqual(esperado.deudaA);
    expect(await verDeuda(B), "deuda de B").toEqual(esperado.deudaB);
    const ahoraA = await caja(A);
    const ahoraB = await caja(B);
    expect(delta(cajaA, ahoraA), "caja de A").toEqual(esperado.cajaA);
    expect(delta(cajaB, ahoraB), "caja de B (R20)").toEqual(esperado.cajaB ?? CAJA_QUIETA);
    cajaA = ahoraA;
    cajaB = ahoraB;
    const ahora = await huellaDeCargos();
    if (esperado.cargosCambian !== true) expect(ahora, "cargos de la plataforma (R22)").toEqual(huella);
    huella = ahora;
  }

  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesión: la empresa solo puede venir de `conEmpresa`.
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
    A = await sembrarEmpresa();
    B = await sembrarEmpresa();
    const tarifas = new CobroPlataformaTarifaRepository(base);
    await tarifas.fijarGlobal("500.00");
    if (!(await tarifas.fijarDeEmpresa(org(B), "300.00"))) throw new Error("siembra: la excepción de B no se fijó");

    // Dinero en las dos cajas, por la action real: un pago no debe dejar la caja en negativo para
    // que el caso sea el de una empresa normal, y la caja de B no está en cero para que «no cambia»
    // no pase por estar vacía.
    for (const [e, monto] of [[A, "5000.00"], [B, "1000.00"]] as const) {
      const r = await conEmpresa(org(e), () =>
        registrarMovimientoManualAction(
          { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto, descripcion: `Ajuste SL45 ${RUN}` },
          deps(e.p.maestro),
        ),
      );
      if (r.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(r)}`);
    }

    await crearOrdenes(A, 3);
    await crearOrdenes(B, 1);
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.p.organizacionId, B?.p.organizacionId].filter((x): x is string => typeof x === "string");
    try {
      if (orgs.length > 0) {
        // Los cargos se van con su orden (ON DELETE CASCADE). Las anulaciones y el libro, en `limpiar459`.
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
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

  /* ------------------------- control de no vacuidad ------------------------ */

  it("control: la categoría existe en la base, los cargos están escritos y las cajas tienen dinero", async () => {
    expect(await etiquetasDeEnum(base, "wallet_movimiento_categoria")).toContain("egreso_pago_plataforma");

    const cargos = await base.$queryRawUnsafe<{ organizacion_id: string; tipo: string; monto: string }[]>(
      `SELECT "organizacion_id", "tipo"::text AS tipo, "monto"::text AS monto FROM "cobro_plataforma_movimiento"
        WHERE "organizacion_id" = ANY($1::text[]) ORDER BY "organizacion_id" = $2 DESC`,
      [org(A), org(B)],
      org(A),
    );
    expect(cargos).toEqual([
      { organizacion_id: org(A), tipo: "cargo", monto: "500.00" },
      { organizacion_id: org(A), tipo: "cargo", monto: "500.00" },
      { organizacion_id: org(A), tipo: "cargo", monto: "500.00" },
      { organizacion_id: org(B), tipo: "cargo", monto: "300.00" },
    ]);

    cajaA = await caja(A);
    cajaB = await caja(B);
    expect(cajaA.enCaja).toBe("5000.00");
    expect(cajaB.enCaja).toBe("1000.00");
    huella = await huellaDeCargos();
    expect(huella).toHaveLength(2);
  });

  it("R13/R14: antes de pagar, A debe 1.500,00 y B 300,00", async () => {
    expect(await verDeuda(A)).toEqual(deuda("1500.00", "debe", "1500.00"));
    expect(await verDeuda(B)).toEqual(deuda("300.00", "debe", "300.00"));
  });

  /* ------------------------------ los pasos -------------------------------- */

  it("R7/R8/R13/R20/R22: A paga 1.000,00 con fecha de ayer → un egreso, su historial, y la deuda baja a 500,00", async () => {
    const ayer = fechaCalendarioCR(new Date(Date.now() - 24 * 60 * 60 * 1000));
    clavePago1000 = randomUUID();
    pago.p1000 = await pagarOk(A, "1000.00", { clave: clavePago1000, fecha: ayer });

    const fila = await base.walletMovimiento.findUniqueOrThrow({ where: { id: pago.p1000 } });
    expect({
      tipo: fila.tipo,
      categoria: fila.categoria,
      monto: fila.monto.toFixed(2),
      origenTipo: fila.origenTipo,
      origenId: fila.origenId,
      descripcion: fila.descripcion,
      registradoPor: fila.registradoPor,
      organizacionId: fila.organizacionId,
      dia: fechaCalendarioCR(fila.fechaMovimiento),
    }).toEqual({
      tipo: "egreso",
      categoria: "egreso_pago_plataforma",
      monto: "1000.00",
      origenTipo: "gasto",
      origenId: null,
      descripcion: `Transferencia SL45 ${RUN} 1000.00`,
      registradoPor: A.p.maestro.usuarioId,
      organizacionId: org(A),
      dia: ayer,
    });
    const historial = await base.historialAccion.findMany({ where: { entidadId: pago.p1000 }, select: { accion: true, organizacionId: true } });
    expect(historial).toEqual([{ accion: "egreso_administrativo_registrado", organizacionId: org(A) }]);

    await tras({ deudaA: deuda("500.00", "debe", "500.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: sale("1000.00") });
  });

  it("R11: el reenvío con la misma clave responde el pago original y no escribe nada (aunque ya supere la deuda)", async () => {
    const antes = await escrituras();
    const r = await pagar(A, "1000.00", { clave: clavePago1000 });
    expect(r.status, JSON.stringify(r)).toBe("ya_registrado");
    if (r.status !== "ya_registrado") return;
    expect(r.movimiento.id).toBe(pago.p1000);
    expect(await escrituras()).toEqual(antes);
    await tras({ deudaA: deuda("500.00", "debe", "500.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: CAJA_QUIETA });
  });

  it("R9: A intenta pagar 600,00 con una deuda de 500,00 → validation_error en monto, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await pagar(A, "600.00")).toEqual({ status: "validation_error", fieldErrors: { monto: [MENSAJE_TOPE] } });
    expect(await escrituras()).toEqual(antes);
    await tras({ deudaA: deuda("500.00", "debe", "500.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: CAJA_QUIETA });
  });

  it("R19: un mensajero de A no registra el pago → forbidden, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await pagar(A, "100.00", { actor: A.p.mensajero })).toEqual({ status: "forbidden" });
    expect(await escrituras()).toEqual(antes);
  });

  it("R21: B intenta anular el pago de A → no_encontrado, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await anular(B, pago.p1000)).toEqual({ status: "no_encontrado" });
    expect(await escrituras()).toEqual(antes);
    await tras({ deudaA: deuda("500.00", "debe", "500.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: CAJA_QUIETA });
  });

  it("R15/R22: A anula el pago de 1.000,00 → constancia con motivo, contra-asiento por el monto del pago, y la deuda vuelve a 1.500,00", async () => {
    expect(await anular(A, pago.p1000)).toEqual({ status: "ok", camino: "egreso_caja" });

    const constancia = await base.ajusteCajaAnulacion.findUniqueOrThrow({
      where: { movimientoId: pago.p1000 },
      select: { motivo: true, anuladoPor: true, organizacionId: true },
    });
    expect(constancia).toEqual({ motivo: MOTIVO, anuladoPor: A.p.maestro.usuarioId, organizacionId: org(A) });
    const contra = await base.walletMovimiento.findMany({
      where: { origenTipo: "gasto", origenId: pago.p1000 },
      select: { tipo: true, categoria: true, monto: true },
    });
    expect(contra.map((c) => ({ ...c, monto: c.monto.toFixed(2) }))).toEqual([
      { tipo: "ingreso", categoria: "ingreso_ajuste", monto: "1000.00" },
    ]);

    await tras({ deudaA: deuda("1500.00", "debe", "1500.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: vuelve("1000.00") });
  });

  it("R16: anular el mismo pago otra vez → ya_anulado, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await anular(A, pago.p1000)).toEqual({ status: "ya_anulado", camino: "egreso_caja" });
    expect(await escrituras()).toEqual(antes);
    await tras({ deudaA: deuda("1500.00", "debe", "1500.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: CAJA_QUIETA });
  });

  it("R9 (borde): A paga exactamente lo que debe, 1.500,00 → al día, importe 0,00", async () => {
    pago.p1500 = await pagarOk(A, "1500.00");
    await tras({ deudaA: deuda("0.00", "al_dia", "0.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: sale("1500.00") });
  });

  it("R9: al día, A intenta pagar 1,00 → validation_error en monto, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await pagar(A, "1.00")).toEqual({ status: "validation_error", fieldErrors: { monto: [MENSAJE_TOPE] } });
    expect(await escrituras()).toEqual(antes);
    await tras({ deudaA: deuda("0.00", "al_dia", "0.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: CAJA_QUIETA });
  });

  it("R13/R14: A elimina una orden ya pagada (reverso de SL-40) → a favor, importe 500,00, y la caja no se mueve", async () => {
    const r = await eliminarOrden(A, A.ordenes[0]);
    expect(r.status, JSON.stringify(r)).toBe("ok");
    await tras({
      deudaA: deuda("-500.00", "a_favor", "500.00"),
      deudaB: deuda("300.00", "debe", "300.00"),
      cajaA: CAJA_QUIETA,
      cargosCambian: true,
    });
  });

  it("R9: con saldo a favor, A intenta pagar 1,00 → validation_error en monto, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await pagar(A, "1.00")).toEqual({ status: "validation_error", fieldErrors: { monto: [MENSAJE_TOPE] } });
    expect(await escrituras()).toEqual(antes);
    await tras({ deudaA: deuda("-500.00", "a_favor", "500.00"), deudaB: deuda("300.00", "debe", "300.00"), cajaA: CAJA_QUIETA });
  });

  it("R20: B paga sus 300,00 → B al día, y ni la deuda ni la caja de A cambian", async () => {
    await pagarOk(B, "300.00");
    await tras({
      deudaA: deuda("-500.00", "a_favor", "500.00"),
      deudaB: deuda("0.00", "al_dia", "0.00"),
      cajaA: CAJA_QUIETA,
      cajaB: sale("300.00"),
    });
  });

  it("R18: con saldo a favor, A anula su pago de 1.500,00 → se anula, y la deuda pasa a 1.000,00", async () => {
    expect(await anular(A, pago.p1500)).toEqual({ status: "ok", camino: "egreso_caja" });
    await tras({ deudaA: deuda("1000.00", "debe", "1000.00"), deudaB: deuda("0.00", "al_dia", "0.00"), cajaA: vuelve("1500.00") });
  });
});
