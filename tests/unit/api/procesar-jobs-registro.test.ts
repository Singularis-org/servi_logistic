import { describe, it, expect, vi } from "vitest";
import { buildHandlers, buildRecurrencias } from "@/app/api/cron/procesar-jobs/route";
import { JobQueueService } from "@/lib/services/JobQueueService";
import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler } from "@/lib/interfaces/services/IJobQueueService";
import type { JobTipo } from "@prisma/client";

// Feature 92 (R21) — el tipo `optimizacion_ruta` esta enganchado al drenador y NO es
// recurrente: se encola por EVENTO (recogida con debounce, gestion inmediata), nunca por
// reloj. Si se registrara en `buildRecurrencias()`, el cron lo re-agendaria cada minuto
// para TODOS los mensajeros, pagando una llamada facturada por cada uno y por minuto.

const AHORA = new Date("2026-07-20T12:00:00.000Z");

function job(tipo: JobTipo, over: Partial<JobDTO> = {}): JobDTO {
  return {
    id: `job-${tipo}`,
    tipo,
    payload: { mensajeroId: "m-1" },
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    ...over,
  };
}

describe("R21 — registro en el drenador", () => {
  it("buildHandlers registra `optimizacion_ruta`", () => {
    const handlers = buildHandlers(() => AHORA);
    expect(handlers.has("optimizacion_ruta")).toBe(true);
  });

  it("buildHandlers NO pierde los handlers de las features 46/90 y 91", () => {
    // Conjunto EXACTO: anadir o quitar un tipo sin actualizar este test falla ruidosamente.
    const handlers = buildHandlers(() => AHORA);
    expect([...handlers.keys()].sort()).toEqual([
      "analitica_invalidacion_cache", // feature 128: PUNTUAL, no va en buildRecurrencias
      "analitica_rollup_diario", // feature 124
      "geocodificacion",
      "liberar_reprogramadas",
      "optimizacion_ruta",
      // SL-24 (design §16.3): aplicar un cambio programado (PUNTUAL) y el barrido horario de los
      // vencidos (RECURRENTE).
      "plan_aplicar_cambio",
      // SL-24 · T12 (design §16.4): los correos del cambio, PUNTUALES: el aviso a una empresa y
      // el recordatorio que los reparte.
      "plan_aviso_correo",
      "plan_cambios_vencidos",
      "plan_recordatorio_cambio",
      // FICHA 410: entrega de UNA notificacion ya creada a las suscripciones push de sus
      // destinatarios. PUNTUAL —lo encola el decorador del repositorio de notificaciones—, asi que
      // tampoco va en `buildRecurrencias`. Este censo es LITERAL a proposito y se pone rojo cuando
      // el inventario de tipos crece: que se pusiera rojo es la prueba de que sigue cerrado.
      "push_web",
      "webhook_estado", // feature 99
      // FICHA 454 (2026-09-23): entrega de UN hecho de orden (gestion registrada/anulada/corregida,
      // ayuda). PUNTUAL, encolado en la misma tx que el hecho: no va en `buildRecurrencias`.
      "webhook_evento",
      "whatsapp_bienvenida", // mensaje de bienvenida al recoger: PUNTUAL, no va en buildRecurrencias
      "whatsapp_chat_envio", // feature 109
      // FICHA 474: los cinco tipos de los envios automaticos por WhatsApp. Solo el mantenimiento es
      // recurrente; los otros cuatro se encolan por cadena, por aviso o por reintento.
      "whatsapp_envio_ejecucion",
      "whatsapp_envio_evento",
      "whatsapp_envio_mantenimiento",
      "whatsapp_envio_programado",
      "whatsapp_envio_reintento",
      "whatsapp_template_sync", // integracion WhatsApp
    ]);
  });

  // Re-agendar la bienvenida seria mandarle un WhatsApp por minuto al mismo cliente: la dispara
  // la RECOGIDA de un paquete, un evento del dominio, no el reloj.
  it("buildRecurrencias NO registra `whatsapp_bienvenida` (la dispara la recogida, no el reloj)", () => {
    expect(buildRecurrencias().has("whatsapp_bienvenida")).toBe(false);
    expect(buildHandlers(() => AHORA).has("whatsapp_bienvenida")).toBe(true);
  });

  it("buildRecurrencias NO registra `optimizacion_ruta` (no es recurrente)", () => {
    const recurrencias = buildRecurrencias();
    expect(recurrencias.has("optimizacion_ruta")).toBe(false);
    // Recurrentes: los que dispara el RELOJ. `liberar_reprogramadas` (feature 90) y, desde la
    // 124, `analitica_rollup_diario`. Conjunto EXACTO, por el mismo motivo que arriba.
    expect([...recurrencias.keys()].sort()).toEqual([
      "analitica_rollup_diario",
      "liberar_reprogramadas",
      "plan_cambios_vencidos", // SL-24: barrido horario de cambios de plan vencidos
      "whatsapp_envio_mantenimiento", // ficha 474: mantenimiento diario 03:30 CR
    ]);
  });

  it("R36 (124) — `analitica_rollup_diario` esta en AMBOS mapas y su recurrencia es a las 06:30 UTC", () => {
    // El rollup diario NO lo dispara ningun evento del dominio: nadie "crea" un dia. Si solo
    // estuviera en `buildHandlers`, la primera ocurrencia correria y la serie se acabaria ahi;
    // la tabla no se romperia, simplemente dejaria de crecer, en silencio. De ahi que este
    // test exija los DOS mapas y ademas mire lo que la recurrencia agenda.
    expect(buildHandlers(() => AHORA).has("analitica_rollup_diario")).toBe(true);

    const spec = buildRecurrencias().get("analitica_rollup_diario");
    expect(spec).toBeDefined();
    const { runAfter, dedupeKey } = spec!.siguiente(new Date("2026-08-02T06:30:00.000Z"));
    expect(runAfter.toISOString()).toBe("2026-08-03T06:30:00.000Z");
    // La clave es la fecha OBJETIVO (el dia que esa corrida agregara), no la de la corrida.
    expect(dedupeKey).toBe("analitica_rollup_diario:2026-08-02");
  });

  it("construir los handlers NO lanza: ninguna credencial se lee al registrar", () => {
    // SL-36 (R23): la credencial de rutas y la de Maps son de cada empresa y se leen job a job,
    // dentro de `conSuEmpresa`. Construir el registro no consulta ninguna (ni la base ni el
    // entorno), asi que una empresa sin integracion no puede tumbar el registro entero del cron.
    expect(() => buildHandlers(() => AHORA)).not.toThrow();
  });
});

