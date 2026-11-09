import { afterEach, describe, expect, it, vi } from "vitest";

import { resolverRango } from "@/lib/analytics/ranges";
import { trocear } from "@/lib/analytics/cubo-temporal";
import { fechaObjetivo, ventanaDelDia } from "@/lib/analytics/rollup-dia";
import { desdeDiaSchema, hastaDiaSchema } from "@/lib/types/filtro-dias-cr";
import { fechaFuturaSchema } from "@/lib/types/gestion-orden";
import { fechaPagoSchema } from "@/lib/types/liquidacion";
import { resolverFechaReparto } from "@/lib/utils/dia-reparto";
import { fechaDiaInstanteCR, fechaDiaMovimientoCR } from "@/lib/utils/fecha-dia-iso";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import { aplicaHoy, periodoDe, proximoCobro, type PlantillaPeriodica } from "@/lib/utils/periodicidad";
import { horaDeParedCR, ventanaDelDiaEnCursoCR } from "@/lib/utils/ventana-dia-cr";

// SLT-42 (R22, R23) — las utilidades de dia del servidor reciben la zona IANA del pais de la empresa.
// Cada bloque fija dos cosas: con OTRA zona sin horario de verano (Bogota, UTC-5) el limite del dia
// se mueve respecto de Costa Rica (UTC-6), y con una zona CON horario de verano (Nueva York, Madrid)
// el limite sigue a la hora de pared el dia del cambio, cuando el dia dura 23 o 25 h. Con la zona de
// CR el resultado es el de siempre: lo fijan los tests de cada utilidad.

const BOGOTA = "America/Bogota";
const NUEVA_YORK = "America/New_York"; // 2026: adelanta el 8 de marzo, atrasa el 1 de noviembre
const MADRID = "Europe/Madrid"; // 2026: adelanta el 29 de marzo

/** 05:30Z del 21 de agosto: 00:30 del 21 en Bogota y 23:30 del 20 en Costa Rica. */
const ENTRE_MEDIANOCHES = new Date("2026-08-21T05:30:00.000Z");

const HORA_MS = 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

