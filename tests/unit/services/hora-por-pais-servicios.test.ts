import { describe, it, expect, vi } from "vitest";

import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IGestionOrdenRepository } from "@/lib/interfaces/repositories/IGestionOrdenRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CorreccionDiaRepartoService } from "@/lib/services/CorreccionDiaRepartoService";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { MisAsignacionesService } from "@/lib/services/MisAsignacionesService";
import { OrdenService } from "@/lib/services/OrdenService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { CR, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { fakeIntentosEnLote } from "@/tests/fixtures/intentos-entrega";

// =================================================================================================
// SLT-42 (T5.3, design §4.3) — LOS SERVICIOS DE ORDENES, REPARTO, CIERRES Y CORTE CALCULAN EL DIA
// CON LA ZONA DEL PAIS DE LA EMPRESA.
//
// Lo que se mide aqui es lo que el servicio ENTREGA al repositorio: el dia, «hoy» y los limites de
// un dia, que antes salian de `fecha-cr` y ahora de `IReglasPaisEmpresa.zonaHoraria()`.
//   · R22: con otra zona (Bogota, UTC-5 fijo) el mismo instante cae en otro dia que en Costa Rica.
//   · R23: en una zona con horario de verano el limite sigue a la pared (el dia dura 23 o 25 h).
//   · R28: sin zona en el pais, la operacion falla con `PaisSinZonaHoraria` y no escribe nada.
//   · R30: nada se recuerda entre operaciones: la misma instancia atiende a dos empresas seguidas.
// =================================================================================================

const BOGOTA = "America/Bogota";
const NUEVA_YORK = "America/New_York";
const MADRID = "Europe/Madrid";

