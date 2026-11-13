import { describe, it, expect, vi } from "vitest";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import type {
  CierreAprobadoParaPendienteRow,
  ICierreDiaRepository,
} from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { ITarifaZonaMensajeroRepository } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type {
  CifraGanancia,
  LecturasGananciaMensajero,
  LecturasPendienteCierre,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» (R353, R355, R357, R359)
// — el servicio con dobles. Aqui se mide la forma: quien se llama, con que rango, que se suma. El
// `WHERE` de las tres consultas (actor, estado, vigencia, rango) se prueba contra Postgres real en
// `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts`.
//
// La zona de prueba es la de `reglasPaisFijas()` (America/Costa_Rica, UTC−6 sin horario de verano).

const MENSAJERO: Actor = { usuarioId: "m-1", rol: "mensajero" };
const AHORA = new Date("2026-11-20T15:00:00.000Z");

function aprobado(
  cierreId: string,
  totalPagoMensajero: string,
  totalEfectivo: string,
  pagoIndependienteEfectivo: boolean,
): CierreAprobadoParaPendienteRow {
  return { cierreId, totalPagoMensajero, totalEfectivo, pagoIndependienteEfectivo };
}

// A nuevo P 4 000 / E 10 000 con 1 500 pagado → 2 500; B viejo P 50 000,55 / E 5 000 → 45 000,55;
// C nuevo P 3 000 pagado entero → 0. Σ = 47 500,55 y dos cierres con algo pendiente.
const APROBADOS = [
  aprobado("A", "4000.00", "10000.00", true),
  aprobado("B", "50000.55", "5000.00", false),
  aprobado("C", "3000.00", "0.00", true),
];
const PAGADOS: Record<string, string> = { A: "1500.00", B: "0.00", C: "3000.00" };

function montar(o: {
  aprobados?: CierreAprobadoParaPendienteRow[];
  pagosDelMes?: CifraGanancia;
  satelite?: CifraGanancia;
  conPendientes?: boolean;
  conGanancia?: boolean;
  ahora?: Date;
  /** SLT-139 (R338): lo pagado por la satelite por cierre; ausente = "0.00" en todos. */
  pagadoSatelitePorCierre?: Record<string, string>;
  /** SLT-139 (R334): el doble del libro SIN `sumarPagadoSatelitePorCierre`. */
  sinLecturaSatelitePorCierre?: boolean;
}) {
  const findAprobadosParaPendiente = vi.fn(async (_m: string) => o.aprobados ?? APROBADOS);
  const repo = { findAprobadosParaPendiente } as unknown as ICierreDiaRepository;

  const sumarVigentesPorCierre = vi.fn(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, PAGADOS[id] ?? "0.00"])),
  );
  const sumarPremiosVivosPorCierre = vi.fn(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, "0.00"])),
  );
  const sumarPagadoSatelitePorCierre = vi.fn(async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, o.pagadoSatelitePorCierre?.[id] ?? "0.00"])),
  );
  const pendientes: LecturasPendienteCierre = {
    liquidaciones: { sumarVigentesPorCierre },
    premios: o.sinLecturaSatelitePorCierre
      ? { sumarPremiosVivosPorCierre }
      : { sumarPremiosVivosPorCierre, sumarPagadoSatelitePorCierre },
  };

  const sumarVigentesDelMensajeroEnRango = vi.fn(
    async (_m: string, _d: Date, _h: Date): Promise<CifraGanancia> =>
      o.pagosDelMes ?? { monto: "3500.00", conteo: 2 },
  );
  const sumarPagadoPorSateliteEnRango = vi.fn(
    async (_m: string, _d: Date, _h: Date): Promise<CifraGanancia> =>
      o.satelite ?? { monto: "0.00", conteo: 0 },
  );
  const ganancia: LecturasGananciaMensajero = {
    pagos: { sumarVigentesDelMensajeroEnRango },
    ...(o.satelite ? { pagadoPorSatelite: { sumarPagadoPorSateliteEnRango } } : {}),
    ahora: () => o.ahora ?? AHORA,
  };

  const svc = new CierreDiaService(
    repo,
    {} as unknown as IZonaRepository,
    {} as unknown as IOrdenRepository,
    {} as unknown as ISignedUrlProvider,
    {} as unknown as ITarifaZonaMensajeroRepository,
    undefined,
    undefined,
    reglasPaisFijas(),
    o.conPendientes === false ? undefined : pendientes,
    o.conGanancia === false ? undefined : ganancia,
  );
  const lecturas = [
    findAprobadosParaPendiente,
    sumarVigentesPorCierre,
    sumarPremiosVivosPorCierre,
    sumarVigentesDelMensajeroEnRango,
    sumarPagadoPorSateliteEnRango,
    sumarPagadoSatelitePorCierre,
  ];
  return {
    svc,
    lecturas,
    findAprobadosParaPendiente,
    sumarVigentesPorCierre,
    sumarPremiosVivosPorCierre,
    sumarVigentesDelMensajeroEnRango,
    sumarPagadoPorSateliteEnRango,
    sumarPagadoSatelitePorCierre,
  };
}

