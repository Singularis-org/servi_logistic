import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";

/**
 * SLT-63 (R11, R12) — la migracion de datos que libera las recolecciones ya recibidas en la central,
 * y su `down.sql`, ejecutados TAL CUAL contra Postgres real dentro de una transaccion revertida.
 *
 * Una regex sobre el SQL no puede decir que fila elige el `NOT EXISTS` de «la ultima fila»: aqui la
 * eligen Postgres y los `created_at` sembrados a proposito (explicitos, porque dentro de una misma
 * transaccion `now()` es el mismo instante para todas las filas).
 *
 * Hermanas sembradas en la MISMA corrida que la recibida:
 *   - posterior   : recibida, pero con una fila de historial DESPUES de la recepcion
 *   - devolucion  : recibida por devolucion (`devolviendo_a_bodega_central -> por_devolver_a_tienda`)
 *   - borrada     : igual que la recibida pero con `deleted_at`
 *   - sinRecoleccion : `en_bodega_central` con mensajero y sin recoleccion ni recepcion central
 *   - cargaApi    : recibida desde `en_ruta_bodega_central` sin mensajero ni recoleccion (para el down)
 *
 * Sin base el archivo sale `skipped`, nunca `passed`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const DIR = path.join(
  process.cwd(),
  "db",
  "migrations",
  "20261031120000_liberar_recolecciones_recibidas",
);
const UP = fs.readFileSync(path.join(DIR, "migration.sql"), "utf8");
const DOWN = fs.readFileSync(path.join(DIR, "down.sql"), "utf8");

interface Escenario {
  readonly ana: string;
  readonly beto: string;
  readonly carla: string;
  readonly recibida: string;
  readonly posterior: string;
  readonly devolucion: string;
  readonly borrada: string;
  readonly sinRecoleccion: string;
  readonly cargaApi: string;
}

async function sembrar(tx: Tx): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const sufijo = `slt63m-${randomUUID().slice(0, 8)}`;

  const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
  const [tipoIdentificacion, rolTienda, rolMensajero, rolMaestro] = await Promise.all([
    tx.tipoIdentificacion.findFirst({ select: { id: true } }),
    tx.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } }),
    tx.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } }),
    tx.rol.findFirst({ where: { value: "maestro" }, select: { id: true } }),
  ]);
  if (!canton || !tipoIdentificacion || !rolTienda || !rolMensajero || !rolMaestro) {
    throw new Error("la base local no tiene catalogos (geografia / roles / identificacion)");
  }
  const catalogo = new Map(
    (await tx.orderStatus.findMany({ select: { id: true, value: true } })).map((s) => [s.value, s.id]),
  );
  const estatus = (value: string): string => {
    const id = catalogo.get(value);
    if (id === undefined) throw new Error(`el catalogo local no tiene el estatus ${value}`);
    return id;
  };

  const zona = (
    await tx.zona.create({
      data: { sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba", nombre: `${sufijo}-z` },
      select: { id: true },
    })
  ).id;
  const crearUsuario = async (nombre: string, rolId: string) =>
    (
      await tx.usuario.create({
        data: {
          nombre,
          primerApellido: "Prueba",
          email: `${sufijo}-${nombre}@slt63.local`,
          telefono: "88880000",
          passwordHash: "no-es-una-credencial",
          cedula: `${sufijo}-${nombre}`,
          tipoIdentificacionId: tipoIdentificacion.id,
          rolId,
          zonaId: null,
        },
        select: { id: true },
      })
    ).id;
  const maestro = await crearUsuario("Maestra", rolMaestro.id);
  const tienda = await crearUsuario("Tienda", rolTienda.id);
  const ana = await crearUsuario("Ana", rolMensajero.id);
  const beto = await crearUsuario("Beto", rolMensajero.id);
  const carla = await crearUsuario("Carla", rolMensajero.id);

  const crearOrden = async (
    clave: string,
    estatusValue: string,
    extra: { mensajero?: string; reservada?: boolean; borrada?: boolean } = {},
  ): Promise<string> =>
    (
      await tx.orden.create({
        data: {
          numRemision: `${sufijo}-${clave}`,
          destinatario: `Cliente ${clave}`,
          telefonoDest: "80000000",
          direccion: `Direccion ${clave}`,
          producto: "caja",
          estatusId: estatus(estatusValue),
          tiendaId: tienda,
          zonaId: zona,
          provinciaId: canton.provinciaId,
          cantonId: canton.id,
          cobraComision: true,
          mensajeroAsignadoId: extra.mensajero ?? null,
          ...(extra.reservada ? { asignadoAt: new Date(), fechaReparto: new Date() } : {}),
          ...(extra.borrada ? { deletedAt: new Date() } : {}),
        },
        select: { id: true },
      })
    ).id;

  const base = Date.UTC(2026, 9, 29, 15, 0, 0);
  /** Fila de historial con instante explicito (`paso` en minutos desde `base`). */
  const fila = async (
    ordenId: string,
    paso: number,
    origen: string | null,
    destino: string,
    origenTipo: Parameters<typeof tx.ordenHistorialEstado.create>[0]["data"]["origenTipo"],
    actor: string | null,
  ): Promise<void> => {
    await tx.ordenHistorialEstado.create({
      data: {
        ordenId,
        estatusOrigenId: origen === null ? null : estatus(origen),
        estatusDestinoId: estatus(destino),
        actorUsuarioId: actor,
        origenTipo,
        createdAt: new Date(base + paso * 60_000),
      },
    });
  };
  /**
   * El recorrido de una recoleccion recibida. Recolectan dos mensajeros, Beto primero y Ana despues
   * (desasignada y reasignada): el down tiene que reponer a la ULTIMA, Ana.
   */
  const recoleccionRecibida = async (ordenId: string): Promise<void> => {
    await fila(ordenId, 1, "por_recolectar_en_tienda", "recolectando", "asignacion_recoleccion", maestro);
    await fila(ordenId, 2, "recolectando", "en_ruta_bodega_central", "recoleccion_tienda", beto);
    await fila(ordenId, 3, "en_ruta_bodega_central", "recolectando", "ajuste_estado", maestro);
    await fila(ordenId, 4, "recolectando", "en_ruta_bodega_central", "recoleccion_tienda", ana);
    await fila(ordenId, 5, "en_ruta_bodega_central", "en_bodega_central", "recepcion_bodega_central", maestro);
  };

  const recibida = await crearOrden("recibida", "en_bodega_central", { mensajero: ana, reservada: true });
  await recoleccionRecibida(recibida);

  const posterior = await crearOrden("posterior", "en_bodega_central", { mensajero: carla });
  await recoleccionRecibida(posterior);
  await fila(posterior, 6, "en_bodega_central", "en_bodega_central", "ajuste_estado", maestro);

  const devolucion = await crearOrden("devolucion", "por_devolver_a_tienda", { mensajero: carla });
  await fila(devolucion, 1, "en_bodega_satelite", "devolviendo_a_bodega_central", "ajuste_estado", maestro);
  await fila(
    devolucion,
    2,
    "devolviendo_a_bodega_central",
    "por_devolver_a_tienda",
    "recepcion_bodega_central",
    maestro,
  );

  const borrada = await crearOrden("borrada", "en_bodega_central", { mensajero: ana, borrada: true });
  await recoleccionRecibida(borrada);

  const sinRecoleccion = await crearOrden("sin-recoleccion", "en_bodega_central", { mensajero: carla });
  await fila(sinRecoleccion, 1, null, "en_preparacion", "carga_masiva", maestro);
  await fila(sinRecoleccion, 2, "en_preparacion", "en_bodega_central", "generacion_guia", maestro);

  const cargaApi = await crearOrden("carga-api", "en_bodega_central");
  await fila(cargaApi, 1, null, "en_ruta_bodega_central", "carga_masiva", null);
  await fila(cargaApi, 2, "en_ruta_bodega_central", "en_bodega_central", "recepcion_bodega_central", maestro);

  return { ana, beto, carla, recibida, posterior, devolucion, borrada, sinRecoleccion, cargaApi };
}

