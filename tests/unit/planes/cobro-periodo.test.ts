import { describe, expect, it } from "vitest";

import {
  cobroDelPlan,
  costoDelPeriodoEnCurso,
  costoDelTramo,
  montoDelPeriodo,
  siguienteCobro,
  tipoCobroDelHistorial,
  valorDelHistorialDeAsignacion,
} from "@/lib/planes/cobro";
import type { PendienteDeEmpresa } from "@/lib/types/consumo-plan";
import { TIPOS_COBRO, type DescuentoPeriodo, type PrecioPlan, type TipoCobro } from "@/lib/types/planes";

// SLT-86 (design §4; R9, R10, R12, R15, R27, R30) — el costo base del período de calendario, el de su
// tramo y el siguiente cobro. Puro: sin base y sin reloj propio. La plataforma va a −06:00 sin horario
// de verano: las 00:00 de un día son las 06:00 UTC.

const plan = (mensual: string, descuentos: Partial<Record<TipoCobro, DescuentoPeriodo>> = {}): PrecioPlan => ({
  tipo: "monto",
  mensual,
  descuentos,
});
const pct = (porcentaje: string): DescuentoPeriodo => ({ tipo: "porcentaje", porcentaje });
const fijo = (monto: string): DescuentoPeriodo => ({ tipo: "monto", monto });
/** Las 00:00 de la plataforma de ese día: así queda siempre una entrada. */
const entrada = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);
/** Mediodía de la plataforma de ese día. */
const dia = (fecha: string) => new Date(`${fecha}T18:00:00.000Z`);

describe("R9 — costo base de un período completo a partir del mensual", () => {
  it("quincenal = mensual ÷ 2, mensual = mensual, bimestral = × 2, anual = × 12", () => {
    expect(montoDelPeriodo(plan("50000"), "quincenal")).toBe("25000.00");
    expect(montoDelPeriodo(plan("50000"), "mensual")).toBe("50000.00");
    expect(montoDelPeriodo(plan("50000"), "bimestral")).toBe("100000.00");
    expect(montoDelPeriodo(plan("50000"), "anual")).toBe("600000.00");
  });

  it("decimal exacto con un redondeo final, la mitad hacia arriba: mensual 100.01 → quincenal 50.01", () => {
    expect(montoDelPeriodo(plan("100.01"), "quincenal")).toBe("50.01");
    expect(montoDelPeriodo(plan("0.01"), "quincenal")).toBe("0.01");
    expect(montoDelPeriodo(plan("100.03"), "quincenal")).toBe("50.02");
  });

  it("el mayor DECIMAL(12,2) no pierde céntimos", () => {
    expect(montoDelPeriodo(plan("9999999999.99"), "anual")).toBe("119999999999.88");
  });

  it.each(TIPOS_COBRO)("sin costo base, %s queda «por definir» (null)", (tipo) => {
    expect(montoDelPeriodo({ tipo: "sin_precio" }, tipo)).toBeNull();
  });
});

describe("R10 — un descuento por período, en porcentaje o en monto fijo", () => {
  it("bimestral 100 000 con 5 000 fijo → 95 000.00; con 150 000 fijo → 0.00 (nunca negativo)", () => {
    expect(montoDelPeriodo(plan("50000", { bimestral: fijo("5000") }), "bimestral")).toBe("95000.00");
    expect(montoDelPeriodo(plan("50000", { bimestral: fijo("150000") }), "bimestral")).toBe("0.00");
  });

  it("anual 600 000 con 10 % → 540 000.00; con 100 % → 0.00", () => {
    expect(montoDelPeriodo(plan("50000", { anual: pct("10") }), "anual")).toBe("540000.00");
    expect(montoDelPeriodo(plan("50000", { anual: pct("100.00") }), "anual")).toBe("0.00");
  });

  it("el descuento de un período no toca a los demás", () => {
    const p = plan("50000", { anual: pct("10"), quincenal: fijo("1000") });
    expect(montoDelPeriodo(p, "mensual")).toBe("50000.00");
    expect(montoDelPeriodo(p, "bimestral")).toBe("100000.00");
    expect(montoDelPeriodo(p, "quincenal")).toBe("24000.00");
  });

  it("el porcentaje redondea una sola vez: 33.33 × 12 × 0.875 = 349.965 → 349.97; quincenal 100.01 al 50 % → 25.00", () => {
    expect(montoDelPeriodo(plan("33.33", { anual: pct("12.5") }), "anual")).toBe("349.97");
    // 100.01 / 2 × 0.5 = 25.0025 → 25.00 (sin redondear antes la quincena a 50.01, que daría 25.01).
    expect(montoDelPeriodo(plan("100.01", { quincenal: pct("50") }), "quincenal")).toBe("25.00");
  });

  it("R33: un anual fijo A pasado a descuento 12·mensual − A cuesta A", () => {
    expect(montoDelPeriodo(plan("1000.00", { anual: fijo("2000.00") }), "anual")).toBe("10000.00");
  });
});

