import { describe, it, expect } from "vitest";

import { evaluarMadurezDeCohorte } from "@/lib/analytics/madurez-cohorte";

// FICHA 441 — EL ESTADO EN QUE UN PORCENTAJE NO SE PUEDE ESCRIBIR, y la madurez que va al lado
// del número cuando sí se puede.
//
// SLT-62 (2026-10-30, decisión del humano): el suelo de 20 órdenes se QUITÓ. El porcentaje se
// escribe con cualquier tamaño de base siempre que haya al menos un desenlace. El único estado sin
// cifra que queda es CERO CERRADAS. Los `describe` «SLT-62 · R<n>» numeran según
// `specs/SLT-62-porcentaje-efectividad-base-chica/requirements.md`; los demás conservan la
// numeración de la ficha 441.
//
// Las MUTACIONES que este archivo tiene que poner en rojo, y cada una tiene su caso nombrado:
//
//   M1 · quitar el guardia de CERO CERRADAS (devolver `entregadas / cargadas` siempre)
//        → «cero cerradas: no hay porcentaje, ni siquiera sobre las cargadas»
//   M2 · reponer un suelo de base en `porcentaje` (sobre las dos cifras o sólo sobre una)
//        → «SLT-62 · R1», «SLT-62 · R2» y el barrido «SLT-62 · R3»
//   M3 · devolver `0` en vez de `null` cuando no hay dato
//        → los casos comprueban `valor === null` y además el MOTIVO
//
// Todos los números de los casos reales son MEDIDOS, no inventados: zona Puntarenas 0 de 27
// cerradas, zona El Coco 3 de 64, zona GAM 389 de 637 y el período del diseño 424 entregadas de
// 790 cargadas con 265 vivas (producción, 2026-09-17); el recorte del mensajero Jason Barrios, 11
// entregadas de 12 (`progress/verificacion-analitica-monitoreo-2026-10-29.md`, § 3).

/** Atajo: el reparto tal como lo produce `calcularEfectividad`. */
function reparto(total: number, entregadas: number, enProceso: number) {
  return { total, entregadas, enProceso };
}

describe("R1 · el reparto de la madurez: cerradas, vivas y el tramo del medio", () => {
  // El período del diseño aprobado: 790 cargadas, 424 entregadas, 265 vivas. La barra pide
  // 424 / 101 / 265, y los tres tramos tienen que sumar las cargadas.
  it("deriva cerradas, vivas y «otro desenlace», y los tres suman las cargadas", () => {
    const m = evaluarMadurezDeCohorte(reparto(790, 424, 265));

    expect(m.cargadas).toBe(790);
    expect(m.cerradas).toBe(525);
    expect(m.vivas).toBe(265);
    expect(m.otroDesenlace).toBe(101);
    expect(m.entregadas + m.otroDesenlace + m.vivas).toBe(m.cargadas);
  });

  it("«en curso» es exactamente «quedan vivas»", () => {
    expect(evaluarMadurezDeCohorte(reparto(790, 424, 265)).enCurso).toBe(true);
    // Todo cerrado: el período ya no se mueve y la pantalla no tiene que avisar de nada.
    expect(evaluarMadurezDeCohorte(reparto(100, 80, 0)).enCurso).toBe(false);
  });

  // Las dos cifras del diseño, con sus valores esperados: 53,7 % sobre cargadas y 80,8 % sobre
  // cerradas. Son FRACCIONES, que es lo que consume `formatearValor(_, "porcentaje")`.
  it("las dos cifras salen del mismo numerador y de denominadores distintos", () => {
    const m = evaluarMadurezDeCohorte(reparto(790, 424, 265));

    expect(m.sobreCargadas.valor).toBeCloseTo(424 / 790, 10);
    expect(m.sobreCargadas.base).toBe(790);
    expect(m.sobreCerradas.valor).toBeCloseTo(424 / 525, 10);
    expect(m.sobreCerradas.base).toBe(525);
    // Y con los números del diseño: 53,7 % y 80,8 %.
    expect(Number(((m.sobreCargadas.valor ?? 0) * 100).toFixed(1))).toBe(53.7);
    expect(Number(((m.sobreCerradas.valor ?? 0) * 100).toFixed(1))).toBe(80.8);
  });
});

