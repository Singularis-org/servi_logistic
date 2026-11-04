import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/ITarifaValorService";
import { serviciosDeTarifas, type ServiciosDeTarifas } from "@/lib/tarifas/servicios";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-52 T6.4 (design §8; R8, R9, R12, R14, R15) — LA ESCRITURA DE VALORES Y GRUPOS, CONTRA
// POSTGRES REAL Y CON DOS EMPRESAS.
//
// Por que aqui y no con dobles: la unicidad por nivel exacto (NULLS NOT DISTINCT), la cascada de
// R12 y el aislamiento de R15 viven en la BASE (indice, FK, RLS). Los tests de service de T6.2 los
// simulan; este archivo los mide.
//
// TODO DENTRO DE UNA TRANSACCION QUE SIEMPRE SE REVIERTE (`enTransaccionRevertida`): ninguna fila
// sembrada ni escrita aqui llega a commitearse. Las escrituras corren con el rol `servi_app` y la
// empresa A fijada (`comoApp`): la RLS es la que separa empresas, como en produccion. Las
// comprobaciones cruzadas («B sigue intacta») vuelven al dueno con `SET LOCAL ROLE NONE`.
//
// EL CLIENTE QUE RECIBEN LOS REPOSITORIOS (`clienteDeEscritura`): el `tx` del test con un
// `$transaction` que abre un SAVEPOINT REAL (un fallo hace `ROLLBACK TO`, como Postgres con una
// transaccion abortada) y con DOS trampas para R14:
//   · el `historialAccion` del cliente RAIZ lanza: si un repositorio escribe el historial fuera de
//     su transaccion, el caso se pone rojo;
//   · con `fallarTrasHistorial`, el `historialAccion` de DENTRO escribe la fila de verdad y luego
//     lanza: el caso afirma que el savepoint se llevo el cambio Y la fila.
//
// SIN DATOS FALLA: cada caso afirma su PREMISA (lo sembrado existe) antes del efecto, y la siembra
// lanza si falta la geografia. Sin base alcanzable, `describe.skip` VISIBLE.
//
// Los esperados son LITERALES, escritos a mano.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

class FalloTrasElHistorial extends Error {
  constructor() {
    super("fallo PROVOCADO despues de escribir el historial");
    this.name = "FalloTrasElHistorial";
  }
}

class HistorialFueraDeLaTransaccion extends Error {
  constructor() {
    super("el historial se escribio por el cliente raiz, fuera de la transaccion de la escritura");
    this.name = "HistorialFueraDeLaTransaccion";
  }
}

type Delegado = { createMany: (args: unknown) => Promise<unknown> };

