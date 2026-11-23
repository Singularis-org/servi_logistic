import { describe, it, expect } from "vitest";
import {
  desfaseEnMs,
  diasNaturalesDesde,
  esFechaCalendarioValida,
  fechaCalendario,
  horaDePared,
  inicioDeUltimosNDiasEnUtc,
  inicioDelDiaComoFecha,
  inicioDelDiaEnUtc,
  inicioDelDiaSiguienteEnUtc,
  inicioDelMesEnUtc,
  manana,
  periodoMensual,
  proximaHoraLocal,
  ultimosNDias,
} from "@/lib/utils/calendario-zona";

// SLT-42 (R22, R23). Los casos de la zona de CR son los ejemplos que documenta `fecha-cr.ts`, que
// ahora envuelve este modulo. Las zonas con horario de verano prueban los dias de 23 y 25 horas:
// Nueva York cambia a las 02:00 (las 00:00 existen siempre) y Santiago de Chile cambia a las 24:00
// (el dia en que se adelanta el reloj NO tiene 00:00).

const CR = "America/Costa_Rica";
const NY = "America/New_York";
const SCL = "America/Santiago";
const H = 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString();

describe("calendario-zona con la zona de CR (R22): mismos ejemplos que fecha-cr.ts", () => {
  it("la fecha calendario cambia a las 00:00 locales (06:00Z), no a las 00:00 UTC", () => {
    expect(fechaCalendario(new Date("2026-07-16T02:00:00Z"), CR)).toBe("2026-07-15");
    expect(fechaCalendario(new Date("2026-07-15T05:59:00Z"), CR)).toBe("2026-07-14");
    expect(fechaCalendario(new Date("2026-07-15T06:00:00Z"), CR)).toBe("2026-07-15");
  });

  it("inicioDelDiaComoFecha es la medianoche UTC de la fecha local (convencion @db.Date)", () => {
    expect(iso(inicioDelDiaComoFecha(new Date("2026-07-15T05:59:00Z"), CR))).toBe(
      "2026-07-14T00:00:00.000Z",
    );
    expect(iso(inicioDelDiaComoFecha(new Date("2026-07-15T06:00:00Z"), CR))).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });

  it("inicioDelDiaEnUtc es el instante real de las 00:00 locales, 6 h despues de la medianoche UTC", () => {
    expect(iso(inicioDelDiaEnUtc("2026-07-15", CR))).toBe("2026-07-15T06:00:00.000Z");
    expect(iso(inicioDelDiaSiguienteEnUtc("2026-07-15", CR))).toBe("2026-07-16T06:00:00.000Z");
  });

  it("el inicio del mes en curso se resuelve en el calendario local", () => {
    expect(iso(inicioDelMesEnUtc(new Date("2026-09-01T06:00:00Z"), CR))).toBe(
      "2026-09-01T06:00:00.000Z",
    );
    expect(iso(inicioDelMesEnUtc(new Date("2026-09-01T05:59:00Z"), CR))).toBe(
      "2026-08-01T06:00:00.000Z",
    );
  });

  it("el periodo mensual es el del calendario local", () => {
    expect(periodoMensual(new Date("2026-07-01T06:00:00Z"), CR)).toBe("2026-07");
    expect(periodoMensual(new Date("2026-07-01T05:59:00Z"), CR)).toBe("2026-06");
  });

  it("mañana y ultimos N dias cuentan dias de calendario incluido hoy", () => {
    const now = new Date("2026-07-16T02:00:00Z"); // 20:00 del 15 en CR
    expect(manana(now, CR)).toBe("2026-07-16");
    expect(ultimosNDias(7, now, CR)).toEqual({ desde: "2026-07-09", hasta: "2026-07-15" });
    expect(iso(inicioDeUltimosNDiasEnUtc(7, now, CR))).toBe("2026-07-09T06:00:00.000Z");
  });

  it("los dias naturales cuentan cambios de fecha y nunca son negativos", () => {
    // ayer 23:50 -> hoy 00:10 en CR: 1 dia aunque pasaron 20 minutos.
    expect(
      diasNaturalesDesde(new Date("2026-07-15T05:50:00Z"), new Date("2026-07-15T06:10:00Z"), CR),
    ).toBe(1);
    expect(
      diasNaturalesDesde(new Date("2026-07-16T06:00:00Z"), new Date("2026-07-15T06:00:00Z"), CR),
    ).toBe(0);
  });

  it("el desfase de una zona UTC-6 es +6 h y la hora de pared sale en HH:mm", () => {
    expect(desfaseEnMs(new Date("2026-07-15T12:00:00Z"), CR)).toBe(6 * H);
    expect(horaDePared(new Date("2026-07-15T05:59:00Z"), CR)).toBe("23:59");
    expect(horaDePared(new Date("2026-07-15T06:00:00Z"), CR)).toBe("00:00");
    expect(horaDePared(new Date("no es fecha"), CR)).toBe("");
  });

  it("la proxima hora local es estrictamente posterior a now", () => {
    // Medianoche: desde las 00:00 exactas, la siguiente es la de mañana.
    expect(iso(proximaHoraLocal(new Date("2026-07-15T06:00:00Z"), CR, 0, 0))).toBe(
      "2026-07-16T06:00:00.000Z",
    );
    expect(iso(proximaHoraLocal(new Date("2026-07-15T05:59:00Z"), CR, 0, 0))).toBe(
      "2026-07-15T06:00:00.000Z",
    );
    // 00:30 desde las 00:31 locales: la de mañana.
    expect(iso(proximaHoraLocal(new Date("2026-07-15T06:31:00Z"), CR, 0, 30))).toBe(
      "2026-07-16T06:30:00.000Z",
    );
  });
});

