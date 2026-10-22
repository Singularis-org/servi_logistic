import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { reintentosConfig } from "@/lib/config/reintentos";
import { HAY_BASE_DE_DATOS, RegistroCaido, clienteConSavepoint } from "./_postgres-real";
import { conEscenario, diaCR, montarServicios, prepararMundo, type Mundo } from "./454/_escenario";
import {
  filaUsuario,
  librosDeDinero,
  plantarPuntero,
  punteroDe,
  sinPunteroNiSello,
} from "./_puntero-484";

/**
 * FICHA 484 (T2; R3, R4, R5, R8) — LA APROBACION DEL CIERRE SUELTA EL PUNTERO «ORDEN EN GESTION»
 * de las ordenes barridas que libera a bodega o termina por tope, contra Postgres real.
 *
 * Segundo paso del incidente BLST-765: la aprobacion devolvio la orden a `en_bodega_central` sin
 * mensajero y tampoco toco el puntero. Aqui los punteros se PLANTAN despues del corte (como los que
 * quedaron de antes del despliegue) y se aprueba por el SERVICIO real.
 *
 * Corpus de M: OLib (se libera a bodega), OTope (con tantos intentos como el umbral: termina en
 * `rechazada` y de ahi a `por_devolver*`), ORes (reservada, ni la barre el corte ni la toca la
 * aprobacion). Y de otro mensajero, OVieja ya en `sin_gestionar` que no es de este cierre.
 *
 * Tres corridas: con punteros, sin punteros (neutralidad, R8) y con punteros pero con la
 * aprobacion FALLANDO dentro de su transaccion (R5: el registro de acciones se rompe a proposito
 * DESPUES de la liberacion, con un SAVEPOINT real que revierte todo).
 *
 * Mutaciones registradas en `progress/impl_484.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;
const UMBRAL = reintentosConfig.MIN_INTENTOS_ENTREGA;

type Modo = "aprobar" | "sin_punteros" | "falla";

describeSiHayBase("484/T2 — la aprobacion suelta el puntero de lo que libera o termina (Postgres real)", () => {
  let mundo: Mundo;
  const r = {} as Record<Modo, Awaited<ReturnType<typeof correr>>>;

  function correr(modo: Modo) {
    return conEscenario(mundo, async (e) => {
      const m = e.mensajeroId;
      const oLib = await e.sembrarOrden({ estatus: "en_reparto" });
      const oTope = await e.sembrarOrden({ estatus: "en_reparto" });
      for (let i = 0; i < UMBRAL; i++) {
        await e.sembrarIntentoPasado(oTope.ordenId, {
          en: new Date(Date.UTC(2026, 8, 1 + i, 16)),
        });
      }
      const oRes = await e.sembrarOrden({ estatus: "en_reparto", fechaReparto: diaCR(5) });
      const oVieja = await e.sembrarOrden({ estatus: "novedad_interna", mensajeroId: e.mensajero2Id });
      // Ya en los estados DESTINO de cada rama, pero de fuera de este cierre: sus punteros los
      // protege `ordenEnGestionId IN ids`, no la guarda de destino.
      const oBodegaAjena = await e.sembrarOrden({ estatus: "en_bodega_central", mensajeroId: null });
      const oDevolucionAjena = await e.sembrarOrden({
        estatus: "devolucion_a_origen_por_rechazo",
        mensajeroId: e.mensajero2Id,
      });

      const corte = await e.correrCorte(new Date(), [m]);
      const vencido = await e.tx.cierreDia.findFirst({
        where: { mensajeroId: m, estado: "vencido" },
        select: { id: true },
      });
      if (vencido === null) throw new Error(`el corte no creo el vencido: ${JSON.stringify(corte)}`);
      const trasCorte = { oLib: await e.estadoDe(oLib.ordenId), oTope: await e.estadoDe(oTope.ordenId) };

      const testigos = {
        lib: await e.crearUsuario("mensajero", e.zonaSateliteId),
        tope: await e.crearUsuario("mensajero", e.zonaSateliteId),
        res: await e.crearUsuario("mensajero", e.zonaSateliteId),
        vieja: await e.crearUsuario("mensajero", e.zonaSateliteId),
        bodega: await e.crearUsuario("mensajero", e.zonaSateliteId),
        devolucion: await e.crearUsuario("mensajero", e.zonaSateliteId),
      };
      if (modo !== "sin_punteros") {
        await plantarPuntero(e, m, oLib.ordenId);
        await plantarPuntero(e, testigos.lib, oLib.ordenId);
        await plantarPuntero(e, testigos.tope, oTope.ordenId);
        await plantarPuntero(e, testigos.res, oRes.ordenId);
        await plantarPuntero(e, testigos.vieja, oVieja.ordenId);
        await plantarPuntero(e, testigos.bodega, oBodegaAjena.ordenId);
        await plantarPuntero(e, testigos.devolucion, oDevolucionAjena.ordenId);
      }

      const resolicitud = await e.solicitarCierre();
      const ids = [oLib, oTope, oRes, oVieja].map((o) => o.ordenId);
      const antes = {
        filaM: await filaUsuario(e, m),
        filasTestigo: {
          res: await filaUsuario(e, testigos.res),
          vieja: await filaUsuario(e, testigos.vieja),
        },
        historial: await e.tx.ordenHistorialEstado.count({ where: { ordenId: { in: ids } } }),
        libros: await librosDeDinero(e, ids),
      };

      let aprobacion: unknown;
      let error: string | null = null;
      if (modo === "falla") {
        const roto = montarServicios(clienteConSavepoint(e.tx, true));
        const alcance = { destinoTipo: "bodega_satelite" as const, destinoZonaId: e.zonaSateliteId };
        const confirmacion = await e.confirmacionDe(vencido.id, alcance);
        try {
          aprobacion = await roto.cierresAdmin.aprobarCierre(vencido.id, e.actorAdminSatelite, [], confirmacion);
        } catch (err) {
          error = err instanceof RegistroCaido ? "RegistroCaido" : String(err);
        }
      } else {
        aprobacion = await e.aprobar(vencido.id);
      }

      const cierre = await e.tx.cierreDia.findUniqueOrThrow({
        where: { id: vencido.id },
        select: {
          estado: true,
          totalEfectivo: true,
          totalSimpe: true,
          totalTransferencia: true,
          totalGeneral: true,
          totalPagoMensajero: true,
          totalIngresoBodegaRechazos: true,
        },
      });
      return {
        trasCorte,
        resolicitud,
        aprobacion,
        error,
        antes,
        cierre: Object.fromEntries(Object.entries(cierre).map(([k, v]) => [k, String(v)])),
        estados: {
          oLib: await e.estadoDe(oLib.ordenId),
          oTope: await e.estadoDe(oTope.ordenId),
          oRes: await e.estadoDe(oRes.ordenId),
        },
        mensajeroDeOLib: (await e.ordenDe(oLib.ordenId)).mensajeroAsignadoId,
        punteros: {
          m: await punteroDe(e, m),
          lib: await punteroDe(e, testigos.lib),
          tope: await punteroDe(e, testigos.tope),
          res: await punteroDe(e, testigos.res),
          vieja: await punteroDe(e, testigos.vieja),
          bodega: await punteroDe(e, testigos.bodega),
          devolucion: await punteroDe(e, testigos.devolucion),
        },
        esperados: {
          lib: oLib.ordenId,
          tope: oTope.ordenId,
          res: oRes.ordenId,
          vieja: oVieja.ordenId,
          bodega: oBodegaAjena.ordenId,
          devolucion: oDevolucionAjena.ordenId,
        },
        estadosAjenas: {
          bodega: await e.estadoDe(oBodegaAjena.ordenId),
          devolucion: await e.estadoDe(oDevolucionAjena.ordenId),
        },
        filaM: await filaUsuario(e, m),
        filasTestigo: {
          res: await filaUsuario(e, testigos.res),
          vieja: await filaUsuario(e, testigos.vieja),
        },
        deltaHistorial:
          (await e.tx.ordenHistorialEstado.count({ where: { ordenId: { in: ids } } })) - antes.historial,
        librosDespues: await librosDeDinero(e, ids),
      };
    });
  }

  beforeAll(async () => {
    mundo = await prepararMundo();
    r.aprobar = await correr("aprobar");
    r.sin_punteros = await correr("sin_punteros");
    r.falla = await correr("falla");
  }, 240_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  it("anti-vacuidad: el corte barrio OLib y OTope, se re-solicito y la aprobacion fue ok", () => {
    expect(r.aprobar.trasCorte).toEqual({ oLib: "novedad_interna", oTope: "novedad_interna" });
    expect(r.aprobar.resolicitud).toEqual({ status: "ok", via: "resolicitado" });
    expect(r.aprobar.aprobacion).toMatchObject({ status: "ok" });
    expect(r.aprobar.cierre.estado).toBe("aprobado");
  });

  it("R3: la orden liberada a bodega queda sin mensajero y sus punteros (el de M y el ajeno) quedan NULL", () => {
    expect(r.aprobar.estados.oLib).toBe("en_bodega_central");
    expect(r.aprobar.mensajeroDeOLib).toBeNull();
    expect(r.aprobar.punteros.m).toBeNull();
    expect(r.aprobar.punteros.lib).toBeNull();
  });

  it("R4: la orden terminada por tope queda fuera de bodega y su puntero queda NULL", () => {
    expect(r.aprobar.estados.oTope).toBe("por_devolver_a_tienda");
    expect(r.aprobar.punteros.tope).toBeNull();
  });

  it("R5: los punteros a ordenes que la aprobacion no libera ni termina quedan intactos", () => {
    expect(r.aprobar.estados.oRes).toBe("en_reparto");
    expect(r.aprobar.punteros.res).toBe(r.aprobar.esperados.res);
    // La `sin_gestionar` de OTRO cierre ya estaba en el estado de origen de la liberacion.
    expect(r.aprobar.punteros.vieja).toBe(r.aprobar.esperados.vieja);
    // Y los que apuntan a ordenes AJENAS que ya estaban en el destino de cada rama.
    expect(r.aprobar.estadosAjenas).toEqual({
      bodega: "en_bodega_central",
      devolucion: "devolucion_a_origen_por_rechazo",
    });
    expect(r.aprobar.punteros.bodega).toBe(r.aprobar.esperados.bodega);
    expect(r.aprobar.punteros.devolucion).toBe(r.aprobar.esperados.devolucion);
    expect(r.aprobar.filasTestigo).toEqual(r.aprobar.antes.filasTestigo);
  });

  it("R5: si la aprobacion no llega a confirmarse, NINGUN puntero cambia", () => {
    // Anti-vacuidad del fallo: la transaccion de la aprobacion SI lanzo, y se revirtio entera.
    expect(r.falla.error).toBe("RegistroCaido");
    expect(r.falla.cierre.estado).toBe("solicitado");
    expect(r.falla.estados).toMatchObject({ oLib: "novedad_interna", oTope: "novedad_interna" });
    const { esperados } = r.falla;
    expect(r.falla.punteros).toEqual({
      m: esperados.lib,
      lib: esperados.lib,
      tope: esperados.tope,
      res: esperados.res,
      vieja: esperados.vieja,
      bodega: esperados.bodega,
      devolucion: esperados.devolucion,
    });
  });

  it("R8: en la fila de M solo cambia el puntero (y el sello `updated_at` de Prisma)", () => {
    expect(sinPunteroNiSello(r.aprobar.filaM)).toEqual(sinPunteroNiSello(r.aprobar.antes.filaM));
  });

  it("R8: mismo historial, mismos totales del cierre y mismos libros de dinero que SIN punteros", () => {
    expect(r.sin_punteros.aprobacion).toMatchObject({ status: "ok" });
    expect(r.aprobar.deltaHistorial).toBe(r.sin_punteros.deltaHistorial);
    expect(r.aprobar.cierre).toEqual(r.sin_punteros.cierre);
    const delta = (x: typeof r.aprobar) => ({
      caja: x.librosDespues.caja - x.antes.libros.caja,
      tienda: x.librosDespues.tienda - x.antes.libros.tienda,
      mensajero: x.librosDespues.mensajero - x.antes.libros.mensajero,
    });
    expect(delta(r.aprobar)).toEqual(delta(r.sin_punteros));
    expect(r.aprobar.estados).toEqual(r.sin_punteros.estados);
  });
});
