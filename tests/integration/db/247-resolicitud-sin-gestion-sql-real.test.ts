import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Escenario, type Mundo } from "./454/_escenario";
import { cierreDe } from "./_correccion-477";
import { whereIntentosVigentes } from "@/lib/repositories/OrdenHistorialRepository";

/**
 * SLT-247 (T2.6) — EL MENSAJERO GESTIONA LAS BARRIDAS DEVUELTAS Y REENVIA EL RECHAZADO. Contra
 * Postgres y por los servicios REALES (gestion del portal, `solicitarCierre`, aprobacion).
 *
 *   R1778/R1779  bloqueado, puede escoger y gestionar SOLO la obligatoria (una orden suelta no).
 *   R1780        la gestion queda sin cierre y sin mover la orden.
 *   R1781        deshacerla la deja otra vez obligatoria pendiente.
 *   R1782/R1783  reenviar con una pendiente: conflicto con las guias, sin escribir nada.
 *   R1784/R1785  reenviar: vincula, crea el `cierre_detail` con el MISMO congelado que `crearCierre`,
 *                congela el pago y recalcula los totales.
 *   R1790        si el corte se lleva la gestion antes del reenvio, la orden deja de ser obligatoria
 *                y su dinero cuenta una sola vez.
 *   R1792        aprobar el reenviado aplica las gestiones vinculadas y no libera las devueltas.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Tarifa de la tienda (modelo viejo) para que el `cierre_detail` congele valores no nulos. */
async function tarifaDeTienda(e: Escenario) {
  await e.tx.tarifa.create({
    data: {
      tiendaId: e.tiendaId,
      zonaId: null,
      isDefault: true,
      valorFlete: "2000.00",
      valorFleteDevuelto: "1500.00",
      valorFleteGam: "2500.00",
      valorFleteDevueltoGam: "1800.00",
      comisionCod: "3.00",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
    },
  });
}

/** Corte de hoy -> `vencido` con `n` barridas -> `solicitado` -> rechazado por la oficina. */
async function rechazadoConBarridas(e: Escenario, montos: number[], ahora = new Date()) {
  const ordenes: { ordenId: string; numGuia: number }[] = [];
  for (const m of montos) ordenes.push(await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: m }));
  await e.correrCorte(ahora, [e.mensajeroId]);
  const { id: x } = await e.tx.cierreDia.findFirstOrThrow({
    where: { mensajeroId: e.mensajeroId, estado: "vencido" },
    select: { id: true },
  });
  const re = await e.solicitarCierre();
  if (re.status !== "ok") throw new Error(`247: no se re-solicito el vencido: ${JSON.stringify(re)}`);
  const rechazo = await e.rechazar(x);
  if (rechazo.status !== "ok") throw new Error(`247: no se rechazo: ${JSON.stringify(rechazo)}`);
  return { x, ordenes };
}

/** Columnas de un `cierre_detail` que salen del calculo (no de la identidad ni de la orden). */
function calculoDe(d: Record<string, unknown>) {
  const sinIdentidad = { ...d };
  for (const k of [
    "id",
    "cierreId",
    "ordenId",
    "createdAt",
    "numGuia",
    "numRemision",
    "destinatario",
    "producto",
    "direccion",
    "montoCobrar",
  ]) {
    delete sinIdentidad[k];
  }
  return sinIdentidad;
}

