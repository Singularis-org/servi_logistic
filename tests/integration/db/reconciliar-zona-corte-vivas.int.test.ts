import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CierreEstado, GestionResultado, PrismaClient } from "@prisma/client";

import type { UpdateZonaData, UpdateZonaResult } from "@/lib/interfaces/repositories/IZonaRepository";
import { ActualizacionZonasRepository } from "@/lib/repositories/ActualizacionZonasRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
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
 * SLT-224 PR 2 (design §7.5, D6, R1720-R1724, R1707) — EL CORTE NUEVO: VIVAS SI, FINALIZADAS NO.
 *
 * El corte de la 366 excluia toda orden con algun `cierre_detail` o con una gestion vigente que
 * decidio dinero, tambien la de un intento ANTERIOR ya cerrado y aprobado. Desde D6 solo protege el
 * dinero EN CURSO (cierre sin aprobar, o gestion decidida sin cierre aprobado), y el estado lo
 * decide `CLASE_RECONCILIACION_ZONA`. Lo que decide quien se mueve es el `WHERE` del helper
 * compartido sobre `cierre_detail`, `cierre_dia` y `gestion_orden`: un doble no lo ve.
 *
 * Escenario: zona satelite A, zona C, distrito X mapeado a C; toda orden nace con `zona_id = A` en X.
 * El estado y las filas de cierre se siembran DIRECTOS, sin recorrer el flujo: se mide el `WHERE`.
 * Todo dentro de `enTransaccionRevertida`; sin base el archivo sale `skipped`, nunca `passed`.
 *
 * MUTACIONES EJECUTADAS (2026-11-19, ver `progress/impl_SLT-224.md`), cada una con su rojo:
 *   1. `cierreDetalles: { none: {} }`                       -> rojo en la matriz y los tres llamadores.
 *   2. quitar `{ cierreId: null }` del `OR` de gestiones   -> rojo en la matriz (gestion sin cierre).
 *   3. `not: "aprobado"` -> `equals: "solicitado"` (los dos) -> rojo en la matriz (rechazado/vencido).
 *   4. `incidente: "se_mueve"` en la clasificacion          -> rojo en la matriz (R1721).
 *   5. `reprogramado: "se_mueve"`                            -> rojo en la matriz (R1723).
 *      SLT-248 lo invirtio (R1801): ahora la mutacion es `reprogramado: "por_liberar"` (o
 *      `novedad: "devolucion"`) -> rojo en la matriz (ver `progress/impl_SLT-248.md`).
 *   6. `notIn` con `ESTADOS_PAQUETE_EN_ESTANTE`              -> rojo en la matriz.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Escenario {
  tx: TxDeTest;
  maestro: string;
  zonaA: string;
  zonaC: string;
  nombreC: string;
  distritoX: string;
  /** clave -> id de orden */
  ordenes: Map<string, string>;
  crearOrden: (clave: string, estado: OrderStatusValue) => Promise<string>;
  crearCierre: (estado: CierreEstado) => Promise<string>;
  crearDetalle: (ordenId: string, cierreId: string) => Promise<void>;
  crearGestion: (
    ordenId: string,
    resultado: GestionResultado,
    o?: { anulada?: boolean; cierreId?: string },
  ) => Promise<void>;
  zonaDe: (id: string) => Promise<string>;
  acciones: (ids: string[]) => Promise<{ entidadId: string; actorUsuarioId: string | null; loteId: string }[]>;
  guardarZonaC: () => Promise<UpdateZonaResult>;
  recibir: (ordenId: string) => Promise<string>;
  actualizarBoton: () => Promise<number>;
  huellaDinero: () => Promise<Record<string, string | null>>;
}

function datosDeZona(nombre: string, distritoIds: string[]): UpdateZonaData {
  return { nombre, cobroVehiculo: false, esCentral: false, distritoIds, tarifas: [] };
}

function okDe(res: UpdateZonaResult): { reconciliadas: number; retenidas: number } {
  if (res.estado !== "ok") throw new Error(`se esperaba \`ok\` y llego \`${res.estado}\``);
  return { reconciliadas: res.ordenesReconciliadas, retenidas: res.ordenesRetenidasEnBodegaSatelite };
}