const bogota = () => reglasPaisFijas({ paisId: "CO", zonaHoraria: BOGOTA });
const sinZona = () => reglasPaisFijas({ paisId: "XX", zonaHoraria: null });
const fecha = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T00:00:00.000Z`);

// ─── CorteDiarioService ────────────────────────────────────────────────────────────────────────

function montarCorte(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const corteRepo = { findMensajerosConActividadSinCierre: vi.fn(async (_diaCerrado: Date) => []) };
  const cierreRepo = { findGestionesPendientes: vi.fn(async () => []), crearCierre: vi.fn(async () => null) };
  const zonaRepo = { findCentralZonaId: vi.fn(async () => "z-central") };
  const ordenRepo = {
    findUsuarioVehiculoId: vi.fn(async () => null),
    findEstatusIdByValue: vi.fn(async (v: string) => `st-${v}`),
  };
  const service = new CorteDiarioService(
    corteRepo as never,
    cierreRepo as never,
    zonaRepo,
    ordenRepo,
    {} as never,
    { warn: () => {} },
    undefined,
    reglasPais,
  );
  return { service, corteRepo, cierreRepo };
}

describe("SLT-42 — CorteDiarioService cierra la jornada de la zona de la empresa", () => {
  // 05:30Z del 21 de julio: en Costa Rica (UTC-6) son las 23:30 del 20; en Bogota (UTC-5), las
  // 00:30 del 21. El corte cierra «ayer»: el 19 en CR y el 20 en Bogota.
  const INSTANTE = new Date("2026-07-21T05:30:00.000Z");

  it("R22: el mismo instante cierra el 19 en Costa Rica y el 20 en Bogota", async () => {
    const cr = montarCorte(reglasPaisFijas(CR));
    await cr.service.ejecutarCorte(INSTANTE);
    expect(cr.corteRepo.findMensajerosConActividadSinCierre).toHaveBeenCalledWith(fecha("2026-07-19"));

    const co = montarCorte(bogota());
    await co.service.ejecutarCorte(INSTANTE);
    expect(co.corteRepo.findMensajerosConActividadSinCierre).toHaveBeenCalledWith(fecha("2026-07-20"));
  });

  it("R23: la noche del cambio de hora de Nueva York el ancla sigue a la pared, no a un desfase fijo", async () => {
    // El 8 de marzo de 2026 Nueva York adelanta el reloj (EST -5 -> EDT -4). 04:30Z del 9 son las
    // 00:30 EDT del 9: el corte cierra el 8. Con el desfase de invierno fijo (-5) serian las 23:30
    // del 8 y cerraria el 7.
    const { service, corteRepo } = montarCorte(reglasPaisFijas({ zonaHoraria: NUEVA_YORK }));
    await service.ejecutarCorte(new Date("2026-03-09T04:30:00.000Z"));
    expect(corteRepo.findMensajerosConActividadSinCierre).toHaveBeenCalledWith(fecha("2026-03-08"));
  });

  it("R28: sin zona en el pais, la corrida falla con PaisSinZonaHoraria y no lee ni escribe nada", async () => {
    const { service, corteRepo, cierreRepo } = montarCorte(sinZona());
    await expect(service.ejecutarCorte(INSTANTE)).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(corteRepo.findMensajerosConActividadSinCierre).not.toHaveBeenCalled();
    expect(cierreRepo.crearCierre).not.toHaveBeenCalled();
  });

  it("R30: la misma instancia atiende a dos empresas seguidas sin recordar la zona de la primera", async () => {
    // Una empresa de Bogota y luego una de Costa Rica, por el mismo servicio (como `paraCadaEmpresa`).
    const zonaHoraria = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce(BOGOTA)
      .mockResolvedValueOnce(CR.zonaHoraria as string);
    const { service, corteRepo } = montarCorte({ zonaHoraria });

    await service.ejecutarCorte(INSTANTE);
    await service.ejecutarCorte(INSTANTE);

    expect(corteRepo.findMensajerosConActividadSinCierre.mock.calls.map((c) => c[0])).toEqual([
      fecha("2026-07-20"),
      fecha("2026-07-19"),
    ]);
    // Y la zona se lee UNA vez por corrida, no una por mensajero ni una por consulta.
    expect(zonaHoraria).toHaveBeenCalledTimes(2);
  });
});

// ─── MisAsignacionesService ────────────────────────────────────────────────────────────────────

const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };

function fakeGestionRepo(): IGestionOrdenRepository {
  return {
    findMisAsignaciones: vi.fn(async () => []),
    findMisAsignacionesByIds: vi.fn(async () => []),
    contarEntregadas: vi.fn(async () => 0),
    sumMontoCobrarGestionadas: vi.fn(async () => 0),
    findByIdsParaGestion: vi.fn(async () => []),
    getOrdenEnGestion: vi.fn(async () => null),
    setOrdenEnGestion: vi.fn(async () => true),
    liberarOrdenEnGestion: vi.fn(async () => true),
    recogerLote: vi.fn(async (ids: string[]) => ids.length),
    registrarGestionPendiente: vi.fn(async () => ({ gestionId: "g1", ordenEventoId: "ev-g1" })),
    findBloqueoDeGestion: vi.fn(async () => null),
    findPendientesYAyudas: vi.fn(async () => ({
      conGestionPendiente: new Set<string>(),
      conAyudaAbierta: new Set<string>(),
    })),
    reprogramarDesdeDevuelta: vi.fn(async () => true),
    crearGestionDesdeAyuda: vi.fn(async () => "g-ayuda"),
    rechazarDesdeDevuelta: vi.fn(async () => true),
  } as unknown as IGestionOrdenRepository;
}

function montarMisAsignaciones(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const repo = fakeGestionRepo();
  const ordenRepo = {
    findEstatusIdByValue: vi.fn(async (v: string) => `st-${v}`),
    findOrdenesEnCorreccion: vi.fn(async () => new Set<string>()),
    findBloqueoDetalle: vi.fn(async () => SIN_BLOQUEO),
  };
  const storage: IFileStorage = { upload: vi.fn(async () => "p"), remove: vi.fn(async () => {}) };
  const signedUrls: ISignedUrlProvider = {
    createSignedUrl: vi.fn(async (p: string) => p),
    createSignedUrls: vi.fn(async () => ({})),
  };
  const service = new MisAsignacionesService(
    repo,
    ordenRepo,
    storage,
    signedUrls,
    { findByMensajero: vi.fn(async () => null), upsertOrigen: vi.fn(async () => {}) },
    { findMarcarLuegoByMensajero: vi.fn(async () => new Set<string>()) },
    fakeIntentosEnLote(),
    reglasPais,
  );
  return { service, repo, ordenRepo };
}

describe("SLT-42 — MisAsignacionesService mide «hoy» en la zona de la empresa", () => {
  it("R22: a las 04:30Z del 21, el dia de los KPIs es el 20 de Costa Rica o el 20 de Bogota, con sus bordes", async () => {
    // 04:30Z del 21 = 22:30 CR del 20 = 23:30 Bogota del 20: mismo dia, distinto instante de inicio.
    const ahora = new Date("2026-07-21T04:30:00.000Z");

    const cr = montarMisAsignaciones(reglasPaisFijas(CR));
    await cr.service.listarMisAsignaciones(MENSAJERO, ahora);
    expect(cr.repo.contarEntregadas).toHaveBeenCalledWith("m1", {
      desde: new Date("2026-07-20T06:00:00.000Z"),
      hasta: new Date("2026-07-21T06:00:00.000Z"),
    });

    const co = montarMisAsignaciones(bogota());
    await co.service.listarMisAsignaciones(MENSAJERO, ahora);
    expect(co.repo.contarEntregadas).toHaveBeenCalledWith("m1", {
      desde: new Date("2026-07-20T05:00:00.000Z"),
      hasta: new Date("2026-07-21T05:00:00.000Z"),
    });
  });

  it("R23: el dia que Madrid adelanta el reloj, la ventana de los KPIs dura 23 h", async () => {
    // 29 de marzo de 2026: Madrid pasa de CET (+1) a CEST (+2). El dia local empieza a las 23:00Z
    // del 28 y termina a las 22:00Z del 29.
    const { service, repo } = montarMisAsignaciones(reglasPaisFijas({ zonaHoraria: MADRID }));
    await service.listarMisAsignaciones(MENSAJERO, new Date("2026-03-29T12:00:00.000Z"));
    const dia = vi.mocked(repo.contarEntregadas).mock.calls[0]![1];
    expect(dia).toEqual({
      desde: new Date("2026-03-28T23:00:00.000Z"),
      hasta: new Date("2026-03-29T22:00:00.000Z"),
    });
    expect(dia.hasta.getTime() - dia.desde.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("R22: la jornada que nombra el bloqueo se fecha con la zona de la empresa", async () => {
    const { service, ordenRepo } = montarMisAsignaciones(bogota());
    await service.listarMisAsignaciones(MENSAJERO, new Date("2026-07-21T04:30:00.000Z"));
    expect(ordenRepo.findBloqueoDetalle).toHaveBeenCalledWith("m1", BOGOTA);
  });

  it("R28: sin zona, recoger falla con PaisSinZonaHoraria antes de tocar la escritura", async () => {
    const { service, repo } = montarMisAsignaciones(sinZona());
    await expect(
      service.recogerAsignaciones({ ordenIds: ["o1"] }, MENSAJERO, new Date("2026-07-21T04:30:00.000Z")),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(repo.recogerLote).not.toHaveBeenCalled();
  });
});

// ─── OrdenService ─────────────────────────────────────────────────────────────────────────────

describe("SLT-42 — OrdenService lee el filtro de fecha de creacion en la zona de la empresa", () => {
  const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };

  function montarOrden(reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
    const repo = { list: vi.fn(async (_args: unknown) => ({ items: [], total: 0 })) };
    const service = new OrdenService(
      repo as never,
      fakeIntentosEnLote(),
      () => new Date("2026-07-21T12:00:00.000Z"),
      reglasPais,
    );
    return { service, repo };
  }

  const filtroDel20 = { created_desde: "2026-07-20", created_hasta: "2026-07-20" };
  const listar = (service: OrdenService) =>
    service.listar(
      { page: 1, pageSize: 20, sortBy: "created_at", sortDir: "desc", filter: filtroDel20 },
      MAESTRO,
    );

  it("R22: «el 20» empieza a las 06:00Z en Costa Rica y a las 05:00Z en Bogota", async () => {
    const cr = montarOrden(reglasPaisFijas(CR));
    await listar(cr.service);
    expect(cr.repo.list.mock.calls[0]![0]).toMatchObject({
      where: { createdAt: { gte: new Date("2026-07-20T06:00:00.000Z"), lt: new Date("2026-07-21T06:00:00.000Z") } },
    });

    const co = montarOrden(bogota());
    await listar(co.service);
    expect(co.repo.list.mock.calls[0]![0]).toMatchObject({
      where: { createdAt: { gte: new Date("2026-07-20T05:00:00.000Z"), lt: new Date("2026-07-21T05:00:00.000Z") } },
    });
  });

  it("sin filtro de fecha no se consulta la zona (un listado sin fecha no depende del pais)", async () => {
    const zonaHoraria = vi.fn(async () => BOGOTA);
    const { service } = montarOrden({ zonaHoraria });
    await service.listar({ page: 1, pageSize: 20, sortBy: "created_at", sortDir: "desc" }, MAESTRO);
    expect(zonaHoraria).not.toHaveBeenCalled();
  });

  it("R28: con filtro de fecha y sin zona en el pais, el listado falla con PaisSinZonaHoraria", async () => {
    const { service, repo } = montarOrden(sinZona());
    await expect(listar(service)).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(repo.list).not.toHaveBeenCalled();
  });
});

// ─── R28 en las escrituras de cierres y reparto ────────────────────────────────────────────────

describe("SLT-42 (R28) — sin zona en el pais, las escrituras fallan sin escribir nada", () => {
  it("CierreDiaService.solicitarCierre: PaisSinZonaHoraria y ni una lectura del dia ni una escritura", async () => {
    const repo = {
      findCierreResolicitableMasViejo: vi.fn(async () => null),
      contarOrdenesPendientesGestion: vi.fn(async () => 0),
      findGestionesPendientes: vi.fn(async () => []),
      crearCierre: vi.fn(async () => "c-1"),
    };
    const ordenRepo = {
      findBloqueoDetalle: vi.fn(async () => SIN_BLOQUEO),
      findUsuarioZonaId: vi.fn(async () => "z1"),
    };
    const service = new CierreDiaService(
      repo as never,
      { findCentralZonaId: vi.fn(async () => "z-central") } as never,
      ordenRepo as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      sinZona(),
    );

    await expect(service.solicitarCierre(MENSAJERO, new Date("2026-07-21T04:30:00.000Z"))).rejects.toBeInstanceOf(
      PaisSinZonaHoraria,
    );
    expect(repo.contarOrdenesPendientesGestion).not.toHaveBeenCalled();
    expect(repo.crearCierre).not.toHaveBeenCalled();
  });

  it("CorreccionDiaRepartoService.corregir: PaisSinZonaHoraria y el lote no se escribe", async () => {
    const repo = {
      findUsuarioZonaId: vi.fn(async () => null),
      findByIdsForTransicion: vi.fn(async () => []),
      findEstatusIdByValue: vi.fn(async () => "st"),
      findIdsConGestionPendiente: vi.fn(async () => new Set<string>()),
      corregirDiaRepartoLote: vi.fn(async () => 1),
    };
    const service = new CorreccionDiaRepartoService(repo as never, undefined, sinZona());

    await expect(
      service.corregir({ ordenIds: ["o1"], dia: "manana", motivo: "cambio" }, { usuarioId: "u1", rol: "maestro" }),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(repo.findByIdsForTransicion).not.toHaveBeenCalled();
    expect(repo.corregirDiaRepartoLote).not.toHaveBeenCalled();
  });
});
