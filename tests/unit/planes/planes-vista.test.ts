import { describe, expect, it } from "vitest";

import {
  esSinCuota,
  excedidosContra,
  filasDeComparacion,
  filasDePeriodos,
  precioDeLaVista,
  textoDelTope,
  usoDeLasFilas,
  usuariosDelPlan,
  usuariosEnUso,
} from "@/components/shared/planes/planes-vista";
import { NOMBRES_DEL_TOPE, lineaTopeSobra, mensajeTopesSobran } from "@/lib/planes/mensajes";
import type { FilaConsumo } from "@/lib/types/consumo-plan";
import { ROLES_CON_TOPE, type DescuentoPeriodo, type PlanVista, type PrecioPlan, type TipoCobro } from "@/lib/types/planes";

// SLT-99 (design §5, §6; R4, R6, R8, R13) — la lógica de vista de los planes. La tanda de backend (T3) trajo
// el texto de R13 (`mensajeTopesSobran`), que comparten el rechazo del servicio y el aviso previo del detalle;
// T5.1 suma `components/shared/planes/planes-vista.ts` (más abajo).

describe("R13 (P4) — «sobra(n) N {rol}» por cada rol con tope y por API keys", () => {
  it("cada rol con tope y las API keys tienen su nombre en singular y en plural", () => {
    expect(Object.keys(NOMBRES_DEL_TOPE).sort()).toEqual([...ROLES_CON_TOPE, "api_keys"].sort());
  });

  it.each([
    ["admin", "administrador", "administradores"],
    ["mensajero", "mensajero", "mensajeros"],
    ["adminTienda", "admin de tienda", "admins de tienda"],
    ["adminSatelite", "admin satélite", "admins satélite"],
    ["api_keys", "API key", "API keys"],
  ] as const)("%s: singular con 1 de más y plural con varios", (tope, singular, plural) => {
    expect(lineaTopeSobra("Básico", { tope, usados: 4, maximo: 3 })).toBe(`Básico permite 3 y tienes 4: sobra 1 ${singular}.`);
    expect(lineaTopeSobra("Básico", { tope, usados: 7, maximo: 3 })).toBe(`Básico permite 3 y tienes 7: sobran 4 ${plural}.`);
  });

  it("el aviso completo abre con «No puedes cambiar a {plan}:» y lleva una línea por tope pasado", () => {
    expect(
      mensajeTopesSobran("Básico", [
        { tope: "mensajero", usados: 6, maximo: 5 },
        { tope: "api_keys", usados: 3, maximo: 1 },
      ]),
    ).toBe("No puedes cambiar a Básico:\nBásico permite 5 y tienes 6: sobra 1 mensajero.\nBásico permite 1 y tienes 3: sobran 2 API keys.");
  });
});

// --- T5.1: `components/shared/planes/planes-vista.ts` ---------------------------------------------------------

const MONTO = (mensual: string, descuentos: Partial<Record<TipoCobro, DescuentoPeriodo>> = {}): PrecioPlan => ({
  tipo: "monto",
  mensual,
  descuentos,
});

const PLAN: PlanVista = {
  id: "p-1",
  nombre: "Básico",
  precio: MONTO("100.00"),
  costoPorOrden: "200.00",
  costoPorOrdenPorcentual: null,
  topes: { porRol: { admin: 1, mensajero: 4, adminTienda: 1, adminSatelite: 2 }, apiKeys: 1 },
  modulos: ["ranking"],
};

