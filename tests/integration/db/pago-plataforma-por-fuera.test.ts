import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { RolValue, type PrismaClient } from "@prisma/client";

import { verDeudaPlataformaAction } from "@/lib/actions/deuda-plataforma";
import { autoriaDelLibroCajaAction } from "@/lib/actions/libro-caja-autoria";
import {
  anularPagoConfirmadoAction,
  confirmarPagoPlataformaAction,
  registrarPagoPorFueraAction,
  verPagosDeEmpresaAction,
} from "@/lib/actions/pagos-plataforma";
import {
  libroCajaKardexAction,
  libroCajaKardexConDetalleAction,
  listarMovimientosAction,
  registrarMovimientoManualAction,
  verDetalleDeMovimientoAction,
  verResumenCajaAction,
} from "@/lib/actions/wallet";
import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { registrarEgresoAdministrativoAction } from "@/lib/actions/wallet-egresos";
import { quienesDelLibroCajaAction } from "@/lib/actions/wallet-filtros";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoPlataformaConfirmacionRepository } from "@/lib/repositories/PagoPlataformaConfirmacionRepository";
import { MENSAJE_TOPE_PAGO_PLATAFORMA } from "@/lib/types/cobro-plataforma";
import type { AutoriaDeFilaDTO } from "@/lib/types/libro-caja-autoria";
import { TEXTOS_CONFIRMACION } from "@/lib/types/pago-plataforma";
import { NOMBRE_USUARIO_SELECT, nombreCompletoUsuario } from "@/lib/utils/nombre-usuario";
import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { menos } from "./_fixtures/caja-459";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { cerrarFacturaEnCurso, facturaEnCurso, type FacturaCerrada } from "./_fixtures/factura-cerrada";
import { capturar, revertida, sqlstateDe } from "./_fixtures/planes";
import { idDeRol, insertarUsuario, obtenerOCrearSuperadmin, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SLT-42 (T5.4): la zona del país de la empresa es la de CR, como antes (molde `pago-plataforma-confirmacion.test.ts`).
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
// SLT-143 (design §8) — EL PAGO HECHO POR FUERA Y LA ANULACIÓN DE UN PAGO CONFIRMADO, contra Postgres, COMMITEADO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Se recorre la tabla de pasos de design §8 en orden, con tres empresas con personas reales:
//   · A: una factura cerrada de 300 000 y 500 000 en la caja; el superadmin registra por fuera, la empresa paga
//     desde la wallet, el superadmin confirma y anula;
//   · B: una factura cerrada de 50 000 y un pago: el «pago de otra empresa», la «factura de otra empresa» y la
//     empresa que lee sus propias anulaciones (R32);
//   · C: la caja en 0 y una factura de 50 000: el pago por fuera la deja en negativo (R3).
//
// TODO VA POR LAS SERVER ACTIONS, SIN SERVICIO INYECTADO, como en una petición, salvo el comprobante: no hay
// Storage en el test, así que la fila del comprobante (R8, R9) se prueba por el repositorio real con una ruta
// inventada, que es lo que el servicio le pasa tras subir el archivo. Lo que se mide se lee con el cliente BASE,
// dueño y sin RLS: las filas que hay de verdad.
//
// LA CONCURRENCIA (R11, R24): otra conexión toma el MISMO candado de los pagos de la empresa y lo sostiene mientras
// arrancan las dos operaciones; ninguna termina mientras dura y al soltarlo se serializan (molde de SLT-60).
//
// MUTACIONES QUE LO MATAN (design §8, medidas y revertidas en `progress/impl_SLT-143.md`): `factura_plataforma_saldos`
// sin el NOT EXISTS de la anulación; el trigger de §3.5 sin la excepción; el trigger que deja pasar siempre;
// `sumaPagosConfirmados` sin el filtro; `_pago_plataforma_aplicar` sin la comprobación de la suma.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const REFERENCIA = `Transferencia del día SLT143 ${RUN}`;
const MOTIVO = `Pago duplicado SLT143 ${RUN}`;
const RUTA_COMPROBANTE = `slt143/${RUN}/comprobante.png`;

let base: PrismaClient;
let app: PrismaClient;
let sostenedor: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;
let soltarSuperadmin: () => Promise<void> = async () => {};
let superadminId: string | null = null;
// En una base de desarrollo que ya tiene su superadmin, se usa ese y no se borra al acabar.
let superadminPropio = false;
let nombreSuperadmin = "";
let geo: { provinciaId: string; cantonId: string; distritoId: string };
let estatusInicialId: string;

interface Empresa {
  p: Personas459;
  zonaId: string;
}
let A: Empresa;
let B: Empresa;
let C: Empresa;
const factura: Record<string, FacturaCerrada> = {};
const pago: Record<string, string> = {};

const org = (e: Empresa) => e.p.organizacionId;
const deps = (actor: Actor) => ({ getActor: async () => actor });
const superadmin = (): Actor => ({ usuarioId: superadminId as string, rol: RolValue.superadmin, organizacionId: null });
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

async function sembrarEmpresa(caja: string | null): Promise<Empresa> {
  const p = await sembrarPersonas459(base);
  const zona = await bajoLockDeEscrituraReal(() =>
    base.zona.create({
      data: { nombre: `Zona SLT143 ${RUN} ${randomUUID().slice(0, 6)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  if (caja !== null) {
    const r = await conEmpresa(p.organizacionId, () =>
      registrarMovimientoManualAction(
        { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto: caja, descripcion: `Ajuste SLT143 ${RUN}` },
        deps(p.maestro),
      ),
    );
    if (r.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(r)}`);
  }
  return { p, zonaId: zona.id };
}

/** Una orden por el repositorio real con un cargo de `monto` (el molde de SLT-60). */
async function ordenConCargo(e: Empresa, monto: string): Promise<void> {
  const numRemision = `SLT143-${RUN}-${randomUUID().slice(0, 8)}`;
  const r = await conEmpresa(org(e), () =>
    new OrdenRepository(app).createManyOrdenes(
      [
        {
          numRemision,
          estatusId: estatusInicialId,
          destinatario: `Cliente SLT143 ${RUN}`,
          telefonoDest: "88887777",
          tiendaId: e.p.tiendaId,
          zonaId: e.zonaId,
          provinciaId: geo.provinciaId,
          cantonId: geo.cantonId,
          distritoId: geo.distritoId,
          nodoGeograficoId: geo.distritoId, // SLT-45 (R25): el nodo mas profundo resuelto
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
  await bajoLockDeEscrituraReal(async () => {
    await base.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, id);
    await base.$executeRawUnsafe(
      `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
       VALUES ($1, $2, $3, 1, 'cargo', 'plan', $4::numeric, now() AT TIME ZONE 'UTC')`,
      `slt143-${randomUUID()}`,
      org(e),
      id,
      monto,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Lo que hacen la empresa y el superadmin                                     */
/* -------------------------------------------------------------------------- */

function pagarDesdeLaWallet(e: Empresa, monto: string) {
  return conEmpresa(org(e), () =>
    registrarEgresoAdministrativoAction(
      { tipoEgreso: "pago_plataforma", monto, descripcion: `Wallet SLT143 ${RUN} ${monto}`, claveIdempotencia: randomUUID() },
      deps(e.p.maestro),
    ),
  );
}

async function pagarDesdeLaWalletOk(e: Empresa, monto: string): Promise<string> {
  const r = await pagarDesdeLaWallet(e, monto);
  if (r.status !== "ok") throw new Error(`el pago de ${monto} respondió ${JSON.stringify(r)}`);
  return r.movimiento.id;
}

interface PorFuera {
  monto: string;
  aplicaciones: { facturaId: string; monto: string }[];
  clave?: string;
  referencia?: string;
}

/** El formulario del superadmin, por la action real (sin comprobante: no hay Storage en el test). */
function registrarPorFuera(e: Empresa, d: PorFuera) {
  const fd = new FormData();
  fd.append("claveIdempotencia", d.clave ?? randomUUID());
  fd.append("monto", d.monto);
  fd.append("referencia", d.referencia ?? REFERENCIA);
  fd.append("aplicaciones", JSON.stringify(d.aplicaciones));
  return registrarPagoPorFueraAction(org(e), fd, deps(superadmin()));
}

/** El id del último pago por fuera de la empresa con esa clave. */
async function pagoDeLaClave(e: Empresa, clave: string): Promise<string> {
  const f = await base.walletMovimiento.findFirstOrThrow({ where: { organizacionId: org(e), claveIdempotencia: clave }, select: { id: true } });
  return f.id;
}

function anularComoPlataforma(e: Empresa, pagoId: string, motivo = MOTIVO) {
  return anularPagoConfirmadoAction(org(e), { pagoId, motivo }, deps(superadmin()));
}

function anularComoEmpresa(e: Empresa, movimientoId: string) {
  return conEmpresa(org(e), () => anularMovimientoAction({ destino: { libro: "caja", movimientoId }, motivo: MOTIVO }, deps(e.p.maestro)));
}

function confirmar(e: Empresa, pagoId: string, aplicaciones: { facturaId: string; monto: string }[]) {
  return confirmarPagoPlataformaAction({ organizacionId: org(e), pagoId, aplicaciones }, deps(superadmin()));
}

async function leer(e: Empresa) {
  const r = await verPagosDeEmpresaAction({ organizacionId: org(e) }, deps(superadmin()));
  if (r.estado !== "ok") throw new Error(`verPagosDeEmpresaAction respondió ${JSON.stringify(r)}`);
  return r.datos;
}

/** «Registró» y la anulación de cada fila, como las lee la wallet de la empresa (R13, R14, R36). */
async function autoria(e: Empresa, ids: string[]): Promise<Map<string, AutoriaDeFilaDTO>> {
  const r = await conEmpresa(org(e), () => autoriaDelLibroCajaAction({ movimientoIds: ids }, deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`autoriaDelLibroCajaAction respondió ${JSON.stringify(r)}`);
  return new Map(r.filas.map((f) => [f.movimientoId, f]));
}

/* -------------------------------------------------------------------------- */
/* Lecturas                                                                    */
/* -------------------------------------------------------------------------- */

async function disponible(e: Empresa): Promise<string> {
  const [f] = await base.$queryRaw<{ d: string }[]>`SELECT pago_plataforma_disponible_de(${org(e)})::text AS d`;
  return f.d;
}

async function deuda(e: Empresa): Promise<string> {
  const r = await conEmpresa(org(e), () => verDeudaPlataformaAction(deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verDeudaPlataformaAction respondió ${JSON.stringify(r)}`);
  return r.deudaPlataforma.deuda;
}

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

/** Las filas que un registro o una anulación podrían tocar, de las tres empresas. */
async function escrituras() {
  const orgs = [org(A), org(B), org(C)];
  const donde = { where: { organizacionId: { in: orgs } } };
  const [libro, comprobantes, constancias, confirmaciones, porFuera, aplicaciones, anulaciones, historial] = await Promise.all([
    base.walletMovimiento.count(donde),
    base.walletComprobante.count(donde),
    base.ajusteCajaAnulacion.count(donde),
    base.pagoPlataformaConfirmacion.count(donde),
    base.pagoPlataformaConfirmacion.count({ where: { organizacionId: { in: orgs }, porFuera: true } }),
    base.pagoPlataformaAplicacion.count(donde),
    base.pagoPlataformaAnulacion.count(donde),
    base.historialAccion.count(donde),
  ]);
  return { libro, comprobantes, constancias, confirmaciones, porFuera, aplicaciones, anulaciones, historial };
}
type Escrituras = Awaited<ReturnType<typeof escrituras>>;
const mas = (a: Escrituras, cambios: Partial<Escrituras>): Escrituras => {
  const r = { ...a };
  for (const [k, v] of Object.entries(cambios)) r[k as keyof Escrituras] += v as number;
  return r;
};

/** Cada factura de la empresa entera en texto (R30: ni sus cifras, ni su número, ni su estado cambian). */
async function fotoDeFacturas(e: Empresa): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ l: string }[]>(
    `SELECT f::text AS l FROM "factura_plataforma" f WHERE f."organizacion_id" = $1 ORDER BY f."desde_at"`,
    org(e),
  );
  return filas.map((f) => f.l);
}

async function porConfirmar(e: Empresa): Promise<string[]> {
  const filas = await base.$queryRaw<{ id: string }[]>`SELECT p."id" FROM pago_plataforma_por_confirmar(${org(e)}) p`;
  return filas.map((f) => f.id);
}

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

describeSiHayBase("SLT-143 — el pago hecho por fuera y la anulación de un pago confirmado (Postgres, design §8)", () => {
  let cajaA: Caja;

  beforeAll(async () => {
    base = crearPrismaDeTest();
    sostenedor = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);

    soltarSuperadmin = await tomarLockDeSuperadmin();
    const superadminDelCaso = await obtenerOCrearSuperadmin(base, () =>
      bajoLockDeEscrituraReal(() =>
        base.$transaction(async (tx) => {
          const u = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
          if (!u.desenlace.ok) throw new Error(`no se sembró el superadmin: ${JSON.stringify(u.desenlace)}`);
          return u.id;
        }),
      ),
    );
    superadminId = superadminDelCaso.id;
    superadminPropio = superadminDelCaso.propio;
    nombreSuperadmin = nombreCompletoUsuario(
      await base.usuario.findUniqueOrThrow({ where: { id: superadminId }, select: NOMBRE_USUARIO_SELECT }),
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

    tarifaGlobal = await tomarTarifaGlobal();
    await new CobroPlataformaTarifaRepository(base).fijarGlobal("500.00");

    A = await sembrarEmpresa("500000.00");
    B = await sembrarEmpresa("100000.00");
    C = await sembrarEmpresa(null);

    await ordenConCargo(A, "300000.00");
    factura.A = await cerrarFacturaEnCurso(base, org(A));

    await ordenConCargo(B, "50000.00");
    factura.B = await cerrarFacturaEnCurso(base, org(B));
    pago.B = await pagarDesdeLaWalletOk(B, "50000.00");

    await ordenConCargo(C, "50000.00");
    factura.C = await cerrarFacturaEnCurso(base, org(C));
  }, 300_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.p.organizacionId, B?.p.organizacionId, C?.p.organizacionId].filter((x): x is string => typeof x === "string");
    try {
      if (orgs.length > 0) {
        await bajoLockDeEscrituraReal(async () => {
          // Las anulaciones de la plataforma cuelgan de la confirmación; la confirmación y el comprobante, del pago;
          // la constancia, del pago. Lo que registró el superadmin no lo ve `limpiar459` (no es de la empresa).
          for (const tabla of [
            "pago_plataforma_anulacion",
            "pago_plataforma_aplicacion",
            "pago_plataforma_confirmacion",
            "wallet_comprobante",
            "ajuste_caja_anulacion",
            "wallet_movimiento",
          ]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      await limpiar459(base, A?.p ?? null);
      await limpiar459(base, B?.p ?? null);
      await limpiar459(base, C?.p ?? null);
      // Solo el superadmin propio: el que ya tenia la base no se borra.
      if (superadminId !== null && superadminPropio) {
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

  it("control: las funciones nuevas existen, las facturas están cerradas y A empieza con 500 000 en caja y 300 000 de deuda", async () => {
    const funciones = await base.$queryRawUnsafe<{ proname: string }[]>(
      `SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1::text[]) ORDER BY p.proname`,
      ["_pago_plataforma_aplicar", "pago_plataforma_anular_confirmado", "pago_plataforma_registrar_por_fuera"],
    );
    expect(funciones.map((f) => f.proname)).toHaveLength(3);
    expect([factura.A.total, factura.B.total, factura.C.total]).toEqual(["300000.00", "50000.00", "50000.00"]);
    cajaA = await caja(A);
    expect(cajaA.enCaja).toBe("500000.00");
    expect(await deuda(A)).toBe("300000.00");
    expect(await disponible(A)).toBe("300000.00");
  });

  /* --------------------------- registrar por fuera ------------------------- */

  it("R1, R2, R12, P6: el superadmin registra por fuera 100 000 → caja 400 000, deuda 200 000, disponible 200 000; una confirmación por fuera, sin historial ni cambio en la factura", async () => {
    const foto = await fotoDeFacturas(A);
    const antes = await escrituras();
    const clave = randomUUID();
    expect(await registrarPorFuera(A, { clave, monto: "100000.00", aplicaciones: [{ facturaId: factura.A.id, monto: "100000.00" }] })).toEqual({
      estado: "ok",
    });
    pago.pf1 = await pagoDeLaClave(A, clave);
    pago.clavePf1 = clave;

    expect(await escrituras()).toEqual(mas(antes, { libro: 1, confirmaciones: 1, porFuera: 1, aplicaciones: 1 }));
    const mov = await base.walletMovimiento.findUniqueOrThrow({
      where: { id: pago.pf1 },
      select: { tipo: true, categoria: true, monto: true, origenTipo: true, origenId: true, descripcion: true, registradoPor: true },
    });
    expect({ ...mov, monto: mov.monto.toFixed(2) }).toEqual({
      tipo: "egreso",
      categoria: "egreso_pago_plataforma",
      monto: "100000.00",
      origenTipo: "gasto",
      origenId: null,
      descripcion: REFERENCIA,
      registradoPor: superadminId,
    });
    const conf = await base.pagoPlataformaConfirmacion.findFirstOrThrow({
      where: { pagoId: pago.pf1 },
      select: { porFuera: true, confirmadoPor: true, confirmadoAt: true, aplicaciones: { select: { facturaId: true, monto: true } } },
    });
    expect(conf.porFuera).toBe(true);
    expect(conf.confirmadoPor).toBe(superadminId);
    expect(Math.abs(conf.confirmadoAt.getTime() - Date.now())).toBeLessThan(5 * 60_000);
    expect(conf.aplicaciones.map((a) => ({ facturaId: a.facturaId, monto: a.monto.toFixed(2) }))).toEqual([
      { facturaId: factura.A.id, monto: "100000.00" },
    ]);

    const ahora = await caja(A);
    expect(delta(cajaA, ahora)).toEqual({ enCaja: "-100000.00", salidas: "100000.00", entradas: "0.00", ganancia: "-100000.00" });
    expect(ahora.enCaja).toBe("400000.00");
    cajaA = ahora;
    expect(await deuda(A)).toBe("200000.00");
    expect(await disponible(A)).toBe("200000.00");
    expect(await fotoDeFacturas(A)).toEqual(foto);

    // R12, R16: no es un pago por confirmar; sale en «Pagos confirmados» con la marca.
    expect(await porConfirmar(A)).not.toContain(pago.pf1);
    const datos = await leer(A);
    expect(datos.pagos.map((p) => p.id)).not.toContain(pago.pf1);
    expect(datos.confirmados.find((c) => c.id === pago.pf1)).toEqual({
      id: pago.pf1,
      monto: "100000.00",
      fecha: expect.any(Date),
      referencia: REFERENCIA,
      registradoPor: null,
      porFuera: true,
      confirmadoPor: nombreSuperadmin,
      confirmadoEl: conf.confirmadoAt,
      aplicaciones: [{ facturaId: factura.A.id, numero: factura.A.numero, monto: "100000.00" }],
      tieneComprobante: false,
    });
    expect(datos.facturas.map((f) => f.saldo)).toEqual(["200000.00"]);
  });

  it("R10: el mismo registro con la misma clave → ya_registrado, y nada escrito", async () => {
    const antes = await escrituras();
    expect(
      await registrarPorFuera(A, { clave: pago.clavePf1, monto: "100000.00", aplicaciones: [{ facturaId: factura.A.id, monto: "100000.00" }] }),
    ).toEqual({ estado: "ya_registrado" });
    expect(await escrituras()).toEqual(antes);
  });

  it("R6: 200 000,01 con 200 000 disponibles → validation_error en monto con el mensaje de SLT-60, y nada escrito", async () => {
    const antes = await escrituras();
    expect(
      await registrarPorFuera(A, { monto: "200000.01", aplicaciones: [{ facturaId: factura.A.id, monto: "200000.01" }] }),
    ).toEqual({ estado: "validation_error", errores: { monto: MENSAJE_TOPE_PAGO_PLATAFORMA } });
    expect(await escrituras()).toEqual(antes);
    expect(await disponible(A)).toBe("200000.00");
  });

  it("R5: un reparto que suma 99 999, la factura en curso o la de otra empresa → validation_error con su clave, y nada escrito", async () => {
    const antes = await escrituras();
    const enCurso = await facturaEnCurso(base, org(A));
    expect(
      await registrarPorFuera(A, { monto: "100000.00", aplicaciones: [{ facturaId: factura.A.id, monto: "99999.00" }] }),
    ).toEqual({ estado: "validation_error", errores: { aplicaciones: TEXTOS_CONFIRMACION.suma_distinta } });
    expect(await registrarPorFuera(A, { monto: "100.00", aplicaciones: [{ facturaId: enCurso.id, monto: "100.00" }] })).toEqual({
      estado: "validation_error",
      errores: { [`aplicaciones.${enCurso.id}`]: TEXTOS_CONFIRMACION.factura_no_valida },
    });
    expect(await registrarPorFuera(A, { monto: "100.00", aplicaciones: [{ facturaId: factura.B.id, monto: "100.00" }] })).toEqual({
      estado: "validation_error",
      errores: { [`aplicaciones.${factura.B.id}`]: TEXTOS_CONFIRMACION.factura_no_valida },
    });
    expect(await escrituras()).toEqual(antes);
  });

  it("R8, R9: con comprobante queda su fila con el pago; si el reparto falla, ni el pago ni el comprobante", async () => {
    const repo = new PagoPlataformaConfirmacionRepository(app);
    const entrada = (monto: string, aplicado: string) => ({
      organizacionId: org(A),
      pagoId: randomUUID(),
      monto,
      fecha: null,
      referencia: `${REFERENCIA} con comprobante`,
      claveIdempotencia: randomUUID(),
      aplicaciones: [{ facturaId: factura.A.id, monto: aplicado }],
      por: superadminId as string,
      ahora: new Date(),
      comprobante: { storagePath: RUTA_COMPROBANTE, contentType: "image/png" },
    });

    const antes = await escrituras();
    const fallida = entrada("10000.00", "9999.99");
    expect(await repo.registrarPorFuera(fallida)).toEqual({ estado: "rechazado", error: { codigo: "suma_distinta" } });
    expect(await escrituras()).toEqual(antes);
    expect(await base.walletComprobante.count({ where: { storagePath: RUTA_COMPROBANTE } })).toBe(0);

    const buena = entrada("10000.00", "10000.00");
    expect(await repo.registrarPorFuera(buena)).toEqual({ estado: "ok" });
    pago.pf10 = buena.pagoId;
    const comp = await base.walletComprobante.findFirstOrThrow({
      where: { cajaMovimientoId: pago.pf10 },
      select: { organizacionId: true, storagePath: true, contentType: true, subidoPor: true },
    });
    expect(comp).toEqual({ organizacionId: org(A), storagePath: RUTA_COMPROBANTE, contentType: "image/png", subidoPor: superadminId });
    expect((await leer(A)).confirmados.find((c) => c.id === pago.pf10)?.tieneComprobante).toBe(true);
    expect(await disponible(A)).toBe("190000.00");
    cajaA = await caja(A);
  });

  it("R11: un pago desde la wallet y uno por fuera de 100 000 a la vez con 190 000 disponibles → esperan el candado; uno entra y el otro es validation_error en monto", async () => {
    const { terminadasConElCandado, resultados } = await aLaVez(A, [
      () => pagarDesdeLaWallet(A, "100000.00"),
      () => registrarPorFuera(A, { monto: "100000.00", aplicaciones: [{ facturaId: factura.A.id, monto: "100000.00" }] }),
    ]);
    expect(terminadasConElCandado, "ningún pago debe evaluarse mientras otro tiene el candado").toBe(0);
    const [wallet, porFuera] = resultados;
    const estados = [wallet.status === "ok" ? "ok" : wallet.status, porFuera.estado];
    expect(estados.sort()).toEqual(["ok", "validation_error"]);
    if (wallet.status === "validation_error") expect(Object.keys(wallet.fieldErrors)).toEqual(["monto"]);
    if (porFuera.estado === "validation_error") expect(porFuera.errores).toEqual({ monto: MENSAJE_TOPE_PAGO_PLATAFORMA });
    expect(await disponible(A)).toBe("90000.00");
    cajaA = await caja(A);
  });

  it("R12: ningún pago por fuera es un pago por confirmar", async () => {
    const porFuera = await base.pagoPlataformaConfirmacion.findMany({ where: { organizacionId: org(A), porFuera: true }, select: { pagoId: true } });
    expect(porFuera.length).toBeGreaterThanOrEqual(2);
    const pendientes = await porConfirmar(A);
    for (const p of porFuera) expect(pendientes).not.toContain(p.pagoId);
  });

  it("R13, R14: en la wallet, el pago por fuera dice «plataforma» sin nombre ni id; uno de la empresa confirmado, el nombre", async () => {
    pago.empresa = await pagarDesdeLaWalletOk(A, "40000.00");
    expect(await confirmar(A, pago.empresa, [{ facturaId: factura.A.id, monto: "40000.00" }])).toEqual({ estado: "ok" });
    cajaA = await caja(A);
    const filas = await autoria(A, [pago.pf1, pago.empresa]);
    expect(filas.get(pago.pf1)?.registro).toEqual({ nombre: null, automatico: { accion: "plataforma", por: null } });
    const maestra = nombreCompletoUsuario(
      await base.usuario.findUniqueOrThrow({ where: { id: A.p.maestro.usuarioId }, select: NOMBRE_USUARIO_SELECT }),
    );
    expect(filas.get(pago.empresa)?.registro).toEqual({ nombre: maestra, automatico: null });
    const texto = JSON.stringify([...filas.values()]);
    expect(texto).not.toContain(superadminId as string);
    expect(texto).not.toContain(nombreSuperadmin);
  });

  /* --------------------------------- anular -------------------------------- */

  it("R15: A intenta anular el pago por fuera → forbidden, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await anularComoEmpresa(A, pago.pf1)).toEqual({ status: "forbidden" });
    expect(await escrituras()).toEqual(antes);
  });

  it("R29: el contra-asiento del pago por fuera escrito a mano, sin la anulación de la plataforma → SL060 como dueño y como servi_app", async () => {
    const r = await revertida(base, async (tx) => {
      const contra = (comoServiApp: boolean) =>
        capturar(tx, async () => {
          if (comoServiApp) await comoApp(tx, org(A));
          await tx.$executeRawUnsafe(
            `INSERT INTO "wallet_movimiento" ("id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "descripcion", "organizacion_id")
             VALUES (gen_random_uuid()::text, 'ingreso', 'ingreso_ajuste', 100000.00, 'gasto', $1, 'Contra-asiento a mano SLT-143', $2)`,
            pago.pf1,
            org(A),
          );
        });
      const dueno = await contra(false);
      const serviApp = await contra(true);
      return { dueno: dueno === null ? null : sqlstateDe(dueno), serviApp: serviApp === null ? null : sqlstateDe(serviApp) };
    });
    expect(r).toEqual({ dueno: "SL060", serviApp: "SL060" });
  });

  it("R21, R22, R26, R30: el superadmin anula el pago por fuera con motivo → la caja y la deuda vuelven en 100 000, lo disponible sube; la factura y las aplicaciones no cambian", async () => {
    const foto = await fotoDeFacturas(A);
    const deudaAntes = await deuda(A);
    const antes = await escrituras();
    expect(await anularComoPlataforma(A, pago.pf1)).toEqual({ estado: "ok" });

    expect(await escrituras()).toEqual(mas(antes, { libro: 1, constancias: 1, anulaciones: 1 }));
    const anulacion = await base.pagoPlataformaAnulacion.findFirstOrThrow({
      where: { confirmacion: { pagoId: pago.pf1 } },
      select: { organizacionId: true, anuladoPor: true, anuladoAt: true },
    });
    expect(anulacion.organizacionId).toBe(org(A));
    expect(anulacion.anuladoPor).toBe(superadminId);
    expect(await base.ajusteCajaAnulacion.findUniqueOrThrow({ where: { movimientoId: pago.pf1 }, select: { motivo: true, anuladoPor: true } })).toEqual({
      motivo: MOTIVO,
      anuladoPor: superadminId,
    });
    const contra = await base.walletMovimiento.findFirstOrThrow({
      where: { origenTipo: "gasto", origenId: pago.pf1, categoria: "ingreso_ajuste" },
      select: { id: true, tipo: true, monto: true, descripcion: true, registradoPor: true },
    });
    expect({ ...contra, monto: contra.monto.toFixed(2), id: undefined }).toEqual({
      id: undefined,
      tipo: "ingreso",
      monto: "100000.00",
      descripcion: `Anulación de: ${REFERENCIA}`,
      registradoPor: superadminId,
    });
    pago.contraPf1 = contra.id;

    const ahora = await caja(A);
    expect(delta(cajaA, ahora)).toEqual({ enCaja: "100000.00", salidas: "0.00", entradas: "100000.00", ganancia: "100000.00" });
    cajaA = ahora;
    expect(menos(await deuda(A), deudaAntes)).toBe("100000.00");
    expect(await disponible(A)).toBe("150000.00");
    expect(await fotoDeFacturas(A)).toEqual(foto);

    // R26: no vuelve a estar por confirmar, ni sale en los confirmados.
    expect(await porConfirmar(A)).not.toContain(pago.pf1);
    const datos = await leer(A);
    expect(datos.confirmados.map((c) => c.id)).not.toContain(pago.pf1);
    expect(datos.pagos.map((p) => p.id)).not.toContain(pago.pf1);
  });

  it("R28, R36: en la wallet, el contra-asiento dice «Anulado por la plataforma» y el pago anulado, «la plataforma» con el motivo", async () => {
    const filas = await autoria(A, [pago.pf1, pago.contraPf1]);
    expect(filas.get(pago.contraPf1)?.registro).toEqual({ nombre: null, automatico: { accion: "plataforma_anulacion", por: null } });
    expect(filas.get(pago.pf1)?.anulacion).toEqual({ motivo: MOTIVO, por: "la plataforma", fecha: expect.any(String), hora: expect.any(String) });
    const texto = JSON.stringify([...filas.values()]);
    expect(texto).not.toContain(superadminId as string);
    expect(texto).not.toContain(nombreSuperadmin);
  });

  // Review ronda 1, B1: la autoría ya estaba limpia, pero el DTO del libro llevaba `registradoPor` (el uuid
  // de quien escribió el asiento) y viajaba en el listado y la descarga. Aquí se mira la respuesta ENTERA de
  // cada lectura de la wallet que llega al navegador de la empresa, con el pago por fuera y su contra-asiento.
  it("R13, R36 (B1): ni el listado, ni la descarga (kardex), ni el detalle de fila llevan el id o el nombre del superadmin", async () => {
    const comoMaestro = deps(A.p.maestro);
    const respuestas = await conEmpresa(org(A), async () => ({
      listado: await listarMovimientosAction({ page: 1, pageSize: 50 }, comoMaestro),
      kardex: await libroCajaKardexAction({}, comoMaestro),
      kardexConDetalle: await libroCajaKardexConDetalleAction({}, comoMaestro),
      detallePago: await verDetalleDeMovimientoAction({ movimientoId: pago.pf1 }, comoMaestro),
      detalleContra: await verDetalleDeMovimientoAction({ movimientoId: pago.contraPf1 }, comoMaestro),
      quienes: await quienesDelLibroCajaAction({}, comoMaestro),
    }));
    for (const [cual, r] of Object.entries(respuestas)) {
      const texto = JSON.stringify(r);
      // Que la lectura respondió de verdad: un error no lleva el id y daría un verde falso.
      expect({ cual, error: /"status":"(unauthenticated|forbidden|validation_error|internal_error|not_found)"/.test(texto) }).toEqual({ cual, error: false });
      expect({ cual, id: texto.includes(superadminId as string) }).toEqual({ cual, id: false });
      expect({ cual, nombre: texto.includes(nombreSuperadmin) }).toEqual({ cual, nombre: false });
    }
    // Y que las dos filas de la plataforma estaban dentro de lo que se miró.
    for (const cual of ["listado", "kardex", "kardexConDetalle"] as const) {
      const texto = JSON.stringify(respuestas[cual]);
      expect({ cual, pago: texto.includes(pago.pf1), contra: texto.includes(pago.contraPf1) }).toEqual({ cual, pago: true, contra: true });
    }
  });

  it("R24: anular otra vez → ya_anulado, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await anularComoPlataforma(A, pago.pf1)).toEqual({ estado: "ya_anulado" });
    expect(await escrituras()).toEqual(antes);
  });

  it("R24: dos anulaciones a la vez del mismo pago → esperan el candado; exactamente una escribe", async () => {
    const antes = await escrituras();
    const { terminadasConElCandado, resultados } = await aLaVez(A, [
      () => anularComoPlataforma(A, pago.pf10),
      () => anularComoPlataforma(A, pago.pf10),
    ]);
    expect(terminadasConElCandado).toBe(0);
    expect(resultados.map((r) => r.estado).sort()).toEqual(["ok", "ya_anulado"]);
    expect(await escrituras()).toEqual(mas(antes, { libro: 1, constancias: 1, anulaciones: 1 }));
    expect(await base.walletMovimiento.count({ where: { origenId: pago.pf10, categoria: "ingreso_ajuste" } })).toBe(1);
    cajaA = await caja(A);
  });

  it("R27: confirmar el pago anulado por la plataforma → not_found, y nada escrito", async () => {
    const antes = await escrituras();
    expect(await confirmar(A, pago.pf1, [{ facturaId: factura.A.id, monto: "100000.00" }])).toEqual({ estado: "not_found" });
    expect(await escrituras()).toEqual(antes);
  });

  it("R23, R25: anular uno por confirmar → no_confirmado; de otra empresa o inexistente → not_found; motivo de espacios → validation_error; nada escrito", async () => {
    pago.porConfirmar = await pagarDesdeLaWalletOk(A, "5000.00");
    cajaA = await caja(A);
    const antes = await escrituras();
    expect(await anularComoPlataforma(A, pago.porConfirmar)).toEqual({ estado: "no_confirmado" });
    expect(await anularComoPlataforma(A, pago.B)).toEqual({ estado: "not_found" });
    expect(await anularComoPlataforma(A, randomUUID())).toEqual({ estado: "not_found" });
    expect(await anularComoPlataforma(A, pago.empresa, "   ")).toEqual({
      estado: "validation_error",
      errores: { motivo: TEXTOS_CONFIRMACION.motivo_vacio },
    });
    expect(await escrituras()).toEqual(antes);
  });

  it("R21, P5: anular un pago de la empresa ya confirmado → el mismo efecto: la caja, la deuda y lo disponible suben 40 000", async () => {
    const deudaAntes = await deuda(A);
    const disponibleAntes = await disponible(A);
    expect(await anularComoPlataforma(A, pago.empresa)).toEqual({ estado: "ok" });
    expect(delta(cajaA, await caja(A))).toEqual({ enCaja: "40000.00", salidas: "0.00", entradas: "40000.00", ganancia: "40000.00" });
    expect(menos(await deuda(A), deudaAntes)).toBe("40000.00");
    expect(menos(await disponible(A), disponibleAntes)).toBe("40000.00");
    // R36: el pago lo registró la empresa; su «Registró» conserva el nombre, aunque la anulación sea de la plataforma.
    expect((await autoria(A, [pago.empresa])).get(pago.empresa)?.registro.automatico).toBeNull();
  });

  /* ------------------------------ aislamiento ------------------------------ */

  it("R32: B lee solo sus anulaciones de la plataforma; otra empresa no ve nada; no puede escribirlas (42501); y ni el dueño las cambia (SL060)", async () => {
    expect(await confirmar(B, pago.B, [{ facturaId: factura.B.id, monto: "50000.00" }])).toEqual({ estado: "ok" });
    expect(await anularComoPlataforma(B, pago.B)).toEqual({ estado: "ok" });
    const r = await revertida(base, async (tx) => {
      const ver = async (organizacionId: string) => {
        await comoApp(tx, organizacionId);
        const [c] = await tx.$queryRawUnsafe<{ n: number; empresas: string[] | null }[]>(
          `SELECT count(*)::int AS n, array_agg(DISTINCT organizacion_id) AS empresas FROM "pago_plataforma_anulacion"`,
        );
        await tx.$executeRawUnsafe(`RESET ROLE`);
        return c;
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
        insert: await escribir(
          `INSERT INTO "pago_plataforma_anulacion" ("organizacion_id", "confirmacion_id", "anulado_por", "anulado_at")
           SELECT $1, c."id", c."confirmado_por", now() FROM "pago_plataforma_confirmacion" c WHERE c."organizacion_id" = $1 LIMIT 1`,
        ),
        update: await escribir(`UPDATE "pago_plataforma_anulacion" SET "anulado_at" = now() WHERE "organizacion_id" = $1`),
        delete: await escribir(`DELETE FROM "pago_plataforma_anulacion" WHERE "organizacion_id" = $1`),
      };
      const dueno = await capturar(tx, () =>
        tx.$executeRawUnsafe(`UPDATE "pago_plataforma_anulacion" SET "anulado_at" = "anulado_at" WHERE "organizacion_id" = $1`, org(B)),
      );
      return { deB, deOtra, escrituras, dueno: dueno === null ? null : sqlstateDe(dueno) };
    });
    expect(r.deB).toEqual({ n: 1, empresas: [org(B)] });
    expect(r.deOtra).toEqual({ n: 0, empresas: null });
    expect(r.escrituras).toEqual({ insert: "42501", update: "42501", delete: "42501" });
    expect(r.dueno).toBe("SL060");
  });

  /* ---------------------------- C: caja en cero ---------------------------- */

  it("R3, R6: C con la caja en 0 registra por fuera 50 000, igual a lo disponible → ok y la caja queda en −50 000", async () => {
    const antes = await caja(C);
    expect(antes.enCaja).toBe("0.00");
    expect(await disponible(C)).toBe("50000.00");
    expect(await registrarPorFuera(C, { monto: "50000.00", aplicaciones: [{ facturaId: factura.C.id, monto: "50000.00" }] })).toEqual({
      estado: "ok",
    });
    expect((await caja(C)).enCaja).toBe("-50000.00");
    expect(await deuda(C)).toBe("0.00");
    expect(await disponible(C)).toBe("0.00");
  });
});