const TABLAS_DE_DINERO = [
  "cierre_detail",
  "cierre_detail_concepto",
  "gestion_orden",
  "gestion_pago_congelado",
  "wallet_movimiento",
] as const;

describeSiHayBase("SLT-224 PR 2 · el corte nuevo de la reconciliacion de zona (Postgres real)", () => {
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
      const suf = randomUUID().slice(0, 8);

      const crearZona = async (nombre: string) =>
        (
          await tx.zona.create({
            data: { nombre, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
            select: { id: true },
          })
        ).id;
      const zonaA = await crearZona(`slt224c A ${suf}`);
      const nombreC = `slt224c C ${suf}`;
      const zonaC = await crearZona(nombreC);
      const distritoX = (
        await tx.distrito.create({ data: { nombre: `slt224c X ${suf}`, cantonId: fks.cantonId }, select: { id: true } })
      ).id;
      await tx.zonaDistrito.create({ data: { zonaId: zonaC, distritoId: distritoX } });

      const estatusId = async (value: OrderStatusValue) =>
        (await tx.orderStatus.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;

      const cliente = clienteConTransaccionAnidada(tx);
      const ordenRepo = new OrdenRepository(cliente);
      const recepcion = new RecepcionBodegaCentralService(ordenRepo);
      const zonaRepo = new ZonaRepository(cliente);
      const botonRepo = new ActualizacionZonasRepository(cliente);
      const ordenes = new Map<string, string>();

      const e: Escenario = {
        tx,
        maestro,
        zonaA,
        zonaC,
        nombreC,
        distritoX,
        ordenes,
        crearOrden: async (clave, estado) => {
          const [{ g }] = await tx.$queryRawUnsafe<{ g: number }[]>(`SELECT nextval('orden_num_guia_seq')::int AS g`);
          const id = (
            await tx.orden.create({
              data: {
                numRemision: `R-224c-${clave}-${suf}`,
                numGuia: g,
                destinatario: "Destinataria 224",
                telefonoDest: "8888-0000",
                producto: "caja",
                estatusId: await estatusId(estado),
                tiendaId: fks.tiendaId,
                zonaId: zonaA,
                provinciaId: fks.provinciaId,
                cantonId: fks.cantonId,
                distritoId: distritoX,
                direccion: "avenida 224",
                montoCobrar: 12_000,
                intentosContacto: 2,
              },
              select: { id: true },
            })
          ).id;
          ordenes.set(clave, id);
          return id;
        },
        crearCierre: async (estado) =>
          (
            await tx.cierreDia.create({
              data: { mensajeroId: mensajero, estado, destinoTipo: "bodega_satelite", destinoZonaId: zonaA },
              select: { id: true },
            })
          ).id,
        crearDetalle: async (ordenId, cierreId) => {
          await tx.cierreDetail.create({
            data: {
              cierreId,
              ordenId,
              cobraComision: false,
              zonaId: zonaA,
              tiendaId: fks.tiendaId,
              esCentral: false,
              numRemision: `cd-${randomUUID().slice(0, 8)}`,
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
        crearGestion: async (ordenId, resultado, o = {}) => {
          await tx.gestionOrden.create({
            data: {
              ordenId,
              mensajeroId: mensajero,
              resultado,
              ...(o.cierreId !== undefined ? { cierreId: o.cierreId } : {}),
              ...(o.anulada === true ? { anuladaAt: new Date("2026-11-01T12:00:00Z") } : {}),
            },
            select: { id: true },
          });
        },
        zonaDe: async (id) => (await tx.orden.findUniqueOrThrow({ where: { id }, select: { zonaId: true } })).zonaId,
        acciones: async (ids) =>
          tx.historialAccion.findMany({
            where: { accion: "orden_zona_reconciliada", entidadId: { in: ids } },
            select: { entidadId: true, actorUsuarioId: true, loteId: true },
          }),
        guardarZonaC: async () => zonaRepo.update(zonaC, datosDeZona(nombreC, [distritoX]), maestro),
        recibir: async (ordenId) => {
          const { numGuia } = await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { numGuia: true } });
          if (numGuia === null) throw new Error("orden sin guia");
          return (await recepcion.recibirEnBodegaCentral(numGuia, { usuarioId: maestro, rol: "maestro" })).status;
        },
        actualizarBoton: async () => (await botonRepo.actualizar(maestro)).actualizadas,
        huellaDinero: async () => {
          const huella: Record<string, string | null> = {};
          for (const t of TABLAS_DE_DINERO) {
            const [{ h }] = await tx.$queryRawUnsafe<{ h: string | null }[]>(
              `SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS h FROM ${t} t`,
            );
            huella[t] = h;
          }
          return huella;
        },
      };
      return fn(e);
    });
  }

  /**
   * Una orden «de un intento anterior» (como las 18 de P2): `cierre_detail` de un cierre del estado
   * dado, y una gestion de rechazo vigente que cuelga de ESE cierre.
   */
  async function conIntentoAnterior(e: Escenario, ordenId: string, estado: CierreEstado): Promise<void> {
    const cierre = await e.crearCierre(estado);
    await e.crearDetalle(ordenId, cierre);
    await e.crearGestion(ordenId, "devolucion_a_origen_por_rechazo", { cierreId: cierre });
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // R1720/R1722 por los TRES llamadores
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  it("R1720/R1722 · guardado de zona: la viva con un intento anterior APROBADO se mueve; con uno SOLICITADO no", async () => {
    const r = await conEscenario(async (e) => {
      const aprobada = await e.crearOrden("aprobada", "en_bodega_central");
      await conIntentoAnterior(e, aprobada, "aprobado");
      const solicitada = await e.crearOrden("solicitada", "en_bodega_central");
      await conIntentoAnterior(e, solicitada, "solicitado");
      const res = okDe(await e.guardarZonaC());
      return {
        e,
        res,
        zAprobada: await e.zonaDe(aprobada),
        zSolicitada: await e.zonaDe(solicitada),
        acciones: await e.acciones([aprobada, solicitada]),
        aprobada,
      };
    });
    expect(r.res.reconciliadas).toBe(1);
    expect(r.zAprobada).toBe(r.e.zonaC);
    expect(r.zSolicitada).toBe(r.e.zonaA);
    expect(r.acciones.map((a) => a.entidadId)).toEqual([r.aprobada]);
    expect(r.acciones[0].actorUsuarioId).toBe(r.e.maestro);
  });

  it("R1720/R1722 · recepcion en la central: la viva con un intento anterior APROBADO se mueve al recibir; con uno SOLICITADO no", async () => {
    const r = await conEscenario(async (e) => {
      const aprobada = await e.crearOrden("aprobada", "en_ruta_bodega_central");
      await conIntentoAnterior(e, aprobada, "aprobado");
      const solicitada = await e.crearOrden("solicitada", "en_ruta_bodega_central");
      await conIntentoAnterior(e, solicitada, "solicitado");
      const s1 = await e.recibir(aprobada);
      const s2 = await e.recibir(solicitada);
      return {
        e,
        s: [s1, s2],
        zAprobada: await e.zonaDe(aprobada),
        zSolicitada: await e.zonaDe(solicitada),
        acciones: await e.acciones([aprobada, solicitada]),
        aprobada,
      };
    });
    expect(r.s).toEqual(["ok", "ok"]);
    expect(r.zAprobada).toBe(r.e.zonaC);
    expect(r.zSolicitada).toBe(r.e.zonaA);
    expect(r.acciones.map((a) => a.entidadId)).toEqual([r.aprobada]);
    expect(r.acciones[0].actorUsuarioId).toBe(r.e.maestro);
  });

  it("R1720/R1722 · «Actualizar zonas»: la viva con un intento anterior APROBADO se mueve; con uno SOLICITADO no", async () => {
    const r = await conEscenario(async (e) => {
      const aprobada = await e.crearOrden("aprobada", "en_bodega_central");
      await conIntentoAnterior(e, aprobada, "aprobado");
      const solicitada = await e.crearOrden("solicitada", "en_bodega_central");
      await conIntentoAnterior(e, solicitada, "solicitado");
      const actualizadas = await e.actualizarBoton();
      return {
        e,
        actualizadas,
        zAprobada: await e.zonaDe(aprobada),
        zSolicitada: await e.zonaDe(solicitada),
        acciones: await e.acciones([aprobada, solicitada]),
        aprobada,
      };
    });
    expect(r.actualizadas).toBe(1);
    expect(r.zAprobada).toBe(r.e.zonaC);
    expect(r.zSolicitada).toBe(r.e.zonaA);
    expect(r.acciones.map((a) => a.entidadId)).toEqual([r.aprobada]);
    expect(r.acciones[0].actorUsuarioId).toBe(r.e.maestro);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // La matriz, por el guardado de zona (el llamador que no acota por estado ni por orden)
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  /**
   * Los seis estados de R1723 que siguen sin moverse (SLT-248/R1805), cada uno con SOLO un cierre
   * aprobado. `novedad` y `reprogramado` salieron de aqui: desde SLT-248 se mueven (R1801).
   */
  const ESTADOS_R1723: OrderStatusValue[] = [
    "en_bodega_satelite",
    "por_devolver_a_bodega_central",
    "devolviendo_a_bodega_central",
    "devolucion_a_origen_por_rechazo",
    "por_devolver_a_tienda",
    "devolviendo_a_tienda",
  ];

  /** SLT-248 (R1801/R1802): los dos estados «por liberar» que la P4 de SLT-224 dejaba fuera. */
  const ESTADOS_POR_LIBERAR: OrderStatusValue[] = ["reprogramado", "novedad"];

  async function sembrarMatriz(e: Escenario): Promise<void> {
    // --- se mueven (R1720) ---
    const soloAprobado = await e.crearOrden("central-solo-aprobado", "en_bodega_central");
    await e.crearDetalle(soloAprobado, await e.crearCierre("aprobado"));
    const anulada = await e.crearOrden("reparto-gestion-anulada", "en_reparto");
    await e.crearGestion(anulada, "entregado", { anulada: true });
    const rutaSat = await e.crearOrden("ruta-sat-rechazo-aprobado", "en_ruta_bodega_satelite");
    await e.crearGestion(rutaSat, "devolucion_a_origen_por_rechazo", { cierreId: await e.crearCierre("aprobado") });

    // --- finalizadas, sin cierre ni gestion (R1721) ---
    for (const estado of ["entregado", "devuelta_a_tienda", "incidente"] as const) {
      await e.crearOrden(`finalizada-${estado}`, estado);
    }

    // --- cobro en curso (R1722) ---
    for (const estado of ["solicitado", "rechazado", "vencido"] as const) {
      const id = await e.crearOrden(`cd-${estado}`, "en_bodega_central");
      await e.crearDetalle(id, await e.crearCierre(estado));
    }
    for (const resultado of ["entregado", "devolucion_a_origen_por_rechazo", "incidente"] as const) {
      const id = await e.crearOrden(`gestion-${resultado}-sin-cierre`, "en_reparto");
      await e.crearGestion(id, resultado);
    }
    const conRechazado = await e.crearOrden("gestion-entregado-cierre-rechazado", "en_reparto");
    await e.crearGestion(conRechazado, "entregado", { cierreId: await e.crearCierre("rechazado") });

    // --- estado (R1723), con solo cierre aprobado ---
    for (const estado of ESTADOS_R1723) {
      const id = await e.crearOrden(`estado-${estado}`, estado);
      await e.crearDetalle(id, await e.crearCierre("aprobado"));
    }

    // --- SLT-248: `reprogramado`/`novedad` con solo cierre aprobado se mueven (R1801); con un
    //     cierre `solicitado` (cobro en curso) no (R1802) ---
    for (const estado of ESTADOS_POR_LIBERAR) {
      const aprobado = await e.crearOrden(`estado-${estado}`, estado);
      await e.crearDetalle(aprobado, await e.crearCierre("aprobado"));
      const solicitado = await e.crearOrden(`cd-solicitado-${estado}`, estado);
      await e.crearDetalle(solicitado, await e.crearCierre("solicitado"));
    }

    // --- R1724: la del estante con cobro en curso NO cuenta como retenida ---
    const estanteSolicitado = await e.crearOrden("estante-cd-solicitado", "en_bodega_satelite");
    await e.crearDetalle(estanteSolicitado, await e.crearCierre("solicitado"));
  }

  const SE_MUEVEN = [
    "central-solo-aprobado",
    "reparto-gestion-anulada",
    "ruta-sat-rechazo-aprobado",
    "estado-reprogramado",
    "estado-novedad",
  ];

  const NO_SE_MUEVEN = [
    "finalizada-entregado",
    "finalizada-devuelta_a_tienda",
    "finalizada-incidente",
    "cd-solicitado",
    "cd-rechazado",
    "cd-vencido",
    "gestion-entregado-sin-cierre",
    "gestion-devolucion_a_origen_por_rechazo-sin-cierre",
    "gestion-incidente-sin-cierre",
    "gestion-entregado-cierre-rechazado",
    "estado-en_bodega_satelite",
    "estado-por_devolver_a_bodega_central",
    "estado-devolviendo_a_bodega_central",
    "estado-devolucion_a_origen_por_rechazo",
    "estado-por_devolver_a_tienda",
    "estado-devolviendo_a_tienda",
    "cd-solicitado-reprogramado",
    "cd-solicitado-novedad",
    "estante-cd-solicitado",
  ];

  it("R1720-R1724 · SLT-248/R1801/R1802/R1805 · la matriz por el guardado de zona: exactamente las cinco vivas sin cobro en curso se mueven (con `reprogramado` y `novedad`)", async () => {
    const r = await conEscenario(async (e) => {
      await sembrarMatriz(e);
      const res = okDe(await e.guardarZonaC());
      const movidas: string[] = [];
      const quietas: string[] = [];
      for (const [clave, id] of e.ordenes) {
        const z = await e.zonaDe(id);
        if (z === e.zonaC) movidas.push(clave);
        else if (z === e.zonaA) quietas.push(clave);
        else throw new Error(`zona inesperada para ${clave}`);
      }
      const acciones = await e.acciones([...e.ordenes.values()]);
      return { res, movidas, quietas, sembradas: e.ordenes.size, acciones };
    });
    // La matriz se sembro entera (no hay `return` temprano que la deje vacia).
    expect(r.sembradas).toBe(SE_MUEVEN.length + NO_SE_MUEVEN.length);
    expect(r.movidas.sort()).toEqual([...SE_MUEVEN].sort());
    expect(r.quietas.sort()).toEqual([...NO_SE_MUEVEN].sort());
    expect(r.res.reconciliadas).toBe(5);
    // R1724: cuenta la del estante con solo cierre aprobado, no la del estante con cobro en curso.
    expect(r.res.retenidas).toBe(1);
    expect(r.acciones).toHaveLength(5);
    expect(new Set(r.acciones.map((a) => a.loteId)).size).toBe(1);
  });

  it("R1707 · las tablas de dinero no cambian, tambien con la orden de cierre aprobado que se movio; la fila solo cambia zona y fecha", async () => {
    const r = await conEscenario(async (e) => {
      await sembrarMatriz(e);
      const movida = e.ordenes.get("central-solo-aprobado") ?? "";
      const fila = async () =>
        (await e.tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM orden WHERE id = $1`, movida))[0];
      const antes = await fila();
      const dineroAntes = await e.huellaDinero();
      okDe(await e.guardarZonaC());
      return { e, antes, despues: await fila(), dineroAntes, dineroDespues: await e.huellaDinero() };
    });
    expect(r.despues.zona_id).toBe(r.e.zonaC);
    const resto = (f: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(f).filter(([k]) => !["zona_id", "updated_at"].includes(k)));
    expect(resto(r.despues)).toEqual(resto(r.antes));
    // La huella existe (hay filas sembradas) y no cambia.
    expect(r.dineroAntes.cierre_detail).not.toBeNull();
    expect(r.dineroAntes.gestion_orden).not.toBeNull();
    expect(r.dineroDespues).toEqual(r.dineroAntes);
  });
});
