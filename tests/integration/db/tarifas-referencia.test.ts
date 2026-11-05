import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { cargarPantallaTarifas, cargarZonaTarifas } from "@/lib/actions/tarifas";
import type { Actor } from "@/lib/interfaces/services/ITarifasPantallaService";
import { TarifasPantallaRepository } from "@/lib/repositories/TarifasPantallaRepository";
import { resolverCobrosCon, SIN_TIENDA, usaModeloNuevo } from "@/lib/repositories/_shared/resolver-tarifas";
import { TarifasPantallaService } from "@/lib/services/TarifasPantallaService";
import { serviciosDeTarifas } from "@/lib/tarifas/servicios";
import { clavePar } from "@/lib/utils/cascada-tarifa";
import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-54 T2.2, T2.3 (design §6, §7; R12, R21-R24, R45, R46) — LO QUE LEE LA PANTALLA, CONTRA POSTGRES REAL.
//
// La cascada, la marca por empresa y el aislamiento viven en el SQL y en la RLS: un doble no los ve. Por
// eso cada lectura corre como `servi_app` con la empresa fijada (`comoApp`); como dueño, la RLS no actua y
// el aislamiento pasaria aunque no existiera. El cliente del test no lleva la extension de empresa: lo que
// separa a A de B aqui es solo la RLS, que es justo lo que respalda a la extension en produccion.
//
// Los esperados son LITERALES calculados a mano sobre la siembra de abajo. Todo se revierte.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

const COLUMNAS = {
  valorFlete: "2800.00",
  valorFleteGam: "2500.00",
  valorFleteDevuelto: "1400.00",
  valorFleteDevueltoGam: "1250.00",
  comisionCod: "3.50",
  ivaFlete: "13.00",
  ivaComisionCod: "2.00",
  fulfillment: "150.00",
  // Pacto solo en la entrega: la devolucion de un distrito marcado cae al flete normal.
  tarifaEspecial: "4100.00",
  tarifaEspecialDevuelta: null,
};

interface Escenario {
  A: string;
  B: string;
  maestroA: Actor;
  adminA: Actor;
  /** Con tarifa general, propia de tienda y pago, y 4 distritos: d1 y d4 con marca. */
  Z: string;
  /** Sin ninguna fila del modelo viejo. */
  zVacia: string;
  /** Bodega principal de A, con tarifa general. */
  zCentral: string;
  d1: string;
  d2: string;
  d3: string;
  d4: string;
  /** G1 = [d1], G2 = [d2], Gmezcla = [d3, d4]. */
  G1: string;
  G2: string;
  Gmezcla: string;
  /** Tiendas de A: `propia` con fila en Z y en todas sus zonas; `general` solo en todas; `sinFila`, ninguna. */
  tiendaPropia: string;
  tiendaGeneral: string;
  tiendaSinFila: string;
  /** Vehiculos del catalogo: `moto` con pago propio en Z, `carro` sin fila (cae al de la zona). */
  moto: string;
  carro: string;
  inactivo: string;
  ZB: string;
  GB: string;
  tiendaB: string;
  valorB: string;
  /** El precio propio de una tienda de A. */
  precioTiendaA: string;
}

