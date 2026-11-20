import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { verDeudaPlataformaAction } from "@/lib/actions/deuda-plataforma";
import { autoriaDelLibroCajaAction } from "@/lib/actions/libro-caja-autoria";
import { registrarMovimientoManualAction, verResumenCajaAction } from "@/lib/actions/wallet";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { LibroCajaAutoriaRepository } from "@/lib/repositories/LibroCajaAutoriaRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { menos } from "./_fixtures/caja-459";
import {
  MONEDA_LOCAL,
  PROVEEDOR,
  aLaVezConCandado,
  avanzarIntento,
  crearIntento,
  facturaCerradaCon,
  historialDeIntento,
  leerIntento,
  limpiarEmpresasCobro,
  orgDe,
  pagoPorConfirmar,
  prepararContextoCobro,
  registrarEnlace,
  registrarPagoAprobado,
  registrarPorFuera,
  sembrarEmpresaCobro,
  type ContextoCobro,
  type EmpresaCobro,
} from "./_fixtures/cobro";
import type { FacturaCerrada } from "./_fixtures/factura-cerrada";
import { revertida, sqlstateDe } from "./_fixtures/planes";

// La zona del país de la empresa es la de CR, como en SLT-143 (`pago-plataforma-por-fuera.test.ts`): la caja y la
// deuda se leen por sus Server Actions.
vi.mock("@/lib/services/ReglasPaisEmpresaService", async (importOriginal) => {
  const { reglasPaisFijas } = await import("@/tests/fabricas/reglas-pais");
  return {
    ...(await importOriginal<typeof import("@/lib/services/ReglasPaisEmpresaService")>()),
    construirReglasPaisEmpresa: () => reglasPaisFijas(),
  };
});
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-226 (design §8, «cobro-pago-en-linea.test.ts, paso a paso») — EL PAGO APROBADO EN LÍNEA (capa 3 de la
// idempotencia), contra Postgres, COMMITEADO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Cuatro empresas, para que cada cifra de la tabla de §8 sea la de una empresa sola:
//   · A: 50 000 en caja y A1, una cerrada de 30 000. El pago en línea (R17), su marca en «Registró» (R29), lo que no
//     es «por confirmar» (R19), el mismo pago otra vez (R20) y la devolución (R23);
//   · B: B1 (dos registros del mismo pago a la vez, R20), B2 (R21), B3 (el `creado` aprobado, R14) y B4/B5 (rechazo,
//     expiración y los destinos que no se alcanzan, R24 y R15);
//   · C: la caja en 0 y una cerrada de 10 000 (R18);
//   · D: una cerrada de 30 000 con un pago de la wallet de 10 000 por confirmar (R22, decisión P1).
//
// Las funciones se llaman como DUEÑO, que es como las llama el job del webhook (SLT-228) o la conciliación (SLT-233);
// la caja y la deuda se leen como las ve la empresa (sus Server Actions), y lo escrito, con el cliente base.
//
// LA CONCURRENCIA (R20): otra conexión toma el candado de los pagos de la empresa y lo sostiene mientras arrancan
// los dos registros, cada uno en su conexión; ninguno termina mientras dura (`aLaVezConCandado`).
//
// MUTACIONES QUE LO MATAN (design §8; medidas el 2026-11-20 en una base desechable copiada de la migrada, ver
// `progress/impl_SLT-226.md`): 3) `cobro_registrar_pago_aprobado` sin el paso 3 y sin el candado (R20: el segundo
// responde `requiere_revision`, no `ya_registrado`); 4) la aplicación antes de `aprobado` (el trigger de §3.4 anula
// el propio intento y el paso a `aprobado` da SL226); 5) el tope sin la salida de §3.7 (R22: 23514).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const OTRA_MONEDA = MONEDA_LOCAL === "USD" ? "EUR" : "USD";

let base: PrismaClient;
let otra: PrismaClient;
let sostenedor: PrismaClient;
let ctx: ContextoCobro | undefined;
let A: EmpresaCobro | undefined;
let B: EmpresaCobro | undefined;
let C: EmpresaCobro | undefined;
let D: EmpresaCobro | undefined;
const factura: Record<string, FacturaCerrada> = {};
const intento: Record<string, string> = {};
const ext: Record<string, string> = {};
const pp: Record<string, string> = {};

const empresa = (e: EmpresaCobro | undefined) => e as EmpresaCobro;
const maestro = (e: EmpresaCobro | undefined) => empresa(e).p.maestro;
const escribir = <T>(fn: () => Promise<T>) => bajoLockDeEscrituraReal(fn);
const deps = (actor: Actor) => ({ getActor: async () => actor });

/* -------------------------------------------------------------------------- */
/* Siembra                                                                     */
/* -------------------------------------------------------------------------- */

/** Dinero en la caja como lo pondría el maestro: un ingreso manual por la Server Action (molde de SLT-143). */
async function ingresarEnCaja(e: EmpresaCobro, monto: string): Promise<void> {
  const r = await conEmpresa(orgDe(e), () =>
    registrarMovimientoManualAction(
      { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto, descripcion: "Ajuste SLT-226" },
      deps(e.p.maestro),
    ),
  );
  if (r.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(r)}`);
}

/** Un intento `pendiente` con su id externo, como lo dejan §3.1 y §3.2. Devuelve el id externo. */
async function intentoPendiente(e: EmpresaCobro, f: FacturaCerrada, nombre: string): Promise<string> {
  intento[nombre] = await escribir(() => crearIntento(base, orgDe(e), f.id, e.p.maestro.usuarioId));
  ext[nombre] = `ext-${nombre}-${randomUUID()}`;
  const r = await escribir(() => registrarEnlace(base, orgDe(e), intento[nombre], ext[nombre]));
  if (r !== "ok") throw new Error(`el enlace de ${nombre} respondió ${r}`);
  return ext[nombre];
}

/* -------------------------------------------------------------------------- */
/* Lecturas                                                                    */
/* -------------------------------------------------------------------------- */

async function caja(e: EmpresaCobro) {
  const r = await conEmpresa(orgDe(e), () => verResumenCajaAction({ page: 1, pageSize: 10 }, deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verResumenCajaAction respondió ${JSON.stringify(r)}`);
  const { enCaja, salidas, ganancia } = r.resumen;
  return { enCaja, salidas, ganancia };
}

