import { describe, expect, it } from "vitest";

import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { precioQueRigeEn } from "@/lib/planes/precio-que-rige";
import type { PrecioDesde, PrecioPlan } from "@/lib/types/planes";

// SLT-86 (R15, R25; review m4) — el precio que rige el primer período o tramo de un cambio de empresa: el
// del mayor `desde` que no pase de las 00:00 de la plataforma de la fecha de efecto.

const P31: PrecioPlan = { tipo: "monto", mensual: "31000.00", descuentos: {} };
const P35: PrecioPlan = { tipo: "monto", mensual: "35000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } };
const P40: PrecioPlan = { tipo: "monto", mensual: "40000.00", descuentos: {} };

/** Las 00:00 de la plataforma de `fecha`, en ISO: como las entrega el servidor. */
const a0000 = (fecha: string) => inicioDelDiaPlataforma(fecha).toISOString();

const SIEMPRE_31: PrecioDesde = { desde: null, precio: P31 };
const EL_20_35: PrecioDesde = { desde: a0000("2026-11-20"), precio: P35 };

describe("SLT-86 R15, R25 — precioQueRigeEn", () => {
  it("sin ediciones: el precio de siempre, en cualquier fecha", () => {
    expect(precioQueRigeEn([SIEMPRE_31], "2026-11-06")).toEqual(P31);
    expect(precioQueRigeEn([SIEMPRE_31], "2027-11-06")).toEqual(P31);
  });

  it("con una edición programada ANTES de la fecha de efecto: el precio nuevo", () => {
    expect(precioQueRigeEn([SIEMPRE_31, EL_20_35], "2026-12-01")).toEqual(P35);
  });

  it("con la edición programada DESPUÉS de la fecha de efecto: el precio actual", () => {
    expect(precioQueRigeEn([SIEMPRE_31, EL_20_35], "2026-11-19")).toEqual(P31);
  });

  it("justo en la fecha de la edición: el nuevo (rige desde sus 00:00)", () => {
    expect(precioQueRigeEn([SIEMPRE_31, EL_20_35], "2026-11-20")).toEqual(P35);
  });

  it("con varias ediciones, la del mayor `desde` que no pase de la fecha; el orden de la lista no importa", () => {
    const el01_40: PrecioDesde = { desde: a0000("2027-01-01"), precio: P40 };
    const historial = [el01_40, SIEMPRE_31, EL_20_35];
    expect(precioQueRigeEn(historial, "2026-12-31")).toEqual(P35);
    expect(precioQueRigeEn(historial, "2027-01-01")).toEqual(P40);
    expect(precioQueRigeEn(historial, "2026-11-10")).toEqual(P31);
  });

  it("la fila vigente hoy con fecha (sin `-infinity`) rige su día y después; antes, ninguna: null", () => {
    const hoy: PrecioDesde = { desde: a0000("2026-11-06"), precio: P31 };
    expect(precioQueRigeEn([hoy, EL_20_35], "2026-11-06")).toEqual(P31);
    expect(precioQueRigeEn([hoy], "2026-11-05")).toBeNull();
    expect(precioQueRigeEn([], "2026-11-06")).toBeNull();
  });

  it("dos con el mismo `desde`: el último de la lista (el programado va detrás del historial)", () => {
    const programado: PrecioDesde = { desde: EL_20_35.desde, precio: P40 };
    expect(precioQueRigeEn([SIEMPRE_31, EL_20_35, programado], "2026-11-20")).toEqual(P40);
  });

  it("sin precio también rige: el plan sin costo base desde esa fecha", () => {
    const sinPrecio: PrecioDesde = { desde: a0000("2026-11-20"), precio: { tipo: "sin_precio" } };
    expect(precioQueRigeEn([SIEMPRE_31, sinPrecio], "2026-11-25")).toEqual({ tipo: "sin_precio" });
  });
});
