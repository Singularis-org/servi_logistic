import { describe, expect, it } from "vitest";

import {
  MENSAJE_EMPRESA_CONGELADA,
  MORA_TEXTOS,
  enFranjaDeMadrugada,
  estaVencida,
  estadoDeMora,
  fechaLegible,
  fechaLimiteDePago,
  venceEn,
  type FilaMora,
  type OrganizacionMora,
} from "@/lib/planes/mora";

import { CASOS_FECHA_LIMITE, unMsAntes } from "../../integration/db/_fixtures/fecha-limite-pago";

// SLT-121 · T2.2 (design §3.2; R1, R6, R8, R24) — la gemela TS de la mora. La fecha límite y el instante en que
// vence se prueban con LA MISMA tabla que `factura_plataforma_mora` (`factura-plataforma-mora.test.ts`): si
// las dos se separan, se pone roja una de las suites.

/** Las 00:00 de la plataforma de un día, en UTC. */
const cero = (fecha: string) => new Date(`${fecha}T06:00:00.000Z`);
const aLas = (fecha: string, hhmm: string) =>
  new Date(cero(fecha).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000);

function fila(p: Partial<FilaMora> & Pick<FilaMora, "fechaLimite" | "saldo">): FilaMora {
  return {
    facturaId: p.facturaId ?? `f-${p.fechaLimite}`,
    numero: p.numero ?? 1,
    hastaAt: p.hastaAt ?? cero("2026-11-16"),
    saldo: p.saldo,
    fechaLimite: p.fechaLimite,
    venceAt: venceEn(p.fechaLimite),
    vencida: false,
  };
}

const LIBRE: OrganizacionMora = { congeladaAt: null, descongeladaHasta: null };

describe("SLT-121 R1 — fechaLimiteDePago y venceEn con la tabla compartida", () => {
  it.each(CASOS_FECHA_LIMITE.map((c) => [c.caso, c] as const))("%s", (_caso, c) => {
    const limite = fechaLimiteDePago(new Date(c.hasta), c.gracia);
    expect(limite).toBe(c.fechaLimite);
    expect(venceEn(limite).toISOString()).toBe(c.venceEn);
  });
});

describe("SLT-121 R6 — estaVencida", () => {
  it.each(CASOS_FECHA_LIMITE.map((c) => [c.caso, c] as const))(
    "%s: vencida desde venceEn y no el milisegundo anterior",
    (_caso, c) => {
      const f = { saldo: "100.00", fechaLimite: c.fechaLimite };
      expect(estaVencida(f, new Date(c.venceEn))).toBe(true);
      expect(estaVencida(f, new Date(unMsAntes(c.venceEn)))).toBe(false);
    },
  );

  it("con saldo 0 o negativo nunca está vencida", () => {
    const muyTarde = new Date("2030-01-01T00:00:00.000Z");
    expect(estaVencida({ saldo: "0.00", fechaLimite: "2026-11-23" }, muyTarde)).toBe(false);
    expect(estaVencida({ saldo: "-30.00", fechaLimite: "2026-11-23" }, muyTarde)).toBe(false);
    expect(estaVencida({ saldo: "0.01", fechaLimite: "2026-11-23" }, muyTarde)).toBe(true);
  });
});

describe("SLT-121 R8 — enFranjaDeMadrugada", () => {
  it.each([
    ["00:00", true],
    ["00:30", true],
    ["05:59", true],
    ["06:00", false],
    ["14:00", false],
    ["23:59", false],
  ])("a las %s de la plataforma → %s", (hora, esperado) => {
    expect(enFranjaDeMadrugada(aLas("2026-11-24", hora))).toBe(esperado);
  });
});

