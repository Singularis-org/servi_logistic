import { describe, expect, it } from "vitest";

import {
  anclaDeLaFechaElegida,
  diasDelPeriodo,
  diasDelTramo,
  fechaDeEfectoPorDefecto,
  fechaMasMeses,
  finDelPeriodoCalendario,
  inicioDelPeriodoCalendario,
  periodoEnCurso,
  rangoDelInicioDelCiclo,
} from "@/lib/planes/ciclo";
import { TIPOS_COBRO } from "@/lib/types/planes";

import { CASOS_ENTRADA, CASOS_PERIODO } from "../../integration/db/_fixtures/periodo-calendario";

// SLT-86 (design §3.2; R4–R6, R12, R25) — las gemelas TS del período de calendario. La MISMA tabla la pasa
// `tests/integration/db/plan-ciclo-periodo.test.ts` contra las funciones SQL (R6).

describe("SLT-86 R4 — inicio y fin del período de calendario", () => {
  it.each(CASOS_PERIODO)("$caso", ({ tipo, ahora, inicio, fin, dias }) => {
    const a = new Date(ahora);
    expect(finDelPeriodoCalendario(tipo, a).toISOString()).toBe(fin);
    if (inicio !== null) expect(inicioDelPeriodoCalendario(tipo, a).toISOString()).toBe(inicio);
    if (dias !== null) expect(diasDelPeriodo(tipo, a)).toBe(dias);
  });

  it("control: la tabla cubre los cuatro tipos y trae casos con y sin inicio", () => {
    expect(new Set(CASOS_PERIODO.map((c) => c.tipo))).toEqual(new Set(TIPOS_COBRO));
    expect(CASOS_PERIODO.filter((c) => c.inicio === null).length).toBeGreaterThan(0);
    expect(CASOS_PERIODO.filter((c) => c.inicio !== null).length).toBeGreaterThan(40);
  });

  it("los bordes caen siempre a las 00:00 de la plataforma (06:00 UTC), también a las 21:00 del 31 de diciembre", () => {
    const nocheVieja = new Date("2027-01-01T03:00:00.000Z"); // 21:00 del 31 de diciembre en la plataforma
    for (const tipo of TIPOS_COBRO) {
      expect(finDelPeriodoCalendario(tipo, nocheVieja).toISOString()).toBe("2027-01-01T06:00:00.000Z");
      expect(inicioDelPeriodoCalendario(tipo, nocheVieja).toISOString().slice(10)).toBe("T06:00:00.000Z");
    }
  });
});

describe("SLT-86 R5 — el período en curso con la entrada de la empresa", () => {
  it.each(CASOS_ENTRADA)("$caso", ({ tipo, entrada, ahora, desde, hasta, esTramo, diasTramo, diasPeriodo }) => {
    const p = periodoEnCurso(new Date(entrada), tipo, new Date(ahora));
    expect({ desde: p.desde.toISOString(), hasta: p.hasta.toISOString(), esTramo: p.esTramo }).toEqual({
      desde,
      hasta,
      esTramo,
    });
    expect(diasDelTramo(p)).toBe(diasTramo);
    expect(diasDelPeriodo(tipo, new Date(ahora))).toBe(diasPeriodo);
  });

  it("no comparte ni muta la entrada que recibe", () => {
    const entrada = new Date("2026-11-10T06:00:00.000Z");
    const p = periodoEnCurso(entrada, "quincenal", new Date("2026-11-12T15:00:00.000Z"));
    p.desde.setUTCFullYear(2000);
    expect(entrada.toISOString()).toBe("2026-11-10T06:00:00.000Z");
  });
});

describe("SLT-86 R12 — días de calendario de la plataforma", () => {
  it("un período completo cuenta sus días enteros, y el tramo cuenta los dos extremos", () => {
    const completo = periodoEnCurso(new Date("2020-01-01T06:00:00.000Z"), "mensual", new Date("2026-12-20T12:00:00.000Z"));
    expect(diasDelTramo(completo)).toBe(31);
    // Entrada el 31 de diciembre: el tramo es solo ese día.
    const unDia = periodoEnCurso(new Date("2026-12-31T06:00:00.000Z"), "anual", new Date("2026-12-31T20:00:00.000Z"));
    expect(unDia.esTramo).toBe(true);
    expect(diasDelTramo(unDia)).toBe(1);
  });
});

