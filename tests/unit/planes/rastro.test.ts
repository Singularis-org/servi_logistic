import { describe, expect, it } from "vitest";

import { cambioPendienteDelPlan } from "@/lib/planes/consumo";
import { lineasDeCambioDelPlan, type CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import type { Nivel } from "@/lib/planes/niveles";
import { diferenciasDelPlan, hayCambios, importeCanonico } from "@/lib/planes/rastro";
import type { PlanDTO } from "@/lib/types/planes";

// SL-24 (design §2.8, §5) — el diff que va a `plan_rastro.cambios`: solo lo que cambió, comparado en
// forma canónica, con los importes como texto con dos decimales.

const BASE: PlanDTO = {
  id: "p1",
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { adminTienda: 3, admin: 1 }, apiKeys: 2 },
  modulos: ["ranking", "analitica"],
  precio: { tipo: "monto", mensual: "25000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
  archivado: false,
  costoPorOrden: null, // SLT-66 R7: el plan lleva costo por orden; aquí, vacío.
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
};

describe("SL-24 — diferenciasDelPlan", () => {
  it("al crear salen todos los campos con antes null, y los importes como texto con dos decimales", () => {
    expect(diferenciasDelPlan(null, BASE)).toEqual({
      nombre: { antes: null, despues: "Básico" },
      topes: { antes: null, despues: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 } },
      modulos: { antes: null, despues: ["analitica", "ranking"] },
      // SLT-86 (R31): el costo base mensual en `precio` y cada descuento en su clave.
      precio: { antes: null, despues: { tipo: "monto", mensual: "25000.00" } },
      descuento_quincenal: { antes: null, despues: null },
      descuento_mensual: { antes: null, despues: null },
      descuento_bimestral: { antes: null, despues: null },
      descuento_anual: { antes: null, despues: { tipo: "porcentaje", porcentaje: "10.00" } },
      costoPorOrden: { antes: null, despues: null }, // SLT-66 R8: al crear también sale el costo por orden.
      costoPorOrdenPorcentual: { antes: null, despues: null }, // SLT-83: campo nuevo del rastro; el alta lo registra como los demás.
      periodicidadOrdenes: { antes: null, despues: "quincenal" }, // SLT-118 R35: campo nuevo del rastro; el alta lo registra.
      archivado: { antes: null, despues: false },
    });
  });

  it("sin cambios reales da vacío: orden de módulos, orden de claves y «10» frente a «10.00» no cuentan", () => {
    const igual: PlanDTO = {
      ...BASE,
      topes: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
      modulos: ["analitica", "ranking"],
      precio: { tipo: "monto", mensual: "25000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.0" } } },
    };
    const d = diferenciasDelPlan(BASE, igual);
    expect(d).toEqual({});
    expect(hayCambios(d)).toBe(false);
  });

  it.each([
    ["nombre", { nombre: "Pro" }, { antes: "Básico", despues: "Pro" }],
    [
      "topes",
      { topes: { porRol: { adminTienda: 3, admin: 1 }, apiKeys: 5 } },
      {
        antes: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 2 },
        despues: { porRol: { admin: 1, adminTienda: 3 }, apiKeys: 5 },
      },
    ],
    ["modulos", { modulos: ["monitoreo"] }, { antes: ["analitica", "ranking"], despues: ["monitoreo"] }],
    [
      "precio",
      { precio: { tipo: "monto", mensual: "30000", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } } },
      { antes: { tipo: "monto", mensual: "25000.00" }, despues: { tipo: "monto", mensual: "30000.00" } },
    ],
    ["archivado", { archivado: true }, { antes: false, despues: true }],
  ] as const)("cambiar solo %s da solo ese campo, con antes y despues", (campo, cambio, esperado) => {
    expect(diferenciasDelPlan(BASE, { ...BASE, ...cambio } as PlanDTO)).toEqual({ [campo]: esperado });
  });

  it("quitar el tope de un rol es un cambio de topes", () => {
    const d = diferenciasDelPlan(BASE, { ...BASE, topes: { ...BASE.topes, porRol: { admin: 1 } } });
    expect(Object.keys(d)).toEqual(["topes"]);
  });

  it("importeCanonico no pasa por Number: ceros a la izquierda fuera y dos decimales", () => {
    expect(importeCanonico("007.5")).toBe("7.50");
    expect(importeCanonico("0")).toBe("0.00");
    expect(importeCanonico("9999999999.99")).toBe("9999999999.99");
    expect(importeCanonico("10.1")).toBe("10.10");
  });
});

