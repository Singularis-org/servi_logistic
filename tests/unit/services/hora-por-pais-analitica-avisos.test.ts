import { describe, it, expect, vi } from "vitest";

import { prepararConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { zonaDelBordeConActor } from "@/lib/actions/_shared/zona-del-borde";
import { horaUtcDeHoraLocal } from "@/lib/config/aviso-reparto-manana";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IPremioRankingRepository } from "@/lib/interfaces/repositories/IPremioRankingRepository";
import type { IRankingRepository } from "@/lib/interfaces/repositories/IRankingRepository";
import type { IUserRepository } from "@/lib/interfaces/repositories/IUserRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { fechaObjetivo, ventanaDelDia } from "@/lib/ranking/snapshot-dia";
import { AvisosDiariosService } from "@/lib/services/AvisosDiariosService";
import { primeraRutaPendiente } from "@/lib/services/OptimizacionRutaService";
import { RankingService } from "@/lib/services/RankingService";
import { RepartoMananaAvisoService } from "@/lib/services/RepartoMananaAvisoService";
import { TableroDiaService } from "@/lib/services/TableroDiaService";
import { zonaDeOrganizacionCon } from "@/lib/services/zona-de-la-empresa";
import { tiempoRelativo } from "@/lib/utils/tiempo-relativo";
import { proximaOcurrencia } from "@/lib/whatsapp-envios/proxima-ocurrencia";
import { cortesPorZona } from "@/lib/whatsapp-envios/informes/transito/calculo";
import { PARAMETROS_POR_DEFECTO } from "@/lib/whatsapp-envios/informes/transito/parametros";
import { HistorialDoble, OrdenesDoble, RepositorioDoble } from "@/tests/unit/services/_doble-tablero-dia";
import { reglasPaisFijas, ZONA_DE_CR } from "@/tests/fabricas/reglas-pais";

// =================================================================================================
// SLT-42 (T5.5, design §4.3) — ANALITICA, TABLERO, RANKING, NOTIFICACIONES, AVISOS, INFORMES DE
// WHATSAPP, RUTAS Y LA FECHA QUE MUESTRAN LOS PLANES, CON LA ZONA DEL PAIS DE LA EMPRESA.
//
//   · R22: con otra zona (Bogota, UTC-5 fijo) el mismo instante cae en otro dia que en Costa Rica.
//   · R23: con horario de verano el dia sigue a la pared (23 o 25 h) y la hora local tambien.
//   · R24: el cron de cada empresa calcula su fecha con la zona de SU pais.
//   · R28: sin zona en el pais, la operacion falla con `PaisSinZonaHoraria` sin leer ni escribir.
//   · R30: la misma instancia atiende a dos empresas seguidas sin recordar la zona de la primera.
// =================================================================================================

const BOGOTA = "America/Bogota";
const MADRID = "Europe/Madrid";
const NUEVA_YORK = "America/New_York";

const costaRica = () => reglasPaisFijas();
const bogota = () => reglasPaisFijas({ paisId: "CO", zonaHoraria: BOGOTA });
const madrid = () => reglasPaisFijas({ paisId: "ES", zonaHoraria: MADRID });
const sinZona = () => reglasPaisFijas({ paisId: "XX", zonaHoraria: null });

/** 05:30Z del 21 de agosto: las 23:30 del 20 en Costa Rica y las 00:30 del 21 en Bogota. */
const ENTRE_MEDIANOCHES = new Date("2026-08-21T05:30:00.000Z");
const MAESTRO = { usuarioId: "u-maestro", rol: "maestro", zonaId: null } as const;

// ─── Analitica: el rango del filtro ──────────────────────────────────────────────────────────────