describe("R2 · CERO CERRADAS: no hay porcentaje, ni siquiera sobre las cargadas", () => {
  // ⭑ MUTACIÓN M1. El caso es real: la zona Puntarenas tiene 0 de 27 cerradas. `0 / 27` es una
  // división perfectamente definida y una afirmación perfectamente falsa: nadie falló 27
  // entregas, es que ninguna ha terminado.
  it("con 0 de 27 cerradas, NINGUNA de las dos cifras se escribe", () => {
    const m = evaluarMadurezDeCohorte(reparto(27, 0, 27));

    expect(m.cerradas).toBe(0);
    // ⚠ La de `sobreCargadas` va PRIMERA porque es la que dice el daño en pantalla: con el guardia
    // quitado, la tarjeta pintaría «0,0 % de efectividad» sobre 27 órdenes que nadie ha fallado.
    // Desde SLT-62 ya no hay suelo que tape `sobreCerradas` «de rebote»: sin el guardia saldría
    // `0 / 0 = NaN`, y lo caza la tercera aserción.
    expect(m.sobreCargadas.valor, "0/27 se pintó como 0 %").toBeNull();
    expect(m.sobreCargadas.motivo).toBe("sin_cerradas");
    expect(m.sobreCerradas.valor).toBeNull();
    expect(m.sobreCerradas.motivo).toBe("sin_cerradas");
  });

  // El denominador sigue viajando aunque no haya cifra (ficha 360): la pantalla tiene que poder
  // escribir «0 de 27 cerradas», que es un diagnóstico, no un reproche.
  it("la base viaja igual, para que la pantalla pueda decir «0 de 27 cerradas»", () => {
    const m = evaluarMadurezDeCohorte(reparto(27, 0, 27));

    expect(m.sobreCargadas.base).toBe(27);
    expect(m.sobreCerradas.base).toBe(0);
    expect(m.cargadas).toBe(27);
  });

  // Universo vacío: no es «salió mal», es «no hubo». Cae por el mismo camino.
  it("sin ninguna orden tampoco hay porcentaje", () => {
    const m = evaluarMadurezDeCohorte(reparto(0, 0, 0));

    expect(m.sobreCargadas).toEqual({ valor: null, base: 0, motivo: "sin_cerradas" });
    expect(m.enCurso).toBe(false);
  });
});

describe("SLT-62 · R1 · base chica: el % sobre cargadas se escribe", () => {
  // El caso real que abrió la ficha: el recorte de Jason Barrios, 12 cargadas y 11 en Entregado.
  // «Detalle gestión» daba 91,7 % en la misma pantalla y la tarjeta héroe se callaba.
  it("con 11 de 12 (1 viva) da 11/12 sin motivo de ausencia", () => {
    const m = evaluarMadurezDeCohorte(reparto(12, 11, 1));

    expect(m.sobreCargadas.valor).toBeCloseTo(11 / 12, 10);
    expect(m.sobreCargadas.base).toBe(12);
    expect(m.sobreCargadas.motivo).toBeNull();
    // 91,7 %: la cifra que el cliente vio en «Detalle gestión».
    expect(Number(((m.sobreCargadas.valor ?? 0) * 100).toFixed(1))).toBe(91.7);
  });

  // El borde de abajo: UNA orden, entregada. Con el suelo de antes era el caso más tapado.
  it("con 1 de 1 da el 100 %", () => {
    const m = evaluarMadurezDeCohorte(reparto(1, 1, 0));

    expect(m.sobreCargadas).toEqual({ valor: 1, base: 1, motivo: null });
    expect(m.sobreCerradas).toEqual({ valor: 1, base: 1, motivo: null });
  });

  // El borde de arriba del suelo viejo: 19 cargadas. Con `base < 20` era la última tapada.
  it.each([
    [19, 0, 0],
    [19, 7, 3],
    [19, 19, 0],
  ])("con %i cargadas y %i entregadas (%i vivas) se escribe", (total, entregadas, vivas) => {
    const m = evaluarMadurezDeCohorte(reparto(total, entregadas, vivas));

    expect(m.sobreCargadas.valor).toBeCloseTo(entregadas / total, 10);
    expect(m.sobreCargadas.motivo).toBeNull();
  });
});

