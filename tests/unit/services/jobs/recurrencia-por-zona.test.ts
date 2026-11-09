import { describe, it, expect, vi } from "vitest";
import type { JobTipo } from "@prisma/client";
import { JobQueueService } from "@/lib/services/JobQueueService";
import type { EnqueueOpts, IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import type { JobsConfig } from "@/lib/config/jobs";
import type { ILiberacionReprogramadaService } from "@/lib/interfaces/services/ILiberacionReprogramadaService";
import type { IAnaliticaRollupService } from "@/lib/interfaces/services/IAnaliticaRollupService";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import {
  crearLiberarReprogramadasHandler,
  recurrenciaLiberarReprogramadas,
} from "@/lib/services/jobs/liberar-reprogramadas-handler";
import {
  crearAnaliticaRollupDiarioHandler,
  recurrenciaAnaliticaRollupDiario,
} from "@/lib/services/jobs/analitica-rollup-diario-handler";
import { AVISO_SIN_ZONAS, leerClaveConZona, ZONA_SIN_EMPRESAS } from "@/lib/services/jobs/serie-diaria-por-zona";
import { recurrenciaWhatsappEnvioMantenimiento } from "@/lib/services/jobs/whatsapp-envio-mantenimiento-handler";
import { recurrenciaPlanCambiosVencidos } from "@/lib/planes/jobs-cambio-plan";
import { conSuEmpresa } from "@/app/api/cron/procesar-jobs/route";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (design §6.1; R25, R26, R28) — los jobs diarios `liberar_reprogramadas` (00:00) y
// `analitica_rollup_diario` (00:30): una serie por tipo, cada corrida es la de la zona que antes
// llega a su hora y procesa solo las empresas de esa zona. Sin base: dobles del puerto del pais y
// de los servicios.

const CR = "America/Costa_Rica"; // UTC-6, sin horario de verano
const BOGOTA = "America/Bogota"; // UTC-5, sin horario de verano
const GUATEMALA = "America/Guatemala"; // UTC-6, como CR

function job(tipo: JobTipo, dedupeKey: string | null): JobDTO {
  const t = new Date("2026-07-20T06:00:00.000Z");
  return {
    id: "j1",
    tipo,
    payload: {},
    estado: "processing",
    intentos: 1,
    maxIntentos: 5,
    runAfter: t,
    lockedAt: t,
    lastError: null,
    dedupeKey,
    createdAt: t,
    updatedAt: t,
  };
}

function liberacionEspia(): { service: ILiberacionReprogramadaService; dias: string[] } {
  const dias: string[] = [];
  const service: ILiberacionReprogramadaService = {
    ejecutarLiberacion: vi.fn(async (hoy: Date) => {
      dias.push(hoy.toISOString().slice(0, 10));
      return { evaluadas: 0, liberadas: 0, omitidas: 0 };
    }),
    liberarPorCierreAprobado: vi.fn(),
    liberarOrdenCorregida: vi.fn(),
  };
  return { service, dias };
}

function rollupEspia(): { service: IAnaliticaRollupService; fechas: string[] } {
  const fechas: string[] = [];
  return {
    fechas,
    service: {
      agregarFecha: async (fecha: string) => {
        fechas.push(fecha);
        return { fecha, filasEscritas: 0, filasRetiradas: 0, ms: 0 };
      },
    },
  };
}

const LOGGER_MUDO = { info: () => undefined };

/** El instante «antes del despliegue»: la formula vieja de `proximaCorridaLiberarCR` (00:00 CR = 06:00 UTC). */
function proximaCorridaViejaCR(now: Date, hhUtc: number, mm: number): Date {
  const crWall = new Date(now.getTime() - 6 * 3600_000);
  return new Date(Date.UTC(crWall.getUTCFullYear(), crWall.getUTCMonth(), crWall.getUTCDate() + 1, hhUtc, mm));
}

describe("R26 — con una sola zona, los mismos instantes que antes de SLT-42", () => {
  const instantes = [
    "2026-07-19T18:00:00.000Z",
    "2026-07-19T05:59:59.999Z",
    "2026-07-19T06:00:00.000Z",
    "2026-07-19T06:29:59.999Z",
    "2026-07-19T06:30:00.000Z",
    "2026-07-31T23:00:00.000Z",
    "2026-12-31T20:00:00.000Z",
  ];

  it.each(instantes)("liberar desde %s: las 00:00 CR de antes (06:00 UTC)", (iso) => {
    const now = new Date(iso);
    const { runAfter } = recurrenciaLiberarReprogramadas.siguiente(now, [CR]);
    expect(runAfter.toISOString()).toBe(proximaCorridaViejaCR(now, 6, 0).toISOString());
  });

  // Fuera de la media hora 00:00-00:30 CR (ver el caso siguiente), la formula vieja del rollup.
  const fueraDeLaMediaHora = instantes.filter((iso) => !/T06:(00|29)/.test(iso));

  it.each(fueraDeLaMediaHora)("rollup desde %s: las 00:30 CR de antes (06:30 UTC)", (iso) => {
    const now = new Date(iso);
    const { runAfter } = recurrenciaAnaliticaRollupDiario.siguiente(now, [CR]);
    expect(runAfter.toISOString()).toBe(proximaCorridaViejaCR(now, 6, 30).toISOString());
  });

  it("rollup entre las 00:00 y las 00:30 CR: la corrida de HOY (antes se saltaba a la de manana)", () => {
    // Solo pasa si se siembra en esa media hora; la serie re-agenda siempre despues de las 00:30.
    const now = new Date("2026-07-19T06:10:00.000Z");
    expect(proximaCorridaViejaCR(now, 6, 30).toISOString()).toBe("2026-07-20T06:30:00.000Z");
    expect(recurrenciaAnaliticaRollupDiario.siguiente(now, [CR]).runAfter.toISOString()).toBe(
      "2026-07-19T06:30:00.000Z",
    );
  });

  it("la clave nueva lleva la zona y la fecha local (liberar: de la corrida; rollup: el objetivo D-1)", () => {
    const now = new Date("2026-07-19T18:00:00.000Z");
    expect(recurrenciaLiberarReprogramadas.siguiente(now, [CR]).dedupeKey).toBe(
      "liberar_reprogramadas:America/Costa_Rica:2026-07-20",
    );
    expect(recurrenciaAnaliticaRollupDiario.siguiente(now, [CR]).dedupeKey).toBe(
      "analitica_rollup_diario:America/Costa_Rica:2026-07-19",
    );
  });

  it("cada empresa se procesa una sola vez por dia local: tres dias de corridas encadenadas", async () => {
    const { service, dias } = liberacionEspia();
    let now = new Date("2026-07-19T18:00:00.000Z");
    for (let i = 0; i < 3; i += 1) {
      const { runAfter, dedupeKey } = recurrenciaLiberarReprogramadas.siguiente(now, [CR]);
      now = runAfter;
      await crearLiberarReprogramadasHandler(service, () => now, reglasPaisFijas())(job("liberar_reprogramadas", dedupeKey));
    }
    expect(dias).toEqual(["2026-07-20", "2026-07-21", "2026-07-22"]);
  });
});

describe("R26 — compatibilidad con la clave vieja, sin zona (job pendiente de antes del despliegue)", () => {
  it("la clave vieja corre para TODAS las empresas, cada una con su «hoy» local", async () => {
    // 05:30 UTC del 20: en Bogota ya es el 20 (00:30); en CR todavia el 19 (23:30).
    const ahora = () => new Date("2026-07-20T05:30:00.000Z");
    const { service, dias } = liberacionEspia();
    const vieja = job("liberar_reprogramadas", "liberar_reprogramadas:2026-07-20");
    await crearLiberarReprogramadasHandler(service, ahora, reglasPaisFijas())(vieja);
    await crearLiberarReprogramadasHandler(service, ahora, reglasPaisFijas({ paisId: "CO", zonaHoraria: BOGOTA }))(vieja);
    expect(dias).toEqual(["2026-07-19", "2026-07-20"]);
    expect(leerClaveConZona(vieja.dedupeKey, "liberar_reprogramadas")).toBeNull();
  });

  it("la vieja y la nueva en el mismo instante: la segunda corrida pide el mismo dia (idempotente por empresa y dia)", async () => {
    const ahora = () => new Date("2026-07-20T06:00:00.000Z");
    const { service, dias } = liberacionEspia();
    const handler = crearLiberarReprogramadasHandler(service, ahora, reglasPaisFijas());
    await handler(job("liberar_reprogramadas", "liberar_reprogramadas:2026-07-20"));
    await handler(job("liberar_reprogramadas", "liberar_reprogramadas:America/Costa_Rica:2026-07-20"));
    expect(dias).toEqual(["2026-07-20", "2026-07-20"]);
  });

  it("rollup con la clave vieja: agrega el D-1 de la zona de la empresa", async () => {
    const { service, fechas } = rollupEspia();
    await crearAnaliticaRollupDiarioHandler(
      service,
      () => new Date("2026-08-02T06:30:00.000Z"),
      LOGGER_MUDO,
      undefined,
      reglasPaisFijas(),
    )(job("analitica_rollup_diario", "analitica_rollup_diario:2026-08-01"));
    expect(fechas).toEqual(["2026-08-01"]);
  });
});

describe("R25 — con dos zonas, la corrida es la de la zona que antes llega y solo procesa sus empresas", () => {
  it("la serie alterna Bogota (05:00 UTC) y CR (06:00 UTC), cada dia", () => {
    const zonas = [CR, BOGOTA];
    const a = recurrenciaLiberarReprogramadas.siguiente(new Date("2026-07-19T18:00:00.000Z"), zonas);
    expect(a.runAfter.toISOString()).toBe("2026-07-20T05:00:00.000Z");
    expect(a.dedupeKey).toBe("liberar_reprogramadas:America/Bogota:2026-07-20");
    const b = recurrenciaLiberarReprogramadas.siguiente(a.runAfter, zonas);
    expect(b.runAfter.toISOString()).toBe("2026-07-20T06:00:00.000Z");
    expect(b.dedupeKey).toBe("liberar_reprogramadas:America/Costa_Rica:2026-07-20");
    const c = recurrenciaLiberarReprogramadas.siguiente(b.runAfter, zonas);
    expect(c.runAfter.toISOString()).toBe("2026-07-21T05:00:00.000Z");
  });

  it("el orden de `zonas` no cambia la eleccion", () => {
    const now = new Date("2026-07-19T18:00:00.000Z");
    expect(recurrenciaAnaliticaRollupDiario.siguiente(now, [BOGOTA, CR])).toEqual(
      recurrenciaAnaliticaRollupDiario.siguiente(now, [CR, BOGOTA]),
    );
  });

  it("la corrida de Bogota no toca la empresa de CR, y la de CR no toca la de Bogota", async () => {
    const corridaBogota = job("liberar_reprogramadas", "liberar_reprogramadas:America/Bogota:2026-07-20");
    const corridaCr = job("liberar_reprogramadas", "liberar_reprogramadas:America/Costa_Rica:2026-07-20");
    const enCr = liberacionEspia();
    const enBogota = liberacionEspia();
    const hCr = crearLiberarReprogramadasHandler(enCr.service, () => new Date("2026-07-20T05:00:00.000Z"), reglasPaisFijas());
    const hBo = crearLiberarReprogramadasHandler(
      enBogota.service,
      () => new Date("2026-07-20T05:00:00.000Z"),
      reglasPaisFijas({ paisId: "CO", zonaHoraria: BOGOTA }),
    );
    await hCr(corridaBogota);
    await hBo(corridaBogota);
    expect(enCr.dias).toEqual([]);
    expect(enBogota.dias).toEqual(["2026-07-20"]);

    await hCr(corridaCr);
    await hBo(corridaCr);
    expect(enCr.dias).toEqual(["2026-07-19"]); // el `now` inyectado es las 23:00 del 19 en CR
    expect(enBogota.dias).toEqual(["2026-07-20"]);
  });

  it("rollup: la corrida de Bogota agrega el D-1 de Bogota y no toca CR", async () => {
    const corridaBogota = job("analitica_rollup_diario", "analitica_rollup_diario:America/Bogota:2026-08-01");
    const cr = rollupEspia();
    const bo = rollupEspia();
    const ahora = () => new Date("2026-08-02T05:30:00.000Z"); // 00:30 Bogota del 2
    await crearAnaliticaRollupDiarioHandler(cr.service, ahora, LOGGER_MUDO, undefined, reglasPaisFijas())(corridaBogota);
    await crearAnaliticaRollupDiarioHandler(
      bo.service,
      ahora,
      LOGGER_MUDO,
      undefined,
      reglasPaisFijas({ paisId: "CO", zonaHoraria: BOGOTA }),
    )(corridaBogota);
    expect(cr.fechas).toEqual([]);
    expect(bo.fechas).toEqual(["2026-08-01"]);
  });

  it("empate (CR y Guatemala, las dos UTC-6): una corrida, la clave con la primera, y procesa las dos", async () => {
    const { runAfter, dedupeKey } = recurrenciaLiberarReprogramadas.siguiente(new Date("2026-07-19T18:00:00.000Z"), [
      GUATEMALA,
      CR,
    ]);
    expect(runAfter.toISOString()).toBe("2026-07-20T06:00:00.000Z");
    expect(dedupeKey).toBe("liberar_reprogramadas:America/Costa_Rica:2026-07-20");
    const gt = liberacionEspia();
    await crearLiberarReprogramadasHandler(
      gt.service,
      () => runAfter,
      reglasPaisFijas({ paisId: "GT", zonaHoraria: GUATEMALA }),
    )(job("liberar_reprogramadas", dedupeKey));
    expect(gt.dias).toEqual(["2026-07-20"]);
    // La siguiente ya es la de manana: si la empatada no entrara aqui, no correria nunca.
    expect(recurrenciaLiberarReprogramadas.siguiente(runAfter, [GUATEMALA, CR]).runAfter.toISOString()).toBe(
      "2026-07-21T06:00:00.000Z",
    );
  });

  it("con horario de verano (Madrid), la corrida es a las 00:00 locales reales en invierno y en verano (R23)", () => {
    const inv = recurrenciaLiberarReprogramadas.siguiente(new Date("2026-01-15T12:00:00.000Z"), ["Europe/Madrid"]);
    const ver = recurrenciaLiberarReprogramadas.siguiente(new Date("2026-07-15T12:00:00.000Z"), ["Europe/Madrid"]);
    expect(inv.runAfter.toISOString()).toBe("2026-01-15T23:00:00.000Z");
    expect(ver.runAfter.toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });

  it("sin zonas (ningun pais con empresas tiene zona): la serie no muere, se agenda en la zona de reserva", () => {
    const { runAfter, dedupeKey } = recurrenciaLiberarReprogramadas.siguiente(new Date("2026-07-19T18:00:00.000Z"), []);
    expect(runAfter.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(dedupeKey).toBe(`liberar_reprogramadas:${ZONA_SIN_EMPRESAS}:2026-07-20`);
  });
});

describe("R28 — una empresa sin zona falla sola, sin escribir nada", () => {
  it("el handler falla con PaisSinZonaHoraria antes de llamar al servicio", async () => {
    const { service, dias } = liberacionEspia();
    const sinZona = reglasPaisFijas({ paisId: "XA", zonaHoraria: null });
    await expect(
      crearLiberarReprogramadasHandler(service, () => new Date("2026-07-20T06:00:00.000Z"), sinZona)(
        job("liberar_reprogramadas", "liberar_reprogramadas:America/Costa_Rica:2026-07-20"),
      ),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(dias).toEqual([]);

    const r = rollupEspia();
    await expect(
      crearAnaliticaRollupDiarioHandler(r.service, () => new Date("2026-08-02T06:30:00.000Z"), LOGGER_MUDO, undefined, sinZona)(
        job("analitica_rollup_diario", "analitica_rollup_diario:2026-08-01"),
      ),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(r.fechas).toEqual([]);
  });

  it("dentro de la serie (conSuEmpresa), la empresa sin zona falla y las demas corren; el job falla despues", async () => {
    // Tres empresas: A en CR, B sin zona, C en Bogota. El puerto lee la empresa del contexto, como
    // el real.
    const zonaDe: Record<string, string | null> = { A: CR, B: null, C: BOGOTA };
    const reglas: Pick<IReglasPaisEmpresa, "zonaHoraria"> = {
      zonaHoraria: async () => {
        const ctx = contextoActual();
        if (ctx?.tipo !== "empresa") throw new Error("sin empresa");
        const z = zonaDe[ctx.organizacionId];
        if (z === null) throw new PaisSinZonaHoraria("XA");
        return z;
      },
    };
    const procesadas: string[] = [];
    const service: ILiberacionReprogramadaService = {
      ejecutarLiberacion: vi.fn(async () => {
        const ctx = contextoActual();
        if (ctx?.tipo === "empresa") procesadas.push(ctx.organizacionId);
        return { evaluadas: 0, liberadas: 0, omitidas: 0 };
      }),
      liberarPorCierreAprobado: vi.fn(),
      liberarOrdenCorregida: vi.fn(),
    };
    const empresas: ClienteDeOrganizaciones = {
      organizacion: { findMany: vi.fn(async () => [{ id: "A" }, { id: "B" }, { id: "C" }]) },
    };
    const handler = conSuEmpresa(
      crearLiberarReprogramadasHandler(service, () => new Date("2026-07-20T06:00:00.000Z"), reglas),
      true,
      { empresas },
    );
    const errores = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // Clave vieja: todas las empresas, cada una con su zona.
      await expect(handler(job("liberar_reprogramadas", "liberar_reprogramadas:2026-07-20"))).rejects.toThrow(
        /fallo en 1 empresa\(s\): B/,
      );
    } finally {
      errores.mockRestore();
    }
    expect(procesadas).toEqual(["A", "C"]);
  });
});

describe("T6.1 — la cola lee las zonas con empresas antes de llamar a `siguiente`", () => {
  const config: JobsConfig = {
    JOBS_BATCH_SIZE: 10,
    JOBS_VISIBILITY_TIMEOUT_MS: 60_000,
    JOBS_BACKOFF_BASE_MS: 1000,
    JOBS_BACKOFF_CAP_MS: 60_000,
  } as JobsConfig;

  function repoCon(jobs: JobDTO[]) {
    const encolados: { tipo: JobTipo; opts?: EnqueueOpts }[] = [];
    const repo: IJobRepository = {
      claimBatch: async () => jobs,
      complete: async () => undefined,
      findByDedupeKeys: async () => [],
      fail: async () => undefined,
      descartar: async () => undefined,
      enqueue: async (tipo, _payload, opts) => {
        encolados.push({ tipo, opts });
        return null;
      },
    };
    return { repo, encolados };
  }

  it("pasa las zonas a la recurrencia y las lee UNA vez por corrida, aunque se re-agenden varios", async () => {
    const recibidas: (readonly string[])[] = [];
    const espia: RecurrenciaSpec = {
      siguiente(now, zonas) {
        recibidas.push(zonas);
        return { runAfter: now, dedupeKey: `x:${recibidas.length}` };
      },
    };
    const { repo } = repoCon([
      job("liberar_reprogramadas", null),
      { ...job("analitica_rollup_diario", null), id: "j2" },
    ]);
    const ok: JobHandler = async () => undefined;
    const zonas = vi.fn(async () => [BOGOTA, CR]);
    const s = new JobQueueService(
      repo,
      new Map<JobTipo, JobHandler>([
        ["liberar_reprogramadas", ok],
        ["analitica_rollup_diario", ok],
      ]),
      new Map<JobTipo, RecurrenciaSpec>([
        ["liberar_reprogramadas", espia],
        ["analitica_rollup_diario", espia],
      ]),
      config,
      () => new Date("2026-07-19T18:00:00.000Z"),
      { warn: () => undefined },
      zonas,
    );
    await s.drenar(10);
    expect(recibidas).toEqual([
      [BOGOTA, CR],
      [BOGOTA, CR],
    ]);
    expect(zonas).toHaveBeenCalledTimes(1);
  });

  it("si nada se re-agenda, no lee las zonas", async () => {
    const { repo } = repoCon([job("geocodificacion", null)]);
    const zonas = vi.fn(async () => [CR]);
    const s = new JobQueueService(
      repo,
      new Map<JobTipo, JobHandler>([["geocodificacion", async () => undefined]]),
      new Map(),
      config,
      () => new Date(),
      { warn: () => undefined },
      zonas,
    );
    await s.drenar(10);
    expect(zonas).not.toHaveBeenCalled();
  });

  it("con las zonas reales en la cola, el diario se encola con la zona que antes llega", async () => {
    // Sin clave con zona, la corrida original es `runAfter`.
    const { repo, encolados } = repoCon([
      { ...job("liberar_reprogramadas", null), runAfter: new Date("2026-07-19T18:00:00.000Z") },
    ]);
    const s = new JobQueueService(
      repo,
      new Map<JobTipo, JobHandler>([["liberar_reprogramadas", async () => undefined]]),
      new Map<JobTipo, RecurrenciaSpec>([["liberar_reprogramadas", recurrenciaLiberarReprogramadas]]),
      config,
      () => new Date("2026-07-19T18:00:00.000Z"),
      { warn: () => undefined },
      async () => [CR, BOGOTA],
    );
    await s.drenar(10);
    expect(encolados).toEqual([
      {
        tipo: "liberar_reprogramadas",
        opts: {
          runAfter: new Date("2026-07-20T05:00:00.000Z"),
          dedupeKey: "liberar_reprogramadas:America/Bogota:2026-07-20",
        },
      },
    ]);
  });

  // Decision del humano tras el bloque 6 (punto 3): `siguiente` cuenta desde la corrida ORIGINAL.
  it("corrida retrasada por reintentos: cuenta desde su instante original y no salta la zona siguiente", async () => {
    // Bogota 00:00 (05:00 UTC) reintentada hasta las 06:10 UTC: `runAfter` ya es el del backoff.
    // Desde el drenado, la siguiente seria Bogota de manana y CR se saltaria su dia.
    const retrasado: JobDTO = {
      ...job("liberar_reprogramadas", "liberar_reprogramadas:America/Bogota:2026-07-20"),
      intentos: 3,
      runAfter: new Date("2026-07-20T06:05:00.000Z"),
    };
    const { repo, encolados } = repoCon([retrasado]);
    const s = new JobQueueService(
      repo,
      new Map<JobTipo, JobHandler>([["liberar_reprogramadas", async () => undefined]]),
      new Map<JobTipo, RecurrenciaSpec>([["liberar_reprogramadas", recurrenciaLiberarReprogramadas]]),
      config,
      () => new Date("2026-07-20T06:10:00.000Z"),
      { warn: () => undefined },
      async () => [CR, BOGOTA],
    );
    await s.drenar(10);
    expect(encolados).toEqual([
      {
        tipo: "liberar_reprogramadas",
        opts: {
          runAfter: new Date("2026-07-20T06:00:00.000Z"),
          dedupeKey: "liberar_reprogramadas:America/Costa_Rica:2026-07-20",
        },
      },
    ]);
  });

  it("rollup retrasado: la corrida original sale de la clave (objetivo D-1 → corrida D a las 00:30)", () => {
    const retrasado: JobDTO = {
      ...job("analitica_rollup_diario", "analitica_rollup_diario:America/Bogota:2026-07-19"),
      runAfter: new Date("2026-07-20T06:35:00.000Z"),
    };
    const desde = recurrenciaAnaliticaRollupDiario.corridaOriginal?.(retrasado);
    expect(desde?.toISOString()).toBe("2026-07-20T05:30:00.000Z");
    expect(recurrenciaAnaliticaRollupDiario.siguiente(desde as Date, [CR, BOGOTA])).toEqual({
      runAfter: new Date("2026-07-20T06:30:00.000Z"),
      dedupeKey: "analitica_rollup_diario:America/Costa_Rica:2026-07-19",
    });
  });

  it("clave vieja, sin zona: la corrida original es `runAfter`; las series que no son por zona cuentan desde el drenado", async () => {
    const viejo = { ...job("liberar_reprogramadas", "liberar_reprogramadas:2026-07-20"), runAfter: new Date("2026-07-20T06:00:00.000Z") };
    expect(recurrenciaLiberarReprogramadas.corridaOriginal?.(viejo)).toEqual(viejo.runAfter);
    expect(recurrenciaWhatsappEnvioMantenimiento.corridaOriginal).toBeUndefined();
    expect(recurrenciaPlanCambiosVencidos.corridaOriginal).toBeUndefined();

    const recibidos: Date[] = [];
    const espia: RecurrenciaSpec = {
      siguiente(desde) {
        recibidos.push(desde);
        return { runAfter: desde, dedupeKey: "x" };
      },
    };
    const { repo } = repoCon([{ ...job("geocodificacion", null), runAfter: new Date("2026-07-19T00:00:00.000Z") }]);
    const ahora = new Date("2026-07-19T18:00:00.000Z");
    const s = new JobQueueService(
      repo,
      new Map<JobTipo, JobHandler>([["geocodificacion", async () => undefined]]),
      new Map<JobTipo, RecurrenciaSpec>([["geocodificacion", espia]]),
      config,
      () => ahora,
      { warn: () => undefined },
      async () => [CR],
    );
    await s.drenar(10);
    expect(recibidos).toEqual([ahora]);
  });

  // Decision del humano tras el bloque 6 (punto 2): sin zonas, UTC + un error en el log.
  it("sin zonas con empresas: la serie diaria se agenda en UTC y deja UN error en el log por corrida, sin datos de clientes", async () => {
    const { repo, encolados } = repoCon([
      job("liberar_reprogramadas", null),
      { ...job("analitica_rollup_diario", null), id: "j2" },
      { ...job("whatsapp_envio_mantenimiento", null), id: "j3" },
    ]);
    const errores: string[] = [];
    const ok: JobHandler = async () => undefined;
    const s = new JobQueueService(
      repo,
      new Map<JobTipo, JobHandler>([
        ["liberar_reprogramadas", ok],
        ["analitica_rollup_diario", ok],
        ["whatsapp_envio_mantenimiento", ok],
      ]),
      new Map<JobTipo, RecurrenciaSpec>([
        ["liberar_reprogramadas", recurrenciaLiberarReprogramadas],
        ["analitica_rollup_diario", recurrenciaAnaliticaRollupDiario],
        ["whatsapp_envio_mantenimiento", recurrenciaWhatsappEnvioMantenimiento],
      ]),
      config,
      () => new Date("2026-07-19T18:00:00.000Z"),
      { warn: () => undefined, error: (m) => errores.push(m) },
      async () => [],
    );
    await s.drenar(10);
    expect(errores).toEqual([AVISO_SIN_ZONAS]);
    // Desde la corrida original (`runAfter` 2026-07-20T06:00Z, sin clave): las 00:00 UTC siguientes.
    expect(encolados[0]?.opts?.dedupeKey).toBe(`liberar_reprogramadas:${ZONA_SIN_EMPRESAS}:2026-07-21`);

    // Otra corrida del mismo servicio vuelve a avisar.
    await s.drenar(10);
    expect(errores).toHaveLength(2);
  });

  it("con zonas, la cola no deja error; una serie que no es por zona no avisa aunque no haya zonas", async () => {
    const errores: string[] = [];
    const { repo } = repoCon([job("whatsapp_envio_mantenimiento", null)]);
    const s = new JobQueueService(
      repo,
      new Map<JobTipo, JobHandler>([["whatsapp_envio_mantenimiento", async () => undefined]]),
      new Map<JobTipo, RecurrenciaSpec>([["whatsapp_envio_mantenimiento", recurrenciaWhatsappEnvioMantenimiento]]),
      config,
      () => new Date("2026-07-19T18:00:00.000Z"),
      { warn: () => undefined, error: (m) => errores.push(m) },
      async () => [],
    );
    await s.drenar(10);
    expect(errores).toEqual([]);

    const otro = repoCon([job("liberar_reprogramadas", null)]);
    const conZonas = new JobQueueService(
      otro.repo,
      new Map<JobTipo, JobHandler>([["liberar_reprogramadas", async () => undefined]]),
      new Map<JobTipo, RecurrenciaSpec>([["liberar_reprogramadas", recurrenciaLiberarReprogramadas]]),
      config,
      () => new Date("2026-07-19T18:00:00.000Z"),
      { warn: () => undefined, error: (m) => errores.push(m) },
      async () => [CR],
    );
    await conZonas.drenar(10);
    expect(errores).toEqual([]);
  });

  it("las recurrencias que no son diarias por zona ignoran `zonas`", () => {
    const now = new Date("2026-07-19T18:00:00.000Z");
    expect(recurrenciaWhatsappEnvioMantenimiento.siguiente(now, [BOGOTA])).toEqual(
      recurrenciaWhatsappEnvioMantenimiento.siguiente(now, []),
    );
    expect(recurrenciaPlanCambiosVencidos.siguiente(now, [BOGOTA])).toEqual(
      recurrenciaPlanCambiosVencidos.siguiente(now, []),
    );
  });
});
