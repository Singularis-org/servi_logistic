import { describe, it, expect, vi } from "vitest";
import { crearOptimizacionRutaHandler } from "@/lib/services/jobs/optimizacion-ruta-handler";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";

// SLT-59 (D28/D29, R76) — el validador del payload del job `optimizacion_ruta`. Desde D29 la recogida
// escribe `origen` (`recogida_parcial` o `recogida`); el handler lo acepta, sigue aceptando el payload
// sin `origen` (gestion, traspaso, jobs encolados antes del despliegue) y rechaza un `origen` que no
// esta en la lista. Lo que el `origen` decide (el motivo de la llamada) es de la Fase 8.

function job(payload: Record<string, unknown>): JobDTO {
  return {
    id: "j-1",
    tipo: "optimizacion_ruta",
    payload,
    estado: "processing",
    intentos: 1,
    maxIntentos: 3,
    runAfter: new Date("2026-07-20T12:00:00.000Z"),
    lockedAt: null,
    lastError: null,
    dedupeKey: null,
    createdAt: new Date("2026-07-20T11:50:00.000Z"),
    updatedAt: new Date("2026-07-20T11:50:00.000Z"),
  };
}

function handlerCon() {
  const ejecutar = vi.fn(async () => ({ status: "ok" }));
  const handler = crearOptimizacionRutaHandler({ ejecutar } as never);
  return { handler, ejecutar };
}

describe("SLT-59 R76 — el payload del job admite el `origen` de la recogida", () => {
  it.each(["recogida_parcial", "recogida", "gestion", "traspaso"])(
    "origen = %s -> ejecuta para el mensajero del payload",
    async (origen) => {
      const { handler, ejecutar } = handlerCon();
      await handler(job({ mensajeroId: "m-1", origen }));
      expect(ejecutar).toHaveBeenCalledTimes(1);
      expect((ejecutar.mock.calls[0] as unknown[])[0]).toBe("m-1");
    },
  );

  it("sin `origen` sigue siendo valido (jobs de gestion/traspaso y los de antes del despliegue)", async () => {
    const { handler, ejecutar } = handlerCon();
    await handler(job({ mensajeroId: "m-1" }));
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it("un `origen` fuera de la lista es un payload invalido y no ejecuta", async () => {
    const { handler, ejecutar } = handlerCon();
    await expect(handler(job({ mensajeroId: "m-1", origen: "otro" }))).rejects.toThrow(/payload invalido/);
    expect(ejecutar).not.toHaveBeenCalled();
  });
});