describe("SLT-62 · R2 · base chica: el % sobre las que tienen desenlace se escribe", () => {
  // Zona El Coco, medida: 64 cargadas, 3 con desenlace, 2 entregadas. Con el suelo de 20 esta
  // cifra salía `null`.
  it("con 2 entregadas de 3 con desenlace (64 cargadas) da 2/3", () => {
    const m = evaluarMadurezDeCohorte(reparto(64, 2, 61));

    expect(m.cerradas).toBe(3);
    expect(m.sobreCerradas.valor).toBeCloseTo(2 / 3, 10);
    expect(m.sobreCerradas.base).toBe(3);
    expect(m.sobreCerradas.motivo).toBeNull();
    // Y la de arriba sigue saliendo: 2/64.
    expect(m.sobreCargadas.valor).toBeCloseTo(2 / 64, 10);
  });

  // La cohorte entera cerrada y chica (el recorte de un mensajero, medido el 2026-09-17).
  it("con 6 entregadas de 8, todas con desenlace, da 6/8 en las dos cifras", () => {
    const m = evaluarMadurezDeCohorte(reparto(8, 6, 0));

    expect(m.sobreCerradas).toEqual({ valor: 0.75, base: 8, motivo: null });
    expect(m.sobreCargadas).toEqual({ valor: 0.75, base: 8, motivo: null });
  });

  // La zona GAM, medida: las dos bases son grandes y siguen escribiéndose (no regresión).
  it("con 389 cerradas de 637 cargadas se escriben las dos", () => {
    const m = evaluarMadurezDeCohorte(reparto(637, 300, 248));

    expect(m.cerradas).toBe(389);
    expect(m.sobreCargadas.motivo).toBeNull();
    expect(m.sobreCerradas.motivo).toBeNull();
  });
});

describe("SLT-62 · R3 · sin cifra ÚNICAMENTE con cero desenlaces, y sólo por «sin cerradas»", () => {
  /** Todos los repartos válidos con `cargadas ∈ [0, 25]`: vivas ≤ cargadas, entregadas ≤ cerradas. */
  function* repartosValidos() {
    for (let cargadas = 0; cargadas <= 25; cargadas++) {
      for (let vivas = 0; vivas <= cargadas; vivas++) {
        for (let entregadas = 0; entregadas <= cargadas - vivas; entregadas++) {
          yield { cargadas, entregadas, vivas };
        }
      }
    }
  }

  // ANTI-VACÍO: si el generador no produjera nada, el barrido estaría verde sin mirar un caso.
  // Σ_{c=0..25} (c+1)(c+2)/2 = 3276.
  it("el barrido recorre los 3276 repartos válidos", () => {
    expect([...repartosValidos()].length).toBe(3276);
  });

  it("valor === null ⇔ cerradas === 0, y el único motivo posible es «sin_cerradas»", () => {
    const fallos: string[] = [];
    for (const { cargadas, entregadas, vivas } of repartosValidos()) {
      const m = evaluarMadurezDeCohorte(reparto(cargadas, entregadas, vivas));
      const cerradas = cargadas - vivas;
      const caso = `${cargadas}/${entregadas}/${vivas}`;

      for (const [nombre, cifra, base] of [
        ["sobreCargadas", m.sobreCargadas, cargadas],
        ["sobreCerradas", m.sobreCerradas, cerradas],
      ] as const) {
        if ((cifra.valor === null) !== (cerradas === 0)) {
          fallos.push(`${caso} ${nombre}: valor=${cifra.valor} con ${cerradas} cerradas`);
        }
        if (cifra.motivo !== null && cifra.motivo !== "sin_cerradas") {
          fallos.push(`${caso} ${nombre}: motivo «${String(cifra.motivo)}»`);
        }
        if ((cifra.motivo === null) !== (cifra.valor !== null)) {
          fallos.push(`${caso} ${nombre}: valor y motivo a la vez, o ninguno`);
        }
        if (cifra.valor !== null && Math.abs(cifra.valor - entregadas / base) > 1e-12) {
          fallos.push(`${caso} ${nombre}: ${cifra.valor} ≠ ${entregadas}/${base}`);
        }
      }
    }

    expect(fallos.slice(0, 10), `${fallos.length} fallos`).toEqual([]);
  });
});

describe("R5 · un reparto imposible se dice en voz alta", () => {
  // No devuelve una cifra plausible: un 120 % —o peor, un 40 % creíble— saldría de aquí sin que
  // nadie pudiera rastrear de dónde. La única fuente legítima de esta entrada es
  // `calcularEfectividad`, cuya partición ya está medida.
  it.each([
    ["más entregadas que cerradas", reparto(10, 9, 5)],
    ["más vivas que órdenes", reparto(10, 0, 11)],
    ["conteos negativos", reparto(10, -1, 0)],
  ])("%s → lanza", (_nombre, entrada) => {
    expect(() => evaluarMadurezDeCohorte(entrada)).toThrow(/incoherente/);
  });

  // Y el caso de al lado NO lanza: todas las entregadas y ninguna viva es perfectamente posible.
  it("todo entregado y nada vivo es válido, no un error", () => {
    const m = evaluarMadurezDeCohorte(reparto(30, 30, 0));

    expect(m.sobreCargadas.valor).toBe(1);
    expect(m.sobreCerradas.valor).toBe(1);
  });
});
