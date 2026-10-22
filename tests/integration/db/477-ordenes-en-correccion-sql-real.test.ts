import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Escenario, type Mundo } from "./454/_escenario";
import { ordenesEnCorreccion } from "@/lib/repositories/correccion-cierre";

/**
 * FICHA 477 (T1.3; D2, R12, R16) — EL PREDICADO UNICO DE «ORDEN EN CORRECCION», contra Postgres.
 *
 * Una orden esta en correccion de X si tiene fila en `cierre_detail` de X, X es un `rechazado` del
 * mensajero que pregunta, y no tiene ninguna gestion VIGENTE vinculada a X. Cada caso de abajo
 * existe para que quitar UNA condicion del `WHERE` ponga rojo al menos un caso:
 *
 *   - `estado = 'rechazado'`       -> entrarian las de un `solicitado`/`vencido`/`aprobado`.
 *   - `mensajero_id = $actor`      -> entraria la del rechazado del OTRO mensajero.
 *   - `g.cierre_id = cd.cierre_id` -> saldria la orden con una gestion rehecha SIN cierre.
 *   - `g.orden_id = cd.orden_id`   -> saldria la orden sin gestion (su vecina tiene una vigente).
 *   - `g.anulada_at IS NULL`       -> saldria la orden cuya unica gestion en X esta anulada.
 *
 * Contraprueba anotada en `progress/impl_477.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Un cierre sembrado a mano, en el estado pedido, de `mensajeroId`. */
async function sembrarCierre(e: Escenario, mensajeroId: string, estado: "solicitado" | "aprobado" | "rechazado" | "vencido") {
  const c = await e.tx.cierreDia.create({
    data: { mensajeroId, estado, destinoTipo: "bodega_satelite", destinoZonaId: e.zonaSateliteId },
    select: { id: true },
  });
  return c.id;
}

/** La fila de `cierre_detail` de (cierre, orden), con descriptivos minimos validos. */
async function sembrarDetalle(e: Escenario, cierreId: string, ordenId: string) {
  await e.tx.cierreDetail.create({
    data: {
      cierreId,
      ordenId,
      cobraComision: false,
      zonaId: e.mundo.centralZonaId,
      tiendaId: e.tiendaId,
      esCentral: true,
      numRemision: `R-${ordenId.slice(0, 8)}`,
      destinatario: "Dest 477",
      producto: "Prod 477",
      tiendaNombre: "Tienda 477",
      zonaNombre: "Zona 477",
      provinciaNombre: "Provincia",
      cantonNombre: "Canton",
    },
  });
}

async function sembrarGestion(
  e: Escenario,
  ordenId: string,
  opts: { cierreId: string | null; anulada?: boolean; mensajeroId?: string },
) {
  const g = await e.tx.gestionOrden.create({
    data: {
      ordenId,
      mensajeroId: opts.mensajeroId ?? e.mensajeroId,
      resultado: "reprogramado",
      cierreId: opts.cierreId,
      anuladaAt: opts.anulada ? new Date() : null,
    },
    select: { id: true },
  });
  return g.id;
}

describeSiHayBase("477/T1.3 — ordenes en correccion (predicado unico, Postgres real)", () => {
  let mundo: Mundo;

  beforeAll(async () => {
    mundo = await prepararMundo();
  });
  afterAll(async () => {
    await mundo.prisma.$disconnect();
  });

  it("D2: entra SOLO la orden de un rechazado propio sin gestion vigente en el", async () => {
    const r = await conEscenario(mundo, async (e) => {
      const orden = async () => (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
      const x = await sembrarCierre(e, e.mensajeroId, "rechazado");
      // EN correccion de X:
      const sinGestion = await orden(); // gestion deshecha (D1): sin nada vinculado a X
      await sembrarDetalle(e, x, sinGestion);
      const rehecha = await orden(); // la rehecha nace SIN cierre (R14): sigue en correccion
      await sembrarDetalle(e, x, rehecha);
      await sembrarGestion(e, rehecha, { cierreId: null });
      const anuladaEnX = await orden(); // anulada que conservara el vinculo: no cuenta como vigente
      await sembrarDetalle(e, x, anuladaEnX);
      await sembrarGestion(e, anuladaEnX, { cierreId: x, anulada: true });
      // NO en correccion:
      const vigenteEnX = await orden(); // conserva su gestion vigente en X
      await sembrarDetalle(e, x, vigenteEnX);
      await sembrarGestion(e, vigenteEnX, { cierreId: x });
      const porEstado: Record<string, string> = {};
      for (const estado of ["solicitado", "vencido", "aprobado"] as const) {
        const c = await sembrarCierre(e, e.mensajeroId, estado);
        const o = await orden();
        await sembrarDetalle(e, c, o);
        porEstado[estado] = o;
      }
      const ajena = await orden(); // rechazado del OTRO mensajero, sin gestion
      const y = await sembrarCierre(e, e.mensajero2Id, "rechazado");
      await sembrarDetalle(e, y, ajena);

      const todas = [sinGestion, rehecha, anuladaEnX, vigenteEnX, ...Object.values(porEstado), ajena];
      const enCorreccion = await e.s.ordenRepo.findOrdenesEnCorreccion(e.mensajeroId, todas);
      const delOtro = await e.s.ordenRepo.findOrdenesEnCorreccion(e.mensajero2Id, todas);
      const soloX = await ordenesEnCorreccion(e.tx, { mensajeroId: e.mensajeroId, cierreId: x });
      const otroCierre = await ordenesEnCorreccion(e.tx, { mensajeroId: e.mensajeroId, cierreId: y });
      const filasDetalle = await e.tx.cierreDetail.count({ where: { ordenId: { in: todas } } });
      return {
        x,
        sinGestion,
        rehecha,
        anuladaEnX,
        ajena,
        filasDetalle,
        enCorreccion: [...enCorreccion].sort(),
        delOtro: [...delOtro].sort(),
        soloX: soloX.map((f) => `${f.cierreId}:${f.ordenId}`).sort(),
        otroCierre,
        vacio: await e.s.ordenRepo.findOrdenesEnCorreccion(e.mensajeroId, []),
      };
    });

    // Anti-vacuidad: las 8 filas sembradas existen (4 en X, 3 en otros estados, 1 ajena).
    expect(r.filasDetalle).toBe(8);
    expect(r.enCorreccion).toEqual([r.sinGestion, r.rehecha, r.anuladaEnX].sort());
    expect(r.soloX).toEqual([r.sinGestion, r.rehecha, r.anuladaEnX].map((o) => `${r.x}:${o}`).sort());
    // El otro mensajero solo ve SU rechazado.
    expect(r.delOtro).toEqual([r.ajena]);
    // El filtro por cierre estrecha: el rechazado ajeno no es de este mensajero.
    expect(r.otroCierre).toEqual([]);
    // Lista vacia: conjunto vacio (y sin `IN ()`, que no es SQL valido).
    expect(r.vacio).toEqual(new Set());
  });
});
