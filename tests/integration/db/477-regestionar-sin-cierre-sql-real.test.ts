import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Mundo } from "./454/_escenario";
import { gestionDe } from "./_correccion-477";

/**
 * FICHA 477 (T3.4; R12, R13, R14) — VOLVER A GESTIONAR CON EL BLOQUEO PUESTO, contra Postgres y por
 * los servicios REALES.
 *
 *   R12  el mensajero bloqueado (tiene un `rechazado`) escoge y gestiona la orden EN CORRECCION.
 *   R13  y NO cualquier otra: la orden que no esta en correccion recibe el motivo de bloqueo.
 *   R14  la gestion rehecha nace SIN cierre, con su evento `gestion_registrada`, y la orden sigue
 *        `en_reparto` (pendiente de confirmar, como toda gestion de la 454).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("477/T3.4 — volver a gestionar una orden en correccion (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
  });
  afterAll(async () => {
    await mundo.prisma.$disconnect();
  });

  it("R12/R13/R14: solo la orden en correccion se gestiona, y su gestion nace sin cierre", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const corr = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const g1 = await e.gestionarOk(corr.ordenId, "entregado", { monto: 5000 });
      const cierreId = await e.solicitarCierreOk();
      await e.rechazar(cierreId);
      // Una orden en mano que NO esta en correccion (asignada despues).
      const otra = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 2000 });

      const bloqueo = await e.s.ordenRepo.findBloqueoDetalle(e.mensajeroId);
      // Antes de deshacer, la orden NO esta en correccion: tiene su gestion vigente en el cierre.
      const antesDeDeshacer = await e.s.misAsignaciones.escogerParaGestion(corr.ordenId, e.actorMensajero);
      const des = await e.s.cierreDia.deshacerGestion(g1, e.actorMensajero);

      // R13: la otra orden sigue cerrada por el bloqueo.
      const escogerOtra = await e.s.misAsignaciones.escogerParaGestion(otra.ordenId, e.actorMensajero);
      const gestionarOtra = await e.gestionar(otra.ordenId, "entregado", { monto: 2000, escoger: false });

      // R12: la orden en correccion se escoge y se gestiona.
      const escoger = await e.s.misAsignaciones.escogerParaGestion(corr.ordenId, e.actorMensajero);
      const gestionar = await e.gestionar(corr.ordenId, "reprogramado", { escoger: false });
      const rehecha = await e.tx.gestionOrden.findFirstOrThrow({
        where: { ordenId: corr.ordenId, anuladaAt: null },
        select: { id: true },
      });
      const listado = await e.s.misAsignaciones.listarMisAsignaciones(e.actorMensajero);

      return {
        cierreId,
        bloqueado: bloqueo.bloqueado,
        antesDeDeshacer,
        des: des.status,
        escogerOtra,
        gestionarOtra,
        escoger,
        gestionar: gestionar.status,
        g1,
        rehecha: rehecha.id,
        gRehecha: await gestionDe(e, rehecha.id),
        registro: await e.tx.ordenEvento.count({
          where: { gestionOrdenId: rehecha.id, tipo: "gestion_registrada" },
        }),
        estado: await e.estadoDe(corr.ordenId),
        gestionesOtra: await e.tx.gestionOrden.count({ where: { ordenId: otra.ordenId } }),
        listadoOtra:
          listado.status === "ok"
            ? listado.porGestionar.find((o) => o.id === otra.ordenId)?.enCorreccion
            : "no-ok",
      };
    });

    // Anti-vacuidad: el mensajero esta bloqueado por el rechazado y el deshacer ocurrio.
    expect(r.bloqueado).toBe(true);
    expect(r.des).toBe("ok");
    // Con la gestion aun en el cierre, la orden tampoco se escoge (no esta en correccion).
    expect(r.antesDeDeshacer.status).toBe("conflict");
    // R13: motivo de bloqueo de hoy, sin efectos.
    expect(r.escogerOtra.status).toBe("conflict");
    if (r.escogerOtra.status === "conflict") {
      expect(r.escogerOtra.motivo).toMatch(/no puedes entregar, cobrar ni recibir trabajo nuevo/i);
    }
    expect(r.gestionarOtra.status).toBe("conflict");
    expect(r.gestionesOtra).toBe(0);
    expect(r.listadoOtra).toBe(false);
    // R12.
    expect(r.escoger.status).toBe("ok");
    expect(r.gestionar).toBe("ok");
    // R14.
    expect(r.rehecha).not.toBe(r.g1);
    expect(r.gRehecha).toMatchObject({ cierreId: null, anulada: false, pago: null, ingreso: null, resultado: "reprogramado" });
    expect(r.registro).toBe(1);
    expect(r.estado).toBe("en_reparto");
  });

  it("R27 (datos): con el bloqueo puesto, el listado marca `enCorreccion` solo en la orden en correccion", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const corr = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const g1 = await e.gestionarOk(corr.ordenId, "entregado", { monto: 5000 });
      const cierreId = await e.solicitarCierreOk();
      await e.rechazar(cierreId);
      await e.s.cierreDia.deshacerGestion(g1, e.actorMensajero);
      const otra = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 2000 });
      const listado = await e.s.misAsignaciones.listarMisAsignaciones(e.actorMensajero);
      if (listado.status !== "ok") throw new Error("listado no ok");
      return {
        corr: listado.porGestionar.find((o) => o.id === corr.ordenId)?.enCorreccion,
        otra: listado.porGestionar.find((o) => o.id === otra.ordenId)?.enCorreccion,
      };
    });

    expect(r).toEqual({ corr: true, otra: false });
  });
});
