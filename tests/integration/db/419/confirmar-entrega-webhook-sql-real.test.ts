import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { HAY_BASE_DE_DATOS } from "../_postgres-real";
import {
  FOTO,
  clienteConSavepoint419,
  conEscenario419,
  crearPersonas419,
  montarServicio419,
  prepararMundo419,
  type Mundo419,
} from "./_escenario-419";

/**
 * FICHA 419 (B6; R14) — el lote central encola, en la MISMA transaccion, exactamente un job
 * `webhook_estado` con destino `devuelta_a_tienda` por cada orden que transiciona, si su dueño
 * tiene suscripcion activa; ninguno para las que no transicionan. Sin codigo nuevo: lo da el choke
 * point `appendCambioEstado`. Postgres real, transaccion revertida.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("419/R14 — webhook de la entrega central a la tienda (Postgres real)", () => {
  let mundo: Mundo419;
  let r: Awaited<ReturnType<typeof correr>>;

  function correr() {
    return conEscenario419(mundo, async (tx) => {
      const p = await crearPersonas419(mundo, tx);
      await tx.webhookSuscripcion.create({
        data: {
          ownerUsuarioId: p.tiendaA,
          url: "https://example.test/hook-419",
          secret: "cifrado-de-prueba",
          activa: true,
        },
      });
      const e1 = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
      const e2 = await p.sembrarOrden({ estatus: "devolviendo_a_tienda" });
      const inv = await p.sembrarOrden({ estatus: "por_devolver_a_tienda" });
      const ya = await p.sembrarOrden({ estatus: "devuelta_a_tienda" });
      const destinoId = p.id("devuelta_a_tienda");
      const jobsDe = async (ordenId: string) =>
        (
          await tx.job.findMany({
            where: { tipo: "webhook_estado", payload: { path: ["ordenId"], equals: ordenId } },
            select: { payload: true },
          })
        ).map((j) => j.payload as Record<string, unknown>);

      const m = montarServicio419(clienteConSavepoint419(tx));
      const res = await m.service.confirmarEntrega(
        {
          tiendaId: p.tiendaA,
          ordenIds: [e1.ordenId, e2.ordenId, inv.ordenId, ya.ordenId],
          evidencias: FOTO,
        },
        p.actorMaestro,
      );
      return {
        res,
        destinoId,
        e1: await jobsDe(e1.ordenId),
        e2: await jobsDe(e2.ordenId),
        inv: await jobsDe(inv.ordenId),
        ya: await jobsDe(ya.ordenId),
      };
    });
  }

  beforeAll(async () => {
    mundo = await prepararMundo419();
    r = await correr();
  }, 120_000);

  afterAll(async () => {
    await mundo?.prisma.$disconnect();
  });

  it("exactamente un job `webhook_estado` a `devuelta_a_tienda` por cada transicionada", () => {
    expect(r.res.status).toBe("ok");
    for (const jobs of [r.e1, r.e2]) {
      expect(jobs).toHaveLength(1);
      expect(jobs[0].estatusDestinoId).toBe(r.destinoId);
    }
  });

  it("ningun job para las que no transicionaron", () => {
    expect(r.inv).toEqual([]);
    expect(r.ya).toEqual([]);
  });
});
