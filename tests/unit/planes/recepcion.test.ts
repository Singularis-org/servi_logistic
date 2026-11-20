import { describe, expect, it } from "vitest";

import { fechaDeRecepcion, recordatoriosDe } from "@/lib/planes/recepcion";
import type { TipoCobro } from "@/lib/types/planes";

// SLT-128 (design §5; R1, R21) — la recepción por empresa de un cambio programado y sus recordatorios.
// Las 00:00 de la plataforma (−06:00) son las 06:00 UTC.

const cero = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);
/** El mediodía de la plataforma de `fecha` (18:00 UTC): un instante de guardar a mitad del día. */
const mediodia = (fecha: string) => new Date(`${fecha}T18:00:00.000Z`);

describe("SLT-128 R1 — la recepción de cada empresa según su tipo de cobro", () => {
  const casos: { caso: string; tipo: TipoCobro; f: string; recibe: string }[] = [
    // F = 16 de noviembre: inicio de quincena, no de mes, bimestre ni año
    { caso: "quincenal con F inicio de su período", tipo: "quincenal", f: "2026-11-16", recibe: "2026-11-16" },
    { caso: "mensual con F a mitad de mes", tipo: "mensual", f: "2026-11-16", recibe: "2026-12-01" },
    { caso: "bimestral con F a mitad del bimestre", tipo: "bimestral", f: "2026-11-16", recibe: "2027-01-01" },
    { caso: "anual con F a mitad de año", tipo: "anual", f: "2026-11-16", recibe: "2027-01-01" },
    // F = 1 de diciembre: inicio de quincena y de mes, no de bimestre (noviembre-diciembre) ni de año
    { caso: "quincenal con F el 1", tipo: "quincenal", f: "2026-12-01", recibe: "2026-12-01" },
    { caso: "mensual con F inicio de mes", tipo: "mensual", f: "2026-12-01", recibe: "2026-12-01" },
    { caso: "bimestral con F en el segundo mes del bimestre", tipo: "bimestral", f: "2026-12-01", recibe: "2027-01-01" },
    { caso: "anual con F en diciembre", tipo: "anual", f: "2026-12-01", recibe: "2027-01-01" },
    // F inicio de bimestre y de año
    { caso: "bimestral con F inicio de bimestre", tipo: "bimestral", f: "2026-11-01", recibe: "2026-11-01" },
    { caso: "anual con F el 1 de enero", tipo: "anual", f: "2027-01-01", recibe: "2027-01-01" },
    // F no inicio de quincena
    { caso: "quincenal con F a mitad de la quincena", tipo: "quincenal", f: "2026-11-20", recibe: "2026-12-01" },
    { caso: "quincenal con F en la primera quincena", tipo: "quincenal", f: "2026-12-05", recibe: "2026-12-16" },
  ];

  it.each(casos)("$caso: F = $f → $recibe", ({ tipo, f, recibe }) => {
    expect(fechaDeRecepcion(tipo, cero(f)).toISOString()).toBe(cero(recibe).toISOString());
  });

  it("devuelve un instante nuevo, no el mismo objeto de F", () => {
    const f = cero("2026-11-16");
    const recibe = fechaDeRecepcion("quincenal", f);
    expect(recibe).not.toBe(f);
    expect(recibe.getTime()).toBe(f.getTime());
  });
});

describe("SLT-128 R21 — los recordatorios contados hasta la recepción de cada empresa", () => {
  const recibe = cero("2026-12-01");
  const fechas = (ahora: Date) =>
    recordatoriosDe(ahora, recibe).map((r) => ({ dias: r.dias, runAfter: r.runAfter.toISOString() }));

  it("d = 30: a 7 y a 1 día", () => {
    expect(fechas(mediodia("2026-11-01"))).toEqual([
      { dias: 7, runAfter: cero("2026-11-24").toISOString() },
      { dias: 1, runAfter: cero("2026-11-30").toISOString() },
    ]);
  });

  it("d = 8: a 7 y a 1 día", () => {
    expect(fechas(mediodia("2026-11-23"))).toEqual([
      { dias: 7, runAfter: cero("2026-11-24").toISOString() },
      { dias: 1, runAfter: cero("2026-11-30").toISOString() },
    ]);
  });

  it("d = 7: a 3 y a 1 día", () => {
    expect(fechas(mediodia("2026-11-24"))).toEqual([
      { dias: 3, runAfter: cero("2026-11-28").toISOString() },
      { dias: 1, runAfter: cero("2026-11-30").toISOString() },
    ]);
  });

  it("d = 4: a 3 y a 1 día", () => {
    expect(fechas(mediodia("2026-11-27"))).toEqual([
      { dias: 3, runAfter: cero("2026-11-28").toISOString() },
      { dias: 1, runAfter: cero("2026-11-30").toISOString() },
    ]);
  });

  it("d = 3: solo el de 1 día", () => {
    expect(fechas(mediodia("2026-11-28"))).toEqual([{ dias: 1, runAfter: cero("2026-11-30").toISOString() }]);
  });

  it("d = 1: el de 1 día cae antes de guardar y no se programa", () => {
    expect(fechas(mediodia("2026-11-30"))).toEqual([]);
  });

  it("d = 1 guardado justo a las 00:00: el de 1 día no cae DESPUÉS de guardar y no se programa", () => {
    expect(fechas(cero("2026-11-30"))).toEqual([]);
  });

  it("d = 0: guardado el mismo día de la recepción, ninguno", () => {
    expect(fechas(mediodia("2026-12-01"))).toEqual([]);
  });

  it("guardado el 11 con recepción el 16: el 13 y el 15", () => {
    const r = recordatoriosDe(new Date("2026-11-11T15:00:00.000Z"), cero("2026-11-16"));
    expect(r.map((x) => ({ dias: x.dias, runAfter: x.runAfter.toISOString() }))).toEqual([
      { dias: 3, runAfter: cero("2026-11-13").toISOString() },
      { dias: 1, runAfter: cero("2026-11-15").toISOString() },
    ]);
  });

  it("cuenta días de calendario de la plataforma, no de UTC: las 23:00 del 23 (05:00 UTC del 24) son d = 8", () => {
    const r = recordatoriosDe(new Date("2026-11-24T05:00:00.000Z"), recibe);
    expect(r.map((x) => x.dias)).toEqual([7, 1]);
  });
});