describe("R4 — «Usuarios» es la suma de los topes por rol", () => {
  it("suma los cuatro roles con tope", () => {
    expect(usuariosDelPlan(PLAN.topes)).toBe(8);
    expect(textoDelTope(usuariosDelPlan(PLAN.topes))).toBe("8");
  });

  it("si un rol no tiene tope, «Sin tope»", () => {
    const topes = { porRol: { admin: 1, mensajero: 4, adminTienda: 1 }, apiKeys: null };
    expect(usuariosDelPlan(topes)).toBeNull();
    expect(textoDelTope(usuariosDelPlan(topes))).toBe("Sin tope");
  });

  it("el uso suma los usuarios activos de los cuatro roles, leídos de las filas del consumo", () => {
    expect(usuariosEnUso({ admin: 2, mensajero: 8, adminTienda: 4, adminSatelite: 1 })).toBe(15);
    const filas: FilaConsumo[] = (
      [
        ["admin", 2],
        ["mensajero", 8],
        ["adminTienda", 4],
        ["adminSatelite", 1],
        ["api_keys", 3],
      ] as const
    ).map(([clave, usados]) => ({ clave, usados, etiqueta: "", maximo: null, estado: "sin_limite", texto: "" }));
    expect(usoDeLasFilas(filas, 40)).toEqual({
      ordenes: 40,
      apiKeys: 3,
      porRol: { admin: 2, mensajero: 8, adminTienda: 4, adminSatelite: 1 },
    });
  });
});

describe("R6 (P1, P10) — el precio de la vista y la insignia", () => {
  it("mensual: el costo base mensual con su descuento mensual y sin insignia", () => {
    const precio = MONTO("100.00", {
      mensual: { tipo: "porcentaje", porcentaje: "10" },
      anual: { tipo: "porcentaje", porcentaje: "15" },
    });
    expect(precioDeLaVista(precio, "mensual")).toEqual({ tipo: "monto", monto: "90.00", insignia: null });
  });

  it("anual con descuento en porcentaje: el costo del año con descuento y la insignia con ese porcentaje", () => {
    const precio = MONTO("100.00", { anual: { tipo: "porcentaje", porcentaje: "12.50" } });
    expect(precioDeLaVista(precio, "anual")).toEqual({ tipo: "monto", monto: "1050.00", insignia: "12.5" });
  });

  it("anual sin descuento anual: sin insignia", () => {
    const precio = MONTO("100.00", { mensual: { tipo: "porcentaje", porcentaje: "10" } });
    expect(precioDeLaVista(precio, "anual")).toEqual({ tipo: "monto", monto: "1200.00", insignia: null });
  });

  it.each([
    ["8,33 % redondea hacia abajo", "100.00", "1100.00", "8"],
    ["8,67 % redondea hacia arriba", "104.00", "1096.00", "9"],
    ["7,5 % redondea la mitad hacia arriba", "90.00", "1110.00", "8"],
  ])("anual con descuento en monto fijo: %s", (_caso, descuento, monto, insignia) => {
    const precio = MONTO("100.00", { anual: { tipo: "monto", monto: descuento } });
    expect(precioDeLaVista(precio, "anual")).toEqual({ tipo: "monto", monto, insignia });
  });

  it("P10: un monto fijo cuyo equivalente redondea a 0 % no lleva insignia", () => {
    const precio = MONTO("100.00", { anual: { tipo: "monto", monto: "5.00" } });
    expect(precioDeLaVista(precio, "anual")).toEqual({ tipo: "monto", monto: "1195.00", insignia: null });
  });

  it("P1: sin cuota (costo base 0.00) en las dos vistas, sin insignia", () => {
    const precio = MONTO("0.00", { anual: { tipo: "porcentaje", porcentaje: "10" } });
    expect(esSinCuota(precio)).toBe(true);
    expect(precioDeLaVista(precio, "mensual")).toEqual({ tipo: "sin_cuota" });
    expect(precioDeLaVista(precio, "anual")).toEqual({ tipo: "sin_cuota" });
  });
});

