import { describe, it, expect, vi } from "vitest";

import { registrarAporteCapitalAction } from "@/lib/actions/aporte-capital";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IFiltrosWalletRepository } from "@/lib/interfaces/repositories/IFiltrosWalletRepository";
import type { IHistorialAccionRepository } from "@/lib/interfaces/repositories/IHistorialAccionRepository";
import type { IAporteCapitalService } from "@/lib/interfaces/services/IAporteCapitalService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { AporteCapitalService } from "@/lib/services/AporteCapitalService";
import { FiltrosWalletService } from "@/lib/services/FiltrosWalletService";
import { GeneracionGastosFijosService } from "@/lib/services/GeneracionGastosFijosService";
import { HistorialAccionService } from "@/lib/services/HistorialAccionService";
import { componerOrigen } from "@/lib/services/OrigenLegibleService";
import { WalletService } from "@/lib/services/WalletService";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";
import { CR, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// =================================================================================================
// SLT-42 (T5.4, design §4.3) — WALLET, LIQUIDACION, ESTADO DE CUENTA, GASTOS FIJOS, APORTES, CAJA E
// HISTORIAL CALCULAN EL DIA CON LA ZONA DEL PAIS DE LA EMPRESA.
//
// · R22: con otra zona (Bogota, UTC-5 todo el año) el mismo instante cae en otro dia que en Costa Rica
//   (UTC-6): «hoy», el inicio de un dia y el dia que se le pone a una fila salen de la zona del pais.
// · R23: el dia del cambio de hora (Madrid, 29 de marzo de 2026: 23 h) los limites siguen a la pared.
// · R28: sin zona en el pais, la operacion que la necesita falla con `PaisSinZonaHoraria` sin escribir.
// =================================================================================================

const BOGOTA = "America/Bogota";
const MADRID = "Europe/Madrid";
const enBogota = () => reglasPaisFijas({ paisId: "CO", zonaHoraria: BOGOTA });
const enMadrid = () => reglasPaisFijas({ paisId: "ES", zonaHoraria: MADRID });
const sinZona = () => reglasPaisFijas({ paisId: "XX", zonaHoraria: null });
const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const TIENDA_ID = "00000000-0000-4000-8000-000000000001";

// 05:30Z del 21 de marzo: en Costa Rica aun es el 20 (23:30); en Bogota ya es el 21 (00:30).
const INSTANTE_FRONTERA = new Date("2026-03-21T05:30:00.000Z");

// ─── Historial: la etiqueta de un cierre ──────────────────────────────────────────────────────────

describe("SLT-42 · etiqueta del historial de un cierre", () => {
  it("R22: el dia del cierre es el del calendario del pais de la empresa", () => {
    expect(
      etiquetaDeEntidad("cierre_dia", { mensajeroNombre: "Ana Torres", fecha: INSTANTE_FRONTERA, zonaHoraria: CR.zonaHoraria as string }),
    ).toBe("Ana Torres · 2026-03-20");
    expect(etiquetaDeEntidad("cierre_dia", { mensajeroNombre: "Ana Torres", fecha: INSTANTE_FRONTERA, zonaHoraria: BOGOTA })).toBe(
      "Ana Torres · 2026-03-21",
    );
    expect(etiquetaDeEntidad("cierre_bodega", { zonaNombre: "Central", fecha: INSTANTE_FRONTERA, zonaHoraria: BOGOTA })).toBe(
      "Central · 2026-03-21",
    );
  });
});

// ─── Origen legible de una fila de cierre ─────────────────────────────────────────────────────────

describe("SLT-42 · origen legible de una fila nacida de un cierre", () => {
  const entidades = {
    cierres: new Map([["c1", { id: "c1", solicitadoAt: INSTANTE_FRONTERA.toISOString(), mensajero: "Ana Torres" }]]),
    gestiones: new Map(),
    incidentes: new Map(),
    pagos: new Map(),
    podios: new Map(),
    pagosPorCuenta: new Map(),
    abonos: new Map(),
    movimientosTienda: new Map(),
  } as never;
  const fila = { origenTipo: "cierre_dia", origenId: "c1", categoria: "ingreso_flete", descripcion: null } as never;
  const acceso = { nombraMensajero: false, cierres: false, ordenes: false, ranking: false } as never;

  it("R22: el dia del cierre en el origen sale de la zona del pais", () => {
    expect(componerOrigen("caja", fila, entidades, acceso, CR.zonaHoraria).texto).toContain("2026-03-20");
    expect(componerOrigen("caja", fila, entidades, acceso, BOGOTA).texto).toContain("2026-03-21");
  });
});

// ─── Filtros de la wallet: el selector de cierres ─────────────────────────────────────────────────

function montarFiltros(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const repo = {
    cierresDeTienda: vi.fn(async () => [
      { cierreId: "c1", solicitadoAt: INSTANTE_FRONTERA.toISOString(), mensajero: "Ana Torres", movimientos: 2 },
    ]),
    cierresDeMensajero: vi.fn(async () => []),
  };
  const service = new FiltrosWalletService(repo as unknown as IFiltrosWalletRepository, undefined, reglasPais);
  return { service, repo };
}

describe("SLT-42 · FiltrosWalletService.cierresDeLaCuenta", () => {
  it("R22: el dia y la hora de cada cierre son los de la zona del pais", async () => {
    const cr = await montarFiltros(reglasPaisFijas()).service.cierresDeLaCuenta({ cuenta: "tienda", tiendaId: TIENDA_ID }, MAESTRO);
    const co = await montarFiltros(enBogota()).service.cierresDeLaCuenta({ cuenta: "tienda", tiendaId: TIENDA_ID }, MAESTRO);
    expect(cr).toMatchObject({ status: "ok", opciones: [{ dia: "2026-03-20", hora: "23:30" }] });
    expect(co).toMatchObject({ status: "ok", opciones: [{ dia: "2026-03-21", hora: "00:30" }] });
  });

  it("R23: buscar el dia del cambio de hora de Madrid da una franja de 23 h, de pared a pared", async () => {
    const { service, repo } = montarFiltros(enMadrid());
    await service.cierresDeLaCuenta({ cuenta: "tienda", tiendaId: TIENDA_ID, busqueda: "2026-03-29" }, MAESTRO);
    expect(repo.cierresDeTienda).toHaveBeenCalledWith(
      TIENDA_ID,
      { tipo: "dia", desde: new Date("2026-03-28T23:00:00.000Z"), hasta: new Date("2026-03-29T22:00:00.000Z") },
      expect.any(Number),
    );
  });

  it("R28: buscar un dia sin zona en el pais falla con PaisSinZonaHoraria y no consulta", async () => {
    const { service, repo } = montarFiltros(sinZona());
    await expect(
      service.cierresDeLaCuenta({ cuenta: "tienda", tiendaId: TIENDA_ID, busqueda: "2026-03-20" }, MAESTRO),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(repo.cierresDeTienda).not.toHaveBeenCalled();
  });
});

// ─── Historial de acciones: el rango de fechas del filtro ─────────────────────────────────────────

function montarHistorial(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const repo = {
    list: vi.fn<(consulta: unknown) => Promise<{ items: never[]; total: number }>>(async () => ({ items: [], total: 0 })),
    listAll: vi.fn(async () => []),
    listarActores: vi.fn(async () => []),
  };
  return { service: new HistorialAccionService(repo as unknown as IHistorialAccionRepository, reglasPais), repo };
}

describe("SLT-42 · HistorialAccionService: el rango del filtro", () => {
  it("R22: «desde el 20» empieza a las 06:00Z en Costa Rica y a las 05:00Z en Bogota", async () => {
    const cr = montarHistorial(reglasPaisFijas());
    const co = montarHistorial(enBogota());
    await cr.service.listar({ desde: "2026-03-20", hasta: "2026-03-20" }, MAESTRO);
    await co.service.listar({ desde: "2026-03-20", hasta: "2026-03-20" }, MAESTRO);
    expect(cr.repo.list.mock.calls[0][0]).toMatchObject({
      filtro: { desde: new Date("2026-03-20T06:00:00.000Z"), hasta: new Date("2026-03-21T06:00:00.000Z") },
    });
    expect(co.repo.list.mock.calls[0][0]).toMatchObject({
      filtro: { desde: new Date("2026-03-20T05:00:00.000Z"), hasta: new Date("2026-03-21T05:00:00.000Z") },
    });
  });

  it("R28: con rango y sin zona falla sin consultar; sin rango no la necesita", async () => {
    const { service, repo } = montarHistorial(sinZona());
    await expect(service.listar({ desde: "2026-03-20" }, MAESTRO)).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(repo.list).not.toHaveBeenCalled();
    expect(await service.listar({}, MAESTRO)).toMatchObject({ status: "ok" });
  });
});

// ─── Gastos fijos: la fecha de la corrida ─────────────────────────────────────────────────────────

function montarGastos(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const plantillaRepo = { listarActivas: vi.fn(async () => []) };
  const runTx = vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn({} as never));
  const service = new GeneracionGastosFijosService(
    plantillaRepo as never,
    { crearMovimientos: vi.fn(async () => 0) } as never,
    { crearPendientes: vi.fn(async () => 0), contarPendientes: vi.fn(async () => 0) } as never,
    runTx as never,
    undefined,
    reglasPais,
  );
  return { service, plantillaRepo, runTx };
}

describe("SLT-42 · GeneracionGastosFijosService: el dia de la corrida", () => {
  it("R22: el mismo instante es la corrida del 20 en Costa Rica y la del 21 en Bogota", async () => {
    const cr = await montarGastos(reglasPaisFijas()).service.ejecutarGeneracion(INSTANTE_FRONTERA);
    const co = await montarGastos(enBogota()).service.ejecutarGeneracion(INSTANTE_FRONTERA);
    expect(cr.fecha).toBe("2026-03-20");
    expect(co.fecha).toBe("2026-03-21");
  });

  it("R28: sin zona en el pais, la corrida falla con PaisSinZonaHoraria antes de leer o escribir", async () => {
    const { service, plantillaRepo, runTx } = montarGastos(sinZona());
    await expect(service.ejecutarGeneracion(INSTANTE_FRONTERA)).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(plantillaRepo.listarActivas).not.toHaveBeenCalled();
    expect(runTx).not.toHaveBeenCalled();
  });
});

// ─── Aporte de capital: «hoy» al validar la fecha ─────────────────────────────────────────────────

function montarAporte(reglasPais: Pick<IReglasPaisEmpresa, "zonaHoraria">) {
  const runTransaction = vi.fn(async () => {
    throw new Error("llego a escribir");
  });
  const upload = vi.fn();
  const service = new AporteCapitalService(
    {} as never,
    {} as never,
    { primerDiaDeLaCaja: vi.fn(async () => null) },
    { upload } as never,
    {} as never,
    runTransaction as never,
    () => INSTANTE_FRONTERA,
    undefined,
    reglasPais,
  );
  return { service, runTransaction, upload };
}

const APORTE_DEL_21 = { clase: "aporte", monto: "1000.00", motivo: "capital", fecha: "2026-03-21", claveIdempotencia: "k1" } as never;

describe("SLT-42 · AporteCapitalService.registrar: «hoy» del pais", () => {
  it("R22: a las 05:30Z del 21, «el 21» es futuro en Costa Rica y es hoy en Bogota", async () => {
    const cr = montarAporte(reglasPaisFijas());
    expect(await cr.service.registrar(APORTE_DEL_21, null, MAESTRO)).toMatchObject({
      status: "validation_error",
      fieldErrors: { fecha: ["La fecha no puede ser posterior a hoy."] },
    });
    expect(cr.runTransaction).not.toHaveBeenCalled();

    const co = montarAporte(enBogota());
    await expect(co.service.registrar(APORTE_DEL_21, null, MAESTRO)).rejects.toThrow("llego a escribir");
  });

  it("R28: sin zona falla con PaisSinZonaHoraria antes de subir el comprobante o escribir", async () => {
    const { service, runTransaction, upload } = montarAporte(sinZona());
    const comprobante = { contentType: "image/png", bytes: new Uint8Array([1]) };
    await expect(service.registrar(APORTE_DEL_21, comprobante, MAESTRO)).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(upload).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("R28: en el borde, sin zona la accion falla y no llega al servicio", async () => {
    const service = { registrar: vi.fn() } as unknown as IAporteCapitalService;
    const form = new FormData();
    form.set("clase", "aporte");
    form.set("monto", "1000.00");
    form.set("motivo", "capital");
    form.set("fecha", "2026-03-20");
    form.set("claveIdempotencia", "00000000-0000-4000-8000-000000000002");
    await expect(
      registrarAporteCapitalAction(form, { service, getActor: async () => MAESTRO, reglasPais: sinZona() }),
    ).rejects.toThrow();
    expect(service.registrar).not.toHaveBeenCalled();
  });
});

// ─── Wallet: el ajuste manual con fecha elegida ───────────────────────────────────────────────────

describe("SLT-42 · WalletService.registrarMovimientoManual", () => {
  it("R28: con fecha elegida y sin zona en el pais, falla sin escribir; sin fecha no la necesita", async () => {
    const crearMovimientoRegistrado = vi.fn(async () => 1);
    const repo = { crearMovimientoRegistrado } as never;
    const service = new WalletService(repo, {} as never, {} as never, {} as never, undefined, undefined, sinZona());
    await expect(
      service.registrarMovimientoManual(
        { tipo: "ingreso", categoria: "ajuste_manual", monto: "10.00", descripcion: "ajuste", fecha: "2026-03-19" } as never,
        MAESTRO,
      ),
    ).rejects.toBeInstanceOf(PaisSinZonaHoraria);
    expect(crearMovimientoRegistrado).not.toHaveBeenCalled();
  });
});
