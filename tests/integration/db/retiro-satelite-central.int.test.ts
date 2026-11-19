import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { GuiaAsignacionService } from "@/lib/services/GuiaAsignacionService";
import { RecepcionBodegaCentralService } from "@/lib/services/RecepcionBodegaCentralService";
import { ESTADOS_BODEGA_SATELITE } from "@/lib/utils/estados-bodega-satelite";
import type { IAsignabilidadCoordenadasService } from "@/lib/interfaces/services/IAsignabilidadCoordenadasService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { OrderStatusValue } from "@/lib/types/order-status";
import { fakeIntentosEnLote } from "@/tests/fixtures/intentos-entrega";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-197 «Retirar paquetes de una bodega satelite a la central» — contra Postgres real.
 *
 * Por que aqui y no con dobles: la guarda del retiro (ids ∧ no borrada ∧ `en_bodega_satelite`)
 * vive en el `WHERE` de `OrdenRepository.retirarSateliteLote`. Con un `vi.fn()` una mutacion de ese
 * `WHERE` pasaria en verde. Aqui se mide la fila real.
 *
 * SIEMBRA PROPIA: cada caso corre en una transaccion que SIEMPRE se revierte, con su empresa
 * (`enTransaccionRevertida`), su zona central, dos zonas satelite, un maestro y sus ordenes. Nada se
 * lee de datos previos de la base salvo los catalogos que traen las migraciones. El repositorio va
 * sobre `clienteConSavepoint`: su `$transaction` abre un SAVEPOINT real, asi que el `throw` del
 * conflicto revierte de verdad lo que el `updateMany` ya escribio (con el pass-through no lo haria y
 * R973/R974 pasarian por accidente).
 *
 * MUTACIONES DE CONTROL (2026-11-17, anotadas en `progress/impl_SLT-197.md`): quitar el estado del
 * `WHERE`, quitar `deletedAt: null` y quitar `id: { in: ordenIds }` ponen rojos los casos que lo
 * vigilan.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `197-${Date.now().toString(36)}`;
