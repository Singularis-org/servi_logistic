import { describe, expect, it } from "vitest";

import {
  MENSAJE_EMPRESA_CONGELADA,
  MORA_TEXTOS,
  enFranjaDeMadrugada,
  estaVencida,
  estadoDeMora,
  fechaLegible,
  fechaLimiteDePago,
  plazoVigente,
  venceEn,
  type FilaMora,
  type OrganizacionMora,
} from "@/lib/planes/mora";

import { CASOS_FECHA_LIMITE, unMsAntes } from "../../integration/db/_fixtures/fecha-limite-pago";

// SLT-121 · T2.2 (design §3.2; R1, R6, R8, R24) — la gemela TS de la mora. La fecha límite y el instante en que
// vence se prueban con LA MISMA tabla que `factura_plataforma_mora` (`factura-plataforma-mora.test.ts`): si
// las dos se separan, se pone roja una de las suites.
//
// SLT-255 · T2.1 (design §2; R1, R11, R12): `plazoVigente` y el estado `con_plazo`, que reemplaza a
// `descongelada_a_mano`.

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

  it("descongelada a mano: el plazo dura hasta la fecha hasta (SLT-255: el estado es con_plazo)", () => {
    const facturas = [fila({ fechaLimite: "2026-11-23", saldo: "1000.00" })];
    const aMano: OrganizacionMora = { congeladaAt: null, descongeladaHasta: "2026-11-24" };
    expect(estadoDeMora(aMano, facturas, ahora)).toEqual({ estado: "con_plazo", hasta: "2026-11-24" });
    // Al día siguiente de la fecha hasta ya es «vencida» (la madrugada la congela, R23).
    expect(estadoDeMora(aMano, facturas, aLas("2026-11-25", "00:10")).estado).toBe("vencida");
    // Sin facturas con saldo, un plazo no dice nada.
    expect(estadoDeMora(aMano, [], ahora)).toEqual({ estado: "al_dia" });
  });
});

describe("SLT-255 R1 — plazoVigente", () => {
  const ahora = aLas("2026-11-24", "10:00");

  it("vigente hasta las 23:59:59 de su día en la hora de la plataforma; al día siguiente ya no", () => {
    const o: OrganizacionMora = { congeladaAt: null, descongeladaHasta: "2026-11-24" };
    expect(plazoVigente(o, ahora)).toBe("2026-11-24");
    expect(plazoVigente(o, new Date(aLas("2026-11-25", "00:00").getTime() - 1))).toBe("2026-11-24");
    expect(plazoVigente(o, aLas("2026-11-25", "00:00"))).toBeNull();
  });

  it("uno que vence más adelante es vigente; uno de ayer no; sin fecha no hay plazo", () => {
    expect(plazoVigente({ congeladaAt: null, descongeladaHasta: "2026-12-10" }, ahora)).toBe("2026-12-10");
    expect(plazoVigente({ congeladaAt: null, descongeladaHasta: "2026-11-23" }, ahora)).toBeNull();
    expect(plazoVigente(LIBRE, ahora)).toBeNull();
  });

  it("una congelada no tiene plazo vigente, aunque la fecha no haya pasado", () => {
    expect(plazoVigente({ congeladaAt: aLas("2026-11-24", "00:30"), descongeladaHasta: "2026-11-30" }, ahora)).toBeNull();
  });
});

describe("SLT-255 R11, R12 — estadoDeMora con plazo", () => {
  const ahora = aLas("2026-11-24", "10:00");
  const vencida = fila({ fechaLimite: "2026-11-23", saldo: "1000.00" });
  const conPlazo = (hasta: string): OrganizacionMora => ({ congeladaAt: null, descongeladaHasta: hasta });

  it("R11: con vencidas y plazo vigente → con_plazo, venga de una prórroga o de un descongelamiento a mano", () => {
    expect(estadoDeMora(conPlazo("2026-11-28"), [vencida], ahora)).toEqual({ estado: "con_plazo", hasta: "2026-11-28" });
    // El último día del plazo sigue siendo con_plazo; al día siguiente, vencida (la madrugada la congela, R9).
    expect(estadoDeMora(conPlazo("2026-11-24"), [vencida], ahora)).toEqual({ estado: "con_plazo", hasta: "2026-11-24" });
    expect(estadoDeMora(conPlazo("2026-11-24"), [vencida], aLas("2026-11-25", "00:10")).estado).toBe("vencida");
  });

  it("R11: una factura en plazo cuya fecha límite cae dentro del plazo ya da con_plazo (el ejemplo de la ficha)", () => {
    const enPlazo = fila({ fechaLimite: "2026-11-25", saldo: "300.00" });
    expect(estadoDeMora(conPlazo("2026-11-27"), [enPlazo], ahora)).toEqual({ estado: "con_plazo", hasta: "2026-11-27" });
    // La fecha límite igual a la fecha hasta también cuenta.
    expect(estadoDeMora(conPlazo("2026-11-25"), [enPlazo], ahora)).toEqual({ estado: "con_plazo", hasta: "2026-11-25" });
  });

  it("R12: si ninguna factura con saldo vence dentro del plazo, el banner es el de siempre", () => {
    const enPlazo = fila({ fechaLimite: "2026-11-30", saldo: "300.00" });
    expect(estadoDeMora(conPlazo("2026-11-27"), [enPlazo], ahora)).toEqual({ estado: "en_plazo", fechaLimite: "2026-11-30" });
    // Sin saldo no hay nada que avisar, haya o no plazo.
    expect(estadoDeMora(conPlazo("2026-11-27"), [], ahora)).toEqual({ estado: "al_dia" });
    expect(estadoDeMora(conPlazo("2026-11-27"), [fila({ fechaLimite: "2026-11-23", saldo: "0.00" })], ahora)).toEqual({
      estado: "al_dia",
    });
  });

  it("congelada manda sobre el plazo", () => {
    const desde = aLas("2026-11-24", "00:30");
    expect(estadoDeMora({ congeladaAt: desde, descongeladaHasta: "2026-11-30" }, [vencida], ahora).estado).toBe("congelada");
  });
});

describe("SLT-121 R24 — textos", () => {
  it("la fecha se pinta dd/mm/aaaa y el mensaje del error es el de R13", () => {
    expect(fechaLegible("2026-11-23")).toBe("23/11/2026");
    expect(MORA_TEXTOS.banner.enPlazo("2026-11-23")).toBe(
      "Tienes una factura de la plataforma por pagar. Fecha límite: 23/11/2026.",
    );
    // SLT-255 R11: el banner del plazo (enmienda de SLT-121 R24).
    expect(MORA_TEXTOS.banner.conPlazo("2026-12-01")).toBe(
      "Tienes prórroga de pago hasta el 01/12/2026. Si no pagas, la operación se congela la madrugada siguiente.",
    );
    expect(MORA_TEXTOS.plataforma.estado.con_plazo).toBe("Con prórroga");
    expect(MORA_TEXTOS.plataforma.errores.sinPlazo).toBe("La empresa no tiene una prórroga vigente.");
    expect(MORA_TEXTOS.banner.congelada).toContain("Empresa congelada por falta de pago");
    expect(MENSAJE_EMPRESA_CONGELADA).toBe("Empresa suspendida por falta de pago.");
    expect(MORA_TEXTOS.plataforma.graciaPropia(15)).toBe("15 días (propia)");
    expect(MORA_TEXTOS.plataforma.graciaGlobal(7)).toBe("7 días (global)");
  });
});
