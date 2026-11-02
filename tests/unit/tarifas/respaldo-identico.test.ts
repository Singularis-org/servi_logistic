import { describe, it, expect } from "vitest";
import type { GestionResultado } from "@prisma/client";

import {
  costoEnvioDeTarifa,
  costosListadoOrden,
  derivarIngresoOrden,
  desgloseCargaApi,
  type IngresoOrdenDerivado,
  type OrdenIngresoInput,
  type TarifaConFulfillment,
} from "@/lib/utils/ingreso-empresa";
import { pagoPorResultado } from "@/lib/utils/pago-mensajero";
import { ingresoBodegaPorResultado } from "@/lib/utils/ingreso-bodega";
import type { TarifaVigente } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { PagoTarifa } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";

/**
 * SLT-52 T0.1 (R36) — CONTRATO DEL MODELO VIEJO, fijado antes de tocar nada.
 *
 * Mientras una empresa no tenga ningun valor en el modelo nuevo, el cobro y el pago se calculan
 * con el modelo viejo y deben dar, centavo a centavo, lo mismo que antes de SLT-52. Este archivo
 * congela lo que dan HOY las funciones publicas, con sus firmas de hoy. Cuando T2-T6 cambien las
 * firmas, los casos se envuelven en `{ modelo: "viejo", ... }` y los importes NO se tocan.
 *
 * TODOS LOS IMPORTES ESPERADOS ESTAN ESCRITOS A MANO, con la aritmetica anotada. Ninguno se
 * calcula llamando a la funcion probada ni a un helper que la use: compararla contra si misma
 * estaria siempre en verde.
 *
 * Tarifa de laboratorio con centimos que obligan a redondear (HALF_UP a 2 decimales):
 *   flete          2750.55 -> IVA 13 % = 357.5715 -> 357.57
 *   flete GAM      2300.15 -> IVA 13 % = 299.0195 -> 299.02
 *   devuelto       1650.35 -> IVA 13 % = 214.5455 -> 214.55
 *   devuelto GAM   1380.45 -> IVA 13 % = 179.4585 -> 179.46
 *   pacto especial 3995.50 -> IVA 13 % = 519.415  -> 519.42
 *   pacto devuelto 1999.99 -> IVA 13 % = 259.9987 -> 260.00
 *   comision COD 3.50 % · IVA comision 13 %
 *     COD 14900.00 -> comision 521.50 -> IVA 67.795  -> 67.80  (comision + IVA = 589.30)
 *     COD 16618.40 -> comision 581.644 -> 581.64 -> IVA 75.6132 -> 75.61 (= 657.25)
 */
const TARIFA: TarifaVigente = {
  valorFlete: "2750.55",
  valorFleteGam: "2300.15",
  valorFleteDevuelto: "1650.35",
  valorFleteDevueltoGam: "1380.45",
  comisionCod: "3.50",
  ivaFlete: "13.00",
  ivaComisionCod: "13.00",
  tarifaEspecial: null,
  tarifaEspecialDevuelta: null,
};

/** La misma tarifa con pacto especial en entrega Y devolucion. */
const PACTO: TarifaVigente = {
  ...TARIFA,
  tarifaEspecial: "3995.50",
  tarifaEspecialDevuelta: "1999.99",
};

/** Pacto solo en la entrega: la devolucion cae a la columna normal. */
const PACTO_SOLO_ENTREGA: TarifaVigente = { ...TARIFA, tarifaEspecial: "3995.50" };

/** El derivado como `concepto -> string 2 dec`; los conceptos ausentes no aparecen. */
function comoTexto(d: IngresoOrdenDerivado): Record<string, string> {
  return Object.fromEntries(
    Object.entries(d).map(([k, v]) => [k, (v as { toFixed(n: number): string }).toFixed(2)]),
  );
}

const orden = (o: Partial<OrdenIngresoInput>): OrdenIngresoInput => ({
  resultado: "entregado",
  esCentral: false,
  esZonaEspecial: false,
  montoCobrar: "14900.00",
  cobraComision: true,
  ...o,
});

