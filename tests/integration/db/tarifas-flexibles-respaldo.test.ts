import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  resolverCobrosCon,
  resolverCobrosYFilasViejasCon,
  resolverPagosCon,
} from "@/lib/repositories/_shared/resolver-tarifas";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import type { ContextoPagoGestion } from "@/lib/types/tarifa-flexible";
import { clavePar, type ParTarifa } from "@/lib/utils/cascada-tarifa";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SLT-52 T3.5 (design §5, R36, R37), SLT-54 T1.3 (R1, R2) — EL INTERRUPTOR POR EMPRESA, CONTRA POSTGRES
// REAL. Lo decide la activacion, no que existan valores.
//
// Tres empresas en la misma base, las tres con filas del modelo viejo (`tarifas` y
// `tarifa_zona_mensajero`):
// - A, sin activar y sin ningun valor en `tarifa_valor` → el resolver devuelve `modelo: "viejo"` con
//   los mismos datos que antes de la ficha, centavo a centavo (R36). Los esperados son LITERALES: los
//   importes sembrados, escritos a mano, no lo que devuelva otra funcion del modelo viejo.
// - C, sin activar, con los MISMOS importes viejos que A y con valores nuevos en todos los niveles
//   (R1): el borrador del maestro. Da exactamente los mismos literales que A y no lee `tarifa_valor`.
// - B, activada y con UN solo valor nuevo → `modelo: "nuevo"`, sin leer `tarifas` ni
//   `tarifa_zona_mensajero` (se mira el SQL que de verdad salio, no un doble) y todo concepto no puesto
//   es «sin tarifa» (R37). Que B este activada no puede pasar a A al modelo nuevo: el interruptor es
//   por empresa y lo acota la RLS (R15).
//
// Todo en una transaccion que siempre se revierte; el resolver corre con `servi_app` y la empresa
// fijada. Cada caso afirma primero lo que sembro.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let eventos: EventoSqlDeTest[];

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  const espia = crearPrismaDeTestConEspia();
  base = espia.prisma;
  eventos = espia.eventos;
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

interface Escenario {
  A: string;
  B: string;
  TA: string;
  ZA: string;
  MA: string;
  TB: string;
  ZB: string;
  MB: string;
  V1: string;
  tarifaTiendaA: string;
  tarifaZonaA: string;
  valorB: string;
  C: string;
  TC: string;
  ZC: string;
  MC: string;
  tarifaTiendaC: string;
  tarifaZonaC: string;
}

/** Fila vieja de `tarifas`, con los importes de la tabla de T0.1 (respaldo-identico). */
async function sembrarTarifaVieja(
  tx: TxDeTest,
  d: { tiendaId: string | null; zonaId: string | null; valorFlete: string; fulfillment: string | null },
): Promise<string> {
  const fila = await tx.tarifa.create({
    data: {
      tiendaId: d.tiendaId,
      zonaId: d.zonaId,
      valorFlete: d.valorFlete,
      valorFleteGam: "2300.15",
      valorFleteDevuelto: "1650.35",
      valorFleteDevueltoGam: "1380.45",
      fulfillment: d.fulfillment,
      comisionCod: "3.50",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
      tarifaEspecial: "3995.50",
      tarifaEspecialDevuelta: null,
    },
    select: { id: true },
  });
  return fila.id;
}