function conHistorial(tx: TxDeTest, historial: unknown): object {
  return new Proxy(tx as object, {
    get(objetivo, prop) {
      if (prop === "historialAccion") return historial;
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
}

function clienteDeEscritura(tx: TxDeTest, opciones: { fallarTrasHistorial?: boolean } = {}): PrismaClient {
  const real = Reflect.get(tx, "historialAccion") as Delegado;
  const historialDentro: unknown = opciones.fallarTrasHistorial
    ? {
        createMany: async (args: unknown) => {
          await real.createMany(args);
          throw new FalloTrasElHistorial();
        },
      }
    : real;
  const dentro = conHistorial(tx, historialDentro);
  const historialFuera = {
    createMany: () => {
      throw new HistorialFueraDeLaTransaccion();
    },
  };
  const raiz = new Proxy(tx as object, {
    get(objetivo, prop) {
      if (prop === "historialAccion") return historialFuera;
      if (prop === "$transaction") {
        return async (fn: (t: unknown) => unknown) => {
          const punto = `sp_${randomUUID().replace(/-/g, "")}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
          try {
            const salida = await fn(dentro);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
            return salida;
          } catch (error) {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
            throw error;
          }
        };
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
  return raiz as PrismaClient;
}

/** Vuelve al dueno dentro de la misma transaccion: sin RLS, para medir las dos empresas. */
async function comoDueno(tx: TxDeTest): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
}

interface Escenario {
  tx: TxDeTest;
  A: string;
  B: string;
  /** Zona de A con d1..d4 en `zona_distrito`. */
  Z: string;
  d1: string;
  d2: string;
  d3: string;
  d4: string;
  V: string;
  maestro: Actor;
  /** Zona de B (con d1, d2), su grupo GB (con d1) y su valor VB (zona, 7777.00). */
  ZB: string;
  GB: string;
  VB: string;
  s: ServiciosDeTarifas;
}

async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().slice(0, 8);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;

  // ---- Empresa B: lo que A no debe alcanzar ---------------------------------------------------
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
  await tx.zonaDistrito.createMany({
    data: [
      { zonaId: ZB, distritoId: d1 },
      { zonaId: ZB, distritoId: d2 },
    ],
  });
  const GB = (await tx.grupoDistritos.create({ data: { zonaId: ZB, nombre: "GB" }, select: { id: true } })).id;
  await tx.grupoDistritosDistrito.create({ data: { grupoId: GB, zonaId: ZB, distritoId: d1 } });
  const VB = (
    await tx.tarifaValor.create({
      data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "7777.00", ivaPct: "13.00", zonaId: ZB },
      select: { id: true },
    })
  ).id;

  // ---- Empresa A: la activa -------------------------------------------------------------------
  await fijarEmpresa(tx, A);
  const fksA = await crearFksDeOrden(tx);
  const Z = fksA.zonaId;
  await tx.zonaDistrito.createMany({
    data: [d1, d2, d3, d4].map((distritoId) => ({ zonaId: Z, distritoId })),
  });
  const maestroA = await crearUsuarioDePrueba(tx, "maestro");
  const V = (await tx.vehiculo.create({ data: { name: `slt52-t64-${sufijo}` }, select: { id: true } })).id;

  // Desde aqui, todo como la app: `servi_app` con la empresa A.
  await comoApp(tx, A);
  return {
    tx,
    A,
    B,
    Z,
    d1,
    d2,
    d3,
    d4,
    V,
    maestro: { usuarioId: maestroA.id, rol: "maestro" },
    ZB,
    GB,
    VB,
    s: serviciosDeTarifas(clienteDeEscritura(tx)),
  };
}

interface FilaHistorial {
  accion: string;
  entidadId: string;
  actorUsuarioId: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
}

async function historialDe(tx: TxDeTest, entidadId: string): Promise<FilaHistorial[]> {
  const filas = await tx.historialAccion.findMany({
    where: { entidadId },
    select: { accion: true, entidadId: true, actorUsuarioId: true, valorAnterior: true, valorNuevo: true },
  });
  // Misma transaccion = mismo `now()`: se ordena por contenido para comparar con un literal.
  return filas.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function valoresDeLaZona(tx: TxDeTest, zonaId: string) {
  const filas = await tx.tarifaValor.findMany({
    where: { zonaId },
    select: { id: true, concepto: true, valor: true, ivaPct: true, grupoId: true, vehiculoId: true },
    // `concepto` es un enum: Postgres ordena por su posicion en el tipo (los cobros antes que los pagos).
    orderBy: [{ concepto: "asc" }, { valor: "asc" }],
  });
  return filas.map((f) => ({
    id: f.id,
    concepto: f.concepto,
    valor: f.valor.toFixed(2),
    ivaPct: f.ivaPct === null ? null : f.ivaPct.toFixed(2),
    grupoId: f.grupoId,
    vehiculoId: f.vehiculoId,
  }));
}

async function distritosDelGrupo(tx: TxDeTest, grupoId: string): Promise<string[]> {
  const filas = await tx.grupoDistritosDistrito.findMany({
    where: { grupoId },
    select: { distritoId: true },
    orderBy: { distritoId: "asc" },
  });
  return filas.map((f) => f.distritoId);
}

function cobroDeZona(zonaId: string, valor: string) {
  return {
    concepto: "tienda_flete_entregado" as const,
    modo: "monto" as const,
    valor,
    ivaPct: "13",
    zonaId,
    grupoId: null,
    tiendaId: null,
    vehiculoId: null,
  };
}

async function crearGrupoOk(e: Escenario, nombre: string, distritoIds: string[]): Promise<string> {
  const r = await e.s.grupoDistritos.crearGrupo({ zonaId: e.Z, nombre, distritoIds }, e.maestro);
  if (r.status !== "ok") throw new Error(`crear grupo ${nombre}: ${JSON.stringify(r)}`);
  return r.id;
}

describeSiHayBase("SLT-52 T6.4 — escritura de valores y grupos (Postgres real, dos empresas)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const conEscenario = (fn: (e: Escenario) => Promise<void>) =>
    enTransaccionRevertida(prisma, async (tx) => fn(await sembrar(tx)));

  it("R8/R14 — fijar crea; fijar el mismo nivel REEMPLAZA (misma fila); otro nivel es otra fila; cada fijacion deja su historial", async () => {
    await conEscenario(async (e) => {
      // PREMISA: la zona de A empieza sin valores.
      expect(await valoresDeLaZona(e.tx, e.Z)).toEqual([]);

      const r1 = await e.s.tarifaValor.fijarValor(cobroDeZona(e.Z, "1500"), e.maestro);
      if (r1.status !== "ok") throw new Error(`fijar 1: ${JSON.stringify(r1)}`);
      const r2 = await e.s.tarifaValor.fijarValor(cobroDeZona(e.Z, "1800.50"), e.maestro);
      if (r2.status !== "ok") throw new Error(`fijar 2: ${JSON.stringify(r2)}`);
      expect(r2.id).toBe(r1.id);

      // Otro nivel del mismo concepto (grupo) y del pago (zona y zona+vehiculo): filas aparte.
      const G = await crearGrupoOk(e, "Centro", [e.d1]);
      const r3 = await e.s.tarifaValor.fijarValor({ ...cobroDeZona(e.Z, "2100"), grupoId: G }, e.maestro);
      if (r3.status !== "ok") throw new Error(`fijar 3: ${JSON.stringify(r3)}`);
      const pago = { concepto: "mensajero_entregado" as const, modo: "monto" as const, zonaId: e.Z, grupoId: null, tiendaId: null };
      const r4 = await e.s.tarifaValor.fijarValor({ ...pago, valor: "900", vehiculoId: null }, e.maestro);
      if (r4.status !== "ok") throw new Error(`fijar 4: ${JSON.stringify(r4)}`);
      const r5 = await e.s.tarifaValor.fijarValor({ ...pago, valor: "950", vehiculoId: e.V }, e.maestro);
      if (r5.status !== "ok") throw new Error(`fijar 5: ${JSON.stringify(r5)}`);

      expect(await valoresDeLaZona(e.tx, e.Z)).toEqual([
        { id: r1.id, concepto: "tienda_flete_entregado", valor: "1800.50", ivaPct: "13.00", grupoId: null, vehiculoId: null },
        { id: r3.id, concepto: "tienda_flete_entregado", valor: "2100.00", ivaPct: "13.00", grupoId: G, vehiculoId: null },
        { id: r4.id, concepto: "mensajero_entregado", valor: "900.00", ivaPct: null, grupoId: null, vehiculoId: null },
        { id: r5.id, concepto: "mensajero_entregado", valor: "950.00", ivaPct: null, grupoId: null, vehiculoId: e.V },
      ]);

      // R14: una fila por fijacion, con el actor y el antes/despues.
      expect(await historialDe(e.tx, r1.id)).toEqual([
        { accion: "tarifa_valor_fijado", entidadId: r1.id, actorUsuarioId: e.maestro.usuarioId, valorAnterior: "monto 1500.00 IVA 13.00", valorNuevo: "monto 1800.50 IVA 13.00" },
        { accion: "tarifa_valor_fijado", entidadId: r1.id, actorUsuarioId: e.maestro.usuarioId, valorAnterior: null, valorNuevo: "monto 1500.00 IVA 13.00" },
      ]);
      expect(await historialDe(e.tx, r5.id)).toEqual([
        { accion: "tarifa_valor_fijado", entidadId: r5.id, actorUsuarioId: e.maestro.usuarioId, valorAnterior: null, valorNuevo: "monto 950.00" },
      ]);
    });
  });

  it("R9/R14 — quitar borra la fila y deja historial; quitarla otra vez es not_found y no deja otra fila", async () => {
    await conEscenario(async (e) => {
      const r = await e.s.tarifaValor.fijarValor(cobroDeZona(e.Z, "1500"), e.maestro);
      if (r.status !== "ok") throw new Error(`fijar: ${JSON.stringify(r)}`);
      expect(await valoresDeLaZona(e.tx, e.Z)).toHaveLength(1);

      expect(await e.s.tarifaValor.quitarValor(r.id, e.maestro)).toEqual({ status: "ok" });
      expect(await valoresDeLaZona(e.tx, e.Z)).toEqual([]);
      expect(await e.s.tarifaValor.quitarValor(r.id, e.maestro)).toEqual({ status: "not_found" });

      expect(await historialDe(e.tx, r.id)).toEqual([
        { accion: "tarifa_valor_fijado", entidadId: r.id, actorUsuarioId: e.maestro.usuarioId, valorAnterior: null, valorNuevo: "monto 1500.00 IVA 13.00" },
        { accion: "tarifa_valor_quitado", entidadId: r.id, actorUsuarioId: e.maestro.usuarioId, valorAnterior: "monto 1500.00 IVA 13.00", valorNuevo: null },
      ]);
    });
  });

  it("R12/R14 — crear grupos, mover un distrito entre ellos y borrar uno: sus distritos y sus valores se van por CASCADE", async () => {
    await conEscenario(async (e) => {
      const G1 = await crearGrupoOk(e, "Norte", [e.d1, e.d2]);
      const G2 = await crearGrupoOk(e, "Sur", [e.d3]);
      expect(await distritosDelGrupo(e.tx, G1)).toEqual([e.d1, e.d2].sort());
      expect(await distritosDelGrupo(e.tx, G2)).toEqual([e.d3]);

      const filaDeD3 = async () =>
        (await e.tx.grupoDistritosDistrito.findFirstOrThrow({ where: { grupoId: G2, distritoId: e.d3 } })).id;
      const d3Antes = await filaDeD3();

      // Mover d1 de Norte a Sur: primero sale de Norte, luego entra en Sur (R11 impide tenerlo en dos).
      expect(await e.s.grupoDistritos.fijarDistritos(G1, [e.d2], e.maestro)).toEqual({ status: "ok" });
      expect(await e.s.grupoDistritos.fijarDistritos(G2, [e.d3, e.d1], e.maestro)).toEqual({ status: "ok" });
      expect(await distritosDelGrupo(e.tx, G1)).toEqual([e.d2]);
      expect(await distritosDelGrupo(e.tx, G2)).toEqual([e.d1, e.d3].sort());
      // El distrito que se queda no se toca (design §8): su fila es la misma, no una recreada.
      expect(await filaDeD3()).toBe(d3Antes);

      // Dos valores en Sur y uno de zona que no es del grupo.
      const deZona = await e.s.tarifaValor.fijarValor(cobroDeZona(e.Z, "1000"), e.maestro);
      const enSur = await e.s.tarifaValor.fijarValor({ ...cobroDeZona(e.Z, "1100"), grupoId: G2 }, e.maestro);
      const enSurPago = await e.s.tarifaValor.fijarValor(
        { concepto: "mensajero_entregado", modo: "monto", valor: "800", zonaId: e.Z, grupoId: G2, tiendaId: null, vehiculoId: null },
        e.maestro,
      );
      if (deZona.status !== "ok" || enSur.status !== "ok" || enSurPago.status !== "ok") {
        throw new Error("siembra de valores fallida");
      }
      expect(await valoresDeLaZona(e.tx, e.Z)).toHaveLength(3);

      expect(await e.s.grupoDistritos.borrarGrupo(G2, e.maestro)).toEqual({ status: "ok" });

      expect(await e.tx.grupoDistritos.count({ where: { id: G2 } })).toBe(0);
      expect(await distritosDelGrupo(e.tx, G2)).toEqual([]);
      expect((await valoresDeLaZona(e.tx, e.Z)).map((v) => v.id)).toEqual([deZona.id]);
      // Norte no se toca.
      expect(await distritosDelGrupo(e.tx, G1)).toEqual([e.d2]);

      expect(await historialDe(e.tx, G1)).toEqual([
        { accion: "grupo_distritos_cambiado", entidadId: G1, actorUsuarioId: e.maestro.usuarioId, valorAnterior: "2 distritos", valorNuevo: "1 distrito" },
        { accion: "grupo_distritos_creado", entidadId: G1, actorUsuarioId: e.maestro.usuarioId, valorAnterior: null, valorNuevo: "2 distritos" },
      ]);
      expect(await historialDe(e.tx, G2)).toEqual([
        { accion: "grupo_distritos_borrado", entidadId: G2, actorUsuarioId: e.maestro.usuarioId, valorAnterior: "2 distritos, 2 valores", valorNuevo: null },
        { accion: "grupo_distritos_cambiado", entidadId: G2, actorUsuarioId: e.maestro.usuarioId, valorAnterior: "1 distrito", valorNuevo: "2 distritos" },
        { accion: "grupo_distritos_creado", entidadId: G2, actorUsuarioId: e.maestro.usuarioId, valorAnterior: null, valorNuevo: "1 distrito" },
      ]);
    });
  });

  it("R14 — si algo falla DESPUES de escribir el historial, el savepoint se lleva el cambio Y su fila de historial", async () => {
    await conEscenario(async (e) => {
      const G = await crearGrupoOk(e, "Oeste", [e.d4]);
      const v = await e.s.tarifaValor.fijarValor(cobroDeZona(e.Z, "1500"), e.maestro);
      if (v.status !== "ok") throw new Error("siembra fallida");
      const historialAntes = await e.tx.historialAccion.count();
      const valoresAntes = await valoresDeLaZona(e.tx, e.Z);
      // PREMISA: hay algo que perder.
      expect(valoresAntes).toHaveLength(1);
      expect(await distritosDelGrupo(e.tx, G)).toEqual([e.d4]);

      const roto = serviciosDeTarifas(clienteDeEscritura(e.tx, { fallarTrasHistorial: true }));
      await expect(roto.tarifaValor.fijarValor(cobroDeZona(e.Z, "9999"), e.maestro)).rejects.toThrow(FalloTrasElHistorial);
      await expect(roto.tarifaValor.quitarValor(v.id, e.maestro)).rejects.toThrow(FalloTrasElHistorial);
      await expect(roto.grupoDistritos.crearGrupo({ zonaId: e.Z, nombre: "Fantasma", distritoIds: [e.d3] }, e.maestro)).rejects.toThrow(FalloTrasElHistorial);
      await expect(roto.grupoDistritos.fijarDistritos(G, [e.d3], e.maestro)).rejects.toThrow(FalloTrasElHistorial);
      await expect(roto.grupoDistritos.borrarGrupo(G, e.maestro)).rejects.toThrow(FalloTrasElHistorial);

      expect(await e.tx.historialAccion.count()).toBe(historialAntes);
      expect(await valoresDeLaZona(e.tx, e.Z)).toEqual(valoresAntes);
      expect(await distritosDelGrupo(e.tx, G)).toEqual([e.d4]);
      expect(await e.tx.grupoDistritos.count({ where: { zonaId: e.Z } })).toBe(1);
    });
  });

  it("R15 — con la empresa A activa no se lee, ni se escribe, ni se borra nada de B (tampoco con SQL a mano)", async () => {
    await conEscenario(async (e) => {
      // PREMISA, como dueno: lo de B existe.
      await comoDueno(e.tx);
      expect((await e.tx.tarifaValor.findUniqueOrThrow({ where: { id: e.VB } })).valor.toFixed(2)).toBe("7777.00");
      expect(await distritosDelGrupo(e.tx, e.GB)).toEqual([e.d1]);
      await comoApp(e.tx, e.A);

      // Lecturas.
      const listado = await e.s.tarifaValor.listarValores({}, e.maestro);
      expect(listado).toEqual({ status: "ok", items: [] });
      expect(await e.s.tarifaValor.listarValores({ zonaId: e.ZB }, e.maestro)).toEqual({ status: "ok", items: [] });
      expect(await e.s.grupoDistritos.listarGrupos(e.ZB, e.maestro)).toEqual({ status: "ok", items: [] });

      // Escrituras sobre filas de B: no existen para A.
      expect(await e.s.tarifaValor.quitarValor(e.VB, e.maestro)).toEqual({ status: "not_found" });
      expect(await e.s.grupoDistritos.renombrarGrupo(e.GB, "Robado", e.maestro)).toEqual({ status: "not_found" });
      expect(await e.s.grupoDistritos.fijarDistritos(e.GB, [e.d2], e.maestro)).toEqual({ status: "not_found" });
      expect(await e.s.grupoDistritos.borrarGrupo(e.GB, e.maestro)).toEqual({ status: "not_found" });

      // Escrituras que apuntan a la zona de B.
      const fijarEnB = await e.s.tarifaValor.fijarValor(cobroDeZona(e.ZB, "1"), e.maestro);
      expect(fijarEnB.status).toBe("validation_error");
      const grupoEnB = await e.s.grupoDistritos.crearGrupo({ zonaId: e.ZB, nombre: "Intruso", distritoIds: [e.d2] }, e.maestro);
      expect(grupoEnB.status).toBe("validation_error");

      // SQL a mano, como `servi_app` con A.
      const visibles = await e.tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "tarifa_valor" WHERE "id" = $1`,
        e.VB,
      );
      expect(visibles).toEqual([{ n: 0 }]);
      expect(await e.tx.$executeRawUnsafe(`UPDATE "tarifa_valor" SET "valor" = 0 WHERE "id" = $1`, e.VB)).toBe(0);
      expect(await e.tx.$executeRawUnsafe(`DELETE FROM "grupo_distritos" WHERE "id" = $1`, e.GB)).toBe(0);

      // Como dueno: B sigue exactamente igual y sin historial nuevo.
      await comoDueno(e.tx);
      const vb = await e.tx.tarifaValor.findUniqueOrThrow({ where: { id: e.VB } });
      expect([vb.organizacionId, vb.valor.toFixed(2), vb.zonaId]).toEqual([e.B, "7777.00", e.ZB]);
      const gb = await e.tx.grupoDistritos.findUniqueOrThrow({ where: { id: e.GB } });
      expect([gb.organizacionId, gb.nombre]).toEqual([e.B, "GB"]);
      expect(await distritosDelGrupo(e.tx, e.GB)).toEqual([e.d1]);
      expect(await e.tx.tarifaValor.count({ where: { zonaId: e.ZB } })).toBe(1);
      expect(await e.tx.grupoDistritos.count({ where: { zonaId: e.ZB } })).toBe(1);
      expect(await e.tx.historialAccion.count({ where: { entidadId: { in: [e.VB, e.GB] } } })).toBe(0);
    });
  });
});
