import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lineasDeCambioDelPlan } from "@/lib/planes/mensajes";
import { plantillaCambioPlan, type CambioPlanParams } from "@/lib/services/email/plantillas/cambio-plan";

// SL-24 · T12 (design §16.4; R41, R42, R45) — el correo del cambio de un plan. Los literales del spec
// (R45 y la línea del reemplazo de §16.2) se escriben aquí a mano; los demás textos son la propuesta
// de T12, pendiente de aprobación (`progress/impl_SL-24.md > T12`).

/** 2026-11-15 a las 00:00 en la plataforma (−06:00). */
const RIGE = new Date("2026-11-15T06:00:00.000Z");
const ANTERIOR = new Date("2026-11-10T06:00:00.000Z");

const BASE: CambioPlanParams = {
  to: "maestra@empresa.example",
  nombre: "Ana",
  empresaNombre: "Mensajería Uno",
  planNombre: "Básico",
  cambios: {
    nombre: { antes: "Básico", despues: "Básico plus" },
    topes: {
      antes: { ordenesPorCiclo: 100, porRol: { adminTienda: 3 }, apiKeys: null },
      despues: { ordenesPorCiclo: 50, porRol: { adminTienda: 3, mensajero: 10 }, apiKeys: 2 },
    },
    modulos: { antes: ["analitica"], despues: ["ranking"] },
    precio: {
      antes: { tipo: "sin_precio" },
      despues: { tipo: "monto", mensual: "25000.00", anual: { tipo: "descuento", porcentaje: "10.00" } },
    },
  },
  vigenteDesde: RIGE,
  reemplazaA: null,
  topesPasados: [],
  tipo: "guardado",
  contacto: null,
};

const correo = (extra: Partial<CambioPlanParams> = {}) => plantillaCambioPlan({ ...BASE, ...extra });

describe("SL-24 — plantillaCambioPlan (R41)", () => {
  it("guardado programado: asunto, saludo, qué plan cambia y desde cuándo, y las líneas de cambio", () => {
    const m = correo();
    expect(m.to).toBe("maestra@empresa.example");
    expect(m.subject).toBe("Cambios en el plan Básico");
    expect(m.text).toContain("Hola, Ana:");
    expect(m.text).toContain("El plan Básico de Mensajería Uno cambia a partir del 15 nov 2026.");
    expect(m.text).toContain("Esto es lo que cambia:");
    for (const linea of [
      "Nombre del plan: Básico → Básico plus",
      "Órdenes por ciclo: 100 → 50",
      "Usuarios activos con el rol Mensajero: sin límite → 10",
      "API keys activas: sin límite → 2",
      "Se incluye el módulo Ranking.",
      "Deja de incluirse el módulo Analítica.",
      "Costo base: sin precio → 25000.00 al mes, con 10.00 % de descuento en el pago anual", // SLT-66 R9
    ]) {
      expect(m.text).toContain(linea);
      expect(m.html).toContain(linea);
    }
    // Un tope que no cambia no se lista.
    expect(m.text).not.toContain("Admin de tienda");
    expect(m.text).not.toContain("reemplaza");
  });

  it("la fecha es el día de la plataforma: las 00:00 a −06:00 son ese día, no el anterior", () => {
    // 06:00 UTC = 00:00 en la plataforma; 05:59 UTC sería el día anterior.
    expect(correo({ vigenteDesde: new Date("2026-11-15T06:00:00.000Z") }).text).toContain("15 nov 2026");
    expect(correo({ vigenteDesde: new Date("2026-11-15T05:59:00.000Z") }).text).toContain("14 nov 2026");
  });

  it("guardado inmediato: sin fecha, dice que ya rige", () => {
    const m = correo({ vigenteDesde: null });
    expect(m.text).toContain("El plan Básico de Mensajería Uno cambió y los cambios ya rigen.");
    expect(m.text).not.toContain("a partir del");
  });

  it("con topes pasados, dice cuál, con su uso y el tope (mensajeTopesPasados de T3)", () => {
    const m = correo({
      topesPasados: [
        { empresa: "Mensajería Uno", tope: "ordenes", usados: 80, maximo: 50 },
        { empresa: "Mensajería Uno", tope: "adminTienda", usados: 4, maximo: 3 },
      ],
    });
    expect(m.text).toContain("Con el plan nuevo, tu empresa ya pasa estos topes:");
    expect(m.text).toContain("Mensajería Uno ya tiene 80 órdenes en el ciclo en curso y el plan permite 50.");
    expect(m.text).toContain("Mensajería Uno ya tiene 4 usuarios activos con el rol Admin de tienda y el plan permite 3.");
  });

  it("sin topes pasados no hay bloque de topes", () => {
    expect(correo().text).not.toContain("ya pasa estos topes");
  });

  it("R45: el reemplazo lleva la línea «Este cambio reemplaza al previsto para <fecha anterior>»", () => {
    const m = correo({ reemplazaA: ANTERIOR });
    expect(m.text).toContain("Este cambio reemplaza al previsto para 10 nov 2026.");
    expect(m.subject).toBe("Cambios en el plan Básico");
  });

  it("un reemplazo por la versión vigente no lista líneas: dice que queda igual", () => {
    const m = correo({ cambios: {}, reemplazaA: ANTERIOR });
    expect(m.text).toContain("El plan queda igual que el actual.");
    expect(m.text).not.toContain("Esto es lo que cambia:");
  });
});

