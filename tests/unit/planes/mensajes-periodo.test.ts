import { describe, expect, it } from "vitest";

import { SIN_DESCUENTO, textoDelDescuento, textoDelPrecio } from "@/lib/planes/mensajes";
import { TIPOS_COBRO, type PrecioPlan } from "@/lib/types/planes";

// SLT-86 (design §7.1; R24, R30) — el precio del plan como lo pintan el catálogo, el detalle del plan, el
// modal de asignación y «Mi plan»: el costo base mensual y, por cada período con descuento, el período y
// su descuento. Sin moneda ni tope de órdenes.

describe("R24 — «{mensual} / mes» y «Descuento {tipo}: …»", () => {
  it("solo el costo base mensual, con los importes tal cual llegan de la base", () => {
    expect(textoDelPrecio({ tipo: "monto", mensual: "50000.00", descuentos: {} })).toBe("50000.00 / mes");
  });

  it("un descuento en porcentaje o en monto fijo, con dos decimales", () => {
    expect(textoDelDescuento("anual", { tipo: "porcentaje", porcentaje: "10" })).toBe("Descuento anual: 10.00 %");
    expect(textoDelDescuento("bimestral", { tipo: "monto", monto: "5000" })).toBe("Descuento bimestral: 5000.00");
    expect(textoDelDescuento("quincenal", { tipo: "porcentaje", porcentaje: "12.5" })).toBe("Descuento quincenal: 12.50 %");
  });

  it("los cuatro descuentos en el orden de los tipos, sea cual sea el orden de las claves", () => {
    const precio: PrecioPlan = {
      tipo: "monto",
      mensual: "100.00",
      descuentos: {
        anual: { tipo: "porcentaje", porcentaje: "20" },
        mensual: { tipo: "monto", monto: "1" },
        bimestral: { tipo: "porcentaje", porcentaje: "5" },
        quincenal: { tipo: "monto", monto: "0.5" },
      },
    };
    expect(textoDelPrecio(precio)).toBe(
      "100.00 / mes · Descuento quincenal: 0.50 · Descuento mensual: 1.00 · Descuento bimestral: 5.00 % · Descuento anual: 20.00 %",
    );
    expect(TIPOS_COBRO).toEqual(["quincenal", "mensual", "bimestral", "anual"]);
  });

  it("sin costo base: «sin precio», también si llega «negociable» de un rastro viejo", () => {
    expect(textoDelPrecio({ tipo: "sin_precio" })).toBe("sin precio");
    expect(textoDelPrecio({ tipo: "negociable" })).toBe("sin precio");
  });

  it("ningún texto del precio habla de órdenes ni lleva símbolo de moneda", () => {
    const t = textoDelPrecio({ tipo: "monto", mensual: "50000.00", descuentos: { anual: { tipo: "monto", monto: "1000" } } });
    expect(t).not.toMatch(/órdenes|₡|\$/);
  });

  it("el lado vacío de un descuento en «qué cambia»", () => {
    expect(SIN_DESCUENTO).toBe("sin descuento");
  });
});

describe("R30 — un precio de antes de SLT-86 (con el anual) se pinta tal cual", () => {
  it.each([
    [{ tipo: "monto", mensual: "15000.00", anual: null }, "15000.00 / mes"],
    [{ tipo: "monto", mensual: "15000.00", anual: { tipo: "fijo", monto: "150000.00" } }, "15000.00 / mes · 150000.00 al año"],
    [
      { tipo: "monto", mensual: "15000.00", anual: { tipo: "descuento", porcentaje: "10" } },
      "15000.00 / mes · con 10 % de descuento en el pago anual",
    ],
    // El `precio` del rastro de SLT-86, sin descuentos (van en sus claves).
    [{ tipo: "monto", mensual: "15000.00" }, "15000.00 / mes"],
  ] as const)("%j → %s", (precio, texto) => {
    expect(textoDelPrecio(precio)).toBe(texto);
  });
});