async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().slice(0, 8);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;

  const crearVehiculo = async (nombre: string, activo: boolean) =>
    (await tx.vehiculo.create({ data: { name: `slt54-${nombre}-${sufijo}`, activo }, select: { id: true } })).id;
  const moto = await crearVehiculo("moto", true);
  const carro = await crearVehiculo("carro", true);
  const inactivo = await crearVehiculo("inactivo", false);

  // ---- Empresa B: lo que A no debe ver. Precios que A no usa, y marca en un distrito que A no marca. --
  await fijarEmpresa(tx, B);
  const fksB = await crearFksDeOrden(tx);
  const distritos = await tx.distrito.findMany({
    where: { cantonId: fksB.cantonId },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 4,
  });
  if (distritos.length < 4) throw new Error("Cartago/Cartago necesita al menos 4 distritos");
  const [d1, d2, d3, d4] = distritos.map((d) => d.id) as [string, string, string, string];
  const ZB = fksB.zonaId;
  await tx.zonaDistrito.createMany({ data: [d1, d2].map((distritoId) => ({ zonaId: ZB, distritoId })) });
  const GB = (await tx.grupoDistritos.create({ data: { zonaId: ZB, nombre: "GB" }, select: { id: true } })).id;
  await tx.grupoDistritosDistrito.create({ data: { grupoId: GB, zonaId: ZB, distritoId: d2 } });
  await tx.tarifa.create({ data: { ...COLUMNAS, valorFlete: "7777.00", tiendaId: null, zonaId: ZB } });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: ZB, vehiculoId: null, cobroEntregado: "7777.00", cobroRechazado: "7777.00" },
  });
  await tx.distritoZonaEspecial.create({ data: { distritoId: d2 } });
  const valorB = (
    await tx.tarifaValor.create({
      data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "7777.00", ivaPct: "13.00", zonaId: ZB },
      select: { id: true },
    })
  ).id;

  // ---- Empresa A -------------------------------------------------------------------------------------
  await fijarEmpresa(tx, A);
  const fksA = await crearFksDeOrden(tx);
  const Z = fksA.zonaId;
  const tiendaPropia = fksA.tiendaId;
  const tiendaGeneral = (await crearUsuarioDePrueba(tx, "apiKey")).id;
  const tiendaSinFila = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
  const maestro = await crearUsuarioDePrueba(tx, "maestro");
  const admin = await crearUsuarioDePrueba(tx, "admin");
  await crearUsuarioDePrueba(tx, "mensajero");
  const zonaNueva = async (nombre: string, esCentral: boolean) =>
    (
      await tx.zona.create({
        data: { nombre: `${nombre}-${sufijo}`, esCentral, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
        select: { id: true },
      })
    ).id;
  const zVacia = await zonaNueva("Vacia", false);
  const zCentral = await zonaNueva("Central", true);

  await tx.zonaDistrito.createMany({ data: [d1, d2, d3, d4].map((distritoId) => ({ zonaId: Z, distritoId })) });
  const grupo = async (nombre: string, ids: string[]) => {
    const id = (await tx.grupoDistritos.create({ data: { zonaId: Z, nombre }, select: { id: true } })).id;
    await tx.grupoDistritosDistrito.createMany({
      data: ids.map((distritoId) => ({ grupoId: id, zonaId: Z, distritoId })),
    });
    return id;
  };
  const G1 = await grupo("G1", [d1]);
  const G2 = await grupo("G2", [d2]);
  const Gmezcla = await grupo("Gmezcla", [d3, d4]);
  await tx.distritoZonaEspecial.createMany({ data: [{ distritoId: d1 }, { distritoId: d4 }] });

  await tx.tarifa.create({ data: { ...COLUMNAS, tiendaId: null, zonaId: Z } });
  await tx.tarifa.create({ data: { ...COLUMNAS, tiendaId: null, zonaId: zCentral } });
  await tx.tarifa.create({
    data: { ...COLUMNAS, tiendaId: tiendaPropia, zonaId: Z, valorFlete: "3000.00", tarifaEspecial: null },
  });
  await tx.tarifa.create({
    data: { ...COLUMNAS, tiendaId: tiendaPropia, zonaId: null, valorFlete: "3300.00", valorFleteGam: "3100.00" },
  });
  await tx.tarifa.create({
    data: { ...COLUMNAS, tiendaId: tiendaGeneral, zonaId: null, valorFlete: "3500.00", tarifaEspecial: null },
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: Z, vehiculoId: null, cobroEntregado: "900.00", cobroRechazado: "450.00" },
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: Z, vehiculoId: moto, cobroEntregado: "700.00", cobroRechazado: "300.00" },
  });
  const precioTiendaA = (
    await tx.tarifaValor.create({
      data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "1111.00", ivaPct: "13.00", zonaId: Z, tiendaId: tiendaPropia },
      select: { id: true },
    })
  ).id;

  return {
    A,
    B,
    maestroA: { usuarioId: maestro.id, rol: "maestro" },
    adminA: { usuarioId: admin.id, rol: "admin" },
    Z,
    zVacia,
    zCentral,
    d1,
    d2,
    d3,
    d4,
    G1,
    G2,
    Gmezcla,
    tiendaPropia,
    tiendaGeneral,
    tiendaSinFila,
    moto,
    carro,
    inactivo,
    ZB,
    GB,
    tiendaB: fksB.tiendaId,
    valorB,
    precioTiendaA,
  };
}

