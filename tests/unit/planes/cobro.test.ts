import { describe, expect, it } from "vitest";

import { inicioDelCicloPorDefecto, rangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { cobroDelPlan, montoDelPeriodo, siguienteCobro, valorDelHistorialDeAsignacion } from "@/lib/planes/cobro";
import type { PrecioPlan } from "@/lib/types/planes";

// Ajuste planes-custom (D5, D6, D7, D8; 2026-10-31) — lo que paga la empresa por período y cuándo toca
// el siguiente cobro. Puro: sin base y sin reloj propio. La plataforma va a −06:00 sin horario de
// verano, así que «hoy» de un instante es su fecha seis horas antes en UTC.

const mensual = (m: string, anual: Extract<PrecioPlan, { tipo: "monto" }>["anual"] = null): PrecioPlan => ({
  tipo: "monto",
  mensual: m,
  anual,
});

describe("D7 — montoDelPeriodo: decimal exacto, dos decimales", () => {
  it("mensual: el mensual, con dos decimales", () => {
    expect(montoDelPeriodo(mensual("49.9"), "mensual")).toBe("49.90");
    expect(montoDelPeriodo(mensual("1000.00", { tipo: "fijo", monto: "9000" }), "mensual")).toBe("1000.00");
  });

  it("anual con anual fijo: el anual fijo", () => {
    expect(montoDelPeriodo(mensual("1000.00", { tipo: "fijo", monto: "10000" }), "anual")).toBe("10000.00");
  });

  it("anual con descuento: mensual × 12 × (1 − %)", () => {
    expect(montoDelPeriodo(mensual("1000.00", { tipo: "descuento", porcentaje: "10" }), "anual")).toBe("10800.00");
    expect(montoDelPeriodo(mensual("1000.00", { tipo: "descuento", porcentaje: "100.00" }), "anual")).toBe("0.00");
  });

  it("anual sin anual en el plan: mensual × 12 («anual» se puede elegir siempre)", () => {
    expect(montoDelPeriodo(mensual("49.90"), "anual")).toBe("598.80");
    // El mayor `DECIMAL(12,2)`: exacto hasta el céntimo.
    expect(montoDelPeriodo(mensual("9999999999.99"), "anual")).toBe("119999999999.88");
  });

  it("redondeo al céntimo, la mitad hacia arriba, sin coma flotante", () => {
    // 33.33 × 12 = 399.96; × 0.875 = 349.965 → 349.97 (la mitad sube).
    expect(montoDelPeriodo(mensual("33.33", { tipo: "descuento", porcentaje: "12.5" }), "anual")).toBe("349.97");
    // 0.10 × 12 = 1.20; × 0.6667 = 0.80004 → 0.80 (por debajo de la mitad baja).
    expect(montoDelPeriodo(mensual("0.10", { tipo: "descuento", porcentaje: "33.33" }), "anual")).toBe("0.80");
    // 0.1 + 0.2 en coma flotante no es 0.3; aquí 0.15 × 12 × 0.5 = 0.90 exacto.
    expect(montoDelPeriodo(mensual("0.15", { tipo: "descuento", porcentaje: "50" }), "anual")).toBe("0.90");
  });

  it("un plan sin costo base no tiene monto del período, sea cual sea el tipo", () => {
    expect(montoDelPeriodo({ tipo: "sin_precio" }, "mensual")).toBeNull();
    expect(montoDelPeriodo({ tipo: "sin_precio" }, "anual")).toBeNull();
  });
});

describe("D8 — siguienteCobro: el primer aniversario del ancla que no cae antes de hoy", () => {
  // Ancla de una fecha elegida: las 00:00 de la plataforma (06:00 UTC).
  const ancla = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);
  // Mediodía de la plataforma de ese día.
  const dia = (fecha: string) => new Date(`${fecha}T18:00:00.000Z`);

  it("mensual: ancla + n meses", () => {
    expect(siguienteCobro(ancla("2026-01-15"), "mensual", dia("2026-03-20"))).toBe("2026-04-15");
    expect(siguienteCobro(ancla("2026-01-15"), "mensual", dia("2026-03-14"))).toBe("2026-03-15");
  });

  it("hoy es el aniversario: el siguiente cobro es hoy; un día después, el mes siguiente", () => {
    expect(siguienteCobro(ancla("2026-01-15"), "mensual", dia("2026-03-15"))).toBe("2026-03-15");
    expect(siguienteCobro(ancla("2026-01-15"), "mensual", dia("2026-03-16"))).toBe("2026-04-15");
    expect(siguienteCobro(ancla("2026-02-10"), "anual", dia("2027-02-10"))).toBe("2027-02-10");
    // El mismo día del ancla también es «hoy».
    expect(siguienteCobro(ancla("2026-10-31"), "mensual", dia("2026-10-31"))).toBe("2026-10-31");
  });

  it("«hoy» es el de la plataforma: a las 23:00 del 14 en la plataforma ya es 15 en UTC y no cuenta", () => {
    const tarde = new Date("2026-03-15T05:00:00.000Z");
    expect(siguienteCobro(ancla("2026-01-15"), "mensual", tarde)).toBe("2026-03-15");
    expect(siguienteCobro(ancla("2026-01-15"), "mensual", new Date("2026-03-16T05:59:00.000Z"))).toBe("2026-03-15");
  });

  it("días 29–31: el último día del mes, siempre contando desde el ancla (sin arrastrar el 28)", () => {
    const fin = ancla("2027-01-31");
    expect(siguienteCobro(fin, "mensual", dia("2027-02-10"))).toBe("2027-02-28");
    expect(siguienteCobro(fin, "mensual", dia("2027-03-01"))).toBe("2027-03-31");
    expect(siguienteCobro(fin, "mensual", dia("2027-04-05"))).toBe("2027-04-30");
    expect(siguienteCobro(ancla("2028-01-31"), "mensual", dia("2028-02-01"))).toBe("2028-02-29");
    expect(siguienteCobro(ancla("2026-03-30"), "mensual", dia("2027-02-01"))).toBe("2027-02-28");
  });

  it("anual: ancla + n años; un 29 de febrero cobra el 28 en los años no bisiestos", () => {
    expect(siguienteCobro(ancla("2026-02-10"), "anual", dia("2026-10-31"))).toBe("2027-02-10");
    expect(siguienteCobro(ancla("2026-02-10"), "anual", dia("2027-02-11"))).toBe("2028-02-10");
    expect(siguienteCobro(ancla("2028-02-29"), "anual", dia("2028-03-01"))).toBe("2029-02-28");
    expect(siguienteCobro(ancla("2028-02-29"), "anual", dia("2031-12-01"))).toBe("2032-02-29");
  });

  it("ancla futura (primera asignación con fecha futura): el primer cobro es el ancla", () => {
    expect(siguienteCobro(ancla("2026-11-01"), "mensual", dia("2026-10-31"))).toBe("2026-11-01");
    expect(siguienteCobro(ancla("2026-11-01"), "anual", dia("2026-10-31"))).toBe("2026-11-01");
  });

  it("ancla «hoy» (el instante de asignar): cuenta su día en la plataforma, no el UTC", () => {
    // 2026-10-31 23:30 UTC = 17:30 del 31 en la plataforma; noviembre no tiene 31.
    const instante = new Date("2026-10-31T23:30:00.000Z");
    expect(siguienteCobro(instante, "mensual", new Date("2026-11-30T05:00:00.000Z"))).toBe("2026-11-30");
  });
});

