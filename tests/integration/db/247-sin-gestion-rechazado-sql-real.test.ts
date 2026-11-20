import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, diaCR, prepararMundo, type Escenario, type Mundo } from "./454/_escenario";
import { cierreDe } from "./_correccion-477";
import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { ordenesEnCorreccion } from "@/lib/repositories/correccion-cierre";

/**
 * SLT-247 (T2.6) — EL RECHAZO DEVUELVE LAS BARRIDAS, EL CORTE NO LAS VUELVE A BARRER Y LA APROBACION
 * SOLO PIDE LAS QUE SIGUEN EN NOVEDAD INTERNA. Contra Postgres y por los servicios REALES.
 *
 *   R1770-R1773  rechazar mueve a `en_reparto` SOLO las barridas vivas, suyas y no borradas, con UNA
 *                fila de historial `retorno_por_rechazo_cierre`, sin tocar totales ni gestiones.
 *   R1774        cierre sin el registro de la 264 (`sin_gestion_registrado = false`): no mueve nada.
 *   R1776        rechazo que no aplica (el cierre no esta `solicitado`): no mueve nada.
 *   R1777        rechazo desde OTRA empresa: `no_encontrada` y no mueve nada.
 *   R1788/R1789  el corte no selecciona ni barre las barridas de un rechazado; cuando deja de estarlo, si.
 *   R1791/R1794  la aprobacion (tambien tras la valvula) pide y libera solo las de `novedad_interna`.
 *   R1793        `cierre_sin_gestion` no cambia al rechazar ni al aprobar.
 *   R1800        un rechazado de antes del despliegue (barridas en `novedad_interna`) sigue como hoy.
 *
 * Cada `where` nuevo se mato con una mutacion: `progress/impl_SLT-247.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Corte REAL de hoy sobre las ordenes sembradas: deja un `vencido` con sus barridas. */
async function vencidoConBarridas(e: Escenario, n: number, ahora = new Date()) {
  const ordenes = [];
  for (let i = 0; i < n; i++) {
    ordenes.push((await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 1000 + i })).ordenId);
  }
  await e.correrCorte(ahora, [e.mensajeroId]);
  const x = await e.tx.cierreDia.findFirstOrThrow({
    where: { mensajeroId: e.mensajeroId, estado: "vencido" },
    select: { id: true },
  });
  const barridas = await e.tx.cierreSinGestion.count({ where: { cierreId: x.id } });
  if (barridas !== n) throw new Error(`247: el corte barrio ${barridas} de ${n}`);
  return { x: x.id, ordenes };
}

/** `vencido -> solicitado` por el servicio real, para que la oficina pueda rechazarlo. */
async function aSolicitado(e: Escenario, cierreId: string) {
  const r = await e.solicitarCierre();
  const { estado } = await e.tx.cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { estado: true } });
  if (estado !== "solicitado") throw new Error(`247: no quedo solicitado (${JSON.stringify(r)})`);
}

async function barridasDe(e: Escenario, cierreId: string) {
  return e.tx.cierreSinGestion.findMany({ where: { cierreId }, orderBy: { ordenId: "asc" } });
}

