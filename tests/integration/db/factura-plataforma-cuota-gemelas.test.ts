import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { costoDelPeriodoEnCurso, costoDelTramo, montoDelPeriodo } from "@/lib/planes/cobro";
import { diasDelPeriodo, diasDelTramo, periodoEnCurso } from "@/lib/planes/ciclo";
import type { DescuentoPeriodo, PrecioPlan, TipoCobro } from "@/lib/types/planes";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { cero } from "./_fixtures/periodo-calendario";
import { crearPlan, revertida } from "./_fixtures/planes";

// SLT-118 · T6.3 (design §2.1, §2.4; R10, R29) — la cuota que calcula la base (la que entra a la deuda) es
// la misma que muestran «Mi plan» y el detalle de empresa (`lib/planes/cobro.ts`). La misma tabla pasa por
// las dos: si una se separa, este archivo se pone rojo.
//
//   · R10, período completo: `plan_costo_del_periodo` contra `montoDelPeriodo` (SLT-86 R9, R10);
//   · R10, tramo: `plan_costo_del_tramo` y `plan_dias_de_calendario` contra `costoDelTramo` y los días de
//     `lib/planes/ciclo.ts`;
//   · R29, de punta a punta: la primera cuota que devuelve `factura_plataforma_cuota(…, true)` con un plan
//     real y su precio del historial contra `costoDelPeriodoEnCurso` con la entrada en el inicio del tramo.
//
// Los importes de SQL se comparan como `numeric(12,2)` en texto: el tipo de las columnas de la factura donde
// se guardan (`cuota`, `primera_cuota`). Todo en una transacción que se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

type PrecioConMonto = Extract<PrecioPlan, { tipo: "monto" }>;

const sinDescuento = (mensual: string): PrecioConMonto => ({ tipo: "monto", mensual, descuentos: {} });
const con = (mensual: string, tipo: TipoCobro, d: DescuentoPeriodo): PrecioConMonto => ({
  tipo: "monto",
  mensual,
  descuentos: { [tipo]: d },
});

interface CasoPeriodo {
  caso: string;
  precio: PrecioConMonto;
  tipo: TipoCobro;
  esperado: string;
}

/** SLT-86 R9, R10: los cuatro tipos, sin descuento, en porcentaje, en monto, monto mayor que el costo y 100.01. */
const CASOS_PERIODO: CasoPeriodo[] = [
  { caso: "quincenal sin descuento", precio: sinDescuento("50000.00"), tipo: "quincenal", esperado: "25000.00" },
  { caso: "mensual sin descuento", precio: sinDescuento("50000.00"), tipo: "mensual", esperado: "50000.00" },
  { caso: "bimestral sin descuento", precio: sinDescuento("50000.00"), tipo: "bimestral", esperado: "100000.00" },
  { caso: "anual sin descuento", precio: sinDescuento("50000.00"), tipo: "anual", esperado: "600000.00" },
  { caso: "100.01 quincenal: la mitad hacia arriba", precio: sinDescuento("100.01"), tipo: "quincenal", esperado: "50.01" },
  { caso: "0.01 quincenal", precio: sinDescuento("0.01"), tipo: "quincenal", esperado: "0.01" },
  { caso: "100.03 quincenal", precio: sinDescuento("100.03"), tipo: "quincenal", esperado: "50.02" },
  {
    caso: "mensual 31 000 con 10 % mensual (R8)",
    precio: con("31000.00", "mensual", { tipo: "porcentaje", porcentaje: "10" }),
    tipo: "mensual",
    esperado: "27900.00",
  },
  {
    caso: "anual con 15 %",
    precio: con("50000.00", "anual", { tipo: "porcentaje", porcentaje: "15" }),
    tipo: "anual",
    esperado: "510000.00",
  },
  {
    caso: "porcentaje con decimales sobre 100.01 quincenal (un solo redondeo)",
    precio: con("100.01", "quincenal", { tipo: "porcentaje", porcentaje: "12.5" }),
    tipo: "quincenal",
    esperado: "43.75",
  },
  {
    caso: "bimestral con monto de 5 000",
    precio: con("50000.00", "bimestral", { tipo: "monto", monto: "5000" }),
    tipo: "bimestral",
    esperado: "95000.00",
  },
  {
    caso: "monto mayor que el costo: nunca bajo 0",
    precio: con("50000.00", "quincenal", { tipo: "monto", monto: "30000" }),
    tipo: "quincenal",
    esperado: "0.00",
  },
  {
    caso: "un descuento de otro tipo no toca este",
    precio: con("50000.00", "anual", { tipo: "porcentaje", porcentaje: "15" }),
    tipo: "mensual",
    esperado: "50000.00",
  },
];

