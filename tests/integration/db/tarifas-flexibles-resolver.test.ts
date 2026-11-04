import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { GestionResultado, PrismaClient, TarifaConcepto } from "@prisma/client";

import {
  gruposDeDistritos,
  resolverCobrosCon,
  resolverPagosCon,
  valoresCandidatos,
} from "@/lib/repositories/_shared/resolver-tarifas";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { CONCEPTOS_TIENDA } from "@/lib/tarifas/catalogo";
import type { ContextoPagoGestion, TarifaPago, TarifaTienda } from "@/lib/types/tarifa-flexible";
import { clavePar, type ParTarifa } from "@/lib/utils/cascada-tarifa";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SLT-52 T3.4 (design §4, §5, §9) — EL RESOLVER UNICO, CONTRA POSTGRES REAL Y CON DOS EMPRESAS.
//
// Por que aqui y no con dobles: la precedencia vive en memoria (`precedencia.ts`, con sus tests
// puros), pero el WHERE de las candidatas y el de los grupos viven en SQL, y un test de servicio
// con dobles no los ve. Cada caso siembra los CINCO niveles de cobro y de pago con importes
// distintos y senuelos en otra zona, otro grupo, otra tienda, otro vehiculo, otro mensajero y
// otra empresa; luego quita niveles y afirma que gana el siguiente.
//
// TODO DENTRO DE UNA TRANSACCION QUE SIEMPRE SE REVIERTE: ningun `tarifa_valor` sembrado aqui llega
// a verlo otro test (un valor commiteado pasaria a cualquier empresa al modelo nuevo). El resolver
// se ejecuta con el rol `servi_app` y la empresa A fijada (`comoApp`): la RLS es la que filtra por
// empresa, como en produccion. Las siembras y los borrados van como dueno.
//
// SIN DATOS FALLA: cada caso afirma primero cuantos valores sembro, y la siembra lanza si falta la
// geografia (Cartago/Cartago con al menos cinco distritos) o un catalogo. Sin base, se SALTA con
// nombre.
//
// Los esperados son LITERALES: el importe y el nivel de cada fila sembrada, escritos a mano.

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

// --------------------------------------------------------------------------------------------
// Siembra
// --------------------------------------------------------------------------------------------

interface Escenario {
  A: string;
  B: string;
  T: string;
  T2: string;
  TB: string;
  M: string;
  M2: string;
  Z: string;
  Z2: string;
  ZB: string;
  /** d1 en G1, d2 en G2, d3 en Z sin grupo, d4 en Z2 (grupo G3). */
  d1: string;
  d2: string;
  d3: string;
  d4: string;
  G1: string;
  G2: string;
  G3: string;
  V1: string;
  V2: string;
  /** id de cada valor sembrado, por etiqueta. */
  v: Record<string, string>;
}

type ValorSembrado = {
  concepto: TarifaConcepto;
  modo?: "monto" | "porcentaje";
  valor: string;
  zonaId?: string;
  grupoId?: string;
  tiendaId?: string;
  mensajeroId?: string;
  vehiculoId?: string;
};

async function sembrarValor(tx: TxDeTest, d: ValorSembrado): Promise<string> {
  const esTienda = d.concepto.startsWith("tienda_");
  const fila = await tx.tarifaValor.create({
    data: {
      concepto: d.concepto,
      modo: d.modo ?? "monto",
      valor: d.valor,
      // R45: solo los cobros a la tienda llevan IVA; el CHECK de la base lo exige.
      ivaPct: esTienda ? "13.00" : null,
      zonaId: d.zonaId ?? null,
      grupoId: d.grupoId ?? null,
      tiendaId: d.tiendaId ?? null,
      mensajeroId: d.mensajeroId ?? null,
      vehiculoId: d.vehiculoId ?? null,
    },
    select: { id: true },
  });
  return fila.id;
}

async function grupo(tx: TxDeTest, zonaId: string, nombre: string, distritos: string[]) {
  const g = await tx.grupoDistritos.create({ data: { zonaId, nombre }, select: { id: true } });
  for (const distritoId of distritos) {
    await tx.grupoDistritosDistrito.create({ data: { grupoId: g.id, zonaId, distritoId } });
  }
  return g.id;
}

/** Cuantos valores siembra `sembrar` para la empresa A (lo afirma cada caso antes de nada). */
const VALORES_DE_A = 29;

