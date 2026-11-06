import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RastreoPublicoConfig } from "@/lib/config/rastreo-publico";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type {
  IRastreoPublicoRepository,
  OrdenRastreoFila,
  TransicionRastreoFila,
} from "@/lib/interfaces/repositories/IRastreoPublicoRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { RastreoPublicoService } from "@/lib/services/RastreoPublicoService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (T5.6; design §4.3; R27) — el rastreo publico usa el pais de la empresa DUEÑA de la orden:
// la zona horaria con la que fecha cada entrada y el prefijo con el que normaliza el telefono del
// segundo factor. Quien rastrea no tiene sesion: la empresa la pone el composition root
// (`conEmpresa` con la empresa de la guia) y el servicio la lee por `IReglasPaisEmpresa`.
//
// Lo que NO puede cambiar (feature 229, R7/R8): una guia inexistente, un factor errado y un pais
// incompleto responden lo mismo y hacen el mismo trabajo. El pais no abre una via para saber si una
// guia existe.

// --- Composition root: dobles de la base, del contexto y del puerto real ---------------------------
const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  conEmpresa: vi.fn(),
  deLaEmpresa: vi.fn(),
}));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ orden: { findUnique: h.findUnique } }),
}));
vi.mock("@/lib/db/contexto-empresa", () => ({
  comoPlataforma: (_ficha: string, _motivo: string, fn: () => unknown) => fn(),
  conEmpresa: h.conEmpresa,
}));
vi.mock("@/lib/services/ReglasPaisEmpresaService", () => ({
  construirReglasPaisEmpresa: () => ({
    deLaEmpresa: h.deLaEmpresa,
    zonaHoraria: vi.fn(),
    tipoDocumento: vi.fn(),
  }),
}));

const { consultarRastreoPublico } = await import("@/lib/actions/rastreo-publico");
const { ResetRateLimiter } = await import("@/lib/utils/reset-rate-limit");

const CONFIG: RastreoPublicoConfig = { RATE_MAX: 8, RATE_WINDOW_MINUTES: 10, DIGITOS_SEGUNDO_FACTOR: 4 };

/** Bogota: UTC-5 todo el año, una hora mas que Costa Rica (UTC-6). Prefijo 57, 10 digitos. */
const BOGOTA = {
  paisId: "CO",
  zonaHoraria: "America/Bogota",
  telefono: { prefijo: "57", digitosNacionales: 10 },
} as const;

const ORDEN: OrdenRastreoFila = { id: "orden-1", numGuia: 4321, telefonoDest: "8888-7766", deletedAt: null };
const ORDEN_CO: OrdenRastreoFila = { id: "orden-2", numGuia: 4322, telefonoDest: "300 123 7766", deletedAt: null };

/** 2026-08-15T03:30Z: las 21:30 del 14 en Costa Rica y las 22:30 del 14 en Bogota. */
const INSTANTE = "2026-08-15T03:30:00.000Z";

function transicion(iso: string, estatusValue: string): TransicionRastreoFila {
  return { createdAt: new Date(iso), estatusValue };
}

/** Repositorio doble que cuenta cada lectura (lo que mide R8). */
function repoDoble(orden: OrdenRastreoFila | null, transiciones: TransicionRastreoFila[] = []) {
  const buscarPorGuia = vi.fn(async () => orden);
  const listarTransiciones = vi.fn(async () => transiciones);
  const buscarGestionPendiente = vi.fn(async () => null);
  const repo: IRastreoPublicoRepository = { buscarPorGuia, listarTransiciones, buscarGestionPendiente };
  return { repo, listarTransiciones, buscarGestionPendiente };
}

/** Puerto espiado: cuantas veces se leyo el pais. */
function reglasEspiadas(base: IReglasPaisEmpresa) {
  const deLaEmpresa = vi.fn(() => base.deLaEmpresa());
  return { reglas: { deLaEmpresa, zonaHoraria: () => base.zonaHoraria() }, deLaEmpresa };
}