describe("D9 — cobroDelPlan junta tipo, monto y siguiente cobro", () => {
  it("lo que pintan «Mi plan» y el detalle de empresa", () => {
    const ancla = new Date("2026-01-15T06:00:00.000Z");
    const ahora = new Date("2026-03-20T18:00:00.000Z");
    expect(cobroDelPlan(mensual("1000.00", { tipo: "descuento", porcentaje: "10" }), "anual", ancla, ahora)).toEqual({
      tipo: "anual",
      montoPeriodo: "10800.00",
      siguienteCobro: "2027-01-15",
    });
    expect(cobroDelPlan({ tipo: "sin_precio" }, "mensual", ancla, ahora)).toEqual({
      tipo: "mensual",
      montoPeriodo: null,
      siguienteCobro: "2026-04-15",
    });
  });
});

describe("D6 — el valor_nuevo de la fila plan_asignado", () => {
  it("el tipo de cobro, precedido de la fecha elegida si la hubo; cabe en los 60 de la columna", () => {
    expect(valorDelHistorialDeAsignacion(null, "mensual")).toBe("mensual");
    expect(valorDelHistorialDeAsignacion("2026-11-01", "anual")).toBe("2026-11-01 · anual");
    expect(valorDelHistorialDeAsignacion("2026-11-01", "mensual").length).toBeLessThanOrEqual(60);
  });
});

describe("D5 — inicio del ciclo por defecto: mañana en la hora de la plataforma", () => {
  it("a las 23:00 del 30 en la plataforma (ya 31 en UTC), mañana es el 31", () => {
    expect(inicioDelCicloPorDefecto(new Date("2026-10-31T05:00:00.000Z"))).toBe("2026-10-31");
  });

  it("a la 01:00 del 31 en la plataforma, mañana es el 1 de noviembre, y cae dentro del rango elegible", () => {
    const ahora = new Date("2026-10-31T07:00:00.000Z");
    const manana = inicioDelCicloPorDefecto(ahora);
    expect(manana).toBe("2026-11-01");
    const { min, max } = rangoDelInicioDelCiclo(ahora);
    expect(manana >= min && manana <= max).toBe(true);
  });
});
