import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GestionResultado, PrismaClient } from "@prisma/client";

import { ActualizacionZonasRepository } from "@/lib/repositories/ActualizacionZonasRepository";
import { ActualizacionZonasService } from "@/lib/services/ActualizacionZonasService";
import type { OrderStatusValue } from "@/lib/types/order-status";
import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";

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
 * SLT-224 (design §7.4, R1715, R1717-R1719) — el boton «Actualizar zonas», con el servicio y el
 * repositorio REALES contra Postgres. Lo que decide quien se actualiza y quien se salta es SQL (la
 * lectura de las ordenes con zona errada) y el `WHERE` del helper compartido: un doble no ve ninguno.
 *
 * Dos empresas. En la 1, zona A (la vieja) y zona C (la del distrito X); cada orden lleva una guia
 * que la nombra en las aserciones, escritas LITERAL. La empresa 2 tiene una orden con zona errada
 * en su propio distrito: no aparece ni cambia (R1719).
 *
 * El cliente de test es el DUEÑO de las tablas (sin RLS): el filtro de empresa que se mide es el del
 * SQL del repositorio. En produccion, ademas, la RLS de `servi_app`.
 *
 * PR 2 (design §7.5, R1726/R1727): la matriz suma una viva con un cierre APROBADO anterior (se
 * actualiza), `reprogramado`, `entregado` (finalizada) y el rechazo
 * (`devolucion_a_origen_por_rechazo`, devolucion); las saltadas llevan sus motivos. Y las
 * ramas del `cobroEnCurso` SQL (review PR 2, B1): detalles de cierres `rechazado` y `vencido`, y gestiones
 * con cierre `rechazado` (se saltan) y `aprobado` (se actualiza).
 *
 * SLT-248 (R1801/R1803): `reprogramado` y `novedad` ya no se saltan; se actualizan como las vivas (6
 * en total). La mutacion `reprogramado: "por_liberar"` o `novedad: "devolucion"` pone rojo la vista
 * previa y la confirmacion (ver `progress/impl_SLT-248.md`).
 *
 * MUTACIONES EJECUTADAS (ver `progress/impl_SLT-224.md`), cada una con su rojo.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Escenario {
  tx: TxDeTest;
  servicio: ActualizacionZonasService;
  maestro: string;
  org1: string;
  org2: string;
  zonaA: string;
  zonaC: string;
  /** clave -> id de la orden de la empresa 1 */
  ordenes: Map<string, string>;
  /** clave -> guia (texto) */
  guias: Map<string, string>;
  /** La orden con zona errada de la empresa 2. */
  ajena: string;
  ajenaZona: string;
  crearOrden: (clave: string, o: { estado: OrderStatusValue; zonaId?: string; distrito?: "X" | "sin-zona" }) => Promise<string>;
  zonaDe: (id: string) => Promise<string | null>;
  estadoA: (id: string, estado: OrderStatusValue) => Promise<void>;
}

const NOMBRE_A = "slt224b Zona A";
const NOMBRE_C = "slt224b Zona C";