describe("SLT-121 R24 — estadoDeMora en sus cinco estados", () => {
  const ahora = aLas("2026-11-24", "10:00");

  it("al día: sin facturas con saldo", () => {
    expect(estadoDeMora(LIBRE, [], ahora)).toEqual({ estado: "al_dia" });
  });

  it("al día: una fila con saldo 0 no cuenta", () => {
    expect(estadoDeMora(LIBRE, [fila({ fechaLimite: "2026-11-20", saldo: "0.00" })], ahora)).toEqual({ estado: "al_dia" });
  });

  it("en plazo: con la fecha límite más próxima", () => {
    const facturas = [
      fila({ facturaId: "a", fechaLimite: "2026-12-07", saldo: "50.00" }),
      fila({ facturaId: "b", fechaLimite: "2026-11-30", saldo: "10.00" }),
    ];
    expect(estadoDeMora(LIBRE, facturas, ahora)).toEqual({ estado: "en_plazo", fechaLimite: "2026-11-30" });
  });

  it("en plazo el mismo día de la fecha límite, hasta las 23:59", () => {
    const facturas = [fila({ fechaLimite: "2026-11-24", saldo: "50.00" })];
    expect(estadoDeMora(LIBRE, facturas, aLas("2026-11-24", "23:59")).estado).toBe("en_plazo");
    expect(estadoDeMora(LIBRE, facturas, aLas("2026-11-25", "00:00")).estado).toBe("vencida");
  });

  it("vencida: con sus facturas vencidas y el saldo vencido, sin las que siguen en plazo", () => {
    const facturas = [
      fila({ facturaId: "v1", numero: 3, fechaLimite: "2026-11-23", saldo: "1000.50" }),
      fila({ facturaId: "v2", numero: 5, fechaLimite: "2026-11-20", saldo: "0.25" }),
      fila({ facturaId: "p", numero: 6, fechaLimite: "2026-11-30", saldo: "70.00" }),
    ];
    expect(estadoDeMora(LIBRE, facturas, ahora)).toEqual({
      estado: "vencida",
      facturas: [
        { facturaId: "v1", numero: 3, fechaLimite: "2026-11-23", saldo: "1000.50" },
        { facturaId: "v2", numero: 5, fechaLimite: "2026-11-20", saldo: "0.25" },
      ],
      saldoVencido: "1000.75",
    });
  });

  it("congelada: desde cuándo, con las vencidas y su saldo", () => {
    const desde = aLas("2026-11-24", "00:30");
    const facturas = [fila({ facturaId: "v", fechaLimite: "2026-11-23", saldo: "1000.00" })];
    expect(estadoDeMora({ congeladaAt: desde, descongeladaHasta: null }, facturas, ahora)).toEqual({
      estado: "congelada",
      desde,
      facturas: [{ facturaId: "v", numero: 1, fechaLimite: "2026-11-23", saldo: "1000.00" }],
      saldoVencido: "1000.00",
    });
  });

  it("descongelada a mano: mientras dure la fecha hasta y queden vencidas", () => {
    const facturas = [fila({ fechaLimite: "2026-11-23", saldo: "1000.00" })];
    const aMano: OrganizacionMora = { congeladaAt: null, descongeladaHasta: "2026-11-24" };
    expect(estadoDeMora(aMano, facturas, ahora)).toEqual({ estado: "descongelada_a_mano", hasta: "2026-11-24" });
    // Al día siguiente de la fecha hasta ya es «vencida» (la madrugada la congela, R23).
    expect(estadoDeMora(aMano, facturas, aLas("2026-11-25", "00:10")).estado).toBe("vencida");
    // Sin vencidas, un descongelamiento viejo no dice nada.
    expect(estadoDeMora(aMano, [], ahora)).toEqual({ estado: "al_dia" });
  });
});

describe("SLT-121 R24 — textos", () => {
  it("la fecha se pinta dd/mm/aaaa y el mensaje del error es el de R13", () => {
    expect(fechaLegible("2026-11-23")).toBe("23/11/2026");
    expect(MORA_TEXTOS.banner.enPlazo("2026-11-23")).toBe(
      "Tienes una factura de la plataforma por pagar. Fecha límite: 23/11/2026.",
    );
    expect(MORA_TEXTOS.banner.descongeladaAMano("2026-12-01")).toBe("La operación está habilitada hasta el 01/12/2026.");
    expect(MORA_TEXTOS.banner.congelada).toContain("Empresa congelada por falta de pago");
    expect(MENSAJE_EMPRESA_CONGELADA).toBe("Empresa suspendida por falta de pago.");
    expect(MORA_TEXTOS.superadmin.graciaPropia(15)).toBe("15 días (propia)");
    expect(MORA_TEXTOS.superadmin.graciaGlobal(7)).toBe("7 días (global)");
  });
});