describe("R12 — costo de un tramo: costo del período × días del tramo ÷ días del período", () => {
  it("los tres ejemplos del requisito", () => {
    expect(costoDelTramo("31000.00", 22, 31)).toBe("22000.00");
    expect(costoDelTramo("15500.00", 6, 15)).toBe("6200.00");
    expect(costoDelTramo("600000.00", 57, 365)).toBe("93698.63");
  });

  it("la mitad hacia arriba y un período completo cuesta el período", () => {
    // 0.03 × 1 / 2 = 0.015 → 0.02.
    expect(costoDelTramo("0.03", 1, 2)).toBe("0.02");
    expect(costoDelTramo("50.01", 15, 15)).toBe("50.01");
  });

  it("con la entrada del 10 de octubre (mes de 31 días), mensual 31 000 → 22 000.00", () => {
    expect(costoDelPeriodoEnCurso(plan("31000"), "mensual", entrada("2026-10-10"), dia("2026-10-20"))).toBe("22000.00");
  });

  it("quincenal 15 500 con entrada el 10 → 6 de 15 días → 6 200.00", () => {
    expect(costoDelPeriodoEnCurso(plan("31000"), "quincenal", entrada("2026-10-10"), dia("2026-10-12"))).toBe("6200.00");
  });

  it("anual 600 000 con entrada el 5 de noviembre de 2026 → 57 de 365 días → 93 698.63", () => {
    expect(costoDelPeriodoEnCurso(plan("50000"), "anual", entrada("2026-11-05"), dia("2026-12-31"))).toBe("93698.63");
  });

  it("el descuento del período se aplica antes de la proporción", () => {
    // Anual 600 000 − 10 % = 540 000; × 57 / 365 = 84 328.767… → 84 328.77.
    expect(costoDelPeriodoEnCurso(plan("50000", { anual: pct("10") }), "anual", entrada("2026-11-05"), dia("2026-11-06"))).toBe(
      "84328.77",
    );
  });

  it("pasado el tramo, el período siguiente es completo", () => {
    expect(costoDelPeriodoEnCurso(plan("31000"), "quincenal", entrada("2026-10-10"), dia("2026-10-16"))).toBe("15500.00");
    expect(costoDelPeriodoEnCurso(plan("50000"), "anual", entrada("2026-11-05"), dia("2027-01-01"))).toBe("600000.00");
  });

  it("SLT-99 (decisión del 2026-11-10, modifica SLT-66 R28–R29): sin costo base cuesta como base 0, período y tramo", () => {
    expect(costoDelPeriodoEnCurso({ tipo: "sin_precio" }, "mensual", entrada("2026-10-10"), dia("2026-10-20"))).toBe("0.00");
    expect(costoDelPeriodoEnCurso({ tipo: "sin_precio" }, "anual", entrada("2026-01-01"), dia("2026-10-20"))).toBe("0.00");
  });
});

describe("R27 — siguiente cobro: el inicio del siguiente período de calendario, o la fecha del pendiente", () => {
  it.each([
    ["quincenal", "2026-10-03", "2026-10-16"],
    ["quincenal", "2026-10-20", "2026-11-01"],
    ["mensual", "2026-10-20", "2026-11-01"],
    ["bimestral", "2026-11-20", "2027-01-01"],
    ["bimestral", "2026-09-20", "2026-11-01"],
    ["anual", "2026-10-20", "2027-01-01"],
  ] as const)("%s el %s → %s", (tipo, hoy, esperado) => {
    expect(siguienteCobro(tipo, dia(hoy), null)).toBe(esperado);
  });

  it("«hoy» es el de la plataforma: a las 23:00 del 31 de octubre en la plataforma (ya 1 de noviembre en UTC) el siguiente es el 1 de noviembre", () => {
    expect(siguienteCobro("mensual", new Date("2026-11-01T05:00:00.000Z"), null)).toBe("2026-11-01");
    expect(siguienteCobro("mensual", new Date("2026-11-01T06:00:00.000Z"), null)).toBe("2026-12-01");
  });

  it("con un pendiente, su fecha de efecto", () => {
    const pendiente: PendienteDeEmpresa = { planNombre: "Pro", tipo: "quincenal", desde: "2026-10-25" };
    expect(siguienteCobro("anual", dia("2026-10-20"), pendiente)).toBe("2026-10-25");
  });
});

