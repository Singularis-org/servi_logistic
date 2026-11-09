import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { EstadoUsuario, PrismaClient, RolValue, TarifaConcepto } from "@prisma/client";

import { activarTarifasNuevas, cargarPantallaTarifas, guardarValoresTarifa } from "@/lib/actions/tarifas";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor, CargarPantallaResult } from "@/lib/interfaces/services/ITarifasPantallaService";
import { TarifasPantallaRepository } from "@/lib/repositories/TarifasPantallaRepository";
import { serviciosDeTarifas, type ServiciosDeTarifas } from "@/lib/tarifas/servicios";
import type { FijarValorInput } from "@/lib/types/tarifa-flexible";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  parametrosDe,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-55 T3.2 (design §5, §7.1; R10, R23, R31, R32, R37) — LO QUE LEE LA PANTALLA DEL VALOR PROPIO, CONTRA
// POSTGRES REAL Y CON DOS EMPRESAS, por dos caminos, porque cada uno mide una barrera distinta:
//
// 1. Transaccion revertida, como `servi_app` (`comoApp`): aqui separa empresas SOLO la RLS. El cliente del
//    test no lleva la extension.
// 2. El cliente de PRODUCCION (`getPrismaClient()`), que las actions cogen solas cuando no se les inyecta
//    nada: extension + RLS, y `serviciosDeTarifas` con sus repositorios reales. No cabe en una transaccion
//    revertida (la extension abre la suya, en otra conexion): siembra commiteada y limpieza en `afterEach`.
//
// Los esperados son LITERALES, escritos a mano. La siembra lanza si falta algo: nunca un verde sin datos.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

const TRES_ESENCIALES = [
  { concepto: "tienda_flete_entregado" },
  { concepto: "tienda_flete_rechazo" },
  { concepto: "mensajero_entregado" },
];

function pantallaOk(res: CargarPantallaResult | { status: string }) {
  if (res.status !== "ok") throw new Error(`se esperaba la pantalla y llego ${res.status}`);
  return res as Extract<CargarPantallaResult, { status: "ok" }>;
}

function propio(mensajeroId: string, concepto: TarifaConcepto = "mensajero_entregado", valor = "2900"): FijarValorInput {
  return { concepto, modo: "monto", valor, zonaId: null, grupoId: null, tiendaId: null, vehiculoId: null, mensajeroId };
}

/* -------------------------------------------------------------------------- */
/* Camino 1: la RLS, en una transaccion revertida                              */
/* -------------------------------------------------------------------------- */

interface Escenario {
  tx: TxDeTest;
  A: string;
  B: string;
  /** Zonas de A: `Alfa` completa, `Beta` sin el pago al mensajero y `Gama` sin nada. */
  alfa: string;
  beta: string;
  gama: string;
  /** Ana Torres, el unico mensajero de A y de la zona Beta. */
  M: string;
  /** Beto Rojas, mensajero de B, con un valor propio. */
  MB: string;
  valorDeB: string;
  maestro: Actor;
  admin: Actor;
  maestroB: Actor;
  s: ServiciosDeTarifas;
}

async function persona(
  tx: TxDeTest,
  rol: RolValue,
  nombre: string,
  primerApellido: string,
  estado: EstadoUsuario = "activo",
): Promise<string> {
  const { id } = await crearUsuarioDePrueba(tx, rol);
  await tx.usuario.update({ where: { id }, data: { nombre, primerApellido, estado } });
  return id;
}

