import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { GeocodificacionService } from "@/lib/services/GeocodificacionService";
import { GoogleGeocodeClient } from "@/lib/clients/google-geocode";
import { GoogleMapsProbador } from "@/lib/clients/probadores/google-maps-probador";
import { GeocodeSaludRepository } from "@/lib/repositories/GeocodeSaludRepository";
import {
  GOOGLE_API_LOG_PREFIJO,
  MOTIVOS_LLAMADA_GEOCODE,
  type MotivoLlamadaGeocode,
} from "@/lib/clients/registro-llamada-google";
import {
  encolarGeocodificacion,
  motivoGeocodeDeCarga,
} from "@/lib/services/jobs/geocodificacion-encolado";
import type { JobConEmpresa } from "@/lib/interfaces/repositories/IJobRepository";
import type { IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";
import type { IOrdenGeocodeRepository } from "@/lib/interfaces/repositories/IOrdenGeocodeRepository";
import type { IGeocodeCacheRepository } from "@/lib/interfaces/repositories/IGeocodeCacheRepository";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";

// SLT-59 (D27; R70, R73; design §13.2) — el motivo del geocode viaja en `payload.motivo` desde
// quien encola hasta la línea `[google-api]` del cliente real (con `fetch` simulado).

const AHORA = new Date("2026-10-31T12:00:00.000Z");
const ORDEN = {
  id: "orden-1",
  direccion: "Av. Central 100",
  distritoNombre: "Carmen",
  cantonNombre: "San José",
  provinciaNombre: "San José",
};
const GEO_OK = {
  status: "OK",
  results: [{ geometry: { location: { lat: 9.93, lng: -84.08 }, location_type: "ROOFTOP" } }],
};

function respuesta(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function job(payload: Record<string, unknown>, intentos = 1): JobConEmpresa {
  return {
    organizacionId: "org-1",
    id: "job-1",
    tipo: "geocodificacion",
    payload,
    estado: "processing",
    intentos,
    maxIntentos: 8,
    runAfter: AHORA,
    lockedAt: AHORA,
    lastError: null,
    dedupeKey: null,
    createdAt: AHORA,
    updatedAt: AHORA,
  };
}

function build(opts: { enCache?: boolean; status?: number } = {}) {
  const lineas: string[] = [];
  const registro = { info: (l: string) => lineas.push(l) };
  const fetchImpl = vi.fn(async () => respuesta(GEO_OK, opts.status ?? 200)) as unknown as typeof fetch;
  const service = new GeocodificacionService(
    {
      findParaGeocodificar: vi.fn(async () => ORDEN),
      guardarResultado: vi.fn(async () => {}),
    } as unknown as IOrdenGeocodeRepository,
    {
      findByHash: vi.fn(async () =>
        opts.enCache === true ? { latitud: 9.9, longitud: -84.1, precision: "ROOFTOP" } : null,
      ),
      upsert: vi.fn(async () => {}),
    } as unknown as IGeocodeCacheRepository,
    {
      leer: vi.fn(async () => ({
        estado: "lista",
        integracionId: "int",
        credencial: { clave_api: "clave-secreta" },
        datosPublicos: {},
      })),
      marcarRechazo: vi.fn(async () => {}),
    } as unknown as ICredencialesIntegracion,
    (clave) => new GoogleGeocodeClient({ apiKey: clave, fetchImpl, registro, empresaId: () => "org-1" }),
    () => AHORA,
    { warn: () => {} },
  );
  const leidas = () =>
    lineas.map((l) => JSON.parse(l.slice(GOOGLE_API_LOG_PREFIJO.length + 1)) as Record<string, unknown>);
  return { service, lineas, leidas, fetchImpl };
}

describe("T8.3 — el handler pasa `payload.motivo` al cliente: un caso por motivo de §13.2", () => {
  const DE_JOB = MOTIVOS_LLAMADA_GEOCODE.filter(
    (m): m is Exclude<MotivoLlamadaGeocode, "prueba_integracion" | "job_sin_motivo"> =>
      m !== "prueba_integracion" && m !== "job_sin_motivo",
  );

  it.each(DE_JOB)("%s llega a la línea con el ordenId y el intento del job", async (motivo) => {
    const h = build();
    await h.service.ejecutar(job({ ordenId: ORDEN.id, motivo }, 3));
    expect(h.leidas()).toEqual([
      expect.objectContaining({
        api: "geocoding",
        motivo,
        empresaId: "org-1",
        ordenId: ORDEN.id,
        mensajeroId: null,
        paradas: null,
        intento: 3,
        maxIntentos: 8,
        resultado: "ok",
      }),
    ]);
  });

  it("job_sin_motivo: un job encolado antes del despliegue, sin `motivo` en el payload", async () => {
    const h = build();
    await h.service.ejecutar(job({ ordenId: ORDEN.id }));
    expect(h.leidas()[0].motivo).toBe("job_sin_motivo");
  });

  it("un `motivo` fuera de la lista es un payload invalido: no llama ni registra", async () => {
    const h = build();
    await expect(h.service.ejecutar(job({ ordenId: ORDEN.id, motivo: "inventado" }))).rejects.toThrow(
      /payload invalido/,
    );
    expect(h.lineas).toHaveLength(0);
  });

  it("R70: un reintento tras un 500 deja una línea por intento, con su número", async () => {
    const fallo = build({ status: 500 });
    await expect(fallo.service.ejecutar(job({ ordenId: ORDEN.id, motivo: "carga_masiva" }, 1))).rejects.toThrow();
    expect(fallo.leidas()[0]).toMatchObject({ intento: 1, maxIntentos: 8, resultado: "500" });
  });

  it("R72: un acierto de cache no llama al proveedor ni deja línea", async () => {
    const h = build({ enCache: true });
    await h.service.ejecutar(job({ ordenId: ORDEN.id, motivo: "orden_creada" }));
    expect(h.fetchImpl).not.toHaveBeenCalled();
    expect(h.lineas).toHaveLength(0);
  });
});

describe("T8.3 — cada llamador encola con el suyo (§13.2)", () => {
  function cola() {
    const enqueue = vi.fn(async () => null);
    return { repo: { enqueue } as unknown as IJobRepository, enqueue };
  }

  it("encolarGeocodificacion guarda el motivo en el payload, junto al id (sin la direccion)", async () => {
    const { repo, enqueue } = cola();
    await encolarGeocodificacion(repo, undefined, { id: "o1", direccion: "Av. 1" }, "direccion_cambiada");
    expect((enqueue.mock.calls[0] as unknown[])[1]).toEqual({ ordenId: "o1", motivo: "direccion_cambiada" });
  });

  it("BulkOrdenService: la carga de archivo es `carga_masiva`; la API de la tienda, `orden_creada`", () => {
    // `cargarMasiva` registra `carga_masiva`; `cargarViaApi`, `carga_api` (BulkOrdenService:319, :679).
    expect(motivoGeocodeDeCarga("carga_masiva")).toBe("carga_masiva");
    expect(motivoGeocodeDeCarga("carga_api")).toBe("orden_creada");
    expect(motivoGeocodeDeCarga("creacion_manual")).toBe("orden_creada");
  });

  it("OrdenRepository encola `direccion_cambiada` al cambiar la direccion y deriva el de los lotes", () => {
    const fuente = readFileSync(path.join(process.cwd(), "lib/repositories/OrdenRepository.ts"), "utf8");
    expect(fuente).toMatch(/\{ id, direccion: direccionNueva \},\s*"direccion_cambiada"/);
    expect(fuente.match(/motivoGeocodeDeCarga\(historial\.origenTipo\)/g)).toHaveLength(2);
  });

  it("revivido_por_salud: `revivirFallosConfig` reescribe `payload.motivo` en el mismo UPDATE", async () => {
    let sql = "";
    let valores: unknown[] = [];
    const prisma = {
      $queryRaw: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
        sql = partes.join("$");
        valores = v;
        return [{ id: "j1" }];
      }),
    };
    const repo = new GeocodeSaludRepository(prisma as unknown as ConstructorParameters<typeof GeocodeSaludRepository>[0]);
    const n = await repo.revivirFallosConfig({
      organizacionId: "org-1",
      ahora: AHORA,
      limite: 10,
      espaciadoMs: 1000,
      tocadoAntesDe: AHORA,
    });
    expect(n).toBe(1);
    expect(sql).toMatch(/UPDATE "jobs" AS j\s+SET[\s\S]*"payload"\s*=\s*jsonb_set\(j\."payload", '\{motivo\}'/);
    expect(valores).toContain("revivido_por_salud");
  });
});

describe("T8.3 — el probador de Google Maps registra `prueba_integracion` (R73)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("una línea `geocoding` con intento 1 de 1, por el canal real", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const probador = new GoogleMapsProbador({
      fetchImpl: vi.fn(async () => respuesta(GEO_OK)) as unknown as typeof fetch,
      logger: { warn: () => {} },
    });
    const r = await probador.probar({ clave_api: "clave-secreta" });
    expect(r.ok).toBe(true);
    const lineas = info.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith(GOOGLE_API_LOG_PREFIJO));
    expect(lineas).toHaveLength(1);
    expect(JSON.parse(lineas[0].slice(GOOGLE_API_LOG_PREFIJO.length + 1))).toMatchObject({
      api: "geocoding",
      motivo: "prueba_integracion",
      intento: 1,
      maxIntentos: 1,
    });
    expect(lineas[0]).not.toContain("clave-secreta");
  });
});
