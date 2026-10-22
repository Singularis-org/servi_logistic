import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "./_postgres-real";
import { conEscenario, prepararMundo, type Escenario, type Mundo } from "./454/_escenario";
import { plantarPuntero, punteroDe } from "./_puntero-484";

/**
 * FICHA 484 (T7a; R9, R11, R12, R13, R14) — EL PREDICADO DE «PUNTERO VIGENTE», contra Postgres real.
 *
 * Vigente ⇔ la orden apuntada esta `en_reparto`, asignada a ESE mensajero, no borrada y sin gestion
 * pendiente de confirmar. Se mide en sus dos consumidores de `GestionOrdenRepository`:
 *   - `getOrdenEnGestion` (lectura): un colgado se lee `null` (R9, y la lectura que alimenta R13);
 *   - `setOrdenEnGestion` (tercera rama del `where`): un colgado se SUSTITUYE (R11), uno vigente
 *     a otra orden sigue en conflicto (R12), y NULL / igual siguen funcionando (36/R19-R21).
 * Y de punta a punta por el SERVICIO real: escoger y gestionar con un colgado (R11, R13) y con
 * uno vigente a otra orden (R12, R14).
 *
 * Cada causa de «colgado» es su propio caso: quitar UNA condicion del predicado pone rojo el suyo.
 * Mutaciones registradas en `progress/impl_484.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Causa =
  | "vigente"
  | "con_ayuda"
  | "estado"
  | "barrida"
  | "otro_mensajero"
  | "borrada"
  | "pendiente";

/** Siembra la orden a la que apuntara el puntero de M, en la condicion pedida. */
async function apuntada(e: Escenario, causa: Causa): Promise<string> {
  switch (causa) {
    case "vigente":
      return (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
    case "con_ayuda": {
      const o = await e.sembrarOrden({ estatus: "en_reparto" });
      const ayuda = await e.pedirAyuda(o.ordenId);
      if (ayuda.status !== "ok") throw new Error(`pedirAyuda: ${JSON.stringify(ayuda)}`);
      return o.ordenId;
    }
    case "estado":
      return (await e.sembrarOrden({ estatus: "en_bodega_central", mensajeroId: null })).ordenId;
    case "barrida":
      // El estado intermedio del incidente: el corte la paso a `sin_gestionar` CONSERVANDO el
      // mensajero. Solo la condicion de estado la distingue de una vigente.
      return (await e.sembrarOrden({ estatus: "novedad_interna" })).ordenId;
    case "otro_mensajero":
      return (await e.sembrarOrden({ estatus: "en_reparto", mensajeroId: e.mensajero2Id })).ordenId;
    case "borrada": {
      const o = await e.sembrarOrden({ estatus: "en_reparto" });
      await e.tx.orden.update({ where: { id: o.ordenId }, data: { deletedAt: new Date() } });
      return o.ordenId;
    }
    case "pendiente": {
      const o = await e.sembrarOrden({ estatus: "en_reparto" });
      await e.gestionarOk(o.ordenId, "devolucion_a_origen_por_rechazo");
      return o.ordenId;
    }
  }
}

const COLGADAS: Causa[] = ["estado", "barrida", "otro_mensajero", "borrada", "pendiente"];
const CAUSAS: Causa[] = ["vigente", "con_ayuda", ...COLGADAS];

describeSiHayBase("484/T7a — el puntero vigente en el repositorio (Postgres real)", () => {
  let mundo: Mundo;
  const lectura = {} as Record<Causa, { apuntada: string; leido: string | null; listado: string | null }>;
  const escritura = {} as Record<
    Causa,
    { apuntada: string; nueva: string; fijada: boolean; puntero: string | null }
  >;
  let nulo: { fijada: boolean; puntero: string | null; nueva: string };
  let igual: { fijada: boolean; puntero: string | null; apuntada: string };
  let servicio: {
    colgado: { escoger: unknown; gestionar: unknown; nueva: string; puntero: string | null };
    vigente: {
      escoger: unknown;
      gestionar: unknown;
      apuntada: string;
      puntero: string | null;
      gestionesDeLaNueva: number;
    };
  };

  beforeAll(async () => {
    mundo = await prepararMundo();

    for (const causa of CAUSAS) {
      // Lectura: `getOrdenEnGestion` y lo que Reparto publica con ese mismo puntero.
      lectura[causa] = await conEscenario(mundo, async (e) => {
        const id = await apuntada(e, causa);
        await plantarPuntero(e, e.mensajeroId, id);
        const listado = await e.s.misAsignaciones.listarMisAsignaciones(e.actorMensajero);
        return {
          apuntada: id,
          leido: await e.s.gestionRepo.getOrdenEnGestion(e.mensajeroId),
          listado: listado.status === "ok" ? listado.ordenEnGestionId : `status:${listado.status}`,
        };
      });
      // Escritura: `setOrdenEnGestion` hacia OTRA orden gestionable de M.
      escritura[causa] = await conEscenario(mundo, async (e) => {
        const id = await apuntada(e, causa);
        const nueva = (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
        await plantarPuntero(e, e.mensajeroId, id);
        const fijada = await e.s.gestionRepo.setOrdenEnGestion(e.mensajeroId, nueva);
        return { apuntada: id, nueva, fijada, puntero: await punteroDe(e, e.mensajeroId) };
      });
    }

    nulo = await conEscenario(mundo, async (e) => {
      const nueva = (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
      await plantarPuntero(e, e.mensajeroId, null);
      const fijada = await e.s.gestionRepo.setOrdenEnGestion(e.mensajeroId, nueva);
      return { fijada, puntero: await punteroDe(e, e.mensajeroId), nueva };
    });
    igual = await conEscenario(mundo, async (e) => {
      const id = await apuntada(e, "vigente");
      await plantarPuntero(e, e.mensajeroId, id);
      const fijada = await e.s.gestionRepo.setOrdenEnGestion(e.mensajeroId, id);
      return { fijada, puntero: await punteroDe(e, e.mensajeroId), apuntada: id };
    });

    // De punta a punta por el servicio real: escoger + gestionar otra orden.
    const colgado = await conEscenario(mundo, async (e) => {
      const vieja = await apuntada(e, "estado");
      const nueva = (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
      await plantarPuntero(e, e.mensajeroId, vieja);
      const escoger = await e.s.misAsignaciones.escogerParaGestion(nueva, e.actorMensajero);
      // `gestionar` con el puntero colgado de nuevo (sin pasar por escoger), para medir R13 solo.
      await plantarPuntero(e, e.mensajeroId, vieja);
      const gestionar = await e.gestionar(nueva, "devolucion_a_origen_por_rechazo", { escoger: false });
      return { escoger, gestionar, nueva, puntero: await punteroDe(e, e.mensajeroId) };
    });
    const vigente = await conEscenario(mundo, async (e) => {
      const activa = await apuntada(e, "vigente");
      const nueva = (await e.sembrarOrden({ estatus: "en_reparto" })).ordenId;
      await plantarPuntero(e, e.mensajeroId, activa);
      const escoger = await e.s.misAsignaciones.escogerParaGestion(nueva, e.actorMensajero);
      const gestionar = await e.gestionar(nueva, "devolucion_a_origen_por_rechazo", { escoger: false });
      return {
        escoger,
        gestionar,
        apuntada: activa,
        puntero: await punteroDe(e, e.mensajeroId),
        gestionesDeLaNueva: (await e.gestionesDe(nueva)).length,
      };
    });
    servicio = { colgado, vigente };
  }, 240_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  describe("getOrdenEnGestion (R9, R13)", () => {
    it("vigente: devuelve el id, y Reparto lo publica", () => {
      expect(lectura.vigente.leido).toBe(lectura.vigente.apuntada);
      expect(lectura.vigente.listado).toBe(lectura.vigente.apuntada);
    });

    it("con ayuda abierta sigue siendo vigente (esta en «con ayuda»)", () => {
      expect(lectura.con_ayuda.leido).toBe(lectura.con_ayuda.apuntada);
      expect(lectura.con_ayuda.listado).toBe(lectura.con_ayuda.apuntada);
    });

    for (const causa of COLGADAS) {
      it(`colgado por ${causa}: devuelve null, y Reparto publica null`, () => {
        expect(lectura[causa].apuntada).toEqual(expect.any(String));
        expect(lectura[causa].leido).toBeNull();
        expect(lectura[causa].listado).toBeNull();
      });
    }
  });

  describe("setOrdenEnGestion (R11, R12, 36/R19-R21)", () => {
    for (const causa of COLGADAS) {
      it(`R11 — colgado por ${causa}: lo sustituye por la orden escogida y responde true`, () => {
        expect(escritura[causa].fijada).toBe(true);
        expect(escritura[causa].puntero).toBe(escritura[causa].nueva);
      });
    }

    it("R12: vigente apuntando a otra orden → false y el puntero NO cambia", () => {
      expect(escritura.vigente.fijada).toBe(false);
      expect(escritura.vigente.puntero).toBe(escritura.vigente.apuntada);
    });

    it("R12: con ayuda abierta tambien es vigente → false y el puntero NO cambia", () => {
      expect(escritura.con_ayuda.fijada).toBe(false);
      expect(escritura.con_ayuda.puntero).toBe(escritura.con_ayuda.apuntada);
    });

    it("regresion 36: puntero NULL → true y queda fijado", () => {
      expect(nulo.fijada).toBe(true);
      expect(nulo.puntero).toBe(nulo.nueva);
    });

    it("regresion 36: puntero igual → true (idempotente) y sin cambios", () => {
      expect(igual.fijada).toBe(true);
      expect(igual.puntero).toBe(igual.apuntada);
    });
  });

  describe("de punta a punta por el servicio (R11-R14)", () => {
    it("R11: con el puntero colgado, escoger otra orden suya responde ok", () => {
      expect(servicio.colgado.escoger).toEqual({ status: "ok", ordenId: servicio.colgado.nueva });
    });

    it("R13: con el puntero colgado, registrar la gestion de otra orden NO se rechaza por «otra orden activa»", () => {
      expect(servicio.colgado.gestionar).toMatchObject({ status: "ok" });
      // Y el registro limpia el puntero en su propia tx, como siempre (registrarGestionPendiente).
      expect(servicio.colgado.puntero).toBeNull();
    });

    it("R12: con el puntero vigente a otra orden, escoger responde conflicto y no lo cambia", () => {
      expect(servicio.vigente.escoger).toEqual({ status: "conflict", motivo: "ya tienes otra orden en gestion" });
      expect(servicio.vigente.puntero).toBe(servicio.vigente.apuntada);
    });

    it("R14: con el puntero vigente a otra orden, gestionar responde conflicto y no persiste", () => {
      expect(servicio.vigente.gestionar).toEqual({
        status: "conflict",
        motivo: "tienes otra orden activa en gestion",
      });
      expect(servicio.vigente.gestionesDeLaNueva).toBe(0);
    });
  });
});
