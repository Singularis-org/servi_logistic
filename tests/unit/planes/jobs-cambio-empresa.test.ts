import { describe, expect, it, vi } from "vitest";

import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { CambioDeEmpresaPendiente, IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";

// El repositorio de los handlers cableados: un doble que registra en qué contexto lo llaman. El resto del
// módulo es el real (`importOriginal`).
const llamadas: { metodo: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
const dobleCableado: Pick<
  IPlanesRepository,
  "aplicarCambioProgramado" | "cambiosVencidos" | "aplicarCambioDeEmpresa" | "cambiosDeEmpresaVencidos"
> = {
  aplicarCambioProgramado: async (...args) => {
    llamadas.push({ metodo: "aplicar_plan", contexto: contextoActual(), args });
    return { estado: "aplicado" };
  },
  cambiosVencidos: async (...args) => {
    llamadas.push({ metodo: "vencidos_plan", contexto: contextoActual(), args });
    return [{ planId: "plan-1", cambioId: "cambio-plan" }];
  },
  aplicarCambioDeEmpresa: async (...args) => {
    llamadas.push({ metodo: "aplicar_empresa", contexto: contextoActual(), args });
    return { estado: "aplicado" };
  },
  cambiosDeEmpresaVencidos: async (...args) => {
    llamadas.push({ metodo: "vencidos_empresa", contexto: contextoActual(), args });
    return [{ organizacionId: "org-a", cambioId: "cambio-empresa" }];
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
const { cambioDeEmpresaDelJob, crearPlanAplicarCambioEmpresaHandler, crearPlanCambiosVencidosHandler } = await import(
  "@/lib/planes/jobs-cambio-plan"
);

// SLT-86 (design §5.2; R17, R20) — el trabajo que aplica un cambio de empresa pendiente a sus 00:00 y la
// segunda pasada del barrido horario. El SQL (que aplica una sola vez, que un reemplazado no escribe) lo
// prueba `tests/integration/db/planes-cambio-empresa.test.ts`; aquí, el cableado y los handlers.

const AHORA = new Date("2026-11-10T06:30:00.000Z");

function job(payload: Record<string, unknown>, extra: Partial<JobDTO & { organizacionId: string | null }> = {}): JobDTO {
  return {
    id: "job-1",
    tipo: "plan_aplicar_cambio_empresa",
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
  } as JobDTO;
}

describe("SLT-86 — registro de plan_aplicar_cambio_empresa (R20)", () => {
  it("tiene handler, es PUNTUAL (no se re-agenda) y no es un recurrente de plataforma", () => {
    expect(buildHandlers(() => AHORA).has("plan_aplicar_cambio_empresa")).toBe(true);
    expect(buildRecurrencias().has("plan_aplicar_cambio_empresa")).toBe(false);
    expect(RECURRENTES_DE_PLATAFORMA.has("plan_aplicar_cambio_empresa")).toBe(false);
  });

  it("es de núcleo: ningún módulo apagado lo descarta", () => {
    expect(MODULO_POR_JOB.plan_aplicar_cambio_empresa).toBe("nucleo");
  });

  it("cableado: corre en SU empresa y pasa ESE pendiente y el reloj del drenador", async () => {
    usarDoble = true;
    llamadas.length = 0;
    try {
      await buildHandlers(() => AHORA).get("plan_aplicar_cambio_empresa")!(
        job({ cambioId: "cambio-9" }, { organizacionId: "org-a" }),
      );
      expect(llamadas).toEqual([
        {
          metodo: "aplicar_empresa",
          contexto: expect.objectContaining({ tipo: "empresa", organizacionId: "org-a" }),
          args: [{ organizacionId: "org-a", cambioId: "cambio-9" }, AHORA],
        },
      ]);
    } finally {
      usarDoble = false;
    }
  });

  it("cableado: el barrido aplica los pendientes de plan y DESPUÉS los de empresa, una vez y en plataforma", async () => {
    usarDoble = true;
    llamadas.length = 0;
    try {
      await buildHandlers(() => AHORA).get("plan_cambios_vencidos")!(
        job({}, { tipo: "plan_cambios_vencidos", organizacionId: null }),
      );
      expect(llamadas.map((l) => [l.metodo, l.args])).toEqual([
        ["vencidos_plan", [AHORA]],
        ["aplicar_plan", [{ planId: "plan-1", cambioId: "cambio-plan" }, AHORA]],
        ["vencidos_empresa", [AHORA]],
        ["aplicar_empresa", [{ organizacionId: "org-a", cambioId: "cambio-empresa" }, AHORA]],
      ]);
      for (const l of llamadas) expect(l.contexto).toMatchObject({ tipo: "plataforma" });
    } finally {
      usarDoble = false;
    }
  });
});

describe("SLT-86 — handlers delgados del cambio de empresa (R20)", () => {
  it("pasa la empresa del trabajo, el cambioId del payload y el reloj", async () => {
    const aplicar = vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(async () => ({ estado: "sin_pendiente" }));
    await crearPlanAplicarCambioEmpresaHandler({ aplicarCambioDeEmpresa: aplicar }, () => AHORA)(
      job({ cambioId: "c" }, { organizacionId: "org-b" }),
    );
    expect(aplicar).toHaveBeenCalledWith({ organizacionId: "org-b", cambioId: "c" }, AHORA);
  });

  it.each([
    { caso: "sin empresa", payload: { cambioId: "c" }, organizacionId: null, motivo: /no tiene empresa/ },
    { caso: "sin cambioId", payload: {}, organizacionId: "org-a", motivo: /no trae cambioId/ },
    { caso: "cambioId vacío", payload: { cambioId: "" }, organizacionId: "org-a", motivo: /no trae cambioId/ },
    { caso: "cambioId no texto", payload: { cambioId: 7 }, organizacionId: "org-a", motivo: /no trae cambioId/ },
  ])("$caso: falla el trabajo sin llamar al repositorio", async ({ payload, organizacionId, motivo }) => {
    const aplicar = vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>();
    const j = job(payload, { organizacionId });
    await expect(crearPlanAplicarCambioEmpresaHandler({ aplicarCambioDeEmpresa: aplicar }, () => AHORA)(j)).rejects.toThrow(motivo);
    expect(aplicar).not.toHaveBeenCalled();
    expect(() => cambioDeEmpresaDelJob(j)).toThrow(motivo);
  });

  it("el barrido: si un cambio de empresa falla, aplica los demás y DESPUÉS falla nombrándolo (backoff)", async () => {
    const vencidos: CambioDeEmpresaPendiente[] = [
      { organizacionId: "o1", cambioId: "e1" },
      { organizacionId: "o2", cambioId: "e2" },
      { organizacionId: "o3", cambioId: "e3" },
    ];
    const aplicar = vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(async (c) => {
      if (c.cambioId === "e2") throw new Error("roto");
      return { estado: "aplicado" };
    });
    const handler = crearPlanCambiosVencidosHandler(
      {
        cambiosVencidos: async () => [],
        aplicarCambioProgramado: vi.fn(),
        cambiosDeEmpresaVencidos: async () => vencidos,
        aplicarCambioDeEmpresa: aplicar,
      },
      () => AHORA,
    );
    await expect(handler(job({}))).rejects.toThrow(/1 cambio\(s\): e2/);
    expect(aplicar.mock.calls.map((c) => c[0].cambioId)).toEqual(["e1", "e2", "e3"]);
  });

  it("el barrido: un fallo de un cambio de plan no impide la pasada de empresas", async () => {
    const aplicarEmpresa = vi.fn<IPlanesRepository["aplicarCambioDeEmpresa"]>(async () => ({ estado: "aplicado" }));
    const handler = crearPlanCambiosVencidosHandler(
      {
        cambiosVencidos: async () => [{ planId: "p", cambioId: "c-plan" }],
        aplicarCambioProgramado: async () => {
          throw new Error("roto");
        },
        cambiosDeEmpresaVencidos: async () => [{ organizacionId: "o", cambioId: "c-empresa" }],
        aplicarCambioDeEmpresa: aplicarEmpresa,
      },
      () => AHORA,
    );
    await expect(handler(job({}))).rejects.toThrow(/1 cambio\(s\): c-plan/);
    expect(aplicarEmpresa).toHaveBeenCalledWith({ organizacionId: "o", cambioId: "c-empresa" }, AHORA);
  });
});