describe("R36 — derivarIngresoOrden (modelo viejo, importes literales)", () => {
  const casos: Array<{
    caso: string;
    input: OrdenIngresoInput;
    tarifa: TarifaVigente | null;
    esperado: Record<string, string>;
  }> = [
    {
      caso: "entregado, estandar, con comision (COD 14900.00)",
      input: orden({}),
      tarifa: TARIFA,
      esperado: {
        ingreso_flete: "2750.55",
        ingreso_iva_flete: "357.57",
        ingreso_comision_cod: "521.50",
        ingreso_iva_comision_cod: "67.80",
      },
    },
    {
      caso: "entregado, GAM, sin comision: comision AUSENTE (no 0.00)",
      input: orden({ esCentral: true, cobraComision: false }),
      tarifa: TARIFA,
      esperado: { ingreso_flete: "2300.15", ingreso_iva_flete: "299.02" },
    },
    {
      caso: "entregado, GAM, con comision (COD 16618.40, redondeo intermedio)",
      input: orden({ esCentral: true, montoCobrar: "16618.40" }),
      tarifa: TARIFA,
      esperado: {
        ingreso_flete: "2300.15",
        ingreso_iva_flete: "299.02",
        ingreso_comision_cod: "581.64",
        ingreso_iva_comision_cod: "75.61",
      },
    },
    {
      caso: "entregado, estandar, con comision y COD null -> comision 0.00 explicita",
      input: orden({ montoCobrar: null }),
      tarifa: TARIFA,
      esperado: {
        ingreso_flete: "2750.55",
        ingreso_iva_flete: "357.57",
        ingreso_comision_cod: "0.00",
        ingreso_iva_comision_cod: "0.00",
      },
    },
    {
      caso: "entregado, zona especial CON pacto (GAM ignorado), con comision",
      input: orden({ esZonaEspecial: true, esCentral: true }),
      tarifa: PACTO,
      esperado: {
        ingreso_flete: "3995.50",
        ingreso_iva_flete: "519.42",
        ingreso_comision_cod: "521.50",
        ingreso_iva_comision_cod: "67.80",
      },
    },
    {
      caso: "entregado, zona especial SIN pacto, estandar -> flete normal",
      input: orden({ esZonaEspecial: true, cobraComision: false }),
      tarifa: TARIFA,
      esperado: { ingreso_flete: "2750.55", ingreso_iva_flete: "357.57" },
    },
    {
      caso: "entregado, zona especial SIN pacto, GAM -> flete GAM",
      input: orden({ esZonaEspecial: true, esCentral: true, cobraComision: false }),
      tarifa: TARIFA,
      esperado: { ingreso_flete: "2300.15", ingreso_iva_flete: "299.02" },
    },
    {
      caso: "entregado, distrito NO especial con tarifa que tiene pacto -> flete normal",
      input: orden({ cobraComision: false }),
      tarifa: PACTO,
      esperado: { ingreso_flete: "2750.55", ingreso_iva_flete: "357.57" },
    },
    {
      caso: "rechazo, estandar, con comision -> solo flete de devolucion",
      input: orden({ resultado: "devolucion_a_origen_por_rechazo" }),
      tarifa: TARIFA,
      esperado: { ingreso_flete_devolucion: "1650.35", ingreso_iva_flete_devolucion: "214.55" },
    },
    {
      caso: "rechazo, GAM, sin comision",
      input: orden({
        resultado: "devolucion_a_origen_por_rechazo",
        esCentral: true,
        cobraComision: false,
      }),
      tarifa: TARIFA,
      esperado: { ingreso_flete_devolucion: "1380.45", ingreso_iva_flete_devolucion: "179.46" },
    },
    {
      caso: "rechazo, zona especial CON pacto de devolucion",
      input: orden({ resultado: "devolucion_a_origen_por_rechazo", esZonaEspecial: true }),
      tarifa: PACTO,
      esperado: { ingreso_flete_devolucion: "1999.99", ingreso_iva_flete_devolucion: "260.00" },
    },
    {
      caso: "rechazo, zona especial SIN pacto, GAM -> devuelto GAM",
      input: orden({
        resultado: "devolucion_a_origen_por_rechazo",
        esZonaEspecial: true,
        esCentral: true,
      }),
      tarifa: TARIFA,
      esperado: { ingreso_flete_devolucion: "1380.45", ingreso_iva_flete_devolucion: "179.46" },
    },
    {
      caso: "rechazo, zona especial con pacto SOLO de entrega -> devuelto normal",
      input: orden({ resultado: "devolucion_a_origen_por_rechazo", esZonaEspecial: true }),
      tarifa: PACTO_SOLO_ENTREGA,
      esperado: { ingreso_flete_devolucion: "1650.35", ingreso_iva_flete_devolucion: "214.55" },
    },
    {
      caso: "reprogramado, GAM, con comision -> no aporta nada",
      input: orden({ resultado: "reprogramado", esCentral: true }),
      tarifa: TARIFA,
      esperado: {},
    },
    {
      caso: "novedad, con comision -> no aporta nada",
      input: orden({ resultado: "novedad" }),
      tarifa: TARIFA,
      esperado: {},
    },
    {
      caso: "incidente, zona especial con pacto -> no aporta nada",
      input: orden({ resultado: "incidente", esZonaEspecial: true }),
      tarifa: PACTO,
      esperado: {},
    },
    {
      caso: "sin tarifa, entregado con comision -> no aporta nada",
      input: orden({}),
      tarifa: null,
      esperado: {},
    },
    {
      caso: "sin tarifa, rechazo -> no aporta nada",
      input: orden({ resultado: "devolucion_a_origen_por_rechazo" }),
      tarifa: null,
      esperado: {},
    },
  ];

  it.each(casos)("$caso", ({ input, tarifa, esperado }) => {
    expect(comoTexto(derivarIngresoOrden(input, tarifa))).toStrictEqual(esperado);
  });
});

