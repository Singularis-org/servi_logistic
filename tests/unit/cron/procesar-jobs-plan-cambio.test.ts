import { describe, expect, it, vi } from "vitest";

import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { CambioPendiente, IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";

// El repositorio de los handlers cableados: un doble que registra en qué contexto lo llaman. El resto
// del módulo es el real (`importOriginal`), incluido el composition root que se prueba abajo.
const llamadas: { metodo: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
const dobleCableado: Pick<IPlanesRepository, "aplicarCambioProgramado" | "cambiosVencidos"> = {
  aplicarCambioProgramado: async (...args) => {
    llamadas.push({ metodo: "aplicar", contexto: contextoActual(), args });
    return { estado: "aplicado" };
  },
  cambiosVencidos: async (...args) => {
    llamadas.push({ metodo: "vencidos", contexto: contextoActual(), args });
    return [{ planId: "plan-1", cambioId: "cambio-1" }];
  },
};
let usarDoble = false;

vi.mock("@/lib/planes/jobs-cambio-plan", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/planes/jobs-cambio-plan")>();
  return {
    ...real,
    buildPlanesRepositoryDeJobs: () => (usarDoble ? dobleCableado : real.buildPlanesRepositoryDeJobs()),
  };
});

const { buildHandlers, buildRecurrencias, RECURRENTES_DE_PLATAFORMA } = await import("@/app/api/cron/procesar-jobs/route");
const jobsCambioPlan = await import("@/lib/planes/jobs-cambio-plan");
const { cambioDelPayload, crearPlanAplicarCambioHandler, crearPlanCambiosVencidosHandler, recurrenciaPlanCambiosVencidos } =
  jobsCambioPlan;

// SL-24 · T11 (design §16.3, §16.5; R38, R44) — los trabajos del cambio programado en el drenador:
// registrados, el barrido recurrente cada hora y en plataforma (una vez, no por empresa), los handlers
// delgados sobre el repositorio, y el composition root que construye el repositorio REAL (memoria «el
// composition root que no inyecta»). `plan_recordatorio_cambio` y `plan_aviso_correo` son de T12.

const AHORA = new Date("2026-11-15T06:30:00.000Z");

function job(payload: Record<string, unknown>, extra: Partial<JobDTO & { organizacionId: string | null }> = {}): JobDTO {
  return {
    id: "job-1",
    tipo: "plan_aplicar_cambio",
    payload,
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    ...extra,
  };
}

describe("SL-24 — registro de los trabajos del cambio programado (R38, R44)", () => {
  it("plan_aplicar_cambio y plan_cambios_vencidos tienen handler; solo el barrido es recurrente", () => {
    const handlers = buildHandlers(() => AHORA);
    expect(handlers.has("plan_aplicar_cambio")).toBe(true);
    expect(handlers.has("plan_cambios_vencidos")).toBe(true);
    const recurrencias = buildRecurrencias();
    expect(recurrencias.has("plan_cambios_vencidos")).toBe(true);
    expect(recurrencias.has("plan_aplicar_cambio")).toBe(false);
  });

  it("R44: los dos son de núcleo", () => {
    expect(MODULO_POR_JOB.plan_aplicar_cambio).toBe("nucleo");
    expect(MODULO_POR_JOB.plan_cambios_vencidos).toBe("nucleo");
  });

  it("el barrido se re-agenda a la siguiente hora en punto, con la hora en la clave", () => {
    expect(recurrenciaPlanCambiosVencidos.siguiente(new Date("2026-11-15T06:30:00.000Z"))).toEqual({
      runAfter: new Date("2026-11-15T07:00:00.000Z"),
      dedupeKey: "plan_cambios_vencidos:2026-11-15T07",
    });
    // En la hora en punto exacta, la siguiente (estrictamente posterior).
    expect(recurrenciaPlanCambiosVencidos.siguiente(new Date("2026-11-15T07:00:00.000Z")).runAfter).toEqual(
      new Date("2026-11-15T08:00:00.000Z"),
    );
    expect(RECURRENTES_DE_PLATAFORMA.has("plan_cambios_vencidos")).toBe(true);
  });

  it("el barrido cableado corre UNA vez en plataforma, sin recorrer las empresas", async () => {
    usarDoble = true;
    llamadas.length = 0;
    try {
      const findMany = vi.fn(async () => [{ id: "org-a" }, { id: "org-b" }]);
      const empresas = { organizacion: { findMany } } as unknown as ClienteDeOrganizaciones;
      const handlers = buildHandlers(() => AHORA, { empresas });
      await handlers.get("plan_cambios_vencidos")!(job({}, { tipo: "plan_cambios_vencidos", organizacionId: null }));
      expect(findMany).not.toHaveBeenCalled();
      expect(llamadas.map((l) => l.metodo)).toEqual(["vencidos", "aplicar"]);
      for (const l of llamadas) expect(l.contexto).toMatchObject({ tipo: "plataforma" });
      expect(llamadas[0].args).toEqual([AHORA]);
      expect(llamadas[1].args).toEqual([{ planId: "plan-1", cambioId: "cambio-1" }, AHORA]);

      // Y el puntual, sin empresa, también en plataforma, con el payload y el reloj del drenador.
      llamadas.length = 0;
      await handlers.get("plan_aplicar_cambio")!(job({ planId: "plan-9", cambioId: "cambio-9" }, { organizacionId: null }));
      expect(llamadas).toEqual([
        { metodo: "aplicar", contexto: expect.objectContaining({ tipo: "plataforma" }), args: [{ planId: "plan-9", cambioId: "cambio-9" }, AHORA] },
      ]);
    } finally {
      usarDoble = false;
    }
  });

  it("el composition root construye el PlanesRepository real, sin abrir conexión", () => {
    expect(jobsCambioPlan.buildPlanesRepositoryDeJobs()).toBeInstanceOf(PlanesRepository);
  });
});

describe("SL-24 — handlers delgados", () => {
  it("plan_aplicar_cambio pasa ESA programación y el reloj al repositorio", async () => {
    const aplicar = vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(async () => ({ estado: "sin_pendiente" }));
    await crearPlanAplicarCambioHandler({ aplicarCambioProgramado: aplicar }, () => AHORA)(job({ planId: "p", cambioId: "c" }));
    expect(aplicar).toHaveBeenCalledWith({ planId: "p", cambioId: "c" }, AHORA);
  });

  it.each([[{}], [{ planId: "p" }], [{ cambioId: "c" }], [{ planId: "", cambioId: "c" }], [{ planId: 1, cambioId: "c" }]])(
    "un payload sin planId y cambioId falla el trabajo sin llamar al repositorio (%j)",
    async (payload) => {
      const aplicar = vi.fn<IPlanesRepository["aplicarCambioProgramado"]>();
      await expect(crearPlanAplicarCambioHandler({ aplicarCambioProgramado: aplicar }, () => AHORA)(job(payload))).rejects.toThrow(
        /planId y cambioId/,
      );
      expect(aplicar).not.toHaveBeenCalled();
      expect(() => cambioDelPayload({ payload })).toThrow();
    },
  );

  it("el barrido aplica cada vencido; si uno falla, aplica los demás y DESPUÉS falla (backoff)", async () => {
    const vencidos: CambioPendiente[] = [
      { planId: "p1", cambioId: "c1" },
      { planId: "p2", cambioId: "c2" },
      { planId: "p3", cambioId: "c3" },
    ];
    const aplicar = vi.fn<IPlanesRepository["aplicarCambioProgramado"]>(async (c) => {
      if (c.cambioId === "c2") throw new Error("roto");
      return { estado: "aplicado" };
    });
    const handler = crearPlanCambiosVencidosHandler(
      { cambiosVencidos: async () => vencidos, aplicarCambioProgramado: aplicar },
      () => AHORA,
    );
    await expect(handler(job({}))).rejects.toThrow(/1 cambio\(s\): c2/);
    expect(aplicar.mock.calls.map((c) => c[0].cambioId)).toEqual(["c1", "c2", "c3"]);
  });

  it("el barrido sin vencidos no aplica nada ni falla", async () => {
    const aplicar = vi.fn<IPlanesRepository["aplicarCambioProgramado"]>();
    await crearPlanCambiosVencidosHandler({ cambiosVencidos: async () => [], aplicarCambioProgramado: aplicar }, () => AHORA)(job({}));
    expect(aplicar).not.toHaveBeenCalled();
  });
});