async function zona(tx: TxDeTest, nombre: string): Promise<string> {
  const creada = await tx.zona.create({
    data: { nombre, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
    select: { id: true },
  });
  return creada.id;
}

async function sembrar(tx: TxDeTest): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const A = (await crearOrganizacion(tx)).id;
  const B = (await crearOrganizacion(tx)).id;

  await fijarEmpresa(tx, B);
  const maestroB = await persona(tx, "maestro", "Bruno", "Maestro");
  const MB = await persona(tx, "mensajero", "Beto", "Rojas");
  const valorDeB = (
    await tx.tarifaValor.create({
      data: { concepto: "mensajero_entregado", modo: "monto", valor: "7777.00", mensajeroId: MB },
      select: { id: true },
    })
  ).id;

  await fijarEmpresa(tx, A);
  const maestro = await persona(tx, "maestro", "Marta", "Maestro");
  const admin = await persona(tx, "admin", "Adela", "Admin");
  await persona(tx, "adminTienda", "Tina", "Tienda");
  const alfa = await zona(tx, "Alfa");
  const beta = await zona(tx, "Beta");
  const gama = await zona(tx, "Gama");
  const M = await persona(tx, "mensajero", "Ana", "Torres");
  await tx.usuario.update({ where: { id: M }, data: { zonaId: beta } });
  await tx.tarifaValor.createMany({
    data: [
      { concepto: "tienda_flete_entregado" as const, valor: "3000.00", ivaPct: "13.00", zonaId: alfa },
      { concepto: "tienda_flete_rechazo" as const, valor: "1400.00", ivaPct: "13.00", zonaId: alfa },
      { concepto: "mensajero_entregado" as const, valor: "2200.00", zonaId: alfa },
      { concepto: "tienda_flete_entregado" as const, valor: "3000.00", ivaPct: "13.00", zonaId: beta },
      { concepto: "tienda_flete_rechazo" as const, valor: "1400.00", ivaPct: "13.00", zonaId: beta },
    ].map((v) => ({ ...v, modo: "monto" as const, organizacionId: A })),
  });

  await comoApp(tx, A);
  return {
    tx,
    A,
    B,
    alfa,
    beta,
    gama,
    M,
    MB,
    valorDeB,
    maestro: { usuarioId: maestro, rol: "maestro" },
    admin: { usuarioId: admin, rol: "admin" },
    maestroB: { usuarioId: maestroB, rol: "maestro" },
    s: serviciosDeTarifas(clienteConSavepoint(tx)),
  };
}

function conEscenario(fn: (e: Escenario) => Promise<void>) {
  return enTransaccionRevertida(base, async (tx) => fn(await sembrar(tx)));
}

/** Lo que dice la lista de zonas, sin los ids: nombre, estado y lo que falta. */
function estadoDeZonas(p: Extract<CargarPantallaResult, { status: "ok" }>) {
  return p.zonas.map((z) => ({ nombre: z.nombre, estado: z.estado, faltantes: z.faltantes }));
}

const ZONAS_SIN_PROPIO = [
  { nombre: "Alfa", estado: "completa", faltantes: [] },
  { nombre: "Beta", estado: "faltan", faltantes: [{ concepto: "mensajero_entregado" }] },
  { nombre: "Gama", estado: "sin_empezar", faltantes: TRES_ESENCIALES },
];

describeSiHayBase("SLT-55 R23 — un valor propio no cubre a la zona: el recorrido entero", () => {
  it("cargarPantalla y activar dan lo mismo con el propio del único mensajero de la zona y sin él", async () => {
    await conEscenario(async (e) => {
      const antes = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      expect(estadoDeZonas(antes)).toEqual(ZONAS_SIN_PROPIO);
      const activarAntes = await e.s.tarifaActivacion.activar({ confirmaFaltantes: false }, e.maestro);

      const fijado = await e.s.tarifaValor.fijarValor(propio(e.M), e.maestro);
      expect(fijado.status).toBe("ok");

      const despues = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      // La premisa: el propio esta guardado y la pantalla lo lee, y aun asi la zona sigue igual.
      expect(despues.valoresMensajero.map((v) => [v.mensajeroId, v.nivel, v.valor])).toEqual([[e.M, "mensajero", "2900.00"]]);
      expect(estadoDeZonas(despues)).toEqual(ZONAS_SIN_PROPIO);
      // «M de T zonas completas» sale de aqui: 1 de 3, antes y despues.
      expect(despues.zonas.filter((z) => z.estado === "completa").length).toBe(1);
      expect(despues.zonas.length).toBe(3);

      const activarDespues = await e.s.tarifaActivacion.activar({ confirmaFaltantes: false }, e.maestro);
      expect(activarDespues).toEqual({
        status: "confirmacion_requerida",
        faltantes: [
          { zonaId: e.beta, zonaNombre: "Beta", faltantes: [{ concepto: "mensajero_entregado" }], usaZona: [] },
          { zonaId: e.gama, zonaNombre: "Gama", faltantes: TRES_ESENCIALES, usaZona: [] },
        ],
      });
      expect(activarDespues).toEqual(activarAntes);
      expect(await e.tx.tarifaActivacion.count({ where: { organizacionId: e.A } })).toBe(0);
    });
  });

  it("la lectura de los faltantes no trae el propio, y tampoco la rejilla de la zona", async () => {
    await conEscenario(async (e) => {
      expect((await e.s.tarifaValor.fijarValor(propio(e.M), e.maestro)).status).toBe("ok");

      const repo = new TarifasPantallaRepository(clienteConSavepoint(e.tx));
      const filas = await repo.valoresDeZonaOGrupo();
      expect(filas.length).toBe(5);
      expect(filas.filter((f) => f.mensajeroId !== null)).toEqual([]);

      const beta = await e.s.tarifasPantalla.cargarZona({ zonaId: e.beta }, e.maestro);
      if (beta.status !== "ok") throw new Error(beta.status);
      expect(beta.valores.map((v) => v.concepto).sort()).toEqual(["tienda_flete_entregado", "tienda_flete_rechazo"]);
    });
  });

  it("control: el valor de la zona sí la completa, luego el `faltan` de arriba no es que nada cambie", async () => {
    await conEscenario(async (e) => {
      const fijado = await e.s.tarifaValor.fijarValor(
        { ...propio(e.M), mensajeroId: null, zonaId: e.beta, valor: "2200" },
        e.maestro,
      );
      expect(fijado.status).toBe("ok");
      const p = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      expect(estadoDeZonas(p)).toEqual([
        { nombre: "Alfa", estado: "completa", faltantes: [] },
        { nombre: "Beta", estado: "completa", faltantes: [] },
        { nombre: "Gama", estado: "sin_empezar", faltantes: TRES_ESENCIALES },
      ]);
    });
  });
});