interface CasoTramo {
  caso: string;
  tipo: TipoCobro;
  mensual: string;
  /** Primer día del tramo (`AAAA-MM-DD`): la entrada del plan. */
  entrada: string;
  cuota: string;
  diasTramo: number;
  diasPeriodo: number;
  /** Fin del período de calendario que contiene la entrada (`AAAA-MM-DD`). */
  fin: string;
}

/** R10, R29: los tramos de SLT-86 R12 (la primera cuota de un plan). */
const CASOS_TRAMO: CasoTramo[] = [
  { caso: "quincenal 15 500 desde el 10 (R29: 6 de 15 días)", tipo: "quincenal", mensual: "31000.00", entrada: "2026-11-10", cuota: "6200.00", diasTramo: 6, diasPeriodo: 15, fin: "2026-11-16" },
  { caso: "quincena de 13 días (febrero de 2027)", tipo: "quincenal", mensual: "31000.00", entrada: "2027-02-20", cuota: "10730.77", diasTramo: 9, diasPeriodo: 13, fin: "2027-03-01" },
  { caso: "quincena de 16 días (diciembre)", tipo: "quincenal", mensual: "31000.00", entrada: "2026-12-20", cuota: "11625.00", diasTramo: 12, diasPeriodo: 16, fin: "2027-01-01" },
  { caso: "mes de 31 días", tipo: "mensual", mensual: "31000.00", entrada: "2026-12-10", cuota: "22000.00", diasTramo: 22, diasPeriodo: 31, fin: "2027-01-01" },
  { caso: "febrero de año normal", tipo: "mensual", mensual: "31000.00", entrada: "2027-02-15", cuota: "15500.00", diasTramo: 14, diasPeriodo: 28, fin: "2027-03-01" },
  { caso: "febrero bisiesto", tipo: "mensual", mensual: "31000.00", entrada: "2028-02-15", cuota: "16034.48", diasTramo: 15, diasPeriodo: 29, fin: "2028-03-01" },
  { caso: "año de 365 días: anual desde el 18 de noviembre (R29: 44 de 365)", tipo: "anual", mensual: "31000.00", entrada: "2026-11-18", cuota: "44843.84", diasTramo: 44, diasPeriodo: 365, fin: "2027-01-01" },
  { caso: "año de 366 días", tipo: "anual", mensual: "31000.00", entrada: "2028-11-18", cuota: "44721.31", diasTramo: 44, diasPeriodo: 366, fin: "2029-01-01" },
  { caso: "bimestral bisiesto (10 de 60 días)", tipo: "bimestral", mensual: "31000.00", entrada: "2028-02-20", cuota: "10333.33", diasTramo: 10, diasPeriodo: 60, fin: "2028-03-01" },
  { caso: "un tramo de 1 día", tipo: "mensual", mensual: "31000.00", entrada: "2026-11-30", cuota: "1033.33", diasTramo: 1, diasPeriodo: 30, fin: "2026-12-01" },
  { caso: "redondeo con la mitad exacta (0.01 × 8 ÷ 16 = 0.005)", tipo: "quincenal", mensual: "0.02", entrada: "2026-12-24", cuota: "0.01", diasTramo: 8, diasPeriodo: 16, fin: "2027-01-01" },
  { caso: "quincenal desde el 5 (R28: 11 de 15)", tipo: "quincenal", mensual: "31000.00", entrada: "2026-11-05", cuota: "11366.67", diasTramo: 11, diasPeriodo: 15, fin: "2026-11-16" },
  { caso: "quincenal desde el 18 (R28: 13 de 15)", tipo: "quincenal", mensual: "31000.00", entrada: "2026-11-18", cuota: "13433.33", diasTramo: 13, diasPeriodo: 15, fin: "2026-12-01" },
  { caso: "mensual desde el 18 (R29: 13 de 30)", tipo: "mensual", mensual: "31000.00", entrada: "2026-11-18", cuota: "13433.33", diasTramo: 13, diasPeriodo: 30, fin: "2026-12-01" },
  { caso: "entrada en el inicio del período: completa (R8, P4)", tipo: "quincenal", mensual: "31000.00", entrada: "2026-11-01", cuota: "15500.00", diasTramo: 15, diasPeriodo: 15, fin: "2026-11-16" },
];