async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().slice(0, 8);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;
  const V1 = (await tx.vehiculo.create({ data: { name: `slt52-resp-${sufijo}` }, select: { id: true } })).id;

  // ---- A: solo modelo viejo ---------------------------------------------------------------
  await fijarEmpresa(tx, A);
  const fa = await crearFksDeOrden(tx);
  const MA = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const tarifaTiendaA = await sembrarTarifaVieja(tx, {
    tiendaId: fa.tiendaId,
    zonaId: fa.zonaId,
    valorFlete: "2750.55",
    fulfillment: "450.25",
  });
  const tarifaZonaA = await sembrarTarifaVieja(tx, {
    tiendaId: null,
    zonaId: fa.zonaId,
    valorFlete: "1999.99",
    fulfillment: null,
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: fa.zonaId, vehiculoId: null, cobroEntregado: "1250.50", cobroRechazado: "640.25" },
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: fa.zonaId, vehiculoId: V1, cobroEntregado: "1300.00", cobroRechazado: "700.00" },
  });

  // ---- C: los mismos importes viejos que A + valores nuevos SIN activar (R1) ------------------
  const C = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, C);
  const fc = await crearFksDeOrden(tx);
  const MC = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const tarifaTiendaC = await sembrarTarifaVieja(tx, {
    tiendaId: fc.tiendaId,
    zonaId: fc.zonaId,
    valorFlete: "2750.55",
    fulfillment: "450.25",
  });
  const tarifaZonaC = await sembrarTarifaVieja(tx, {
    tiendaId: null,
    zonaId: fc.zonaId,
    valorFlete: "1999.99",
    fulfillment: null,
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: fc.zonaId, vehiculoId: null, cobroEntregado: "1250.50", cobroRechazado: "640.25" },
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: fc.zonaId, vehiculoId: V1, cobroEntregado: "1300.00", cobroRechazado: "700.00" },
  });
  // El borrador: importes que nadie puede confundir, en cada nivel donde el cobro y el pago los verian.
  await tx.tarifaValor.createMany({
    data: [
      { concepto: "tienda_flete_entregado", modo: "monto", valor: "11.11", ivaPct: "1.00", zonaId: fc.zonaId },
      { concepto: "tienda_flete_entregado", modo: "monto", valor: "22.22", ivaPct: "2.00", tiendaId: fc.tiendaId, zonaId: fc.zonaId },
      { concepto: "tienda_flete_rechazo", modo: "monto", valor: "33.33", ivaPct: "3.00", zonaId: fc.zonaId },
      // SLT-94 (R12): el fulfillment solo se puede guardar como precio propio de la tienda.
      { concepto: "tienda_fulfillment", modo: "monto", valor: "44.44", ivaPct: "4.00", tiendaId: fc.tiendaId },
      { concepto: "tienda_comision_cod", modo: "porcentaje", valor: "55.55", ivaPct: "5.00", zonaId: fc.zonaId },
      { concepto: "mensajero_entregado", modo: "monto", valor: "66.66", zonaId: fc.zonaId },
      { concepto: "mensajero_entregado", modo: "monto", valor: "77.77", zonaId: fc.zonaId, vehiculoId: V1 },
      { concepto: "mensajero_entregado", modo: "monto", valor: "88.88", mensajeroId: MC },
      { concepto: "satelite_entregado", modo: "monto", valor: "99.99", zonaId: fc.zonaId },
    ],
  });

  // ---- B: modelo viejo completo + activada + UN valor nuevo -------------------------------
  await fijarEmpresa(tx, B);
  const fb = await crearFksDeOrden(tx);
  await sembrarActivacion(tx, B);
  const MB = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  await sembrarTarifaVieja(tx, { tiendaId: fb.tiendaId, zonaId: fb.zonaId, valorFlete: "7777.77", fulfillment: "999.99" });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: fb.zonaId, vehiculoId: null, cobroEntregado: "8888.88", cobroRechazado: "6666.66" },
  });
  const valorB = (
    await tx.tarifaValor.create({
      data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct: "13.00", zonaId: fb.zonaId },
      select: { id: true },
    })
  ).id;

  await fijarEmpresa(tx, A);
  return {
    A,
    B,
    TA: fa.tiendaId,
    ZA: fa.zonaId,
    MA,
    TB: fb.tiendaId,
    ZB: fb.zonaId,
    MB,
    V1,
    tarifaTiendaA,
    tarifaZonaA,
    valorB,
    C,
    TC: fc.tiendaId,
    ZC: fc.zonaId,
    MC,
    tarifaTiendaC,
    tarifaZonaC,
  };
}

async function afirmarSiembra(tx: TxDeTest, e: Escenario) {
  expect(await tx.tarifa.count({ where: { organizacionId: e.A } })).toBe(2);
  expect(await tx.tarifaZonaMensajero.count({ where: { organizacionId: e.A } })).toBe(2);
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.A } })).toBe(0);
  expect(await tx.tarifa.count({ where: { organizacionId: e.B } })).toBe(1);
  expect(await tx.tarifaZonaMensajero.count({ where: { organizacionId: e.B } })).toBe(1);
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.B } })).toBe(1);
  expect(await tx.tarifa.count({ where: { organizacionId: e.C } })).toBe(2);
  expect(await tx.tarifaZonaMensajero.count({ where: { organizacionId: e.C } })).toBe(2);
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.C } })).toBe(9);
  // Solo B tiene activacion: es lo unico que distingue a C de una empresa activada.
  expect(await tx.tarifaActivacion.count({ where: { organizacionId: { in: [e.A, e.C] } } })).toBe(0);
  expect(await tx.tarifaActivacion.count({ where: { organizacionId: e.B } })).toBe(1);
}

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

function conEscenario(fn: (tx: TxDeTest, e: Escenario) => Promise<void>) {
  return enTransaccionRevertida(base, async (tx) => {
    const e = await sembrar(tx);
    await afirmarSiembra(tx, e);
    await fn(tx, e);
  });
}

