import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FACTURAS_TEXTOS,
  diasVisibles,
  estadoVisible,
  instanteVisible,
  numeroVisible,
  paginasDe,
  periodoVisible,
  sumaDeCuotas,
} from "@/components/shared/facturas/facturas-vista";
import type { CuotaDeLaFactura } from "@/lib/types/factura-plataforma";

// SLT-119 (design §6.1; R2, R3, R4) — la vista pura de las facturas de la plataforma. Los instantes van en UTC:
// las 00:00 de la hora de la plataforma (−06:00) son las 06:00 UTC.

const cr = (fecha: string, hora = "00:00") => {
  const [h, m] = hora.split(":").map((n) => Number.parseInt(n, 10));
  return new Date(Date.parse(`${fecha}T00:00:00.000Z`) + ((h + 6) * 60 + m) * 60_000);
};

function cuota(extra: Partial<CuotaDeLaFactura> = {}): CuotaDeLaFactura {
  return {
    planId: "p-1",
    planNombre: "Crecer",
    tipoCobro: "mensual",
    desde: cr("2026-12-01"),
    hasta: cr("2027-01-01"),
    precioMensual: "1000.00",
    cuota: "1000.00",
    diasCobrados: 31,
    diasPeriodo: 31,
    ...extra,
  };
}

describe("SLT-119 R3 — el período: primer y último día de [desde, hasta) en la hora de la plataforma", () => {
  it.each([
    ["primera quincena", cr("2026-11-01"), cr("2026-11-16"), "1 nov 2026 – 15 nov 2026"],
    ["segunda quincena", cr("2026-11-16"), cr("2026-12-01"), "16 nov 2026 – 30 nov 2026"],
    ["la sembrada histórica", cr("2026-09-03"), cr("2026-11-16"), "3 sep 2026 – 15 nov 2026"],
    ["una de un solo día (SLT-118 R28)", cr("2026-11-16"), cr("2026-11-17"), "16 nov 2026 – 16 nov 2026"],
  ])("R3: %s", (_caso, desde, hasta, esperado) => {
    expect(periodoVisible(desde, hasta)).toBe(esperado);
  });

  it("R3: el último día es el de la plataforma, no el de UTC (las 05:59 UTC del 16 aún son el 15)", () => {
    // `hasta` a las 00:00 del 16 en la plataforma son las 06:00 UTC del 16; un corte en UTC daría el 16.
    expect(periodoVisible(cr("2026-11-01"), new Date("2026-11-16T06:00:00.000Z"))).toBe("1 nov 2026 – 15 nov 2026");
  });
});

describe("SLT-119 R4 — el número visible", () => {
  it("R4: una cerrada con número 7 → «N.º 7», sin ceros a la izquierda", () => {
    expect(numeroVisible({ estado: "cerrada", numero: 7 })).toBe("N.º 7");
    expect(numeroVisible({ estado: "cerrada", numero: 120 })).toBe("N.º 120");
  });

  it.each(["en_curso", "por_cerrar"] as const)("R4: una %s no muestra número", (estado) => {
    expect(numeroVisible({ estado, numero: null })).toBeNull();
  });
});

describe("SLT-119 R2 — el estado visible", () => {
  it("R2: la cerrada es «Emitida»", () => {
    expect(estadoVisible({ estado: "cerrada" })).toBe("Emitida");
  });

  it.each(["en_curso", "por_cerrar"] as const)("R2: una %s es «En curso» (SLT-118 R24)", (estado) => {
    expect(estadoVisible({ estado })).toBe("En curso");
  });
});

describe("SLT-119 R1, R5 — la suma de las cuotas", () => {
  it("R1: sin cuotas → null (la lista pinta «—»)", () => {
    expect(sumaDeCuotas({ cuota: null, primeraCuota: null })).toBeNull();
  });

  it("R5: suma exacta en céntimos de los importes de la base, sin redondear", () => {
    expect(sumaDeCuotas({ cuota: cuota({ cuota: "1234.56" }), primeraCuota: null })).toBe("1234.56");
    expect(sumaDeCuotas({ cuota: cuota({ cuota: "0.10" }), primeraCuota: cuota({ cuota: "0.20" }) })).toBe("0.30");
    expect(
      sumaDeCuotas({ cuota: cuota({ cuota: "99999999999.99" }), primeraCuota: cuota({ cuota: "0.01" }) }),
    ).toBe("100000000000.00");
  });
});

describe("SLT-119 R6, R7, R10 — días, instante y páginas", () => {
  it("R6: «X de Y días» solo en una cuota prorrateada", () => {
    expect(diasVisibles({ diasCobrados: 16, diasPeriodo: 30 })).toBe("16 de 30 días");
    expect(diasVisibles({ diasCobrados: 31, diasPeriodo: 31 })).toBeNull();
  });

  it("R7: fecha y hora del cobro en la hora de la plataforma", () => {
    expect(instanteVisible(cr("2026-11-14", "09:05"))).toBe("14 nov 2026 09:05");
    // Las 03:00 UTC del 15 aún son el 14 a las 21:00 en la plataforma.
    expect(instanteVisible(new Date("2026-11-15T03:00:00.000Z"))).toBe("14 nov 2026 21:00");
  });

  it("R10: páginas de una factura; al menos una aunque no tenga líneas", () => {
    expect(paginasDe(230, 100)).toBe(3);
    expect(paginasDe(200, 100)).toBe(2);
    expect(paginasDe(0, 100)).toBe(1);
  });

  it("R18, R17: los textos de vacío y fallo", () => {
    expect(FACTURAS_TEXTOS.vacio).toBe("Aún no hay facturas de la empresa");
    expect(FACTURAS_TEXTOS.errorLista).toBe("No se pudieron cargar las facturas");
    expect(FACTURAS_TEXTOS.errorDetalle).toBe("No se pudo cargar la factura");
  });
});

describe("SLT-119 (design §6.1) — la vista no depende de la capa de servidor", () => {
  it("facturas-vista.ts no importa de lib/actions, lib/services, lib/repositories ni lib/db", () => {
    const fuente = readFileSync(
      path.resolve(__dirname, "../../../components/shared/facturas/facturas-vista.ts"),
      "utf8",
    );
    expect(fuente).not.toMatch(/from\s+["']@\/lib\/(actions|services|repositories|db)\b/);
  });
});