describeSiHayBase("SLT-55 R31, R32 — quién está en la lista y quién es elegible", () => {
  async function poblar(e: Escenario) {
    // Como dueño: a un dado de baja la app no le admite un valor nuevo (R8), y aqui se mide la lectura.
    await e.tx.$executeRawUnsafe("RESET ROLE");
    await fijarEmpresa(e.tx, e.A);
    const pendiente = await persona(e.tx, "mensajero", "Pía", "Solano", "pendiente");
    const inactivo = await persona(e.tx, "mensajero", "Iván", "Mora", "inactivo");
    const bloqueado = await persona(e.tx, "mensajero", "Xenia", "Vega", "bloqueado");
    const inactivoConValor = await persona(e.tx, "mensajero", "Lía", "Campos", "inactivo");
    const bloqueadoConValor = await persona(e.tx, "mensajero", "Hugo", "Paz", "bloqueado");
    const retirado = await persona(e.tx, "admin", "Raúl", "Díaz");
    await persona(e.tx, "admin", "Nora", "Ruiz");
    await e.tx.tarifaValor.createMany({
      data: [
        { concepto: "mensajero_entregado" as const, valor: "1000.00", mensajeroId: inactivoConValor },
        { concepto: "mensajero_novedad" as const, valor: "1100.00", mensajeroId: inactivoConValor },
        { concepto: "mensajero_entregado" as const, valor: "1200.00", mensajeroId: bloqueadoConValor },
        { concepto: "mensajero_rechazo" as const, valor: "1300.00", mensajeroId: retirado },
      ].map((v) => ({ ...v, modo: "monto" as const, organizacionId: e.A })),
    });
    await comoApp(e.tx, e.A);
    return { pendiente, inactivo, bloqueado, inactivoConValor, bloqueadoConValor, retirado };
  }

  it("R31: `elegible` solo para rol mensajero sin dar de baja; `pendiente` lo es", async () => {
    await conEscenario(async (e) => {
      const u = await poblar(e);
      const p = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      expect(p.mensajeros).toEqual([
        { id: e.M, nombre: "Ana Torres", elegible: true },
        { id: u.bloqueadoConValor, nombre: "Hugo Paz", elegible: false },
        { id: u.inactivo, nombre: "Iván Mora", elegible: false },
        { id: u.inactivoConValor, nombre: "Lía Campos", elegible: false },
        { id: u.pendiente, nombre: "Pía Solano", elegible: true },
        { id: u.retirado, nombre: "Raúl Díaz", elegible: false },
        { id: u.bloqueado, nombre: "Xenia Vega", elegible: false },
      ]);
    });
  });

  it("R32: el retirado y los dados de baja siguen en la lista con sus valores, y quien nunca fue mensajero no sale", async () => {
    await conEscenario(async (e) => {
      const u = await poblar(e);
      const p = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      const porValor = [...p.valoresMensajero].sort((a, b) => a.valor.localeCompare(b.valor));
      expect(porValor.map((v) => [v.mensajeroId, v.concepto, v.modo, v.valor, v.ivaPct, v.nivel, v.zonaId])).toEqual([
        [u.inactivoConValor, "mensajero_entregado", "monto", "1000.00", null, "mensajero", null],
        [u.inactivoConValor, "mensajero_novedad", "monto", "1100.00", null, "mensajero", null],
        [u.bloqueadoConValor, "mensajero_entregado", "monto", "1200.00", null, "mensajero", null],
        [u.retirado, "mensajero_rechazo", "monto", "1300.00", null, "mensajero", null],
      ]);
      const nombres = p.mensajeros.map((m) => m.nombre);
      expect(nombres).toContain("Raúl Díaz");
      // Admin sin valor propio, y los otros roles sembrados: no son candidatos.
      for (const fuera of ["Nora Ruiz", "Adela Admin", "Marta Maestro", "Tina Tienda"]) {
        expect(nombres).not.toContain(fuera);
      }
    });
  });

  it("R32: quitarle el último valor al retirado lo saca de la lista", async () => {
    await conEscenario(async (e) => {
      const u = await poblar(e);
      const antes = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      const suyo = antes.valoresMensajero.find((v) => v.mensajeroId === u.retirado);
      if (suyo === undefined) throw new Error("el retirado no tiene el valor sembrado");

      expect((await e.s.tarifaValor.quitarValor(suyo.id, e.maestro)).status).toBe("ok");

      const despues = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      expect(despues.mensajeros.map((m) => m.id)).not.toContain(u.retirado);
    });
  });
});