/** Comprueba lo sembrado como dueño: un test que no ve datos no prueba nada. */
async function afirmarSiembra(tx: TxDeTest, e: Escenario) {
  expect(await tx.tarifa.count({ where: { organizacionId: e.A } })).toBe(5);
  expect(await tx.tarifa.count({ where: { organizacionId: e.B } })).toBe(1);
  expect(await tx.tarifaZonaMensajero.count({ where: { organizacionId: e.A } })).toBe(2);
  expect(await tx.distritoZonaEspecial.count({ where: { organizacionId: e.A } })).toBe(2);
  expect(await tx.distritoZonaEspecial.count({ where: { organizacionId: e.B } })).toBe(1);
  expect(await tx.grupoDistritos.count({ where: { organizacionId: e.A } })).toBe(3);
  expect(await tx.tarifaActivacion.count({ where: { organizacionId: { in: [e.A, e.B] } } })).toBe(0);
}

function conEscenario(fn: (tx: TxDeTest, e: Escenario) => Promise<void>) {
  return enTransaccionRevertida(base, async (tx) => {
    const e = await sembrar(tx);
    await afirmarSiembra(tx, e);
    await fn(tx, e);
  });
}

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

function servicio(tx: TxDeTest) {
  return new TarifasPantallaService(new TarifasPantallaRepository(clienteConSavepoint(tx)));
}

async function referenciaDe(tx: TxDeTest, e: Escenario, zonaId: string, tiendaId?: string) {
  const res = await comoEmpresa(tx, e.A, () =>
    servicio(tx).cargarZona({ zonaId, ...(tiendaId === undefined ? {} : { tiendaId }) }, e.maestroA),
  );
  if (res.status !== "ok") throw new Error(`cargarZona: ${res.status}`);
  if (res.referencia === null) throw new Error("sin activar tiene que haber referencia");
  return { ...res, referencia: res.referencia };
}

const monto = (valor: string, ivaPct: string | null = "13.00") => ({ tipo: "monto", valor, ivaPct });
const varia = (desde: string, hasta: string) => ({ tipo: "varia", desde, hasta });

