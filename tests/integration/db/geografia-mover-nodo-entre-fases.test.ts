import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { GeoRepository, TOPE_MOVER_MS } from "@/lib/repositories/GeoRepository";
import { datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";

// SLT-48 (P4, P1; review vuelta 3, hallazgo 1) — LO QUE CAMBIA ENTRE LAS DOS FASES DE `mover`, con dos
// conexiones contra Postgres.
//
// `mover` valida y calcula P1 sin bloqueos (fase 1) y despues, en una transaccion corta, bloquea y
// escribe (fase 2). Entre las dos, otra persona puede retirar el destino o un antepasado suyo, cambiarle
// el padre al destino, o corregir una orden ya vista. La fase 2 bloquea `FOR UPDATE` el destino y sus
// antepasados junto con el subarbol, los vuelve a comprobar (`cambio_concurrente`) y vuelve a pasar por
// P1 las ordenes ya vistas cuyo nodo o zona cambio.
//
// El gancho entre fases: el cliente de `mover` va envuelto y, justo antes del `SET LOCAL lock_timeout`
// con el que empieza la fase 2 (antes de tomar ningun bloqueo), otra conexion escribe y CONFIRMA el
// cambio. El codigo de `mover` es el real. El mismo mecanismo de proxy que `-cede` y `-carrera`.
// Los datos van confirmados, con el pais `XJ` bajo el lock de escrituras reales y borrados en un
// `finally`. `XJ` no lo usa ninguna otra suite.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAIS = "XJ";

let base: PrismaClient;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, nodo_geografico_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-48', '70704848', 'Direccion SLT-48', $4, $5, $6, 12000, 'caja', now(), now())`;

interface Sembrado {
  organizacionId: string;
  organizacionNombre: string;
  tiendaId: string;
  zonaId: string;
  estatusId: string;
  norte: string;
  alto: string;
  centro: string;
  oeste: string;
  sur: string;
  bajo: string;
  este: string;
}

/** Todo lo del pais `XJ`, en el orden de las FK. Los nodos, de la hoja a la raiz. */
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

/**
 * Norte › Alto › {Centro, Oeste}; Sur › Bajo; Este. Una empresa del pais con la marca de zona especial
 * en Norte (Centro la hereda) y en Oeste (la tiene propia). Sin ordenes.
 */
async function sembrar(): Promise<Sembrado> {
  return base.$transaction(async (tx) => {
    await tx.pais.create({
      data: {
        id: PAIS,
        nombre: "Pais de entre fases de mover",
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
    const alto = await nodo("Alto", 2, norte);
    const centro = await nodo("Centro", 3, alto);
    const oeste = await nodo("Oeste", 3, alto);
    const sur = await nodo("Sur", 1, null);
    const bajo = await nodo("Bajo", 2, sur);
    const este = await nodo("Este", 1, null);

    const org = await tx.organizacion.create({
      data: { ...datosDeOrganizacionDePrueba(), paisId: PAIS },
      select: { id: true, nombre: true },
    });
    await tx.organizacionModulo.createMany({ data: ORDEN_MODULOS.map((modulo) => ({ organizacionId: org.id, modulo })) });
    await fijarEmpresa(tx, org.id);
    const tienda = await crearUsuarioDePrueba(tx, "adminTienda");
    const zona = await tx.zona.create({
      data: { nombre: `Zona entre fases ${randomUUID().slice(0, 8)}`, esCentral: false, sinpeNumero: "80000000", sinpeNombre: "Titular" },
      select: { id: true },
    });
    // Centro hereda la marca de Norte (llevar Alto a Sur se la quita); Oeste tiene la suya (no cambia).
    await tx.distritoZonaEspecial.create({ data: { distritoId: norte } });
    await tx.distritoZonaEspecial.create({ data: { distritoId: oeste } });
    const estatus = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });
    return {
      organizacionId: org.id,
      organizacionNombre: org.nombre,
      tiendaId: tienda.id,
      zonaId: zona.id,
      estatusId: estatus.id,
      norte,
      alto,
      centro,
      oeste,
      sur,
      bajo,
      este,
    };
  });
}

/**
 * El cliente de `mover`, con `entreFases` corriendo una sola vez justo antes del `SET LOCAL lock_timeout`
 * con el que empieza la fase 2: la transaccion ya esta abierta y todavia no tomo ningun bloqueo. Solo
 * se toca el `$transaction`; lo demas va al cliente tal cual.
 */
function conGanchoEntreFases(cliente: PrismaClient, entreFases: () => Promise<void>): PrismaClient {
  let pendiente = true;
  const inicioDeFase2 = `SET LOCAL lock_timeout = '${TOPE_MOVER_MS}ms'`;
  return new Proxy(cliente, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        return (fn: (tx: unknown) => Promise<unknown>, opciones?: object) =>
          objetivo.$transaction(async (tx) => {
            const txConGancho = new Proxy(tx, {
              get(t, p) {
                if (p === "$executeRawUnsafe") {
                  return async (sql: string, ...valores: unknown[]) => {
                    if (pendiente && sql === inicioDeFase2) {
                      pendiente = false;
                      await entreFases();
                    }
                    return t.$executeRawUnsafe(sql, ...valores);
                  };
                }
                const valor = Reflect.get(t, p) as unknown;
                return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(t) : valor;
              },
            });
            return fn(txConGancho);
          }, opciones);
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
    },
  });
}

/** Lo que `mover` habria escrito: el `padre_id` del nodo movido y su fila de historial. */
async function loEscrito(id: string) {
  const { padreId } = await base.nodoGeografico.findUniqueOrThrow({ where: { id }, select: { padreId: true } });
  const historial = await base.historialPlataforma.count({ where: { paisId: PAIS, entidadId: id } });
  return { padreId, historial };
}