describe("R36 — costosListadoOrden (modelo viejo, importes literales)", () => {
  const casos: Array<{
    caso: string;
    tarifa: TarifaVigente | null;
    o: { esCentral: boolean; esZonaEspecial: boolean; montoCobrar: string | null; cobraComision: boolean };
    esperado: { fleteConIva: string; comisionConIva: string; fleteOrigen: string };
  }> = [
    {
      caso: "estandar, con comision (2750.55+357.57; 521.50+67.80)",
      tarifa: TARIFA,
      o: { esCentral: false, esZonaEspecial: false, montoCobrar: "14900.00", cobraComision: true },
      esperado: { fleteConIva: "3108.12", comisionConIva: "589.30", fleteOrigen: "normal" },
    },
    {
      caso: "GAM, sin comision (2300.15+299.02)",
      tarifa: TARIFA,
      o: { esCentral: true, esZonaEspecial: false, montoCobrar: "14900.00", cobraComision: false },
      esperado: { fleteConIva: "2599.17", comisionConIva: "0.00", fleteOrigen: "normal" },
    },
    {
      caso: "zona especial sin pacto, COD 16618.40 (581.64+75.61)",
      tarifa: TARIFA,
      o: { esCentral: false, esZonaEspecial: true, montoCobrar: "16618.40", cobraComision: true },
      esperado: {
        fleteConIva: "3108.12",
        comisionConIva: "657.25",
        fleteOrigen: "especial_sin_pacto",
      },
    },
    {
      caso: "zona especial con pacto (3995.50+519.42)",
      tarifa: PACTO,
      o: { esCentral: true, esZonaEspecial: true, montoCobrar: "14900.00", cobraComision: true },
      esperado: { fleteConIva: "4514.92", comisionConIva: "589.30", fleteOrigen: "especial" },
    },
    {
      caso: "con comision y COD null",
      tarifa: TARIFA,
      o: { esCentral: false, esZonaEspecial: false, montoCobrar: null, cobraComision: true },
      esperado: { fleteConIva: "3108.12", comisionConIva: "0.00", fleteOrigen: "normal" },
    },
    {
      caso: "sin tarifa, zona especial -> ceros y origen normal",
      tarifa: null,
      o: { esCentral: true, esZonaEspecial: true, montoCobrar: "14900.00", cobraComision: true },
      esperado: { fleteConIva: "0.00", comisionConIva: "0.00", fleteOrigen: "normal" },
    },
  ];

  it.each(casos)("$caso", ({ tarifa, o, esperado }) => {
    expect(costosListadoOrden(tarifa, o)).toStrictEqual(esperado);
  });
});