describeSiHayBase("SLT-55 R37 — dos empresas, con la RLS", () => {
  it("A no lee mensajeros ni valores de B, ni B los de A, y los dos ven los suyos", async () => {
    await conEscenario(async (e) => {
      expect((await e.s.tarifaValor.fijarValor(propio(e.M), e.maestro)).status).toBe("ok");

      const deA = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      expect(deA.mensajeros).toEqual([{ id: e.M, nombre: "Ana Torres", elegible: true }]);
      expect(deA.valoresMensajero.map((v) => [v.mensajeroId, v.valor])).toEqual([[e.M, "2900.00"]]);

      await comoApp(e.tx, e.B);
      const deB = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestroB));
      expect(deB.mensajeros).toEqual([{ id: e.MB, nombre: "Beto Rojas", elegible: true }]);
      expect(deB.valoresMensajero.map((v) => [v.id, v.mensajeroId, v.valor])).toEqual([[e.valorDeB, e.MB, "7777.00"]]);
    });
  });
});

describeSiHayBase("SLT-55 R10 — leer", () => {
  it("el admin lee los mismos datos que el maestro, sin poder escribir", async () => {
    await conEscenario(async (e) => {
      expect((await e.s.tarifaValor.fijarValor(propio(e.M), e.maestro)).status).toBe("ok");
      const delMaestro = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.maestro));
      const delAdmin = pantallaOk(await e.s.tarifasPantalla.cargarPantalla(e.admin));
      expect(delAdmin.puedeEscribir).toBe(false);
      expect(delMaestro.puedeEscribir).toBe(true);
      expect(delAdmin.mensajeros).toEqual([{ id: e.M, nombre: "Ana Torres", elegible: true }]);
      expect(delAdmin.valoresMensajero).toEqual(delMaestro.valoresMensajero);
      expect(delAdmin.valoresMensajero.length).toBe(1);
    });
  });

  it.each(["adminTienda", "mensajero", "adminSatelite", "apiKey", "superadmin"] as const)(
    "el rol %s recibe forbidden",
    async (rol) => {
      await conEscenario(async (e) => {
        const res = await e.s.tarifasPantalla.cargarPantalla({ usuarioId: e.M, rol });
        expect(res).toEqual({ status: "forbidden" });
      });
    },
  );
});

/* -------------------------------------------------------------------------- */
/* Camino 2: el cliente de produccion, por las actions y sin inyectar nada     */
/* -------------------------------------------------------------------------- */