describeSiHayBase("SLT-54 R21-R23 — la referencia sale de la fila y las funciones del cálculo real", () => {
  it("nivel zona: la fila general, con la marca de sus distritos y el resto de los conceptos", async () => {
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.Z);
      const zona = referencia.zona;
      // d1 y d4 marcados con pacto 4100; d2 y d3 sin marca, flete normal 2800.
      expect(zona.tienda_flete_entregado).toEqual(varia("2800.00", "4100.00"));
      // Sin pacto de devolucion: la marca cae al flete normal y no varia.
      expect(zona.tienda_flete_rechazo).toEqual(monto("1400.00"));
      expect(zona.tienda_fulfillment).toEqual(monto("150.00", null));
      expect(zona.tienda_comision_cod).toEqual({ tipo: "porcentaje", valor: "3.50", ivaPct: "2.00" });
      expect(zona.tienda_flete_reprogramado).toEqual({ tipo: "no_cobra" });
      // Entre la fila por defecto (900) y la de la moto (700); el carro y el inactivo caen a la por defecto.
      expect(zona.mensajero_entregado).toEqual(varia("700.00", "900.00"));
      expect(zona.mensajero_rechazo).toEqual({ tipo: "no_paga" });
      expect(zona.satelite_rechazo).toEqual(varia("300.00", "450.00"));
      expect(zona.satelite_entregado).toEqual({ tipo: "no_paga" });
    });
  });

  it("nivel grupo: varía entre los distritos de ESE grupo", async () => {
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.Z);
      expect(referencia.grupos[e.G1].tienda_flete_entregado).toEqual(monto("4100.00"));
      expect(referencia.grupos[e.G2].tienda_flete_entregado).toEqual(monto("2800.00"));
      expect(referencia.grupos[e.Gmezcla].tienda_flete_entregado).toEqual(varia("2800.00", "4100.00"));
    });
  });

  it("por vehículo: el propio, y la caída al valor por defecto de la zona", async () => {
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.Z);
      expect(referencia.vehiculos[e.moto].mensajero_entregado).toEqual(monto("700.00", null));
      expect(referencia.vehiculos[e.moto].satelite_rechazo).toEqual(monto("300.00", null));
      expect(referencia.vehiculos[e.carro].mensajero_entregado).toEqual(monto("900.00", null));
      expect(referencia.vehiculos[e.inactivo].mensajero_entregado).toEqual(monto("900.00", null));
    });
  });

  it("bodega principal: la variante de la zona central, y el pacto la ignoraría", async () => {
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.zCentral);
      expect(referencia.zona.tienda_flete_entregado).toEqual(monto("2500.00"));
      expect(referencia.zona.tienda_flete_rechazo).toEqual(monto("1250.00"));
    });
  });

  it("sin ninguna fila: «Sin tarifa» en cobros y pagos, también en lo que el viejo no cobra", async () => {
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.zVacia);
      expect(referencia.zona.tienda_flete_entregado).toEqual({ tipo: "sin_tarifa" });
      expect(referencia.zona.tienda_flete_novedad).toEqual({ tipo: "sin_tarifa" });
      expect(referencia.zona.mensajero_entregado).toEqual({ tipo: "sin_tarifa" });
      expect(referencia.zona.mensajero_rechazo).toEqual({ tipo: "sin_tarifa" });
    });
  });

  describe("la cascada de una tienda", () => {
    it("con fila en la zona: nivel 1, sin caer a la general ni a la de todas sus zonas", async () => {
      await conEscenario(async (tx, e) => {
        const { referencia } = await referenciaDe(tx, e, e.Z, e.tiendaPropia);
        // (T, Z) sin pacto: la marca cae a su flete normal, asi que no varia.
        expect(referencia.tienda?.enZona.tienda_flete_entregado).toEqual(monto("3000.00"));
        expect(referencia.tienda?.enGrupos[e.G1].tienda_flete_entregado).toEqual(monto("3000.00"));
      });
    });

    it("sin fila en la zona pero con la de todas sus zonas: nivel 2, por encima de la general", async () => {
      await conEscenario(async (tx, e) => {
        const { referencia } = await referenciaDe(tx, e, e.Z, e.tiendaGeneral);
        expect(referencia.tienda?.enZona.tienda_flete_entregado).toEqual(monto("3500.00"));
      });
    });

    it("sin ninguna fila propia: nivel 3, la general de la zona", async () => {
      await conEscenario(async (tx, e) => {
        const { referencia } = await referenciaDe(tx, e, e.Z, e.tiendaSinFila);
        expect(referencia.tienda?.enZona.tienda_flete_entregado).toEqual(varia("2800.00", "4100.00"));
        expect(referencia.tienda?.enTodasSusZonas.tienda_flete_entregado).toEqual({ tipo: "sin_tarifa" });
      });
    });

    it("pedir una tienda no cambia lo que dice el nivel zona", async () => {
      await conEscenario(async (tx, e) => {
        const { referencia } = await referenciaDe(tx, e, e.Z, e.tiendaPropia);
        // (T, Z) lleva 3000: el nivel «Toda la zona» sigue siendo la fila general.
        expect(referencia.zona.tienda_flete_entregado).toEqual(varia("2800.00", "4100.00"));
        expect(referencia.grupos[e.G2].tienda_flete_entregado).toEqual(monto("2800.00"));
      });
    });

    it("en todas sus zonas: varía entre la bodega principal y las demás", async () => {
      await conEscenario(async (tx, e) => {
        const { referencia } = await referenciaDe(tx, e, e.Z, e.tiendaPropia);
        expect(referencia.tienda?.enTodasSusZonas.tienda_flete_entregado).toEqual(varia("3100.00", "3300.00"));
        expect(referencia.tienda?.enTodasSusZonas.tienda_flete_rechazo).toEqual(varia("1250.00", "1400.00"));
      });
    });
  });

  it("la referencia dice lo mismo que cobra el cálculo real para ese distrito", async () => {
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.Z);
      const cobroReal = async (distritoId: string, esZonaEspecial: boolean) => {
        const par = { tiendaId: e.tiendaSinFila, zonaId: e.Z, distritoId };
        const cobros = await comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [par]));
        const derivado = derivarIngresoOrden(
          { resultado: "entregado", esCentral: false, esZonaEspecial, montoCobrar: null, cobraComision: false },
          cobros.get(clavePar(par)) ?? null,
        );
        return derivado.ingreso_flete?.toFixed(2);
      };
      expect(await cobroReal(e.d1, true)).toBe("4100.00");
      expect(referencia.grupos[e.G1].tienda_flete_entregado).toEqual(monto("4100.00"));
      expect(await cobroReal(e.d2, false)).toBe("2800.00");
      expect(referencia.grupos[e.G2].tienda_flete_entregado).toEqual(monto("2800.00"));
    });
  });

  it("SIN_TIENDA no es el id de nadie: el par de la zona no alcanza las filas de ninguna tienda", async () => {
    expect(SIN_TIENDA).toBe("");
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.Z);
      // La fila (tienda, Z) lleva 3000: aqui no puede aparecer.
      expect(referencia.grupos[e.G2].tienda_flete_entregado).toEqual(monto("2800.00"));
    });
  });
});

