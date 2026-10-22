import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TraspasoMensajeroConflictoError } from "@/lib/interfaces/repositories/IOrdenRepository";
import { HAY_BASE_DE_DATOS, clienteConSavepoint } from "./_postgres-real";
import { conEscenario, prepararMundo, type Escenario, type Mundo } from "./454/_escenario";
import { filaUsuario, plantarPuntero, punteroDe } from "./_puntero-484";

/**
 * FICHA 484 (T3; R6, R7) — EL TRASPASO SUELTA EL PUNTERO DEL MENSAJERO DE ORIGEN, contra Postgres
 * real (`OrdenRepository.traspasarMensajeroLote`, ficha 427).
 *
 * Tras el traspaso la orden SIGUE gestionable, ahora por el destino: el unico puntero que queda
 * colgado es el del ORIGEN, y solo si apuntaba a una orden del lote. El del destino no se toca
 * —aunque apunte a la orden traspasada, que ahora es suya y por tanto VIGENTE—.
 *
 * R7 se mide con un lote que se revierte por CONFLICTO (una «perdedora» cuyo `UPDATE` guardado no
 * encuentra fila), con un SAVEPOINT real, que es lo que Postgres hace con la tx abortada; y una
 * segunda vez con el cliente de paso (sin savepoint), donde lo que ya se escribio NO se revierte:
 * ahi el puntero intacto demuestra que la limpieza va DESPUES del `throw`.
 *
 * Mutaciones registradas en `progress/impl_484.md`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

function lote(e: Escenario, ordenIds: string[]) {
  const enReparto = e.id("en_reparto");
  return {
    loteId: randomUUID(),
    mensajeroOrigenId: e.mensajeroId,
    mensajeroDestinoId: e.mensajero2Id,
    ordenes: ordenIds.map((ordenId) => ({ ordenId, estatusIdEsperado: enReparto })),
    actor: { usuarioId: e.maestroId, rol: "maestro" as const },
    motivo: "Traspaso de prueba 484",
  };
}

describeSiHayBase("484/T3 — el traspaso suelta el puntero del origen (Postgres real)", () => {
  let mundo: Mundo;
  let r: Awaited<ReturnType<typeof correr>>;

  /** Origen apunta a una orden del lote; destino apunta a la MISMA orden (ya suya tras el traspaso). */
  function casoApuntaAlLote() {
    return conEscenario(mundo, async (e) => {
      const o = await e.sembrarOrden({ estatus: "en_reparto" });
      await plantarPuntero(e, e.mensajeroId, o.ordenId);
      await plantarPuntero(e, e.mensajero2Id, o.ordenId);
      const filaDestinoAntes = await filaUsuario(e, e.mensajero2Id);
      const aplicado = await e.s.ordenRepo.traspasarMensajeroLote(lote(e, [o.ordenId]));
      return {
        aplicado,
        mensajero: (await e.ordenDe(o.ordenId)).mensajeroAsignadoId,
        destinoId: e.mensajero2Id,
        origen: await punteroDe(e, e.mensajeroId),
        destino: await punteroDe(e, e.mensajero2Id),
        ordenId: o.ordenId,
        filaDestinoAntes,
        filaDestino: await filaUsuario(e, e.mensajero2Id),
      };
    });
  }

  /** Origen apunta a OTRA orden suya que no va en el lote; destino a una suya propia. */
  function casoApuntaAOtra() {
    return conEscenario(mundo, async (e) => {
      const o = await e.sembrarOrden({ estatus: "en_reparto" });
      const otra = await e.sembrarOrden({ estatus: "en_reparto" });
      const delDestino = await e.sembrarOrden({ estatus: "en_reparto", mensajeroId: e.mensajero2Id });
      await plantarPuntero(e, e.mensajeroId, otra.ordenId);
      await plantarPuntero(e, e.mensajero2Id, delDestino.ordenId);
      const filaOrigenAntes = await filaUsuario(e, e.mensajeroId);
      const aplicado = await e.s.ordenRepo.traspasarMensajeroLote(lote(e, [o.ordenId]));
      return {
        aplicado,
        origen: await punteroDe(e, e.mensajeroId),
        destino: await punteroDe(e, e.mensajero2Id),
        esperados: { origen: otra.ordenId, destino: delDestino.ordenId },
        filaOrigenAntes,
        filaOrigen: await filaUsuario(e, e.mensajeroId),
      };
    });
  }

  /**
   * Lote [ganadora, perdedora]: la perdedora esta `en_reparto` pero es de un TERCER mensajero, asi
   * que pasa la foto (estado esperado) y su `UPDATE` guardado por `mensajero = origen` no encuentra
   * fila. `conSavepoint` = la tx revierte de verdad; si no, cliente de paso.
   */
  function casoConflicto(conSavepoint: boolean) {
    return conEscenario(mundo, async (e) => {
      const tercero = await e.crearUsuario("mensajero", e.zonaSateliteId);
      const ganadora = await e.sembrarOrden({ estatus: "en_reparto" });
      const perdedora = await e.sembrarOrden({ estatus: "en_reparto", mensajeroId: tercero });
      await plantarPuntero(e, e.mensajeroId, ganadora.ordenId);
      const repo = conSavepoint
        ? new OrdenRepository(clienteConSavepoint(e.tx))
        : e.s.ordenRepo;
      let error: string | null = null;
      try {
        // El bucle de `UPDATE` recorre el lote EN ESTE ORDEN: la ganadora corre antes del `throw`.
        await repo.traspasarMensajeroLote(lote(e, [ganadora.ordenId, perdedora.ordenId]));
      } catch (err) {
        error = err instanceof TraspasoMensajeroConflictoError ? "conflicto" : String(err);
      }
      return {
        error,
        origen: await punteroDe(e, e.mensajeroId),
        esperado: ganadora.ordenId,
        mensajeroGanadora: (await e.ordenDe(ganadora.ordenId)).mensajeroAsignadoId,
        origenId: e.mensajeroId,
        destinoId: e.mensajero2Id,
      };
    });
  }

  function correr() {
    return (async () => ({
      alLote: await casoApuntaAlLote(),
      aOtra: await casoApuntaAOtra(),
      conflictoSavepoint: await casoConflicto(true),
      conflictoDePaso: await casoConflicto(false),
    }))();
  }

  beforeAll(async () => {
    mundo = await prepararMundo();
    r = await correr();
  }, 180_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  it("anti-vacuidad: el traspaso movio la orden al destino", () => {
    expect(r.alLote.aplicado.movidas).toBe(1);
    expect(r.alLote.mensajero).toBe(r.alLote.destinoId);
  });

  it("R6: el puntero del ORIGEN que apuntaba a la orden traspasada queda NULL", () => {
    expect(r.alLote.origen).toBeNull();
  });

  it("R6: el puntero del DESTINO no se toca, aunque apunte a la orden traspasada", () => {
    expect(r.alLote.destino).toBe(r.alLote.ordenId);
    expect(r.alLote.filaDestino).toEqual(r.alLote.filaDestinoAntes);
  });

  it("R6: si el origen apunta a OTRA orden, ni su puntero ni su fila cambian; el del destino tampoco", () => {
    expect(r.aOtra.aplicado.movidas).toBe(1);
    expect(r.aOtra.origen).toBe(r.aOtra.esperados.origen);
    expect(r.aOtra.destino).toBe(r.aOtra.esperados.destino);
    expect(r.aOtra.filaOrigen).toEqual(r.aOtra.filaOrigenAntes);
  });

  it("R7: un lote revertido por conflicto deja el puntero del origen intacto (tx real)", () => {
    expect(r.conflictoSavepoint.error).toBe("conflicto");
    // El SAVEPOINT revirtio tambien el `UPDATE` de la ganadora.
    expect(r.conflictoSavepoint.mensajeroGanadora).toBe(r.conflictoSavepoint.origenId);
    expect(r.conflictoSavepoint.origen).toBe(r.conflictoSavepoint.esperado);
  });

  it("R7: y la limpieza va DESPUES del `throw`: sin savepoint, la ganadora se movio y el puntero no", () => {
    expect(r.conflictoDePaso.error).toBe("conflicto");
    // Sin rollback la ganadora queda escrita: prueba de que el bucle llego a ella antes del throw.
    expect(r.conflictoDePaso.mensajeroGanadora).toBe(r.conflictoDePaso.destinoId);
    expect(r.conflictoDePaso.origen).toBe(r.conflictoDePaso.esperado);
  });
});