/** El SQL que salio durante `fn`. */
async function sqlDe<T>(fn: () => Promise<T>): Promise<{ salida: T; sql: string[] }> {
  const antes = eventos.length;
  const salida = await fn();
  return { salida, sql: eventos.slice(antes).map((ev) => ev.query) };
}

const TABLAS_VIEJAS = /"tarifas"|"tarifa_zona_mensajero"/;
const TABLA_NUEVA = /"tarifa_valor"/;

function ctx(e: { M: string; Z: string; T: string }, o: Partial<ContextoPagoGestion> = {}): ContextoPagoGestion {
  return {
    gestionId: "g-1",
    resultado: "entregado",
    mensajeroId: e.M,
    zonaId: e.Z,
    vehiculoId: null,
    distritoId: null,
    tiendaId: e.T,
    zonaOrdenId: e.Z,
    montoCobrar: "14900.00",
    cobraComision: true,
    ...o,
  };
}

/** Los importes de la tarifa de tienda que sembraron A y C, escritos a mano. */
function tarifaDeTiendaEsperada(tarifaId: string) {
  return {
    modelo: "viejo",
    tarifa: {
      tarifaId,
      fulfillment: "450.25",
      valorFlete: "2750.55",
      valorFleteGam: "2300.15",
      valorFleteDevuelto: "1650.35",
      valorFleteDevueltoGam: "1380.45",
      comisionCod: "3.50",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
      tarifaEspecial: "3995.50",
      tarifaEspecialDevuelta: null,
    },
  };
}