describe("SLT-112 — resumenGanancia con dobles", () => {
  it("R359: otro rol recibe `forbidden` sin que se llame a ninguna lectura", async () => {
    for (const rol of ["admin", "maestro", "adminTienda", "adminSatelite", "superadmin"] as const) {
      const { svc, lecturas } = montar({});
      const r = await svc.resumenGanancia({ usuarioId: "m-1", rol });
      expect(r).toEqual({ status: "forbidden" });
      for (const l of lecturas) expect(l).not.toHaveBeenCalled();
    }
  });

  it("R357: sin la lectura de los pagos del mes → `sin_dato`, sin leer nada (nunca ceros)", async () => {
    const { svc, lecturas } = montar({ conGanancia: false });
    expect(await svc.resumenGanancia(MENSAJERO)).toEqual({ status: "sin_dato" });
    for (const l of lecturas) expect(l).not.toHaveBeenCalled();
  });

  it("R357: sin las lecturas del pendiente → `sin_dato`, sin leer nada", async () => {
    const { svc, lecturas } = montar({ conPendientes: false });
    expect(await svc.resumenGanancia(MENSAJERO)).toEqual({ status: "sin_dato" });
    for (const l of lecturas) expect(l).not.toHaveBeenCalled();
  });

  it("R357: una lectura que falla sube como excepcion (el borde la convierte en error, no en ceros)", async () => {
    const m = montar({});
    m.sumarVigentesDelMensajeroEnRango.mockRejectedValueOnce(new Error("caida de la base"));
    await expect(m.svc.resumenGanancia(MENSAJERO)).rejects.toThrow("caida de la base");
  });

  it("R350/R352: pendiente Σ de los aprobados y conteo de los que tienen algo; pagada = pagos del mes", async () => {
    const m = montar({});
    const r = await m.svc.resumenGanancia(MENSAJERO);
    expect(r).toEqual({
      status: "ok",
      resumen: {
        pendiente: { monto: "47500.55", conteo: 2 },
        pagadaEsteMes: { monto: "3500.00", conteo: 2 },
      },
    });
    // El actor de la sesion es el unico mensajero que llega a las lecturas.
    expect(m.findAprobadosParaPendiente).toHaveBeenCalledWith("m-1");
    expect(m.sumarVigentesDelMensajeroEnRango.mock.calls[0]?.[0]).toBe("m-1");
    // Las lecturas en lote reciben los ids que salieron de los aprobados del actor.
    expect(m.sumarVigentesPorCierre).toHaveBeenCalledWith(["A", "B", "C"]);
    expect(m.sumarPremiosVivosPorCierre).toHaveBeenCalledWith(["A", "B", "C"]);
  });

  it("R356 (forma): cada lectura una sola vez, con 3 aprobados y con 1", async () => {
    for (const aprobados of [APROBADOS, [APROBADOS[0]!]]) {
      const m = montar({ aprobados });
      await m.svc.resumenGanancia(MENSAJERO);
      expect(m.findAprobadosParaPendiente).toHaveBeenCalledTimes(1);
      expect(m.sumarVigentesPorCierre).toHaveBeenCalledTimes(1);
      expect(m.sumarPremiosVivosPorCierre).toHaveBeenCalledTimes(1);
      expect(m.sumarVigentesDelMensajeroEnRango).toHaveBeenCalledTimes(1);
      expect(m.sumarPagadoSatelitePorCierre).toHaveBeenCalledTimes(1); // SLT-139: una, con los nuevos
    }
  });

  it("R352: el mes son fechas calendario [dia 1, dia 1 del siguiente) a medianoche UTC (`@db.Date`)", async () => {
    const m = montar({});
    await m.svc.resumenGanancia(MENSAJERO);
    const [, desde, hasta] = m.sumarVigentesDelMensajeroEnRango.mock.calls[0]!;
    expect(desde.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("R352: el mes es el de la zona de la empresa: 2026-12-01T03:00Z aun es 30 de noviembre", async () => {
    const m = montar({ ahora: new Date("2026-12-01T03:00:00.000Z") });
    await m.svc.resumenGanancia(MENSAJERO);
    const [, desde, hasta] = m.sumarVigentesDelMensajeroEnRango.mock.calls[0]!;
    expect(desde.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("R352: diciembre cierra en el 1 de enero del año siguiente", async () => {
    const m = montar({ ahora: new Date("2026-12-31T20:00:00.000Z") });
    await m.svc.resumenGanancia(MENSAJERO);
    const [, desde, hasta] = m.sumarVigentesDelMensajeroEnRango.mock.calls[0]!;
    expect(desde.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(hasta.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("R353: con la lectura de lo pagado por la satelite, la pagada suma su monto y su conteo", async () => {
    const m = montar({ satelite: { monto: "1200.00", conteo: 1 } });
    const r = await m.svc.resumenGanancia(MENSAJERO);
    expect(r).toEqual({
      status: "ok",
      resumen: {
        pendiente: { monto: "47500.55", conteo: 2 },
        pagadaEsteMes: { monto: "4700.00", conteo: 3 },
      },
    });
    // `fecha_movimiento` es `timestamp`: el rango son instantes, las 00:00 de Costa Rica (UTC−6).
    const [mensajero, desde, hasta] = m.sumarPagadoPorSateliteEnRango.mock.calls[0]!;
    expect(mensajero).toBe("m-1");
    expect(desde.toISOString()).toBe("2026-11-01T06:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });

  it("R353: sin la lectura de la satelite, la pagada es exactamente la de R352", async () => {
    const m = montar({});
    const r = await m.svc.resumenGanancia(MENSAJERO);
    if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
    expect(r.resumen.pagadaEsteMes).toEqual({ monto: "3500.00", conteo: 2 });
    expect(m.sumarPagadoPorSateliteEnRango).not.toHaveBeenCalled();
  });

  it("R355: importes de tres decimales salen redondeados a escala 2 con Decimal", async () => {
    const m = montar({
      pagosDelMes: { monto: "1000.126", conteo: 1 },
      satelite: { monto: "0.001", conteo: 1 },
    });
    const r = await m.svc.resumenGanancia(MENSAJERO);
    if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
    expect(r.resumen.pagadaEsteMes).toEqual({ monto: "1000.13", conteo: 2 });
  });

  it("R355: con 0.10 + 0.20 la suma es exacta (sin coma flotante)", async () => {
    const m = montar({
      aprobados: [aprobado("X", "0.10", "0.00", true), aprobado("Y", "0.20", "0.00", true)],
    });
    const r = await m.svc.resumenGanancia(MENSAJERO);
    if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
    expect(r.resumen.pendiente).toEqual({ monto: "0.30", conteo: 2 });
  });

  it("R355: sin aprobados ni pagos en el mes, las dos cifras valen \"0.00\" con conteo 0", async () => {
    const m = montar({ aprobados: [], pagosDelMes: { monto: "0.00", conteo: 0 } });
    expect(await m.svc.resumenGanancia(MENSAJERO)).toEqual({
      status: "ok",
      resumen: {
        pendiente: { monto: "0.00", conteo: 0 },
        pagadaEsteMes: { monto: "0.00", conteo: 0 },
      },
    });
  });

  it("SLT-139 (R338): lo pagado por la satelite resta en los cierres NUEVOS; la lectura recibe solo los nuevos", async () => {
    // A nuevo 2 500 - 1 000 de la satelite = 1 500; B viejo 45 000,55; C nuevo 0 (y la satelite no
    // puede llevarlo a negativo: 0 - 0). Σ 46 500,55 con dos cierres con algo pendiente.
    const m = montar({ pagadoSatelitePorCierre: { A: "1000.00", B: "777.00" } });
    const r = await m.svc.resumenGanancia(MENSAJERO);
    if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
    expect(r.resumen.pendiente).toEqual({ monto: "46500.55", conteo: 2 });
    expect(m.sumarPagadoSatelitePorCierre).toHaveBeenCalledWith(["A", "C"]);
  });

  it("SLT-139 (R334, R357): un cierre nuevo sin la lectura por cierre deja las cifras en `sin_dato`", async () => {
    const m = montar({ sinLecturaSatelitePorCierre: true });
    expect(await m.svc.resumenGanancia(MENSAJERO)).toEqual({ status: "sin_dato" });
  });

  it("SLT-139: sin cierres nuevos, la falta de la lectura por cierre no cambia nada (ni se la pide)", async () => {
    const m = montar({ sinLecturaSatelitePorCierre: true, aprobados: [APROBADOS[1]!] });
    const r = await m.svc.resumenGanancia(MENSAJERO);
    if (r.status !== "ok") throw new Error(`se esperaba ok y llego ${r.status}`);
    expect(r.resumen.pendiente).toEqual({ monto: "45000.55", conteo: 1 });
  });
});
