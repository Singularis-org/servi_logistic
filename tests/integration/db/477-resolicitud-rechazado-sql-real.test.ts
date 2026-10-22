import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Escenario, type Mundo } from "./454/_escenario";
import { cierreDe, detalleDe, fijarTarifaSatelite, gestionDe } from "./_correccion-477";

/**
 * FICHA 477 (T4.4; R15-R20, R22) — RE-SOLICITAR UN CIERRE RECHAZADO Y CORREGIDO, contra Postgres y
 * por el servicio REAL (`solicitarCierre`).
 *
 *   R15  vincula las gestiones sin cierre de las ordenes en correccion de ESE cierre.
 *   R16  y ninguna otra: ni la de una orden de OTRO rechazado, ni un rechazo de tienda (aunque sea
 *        de una orden en correccion), ni una sintetica del tope, ni el trabajo de hoy.
 *   R17  congela pago/ingreso de las recien vinculadas con la tarifa de la zona destino de HOY.
 *   R18  borra de `cierre_detail` SOLO las ordenes en correccion sin gestion; las demas intactas.
 *   R19  los seis totales son la suma de lo vinculado (snapshots por gestion).
 *   R20  sin correcciones, totales, snapshots y `cierre_detail` quedan identicos.
 *   R22  carrera (el cierre ya no esta `rechazado`): no escribe nada.
 *
 * Mutaciones en `progress/impl_477.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Una gestion sembrada a mano, SIN cierre, del mensajero del escenario. */
async function gestionSuelta(
  e: Escenario,
  ordenId: string,
  opts: { resultado?: "reprogramado" | "devolucion_a_origen_por_rechazo"; origen?: "rechazo_tienda" | "rechazo_tope_intentos" } = {},
) {
  const g = await e.tx.gestionOrden.create({
    data: { ordenId, mensajeroId: e.mensajeroId, resultado: opts.resultado ?? "reprogramado", cierreId: null },
    select: { id: true },
  });
  if (opts.origen) {
    await e.tx.ordenHistorialEstado.create({
      data: {
        ordenId,
        estatusOrigenId: e.id("en_reparto"),
        estatusDestinoId: e.id("devolucion_a_origen_por_rechazo"),
        origenTipo: opts.origen,
        gestionOrdenId: g.id,
      },
    });
  }
  return g.id;
}