describe("SLT-42 · analitica — el rango sale de la zona que le da el borde", () => {
  it("R22: el preset «dia» es el 20 en Costa Rica y el 21 en Bogota para el mismo instante", () => {
    const actor = { usuarioId: "u-1", rol: "maestro" } as never;
    const cr = prepararConteoEntregas({ rango: "dia" }, actor, ZONA_DE_CR, ENTRE_MEDIANOCHES);
    const co = prepararConteoEntregas({ rango: "dia" }, actor, BOGOTA, ENTRE_MEDIANOCHES);
    if (cr.status !== "ok" || co.status !== "ok") throw new Error("consulta no concedida");
    expect(cr.consulta.rango?.desdeFecha).toBe("2026-08-20");
    expect(cr.consulta.rango?.desde.toISOString()).toBe("2026-08-20T06:00:00.000Z");
    expect(co.consulta.rango?.desdeFecha).toBe("2026-08-21");
    expect(co.consulta.rango?.desde.toISOString()).toBe("2026-08-21T05:00:00.000Z");
  });

  it("R28: en el borde, con actor y sin zona en el pais, falla con PaisSinZonaHoraria", async () => {
    await expect(zonaDelBordeConActor({ usuarioId: "u-1" }, sinZona())).rejects.toBeInstanceOf(
      PaisSinZonaHoraria,
    );
  });

  it("sin actor no se lee la zona: la preparacion responde `sin_sesion` como siempre", async () => {
    const reglas = { zonaHoraria: vi.fn(async () => BOGOTA) };
    const zona = await zonaDelBordeConActor(null, reglas);
    expect(reglas.zonaHoraria).not.toHaveBeenCalled();
    expect(prepararConteoEntregas({ rango: "dia" }, null, zona, ENTRE_MEDIANOCHES)).toEqual({
      status: "forbidden",
      motivo: "sin_sesion",
    });
  });
});

// ─── Tablero del dia ─────────────────────────────────────────────────────────────────────────────

function tablero(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const repo = new RepositorioDoble();
  const service = new TableroDiaService(repo, new OrdenesDoble(), new HistorialDoble(), undefined, reglasPais);
  return { repo, service };
}

describe("SLT-42 · tablero del dia", () => {
  it("R22: el mismo instante es el tablero del 20 en Costa Rica y el del 21 en Bogota", async () => {
    const cr = tablero(costaRica());
    const co = tablero(bogota());
    const a = await cr.service.obtener(MAESTRO, ENTRE_MEDIANOCHES);
    const b = await co.service.obtener(MAESTRO, ENTRE_MEDIANOCHES);
    expect(a.estado === "ok" && a.tablero.fecha).toBe("2026-08-20");
    expect(b.estado === "ok" && b.tablero.fecha).toBe("2026-08-21");
    expect(co.repo.conteos[0]?.ventana.desde.toISOString()).toBe("2026-08-21T05:00:00.000Z");
  });

  it("R28: sin zona en el pais, falla con PaisSinZonaHoraria y no consulta el repositorio", async () => {
    const { repo, service } = tablero(sinZona());
    await expect(service.obtener(MAESTRO, ENTRE_MEDIANOCHES)).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    await expect(service.detalle(MAESTRO, ENTRE_MEDIANOCHES, "m-1")).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(repo.conteos).toHaveLength(0);
    expect(repo.detalles).toHaveLength(0);
  });

  it("R30: la misma instancia atiende a dos empresas seguidas sin recordar la zona de la primera", async () => {
    let zona = ZONA_DE_CR;
    const { repo, service } = tablero({ zonaHoraria: async () => zona });
    await service.obtener(MAESTRO, ENTRE_MEDIANOCHES);
    zona = BOGOTA;
    await service.obtener(MAESTRO, ENTRE_MEDIANOCHES);
    expect(repo.conteos.map((c) => c.ventana.desde.toISOString())).toEqual([
      "2026-08-20T06:00:00.000Z",
      "2026-08-21T05:00:00.000Z",
    ]);
  });
});

// ─── Ranking ─────────────────────────────────────────────────────────────────────────────────────

function ranking(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const contarEntregadasPorMensajero = vi.fn(async (_desde: Date, _hasta: Date) => []);
  const contarAsignadasPorMensajero = vi.fn(async (_desde: Date, _hasta: Date, _dia: Date) => []);
  const service = new RankingService(
    { contarEntregadasPorMensajero, contarAsignadasPorMensajero } as unknown as IRankingRepository,
    { listMensajeros: vi.fn(async () => []) } as unknown as IUserRepository,
    { listar: vi.fn(async () => []) } as unknown as IPremioRankingRepository,
    { MIN_ASIGNADAS_PODIO: 1 },
    reglasPais,
  );
  return { service, contarEntregadasPorMensajero, contarAsignadasPorMensajero };
}