describe("R8 — la tabla de períodos y la comparación", () => {
  it("los cuatro períodos con su descuento, lo que se paga y lo que equivale por mes", () => {
    const precio = MONTO("100.00", {
      bimestral: { tipo: "porcentaje", porcentaje: "5" },
      anual: { tipo: "monto", monto: "120.00" },
    });
    expect(filasDePeriodos(precio)).toEqual([
      { tipo: "quincenal", periodo: "Quincenal", descuento: "—", porPeriodo: "50.00", porMes: "100.00" },
      { tipo: "mensual", periodo: "Mensual", descuento: "—", porPeriodo: "100.00", porMes: "100.00" },
      { tipo: "bimestral", periodo: "Bimestral", descuento: "5 %", porPeriodo: "190.00", porMes: "95.00" },
      { tipo: "anual", periodo: "Anual", descuento: "120.00", porPeriodo: "1080.00", porMes: "90.00" },
    ]);
  });

  it("«equivale por mes» en céntimos exactos, la mitad hacia arriba", () => {
    const precio = MONTO("10.01", { bimestral: { tipo: "monto", monto: "0.01" }, anual: { tipo: "monto", monto: "0.07" } });
    const [, , bimestral, anual] = filasDePeriodos(precio);
    expect(bimestral).toMatchObject({ porPeriodo: "20.01", porMes: "10.01" }); // 10.005 → 10.01
    expect(anual).toMatchObject({ porPeriodo: "120.05", porMes: "10.00" }); // 10.0041… → 10.00
  });

  it("P1: sin cuota, «Sin cuota» en las cuatro filas y en la comparación", () => {
    const sinCuota = { ...PLAN, precio: MONTO("0.00") };
    expect(filasDePeriodos(sinCuota.precio).map((f) => f.porPeriodo)).toEqual(["Sin cuota", "Sin cuota", "Sin cuota", "Sin cuota"]);
    expect(filasDeComparacion(sinCuota, PLAN, "mensual")[0]).toMatchObject({
      concepto: "Uso de la plataforma",
      plan: "Sin cuota",
      activo: "100.00",
    });
  });

  it("concepto por concepto frente al activo, con el período de cobro de la empresa", () => {
    const activo: PlanVista = {
      ...PLAN,
      id: "p-2",
      nombre: "Pro",
      precio: MONTO("300.00", { mensual: { tipo: "porcentaje", porcentaje: "10" } }),
      costoPorOrden: null,
      costoPorOrdenPorcentual: { porcentaje: "3.00", minimo: "250.00" },
      topes: { porRol: { admin: 5 }, apiKeys: null },
      modulos: ["analitica", "ranking"],
    };
    expect(filasDeComparacion(PLAN, activo, "mensual").map((f) => [f.concepto, f.plan, f.activo])).toEqual([
      ["Uso de la plataforma", "100.00", "270.00"],
      ["Costo por orden", "200.00 por orden", "3.00 % del valor del paquete, mínimo 250.00"],
      ["Usuarios", "8", "Sin tope"],
      ["API keys", "1", "Sin tope"],
      ["Analítica", "No incluido", "Incluido"],
      ["Monitoreo", "No incluido", "No incluido"],
      ["Ranking", "Incluido", "Incluido"],
    ]);
  });

  it("R9: sin plan activo, solo la columna del plan", () => {
    expect(filasDeComparacion(PLAN, null, "mensual").every((f) => !("activo" in f))).toBe(true);
  });
});

describe("R13 (P4) — el aviso previo mira cada rol contra su tope y las API keys", () => {
  const USO = { ordenes: 0, apiKeys: 3, porRol: { admin: 1, mensajero: 5, adminTienda: 0, adminSatelite: 0 } };

  it("un rol pasado aunque la suma de «Usuarios» quepa, y las API keys", () => {
    // 6 usuarios en uso frente a 8 de «Usuarios», pero 5 mensajeros contra un tope de 4.
    expect(usuariosEnUso(USO.porRol)).toBeLessThan(usuariosDelPlan(PLAN.topes) ?? 0);
    const excedidos = excedidosContra(PLAN.topes, USO);
    expect(excedidos).toEqual([
      { tope: "mensajero", usados: 5, maximo: 4 },
      { tope: "api_keys", usados: 3, maximo: 1 },
    ]);
    expect(mensajeTopesSobran("Básico", excedidos)).toBe(
      "No puedes cambiar a Básico:\nBásico permite 4 y tienes 5: sobra 1 mensajero.\nBásico permite 1 y tienes 3: sobran 2 API keys.",
    );
  });

  it("sin tope no hay exceso", () => {
    expect(excedidosContra({ porRol: {}, apiKeys: null }, USO)).toEqual([]);
  });
});
