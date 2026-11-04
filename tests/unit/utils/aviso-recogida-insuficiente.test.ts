import { describe, expect, it } from "vitest";

import {
  avisoRecogidaInsuficiente,
  formatearEspera,
  minimoRecogida,
} from "@/lib/utils/aviso-recogida-insuficiente";

// SLT-74 — el aviso de «Sincronizar ruta» con la primera ruta pendiente y poco recogido.
// SLT-79 — dos formas: con algo recogido (minimo o espera) o sin nada (solo minimo).

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

  it("minimo pasa y minimo - 1 no, con la cuenta entera `recogidas * 100 < asignadas * pct`", () => {
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

describe("SLT-79 — avisoRecogidaInsuficiente: las dos formas exactas", () => {
  const base = { asignadas: 15, pct: 80 };

  it("con algo recogido: «Recoge 12 de 15 paquetes o espera 4 min 20 s para poder iniciar ruta.»", () => {
    expect(avisoRecogidaInsuficiente({ ...base, esperaMs: 260_000 })).toBe(
      "Recoge 12 de 15 paquetes o espera 4 min 20 s para poder iniciar ruta.",
    );
  });

  it("con algo recogido y menos de un minuto: solo segundos", () => {
    expect(avisoRecogidaInsuficiente({ ...base, esperaMs: 1_000 })).toBe(
      "Recoge 12 de 15 paquetes o espera 1 s para poder iniciar ruta.",
    );
  });

  it("con 0 recogidas (sin `esperaMs`): «Recoge 12 de 15 paquetes para poder iniciar ruta.»", () => {
    expect(avisoRecogidaInsuficiente(base)).toBe("Recoge 12 de 15 paquetes para poder iniciar ruta.");
  });
});
