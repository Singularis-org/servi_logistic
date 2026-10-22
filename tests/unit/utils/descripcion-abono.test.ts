import { describe, expect, it } from "vitest";

import {
  descripcionAbonoEnCaja,
  descripcionAbonoEnTienda,
  descripcionAnulacionAbono,
} from "@/lib/utils/descripcion-abono";

/** FICHA 457 / T3.3 — R21: las lineas del pago de una tienda a la empresa, sin ningun identificador interno. */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("457/T3.3 — descripciones del pago de una tienda a la empresa", () => {
  it("libro de la tienda, con referencia: motivo, metodo y referencia", () => {
    expect(
      descripcionAbonoEnTienda({
        motivo: "Pago de lo que debía por los fletes de septiembre",
        metodo: "SINPE",
        referencia: "123456",
      }),
    ).toBe("Pago de lo que debía por los fletes de septiembre · SINPE · 123456");
  });

  it("libro de la tienda, en efectivo y sin referencia", () => {
    expect(descripcionAbonoEnTienda({ motivo: "Abono a la deuda", metodo: "efectivo", referencia: null })).toBe(
      "Abono a la deuda · Efectivo",
    );
  });

  it("recorta los espacios que rodean el texto libre", () => {
    expect(
      descripcionAbonoEnTienda({ motivo: "  Pago parcial  ", metodo: "transferencia", referencia: " TR-9 " }),
    ).toBe("Pago parcial · Transferencia · TR-9");
  });

  it("la caja antepone el NOMBRE de la tienda", () => {
    expect(
      descripcionAbonoEnCaja("Mercadito", { motivo: "Pago parcial", metodo: "SINPE", referencia: "88" }),
    ).toBe("Mercadito · Pago parcial · SINPE · 88");
    expect(descripcionAbonoEnCaja("  Mercadito  ", { motivo: "x", metodo: "efectivo", referencia: null })).toBe(
      "Mercadito · x · Efectivo",
    );
  });

  it("la anulacion antepone «Anulación · » a la linea original, sin el motivo de la anulacion", () => {
    const original = "Mercadito · Pago parcial · SINPE · 88";
    expect(descripcionAnulacionAbono(original)).toBe(`Anulación · ${original}`);
    expect(descripcionAnulacionAbono(original)).not.toContain("Referencia equivocada");
  });

  it("ninguna de las tres lineas tiene forma de uuid (R21/R48)", () => {
    const datos = { motivo: "Pago parcial", metodo: "SINPE" as const, referencia: "88" };
    const lineas = [
      descripcionAbonoEnTienda(datos),
      descripcionAbonoEnCaja("Mercadito", datos),
      descripcionAnulacionAbono(descripcionAbonoEnCaja("Mercadito", datos)),
    ];
    for (const l of lineas) expect(l).not.toMatch(UUID);
    // Contraprueba del detector: una linea con un uuid SI casa.
    expect("x · 7f1c2d3e-0000-4000-8000-000000000001").toMatch(UUID);
  });
});