describe("R22 · dia-reparto: «hoy» y «mañana» son los de la zona", () => {
  it("a la misma hora, Bogota ya esta en el 21 y Costa Rica sigue en el 20", () => {
    expect(resolverFechaReparto("hoy", BOGOTA, ENTRE_MEDIANOCHES).toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(resolverFechaReparto("manana", BOGOTA, ENTRE_MEDIANOCHES).toISOString()).toBe("2026-08-22T00:00:00.000Z");
    expect(resolverFechaReparto("hoy", ZONA_CR, ENTRE_MEDIANOCHES).toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("R23: el dia del cambio de hora el limite sigue a la pared (Nueva York)", () => {
    // 04:30Z del 9 de marzo: ya en horario de verano (UTC-4) son las 00:30 del 9. Con el desfase de
    // invierno (UTC-5) serian las 23:30 del 8: un desfase fijo daria el dia anterior.
    const trasAdelantar = new Date("2026-03-09T04:30:00.000Z");
    expect(resolverFechaReparto("hoy", NUEVA_YORK, trasAdelantar).toISOString()).toBe("2026-03-09T00:00:00.000Z");
    // 04:30Z del 2 de noviembre: ya en invierno (UTC-5) son las 23:30 del 1.
    const trasAtrasar = new Date("2026-11-02T04:30:00.000Z");
    expect(resolverFechaReparto("hoy", NUEVA_YORK, trasAtrasar).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(resolverFechaReparto("manana", NUEVA_YORK, trasAtrasar).toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});

describe("R22 · fecha-dia-iso: el dia de un instante es el de la zona", () => {
  it("el mismo instante es del 21 en Bogota y del 20 en Costa Rica", () => {
    expect(fechaDiaInstanteCR(ENTRE_MEDIANOCHES.toISOString(), BOGOTA)).toBe("2026-08-21");
    expect(fechaDiaInstanteCR(ENTRE_MEDIANOCHES.toISOString(), ZONA_CR)).toBe("2026-08-20");
    expect(fechaDiaMovimientoCR(ENTRE_MEDIANOCHES.toISOString(), BOGOTA)).toBe("2026-08-21");
  });

  it("la medianoche UTC exacta de un movimiento sigue siendo su propia fecha en cualquier zona", () => {
    expect(fechaDiaMovimientoCR("2026-08-21T00:00:00.000Z", BOGOTA)).toBe("2026-08-21");
    expect(fechaDiaMovimientoCR("2026-08-21T00:00:00.000Z", MADRID)).toBe("2026-08-21");
  });

  it("R23: alrededor del cambio de hora de Madrid el dia sale de la pared del momento", () => {
    // 23:30Z del 28 de marzo: invierno (UTC+1) -> 00:30 del 29.
    expect(fechaDiaInstanteCR("2026-03-28T23:30:00.000Z", MADRID)).toBe("2026-03-29");
    // 22:30Z del 29 de marzo: verano (UTC+2) -> 00:30 del 30. Con UTC+1 fijo seria el 29.
    expect(fechaDiaInstanteCR("2026-03-29T22:30:00.000Z", MADRID)).toBe("2026-03-30");
    expect(fechaDiaMovimientoCR("2026-03-29T22:30:00.000Z", MADRID)).toBe("2026-03-30");
  });
});

describe("R22 · ranges: los limites del rango son las 00:00 de la zona", () => {
  it("el preset `dia` de Bogota empieza a las 05:00Z (00:00 UTC-5), no a las 06:00Z de CR", () => {
    const r = resolverRango({ preset: "dia" }, BOGOTA, ENTRE_MEDIANOCHES);
    expect(r.desdeFecha).toBe("2026-08-21");
    expect(r.desde.toISOString()).toBe("2026-08-21T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-08-22T05:00:00.000Z");
    const cr = resolverRango({ preset: "dia" }, ZONA_CR, ENTRE_MEDIANOCHES);
    expect(cr.desdeFecha).toBe("2026-08-20");
    expect(cr.desde.toISOString()).toBe("2026-08-20T06:00:00.000Z");
  });

  it("R23: el dia que se adelanta el reloj dura 23 h y el que se atrasa 25 h (Nueva York)", () => {
    const marzo = resolverRango({ preset: "dia" }, NUEVA_YORK, new Date("2026-03-08T12:00:00.000Z"));
    expect(marzo.desde.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(marzo.hasta.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(marzo.hasta.getTime() - marzo.desde.getTime()).toBe(23 * HORA_MS);

    const noviembre = resolverRango({ preset: "dia" }, NUEVA_YORK, new Date("2026-11-01T12:00:00.000Z"));
    expect(noviembre.desde.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(noviembre.hasta.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(noviembre.hasta.getTime() - noviembre.desde.getTime()).toBe(25 * HORA_MS);
  });

  it("R23: `semana` y `mes` cuentan dias de calendario aunque crucen el cambio de hora", () => {
    // Miercoles 11 de marzo: la semana empieza el lunes 9, ya en verano (00:00 = 04:00Z).
    const semana = resolverRango({ preset: "semana" }, NUEVA_YORK, new Date("2026-03-11T12:00:00.000Z"));
    expect(semana.desdeFecha).toBe("2026-03-09");
    expect(semana.desde.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    // 30 dias contando hoy (20 de marzo): desde el 19 de febrero, en invierno (00:00 = 05:00Z).
    const mes = resolverRango({ preset: "mes" }, NUEVA_YORK, new Date("2026-03-20T12:00:00.000Z"));
    expect(mes.desdeFecha).toBe("2026-02-19");
    expect(mes.desde.toISOString()).toBe("2026-02-19T05:00:00.000Z");
    expect(mes.hasta.toISOString()).toBe("2026-03-21T04:00:00.000Z");
  });
});

describe("R23 · cubo-temporal, rollup-dia y ventana-dia-cr con horario de verano", () => {
  it("trocear deja cubos contiguos y el del 8 de marzo mide 23 h", () => {
    const rango = resolverRango(
      { preset: "personalizado", desde: "2026-03-07", hasta: "2026-03-09" },
      NUEVA_YORK,
    );
    const cubos = trocear(rango, NUEVA_YORK);
    expect(cubos.map((c) => c.clave)).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(cubos[1].hasta.getTime() - cubos[1].desde.getTime()).toBe(23 * HORA_MS);
    expect(cubos[0].hasta).toEqual(cubos[1].desde);
    expect(cubos[2].hasta).toEqual(rango.hasta);
  });

  it("fechaObjetivo es la fecha calendario anterior, no `now - 24 h`", () => {
    // 00:30 del 9 de marzo en Nueva York (04:30Z). Restar 24 h daria las 23:30 del 7.
    expect(fechaObjetivo(new Date("2026-03-09T04:30:00.000Z"), NUEVA_YORK)).toBe("2026-03-08");
    expect(fechaObjetivo(ENTRE_MEDIANOCHES, BOGOTA)).toBe("2026-08-20");
    const v = ventanaDelDia("2026-11-01", NUEVA_YORK);
    expect(v.hasta.getTime() - v.desde.getTime()).toBe(25 * HORA_MS);
  });

  it("horaDeParedCR lee la pared: la hora repetida del 1 de noviembre es la 1, no la 2", () => {
    const instante = new Date("2026-11-01T06:30:00.000Z"); // 01:30 de invierno, la segunda vez
    const ventana = ventanaDelDiaEnCursoCR(instante, NUEVA_YORK);
    expect(ventana.fecha).toBe("2026-11-01");
    expect(horaDeParedCR(ventana, instante, NUEVA_YORK)).toBe(1);
    // Bogota: 05:30Z son las 00:30 del dia en curso.
    const bogota = ventanaDelDiaEnCursoCR(ENTRE_MEDIANOCHES, BOGOTA);
    expect(horaDeParedCR(bogota, ENTRE_MEDIANOCHES, BOGOTA)).toBe(0);
  });
});

describe("R22 · periodicidad: el dia de cobro es el de la zona", () => {
  const diaria: PlantillaPeriodica = {
    periodicidadUnidad: "dias",
    periodicidadCantidad: 1,
    fechaCobro: "2026-08-21",
  };

  it("el ancla del 21 ya cobra en Bogota y todavia no en Costa Rica", () => {
    expect(aplicaHoy(diaria, ENTRE_MEDIANOCHES, BOGOTA)).toBe(true);
    expect(aplicaHoy(diaria, ENTRE_MEDIANOCHES, ZONA_CR)).toBe(false);
    expect(periodoDe(diaria, ENTRE_MEDIANOCHES, BOGOTA)).toBe("2026-08-21");
    expect(periodoDe(diaria, ENTRE_MEDIANOCHES, ZONA_CR)).toBe("2026-08-20");
    expect(proximoCobro(diaria, ENTRE_MEDIANOCHES, ZONA_CR)).toBe("2026-08-21");
  });

  it("R23: alrededor del cambio de hora el dia de cobro sigue a la pared", () => {
    const mensual: PlantillaPeriodica = {
      periodicidadUnidad: "meses",
      periodicidadCantidad: 1,
      fechaCobro: "2026-01-30",
    };
    // 22:30Z del 29 de marzo en Madrid: verano (UTC+2) -> 00:30 del 30. Con UTC+1 fijo seria el 29.
    const madrid = new Date("2026-03-29T22:30:00.000Z");
    expect(aplicaHoy(mensual, madrid, MADRID)).toBe(true);
    expect(periodoDe(mensual, madrid, MADRID)).toBe("2026-03");
    // 04:30Z del 2 de noviembre en Nueva York: invierno (UTC-5) -> 23:30 del 1.
    const nuevaYork = new Date("2026-11-02T04:30:00.000Z");
    expect(periodoDe(diaria, nuevaYork, NUEVA_YORK)).toBe("2026-11-01");
    expect(proximoCobro(diaria, nuevaYork, NUEVA_YORK)).toBe("2026-11-01");
  });
});

describe("R22 · schemas fabrica `(zona) => schema`: el «hoy» del borde es el de la zona", () => {
  it("fechaFuturaSchema: el 21 ya es «hoy» en Bogota (rechazo) y aun es «mañana» en Costa Rica", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ENTRE_MEDIANOCHES);
    const bogota = fechaFuturaSchema(BOGOTA).safeParse("2026-08-21");
    expect(bogota.success).toBe(false);
    expect(bogota.error?.issues[0]?.message).toBe("la fecha debe ser mañana o posterior");
    expect(fechaFuturaSchema(ZONA_CR).safeParse("2026-08-21").success).toBe(true);
  });

  it("fechaPagoSchema: el 30 de marzo ya no es futuro en Madrid tras adelantar el reloj (R23)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-29T22:30:00.000Z")); // 00:30 del 30 en Madrid (UTC+2)
    expect(fechaPagoSchema(MADRID).safeParse("2026-03-30").success).toBe(true);
    const cr = fechaPagoSchema(ZONA_CR).safeParse("2026-03-30"); // en CR aun es el 29
    expect(cr.success).toBe(false);
    expect(cr.error?.issues[0]?.message).toBe("La fecha del pago no puede ser posterior a hoy.");
  });

  it("desdeDiaSchema/hastaDiaSchema: el filtro por dias corta en las 00:00 de la zona (R23: dia de 23 h)", () => {
    expect(desdeDiaSchema(BOGOTA).parse("2026-08-21").toISOString()).toBe("2026-08-21T05:00:00.000Z");
    expect(desdeDiaSchema(NUEVA_YORK).parse("2026-03-08").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(hastaDiaSchema(NUEVA_YORK).parse("2026-03-08").toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});