async function deuda(e: EmpresaCobro): Promise<string> {
  const r = await conEmpresa(orgDe(e), () => verDeudaPlataformaAction(deps(e.p.maestro)));
  if (r.status !== "ok") throw new Error(`verDeudaPlataformaAction respondió ${JSON.stringify(r)}`);
  return r.deudaPlataforma.deuda;
}

async function disponible(e: EmpresaCobro): Promise<string> {
  const [f] = await base.$queryRawUnsafe<{ d: string }[]>(`SELECT pago_plataforma_disponible_de($1)::text AS d`, orgDe(e));
  return f.d;
}

async function saldo(e: EmpresaCobro, f: FacturaCerrada): Promise<string> {
  const [s] = await base.$queryRawUnsafe<{ saldo: string }[]>(
    `SELECT s."saldo"::text AS "saldo" FROM factura_plataforma_saldos($1) s WHERE s."factura_id" = $2`,
    orgDe(e),
    f.id,
  );
  return s.saldo;
}

async function porConfirmar(e: EmpresaCobro): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ id: string }[]>(`SELECT p."id" FROM pago_plataforma_por_confirmar($1) p`, orgDe(e));
  return filas.map((f) => f.id);
}

/** Lo que un registro del pago puede escribir en la empresa: el libro, la confirmación, la aplicación y el historial. */
async function escrituras(e: EmpresaCobro) {
  const [f] = await base.$queryRawUnsafe<{ libro: number; confirmaciones: number; aplicaciones: number; historial: number }[]>(
    `SELECT (SELECT count(*)::int FROM "wallet_movimiento" WHERE "organizacion_id" = $1) AS "libro",
            (SELECT count(*)::int FROM "pago_plataforma_confirmacion" WHERE "organizacion_id" = $1) AS "confirmaciones",
            (SELECT count(*)::int FROM "pago_plataforma_aplicacion" WHERE "organizacion_id" = $1) AS "aplicaciones",
            (SELECT count(*)::int FROM "historial_plataforma" h
              WHERE h."entidad_tipo" = 'cobro_intento' AND h."detalle"->>'organizacion_id' = $1) AS "historial"`,
    orgDe(e),
  );
  return f;
}