/** El costo del período de la base, como lo guarda la factura. */
async function costoDelPeriodoSql(tx: TxDeTest, precio: CasoPeriodo["precio"], tipo: TipoCobro): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ c: string }[]>(
    `SELECT plan_costo_del_periodo($1::numeric, $2::jsonb, $3)::numeric(12,2)::text AS c`,
    precio.mensual,
    JSON.stringify(precio.descuentos),
    tipo,
  );
  return f.c;
}

interface TramoSql {
  costo: string;
  dias_tramo: number;
  dias_periodo: number;
}

async function tramoSql(tx: TxDeTest, c: CasoTramo): Promise<TramoSql> {
  const [f] = await tx.$queryRawUnsafe<TramoSql[]>(
    `SELECT plan_costo_del_tramo(plan_costo_del_periodo($1::numeric, '{}'::jsonb, $2), d.tramo, d.periodo)::numeric(12,2)::text AS costo,
            d.tramo AS dias_tramo, d.periodo AS dias_periodo
       FROM (SELECT plan_dias_de_calendario($3::timestamp, plan_fin_periodo_calendario($2, $3::timestamp)) AS tramo,
                    plan_dias_de_calendario(plan_inicio_periodo_calendario($2, $3::timestamp),
                                            plan_fin_periodo_calendario($2, $3::timestamp)) AS periodo) d`,
    c.mensual,
    c.tipo,
    cero(c.entrada),
  );
  return f;
}