describe("R27, D9 — cobroDelPlan: tipo, período, costo, siguiente cobro y pendiente", () => {
  it("un tramo mensual: período del 10 al 31 marcado como tramo, su costo y el 1 del mes siguiente", () => {
    expect(cobroDelPlan(plan("31000"), "mensual", entrada("2026-10-10"), dia("2026-10-20"), null)).toEqual({
      tipo: "mensual",
      periodo: { desde: "2026-10-10", hasta: "2026-10-31", esTramo: true },
      costo: "22000.00",
      siguienteCobro: "2026-11-01",
      pendiente: null,
    });
  });

  it("anual: el pago del inicio del período en curso y el siguiente, el 1 de enero", () => {
    const c = cobroDelPlan(plan("50000", { anual: pct("10") }), "anual", entrada("2025-03-01"), dia("2026-10-20"), null);
    expect(c).toEqual({
      tipo: "anual",
      periodo: { desde: "2026-01-01", hasta: "2026-12-31", esTramo: false },
      costo: "540000.00",
      siguienteCobro: "2027-01-01",
      pendiente: null,
    });
  });

  it("quincenal de febrero bisiesto: la segunda quincena acaba el 29", () => {
    const c = cobroDelPlan(plan("100.01"), "quincenal", entrada("2027-01-01"), dia("2028-02-20"), null);
    expect(c.periodo).toEqual({ desde: "2028-02-16", hasta: "2028-02-29", esTramo: false });
    expect(c.costo).toBe("50.01");
  });

  it("con un pendiente, el siguiente cobro es su fecha y el pendiente viaja tal cual", () => {
    const pendiente: PendienteDeEmpresa = { planNombre: "Pro", tipo: "bimestral", desde: "2026-11-10" };
    const c = cobroDelPlan({ tipo: "sin_precio" }, "mensual", entrada("2026-01-01"), dia("2026-10-20"), pendiente);
    // SLT-99 (decisión del 2026-11-10): sin costo base, cuota 0.
    expect(c).toMatchObject({ costo: "0.00", siguienteCobro: "2026-11-10", pendiente });
  });
});

describe("R30 — el historial muestra las filas viejas tal cual y las nuevas con su tipo y su fecha", () => {
  it("R19 (decisión del 2026-11-05): una fila `plan_cambio_empresa_cancelado` es `cambio_cancelado` con el tipo y la fecha del cambio cancelado", () => {
    expect(tipoCobroDelHistorial("plan_cambio_empresa_cancelado", null, "2026-12-01 · bimestral")).toEqual({
      tipo: "cambio_cancelado",
      tipoCobro: "bimestral",
      tipoCobroAnterior: null,
      desde: "2026-12-01",
    });
  });

  it("las filas nuevas llevan la fecha de efecto delante del tipo, también quincenal y bimestral", () => {
    expect(valorDelHistorialDeAsignacion("2026-11-16", "quincenal")).toBe("2026-11-16 · quincenal");
    expect(tipoCobroDelHistorial("plan_asignado", null, "2026-11-16 · quincenal")).toEqual({
      tipo: "asignacion",
      tipoCobro: "quincenal",
      tipoCobroAnterior: null,
      desde: "2026-11-16",
    });
    expect(tipoCobroDelHistorial("plan_tipo_cobro_cambiado", "mensual", "2027-01-01 · bimestral")).toEqual({
      tipo: "cambio_tipo_cobro",
      tipoCobro: "bimestral",
      tipoCobroAnterior: "mensual",
      desde: "2027-01-01",
    });
    expect(tipoCobroDelHistorial("plan_tipo_cobro_cambiado", "quincenal", "2027-01-01 · anual")).toMatchObject({
      tipoCobroAnterior: "quincenal",
    });
  });

  it("las filas viejas se leen igual: `plan_asignado` con mensual o anual y `plan_tipo_cobro_cambiado` sin fecha", () => {
    expect(tipoCobroDelHistorial("plan_asignado", null, "anual")).toEqual({
      tipo: "asignacion",
      tipoCobro: "anual",
      tipoCobroAnterior: null,
      desde: null,
    });
    expect(tipoCobroDelHistorial("plan_tipo_cobro_cambiado", "mensual", "anual")).toEqual({
      tipo: "cambio_tipo_cobro",
      tipoCobro: "anual",
      tipoCobroAnterior: "mensual",
      desde: null,
    });
    // SLT-58: solo la fecha de inicio, sin tipo.
    expect(tipoCobroDelHistorial("plan_asignado", null, "2026-10-01")).toEqual({
      tipo: "asignacion",
      tipoCobro: null,
      tipoCobroAnterior: null,
      desde: "2026-10-01",
    });
  });
});
