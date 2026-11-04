import { describe, expect, it, vi } from "vitest";

import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { AvisoCorreoPlan, CambioPendiente, IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { MODULO_POR_JOB } from "@/lib/modulos/reparto";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { ConsoleEmailSender } from "@/lib/services/email/ConsoleEmailSender";
import { EnrutadorEmailSender } from "@/lib/services/email/EnrutadorEmailSender";

// El repositorio de los handlers cableados: un doble que registra en qué contexto lo llaman. El resto
// del módulo es el real (`importOriginal`), incluido el composition root que se prueba abajo.
const llamadas: { metodo: string; contexto: ContextoDatos | undefined; args: unknown[] }[] = [];
const dobleCableado: Pick<
  IPlanesRepository,
  "aplicarCambioProgramado" | "cambiosVencidos" | "repartirRecordatorio" | "destinatariosDelAviso"
> = {
  aplicarCambioProgramado: async (...args) => {
    llamadas.push({ metodo: "aplicar", contexto: contextoActual(), args });
    return { estado: "aplicado" };
  },
  cambiosVencidos: async (...args) => {
    llamadas.push({ metodo: "vencidos", contexto: contextoActual(), args });
    return [{ planId: "plan-1", cambioId: "cambio-1" }];
  },
  repartirRecordatorio: async (...args) => {
    llamadas.push({ metodo: "recordatorio", contexto: contextoActual(), args });
    return { estado: "repartido", empresas: 0 };
  },
  // Sin maestros: el handler cableado termina sin tocar el emisor real.
  destinatariosDelAviso: async (...args) => {
    llamadas.push({ metodo: "destinatarios", contexto: contextoActual(), args });
    return { empresaNombre: "Uno", maestros: [] };
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
const {
  avisoDelPayload,
  cambioDelPayload,
  crearPlanAplicarCambioHandler,
  crearPlanAvisoCorreoHandler,
  crearPlanCambiosVencidosHandler,
  crearPlanRecordatorioCambioHandler,
  recurrenciaPlanCambiosVencidos,
} = jobsCambioPlan;

// SL-24 · T11 (design §16.3, §16.5; R38, R44) — los trabajos del cambio programado en el drenador:
// registrados, el barrido recurrente cada hora y en plataforma (una vez, no por empresa), los handlers
// delgados sobre el repositorio, y el composition root que construye el repositorio REAL (memoria «el
// composition root que no inyecta»). T12 (§16.4; R41, R42, R45): `plan_recordatorio_cambio` (en
// plataforma) y `plan_aviso_correo` (en la empresa destino), y el emisor real del composition root.

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

  it("T12: los dos de correo tienen handler y son PUNTUALES (ninguno se re-agenda)", () => {
    const handlers = buildHandlers(() => AHORA);
    expect(handlers.has("plan_recordatorio_cambio")).toBe(true);
    expect(handlers.has("plan_aviso_correo")).toBe(true);
    const recurrencias = buildRecurrencias();
    expect(recurrencias.has("plan_recordatorio_cambio")).toBe(false);
    expect(recurrencias.has("plan_aviso_correo")).toBe(false);
  });

  it("R44: los dos de correo son de núcleo", () => {
    expect(MODULO_POR_JOB.plan_recordatorio_cambio).toBe("nucleo");
    expect(MODULO_POR_JOB.plan_aviso_correo).toBe("nucleo");
  });

  it("cableados: el recordatorio corre en plataforma y el aviso en SU empresa", async () => {
    usarDoble = true;
    llamadas.length = 0;
    try {
      const handlers = buildHandlers(() => AHORA);
      await handlers.get("plan_recordatorio_cambio")!(
        job({ planId: "p", cambioId: "c", dias: 7 }, { tipo: "plan_recordatorio_cambio", organizacionId: null }),
      );
      await handlers.get("plan_aviso_correo")!(
        job(aviso({ tipo: "recordatorio_1" }), { tipo: "plan_aviso_correo", organizacionId: "org-a" }),
      );
      expect(llamadas.map((l) => [l.metodo, l.args])).toEqual([
        ["recordatorio", [{ planId: "p", cambioId: "c" }, 7]],
        ["destinatarios", ["org-a", "cambio-1"]],
      ]);
      expect(llamadas[0].contexto).toMatchObject({ tipo: "plataforma" });
      expect(llamadas[1].contexto).toMatchObject({ tipo: "empresa", organizacionId: "org-a" });
    } finally {
      usarDoble = false;
    }
  });

  it("el composition root del correo pasa el emisor REAL de `crearEmailSender`, no un doble", () => {
    const deps = jobsCambioPlan.buildDepsAvisoCorreo();
    expect(deps.sender instanceof ConsoleEmailSender || deps.sender instanceof EnrutadorEmailSender).toBe(true);
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

/* -------------------------------------------------------------------------- */
/* T12: plan_recordatorio_cambio y plan_aviso_correo                           */
/* -------------------------------------------------------------------------- */

function aviso(extra: Partial<AvisoCorreoPlan> = {}): Record<string, unknown> {
  const a: AvisoCorreoPlan = {
    cambioId: "cambio-1",
    planId: "plan-1",
    planNombre: "Básico",
    tipo: "guardado",
    cambios: { nombre: { antes: "Básico", despues: "Plus" } },
    vigenteDesde: "2026-11-20T06:00:00.000Z",
    reemplazaA: null,
    topesPasados: [],
    ...extra,
  };
  return { ...a };
}

function emisor(fallaPara: readonly string[] = []): IEmailSender & { enviados: EmailMessage[] } {
  const enviados: EmailMessage[] = [];
  return {
    enviados,
    enviar: async (m) => {
      if (fallaPara.includes(m.to)) throw new Error(`SMTP caído para ${m.to}`);
      enviados.push(m);
      return { messageId: null };
    },
  };
}

const MAESTROS = [
  { email: "a@uno.example", nombre: "Ana" },
  { email: "b@uno.example", nombre: "Beto" },
];

describe("SL-24 — plan_recordatorio_cambio (R42)", () => {
  it("pasa ESA programación y los días al repositorio", async () => {
    const repartir = vi.fn<IPlanesRepository["repartirRecordatorio"]>(async () => ({ estado: "sin_pendiente" }));
    await crearPlanRecordatorioCambioHandler({ repartirRecordatorio: repartir })(job({ planId: "p", cambioId: "c", dias: 1 }));
    expect(repartir).toHaveBeenCalledWith({ planId: "p", cambioId: "c" }, 1);
  });

  it.each([[{}], [{ planId: "p", cambioId: "c" }], [{ planId: "p", cambioId: "c", dias: 3 }], [{ planId: "", cambioId: "c", dias: 7 }]])(
    "un payload inválido falla sin llamar al repositorio (%j)",
    async (payload) => {
      const repartir = vi.fn<IPlanesRepository["repartirRecordatorio"]>();
      await expect(crearPlanRecordatorioCambioHandler({ repartirRecordatorio: repartir })(job(payload))).rejects.toThrow(/dias/);
      expect(repartir).not.toHaveBeenCalled();
    },
  );
});

describe("SL-24 — plan_aviso_correo (R41, R42, R45)", () => {
  const conEmpresa = { organizacionId: "org-a", tipo: "plan_aviso_correo" as const };

  it("un correo por maestro activo, con la plantilla del cambio y el contacto del pie", async () => {
    const destinatarios = vi.fn<IPlanesRepository["destinatariosDelAviso"]>(async () => ({ empresaNombre: "Uno", maestros: MAESTROS }));
    const sender = emisor();
    await crearPlanAvisoCorreoHandler({ destinatariosDelAviso: destinatarios }, () => ({ sender, contacto: "hola@ejemplo.example" }))(
      job(aviso(), conEmpresa),
    );
    // `guardado` no comprueba el pendiente (la edición inmediata ni siquiera lo tiene).
    expect(destinatarios).toHaveBeenCalledWith("org-a", null);
    expect(sender.enviados.map((m) => m.to)).toEqual(["a@uno.example", "b@uno.example"]);
    expect(sender.enviados[0].subject).toBe("Cambios en el plan Básico");
    expect(sender.enviados[0].text).toContain("Hola, Ana:");
    expect(sender.enviados[0].text).toContain("El plan Básico de Uno cambia a partir del 20 nov 2026.");
    expect(sender.enviados[0].text).toContain("hola@ejemplo.example");
  });

  it("un recordatorio pide comprobar que su programación sigue pendiente; el cancelado no", async () => {
    const destinatarios = vi.fn<IPlanesRepository["destinatariosDelAviso"]>(async () => null);
    const sender = emisor();
    const handler = crearPlanAvisoCorreoHandler({ destinatariosDelAviso: destinatarios }, () => ({ sender, contacto: null }));
    await handler(job(aviso({ tipo: "recordatorio_7" }), conEmpresa));
    await handler(job(aviso({ tipo: "cancelado", cambios: {} }), conEmpresa));
    expect(destinatarios.mock.calls).toEqual([
      ["org-a", "cambio-1"],
      ["org-a", null],
    ]);
    // `null` = ya no está pendiente: no se envía nada.
    expect(sender.enviados).toEqual([]);
  });

  it("si un envío falla, envía a los demás y DESPUÉS falla el trabajo, sin el email en el motivo", async () => {
    const sender = emisor(["a@uno.example"]);
    const handler = crearPlanAvisoCorreoHandler(
      { destinatariosDelAviso: async () => ({ empresaNombre: "Uno", maestros: MAESTROS }) },
      () => ({ sender, contacto: null }),
    );
    const error = await handler(job(aviso(), conEmpresa)).catch((e: unknown) => e);
    expect(String(error)).toMatch(/fallaron 1 de 2 envío/);
    expect(String(error)).not.toMatch(/@/);
    expect(sender.enviados.map((m) => m.to)).toEqual(["b@uno.example"]);
  });

  it("sin empresa destino o con un payload malformado falla sin leer ni enviar", async () => {
    const destinatarios = vi.fn<IPlanesRepository["destinatariosDelAviso"]>();
    const deps = vi.fn(() => ({ sender: emisor(), contacto: null }));
    const handler = crearPlanAvisoCorreoHandler({ destinatariosDelAviso: destinatarios }, deps);
    await expect(handler(job(aviso(), { organizacionId: null }))).rejects.toThrow(/empresa destino/);
    await expect(handler(job({ ...aviso(), tipo: "otro" }, conEmpresa))).rejects.toThrow(/payload/);
    await expect(handler(job(aviso({ tipo: "cancelado", cambioId: null }), conEmpresa))).rejects.toThrow(/cambioId/);
    expect(destinatarios).not.toHaveBeenCalled();
    expect(deps).not.toHaveBeenCalled();
    expect(() => avisoDelPayload({ payload: { ...aviso(), vigenteDesde: "mañana" } })).toThrow();
  });
});
