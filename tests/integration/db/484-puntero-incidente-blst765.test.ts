import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Mundo } from "./454/_escenario";
import { plantarPuntero, punteroDe } from "./_puntero-484";

/**
 * FICHA 484 (T8; R15, y R9/R11 en la variante heredada) — EL INCIDENTE BLST-765, DE PUNTA A PUNTA,
 * contra Postgres real y por los SERVICIOS reales.
 *
 * Lo que paso en produccion (16-19/10/2026): el mensajero pulsa «Gestionar pedido» sobre una orden
 * `en_reparto` (fija el puntero), el corte de las 06:00 la pasa a `sin_gestionar`, la aprobacion
 * del cierre la devuelve a bodega sin mensajero, y el puntero sigue ahi: Reparto en modo foco sobre
 * una orden que ya no es suya, sin poder escoger otra ni gestionar. Aqui se repite esa secuencia y
 * se comprueba que al final el mensajero esta LIBRE.
 *
 * Variante «heredado»: un puntero colgado que quedo de antes del despliegue (puesto a mano sobre una
 * orden ya en `en_bodega_central`). Lo neutraliza la defensa (§4), no la raiz.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("484/T8 — el incidente BLST-765 de punta a punta (Postgres real)", () => {
  let mundo: Mundo;
  let inc: Awaited<ReturnType<typeof incidente>>;
  let her: Awaited<ReturnType<typeof heredado>>;

  function incidente() {
    return conEscenario(mundo, async (e) => {
      const m = e.mensajeroId;
      const blst = await e.sembrarOrden({ estatus: "en_reparto" });
      const otra = await e.sembrarOrden({ estatus: "en_reparto" });

      // 16/10 — «Gestionar pedido»: el puntero se fija por el camino real.
      const escogida = await e.s.misAsignaciones.escogerParaGestion(blst.ordenId, e.actorMensajero);
      const punteroTrasEscoger = await punteroDe(e, m);

      // 17/10 06:00 — el corte.
      const corte = await e.correrCorte(new Date(), [m]);
      const trasCorte = { estado: await e.estadoDe(blst.ordenId), puntero: await punteroDe(e, m) };
      const vencido = await e.tx.cierreDia.findFirst({
        where: { mensajeroId: m, estado: "vencido" },
        select: { id: true },
      });
      if (vencido === null) throw new Error(`el corte no creo el vencido: ${JSON.stringify(corte)}`);

      // 19/10 15:50 — re-solicitud y aprobacion del cierre.
      const resolicitud = await e.solicitarCierre();
      const aprobacion = await e.aprobar(vencido.id);
      const final = {
        estado: await e.estadoDe(blst.ordenId),
        mensajero: (await e.ordenDe(blst.ordenId)).mensajeroAsignadoId,
        puntero: await punteroDe(e, m),
      };

      // El dia siguiente: Reparto y escoger otra orden suya.
      const otraHoy = await e.sembrarOrden({ estatus: "en_reparto" });
      const reparto = await e.s.misAsignaciones.listarMisAsignaciones(e.actorMensajero);
      const escogerOtra = await e.s.misAsignaciones.escogerParaGestion(otraHoy.ordenId, e.actorMensajero);
      return {
        blst: blst.ordenId,
        otra: otra.ordenId,
        otraHoy: otraHoy.ordenId,
        escogida,
        punteroTrasEscoger,
        trasCorte,
        resolicitud,
        aprobacion,
        final,
        reparto,
        escogerOtra,
        punteroFinal: await punteroDe(e, m),
      };
    });
  }

  function heredado() {
    return conEscenario(mundo, async (e) => {
      const vieja = await e.sembrarOrden({ estatus: "en_bodega_central", mensajeroId: null });
      const suya = await e.sembrarOrden({ estatus: "en_reparto" });
      await plantarPuntero(e, e.mensajeroId, vieja.ordenId);
      const reparto = await e.s.misAsignaciones.listarMisAsignaciones(e.actorMensajero);
      const punteroTrasListar = await punteroDe(e, e.mensajeroId);
      const escoger = await e.s.misAsignaciones.escogerParaGestion(suya.ordenId, e.actorMensajero);
      return {
        vieja: vieja.ordenId,
        suya: suya.ordenId,
        reparto,
        punteroTrasListar,
        escoger,
        puntero: await punteroDe(e, e.mensajeroId),
      };
    });
  }

  beforeAll(async () => {
    mundo = await prepararMundo();
    inc = await incidente();
    her = await heredado();
  }, 180_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  it("anti-vacuidad: el puntero se fijo por «Gestionar pedido» y la orden recorrio corte y aprobacion", () => {
    expect(inc.escogida).toEqual({ status: "ok", ordenId: inc.blst });
    expect(inc.punteroTrasEscoger).toBe(inc.blst);
    expect(inc.trasCorte.estado).toBe("novedad_interna");
    expect(inc.resolicitud).toEqual({ status: "ok", via: "resolicitado" });
    expect(inc.aprobacion).toMatchObject({ status: "ok" });
    expect(inc.final.estado).toBe("en_bodega_central");
    expect(inc.final.mensajero).toBeNull();
  });

  it("R15: el corte ya suelta el puntero (raiz), y tras la aprobacion sigue sin orden en gestion", () => {
    expect(inc.trasCorte.puntero).toBeNull();
    expect(inc.final.puntero).toBeNull();
  });

  it("R15: su Reparto informa que no hay orden en gestion", () => {
    expect(inc.reparto.status).toBe("ok");
    if (inc.reparto.status !== "ok") return;
    expect(inc.reparto.ordenEnGestionId).toBeNull();
    expect(inc.reparto.porGestionar.map((o) => o.id)).toContain(inc.otraHoy);
  });

  it("R15: puede escoger cualquier otra orden gestionable suya", () => {
    expect(inc.escogerOtra).toEqual({ status: "ok", ordenId: inc.otraHoy });
    expect(inc.punteroFinal).toBe(inc.otraHoy);
  });

  it("heredado (R9): un puntero colgado de antes del despliegue no se publica en Reparto, y listar no lo escribe", () => {
    expect(her.reparto.status).toBe("ok");
    if (her.reparto.status !== "ok") return;
    expect(her.reparto.ordenEnGestionId).toBeNull();
    // R10: la lectura no lo limpio — sigue ahi hasta el siguiente «Gestionar pedido».
    expect(her.punteroTrasListar).toBe(her.vieja);
  });

  it("heredado (R11): escoger una orden suya lo sustituye y responde ok", () => {
    expect(her.escoger).toEqual({ status: "ok", ordenId: her.suya });
    expect(her.puntero).toBe(her.suya);
  });
});
