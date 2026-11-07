import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient, type TarifaConcepto } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/ITarifaValorService";
import { resolverPagosCon } from "@/lib/repositories/_shared/resolver-tarifas";
import { serviciosDeTarifas, type ServiciosDeTarifas } from "@/lib/tarifas/servicios";
import type { ContextoPagoGestion, FijarValorInput } from "@/lib/types/tarifa-flexible";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SLT-55 T1.4 (R1-R4, R6-R11, R26) — LA ESCRITURA DEL VALOR PROPIO DEL MENSAJERO, CONTRA POSTGRES REAL Y
// CON DOS EMPRESAS, por `serviciosDeTarifas`: la misma raiz de composicion que usa la action.
//
// Por que aqui y no con dobles: el rol y el estado del mensajero viven en un `WHERE`, la unicidad en un
// indice NULLS NOT DISTINCT, la misma empresa en un trigger y el borrado en dos FK. Un doble no ve nada de eso.
//
// TODO DENTRO DE UNA TRANSACCION QUE SE REVIERTE. Las escrituras corren con `servi_app` y la empresa A
// fijada (`comoApp`): la RLS separa empresas, como en produccion. Cada caso afirma su PREMISA y la siembra
// lanza si falta algo: sin base, `describe.skip` VISIBLE; con base, nunca un verde sin datos.
//
// Los esperados son LITERALES, escritos a mano.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const MENSAJE_NO_ELEGIBLE = "El mensajero no existe, no es de la empresa o está dado de baja: no admite un valor nuevo.";
const NO_ELEGIBLE = { status: "validation_error", fieldErrors: { mensajeroId: [MENSAJE_NO_ELEGIBLE] } };

const CONCEPTOS_DEL_MENSAJERO: TarifaConcepto[] = [
  "mensajero_entregado",
  "mensajero_reprogramado",
  "mensajero_novedad",
  "mensajero_rechazo",
  "mensajero_incidente",
];

interface Escenario {
  tx: TxDeTest;
  A: string;
  B: string;
  fks: FksDeOrden;
  Z: string;
  V: string;
  /** Ana Torres, mensajero activo de A. */
  M: string;
  /** Mensajero activo de B: lo que A no debe alcanzar. */
  MB: string;
  adminId: string;
  maestro: Actor;
  s: ServiciosDeTarifas;
}

async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;

  await fijarEmpresa(tx, B);
  const MB = (await crearUsuarioDePrueba(tx, "mensajero")).id;

  await fijarEmpresa(tx, A);
  const fks = await crearFksDeOrden(tx);
  await sembrarActivacion(tx, A);
  const maestroA = await crearUsuarioDePrueba(tx, "maestro");
  const adminId = (await crearUsuarioDePrueba(tx, "admin")).id;
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  await tx.usuario.update({ where: { id: M }, data: { nombre: "Ana", primerApellido: "Torres" } });
  const V = (await tx.vehiculo.create({ data: { name: `slt55-${randomUUID().slice(0, 8)}` }, select: { id: true } })).id;

  await comoApp(tx, A);
  return {
    tx,
    A,
    B,
    fks,
    Z: fks.zonaId,
    V,
    M,
    MB,
    adminId,
    maestro: { usuarioId: maestroA.id, rol: "maestro" },
    s: serviciosDeTarifas(clienteConSavepoint(tx)),
  };
}

function propio(mensajeroId: string, o: Partial<FijarValorInput> = {}): FijarValorInput {
  return {
    concepto: "mensajero_entregado",
    modo: "monto",
    valor: "2900",
    zonaId: null,
    grupoId: null,
    tiendaId: null,
    vehiculoId: null,
    mensajeroId,
    ...o,
  };
}

async function fijarOk(e: Escenario, input: FijarValorInput): Promise<string> {
  const r = await e.s.tarifaValor.fijarValor(input, e.maestro);
  if (r.status !== "ok") throw new Error(`fijar ${input.concepto}: ${JSON.stringify(r)}`);
  return r.id;
}

