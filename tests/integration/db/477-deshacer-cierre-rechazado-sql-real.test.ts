import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Mundo } from "./454/_escenario";
import {
  cierreDe,
  detalleDe,
  fijarTarifaSatelite,
  gestionDe,
  suscribirWebhook,
} from "./_correccion-477";

/**
 * FICHA 477 (T2.3; R1, R2, R3, R6, R9, R11) — DESHACER UNA GESTION DE UN CIERRE RECHAZADO, contra
 * Postgres real y por los servicios REALES.
 *
 *   R1   la gestion queda anulada (con su actor), SIN cierre y con los dos snapshots en NULL; la
 *        orden no se mueve.
 *   R2   evento `gestion_anulada` + su job de webhook.
 *   R3   los seis totales del cierre son los de las gestiones que le quedan, al centimo, SUMANDO
 *        snapshots (una tarifa cambiada despues de solicitar no re-deriva nada).
 *   R6   con el cierre `solicitado` (mensajero no bloqueado) el deshacer se rechaza sin efectos.
 *   R9   con la orden fuera de `en_reparto`, sin efectos (servicio y guarda de la escritura).
 *   R11  si el cierre deja de estar `rechazado` entre la lectura y la escritura, sin efectos.
 *
 * Cada caso afirma primero que su siembra existe. Mutaciones en `progress/impl_477.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("477/T2.3 — deshacer en un cierre rechazado (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
  });
  afterAll(async () => {
    await mundo.prisma.$disconnect();
  });

  it("R1/R2/R3: anula, desvincula, deja rastro y recalcula los seis totales por snapshot", async () => {
    const r = await conEscenario(mundo, async (e) => {
      await suscribirWebhook(e, "r1");
      const ent = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const otra = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 3000 });
      const rec = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 7000 });
      const gEnt = await e.gestionarOk(ent.ordenId, "entregado", {
        monto: 5000,
        pagos: [
          { metodo: "efectivo", monto: 2000 },
          { metodo: "SINPE", monto: 3000 },
        ],
      });
      const gOtra = await e.gestionarOk(otra.ordenId, "entregado", { monto: 3000 });
      const gRec = await e.gestionarOk(rec.ordenId, "devolucion_a_origen_por_rechazo");
      const cierreId = await e.solicitarCierreOk();
      const antes = await cierreDe(e, cierreId);
      const rechazo = await e.rechazar(cierreId);
      // R3: una tarifa editada DESPUES de solicitar no puede mover el pago de las que nadie toco.
      await fijarTarifaSatelite(e, "9999.00", "999.00");

      const des = await e.s.cierreDia.deshacerGestion(gEnt, e.actorMensajero);

      const eventos = await e.tx.ordenEvento.findMany({
        where: { gestionOrdenId: gEnt, tipo: "gestion_anulada" },
        select: { id: true, resultado: true, actorUsuarioId: true, actorRol: true },
      });
      const jobs = await e.tx.job.count({
        where: { tipo: "webhook_evento", payload: { path: ["ordenEventoId"], equals: eventos[0]?.id ?? "-" } },
      });
      return {
        cierreId,
        mensajeroId: e.mensajeroId,
        antes,
        rechazo: rechazo.status,
        des,
        ordenEnt: ent.ordenId,
        gEnt: await gestionDe(e, gEnt),
        gOtra: await gestionDe(e, gOtra),
        gRec: await gestionDe(e, gRec),
        estadoEnt: await e.estadoDe(ent.ordenId),
        eventos,
        jobs,
        despues: await cierreDe(e, cierreId),
        detalle: (await detalleDe(e, cierreId)).map((d) => d.ordenId).sort(),
        ordenes: [ent.ordenId, otra.ordenId, rec.ordenId].sort(),
        historialAnulacion: await e.tx.ordenHistorialEstado.count({
          where: { ordenId: ent.ordenId, gestionOrdenId: gEnt, origenTipo: "deshacer_gestion" },
        }),
      };
    });

    // Anti-vacuidad: la siembra existe y el cierre llego rechazado con los tres importes.
    expect(r.rechazo).toBe("ok");
    expect(r.antes).toEqual({
      estado: "solicitado",
      efectivo: "5000.00",
      simpe: "3000.00",
      transferencia: "0.00",
      general: "8000.00",
      pago: "3000.00",
      ingreso: "164.00",
    });

    expect(r.des).toEqual({ status: "ok", ordenId: r.ordenEnt });
    // R1: anulada por el actor, desvinculada y sin snapshots. La orden NO se mueve.
    expect(r.gEnt).toMatchObject({
      cierreId: null,
      anulada: true,
      anuladaPor: r.mensajeroId,
      pago: null,
      ingreso: null,
    });
    expect(r.estadoEnt).toBe("en_reparto");
    expect(r.historialAnulacion).toBe(0); // sin transicion: rama 454, no la legada
    // Las otras dos siguen en el cierre con su snapshot de cuando se solicito (R3).
    expect(r.gOtra).toMatchObject({ cierreId: r.cierreId, anulada: false, pago: "1500.00" });
    expect(r.gRec).toMatchObject({ cierreId: r.cierreId, anulada: false, ingreso: "164.00" });
    // R2: el rastro.
    expect(r.eventos).toEqual([
      { id: expect.any(String), resultado: "entregado", actorUsuarioId: r.mensajeroId, actorRol: "mensajero" },
    ]);
    expect(r.jobs).toBe(1);
    // R3: los seis totales son los de lo que queda, al centimo y por suma de snapshots (no 9999/999).
    expect(r.despues).toEqual({
      estado: "rechazado",
      efectivo: "3000.00",
      simpe: "0.00",
      transferencia: "0.00",
      general: "3000.00",
      pago: "1500.00",
      ingreso: "164.00",
    });
    // D1: la fila de `cierre_detail` se queda hasta la re-solicitud (es lo que marca «en correccion»).
    expect(r.detalle).toEqual(r.ordenes);
  });

  it("R6: con el cierre `solicitado` (sin bloqueo) no se deshace, sin efectos", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const o = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const g = await e.gestionarOk(o.ordenId, "entregado", { monto: 5000 });
      const cierreId = await e.solicitarCierreOk();
      const antes = { g: await gestionDe(e, g), c: await cierreDe(e, cierreId) };
      const des = await e.s.cierreDia.deshacerGestion(g, e.actorMensajero);
      // La guarda de la escritura, llamada directa: el cierre no es `rechazado`.
      const repo = await e.s.cierreDiaRepo.anularGestionDeCierreRechazado({
        gestionId: g,
        ordenId: o.ordenId,
        mensajeroId: e.mensajeroId,
        cierreId,
        actorUsuarioId: e.mensajeroId,
        estatusEnRepartoId: e.id("en_reparto"),
      });
      return {
        antes,
        des,
        repo,
        despues: { g: await gestionDe(e, g), c: await cierreDe(e, cierreId) },
        eventos: await e.tx.ordenEvento.count({ where: { gestionOrdenId: g, tipo: "gestion_anulada" } }),
      };
    });

    expect(r.antes.g.cierreId).not.toBeNull(); // anti-vacuidad
    expect(r.des).toEqual({
      status: "conflict",
      motivo: "Esta gestion ya esta incluida en un cierre solicitado; no se puede deshacer.",
    });
    expect(r.repo).toBe(false);
    expect(r.despues).toEqual(r.antes);
    expect(r.eventos).toBe(0);
  });

  it("R9: con la orden fuera de `en_reparto` no se deshace (servicio y escritura), sin efectos", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const o = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const g = await e.gestionarOk(o.ordenId, "entregado", { monto: 5000 });
      const cierreId = await e.solicitarCierreOk();
      await e.rechazar(cierreId);
      // Otra via movio la orden.
      await e.tx.orden.update({ where: { id: o.ordenId }, data: { estatusId: e.id("novedad_interna") } });
      const antes = { g: await gestionDe(e, g), c: await cierreDe(e, cierreId) };
      const des = await e.s.cierreDia.deshacerGestion(g, e.actorMensajero);
      const repo = await e.s.cierreDiaRepo.anularGestionDeCierreRechazado({
        gestionId: g,
        ordenId: o.ordenId,
        mensajeroId: e.mensajeroId,
        cierreId,
        actorUsuarioId: e.mensajeroId,
        estatusEnRepartoId: e.id("en_reparto"),
      });
      return { antes, des, repo, despues: { g: await gestionDe(e, g), c: await cierreDe(e, cierreId) } };
    });

    expect(r.antes.c.estado).toBe("rechazado"); // anti-vacuidad
    expect(r.des).toEqual({
      status: "conflict",
      motivo: "Esta orden ya fue procesada por la bodega; ya no se puede deshacer.",
    });
    expect(r.repo).toBe(false);
    expect(r.despues).toEqual(r.antes);
  });

  it("R11: si el cierre dejo de estar `rechazado` entre la lectura y la escritura, no escribe nada", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const o = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 5000 });
      const g = await e.gestionarOk(o.ordenId, "entregado", { monto: 5000 });
      const cierreId = await e.solicitarCierreOk();
      await e.rechazar(cierreId);
      // La lectura del servicio ya ocurrio (simulada): el cierre se re-solicito entre medias.
      await e.tx.cierreDia.update({ where: { id: cierreId }, data: { estado: "solicitado" } });
      const antes = { g: await gestionDe(e, g), c: await cierreDe(e, cierreId) };
      const repo = await e.s.cierreDiaRepo.anularGestionDeCierreRechazado({
        gestionId: g,
        ordenId: o.ordenId,
        mensajeroId: e.mensajeroId,
        cierreId,
        actorUsuarioId: e.mensajeroId,
        estatusEnRepartoId: e.id("en_reparto"),
      });
      // Y con un cierre `rechazado` AJENO: la re-lectura exige el dueño.
      await e.tx.cierreDia.update({ where: { id: cierreId }, data: { estado: "rechazado" } });
      const ajeno = await e.s.cierreDiaRepo.anularGestionDeCierreRechazado({
        gestionId: g,
        ordenId: o.ordenId,
        mensajeroId: e.mensajero2Id,
        cierreId,
        actorUsuarioId: e.mensajero2Id,
        estatusEnRepartoId: e.id("en_reparto"),
      });
      return {
        antes,
        repo,
        ajeno,
        despues: { g: await gestionDe(e, g), c: await cierreDe(e, cierreId) },
        eventos: await e.tx.ordenEvento.count({ where: { gestionOrdenId: g, tipo: "gestion_anulada" } }),
      };
    });

    expect(r.antes.g.cierreId).not.toBeNull(); // anti-vacuidad
    expect(r.repo).toBe(false);
    expect(r.ajeno).toBe(false);
    expect(r.despues.g).toEqual(r.antes.g);
    expect(r.despues.c).toEqual({ ...r.antes.c, estado: "rechazado" });
    expect(r.eventos).toBe(0);
  });
});
