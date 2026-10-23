import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { IJobQueueService } from "@/lib/interfaces/services/IJobQueueService";
import { handleCorteDiario } from "@/app/api/cron/corte-diario/route";
import { handleGenerarGastosFijos } from "@/app/api/cron/generar-gastos-fijos/route";
import { handleLiberarReprogramadas } from "@/app/api/cron/liberar-reprogramadas/route";
import { handleProcesarDevueltasSla } from "@/app/api/cron/procesar-devueltas-sla/route";
import { handleSnapshotRanking } from "@/app/api/cron/snapshot-ranking/route";
import { handlePurgaPdfCargas } from "@/app/api/cron/purga-pdf-cargas/route";
import { handlePurgaPostulacionesRecurso } from "@/app/api/cron/purga-postulaciones-recurso/route";
import { handleAvisoRepartoManana } from "@/app/api/cron/aviso-reparto-manana/route";
import { handleAvisosDiarios } from "@/app/api/cron/avisos-diarios/route";
import { handleSyncPlantillas } from "@/app/api/cron/sync-plantillas-whatsapp/route";
import { conSuEmpresa, handleProcesarJobs } from "@/app/api/cron/procesar-jobs/route";

// SL-17 / T2.3 + T2.3b (R16, R42) — los crons que tocan negocio y el drenador, con dobles:
//  - sin empresas, cada cron responde 200 sin llamar a su servicio (no toca datos) y con el
//    resumen en cero;
//  - con dos empresas, el servicio corre una vez por empresa, cada vez con ESA empresa en
//    contexto, y el fallo de una no frena a la otra;
//  - el drenador reclama y cierra en plataforma y corre cada job con su empresa.
// Que el trabajo quede en la base de cada empresa lo prueba T3.8 contra Postgres.

const SECRET = "s3cr3t-cron";
const AHORA = new Date("2026-10-22T12:00:00.000Z");

