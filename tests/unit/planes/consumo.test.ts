import { describe, expect, it } from "vitest";

import { estadoDeLaFila, filasDeConsumo, formatearConteo, reinicioDelCiclo } from "@/lib/planes/consumo";
import { SIN_LIMITE, textoDelPrecio } from "@/lib/planes/mensajes";
import type { UsoDelPlan } from "@/lib/types/consumo-plan";
import type { TopesPlan } from "@/lib/types/planes";

// SLT-58 (design §6.1) — la lógica pura del consumo del plan que pintan «Mi plan» y el detalle de
// empresa del superadmin.

describe("SLT-58 — texto del precio (R1)", () => {
  it.each([
    { caso: "R1: sin precio", precio: { tipo: "sin_precio" } as const, texto: "sin precio" },
    { caso: "R1: negociable", precio: { tipo: "negociable" } as const, texto: "negociable" },
    {
      caso: "R1: solo mensual",
      precio: { tipo: "monto", mensual: "15000.00", anual: null } as const,
      texto: "15000.00 al mes",
    },
    {
      caso: "R1: mensual con anual fijo",
      precio: { tipo: "monto", mensual: "15000.00", anual: { tipo: "fijo", monto: "150000.00" } } as const,
      texto: "15000.00 al mes, 150000.00 al año",
    },
    {
      caso: "R1: mensual con descuento anual",
      precio: { tipo: "monto", mensual: "15000.00", anual: { tipo: "descuento", porcentaje: "10" } } as const,
      texto: "15000.00 al mes, con 10 % de descuento en el pago anual",
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
  const topes: TopesPlan = { ordenesPorCiclo: 3000, porRol: { mensajero: 10, admin: 0 }, apiKeys: 5 };
  const uso: UsoDelPlan = {
    ordenes: 1000,
    apiKeys: 4,
    porRol: { maestro: 1, admin: 0, mensajero: 12, adminTienda: 2, adminSatelite: 0 },
  };

  it("R2: una fila por tope, en orden: órdenes, los cinco roles y API keys", () => {
    expect(filasDeConsumo(topes, uso).map((f) => f.clave)).toEqual([
      "ordenes",
      "maestro",
      "admin",
      "mensajero",
      "adminTienda",
      "adminSatelite",
      "api_keys",
    ]);
  });

  it("R2: «<usados> de <máximo>» con miles con punto y la etiqueta del rol de ROL_LABELS", () => {
    const porClave = Object.fromEntries(filasDeConsumo(topes, uso).map((f) => [f.clave, f]));
    expect(porClave.ordenes.texto).toBe("1.000 de 3.000 órdenes del ciclo");
    expect(porClave.mensajero.texto).toBe("12 de 10 Mensajero");
    expect(porClave.admin.texto).toBe("0 de 0 Administrador");
    expect(porClave.api_keys.texto).toBe("4 de 5 API keys");
  });

  it("R2, R4: cada fila lleva su marca", () => {
    const porClave = Object.fromEntries(filasDeConsumo(topes, uso).map((f) => [f.clave, f]));
    expect(porClave.ordenes.estado).toBe("normal");
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

  it("R3: órdenes y API keys sin tope también dicen «sin límite»", () => {
    const sinTopes: TopesPlan = { ordenesPorCiclo: null, porRol: {}, apiKeys: null };
    const filas = filasDeConsumo(sinTopes, uso);
    expect(filas.every((f) => f.estado === "sin_limite" && f.maximo === null)).toBe(true);
    expect(filas[0].texto).toBe("1.000 órdenes del ciclo · sin límite");
    expect(filas.at(-1)?.texto).toBe("4 API keys · sin límite");
  });
});

describe("SLT-58 — reinicioDelCiclo (R5)", () => {
  const ancla = new Date("2026-01-15T10:00:00.000Z");

  it("R5: a mitad de ciclo, la fracción de día se redondea hacia arriba", () => {
    // Del 20 de marzo 00:00 al 15 de abril 10:00 (UTC): 26 días y 10 horas.
    expect(reinicioDelCiclo(ancla, new Date("2026-03-20T00:00:00.000Z"))).toEqual({
      dias: 27,
      fecha: "2026-04-15",
    });
  });

  it("R5: a un minuto del cambio falta 1 día", () => {
    expect(reinicioDelCiclo(ancla, new Date("2026-03-15T09:59:00.000Z"))).toEqual({
      dias: 1,
      fecha: "2026-03-15",
    });
  });

  it("R5: exactamente 24 h son 1 día y un milisegundo más son 2", () => {
    expect(reinicioDelCiclo(ancla, new Date("2026-03-14T10:00:00.000Z")).dias).toBe(1);
    expect(reinicioDelCiclo(ancla, new Date("2026-03-14T09:59:59.999Z")).dias).toBe(2);
  });

  it("R5: en la frontera exacta ya empezó el ciclo nuevo y cuenta hasta el siguiente", () => {
    expect(reinicioDelCiclo(ancla, new Date("2026-03-15T10:00:00.000Z"))).toEqual({
      dias: 31,
      fecha: "2026-04-15",
    });
  });

  it("R5: la fecha visible es la de la hora de la plataforma, no la UTC", () => {
    // 03:00 UTC del 15 es todavía el 14 en la hora de la plataforma (−06:00).
    const anclaDeMadrugada = new Date("2026-01-15T03:00:00.000Z");
    expect(reinicioDelCiclo(anclaDeMadrugada, new Date("2026-02-01T00:00:00.000Z")).fecha).toBe("2026-02-14");
  });

  it("R5: ancla el 31 de enero, el reinicio de febrero cae el 28", () => {
    const anclaFinDeMes = new Date("2027-01-31T08:00:00.000Z");
    expect(reinicioDelCiclo(anclaFinDeMes, new Date("2027-02-27T08:00:00.000Z"))).toEqual({
      dias: 1,
      fecha: "2027-02-28",
    });
  });
});
