import { describe, expect, it } from "vitest";

import { estadoDeLaFila, filasDeConsumo, formatearConteo, reinicioDelCiclo } from "@/lib/planes/consumo";
import { SIN_LIMITE, textoDelPrecio } from "@/lib/planes/mensajes";
import type { UsoDelPlan } from "@/lib/types/consumo-plan";
import type { TopesPlan } from "@/lib/types/planes";

// SLT-58 (design §6.1) — la lógica pura del consumo del plan que pintan «Mi plan» y el detalle de
// empresa del superadmin.

describe("SLT-58 — texto del precio (R1); SLT-86: «{mensual} / mes» y los descuentos del período", () => {
  it.each([
    { caso: "R1: sin precio", precio: { tipo: "sin_precio" } as const, texto: "sin precio" },
    {
      caso: "R1: solo mensual",
      precio: { tipo: "monto", mensual: "15000.00", descuentos: {} } as const,
      texto: "15000.00 / mes",
    },
    {
      caso: "SLT-86 R24: mensual con descuentos, en el orden de los tipos",
      precio: {
        tipo: "monto",
        mensual: "15000.00",
        descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" }, quincenal: { tipo: "monto", monto: "500" } },
      } as const,
      texto: "15000.00 / mes · Descuento quincenal: 500.00 · Descuento anual: 10.00 %",
    },
    {
      caso: "SLT-86 R30: una fila de antes con anual fijo",
      precio: { tipo: "monto", mensual: "15000.00", anual: { tipo: "fijo", monto: "150000.00" } } as const,
      texto: "15000.00 / mes · 150000.00 al año",
    },
    {
      caso: "SLT-86 R30: una fila de antes con descuento anual",
      precio: { tipo: "monto", mensual: "15000.00", anual: { tipo: "descuento", porcentaje: "10" } } as const,
      texto: "15000.00 / mes · con 10 % de descuento en el pago anual",
    },
  ])("$caso, sin símbolo de moneda", ({ precio, texto }) => {
    expect(textoDelPrecio(precio)).toBe(texto);
  });
});

describe("SLT-58 — formatearConteo (R2)", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1.000"],
    [3000, "3.000"],
    [1234567, "1.234.567"],
  ])("R2: %i se pinta %s, miles con punto", (n, texto) => {
    expect(formatearConteo(n)).toBe(texto);
  });
});

describe("SLT-58 — estadoDeLaFila (R3, R4)", () => {
  it.each([
    { caso: "R4: 79 de 99 no está cerca (sin redondeo)", usados: 79, maximo: 99, estado: "normal" },
    { caso: "R4: 80 de 100 está cerca", usados: 80, maximo: 100, estado: "cerca" },
    { caso: "R4: 99 de 100 está cerca", usados: 99, maximo: 100, estado: "cerca" },
    { caso: "R4: 100 de 100 está lleno", usados: 100, maximo: 100, estado: "lleno" },
    { caso: "R4: 101 de 100 (ya lo pasa por una edición) está lleno", usados: 101, maximo: 100, estado: "lleno" },
    { caso: "R4: 0 de 0 está lleno", usados: 0, maximo: 0, estado: "lleno" },
    { caso: "R4: 0 de 100 no lleva marca", usados: 0, maximo: 100, estado: "normal" },
    { caso: "R3, R4: sin tope nunca se marca, con cualquier uso", usados: 1_000_000, maximo: null, estado: "sin_limite" },
    { caso: "R3: sin tope y sin uso", usados: 0, maximo: null, estado: "sin_limite" },
  ] as const)("$caso", ({ usados, maximo, estado }) => {
    expect(estadoDeLaFila(usados, maximo)).toBe(estado);
  });
});