const CAMPOS = {
  id: true,
  mensajeroAsignadoId: true,
  asignadoAt: true,
  fechaReparto: true,
  estatusId: true,
  deletedAt: true,
} as const;

async function foto(tx: Tx, ids: string[]) {
  const filas = await tx.orden.findMany({ where: { id: { in: ids } }, select: CAMPOS });
  return new Map(filas.map((f) => [f.id, f]));
}

describeSiHayBase("SLT-63 · migracion liberar_recolecciones_recibidas (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R11: libera la recibida y no toca a sus hermanas (fila posterior, devolucion, borrada, sin recoleccion), sin escribir historial", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const ids = [e.recibida, e.posterior, e.devolucion, e.borrada, e.sinRecoleccion, e.cargaApi];
      const antes = await foto(tx, ids);
      const historialAntes = await tx.ordenHistorialEstado.count();
      await tx.$executeRawUnsafe(UP);
      return {
        e,
        ids,
        antes,
        despues: await foto(tx, ids),
        historialAntes,
        historialDespues: await tx.ordenHistorialEstado.count(),
      };
    });
    const { e } = r;
    // Precondicion: la recibida llega con mensajero y reserva, si no el NULL no probaria nada.
    expect(r.antes.get(e.recibida)?.mensajeroAsignadoId).toBe(e.ana);
    expect(r.antes.get(e.recibida)?.asignadoAt).not.toBeNull();

    const recibida = r.despues.get(e.recibida);
    expect(recibida?.mensajeroAsignadoId).toBeNull();
    expect(recibida?.asignadoAt).toBeNull();
    expect(recibida?.fechaReparto).toBeNull();
    expect(recibida?.estatusId).toBe(r.antes.get(e.recibida)?.estatusId);

    for (const id of [e.posterior, e.devolucion, e.borrada, e.sinRecoleccion, e.cargaApi]) {
      const a = r.antes.get(id);
      const d = r.despues.get(id);
      expect(d).toEqual(a);
    }
    // Las hermanas tienen mensajero (salvo la de carga API): «no tocada» no es «ya estaba vacia».
    expect(r.despues.get(e.posterior)?.mensajeroAsignadoId).toBe(e.carla);
    expect(r.despues.get(e.devolucion)?.mensajeroAsignadoId).toBe(e.carla);
    expect(r.despues.get(e.borrada)?.mensajeroAsignadoId).toBe(e.ana);
    expect(r.despues.get(e.sinRecoleccion)?.mensajeroAsignadoId).toBe(e.carla);
    expect(r.historialDespues).toBe(r.historialAntes);
  });

  it("R12: el down repone el mensajero desde el actor de la ultima recoleccion_tienda", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const ids = [e.recibida, e.posterior, e.devolucion, e.borrada, e.sinRecoleccion, e.cargaApi];
      await tx.$executeRawUnsafe(UP);
      const trasUp = await foto(tx, ids);
      const historialAntes = await tx.ordenHistorialEstado.count();
      await tx.$executeRawUnsafe(DOWN);
      return {
        e,
        trasUp,
        trasDown: await foto(tx, ids),
        historialAntes,
        historialDespues: await tx.ordenHistorialEstado.count(),
      };
    });
    const { e } = r;
    expect(r.trasUp.get(e.recibida)?.mensajeroAsignadoId).toBeNull();
    // Ana, la ULTIMA en recolectarla; no Beto, que la recolecto antes.
    expect(r.trasDown.get(e.recibida)?.mensajeroAsignadoId).toBe(e.ana);
    // El resto no cambia con el down: tampoco la de carga API, que no tiene a quien reponer.
    for (const id of [e.posterior, e.devolucion, e.borrada, e.sinRecoleccion, e.cargaApi]) {
      expect(r.trasDown.get(id)).toEqual(r.trasUp.get(id));
    }
    expect(r.trasDown.get(e.cargaApi)?.mensajeroAsignadoId).toBeNull();
    expect(r.historialDespues).toBe(r.historialAntes);
  });
});