/** Lo que el pago `pagoProveedorId` dejó en el libro: el movimiento, su confirmación y su aplicación. */
async function rastroDelPago(e: EmpresaCobro, pagoProveedorId: string) {
  const movimientos = await base.$queryRawUnsafe<
    { id: string; tipo: string; categoria: string; monto: string; origenTipo: string; origenId: string | null; descripcion: string; registradoPor: string | null }[]
  >(
    `SELECT m."id", m."tipo"::text AS "tipo", m."categoria"::text AS "categoria", m."monto"::text AS "monto",
            m."origen_tipo"::text AS "origenTipo", m."origen_id" AS "origenId", m."descripcion", m."registrado_por" AS "registradoPor"
       FROM "wallet_movimiento" m
      WHERE m."organizacion_id" = $1 AND m."clave_idempotencia" = $2`,
    orgDe(e),
    `cobro:${PROVEEDOR}:${pagoProveedorId}`,
  );
  const ids = movimientos.map((m) => m.id);
  const confirmaciones = await base.$queryRawUnsafe<{ id: string; confirmadoPor: string | null; enLinea: boolean; porFuera: boolean }[]>(
    `SELECT c."id", c."confirmado_por" AS "confirmadoPor", c."en_linea" AS "enLinea", c."por_fuera" AS "porFuera"
       FROM "pago_plataforma_confirmacion" c WHERE c."pago_id" = ANY($1::text[])`,
    ids,
  );
  const aplicaciones = await base.$queryRawUnsafe<{ facturaId: string; monto: string }[]>(
    `SELECT a."factura_id" AS "facturaId", a."monto"::text AS "monto" FROM "pago_plataforma_aplicacion" a
      WHERE a."confirmacion_id" = ANY($1::text[])`,
    confirmaciones.map((c) => c.id),
  );
  return { movimientos, confirmaciones, aplicaciones };
}