describe("SLT-42 R27 — la fecha de cada evento, en la zona del pais de la empresa de la orden", () => {
  it("el mismo instante se publica a las 21:30 -06:00 en Costa Rica y a las 22:30 -05:00 en Bogota", async () => {
    const enCR = new RastreoPublicoService(
      repoDoble(ORDEN, [transicion(INSTANTE, "entregado")]).repo,
      CONFIG,
      reglasPaisFijas(),
    );
    const enCO = new RastreoPublicoService(
      repoDoble(ORDEN_CO, [transicion(INSTANTE, "entregado")]).repo,
      CONFIG,
      reglasPaisFijas(BOGOTA),
    );

    const cr = await enCR.consultar(4321, "7766");
    const co = await enCO.consultar(4322, "7766");
    if (cr.estado !== "ok" || co.estado !== "ok") throw new Error("se esperaba ok en los dos paises");

    expect(cr.envio.linea[0].fecha).toBe("2026-08-14T21:30-06:00");
    expect(cr.envio.actualizadoEn).toBe("2026-08-14T21:30-06:00");
    expect(co.envio.linea[0].fecha).toBe("2026-08-14T22:30-05:00");
    expect(co.envio.actualizadoEn).toBe("2026-08-14T22:30-05:00");
  });

  it("la entrada pendiente de confirmar tambien se fecha en la zona del pais", async () => {
    const dobles = repoDoble(ORDEN_CO, [transicion("2026-08-14T15:00:00.000Z", "en_reparto")]);
    dobles.buscarGestionPendiente.mockResolvedValue({
      resultado: "incidente",
      createdAt: new Date(INSTANTE),
    } as never);
    const service = new RastreoPublicoService(dobles.repo, CONFIG, reglasPaisFijas(BOGOTA));

    const r = await service.consultar(4322, "7766");
    if (r.estado !== "ok") throw new Error("se esperaba ok");
    const pendiente = r.envio.linea.find((e) => e.pendiente === true);
    expect(pendiente?.fecha).toBe("2026-08-14T22:30-05:00");
  });

  it("la misma instancia atiende dos ordenes de paises distintos sin recordar la zona de la primera", async () => {
    let pais: IReglasPaisEmpresa = reglasPaisFijas();
    const reglas = { deLaEmpresa: () => pais.deLaEmpresa(), zonaHoraria: () => pais.zonaHoraria() };
    const service = new RastreoPublicoService(repoDoble(ORDEN, [transicion(INSTANTE, "entregado")]).repo, CONFIG, reglas);

    const primera = await service.consultar(4321, "7766");
    pais = reglasPaisFijas(BOGOTA);
    const segunda = await service.consultar(4321, "7766");
    if (primera.estado !== "ok" || segunda.estado !== "ok") throw new Error("se esperaba ok");
    expect(primera.envio.linea[0].fecha).toBe("2026-08-14T21:30-06:00");
    expect(segunda.envio.linea[0].fecha).toBe("2026-08-14T22:30-05:00");
  });

  it("sin zona en el pais y con el factor correcto, falla con PaisSinZonaHoraria antes de leer el historial (R28)", async () => {
    const dobles = repoDoble(ORDEN, [transicion(INSTANTE, "entregado")]);
    const service = new RastreoPublicoService(dobles.repo, CONFIG, reglasPaisFijas({ zonaHoraria: null }));

    await expect(service.consultar(4321, "7766")).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(dobles.listarTransiciones).not.toHaveBeenCalled();
  });

  it("sin zona en el pais y con el factor ERRADO, responde no_encontrado: el pais no delata la guia", async () => {
    const service = new RastreoPublicoService(repoDoble(ORDEN).repo, CONFIG, reglasPaisFijas({ zonaHoraria: null }));
    await expect(service.consultar(4321, "0000")).resolves.toEqual({ estado: "no_encontrado" });
  });

  it("sin el puerto del pais, falla nombrandolo en vez de inventar una zona", async () => {
    const service = new RastreoPublicoService(repoDoble(ORDEN).repo, CONFIG);
    await expect(service.consultar(4321, "7766")).rejects.toThrow(/reglas del pais/);
  });

  it("el servicio ya no lee la zona de la configuracion ni de RASTREO_PUBLICO_ZONA_HORARIA", () => {
    const leer = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
    expect(leer("lib/services/RastreoPublicoService.ts")).not.toMatch(/ZONA_HORARIA/);
    expect(leer("lib/config/rastreo-publico.ts")).not.toMatch(/RASTREO_PUBLICO_ZONA_HORARIA|ZONA_HORARIA:/);
    expect(leer(".env.example")).not.toMatch(/RASTREO_PUBLICO_ZONA_HORARIA/);
  });
});