/** Los valores propios de ese usuario tal como quedaron en la base, ordenados por concepto. */
async function propiosDe(tx: TxDeTest, mensajeroId: string) {
  const filas = await tx.tarifaValor.findMany({ where: { mensajeroId }, orderBy: { concepto: "asc" } });
  return filas.map((f) => ({ id: f.id, concepto: f.concepto, modo: f.modo, valor: f.valor.toFixed(2) }));
}

async function historialDe(tx: TxDeTest, entidadId: string) {
  const filas = await tx.historialAccion.findMany({
    where: { entidadId },
    select: { accion: true, entidadEtiqueta: true, actorUsuarioId: true, valorAnterior: true, valorNuevo: true },
  });
  // Misma transaccion = mismo `now()`: se ordena por contenido para comparar con un literal.
  return filas.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** El pago que el resolver da hoy a `mensajeroId` por una entrega en la zona Z. */
async function pagoDeEntrega(e: Escenario, mensajeroId: string) {
  const c: ContextoPagoGestion = {
    gestionId: "g-1",
    resultado: "entregado",
    mensajeroId,
    zonaId: e.Z,
    vehiculoId: null,
    distritoId: null,
    tiendaId: e.fks.tiendaId,
    zonaOrdenId: e.Z,
    montoCobrar: "10000.00",
    cobraComision: false,
  };
  const pago = (await resolverPagosCon(e.tx, [c])).get("g-1");
  if (pago === undefined || pago === null || pago.modelo !== "nuevo") {
    throw new Error(`se esperaba el modelo nuevo y llego ${JSON.stringify(pago)}`);
  }
  return pago.mensajero === null ? null : { valor: pago.mensajero.valor, nivel: pago.mensajero.nivel };
}

/**
 * Dos fijaciones simultaneas: la que pierde leyo «no hay fila» antes de que la otra confirmara. Se reproduce
 * sin hilos: dentro de la transaccion de `fijar`, la lectura del nivel no ve nada y el `create` choca de
 * verdad contra `tarifa_valor_nivel_key`. El P2002 es el de Postgres, no uno fabricado.
 */
function clienteQueNoVeElNivel(tx: TxDeTest): PrismaClient {
  const base = clienteConSavepoint(tx);
  const conLecturaVacia = (t: object): object =>
    new Proxy(t, {
      get(objetivo, prop) {
        const real = Reflect.get(objetivo, prop) as unknown;
        if (prop !== "tarifaValor") return typeof real === "function" ? real.bind(objetivo) : real;
        return new Proxy(real as object, {
          get(delegado, metodo) {
            if (metodo === "findFirst") return async () => null;
            const m = Reflect.get(delegado, metodo) as unknown;
            return typeof m === "function" ? m.bind(delegado) : m;
          },
        });
      },
    });
  return new Proxy(base, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        return (fn: (t: object) => unknown) =>
          (objetivo.$transaction as unknown as (f: (t: object) => unknown) => unknown)((t) => fn(conLecturaVacia(t)));
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
}

/** SQL a mano, en su savepoint: devuelve el error de Postgres como texto, o `null` si paso. */
async function sqlRechazado(tx: TxDeTest, sql: string, ...params: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$executeRawUnsafe(sql, ...params);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return error instanceof Error ? error.message : String(error);
  }
}

const INSERT_PROPIO = `INSERT INTO "tarifa_valor" ("id", "concepto", "modo", "valor", "mensajero_id")
  VALUES (gen_random_uuid()::text, 'mensajero_entregado', 'monto', 100, $1)`;

describeSiHayBase("SLT-55 T1.4 — escritura del valor propio (Postgres real, dos empresas)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const conEscenario = (fn: (e: Escenario) => Promise<void>) =>
    enTransaccionRevertida(prisma, async (tx) => fn(await sembrar(tx)));

  it("R1 — guarda modo y valor como valor propio, sin zona, grupo, tienda ni vehículo", async () => {
    await conEscenario(async (e) => {
      expect(await propiosDe(e.tx, e.M)).toEqual([]);

      const monto = await fijarOk(e, propio(e.M));
      const pct = await fijarOk(e, propio(e.M, { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "20" }));

      const filas = await e.tx.tarifaValor.findMany({ where: { id: { in: [monto, pct] } }, orderBy: { valor: "asc" } });
      expect(
        filas.map((f) => ({
          concepto: f.concepto,
          modo: f.modo,
          valor: f.valor.toFixed(2),
          ivaPct: f.ivaPct,
          zonaId: f.zonaId,
          grupoId: f.grupoId,
          tiendaId: f.tiendaId,
          vehiculoId: f.vehiculoId,
          mensajeroId: f.mensajeroId,
          organizacionId: f.organizacionId,
        })),
      ).toEqual([
        { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "20.00", ivaPct: null, zonaId: null, grupoId: null, tiendaId: null, vehiculoId: null, mensajeroId: e.M, organizacionId: e.A },
        { concepto: "mensajero_entregado", modo: "monto", valor: "2900.00", ivaPct: null, zonaId: null, grupoId: null, tiendaId: null, vehiculoId: null, mensajeroId: e.M, organizacionId: e.A },
      ]);

      const lectura = await e.s.tarifaValor.listarValores({}, e.maestro);
      if (lectura.status !== "ok") throw new Error("listar");
      expect(lectura.items.map((v) => [v.concepto, v.nivel, v.mensajeroId])).toEqual([
        ["mensajero_entregado", "mensajero", e.M],
        ["mensajero_rechazo", "mensajero", e.M],
      ]);
    });
  });

  it("R2 — un valor por cada uno de los 5 resultados; fijar o quitar uno no cambia los otros", async () => {
    await conEscenario(async (e) => {
      const ids: Partial<Record<TarifaConcepto, string>> = {};
      for (const [i, concepto] of CONCEPTOS_DEL_MENSAJERO.entries()) {
        ids[concepto] = await fijarOk(e, propio(e.M, { concepto, valor: String(100 + i) }));
      }
      expect(new Set(Object.values(ids)).size).toBe(5);
      expect(await propiosDe(e.tx, e.M)).toEqual([
        { id: ids.mensajero_entregado, concepto: "mensajero_entregado", modo: "monto", valor: "100.00" },
        { id: ids.mensajero_reprogramado, concepto: "mensajero_reprogramado", modo: "monto", valor: "101.00" },
        { id: ids.mensajero_novedad, concepto: "mensajero_novedad", modo: "monto", valor: "102.00" },
        { id: ids.mensajero_rechazo, concepto: "mensajero_rechazo", modo: "monto", valor: "103.00" },
        { id: ids.mensajero_incidente, concepto: "mensajero_incidente", modo: "monto", valor: "104.00" },
      ]);

      await fijarOk(e, propio(e.M, { concepto: "mensajero_novedad", valor: "999" }));
      expect(await e.s.tarifaValor.quitarValor(ids.mensajero_rechazo as string, e.maestro)).toEqual({ status: "ok" });

      expect(await propiosDe(e.tx, e.M)).toEqual([
        { id: ids.mensajero_entregado, concepto: "mensajero_entregado", modo: "monto", valor: "100.00" },
        { id: ids.mensajero_reprogramado, concepto: "mensajero_reprogramado", modo: "monto", valor: "101.00" },
        { id: ids.mensajero_novedad, concepto: "mensajero_novedad", modo: "monto", valor: "999.00" },
        { id: ids.mensajero_incidente, concepto: "mensajero_incidente", modo: "monto", valor: "104.00" },
      ]);
    });
  });

  it("R3 — fijar de nuevo reemplaza la misma fila, también de monto a porcentaje; dos mensajeros son dos filas", async () => {
    await conEscenario(async (e) => {
      const otro = (await crearOtroMensajero(e)).id;
      const id = await fijarOk(e, propio(e.M, { valor: "2900" }));
      expect(await fijarOk(e, propio(e.M, { modo: "porcentaje", valor: "15" }))).toBe(id);
      const delOtro = await fijarOk(e, propio(otro, { valor: "1000" }));
      expect(delOtro).not.toBe(id);

      expect(await propiosDe(e.tx, e.M)).toEqual([{ id, concepto: "mensajero_entregado", modo: "porcentaje", valor: "15.00" }]);
      expect(await propiosDe(e.tx, otro)).toEqual([{ id: delOtro, concepto: "mensajero_entregado", modo: "monto", valor: "1000.00" }]);
    });
  });

  it("R3 — dos fijaciones que chocan: una queda y la otra responde el error de SLT-52 R8 en la fila, sin historial", async () => {
    await conEscenario(async (e) => {
      const id = await fijarOk(e, propio(e.M, { valor: "2900" }));
      const antes = await historialDe(e.tx, id);
      expect(antes).toHaveLength(1);

      const perdedora = serviciosDeTarifas(clienteQueNoVeElNivel(e.tx)).tarifaValor;
      expect(await perdedora.fijarValor(propio(e.M, { valor: "3100" }), e.maestro)).toEqual({
        status: "validation_error",
        fieldErrors: {
          concepto: ["Otro cambio fijó este concepto en el mismo nivel al mismo tiempo. Recarga y vuelve a intentarlo."],
        },
      });

      expect(await propiosDe(e.tx, e.M)).toEqual([{ id, concepto: "mensajero_entregado", modo: "monto", valor: "2900.00" }]);
      expect(await historialDe(e.tx, id)).toEqual(antes);
    });
  });

  it("R4 — quitar borra la fila y ese resultado pasa a resolverse con el nivel siguiente", async () => {
    await conEscenario(async (e) => {
      await fijarOk(e, { ...propio(e.M), mensajeroId: null, zonaId: e.Z, valor: "505" });
      const id = await fijarOk(e, propio(e.M, { valor: "501" }));
      expect(await pagoDeEntrega(e, e.M)).toEqual({ valor: "501.00", nivel: "mensajero" });

      expect(await e.s.tarifaValor.quitarValor(id, e.maestro)).toEqual({ status: "ok" });

      expect(await propiosDe(e.tx, e.M)).toEqual([]);
      expect(await pagoDeEntrega(e, e.M)).toEqual({ valor: "505.00", nivel: "zona" });
    });
  });

  it.each([
    ["trae IVA 0", { ivaPct: "0" }, "ivaPct"],
    ["trae IVA 13", { ivaPct: "13" }, "ivaPct"],
    ["es negativo", { valor: "-1" }, "valor"],
    ["es un porcentaje mayor que 100", { modo: "porcentaje", valor: "100.01" }, "valor"],
  ] as const)("R5 — si %s, responde validation_error en %s y no escribe", async (_caso, cambio, campo) => {
    await conEscenario(async (e) => {
      const r = await e.s.tarifaValor.fijarValor(propio(e.M, cambio), e.maestro);
      if (r.status !== "validation_error") throw new Error(`se esperaba rechazo: ${JSON.stringify(r)}`);
      expect(Object.keys(r.fieldErrors)).toEqual([campo]);
      expect(await e.tx.tarifaValor.count()).toBe(0);
    });
  });

  it("R6 — mensajero con otro nivel, o en un concepto ajeno, se rechaza sin escribir nada: nunca cae a otro nivel", async () => {
    await conEscenario(async (e) => {
      const casos: [string, FijarValorInput, string][] = [
        ["con zona", propio(e.M, { zonaId: e.Z }), "mensajeroId"],
        ["con grupo", propio(e.M, { zonaId: e.Z, grupoId: "g-x" }), "mensajeroId"],
        ["con vehículo", propio(e.M, { vehiculoId: e.V }), "mensajeroId"],
        ["con zona y vehículo", propio(e.M, { zonaId: e.Z, vehiculoId: e.V }), "mensajeroId"],
        ["con tienda", propio(e.M, { tiendaId: e.fks.tiendaId }), "tiendaId"],
        ["en un concepto de la satélite", propio(e.M, { concepto: "satelite_entregado", zonaId: e.Z }), "mensajeroId"],
        ["en un concepto de la tienda", propio(e.M, { concepto: "tienda_flete_entregado", ivaPct: "13", zonaId: e.Z }), "mensajeroId"],
      ];
      for (const [caso, input, campo] of casos) {
        const r = await e.s.tarifaValor.fijarValor(input, e.maestro);
        if (r.status !== "validation_error") throw new Error(`${caso}: se esperaba rechazo y llego ${JSON.stringify(r)}`);
        expect([caso, Object.keys(r.fieldErrors)]).toEqual([caso, [campo]]);
      }
      // El defecto que esto cierra: la fila sin mensajero, en la ZONA, que pagaria a todos sus mensajeros.
      expect(await e.tx.tarifaValor.count()).toBe(0);
      expect(await e.tx.historialAccion.count({ where: { entidadTipo: "tarifa_valor" } })).toBe(0);
    });
  });

  it("R7 — rol admin, rol adminTienda, id inexistente y mensajero de B: validation_error en mensajeroId sin escribir", async () => {
    await conEscenario(async (e) => {
      const casos: [string, string][] = [
        ["rol admin", e.adminId],
        ["rol adminTienda", e.fks.tiendaId],
        ["id inexistente", randomUUID()],
        ["mensajero de B", e.MB],
      ];
      for (const [caso, id] of casos) {
        expect([caso, await e.s.tarifaValor.fijarValor(propio(id), e.maestro)]).toEqual([caso, NO_ELEGIBLE]);
      }
      expect(await e.tx.tarifaValor.count()).toBe(0);

      // Como dueno, sin RLS: tampoco quedo nada en B, y el control: A si fija a su propio mensajero.
      await e.tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
      expect(await e.tx.tarifaValor.count({ where: { mensajeroId: e.MB } })).toBe(0);
      await comoApp(e.tx, e.A);
      await fijarOk(e, propio(e.M));
      expect(await e.tx.tarifaValor.count()).toBe(1);
    });
  });

  it.each(["inactivo", "bloqueado"] as const)(
    "R8 — %s: sin valor se rechaza en mensajeroId; con valor se reemplaza y se quita, y otro resultado sigue rechazado",
    async (estado) => {
      await conEscenario(async (e) => {
        const conValor = await fijarOk(e, propio(e.M, { valor: "2900" }));
        await e.tx.usuario.update({ where: { id: e.M }, data: { estado } });

        expect(await e.s.tarifaValor.fijarValor(propio(e.M, { concepto: "mensajero_novedad" }), e.maestro)).toEqual(NO_ELEGIBLE);

        expect(await fijarOk(e, propio(e.M, { valor: "3000" }))).toBe(conValor);
        expect(await propiosDe(e.tx, e.M)).toEqual([{ id: conValor, concepto: "mensajero_entregado", modo: "monto", valor: "3000.00" }]);

        expect(await e.s.tarifaValor.quitarValor(conValor, e.maestro)).toEqual({ status: "ok" });
        expect(await propiosDe(e.tx, e.M)).toEqual([]);

        // Ya quitado, ese resultado vuelve a ser un valor nuevo.
        expect(await e.s.tarifaValor.fijarValor(propio(e.M, { valor: "3000" }), e.maestro)).toEqual(NO_ELEGIBLE);
      });
    },
  );

  it("R8 — quien dejó de ser mensajero: sin valor se rechaza; con valor se reemplaza y se quita", async () => {
    await conEscenario(async (e) => {
      const conValor = await fijarOk(e, propio(e.M, { valor: "2900" }));
      const rolAdmin = await e.tx.rol.findUniqueOrThrow({ where: { value: "admin" }, select: { id: true } });
      await e.tx.usuario.update({ where: { id: e.M }, data: { rolId: rolAdmin.id } });

      expect(await e.s.tarifaValor.fijarValor(propio(e.M, { concepto: "mensajero_novedad" }), e.maestro)).toEqual(NO_ELEGIBLE);
      expect(await fijarOk(e, propio(e.M, { valor: "3000" }))).toBe(conValor);
      expect(await e.s.tarifaValor.quitarValor(conValor, e.maestro)).toEqual({ status: "ok" });
      expect(await propiosDe(e.tx, e.M)).toEqual([]);
    });
  });

  it("R8 — un usuario pendiente sí admite un valor nuevo: es quien se está dando de alta", async () => {
    await conEscenario(async (e) => {
      await e.tx.usuario.update({ where: { id: e.M }, data: { estado: "pendiente" } });
      const id = await fijarOk(e, propio(e.M));
      expect(await propiosDe(e.tx, e.M)).toEqual([{ id, concepto: "mensajero_entregado", modo: "monto", valor: "2900.00" }]);
    });
  });

  it("R9 — la base rechaza con SQL a mano un valor propio con mensajero de otra empresa", async () => {
    await conEscenario(async (e) => {
      // Control: el MISMO INSERT con el mensajero de A pasa. Si fallara por otra causa, el rechazo no probaria nada.
      expect(await sqlRechazado(e.tx, INSERT_PROPIO, e.M)).toBeNull();
      expect(await e.tx.tarifaValor.count({ where: { mensajeroId: e.M } })).toBe(1);

      const comoAppA = await sqlRechazado(e.tx, INSERT_PROPIO, e.MB);
      expect(comoAppA).toContain("SL017");
      expect(comoAppA).toContain("tarifa_valor.mensajero_id");

      // Como dueno de las tablas no hay RLS: el rechazo solo puede venir del trigger.
      await e.tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
      const comoDueno = await sqlRechazado(e.tx, INSERT_PROPIO, e.MB);
      expect(comoDueno).toContain("SL017");
      expect(comoDueno).toContain("tarifa_valor.mensajero_id");
      expect(await e.tx.tarifaValor.count({ where: { mensajeroId: e.MB } })).toBe(0);
    });
  });

  it("R10 — quien no es maestro recibe forbidden sin escribir; el admin lee y los demás no", async () => {
    await conEscenario(async (e) => {
      const id = await fijarOk(e, propio(e.M, { valor: "2900" }));
      const admin: Actor = { usuarioId: e.adminId, rol: "admin" };
      const mensajero: Actor = { usuarioId: e.M, rol: "mensajero" };

      for (const actor of [admin, mensajero]) {
        expect(await e.s.tarifaValor.fijarValor(propio(e.M, { valor: "1" }), actor)).toEqual({ status: "forbidden" });
        expect(await e.s.tarifaValor.quitarValor(id, actor)).toEqual({ status: "forbidden" });
      }
      expect(await propiosDe(e.tx, e.M)).toEqual([{ id, concepto: "mensajero_entregado", modo: "monto", valor: "2900.00" }]);

      const lectura = await e.s.tarifaValor.listarValores({}, admin);
      if (lectura.status !== "ok") throw new Error(`el admin lee: ${lectura.status}`);
      expect(lectura.items.map((v) => v.id)).toEqual([id]);
      expect(await e.s.tarifaValor.listarValores({}, mensajero)).toEqual({ status: "forbidden" });
    });
  });

  it("R11 — fijar, reemplazar y quitar dejan su historial con actor, antes, después y la etiqueta con el mensajero", async () => {
    await conEscenario(async (e) => {
      const actor = e.maestro.usuarioId;
      const etiqueta = "mensajero_entregado · Ana Torres";

      const id = await fijarOk(e, propio(e.M, { valor: "2900" }));
      expect(await historialDe(e.tx, id)).toEqual([
        { accion: "tarifa_valor_fijado", entidadEtiqueta: etiqueta, actorUsuarioId: actor, valorAnterior: null, valorNuevo: "monto 2900.00" },
      ]);

      await fijarOk(e, propio(e.M, { modo: "porcentaje", valor: "20" }));
      await e.s.tarifaValor.quitarValor(id, e.maestro);

      expect(await historialDe(e.tx, id)).toEqual([
        { accion: "tarifa_valor_fijado", entidadEtiqueta: etiqueta, actorUsuarioId: actor, valorAnterior: "monto 2900.00", valorNuevo: "porcentaje 20.00" },
        { accion: "tarifa_valor_fijado", entidadEtiqueta: etiqueta, actorUsuarioId: actor, valorAnterior: null, valorNuevo: "monto 2900.00" },
        { accion: "tarifa_valor_quitado", entidadEtiqueta: etiqueta, actorUsuarioId: actor, valorAnterior: "porcentaje 20.00", valorNuevo: null },
      ]);
    });
  });

  it("R11 — en la misma transacción: si el historial falla, el valor no se fija ni se quita", async () => {
    await conEscenario(async (e) => {
      const id = await fijarOk(e, propio(e.M, { valor: "2900" }));
      const roto = serviciosDeTarifas(clienteConSavepoint(e.tx, true)).tarifaValor;

      await expect(roto.fijarValor(propio(e.M, { valor: "3100" }), e.maestro)).rejects.toThrow(RegistroCaido);
      await expect(roto.fijarValor(propio(e.M, { concepto: "mensajero_novedad" }), e.maestro)).rejects.toThrow(RegistroCaido);
      await expect(roto.quitarValor(id, e.maestro)).rejects.toThrow(RegistroCaido);

      expect(await propiosDe(e.tx, e.M)).toEqual([{ id, concepto: "mensajero_entregado", modo: "monto", valor: "2900.00" }]);
    });
  });

  it("R26 — borrar de la base a un usuario sin gestiones se lleva su valor propio", async () => {
    await conEscenario(async (e) => {
      await fijarOk(e, propio(e.M));
      await e.tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
      expect(await e.tx.tarifaValor.count({ where: { mensajeroId: e.M } })).toBe(1);

      expect(await sqlRechazado(e.tx, `DELETE FROM "usuario" WHERE "id" = $1`, e.M)).toBeNull();

      expect(await e.tx.usuario.count({ where: { id: e.M } })).toBe(0);
      expect(await e.tx.tarifaValor.count({ where: { mensajeroId: e.M } })).toBe(0);
    });
  });

  it("R26 — con gestiones, la base impide borrarlo y el valor propio se queda", async () => {
    await conEscenario(async (e) => {
      const id = await fijarOk(e, propio(e.M));
      await e.tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
      await fijarEmpresa(e.tx, e.A);
      const orden = await e.tx.orden.create({
        data: {
          numRemision: `SLT55-${randomUUID().slice(0, 8)}`,
          destinatario: "Destinatario",
          telefonoDest: "88880000",
          producto: "Producto",
          montoCobrar: new Prisma.Decimal("20000.00"),
          cobraComision: false,
          estatusId: e.fks.estatusId,
          mensajeroAsignadoId: e.M,
          tiendaId: e.fks.tiendaId,
          zonaId: e.Z,
          provinciaId: e.fks.provinciaId,
          cantonId: e.fks.cantonId,
        },
        select: { id: true },
      });
      await e.tx.gestionOrden.create({
        data: { ordenId: orden.id, mensajeroId: e.M, resultado: "reprogramado" },
        select: { id: true },
      });

      expect(await sqlRechazado(e.tx, `DELETE FROM "usuario" WHERE "id" = $1`, e.M)).toContain("gestion_orden_mensajero_id_fkey");

      expect(await e.tx.usuario.count({ where: { id: e.M } })).toBe(1);
      expect(await e.tx.tarifaValor.count({ where: { id } })).toBe(1);
    });
  });
});

/** Un segundo mensajero de A, sembrado como dueno y de vuelta a la app. */
async function crearOtroMensajero(e: Escenario) {
  await e.tx.$executeRawUnsafe(`SET LOCAL ROLE NONE`);
  await fijarEmpresa(e.tx, e.A);
  const otro = await crearUsuarioDePrueba(e.tx, "mensajero");
  await comoApp(e.tx, e.A);
  return otro;
}