describe("SL-24 — recordatorios (R42)", () => {
  it("a 7 días", () => {
    const m = correo({ tipo: "recordatorio_7" });
    expect(m.subject).toBe("El plan Básico cambia en 7 días");
    expect(m.text).toContain("Faltan 7 días: el plan Básico de Mensajería Uno cambia a partir del 15 nov 2026.");
    expect(m.text).toContain("Órdenes por ciclo: 100 → 50");
  });

  it("a 1 día", () => {
    const m = correo({ tipo: "recordatorio_1" });
    expect(m.subject).toBe("El plan Básico cambia mañana");
    expect(m.text).toContain("Mañana cambia el plan Básico de Mensajería Uno: rige a partir del 15 nov 2026.");
  });
});

describe("SL-24 — cancelado (R45)", () => {
  it("lleva solo el texto de R45, con el nombre del plan y la fecha", () => {
    const m = correo({ tipo: "cancelado", cambios: {} });
    expect(m.subject).toBe("Se canceló el cambio del plan Básico");
    expect(m.text).toContain("Hola, Ana:");
    expect(m.text).toContain("El cambio del plan Básico previsto para 15 nov 2026 se canceló; tu plan sigue igual.");
    expect(m.text).not.toContain("Esto es lo que cambia");
    expect(m.text).not.toContain("a partir del");
  });

  it("sin fecha no compone (un cancelado siempre tuvo fecha)", () => {
    expect(() => correo({ tipo: "cancelado", vigenteDesde: null })).toThrow(/fecha/);
  });
});

describe("SL-24 — marca, país y escapado", () => {
  it("el archivo de la plantilla no escribe la marca ni el país a mano", () => {
    const fuente = readFileSync(path.join(process.cwd(), "lib/services/email/plantillas/cambio-plan.ts"), "utf8");
    // Sensible a mayúsculas: las rutas `lib/services/…` no son la marca.
    expect(fuente).not.toMatch(/Servi Logistic|SERVI|Logistic/);
    expect(fuente).not.toMatch(/Costa Rica|₡|colones/i);
    const mensajes = readFileSync(path.join(process.cwd(), "lib/planes/mensajes.ts"), "utf8");
    expect(mensajes).not.toMatch(/Servi Logistic|Costa Rica|₡|colones/i);
  });

  it("los datos variables se escapan en el HTML", () => {
    const m = correo({ empresaNombre: "<b>Uno</b>", planNombre: "A & B" });
    expect(m.html).toContain("&lt;b&gt;Uno&lt;/b&gt;");
    expect(m.html).toContain("A &amp; B");
    expect(m.html).not.toContain("<b>Uno</b>");
  });

  it("lineasDeCambioDelPlan sin diferencias no da ninguna línea", () => {
    expect(lineasDeCambioDelPlan({})).toEqual([]);
  });
});
