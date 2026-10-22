import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Mundo } from "./454/_escenario";
import { gestionDe } from "./_correccion-477";

/**
 * FICHA 477 (T4.6; R23, R24) — DE EXTREMO A EXTREMO contra Postgres, con los servicios REALES:
 * gestion `entregado` en el cierre -> rechazo -> deshacer -> rehacer como `reprogramado` ->
 * re-solicitar -> APROBAR.
 *
 *   R23  el dinero y el estado de las ordenes salen de las gestiones VIGENTES vinculadas: la anulada
 *        no produce ni un movimiento (ni el COD de 10.000, ni el pago al mensajero de su entrega) ni
 *        una transicion; la orden termina `reprogramado`.
 *   R24  la anulada no cuenta como intento; la rehecha cuenta uno al aprobarse su cierre.
 *
 * ESTE es el test que cae con la alternativa A1 (conservar `cierre_id` en la anulada): los feeds de
 * la aprobacion leen `gestion_orden WHERE cierre_id = X` sin filtrar anuladas, y cobrarian la
 * entrega deshecha. Contraprueba anotada en `progress/impl_477.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("477/T4.6 — aprobar un cierre rechazado y corregido (Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
  });
  afterAll(async () => {
    await mundo.prisma.$disconnect();
  });

  it("R23/R24: el dinero, el estado y los intentos salen de las vigentes; la anulada no existe", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const corr = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 10000 });
      const otra = await e.sembrarOrden({ estatus: "en_reparto", montoCobrar: 4000 });
      // Un intento ANTERIOR de la orden corregida (cierre aprobado de otro dia).
      await e.sembrarIntentoPasado(corr.ordenId, { resultado: "reprogramado" });
      const intentosPrevios = await e.s.historialService.contarIntentos(corr.ordenId);

      const gEnt = await e.gestionarOk(corr.ordenId, "entregado", { monto: 10000 });
      await e.gestionarOk(otra.ordenId, "entregado", { monto: 4000 });
      const x = await e.solicitarCierreOk();
      await e.rechazar(x);
      const des = await e.s.cierreDia.deshacerGestion(gEnt, e.actorMensajero);
      const gRep = await e.gestionarOk(corr.ordenId, "reprogramado");
      const resolicitud = await e.s.cierreDia.solicitarCierre(e.actorMensajero);
      const aprobacion = await e.aprobar(x);

      // Las categorias son enums DISTINTOS por libro: se lee todo lo del cierre y se filtra aqui.
      const movimientos = async (categorias: string[]) => {
        const sel = { select: { categoria: true, monto: true }, where: { origenId: x } } as const;
        const filas = [
          ...(await e.tx.walletMovimiento.findMany(sel)),
          ...(await e.tx.walletTiendaMovimiento.findMany(sel)),
          ...(await e.tx.pagoMensajeroMovimiento.findMany(sel)),
        ];
        return filas
          .filter((m) => categorias.includes(m.categoria))
          .map((m) => `${m.categoria}|${m.monto.toFixed(2)}`)
          .sort();
      };

      return {
        des: des.status,
        resolicitud,
        aprobacion: aprobacion.status,
        intentosPrevios,
        intentos: await e.s.historialService.contarIntentos(corr.ordenId),
        estadoCorr: await e.estadoDe(corr.ordenId),
        estadoOtra: await e.estadoDe(otra.ordenId),
        gEnt: await gestionDe(e, gEnt),
        gRep: await gestionDe(e, gRep),
        x,
        cod: await movimientos(["ingreso_cod_recaudado", "cod_recaudado"]),
        pagoMensajero: await movimientos(["egreso_pago_mensajero", "pago_devengado"]),
        // La anulada no se aplica: ninguna fila de historial la enlaza.
        historialAnulada: await e.tx.ordenHistorialEstado.count({ where: { gestionOrdenId: gEnt } }),
        historialRehecha: await e.tx.ordenHistorialEstado.count({ where: { gestionOrdenId: gRep } }),
      };
    });

    // Anti-vacuidad: el recorrido entero ocurrio.
    expect(r.des).toBe("ok");
    expect(r.resolicitud).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.aprobacion).toBe("ok");
    expect(r.intentosPrevios).toBe(1);

    // R23: dinero SOLO de la otra entrega (4.000 y su pago); de la anulada, nada.
    expect(r.cod).toEqual(["cod_recaudado|4000.00", "ingreso_cod_recaudado|4000.00"]);
    expect(r.pagoMensajero).toEqual(["egreso_pago_mensajero|1500.00", "pago_devengado|1500.00"]);
    // R23: estados por las vigentes.
    expect(r.estadoCorr).toBe("reprogramado");
    expect(r.estadoOtra).toBe("entregado");
    expect(r.gEnt).toMatchObject({ cierreId: null, anulada: true });
    expect(r.gRep).toMatchObject({ cierreId: r.x, anulada: false });
    expect(r.historialAnulada).toBe(0);
    expect(r.historialRehecha).toBeGreaterThan(0);
    // R24: el previo + la rehecha. La anulada no suma.
    expect(r.intentos).toBe(2);
  });
});