describe("SLT-42 · ranking del dia y su snapshot", () => {
  it("R23: el dia que Madrid adelanta el reloj, la ventana del ranking dura 23 h de pared a pared", async () => {
    const m = ranking(madrid());
    await m.service.obtenerRanking(MAESTRO as never, new Date("2026-03-29T12:00:00.000Z"));
    const [desde, hasta] = m.contarEntregadasPorMensajero.mock.calls[0]!;
    expect(desde.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect((hasta.getTime() - desde.getTime()) / 3_600_000).toBe(23);
    expect(m.contarAsignadasPorMensajero.mock.calls[0]![2].toISOString()).toBe("2026-03-29T00:00:00.000Z");
  });

  it("R28: sin zona, el ranking falla sin contar nada", async () => {
    const m = ranking(sinZona());
    await expect(m.service.obtenerRanking(MAESTRO as never, ENTRE_MEDIANOCHES)).rejects.toBeInstanceOf(
      PaisSinZonaHoraria,
    );
    expect(m.contarEntregadasPorMensajero).not.toHaveBeenCalled();
  });

  it("R24: la corrida del snapshot a las 07:30Z congela el 20 en Costa Rica y el 21 en Tokio", () => {
    const corrida = new Date("2026-08-22T07:30:00.000Z"); // 01:30 CR del 22; 16:30 Tokio del 22
    expect(fechaObjetivo(corrida, ZONA_DE_CR)).toBe("2026-08-21");
    expect(fechaObjetivo(ENTRE_MEDIANOCHES, ZONA_DE_CR)).toBe("2026-08-19");
    expect(fechaObjetivo(ENTRE_MEDIANOCHES, BOGOTA)).toBe("2026-08-20");
    expect(ventanaDelDia("2026-08-20", BOGOTA).desde.toISOString()).toBe("2026-08-20T05:00:00.000Z");
  });
});

// ─── Avisos diarios y reparto de mañana (crons por empresa) ──────────────────────────────────────

describe("SLT-42 · avisos de los crons, por empresa", () => {
  function avisos(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
    const repo = {
      resumenNovedadesPorTienda: vi.fn(async () => []),
      resumenRepresadasGlobal: vi.fn(async () => ({ total: 0, masAntiguaAt: null })),
      resumenRepresadasPorZona: vi.fn(async () => []),
    };
    const retenidas = { resumen: vi.fn(async (_hoy: Date, _zona: string) => ({ total: 0, cierres: [], sinCierre: [] })) };
    const service = new AvisosDiariosService(
      repo as never,
      { contarIntentosEnLote: vi.fn(async () => new Map()) } as never,
      retenidas as never,
      3,
      undefined,
      undefined,
      undefined,
      undefined,
      reglasPais,
    );
    return { service, repo, retenidas };
  }

  it("R24: el dia de la corrida y el de las retenidas salen de la zona del pais de la empresa", async () => {
    const co = avisos(bogota());
    const r = await co.service.ejecutar(ENTRE_MEDIANOCHES);
    expect(r.fecha).toBe("2026-08-21");
    const [hoy, zona] = co.retenidas.resumen.mock.calls[0]!;
    expect(hoy.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(zona).toBe(BOGOTA);
    expect((await avisos(costaRica()).service.ejecutar(ENTRE_MEDIANOCHES)).fecha).toBe("2026-08-20");
  });

  it("R28: sin zona la corrida de esa empresa falla antes de leer o emitir nada", async () => {
    const x = avisos(sinZona());
    await expect(x.service.ejecutar(ENTRE_MEDIANOCHES)).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(x.repo.resumenNovedadesPorTienda).not.toHaveBeenCalled();
    expect(x.retenidas.resumen).not.toHaveBeenCalled();
  });

  it("R22: el reparto de mañana anuncia el dia siguiente al de la pared de la empresa", async () => {
    const resumenPorMensajero = vi.fn(async (_dia: Date) => []);
    const service = new RepartoMananaAvisoService(
      { resumenPorMensajero } as never,
      { findMensajerosBloqueadosPorCierres: vi.fn(async () => new Set<string>()) },
      undefined,
      undefined,
      bogota(),
    );
    const r = await service.ejecutar(ENTRE_MEDIANOCHES);
    expect(r.fecha).toBe("2026-08-21");
    expect(r.diaAnunciado).toBe("2026-08-22");
    expect(resumenPorMensajero.mock.calls[0]![0].toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });

  it("R23: la hora UTC del aviso sigue al desfase del instante en una zona con horario de verano", () => {
    expect(horaUtcDeHoraLocal(19, NUEVA_YORK, new Date("2026-07-01T12:00:00.000Z"))).toBe(23);
    expect(horaUtcDeHoraLocal(19, NUEVA_YORK, new Date("2026-12-01T12:00:00.000Z"))).toBe(0);
  });
});

// ─── Notificaciones ──────────────────────────────────────────────────────────────────────────────

describe("SLT-42 · el «ayer» de la campana", () => {
  it("R22: un aviso de las 23:50 del 20 leido a las 00:10 es de «ayer» en Bogota y de hoy en CR", () => {
    const emitido = new Date("2026-08-21T04:50:00.000Z"); // 23:50 Bogota del 20; 22:50 CR del 20
    const leido = new Date("2026-08-21T05:10:00.000Z"); // 00:10 Bogota del 21; 23:10 CR del 20
    expect(tiempoRelativo(emitido, leido, BOGOTA)).toBe("ayer");
    expect(tiempoRelativo(emitido, leido, ZONA_DE_CR)).toBe("hace 20 min");
  });
});

// ─── Informes y envios de WhatsApp ───────────────────────────────────────────────────────────────

describe("SLT-42 · informes y envios de WhatsApp", () => {
  it("R23: el envio de las 05:00 cae a las 05:00 de pared en Madrid, en verano y en invierno", () => {
    const verano = proximaOcurrencia([1, 2, 3, 4, 5, 6, 7], "05:00", new Date("2026-07-01T00:00:00.000Z"), MADRID);
    const invierno = proximaOcurrencia([1, 2, 3, 4, 5, 6, 7], "05:00", new Date("2026-12-01T00:00:00.000Z"), MADRID);
    expect(verano).toEqual({ fechaCr: "2026-07-01", instante: new Date("2026-07-01T03:00:00.000Z") });
    expect(invierno).toEqual({ fechaCr: "2026-12-01", instante: new Date("2026-12-01T04:00:00.000Z") });
  });

  it("R22: el corte del transito es el comienzo del dia local de la zona de la empresa", () => {
    const zonas = [{ id: "z-1", nombre: "Central", esCentral: true, plazoDias: null, avisoDias: null }] as never;
    const parametros = { ...PARAMETROS_POR_DEFECTO, zonas: [{ zonaId: "z-1", plazoDias: 3, avisoDias: 1 }] };
    const [cr] = cortesPorZona(zonas, parametros, ENTRE_MEDIANOCHES, ZONA_DE_CR);
    const [co] = cortesPorZona(zonas, parametros, ENTRE_MEDIANOCHES, BOGOTA);
    // Umbral de alerta = plazo - aviso = 2 dias: el corte es el comienzo del dia de mañana - 2.
    expect(cr!.corte.toISOString()).toBe("2026-08-19T06:00:00.000Z");
    expect(co!.corte.toISOString()).toBe("2026-08-20T05:00:00.000Z");
  });
});

// ─── Rutas ───────────────────────────────────────────────────────────────────────────────────────

describe("SLT-42 · rutas: la primera ruta pendiente del dia", () => {
  it("R22: una ruta calculada a las 23:40 del 20 en CR ya es «de ayer» a las 00:30 de Bogota", () => {
    const ruta = { calculadaAt: new Date("2026-08-21T04:40:00.000Z") }; // 22:40 CR / 23:40 Bogota del 20
    expect(primeraRutaPendiente(ruta, ENTRE_MEDIANOCHES, ZONA_DE_CR)).toBe(false);
    expect(primeraRutaPendiente(ruta, ENTRE_MEDIANOCHES, BOGOTA)).toBe(true);
  });
});

// ─── Planes: la fecha que se muestra ─────────────────────────────────────────────────────────────

describe("SLT-42 · planes: la fecha que se muestra es la del pais de la empresa", () => {
  it("R22/R28: la zona sale del pais de la empresa nombrada; sin zona, PaisSinZonaHoraria", async () => {
    const pais = (zonaHoraria: string | null) => ({ deLaEmpresa: vi.fn(async () => ({ id: "CO", zonaHoraria }) as never) });
    await expect(zonaDeOrganizacionCon(pais(BOGOTA))("org-co")).resolves.toBe(BOGOTA);
    await expect(zonaDeOrganizacionCon(pais(null))("org-xx")).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    await expect(
      zonaDeOrganizacionCon({ deLaEmpresa: vi.fn(async () => null) })("org-nada"),
    ).rejects.toThrow("no existe");
  });
});
