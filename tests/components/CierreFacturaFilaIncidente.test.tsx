// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CierreFacturaDetalle,
  type CierreFacturaCabecera,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import type { CierreGrupos } from "@/lib/interfaces/services/ICierreDiaService";
import {
  ENTREGA_478,
  gestion478,
  grupos478,
  ingreso478,
  tarifa478,
} from "@/tests/fixtures/gestion-detalle-478";

/**
 * FICHA 478 (T2.2, P2/R19) — la fila desplegable del comprobante gana lo que la tabla vieja del
 * detalle de bodega enseñaba y ella no: CAUSA e INDEMNIZACIÓN del incidente y FULFILLMENT de la
 * tarifa congelada. Solo cuando tienen valor; indemnización y fulfillment, nunca al mensajero.
 *
 * Se monta el COMPROBANTE DEL CIERRE DE MENSAJERO (`CierreFacturaDetalle`): la fila es la misma
 * que monta el detalle de bodega, y R19 vale en los dos sitios. Textos en LITERAL: la etiqueta
 * de la causa está escrita a mano, no leída de `CAUSA_INCIDENTE_LABEL`.
 */

const CABECERA: CierreFacturaCabecera = {
  cierreId: "c4780019",
  estado: "solicitado",
  destinoTipo: "bodega_central",
  destinoZonaNombre: "GAM",
  mensajeroNombre: "Ana Mensajera",
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-09-01T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
};

const INCIDENTE_PENDIENTE = gestion478({
  gestionId: "gi1",
  resultado: "incidente",
  numRemision: "REM-I1",
  destinatario: "Iván Incidente",
  causaIncidente: "robado",
  indemnizacion: null,
  ingresoEmpresa: ingreso478(),
});

const INCIDENTE_INDEMNIZADO = gestion478({
  gestionId: "gi2",
  resultado: "incidente",
  numRemision: "REM-I2",
  destinatario: "Inés Indemnizada",
  causaIncidente: "danado",
  indemnizacion: "4500.75",
  ingresoEmpresa: ingreso478(),
});

const NOTA_PENDIENTE = "Se captura al aprobar el cierre; todavía no se indemnizó.";

function pintar(
  grupos: CierreGrupos,
  audiencia: "admin" | "satelite" | "mensajero" = "admin",
) {
  render(<CierreFacturaDetalle cierre={CABECERA} grupos={grupos} audiencia={audiencia} />);
  return screen.getByRole("region", { name: "Órdenes del cierre" });
}

async function desplegar(region: HTMLElement, nombre: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  const boton = within(region).getByRole("button", { name: nombre });
  await user.click(boton);
  return boton.parentElement as HTMLElement;
}

afterEach(() => {
  cleanup();
});