describeSiHayBase("SLT-54 R12 — la empresa A no ve nada de B, leyendo como `servi_app`", () => {
  it("una zona de B es not_found para A, con todos sus datos", async () => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () => servicio(tx).cargarZona({ zonaId: e.ZB }, e.maestroA));
      expect(res).toEqual({ status: "not_found" });
    });
  });

  it("la pantalla de A trae sus zonas, sus tiendas, sus precios y sus estados, nada de B", async () => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () => servicio(tx).cargarPantalla(e.maestroA));
      if (res.status !== "ok") throw new Error(res.status);
      expect(res.activacion).toBeNull();
      expect(res.zonas.map((z) => z.id).sort()).toEqual([e.Z, e.zVacia, e.zCentral].sort());
      expect(res.tiendas.map((t) => t.id).sort()).toEqual([e.tiendaPropia, e.tiendaGeneral, e.tiendaSinFila].sort());
      expect(res.preciosTienda.map((p) => p.id)).toEqual([e.precioTiendaA]);
      expect(res.puedeEscribir).toBe(true);
      // Los estados salen de los valores de A: el de B no le cuenta a ninguna zona.
      expect(res.zonas.every((z) => z.estado === "sin_empezar")).toBe(true);
    });
  });

  it("los precios de tienda son solo los que llevan tienda", async () => {
    await conEscenario(async (tx, e) => {
      await tx.tarifaValor.create({
        data: { organizacionId: e.A, concepto: "tienda_flete_rechazo", modo: "monto", valor: "5.00", ivaPct: "13.00", zonaId: e.Z },
      });
      const res = await comoEmpresa(tx, e.A, () => servicio(tx).cargarPantalla(e.maestroA));
      if (res.status !== "ok") throw new Error(res.status);
      expect(res.preciosTienda.map((p) => p.id)).toEqual([e.precioTiendaA]);
    });
  });

  it("R14: lo que juzgan los faltantes no trae precios de tienda, ni valores propios del mensajero, ni de B", async () => {
    await conEscenario(async (tx, e) => {
      const mensajero = await tx.usuario.findFirstOrThrow({
        where: { organizacionId: e.A, rol: { value: "mensajero" } },
        select: { id: true },
      });
      await tx.tarifaValor.create({
        data: { organizacionId: e.A, concepto: "mensajero_entregado", modo: "monto", valor: "5.00", mensajeroId: mensajero.id },
      });
      await tx.tarifaValor.create({
        data: { organizacionId: e.A, concepto: "tienda_flete_rechazo", modo: "monto", valor: "5.00", ivaPct: "13.00", zonaId: e.Z },
      });
      await tx.tarifaValor.create({
        data: { organizacionId: e.A, concepto: "satelite_rechazo", modo: "monto", valor: "5.00", zonaId: e.Z, grupoId: e.G1 },
      });
      const repo = new TarifasPantallaRepository(clienteConSavepoint(tx));
      const filas = await comoEmpresa(tx, e.A, () => repo.valoresDeZonaOGrupo());
      expect(filas.map((f) => [f.concepto, f.zonaId, f.grupoId]).sort()).toEqual([
        ["satelite_rechazo", e.Z, e.G1],
        ["tienda_flete_rechazo", e.Z, null],
      ]);
    });
  });

  it("B ve lo suyo con la misma consulta: el vacío de A no es que nadie vea nada", async () => {
    await conEscenario(async (tx, e) => {
      await fijarEmpresa(tx, e.B);
      const maestroB = await crearUsuarioDePrueba(tx, "maestro");
      const actorB: Actor = { usuarioId: maestroB.id, rol: "maestro" };
      const res = await comoEmpresa(tx, e.B, () => servicio(tx).cargarZona({ zonaId: e.ZB }, actorB));
      if (res.status !== "ok") throw new Error(res.status);
      expect(res.valores.map((v) => v.id)).toEqual([e.valorB]);
      expect(res.grupos.map((g) => g.id)).toEqual([e.GB]);
      expect(res.referencia?.zona.tienda_flete_rechazo).toEqual(monto("1400.00"));
      // El pacto y el 7777 son de B: d2 tiene su marca, y d1 no.
      expect(res.distritos.map((d) => [d.id, d.zonaEspecial]).sort()).toEqual(
        [
          [e.d1, false],
          [e.d2, true],
        ].sort(),
      );
      expect(res.referencia?.zona.tienda_flete_entregado).toEqual(varia("4100.00", "7777.00"));
    });
  });

  it("la marca es de la empresa: d2 lleva marca en B y en A sale sin ella", async () => {
    await conEscenario(async (tx, e) => {
      const { distritos } = await referenciaDe(tx, e, e.Z);
      const marca = Object.fromEntries(distritos.map((d) => [d.id, d.zonaEspecial]));
      expect(marca).toEqual({ [e.d1]: true, [e.d2]: false, [e.d3]: false, [e.d4]: true });
    });
  });

  it("una tienda de B pedida desde A no trae sus precios: A solo ve su general", async () => {
    await conEscenario(async (tx, e) => {
      const { referencia } = await referenciaDe(tx, e, e.Z, e.tiendaB);
      expect(referencia.tienda?.enZona.tienda_flete_entregado).toEqual(varia("2800.00", "4100.00"));
      expect(referencia.tienda?.enTodasSusZonas.tienda_flete_entregado).toEqual({ tipo: "sin_tarifa" });
    });
  });

  it("admin lee lo mismo que maestro, sin poder escribir", async () => {
    await conEscenario(async (tx, e) => {
      const deMaestro = await comoEmpresa(tx, e.A, () => servicio(tx).cargarPantalla(e.maestroA));
      const deAdmin = await comoEmpresa(tx, e.A, () => servicio(tx).cargarPantalla(e.adminA));
      if (deMaestro.status !== "ok" || deAdmin.status !== "ok") throw new Error("lectura");
      expect({ ...deAdmin, puedeEscribir: true }).toEqual(deMaestro);
      expect(deAdmin.puedeEscribir).toBe(false);
    });
  });

  it("las actions pasan el actor y el cliente hasta la base", async () => {
    await conEscenario(async (tx, e) => {
      const deps = { getActor: async () => e.maestroA, servicio: servicio(tx) };
      const pantalla = await comoEmpresa(tx, e.A, () => cargarPantallaTarifas(deps));
      expect(pantalla.status).toBe("ok");
      const zona = await comoEmpresa(tx, e.A, () => cargarZonaTarifas({ zonaId: e.ZB }, deps));
      expect(zona).toEqual({ status: "not_found" });
    });
  });
});

