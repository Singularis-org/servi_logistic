import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { moverNodoAction } from "@/lib/actions/geografia-plataforma";
import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type { DatosDeMover } from "@/lib/interfaces/repositories/IGeoRepository";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { GeoRepository, TIMEOUT_TRANSACCION_MOVER_MS, TOPE_MOVER_MS } from "@/lib/repositories/GeoRepository";
import { GeografiaService, type GeografiaOrdenesRepo } from "@/lib/services/GeografiaService";
import { datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";

// SLT-48 (P1; review vuelta 2, decision del humano «tope corto a mover») — EL QUE CEDE ES EL SUPERADMIN,
// con dos conexiones contra Postgres.
//
// `mover` calcula P1 sin bloqueos y solo despues bloquea el subarbol `FOR UPDATE`, con un tope
// (`TOPE_MOVER_MS`) en el `lock_timeout`, en el `statement_timeout` y, el doble, en el `timeout` de la
// transaccion. Lo que se prueba aqui es la promesa a las empresas: ninguna escritura de una orden en el
// subarbol espera mas que ese tope detras de `mover`, y cuando no alcanza, `mover` falla con
// `ocupado` («intenta de nuevo») sin escribir nada (ni el `padre_id` ni la fila de historial).
//
//   1. `mover` tiene los bloqueos y una sentencia se alarga (un `pg_sleep` inyectado tras tomarlos): la
//      orden de la empresa espera como mucho el tope y se guarda; `mover` cae por `statement_timeout`.
//   2. `mover` tiene los bloqueos y se queda parado fuera de la base (una promesa que no resuelve): la
//      orden espera como mucho el `timeout` de la transaccion, que Prisma revierte.
//   3. al reves: una orden en vuelo en el subarbol; `mover` espera su `lock_timeout` y cae limpio.
//
// La pausa de 1 y 2 se inyecta envolviendo el cliente de `mover`: el codigo de `mover` es el real. Los
// datos van CONFIRMADOS (la otra conexion tiene que verlos), con el pais `XK` bajo el lock de
// escrituras reales y borrados en un `finally`. `XK` no lo usa ninguna otra suite.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAIS = "XK";
/** Lo que se tolera por encima del tope: el ida y vuelta de Prisma y la planificacion de Node. */
const MARGEN_MS = 1_500;

let base: PrismaClient;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, nodo_geografico_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-48', '70704848', 'Direccion SLT-48', $4, $5, $6, 12000, 'caja', now(), now())`;

interface Sembrado {
  organizacionId: string;
  tiendaId: string;
  zonaId: string;
  estatusId: string;
  norteAlto: string;
  centro: string;
  norte: string;
  sur: string;
}

/** Todo lo del pais `XK`, en el orden de las FK. Los nodos, de la hoja a la raiz. */
async function limpiar(): Promise<void> {
  const orgs = (await base.organizacion.findMany({ where: { paisId: PAIS }, select: { id: true } })).map((o) => o.id);
  for (const tabla of ["orden", "distrito_zona_especial", "zona", "usuario", "organizacion_modulo"]) {
    await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
  }
  await base.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = ANY($1::text[])`, orgs);
  await base.$executeRawUnsafe(`DELETE FROM "historial_plataforma" WHERE "pais_id" = $1`, PAIS);
  for (let profundidad = 3; profundidad >= 1; profundidad--) {
    await base.$executeRawUnsafe(`DELETE FROM "nodo_geografico" WHERE "pais_id" = $1 AND "profundidad" = $2`, PAIS, profundidad);
  }
  await base.$executeRawUnsafe(`DELETE FROM "pais" WHERE "id" = $1`, PAIS); // los tipos se van en cascada
}

/** Norte › Alto › Centro y Sur; una empresa del pais con la marca de zona especial en Norte. Sin ordenes. */
async function sembrar(): Promise<Sembrado> {
  return base.$transaction(async (tx) => {
    await tx.pais.create({
      data: {
        id: PAIS,
        nombre: "Pais del tope de mover",
        nivel1Singular: "Región",
        nivel1Plural: "Regiones",
        nivel2Singular: "Comuna",
        nivel2Plural: "Comunas",
        nivel3Singular: "Barrio",
        nivel3Plural: "Barrios",
      },
    });
    const tipos = await tx.tipoNivelGeografico.findMany({ where: { paisId: PAIS }, select: { id: true, clave: true } });
    const tipoDe = (p: number) => {
      const t = tipos.find((x) => x.clave === `nivel_${p}`);
      if (t === undefined) throw new Error(`${PAIS} sin nivel_${p}`);
      return t.id;
    };
    const nodo = async (nombre: string, profundidad: number, padreId: string | null) =>
      (
        await tx.nodoGeografico.create({
          data: { paisId: PAIS, tipoId: tipoDe(profundidad), padreId, profundidad, nombre, nombreNormalizado: "lo pisa el trigger" },
          select: { id: true },
        })
      ).id;
    const norte = await nodo("Norte", 1, null);
    const norteAlto = await nodo("Alto", 2, norte);
    const centro = await nodo("Centro", 3, norteAlto);
    const sur = await nodo("Sur", 1, null);

    const org = await tx.organizacion.create({ data: { ...datosDeOrganizacionDePrueba(), paisId: PAIS }, select: { id: true } });
    await tx.organizacionModulo.createMany({ data: ORDEN_MODULOS.map((modulo) => ({ organizacionId: org.id, modulo })) });
    await fijarEmpresa(tx, org.id);
    const tienda = await crearUsuarioDePrueba(tx, "adminTienda");
    const zona = await tx.zona.create({
      data: { nombre: `Zona tope ${randomUUID().slice(0, 8)}`, esCentral: false, sinpeNumero: "80000000", sinpeNombre: "Titular" },
      select: { id: true },
    });
    // La marca, heredada por Centro desde Norte: una orden abierta en Centro bloquea llevar Alto a Sur (P1).
    await tx.distritoZonaEspecial.create({ data: { distritoId: norte } });
    const estatus = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });
    return { organizacionId: org.id, tiendaId: tienda.id, zonaId: zona.id, estatusId: estatus.id, norteAlto, centro, norte, sur };
  });
}

/** La escritura de una empresa: una orden abierta en Centro, en su propia transaccion. */
function escribirOrden(
  cliente: PrismaClient,
  s: Sembrado,
  antesDeConfirmar: () => Promise<void> = async () => {},
): Promise<string> {
  const id = randomUUID();
  return cliente.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, s.organizacionId);
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, id, `SLT48-${id.slice(0, 8)}`, s.estatusId, s.tiendaId, s.zonaId, s.centro);
      await antesDeConfirmar();
      return id;
    },
    { timeout: 30_000 },
  );
}

/**
 * El cliente de `mover`, con una pausa justo despues de que su transaccion tome los bloqueos (el
 * `SET LOCAL statement_timeout` va despues de `bloquearNodos`). `alBloquear` avisa al test y `pausa`
 * es lo que la transaccion hace con los bloqueos tomados. Solo se toca el `$transaction`.
 */
function conPausaTrasBloquear(
  cliente: PrismaClient,
  alBloquear: () => void,
  pausa: (tx: PrismaClient) => Promise<unknown>,
): PrismaClient {
  return new Proxy(cliente, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        return (fn: (tx: unknown) => Promise<unknown>, opciones?: object) =>
          objetivo.$transaction(async (tx) => {
            const txConPausa = new Proxy(tx, {
              get(t, p) {
                if (p === "$executeRawUnsafe") {
                  return async (sql: string, ...valores: unknown[]) => {
                    const r = await t.$executeRawUnsafe(sql, ...valores);
                    if (sql.includes("statement_timeout")) {
                      alBloquear();
                      await pausa(t as unknown as PrismaClient);
                    }
                    return r;
                  };
                }
                const valor = Reflect.get(t, p) as unknown;
                return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(t) : valor;
              },
            });
            return fn(txConPausa);
          }, opciones);
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
    },
  });
}

/** `moverNodoAction` con el servicio real sobre `cliente` y un superadmin: el camino entero hasta el borde. */
function moverComoSuperadmin(cliente: PrismaClient, datos: DatosDeMover) {
  const servicio = new GeografiaService(new GeoRepository(cliente), {} as GeografiaOrdenesRepo);
  return moverNodoAction(datos, {
    getActor: async () => ({ usuarioId: null as unknown as string, rol: ROLES_PLATAFORMA[0] }),
    geografiaService: servicio,
  });
}

/** Lo que `mover` habria escrito: el `padre_id` de Alto y su fila de historial. */
async function loEscrito(s: Sembrado) {
  const { padreId } = await base.nodoGeografico.findUniqueOrThrow({ where: { id: s.norteAlto }, select: { padreId: true } });
  const historial = await base.historialPlataforma.count({ where: { paisId: PAIS, entidadId: s.norteAlto } });
  return { padreId, historial };
}

/** Siembra `XK`, corre `caso` con dos clientes propios y lo borra todo, pase lo que pase. */
async function conDosConexiones<T>(caso: (s: Sembrado, orden: PrismaClient, mover: PrismaClient) => Promise<T>): Promise<T> {
  const [clienteOrden, clienteMover] = [crearPrismaDeTest(), crearPrismaDeTest()];
  return bajoLockDeEscrituraReal(async () => {
    try {
      await limpiar(); // por si una corrida anterior murio a mitad
      return await caso(await sembrar(), clienteOrden, clienteMover);
    } finally {
      await limpiar();
      await Promise.all([clienteOrden.$disconnect(), clienteMover.$disconnect()]);
    }
  });
}

describeSiHayBase("SLT-48 P1 — el tope de mover: cede el superadmin, nunca la empresa (dos conexiones)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = await base?.pais.count({ where: { id: PAIS } });
    await base?.$disconnect();
    expect(residuos).toBe(0);
  });

  it("mover tiene los bloqueos y una sentencia se alarga: la orden espera como mucho el tope y se guarda; mover cae con `ocupado` sin escribir", async () => {
    const r = await conDosConexiones(async (s, clienteOrden, clienteMover) => {
      const datos = { id: s.norteAlto, padreIdNuevo: s.sur, padreIdAnterior: s.norte };
      let avisar!: () => void;
      const bloqueado = new Promise<void>((ok) => (avisar = ok));
      // Una sentencia lenta con los bloqueos tomados: la corta el `statement_timeout` de `mover`.
      const movedor = conPausaTrasBloquear(clienteMover, avisar, (tx) => tx.$queryRawUnsafe(`SELECT pg_sleep(10)`));

      const mover = moverComoSuperadmin(movedor, datos);
      await Promise.race([bloqueado, mover]);
      const inicio = performance.now();
      const ordenId = await escribirOrden(clienteOrden, s);
      const esperaDeLaOrden = performance.now() - inicio;
      const desenlace = await mover;
      const escrito = await loEscrito(s);
      // La orden quedo guardada: P1 sigue cerrado, el siguiente `mover` la cuenta y se bloquea.
      const siguiente = await moverComoSuperadmin(clienteMover, datos);
      return { s, ordenId, esperaDeLaOrden, desenlace, escrito, siguiente };
    });

    expect(r.desenlace).toEqual({ status: "conflict", motivo: "ocupado" });
    expect(r.escrito).toEqual({ padreId: r.s.norte, historial: 0 });
    // La orden espero de verdad a `mover` (si no, el test no prueba nada), y como mucho el tope.
    expect(r.esperaDeLaOrden).toBeGreaterThan(TOPE_MOVER_MS / 2);
    expect(r.esperaDeLaOrden).toBeLessThan(TOPE_MOVER_MS + MARGEN_MS);
    expect(r.siguiente).toMatchObject({ status: "validation_error", bloqueo: { ordenes: 1 } });
  }, 60_000);

  it("mover tiene los bloqueos y se para fuera de la base: la orden espera como mucho el `timeout` de la transaccion; mover cae con `ocupado` sin escribir", async () => {
    const r = await conDosConexiones(async (s, clienteOrden, clienteMover) => {
      const datos = { id: s.norteAlto, padreIdNuevo: s.sur, padreIdAnterior: s.norte };
      let avisar!: () => void;
      const bloqueado = new Promise<void>((ok) => (avisar = ok));
      let soltar!: () => void;
      const suelto = new Promise<void>((ok) => (soltar = ok));
      // `mover` se queda con los bloqueos sin mandar nada a la base hasta que el test lo suelte.
      const movedor = conPausaTrasBloquear(clienteMover, avisar, () => suelto);

      const mover = moverComoSuperadmin(movedor, datos);
      await Promise.race([bloqueado, mover]);
      const inicio = performance.now();
      try {
        await escribirOrden(clienteOrden, s);
      } finally {
        soltar();
      }
      const esperaDeLaOrden = performance.now() - inicio;
      const desenlace = await mover;
      return { s, esperaDeLaOrden, desenlace, escrito: await loEscrito(s) };
    });

    expect(r.desenlace).toEqual({ status: "conflict", motivo: "ocupado" });
    expect(r.escrito).toEqual({ padreId: r.s.norte, historial: 0 });
    expect(r.esperaDeLaOrden).toBeGreaterThan(TOPE_MOVER_MS / 2);
    expect(r.esperaDeLaOrden).toBeLessThan(TIMEOUT_TRANSACCION_MOVER_MS + MARGEN_MS);
  }, 60_000);

  it("al reves: una orden en vuelo en el subarbol hace que mover agote su `lock_timeout` y caiga con `ocupado` sin escribir", async () => {
    const r = await conDosConexiones(async (s, clienteOrden, clienteMover) => {
      const datos = { id: s.norteAlto, padreIdNuevo: s.sur, padreIdAnterior: s.norte };
      let escrita!: () => void;
      const ordenEscrita = new Promise<void>((ok) => (escrita = ok));
      let confirmar!: () => void;
      const puedeConfirmar = new Promise<void>((ok) => (confirmar = ok));
      // La orden se escribe y no confirma hasta que `mover` haya terminado.
      const orden = escribirOrden(clienteOrden, s, async () => {
        escrita();
        await puedeConfirmar;
      });
      await Promise.race([ordenEscrita, orden]);

      const inicio = performance.now();
      let desenlace: Awaited<ReturnType<typeof moverNodoAction>>;
      try {
        desenlace = await moverComoSuperadmin(clienteMover, datos);
      } finally {
        confirmar();
      }
      const esperaDeMover = performance.now() - inicio;
      await orden;
      return { s, esperaDeMover, desenlace, escrito: await loEscrito(s) };
    });

    expect(r.desenlace).toEqual({ status: "conflict", motivo: "ocupado" });
    expect(r.escrito).toEqual({ padreId: r.s.norte, historial: 0 });
    // `mover` espero su `lock_timeout` y no mas.
    expect(r.esperaDeMover).toBeGreaterThanOrEqual(TOPE_MOVER_MS - 100);
    expect(r.esperaDeMover).toBeLessThan(TOPE_MOVER_MS + MARGEN_MS);
  }, 60_000);
});