function req(): Request {
  return new Request("https://app.test/api/cron/x", {
    method: "GET",
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

function empresasDoble(ids: string[]): ClienteDeOrganizaciones {
  return { organizacion: { findMany: vi.fn(async () => ids.map((id) => ({ id }))) } };
}

type Deps = {
  getSecret: () => string;
  now: () => Date;
  service: unknown;
  empresas: ClienteDeOrganizaciones;
};

interface CasoCron {
  nombre: string;
  handle: (r: Request, deps: Deps) => Promise<Response>;
  metodo: string;
  /** Lo que devuelve el servicio en UNA corrida: todos los conteos a 1. */
  corrida: Record<string, unknown>;
  /** Cuerpo esperado sin empresas (sin la clave `empresas`). */
  vacio: Record<string, unknown>;
}

const CASOS: CasoCron[] = [
  {
    nombre: "corte-diario",
    handle: (r, d) => handleCorteDiario(r, d as never),
    metodo: "ejecutarCorte",
    corrida: { vencidosCreados: 1, mensajerosEvaluados: 1, mensajerosSinZona: 1 },
    vacio: { vencidosCreados: 0, mensajerosEvaluados: 0 },
  },
  {
    nombre: "generar-gastos-fijos",
    handle: (r, d) => handleGenerarGastosFijos(r, d as never),
    metodo: "ejecutarGeneracion",
    corrida: {
      fecha: "2026-10-22",
      plantillasActivas: 1,
      plantillasQueAplicanHoy: 1,
      egresosGenerados: 1,
      cobrosPendientesCreados: 1,
      cobrosPendientesTotales: 1,
    },
    vacio: {
      fecha: null,
      plantillasActivas: 0,
      plantillasQueAplicanHoy: 0,
      egresosGenerados: 0,
      cobrosPendientesCreados: 0,
      cobrosPendientesTotales: 0,
    },
  },
  {
    nombre: "liberar-reprogramadas",
    handle: (r, d) => handleLiberarReprogramadas(r, d as never),
    metodo: "ejecutarLiberacion",
    corrida: { evaluadas: 1, liberadas: 1, omitidas: 1, esperandoCierre: 1 },
    vacio: { evaluadas: 0, liberadas: 0, omitidas: 0, esperandoCierre: 0 },
  },
  {
    nombre: "procesar-devueltas-sla",
    handle: (r, d) => handleProcesarDevueltasSla(r, d as never),
    metodo: "ejecutar",
    corrida: { evaluadas: 1, liberadas: 1, escaladas: 1, omitidas: 1, legadas: 1 },
    vacio: { evaluadas: 0, liberadas: 0, escaladas: 0, omitidas: 0, legadas: 0 },
  },
  {
    nombre: "snapshot-ranking",
    handle: (r, d) => handleSnapshotRanking(r, d as never),
    metodo: "congelar",
    corrida: { status: "creado", fecha: "2026-10-21", filas: 1 },
    vacio: { fecha: null, estado: null, filas: 0 },
  },
  {
    nombre: "purga-pdf-cargas",
    handle: (r, d) => handlePurgaPdfCargas(r, d as never),
    metodo: "ejecutar",
    corrida: { cargasPurgadas: 1, ordenesAfectadas: 1, objetosBorrados: 1, quedaPendiente: false },
    vacio: { cargasPurgadas: 0, ordenesAfectadas: 0, objetosBorrados: 0, quedaPendiente: false },
  },
  {
    nombre: "purga-postulaciones-recurso",
    handle: (r, d) => handlePurgaPostulacionesRecurso(r, d as never),
    metodo: "ejecutar",
    corrida: { borradas: 1, corte: "2026-04-22", quedaPendiente: false },
    vacio: { borradas: 0, corte: null, quedaPendiente: false },
  },
  {
    nombre: "aviso-reparto-manana",
    handle: (r, d) => handleAvisoRepartoManana(r, d as never),
    metodo: "ejecutar",
    corrida: {
      fecha: "2026-10-22",
      diaAnunciado: "2026-10-23",
      mensajerosConReparto: 1,
      mensajerosBloqueados: 1,
      avisosEmitidos: 1,
      fallos: 1,
    },
    vacio: {
      fecha: null,
      diaAnunciado: null,
      mensajerosConReparto: 0,
      mensajerosBloqueados: 0,
      avisosEmitidos: 0,
      fallos: 0,
    },
  },
  {
    nombre: "avisos-diarios",
    handle: (r, d) => handleAvisosDiarios(r, d as never),
    metodo: "ejecutar",
    corrida: {
      fecha: "2026-10-22",
      tiendasConNovedades: 1,
      avisosNovedadesEmitidos: 1,
      ordenesRepresadas: 1,
      zonasConRepresadas: 1,
      avisosRepresadasEmitidos: 1,
      reprogramadasRetenidas: 1,
      ambitosConRetenidas: 1,
      avisosRetenidasEmitidos: 1,
      fallos: 1,
    },
    vacio: {
      fecha: null,
      tiendasConNovedades: 0,
      avisosNovedadesEmitidos: 0,
      ordenesRepresadas: 0,
      zonasConRepresadas: 0,
      avisosRepresadasEmitidos: 0,
      reprogramadasRetenidas: 0,
      ambitosConRetenidas: 0,
      avisosRetenidasEmitidos: 0,
      fallos: 0,
    },
  },
  {
    nombre: "sync-plantillas-whatsapp",
    handle: (r, d) => handleSyncPlantillas(r, d as never),
    metodo: "sincronizar",
    corrida: { leidas: 1, actualizadas: 1, sinCambios: 1, ignoradas: 1 },
    vacio: { leidas: 0, actualizadas: 0, sinCambios: 0, ignoradas: 0 },
  },
];

/** Servicio doble: anota el contexto de datos de cada llamada; `falla` lanza en esa empresa. */
function servicioDoble(caso: CasoCron, falla?: string) {
  const contextos: (ContextoDatos | undefined)[] = [];
  const fn = vi.fn(async () => {
    const ctx = contextoActual();
    contextos.push(ctx);
    if (falla !== undefined && ctx?.tipo === "empresa" && ctx.organizacionId === falla) {
      throw new Error(`fallo provocado en ${falla}`);
    }
    return caso.corrida;
  });
  return { service: { [caso.metodo]: fn }, fn, contextos };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // `paraCadaEmpresa` registra el fallo de cada empresa por `console.error`.
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe.each(CASOS)("cron $nombre por empresa (R16)", (caso) => {
  const deps = (service: unknown, ids: string[]): Deps => ({
    getSecret: () => SECRET,
    now: () => AHORA,
    service,
    empresas: empresasDoble(ids),
  });

  it("sin empresas: 200, no llama al servicio y el resumen va en cero", async () => {
    const { service, fn } = servicioDoble(caso);

    const res = await caso.handle(req(), deps(service, []));

    expect(res.status).toBe(200);
    expect(fn).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ ...caso.vacio, empresas: { procesadas: 0, fallidas: [] } });
  });

  it("dos empresas: una corrida por empresa, cada una con la suya en contexto, y el resumen suma", async () => {
    const { service, contextos } = servicioDoble(caso);

    const res = await caso.handle(req(), deps(service, ["org-a", "org-b"]));

    expect(res.status).toBe(200);
    expect(contextos).toEqual([
      { tipo: "empresa", organizacionId: "org-a" },
      { tipo: "empresa", organizacionId: "org-b" },
    ]);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.empresas).toEqual({ procesadas: 2, fallidas: [] });
    for (const [k, v] of Object.entries(caso.vacio)) {
      if (typeof v === "number") expect(body[k], k).toBe(2);
    }
  });

  it("el fallo de una empresa no frena a la otra y queda en el resumen", async () => {
    const { service, contextos } = servicioDoble(caso, "org-a");

    const res = await caso.handle(req(), deps(service, ["org-a", "org-b"]));

    expect(res.status).toBe(200);
    expect(contextos).toHaveLength(2);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.empresas).toEqual({ procesadas: 1, fallidas: ["org-a"] });
    for (const [k, v] of Object.entries(caso.vacio)) {
      if (typeof v === "number") expect(body[k], k).toBe(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Drenador (R42, R16)                                                         */
/* -------------------------------------------------------------------------- */

function job(organizacionId: string | null): JobDTO {
  const base: JobDTO = {
    id: "job-1",
    tipo: "liberar_reprogramadas",
    payload: {},
    estado: "processing",
    intentos: 1,
    maxIntentos: 3,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
  };
  // El campo lo pone `JobRepository` (M4); `JobDTO` no lo declara.
  return { ...base, organizacionId } as JobDTO;
}

function handlerDoble(falla?: string) {
  const contextos: (ContextoDatos | undefined)[] = [];
  const fn = vi.fn(async () => {
    const ctx = contextoActual();
    contextos.push(ctx);
    if (falla !== undefined && ctx?.tipo === "empresa" && ctx.organizacionId === falla) {
      throw new Error("fallo provocado");
    }
  });
  return { fn, contextos };
}

describe("drenador: cada job con su empresa (R42)", () => {
  it("un job con empresa corre con esa empresa en contexto", async () => {
    const { fn, contextos } = handlerDoble();
    await conSuEmpresa(fn, false)(job("org-a"));
    expect(contextos).toEqual([{ tipo: "empresa", organizacionId: "org-a" }]);
  });

  it("un job con empresa NO itera empresas aunque su tipo sea recurrente", async () => {
    const { fn, contextos } = handlerDoble();
    const empresas = empresasDoble(["org-a", "org-b"]);
    await conSuEmpresa(fn, true, { empresas })(job("org-b"));
    expect(contextos).toEqual([{ tipo: "empresa", organizacionId: "org-b" }]);
    expect(empresas.organizacion.findMany).not.toHaveBeenCalled();
  });

  it("un job sin empresa y por evento corre en plataforma, con la ficha SL-17", async () => {
    const { fn, contextos } = handlerDoble();
    await conSuEmpresa(fn, false)(job(null));
    expect(contextos).toEqual([{ tipo: "plataforma", ficha: "SL-17", motivo: "job sin empresa" }]);
  });

  it("un recurrente sin empresa y sin empresas en la base no ejecuta nada y no falla (R16)", async () => {
    const { fn } = handlerDoble();
    await expect(
      conSuEmpresa(fn, true, { empresas: empresasDoble([]) })(job(null)),
    ).resolves.toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it("un recurrente sin empresa corre una vez por empresa, cada una en la suya (R16)", async () => {
    const { fn, contextos } = handlerDoble();
    await conSuEmpresa(fn, true, { empresas: empresasDoble(["org-a", "org-b"]) })(job(null));
    expect(contextos).toEqual([
      { tipo: "empresa", organizacionId: "org-a" },
      { tipo: "empresa", organizacionId: "org-b" },
    ]);
  });

  it("si una empresa falla, el recurrente corre las demas y DESPUES falla, para que el backoff lo reintente", async () => {
    const { fn, contextos } = handlerDoble("org-a");
    await expect(
      conSuEmpresa(fn, true, { empresas: empresasDoble(["org-a", "org-b"]) })(job(null)),
    ).rejects.toThrow(/org-a/);
    expect(contextos).toHaveLength(2);
  });

  it("el reclamo y el cierre (drenar) corren en plataforma", async () => {
    let ctx: ContextoDatos | undefined;
    const service: IJobQueueService = {
      drenar: vi.fn(async () => {
        ctx = contextoActual();
        return { procesados: 0, ok: 0, fallidos: 0, reintentados: 0, muertos: 0 };
      }),
    };
    const res = await handleProcesarJobs(req(), { getSecret: () => SECRET, service, now: () => AHORA });
    expect(res.status).toBe(200);
    expect(ctx).toEqual({
      tipo: "plataforma",
      ficha: "SL-17",
      motivo: "drenador: reclamo y cierre de jobs",
    });
  });
});