describeSiHayBase("SLT-54 R24, R45 — activada no lee el modelo viejo", () => {
  /** Un cliente que cuenta quien toca los delegados del modelo viejo, y por lo demas es la transaccion. */
  function clienteQueCuenta(tx: TxDeTest) {
    const lecturas = { viejo: 0, resto: 0 };
    const cliente = new Proxy(clienteConSavepoint(tx) as object, {
      get(objetivo, prop) {
        if (prop === "tarifa" || prop === "tarifaZonaMensajero") lecturas.viejo += 1;
        else lecturas.resto += 1;
        return Reflect.get(objetivo, prop);
      },
    }) as unknown as PrismaClient;
    return { cliente, lecturas };
  }

  it("activada no lee el viejo: sin referencia, sin marca y sin tocar `tarifas`", async () => {
    await conEscenario(async (tx, e) => {
      const antes = clienteQueCuenta(tx);
      const sinActivar = await comoEmpresa(tx, e.A, () =>
        new TarifasPantallaService(new TarifasPantallaRepository(antes.cliente)).cargarZona({ zonaId: e.Z }, e.maestroA),
      );
      // El contador funciona: sin activar, el mismo camino si llega al viejo.
      expect(antes.lecturas.viejo).toBeGreaterThan(0);
      if (sinActivar.status !== "ok") throw new Error(sinActivar.status);
      expect(sinActivar.referencia).not.toBeNull();

      await sembrarActivacion(tx, e.A);
      const despues = clienteQueCuenta(tx);
      const activada = await comoEmpresa(tx, e.A, () =>
        new TarifasPantallaService(new TarifasPantallaRepository(despues.cliente)).cargarZona({ zonaId: e.Z, tiendaId: e.tiendaPropia }, e.maestroA),
      );
      if (activada.status !== "ok") throw new Error(activada.status);
      expect(activada.referencia).toBeNull();
      expect(despues.lecturas.viejo).toBe(0);
      expect(despues.lecturas.resto).toBeGreaterThan(0);
      // R45: tras activar la marca no se muestra, aunque siga en la base.
      expect(activada.distritos.map((d) => d.zonaEspecial)).toEqual([false, false, false, false]);
      expect(activada.distritos.length).toBe(4);
      expect(await tx.distritoZonaEspecial.count({ where: { organizacionId: e.A } })).toBe(2);
    });
  });

  it("la pantalla dice desde cuándo rige solo a la empresa activada", async () => {
    await conEscenario(async (tx, e) => {
      await sembrarActivacion(tx, e.A);
      const res = await comoEmpresa(tx, e.A, () => servicio(tx).cargarPantalla(e.maestroA));
      if (res.status !== "ok") throw new Error(res.status);
      expect(res.activacion?.activadaAt).toBeInstanceOf(Date);
    });
  });
});