// SLT-214 (design §3.6; R19) — los beneficios en el rastro: el orden es dato, así que texto, ícono y orden cuentan;
// un alta sin beneficios no añade la clave (las filas «creado» de antes siguen iguales: el caso de arriba).
describe("SLT-214 R19 — los beneficios en diferenciasDelPlan", () => {
  const SOPORTE = { icono: "soporte", texto: "Soporte 24 h" } as const;
  const ENVIOS = { icono: "camion", texto: "Envíos prioritarios" } as const;
  const CON: PlanDTO = { ...BASE, beneficios: [SOPORTE, ENVIOS] };

  it("un alta sin beneficios, con la lista vacía o sin la clave, no lleva `beneficios`", () => {
    expect(diferenciasDelPlan(null, { ...BASE, beneficios: [] })).not.toHaveProperty("beneficios");
    expect(diferenciasDelPlan(null, BASE)).not.toHaveProperty("beneficios");
  });

  it("un alta con beneficios los lleva en su orden, con antes null, después de los módulos", () => {
    const d = diferenciasDelPlan(null, CON);
    expect(d.beneficios).toEqual({ antes: null, despues: [SOPORTE, ENVIOS] });
    const claves = Object.keys(d);
    expect(claves.indexOf("beneficios")).toBe(claves.indexOf("modulos") + 1);
  });

  it.each([
    ["el texto", [{ ...SOPORTE, texto: "Soporte 24/7" }, ENVIOS]],
    ["el ícono", [{ ...SOPORTE, icono: "reloj_24h" }, ENVIOS]],
    ["el orden", [ENVIOS, SOPORTE]],
    ["quitar uno", [SOPORTE]],
    ["agregar uno", [SOPORTE, ENVIOS, { icono: "rayo", texto: "Acceso anticipado" }]],
  ] as const)("una edición que cambia %s guarda solo `beneficios`, con la lista de antes y la de después", (_caso, despues) => {
    expect(diferenciasDelPlan(CON, { ...CON, beneficios: [...despues] })).toEqual({
      beneficios: { antes: [SOPORTE, ENVIOS], despues },
    });
  });

  it("la misma lista no es un cambio, y una versión sin `beneficios` encima del plan tampoco (R18)", () => {
    expect(diferenciasDelPlan(CON, { ...CON, beneficios: [{ ...SOPORTE }, { ...ENVIOS }] })).toEqual({});
    // Como en `consumo.ts` y el repositorio: el plan con la versión encima; esta no trae la clave.
    const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = CON;
    expect(diferenciasDelPlan(CON, { ...CON, ...{ nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } })).toEqual({});
  });

  it("quitar todos los beneficios en una edición sí es un cambio", () => {
    expect(diferenciasDelPlan(CON, { ...CON, beneficios: [] })).toEqual({ beneficios: { antes: [SOPORTE, ENVIOS], despues: [] } });
  });
});

