import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { TableroDiaRepository } from "@/lib/repositories/TableroDiaRepository";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { OrdenService } from "@/lib/services/OrdenService";
import { RecepcionBodegaCentralService } from "@/lib/services/RecepcionBodegaCentralService";
import { listarOrdenesSchema } from "@/lib/types/orden";
import { ventanaDelDiaEnCursoCR } from "@/lib/utils/ventana-dia-cr";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
} from "./_postgres-real";

/**
 * SLT-63 — la recepcion en la bodega central de una orden RECOLECTADA en tienda la deja sin
 * asignacion, contra Postgres de verdad.
 *
 * Por que integracion y no dobles: los criterios viven en el `data` del `updateMany`, en el `WHERE`
 * de «Reasignables», en el SQL crudo de Monitoreo y en la guarda de propiedad de «Recolectadas hoy».
 * Un doble acepta cualquier criterio (`docs/verification.md`); aqui las filas las elige Postgres.
 *
 * Siembra por el camino real: `asignarRecoleccionLote` -> `recolectarEnTienda` ->
 * `RecepcionBodegaCentralService.recibirEnBodegaCentral`. Cada caso lleva su hermana en la MISMA
 * corrida, para que «no sale» no se confunda con «la siembra estaba vacia».
 *
 * Zona 1 (la que mide Monitoreo):
 *   - recibida      : Ana la recolecto y la central la recibio            -> sin mensajero
 *   - enRuta        : Ana la recolecto y aun no llega a la central         -> sigue de Ana (R7)
 *   - deBeto        : Beto la recolecto y la central la recibio            -> sin mensajero
 * Zona 2 (el resto de hermanas, fuera del tablero de la zona 1):
 *   - reasignada    : Ana la recolecto, la central la recibio y la asigno a Carla (R9)
 *   - devolucion    : en `devolviendo_a_bodega_central` con Carla, recibida (R3)
 *   - aMano         : `en_bodega_central` con Carla puesta a mano (R2, R5)
 *   - otroEstado    : `en_reparto` con Carla (R2)
 *
 * Todo dentro de `enTransaccionRevertida`; sin base el archivo sale `skipped`, nunca `passed`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

interface Escenario {
  readonly maestro: string;
  readonly ana: string;
  readonly beto: string;
  readonly carla: string;
  readonly zona1: string;
  readonly zona2: string;
  readonly recibida: string;
  readonly enRuta: string;
  readonly deBeto: string;
  readonly reasignada: string;
  readonly devolucion: string;
  readonly aMano: string;
  readonly otroEstado: string;
  /** Lo que devolvio el service en cada recepcion, por orden. */
  readonly recepciones: Readonly<Record<string, string>>;
  /** `num_guia` y filas `recepcion_bodega_central` de `recibida` antes de recibirla. */
  readonly antesDeRecibir: {
    readonly numGuia: number;
    readonly mensajero: string | null;
    readonly filasRecepcion: number;
    readonly gestiones: number;
    readonly wallet: number;
    readonly cierres: number;
  };
}

function repos(tx: Tx) {
  const prisma = tx as unknown as PrismaClient;
  const repo = new OrdenRepository(prisma);
  const historial = new OrdenHistorialService(
    repo,
    new OrdenHistorialRepository(prisma),
    new OrdenDiaRepartoCambioRepository(prisma),
    new OrdenTraspasoRepository(prisma),
  );
  return {
    repo,
    ordenes: new OrdenService(repo, historial),
    recepcion: new RecepcionBodegaCentralService(repo),
    gestion: new GestionOrdenRepository(
      prisma as unknown as ConstructorParameters<typeof GestionOrdenRepository>[0],
    ),
    tablero: new TableroDiaRepository(
      prisma as unknown as ConstructorParameters<typeof TableroDiaRepository>[0],
    ),
  };
}