interface CuotaSql {
  cuota: string;
  precio_mensual: string;
  tipo_cobro: string;
  desde: string;
  hasta: string;
  dias_cobrados: number;
  dias_periodo: number;
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** La primera cuota de la base, de punta a punta: un plan con su precio en el historial y una empresa. */
async function primeraCuotaSql(tx: TxDeTest, c: CasoTramo): Promise<CuotaSql | undefined> {
  const { id: empresa } = await crearOrganizacion(tx);
  const plan = await crearPlan(tx);
  await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = $2::numeric WHERE "plan_id" = $1`, plan, c.mensual);
  const [f] = await tx.$queryRawUnsafe<CuotaSql[]>(
    `SELECT q.cuota::numeric(12,2)::text AS cuota, q.precio_mensual::numeric(12,2)::text AS precio_mensual, q.tipo_cobro,
            to_char(q.desde_at, ${ISO}) AS desde, to_char(q.hasta_at, ${ISO}) AS hasta, q.dias_cobrados, q.dias_periodo
       FROM factura_plataforma_cuota($1, $2::timestamp, $3, $4, true) q`,
    empresa,
    cero(c.entrada),
    plan,
    c.tipo,
  );
  return f;
}

describeSiHayBase("SLT-118 — la cuota de la base es la de «Mi plan» (R10, R29)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R10: el costo de un período completo de la base es igual a montoDelPeriodo en toda la tabla de SLT-86", async () => {
    const r = await revertida(base, async (tx) => {
      const filas: [string, string][] = [];
      for (const c of CASOS_PERIODO) filas.push([c.caso, await costoDelPeriodoSql(tx, c.precio, c.tipo)]);
      return filas;
    });
    expect(r).toEqual(CASOS_PERIODO.map((c) => [c.caso, c.esperado]));
    // La gemela TS da lo mismo: si las dos se separan, cae una de las dos aserciones.
    expect(CASOS_PERIODO.map((c) => [c.caso, montoDelPeriodo(c.precio, c.tipo)])).toEqual(
      CASOS_PERIODO.map((c) => [c.caso, c.esperado]),
    );
  });

  it("R10: sin precio, la base no tiene costo del período (NULL), como montoDelPeriodo", async () => {
    const r = await revertida(base, (tx) =>
      tx.$queryRawUnsafe<{ c: string | null }[]>(`SELECT plan_costo_del_periodo(NULL, '{}'::jsonb, 'mensual')::text AS c`),
    );
    expect(r[0].c).toBeNull();
    expect(montoDelPeriodo({ tipo: "sin_precio" }, "mensual")).toBeNull();
  });

  it("R10: el costo de un tramo y sus días de la base son los de costoDelTramo y lib/planes/ciclo.ts", async () => {
    const r = await revertida(base, async (tx) => {
      const filas: [string, TramoSql][] = [];
      for (const c of CASOS_TRAMO) filas.push([c.caso, await tramoSql(tx, c)]);
      return filas;
    });
    expect(r).toEqual(CASOS_TRAMO.map((c) => [c.caso, { costo: c.cuota, dias_tramo: c.diasTramo, dias_periodo: c.diasPeriodo }]));
    const ts = CASOS_TRAMO.map((c) => {
      const entrada = new Date(cero(c.entrada));
      const periodo = periodoEnCurso(entrada, c.tipo, entrada);
      const costo = montoDelPeriodo(sinDescuento(c.mensual), c.tipo) as string;
      return [c.caso, { costo: costoDelTramo(costo, diasDelTramo(periodo), diasDelPeriodo(c.tipo, entrada)), dias_tramo: diasDelTramo(periodo), dias_periodo: diasDelPeriodo(c.tipo, entrada) }];
    });
    expect(ts).toEqual(r);
  });

  it("R10: el redondeo del tramo es el mismo en los bordes (dos redondeos, la mitad hacia arriba)", async () => {
    const bordes: [string, number, number][] = [
      ["0.01", 8, 16],
      ["0.05", 1, 2],
      ["15500.00", 1, 15],
      ["100.00", 1, 8],
      ["372000.00", 44, 365],
      ["0.00", 3, 15],
    ];
    const r = await revertida(base, async (tx) => {
      const salida: string[] = [];
      for (const [costo, dias, periodo] of bordes) {
        const [f] = await tx.$queryRawUnsafe<{ c: string }[]>(
          `SELECT plan_costo_del_tramo($1::numeric, $2::int, $3::int)::numeric(12,2)::text AS c`,
          costo,
          dias,
          periodo,
        );
        salida.push(f.c);
      }
      return salida;
    });
    expect(r).toEqual(bordes.map(([costo, dias, periodo]) => costoDelTramo(costo, dias, periodo)));
    expect(r).toEqual(["0.01", "0.03", "1033.33", "12.50", "44843.84", "0.00"]);
  });

  it("R29: la primera cuota que guarda la base es la de costoDelPeriodoEnCurso con la entrada en el inicio del tramo", async () => {
    const r = await revertida(base, async (tx) => {
      const filas: [string, CuotaSql | undefined][] = [];
      for (const c of CASOS_TRAMO) filas.push([c.caso, await primeraCuotaSql(tx, c)]);
      return filas;
    });
    expect(r).toEqual(
      CASOS_TRAMO.map((c) => [
        c.caso,
        {
          cuota: c.cuota,
          precio_mensual: c.mensual,
          tipo_cobro: c.tipo,
          desde: cero(c.entrada),
          hasta: cero(c.fin),
          dias_cobrados: c.diasTramo,
          dias_periodo: c.diasPeriodo,
        },
      ]),
    );
    const ts = CASOS_TRAMO.map((c) => {
      const entrada = new Date(cero(c.entrada));
      return [c.caso, costoDelPeriodoEnCurso(sinDescuento(c.mensual), c.tipo, entrada, entrada)];
    });
    expect(ts).toEqual(r.map(([caso, f]) => [caso, f?.cuota]));
  });

  it("R29: sin el permiso de primera cuota, un tramo que no empieza en el período no tiene cuota (R8)", async () => {
    const r = await revertida(base, async (tx) => {
      const { id: empresa } = await crearOrganizacion(tx);
      const plan = await crearPlan(tx);
      await tx.$executeRawUnsafe(`UPDATE "plan_precio_historial" SET "precio_mensual" = 31000 WHERE "plan_id" = $1`, plan);
      const contar = async (desde: string, primera: boolean) => {
        const [f] = await tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM factura_plataforma_cuota($1, $2::timestamp, $3, 'quincenal', $4)`,
          empresa,
          cero(desde),
          plan,
          primera,
        );
        return f.n;
      };
      return {
        aMitad: await contar("2026-11-10", false),
        aMitadPrimera: await contar("2026-11-10", true),
        enInicio: await contar("2026-11-16", false),
      };
    });
    expect(r).toEqual({ aMitad: 0, aMitadPrimera: 1, enInicio: 1 });
  });
});
