import { describe, expect, it, vi } from "vitest";

import { handleAnaliticaApiKey } from "@/app/api/ordenes/api-key/analitica/route";
import type { ConsultaAnalitica } from "@/lib/analytics/consulta";
import { consultarAnaliticaIntegrador } from "@/lib/api/analitica-integrador";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IAnaliticaOperativaService } from "@/lib/interfaces/services/IAnaliticaOperativaService";
import type { ApiKeyAuthResult } from "@/lib/interfaces/services/IApiKeyAuthService";
import { ApiOrdenLecturaService } from "@/lib/services/ApiOrdenLecturaService";
import type { SerieOperativa } from "@/lib/types/analitica-operativa";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (T5.7; design §4.3 «API por key»; R22, R28) — el rango de fechas de la API por key se mide
// en la zona horaria del pais de la empresa de la key, no en la de Costa Rica. Los instantes
// esperados se escriben a mano: Costa Rica es UTC-6 y Bogota UTC-5, todo el año.

const BOGOTA = { paisId: "CO", zonaHoraria: "America/Bogota" } as const;

/* -------------------------------------------------------------------------------------------- */
/* Listado: `desde`/`hasta` -> instantes                                                          */
/* -------------------------------------------------------------------------------------------- */

function repoListado() {
  return {
    listByOwner: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findDetalleByOrdenIdForOwner: vi.fn().mockResolvedValue(null),
    findEstatusIdByValue: vi.fn().mockResolvedValue(null),
  };
}

const firmas = { createSignedUrl: vi.fn(), createSignedUrls: vi.fn(async () => ({})) };
const tarifas = { resolveTarifas: vi.fn().mockResolvedValue(new Map()) };
const ACTOR = { usuarioId: "tienda-1", rol: "apiKey" as const };

function servicioListado(reglas: ReturnType<typeof reglasPaisFijas>) {
  const repo = repoListado();
  const svc = new ApiOrdenLecturaService(repo as never, firmas as never, tarifas as never, reglas);
  return { repo, svc };
}