describe("SLT-58 — filasDeConsumo (R2, R3)", () => {
  const topes: TopesPlan = { porRol: { mensajero: 10, admin: 0 }, apiKeys: 5 };
  const uso: UsoDelPlan = {
    ordenes: 1000,
    apiKeys: 4,
    // SLT-66 R5: el uso ya no trae al maestro.
    porRol: { admin: 0, mensajero: 12, adminTienda: 2, adminSatelite: 0 },
  };

  // SLT-66 R1: el maestro ya no tiene tope, así que no tiene fila; quedan cuatro roles. SLT-86 (R8): las
  // órdenes tampoco, porque ya no tienen tope.
  it("R2, SLT-86 R8: una fila por tope, en orden: los cuatro roles y API keys, sin fila de órdenes", () => {
    expect(filasDeConsumo(topes, uso).map((f) => f.clave)).toEqual([
      "admin",
      "mensajero",
      "adminTienda",
      "adminSatelite",
      "api_keys",
    ]);
  });

  it("R2: «<usados> de <máximo>» con miles con punto y la etiqueta del rol de ROL_LABELS", () => {
    const porClave = Object.fromEntries(filasDeConsumo(topes, uso).map((f) => [f.clave, f]));
    expect(porClave.mensajero.texto).toBe("12 de 10 Mensajero");
    expect(porClave.admin.texto).toBe("0 de 0 Administrador");
    expect(porClave.api_keys.texto).toBe("4 de 5 API keys");
  });

  it("R2, R4: cada fila lleva su marca", () => {
    const porClave = Object.fromEntries(filasDeConsumo(topes, uso).map((f) => [f.clave, f]));
    expect(porClave.mensajero.estado).toBe("lleno");
    expect(porClave.admin.estado).toBe("lleno");
    expect(porClave.api_keys.estado).toBe("cerca");
  });

  it("R3: un rol sin tope muestra su uso y «sin límite», sin marca", () => {
    const porClave = Object.fromEntries(filasDeConsumo(topes, uso).map((f) => [f.clave, f]));
    expect(porClave.adminTienda).toEqual({
      clave: "adminTienda",
      etiqueta: "Admin de tienda",
      usados: 2,
      maximo: null,
      estado: "sin_limite",
      texto: `2 Admin de tienda · ${SIN_LIMITE}`,
    });
  });

  it("R3: las API keys sin tope también dicen «sin límite»", () => {
    const sinTopes: TopesPlan = { porRol: {}, apiKeys: null };
    const filas = filasDeConsumo(sinTopes, uso);
    expect(filas.every((f) => f.estado === "sin_limite" && f.maximo === null)).toBe(true);
    expect(filas.at(-1)?.texto).toBe("4 API keys · sin límite");
  });
});

// SLT-86 (R27): «Se reinicia en N días ({fecha})» cuenta hasta el fin del período de calendario, que no
// depende de la entrada (el tramo solo recorta el inicio). Sustituye al reinicio por aniversario del
// ancla y al del ciclo corto de SLT-58 (R5, R40), que esta ficha retira.
describe("SLT-86 — reinicioDelCiclo hasta el siguiente período de calendario (R27)", () => {
  it("mensual a mitad de mes: la fracción de día se redondea hacia arriba", () => {
    // Del 20 de octubre 12:00 al 1 de noviembre 00:00 (hora de la plataforma): 11 días y 12 horas.
    expect(reinicioDelCiclo("mensual", new Date("2026-10-20T18:00:00.000Z"))).toEqual({ dias: 12, fecha: "2026-11-01" });
  });

  it("quincenal: la primera quincena reinicia el 16 y la segunda el 1", () => {
    expect(reinicioDelCiclo("quincenal", new Date("2026-10-10T18:00:00.000Z")).fecha).toBe("2026-10-16");
    expect(reinicioDelCiclo("quincenal", new Date("2026-10-20T18:00:00.000Z")).fecha).toBe("2026-11-01");
  });

  it("bimestral y anual: el 1 del bimestre siguiente y el 1 de enero", () => {
    expect(reinicioDelCiclo("bimestral", new Date("2026-10-20T18:00:00.000Z")).fecha).toBe("2026-11-01");
    expect(reinicioDelCiclo("anual", new Date("2026-10-20T18:00:00.000Z"))).toEqual({ dias: 73, fecha: "2027-01-01" });
  });

  it("a un minuto del cambio falta 1 día; exactamente 24 h son 1 día y un milisegundo más son 2", () => {
    // 1 de noviembre 00:00 de la plataforma = 06:00 UTC.
    expect(reinicioDelCiclo("mensual", new Date("2026-11-01T05:59:00.000Z"))).toEqual({ dias: 1, fecha: "2026-11-01" });
    expect(reinicioDelCiclo("mensual", new Date("2026-10-31T06:00:00.000Z")).dias).toBe(1);
    expect(reinicioDelCiclo("mensual", new Date("2026-10-31T05:59:59.999Z")).dias).toBe(2);
  });

  it("en la frontera exacta ya empezó el período nuevo y cuenta hasta el siguiente", () => {
    expect(reinicioDelCiclo("mensual", new Date("2026-11-01T06:00:00.000Z"))).toEqual({ dias: 30, fecha: "2026-12-01" });
  });

  it("la fecha visible es la de la plataforma: a las 23:00 del 31 de octubre (ya 1 de noviembre en UTC) reinicia el 1", () => {
    expect(reinicioDelCiclo("mensual", new Date("2026-11-01T05:00:00.000Z")).fecha).toBe("2026-11-01");
  });
});
