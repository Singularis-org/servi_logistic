import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GestionResultado, PrismaClient } from "@prisma/client";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { RecepcionBodegaCentralService } from "@/lib/services/RecepcionBodegaCentralService";
import type { OrderStatusValue } from "@/lib/types/order-status";

import {
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-224 (design §7.1) — LA RECEPCION EN LA CENTRAL RE-DERIVA LA ZONA, CONTRA POSTGRES REAL.
 *
 * El defecto: una orden en el estante de una satelite (`en_bodega_satelite`) cuyo distrito se paso
 * a otra zona se queda con la zona vieja (la 377 la retiene a proposito); SLT-197 la retira a la
 * central y alli seguia con la zona de la satelite. Ahora, al recibirla (`en_ruta_bodega_central ->
 * en_bodega_central`), toma la zona de su distrito con la regla de la 366/377
 * (`_shared/reconciliar-zona-ordenes`), en la misma transaccion que la recepcion.
 *
 * Por que integracion: quien cambia de zona lo decide un `WHERE` sobre otras tablas
 * (`cierre_detail`, `gestion_orden`) y el orden de las escrituras dentro de la transaccion. Un
 * doble no ve ninguna de las dos cosas.
 *
 * Escenario base: zona satelite A, zona C, distrito X mapeado a C, orden en
 * `en_ruta_bodega_central` con `zona_id = A` y distrito X. Todo dentro de `enTransaccionRevertida`;
 * sin base el archivo sale `skipped`, nunca `passed`.
 *
 * MUTACIONES EJECUTADAS (2026-11-19, ver `progress/impl_SLT-224.md`), cada una con 1 rojo de 14:
 *   · quitar `ordenIds` del `where` del helper            -> rojo en «el ordenIds acota».
 *   · quitar `cierreDetalles: { none: {} }` del helper    -> rojo en «con cierre_detail conserva».
 *   · llamar al helper antes del `updateMany`             -> rojo en «la carrera de verdad».
 *   · `reconciliaZona: true` en la arista de devolucion   -> rojo en «R1704».
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Escenario {
  tx: TxDeTest;
  servicio: RecepcionBodegaCentralService;
  repo: OrdenRepository;
  maestro: string;
  zonaA: string;
  zonaC: string;
  distritoX: string;
  crearDistrito: (zonaIds: string[]) => Promise<string>;
  crearOrden: (o: { distritoId: string | null; zonaId?: string; estado: OrderStatusValue }) => Promise<string>;
  crearGestion: (ordenId: string, resultado: GestionResultado, anulada?: boolean) => Promise<void>;
  crearDetalleDeCierre: (ordenId: string) => Promise<void>;
  recibir: (ordenId: string) => Promise<string>;
  zonaDe: (ordenId: string) => Promise<string>;
  estadoDe: (ordenId: string) => Promise<string>;
  acciones: (ordenIds: string[]) => Promise<{ entidadId: string; actorUsuarioId: string | null; loteId: string }[]>;
}

describeSiHayBase("SLT-224 · la recepcion en la central re-deriva la zona (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conEscenario<T>(fn: (e: Escenario) => Promise<T>): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const fks = await crearFksDeOrden(tx);
      const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
      const sufijo = randomUUID().slice(0, 8);

      const crearZona = async (nombre: string) =>
        (
          await tx.zona.create({
            data: { nombre: `slt224 ${nombre} ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
            select: { id: true },
          })
        ).id;
      const zonaA = await crearZona("A");
      const zonaC = await crearZona("C");

      const crearDistrito = async (zonaIds: string[]) => {
        const d = await tx.distrito.create({
          data: { nombre: `slt224 D ${randomUUID().slice(0, 8)}`, cantonId: fks.cantonId },
          select: { id: true },
        });
        for (const zonaId of zonaIds) await tx.zonaDistrito.create({ data: { zonaId, distritoId: d.id } });
        return d.id;
      };
      const distritoX = await crearDistrito([zonaC]);

      const estatusId = async (value: OrderStatusValue) =>
        (await tx.orderStatus.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;

      const repo = new OrdenRepository(clienteConTransaccionAnidada(tx));
      const servicio = new RecepcionBodegaCentralService(repo);

      const e: Escenario = {
        tx,
        servicio,
        repo,
        maestro,
        zonaA,
        zonaC,
        distritoX,
        crearDistrito,
        crearOrden: async ({ distritoId, zonaId = zonaA, estado }) => {
          const [{ guia }] = await tx.$queryRawUnsafe<{ guia: number }[]>(
            `SELECT nextval('orden_num_guia_seq')::int AS guia`,
          );
          return (
            await tx.orden.create({
              data: {
                numRemision: `R-224-${randomUUID().slice(0, 8)}`,
                numGuia: guia,
                destinatario: "Destinataria 224",
                telefonoDest: "8888-0000",
                producto: "caja",
                estatusId: await estatusId(estado),
                tiendaId: fks.tiendaId,
                zonaId,
                provinciaId: fks.provinciaId,
                cantonId: fks.cantonId,
                distritoId,
                direccion: "avenida 224",
                montoCobrar: 12_000,
                intentosContacto: 2,
              },
              select: { id: true },
            })
          ).id;
        },
        crearGestion: async (ordenId, resultado, anulada = false) => {
          await tx.gestionOrden.create({
            data: {
              ordenId,
              mensajeroId: mensajero,
              resultado,
              ...(anulada ? { anuladaAt: new Date("2026-11-01T12:00:00Z") } : {}),
            },
            select: { id: true },
          });
        },
        crearDetalleDeCierre: async (ordenId) => {
          const cierre = await tx.cierreDia.create({
            data: { mensajeroId: mensajero, estado: "solicitado", destinoTipo: "bodega_central", destinoZonaId: zonaA },
            select: { id: true },
          });
          await tx.cierreDetail.create({
            data: {
              cierreId: cierre.id,
              ordenId,
              cobraComision: false,
              zonaId: zonaA,
              tiendaId: fks.tiendaId,
              esCentral: false,
              numRemision: `R-224-${randomUUID().slice(0, 8)}`,
              destinatario: "Destinataria 224",
              producto: "caja",
              tiendaNombre: "Tienda de prueba",
              zonaNombre: "Zona congelada",
              provinciaNombre: "Provincia",
              cantonNombre: "Canton",
            },
            select: { id: true },
          });
        },
        recibir: async (ordenId) => {
          const { numGuia } = await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { numGuia: true } });
          if (numGuia === null) throw new Error("orden sin guia");
          const r = await servicio.recibirEnBodegaCentral(numGuia, { usuarioId: maestro, rol: "maestro" });
          return r.status;
        },
        zonaDe: async (ordenId) =>
          (await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { zonaId: true } })).zonaId,
        estadoDe: async (ordenId) =>
          (
            await tx.orden.findUniqueOrThrow({
              where: { id: ordenId },
              select: { estatus: { select: { value: true } } },
            })
          ).estatus.value,
        acciones: async (ordenIds) =>
          tx.historialAccion.findMany({
            where: { accion: "orden_zona_reconciliada", entidadId: { in: ordenIds } },
            select: { entidadId: true, actorUsuarioId: true, loteId: true },
          }),
      };
      return fn(e);
    });
  }

  it("R1700/R1703: recibir una orden desalineada la pasa a la zona de su distrito y deja UNA accion con quien escaneo", async () => {
    const r = await conEscenario(async (e) => {
      const orden = await e.crearOrden({ distritoId: e.distritoX, estado: "en_ruta_bodega_central" });
      const antes = await e.zonaDe(orden);
      const status = await e.recibir(orden);
      return { e, orden, antes, status, zona: await e.zonaDe(orden), estado: await e.estadoDe(orden), acciones: await e.acciones([orden]) };
    });
    expect(r.antes).toBe(r.e.zonaA);
    expect(r.status).toBe("ok");
    expect(r.estado).toBe("en_bodega_central");
    expect(r.zona).toBe(r.e.zonaC);
    expect(r.acciones).toHaveLength(1);
    expect(r.acciones[0].actorUsuarioId).toBe(r.e.maestro);
  });

  it.each([
    ["con cierre_detail", "cierre"],
    ["con gestion vigente `entregado`", "entregado"],
    ["con gestion vigente `devolucion_a_origen_por_rechazo`", "devolucion_a_origen_por_rechazo"],
    ["con gestion vigente `incidente`", "incidente"],
  ] as const)("R1701: %s conserva la zona y se recibe igual", async (_nombre, caso) => {
    const r = await conEscenario(async (e) => {
      const orden = await e.crearOrden({ distritoId: e.distritoX, estado: "en_ruta_bodega_central" });
      if (caso === "cierre") await e.crearDetalleDeCierre(orden);
      else await e.crearGestion(orden, caso);
      const status = await e.recibir(orden);
      return { e, status, zona: await e.zonaDe(orden), estado: await e.estadoDe(orden), acciones: await e.acciones([orden]) };
    });
    expect(r.status).toBe("ok");
    expect(r.estado).toBe("en_bodega_central");
    expect(r.zona).toBe(r.e.zonaA);
    expect(r.acciones).toHaveLength(0);
  });

  it.each([
    ["gestion `entregado` ANULADA", "entregado", true],
    ["gestion vigente `reprogramado`", "reprogramado", false],
  ] as const)("R1701: con %s SI cambia (el corte es por resultado vigente)", async (_nombre, resultado, anulada) => {
    const r = await conEscenario(async (e) => {
      const orden = await e.crearOrden({ distritoId: e.distritoX, estado: "en_ruta_bodega_central" });
      await e.crearGestion(orden, resultado, anulada);
      const status = await e.recibir(orden);
      return { e, status, zona: await e.zonaDe(orden), acciones: await e.acciones([orden]) };
    });
    expect(r.status).toBe("ok");
    expect(r.zona).toBe(r.e.zonaC);
    expect(r.acciones).toHaveLength(1);
  });

  it("R1702: sin distrito, o con un distrito sin zona, conserva la zona y se recibe igual", async () => {
    const r = await conEscenario(async (e) => {
      const sinDistrito = await e.crearOrden({ distritoId: null, estado: "en_ruta_bodega_central" });
      const distritoSinZona = await e.crearDistrito([]);
      const conDistritoSinZona = await e.crearOrden({ distritoId: distritoSinZona, estado: "en_ruta_bodega_central" });
      const s1 = await e.recibir(sinDistrito);
      const s2 = await e.recibir(conDistritoSinZona);
      return {
        e,
        s1,
        s2,
        z1: await e.zonaDe(sinDistrito),
        z2: await e.zonaDe(conDistritoSinZona),
        estados: [await e.estadoDe(sinDistrito), await e.estadoDe(conDistritoSinZona)],
        acciones: await e.acciones([sinDistrito, conDistritoSinZona]),
      };
    });
    expect([r.s1, r.s2]).toEqual(["ok", "ok"]);
    expect(r.estados).toEqual(["en_bodega_central", "en_bodega_central"]);
    expect(r.z1).toBe(r.e.zonaA);
    expect(r.z2).toBe(r.e.zonaA);
    expect(r.acciones).toHaveLength(0);
  });

  it("R1703: una segunda recepcion (ya recibida) y un estado invalido no cambian zona ni dejan accion", async () => {
    const r = await conEscenario(async (e) => {
      const yaRecibida = await e.crearOrden({ distritoId: e.distritoX, estado: "en_bodega_central" });
      const invalida = await e.crearOrden({ distritoId: e.distritoX, estado: "en_reparto" });
      return {
        e,
        s1: await e.recibir(yaRecibida),
        s2: await e.recibir(invalida),
        z1: await e.zonaDe(yaRecibida),
        z2: await e.zonaDe(invalida),
        acciones: await e.acciones([yaRecibida, invalida]),
      };
    });
    expect(r.s1).toBe("ya_recibida");
    expect(r.s2).toBe("estado_invalido");
    expect(r.z1).toBe(r.e.zonaA);
    expect(r.z2).toBe(r.e.zonaA);
    expect(r.acciones).toHaveLength(0);
  });

  it("R1703: una recepcion que pierde la carrera (el `updateMany` no transiciona) no reconcilia", async () => {
    // El repositorio directo, con `reconciliaZona: true`, sobre una orden que YA esta en la central:
    // la guarda del `updateMany` no la toma, y la reconciliacion va despues y solo si transiciono.
    const r = await conEscenario(async (e) => {
      const orden = await e.crearOrden({ distritoId: e.distritoX, estado: "en_bodega_central" });
      const destino = (await e.tx.orderStatus.findUniqueOrThrow({ where: { value: "en_bodega_central" } })).id;
      const transiciono = await e.repo.recibirEnBodegaCentral(
        orden,
        "en_ruta_bodega_central",
        destino,
        { actorUsuarioId: e.maestro, origenTipo: "recepcion_bodega_central" },
        { liberaAsignacion: true, reconciliaZona: true },
      );
      return { e, transiciono, zona: await e.zonaDe(orden), acciones: await e.acciones([orden]) };
    });
    expect(r.transiciono).toBe(false);
    expect(r.zona).toBe(r.e.zonaA);
    expect(r.acciones).toHaveLength(0);
  });

  it("R1703: la carrera de verdad — otra recepcion gana entre la lectura y el `updateMany`: no reconcilia", async () => {
    // La orden SI esta en `en_ruta_bodega_central` cuando el repositorio la lee; justo antes de su
    // `updateMany`, «otra recepcion» (un UPDATE real por SQL) la pasa a la central. Su `updateMany`
    // ya no la toma (count 0) y la reconciliacion no puede correr. Es el caso que distingue «el
    // helper va DESPUES de la transicion» de «va antes»: con el helper antes, la orden cambiaria.
    const r = await conEscenario(async (e) => {
      const orden = await e.crearOrden({ distritoId: e.distritoX, estado: "en_ruta_bodega_central" });
      const destino = (await e.tx.orderStatus.findUniqueOrThrow({ where: { value: "en_bodega_central" } })).id;
      const base = clienteConTransaccionAnidada(e.tx);
      let otraRecepcionHecha = false;
      const ordenConCarrera = new Proxy(base.orden as object, {
        get(objetivo, prop) {
          const valor = Reflect.get(objetivo, prop) as unknown;
          if (prop === "updateMany" && typeof valor === "function") {
            return async (args: unknown) => {
              if (!otraRecepcionHecha) {
                otraRecepcionHecha = true;
                await e.tx.$executeRawUnsafe(`UPDATE orden SET estatus_id = $1 WHERE id = $2`, destino, orden);
              }
              return (valor as (a: unknown) => unknown).call(objetivo, args);
            };
          }
          return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
        },
      });
      const cliente: unknown = new Proxy(base as object, {
        get(objetivo, prop) {
          if (prop === "orden") return ordenConCarrera;
          if (prop === "$transaction") return async (fn: (t: unknown) => unknown) => fn(cliente);
          return Reflect.get(objetivo, prop) as unknown;
        },
      });
      const transiciono = await new OrdenRepository(cliente as PrismaClient).recibirEnBodegaCentral(
        orden,
        "en_ruta_bodega_central",
        destino,
        { actorUsuarioId: e.maestro, origenTipo: "recepcion_bodega_central" },
        { liberaAsignacion: true, reconciliaZona: true },
      );
      return { e, otraRecepcionHecha, transiciono, zona: await e.zonaDe(orden), acciones: await e.acciones([orden]) };
    });
    expect(r.otraRecepcionHecha).toBe(true);
    expect(r.transiciono).toBe(false);
    expect(r.zona).toBe(r.e.zonaA);
    expect(r.acciones).toHaveLength(0);
  });

  it("R1704: recibir una devolucion (`devolviendo_a_bodega_central`) desalineada conserva la zona y no deja accion", async () => {
    const r = await conEscenario(async (e) => {
      const orden = await e.crearOrden({ distritoId: e.distritoX, estado: "devolviendo_a_bodega_central" });
      const status = await e.recibir(orden);
      return { e, status, zona: await e.zonaDe(orden), estado: await e.estadoDe(orden), acciones: await e.acciones([orden]) };
    });
    expect(r.status).toBe("ok");
    expect(r.estado).toBe("por_devolver_a_tienda");
    expect(r.zona).toBe(r.e.zonaA);
    expect(r.acciones).toHaveLength(0);
  });

  it("R1700: el ordenIds acota — otra orden desalineada del mismo distrito, ya en la central, NO cambia", async () => {
    const r = await conEscenario(async (e) => {
      const recibida = await e.crearOrden({ distritoId: e.distritoX, estado: "en_ruta_bodega_central" });
      const vecina = await e.crearOrden({ distritoId: e.distritoX, estado: "en_bodega_central" });
      const status = await e.recibir(recibida);
      return {
        e,
        status,
        zRecibida: await e.zonaDe(recibida),
        zVecina: await e.zonaDe(vecina),
        acciones: await e.acciones([recibida, vecina]),
        recibida,
      };
    });
    expect(r.status).toBe("ok");
    expect(r.zRecibida).toBe(r.e.zonaC);
    expect(r.zVecina).toBe(r.e.zonaA);
    expect(r.acciones.map((a) => a.entidadId)).toEqual([r.recibida]);
  });

  it("R1707: la fila de la orden queda igual salvo zona, estado y fecha de actualizacion; las tablas de dinero no cambian", async () => {
    const r = await conEscenario(async (e) => {
      const orden = await e.crearOrden({ distritoId: e.distritoX, estado: "en_ruta_bodega_central" });
      const fila = async () =>
        (await e.tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM orden WHERE id = $1`, orden))[0];
      const dinero = async () =>
        e.tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT (SELECT count(*) FROM cierre_detail)::int + (SELECT count(*) FROM cierre_detail_concepto)::int
                + (SELECT count(*) FROM gestion_orden)::int + (SELECT count(*) FROM gestion_pago_congelado)::int
                + (SELECT count(*) FROM wallet_movimiento)::int AS n`,
        );
      const antes = await fila();
      const dineroAntes = await dinero();
      const status = await e.recibir(orden);
      return { e, status, antes, despues: await fila(), dineroAntes, dineroDespues: await dinero() };
    });
    expect(r.status).toBe("ok");
    expect(r.despues.zona_id).toBe(r.e.zonaC);
    const sinCambiosEsperados = (f: Record<string, unknown>) => {
      const resto = Object.fromEntries(Object.entries(f).filter(([k]) => !["zona_id", "updated_at", "estatus_id"].includes(k)));
      return resto;
    };
    expect(sinCambiosEsperados(r.despues)).toEqual(sinCambiosEsperados(r.antes));
    expect(r.dineroDespues).toEqual(r.dineroAntes);
  });
});