async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().slice(0, 8);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;

  // ---- Empresa A -------------------------------------------------------------------------
  await fijarEmpresa(tx, A);
  const fks = await crearFksDeOrden(tx);
  const T = fks.tiendaId;
  const Z = fks.zonaId;
  const T2 = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const M2 = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const Z2 = (
    await tx.zona.create({
      data: { nombre: `Zona 2 ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    })
  ).id;
  const distritos = await tx.distrito.findMany({
    where: { cantonId: fks.cantonId },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 4,
  });
  if (distritos.length < 4) throw new Error("Cartago/Cartago necesita al menos 4 distritos");
  const [d1, d2, d3, d4] = distritos.map((d) => d.id) as [string, string, string, string];
  await tx.zonaDistrito.createMany({
    data: [
      { zonaId: Z, distritoId: d1 },
      { zonaId: Z, distritoId: d2 },
      { zonaId: Z, distritoId: d3 },
      { zonaId: Z2, distritoId: d4 },
    ],
  });
  const G1 = await grupo(tx, Z, "G1", [d1]);
  const G2 = await grupo(tx, Z, "G2", [d2]);
  const G3 = await grupo(tx, Z2, "G3", [d4]);
  const V1 = (await tx.vehiculo.create({ data: { name: `slt52-v1-${sufijo}` }, select: { id: true } })).id;
  const V2 = (await tx.vehiculo.create({ data: { name: `slt52-v2-${sufijo}` }, select: { id: true } })).id;

  const v: Record<string, string> = {};
  const s = async (etiqueta: string, d: ValorSembrado) => {
    v[etiqueta] = await sembrarValor(tx, d);
  };
  const FE: TarifaConcepto = "tienda_flete_entregado";
  // Cobro: los cinco niveles (R16), importes 1001..1005.
  await s("c1", { concepto: FE, valor: "1001.00", tiendaId: T, zonaId: Z, grupoId: G1 });
  await s("c2", { concepto: FE, valor: "1002.00", tiendaId: T, zonaId: Z });
  await s("c3", { concepto: FE, valor: "1003.00", tiendaId: T });
  await s("c4", { concepto: FE, valor: "1004.00", zonaId: Z, grupoId: G1 });
  await s("c5", { concepto: FE, valor: "1005.00", zonaId: Z });
  // Senuelos del cobro: nunca pueden ganar al par (T, Z, d1).
  await s("cOtraZona", { concepto: FE, valor: "9001.00", zonaId: Z2 });
  await s("cTiendaOtraZona", { concepto: FE, valor: "9002.00", tiendaId: T, zonaId: Z2 });
  await s("cOtroGrupo", { concepto: FE, valor: "9003.00", zonaId: Z, grupoId: G2 });
  await s("cTiendaOtroGrupo", { concepto: FE, valor: "9004.00", tiendaId: T, zonaId: Z, grupoId: G2 });
  await s("cOtraTiendaZona", { concepto: FE, valor: "9005.00", tiendaId: T2, zonaId: Z });
  await s("cOtraTiendaGeneral", { concepto: FE, valor: "9006.00", tiendaId: T2 });
  await s("cOtraTiendaGrupo", { concepto: FE, valor: "9007.00", tiendaId: T2, zonaId: Z, grupoId: G1 });
  // R23: un cero escrito (reprogramado) frente a un concepto sin fila (novedad).
  await s("cCero", { concepto: "tienda_flete_reprogramado", valor: "0.00", zonaId: Z });
  // R16: otro concepto que solo tiene valor de zona (la eleccion es por concepto).
  await s("cFulfillment", { concepto: "tienda_fulfillment", valor: "450.25", zonaId: Z });
  // R28: flete por rechazo en porcentaje del pedido, base del pago por rechazo.
  await s("cRechazo", { concepto: "tienda_flete_rechazo", modo: "porcentaje", valor: "2.50", zonaId: Z });

  const ME: TarifaConcepto = "mensajero_entregado";
  // Pago: los cinco niveles (R19, P2), importes 501..505.
  await s("p1", { concepto: ME, valor: "501.00", mensajeroId: M });
  await s("p2", { concepto: ME, valor: "502.00", zonaId: Z, grupoId: G1, vehiculoId: V1 });
  await s("p3", { concepto: ME, valor: "503.00", zonaId: Z, grupoId: G1 });
  await s("p4", { concepto: ME, valor: "504.00", zonaId: Z, vehiculoId: V1 });
  await s("p5", { concepto: ME, valor: "505.00", zonaId: Z });
  // Senuelos del pago.
  await s("pOtroVehiculoGrupo", { concepto: ME, valor: "9101.00", zonaId: Z, grupoId: G1, vehiculoId: V2 });
  await s("pOtroVehiculoZona", { concepto: ME, valor: "9102.00", zonaId: Z, vehiculoId: V2 });
  await s("pOtraZona", { concepto: ME, valor: "9103.00", zonaId: Z2 });
  await s("pOtroGrupo", { concepto: ME, valor: "9104.00", zonaId: Z, grupoId: G2 });
  await s("pOtroMensajero", { concepto: ME, valor: "9105.00", mensajeroId: M2 });
  await s("pGrupoDeOtraZona", { concepto: ME, valor: "9106.00", zonaId: Z2, grupoId: G3 });
  // Satelite (R20): sin nivel propio; grupo+vehiculo y zona.
  await s("s2", { concepto: "satelite_entregado", valor: "601.00", zonaId: Z, grupoId: G1, vehiculoId: V1 });
  await s("s5", { concepto: "satelite_entregado", valor: "605.00", zonaId: Z });
  // R28: pago por rechazo al mensajero en porcentaje del flete sin IVA de esa gestion.
  await s("pRechazo", { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "10.00", zonaId: Z });

  // ---- Empresa B: otra empresa con valores propios ----------------------------------------
  await fijarEmpresa(tx, B);
  const fksB = await crearFksDeOrden(tx);
  // El MISMO distrito d1, en una zona de B y en un grupo de B (el unico es por empresa).
  await tx.zonaDistrito.create({ data: { zonaId: fksB.zonaId, distritoId: d1 } });
  await grupo(tx, fksB.zonaId, "GB", [d1]);
  await s("bZona", { concepto: FE, valor: "9201.00", zonaId: fksB.zonaId });
  await s("bTienda", { concepto: FE, valor: "9202.00", tiendaId: fksB.tiendaId });
  await s("bMensajero", { concepto: ME, valor: "9203.00", zonaId: fksB.zonaId });

  await fijarEmpresa(tx, A);
  return {
    A, B, T, T2, TB: fksB.tiendaId, M, M2, Z, Z2, ZB: fksB.zonaId,
    d1, d2, d3, d4, G1, G2, G3, V1, V2, v,
  };
}

/** Ejecuta `fn` con el rol de la app y la empresa `org` (la RLS filtra), y vuelve a dueno. */
async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

async function borrar(tx: TxDeTest, ids: string[]) {
  await tx.tarifaValor.deleteMany({ where: { id: { in: ids } } });
}

/** Cada caso afirma primero lo que sembro: sin esto, un resolver que no leyera nada pasaria. */
async function afirmarSiembra(tx: TxDeTest, e: Escenario) {
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.A } })).toBe(VALORES_DE_A);
  expect(await tx.tarifaValor.count({ where: { organizacionId: e.B } })).toBe(3);
  expect(await tx.grupoDistritosDistrito.count({ where: { organizacionId: e.A } })).toBe(3);
}

function valoresDe(t: TarifaTienda | null | undefined) {
  if (t === null || t === undefined || t.modelo !== "nuevo") {
    throw new Error(`se esperaba el modelo nuevo y llego ${JSON.stringify(t)}`);
  }
  return t.valores;
}

function pagoNuevo(t: TarifaPago | null | undefined) {
  if (t === null || t === undefined || t.modelo !== "nuevo") {
    throw new Error(`se esperaba el modelo nuevo y llego ${JSON.stringify(t)}`);
  }
  return t;
}

async function cobroDe(tx: TxDeTest, e: Escenario, par: ParTarifa) {
  const r = await comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [par]));
  return valoresDe(r.get(clavePar(par)));
}

function ctxPago(e: Escenario, o: Partial<ContextoPagoGestion> = {}): ContextoPagoGestion {
  return {
    gestionId: "g-1",
    resultado: "entregado",
    mensajeroId: e.M,
    zonaId: e.Z,
    vehiculoId: e.V1,
    distritoId: e.d1,
    tiendaId: e.T,
    zonaOrdenId: e.Z,
    montoCobrar: "10000.00",
    cobraComision: true,
    ...o,
  };
}

async function pagoDe(tx: TxDeTest, e: Escenario, c: ContextoPagoGestion) {
  const r = await comoEmpresa(tx, e.A, () => resolverPagosCon(tx, [c]));
  return pagoNuevo(r.get(c.gestionId));
}

function conEscenario(fn: (tx: TxDeTest, e: Escenario) => Promise<void>) {
  return enTransaccionRevertida(base, async (tx) => {
    const e = await sembrar(tx);
    await afirmarSiembra(tx, e);
    await fn(tx, e);
  });
}

// --------------------------------------------------------------------------------------------
// Cobro a la tienda (R16, R17, R18, R23)
// --------------------------------------------------------------------------------------------

const NIVELES_COBRO = [
  { etiqueta: "c1", nivel: "tienda_grupo", valor: "1001.00" },
  { etiqueta: "c2", nivel: "tienda_zona", valor: "1002.00" },
  { etiqueta: "c3", nivel: "tienda_general", valor: "1003.00" },
  { etiqueta: "c4", nivel: "grupo", valor: "1004.00" },
  { etiqueta: "c5", nivel: "zona", valor: "1005.00" },
] as const;

describeSiHayBase("SLT-52 resolver · cobro a la tienda en Postgres (R16-R18, R23)", () => {
  it.each(NIVELES_COBRO.map((n, i) => [n.nivel, i] as const))(
    "R16: quitando los niveles anteriores, gana %s",
    async (_nivel, i) => {
      await conEscenario(async (tx, e) => {
        await borrar(tx, NIVELES_COBRO.slice(0, i).map((n) => e.v[n.etiqueta]!));
        const valores = await cobroDe(tx, e, { tiendaId: e.T, zonaId: e.Z, distritoId: e.d1 });
        const n = NIVELES_COBRO[i]!;
        expect(valores.tienda_flete_entregado).toEqual({
          concepto: "tienda_flete_entregado",
          modo: "monto",
          valor: n.valor,
          ivaPct: "13.00",
          nivel: n.nivel,
          tarifaValorId: e.v[n.etiqueta],
        });
      });
    },
  );

  it("R23: sin ningun nivel, el flete por entregado queda «sin tarifa» (ausente) aunque haya senuelos", async () => {
    await conEscenario(async (tx, e) => {
      await borrar(tx, NIVELES_COBRO.map((n) => e.v[n.etiqueta]!));
      const valores = await cobroDe(tx, e, { tiendaId: e.T, zonaId: e.Z, distritoId: e.d1 });
      expect(valores.tienda_flete_entregado).toBeUndefined();
    });
  });

  it("R17: la tienda sin pacto en su grupo pero con pacto en la zona usa su zona antes que el grupo", async () => {
    await conEscenario(async (tx, e) => {
      await borrar(tx, [e.v.c1!]);
      const valores = await cobroDe(tx, e, { tiendaId: e.T, zonaId: e.Z, distritoId: e.d1 });
      expect(valores.tienda_flete_entregado?.valor).toBe("1002.00");
      expect(valores.tienda_flete_entregado?.nivel).toBe("tienda_zona");
    });
  });

  it("R18: una orden SIN distrito salta los niveles de grupo (gana tienda_zona; sin tienda, la zona)", async () => {
    await conEscenario(async (tx, e) => {
      const par = { tiendaId: e.T, zonaId: e.Z, distritoId: null };
      expect((await cobroDe(tx, e, par)).tienda_flete_entregado?.valor).toBe("1002.00");
      await borrar(tx, [e.v.c2!, e.v.c3!]);
      expect((await cobroDe(tx, e, par)).tienda_flete_entregado?.valor).toBe("1005.00");
    });
  });

  it("R18: un distrito de la zona que no esta en ningun grupo salta los grupos", async () => {
    await conEscenario(async (tx, e) => {
      await borrar(tx, [e.v.c2!, e.v.c3!]);
      const valores = await cobroDe(tx, e, { tiendaId: e.T, zonaId: e.Z, distritoId: e.d3 });
      expect(valores.tienda_flete_entregado?.valor).toBe("1005.00");
      expect(valores.tienda_flete_entregado?.nivel).toBe("zona");
    });
  });

  it("R16: el distrito de OTRO grupo de la zona cobra lo de ese grupo, no lo de G1", async () => {
    await conEscenario(async (tx, e) => {
      const valores = await cobroDe(tx, e, { tiendaId: e.T, zonaId: e.Z, distritoId: e.d2 });
      expect(valores.tienda_flete_entregado?.valor).toBe("9004.00");
      expect(valores.tienda_flete_entregado?.nivel).toBe("tienda_grupo");
    });
  });

  it("R16: la eleccion es por concepto (fulfillment solo tiene zona y la toma; el flete, su tienda+grupo)", async () => {
    await conEscenario(async (tx, e) => {
      const valores = await cobroDe(tx, e, { tiendaId: e.T, zonaId: e.Z, distritoId: e.d1 });
      expect(valores.tienda_flete_entregado?.valor).toBe("1001.00");
      expect(valores.tienda_fulfillment).toEqual({
        concepto: "tienda_fulfillment",
        modo: "monto",
        valor: "450.25",
        ivaPct: "13.00",
        nivel: "zona",
        tarifaValorId: e.v.cFulfillment,
      });
    });
  });

  it("R23: un 0 escrito vale \"0.00\" y no es «sin tarifa»; un concepto sin fila es ausente", async () => {
    await conEscenario(async (tx, e) => {
      const valores = await cobroDe(tx, e, { tiendaId: e.T, zonaId: e.Z, distritoId: e.d1 });
      expect(valores.tienda_flete_reprogramado?.valor).toBe("0.00");
      expect("tienda_flete_novedad" in valores).toBe(false);
      expect(Object.keys(valores).sort()).toEqual([
        "tienda_flete_entregado",
        "tienda_flete_rechazo",
        "tienda_flete_reprogramado",
        "tienda_fulfillment",
      ]);
    });
  });

  it("la fachada `TarifaVigenteRepository` devuelve lo mismo que el resolver (singular y lote)", async () => {
    await conEscenario(async (tx, e) => {
      const repo = new TarifaVigenteRepository(tx);
      const par = { tiendaId: e.T, zonaId: e.Z, distritoId: e.d1 };
      const lote = await comoEmpresa(tx, e.A, () => repo.resolveTarifas([par]));
      const uno = await comoEmpresa(tx, e.A, () => repo.resolveTarifa(e.T, e.Z, e.d1));
      expect(valoresDe(lote.get(clavePar(par))).tienda_flete_entregado?.valor).toBe("1001.00");
      expect(valoresDe(uno).tienda_flete_entregado?.valor).toBe("1001.00");
    });
  });
});

// --------------------------------------------------------------------------------------------
// Pago al mensajero y a la satelite (R19-R23, R28)
// --------------------------------------------------------------------------------------------

const NIVELES_PAGO = [
  { etiqueta: "p1", nivel: "mensajero", valor: "501.00" },
  { etiqueta: "p2", nivel: "grupo_vehiculo", valor: "502.00" },
  { etiqueta: "p3", nivel: "grupo", valor: "503.00" },
  { etiqueta: "p4", nivel: "zona_vehiculo", valor: "504.00" },
  { etiqueta: "p5", nivel: "zona", valor: "505.00" },
] as const;

describeSiHayBase("SLT-52 resolver · pago al mensajero y a la satelite en Postgres (R19-R23, R28)", () => {
  it.each(NIVELES_PAGO.map((n, i) => [n.nivel, i] as const))(
    "R19: quitando los niveles anteriores, gana %s",
    async (_nivel, i) => {
      await conEscenario(async (tx, e) => {
        await borrar(tx, NIVELES_PAGO.slice(0, i).map((n) => e.v[n.etiqueta]!));
        const pago = await pagoDe(tx, e, ctxPago(e));
        const n = NIVELES_PAGO[i]!;
        // Sin campo de IVA (P4, R34): el literal es el valor entero.
        expect(pago.mensajero).toEqual({
          concepto: "mensajero_entregado",
          modo: "monto",
          valor: n.valor,
          nivel: n.nivel,
          tarifaValorId: e.v[n.etiqueta],
        });
      });
    },
  );

  it("R23: sin ningun nivel, el pago al mensajero es `null` (= paga 0) y la satelite sigue con el suyo", async () => {
    await conEscenario(async (tx, e) => {
      await borrar(tx, NIVELES_PAGO.map((n) => e.v[n.etiqueta]!));
      const pago = await pagoDe(tx, e, ctxPago(e));
      expect(pago.mensajero).toBeNull();
      expect(pago.satelite?.valor).toBe("601.00");
    });
  });

  it("R20: la satelite usa la misma zona, distrito y precedencia sin el nivel del mensajero", async () => {
    await conEscenario(async (tx, e) => {
      const pago = await pagoDe(tx, e, ctxPago(e));
      expect(pago.satelite).toEqual({
        concepto: "satelite_entregado",
        modo: "monto",
        valor: "601.00",
        nivel: "grupo_vehiculo",
        tarifaValorId: e.v.s2,
      });
      await borrar(tx, [e.v.s2!]);
      expect((await pagoDe(tx, e, ctxPago(e))).satelite?.nivel).toBe("zona");
    });
  });

  it("R22: un mensajero sin vehiculo salta los niveles por vehiculo (gana el grupo para todos)", async () => {
    await conEscenario(async (tx, e) => {
      await borrar(tx, [e.v.p1!]);
      const pago = await pagoDe(tx, e, ctxPago(e, { vehiculoId: null }));
      expect(pago.mensajero?.valor).toBe("503.00");
      expect(pago.mensajero?.nivel).toBe("grupo");
    });
  });

  it("R21: el distrito de la orden que no esta en ningun grupo de la zona del mensajero usa la zona", async () => {
    await conEscenario(async (tx, e) => {
      await borrar(tx, [e.v.p1!]);
      // d4 esta en G3 de Z2 (la zona de la ORDEN), pero el mensajero es de Z: en Z no tiene grupo.
      const pago = await pagoDe(tx, e, ctxPago(e, { distritoId: e.d4, zonaOrdenId: e.Z2 }));
      expect(pago.mensajero?.valor).toBe("504.00");
      expect(pago.mensajero?.nivel).toBe("zona_vehiculo");
    });
  });

  it("R28: la base del % es el flete sin IVA que se cobra a la tienda por ESA gestion", async () => {
    await conEscenario(async (tx, e) => {
      const lote = await comoEmpresa(tx, e.A, () =>
        resolverPagosCon(tx, [
          // entregado: flete de T en G1 = 1001.00 (monto).
          ctxPago(e, { gestionId: "g-ent" }),
          // rechazo: 2.50 % de 10000.00 = 250.00; el pago del mensajero es 10 % de eso (T4.2).
          ctxPago(e, { gestionId: "g-rech", resultado: "devolucion_a_origen_por_rechazo" }),
          // reprogramado: flete 0.00 escrito -> base 0.00.
          ctxPago(e, { gestionId: "g-repr", resultado: "reprogramado" }),
          // novedad: la tienda no paga nada por ese resultado -> base 0.00.
          ctxPago(e, { gestionId: "g-nov", resultado: "novedad" }),
        ]),
      );
      expect(pagoNuevo(lote.get("g-ent")).baseFlete).toBe("1001.00");
      expect(pagoNuevo(lote.get("g-rech")).baseFlete).toBe("250.00");
      expect(pagoNuevo(lote.get("g-rech")).mensajero).toEqual({
        concepto: "mensajero_rechazo",
        modo: "porcentaje",
        valor: "10.00",
        nivel: "zona",
        tarifaValorId: e.v.pRechazo,
      });
      expect(pagoNuevo(lote.get("g-repr")).baseFlete).toBe("0.00");
      expect(pagoNuevo(lote.get("g-nov")).baseFlete).toBe("0.00");
      expect(pagoNuevo(lote.get("g-nov")).mensajero).toBeNull();
    });
  });

  it("la fachada `resolvePagos` devuelve lo mismo que el resolver", async () => {
    await conEscenario(async (tx, e) => {
      const repo = new TarifaZonaMensajeroRepository(tx);
      const r = await comoEmpresa(tx, e.A, () => repo.resolvePagos([ctxPago(e)]));
      expect(pagoNuevo(r.get("g-1")).mensajero?.valor).toBe("501.00");
    });
  });
});

// --------------------------------------------------------------------------------------------
// Los dos WHERE, donde viven (R15, R21, R39)
// --------------------------------------------------------------------------------------------

describeSiHayBase("SLT-52 resolver · los WHERE en Postgres (R15, R21)", () => {
  it("el WHERE de valores no trae nada de una zona, tienda o mensajero que nadie pidio", async () => {
    await conEscenario(async (tx, e) => {
      const filas = await comoEmpresa(tx, e.A, () =>
        valoresCandidatos(tx, {
          zonas: [e.Z],
          tiendas: [e.T],
          mensajeros: [e.M],
          conceptos: ["tienda_flete_entregado", "mensajero_entregado"],
        }),
      );
      expect(filas.length).toBeGreaterThan(0);
      const ids = new Set(filas.map((f) => f.id));
      // Senuelos fuera de lo pedido: otra zona, otra tienda (sin zona pedida) y otro mensajero.
      for (const etiqueta of ["cOtraZona", "cTiendaOtraZona", "pOtraZona", "pGrupoDeOtraZona", "cOtraTiendaGeneral", "pOtroMensajero"]) {
        expect(ids.has(e.v[etiqueta]!), etiqueta).toBe(false);
      }
      // Y si trae todo lo que puede ganar.
      for (const etiqueta of ["c1", "c2", "c3", "c4", "c5", "p1", "p2", "p3", "p4", "p5"]) {
        expect(ids.has(e.v[etiqueta]!), etiqueta).toBe(true);
      }
      // Ningun concepto que no se pidio.
      expect(new Set(filas.map((f) => f.concepto))).toEqual(
        new Set(["tienda_flete_entregado", "mensajero_entregado"]),
      );
    });
  });

  it("R15: con la empresa A, ni pidiendo las zonas y tiendas de B se ve un valor de B", async () => {
    await conEscenario(async (tx, e) => {
      const filas = await comoEmpresa(tx, e.A, () =>
        valoresCandidatos(tx, {
          zonas: [e.Z, e.ZB],
          tiendas: [e.T, e.TB],
          mensajeros: [e.M],
          conceptos: [...CONCEPTOS_TIENDA, "mensajero_entregado"],
        }),
      );
      expect(filas.length).toBeGreaterThan(0);
      const ids = new Set(filas.map((f) => f.id));
      for (const etiqueta of ["bZona", "bTienda", "bMensajero"]) {
        expect(ids.has(e.v[etiqueta]!), etiqueta).toBe(false);
      }
      const grupos = await comoEmpresa(tx, e.A, () =>
        gruposDeDistritos(tx, [{ zonaId: e.ZB, distritoId: e.d1 }]),
      );
      expect(grupos.size).toBe(0);
    });
  });

  it("R21: el grupo de un distrito se busca DENTRO de la zona pedida", async () => {
    await conEscenario(async (tx, e) => {
      const grupos = await comoEmpresa(tx, e.A, () =>
        gruposDeDistritos(tx, [
          { zonaId: e.Z, distritoId: e.d1 }, // G1
          { zonaId: e.Z2, distritoId: e.d4 }, // G3
          { zonaId: e.Z, distritoId: e.d4 }, // d4 no es de Z: sin grupo
          { zonaId: e.Z2, distritoId: e.d1 }, // d1 no es de Z2: sin grupo
          { zonaId: e.Z, distritoId: e.d3 }, // en Z, sin grupo
          { zonaId: e.Z, distritoId: null }, // sin distrito
        ]),
      );
      expect(Object.fromEntries(grupos)).toEqual({
        [`${e.Z}|${e.d1}`]: e.G1,
        [`${e.Z2}|${e.d4}`]: e.G3,
      });
    });
  });
});

// --------------------------------------------------------------------------------------------
// Un lote que mezcla zonas (listado, carga masiva, cierre)
// --------------------------------------------------------------------------------------------
//
// Con un solo par, el WHERE `zonaId IN [Z]` ya deja fuera el valor de Z2 y la eleccion en memoria
// nunca lo ve. En un lote con dos zonas el WHERE trae las filas de AMBAS, y es la eleccion
// (`rangoCobro`/`rangoPago`) la unica que impide que un par tome el valor de la otra zona. Los dos
// valores compiten en el mismo rango: si la eleccion no mirara la zona, uno de los dos pares
// recibiria el valor equivocado, sea cual sea el orden en que Postgres devuelva las filas.

describeSiHayBase("SLT-52 resolver · un lote con varias zonas (R16, R19)", () => {
  it("R16: la MISMA tienda en Z y en Z2 en un lote: cada par toma el tienda_zona de SU zona", async () => {
    await conEscenario(async (tx, e) => {
      const enZ = { tiendaId: e.T, zonaId: e.Z, distritoId: e.d3 };
      const enZ2 = { tiendaId: e.T, zonaId: e.Z2, distritoId: null };
      const r = await comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [enZ, enZ2]));
      expect(valoresDe(r.get(clavePar(enZ))).tienda_flete_entregado).toEqual({
        concepto: "tienda_flete_entregado",
        modo: "monto",
        valor: "1002.00",
        ivaPct: "13.00",
        nivel: "tienda_zona",
        tarifaValorId: e.v.c2,
      });
      expect(valoresDe(r.get(clavePar(enZ2))).tienda_flete_entregado).toEqual({
        concepto: "tienda_flete_entregado",
        modo: "monto",
        valor: "9002.00",
        ivaPct: "13.00",
        nivel: "tienda_zona",
        tarifaValorId: e.v.cTiendaOtraZona,
      });
    });
  });

  it("R19/R20: el MISMO mensajero en Z y en Z2 en un lote: cada gestion toma la zona de SU contexto", async () => {
    await conEscenario(async (tx, e) => {
      // Sin su valor propio, el mensajero cae al nivel de zona en los dos contextos.
      await borrar(tx, [e.v.p1!]);
      const enZ = ctxPago(e, { gestionId: "g-z", vehiculoId: null, distritoId: e.d3 });
      const enZ2 = ctxPago(e, {
        gestionId: "g-z2",
        zonaId: e.Z2,
        zonaOrdenId: e.Z2,
        vehiculoId: null,
        distritoId: null,
      });
      const r = await comoEmpresa(tx, e.A, () => resolverPagosCon(tx, [enZ, enZ2]));
      const pagoZ = pagoNuevo(r.get("g-z"));
      const pagoZ2 = pagoNuevo(r.get("g-z2"));
      expect(pagoZ.mensajero).toEqual({
        concepto: "mensajero_entregado",
        modo: "monto",
        valor: "505.00",
        nivel: "zona",
        tarifaValorId: e.v.p5,
      });
      expect(pagoZ2.mensajero).toEqual({
        concepto: "mensajero_entregado",
        modo: "monto",
        valor: "9103.00",
        nivel: "zona",
        tarifaValorId: e.v.pOtraZona,
      });
      // La satelite solo tiene valor en Z: el de Z no viaja a la gestion de Z2.
      expect(pagoZ.satelite?.valor).toBe("605.00");
      expect(pagoZ2.satelite).toBeNull();
    });
  });
});

describeSiHayBase("SLT-52 resolver · numero fijo de consultas por lote (R39)", () => {
  /** Las consultas que el resolver manda a Postgres durante `fn`. */
  async function contarConsultas(fn: () => Promise<unknown>): Promise<number> {
    const antes = eventos.length;
    await fn();
    return eventos.length - antes;
  }

  it("cobro: un lote de 1 y uno de 50 ordenes cuestan las mismas consultas (3)", async () => {
    await conEscenario(async (tx, e) => {
      const distritos = [e.d1, e.d2, e.d3, null];
      const pares50: ParTarifa[] = Array.from({ length: 50 }, (_, i) => ({
        tiendaId: i % 2 === 0 ? e.T : randomUUID(),
        zonaId: i % 3 === 0 ? e.Z2 : e.Z,
        distritoId: distritos[i % distritos.length]!,
      }));
      const uno = await comoEmpresa(tx, e.A, () =>
        contarConsultas(() => resolverCobrosCon(tx, [pares50[0]!])),
      );
      const cincuenta = await comoEmpresa(tx, e.A, () =>
        contarConsultas(() => resolverCobrosCon(tx, pares50)),
      );
      // interruptor + grupos + valores
      expect(uno).toBe(3);
      expect(cincuenta).toBe(3);
    });
  });

  it("pago: un lote de 1 y uno de 50 gestiones cuestan las mismas consultas (3)", async () => {
    await conEscenario(async (tx, e) => {
      const resultados: GestionResultado[] = ["entregado", "reprogramado", "novedad", "incidente"];
      const ctxs = Array.from({ length: 50 }, (_, i) =>
        ctxPago(e, {
          gestionId: `g-${i}`,
          resultado: resultados[i % resultados.length]!,
          mensajeroId: i % 2 === 0 ? e.M : randomUUID(),
          vehiculoId: i % 3 === 0 ? null : e.V1,
          distritoId: [e.d1, e.d2, e.d3, null][i % 4]!,
        }),
      );
      const uno = await comoEmpresa(tx, e.A, () =>
        contarConsultas(() => resolverPagosCon(tx, [ctxs[0]!])),
      );
      const cincuenta = await comoEmpresa(tx, e.A, () =>
        contarConsultas(() => resolverPagosCon(tx, ctxs)),
      );
      expect(uno).toBe(3);
      expect(cincuenta).toBe(3);
    });
  });
});