describeSiHayBase("SLT-54 R1 · empresa sin activar con valores nuevos calcula con el viejo", () => {
  it("cobro: los mismos literales que A, por el resolver y por la fachada del cierre, sin leer `tarifa_valor`", async () => {
    await conEscenario(async (tx, e) => {
      const parC: ParTarifa = { tiendaId: e.TC, zonaId: e.ZC, distritoId: null };
      const { salida, sql } = await sqlDe(() =>
        comoEmpresa(tx, e.C, async () => ({
          resolver: await resolverCobrosCon(tx, [parC]),
          fachada: await new TarifaVigenteRepository(tx as unknown as PrismaClient).resolveTarifas(
            [parC],
            tx as unknown as PrismaClient,
          ),
          aOtraTienda: await resolverCobrosCon(tx, [{ tiendaId: randomUUID(), zonaId: e.ZC, distritoId: null }]),
        })),
      );
      expect(salida.resolver.get(clavePar(parC))).toEqual(tarifaDeTiendaEsperada(e.tarifaTiendaC));
      expect(salida.fachada.get(clavePar(parC))).toEqual(tarifaDeTiendaEsperada(e.tarifaTiendaC));
      const otra = [...salida.aOtraTienda.values()][0];
      if (otra?.modelo !== "viejo") throw new Error("se esperaba el modelo viejo");
      expect(otra.tarifa.tarifaId).toBe(e.tarifaZonaC);
      expect(otra.tarifa.valorFlete).toBe("1999.99");
      expect(otra.tarifa.fulfillment).toBe("0.00");
      // El espia vio consultas y ninguna toco la tabla del borrador.
      expect(sql.some((q) => TABLAS_VIEJAS.test(q))).toBe(true);
      expect(sql.filter((q) => TABLA_NUEVA.test(q))).toEqual([]);
    });
  });

  it("listado: la fila vieja que se enseña y su importe son los de hoy", async () => {
    await conEscenario(async (tx, e) => {
      const par: ParTarifa = { tiendaId: e.TC, zonaId: e.ZC, distritoId: null };
      const { cobros, filasViejas } = await comoEmpresa(tx, e.C, () =>
        resolverCobrosYFilasViejasCon(tx, [par], { isDefault: true }),
      );
      expect(cobros.get(clavePar(par))).toEqual(tarifaDeTiendaEsperada(e.tarifaTiendaC));
      expect(filasViejas.get(clavePar(par))?.id).toBe(e.tarifaTiendaC);
    });
  });

  it("pago: los mismos literales que A, con y sin vehiculo, por el resolver y por la fachada, sin leer `tarifa_valor`", async () => {
    await conEscenario(async (tx, e) => {
      const base = { M: e.MC, Z: e.ZC, T: e.TC };
      const pedidos = [
        ctx(base, { gestionId: "con-vehiculo", vehiculoId: e.V1 }),
        ctx(base, { gestionId: "sin-vehiculo", vehiculoId: null }),
        ctx(base, { gestionId: "rechazo", vehiculoId: null, resultado: "devolucion_a_origen_por_rechazo" }),
      ];
      const { salida, sql } = await sqlDe(() =>
        comoEmpresa(tx, e.C, async () => ({
          resolver: await resolverPagosCon(tx, pedidos),
          fachada: await new TarifaZonaMensajeroRepository(tx as unknown as PrismaClient).resolvePagos(pedidos),
        })),
      );
      const conVehiculo = { modelo: "viejo", tarifa: { cobroEntregado: "1300.00", cobroRechazado: "700.00" } };
      const sinVehiculo = { modelo: "viejo", tarifa: { cobroEntregado: "1250.50", cobroRechazado: "640.25" } };
      for (const r of [salida.resolver, salida.fachada]) {
        expect(r.get("con-vehiculo")).toEqual(conVehiculo);
        expect(r.get("sin-vehiculo")).toEqual(sinVehiculo);
        expect(r.get("rechazo")).toEqual(sinVehiculo);
      }
      expect(sql.filter((q) => TABLA_NUEVA.test(q))).toEqual([]);
    });
  });

  it("un par que el modelo viejo no cubre sigue en null: los valores nuevos no rellenan el hueco", async () => {
    await conEscenario(async (tx, e) => {
      await fijarEmpresa(tx, e.C);
      const sinViejo = (
        await tx.zona.create({
          data: { nombre: `Sin viejo ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        })
      ).id;
      await tx.tarifaValor.create({
        data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "12.34", ivaPct: "1.00", zonaId: sinViejo },
      });
      await tx.tarifaValor.create({ data: { concepto: "mensajero_entregado", modo: "monto", valor: "12.34", zonaId: sinViejo } });
      const par: ParTarifa = { tiendaId: randomUUID(), zonaId: sinViejo, distritoId: null };
      const cobro = await comoEmpresa(tx, e.C, () => resolverCobrosCon(tx, [par]));
      const pago = await comoEmpresa(tx, e.C, () =>
        resolverPagosCon(tx, [ctx({ M: e.MC, Z: sinViejo, T: par.tiendaId }, { gestionId: "g" })]),
      );
      expect(cobro.get(clavePar(par))).toBeNull();
      expect(pago.get("g")).toBeNull();
    });
  });
});

describeSiHayBase("SLT-52 respaldo · empresa SIN valores nuevos → modelo viejo, igual que hoy (R36)", () => {
  it("cobro: la tarifa de la tienda en su zona, con los importes de hoy y su `tarifaId`", async () => {
    await conEscenario(async (tx, e) => {
      const par: ParTarifa = { tiendaId: e.TA, zonaId: e.ZA, distritoId: null };
      const r = await comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [par]));
      expect(r.get(clavePar(par))).toEqual(tarifaDeTiendaEsperada(e.tarifaTiendaA));
    });
  });

  it("cobro: otra tienda en la zona cae al nivel 3 de la 274 (la de zona), con fulfillment NULL -> \"0.00\"", async () => {
    await conEscenario(async (tx, e) => {
      const par: ParTarifa = { tiendaId: randomUUID(), zonaId: e.ZA, distritoId: null };
      const r = await comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [par]));
      const t = r.get(clavePar(par));
      expect(t?.modelo).toBe("viejo");
      if (t?.modelo !== "viejo") throw new Error("modelo");
      expect(t.tarifa.tarifaId).toBe(e.tarifaZonaA);
      expect(t.tarifa.valorFlete).toBe("1999.99");
      expect(t.tarifa.fulfillment).toBe("0.00");
    });
  });

  it("cobro: un par sin ninguna fila sigue siendo `null` (sin tarifa, R2 de la 274)", async () => {
    await conEscenario(async (tx, e) => {
      const par: ParTarifa = { tiendaId: e.TA, zonaId: randomUUID(), distritoId: null };
      const r = await comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [par]));
      expect(r.has(clavePar(par))).toBe(true);
      expect(r.get(clavePar(par))).toBeNull();
    });
  });

  it("pago: con vehiculo la tarifa exacta, sin vehiculo la de la zona (39/R1-R3), importes de hoy", async () => {
    await conEscenario(async (tx, e) => {
      const base = { M: e.MA, Z: e.ZA, T: e.TA };
      const r = await comoEmpresa(tx, e.A, () =>
        resolverPagosCon(tx, [
          ctx(base, { gestionId: "con-vehiculo", vehiculoId: e.V1 }),
          ctx(base, { gestionId: "sin-vehiculo", vehiculoId: null }),
          ctx(base, { gestionId: "otra-zona", zonaId: randomUUID() }),
        ]),
      );
      expect(r.get("con-vehiculo")).toEqual({
        modelo: "viejo",
        tarifa: { cobroEntregado: "1300.00", cobroRechazado: "700.00" },
      });
      expect(r.get("sin-vehiculo")).toEqual({
        modelo: "viejo",
        tarifa: { cobroEntregado: "1250.50", cobroRechazado: "640.25" },
      });
      expect(r.get("otra-zona")).toBeNull();
    });
  });

  it("R15: que B este activada no pasa a A al modelo nuevo", async () => {
    await conEscenario(async (tx, e) => {
      const par: ParTarifa = { tiendaId: e.TA, zonaId: e.ZA, distritoId: null };
      const { salida, sql } = await sqlDe(() =>
        comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [par])),
      );
      expect(salida.get(clavePar(par))?.modelo).toBe("viejo");
      expect(sql.some((q) => TABLAS_VIEJAS.test(q))).toBe(true);
    });
  });

  it("R39: en el viejo, un lote de 1 y uno de 50 cuestan las mismas consultas (interruptor + tarifas)", async () => {
    await conEscenario(async (tx, e) => {
      const pares = Array.from({ length: 50 }, (_, i): ParTarifa => ({
        tiendaId: i === 0 ? e.TA : randomUUID(),
        zonaId: e.ZA,
        distritoId: null,
      }));
      const uno = await sqlDe(() => comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [pares[0]!])));
      const cincuenta = await sqlDe(() => comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, pares)));
      // `comoEmpresa` manda 3 sentencias propias (empresa, rol y RESET): se descuentan.
      const delResolver = (sql: string[]) => sql.filter((q) => !/set_config|RESET ROLE/.test(q)).length;
      expect(delResolver(uno.sql)).toBe(2);
      expect(delResolver(cincuenta.sql)).toBe(2);
    });
  });
});

describeSiHayBase("SLT-54 R2 · empresa activada con UN valor nuevo → todo en el nuevo, sin leer el viejo", () => {
  it("cobro: `modelo: \"nuevo\"`, solo el concepto puesto, y ni una consulta a `tarifas`", async () => {
    await conEscenario(async (tx, e) => {
      const par: ParTarifa = { tiendaId: e.TB, zonaId: e.ZB, distritoId: null };
      const { salida, sql } = await sqlDe(() =>
        comoEmpresa(tx, e.B, () => resolverCobrosCon(tx, [par])),
      );
      expect(sql.length).toBeGreaterThan(0);
      expect(sql.filter((q) => TABLAS_VIEJAS.test(q))).toEqual([]);
      // Ni el flete 7777.77 ni el fulfillment 999.99 de su fila vieja: solo el valor nuevo, y
      // los otros seis conceptos de la tienda, ausentes = sin tarifa.
      expect(salida.get(clavePar(par))).toEqual({
        modelo: "nuevo",
        valores: {
          tienda_flete_entregado: {
            concepto: "tienda_flete_entregado",
            modo: "monto",
            valor: "1500.00",
            ivaPct: "13.00",
            nivel: "zona",
            tarifaValorId: e.valorB,
          },
        },
      });
    });
  });

  it("pago: `modelo: \"nuevo\"` sin pago al mensajero ni a la satelite (no hay valor) y sin leer `tarifa_zona_mensajero`", async () => {
    await conEscenario(async (tx, e) => {
      const { salida, sql } = await sqlDe(() =>
        comoEmpresa(tx, e.B, () => resolverPagosCon(tx, [ctx({ M: e.MB, Z: e.ZB, T: e.TB })])),
      );
      expect(sql.length).toBeGreaterThan(0);
      expect(sql.filter((q) => TABLAS_VIEJAS.test(q))).toEqual([]);
      // La fila vieja de B pagaria 8888.88; en el nuevo no hay valor de pago -> `null` (= 0, R24).
      // La base del % es el flete nuevo por entregado (R28).
      expect(salida.get("g-1")).toEqual({
        modelo: "nuevo",
        mensajero: null,
        satelite: null,
        baseFlete: "1500.00",
      });
    });
  });

  it("un par de B en una zona sin valores tampoco cae al viejo: todos sus conceptos son «sin tarifa»", async () => {
    await conEscenario(async (tx, e) => {
      const par: ParTarifa = { tiendaId: e.TB, zonaId: randomUUID(), distritoId: null };
      const r = await comoEmpresa(tx, e.B, () => resolverCobrosCon(tx, [par]));
      expect(r.get(clavePar(par))).toEqual({ modelo: "nuevo", valores: {} });
    });
  });
});