// SLT-215 (design §3.6; R19, R20) — los niveles en el rastro y en las líneas «Esto es lo que cambia:». Como los
// beneficios: un alta sin niveles no añade la clave, y los importes se comparan normalizados («10» = «10.00»).
describe("SLT-215 R19, R20 — los niveles en diferenciasDelPlan y en las líneas de cambio", () => {
  const N1: Nivel = { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10" } };
  const N2: Nivel = { meta: 500, descuento: { tipo: "monto", monto: "1500" } };
  const CANON1 = { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10.00" } };
  const CANON2 = { meta: 500, descuento: { tipo: "monto", monto: "1500.00" } };
  const CON: PlanDTO = { ...BASE, niveles: [N1, N2] };

  it("R19: un alta sin niveles, con la lista vacía o sin la clave, no lleva `niveles`", () => {
    expect(diferenciasDelPlan(null, { ...BASE, niveles: [] })).not.toHaveProperty("niveles");
    expect(diferenciasDelPlan(null, BASE)).not.toHaveProperty("niveles");
  });

  it("R19: un alta con niveles los lleva en su orden, normalizados, con antes null, después de los beneficios", () => {
    const d = diferenciasDelPlan(null, { ...CON, beneficios: [{ icono: "check", texto: "Soporte" }] });
    expect(d.niveles).toEqual({ antes: null, despues: [CANON1, CANON2] });
    const claves = Object.keys(d);
    expect(claves.indexOf("niveles")).toBe(claves.indexOf("beneficios") + 1);
  });

  it.each([
    ["la meta", [{ ...N1, meta: 150 }, N2]],
    ["el descuento", [N1, { ...N2, descuento: { tipo: "monto", monto: "1600" } }]],
    ["el tipo de descuento", [{ ...N1, descuento: { tipo: "monto", monto: "10" } }, N2]],
    ["quitar uno", [N1]],
    ["agregar uno", [N1, N2, { meta: 900, descuento: { tipo: "porcentaje", porcentaje: "5" } }]],
    ["quitarlos todos", []],
  ] as [string, Nivel[]][])("R19: una edición que cambia %s guarda solo `niveles`, con la lista de antes y la de después", (_caso, despues) => {
    const d = diferenciasDelPlan(CON, { ...CON, niveles: despues });
    expect(Object.keys(d)).toEqual(["niveles"]);
    expect(d.niveles?.antes).toEqual([CANON1, CANON2]);
    expect((d.niveles?.despues as unknown[]).length).toBe(despues.length);
  });

  it("R19: «10» y el «10.00» de la base son el mismo nivel; una versión sin `niveles` encima del plan no cambia (R18)", () => {
    const deLaBase: Nivel[] = [
      { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10.00" } },
      { meta: 500, descuento: { tipo: "monto", monto: "1500.00" } },
    ];
    expect(diferenciasDelPlan(CON, { ...CON, niveles: deLaBase })).toEqual({});
    const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = CON;
    expect(diferenciasDelPlan(CON, { ...CON, ...{ nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } })).toEqual({});
  });

  it("R20: la línea «Niveles por volumen: <antes> → <después>», con «Sin niveles» de un lado, después de los beneficios", () => {
    const cambio = (antes: Nivel[], despues: Nivel[]) =>
      lineasDeCambioDelPlan(
        diferenciasDelPlan({ ...BASE, niveles: antes }, { ...BASE, niveles: despues, modulos: ["ranking"] }) as CambioDelPlanParaCorreo,
      );
    expect(cambio([N1], [N1, N2])).toContain(
      "Niveles por volumen: Nivel 1: desde 100 órdenes, −10.00 % → Nivel 1: desde 100 órdenes, −10.00 %; Nivel 2: desde 500 órdenes, −1500.00",
    );
    expect(cambio([], [N1])).toContain("Niveles por volumen: Sin niveles → Nivel 1: desde 100 órdenes, −10.00 %");
    expect(cambio([N2], [])).toContain("Niveles por volumen: Nivel 1: desde 500 órdenes, −1500.00 → Sin niveles");
    // Sin cambio de niveles, no hay línea.
    expect(cambio([N1], [N1]).some((l) => l.startsWith("Niveles por volumen"))).toBe(false);
    // Va después de los módulos y los beneficios.
    const lineas = lineasDeCambioDelPlan({
      modulos: { antes: ["ranking"], despues: [] },
      beneficios: { antes: [], despues: [{ icono: "check", texto: "Soporte" }] },
      niveles: { antes: [], despues: [N1] },
      nombre: { antes: "A", despues: "B" },
    });
    const i = lineas.findIndex((l) => l.startsWith("Niveles por volumen"));
    expect(i).toBe(lineas.length - 1);
  });

  it("R20: el cambio pendiente de «Mi plan», cuya vigente no trae niveles, no inventa una línea de niveles", () => {
    const cambio = {
      vigenteDesde: new Date("2026-12-01T06:00:00.000Z"),
      version: { nombre: BASE.nombre, topes: BASE.topes, modulos: BASE.modulos, precio: BASE.precio, costoPorOrden: null, costoPorOrdenPorcentual: null, niveles: [N1] },
    } as unknown as Parameters<typeof cambioPendienteDelPlan>[1];
    const { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual } = BASE;
    const vigente = { nombre, topes, modulos, precio, costoPorOrden, costoPorOrdenPorcentual };
    const sinNiveles = cambioPendienteDelPlan(vigente, cambio).lineas;
    const conNiveles = cambioPendienteDelPlan({ ...vigente, niveles: [] }, cambio).lineas;
    expect(sinNiveles.some((l) => l.startsWith("Niveles por volumen"))).toBe(false);
    expect(conNiveles).toContain("Niveles por volumen: Sin niveles → Nivel 1: desde 100 órdenes, −10.00 %");
  });
});
