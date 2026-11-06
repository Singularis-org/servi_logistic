import { describe, expect, it } from "vitest";

import { inicioDelCicloPorDefecto, rangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import {
  montoDelPeriodo,
  tipoCobroDelHistorial,
  valorDelHistorialDeAsignacion,
} from "@/lib/planes/cobro";
import type { PrecioPlan } from "@/lib/types/planes";

// Ajuste planes-custom (D5, D6, D7, D10, D14, D16; 2026-10-31) — lo que paga la empresa por período y cuándo toca
// el siguiente cobro. Puro: sin base y sin reloj propio. La plataforma va a −06:00 sin horario de
// verano, así que «hoy» de un instante es su fecha seis horas antes en UTC.

const mensual = (m: string, descuentos: Extract<PrecioPlan, { tipo: "monto" }>["descuentos"] = {}): PrecioPlan => ({
  tipo: "monto",
  mensual: m,
  descuentos,
});

describe("D7 — montoDelPeriodo: decimal exacto, dos decimales (SLT-86: el anual es un descuento del período)", () => {
  it("mensual: el mensual, con dos decimales; un descuento anual no lo toca", () => {
    expect(montoDelPeriodo(mensual("49.9"), "mensual")).toBe("49.90");
    expect(montoDelPeriodo(mensual("1000.00", { anual: { tipo: "monto", monto: "3000" } }), "mensual")).toBe("1000.00");
  });

  it("anual con el anual fijo de antes (10 000), convertido en descuento de monto (R33): 10 000", () => {
    expect(montoDelPeriodo(mensual("1000.00", { anual: { tipo: "monto", monto: "2000" } }), "anual")).toBe("10000.00");
  });

  it("anual con descuento: mensual × 12 × (1 − %)", () => {
    expect(montoDelPeriodo(mensual("1000.00", { anual: { tipo: "porcentaje", porcentaje: "10" } }), "anual")).toBe("10800.00");
    expect(montoDelPeriodo(mensual("1000.00", { anual: { tipo: "porcentaje", porcentaje: "100.00" } }), "anual")).toBe("0.00");
  });

  it("anual sin descuento: mensual × 12 («anual» se puede elegir siempre)", () => {
    expect(montoDelPeriodo(mensual("49.90"), "anual")).toBe("598.80");
    // El mayor `DECIMAL(12,2)`: exacto hasta el céntimo.
    expect(montoDelPeriodo(mensual("9999999999.99"), "anual")).toBe("119999999999.88");
  });

  it("redondeo al céntimo, la mitad hacia arriba, sin coma flotante", () => {
    // 33.33 × 12 = 399.96; × 0.875 = 349.965 → 349.97 (la mitad sube).
    expect(montoDelPeriodo(mensual("33.33", { anual: { tipo: "porcentaje", porcentaje: "12.5" } }), "anual")).toBe("349.97");
    // 0.10 × 12 = 1.20; × 0.6667 = 0.80004 → 0.80 (por debajo de la mitad baja).
    expect(montoDelPeriodo(mensual("0.10", { anual: { tipo: "porcentaje", porcentaje: "33.33" } }), "anual")).toBe("0.80");
    // 0.1 + 0.2 en coma flotante no es 0.3; aquí 0.15 × 12 × 0.5 = 0.90 exacto.
    expect(montoDelPeriodo(mensual("0.15", { anual: { tipo: "porcentaje", porcentaje: "50" } }), "anual")).toBe("0.90");
  });

  it("un plan sin costo base no tiene monto del período, sea cual sea el tipo", () => {
    expect(montoDelPeriodo({ tipo: "sin_precio" }, "mensual")).toBeNull();
    expect(montoDelPeriodo({ tipo: "sin_precio" }, "anual")).toBeNull();
  });
});

// D8 (el siguiente cobro en el aniversario del ancla) y la forma de D9 los sustituye el período de
// calendario de SLT-86 (R27): se prueban en `cobro-periodo.test.ts`.

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

describe("D10, D14, D16 — el tipo de cobro de cada fila del historial de asignaciones", () => {
  it("una asignación (valor_anterior NULL) trae el tipo, con o sin fecha delante", () => {
    expect(tipoCobroDelHistorial("plan_asignado", null, "anual")).toEqual({ tipo: "asignacion", tipoCobro: "anual", tipoCobroAnterior: null, desde: null });
    expect(tipoCobroDelHistorial("plan_asignado", null, valorDelHistorialDeAsignacion("2026-11-01", "mensual"))).toEqual({
      tipo: "asignacion",
      tipoCobro: "mensual",
      tipoCobroAnterior: null,
      desde: "2026-11-01",
    });
  });

  it("D16: un cambio de solo el tipo (D10) es la acción `plan_tipo_cobro_cambiado` y trae los dos tipos", () => {
    expect(tipoCobroDelHistorial("plan_tipo_cobro_cambiado", "mensual", "anual")).toEqual({
      tipo: "cambio_tipo_cobro",
      tipoCobro: "anual",
      tipoCobroAnterior: "mensual",
      desde: null,
    });
    expect(tipoCobroDelHistorial("plan_tipo_cobro_cambiado", "anual", "mensual")).toEqual({
      tipo: "cambio_tipo_cobro",
      tipoCobro: "mensual",
      tipoCobroAnterior: "anual",
      desde: null,
    });
  });

  it("D16: en `plan_tipo_cobro_cambiado`, un valor fuera del vocabulario no se inventa como tipo", () => {
    expect(tipoCobroDelHistorial("plan_tipo_cobro_cambiado", null, "trimestral")).toEqual({
      tipo: "cambio_tipo_cobro",
      tipoCobro: null,
      tipoCobroAnterior: null,
      desde: null,
    });
  });

  it("un `plan_asignado` con el tipo de antes (la forma anterior a D16, la que deja el down) sigue siendo un cambio de solo el tipo", () => {
    expect(tipoCobroDelHistorial("plan_asignado", "mensual", "anual")).toEqual({
      tipo: "cambio_tipo_cobro",
      tipoCobro: "anual",
      tipoCobroAnterior: "mensual",
      desde: null,
    });
  });

  it("las filas anteriores al ajuste no tienen tipo: NULL o solo la fecha de SLT-58 (que sí se lee, R30)", () => {
    expect(tipoCobroDelHistorial("plan_asignado", null, null)).toEqual({ tipo: "asignacion", tipoCobro: null, tipoCobroAnterior: null, desde: null });
    expect(tipoCobroDelHistorial("plan_asignado", null, "2026-10-01")).toEqual({ tipo: "asignacion", tipoCobro: null, tipoCobroAnterior: null, desde: "2026-10-01" });
  });

  it("un texto fuera del vocabulario no se inventa como tipo", () => {
    expect(tipoCobroDelHistorial("plan_asignado", null, "trimestral")).toEqual({ tipo: "asignacion", tipoCobro: null, tipoCobroAnterior: null, desde: null });
    expect(tipoCobroDelHistorial("plan_asignado", "otro", "anual")).toEqual({ tipo: "asignacion", tipoCobro: "anual", tipoCobroAnterior: null, desde: null });
  });
});