describeSiHayBase("SLT-247 — gestionar las barridas devueltas y reenviar el rechazado (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
  });
  afterAll(async () => {
    await mundo.prisma.$disconnect();
  });

  it("R1778-R1785/R1792: gestiona las obligatorias, el reenvio se bloquea hasta la ultima y congela como crearCierre", async () => {
    const r = await conEscenario(mundo, async (e) => {
      await tarifaDeTienda(e);
      const { x, ordenes } = await rechazadoConBarridas(e, [1000, 2000]);
      const [a, b] = ordenes;

      // R1778: bloqueado por el rechazado, una orden suelta NO se puede escoger...
      const suelta = (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
      const escogerSuelta = await e.s.misAsignaciones.escogerParaGestion(suelta, e.actorMensajero);
      // ...y las obligatorias si (R1779: la marca de Entregas es este mismo conjunto).
      const marcadas = [...(await e.s.ordenRepo.findOrdenesEnCorreccion(e.mensajeroId, [a.ordenId, b.ordenId, suelta]))].sort();
      const gA = await e.gestionarOk(a.ordenId, "entregado", { monto: 1000 });
      // R1780
      const gestionA = await e.tx.gestionOrden.findUniqueOrThrow({ where: { id: gA }, select: { cierreId: true } });
      const estadoA = await e.estadoDe(a.ordenId);

      // R1782/R1783: falta B -> conflicto con su guia y nada escrito.
      const antes = { cierre: await cierreDe(e, x), detalle: await e.tx.cierreDetail.count({ where: { cierreId: x } }) };
      const bloqueado = await e.solicitarCierre();
      const tras = {
        cierre: await cierreDe(e, x),
        detalle: await e.tx.cierreDetail.count({ where: { cierreId: x } }),
        gestionA: (await e.tx.gestionOrden.findUniqueOrThrow({ where: { id: gA }, select: { cierreId: true } })).cierreId,
      };

      // R1781: deshacer la de A la vuelve obligatoria pendiente: el reenvio nombra las dos.
      const deshacer = await e.s.cierreDia.deshacerGestion(gA, e.actorMensajero);
      const bloqueadoDos = await e.solicitarCierre();
      const gA2 = await e.gestionarOk(a.ordenId, "entregado", { monto: 1000 });
      const gB = await e.gestionarOk(b.ordenId, "devolucion_a_origen_por_rechazo");

      // Referencia: el MISMO congelado por `crearCierre`, para una orden gemela del otro mensajero.
      const gemela = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 1000, mensajeroId: e.mensajero2Id });
      await e.gestionarOk(gemela.ordenId, "entregado", { monto: 1000, actor: e.actorMensajero2 });
      const y = await e.solicitarCierreOk(e.actorMensajero2);

      const reenvio = await e.solicitarCierre();
      const detalleX = await e.tx.cierreDetail.findMany({ where: { cierreId: x }, orderBy: { ordenId: "asc" } });
      const detalleGemela = await e.tx.cierreDetail.findFirstOrThrow({ where: { cierreId: y } });
      const gestiones = await e.tx.gestionOrden.findMany({
        where: { id: { in: [gA2, gB] } },
        select: { id: true, cierreId: true, pagoMensajero: true },
      });
      const cierreTrasReenvio = await cierreDe(e, x);

      // R1792: aprobar el reenviado aplica las gestiones vinculadas.
      const pedidas = await e.s.adminRepo.findBarridasDelCierre(x, {
        destinoTipo: "bodega_satelite",
        destinoZonaId: e.zonaSateliteId,
      });
      const aprobacion = await e.aprobar(x);
      return {
        x,
        guiaB: b.numGuia,
        guias: [a.numGuia, b.numGuia].sort((m, n) => m - n),
        ids: { a: a.ordenId, b: b.ordenId },
        escogerSuelta: escogerSuelta.status,
        marcadas,
        gestionA: gestionA.cierreId,
        estadoA,
        bloqueado,
        antes,
        tras,
        deshacer: deshacer.status,
        bloqueadoDos,
        reenvio,
        detalleX,
        detalleGemela,
        gestiones,
        cierreTrasReenvio,
        pedidas: pedidas.length,
        aprobacion: aprobacion.status,
        estadosFinales: { a: await e.estadoDe(a.ordenId), b: await e.estadoDe(b.ordenId) },
        liberacion: (await e.historialDe(a.ordenId)).filter((h) => h.origenTipo === "liberacion_sin_gestionar"),
        intentosB: (await e.tx.gestionOrden.groupBy({ by: ["ordenId", "cierreId"], where: whereIntentosVigentes(b.ordenId) })).length,
      };
    });

    expect(r.escogerSuelta).not.toBe("ok");
    expect(r.marcadas).toEqual([r.ids.a, r.ids.b].sort());
    expect(r.gestionA).toBeNull();
    expect(r.estadoA).toBe("en_reparto");

    expect(r.bloqueado).toEqual({
      status: "conflict",
      motivo:
        "Antes de enviar de nuevo este cierre tienes que gestionar 1 orden que pasó a Novedad interna: " +
        `guía ${r.guiaB}. Está en Entregas.`,
    });
    expect(r.tras.cierre).toEqual(r.antes.cierre);
    expect(r.tras.cierre.estado).toBe("rechazado");
    expect(r.tras.detalle).toBe(0);
    expect(r.tras.gestionA).toBeNull();

    expect(r.deshacer).toBe("ok");
    expect(r.bloqueadoDos).toMatchObject({ status: "conflict" });
    expect((r.bloqueadoDos as { motivo: string }).motivo).toContain(`2 órdenes que pasaron a Novedad interna: guía ${r.guias[0]} y ${r.guias[1]}.`);

    // R1784: el reenvio vincula y crea el detalle de las dos, con el calculo de `crearCierre`.
    expect(r.reenvio).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.detalleX.map((d) => d.ordenId)).toEqual([r.ids.a, r.ids.b].sort());
    const detA = r.detalleX.find((d) => d.ordenId === r.ids.a) as Record<string, unknown>;
    expect(detA.valorFlete).not.toBeNull(); // anti-vacuidad: hay tarifa congelada
    expect(calculoDe(detA)).toEqual(calculoDe(r.detalleGemela as unknown as Record<string, unknown>));
    expect(String(detA.montoCobrar)).toBe("1000");
    // R1785: vinculadas, con pago congelado, y totales recalculados.
    for (const g of r.gestiones) {
      expect(g.cierreId).toBe(r.x);
      expect(g.pagoMensajero).not.toBeNull();
    }
    expect(r.cierreTrasReenvio.estado).toBe("solicitado");
    expect(r.antes.cierre.general).toBe("0.00");
    expect(r.cierreTrasReenvio.general).toBe("1000.00");
    expect(r.cierreTrasReenvio.efectivo).toBe("1000.00");
    expect(r.antes.cierre.pago).toBe("0.00");
    expect(r.cierreTrasReenvio.pago).not.toBe("0.00");

    // R1792: ninguna barrida que pedir; la aprobacion aplica las gestiones y no libera a bodega.
    expect(r.pedidas).toBe(0);
    expect(r.aprobacion).toBe("ok");
    expect(r.estadosFinales.a).toBe("entregado");
    expect(r.estadosFinales.b).not.toBe("en_reparto");
    expect(r.estadosFinales.b).not.toMatch(/bodega/);
    expect(r.liberacion).toEqual([]);
    // 477/R24: la gestion vinculada cuenta UN intento al aprobarse (la de B es un rechazo).
    expect(r.intentosB).toBe(1);
  });

  it("R1790: si el corte se lleva la gestion antes del reenvio, deja de ser obligatoria y cuenta una sola vez", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const ahora = new Date();
      const { x, ordenes } = await rechazadoConBarridas(e, [1000, 2000], ahora);
      const [a, b] = ordenes;
      const gA = await e.gestionarOk(a.ordenId, "entregado", { monto: 1000 });
      // El corte de la noche: se lleva la gestion de A a SU cierre y no barre B (R1788).
      await e.correrCorte(new Date(ahora.getTime() + DIA_MS), [e.mensajeroId]);
      const y = await e.tx.cierreDia.findFirstOrThrow({
        where: { mensajeroId: e.mensajeroId, estado: "vencido" },
        select: { id: true },
      });
      const obligatorias = [...(await e.s.ordenRepo.findOrdenesEnCorreccion(e.mensajeroId, [a.ordenId, b.ordenId]))];
      const gB = await e.gestionarOk(b.ordenId, "devolucion_a_origen_por_rechazo");
      const reenvio = await e.solicitarCierre();
      return {
        x,
        y: y.id,
        ids: { a: a.ordenId, b: b.ordenId },
        obligatorias,
        reenvio,
        estadoX: (await cierreDe(e, x)).estado,
        cierreDeA: (await e.tx.gestionOrden.findUniqueOrThrow({ where: { id: gA }, select: { cierreId: true } })).cierreId,
        cierreDeB: (await e.tx.gestionOrden.findUniqueOrThrow({ where: { id: gB }, select: { cierreId: true } })).cierreId,
        vigentesDeA: await e.tx.gestionOrden.count({ where: { ordenId: a.ordenId, anuladaAt: null } }),
        detalleX: (await e.tx.cierreDetail.findMany({ where: { cierreId: x }, select: { ordenId: true } })).map((d) => d.ordenId),
        detalleY: (await e.tx.cierreDetail.findMany({ where: { cierreId: y.id }, select: { ordenId: true, montoCobrar: true } })).map(
          (d) => ({ ordenId: d.ordenId, monto: String(d.montoCobrar) }),
        ),
        generalX: (await cierreDe(e, x)).general,
        generalY: (await cierreDe(e, y.id)).general,
      };
    });
    expect(r.obligatorias).toEqual([r.ids.b]);
    expect(r.reenvio).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.estadoX).toBe("solicitado");
    expect(r.cierreDeA).toBe(r.y);
    expect(r.cierreDeB).toBe(r.x);
    expect(r.vigentesDeA).toBe(1);
    expect(r.detalleX).toEqual([r.ids.b]);
    // «Cuenta una sola vez»: el dinero de A vive en Y (su detalle y su total) y X no lo cuenta.
    expect(r.detalleY).toEqual([{ ordenId: r.ids.a, monto: "1000" }]);
    expect(r.generalY).toBe("1000.00");
    expect(r.generalX).toBe("0.00");
  });
});