describe("R21 — un fallo de este handler NO impide drenar el resto del lote", () => {
  it("el job de optimizacion falla y los otros dos se completan igual", async () => {
    // `JobQueueService.drenar` captura job a job. Es lo que garantiza que una credencial
    // de Route Optimization ausente no tumbe `liberar_reprogramadas` (en produccion) ni
    // `geocodificacion`, que comparten este mismo cron.
    const claimed = [
      job("optimizacion_ruta"),
      job("geocodificacion", { id: "job-geo" }),
      job("liberar_reprogramadas", { id: "job-lib" }),
    ];
    const completados: string[] = [];
    const fallidos: string[] = [];
    const repo = {
      claimBatch: vi.fn(async () => claimed),
      complete: vi.fn(async (id: string) => {
        completados.push(id);
      }),
      fail: vi.fn(async (id: string) => {
        fallidos.push(id);
      }),
      enqueue: vi.fn(async () => null),
      findByDedupeKeys: vi.fn(async () => []),
    } as unknown as IJobRepository;

    const handlers = new Map<JobTipo, JobHandler>([
      [
        "optimizacion_ruta",
        async () => {
          throw new Error("optimizacion de ruta: credencial incompleta");
        },
      ],
      ["geocodificacion", async () => {}],
      ["liberar_reprogramadas", async () => {}],
    ]);

    const service = new JobQueueService(
      repo,
      handlers,
      new Map(),
      {
        JOBS_BATCH_SIZE: 10,
        JOBS_MAX_ATTEMPTS: 5,
        JOBS_BACKOFF_BASE_MS: 60_000,
        JOBS_BACKOFF_CAP_MS: 3_600_000,
        JOBS_VISIBILITY_TIMEOUT_MS: 300_000,
      },
      () => AHORA,
    );

    await service.drenar(10);

    expect(fallidos).toEqual(["job-optimizacion_ruta"]);
    expect(completados.sort()).toEqual(["job-geo", "job-lib"]);
  });
});