describe("478/R19 — causa, indemnización y fulfillment en la fila desplegada", () => {
  it("una fila de incidente desplegada enseña causa e indemnización (o el marcador pendiente)", async () => {
    const region = pintar(grupos478({ incidente: [INCIDENTE_PENDIENTE, INCIDENTE_INDEMNIZADO] }));

    const pendiente = await desplegar(
      region,
      "Desglose de ingreso de la orden REM-I1 · Iván Incidente",
    );
    expect(pendiente).toHaveTextContent("Causa: Paquete robado");
    expect(pendiente).toHaveTextContent("Indemnización: —");
    // El «—» no es «cero»: lleva su nota accesible.
    expect(within(pendiente).getByLabelText(NOTA_PENDIENTE)).toHaveTextContent("—");

    const indemnizado = await desplegar(
      region,
      "Desglose de ingreso de la orden REM-I2 · Inés Indemnizada",
    );
    expect(indemnizado).toHaveTextContent("Causa: Paquete dañado");
    expect(indemnizado).toHaveTextContent("Indemnización: ₡4.500,75");
    expect(within(indemnizado).queryByLabelText(NOTA_PENDIENTE)).toBeNull();
  });

  it("enseña fulfillment cuando la tarifa congelada lo trae", async () => {
    const region = pintar(grupos478({ entregado: [ENTREGA_478] }));
    const fila = await desplegar(
      region,
      "Desglose de ingreso de la orden REM-E1 · Carla Entregada",
    );
    expect(fila).toHaveTextContent("Fulfillment: ₡350,50");
  });

  it("sin fulfillment en la tarifa, ni causa ni indemnización fuera de un incidente: no se pinta nada", async () => {
    const sinFulfillment = gestion478({
      gestionId: "ge9",
      resultado: "entregado",
      numRemision: "REM-E9",
      destinatario: "Elsa Sin Fulfillment",
      // Un valor de causa colado en una entrega NO se pinta: solo aplica al incidente.
      causaIncidente: "perdido",
      ingresoEmpresa: ingreso478({ tarifa: tarifa478({ fulfillment: null }) }),
    });
    const region = pintar(grupos478({ entregado: [sinFulfillment] }));
    const fila = await desplegar(
      region,
      "Desglose de ingreso de la orden REM-E9 · Elsa Sin Fulfillment",
    );
    expect(fila).not.toHaveTextContent("Fulfillment:");
    expect(fila).not.toHaveTextContent("Causa:");
    expect(fila).not.toHaveTextContent("Indemnización:");
  });

  it("en la vista del mensajero hay causa, pero NO indemnización ni fulfillment (datos de la empresa)", async () => {
    const incidenteMensajero = gestion478({
      gestionId: "gi3",
      resultado: "incidente",
      numRemision: "REM-I3",
      destinatario: "Iris Mensajero",
      causaIncidente: "perdido",
      indemnizacion: "1000.00",
    });
    const entregaMensajero = gestion478({
      ...ENTREGA_478,
      gestionId: "ge3",
      resultado: "entregado",
    });
    const region = pintar(
      grupos478({ entregado: [entregaMensajero], incidente: [incidenteMensajero] }),
      "mensajero",
    );

    const entrega = await desplegar(
      region,
      "Desglose de ingreso de la orden REM-E1 · Carla Entregada",
    );
    expect(entrega).not.toHaveTextContent("Fulfillment:");

    const user = userEvent.setup();
    const tab = within(region)
      .getAllByRole("tab")
      .find((t) => (t.textContent ?? "").startsWith("Incidente"));
    await user.click(tab as HTMLElement);
    const incidente = await desplegar(
      screen.getByRole("region", { name: "Órdenes del cierre" }),
      "Detalle de la orden REM-I3 · Iris Mensajero",
    );
    expect(incidente).toHaveTextContent("Causa: Paquete perdido");
    expect(incidente).not.toHaveTextContent("Indemnización:");
  });
});

/**
 * FICHA 481 — el fulfillment de la fila desplegada es dato de la CENTRAL (pedido humano): lo ve
 * la audiencia `admin` (maestro/admin) y NO lo ven ni el `adminSatelite` (`satelite`) ni el
 * mensajero. Lo demás de la fila no cambia para la satélite: se afirma el pago al mensajero y la
 * cifra «Total de la empresa» de la fila para que un recorte de más también se ponga rojo.
 */
describe("481 — fulfillment solo para la central", () => {
  const BOTON = "Desglose de ingreso de la orden REM-E1 · Carla Entregada";

  it("central (admin): la fila desplegada enseña «Fulfillment: ₡350,50»", async () => {
    const fila = await desplegar(pintar(grupos478({ entregado: [ENTREGA_478] }), "admin"), BOTON);
    expect(fila).toHaveTextContent("Fulfillment: ₡350,50");
  });

  it("adminSatelite (satelite): la fila desplegada NO enseña fulfillment, y el resto sigue igual", async () => {
    const fila = await desplegar(
      pintar(grupos478({ entregado: [ENTREGA_478] }), "satelite"),
      BOTON,
    );
    expect(fila).not.toHaveTextContent("Fulfillment");
    expect(fila).not.toHaveTextContent("₡350,50");
    expect(fila).toHaveTextContent("Pago al mensajero: ₡1.200,40");
    expect(fila).toHaveTextContent("Flete + IVA: ₡2.260");
  });

  it("mensajero: la fila desplegada NO enseña fulfillment", async () => {
    const fila = await desplegar(
      pintar(grupos478({ entregado: [ENTREGA_478] }), "mensajero"),
      BOTON,
    );
    expect(fila).not.toHaveTextContent("Fulfillment");
    expect(fila).not.toHaveTextContent("₡350,50");
  });
});