describe("R36 — costoEnvioDeTarifa y desgloseCargaApi (modelo viejo, importes literales)", () => {
  const con = (t: TarifaVigente, fulfillment: string): TarifaVigente & TarifaConFulfillment => ({
    ...t,
    fulfillment,
  });

  const casos: Array<{
    caso: string;
    tarifa: (TarifaVigente & TarifaConFulfillment) | null;
    esCentral: boolean;
    esZonaEspecial: boolean;
    envio: string;
    esperado: { costoEnvio: string; fulfillment: string };
  }> = [
    {
      caso: "estandar, sin fulfillment (3108.12 + 0.00)",
      tarifa: con(TARIFA, "0.00"),
      esCentral: false,
      esZonaEspecial: false,
      envio: "3108.12",
      esperado: { costoEnvio: "3108.12", fulfillment: "0.00" },
    },
    {
      caso: "GAM, con fulfillment (2599.17 + 450.25)",
      tarifa: con(TARIFA, "450.25"),
      esCentral: true,
      esZonaEspecial: false,
      envio: "2599.17",
      esperado: { costoEnvio: "3049.42", fulfillment: "450.25" },
    },
    {
      caso: "zona especial con pacto, con fulfillment (4514.92 + 450.25)",
      tarifa: con(PACTO, "450.25"),
      esCentral: false,
      esZonaEspecial: true,
      envio: "4514.92",
      esperado: { costoEnvio: "4965.17", fulfillment: "450.25" },
    },
    {
      caso: "zona especial sin pacto, GAM, fulfillment sin decimales (2599.17 + 1000)",
      tarifa: con(TARIFA, "1000"),
      esCentral: true,
      esZonaEspecial: true,
      envio: "2599.17",
      esperado: { costoEnvio: "3599.17", fulfillment: "1000.00" },
    },
    {
      caso: "sin tarifa -> ceros",
      tarifa: null,
      esCentral: true,
      esZonaEspecial: true,
      envio: "0.00",
      esperado: { costoEnvio: "0.00", fulfillment: "0.00" },
    },
  ];

  it.each(casos)("costoEnvioDeTarifa: $caso", ({ tarifa, esCentral, esZonaEspecial, envio }) => {
    expect(costoEnvioDeTarifa(tarifa, esCentral, esZonaEspecial)).toBe(envio);
  });

  it.each(casos)("desgloseCargaApi: $caso", ({ tarifa, esCentral, esZonaEspecial, esperado }) => {
    expect(desgloseCargaApi(tarifa, esCentral, esZonaEspecial)).toStrictEqual(esperado);
  });
});

const PAGO: PagoTarifa = { cobroEntregado: "1250.50", cobroRechazado: "300.75" };
const PAGO_ENTEROS: PagoTarifa = { cobroEntregado: "1250", cobroRechazado: "300" };
const PAGO_SIN_RECHAZO: PagoTarifa = { cobroEntregado: "1250.50", cobroRechazado: "0.00" };

describe("R36 — pagoPorResultado (mensajero, modelo viejo, importes literales)", () => {
  const casos: Array<[string, GestionResultado, PagoTarifa | null, string]> = [
    ["entregado paga cobroEntregado", "entregado", PAGO, "1250.50"],
    ["entregado con importe sin decimales", "entregado", PAGO_ENTEROS, "1250.00"],
    ["reprogramado no paga", "reprogramado", PAGO, "0.00"],
    ["novedad no paga", "novedad", PAGO, "0.00"],
    ["rechazo no paga (cobroRechazado es de la bodega)", "devolucion_a_origen_por_rechazo", PAGO, "0.00"],
    ["incidente no paga", "incidente", PAGO, "0.00"],
    ["sin tarifa, entregado -> 0.00", "entregado", null, "0.00"],
  ];

  it.each(casos)("%s", (_caso, resultado, tarifa, esperado) => {
    expect(pagoPorResultado(resultado, tarifa)).toBe(esperado);
  });
});

describe("R36 — ingresoBodegaPorResultado (satelite, modelo viejo, importes literales)", () => {
  const casos: Array<[string, GestionResultado, PagoTarifa | null, string]> = [
    ["rechazo cobra cobroRechazado", "devolucion_a_origen_por_rechazo", PAGO, "300.75"],
    ["rechazo con importe sin decimales", "devolucion_a_origen_por_rechazo", PAGO_ENTEROS, "300.00"],
    ["rechazo con cobroRechazado 0.00 -> 0.00", "devolucion_a_origen_por_rechazo", PAGO_SIN_RECHAZO, "0.00"],
    ["entregado no genera ingreso de bodega", "entregado", PAGO, "0.00"],
    ["reprogramado no genera", "reprogramado", PAGO, "0.00"],
    ["novedad no genera", "novedad", PAGO, "0.00"],
    ["incidente no genera", "incidente", PAGO, "0.00"],
    ["sin tarifa, rechazo -> 0.00", "devolucion_a_origen_por_rechazo", null, "0.00"],
  ];

  it.each(casos)("%s", (_caso, resultado, tarifa, esperado) => {
    expect(ingresoBodegaPorResultado(resultado, tarifa)).toBe(esperado);
  });
});