describe("SLT-86 R25 — la fecha de efecto por defecto: el inicio del siguiente período de calendario", () => {
  it.each([
    { tipo: "quincenal", ahora: "2026-11-05T15:00:00.000Z", fecha: "2026-11-16" },
    { tipo: "quincenal", ahora: "2026-11-20T15:00:00.000Z", fecha: "2026-12-01" },
    { tipo: "mensual", ahora: "2026-11-05T15:00:00.000Z", fecha: "2026-12-01" },
    { tipo: "bimestral", ahora: "2026-11-05T15:00:00.000Z", fecha: "2027-01-01" },
    { tipo: "bimestral", ahora: "2027-02-27T15:00:00.000Z", fecha: "2027-03-01" },
    { tipo: "anual", ahora: "2026-11-05T15:00:00.000Z", fecha: "2027-01-01" },
    // 21:00 del 30 de noviembre en la plataforma = 03:00 UTC del 1 de diciembre: sigue siendo noviembre.
    { tipo: "mensual", ahora: "2026-12-01T03:00:00.000Z", fecha: "2026-12-01" },
  ] as const)("$tipo a $ahora → $fecha", ({ tipo, ahora, fecha }) => {
    expect(fechaDeEfectoPorDefecto(tipo, new Date(ahora))).toBe(fecha);
  });

  it("cae siempre dentro del rango de R16: de mañana a hoy + 12 meses", () => {
    for (let d = 0; d < 400; d += 3) {
      const ahora = new Date(Date.UTC(2026, 0, 1, 15) + d * 86_400_000);
      const hoy = rangoDelInicioDelCiclo(ahora).hoy;
      for (const tipo of TIPOS_COBRO) {
        const fecha = fechaDeEfectoPorDefecto(tipo, ahora);
        expect(fecha > hoy).toBe(true);
        expect(fecha <= fechaMasMeses(hoy, 12)).toBe(true);
      }
    }
  });
});

// Movidos de `tests/unit/utils/ciclo-plan.test.ts`, que se retira (design §9): R2 conserva el rango de
// SLT-58 R30 para la fecha de inicio.
describe("SLT-86 R2 — el rango de la fecha de inicio de la primera asignación sigue siendo el de SLT-58 R30", () => {
  it.each([
    { caso: "un día cualquiera", ahora: "2026-10-29T15:00:00.000Z", hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" },
    { caso: "hoy 31 de marzo, año normal", ahora: "2027-03-31T15:00:00.000Z", hoy: "2027-03-31", min: "2027-02-28", max: "2027-04-30" },
    { caso: "hoy 31 de marzo, año bisiesto", ahora: "2028-03-31T15:00:00.000Z", hoy: "2028-03-31", min: "2028-02-29", max: "2028-04-30" },
    { caso: "hoy es el de la plataforma: las 21:00 del 31 de octubre", ahora: "2026-11-01T03:00:00.000Z", hoy: "2026-10-31", min: "2026-09-30", max: "2026-11-30" },
    { caso: "cruza de año hacia adelante", ahora: "2026-12-15T15:00:00.000Z", hoy: "2026-12-15", min: "2026-11-15", max: "2027-01-15" },
  ])("$caso", ({ ahora, hoy, min, max }) => {
    expect(rangoDelInicioDelCiclo(new Date(ahora))).toEqual({ hoy, min, max });
  });
});

// SLT-58 R32 tal cual hasta T8, que hace que «hoy» entre a las 00:00 (SLT-86 R2). Movido de
// `ciclo-plan.test.ts` para no perder su cobertura al retirarlo.
describe("SLT-58 — anclaDeLaFechaElegida (R32), hasta T8", () => {
  it("hoy ancla en el instante de la asignación; otra fecha, a las 00:00 de la plataforma", () => {
    expect(anclaDeLaFechaElegida("2026-10-29", new Date("2026-10-29T15:00:00.000Z"))).toBe("ahora");
    expect(anclaDeLaFechaElegida("2026-10-29", new Date("2026-10-30T03:00:00.000Z"))).toBe("ahora");
    expect(anclaDeLaFechaElegida("2026-11-05", new Date("2026-10-29T15:00:00.000Z"))).toEqual(
      new Date("2026-11-05T06:00:00.000Z"),
    );
  });
});
