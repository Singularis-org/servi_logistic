import { ModuloApagable as ModuloApagablePrisma, JobTipo as JobTipoPrisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  esModuloApagable,
  MODULOS_APAGABLES,
  NUCLEO,
  nombreDelModulo,
  ORDEN_MODULOS,
} from "@/lib/modulos/catalogo";
import { CALCULO_CONTINUO, MODULO_POR_JOB, modulosDe } from "@/lib/modulos/reparto";

// SL-23 · T3 (design §2, §3; R1, R2) — el catálogo cerrado. El enum de Prisma es la fuente de la base:
// si el catálogo de TS y el enum divergen, el sistema ofrecería un módulo que no se puede guardar, o
// guardaría uno que no se puede mostrar.

const CLAVES = [
  "analitica",
  "monitoreo",
  "recoleccion",
  "bodegas_satelite",
  "wallet",
  "ranking",
  "whatsapp",
  "api_integraciones",
];

describe("SL-23 · catálogo de módulos (R1, R2)", () => {
  it("R1 — exactamente 8 claves, las mismas que el enum `modulo_apagable`", () => {
    const enCatalogo = Object.keys(MODULOS_APAGABLES).sort();
    expect(enCatalogo).toHaveLength(8);
    expect(enCatalogo).toEqual(Object.values(ModuloApagablePrisma).sort());
    expect(enCatalogo).toEqual([...CLAVES].sort());
  });

  it("R1 — `wallet` es la clave del módulo Wallet; `wallet_cierres` no existe (cierres al núcleo)", () => {
    expect(MODULOS_APAGABLES.wallet.nombre).toBe("Wallet");
    expect(esModuloApagable("wallet")).toBe(true);
    expect(esModuloApagable("wallet_cierres")).toBe(false);
    expect(Object.values(ModuloApagablePrisma)).not.toContain("wallet_cierres");
  });

  it("R1, R2 — `incidentes_novedades` no existe: Incidentes y novedades es núcleo", () => {
    expect(esModuloApagable("incidentes_novedades")).toBe(false);
    expect(Object.values(ModuloApagablePrisma)).not.toContain("incidentes_novedades");
    expect(NUCLEO).toContain("Incidentes y novedades");
  });

  it("R1 — los nombres en pantalla son los de la decisión cerrada", () => {
    expect(ORDEN_MODULOS.map(nombreDelModulo)).toEqual([
      "Analítica",
      "Monitoreo",
      "Recolección",
      "Bodegas satélite",
      "Wallet",
      "Ranking",
      "WhatsApp",
      "API e integraciones",
    ]);
  });

  it("R1 — el orden de pantalla nombra cada módulo una vez y ninguno más", () => {
    expect(new Set(ORDEN_MODULOS).size).toBe(ORDEN_MODULOS.length);
    expect([...ORDEN_MODULOS].sort()).toEqual(Object.keys(MODULOS_APAGABLES).sort());
  });

  it("R1 — cada módulo trae una descripción no vacía", () => {
    for (const clave of ORDEN_MODULOS) expect(MODULOS_APAGABLES[clave].descripcion.trim()).not.toBe("");
  });

  it("R2 — el núcleo son sus 8 nombres, Cierres e Incidentes y novedades incluidos", () => {
    expect([...NUCLEO]).toEqual([
      "Inicio",
      "Órdenes",
      "Entregas",
      "Cierres",
      "Incidentes y novedades",
      "Usuarios",
      "Tarifas",
      "Ayuda",
    ]);
  });

  it("R2 — nada del núcleo es una clave apagable, ni por su nombre ni en minúsculas", () => {
    for (const nombre of NUCLEO) {
      expect(esModuloApagable(nombre)).toBe(false);
      expect(esModuloApagable(nombre.toLowerCase())).toBe(false);
    }
    expect(esModuloApagable("cierres")).toBe(false);
    expect(esModuloApagable("nucleo")).toBe(false);
    const nombres = ORDEN_MODULOS.map(nombreDelModulo);
    for (const nombre of NUCLEO) expect(nombres).not.toContain(nombre);
  });

  it("`esModuloApagable` no acepta propiedades heredadas del objeto", () => {
    expect(esModuloApagable("toString")).toBe(false);
    expect(esModuloApagable("__proto__")).toBe(false);
  });
});

describe("SL-23 · reparto de jobs (design §3.3, §3.8)", () => {
  it("cada `JobTipo` del enum está clasificado (además del `Record`, en tiempo de ejecución)", () => {
    expect(Object.keys(MODULO_POR_JOB).sort()).toEqual(Object.values(JobTipoPrisma).sort());
  });

  it("los de cálculo continuo siguen clasificados en su módulo, no en el núcleo", () => {
    for (const tipo of CALCULO_CONTINUO.jobs) expect(modulosDe(MODULO_POR_JOB[tipo])).toEqual(["analitica"]);
  });

  it("`modulosDe`: el núcleo no exige nada, un módulo exige el suyo y una pieza compartida los dos", () => {
    expect(modulosDe("nucleo")).toEqual([]);
    expect(modulosDe("ranking")).toEqual(["ranking"]);
    expect(modulosDe(["wallet", "ranking"])).toEqual(["wallet", "ranking"]);
  });
});