/**
 * Siembra `XJ`, corre `caso` con un cliente propio para `mover` (el gancho escribe con `base`, otra
 * conexion) y lo borra todo, pase lo que pase.
 */
async function conOtraConexion<T>(caso: (s: Sembrado, clienteMover: PrismaClient) => Promise<T>): Promise<T> {
  const clienteMover = crearPrismaDeTest();
  return bajoLockDeEscrituraReal(async () => {
    try {
      await limpiar(); // por si una corrida anterior murio a mitad
      return await caso(await sembrar(), clienteMover);
    } finally {
      await limpiar();
      await clienteMover.$disconnect();
    }
  });
}

/** `mover` con el gancho entre fases; devuelve el desenlace, si el gancho corrio y lo escrito. */
async function moverConCambioEntreFases(
  clienteMover: PrismaClient,
  datos: { id: string; padreIdNuevo: string; padreIdAnterior: string },
  cambio: () => Promise<void>,
) {
  let corrio = false;
  const geo = new GeoRepository(
    conGanchoEntreFases(clienteMover, async () => {
      await cambio();
      corrio = true;
    }),
  );
  const desenlace = await geo.mover(datos, null);
  return { desenlace, corrio, escrito: await loEscrito(datos.id) };
}

describeSiHayBase("SLT-48 P4/P1 — lo que cambia entre las dos fases de mover (dos conexiones)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    const residuos = await base?.pais.count({ where: { id: PAIS } });
    await base?.$disconnect();
    expect(residuos).toBe(0);
  });

  it("el destino se retira entre fases: `cambio_concurrente` y no se escribe nada", async () => {
    const r = await conOtraConexion(async (s, clienteMover) => {
      const datos = { id: s.alto, padreIdNuevo: s.sur, padreIdAnterior: s.norte };
      const salida = await moverConCambioEntreFases(clienteMover, datos, async () => {
        await base.nodoGeografico.update({ where: { id: s.sur }, data: { activo: false } });
      });
      return { s, ...salida };
    });

    expect(r.corrio).toBe(true);
    expect(r.desenlace).toEqual({ estado: "cambio_concurrente" });
    expect(r.escrito).toEqual({ padreId: r.s.norte, historial: 0 });
  }, 60_000);

  it("un antepasado del destino se retira entre fases: `cambio_concurrente` y no se escribe nada", async () => {
    const r = await conOtraConexion(async (s, clienteMover) => {
      const datos = { id: s.centro, padreIdNuevo: s.bajo, padreIdAnterior: s.alto };
      const salida = await moverConCambioEntreFases(clienteMover, datos, async () => {
        await base.nodoGeografico.update({ where: { id: s.sur }, data: { activo: false } });
      });
      return { s, ...salida };
    });

    expect(r.corrio).toBe(true);
    expect(r.desenlace).toEqual({ estado: "cambio_concurrente" });
    expect(r.escrito).toEqual({ padreId: r.s.alto, historial: 0 });
  }, 60_000);

  it("el destino cambia de padre entre fases (su cadena de antepasados ya es otra): `cambio_concurrente` y no se escribe nada", async () => {
    const r = await conOtraConexion(async (s, clienteMover) => {
      const datos = { id: s.centro, padreIdNuevo: s.bajo, padreIdAnterior: s.alto };
      const salida = await moverConCambioEntreFases(clienteMover, datos, async () => {
        await base.nodoGeografico.update({ where: { id: s.bajo }, data: { padreId: s.este } });
      });
      return { s, ...salida };
    });

    expect(r.corrio).toBe(true);
    expect(r.desenlace).toEqual({ estado: "cambio_concurrente" });
    expect(r.escrito).toEqual({ padreId: r.s.alto, historial: 0 });
  }, 60_000);

  it("una orden ya vista cambia de nodo entre fases y pasa a quedar afectada: el movimiento se bloquea con P1", async () => {
    const r = await conOtraConexion(async (s, clienteMover) => {
      // Una orden abierta en Oeste: con la marca propia de Oeste, llevar Alto a Sur no le cambia nada.
      const ordenId = randomUUID();
      await base.$transaction(async (tx) => {
        await fijarEmpresa(tx, s.organizacionId);
        await tx.$executeRawUnsafe(INSERTAR_ORDEN, ordenId, `SLT48-${ordenId.slice(0, 8)}`, s.estatusId, s.tiendaId, s.zonaId, s.oeste);
      });
      const datos = { id: s.alto, padreIdNuevo: s.sur, padreIdAnterior: s.norte };
      const vistaPrevia = await new GeoRepository(clienteMover).vistaPreviaMover(datos.id, datos.padreIdNuevo);
      // Entre fases, una correccion la pasa a Centro, que hereda la marca de Norte y la perderia.
      const salida = await moverConCambioEntreFases(clienteMover, datos, async () => {
        await base.$transaction(async (tx) => {
          await fijarEmpresa(tx, s.organizacionId);
          await tx.$executeRawUnsafe(`UPDATE orden SET nodo_geografico_id = $1 WHERE id = $2`, s.centro, ordenId);
        });
      });
      return { s, vistaPrevia, ...salida };
    });

    // La fase 1 vio la orden y no la conto (si no, el gancho no habria corrido).
    expect(r.vistaPrevia).toMatchObject({ estado: "ok", vista: { bloqueo: null } });
    expect(r.corrio).toBe(true);
    expect(r.desenlace).toEqual({
      estado: "bloqueado",
      bloqueo: { ordenes: 1, empresas: [{ id: r.s.organizacionId, nombre: r.s.organizacionNombre, ordenes: 1 }] },
    });
    expect(r.escrito).toEqual({ padreId: r.s.norte, historial: 0 });
  }, 60_000);
});