async function sembrar(tx: Tx): Promise<Escenario> {
  await serializarEscriturasReales(tx);
  const sufijo = `slt63-${randomUUID().slice(0, 8)}`;
  const { repo, recepcion } = repos(tx);

  const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
  const [tipoIdentificacion, rolTienda, rolMensajero, rolMaestro] = await Promise.all([
    tx.tipoIdentificacion.findFirst({ select: { id: true } }),
    tx.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } }),
    tx.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } }),
    tx.rol.findFirst({ where: { value: "maestro" }, select: { id: true } }),
  ]);
  // Fallo ruidoso, nunca un `return`: un caso sin catalogos no puede salir `passed`.
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

  const crearZona = async (nombre: string): Promise<string> =>
    (
      await tx.zona.create({
        data: {
          sinpeNumero: "80000000",
          sinpeNombre: "Titular de Prueba",
          nombre: `${sufijo}-${nombre}`,
        },
        select: { id: true },
      })
    ).id;
  const crearUsuario = async (nombre: string, rolId: string, zonaId: string | null) =>
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
          zonaId,
        },
        select: { id: true },
      })
    ).id;

  const zona1 = await crearZona("z1");
  const zona2 = await crearZona("z2");
  const maestro = await crearUsuario("Maestra", rolMaestro.id, null);
  const tienda = await crearUsuario("Tienda", rolTienda.id, null);
  const ana = await crearUsuario("Ana", rolMensajero.id, zona1);
  const beto = await crearUsuario("Beto", rolMensajero.id, zona1);
  const carla = await crearUsuario("Carla", rolMensajero.id, zona2);

  const crearOrden = async (
    clave: string,
    zonaId: string,
    estatusValue: string,
    asignacion?: { mensajero: string },
  ): Promise<string> => {
    const [{ guia }] = await tx.$queryRawUnsafe<{ guia: number }[]>(
      `SELECT nextval('orden_num_guia_seq')::int AS guia`,
    );
    const hoy = new Date();
    return (
      await tx.orden.create({
        data: {
          numRemision: `${sufijo}-${clave}`,
          numGuia: guia,
          destinatario: `Cliente ${clave}`,
          telefonoDest: "80000000",
          direccion: `Direccion ${clave}`,
          producto: "caja",
          estatusId: estatus(estatusValue),
          tiendaId: tienda,
          zonaId,
          provinciaId: canton.provinciaId,
          cantonId: canton.id,
          cobraComision: true,
          ...(asignacion
            ? { mensajeroAsignadoId: asignacion.mensajero, asignadoAt: hoy, fechaReparto: hoy }
            : {}),
        },
        select: { id: true },
      })
    ).id;
  };

  const guiaDe = async (ordenId: string): Promise<number> => {
    const fila = await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { numGuia: true } });
    if (fila.numGuia === null) throw new Error("orden sin guia");
    return fila.numGuia;
  };

  /** El camino real de la recoleccion: asignarla y que el mensajero la recoja en tienda. */
  const recolectar = async (ordenId: string, mensajero: string): Promise<void> => {
    const asignadas = await repo.asignarRecoleccionLote(
      [ordenId],
      mensajero,
      "por_recolectar_en_tienda",
      estatus("recolectando"),
      { actorUsuarioId: maestro, origenTipo: "asignacion_recoleccion" },
    );
    if (asignadas !== 1) throw new Error("la asignacion de la recoleccion no transiciono");
    const recogida = await repo.recolectarEnTienda(
      ordenId,
      "recolectando",
      estatus("en_ruta_bodega_central"),
      mensajero,
      { actorUsuarioId: mensajero, origenTipo: "recoleccion_tienda" },
    );
    if (!recogida) throw new Error("la recoleccion en tienda no transiciono");
  };

  const actorMaestro = { usuarioId: maestro, rol: "maestro" as const };
  const recepciones: Record<string, string> = {};
  const recibir = async (ordenId: string): Promise<void> => {
    const r = await recepcion.recibirEnBodegaCentral(await guiaDe(ordenId), actorMaestro);
    recepciones[ordenId] = r.status;
  };

  const contar = async () => ({
    gestiones: await tx.gestionOrden.count(),
    wallet: await tx.walletMovimiento.count(),
    cierres: await tx.cierreDia.count(),
  });

  // --- Zona 1 ---
  const recibida = await crearOrden("recibida", zona1, "por_recolectar_en_tienda");
  await recolectar(recibida, ana);
  const enRuta = await crearOrden("en-ruta", zona1, "por_recolectar_en_tienda");
  await recolectar(enRuta, ana);
  const deBeto = await crearOrden("de-beto", zona1, "por_recolectar_en_tienda");
  await recolectar(deBeto, beto);

  // --- Zona 2 ---
  const reasignada = await crearOrden("reasignada", zona2, "por_recolectar_en_tienda");
  await recolectar(reasignada, ana);
  const devolucion = await crearOrden("devolucion", zona2, "devolviendo_a_bodega_central", {
    mensajero: carla,
  });
  const aMano = await crearOrden("a-mano", zona2, "en_bodega_central", { mensajero: carla });
  const otroEstado = await crearOrden("otro-estado", zona2, "en_reparto", { mensajero: carla });

  // Foto de `recibida` justo antes de recibirla (R4, R10 y la precondicion de R1).
  const previa = await tx.orden.findUniqueOrThrow({
    where: { id: recibida },
    select: { numGuia: true, mensajeroAsignadoId: true },
  });
  const antesDeRecibir = {
    numGuia: previa.numGuia ?? -1,
    mensajero: previa.mensajeroAsignadoId,
    filasRecepcion: await tx.ordenHistorialEstado.count({
      where: { ordenId: recibida, origenTipo: "recepcion_bodega_central" },
    }),
    ...(await contar()),
  };

  await recibir(recibida);
  await recibir(deBeto);
  await recibir(reasignada);
  await recibir(devolucion);
  // R2: una recepcion que no transiciona (ya recibida, estado no valido).
  await recibir(aMano);
  await recibir(otroEstado);

  // R9: la central asigna a Carla la que Ana recolecto.
  const asignadas = await repo.asignarBodegaLote(
    [reasignada],
    carla,
    estatus("mensajero_recogiendo_en_bodega"),
    { actorUsuarioId: maestro, origenTipo: "asignacion_bodega" },
    new Date(),
  );
  if (asignadas !== 1) throw new Error("la asignacion desde la central no transiciono");

  return {
    maestro,
    ana,
    beto,
    carla,
    zona1,
    zona2,
    recibida,
    enRuta,
    deBeto,
    reasignada,
    devolucion,
    aMano,
    otroEstado,
    recepciones,
    antesDeRecibir,
  };
}