describe("SLT-42 R27 — el telefono del segundo factor, con el prefijo del pais de la empresa de la orden", () => {
  it("en Colombia, el factor tecleado con el prefijo 57 identifica el envio", async () => {
    const service = new RastreoPublicoService(
      repoDoble(ORDEN_CO, [transicion(INSTANTE, "entregado")]).repo,
      CONFIG,
      reglasPaisFijas(BOGOTA),
    );
    await expect(service.consultar(4322, "+57 300 123 7766")).resolves.toMatchObject({ estado: "ok" });
  });

  it("el servicio ya no usa el normalizador de Costa Rica", () => {
    const fuente = readFileSync(path.resolve(process.cwd(), "lib/services/RastreoPublicoService.ts"), "utf8");
    expect(fuente).not.toMatch(/normalizarTelefonoCR|telefono-cr/);
    expect(fuente).toMatch(/normalizarTelefono\b/);
  });

  it("pais sin reglas de telefono: no_encontrado, con el mismo trabajo que un factor errado", async () => {
    const incompleto = repoDoble(ORDEN, [transicion(INSTANTE, "entregado")]);
    const errado = repoDoble(ORDEN, [transicion(INSTANTE, "entregado")]);
    const espiaIncompleto = reglasEspiadas(reglasPaisFijas({ telefono: null }));
    const espiaErrado = reglasEspiadas(reglasPaisFijas());

    const r1 = await new RastreoPublicoService(incompleto.repo, CONFIG, espiaIncompleto.reglas).consultar(4321, "7766");
    const r2 = await new RastreoPublicoService(errado.repo, CONFIG, espiaErrado.reglas).consultar(4321, "0000");

    expect(r1).toEqual({ estado: "no_encontrado" });
    expect(r2).toEqual(r1);
    expect(espiaIncompleto.deLaEmpresa).toHaveBeenCalledTimes(1);
    expect(espiaErrado.deLaEmpresa).toHaveBeenCalledTimes(1);
    expect(incompleto.listarTransiciones).not.toHaveBeenCalled();
    expect(errado.listarTransiciones).not.toHaveBeenCalled();
  });

  it("R8 intacto: orden no visible y factor errado leen el pais igual y responden igual", async () => {
    const espiaSinFila = reglasEspiadas(reglasPaisFijas());
    const espiaErrado = reglasEspiadas(reglasPaisFijas());
    const sinFila = await new RastreoPublicoService(repoDoble(null).repo, CONFIG, espiaSinFila.reglas).consultar(4321, "7766");
    const errado = await new RastreoPublicoService(repoDoble(ORDEN).repo, CONFIG, espiaErrado.reglas).consultar(4321, "0000");
    expect(sinFila).toEqual(errado);
    expect(espiaSinFila.deLaEmpresa).toHaveBeenCalledTimes(1);
    expect(espiaErrado.deLaEmpresa).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-42 R27 — composition root: la empresa sale de la guia, y una guia inexistente no toca el pais", () => {
  const deps = () => ({
    getContext: async () => ({ ipAddress: "203.0.113.7" }),
    limiter: new ResetRateLimiter(),
  });

  beforeEach(() => {
    h.findUnique.mockReset();
    h.conEmpresa.mockReset();
    h.deLaEmpresa.mockReset();
  });

  it("guia inexistente: no_encontrado, como hoy, sin abrir empresa ni leer pais", async () => {
    h.findUnique.mockResolvedValue(null);

    const r = await consultarRastreoPublico({ numGuia: 999_999, factor: "7766" }, deps());

    expect(r).toEqual({ estado: "no_encontrado" });
    expect(h.conEmpresa).not.toHaveBeenCalled();
    expect(h.deLaEmpresa).not.toHaveBeenCalled();
  });

  it("guia existente: el pais se lee dentro de la empresa DUEÑA de la orden", async () => {
    // La primera lectura (en plataforma) pide solo la empresa; la segunda es la del repositorio.
    h.findUnique.mockImplementation(async (args: { select: Record<string, boolean> }) =>
      args.select.organizacionId
        ? { organizacionId: "org-co" }
        : { id: "orden-2", numGuia: 4322, telefonoDest: "300 123 7766", deletedAt: null },
    );
    let empresaAlLeerPais: string | null = null;
    let empresaAbierta: string | null = null;
    h.conEmpresa.mockImplementation(async (organizacionId: string, fn: () => Promise<unknown>) => {
      empresaAbierta = organizacionId;
      try {
        return await fn();
      } finally {
        empresaAbierta = null;
      }
    });
    h.deLaEmpresa.mockImplementation(async () => {
      empresaAlLeerPais = empresaAbierta;
      // Factor errado a proposito: corta en `no_encontrado` sin pedir el historial a la base.
      return { paisId: "CO", zonaHoraria: "America/Bogota", telefono: BOGOTA.telefono };
    });

    const r = await consultarRastreoPublico({ numGuia: 4322, factor: "0000" }, deps());

    expect(r).toEqual({ estado: "no_encontrado" });
    expect(h.conEmpresa).toHaveBeenCalledWith("org-co", expect.any(Function));
    expect(empresaAlLeerPais).toBe("org-co");
  });
});