describeSiHayBase("SLT-247 — barridas de un cierre rechazado (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
  });
  afterAll(async () => {
    await mundo.prisma.$disconnect();
  });

  it("R1770-R1773/R1793: rechazar devuelve SOLO las barridas vivas y suyas, sin tocar dinero", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const { x, ordenes } = await vencidoConBarridas(e, 5);
      const [viva1, viva2, ajena, borrada, fuera] = ordenes;
      // R1773: otro dueño, borrada y ya fuera de `novedad_interna`.
      await e.tx.orden.update({ where: { id: ajena }, data: { mensajeroAsignadoId: e.mensajero2Id } });
      await e.tx.orden.update({ where: { id: borrada }, data: { deletedAt: new Date() } });
      await e.tx.orden.update({ where: { id: fuera }, data: { estatusId: e.id("en_bodega_central") } });
      await aSolicitado(e, x);
      const antes = {
        cierre: await cierreDe(e, x),
        barridas: await barridasDe(e, x),
        detalle: await e.tx.cierreDetail.count({ where: { cierreId: x } }),
        gestiones: await e.tx.gestionOrden.count({ where: { ordenId: { in: ordenes } } }),
        wallet: await e.tx.walletMovimiento.count(),
      };
      const rechazo = await e.rechazar(x);
      return {
        x,
        rechazo,
        antes,
        despues: {
          cierre: await cierreDe(e, x),
          barridas: await barridasDe(e, x),
          detalle: await e.tx.cierreDetail.count({ where: { cierreId: x } }),
          gestiones: await e.tx.gestionOrden.count({ where: { ordenId: { in: ordenes } } }),
          wallet: await e.tx.walletMovimiento.count(),
        },
        estados: Object.fromEntries(
          await Promise.all(
            Object.entries({ viva1, viva2, ajena, borrada, fuera }).map(async ([k, id]) => [k, await e.estadoDe(id)]),
          ),
        ),
        mensajeroViva1: (await e.ordenDe(viva1)).mensajeroAsignadoId,
        historialViva1: (await e.historialDe(viva1)).filter((h) => h.origenTipo === "retorno_por_rechazo_cierre"),
        historialOtras: (await Promise.all([ajena, borrada, fuera].map((o) => e.historialDe(o))))
          .flat()
          .filter((h) => h.origenTipo === "retorno_por_rechazo_cierre"),
        mensajeroId: e.mensajeroId,
        adminId: e.adminSateliteId,
      };
    });

    expect(r.rechazo).toEqual({ status: "ok", cierreId: r.x, estado: "rechazado" });
    expect(r.estados).toEqual({
      viva1: "en_reparto",
      viva2: "en_reparto",
      ajena: "novedad_interna",
      borrada: "novedad_interna",
      fuera: "en_bodega_central",
    });
    expect(r.mensajeroViva1).toBe(r.mensajeroId);
    // R1771: UNA transicion, del admin que rechazo, sin gestion enlazada.
    expect(r.historialViva1).toEqual([
      expect.objectContaining({
        origen: "novedad_interna",
        destino: "en_reparto",
        actorUsuarioId: r.adminId,
        gestionOrdenId: null,
      }),
    ]);
    expect(r.historialOtras).toEqual([]);
    // R1772/R1793: ni totales, ni detalle, ni gestiones, ni wallet, ni `cierre_sin_gestion`.
    expect(r.despues.cierre).toEqual({ ...r.antes.cierre, estado: "rechazado" });
    expect(r.despues.barridas).toEqual(r.antes.barridas);
    expect(r.despues.barridas).toHaveLength(5);
    expect(r.despues.detalle).toBe(r.antes.detalle);
    expect(r.despues.gestiones).toBe(r.antes.gestiones);
    expect(r.despues.wallet).toBe(r.antes.wallet);
  });

  it("R1778/R1790/R1800 (design §3): el predicado gana la rama `sin_gestion` con sus guardas", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const cierre = async (estado: "rechazado" | "solicitado", mensajeroId = e.mensajeroId) =>
        (
          await e.tx.cierreDia.create({
            data: { mensajeroId, estado, destinoTipo: "bodega_satelite", destinoZonaId: e.zonaSateliteId },
            select: { id: true },
          })
        ).id;
      const barrer = async (cierreId: string, ordenId: string, createdAt?: Date) =>
        e.tx.cierreSinGestion.create({
          data: {
            cierreId,
            ordenId,
            numRemision: `R-${ordenId.slice(0, 8)}`,
            destinatario: "Dest 247",
            producto: "Prod 247",
            tiendaNombre: "Tienda 247",
            zonaNombre: "Zona 247",
            ...(createdAt ? { createdAt } : {}),
          },
        });
      const gestion = (ordenId: string, cierreId: string | null, extra: { anulada?: boolean; createdAt?: Date } = {}) =>
        e.tx.gestionOrden.create({
          data: {
            ordenId,
            mensajeroId: e.mensajeroId,
            resultado: "reprogramado",
            cierreId,
            anuladaAt: extra.anulada ? new Date() : null,
            ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
          },
        });
      const orden = async (estatus: "en_reparto" | "novedad_interna" = "en_reparto", mensajeroId?: string) =>
        (await e.sembrarOrden({ estatus, ...(mensajeroId ? { mensajeroId } : {}) })).ordenId;

      const x = await cierre("rechazado");
      const barrido = new Date(Date.now() - 2 * DIA_MS);
      const dentro: Record<string, string> = {};
      const fuera: Record<string, string> = {};
      // DENTRO (fuente `sin_gestion`):
      dentro.viva = await orden();
      dentro.anuladaEnX = await orden();
      await gestion(dentro.anuladaEnX, x, { anulada: true });
      dentro.conGestionSinCierre = await orden(); // obligatoria ya gestionada, aun sin vincular
      await gestion(dentro.conGestionSinCierre, null);
      dentro.gestionVieja = await orden(); // gestion de OTRO cierre ANTERIOR al barrido: no cuenta
      await gestion(dentro.gestionVieja, await cierre("solicitado"), { createdAt: new Date(barrido.getTime() - DIA_MS) });
      dentro.doble = await orden(); // tambien tiene `cierre_detail` en X: gana `sin_gestion`
      await e.tx.cierreDetail.create({
        data: {
          cierreId: x,
          ordenId: dentro.doble,
          cobraComision: false,
          zonaId: e.mundo.centralZonaId,
          tiendaId: e.tiendaId,
          esCentral: true,
          numRemision: "R-doble",
          destinatario: "Dest",
          producto: "Prod",
          tiendaNombre: "T",
          zonaNombre: "Z",
          provinciaNombre: "P",
          cantonNombre: "C",
        },
      });
      // FUERA:
      fuera.ajena = await orden("en_reparto", e.mensajero2Id);
      fuera.enNovedad = await orden("novedad_interna"); // R1800: rechazado de antes del despliegue
      fuera.borrada = await orden();
      await e.tx.orden.update({ where: { id: fuera.borrada }, data: { deletedAt: new Date() } });
      fuera.vigenteEnX = await orden();
      // Anterior al barrido a proposito: asi solo la condicion «vinculada a X» la deja fuera (la de
      // R1790, «cierre posterior al barrido», no la cubre). Mutacion M9 de impl_SLT-247.
      await gestion(fuera.vigenteEnX, x, { createdAt: new Date(barrido.getTime() - DIA_MS) });
      fuera.llevadaPorElCorte = await orden(); // R1790: gestion en un cierre POSTERIOR al barrido
      await gestion(fuera.llevadaPorElCorte, await cierre("solicitado"), { createdAt: new Date() });
      for (const o of [...Object.values(dentro), ...Object.values(fuera)]) await barrer(x, o, barrido);
      // Barrida de un cierre que NO esta rechazado, y la de un rechazado de OTRO mensajero.
      fuera.noRechazado = await orden();
      await barrer(await cierre("solicitado"), fuera.noRechazado, barrido);
      fuera.rechazadoAjeno = await orden();
      await barrer(await cierre("rechazado", e.mensajero2Id), fuera.rechazadoAjeno, barrido);

      const filas = await ordenesEnCorreccion(e.tx, { mensajeroId: e.mensajeroId });
      const soloX = await ordenesEnCorreccion(e.tx, { mensajeroId: e.mensajeroId, cierreId: x, ordenIds: [dentro.viva] });
      return { x, dentro, fuera, filas, soloX };
    });

    const esperadas = Object.values(r.dentro)
      .map((ordenId) => ({ ordenId, cierreId: r.x, fuente: "sin_gestion" }))
      .sort((a, b) => a.ordenId.localeCompare(b.ordenId));
    expect([...r.filas].sort((a, b) => a.ordenId.localeCompare(b.ordenId))).toEqual(esperadas);
    expect(r.soloX).toEqual([{ ordenId: r.dentro.viva, cierreId: r.x, fuente: "sin_gestion" }]);
  });

  it("R1774: un cierre sin el registro de la 264 se rechaza como hoy, sin mover ninguna orden", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const { x, ordenes } = await vencidoConBarridas(e, 1);
      await e.tx.cierreDia.update({ where: { id: x }, data: { sinGestionRegistrado: false } });
      await aSolicitado(e, x);
      const rechazo = await e.rechazar(x);
      return { rechazo: rechazo.status, estado: await e.estadoDe(ordenes[0]) };
    });
    expect(r).toEqual({ rechazo: "ok", estado: "novedad_interna" });
  });

  it("R1776: si el rechazo no aplica (el cierre sigue `vencido`), no mueve ninguna orden", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const { x, ordenes } = await vencidoConBarridas(e, 1);
      const rechazo = await e.rechazar(x);
      return { rechazo: rechazo.status, estado: await e.estadoDe(ordenes[0]) };
    });
    expect(r).toEqual({ rechazo: "conflict", estado: "novedad_interna" });
  });

  it("R1777: rechazar desde OTRA empresa responde no_encontrada y no mueve ninguna orden", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const { x, ordenes } = await vencidoConBarridas(e, 1);
      await aSolicitado(e, x);
      const [{ org }] = await e.tx.$queryRawUnsafe<{ org: string }[]>(
        `SELECT current_setting('app.organizacion_id', true) AS org`,
      );
      await fijarEmpresa(e.tx, randomUUID());
      const rechazo = await e.rechazar(x);
      await fijarEmpresa(e.tx, org);
      const { estado } = await e.tx.cierreDia.findUniqueOrThrow({ where: { id: x }, select: { estado: true } });
      return { rechazo: rechazo.status, cierre: estado, orden: await e.estadoDe(ordenes[0]) };
    });
    expect(r).toEqual({ rechazo: "no_encontrada", cierre: "solicitado", orden: "novedad_interna" });
  });

  it("R1788: mientras el cierre siga rechazado, el corte no selecciona al mensajero ni barre sus barridas", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const ahora = new Date();
      const { x, ordenes } = await vencidoConBarridas(e, 2, ahora);
      await aSolicitado(e, x);
      await e.rechazar(x);
      // (1) Solo con las barridas devueltas: la seleccion no lo ve.
      const seleccion = (await e.s.corteReal.findMensajerosConActividadSinCierre(diaCR(1, ahora))).map(
        (m) => m.mensajeroId,
      );
      // (2) Con trabajo suelto propio (otra orden en reparto), el corte SI crea su cierre, pero el
      // barrido no se lleva las devueltas.
      const suelta = (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
      await e.correrCorte(new Date(ahora.getTime() + DIA_MS), [e.mensajeroId]);
      const nuevos = await e.tx.cierreDia.findMany({
        where: { mensajeroId: e.mensajeroId, estado: "vencido" },
        select: { sinGestion: { select: { ordenId: true } } },
      });
      return {
        mensajeroId: e.mensajeroId,
        seleccion,
        barridasDelNuevo: nuevos.flatMap((c) => c.sinGestion.map((s) => s.ordenId)),
        suelta,
        estados: await Promise.all(ordenes.map((o) => e.estadoDe(o))),
      };
    });
    expect(r.seleccion).not.toContain(r.mensajeroId);
    expect(r.barridasDelNuevo).toEqual([r.suelta]);
    expect(r.estados).toEqual(["en_reparto", "en_reparto"]);
  });

  it("R1789/R1791/R1794: la valvula saca el rechazado; la aprobacion no pide ni libera las devueltas y el corte las barre", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const ahora = new Date();
      const { x, ordenes } = await vencidoConBarridas(e, 3, ahora);
      const [devuelta1, devuelta2, ajena] = ordenes;
      // Una barrida que NO vuelve (otro dueño): sigue en `novedad_interna` y la bodega la confirma.
      await e.tx.orden.update({ where: { id: ajena }, data: { mensajeroAsignadoId: e.mensajero2Id } });
      await aSolicitado(e, x);
      await e.rechazar(x);
      const valvula = await e.s.cierresAdmin.forzarSolicitudVencido(x, e.actorAdminSatelite);
      const alcance = { destinoTipo: "bodega_satelite" as const, destinoZonaId: e.zonaSateliteId };
      const pedidas = (await e.s.adminRepo.findBarridasDelCierre(x, alcance)).map((b) => b.ordenId);
      const barridasAntes = await barridasDe(e, x);
      const aprobacion = await e.aprobar(x);
      const trasAprobar = {
        devuelta1: await e.ordenDe(devuelta1),
        devuelta2: await e.estadoDe(devuelta2),
        ajena: await e.estadoDe(ajena),
        barridas: (await barridasDe(e, x)).map((b) => ({ ...b, confirmadaFisicaAt: null })),
        confirmadas: (await barridasDe(e, x)).filter((b) => b.confirmadaFisicaAt !== null).map((b) => b.ordenId),
      };
      // R1789: ya no esta rechazado -> el corte siguiente las barre como a cualquier otra.
      await e.correrCorte(new Date(ahora.getTime() + DIA_MS), [e.mensajeroId]);
      const nuevo = await e.tx.cierreDia.findFirst({
        where: { mensajeroId: e.mensajeroId, estado: "vencido" },
        select: { sinGestion: { select: { ordenId: true } } },
      });
      return {
        mensajeroId: e.mensajeroId,
        ids: { devuelta1, devuelta2, ajena },
        valvula: valvula.status,
        pedidas,
        aprobacion: aprobacion.status,
        trasAprobar,
        barridasAntes: barridasAntes.map((b) => ({ ...b, confirmadaFisicaAt: null })),
        barridasDelCorte: (nuevo?.sinGestion.map((s) => s.ordenId) ?? []).sort(),
        estadosFinales: [await e.estadoDe(devuelta1), await e.estadoDe(devuelta2)],
      };
    });
    expect(r.valvula).toBe("ok");
    // R1791: el servidor pide solo la que sigue en `novedad_interna`.
    expect(r.pedidas).toEqual([r.ids.ajena]);
    expect(r.aprobacion).toBe("ok");
    expect(r.trasAprobar.confirmadas).toEqual([r.ids.ajena]);
    // R1794: las devueltas se quedan en la calle con su mensajero. La ajena, como hoy: la guarda de
    // propiedad de la liberacion (271/R35) no la suelta porque es de otro mensajero.
    expect(mundo.valorDeEstatus.get(r.trasAprobar.devuelta1.estatusId)).toBe("en_reparto");
    expect(r.trasAprobar.devuelta1.mensajeroAsignadoId).toBe(r.mensajeroId);
    expect(r.trasAprobar.devuelta2).toBe("en_reparto");
    expect(r.trasAprobar.ajena).toBe("novedad_interna");
    // R1793: aprobar solo marca la confirmacion fisica; las filas siguen todas.
    expect(r.trasAprobar.barridas).toEqual(r.barridasAntes);
    // R1789
    expect(r.barridasDelCorte).toEqual([r.ids.devuelta1, r.ids.devuelta2].sort());
    expect(r.estadosFinales).toEqual(["novedad_interna", "novedad_interna"]);
  });

  it("R1800: un rechazado de antes del despliegue no tiene obligatorias, se reenvia y se libera como hoy", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const { x, ordenes } = await vencidoConBarridas(e, 2);
      // Rechazado por la via vieja: el estado cambia y las barridas se quedan en `novedad_interna`.
      await e.tx.cierreDia.update({ where: { id: x }, data: { estado: "rechazado" } });
      const enCorreccion = await e.s.ordenRepo.findOrdenesEnCorreccion(e.mensajeroId, ordenes);
      const reenvio = await e.solicitarCierre();
      const pedidas = await e.s.adminRepo.findBarridasDelCierre(x, {
        destinoTipo: "bodega_satelite",
        destinoZonaId: e.zonaSateliteId,
      });
      const aprobacion = await e.aprobar(x);
      return {
        enCorreccion: [...enCorreccion],
        reenvio,
        pedidas: pedidas.length,
        aprobacion: aprobacion.status,
        estados: await Promise.all(ordenes.map((o) => e.estadoDe(o))),
      };
    });
    expect(r.enCorreccion).toEqual([]);
    expect(r.reenvio).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.pedidas).toBe(2);
    expect(r.aprobacion).toBe("ok");
    expect(r.estados).toEqual(["en_bodega_central", "en_bodega_central"]);
  });
});