describeSiHayBase("SLT-224 · «Actualizar zonas» contra Postgres real", () => {
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
      const [{ org1 }] = await tx.$queryRawUnsafe<{ org1: string }[]>(
        `SELECT current_setting('app.organizacion_id') AS org1`,
      );
      const suf = randomUUID().slice(0, 6);

      // --- Empresa 2, primero: una orden con zona errada en SU distrito. ---
      const org2 = (await crearOrganizacion(tx)).id;
      await fijarEmpresa(tx, org2);
      const fks2 = await crearFksDeOrden(tx);
      const z2a = (await tx.zona.create({ data: { nombre: `e2 A ${suf}`, sinpeNumero: "80000000", sinpeNombre: "Titular" }, select: { id: true } })).id;
      const z2c = (await tx.zona.create({ data: { nombre: `e2 C ${suf}`, sinpeNumero: "80000000", sinpeNombre: "Titular" }, select: { id: true } })).id;
      const d2 = (await tx.distrito.create({ data: { nombre: `e2 D ${suf}`, cantonId: fks2.cantonId }, select: { id: true } })).id;
      await tx.zonaDistrito.create({ data: { zonaId: z2c, distritoId: d2 } });
      const enCentral = (await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_bodega_central" } })).id;
      const ajena = (
        await tx.orden.create({
          data: {
            numRemision: `e2-${suf}`, destinatario: "D", telefonoDest: "8888-0000", producto: "caja",
            estatusId: enCentral, tiendaId: fks2.tiendaId, zonaId: z2a, provinciaId: fks2.provinciaId,
            cantonId: fks2.cantonId, distritoId: d2, direccion: "x",
          },
          select: { id: true },
        })
      ).id;

      // --- Empresa 1 ---
      await fijarEmpresa(tx, org1);
      const fks = await crearFksDeOrden(tx);
      const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
      const zonaA = (await tx.zona.create({ data: { nombre: `${NOMBRE_A} ${suf}`, sinpeNumero: "80000000", sinpeNombre: "Titular" }, select: { id: true } })).id;
      const zonaC = (await tx.zona.create({ data: { nombre: `${NOMBRE_C} ${suf}`, sinpeNumero: "80000000", sinpeNombre: "Titular" }, select: { id: true } })).id;
      const distritoX = (await tx.distrito.create({ data: { nombre: `e1 X ${suf}`, cantonId: fks.cantonId }, select: { id: true } })).id;
      await tx.zonaDistrito.create({ data: { zonaId: zonaC, distritoId: distritoX } });
      const distritoSinZona = (await tx.distrito.create({ data: { nombre: `e1 S ${suf}`, cantonId: fks.cantonId }, select: { id: true } })).id;

      const ordenes = new Map<string, string>();
      const guias = new Map<string, string>();
      const estatus = async (v: OrderStatusValue) =>
        (await tx.orderStatus.findUniqueOrThrow({ where: { value: v }, select: { id: true } })).id;

      const e: Escenario = {
        tx,
        servicio: new ActualizacionZonasService(new ActualizacionZonasRepository(clienteConTransaccionAnidada(tx))),
        maestro,
        org1,
        org2,
        zonaA,
        zonaC,
        ordenes,
        guias,
        ajena,
        ajenaZona: z2a,
        crearOrden: async (clave, o) => {
          const [{ g }] = await tx.$queryRawUnsafe<{ g: number }[]>(`SELECT nextval('orden_num_guia_seq')::int AS g`);
          const id = (
            await tx.orden.create({
              data: {
                numRemision: `e1-${clave}-${suf}`,
                numGuia: g,
                destinatario: "Destinataria",
                telefonoDest: "8888-0000",
                producto: "caja",
                estatusId: await estatus(o.estado),
                tiendaId: fks.tiendaId,
                zonaId: o.zonaId ?? zonaA,
                provinciaId: fks.provinciaId,
                cantonId: fks.cantonId,
                distritoId: o.distrito === "sin-zona" ? distritoSinZona : distritoX,
                direccion: "x",
              },
              select: { id: true },
            })
          ).id;
          ordenes.set(clave, id);
          guias.set(clave, String(g));
          return id;
        },
        zonaDe: async (id) => (await tx.orden.findUniqueOrThrow({ where: { id }, select: { zonaId: true } })).zonaId,
        estadoA: async (id, estado) => {
          await tx.orden.update({ where: { id }, data: { estatusId: await estatus(estado) } });
        },
      };

      // La matriz de la empresa 1.
      await e.crearOrden("central", { estado: "en_bodega_central" });
      await e.crearOrden("ruta-satelite", { estado: "en_ruta_bodega_satelite" });
      await e.crearOrden("estante", { estado: "en_bodega_satelite" });
      for (const d of [
        "por_devolver_a_bodega_central",
        "devolviendo_a_bodega_central",
        "devolucion_a_origen_por_rechazo",
        "novedad",
        "por_devolver_a_tienda",
        "devolviendo_a_tienda",
        "devuelta_a_tienda",
        "entregado",
        "reprogramado",
      ] as const) {
        await e.crearOrden(d, { estado: d });
      }
      const conCierre = await e.crearOrden("con-cierre", { estado: "en_bodega_central" });
      const cierre = await tx.cierreDia.create({
        data: { mensajeroId: mensajero, estado: "solicitado", destinoTipo: "bodega_central", destinoZonaId: zonaA },
        select: { id: true },
      });
      await tx.cierreDetail.create({
        data: {
          cierreId: cierre.id, ordenId: conCierre, cobraComision: false, zonaId: zonaA, tiendaId: fks.tiendaId,
          esCentral: false, numRemision: `cd-${suf}`, destinatario: "D", producto: "caja", tiendaNombre: "T",
          zonaNombre: "Z", provinciaNombre: "P", cantonNombre: "C",
        },
        select: { id: true },
      });
      // PR 2 (R1720): un cierre APROBADO anterior ya no la salta.
      const conAprobado = await e.crearOrden("con-cierre-aprobado", { estado: "en_bodega_central" });
      const cierreAprobado = await tx.cierreDia.create({
        data: { mensajeroId: mensajero, estado: "aprobado", destinoTipo: "bodega_satelite", destinoZonaId: zonaA },
        select: { id: true },
      });
      await tx.cierreDetail.create({
        data: {
          cierreId: cierreAprobado.id, ordenId: conAprobado, cobraComision: false, zonaId: zonaA, tiendaId: fks.tiendaId,
          esCentral: false, numRemision: `cda-${suf}`, destinatario: "D", producto: "caja", tiendaNombre: "T",
          zonaNombre: "Z", provinciaNombre: "P", cantonNombre: "C",
        },
        select: { id: true },
      });
      const conGestion = await e.crearOrden("con-gestion", { estado: "en_reparto" });
      await tx.gestionOrden.create({
        data: { ordenId: conGestion, mensajeroId: mensajero, resultado: "entregado" as GestionResultado },
        select: { id: true },
      });
      // Review PR 2 (B1): las ramas del `cobroEnCurso` SQL que la matriz no tenia. Un detalle de un
      // cierre `rechazado` y otro de uno `vencido` (sin aprobar: se saltan), una gestion de rechazo en
      // un cierre `rechazado` (se salta) y otra en un cierre `aprobado` (dinero ya liquidado: se mueve).
      const crearDetalle = async (ordenId: string, cierreId: string, remision: string) => {
        await tx.cierreDetail.create({
          data: {
            cierreId, ordenId, cobraComision: false, zonaId: zonaA, tiendaId: fks.tiendaId,
            esCentral: false, numRemision: `${remision}-${suf}`, destinatario: "D", producto: "caja", tiendaNombre: "T",
            zonaNombre: "Z", provinciaNombre: "P", cantonNombre: "C",
          },
          select: { id: true },
        });
      };
      const cierreRechazado = await tx.cierreDia.create({
        data: { mensajeroId: mensajero, estado: "rechazado", destinoTipo: "bodega_central", destinoZonaId: zonaA },
        select: { id: true },
      });
      const cierreVencido = await tx.cierreDia.create({
        data: { mensajeroId: mensajero, estado: "vencido", destinoTipo: "bodega_central", destinoZonaId: zonaA },
        select: { id: true },
      });
      await crearDetalle(await e.crearOrden("cd-rechazado", { estado: "en_bodega_central" }), cierreRechazado.id, "cdr");
      await crearDetalle(await e.crearOrden("cd-vencido", { estado: "en_bodega_central" }), cierreVencido.id, "cdv");
      await tx.gestionOrden.create({
        data: {
          ordenId: await e.crearOrden("gestion-cierre-rechazado", { estado: "en_bodega_central" }),
          mensajeroId: mensajero,
          resultado: "devolucion_a_origen_por_rechazo" as GestionResultado,
          cierreId: cierreRechazado.id,
        },
        select: { id: true },
      });
      await tx.gestionOrden.create({
        data: {
          ordenId: await e.crearOrden("gestion-cierre-aprobado", { estado: "en_bodega_central" }),
          mensajeroId: mensajero,
          resultado: "devolucion_a_origen_por_rechazo" as GestionResultado,
          cierreId: cierreAprobado.id,
        },
        select: { id: true },
      });
      await e.crearOrden("alineada", { estado: "en_bodega_central", zonaId: zonaC });
      await e.crearOrden("distrito-sin-zona", { estado: "en_bodega_central", distrito: "sin-zona" });

      return fn(e);
    });
  }

  /** Las saltadas como «clave:motivo», ordenadas, con la guia traducida a su clave. */
  function saltadasPorClave(e: Escenario, saltadas: { guia: string; motivo: string }[]): string[] {
    const claveDe = new Map([...e.guias].map(([k, g]) => [g, k]));
    return saltadas.map((s) => `${claveDe.get(s.guia) ?? `?${s.guia}`}:${s.motivo}`).sort();
  }

  const SALTADAS_ESPERADAS = [
    "cd-rechazado:cobro_en_curso",
    "cd-vencido:cobro_en_curso",
    "con-cierre:cobro_en_curso",
    "con-gestion:cobro_en_curso",
    "devolucion_a_origen_por_rechazo:devolucion",
    "devolviendo_a_bodega_central:devolucion",
    "devolviendo_a_tienda:devolucion",
    "devuelta_a_tienda:finalizada",
    "entregado:finalizada",
    "estante:estante_satelite",
    "gestion-cierre-rechazado:cobro_en_curso",
    "por_devolver_a_bodega_central:devolucion",
    "por_devolver_a_tienda:devolucion",
  ];

  it("R1715/R1719/SLT-248 R1803: la vista previa da los grupos y las saltadas esperados, y no escribe nada", async () => {
    const r = await conEscenario(async (e) => {
      const zonasAntes = await e.tx.orden.findMany({ select: { id: true, zonaId: true }, orderBy: { id: "asc" } });
      const accionesAntes = await e.tx.historialAccion.count();
      const vp = await e.servicio.vistaPrevia();
      const zonasDespues = await e.tx.orden.findMany({ select: { id: true, zonaId: true }, orderBy: { id: "asc" } });
      return { e, vp, zonasAntes, zonasDespues, accionesAntes, accionesDespues: await e.tx.historialAccion.count() };
    });
    expect(r.vp.total).toBe(6);
    expect(r.vp.grupos).toHaveLength(1);
    expect(r.vp.grupos[0].cantidad).toBe(6);
    expect(r.vp.grupos[0].zonaActual.startsWith(NOMBRE_A)).toBe(true);
    expect(r.vp.grupos[0].zonaNueva.startsWith(NOMBRE_C)).toBe(true);
    expect(saltadasPorClave(r.e, r.vp.saltadas)).toEqual(SALTADAS_ESPERADAS);
    expect(r.zonasDespues).toEqual(r.zonasAntes);
    expect(r.accionesDespues).toBe(r.accionesAntes);
  });

  it("R1717/R1718/R1719: SLT-248/R1801: confirmar actualiza las seis elegibles (con `reprogramado` y `novedad`), salta las demas y deja intacta la otra empresa", async () => {
    const r = await conEscenario(async (e) => {
      const ids = [...e.ordenes.values()];
      const antes = new Map(await Promise.all(ids.map(async (id) => [id, await e.zonaDe(id)] as const)));
      const res = await e.servicio.actualizar({ usuarioId: e.maestro, rol: "maestro" });
      const despues = new Map(await Promise.all(ids.map(async (id) => [id, await e.zonaDe(id)] as const)));
      const claveDe = new Map([...e.ordenes].map(([k, id]) => [id, k]));
      const acciones = await e.tx.historialAccion.findMany({
        where: { accion: "orden_zona_reconciliada", entidadId: { in: [...ids, e.ajena] } },
        select: { entidadId: true, actorUsuarioId: true, loteId: true },
      });
      return {
        e,
        res,
        cambiadas: ids.filter((id) => antes.get(id) !== despues.get(id)).map((id) => claveDe.get(id)).sort(),
        nuevas: ids.filter((id) => antes.get(id) !== despues.get(id)).map((id) => despues.get(id)),
        ajenaZona: await e.zonaDe(e.ajena),
        acciones: acciones.map((a) => ({ ...a, clave: claveDe.get(a.entidadId) ?? "ajena" })),
      };
    });
    expect(r.cambiadas).toEqual([
      "central",
      "con-cierre-aprobado",
      "gestion-cierre-aprobado",
      "novedad",
      "reprogramado",
      "ruta-satelite",
    ]);
    expect(r.nuevas).toEqual([r.e.zonaC, r.e.zonaC, r.e.zonaC, r.e.zonaC, r.e.zonaC, r.e.zonaC]);
    expect(r.res.actualizadas).toBe(6);
    expect(saltadasPorClave(r.e, r.res.saltadas)).toEqual(SALTADAS_ESPERADAS);
    // R1719: la otra empresa, intacta.
    expect(r.ajenaZona).toBe(r.e.ajenaZona);
    // R1717: una accion por orden actualizada, con el actor y UN solo lote.
    expect(r.acciones.map((a) => a.clave).sort()).toEqual([
      "central",
      "con-cierre-aprobado",
      "gestion-cierre-aprobado",
      "novedad",
      "reprogramado",
      "ruta-satelite",
    ]);
    expect(new Set(r.acciones.map((a) => a.actorUsuarioId))).toEqual(new Set([r.e.maestro]));
    expect(new Set(r.acciones.map((a) => a.loteId)).size).toBe(1);
  });

  it("R1717: la regla se re-evalua al confirmar — lo que cambio tras la vista previa manda", async () => {
    const r = await conEscenario(async (e) => {
      const vp = await e.servicio.vistaPrevia();
      // Entre la vista previa y la confirmacion: `central` entra al estante de una satelite, y una
      // orden nueva aparece con la zona errada.
      await e.estadoA(e.ordenes.get("central") ?? "", "en_bodega_satelite");
      const nueva = await e.crearOrden("nueva", { estado: "en_bodega_central" });
      const res = await e.servicio.actualizar({ usuarioId: e.maestro, rol: "maestro" });
      return {
        e,
        vp,
        res,
        zonaCentral: await e.zonaDe(e.ordenes.get("central") ?? ""),
        zonaNueva: await e.zonaDe(nueva),
        zonaRuta: await e.zonaDe(e.ordenes.get("ruta-satelite") ?? ""),
      };
    });
    expect(r.vp.total).toBe(6);
    expect(r.zonaCentral).toBe(r.e.zonaA);
    expect(r.zonaNueva).toBe(r.e.zonaC);
    expect(r.zonaRuta).toBe(r.e.zonaC);
    expect(r.res.actualizadas).toBe(6);
    expect(saltadasPorClave(r.e, r.res.saltadas)).toContain("central:estante_satelite");
  });

  it("R1719: con el MISMO distrito mapeado por la otra empresa a otra zona, la vista previa solo mira el mapa de SU empresa", async () => {
    // La geografia es compartida: la empresa 2 mapea el distrito X (de las ordenes de la empresa 1) a
    // una zona suya. Sin el JOIN por `organizacion_id`, la alineada de la empresa 1 apareceria como
    // errada hacia la zona de la empresa 2, y la central saldria dos veces. Como dueño (sin RLS), el
    // filtro del SQL es lo unico que lo impide.
    const r = await conEscenario(async (e) => {
      const { distritoId } = await e.tx.orden.findUniqueOrThrow({
        where: { id: e.ordenes.get("central") ?? "" },
        select: { distritoId: true },
      });
      if (distritoId === null) throw new Error("la orden sembrada no tiene distrito");
      await fijarEmpresa(e.tx, e.org2);
      const zonaOtra = (
        await e.tx.zona.create({
          data: { nombre: `e2 X ${randomUUID().slice(0, 6)}`, sinpeNumero: "80000000", sinpeNombre: "Titular" },
          select: { id: true },
        })
      ).id;
      await e.tx.zonaDistrito.create({ data: { zonaId: zonaOtra, distritoId } });
      await fijarEmpresa(e.tx, e.org1);
      return { e, vp: await e.servicio.vistaPrevia() };
    });
    expect(r.vp.total).toBe(6);
    expect(r.vp.grupos).toHaveLength(1);
    expect(r.vp.grupos[0].zonaNueva.startsWith(NOMBRE_C)).toBe(true);
    expect(saltadasPorClave(r.e, r.vp.saltadas)).toEqual(SALTADAS_ESPERADAS);
  });

  it("R1727: vista previa y confirmacion seguidas, sin cambios en medio, coinciden orden por orden", async () => {
    // La vista previa anticipa el corte en SQL (`cobroEnCurso`); la escritura lo decide el `WHERE`
    // Prisma del helper. Si las dos escrituras del corte divergen, este test cae.
    const r = await conEscenario(async (e) => {
      const vp = await e.servicio.vistaPrevia();
      const res = await e.servicio.actualizar({ usuarioId: e.maestro, rol: "maestro" });
      return { e, vp, res };
    });
    expect(r.vp.total).toBe(6);
    expect(r.res.actualizadas).toBe(r.vp.total);
    expect(saltadasPorClave(r.e, r.res.saltadas)).toEqual(saltadasPorClave(r.e, r.vp.saltadas));
    expect(saltadasPorClave(r.e, r.res.saltadas)).toEqual(SALTADAS_ESPERADAS);
  });

  it("R1719: ni la alineada ni la de distrito sin zona aparecen, ni cambian", async () => {
    const r = await conEscenario(async (e) => {
      const vp = await e.servicio.vistaPrevia();
      await e.servicio.actualizar({ usuarioId: e.maestro, rol: "maestro" });
      return {
        e,
        vp,
        alineada: await e.zonaDe(e.ordenes.get("alineada") ?? ""),
        sinZona: await e.zonaDe(e.ordenes.get("distrito-sin-zona") ?? ""),
      };
    });
    const claves = saltadasPorClave(r.e, r.vp.saltadas).join(",");
    expect(claves).not.toContain("alineada");
    expect(claves).not.toContain("distrito-sin-zona");
    expect(r.alineada).toBe(r.e.zonaC);
    expect(r.sinZona).toBe(r.e.zonaA);
  });
});