describeSiHayBase("SLT-54 R46 — marca y grupo por separado", () => {
  it("marca y grupo por separado: antes de activar calcula la marca y después, el grupo", async () => {
    await conEscenario(async (tx, e) => {
      const app = clienteConSavepoint(tx);
      const servicios = serviciosDeTarifas(app);
      // d1 tiene marca y esta en G1, y el grupo tiene su valor. Ninguno cambia al otro.
      const fijado = await comoEmpresa(tx, e.A, () =>
        servicios.tarifaValor.fijarValor(
          {
            concepto: "tienda_flete_entregado",
            modo: "monto",
            valor: "6000",
            ivaPct: "13",
            zonaId: e.Z,
            grupoId: e.G1,
            tiendaId: null,
            vehiculoId: null,
          },
          e.maestroA,
        ),
      );
      expect(fijado.status).toBe("ok");

      const par = { tiendaId: e.tiendaSinFila, zonaId: e.Z, distritoId: e.d1 };
      const flete = async () => {
        const cobros = await comoEmpresa(tx, e.A, () => resolverCobrosCon(tx, [par]));
        return derivarIngresoOrden(
          { resultado: "entregado", esCentral: false, esZonaEspecial: true, montoCobrar: null, cobraComision: false },
          cobros.get(clavePar(par)) ?? null,
        ).ingreso_flete?.toFixed(2);
      };

      expect(await comoEmpresa(tx, e.A, () => usaModeloNuevo(tx))).toBe(false);
      expect(await flete()).toBe("4100.00");
      const { distritos } = await referenciaDe(tx, e, e.Z);
      expect(distritos.find((d) => d.id === e.d1)).toMatchObject({ zonaEspecial: true, grupoId: e.G1 });

      await sembrarActivacion(tx, e.A);
      expect(await flete()).toBe("6000.00");
      expect(await tx.distritoZonaEspecial.count({ where: { organizacionId: e.A, distritoId: e.d1 } })).toBe(1);
      expect(await tx.grupoDistritosDistrito.count({ where: { grupoId: e.G1, distritoId: e.d1 } })).toBe(1);
    });
  });
});

describeSiHayBase("SLT-54 — los catálogos de la pantalla", () => {
  it("vehículos: todo el catálogo en orden por nombre, con su estado, y sin empresa", async () => {
    await conEscenario(async (tx, e) => {
      const res = await comoEmpresa(tx, e.A, () => servicio(tx).cargarPantalla(e.maestroA));
      if (res.status !== "ok") throw new Error(res.status);
      const nombres = res.vehiculos.map((v) => v.nombre);
      expect(nombres).toEqual([...nombres].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      expect(res.vehiculos.find((v) => v.id === e.moto)?.activo).toBe(true);
      expect(res.vehiculos.find((v) => v.id === e.inactivo)?.activo).toBe(false);
    });
  });

  it("R48: un vehículo dado de alta aparece en la siguiente carga, sin escribir nada en la empresa", async () => {
    await conEscenario(async (tx, e) => {
      const nuevo = (await tx.vehiculo.create({ data: { name: `slt54-alta-${randomUUID().slice(0, 8)}` }, select: { id: true } })).id;
      const res = await comoEmpresa(tx, e.A, () => servicio(tx).cargarPantalla(e.maestroA));
      if (res.status !== "ok") throw new Error(res.status);
      expect(res.vehiculos.map((v) => v.id)).toContain(nuevo);
    });
  });
});
