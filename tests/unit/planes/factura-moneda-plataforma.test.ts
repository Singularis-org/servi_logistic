import { describe, expect, it } from "vitest";

import { MONEDA_DE_LOS_PLANES, MONEDA_PLATAFORMA } from "@/lib/config/moneda";
import { construirPdfFactura } from "@/lib/facturas-plataforma/pdf";
import { FACTURA_DESCARGA_TEXTOS, importeDocumento, resumirFactura } from "@/lib/facturas-plataforma/resumen";
import { textoDelCobroVigente } from "@/lib/planes/mensajes";
import { plantillaFacturaEmitida, type FacturaEmitidaParams } from "@/lib/services/email/plantillas/factura-emitida";
import { cuota, datosDescarga, factura } from "../../components/_facturas-plataforma";
import { leerPdf } from "../facturas-plataforma/_pdf-leido";
import { MONEDA_CR, MONEDA_DE_PRUEBA, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SL-21 (design §5.5; R15, R16) — las facturas de planes y el texto del cobro por orden se cobran en la moneda de los
// planes (`MONEDA_DE_LOS_PLANES`, la de la plataforma) sea cual sea el país de la empresa, hasta SLT-237. Y no pintan
// impuesto (SLT-118).
//
// La empresa es de un país de prueba con moneda e impuesto propios (`MONEDA_DE_PRUEBA`, «TASA DE PRUEBA»): son los
// valores que NO deben aparecer. Ninguno de estos caminos recibe el puerto del país; el doble está para nombrar ese
// país y comparar contra sus datos, no porque se inyecte. Los textos esperados con CR van escritos a mano (R16).

const IMPUESTO_DE_PRUEBA = "TASA DE PRUEBA";
const PAIS_DE_PRUEBA = reglasPaisFijas({ paisId: "XA", moneda: MONEDA_DE_PRUEBA, impuestoNombre: IMPUESTO_DE_PRUEBA });

/** Lo que delata la moneda o el impuesto de un país: los del de prueba y el «IVA» de Costa Rica. */
async function exigirSinPaisNiImpuesto(texto: string): Promise<void> {
  const moneda = await PAIS_DE_PRUEBA.moneda();
  expect(texto).not.toContain(moneda.simbolo);
  expect(texto).not.toContain(moneda.codigo);
  expect(texto).not.toContain(await PAIS_DE_PRUEBA.nombreImpuesto());
  expect(texto).not.toMatch(/\bIVA\b/);
}

const CORREO: FacturaEmitidaParams = {
  to: "maestra@empresa.example",
  nombre: "Ana Pérez",
  empresaNombre: "Empresa de país de prueba",
  factura: {
    numero: 3,
    desde: new Date("2026-11-16T06:00:00.000Z"),
    hasta: new Date("2026-12-01T06:00:00.000Z"),
    cargos: "1234.50",
    reversos: "300.00",
    cuota: cuota({ cuota: "10000.00" }),
    primeraCuota: null,
    total: "10934.50",
  },
  contacto: "soporte@plataforma.example",
  urlApp: "https://app.example.com",
};

describe("SL-21 R15 · la moneda de los planes es la de la plataforma", () => {
  it("`MONEDA_DE_LOS_PLANES` es `MONEDA_PLATAFORMA` (la de CR en los tests), no la del país", () => {
    expect(MONEDA_DE_LOS_PLANES).toBe(MONEDA_PLATAFORMA);
    expect(MONEDA_DE_LOS_PLANES).toEqual(MONEDA_CR);
  });

  it("el correo de la factura emitida: importes en la moneda de los planes y sin impuesto", async () => {
    const m = plantillaFacturaEmitida(CORREO);
    expect(m.html ?? "").toContain("Total a pagar ₡10.934,50");
    expect(m.text).toContain("Cuota del plan: ₡10.000");
    expect(m.text).toContain("Cargos por orden: ₡1.234,50");
    expect(m.text).toContain("Reversos de cargos: -₡300");
    await exigirSinPaisNiImpuesto(m.text);
    await exigirSinPaisNiImpuesto(m.html ?? "");
  });

  it("la nota de moneda del PDF nombra la moneda de los planes", async () => {
    expect(FACTURA_DESCARGA_TEXTOS.notaMoneda).toBe("Montos en CRC (₡).");
    await exigirSinPaisNiImpuesto(FACTURA_DESCARGA_TEXTOS.notaMoneda);
  });

  it("`importeDocumento` pinta con el símbolo y el separador decimal de los planes", async () => {
    expect(importeDocumento("473000.00")).toBe("₡473 000,00");
    expect(importeDocumento("-40400.00")).toBe("-₡40 400,00");
    await exigirSinPaisNiImpuesto(importeDocumento("1234567.89"));
  });

  it("el PDF de la factura: la nota y los importes en la moneda de los planes, sin impuesto", async () => {
    const datos = datosDescarga({ factura: factura() });
    const { textos } = leerPdf(construirPdfFactura(datos, resumirFactura(datos), null));
    const todo = textos.flat().join("\n");
    expect(todo).toContain("Montos en CRC (₡).");
    expect(todo).toContain(importeDocumento(datos.factura.total));
    await exigirSinPaisNiImpuesto(todo);
  });

  it("`textoDelCobroVigente` (modo fijo) pinta en la moneda de los planes", async () => {
    const texto = textoDelCobroVigente({ modo: "fijo", monto: "80.00", fuente: "plan" });
    expect(texto).toBe("₡80");
    await exigirSinPaisNiImpuesto(texto);
  });
});