describe("SLT-42 R22 — listado por API key: el dia de `desde`/`hasta` es el de la empresa de la key", () => {
  it("el mismo `desde=hasta=2026-08-10` empieza a las 06:00Z en Costa Rica y a las 05:00Z en Bogota", async () => {
    const cr = servicioListado(reglasPaisFijas());
    const co = servicioListado(reglasPaisFijas(BOGOTA));

    await cr.svc.listar(ACTOR, { limit: 50, offset: 0, desde: "2026-08-10", hasta: "2026-08-10" });
    await co.svc.listar(ACTOR, { limit: 50, offset: 0, desde: "2026-08-10", hasta: "2026-08-10" });

    const enCR = cr.repo.listByOwner.mock.calls[0]![0];
    const enCO = co.repo.listByOwner.mock.calls[0]![0];
    expect(enCR.createdAtDesde.toISOString()).toBe("2026-08-10T06:00:00.000Z");
    expect(enCR.createdAtHasta.toISOString()).toBe("2026-08-11T06:00:00.000Z");
    expect(enCO.createdAtDesde.toISOString()).toBe("2026-08-10T05:00:00.000Z");
    expect(enCO.createdAtHasta.toISOString()).toBe("2026-08-11T05:00:00.000Z");
  });

  it("sin rango de fechas no se lee la zona: un pais sin zona sigue listando", async () => {
    const reglas = reglasPaisFijas({ zonaHoraria: null });
    const zonaHoraria = vi.spyOn(reglas, "zonaHoraria");
    const { repo, svc } = servicioListado(reglas);

    await svc.listar(ACTOR, { limit: 50, offset: 0 });

    expect(zonaHoraria).not.toHaveBeenCalled();
    expect(repo.listByOwner).toHaveBeenCalledTimes(1);
  });

  it("R28: con rango y sin zona en el pais, falla con PaisSinZonaHoraria sin consultar el repositorio", async () => {
    const { repo, svc } = servicioListado(reglasPaisFijas({ zonaHoraria: null }));

    await expect(
      svc.listar(ACTOR, { limit: 50, offset: 0, desde: "2026-08-10" }),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(repo.listByOwner).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------------------------- */
/* Analitica por API key                                                                          */
/* -------------------------------------------------------------------------------------------- */

/** 2026-08-04T05:30Z: las 23:30 del 3 en Costa Rica y las 00:30 del 4 en Bogota. */
const AHORA = new Date("2026-08-04T05:30:00.000Z");

function servicioAnalitica() {
  const consultar = vi.fn(async (consulta: ConsultaAnalitica): Promise<SerieOperativa> => ({
    metricaId: consulta.metrica.id,
    unidad: consulta.metrica.unidad,
    unidadDeConteo: consulta.metrica.unidadDeConteo,
    rango: consulta.rango,
    puntos: [],
    cobertura: { fechasNoComparables: [], penumbra: "ordenes_vivas_al_horizonte_sin_transicion_posterior" },
  }));
  const service: IAnaliticaOperativaService = {
    consultar,
    async consultarAgregado(): Promise<never> {
      throw new Error("este canal sirve la serie");
    },
  };
  return { service, consultar };
}

const OK: ApiKeyAuthResult = {
  status: "ok",
  actor: { usuarioId: "u-integrador", rol: "apiKey" },
  apiKeyId: "k1",
} as ApiKeyAuthResult;

describe("SLT-42 R22 — analitica por API key: el rango se resuelve en la zona de la empresa de la key", () => {
  it("el limite inferior del dia pedido es las 00:00 de Bogota, no las de Costa Rica", async () => {
    const enCR = servicioAnalitica();
    const enCO = servicioAnalitica();
    const raw = { rango: "personalizado", desde: "2026-08-01", hasta: "2026-08-02" };
    const actor = { usuarioId: "u-integrador", rol: "apiKey" as const };

    await consultarAnaliticaIntegrador(
      { actor, metricaIds: ["entregas"], raw },
      { service: enCR.service, now: () => AHORA, reglasPais: reglasPaisFijas(), logger: { logError: vi.fn() } },
    );
    await consultarAnaliticaIntegrador(
      { actor, metricaIds: ["entregas"], raw },
      { service: enCO.service, now: () => AHORA, reglasPais: reglasPaisFijas(BOGOTA), logger: { logError: vi.fn() } },
    );

    expect(enCR.consultar.mock.calls[0]![0].rango.desde.toISOString()).toBe("2026-08-01T06:00:00.000Z");
    expect(enCO.consultar.mock.calls[0]![0].rango.desde.toISOString()).toBe("2026-08-01T05:00:00.000Z");
  });

  it("por HTTP, sin `hasta`, «hoy» es el 3 en Costa Rica y el 4 en Bogota con el mismo instante", async () => {
    const enCR = servicioAnalitica();
    const enCO = servicioAnalitica();
    const url = "http://localhost/api/ordenes/api-key/analitica?metricas=entregas&desde=2026-08-01";
    const peticion = () => new Request(url, { headers: { authorization: "Bearer sk_prueba" } });
    const comun = { autenticar: async () => OK };

    const r1 = await handleAnaliticaApiKey(peticion(), {
      ...comun,
      analitica: { service: enCR.service, now: () => AHORA, reglasPais: reglasPaisFijas(), logger: { logError: vi.fn() } },
    });
    const r2 = await handleAnaliticaApiKey(peticion(), {
      ...comun,
      analitica: { service: enCO.service, now: () => AHORA, reglasPais: reglasPaisFijas(BOGOTA), logger: { logError: vi.fn() } },
    });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(enCR.consultar.mock.calls[0]![0].rango.hastaFecha).toBe("2026-08-03");
    expect(enCO.consultar.mock.calls[0]![0].rango.hastaFecha).toBe("2026-08-04");
  });

  it("R28: sin zona en el pais de la key, el borde falla con PaisSinZonaHoraria y no consulta nada", async () => {
    const { service, consultar } = servicioAnalitica();

    await expect(
      consultarAnaliticaIntegrador(
        {
          actor: { usuarioId: "u-integrador", rol: "apiKey" },
          metricaIds: ["entregas"],
          raw: { rango: "personalizado", desde: "2026-08-01", hasta: "2026-08-02" },
        },
        { service, now: () => AHORA, reglasPais: reglasPaisFijas({ zonaHoraria: null }), logger: { logError: vi.fn() } },
      ),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(consultar).not.toHaveBeenCalled();
  });
});