async function asignacionDe(tx: Tx, ordenId: string) {
  return tx.orden.findUniqueOrThrow({
    where: { id: ordenId },
    select: {
      mensajeroAsignadoId: true,
      asignadoAt: true,
      fechaReparto: true,
      numGuia: true,
      estatus: { select: { value: true } },
    },
  });
}

describeSiHayBase("SLT-63 · recibir en la central una recoleccion libera la asignacion (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R1: recibir una recoleccion deja mensajero, asignado_at y fecha_reparto en NULL", async () => {
    const { e, orden } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      return { e, orden: await asignacionDe(tx, e.recibida) };
    });
    // Precondicion: llego a la central a nombre de Ana (si no, el NULL no probaria nada).
    expect(e.antesDeRecibir.mensajero).toBe(e.ana);
    expect(e.recepciones[e.recibida]).toBe("ok");
    expect(orden.estatus.value).toBe("en_bodega_central");
    expect(orden.mensajeroAsignadoId).toBeNull();
    expect(orden.asignadoAt).toBeNull();
    expect(orden.fechaReparto).toBeNull();
  });

  it("R2: una recepcion que no transiciona no toca la asignacion (ya recibida y otro estado)", async () => {
    const r = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const { repo } = repos(tx);
      const enBodega = (await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_bodega_central" } })).id;
      // El repo directo, con `liberaAsignacion: true`: la guarda del `where` es la que tiene que
      // impedir la liberacion, no la comprobacion previa del service.
      const directaAMano = await repo.recibirEnBodegaCentral(
        e.aMano,
        "en_ruta_bodega_central",
        enBodega,
        { actorUsuarioId: e.maestro, origenTipo: "recepcion_bodega_central" },
        { liberaAsignacion: true },
      );
      const directaOtroEstado = await repo.recibirEnBodegaCentral(
        e.otroEstado,
        "en_ruta_bodega_central",
        enBodega,
        { actorUsuarioId: e.maestro, origenTipo: "recepcion_bodega_central" },
        { liberaAsignacion: true },
      );
      return {
        e,
        directaAMano,
        directaOtroEstado,
        aMano: await asignacionDe(tx, e.aMano),
        otroEstado: await asignacionDe(tx, e.otroEstado),
      };
    });
    expect(r.e.recepciones[r.e.aMano]).toBe("ya_recibida");
    expect(r.e.recepciones[r.e.otroEstado]).toBe("estado_invalido");
    expect(r.directaAMano).toBe(false);
    expect(r.directaOtroEstado).toBe(false);
    for (const o of [r.aMano, r.otroEstado]) {
      expect(o.mensajeroAsignadoId).toBe(r.e.carla);
      expect(o.asignadoAt).not.toBeNull();
      expect(o.fechaReparto).not.toBeNull();
    }
    expect(r.otroEstado.estatus.value).toBe("en_reparto");
  });

  it("R3: la recepcion de una devolucion conserva el mensajero", async () => {
    const { e, orden } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      return { e, orden: await asignacionDe(tx, e.devolucion) };
    });
    expect(e.recepciones[e.devolucion]).toBe("ok");
    expect(orden.estatus.value).toBe("por_devolver_a_tienda");
    expect(orden.mensajeroAsignadoId).toBe(e.carla);
    expect(orden.asignadoAt).not.toBeNull();
    expect(orden.fechaReparto).not.toBeNull();
  });

  it("R4: num_guia intacto y una sola fila de historial recepcion_bodega_central", async () => {
    const { e, orden, filas, total } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      return {
        e,
        orden: await asignacionDe(tx, e.recibida),
        filas: await tx.ordenHistorialEstado.count({
          where: { ordenId: e.recibida, origenTipo: "recepcion_bodega_central" },
        }),
        total: await tx.ordenHistorialEstado.count({ where: { ordenId: e.recibida } }),
      };
    });
    expect(orden.numGuia).toBe(e.antesDeRecibir.numGuia);
    expect(e.antesDeRecibir.filasRecepcion).toBe(0);
    expect(filas).toBe(1);
    // asignacion_recoleccion + recoleccion_tienda + recepcion_bodega_central: nada por la liberacion.
    expect(total).toBe(3);
  });

  it("R5: tras recibir la recoleccion, el listado con reasignables la trae (y no la que tiene mensajero a mano)", async () => {
    const { e, ids } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const { ordenes } = repos(tx);
      const res = await ordenes.listar(
        listarOrdenesSchema.parse({
          page: 1,
          pageSize: 50,
          filter: { zona_id: [e.zona1, e.zona2], reasignables: true },
        }),
        { usuarioId: e.maestro, rol: "maestro" },
      );
      if (res.status !== "ok") throw new Error(`el listado no volvio ok: ${res.status}`);
      return { e, ids: res.items.map((o) => o.id) };
    });
    expect(ids).toContain(e.recibida);
    expect(ids).toContain(e.deBeto);
    expect(ids).not.toContain(e.aMano);
    expect(ids).not.toContain(e.enRuta);
    expect(new Set(ids)).toEqual(new Set([e.recibida, e.deBeto]));
  });

  it("R6: tras recibir la recoleccion, contarPorMensajero no la cuenta para nadie", async () => {
    const { e, filas } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const { tablero } = repos(tx);
      return {
        e,
        filas: await tablero.contarPorMensajero(ventanaDelDiaEnCursoCR(new Date()), {
          tipo: "zona",
          zonaId: e.zona1,
        }),
      };
    });
    // En la zona 1 solo queda en el universo la que sigue en ruta (de Ana): las dos recibidas
    // (de Ana y de Beto) no cuentan en ninguna tarjeta ni en ningun cubo.
    expect(filas.find((f) => f.mensajeroId === e.beto)).toBeUndefined();
    expect(filas.reduce((s, f) => s + f.asignadas, 0)).toBe(1);
    const cubos = filas.reduce(
      (s, f) =>
        s +
        f.entregadas +
        f.reprogramadas +
        f.devueltas +
        f.rechazadas +
        f.incidentes +
        f.sinRecoger +
        f.enReparto +
        f.otros,
      0,
    );
    expect(cubos).toBe(1);
  });

  it("R7: la hermana en en_ruta_bodega_central sigue contando para su mensajero", async () => {
    const { e, filas, enRuta } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const { tablero } = repos(tx);
      return {
        e,
        enRuta: await asignacionDe(tx, e.enRuta),
        filas: await tablero.contarPorMensajero(ventanaDelDiaEnCursoCR(new Date()), {
          tipo: "zona",
          zonaId: e.zona1,
        }),
      };
    });
    expect(enRuta.estatus.value).toBe("en_ruta_bodega_central");
    expect(enRuta.mensajeroAsignadoId).toBe(e.ana);
    expect(filas.find((f) => f.mensajeroId === e.ana)?.asignadas).toBe(1);
  });

  it("R8: Recolectadas hoy sigue trayendo la recibida en central", async () => {
    const { e, orden, ids } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const { gestion } = repos(tx);
      return {
        e,
        orden: await asignacionDe(tx, e.recibida),
        ids: (await gestion.findMisAsignacionesByIds(e.ana, [e.recibida, e.enRuta])).map((f) => f.id),
      };
    });
    // La recibida llega SIN mensajero: la trae la rama «recolectada por mi», no la de propiedad.
    expect(orden.mensajeroAsignadoId).toBeNull();
    expect(new Set(ids)).toEqual(new Set([e.recibida, e.enRuta]));
  });

  it("R9: no trae la recolectada por otro, ni la recolectada por mi y ya asignada a otro", async () => {
    const { e, ids, deCarla, reasignada } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      const { gestion } = repos(tx);
      return {
        e,
        reasignada: await asignacionDe(tx, e.reasignada),
        ids: (await gestion.findMisAsignacionesByIds(e.ana, [e.deBeto, e.reasignada, e.aMano])).map(
          (f) => f.id,
        ),
        deCarla: (await gestion.findMisAsignacionesByIds(e.carla, [e.reasignada])).map((f) => f.id),
      };
    });
    expect(reasignada.mensajeroAsignadoId).toBe(e.carla);
    expect(ids).toEqual([]);
    // Contraprueba de no vacuidad: la reasignada SI existe y la trae su mensajero actual.
    expect(deCarla).toEqual([e.reasignada]);
  });

  it("R10: recibir no crea gestion_orden, wallet_movimiento ni cierre_dia", async () => {
    const { e, despues } = await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrar(tx);
      return {
        e,
        despues: {
          gestiones: await tx.gestionOrden.count(),
          wallet: await tx.walletMovimiento.count(),
          cierres: await tx.cierreDia.count(),
        },
      };
    });
    expect(e.recepciones[e.recibida]).toBe("ok");
    expect(despues).toEqual({
      gestiones: e.antesDeRecibir.gestiones,
      wallet: e.antesDeRecibir.wallet,
      cierres: e.antesDeRecibir.cierres,
    });
  });
});
