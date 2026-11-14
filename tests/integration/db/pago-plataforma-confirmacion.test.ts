import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { RolValue, type PrismaClient } from "@prisma/client";

import { verDeudaPlataformaAction } from "@/lib/actions/deuda-plataforma";
import { confirmarPagoPlataformaAction, verPagosDeEmpresaAction } from "@/lib/actions/pagos-plataforma";
import { registrarMovimientoManualAction, verResumenCajaAction } from "@/lib/actions/wallet";
import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { registrarEgresoAdministrativoAction } from "@/lib/actions/wallet-egresos";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoPlataformaConfirmacionRepository } from "@/lib/repositories/PagoPlataformaConfirmacionRepository";
import { PagoPlataformaRepository } from "@/lib/repositories/PagoPlataformaRepository";
import { WalletComprobanteRepository } from "@/lib/repositories/WalletComprobanteRepository";
import { PagoPlataformaConfirmacionService } from "@/lib/services/PagoPlataformaConfirmacionService";
import { TEXTOS_CONFIRMACION } from "@/lib/types/pago-plataforma";
import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { menos } from "./_fixtures/caja-459";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { cerrarFacturaEnCurso, facturaEnCurso, type FacturaCerrada } from "./_fixtures/factura-cerrada";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";
import { exigirSinSuperadmin, idDeRol, insertarUsuario, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SLT-42 (T5.4): la zona del país de la empresa es la de CR, como antes (molde `pago-plataforma-sl45.test.ts`).
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
// SLT-60 (design §8) — LA CONFIRMACIÓN DEL PAGO A LA PLATAFORMA, contra Postgres, con filas COMMITEADAS.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Se recorre la tabla de pasos de design §8 en orden. Tres empresas con personas reales (`sembrarPersonas459`):
//   · A: órdenes por 380 000 y su factura cerrada con el fixture de T3.5; paga, se confirma, anula, se reparte;
//   · B: una factura cerrada de 50 000 y un pago: la «factura de otra empresa», el «pago de otra empresa» y
//     la empresa que lee sus propias tablas (R25);
//   · C: dos cerradas, de 200 000 y de −30 000 (solo un reverso, sin cuota): R31.
//
// TODO VA POR LAS SERVER ACTIONS, SIN SERVICIO INYECTADO, como en una petición: registrar y anular por las de la
// wallet (empresa en `conEmpresa`, como la sesión), leer y confirmar por las de `lib/actions/pagos-plataforma.ts`
// con un superadmin COMMITEADO (quien confirma es una FK a `usuario`). Lo que se mide (filas, saldos, lo
// disponible) se lee con el cliente BASE, dueño y sin RLS: las filas que hay de verdad.
//
// LA CONCURRENCIA (R5, R19, R21) no se deja a la suerte: otra conexión toma el MISMO candado de los pagos de la
// empresa (`hashtext('pago_plataforma:' || org)`) y lo sostiene mientras arrancan las dos operaciones. Ninguna
// puede terminar mientras dura (si una termina, no toma el candado: la mutación 3); al soltarlo, se serializan.
//
// MUTACIONES QUE LO MATAN (design §8, medidas y revertidas en `progress/impl_SLT-60.md`): el tope sin restar los
// por confirmar; `sumaPagosConfirmados` que suma todos los pagos vigentes; la confirmación sin el candado; sin el
// trigger `pago_plataforma_no_anular_confirmado`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const MOTIVO = `Pago mal registrado SLT60 ${RUN}`;
const RUTA_COMPROBANTE = `slt60/${RUN}/comprobante.png`;

let base: PrismaClient;
let app: PrismaClient;
/** La conexión que sostiene el candado de los pagos de una empresa en los pasos concurrentes. */
let sostenedor: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;
let soltarSuperadmin: () => Promise<void> = async () => {};
let superadminId: string | null = null;
let geo: { provinciaId: string; cantonId: string; distritoId: string };
let estatusInicialId: string;

interface Empresa {
  p: Personas459;
  zonaId: string;
  ordenes: string[];
}
let A: Empresa;
let B: Empresa;
let C: Empresa;
/** Las facturas cerradas por su nombre en la tabla de pasos. */
const factura: Record<string, FacturaCerrada> = {};
/** Los pagos por su nombre en la tabla de pasos. */
const pago: Record<string, string> = {};

const org = (e: Empresa) => e.p.organizacionId;
const deps = (actor: Actor) => ({ getActor: async () => actor });
const superadmin = (): Actor => ({ usuarioId: superadminId as string, rol: RolValue.superadmin, organizacionId: null });

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Una señal de un solo uso. */
function senal() {
  let dar: () => void = () => undefined;
  const p = new Promise<void>((r) => {
    dar = r;
  });
  return { p, dar };
}

/* -------------------------------------------------------------------------- */
/* Siembra                                                                     */
/* -------------------------------------------------------------------------- */

async function sembrarEmpresa(caja: string): Promise<Empresa> {
  const p = await sembrarPersonas459(base);
  const zona = await bajoLockDeEscrituraReal(() =>
    base.zona.create({
      data: { nombre: `Zona SLT60 ${RUN} ${randomUUID().slice(0, 6)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  const e = { p, zonaId: zona.id, ordenes: [] };
  // Dinero en la caja por la action real: un pago no la deja en negativo, como en una empresa normal.
  const r = await conEmpresa(p.organizacionId, () =>
    registrarMovimientoManualAction(
      { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto: caja, descripcion: `Ajuste SLT60 ${RUN}` },
      deps(p.maestro),
    ),
  );
  if (r.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(r)}`);
  return e;
}

/**
 * Una orden por el repositorio real de la carga masiva, con un cargo de `monto`. El trigger de SL-40 escribe el
 * cargo con el valor global; aquí se cambia, como dueño, por uno del monto pedido (el molde de
 * `factura-plataforma-deuda.test.ts`): 380 000 no son un número entero de órdenes de ningún valor razonable.
 */
async function ordenConCargo(e: Empresa, monto: string): Promise<string> {
  const numRemision = `SLT60-${RUN}-${randomUUID().slice(0, 8)}`;
  const r = await conEmpresa(org(e), () =>
    new OrdenRepository(app).createManyOrdenes(
      [
        {
          numRemision,
          estatusId: estatusInicialId,
          destinatario: `Cliente SLT60 ${RUN}`,
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
        },
      ],
      100,
      { actorUsuarioId: e.p.tiendaId, origenTipo: "carga_masiva" },
      { cargaId: null, usuarioCargaId: e.p.tiendaId, totalFiles: 1, name: null },
    ),
  );
  expect(r.inserted, JSON.stringify(r.omitidas)).toBe(1);
  const { id } = await base.orden.findFirstOrThrow({ where: { organizacionId: org(e), numRemision }, select: { id: true } });
  e.ordenes.push(id);
  await bajoLockDeEscrituraReal(async () => {
    await base.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, id);
    await base.$executeRawUnsafe(
      `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
       VALUES ($1, $2, $3, 1, 'cargo', 'plan', $4::numeric, now() AT TIME ZONE 'UTC')`,
      `slt60-${randomUUID()}`,
      org(e),
      id,
      monto,
    );
  });
  return id;
}

/** El reverso de la orden, con su instante dentro de la factura en curso de la empresa (R31: la de −30 000). */
async function reversoEnLaEnCurso(e: Empresa, ordenId: string, monto: string): Promise<void> {
  const enCurso = await facturaEnCurso(base, org(e));
  await bajoLockDeEscrituraReal(() =>
    base.$executeRawUnsafe(
      `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
       VALUES ($1, $2, $3, 2, 'reverso', 'plan', $4::numeric, $5::timestamp + interval '1 minute')`,
      `slt60-${randomUUID()}`,
      org(e),
      ordenId,
      monto,
      enCurso.desdeAt.toISOString().replace("T", " ").replace("Z", ""),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Lo que hace la empresa (actions de la wallet)                               */
/* -------------------------------------------------------------------------- */

function pagar(e: Empresa, monto: string) {
  return conEmpresa(org(e), () =>
    registrarEgresoAdministrativoAction(
      { tipoEgreso: "pago_plataforma", monto, descripcion: `Transferencia SLT60 ${RUN} ${monto}`, claveIdempotencia: randomUUID() },
      deps(e.p.maestro),
    ),
  );
}

async function pagarOk(e: Empresa, monto: string): Promise<string> {
  const r = await pagar(e, monto);
  if (r.status !== "ok") throw new Error(`el pago de ${monto} respondió ${JSON.stringify(r)}`);
  return r.movimiento.id;
}

/** R2, R3: el rechazo es un error de validación en el campo `monto` (su texto lo fija R36, en otro test). */
async function pagoRechazado(e: Empresa, monto: string): Promise<string[]> {
  const r = await pagar(e, monto);
  expect(r.status, JSON.stringify(r)).toBe("validation_error");
  return r.status === "validation_error" ? Object.keys(r.fieldErrors) : [];
}

function anular(e: Empresa, movimientoId: string) {
  return conEmpresa(org(e), () => anularMovimientoAction({ destino: { libro: "caja", movimientoId }, motivo: MOTIVO }, deps(e.p.maestro)));
}

/* -------------------------------------------------------------------------- */
/* Lo que hace el superadmin (actions de la confirmación)                      */
/* -------------------------------------------------------------------------- */

function confirmar(e: Empresa, pagoId: string, aplicaciones: { facturaId: string; monto: string }[]) {
  return confirmarPagoPlataformaAction({ organizacionId: org(e), pagoId, aplicaciones }, deps(superadmin()));
}

async function leer(e: Empresa) {
  const r = await verPagosDeEmpresaAction({ organizacionId: org(e) }, deps(superadmin()));
  if (r.estado !== "ok") throw new Error(`verPagosDeEmpresaAction respondió ${JSON.stringify(r)}`);
  return r.datos;
}

/* -------------------------------------------------------------------------- */
/* Lecturas                                                                    */
/* -------------------------------------------------------------------------- */

/** Lo disponible para registrar, con la única definición (la del trigger del tope). */
async function disponible(e: Empresa): Promise<string> {
  const [f] = await base.$queryRaw<{ d: string }[]>`SELECT pago_plataforma_disponible_de(${org(e)})::text AS d`;
  return f.d;
}

/** La deuda que pinta la wallet de la empresa (R7), por su action. */
async function deuda(e: Empresa): Promise<string> {
  const r = await conEmpresa(org(e), () => verDeudaPlataformaAction(deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verDeudaPlataformaAction respondió ${JSON.stringify(r)}`);
  return r.deudaPlataforma.deuda;
}

/** Las cifras de la caja que mueve un pago (R1, R9, R16). */
async function caja(e: Empresa) {
  const r = await conEmpresa(org(e), () => verResumenCajaAction({ page: 1, pageSize: 10 }, deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verResumenCajaAction respondió ${JSON.stringify(r)}`);
  const { enCaja, salidas, entradas, ganancia } = r.resumen;
  return { enCaja, salidas, entradas, ganancia };
}
type Caja = Awaited<ReturnType<typeof caja>>;
const delta = (antes: Caja, despues: Caja): Caja => ({
  enCaja: menos(despues.enCaja, antes.enCaja),
  salidas: menos(despues.salidas, antes.salidas),
  entradas: menos(despues.entradas, antes.entradas),
  ganancia: menos(despues.ganancia, antes.ganancia),
});
const QUIETA: Caja = { enCaja: "0.00", salidas: "0.00", entradas: "0.00", ganancia: "0.00" };

/** Las filas que una confirmación o un rechazo podrían tocar, de las tres empresas. */
async function escrituras() {
  const orgs = [org(A), org(B), org(C)];
  const [libro, constancias, confirmaciones, aplicaciones, historial] = await Promise.all([
    base.walletMovimiento.count({ where: { organizacionId: { in: orgs } } }),
    base.ajusteCajaAnulacion.count({ where: { organizacionId: { in: orgs } } }),
    base.pagoPlataformaConfirmacion.count({ where: { organizacionId: { in: orgs } } }),
    base.pagoPlataformaAplicacion.count({ where: { organizacionId: { in: orgs } } }),
    base.historialAccion.count({ where: { organizacionId: { in: orgs } } }),
  ]);
  return { libro, constancias, confirmaciones, aplicaciones, historial };
}

/** Cada factura de la empresa entera en texto: lo que una confirmación movería (R16). */
async function fotoDeFacturas(e: Empresa): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ l: string }[]>(
    `SELECT f::text AS l FROM "factura_plataforma" f WHERE f."organizacion_id" = $1 ORDER BY f."desde_at"`,
    org(e),
  );
  return filas.map((f) => f.l);
}

/** Los contra-asientos de un pago y su constancia de anulación. */
async function anulacionDe(pagoId: string) {
  const [contra, constancias] = await Promise.all([
    base.walletMovimiento.count({ where: { origenTipo: "gasto", origenId: pagoId, categoria: "ingreso_ajuste" } }),
    base.ajusteCajaAnulacion.count({ where: { movimientoId: pagoId } }),
  ]);
  return { contra, constancias };
}

/**
 * Otra conexión toma el candado de los pagos de la empresa y lo sostiene hasta que se llame a lo devuelto. Es la
 * MISMA expresión que el tope, la confirmación y el bloqueo de la anulación.
 */
async function sostenerCandado(e: Empresa): Promise<() => Promise<void>> {
  const dentro = senal();
  const soltar = senal();
  const fin = sostenedor.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pago_plataforma:' || ${org(e)}))`;
      dentro.dar();
      await soltar.p;
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
  await dentro.p;
  return async () => {
    soltar.dar();
    await fin;
  };
}

/** Arranca las operaciones con el candado tomado; ninguna debe terminar mientras dura. Devuelve sus resultados. */
async function aLaVez<T extends unknown[]>(e: Empresa, operaciones: { [K in keyof T]: () => Promise<T[K]> }) {
  const soltar = await sostenerCandado(e);
  let terminadas = 0;
  const promesas = operaciones.map((op) =>
    op().finally(() => {
      terminadas += 1;
    }),
  );
  await dormir(1500);
  const terminadasConElCandado = terminadas;
  await soltar();
  const resultados = (await Promise.all(promesas)) as T;
  return { terminadasConElCandado, resultados };
}

/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-60 — la confirmación del pago a la plataforma (Postgres, design §8)", () => {
  let cajaA: Caja;
  let fotoA: string[];

  beforeAll(async () => {
    base = crearPrismaDeTest();
    sostenedor = crearPrismaDeTest();
    // Sin sesión: la empresa solo puede venir de `conEmpresa`.
    app = conAislamientoPorEmpresa(base, async () => null);

    // SL-32: el superadmin es único en la base; este archivo commitea el suyo con el lock tomado.
    soltarSuperadmin = await tomarLockDeSuperadmin();
    await exigirSinSuperadmin(base);
    superadminId = await bajoLockDeEscrituraReal(() =>
      base.$transaction(async (tx) => {
        const u = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
        if (!u.desenlace.ok) throw new Error(`no se sembró el superadmin: ${JSON.stringify(u.desenlace)}`);
        return u.id;
      }),
    );

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

    // Con un valor global fijado el trigger del alta escribe su cargo, que `ordenConCargo` cambia por el suyo.
    tarifaGlobal = await tomarTarifaGlobal();
    await new CobroPlataformaTarifaRepository(base).fijarGlobal("500.00");

    A = await sembrarEmpresa("1000000.00");
    B = await sembrarEmpresa("100000.00");
    C = await sembrarEmpresa("500000.00");

    await ordenConCargo(A, "380000.00");

    // B: su cerrada de 50 000 y un pago por confirmar.
    await ordenConCargo(B, "50000.00");
    factura.B = await cerrarFacturaEnCurso(base, org(B));
    pago.B = await pagarOk(B, "50000.00");

    // C: la primera cerrada con 200 000 de cargos; la segunda, solo con el reverso de una de esas órdenes.
    await ordenConCargo(C, "170000.00");
    const devuelta = await ordenConCargo(C, "30000.00");
    factura.C1 = await cerrarFacturaEnCurso(base, org(C));
    await reversoEnLaEnCurso(C, devuelta, "30000.00");
    factura.C2 = await cerrarFacturaEnCurso(base, org(C));
  }, 300_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.p.organizacionId, B?.p.organizacionId, C?.p.organizacionId].filter((x): x is string => typeof x === "string");
    try {
      if (orgs.length > 0) {
        await bajoLockDeEscrituraReal(async () => {
          // La FK del pago a su confirmación y la de la aplicación a la confirmación no tienen acción: antes que el
          // libro (`limpiar459`) se van las aplicaciones y las confirmaciones, y antes que las personas, el comprobante.
          for (const tabla of ["pago_plataforma_aplicacion", "pago_plataforma_confirmacion", "wallet_comprobante"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
          // Los cargos y sus trazas se van con su orden (ON DELETE CASCADE); las facturas, con la empresa.
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      await limpiar459(base, A?.p ?? null);
      await limpiar459(base, B?.p ?? null);
      await limpiar459(base, C?.p ?? null);
      if (superadminId !== null) {
        const id = superadminId;
        await bajoLockDeEscrituraReal(() => base.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, id));
      }
    } finally {
      await tarifaGlobal?.soltar();
      await soltarSuperadmin();
      await Promise.all([base.$disconnect(), sostenedor?.$disconnect()]);
    }
  }, 300_000);

  /* ------------------------- control de no vacuidad ------------------------ */

  it("control: las funciones existen, B y C tienen sus cerradas y A aún no tiene ninguna", async () => {
    const funciones = await base.$queryRawUnsafe<{ proname: string }[]>(
      `SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1::text[]) ORDER BY p.proname`,
      ["factura_plataforma_saldos", "pago_plataforma_confirmar", "pago_plataforma_disponible", "pago_plataforma_disponible_de", "pago_plataforma_no_anular_confirmado", "pago_plataforma_por_confirmar"],
    );
    expect(funciones.map((f) => f.proname)).toHaveLength(6);
    expect(factura.B.total).toBe("50000.00");
    expect([factura.C1.total, factura.C2.total]).toEqual(["200000.00", "-30000.00"]);
    expect(await base.facturaPlataforma.count({ where: { organizacionId: org(A), estado: "cerrada" } })).toBe(0);
    cajaA = await caja(A);
    expect(cajaA.enCaja).toBe("1000000.00");
  });

  /* ------------------------------ los pasos de A --------------------------- */

  it("R3: A con órdenes por 380 000 y sin cerrar → disponible 0, debe 380 000, y pagar 1 es validation_error en monto sin escribir nada", async () => {
    expect(await disponible(A)).toBe("0.00");
    expect(await deuda(A)).toBe("380000.00");
    const antes = await escrituras();
    expect(await pagoRechazado(A, "1.00")).toEqual(["monto"]);
    expect(await escrituras()).toEqual(antes);
  });

  it("se cierra la factura de A (380 000) → disponible 380 000 y la deuda no cambia", async () => {
    factura.A = await cerrarFacturaEnCurso(base, org(A));
    expect(factura.A.total).toBe("380000.00");
    expect(await disponible(A)).toBe("380000.00");
    expect(await deuda(A)).toBe("380000.00");
  });

  it("R1, R6: A paga 200 000 → por confirmar; la caja baja 200 000, la deuda NO baja y lo disponible sí", async () => {
    pago.p200 = await pagarOk(A, "200000.00");
    const ahora = await caja(A);
    expect(delta(cajaA, ahora)).toEqual({ enCaja: "-200000.00", salidas: "200000.00", entradas: "0.00", ganancia: "-200000.00" });
    cajaA = ahora;
    expect(await base.pagoPlataformaConfirmacion.count({ where: { pagoId: pago.p200 } })).toBe(0);
    expect(await disponible(A)).toBe("180000.00");
    expect(await deuda(A)).toBe("380000.00");
  });

  it("R2: A intenta 180 000,01 → validation_error en monto y nada escrito; igual al disponible cabe", async () => {
    const antes = await escrituras();
    expect(await pagoRechazado(A, "180000.01")).toEqual(["monto"]);
    expect(await escrituras()).toEqual(antes);
    expect(await disponible(A)).toBe("180000.00");
  });

  it("R4: como servi_app a mano, un pago de 180 000,01 → check_violation; uno de 180 000,00 entra (revertido)", async () => {
    const r = await revertida(base, async (tx) => {
      const insertar = (monto: string) =>
        capturar(tx, async () => {
          await comoApp(tx, org(A));
          await tx.$executeRawUnsafe(
            `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "descripcion", "organizacion_id", "registrado_por")
             VALUES (gen_random_uuid()::text, 'egreso', 'egreso_pago_plataforma', $1::numeric, 'gasto', 'Pago a mano SLT-60', $2, $3)`,
            monto,
            org(A),
            A.p.maestro.usuarioId,
          );
        });
      const supera = await insertar("180000.01");
      const cabe = await insertar("180000.00");
      return { supera: supera === null ? null : sqlstateDe(supera), cabe: cabe === null ? null : sqlstateDe(cabe) };
    });
    expect(r).toEqual({ supera: "23514", cabe: null });
    expect(await disponible(A)).toBe("180000.00");
  });

  it("R5: dos pagos de 100 000 a la vez con 180 000 disponibles → esperan el candado, uno entra y el otro es validation_error", async () => {
    const { terminadasConElCandado, resultados } = await aLaVez(A, [() => pagar(A, "100000.00"), () => pagar(A, "100000.00")]);
    expect(terminadasConElCandado, "ningún pago debe evaluarse mientras otro tiene el candado").toBe(0);
    expect(resultados.map((r) => r.status).sort()).toEqual(["ok", "validation_error"]);
    const ok = resultados.find((r) => r.status === "ok");
    if (ok?.status === "ok") pago.p100 = ok.movimiento.id;
    expect(pago.p100).toBeDefined();
    expect(await disponible(A)).toBe("80000.00");
    expect(await deuda(A)).toBe("380000.00");
    cajaA = await caja(A);
  });

  it("R12, R14, R32: el superadmin lee los dos pagos de A del más viejo al más nuevo, sin comprobante, y la factura con su saldo", async () => {
    const maestro = await base.usuario.findUniqueOrThrow({ where: { id: A.p.maestro.usuarioId }, select: { nombre: true } });
    const datos = await leer(A);
    expect(datos.pagos.map((p) => ({ id: p.id, monto: p.monto, referencia: p.referencia, registradoPor: p.registradoPor, tieneComprobante: p.tieneComprobante }))).toEqual([
      { id: pago.p200, monto: "200000.00", referencia: `Transferencia SLT60 ${RUN} 200000.00`, registradoPor: maestro.nombre, tieneComprobante: false },
      { id: pago.p100, monto: "100000.00", referencia: `Transferencia SLT60 ${RUN} 100000.00`, registradoPor: maestro.nombre, tieneComprobante: false },
    ]);
    expect(datos.facturas).toEqual([
      { id: factura.A.id, numero: 1, desde: factura.A.desdeAt, hasta: factura.A.hastaAt, total: "380000.00", saldo: "380000.00" },
    ]);
  });

  it("R16, R22: el superadmin confirma los 200 000 contra la factura → saldo 180 000, deuda 180 000, disponible igual; ni la caja ni la factura cambian", async () => {
    fotoA = await fotoDeFacturas(A);
    const libroAntes = await base.walletMovimiento.count({ where: { organizacionId: org(A) } });
    expect(await confirmar(A, pago.p200, [{ facturaId: factura.A.id, monto: "200000.00" }])).toEqual({ estado: "ok" });

    const confirmacion = await base.pagoPlataformaConfirmacion.findFirstOrThrow({
      where: { pagoId: pago.p200 },
      select: { id: true, organizacionId: true, confirmadoPor: true, confirmadoAt: true, aplicaciones: { select: { facturaId: true, monto: true } } },
    });
    expect(confirmacion.organizacionId).toBe(org(A));
    expect(confirmacion.confirmadoPor).toBe(superadminId);
    expect(Math.abs(confirmacion.confirmadoAt.getTime() - Date.now())).toBeLessThan(5 * 60_000);
    expect(confirmacion.aplicaciones.map((a) => ({ facturaId: a.facturaId, monto: a.monto.toFixed(2) }))).toEqual([
      { facturaId: factura.A.id, monto: "200000.00" },
    ]);

    expect((await leer(A)).facturas.map((f) => f.saldo)).toEqual(["180000.00"]);
    expect(await deuda(A)).toBe("180000.00");
    expect(await disponible(A)).toBe("80000.00");
    expect(delta(cajaA, await caja(A))).toEqual(QUIETA);
    expect(await fotoDeFacturas(A)).toEqual(fotoA);
    expect(await base.walletMovimiento.count({ where: { organizacionId: org(A) } })).toBe(libroAntes);
    expect((await leer(A)).pagos.map((p) => p.id)).toEqual([pago.p100]);
  });

  it("R19: confirmar otra vez → ya_confirmado, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await confirmar(A, pago.p200, [{ facturaId: factura.A.id, monto: "200000.00" }])).toEqual({ estado: "ya_confirmado" });
    expect(await escrituras()).toEqual(antes);
  });

  it("R10: A anula el pago confirmado → forbidden, sin constancia ni contra-asiento ni historial", async () => {
    const antes = await escrituras();
    expect(await anular(A, pago.p200)).toEqual({ status: "forbidden" });
    expect(await escrituras()).toEqual(antes);
    expect(await anulacionDe(pago.p200)).toEqual({ contra: 0, constancias: 0 });
    expect(await deuda(A)).toBe("180000.00");
  });

  it("R11: el contra-asiento del pago confirmado escrito a mano → SL060, como dueño y como servi_app", async () => {
    const r = await revertida(base, async (tx) => {
      const contra = (comoServiApp: boolean) =>
        capturar(tx, async () => {
          if (comoServiApp) await comoApp(tx, org(A));
          await tx.$executeRawUnsafe(
            `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "descripcion", "organizacion_id")
             VALUES (gen_random_uuid()::text, 'ingreso', 'ingreso_ajuste', 200000.00, 'gasto', $1, 'Contra-asiento a mano SLT-60', $2)`,
            pago.p200,
            org(A),
          );
        });
      const dueno = await contra(false);
      const serviApp = await contra(true);
      return { dueno: dueno === null ? null : sqlstateDe(dueno), serviApp: serviApp === null ? null : sqlstateDe(serviApp) };
    });
    expect(r).toEqual({ dueno: "SL060", serviApp: "SL060" });
  });

  it("R9: A anula el pago de 100 000 por confirmar → ok; la caja sube 100 000, vuelve a lo disponible y la deuda no cambia", async () => {
    expect(await anular(A, pago.p100)).toEqual({ status: "ok", camino: "egreso_caja" });
    expect(await anulacionDe(pago.p100)).toEqual({ contra: 1, constancias: 1 });
    const ahora = await caja(A);
    expect(delta(cajaA, ahora)).toEqual({ enCaja: "100000.00", salidas: "0.00", entradas: "100000.00", ganancia: "100000.00" });
    cajaA = ahora;
    expect(await disponible(A)).toBe("180000.00");
    expect(await deuda(A)).toBe("180000.00");
  });

  it("R20: confirmar el anulado, uno inexistente o el de otra empresa → not_found, y nada escrito", async () => {
    const antes = await escrituras();
    const aplicaciones = [{ facturaId: factura.A.id, monto: "100000.00" }];
    expect(await confirmar(A, pago.p100, aplicaciones)).toEqual({ estado: "not_found" });
    expect(await confirmar(A, randomUUID(), aplicaciones)).toEqual({ estado: "not_found" });
    expect(await confirmar(A, pago.B, [{ facturaId: factura.A.id, monto: "50000.00" }])).toEqual({ estado: "not_found" });
    expect(await escrituras()).toEqual(antes);
  });

  it("R15, R17: un reparto inválido es validation_error con su clave, y nada escrito", async () => {
    pago.p50 = await pagarOk(A, "50000.00");
    const enCursoA = await facturaEnCurso(base, org(A));
    const antes = await escrituras();
    const F = factura.A.id;
    const casos: [string, { facturaId: string; monto: string }[], Record<string, string>][] = [
      ["suma corta", [{ facturaId: F, monto: "40000.00" }], { aplicaciones: TEXTOS_CONFIRMACION.suma_distinta }],
      ["sobre el saldo", [{ facturaId: F, monto: "180000.01" }], { [`aplicaciones.${F}`]: TEXTOS_CONFIRMACION.supera_saldo }],
      ["la factura en curso", [{ facturaId: enCursoA.id, monto: "50000.00" }], { [`aplicaciones.${enCursoA.id}`]: TEXTOS_CONFIRMACION.factura_no_valida }],
      ["una factura de B", [{ facturaId: factura.B.id, monto: "50000.00" }], { [`aplicaciones.${factura.B.id}`]: TEXTOS_CONFIRMACION.factura_no_valida }],
      [
        "la misma factura dos veces",
        [
          { facturaId: F, monto: "25000.00" },
          { facturaId: F, monto: "25000.00" },
        ],
        { [`aplicaciones.${F}`]: TEXTOS_CONFIRMACION.factura_repetida },
      ],
    ];
    for (const [caso, aplicaciones, errores] of casos) {
      expect(await confirmar(A, pago.p50, aplicaciones), caso).toEqual({ estado: "validation_error", errores });
    }
    expect(await escrituras()).toEqual(antes);
    expect((await leer(A)).pagos.map((p) => p.id)).toEqual([pago.p50]);
  });

  it("R21: A anula y el superadmin confirma el mismo pago a la vez → gana exactamente una, y la otra responde según cuál ganó", async () => {
    const { terminadasConElCandado, resultados } = await aLaVez(A, [
      () => anular(A, pago.p50),
      () => confirmar(A, pago.p50, [{ facturaId: factura.A.id, monto: "50000.00" }]),
    ]);
    const [anulacion, confirmacion] = resultados;
    expect(terminadasConElCandado, "ni la anulación ni la confirmación deben terminar con el candado tomado").toBe(0);
    const confirmado = await base.pagoPlataformaConfirmacion.count({ where: { pagoId: pago.p50 } });
    const anulado = await anulacionDe(pago.p50);
    if (confirmacion.estado === "ok") {
      expect(anulacion).toEqual({ status: "forbidden" });
      expect({ confirmado, anulado }).toEqual({ confirmado: 1, anulado: { contra: 0, constancias: 0 } });
    } else {
      expect(confirmacion).toEqual({ estado: "not_found" });
      expect(anulacion).toEqual({ status: "ok", camino: "egreso_caja" });
      expect({ confirmado, anulado }).toEqual({ confirmado: 0, anulado: { contra: 1, constancias: 1 } });
    }
    // Sin pagos por confirmar, lo disponible es el saldo de la factura, sea cual sea la que ganó.
    const [saldo] = (await leer(A)).facturas.map((f) => f.saldo);
    expect(await disponible(A)).toBe(saldo);
    cajaA = await caja(A);
  });

  it("R19: dos confirmaciones del mismo pago a la vez → esperan el candado; exactamente una escribe y la otra es ya_confirmado", async () => {
    pago.p30 = await pagarOk(A, "30000.00");
    const reparto = [{ facturaId: factura.A.id, monto: "30000.00" }];
    const { terminadasConElCandado, resultados } = await aLaVez(A, [() => confirmar(A, pago.p30, reparto), () => confirmar(A, pago.p30, reparto)]);
    expect(terminadasConElCandado, "ninguna confirmación debe terminar con el candado tomado").toBe(0);
    expect(resultados.map((r) => r.estado).sort()).toEqual(["ok", "ya_confirmado"]);
    expect(await base.pagoPlataformaConfirmacion.count({ where: { pagoId: pago.p30 } })).toBe(1);
    expect(await base.pagoPlataformaAplicacion.count({ where: { confirmacion: { pagoId: pago.p30 } } })).toBe(1);
  });

  it("R18, R7: un pago que deja el saldo en 0 → la factura sale de la lectura, A queda al día y ya no puede pagar nada", async () => {
    const [{ saldo }] = (await leer(A)).facturas;
    expect(await disponible(A)).toBe(saldo);
    pago.saldo = await pagarOk(A, saldo);
    expect(await confirmar(A, pago.saldo, [{ facturaId: factura.A.id, monto: saldo }])).toEqual({ estado: "ok" });
    expect(await leer(A)).toEqual({ pagos: [], facturas: [] });
    expect(await deuda(A)).toBe("0.00");
    expect(await disponible(A)).toBe("0.00");
    expect(await pagoRechazado(A, "0.01")).toEqual(["monto"]);
    // R16: la factura saldada sigue igual, con su número y su total.
    expect(await fotoDeFacturas(A)).toEqual(fotoA);
  });

  /* ------------------------------ aislamiento ------------------------------ */

  it("R25: B lee solo sus confirmaciones y aplicaciones; otra empresa no ve nada; y no puede escribirlas (42501)", async () => {
    expect(await confirmar(B, pago.B, [{ facturaId: factura.B.id, monto: "50000.00" }])).toEqual({ estado: "ok" });
    const r = await revertida(base, async (tx) => {
      const ver = async (organizacionId: string) => {
        await comoApp(tx, organizacionId);
        const [c] = await tx.$queryRawUnsafe<{ n: number; empresas: string[] | null }[]>(
          `SELECT count(*)::int AS n, array_agg(DISTINCT organizacion_id) AS empresas FROM "pago_plataforma_confirmacion"`,
        );
        const [a] = await tx.$queryRawUnsafe<{ n: number; empresas: string[] | null }[]>(
          `SELECT count(*)::int AS n, array_agg(DISTINCT organizacion_id) AS empresas FROM "pago_plataforma_aplicacion"`,
        );
        await tx.$executeRawUnsafe(`RESET ROLE`);
        return { confirmaciones: c, aplicaciones: a };
      };
      const deB = await ver(org(B));
      const deOtra = await ver(randomUUID());
      const escribir = async (sql: string) => {
        const e = await capturar(tx, async () => {
          await comoApp(tx, org(B));
          await tx.$executeRawUnsafe(sql, org(B));
        });
        await tx.$executeRawUnsafe(`RESET ROLE`);
        return e === null ? null : sqlstateDe(e);
      };
      const escrituras = {
        insertConfirmacion: await escribir(
          `INSERT INTO "pago_plataforma_confirmacion" ("organizacion_id", "pago_id", "confirmado_por", "confirmado_at")
           SELECT $1, "id", "registrado_por", now() FROM "wallet_movimiento" WHERE "organizacion_id" = $1 LIMIT 1`,
        ),
        updateConfirmacion: await escribir(`UPDATE "pago_plataforma_confirmacion" SET "confirmado_at" = now() WHERE "organizacion_id" = $1`),
        deleteConfirmacion: await escribir(`DELETE FROM "pago_plataforma_confirmacion" WHERE "organizacion_id" = $1`),
        insertAplicacion: await escribir(
          `INSERT INTO "pago_plataforma_aplicacion" ("organizacion_id", "confirmacion_id", "factura_id", "monto")
           SELECT $1, c."id", a."factura_id", 1 FROM "pago_plataforma_aplicacion" a JOIN "pago_plataforma_confirmacion" c ON c."id" = a."confirmacion_id"
            WHERE a."organizacion_id" = $1 LIMIT 1`,
        ),
        updateAplicacion: await escribir(`UPDATE "pago_plataforma_aplicacion" SET "monto" = 1 WHERE "organizacion_id" = $1`),
        deleteAplicacion: await escribir(`DELETE FROM "pago_plataforma_aplicacion" WHERE "organizacion_id" = $1`),
      };
      // Lo disponible de otra empresa, por la única función que `servi_app` puede llamar.
      const disponibleAjeno = await capturar(tx, async () => {
        await comoApp(tx, org(B));
        await tx.$queryRawUnsafe(`SELECT pago_plataforma_disponible($1)`, org(A));
      });
      await tx.$executeRawUnsafe(`RESET ROLE`);
      return { deB, deOtra, escrituras, disponibleAjeno: disponibleAjeno === null ? null : sqlstateDe(disponibleAjeno) };
    });
    expect(r.deB).toEqual({ confirmaciones: { n: 1, empresas: [org(B)] }, aplicaciones: { n: 1, empresas: [org(B)] } });
    expect(r.deOtra).toEqual({ confirmaciones: { n: 0, empresas: null }, aplicaciones: { n: 0, empresas: null } });
    expect(r.escrituras).toEqual({
      insertConfirmacion: "42501",
      updateConfirmacion: "42501",
      deleteConfirmacion: "42501",
      insertAplicacion: "42501",
      updateAplicacion: "42501",
      deleteAplicacion: "42501",
    });
    expect(r.disponibleAjeno).toBe("42501");

    // Por el repositorio: en el contexto de B, lo confirmado de A no se ve aunque se pida con su empresa.
    const pagos = new PagoPlataformaRepository(app);
    expect(await conEmpresa(org(B), () => pagos.sumaPagosConfirmados(org(A)))).toBe("0.00");
    expect(await conEmpresa(org(B), () => pagos.sumaPagosConfirmados(org(B)))).toBe("50000.00");
  });

  it("R26: una confirmación o una aplicación no cambian, tampoco como dueño (SL060)", async () => {
    const r = await revertida(base, async (tx) => {
      const cambiar = async (sql: string) => {
        const e = await capturar(tx, () => tx.$executeRawUnsafe(sql, org(B)));
        return e === null ? null : sqlstateDe(e);
      };
      return {
        confirmacion: await cambiar(`UPDATE "pago_plataforma_confirmacion" SET "confirmado_at" = "confirmado_at" WHERE "organizacion_id" = $1`),
        aplicacion: await cambiar(`UPDATE "pago_plataforma_aplicacion" SET "monto" = "monto" WHERE "organizacion_id" = $1`),
      };
    });
    expect(r).toEqual({ confirmacion: "SL060", aplicacion: "SL060" });
  });

  /* --------------------------- C: la de −30 000 ---------------------------- */

  it("R31: C con cerradas de 200 000 y −30 000 → disponible 170 000; 170 000,01 no cabe y 170 000 sí; la negativa no se ofrece ni se acepta", async () => {
    expect(await disponible(C)).toBe("170000.00");
    expect(await deuda(C)).toBe("170000.00");
    expect(await pagoRechazado(C, "170000.01")).toEqual(["monto"]);
    pago.C = await pagarOk(C, "170000.00");
    expect((await leer(C)).facturas.map((f) => ({ id: f.id, saldo: f.saldo }))).toEqual([{ id: factura.C1.id, saldo: "200000.00" }]);
    const antes = await escrituras();
    expect(await confirmar(C, pago.C, [{ facturaId: factura.C2.id, monto: "170000.00" }])).toEqual({
      estado: "validation_error",
      errores: { [`aplicaciones.${factura.C2.id}`]: TEXTOS_CONFIRMACION.factura_no_valida },
    });
    expect(await escrituras()).toEqual(antes);
  });

  /* ------------------------------ el comprobante --------------------------- */

  it("R32, R34: un pago con comprobante se lee con tieneComprobante; el pago de C no se ve desde B, y desde C el servicio lo firma sin dar la ruta", async () => {
    await bajoLockDeEscrituraReal(() =>
      base.walletComprobante.create({
        data: {
          cajaMovimientoId: pago.C,
          storagePath: RUTA_COMPROBANTE,
          contentType: "image/png",
          subidoPor: C.p.maestro.usuarioId,
          organizacionId: org(C),
        },
      }),
    );
    expect((await leer(C)).pagos.map((p) => ({ id: p.id, tieneComprobante: p.tieneComprobante }))).toEqual([
      { id: pago.C, tieneComprobante: true },
    ]);

    // Dentro de `conEmpresa(B)` la RLS esconde el pago de C, aunque se pida con la empresa de C.
    const repo = new PagoPlataformaConfirmacionRepository(app);
    expect(await conEmpresa(org(B), () => repo.pagoDeLaEmpresa(org(C), pago.C))).toBeNull();
    expect(await conEmpresa(org(C), () => repo.pagoDeLaEmpresa(org(C), pago.C))).toEqual({ id: pago.C });
    // Un movimiento de la caja que no es un pago a la plataforma no es «el pago».
    const ajuste = await base.walletMovimiento.findFirstOrThrow({ where: { organizacionId: org(C), categoria: "ingreso_ajuste" }, select: { id: true } });
    expect(await conEmpresa(org(C), () => repo.pagoDeLaEmpresa(org(C), ajuste.id))).toBeNull();

    // El servicio con los repositorios reales y un firmador de prueba (la app no habla con Storage en los tests).
    const firmas: { ruta: string; segundos: number }[] = [];
    const service = new PagoPlataformaConfirmacionService(repo, new WalletComprobanteRepository(app), {
      createSignedUrl: async (ruta, segundos) => {
        firmas.push({ ruta, segundos });
        return "https://storage.test/firmada";
      },
    }, 300);
    expect(await service.verComprobante(superadmin(), { organizacionId: org(B), pagoId: pago.C })).toEqual({ estado: "not_found" });
    expect(await service.verComprobante(superadmin(), { organizacionId: org(B), pagoId: pago.B })).toEqual({ estado: "sin_comprobante" });
    expect(firmas).toEqual([]);
    const r = await service.verComprobante(superadmin(), { organizacionId: org(C), pagoId: pago.C });
    expect(r).toEqual({ estado: "ok", url: "https://storage.test/firmada", contentType: "image/png" });
    expect(firmas).toEqual([{ ruta: RUTA_COMPROBANTE, segundos: 300 }]);
    expect(JSON.stringify(r)).not.toContain(RUTA_COMPROBANTE);
    expect(await service.verComprobante({ ...C.p.maestro }, { organizacionId: org(C), pagoId: pago.C })).toEqual({ estado: "forbidden" });
  });
});
