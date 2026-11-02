import { describe, expect, it } from "vitest";

import {
  avisoRecogidaInsuficiente,
  formatearEspera,
  minimoRecogida,
} from "@/lib/utils/aviso-recogida-insuficiente";

// SLT-74 — el aviso de «Sincronizar ruta» con la primera ruta pendiente y poco recogido.

describe("SLT-74 — minimoRecogida: ceil(asignadas * pct / 100), el umbral de la guarda del service", () => {
  it.each([
    [15, 80, 12],
    [7, 80, 6], // 5,6 sube a 6
    [10, 80, 8],
    [4, 70, 3], // 2,8 sube a 3
    [5, 80, 4],
    [1, 80, 1],
    [0, 80, 0],
    [3, 100, 3],
  ])("%i asignadas al %i %% -> %i", (asignadas, pct, minimo) => {
    expect(minimoRecogida(asignadas, pct)).toBe(minimo);
  });

  it("coincide con la guarda `recogidas * 100 < asignadas * pct`: minimo pasa, minimo - 1 no", () => {
    for (const pct of [1, 33, 50, 67, 80, 99, 100]) {
      for (let asignadas = 1; asignadas <= 40; asignadas++) {
        const minimo = minimoRecogida(asignadas, pct);
        expect(minimo * 100 < asignadas * pct).toBe(false);
        expect((minimo - 1) * 100 < asignadas * pct).toBe(true);
      }
    }
  });
});

describe("SLT-74 — formatearEspera: `X min Y s`, solo `Y s` bajo el minuto, segundos hacia arriba", () => {
  it.each([
    [158_000, "2 min 38 s"],
    [157_001, "2 min 38 s"], // redondea hacia arriba
    [59_000, "59 s"],
    [59_001, "1 min 0 s"],
    [60_000, "1 min 0 s"], // a partir del minuto, siempre `X min Y s`
    [61_000, "1 min 1 s"],
    [300_000, "5 min 0 s"],
    [1, "1 s"],
    [999, "1 s"],
    [1_000, "1 s"],
    [0, "0 s"],
    [-5_000, "0 s"],
  ])("%i ms -> «%s»", (ms, texto) => {
    expect(formatearEspera(ms)).toBe(texto);
  });
});

describe("SLT-74 — avisoRecogidaInsuficiente: las tres formas exactas", () => {
  const base = { asignadas: 15, recogidas: 10, pct: 80 };

  it("con job pendiente y tiempo por delante: dice cuanto esperar", () => {
    expect(avisoRecogidaInsuficiente({ ...base, esperaMs: 158_000 })).toBe(
      "Todavía no se calcula la ruta: recoge al menos 12 de tus 15 paquetes (llevas 10) o espera 2 min 38 s y se calculará con los que llevas.",
    );
  });

  it("con el job ya vencido (esperando al cron): «unos segundos»", () => {
    const esperado =
      "Todavía no se calcula la ruta: recoge al menos 12 de tus 15 paquetes (llevas 10) o espera unos segundos: ya se está calculando con los que llevas.";
    expect(avisoRecogidaInsuficiente({ ...base, esperaMs: 0 })).toBe(esperado);
    expect(avisoRecogidaInsuficiente({ ...base, esperaMs: -30_000 })).toBe(esperado);
  });

  it("sin job pendiente: solo el conteo", () => {
    expect(avisoRecogidaInsuficiente(base)).toBe(
      "Todavía no se calcula la ruta: recoge al menos 12 de tus 15 paquetes (llevas 10).",
    );
  });
});
