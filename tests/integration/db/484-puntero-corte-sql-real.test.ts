import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, diaCR, prepararMundo, type Mundo } from "./454/_escenario";
import {
  filaUsuario,
  librosDeDinero,
  plantarPuntero,
  punteroDe,
  sinPunteroNiSello,
} from "./_puntero-484";

/**
 * FICHA 484 (T1; R1, R2, R8) — EL CORTE DIARIO SUELTA EL PUNTERO «ORDEN EN GESTION», contra
 * Postgres real.
 *
 * El incidente BLST-765: el corte paso a `sin_gestionar` la orden que el mensajero tenia «en
 * gestion» y NO toco `usuario.orden_en_gestion_id`. Aqui se mide la sentencia nueva de
 * `CierreDiaRepository.crearCierre` (bloque `corteSinGestionar`) por el corte REAL
 * (`CorteDiarioService`), dentro de una transaccion que SIEMPRE se revierte.
 *
 * El corpus: el mensajero M tiene O1 en mano (se barre), ORes reservada para dentro de 5 dias,
 * OPend con gestion pendiente de confirmar y ORecoger por recoger (las tres NO se barren); y otro
 * mensajero tiene OVieja, ya en `sin_gestionar` de antes. Los punteros se plantan en M y en
 * usuarios testigo. Se corre DOS veces —con y sin punteros— para medir la neutralidad (R8).
 *
 * Mutaciones registradas en `progress/impl_484.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("484/T1 — el corte suelta el puntero de la orden que barre (Postgres real)", () => {
  let mundo: Mundo;
  let con: Awaited<ReturnType<typeof correr>>;
  let sin: Awaited<ReturnType<typeof correr>>;

  function correr(conPunteros: boolean) {
    return conEscenario(mundo, async (e) => {
      const m = e.mensajeroId;
      const o1 = await e.sembrarOrden({ estatus: "en_reparto" });
      const oRes = await e.sembrarOrden({ estatus: "en_reparto", fechaReparto: diaCR(5) });
      const oPend = await e.sembrarOrden({ estatus: "en_reparto" });
      await e.gestionarOk(oPend.ordenId, "devolucion_a_origen_por_rechazo");
      const oRecoger = await e.sembrarOrden({ estatus: "mensajero_recogiendo_en_bodega" });
      const oVieja = await e.sembrarOrden({ estatus: "novedad_interna", mensajeroId: e.mensajero2Id });

      const testigos = {
        ajeno: await e.crearUsuario("mensajero", e.zonaSateliteId), // apunta a O1, y no es su dueño
        res: await e.crearUsuario("mensajero", e.zonaSateliteId),
        pend: await e.crearUsuario("mensajero", e.zonaSateliteId),
        recoger: await e.crearUsuario("mensajero", e.zonaSateliteId),
        vieja: await e.crearUsuario("mensajero", e.zonaSateliteId),
      };
      if (conPunteros) {
        await plantarPuntero(e, m, o1.ordenId);
        await plantarPuntero(e, testigos.ajeno, o1.ordenId);
        await plantarPuntero(e, testigos.res, oRes.ordenId);
        await plantarPuntero(e, testigos.pend, oPend.ordenId);
        await plantarPuntero(e, testigos.recoger, oRecoger.ordenId);
        await plantarPuntero(e, testigos.vieja, oVieja.ordenId);
      }
      const ids = [o1, oRes, oPend, oRecoger, oVieja].map((o) => o.ordenId);

      const antes = {
        punteroM: await punteroDe(e, m),
        filaM: await filaUsuario(e, m),
        filasTestigo: {
          res: await filaUsuario(e, testigos.res),
          pend: await filaUsuario(e, testigos.pend),
          recoger: await filaUsuario(e, testigos.recoger),
          vieja: await filaUsuario(e, testigos.vieja),
        },
        historial: await e.tx.ordenHistorialEstado.count({ where: { ordenId: { in: ids } } }),
        libros: await librosDeDinero(e, ids),
      };

      const corte = await e.correrCorte(new Date(), [m]);

      const vencido = await e.tx.cierreDia.findFirst({
        where: { mensajeroId: m, estado: "vencido" },
        select: {
          id: true,
          totalEfectivo: true,
          totalSimpe: true,
          totalTransferencia: true,
          totalGeneral: true,
          totalPagoMensajero: true,
          totalIngresoBodegaRechazos: true,
        },
      });
      return {
        o1: o1.ordenId,
        corte,
        antes,
        estados: {
          o1: await e.estadoDe(o1.ordenId),
          oRes: await e.estadoDe(oRes.ordenId),
          oPend: await e.estadoDe(oPend.ordenId),
          oRecoger: await e.estadoDe(oRecoger.ordenId),
        },
        punteros: {
          m: await punteroDe(e, m),
          ajeno: await punteroDe(e, testigos.ajeno),
          res: await punteroDe(e, testigos.res),
          pend: await punteroDe(e, testigos.pend),
          recoger: await punteroDe(e, testigos.recoger),
          vieja: await punteroDe(e, testigos.vieja),
        },
        esperados: { res: oRes.ordenId, pend: oPend.ordenId, recoger: oRecoger.ordenId, vieja: oVieja.ordenId },
        filaM: await filaUsuario(e, m),
        filasTestigo: {
          res: await filaUsuario(e, testigos.res),
          pend: await filaUsuario(e, testigos.pend),
          recoger: await filaUsuario(e, testigos.recoger),
          vieja: await filaUsuario(e, testigos.vieja),
        },
        deltaHistorial:
          (await e.tx.ordenHistorialEstado.count({ where: { ordenId: { in: ids } } })) - antes.historial,
        librosDespues: await librosDeDinero(e, ids),
        barridas: vencido
          ? await e.tx.cierreSinGestion.count({ where: { cierreId: vencido.id } })
          : null,
        totales: vencido
          ? Object.fromEntries(
              Object.entries(vencido)
                .filter(([k]) => k !== "id")
                .map(([k, v]) => [k, String(v)]),
            )
          : null,
      };
    });
  }

  beforeAll(async () => {
    mundo = await prepararMundo();
    con = await correr(true);
    sin = await correr(false);
  }, 180_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  it("anti-vacuidad: el puntero de M estaba puesto y el corte creo el `vencido` barriendo O1", () => {
    expect(con.antes.punteroM).toBe(con.o1);
    expect(con.corte.vencidosCreados).toBe(1);
    expect(con.estados.o1).toBe("novedad_interna");
    expect(con.barridas).toBe(1);
  });

  it("R1: el puntero de M, que apuntaba a la orden barrida, queda NULL", () => {
    expect(con.punteros.m).toBeNull();
  });

  it("R1: tambien queda NULL el de OTRO usuario que apuntaba a esa misma orden", () => {
    expect(con.punteros.ajeno).toBeNull();
  });

  it("R2: no se tocan los punteros a ordenes que el corte NO transiciono", () => {
    // La reservada para otro dia, la de gestion pendiente y la por recoger siguen donde estaban…
    expect(con.estados).toMatchObject({ oRes: "en_reparto", oPend: "en_reparto", oRecoger: "mensajero_recogiendo_en_bodega" });
    // …y los punteros que las apuntan, intactos; tambien el que apunta a una `sin_gestionar` VIEJA,
    // que ya estaba en el estado destino pero no la movio ESTE corte.
    expect(con.punteros.res).toBe(con.esperados.res);
    expect(con.punteros.pend).toBe(con.esperados.pend);
    expect(con.punteros.recoger).toBe(con.esperados.recoger);
    expect(con.punteros.vieja).toBe(con.esperados.vieja);
  });

  it("R2: las filas de esos usuarios no cambian NI en una columna (ni siquiera `updated_at`)", () => {
    expect(con.filasTestigo).toEqual(con.antes.filasTestigo);
  });

  it("R8: en la fila de M solo cambia el puntero (y el sello `updated_at` de Prisma)", () => {
    expect(sinPunteroNiSello(con.filaM)).toEqual(sinPunteroNiSello(con.antes.filaM));
    expect(con.filaM.ordenEnGestionId).toBeNull();
  });

  it("R8: mismas filas de historial, mismo vinculo y mismos totales que una corrida SIN puntero", () => {
    expect(sin.corte.vencidosCreados).toBe(1);
    expect(con.deltaHistorial).toBe(sin.deltaHistorial);
    expect(con.barridas).toBe(sin.barridas);
    expect(con.totales).toEqual(sin.totales);
  });

  it("R8: ningun libro de dinero recibe una fila que la corrida sin puntero no reciba", () => {
    const delta = (r: typeof con) => ({
      caja: r.librosDespues.caja - r.antes.libros.caja,
      tienda: r.librosDespues.tienda - r.antes.libros.tienda,
      mensajero: r.librosDespues.mensajero - r.antes.libros.mensajero,
    });
    expect(delta(con)).toEqual(delta(sin));
  });
});