describe("calendario-zona con horario de verano (R23)", () => {
  it("Nueva York, dia de 23 h (2026-03-08): los limites son las 00:00 locales reales", () => {
    const inicio = inicioDelDiaEnUtc("2026-03-08", NY);
    const fin = inicioDelDiaSiguienteEnUtc("2026-03-08", NY);
    expect(iso(inicio)).toBe("2026-03-08T05:00:00.000Z"); // 00:00 EST
    expect(iso(fin)).toBe("2026-03-09T04:00:00.000Z"); // 00:00 EDT
    expect(fin.getTime() - inicio.getTime()).toBe(23 * H);
  });

  it("Nueva York, dia de 25 h (2026-11-01): los limites son las 00:00 locales reales", () => {
    const inicio = inicioDelDiaEnUtc("2026-11-01", NY);
    const fin = inicioDelDiaSiguienteEnUtc("2026-11-01", NY);
    expect(iso(inicio)).toBe("2026-11-01T04:00:00.000Z"); // 00:00 EDT
    expect(iso(fin)).toBe("2026-11-02T05:00:00.000Z"); // 00:00 EST
    expect(fin.getTime() - inicio.getTime()).toBe(25 * H);
  });

  it("Santiago, dia sin 00:00 (2026-09-06, salta de 24:00 a 01:00): empieza en el primer instante del dia", () => {
    const inicio = inicioDelDiaEnUtc("2026-09-06", SCL);
    expect(iso(inicio)).toBe("2026-09-06T04:00:00.000Z"); // 01:00 -03
    expect(fechaCalendario(inicio, SCL)).toBe("2026-09-06");
    expect(fechaCalendario(new Date(inicio.getTime() - 1), SCL)).toBe("2026-09-05");
    const fin = inicioDelDiaSiguienteEnUtc("2026-09-06", SCL);
    expect(fin.getTime() - inicio.getTime()).toBe(23 * H);
  });

  it("Santiago, dia de 25 h (2026-04-04, de 24:00 vuelve a 23:00): las 00:00 siguientes son las reales", () => {
    const inicio = inicioDelDiaEnUtc("2026-04-04", SCL);
    const fin = inicioDelDiaSiguienteEnUtc("2026-04-04", SCL);
    expect(iso(inicio)).toBe("2026-04-04T03:00:00.000Z"); // 00:00 -03
    expect(iso(fin)).toBe("2026-04-05T04:00:00.000Z"); // 00:00 -04
    expect(fin.getTime() - inicio.getTime()).toBe(25 * H);
  });

  it("el desfase depende del instante, no es fijo", () => {
    expect(desfaseEnMs(new Date("2026-03-08T06:00:00Z"), NY)).toBe(5 * H);
    expect(desfaseEnMs(new Date("2026-03-08T08:00:00Z"), NY)).toBe(4 * H);
  });

  it("mañana, ultimos N dias y dias naturales cruzan el cambio de hora sin perder ni repetir dias", () => {
    // 23:30 del 7 de marzo en NY: mañana es el 8, aunque el 8 dure 23 h.
    const noche = new Date("2026-03-08T04:30:00Z");
    expect(manana(noche, NY)).toBe("2026-03-08");
    // 23:30 del 8 de marzo (EDT): +24 h caeria en el 10; el calendario dice el 9.
    const nocheDelCambio = new Date("2026-03-09T03:30:00Z");
    expect(fechaCalendario(nocheDelCambio, NY)).toBe("2026-03-08");
    expect(manana(nocheDelCambio, NY)).toBe("2026-03-09");
    expect(ultimosNDias(3, nocheDelCambio, NY)).toEqual({ desde: "2026-03-06", hasta: "2026-03-08" });
    expect(iso(inicioDeUltimosNDiasEnUtc(2, nocheDelCambio, NY))).toBe("2026-03-07T05:00:00.000Z");
    expect(diasNaturalesDesde(new Date("2026-03-08T05:00:00Z"), nocheDelCambio, NY)).toBe(0);
    expect(diasNaturalesDesde(new Date("2026-03-07T05:00:00Z"), nocheDelCambio, NY)).toBe(1);
  });

  it("la proxima hora local se resuelve con el desfase de ese dia", () => {
    // 00:30 del 9 de marzo en NY ya es EDT (04:30Z), no EST (05:30Z).
    expect(iso(proximaHoraLocal(new Date("2026-03-08T12:00:00Z"), NY, 0, 30))).toBe(
      "2026-03-09T04:30:00.000Z",
    );
    // Santiago 2026-09-06 no tiene 00:00: la proxima medianoche es el primer instante del dia.
    expect(iso(proximaHoraLocal(new Date("2026-09-05T12:00:00Z"), SCL, 0, 0))).toBe(
      "2026-09-06T04:00:00.000Z",
    );
  });
});

describe("esFechaCalendarioValida", () => {
  it("rechaza un dia que no existe y acepta uno que si", () => {
    expect(esFechaCalendarioValida("2026-02-28")).toBe(true);
    expect(esFechaCalendarioValida("2026-02-31")).toBe(false);
    expect(esFechaCalendarioValida("2026-13-01")).toBe(false);
  });
});