const GUIA_BASE = 960_000_000 + (Date.now() % 30_000_000);
let contador = 0;
function unico(): string {
  contador += 1;
  return `${SUFIJO}-${contador.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Tablas de dinero y cierres que el retiro y su recepcion NO deben tocar (R983). */
const TABLAS_DE_DINERO = [
  "wallet_movimiento",
  "wallet_tienda_movimiento",
  "pago_mensajero_movimiento",
  "cierre_dia",
  "cierre_detail",
  "cierre_bodega",
  "cierre_sin_gestion",
  "cierre_rechazo_tienda",
  "gestion_orden_pago",
  "gestion_pago_mensajero_ajuste",
  "rechazo_tienda_cobro",
  "liquidacion_pago",
  "pago_por_cuenta_tienda",
  "gasto_fijo_cobro",
  "cobro_plataforma_movimiento",
  "orden_fulfillment_movimiento",
] as const;

interface Zona {
  id: string;
  nombre: string;
}

interface Escenario {
  tx: TxDeTest;
  fks: FksDeOrden;
  maestro: Actor;
  central: Zona;
  cartago: Zona;
  limon: Zona;
  /** Repo con savepoint real (el rollback del conflicto es de verdad). */
  repo: OrdenRepository;
  service: GuiaAsignacionService;
  crearOrden: (o: {
    zonaId: string;
    estado: OrderStatusValue;
    borrada?: boolean;
    distritoId?: string | null;
    conMensajero?: boolean;
  }) => Promise<{ id: string; numGuia: number }>;
  estadoDe: (ordenId: string) => Promise<string>;
  idEstado: (value: OrderStatusValue) => Promise<string>;
  historialDe: (ordenIds: string[]) => Promise<
    { ordenId: string; origen: string | null; destino: string; actor: string | null; tipo: string }[]
  >;
  conteosDeDinero: () => Promise<Record<string, number>>;
}

describeSiHayBase("SLT-197 — retiro de satelite a central, contra Postgres real", () => {
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
      const maestroUsr = await crearUsuarioDePrueba(tx, "maestro");
      const maestro: Actor = { usuarioId: maestroUsr.id, rol: "maestro" };

      const zona = async (prefijo: string, esCentral: boolean): Promise<Zona> => {
        const nombre = `${prefijo} ${unico()}`;
        const z = await tx.zona.create({
          data: { nombre, esCentral, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        });
        return { id: z.id, nombre };
      };
      const central = await zona("197 Central", true);
      const cartago = await zona("197 Cartago", false);
      const limon = await zona("197 Limon", false);

      const idEstado = async (value: OrderStatusValue) =>
        (await tx.orderStatus.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;

      const mensajero = await crearUsuarioDePrueba(tx, "mensajero");

      const repo = new OrdenRepository(clienteConSavepoint(tx));
      const service = new GuiaAsignacionService(
        repo,
        new ZonaRepository(clienteConTransaccionAnidada(tx)),
        // Ningun caso llega al gate de coordenadas: si alguno lo hiciera, este doble revienta.
        {
          evaluar: () => {
            throw new Error("el gate de coordenadas no deberia ejecutarse en esta suite");
          },
        } as unknown as IAsignabilidadCoordenadasService,
        fakeIntentosEnLote(),
        reglasPaisFijas(),
      );

      const e: Escenario = {
        tx,
        fks,
        maestro,
        central,
        cartago,
        limon,
        repo,
        service,
        idEstado,
        crearOrden: async ({ zonaId, estado, borrada = false, distritoId = null, conMensajero = false }) => {
          contador += 1;
          const numGuia = GUIA_BASE + contador;
          const o = await tx.orden.create({
            data: {
              numGuia,
              numRemision: `R-${unico()}`,
              destinatario: "Destinataria 197",
              telefonoDest: "8888-0000",
              producto: "caja de zapatos",
              estatusId: await idEstado(estado),
              tiendaId: fks.tiendaId,
              zonaId,
              provinciaId: fks.provinciaId,
              cantonId: fks.cantonId,
              distritoId,
              direccion: "avenida siempre viva 742",
              montoCobrar: 12_345,
              deletedAt: borrada ? new Date() : null,
              ...(conMensajero
                ? {
                    mensajeroAsignadoId: mensajero.id,
                    asignadoAt: new Date("2026-11-16T15:00:00Z"),
                    fechaReparto: new Date("2026-11-16T00:00:00Z"),
                  }
                : {}),
            },
            select: { id: true },
          });
          return { id: o.id, numGuia };
        },
        estadoDe: async (ordenId) =>
          (
            await tx.orden.findUniqueOrThrow({
              where: { id: ordenId },
              select: { estatus: { select: { value: true } } },
            })
          ).estatus.value,
        historialDe: async (ordenIds) => {
          const filas = await tx.ordenHistorialEstado.findMany({
            where: { ordenId: { in: ordenIds } },
            select: {
              ordenId: true,
              actorUsuarioId: true,
              origenTipo: true,
              estatusOrigen: { select: { value: true } },
              estatusDestino: { select: { value: true } },
            },
          });
          return filas.map((f) => ({
            ordenId: f.ordenId,
            origen: f.estatusOrigen?.value ?? null,
            destino: f.estatusDestino.value,
            actor: f.actorUsuarioId,
            tipo: f.origenTipo,
          }));
        },
        conteosDeDinero: async () => {
          const out: Record<string, number> = {};
          for (const tabla of TABLAS_DE_DINERO) {
            const r = await tx.$queryRawUnsafe<{ n: bigint }[]>(
              `SELECT count(*)::bigint AS n FROM "${tabla}"`,
            );
            out[tabla] = Number(r[0]!.n);
          }
          return out;
        },
      };
      return fn(e);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R971 / R972 / R985 — el lote sale entero, con su historial, sin mensajero y con su zona
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R971/R972/R985: lote de dos zonas -> en_ruta_bodega_central, historial ajuste_estado, zona intacta", async () => {
    const m = await conEscenario(async (e) => {
      const a = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", conMensajero: true });
      const b = await e.crearOrden({ zonaId: e.limon.id, estado: "en_bodega_satelite" });
      // Vecina en el MISMO estado pero fuera del lote: no puede moverse (vigila `id IN`).
      const vecina = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const antes = await e.tx.orden.findMany({
        where: { id: { in: [a.id, b.id] } },
        select: { id: true, zonaId: true, tiendaId: true, numGuia: true, numRemision: true, montoCobrar: true },
        orderBy: { id: "asc" },
      });

      const r = await e.service.retirarABodegaCentral({ ordenIds: [a.id, b.id] }, e.maestro);

      const despues = await e.tx.orden.findMany({
        where: { id: { in: [a.id, b.id] } },
        select: {
          id: true,
          zonaId: true,
          tiendaId: true,
          numGuia: true,
          numRemision: true,
          montoCobrar: true,
          mensajeroAsignadoId: true,
          asignadoAt: true,
          fechaReparto: true,
          estatus: { select: { value: true } },
        },
        orderBy: { id: "asc" },
      });
      return {
        r,
        a,
        b,
        antes,
        despues,
        zonas: { cartago: e.cartago.id, limon: e.limon.id },
        estadoVecina: await e.estadoDe(vecina.id),
        historial: await e.historialDe([a.id, b.id, vecina.id]),
        maestro: e.maestro.usuarioId,
      };
    });

    expect(m.r).toEqual({
      status: "ok",
      resultados: [
        { ordenId: m.a.id, estado: "en_ruta_bodega_central" },
        { ordenId: m.b.id, estado: "en_ruta_bodega_central" },
      ],
    });
    expect(m.despues).toHaveLength(2);
    for (const fila of m.despues) {
      expect(fila.estatus.value).toBe("en_ruta_bodega_central");
      // R972: sin mensajero, sin asignacion y sin dia de reparto.
      expect(fila.mensajeroAsignadoId).toBeNull();
      expect(fila.asignadoAt).toBeNull();
      expect(fila.fechaReparto).toBeNull();
    }
    // R972: zona, tienda, guia, remision y monto, intactos.
    expect(
      m.despues.map((f) => ({
        id: f.id,
        zonaId: f.zonaId,
        tiendaId: f.tiendaId,
        numGuia: f.numGuia,
        numRemision: f.numRemision,
        monto: f.montoCobrar?.toString(),
      })),
    ).toEqual(
      m.antes.map((f) => ({
        id: f.id,
        zonaId: f.zonaId,
        tiendaId: f.tiendaId,
        numGuia: f.numGuia,
        numRemision: f.numRemision,
        monto: f.montoCobrar?.toString(),
      })),
    );
    // R985: cada una conserva SU zona satelite (dos distintas).
    expect(new Set(m.despues.map((f) => f.zonaId))).toEqual(new Set([m.zonas.cartago, m.zonas.limon]));
    // La vecina fuera del lote no se movio.
    expect(m.estadoVecina).toBe("en_bodega_satelite");
    // R971: una fila por orden, con origen, destino, actor y familia.
    expect(m.historial.filter((h) => h.tipo === "ajuste_estado").sort((x, y) => x.ordenId.localeCompare(y.ordenId))).toEqual(
      [m.a.id, m.b.id].sort().map((ordenId) => ({
        ordenId,
        origen: "en_bodega_satelite",
        destino: "en_ruta_bodega_central",
        actor: m.maestro,
        tipo: "ajuste_estado",
      })),
    );
    expect(m.historial).toHaveLength(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R973 / R974 — todo o nada
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R973/R974: repo con una orden del lote en mensajero_recogiendo_en_bodega -> conflicto, cero cambios, cero historial", async () => {
    const m = await conEscenario(async (e) => {
      const ok = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const otra = await e.crearOrden({ zonaId: e.cartago.id, estado: "mensajero_recogiendo_en_bodega" });
      const r = await e.repo.retirarSateliteLote([ok.id, otra.id], await e.idEstado("en_ruta_bodega_central"), {
        actorUsuarioId: e.maestro.usuarioId,
        origenTipo: "ajuste_estado",
      });
      return {
        r,
        estados: [await e.estadoDe(ok.id), await e.estadoDe(otra.id)],
        historial: await e.historialDe([ok.id, otra.id]),
      };
    });
    expect(m.r).toBe("conflicto");
    expect(m.estados).toEqual(["en_bodega_satelite", "mensajero_recogiendo_en_bodega"]);
    expect(m.historial).toEqual([]);
  });

  it("R973: repo con una orden BORRADA en en_bodega_satelite -> conflicto, cero cambios", async () => {
    const m = await conEscenario(async (e) => {
      const ok = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const borrada = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", borrada: true });
      const r = await e.repo.retirarSateliteLote([ok.id, borrada.id], await e.idEstado("en_ruta_bodega_central"), {
        actorUsuarioId: e.maestro.usuarioId,
        origenTipo: "ajuste_estado",
      });
      return {
        r,
        estados: [await e.estadoDe(ok.id), await e.estadoDe(borrada.id)],
        historial: await e.historialDe([ok.id, borrada.id]),
      };
    });
    expect(m.r).toBe("conflicto");
    expect(m.estados).toEqual(["en_bodega_satelite", "en_bodega_satelite"]);
    expect(m.historial).toEqual([]);
  });

  it("R974: la satelite asigna una orden entre la validacion del service y la escritura -> conflict sin efectos", async () => {
    const m = await conEscenario(async (e) => {
      const a = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const b = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const recogiendo = await e.idEstado("mensajero_recogiendo_en_bodega");
      // La carrera, reproducida: justo despues de que el service lee el lote (y lo da por valido),
      // la satelite mueve `b`. El repositorio tiene que notarlo en su `WHERE`.
      const lecturaOriginal = e.repo.findByIdsForTransicion.bind(e.repo);
      e.repo.findByIdsForTransicion = async (ids: string[]) => {
        const filas = await lecturaOriginal(ids);
        await e.tx.orden.update({ where: { id: b.id }, data: { estatusId: recogiendo } });
        return filas;
      };
      const r = await e.service.retirarABodegaCentral({ ordenIds: [a.id, b.id] }, e.maestro);
      return {
        r,
        a: a.id,
        b: b.id,
        estados: [await e.estadoDe(a.id), await e.estadoDe(b.id)],
        historial: await e.historialDe([a.id, b.id]),
      };
    });
    expect(m.r).toEqual({
      status: "conflict",
      detalle: [
        { ordenId: m.a, motivo: "la orden cambió de estado; recarga" },
        { ordenId: m.b, motivo: "la orden cambió de estado; recarga" },
      ],
    });
    // `a` NO salio aunque era valida: todo o nada.
    expect(m.estados).toEqual(["en_bodega_satelite", "mensajero_recogiendo_en_bodega"]);
    expect(m.historial).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // SLT-211 — el retiro deja su rastro en Historico › Acciones (`historial_accion`)
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /** Las filas de `historial_accion` que escribio ESTE maestro (usuario recien sembrado). */
  async function accionesDe(e: Escenario) {
    return e.tx.historialAccion.findMany({
      where: { actorUsuarioId: e.maestro.usuarioId },
      select: {
        accion: true,
        entidadTipo: true,
        entidadId: true,
        entidadEtiqueta: true,
        actorUsuarioId: true,
        actorNombre: true,
        actorRol: true,
        monto: true,
        valorAnterior: true,
        valorNuevo: true,
        loteId: true,
      },
      orderBy: { entidadEtiqueta: "asc" },
    });
  }

  it("SLT-211: un retiro de 3 ordenes de una satelite deja EXACTAMENTE 1 accion, con actor, satelite y conteo", async () => {
    const m = await conEscenario(async (e) => {
      const ordenes = [
        await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" }),
        await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" }),
        await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" }),
      ];
      const antes = await accionesDe(e);
      const r = await e.service.retirarABodegaCentral({ ordenIds: ordenes.map((o) => o.id) }, e.maestro);
      const usuario = await e.tx.usuario.findUniqueOrThrow({
        where: { id: e.maestro.usuarioId },
        select: { nombre: true, primerApellido: true },
      });
      return { r, antes, despues: await accionesDe(e), ordenes, cartago: e.cartago, maestro: e.maestro, usuario };
    });

    expect(m.r.status).toBe("ok");
    // Control: el maestro es nuevo, no tenia ninguna accion antes.
    expect(m.antes, "SLT-211: el maestro sembrado no trae acciones previas").toEqual([]);
    expect(m.despues, "SLT-211: un lote de una satelite = una sola accion").toHaveLength(1);
    const fila = m.despues[0]!;
    const guias = m.ordenes.map((o) => o.numGuia).sort((x, y) => x - y);
    expect(fila).toMatchObject({
      accion: "ordenes_retiradas_a_central",
      entidadTipo: "zona",
      entidadId: m.cartago.id,
      actorUsuarioId: m.maestro.usuarioId,
      actorRol: "maestro",
      monto: null,
      valorAnterior: null,
      valorNuevo: null,
    });
    // El nombre congelado es el del usuario tal como esta en la base, no uno compuesto por el test.
    expect(fila.actorNombre).toBe(
      [m.usuario.nombre, m.usuario.primerApellido].filter((p) => p != null && p !== "").join(" "),
    );
    // Satelite de origen, conteo y las tres guias, en orden.
    expect(fila.entidadEtiqueta).toBe(`${m.cartago.nombre} · 3 paquetes: ${guias.join(", ")}`);
  });

  it("SLT-211: un lote que mezcla dos satelites deja una fila por satelite, con el MISMO lote_id", async () => {
    const m = await conEscenario(async (e) => {
      const c1 = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const c2 = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const l1 = await e.crearOrden({ zonaId: e.limon.id, estado: "en_bodega_satelite" });
      const r = await e.service.retirarABodegaCentral({ ordenIds: [c1.id, l1.id, c2.id] }, e.maestro);
      return { r, acciones: await accionesDe(e), c1, c2, l1, cartago: e.cartago, limon: e.limon };
    });
    expect(m.r.status).toBe("ok");
    expect(m.acciones).toHaveLength(2);
    expect(new Set(m.acciones.map((a) => a.loteId)).size, "SLT-211: un acto, un lote_id").toBe(1);
    const porZona = new Map(m.acciones.map((a) => [a.entidadId, a.entidadEtiqueta]));
    const guiasCartago = [m.c1.numGuia, m.c2.numGuia].sort((x, y) => x - y);
    expect(porZona.get(m.cartago.id)).toBe(`${m.cartago.nombre} · 2 paquetes: ${guiasCartago.join(", ")}`);
    expect(porZona.get(m.limon.id)).toBe(`${m.limon.nombre} · 1 paquete: ${m.l1.numGuia}`);
  });

  it("SLT-211: un retiro en conflicto (carrera en el WHERE) NO deja ninguna accion", async () => {
    const m = await conEscenario(async (e) => {
      const a = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const b = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const recogiendo = await e.idEstado("mensajero_recogiendo_en_bodega");
      const lecturaOriginal = e.repo.findByIdsForTransicion.bind(e.repo);
      e.repo.findByIdsForTransicion = async (ids: string[]) => {
        const filas = await lecturaOriginal(ids);
        await e.tx.orden.update({ where: { id: b.id }, data: { estatusId: recogiendo } });
        return filas;
      };
      const r = await e.service.retirarABodegaCentral({ ordenIds: [a.id, b.id] }, e.maestro);
      // Control positivo en la MISMA siembra: un retiro valido despues si escribe (el detector ve filas).
      const c = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const accionesTrasConflicto = await accionesDe(e);
      e.repo.findByIdsForTransicion = lecturaOriginal;
      const ok = await e.service.retirarABodegaCentral({ ordenIds: [c.id] }, e.maestro);
      return { r, accionesTrasConflicto, ok, accionesTrasOk: await accionesDe(e) };
    });
    expect(m.r.status).toBe("conflict");
    expect(m.accionesTrasConflicto, "SLT-211: conflicto = cero acciones").toEqual([]);
    expect(m.ok.status).toBe("ok");
    expect(m.accionesTrasOk, "SLT-211: control positivo, el retiro valido si deja su fila").toHaveLength(1);
  });

  it("SLT-211: el repo en conflicto (orden fuera de en_bodega_satelite) no deja ninguna accion", async () => {
    const m = await conEscenario(async (e) => {
      const ok = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const otra = await e.crearOrden({ zonaId: e.cartago.id, estado: "mensajero_recogiendo_en_bodega" });
      const r = await e.repo.retirarSateliteLote([ok.id, otra.id], await e.idEstado("en_ruta_bodega_central"), {
        actorUsuarioId: e.maestro.usuarioId,
        origenTipo: "ajuste_estado",
      });
      return { r, acciones: await accionesDe(e) };
    });
    expect(m.r).toBe("conflicto");
    expect(m.acciones).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R977 / R978 / R979 / R983 — recepcion en la central, de vuelta a la ruta y lo que ve la satelite
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R977/R978/R979/R983: recibir en la central, no asignable desde ahi, rutear de nuevo; la satelite no la ve; sin dinero", async () => {
    const m = await conEscenario(async (e) => {
      const o = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite" });
      const filtro = { estatusValues: [...ESTADOS_BODEGA_SATELITE], zonaId: e.cartago.id };
      const listado = async () =>
        (await e.repo.findRecepcionSatelitePaginada(filtro, { skip: 0, take: 100 })).items.map((x) => x.id);

      // Control positivo: ANTES del retiro la satelite SI la ve (si no, el R979 seria vacuo).
      const veAntes = (await listado()).includes(o.id);
      const dineroAntes = await e.conteosDeDinero();

      const retiro = await e.service.retirarABodegaCentral({ ordenIds: [o.id] }, e.maestro);
      const veEnTransito = (await listado()).includes(o.id);

      // R977: el escaner de recepcion que ya existe, sobre el repo real.
      const recepcion = await new RecepcionBodegaCentralService(e.repo).recibirEnBodegaCentral(o.numGuia, e.maestro);
      const trasRecibir = await e.tx.orden.findUniqueOrThrow({
        where: { id: o.id },
        select: { zonaId: true, estatus: { select: { value: true } } },
      });
      const veRecibida = (await listado()).includes(o.id);
      const dineroDespues = await e.conteosDeDinero();

      // R978: «Asignar mensajero» de la central la rechaza por zona no central. Mensajero valido de
      // la central, con vehiculo y activo, para que el rechazo salga de la orden y no del mensajero.
      const veh = await e.tx.vehiculo.create({ data: { name: `veh ${unico()}` }, select: { id: true } });
      const mens = await crearUsuarioDePrueba(e.tx, "mensajero");
      await e.tx.usuario.update({ where: { id: mens.id }, data: { zonaId: e.central.id, vehiculoId: veh.id } });
      const asignar = await e.service.asignarDesdeBodega({ ordenIds: [o.id], mensajeroId: mens.id }, e.maestro);

      // R978: «Rutear a bodega satelite» la admite.
      const rutear = await e.service.rutearABodegaSatelite({ ordenIds: [o.id] }, e.maestro);

      return {
        o: o.id,
        cartago: e.cartago.id,
        veAntes,
        retiro: retiro.status,
        veEnTransito,
        recepcion,
        trasRecibir,
        veRecibida,
        dineroAntes,
        dineroDespues,
        asignar,
        rutear,
        estadoFinal: await e.estadoDe(o.id),
        // `created_at` es el instante de la transaccion (la del test): todas las filas lo comparten,
        // asi que se comparan ordenadas, no por fecha.
        historial: (await e.historialDe([o.id])).map((h) => `${h.origen}->${h.destino} (${h.tipo})`).sort(),
      };
    });

    expect(m.veAntes).toBe(true);
    expect(m.retiro).toBe("ok");
    // R979: ni en transito ni recibida aparece en el listado de la satelite de su zona.
    expect(m.veEnTransito).toBe(false);
    expect(m.veRecibida).toBe(false);
    // R977
    expect(m.recepcion.status).toBe("ok");
    expect(m.trasRecibir).toEqual({ zonaId: m.cartago, estatus: { value: "en_bodega_central" } });
    // R983: ni una fila de dinero o cierres de mas.
    expect(m.dineroDespues).toEqual(m.dineroAntes);
    // R978
    expect(m.asignar).toEqual({ status: "conflict", detalle: [{ ordenId: m.o, motivo: "orden de zona no-GAM" }] });
    expect(m.rutear).toEqual({ status: "ok", resultados: [{ ordenId: m.o, estado: "en_ruta_bodega_satelite" }] });
    expect(m.estadoFinal).toBe("en_ruta_bodega_satelite");
    expect(m.historial).toEqual([
      "en_bodega_central->en_ruta_bodega_satelite (ruteo_satelite)",
      "en_bodega_satelite->en_ruta_bodega_central (ajuste_estado)",
      "en_ruta_bodega_central->en_bodega_central (recepcion_bodega_central)",
    ]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R986 — la reconciliacion de zonas mueve la retirada y no la cuenta como retenida
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R986: pasar el distrito a otra zona mueve la retirada (en transito y recibida) y solo retiene la del estante", async () => {
    const m = await conEscenario(async (e) => {
      const distrito = await e.tx.distrito.create({
        data: { nombre: `197 D ${unico()}`, cantonId: e.fks.cantonId },
        select: { id: true },
      });
      // El distrito ya es de Limon; las ordenes todavia llevan la zona Cartago.
      await e.tx.zonaDistrito.create({ data: { zonaId: e.limon.id, distritoId: distrito.id } });
      const enTransito = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", distritoId: distrito.id });
      const recibida = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", distritoId: distrito.id });
      const enEstante = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", distritoId: distrito.id });

      const retiro = await e.service.retirarABodegaCentral({ ordenIds: [enTransito.id, recibida.id] }, e.maestro);
      const recepcion = await new RecepcionBodegaCentralService(e.repo).recibirEnBodegaCentral(recibida.numGuia, e.maestro);

      const zonaRepo = new ZonaRepository(clienteConTransaccionAnidada(e.tx));
      const res = await zonaRepo.update(
        e.limon.id,
        { nombre: e.limon.nombre, cobroVehiculo: false, esCentral: false, distritoIds: [distrito.id], tarifas: [] },
        e.maestro.usuarioId,
      );
      const zonaDe = async (id: string) =>
        (await e.tx.orden.findUniqueOrThrow({ where: { id }, select: { zonaId: true } })).zonaId;
      return {
        retiro: retiro.status,
        recepcion: recepcion.status,
        res,
        limon: e.limon.id,
        cartago: e.cartago.id,
        zonas: {
          enTransito: await zonaDe(enTransito.id),
          recibida: await zonaDe(recibida.id),
          enEstante: await zonaDe(enEstante.id),
        },
        estados: [await e.estadoDe(enTransito.id), await e.estadoDe(recibida.id), await e.estadoDe(enEstante.id)],
      };
    });

    expect(m.retiro).toBe("ok");
    expect(m.recepcion).toBe("ok");
    expect(m.estados).toEqual(["en_ruta_bodega_central", "en_bodega_central", "en_bodega_satelite"]);
    if (m.res.estado !== "ok") throw new Error(`se esperaba ok y llego ${m.res.estado}`);
    expect(m.res.ordenesRetenidasEnBodegaSatelite).toBe(1);
    expect(m.zonas).toEqual({ enTransito: m.limon, recibida: m.limon, enEstante: m.cartago });
  });
});