/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-226 — el pago aprobado en línea: libro, idempotencia, tope y estados del proveedor (Postgres, design §8)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    otra = crearPrismaDeTest();
    sostenedor = crearPrismaDeTest();
    ctx = await prepararContextoCobro(base);

    A = await sembrarEmpresaCobro(ctx, "SLT226 PL A");
    B = await sembrarEmpresaCobro(ctx, "SLT226 PL B");
    C = await sembrarEmpresaCobro(ctx, "SLT226 PL C");
    D = await sembrarEmpresaCobro(ctx, "SLT226 PL D");

    await ingresarEnCaja(A, "50000.00");
    factura.A1 = await facturaCerradaCon(ctx, A, "30000.00", "SLT226-PL-A1");
    for (const n of ["B1", "B2", "B3", "B4", "B5"]) factura[n] = await facturaCerradaCon(ctx, B, "30000.00", `SLT226-PL-${n}`);
    factura.C1 = await facturaCerradaCon(ctx, C, "10000.00", "SLT226-PL-C1");
    factura.D1 = await facturaCerradaCon(ctx, D, "30000.00", "SLT226-PL-D1");

    await intentoPendiente(empresa(A), factura.A1, "a1");
    for (const n of ["b1", "b2", "b4", "b5"]) await intentoPendiente(empresa(B), factura[n.toUpperCase()], n);
    await intentoPendiente(empresa(C), factura.C1, "c1");
    for (const n of ["a1", "b1", "b2", "b3", "b4", "b5", "c1", "d1"]) pp[n] = `pp-${n}-${randomUUID()}`;
  }, 300_000);

  afterAll(async () => {
    if (base === undefined) return;
    try {
      await limpiarEmpresasCobro(base, [A, B, C, D]);
    } finally {
      await ctx?.tarifa.soltar();
      await Promise.all([base.$disconnect(), otra?.$disconnect(), sostenedor?.$disconnect()]);
    }
  }, 300_000);

  /* ------------------------- control de no vacuidad ------------------------ */

  it("control: las funciones existen (con la sobrecarga de 8 argumentos), las facturas están cerradas y A empieza con 50 000 en caja y 30 000 de deuda", async () => {
    const funciones = await base.$queryRawUnsafe<{ f: string }[]>(
      `SELECT p.proname || '/' || p.pronargs AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('cobro_registrar_pago_aprobado', 'cobro_intento_avanzar', '_pago_plataforma_aplicar',
                            'wallet_movimiento_tope_pago_plataforma', 'cobro_intento_anular_por_saldo')
        ORDER BY 1`,
    );
    expect(funciones.map((f) => f.f)).toEqual([
      "_pago_plataforma_aplicar/7",
      "_pago_plataforma_aplicar/8",
      "cobro_intento_anular_por_saldo/0",
      "cobro_intento_avanzar/4",
      "cobro_registrar_pago_aprobado/6",
      "wallet_movimiento_tope_pago_plataforma/0",
    ]);
    const filas = await base.facturaPlataforma.findMany({
      where: { id: { in: Object.values(factura).map((f) => f.id) } },
      select: { estado: true },
    });
    expect(filas.map((f) => f.estado)).toEqual(Array(Object.keys(factura).length).fill("cerrada"));
    expect((await caja(empresa(A))).enCaja).toBe("50000.00");
    expect(await deuda(empresa(A))).toBe("30000.00");
    expect(await saldo(empresa(A), factura.A1)).toBe("30000.00");
    expect(await leerIntento(base, intento.a1)).toMatchObject({ estado: "pendiente", montoLocal: "30000.00", idExterno: ext.a1 });
  });

  /* ------------------------------ el pago (R17) ----------------------------- */

  it("R17, R25: el pago aprobado de 30 000 → `ok`; caja 20 000, deuda 0, saldo 0; un «Pago a la plataforma» «Pagado en línea · <id>», confirmado en línea sin persona y aplicado entero; el intento `aprobado` con una fila de historial", async () => {
    const cajaAntes = await caja(empresa(A));
    const antes = await escrituras(empresa(A));

    expect(await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.a1, idExterno: ext.a1, monto: "30000.00" }))).toBe("ok");

    const despues = await caja(empresa(A));
    expect(despues.enCaja).toBe("20000.00");
    expect({ salidas: menos(despues.salidas, cajaAntes.salidas), ganancia: menos(despues.ganancia, cajaAntes.ganancia) }).toEqual({
      salidas: "30000.00",
      ganancia: "-30000.00",
    });
    expect(await deuda(empresa(A))).toBe("0.00");
    expect(await saldo(empresa(A), factura.A1)).toBe("0.00");

    const r = await rastroDelPago(empresa(A), pp.a1);
    expect(r.movimientos).toHaveLength(1);
    const [m] = r.movimientos;
    expect(m).toMatchObject({
      tipo: "egreso",
      categoria: "egreso_pago_plataforma",
      monto: "30000.00",
      origenTipo: "gasto",
      origenId: null,
      descripcion: `Pagado en línea · ${pp.a1}`,
      registradoPor: null,
    });
    expect(r.confirmaciones).toEqual([expect.objectContaining({ confirmadoPor: null, enLinea: true, porFuera: false })]);
    expect(r.aplicaciones).toEqual([{ facturaId: factura.A1.id, monto: "30000.00" }]);

    expect(await leerIntento(base, intento.a1)).toMatchObject({ estado: "aprobado", pagoProveedorId: pp.a1, pagoId: m.id });
    const h = await historialDeIntento(base, intento.a1);
    expect(h.map((f) => [f.valorAnterior, f.valorNuevo, f.actorUsuarioId])).toEqual([
      [null, "creado", maestro(A).usuarioId],
      ["creado", "pendiente", null],
      ["pendiente", "aprobado", null],
    ]);
    expect(await escrituras(empresa(A))).toEqual({
      libro: antes.libro + 1,
      confirmaciones: antes.confirmaciones + 1,
      aplicaciones: antes.aplicaciones + 1,
      historial: antes.historial + 1,
    });
    pp.a1Mov = m.id;
  });

  /* ------------------------------ la marca (R29) ---------------------------- */

  it("R29: como `servi_app` de A, `marcasDeLaPlataforma` devuelve el pago en `enLinea` (no en `registrados`), y «Registró» dice `pago_en_linea` sin persona", async () => {
    const marcas = await revertida(base, async (tx) => {
      await comoApp(tx, orgDe(empresa(A)));
      const m = await new LibroCajaAutoriaRepository(tx as unknown as PrismaClient).marcasDeLaPlataforma([pp.a1Mov]);
      return { enLinea: [...m.enLinea], registrados: [...m.registrados], anulados: [...m.anulados] };
    });
    expect(marcas).toEqual({ enLinea: [pp.a1Mov], registrados: [], anulados: [] });

    // Con la empresa B, la RLS no deja ver la confirmación de A: sin marca.
    const deB = await revertida(base, async (tx) => {
      await comoApp(tx, orgDe(empresa(B)));
      return [...(await new LibroCajaAutoriaRepository(tx as unknown as PrismaClient).marcasDeLaPlataforma([pp.a1Mov])).enLinea];
    });
    expect(deB).toEqual([]);

    const r = await conEmpresa(orgDe(empresa(A)), () => autoriaDelLibroCajaAction({ movimientoIds: [pp.a1Mov] }, deps(maestro(A))));
    if (r.status !== "ok") throw new Error(`autoriaDelLibroCajaAction respondió ${JSON.stringify(r)}`);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].registro).toEqual({ nombre: null, automatico: { accion: "pago_en_linea", por: null } });
  });

  /* ------------------------ no es «por confirmar» (R19) --------------------- */

  it("R19: el pago en línea no sale en `pago_plataforma_por_confirmar` y lo disponible no lo resta (disponible = deuda)", async () => {
    expect(await porConfirmar(empresa(A))).toEqual([]);
    expect(await disponible(empresa(A))).toBe(await deuda(empresa(A)));
  });

  /* --------------------------- el mismo pago (R20) -------------------------- */

  it("R20: el mismo pago otra vez → `ya_registrado`, sin ninguna fila nueva ni cambio en la caja", async () => {
    const antes = await escrituras(empresa(A));
    const cajaAntes = await caja(empresa(A));
    expect(await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.a1, idExterno: ext.a1, monto: "30000.00" }))).toBe("ya_registrado");
    expect(await escrituras(empresa(A))).toEqual(antes);
    expect(await caja(empresa(A))).toEqual(cajaAntes);
    expect((await rastroDelPago(empresa(A), pp.a1)).movimientos).toHaveLength(1);
  });

  it("R20: el mismo pago de B1 registrado a la vez desde dos conexiones → esperan el candado; uno `ok` y el otro `ya_registrado`, con 1 movimiento, 1 confirmación y 1 aplicación", async () => {
    const antes = await escrituras(empresa(B));
    const datos = { pagoProveedorId: pp.b1, idExterno: ext.b1, monto: "30000.00" };
    const { terminadasConElCandado, resultados } = await escribir(() =>
      aLaVezConCandado(sostenedor, orgDe(empresa(B)), [() => registrarPagoAprobado(base, datos), () => registrarPagoAprobado(otra, datos)]),
    );
    expect(terminadasConElCandado).toBe(0);
    expect([...resultados].sort()).toEqual(["ok", "ya_registrado"]);

    const r = await rastroDelPago(empresa(B), pp.b1);
    expect(r.movimientos).toHaveLength(1);
    expect(r.confirmaciones).toHaveLength(1);
    expect(r.aplicaciones).toEqual([{ facturaId: factura.B1.id, monto: "30000.00" }]);
    expect(await escrituras(empresa(B))).toEqual({
      libro: antes.libro + 1,
      confirmaciones: antes.confirmaciones + 1,
      aplicaciones: antes.aplicaciones + 1,
      historial: antes.historial + 1,
    });
    expect(await leerIntento(base, intento.b1)).toMatchObject({ estado: "aprobado", pagoProveedorId: pp.b1 });
    // R19 con deuda por delante: B debe 4 facturas más y lo disponible sigue siendo la deuda.
    expect(await saldo(empresa(B), factura.B1)).toBe("0.00");
    expect(await disponible(empresa(B))).toBe(await deuda(empresa(B)));
  });

  /* ---------------------------- caja negativa (R18) ------------------------- */

  it("R18: C con la caja en 0 recibe un pago en línea de 10 000 → `ok` y la caja queda en −10 000", async () => {
    expect((await caja(empresa(C))).enCaja).toBe("0.00");
    expect(await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.c1, idExterno: ext.c1, monto: "10000.00" }))).toBe("ok");
    expect((await caja(empresa(C))).enCaja).toBe("-10000.00");
    expect(await saldo(empresa(C), factura.C1)).toBe("0.00");
  });

  /* ------------------------------- el tope (R22) ---------------------------- */

  it("R22: con un pago de la wallet de 10 000 por confirmar, un egreso de 1 por encima de lo disponible se rechaza; el pago en línea de 30 000 entra igual; después, cualquier egreso se rechaza", async () => {
    const d = empresa(D);
    await escribir(() => pagoPorConfirmar(base, orgDe(d), "10000.00", d.p.maestro.usuarioId));
    expect(await disponible(d)).toBe("20000.00");
    // El tope de SLT-60 sigue en pie para todo lo que no es el pago de un intento aprobado.
    const sobre = await escribir(() =>
      pagoPorConfirmar(base, orgDe(d), "20001.00", d.p.maestro.usuarioId).then(
        () => null,
        (e: unknown) => sqlstateDe(e),
      ),
    );
    expect(sobre).toBe("23514");

    const extD1 = await intentoPendiente(d, factura.D1, "d1");
    expect(await leerIntento(base, intento.d1)).toMatchObject({ montoLocal: "30000.00" });
    // 30 000 > 20 000 disponibles: sin la salida de §3.7, el tope lo rechazaría.
    expect(await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.d1, idExterno: extD1, monto: "30000.00" }))).toBe("ok");
    expect(await leerIntento(base, intento.d1)).toMatchObject({ estado: "aprobado", pagoProveedorId: pp.d1 });
    expect(await saldo(d, factura.D1)).toBe("0.00");

    const despues = await escribir(() =>
      pagoPorConfirmar(base, orgDe(d), "1.00", d.p.maestro.usuarioId).then(
        () => null,
        (e: unknown) => sqlstateDe(e),
      ),
    );
    expect(despues).toBe("23514");
  });

  /* ------------------------- requiere revisión (R21) ------------------------ */

  it("R21: un intento `anulado`, otro monto (29 999) u otra moneda → `requiere_revision`, sin filas en el libro y el intento igual", async () => {
    const b = empresa(B);
    // Monto y moneda distintos sobre el vivo de B2.
    const vivo = await leerIntento(base, intento.b2);
    const antes = await escrituras(b);
    expect(await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.b2, idExterno: ext.b2, monto: "29999.00" }))).toBe("requiere_revision");
    expect(
      await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.b2, idExterno: ext.b2, monto: "30000.00", moneda: OTRA_MONEDA })),
    ).toBe("requiere_revision");
    expect(await escrituras(b)).toEqual(antes);
    expect(await leerIntento(base, intento.b2)).toEqual(vivo);

    // El intento anulado: un pago por fuera de 1 000 a B2 cambia el saldo y lo anula (§3.4).
    await escribir(() => registrarPorFuera(base, orgDe(b), "1000.00", [{ facturaId: factura.B2.id, monto: "1000.00" }], b.p.maestro.usuarioId));
    const anulado = await leerIntento(base, intento.b2);
    expect(anulado).toMatchObject({ estado: "anulado", motivoAnulacion: "saldo_cambiado" });
    const antesAnulado = await escrituras(b);
    expect(await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.b2, idExterno: ext.b2, monto: "30000.00" }))).toBe("requiere_revision");
    expect(await escrituras(b)).toEqual(antesAnulado);
    expect(await leerIntento(base, intento.b2)).toEqual(anulado);
    expect((await rastroDelPago(b, pp.b2)).movimientos).toEqual([]);
  });

  /* ------------------------ `creado` y aprobado (R14) ----------------------- */

  it("R14, R25: un intento aún `creado` con su id externo, aprobado por el proveedor → `aprobado`, con dos filas nuevas: `creado→pendiente` y `pendiente→aprobado`", async () => {
    const b = empresa(B);
    intento.b3 = await escribir(() => crearIntento(base, orgDe(b), factura.B3.id, b.p.maestro.usuarioId));
    ext.b3 = `ext-b3-${randomUUID()}`;
    // Sembrado a mano como DUEÑO (design §3.9): §3.2 guarda el id externo y pasa a `pendiente` a la vez, así que un
    // `creado` con id externo solo existe si alguien lo pone sin pasar por ella. El trigger lo admite (de vacío a un
    // valor, una vez).
    await escribir(() => base.$executeRawUnsafe(`UPDATE "cobro_intento" SET "id_externo" = $2 WHERE "id" = $1`, intento.b3, ext.b3));
    expect(await leerIntento(base, intento.b3)).toMatchObject({ estado: "creado", idExterno: ext.b3 });

    expect(await escribir(() => registrarPagoAprobado(base, { pagoProveedorId: pp.b3, idExterno: ext.b3, monto: "30000.00" }))).toBe("ok");
    expect(await leerIntento(base, intento.b3)).toMatchObject({ estado: "aprobado", pagoProveedorId: pp.b3 });
    expect((await historialDeIntento(base, intento.b3)).map((f) => [f.valorAnterior, f.valorNuevo, f.actorUsuarioId])).toEqual([
      [null, "creado", b.p.maestro.usuarioId],
      ["creado", "pendiente", null],
      ["pendiente", "aprobado", null],
    ]);
    expect((await rastroDelPago(b, pp.b3)).movimientos).toHaveLength(1);
  });

  /* ------------------------------ devolución (R23) -------------------------- */

  it("R23: `avanzar` a `devuelto` sobre el aprobado de A → `devuelto`, con la caja en 20 000 y la deuda en 0, sin filas en el libro", async () => {
    const antes = await escrituras(empresa(A));
    expect(await escribir(() => avanzarIntento(base, ext.a1, "devuelto"))).toBe("ok");
    expect(await leerIntento(base, intento.a1)).toMatchObject({ estado: "devuelto", pagoProveedorId: pp.a1, pagoId: pp.a1Mov });
    expect((await caja(empresa(A))).enCaja).toBe("20000.00");
    expect(await deuda(empresa(A))).toBe("0.00");
    expect(await escrituras(empresa(A))).toEqual({ ...antes, historial: antes.historial + 1 });
    expect((await historialDeIntento(base, intento.a1)).at(-1)).toMatchObject({ valorAnterior: "aprobado", valorNuevo: "devuelto", actorUsuarioId: null });
  });

  it("R23: `contracargo` sobre un aprobado → `contracargo`, sin filas en el libro", async () => {
    const antes = await escrituras(empresa(B));
    expect(await escribir(() => avanzarIntento(base, ext.b1, "contracargo"))).toBe("ok");
    expect(await leerIntento(base, intento.b1)).toMatchObject({ estado: "contracargo" });
    expect(await escrituras(empresa(B))).toEqual({ ...antes, historial: antes.historial + 1 });
  });

  /* ------------------------ rechazo y expiración (R24, R15) ----------------- */

  it("R24: `rechazado` y `expirado` sobre un vivo → el intento cierra, sin filas en el libro ni cambio en la caja", async () => {
    const b = empresa(B);
    const antes = await escrituras(b);
    const cajaAntes = await caja(b);
    expect(await escribir(() => avanzarIntento(base, ext.b4, "rechazado"))).toBe("ok");
    expect(await escribir(() => avanzarIntento(base, ext.b5, "expirado"))).toBe("ok");
    expect((await leerIntento(base, intento.b4)).estado).toBe("rechazado");
    expect((await leerIntento(base, intento.b5)).estado).toBe("expirado");
    expect(await escrituras(b)).toEqual({ ...antes, historial: antes.historial + 2 });
    expect(await caja(b)).toEqual(cajaAntes);
    expect(await saldo(b, factura.B4)).toBe("30000.00");
  });

  it("R15: `pendiente` sobre un aprobado → `sin_cambio`; `devuelto` sobre un rechazado → `no_alcanzable`; ninguno cambia el intento ni escribe", async () => {
    const b = empresa(B);
    const antes = await escrituras(b);
    const b3 = await leerIntento(base, intento.b3);
    const b4 = await leerIntento(base, intento.b4);
    expect(await escribir(() => avanzarIntento(base, ext.b3, "pendiente"))).toBe("sin_cambio");
    expect(await escribir(() => avanzarIntento(base, ext.b4, "devuelto"))).toBe("no_alcanzable");
    expect(await escribir(() => avanzarIntento(base, ext.b4, "rechazado"))).toBe("sin_cambio");
    expect(await leerIntento(base, intento.b3)).toEqual(b3);
    expect(await leerIntento(base, intento.b4)).toEqual(b4);
    expect(await escrituras(b)).toEqual(antes);
  });
});
