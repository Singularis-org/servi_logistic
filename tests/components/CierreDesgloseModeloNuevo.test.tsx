// @vitest-environment jsdom
//
// SLT-54 (T5.1, T5.2; R62, R63, R65) — el detalle de un cierre del modelo nuevo y, al lado, el mismo
// detalle del viejo, que no puede moverse. Los importes son literales: la tarjeta no calcula, y una
// aserción contra la fuente que los genera siempre estaría en verde.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CascadasCierreMensajero } from "@/app/(app)/cierres-admin/_components/CascadasCierreMensajero";
import {
  COBROS_TITULO,
  COBROS_TOTAL_LABEL,
  DESGLOSE_TITULO,
  DesgloseIngresoEmpresa,
  FLETE_DEV_CON_IVA_LABEL,
  FLETE_NO_ENTREGADAS_CON_IVA_LABEL,
  FLETE_RECHAZO_LABEL,
  FLETE_RECHAZO_NO_DEDUCIBLE_NOTA,
  FULFILLMENT_FUERA_DEL_TOTAL_TITULO,
  IVA_FLETE_RECHAZO_LABEL,
  SIN_TARIFA_CONGELADA_NOTA,
  TotalesIngresoPanel,
  VALOR_FLETE_GAM_LABEL,
  VALOR_FLETE_LABEL,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import {
  CierreFacturaDetalle,
  GestionesPorResultado,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import {
  FLETE_NO_ENTREGADAS_NOTA,
  FULFILLMENT_COL,
  fleteDevConIvaDeGestion,
  fleteNoEntregaLabel,
  hayGestionEnModeloNuevo,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreResultado,
  IngresoEmpresaDTO,
  TarifaSnapshotDTO,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";

afterEach(() => cleanup());

const TARIFA_VIEJA: TarifaSnapshotDTO = {
  tarifaId: "8f1c0b2e-0000-4000-8000-000000000054",
  valorFlete: "1000.00",
  valorFleteGam: "800.00",
  valorFleteDevuelto: "500.00",
  valorFleteDevueltoGam: "400.00",
  comisionCod: "5.00",
  ivaFlete: "13.00",
  ivaComisionCod: "13.00",
  fulfillment: "696.40",
  tarifaEspecial: null,
  tarifaEspecialDevuelta: null,
};

const BASE: IngresoEmpresaDTO = {
  montoCobrar: "25000.00",
  cobraComision: true,
  esCentral: false,
  esZonaEspecial: false,
  fleteOrigen: "normal",
  fleteDevolucionOrigen: "normal",
  flete: null,
  ivaFlete: null,
  fleteDevolucion: null,
  ivaFleteDevolucion: null,
  comisionCod: null,
  ivaComisionCod: null,
  fleteConIva: null,
  fleteDevolucionConIva: null,
  comisionConIva: null,
  total: "0.00",
  fulfillment: "0.00",
  ivaFulfillment: "0.00",
  tarifa: null,
  tarifaModelo: null,
};

/** Entrega del nuevo: flete, comisión y un fulfillment que NO está en el total (1.700 + 221 + 500 + 65). */
const NUEVO_ENTREGA: IngresoEmpresaDTO = {
  ...BASE,
  tarifaModelo: "nuevo",
  flete: "1700.00",
  ivaFlete: "221.00",
  fleteConIva: "1921.00",
  comisionCod: "500.00",
  ivaComisionCod: "65.00",
  comisionConIva: "565.00",
  total: "2486.00",
  fulfillment: "900.00",
  ivaFulfillment: "117.00",
};

const NUEVO_NOVEDAD: IngresoEmpresaDTO = {
  ...BASE,
  tarifaModelo: "nuevo",
  fleteDevolucion: "600.00",
  ivaFleteDevolucion: "78.00",
  fleteDevolucionConIva: "678.00",
  total: "678.00",
  fulfillment: "900.00",
  ivaFulfillment: "117.00",
};

const VIEJO_ENTREGA: IngresoEmpresaDTO = {
  ...BASE,
  tarifaModelo: "viejo",
  tarifa: TARIFA_VIEJA,
  flete: "1000.00",
  ivaFlete: "130.00",
  fleteConIva: "1130.00",
  total: "1130.00",
  fulfillment: "696.40",
};

function gestion(ing: IngresoEmpresaDTO | null, resultado: CierreResultado = "entregado"): CierreDetalleGestion {
  return {
    gestionId: "g1",
    ordenId: "o1",
    fechaGestion: "2026-07-11",
    resultado,
    numGuia: 1001,
    numRemision: "REM-54",
    destinatario: "Beto Ruiz",
    direccion: "Calle 1",
    zonaNombre: "Zona 2",
    provinciaNombre: "Provincia",
    cantonNombre: "Canton",
    distritoNombre: "Distrito",
    producto: "Caja",
    tiendaNombre: "Tienda X",
    montoRecibido: null,
    metodoPago: null,
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null,
    evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    ingresoEmpresa: ing,
  };
}

function grupos(g: CierreDetalleGestion): CierreGrupos {
  return {
    entregado: [],
    reprogramado: [],
    novedad: [],
    devolucion_a_origen_por_rechazo: [],
    incidente: [],
    [g.resultado]: [g],
  };
}

const TOTALES: TotalesIngresoEmpresa = {
  montoCobrar: "25000.00",
  fleteConIva: "1921.00",
  fleteDevolucionConIva: "678.00",
  comisionConIva: "565.00",
  total: "3164.00",
  flete: "1700.00",
  ivaFlete: "221.00",
  fleteDevolucion: "600.00",
  ivaFleteDevolucion: "78.00",
  comisionCod: "500.00",
  ivaComisionCod: "65.00",
};

/** El importe de la fila con ese rótulo dentro de una sección, tal como se pinta. */
function importe(seccion: HTMLElement, label: string): string {
  const fila = within(seccion).getByText(label).closest("div") as HTMLElement;
  return (fila.lastElementChild?.textContent ?? "").trim();
}

const cobros = () => screen.getByRole("region", { name: COBROS_TITULO });
const zonaFulfillment = () => screen.queryByRole("region", { name: FULFILLMENT_FUERA_DEL_TOTAL_TITULO });

describe("SLT-54 R63 — la tarjeta del modelo nuevo", () => {
  it("no dice que la tienda no tenía tarifa", () => {
    render(<DesgloseIngresoEmpresa g={gestion(NUEVO_ENTREGA)} />);
    expect(screen.queryByText(SIN_TARIFA_CONGELADA_NOTA)).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("pinta los conceptos con su importe y su total", () => {
    render(<DesgloseIngresoEmpresa g={gestion(NUEVO_ENTREGA)} />);
    expect(importe(cobros(), "Flete")).toBe("₡1.700");
    expect(importe(cobros(), "IVA flete")).toBe("₡221");
    expect(importe(cobros(), "Comisión COD")).toBe("₡500");
    expect(importe(cobros(), "IVA comisión")).toBe("₡65");
    expect(importe(cobros(), COBROS_TOTAL_LABEL)).toBe("₡2.486");
  });

  it("sin filas de variante de bodega principal ni de pacto, y sin la fórmula del viejo", () => {
    render(<DesgloseIngresoEmpresa g={gestion(NUEVO_ENTREGA)} />);
    expect(screen.queryByText(VALOR_FLETE_LABEL)).toBeNull();
    expect(screen.queryByText(VALOR_FLETE_GAM_LABEL)).toBeNull();
    expect(screen.queryByText(/tarifa especial/i)).toBeNull();
    expect(screen.queryByText(/GAM/)).toBeNull();
    expect(screen.queryByRole("region", { name: DESGLOSE_TITULO })).toBeNull();
  });

  it("un concepto que no se cobró no lleva fila, y un 0 escrito sí", () => {
    render(
      <DesgloseIngresoEmpresa
        g={gestion({ ...BASE, tarifaModelo: "nuevo", flete: "0.00", ivaFlete: "0.00", fleteConIva: "0.00" })}
      />,
    );
    expect(importe(cobros(), "Flete")).toBe("₡0");
    expect(within(cobros()).queryByText("Comisión COD")).toBeNull();
    expect(within(cobros()).queryByText(FLETE_RECHAZO_LABEL)).toBeNull();
  });

  it("sin comisión lo dice, como en el viejo", () => {
    render(<DesgloseIngresoEmpresa g={gestion({ ...NUEVO_ENTREGA, cobraComision: false })} />);
    expect(screen.getByText("Esta orden no cobra comisión COD.")).toBeInTheDocument();
  });
});

describe("SLT-54 R62 — fulfillment fuera del total y solo para quien lo ve", () => {
  it("fulfillment e IVA en su sección, y el total no los suma", () => {
    render(<DesgloseIngresoEmpresa g={gestion(NUEVO_ENTREGA)} verFulfillment />);
    expect(zonaFulfillment()).not.toBeNull();
    const zona = zonaFulfillment() as HTMLElement;
    expect(importe(zona, FULFILLMENT_COL)).toBe("₡900");
    expect(importe(zona, "IVA de fulfillment")).toBe("₡117");
    expect(zona).toHaveTextContent("Fuera de «Total cobrado»");
    expect(within(cobros()).queryByText(FULFILLMENT_COL)).toBeNull();
    expect(importe(cobros(), COBROS_TOTAL_LABEL)).toBe("₡2.486");
  });

  it("anulado por el servidor (ficha 481): ni sección ni cero, y el total sigue igual", () => {
    render(
      <DesgloseIngresoEmpresa g={gestion({ ...NUEVO_ENTREGA, fulfillment: null, ivaFulfillment: null })} verFulfillment />,
    );
    expect(zonaFulfillment()).toBeNull();
    expect(screen.queryByText("₡900")).toBeNull();
    expect(screen.queryByText("₡117")).toBeNull();
    expect(importe(cobros(), COBROS_TOTAL_LABEL)).toBe("₡2.486");
  });

  it("un actor sin acceso no lo ve aunque el dato llegara: falla cerrado", () => {
    render(<DesgloseIngresoEmpresa g={gestion(NUEVO_ENTREGA)} />);
    expect(zonaFulfillment()).toBeNull();
    expect(screen.queryByText("₡900")).toBeNull();
  });

  it("viejo: la tarjeta no gana la sección", () => {
    render(<DesgloseIngresoEmpresa g={gestion(VIEJO_ENTREGA)} verFulfillment />);
    expect(zonaFulfillment()).toBeNull();
    expect(screen.queryByText("IVA de fulfillment")).toBeNull();
  });
});

describe("SLT-54 R65 — el flete que no es de entrega nombra lo que suma", () => {
  it.each([
    ["reprogramado", "Flete por reprogramado", "IVA del flete por reprogramado"],
    ["novedad", "Flete por novedad", "IVA del flete por novedad"],
    ["incidente", "Flete por incidente", "IVA del flete por incidente"],
    ["devolucion_a_origen_por_rechazo", "Flete por devolución a origen", IVA_FLETE_RECHAZO_LABEL],
  ] as const)("nuevo, %s: «%s» con su importe y su IVA", (resultado, rotulo, rotuloIva) => {
    render(<DesgloseIngresoEmpresa g={gestion(NUEVO_NOVEDAD, resultado)} />);
    expect(importe(cobros(), rotulo)).toBe("₡600");
    expect(importe(cobros(), rotuloIva)).toBe("₡78");
    if (resultado !== "devolucion_a_origen_por_rechazo") {
      expect(screen.queryByText(FLETE_RECHAZO_LABEL)).toBeNull();
    }
  });

  it("el rechazo se llama igual que en el viejo", () => {
    expect(fleteNoEntregaLabel("devolucion_a_origen_por_rechazo")).toBe(FLETE_RECHAZO_LABEL);
  });

  it("la fila de la gestión: resultado en el nuevo, el de siempre en el viejo", () => {
    expect(fleteDevConIvaDeGestion(gestion(NUEVO_NOVEDAD, "novedad"))).toBe("Flete por novedad + IVA");
    expect(fleteDevConIvaDeGestion(gestion(VIEJO_ENTREGA, "novedad"))).toBe(FLETE_DEV_CON_IVA_LABEL);
    expect(fleteDevConIvaDeGestion(gestion(null, "novedad"))).toBe(FLETE_DEV_CON_IVA_LABEL);
  });

  it("basta una gestión del nuevo para que el total lo diga", () => {
    const vieja = gestion(VIEJO_ENTREGA);
    expect(hayGestionEnModeloNuevo(grupos(vieja))).toBe(false);
    expect(hayGestionEnModeloNuevo({ ...grupos(vieja), novedad: [gestion(NUEVO_NOVEDAD, "novedad")] })).toBe(true);
    expect(hayGestionEnModeloNuevo(grupos(gestion(null)))).toBe(false);
  });

  it("panel de totales", () => {
    const { rerender } = render(<TotalesIngresoPanel totales={TOTALES} modeloNuevo />);
    expect(screen.getByText("Flete de gestiones no entregadas + IVA")).toBeInTheDocument();
    expect(screen.queryByText(FLETE_DEV_CON_IVA_LABEL)).toBeNull();
    rerender(<TotalesIngresoPanel totales={TOTALES} />);
    expect(screen.getByText("Flete por devolución a origen + IVA")).toBeInTheDocument();
    expect(screen.queryByText(FLETE_NO_ENTREGADAS_CON_IVA_LABEL)).toBeNull();
  });

  const cascadas = (modeloNuevo?: boolean) => (
    <CascadasCierreMensajero
      mensajeroNombre="Beto"
      estado="solicitado"
      general="25000.00"
      totalesIngreso={TOTALES}
      totalPagoMensajero="100.00"
      totalIngresoBodegaRechazos="0.00"
      pagoTienda="22000.00"
      cobradoSobreRecaudado="2486.00"
      ivaFacturado="364.00"
      netoEmpresa="2700.00"
      ganaLaTienda="21836.00"
      fleteRechazoYaCobradoATienda={false}
      partesPorTienda={[]}
      modeloNuevo={modeloNuevo}
    />
  );

  it("cascada de la tienda: rótulo y nota siguen al modelo", () => {
    const { rerender } = render(cascadas(true));
    expect(screen.getByText(FLETE_NO_ENTREGADAS_CON_IVA_LABEL)).toBeInTheDocument();
    expect(screen.getByText(FLETE_NO_ENTREGADAS_NOTA)).toBeInTheDocument();
    expect(screen.queryByText(FLETE_DEV_CON_IVA_LABEL)).toBeNull();
    rerender(cascadas());
    expect(screen.getByText(FLETE_DEV_CON_IVA_LABEL)).toBeInTheDocument();
    expect(screen.getByText(FLETE_RECHAZO_NO_DEDUCIBLE_NOTA)).toBeInTheDocument();
    expect(screen.queryByText(FLETE_NO_ENTREGADAS_NOTA)).toBeNull();
  });
});

describe("SLT-54 R63 — el modelo viejo se ve como hoy", () => {
  it("la nota de sin tarifa sigue donde es verdad: `null` y viejo sin fila", () => {
    const { rerender } = render(<DesgloseIngresoEmpresa g={gestion(BASE)} />);
    expect(screen.getByRole("note")).toHaveTextContent(SIN_TARIFA_CONGELADA_NOTA);
    rerender(<DesgloseIngresoEmpresa g={gestion({ ...BASE, tarifaModelo: "viejo" })} />);
    expect(screen.getByRole("note")).toHaveTextContent(SIN_TARIFA_CONGELADA_NOTA);
  });

  it("dos paneles, con la fórmula, las columnas y los mismos importes", () => {
    render(<DesgloseIngresoEmpresa g={gestion(VIEJO_ENTREGA)} />);
    expect(screen.getByRole("region", { name: DESGLOSE_TITULO })).toBeInTheDocument();
    expect(screen.getByText("tarifa no GAM: ₡1.000")).toBeInTheDocument();
    expect(importe(cobros(), VALOR_FLETE_LABEL)).toBe("₡1.000");
    expect(importe(cobros(), VALOR_FLETE_GAM_LABEL)).toBe("₡0");
    expect(importe(cobros(), FLETE_RECHAZO_LABEL)).toBe("₡0");
    expect(importe(cobros(), COBROS_TOTAL_LABEL)).toBe("₡1.130");
  });
});

describe("SLT-54 T5.2, R62 — la fila desplegada de la factura", () => {
  async function fulfillmentDeFila(ing: IngresoEmpresaDTO, verFulfillment = true): Promise<HTMLElement | null> {
    const user = userEvent.setup();
    render(<GestionesPorResultado grupos={grupos(gestion(ing))} verFulfillment={verFulfillment} />);
    await user.click(screen.getByRole("button", { name: /REM-54/ }));
    return screen.queryByText(`${FULFILLMENT_COL}:`);
  }
  const filaFulfillment = (el: HTMLElement) => el.parentElement as HTMLElement;

  it("nuevo: lee `ing.fulfillment`, con `tarifa` en null", async () => {
    const etiqueta = await fulfillmentDeFila(NUEVO_ENTREGA);
    expect(etiqueta).not.toBeNull();
    expect(filaFulfillment(etiqueta as HTMLElement)).toHaveTextContent("₡900");
    expect(zonaFulfillment()).not.toBeNull();
    expect(importe(zonaFulfillment() as HTMLElement, "IVA de fulfillment")).toBe("₡117");
  });

  it("viejo: el de la tarifa congelada, igual que hoy", async () => {
    const etiqueta = await fulfillmentDeFila(VIEJO_ENTREGA);
    expect(etiqueta).not.toBeNull();
    expect(filaFulfillment(etiqueta as HTMLElement)).toHaveTextContent("₡696,40");
  });

  it("viejo anterior a la columna: sin fila, no ₡0, aunque `ing.fulfillment` diga 0.00", async () => {
    const etiqueta = await fulfillmentDeFila({
      ...VIEJO_ENTREGA,
      fulfillment: "0.00",
      tarifa: { ...TARIFA_VIEJA, fulfillment: null },
    });
    expect(etiqueta).toBeNull();
  });

  it("quien no lo ve: sin fila aunque el dato llegara", async () => {
    expect(await fulfillmentDeFila(NUEVO_ENTREGA, false)).toBeNull();
    expect(zonaFulfillment()).toBeNull();
    expect(screen.queryByText("₡900")).toBeNull();
  });

  it("anulado por el servidor: sin fila", async () => {
    expect(await fulfillmentDeFila({ ...NUEVO_ENTREGA, fulfillment: null, ivaFulfillment: null })).toBeNull();
  });

  it("la fila del flete que no es de entrega dice su resultado", async () => {
    const user = userEvent.setup();
    render(<GestionesPorResultado grupos={grupos(gestion(NUEVO_NOVEDAD, "novedad"))} />);
    await user.click(screen.getByRole("button", { name: /REM-54/ }));
    expect(screen.getByText("Flete por novedad + IVA:")).toBeInTheDocument();
    expect(screen.queryByText(`${FLETE_DEV_CON_IVA_LABEL}:`)).toBeNull();
  });
});

describe("SLT-54 R65 — los totales del comprobante", () => {
  const cierre = {
    cierreId: "c1",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-07-11T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
  } as const;
  const bloque = () => screen.getAllByRole("region").find((r) => r.textContent?.includes("Flete + IVA"));

  it("nuevo y viejo", () => {
    const { rerender } = render(
      <CierreFacturaDetalle
        cierre={cierre}
        grupos={grupos(gestion(NUEVO_NOVEDAD, "novedad"))}
        totalesIngreso={TOTALES}
      />,
    );
    expect(within(bloque() as HTMLElement).getByText(FLETE_NO_ENTREGADAS_CON_IVA_LABEL)).toBeInTheDocument();
    rerender(
      <CierreFacturaDetalle cierre={cierre} grupos={grupos(gestion(VIEJO_ENTREGA))} totalesIngreso={TOTALES} />,
    );
    expect(within(bloque() as HTMLElement).getByText(FLETE_DEV_CON_IVA_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(FLETE_NO_ENTREGADAS_CON_IVA_LABEL)).toBeNull();
  });
});