describeSiHayBase("SLT-55 R37, R23, T3.3 — por las actions, con el cliente de producción", () => {
  // Sin `servicio` en las deps: la action monta `serviciosDeTarifas(getPrismaClient())`, la raiz real.
  let empresas: Personas459[] = [];

  async function dosEmpresas(): Promise<[Personas459, Personas459]> {
    const A = await sembrarPersonas459(base);
    empresas.push(A);
    const B = await sembrarPersonas459(base);
    empresas.push(B);
    return [A, B];
  }

  afterEach(async () => {
    const aLimpiar = empresas;
    empresas = [];
    for (const p of aLimpiar) {
      // `limpiar459` no conoce las zonas ni `tarifa_valor`, y la empresa se borra con RESTRICT.
      await base.tarifaValor.deleteMany({ where: { organizacionId: p.organizacionId } });
      await base.zona.deleteMany({ where: { organizacionId: p.organizacionId } });
      await limpiar459(base, p);
    }
  });

  const comoMaestro = (p: Personas459) => ({ getActor: async () => p.maestro });
  const guardar = (p: Personas459, cambios: unknown[]) =>
    conEmpresa(p.organizacionId, () => guardarValoresTarifa({ cambios }, comoMaestro(p)));
  const leer = async (p: Personas459) =>
    pantallaOk(await conEmpresa(p.organizacionId, () => cargarPantallaTarifas(comoMaestro(p))));

  it("T3.3: la action fija y quita de verdad, con el repositorio real, en la empresa de la sesión", async () => {
    const [A] = await dosEmpresas();
    const M = A.mensajero.usuarioId;

    const fijado = await guardar(A, [
      { accion: "fijar", clave: "mensajero_entregado:todos", datos: propio(M, "mensajero_entregado", "2900") },
    ]);
    expect(fijado).toEqual({ status: "ok", resultados: [{ clave: "mensajero_entregado:todos", status: "ok" }] });

    const fila = await base.tarifaValor.findFirstOrThrow({ where: { mensajeroId: M } });
    expect(fila.organizacionId).toBe(A.organizacionId);
    expect([fila.concepto, fila.modo, fila.valor.toFixed(2), fila.ivaPct, fila.zonaId]).toEqual([
      "mensajero_entregado",
      "monto",
      "2900.00",
      null,
      null,
    ]);
    const rastro = await base.historialAccion.findFirstOrThrow({ where: { entidadId: fila.id } });
    expect([rastro.accion, rastro.actorUsuarioId, rastro.organizacionId, rastro.valorNuevo]).toEqual([
      "tarifa_valor_fijado",
      A.maestro.usuarioId,
      A.organizacionId,
      "monto 2900.00",
    ]);

    const quitado = await guardar(A, [{ accion: "quitar", clave: "mensajero_entregado:todos", id: fila.id }]);
    expect(quitado).toEqual({ status: "ok", resultados: [{ clave: "mensajero_entregado:todos", status: "ok" }] });
    expect(await base.tarifaValor.count({ where: { mensajeroId: M } })).toBe(0);
  });

  it("R10: el admin, por la action y sin dobles, no escribe nada", async () => {
    const [A] = await dosEmpresas();
    const res = await conEmpresa(A.organizacionId, () =>
      guardarValoresTarifa(
        { cambios: [{ accion: "fijar", clave: "a", datos: propio(A.mensajero.usuarioId) }] },
        { getActor: async () => A.admin },
      ),
    );
    expect(res).toEqual({ status: "ok", resultados: [{ clave: "a", status: "forbidden" }] });
    expect(await base.tarifaValor.count({ where: { organizacionId: A.organizacionId } })).toBe(0);
  });

  it("R37: cada empresa lee lo suyo y solo lo suyo, y el vacío no es que nadie vea nada", async () => {
    const [A, B] = await dosEmpresas();
    const MA = A.mensajero.usuarioId;
    const MB = B.mensajero.usuarioId;
    expect(await guardar(A, [{ accion: "fijar", clave: "a", datos: propio(MA, "mensajero_entregado", "2900") }])).toMatchObject({
      resultados: [{ status: "ok" }],
    });
    expect(await guardar(B, [{ accion: "fijar", clave: "b", datos: propio(MB, "mensajero_rechazo", "1500") }])).toMatchObject({
      resultados: [{ status: "ok" }],
    });

    const deA = await leer(A);
    expect(deA.mensajeros.map((m) => m.id)).toEqual([MA]);
    expect(deA.valoresMensajero.map((v) => [v.mensajeroId, v.concepto, v.valor])).toEqual([[MA, "mensajero_entregado", "2900.00"]]);

    const deB = await leer(B);
    expect(deB.mensajeros.map((m) => m.id)).toEqual([MB]);
    expect(deB.valoresMensajero.map((v) => [v.mensajeroId, v.concepto, v.valor])).toEqual([[MB, "mensajero_rechazo", "1500.00"]]);
  });

  it("R37: A no escribe sobre un mensajero de B, ni le quita un valor a B", async () => {
    const [A, B] = await dosEmpresas();
    const MB = B.mensajero.usuarioId;

    const fijarAjeno = await guardar(A, [{ accion: "fijar", clave: "a", datos: propio(MB) }]);
    expect(fijarAjeno).toEqual({
      status: "ok",
      resultados: [
        {
          clave: "a",
          status: "validation_error",
          fieldErrors: { mensajeroId: ["El mensajero no existe, no es de la empresa o está dado de baja: no admite un valor nuevo."] },
        },
      ],
    });
    expect(await base.tarifaValor.count({ where: { mensajeroId: MB } })).toBe(0);

    expect(await guardar(B, [{ accion: "fijar", clave: "b", datos: propio(MB) }])).toMatchObject({ resultados: [{ status: "ok" }] });
    const deB = await base.tarifaValor.findFirstOrThrow({ where: { mensajeroId: MB }, select: { id: true } });

    expect(await guardar(A, [{ accion: "quitar", clave: "a", id: deB.id }])).toEqual({
      status: "ok",
      resultados: [{ clave: "a", status: "not_found" }],
    });
    expect(await base.tarifaValor.count({ where: { id: deB.id } })).toBe(1);
  });

  it("R23: `activar` por la action pide confirmación con el propio guardado, sin escribir", async () => {
    const [A] = await dosEmpresas();
    const zonaId = randomUUID();
    await base.zona.create({
      data: {
        id: zonaId,
        nombre: "Delta",
        sinpeNumero: "80000000",
        sinpeNombre: "Titular de Prueba",
        organizacionId: A.organizacionId,
      },
    });
    expect(await guardar(A, [{ accion: "fijar", clave: "a", datos: propio(A.mensajero.usuarioId) }])).toMatchObject({
      resultados: [{ status: "ok" }],
    });

    const p = await leer(A);
    expect(p.zonas.map((z) => [z.nombre, z.estado])).toEqual([["Delta", "sin_empezar"]]);

    const res = await conEmpresa(A.organizacionId, () => activarTarifasNuevas({ confirmaFaltantes: false }, comoMaestro(A)));
    expect(res).toEqual({
      status: "confirmacion_requerida",
      faltantes: [{ zonaId, zonaNombre: "Delta", faltantes: TRES_ESENCIALES, usaZona: [] }],
    });
    expect(await base.tarifaActivacion.count({ where: { organizacionId: A.organizacionId } })).toBe(0);
  });

  // La RLS respalda al filtro, asi que quitar el filtro no cambia ninguna fila: solo se ve en el SQL.
  it("R37: las dos lecturas llevan el filtro de empresa en el SQL que emite la extensión", async () => {
    const [A] = await dosEmpresas();
    const { prisma, eventos } = crearPrismaDeTestConEspia();
    try {
      const repo = new TarifasPantallaRepository(conAislamientoPorEmpresa(prisma, async () => null));
      await conEmpresa(A.organizacionId, async () => {
        await repo.listarMensajeros();
        await repo.valoresDeMensajeros();
      });
      for (const tabla of ["usuario", "tarifa_valor"]) {
        const filtradas = eventos.filter(
          (ev) =>
            new RegExp(`FROM "public"\\."${tabla}".*WHERE.*"${tabla}"\\."organizacion_id" = \\$`).test(ev.query) &&
            parametrosDe(ev).includes(A.organizacionId),
        );
        expect(filtradas.length, `consulta filtrada sobre ${tabla}`).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  afterAll(async () => {
    if (HAY_BASE_DE_DATOS) await getPrismaClient().$disconnect();
  });
});