describeSiHayBase("477/T4.4 — re-solicitar un cierre rechazado (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
  });
  afterAll(async () => {
    await mundo.prisma.$disconnect();
  });

  it("R15-R19: vincula y congela solo lo de sus ordenes en correccion, poda el detalle y recalcula", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const o1 = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const o2 = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 3000 });
      const o3 = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 4000 });
      const o8 = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 6000 });
      const g1 = await e.gestionarOk(o1.ordenId, "entregado", { monto: 5000 });
      const g2 = await e.gestionarOk(o2.ordenId, "entregado", { monto: 3000 });
      const g3 = await e.gestionarOk(o3.ordenId, "devolucion_a_origen_por_rechazo");
      const g8 = await e.gestionarOk(o8.ordenId, "devolucion_a_origen_por_rechazo");
      const x = await e.solicitarCierreOk();
      await e.rechazar(x);
      const detalleAntes = await detalleDe(e, x);

      // La correccion: deshacer o1, o3, o8; rehacer o1 (entregada) y o8 (rechazo). o3 se queda sin.
      const des = [
        (await e.s.cierreDia.deshacerGestion(g1, e.actorMensajero)).status,
        (await e.s.cierreDia.deshacerGestion(g3, e.actorMensajero)).status,
        (await e.s.cierreDia.deshacerGestion(g8, e.actorMensajero)).status,
      ];
      const g1b = await e.gestionarOk(o1.ordenId, "entregado", { monto: 5000 });
      const g8b = await e.gestionarOk(o8.ordenId, "devolucion_a_origen_por_rechazo");

      // R16 — el ruido que NO puede entrar:
      //  · un rechazo de TIENDA sobre una orden EN correccion (o3): familia de escritorio (337).
      const gTienda = await gestionSuelta(e, o3.ordenId, {
        resultado: "devolucion_a_origen_por_rechazo",
        origen: "rechazo_tienda",
      });
      //  · OTRO rechazado del mismo mensajero (mas nuevo), con una orden en correccion y su rehecha.
      const o4 = await e.sembrarOrden({ estatus: "en_reparto" });
      const y = (
        await e.tx.cierreDia.create({
          data: {
            mensajeroId: e.mensajeroId,
            estado: "rechazado",
            destinoTipo: "bodega_satelite",
            destinoZonaId: e.zonaSateliteId,
            solicitadoAt: new Date(Date.now() + 86_400_000), // mas nuevo: la re-solicitud elige X
          },
          select: { id: true },
        })
      ).id;
      await e.tx.cierreDetail.create({
        data: {
          ...detalleAntes[0],
          id: undefined,
          createdAt: undefined,
          cierreId: y,
          ordenId: o4.ordenId,
        },
      });
      const g4 = await gestionSuelta(e, o4.ordenId);
      //  · una sintetica del TOPE y el trabajo de HOY, sobre ordenes que no estan en correccion.
      const o6 = await e.sembrarOrden({ estatus: "en_reparto" });
      const g6 = await gestionSuelta(e, o6.ordenId, {
        resultado: "devolucion_a_origen_por_rechazo",
        origen: "rechazo_tope_intentos",
      });
      const o7 = await e.sembrarOrden({ estatus: "en_reparto" });
      const g7 = await gestionSuelta(e, o7.ordenId);

      // R17: la tarifa de la zona destino CAMBIA antes de re-solicitar. Las rehechas se congelan con
      // la de hoy (P4); la que nadie toco conserva la suya.
      await fijarTarifaSatelite(e, "1700.00", "200.00");

      const resolicitud = await e.s.cierreDia.solicitarCierre(e.actorMensajero);

      const detalleDespues = await detalleDe(e, x);
      return {
        x,
        des,
        resolicitud,
        cierre: await cierreDe(e, x),
        g1: await gestionDe(e, g1),
        g1b: await gestionDe(e, g1b),
        g2: await gestionDe(e, g2),
        g3: await gestionDe(e, g3),
        g8b: await gestionDe(e, g8b),
        ruido: {
          tienda: (await gestionDe(e, gTienda)).cierreId,
          otroRechazado: (await gestionDe(e, g4)).cierreId,
          tope: (await gestionDe(e, g6)).cierreId,
          hoy: (await gestionDe(e, g7)).cierreId,
        },
        y: (await cierreDe(e, y)).estado,
        detalleY: (await detalleDe(e, y)).map((d) => d.ordenId),
        o4: o4.ordenId,
        detalleAntes: detalleAntes.map((d) => d.ordenId).sort(),
        ordenes: { o1: o1.ordenId, o2: o2.ordenId, o3: o3.ordenId, o8: o8.ordenId },
        detalleIntacto: detalleDespues.every((d) =>
          detalleAntes.some((a) => JSON.stringify(a) === JSON.stringify(d)),
        ),
        detalleDespues: detalleDespues.map((d) => d.ordenId).sort(),
      };
    });

    // Anti-vacuidad: los tres deshacer y la re-solicitud ocurrieron sobre un cierre con 4 filas.
    expect(r.des).toEqual(["ok", "ok", "ok"]);
    expect(r.detalleAntes).toHaveLength(4);
    expect(r.resolicitud).toEqual({ status: "ok", via: "resolicitado" });

    expect(r.cierre.estado).toBe("solicitado");
    // R15 + R17: las rehechas, vinculadas y congeladas con la tarifa de HOY.
    expect(r.g1b).toMatchObject({ cierreId: r.x, pago: "1700.00", ingreso: "0.00" });
    expect(r.g8b).toMatchObject({ cierreId: r.x, pago: "0.00", ingreso: "200.00" });
    // La que nadie toco conserva su snapshot; las anuladas siguen fuera.
    expect(r.g2).toMatchObject({ cierreId: r.x, pago: "1500.00", ingreso: "0.00" });
    expect(r.g1).toMatchObject({ cierreId: null, anulada: true });
    expect(r.g3).toMatchObject({ cierreId: null, anulada: true });
    // R16: nada del ruido entra.
    expect(r.ruido).toEqual({ tienda: null, otroRechazado: null, tope: null, hoy: null });
    expect(r.y).toBe("rechazado");
    expect(r.detalleY).toEqual([r.o4]);
    // R18: sale SOLO o3 (en correccion y sin gestion); las demas filas, identicas.
    expect(r.detalleDespues).toEqual([r.ordenes.o1, r.ordenes.o2, r.ordenes.o8].sort());
    expect(r.detalleIntacto).toBe(true);
    // R19: la suma de lo vinculado. Recaudo: o1 5000 + o2 3000. Pago: 1700 + 1500. Ingreso: 200.
    expect(r.cierre).toEqual({
      estado: "solicitado",
      efectivo: "8000.00",
      simpe: "0.00",
      transferencia: "0.00",
      general: "8000.00",
      pago: "3200.00",
      ingreso: "200.00",
    });
  });

  it("R20: sin correcciones, totales, snapshots y `cierre_detail` quedan identicos", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const o1 = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const o2 = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 7000 });
      const g1 = await e.gestionarOk(o1.ordenId, "entregado", {
        monto: 5000,
        pagos: [
          { metodo: "SINPE", monto: 1000 },
          { metodo: "transferencia", monto: 4000 },
        ],
      });
      const g2 = await e.gestionarOk(o2.ordenId, "devolucion_a_origen_por_rechazo");
      const x = await e.solicitarCierreOk();
      await e.rechazar(x);
      const foto = async () => ({
        cierre: { ...(await cierreDe(e, x)), estado: "-" },
        g1: await gestionDe(e, g1),
        g2: await gestionDe(e, g2),
        detalle: JSON.stringify(await detalleDe(e, x)),
      });
      const antes = await foto();
      // Una tarifa cambiada no puede re-derivar nada: no hay ninguna gestion nueva que congelar.
      await fijarTarifaSatelite(e, "9999.00", "999.00");
      const resolicitud = await e.s.cierreDia.solicitarCierre(e.actorMensajero);
      return { antes, resolicitud, despues: await foto(), estado: (await cierreDe(e, x)).estado };
    });

    expect(r.antes.cierre.general).toBe("5000.00"); // anti-vacuidad
    expect(r.resolicitud).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.estado).toBe("solicitado");
    expect(r.despues).toEqual(r.antes);
  });

  it("R22: si el cierre ya no esta `rechazado` (o no es suyo), la re-solicitud no escribe nada", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const o1 = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const g1 = await e.gestionarOk(o1.ordenId, "entregado", { monto: 5000 });
      const x = await e.solicitarCierreOk();
      await e.rechazar(x);
      await e.s.cierreDia.deshacerGestion(g1, e.actorMensajero);
      const g1b = await e.gestionarOk(o1.ordenId, "entregado", { monto: 5000 });
      const foto = async () => ({
        cierre: await cierreDe(e, x),
        g1b: await gestionDe(e, g1b),
        detalle: JSON.stringify(await detalleDe(e, x)),
      });
      // No es suyo: la escritura exige el dueño.
      const ajeno = await e.s.cierreDiaRepo.resolicitarCierreRechazado({
        cierreId: x,
        mensajeroId: e.mensajero2Id,
        tarifa: { cobroEntregado: "1500.00", cobroRechazado: "164.00" },
      });
      const trasAjeno = await foto();
      // Carrera: otra via lo saco de `rechazado` entre la lectura y la escritura.
      await e.tx.cierreDia.update({ where: { id: x }, data: { estado: "vencido" } });
      const antes = await foto();
      const carrera = await e.s.cierreDiaRepo.resolicitarCierreRechazado({
        cierreId: x,
        mensajeroId: e.mensajeroId,
        tarifa: { cobroEntregado: "1500.00", cobroRechazado: "164.00" },
      });
      return { ajeno, trasAjeno, carrera, antes, despues: await foto() };
    });

    // Anti-vacuidad: hay una rehecha sin cierre que la re-solicitud se habria llevado.
    expect(r.trasAjeno.g1b.cierreId).toBeNull();
    expect(r.trasAjeno.cierre.estado).toBe("rechazado");
    expect(r.ajeno).toBe(false);
    expect(r.carrera).toBe(false);
    expect(r.despues).toEqual(r.antes);
  });
});
