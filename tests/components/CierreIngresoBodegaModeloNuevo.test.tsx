// @vitest-environment jsdom
//
// SLT-54 (R71, añadido en la revisión F2.2): el ingreso de bodega de un cierre del modelo nuevo nombra lo
// que suma, y sus filas suman la tarjeta. Las cifras son las de `e2e/tarifas-activacion.spec.ts`: una entrega
// (satélite 120) y un rechazo (satélite 450). Los textos del viejo van literales a propósito: compararlos con
// sus constantes dejaría pasar que alguien cambie la constante.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CascadasCierreMensajero } from "@/app/(app)/cierres-admin/_components/CascadasCierreMensajero";
import { DesglosePorTienda } from "@/app/(app)/cierres-admin/_components/DesglosePorTienda";
import {
  CierreFacturaDetalle,
  GestionesPorResultado,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import type { CierreFacturaAudiencia } from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { EMPRESA } from "@/lib/config/marca";
import type { CierreResultado } from "@/lib/interfaces/services/ICierreDiaService";
import { gestion478, grupos478, ingreso478 } from "@/tests/fixtures/gestion-detalle-478";

afterEach(() => cleanup());

const VIEJO = "Ingreso de bodega por devoluciones a origen";
const NUEVO = "Ingreso de bodega";

const CIERRE = {
  cierreId: "c1",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "10000.00" },
  totalPagoMensajero: "2200.00",
  totalIngresoBodegaRechazos: "570.00",
  solicitadoAt: "2026-07-11T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
} as const;

function gestion(
  numRemision: string,
  resultado: CierreResultado,
  modelo: "nuevo" | "viejo",
  ingresoBodegaRechazo: string | null,
) {
  return gestion478({
    gestionId: numRemision,
    numRemision,
    resultado,
    ingresoBodegaRechazo,
    ingresoEmpresa: ingreso478({ tarifaModelo: modelo, tarifa: null }),
  });
}

const GRUPOS_NUEVO = grupos478({
  entregado: [gestion("REM-E", "entregado", "nuevo", "120.00")],
  devolucion_a_origen_por_rechazo: [gestion("REM-R", "devolucion_a_origen_por_rechazo", "nuevo", "450.00")],
});

const GRUPOS_VIEJO = grupos478({
  entregado: [gestion("REM-E", "entregado", "viejo", "0.00")],
  devolucion_a_origen_por_rechazo: [gestion("REM-R", "devolucion_a_origen_por_rechazo", "viejo", "300.00")],
});

function montarDetalle(
  grupos: ReturnType<typeof grupos478>,
  desglose: { sla: string; manual: string; total: string },
  audiencia: CierreFacturaAudiencia = "admin",
) {
  render(
    <CierreFacturaDetalle
      cierre={{ ...CIERRE, totalIngresoBodegaRechazos: desglose.total }}
      grupos={grupos}
      desgloseIngresoBodegaRechazos={desglose}
      pagoTienda="9000.00"
      audiencia={audiencia}
    />,
  );
}

/** El importe que dice la fila de esa gestión tras desplegarla; `null` si no lo enseña. */
async function ingresoDeFila(remision: RegExp, pestana: RegExp, rotulo: string): Promise<string | null> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: pestana }));
  await user.click(screen.getByRole("button", { name: remision }));
  const dato = screen.queryByText(`${rotulo}:`);
  return dato === null ? null : (dato.parentElement?.textContent ?? "").replace(`${rotulo}: `, "").trim();
}

describe("SLT-54 R71 — modelo nuevo: entrega 120 + rechazo 450 = 570", () => {
  const DESGLOSE = { sla: "0.00", manual: "570.00", total: "570.00" };

  it("la tarjeta y el par de abajo dicen «Ingreso de bodega» sobre 570, sin hablar de devoluciones", () => {
    montarDetalle(GRUPOS_NUEVO, DESGLOSE);
    const tarjeta = screen.getByRole("region", { name: "Ingreso de bodega del cierre" });
    expect(tarjeta).toHaveTextContent("Ingreso de bodega");
    expect(tarjeta).toHaveTextContent("₡570");
    expect(screen.getAllByText(NUEVO).length).toBe(2);
    expect(screen.queryByText(VIEJO)).toBeNull();
    expect(document.body.textContent).not.toContain("por devoluciones a origen");
  });

  it("sin las sublíneas de origen, donde la entrega caía en «Manual»", () => {
    montarDetalle(GRUPOS_NUEVO, DESGLOSE);
    expect(document.body.textContent).not.toContain("Automático (por plazo vencido)");
    expect(document.body.textContent).not.toContain("Manual (mensajero)");
  });

  it("las filas enseñan 120 y 450, que suman los 570 de la tarjeta", async () => {
    montarDetalle(GRUPOS_NUEVO, DESGLOSE);
    const entrega = await ingresoDeFila(/REM-E/, /^Entregad/, NUEVO);
    const rechazo = await ingresoDeFila(/REM-R/, /Devoluci/, NUEVO);
    expect(entrega).toBe("₡120");
    expect(rechazo).toBe("₡450");
    const cifra = (texto: string | null) => Number((texto ?? "").replace(/\D/g, ""));
    const tarjeta = screen.getByRole("region", { name: "Ingreso de bodega del cierre" }).textContent;
    expect(cifra(entrega) + cifra(rechazo)).toBe(cifra(tarjeta));
  });

  it.each<[CierreResultado, RegExp]>([
    ["reprogramado", /^Reprogramad/],
    ["novedad", /^Novedad/],
    ["incidente", /^Incidente/],
  ])("%s: enseña el importe que lleva", async (resultado, pestana) => {
    render(
      <GestionesPorResultado
        grupos={grupos478({ [resultado]: [gestion("REM-X", resultado, "nuevo", "75.00")] })}
      />,
    );
    expect(await ingresoDeFila(/REM-X/, pestana, NUEVO)).toBe("₡75");
  });

  it("un resultado en 0 no pinta fila: no se cobró", async () => {
    render(<GestionesPorResultado grupos={grupos478({ entregado: [gestion("REM-X", "entregado", "nuevo", "0.00")] })} />);
    expect(await ingresoDeFila(/REM-X/, /^Entregad/, NUEVO)).toBeNull();
  });

  it("el mensajero no lo ve: es dinero de la empresa", async () => {
    render(
      <GestionesPorResultado
        esMensajero
        grupos={grupos478({ entregado: [gestion("REM-X", "entregado", "nuevo", "120.00")] })}
      />,
    );
    expect(await ingresoDeFila(/REM-X/, /^Entregad/, NUEVO)).toBeNull();
  });

  it("menor 2: la nota del pago a la tienda habla de todos los fletes no entregados", () => {
    montarDetalle(GRUPOS_NUEVO, DESGLOSE);
    expect(
      screen.getByText(
        "Total general menos flete + IVA y comisión + IVA. No descuenta el flete de una gestión no entregada: no recauda contra entrega, así que ese dinero nunca entró en el total general.",
      ),
    ).toBeInTheDocument();
  });
});

describe("SLT-54 R71 — modelo viejo: ni texto ni importe cambian", () => {
  const DESGLOSE = { sla: "100.00", manual: "200.00", total: "300.00" };

  it("tarjeta, región, par y sublíneas, literales", () => {
    montarDetalle(GRUPOS_VIEJO, DESGLOSE);
    const tarjeta = screen.getByRole("region", {
      name: "Ingreso de bodega por devoluciones a origen del cierre",
    });
    expect(tarjeta).toHaveTextContent("Ingreso de bodega por devoluciones a origen");
    expect(tarjeta).toHaveTextContent("₡300");
    expect(within(tarjeta).getByText("Automático (por plazo vencido)")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Manual (mensajero)")).toBeInTheDocument();
    expect(tarjeta).toHaveTextContent("₡100");
    expect(tarjeta).toHaveTextContent("₡200");
    expect(screen.getAllByText(VIEJO).length).toBe(2);
    expect(screen.queryByText(NUEVO)).toBeNull();
  });

  it("la nota del pago a la tienda, literal", () => {
    montarDetalle(GRUPOS_VIEJO, DESGLOSE);
    expect(
      screen.getByText(
        "Total general menos flete + IVA y comisión + IVA. No descuenta el flete por devolución a origen: una devolución a origen no recauda contra entrega, así que ese dinero nunca entró en el total general.",
      ),
    ).toBeInTheDocument();
  });

  it("el rechazo enseña su importe con el rótulo de siempre", async () => {
    montarDetalle(GRUPOS_VIEJO, DESGLOSE);
    expect(await ingresoDeFila(/REM-R/, /Devoluci/, VIEJO)).toBe("₡300");
  });

  it("otro resultado no enseña nada, aunque el dato llegara", async () => {
    render(<GestionesPorResultado grupos={grupos478({ entregado: [gestion("REM-X", "entregado", "viejo", "120.00")] })} />);
    expect(await ingresoDeFila(/REM-X/, /^Entregad/, VIEJO)).toBeNull();
    expect(screen.queryByText(`${NUEVO}:`)).toBeNull();
  });

  it("una gestión sin tarifa congelada se queda en el viejo", async () => {
    const sinTarifa = gestion478({
      gestionId: "REM-X",
      numRemision: "REM-X",
      resultado: "devolucion_a_origen_por_rechazo",
      ingresoBodegaRechazo: "300.00",
      ingresoEmpresa: null,
    });
    render(<GestionesPorResultado grupos={grupos478({ devolucion_a_origen_por_rechazo: [sinTarifa] })} />);
    expect(await ingresoDeFila(/REM-X/, /Devoluci/, VIEJO)).toBe("₡300");
  });
});

describe("SLT-54 R71 — las cascadas siguen al modelo", () => {
  const TOTALES = {
    montoCobrar: "0.00",
    fleteConIva: "0.00",
    fleteDevolucionConIva: "0.00",
    comisionConIva: "0.00",
    total: "0.00",
    flete: "0.00",
    ivaFlete: "0.00",
    fleteDevolucion: "0.00",
    ivaFleteDevolucion: "0.00",
    comisionCod: "0.00",
    ivaComisionCod: "0.00",
  };
  const cascadas = (modeloNuevo?: boolean) => (
    <CascadasCierreMensajero
      mensajeroNombre="Beto"
      estado="aprobado"
      general="10000.00"
      totalesIngreso={TOTALES}
      totalPagoMensajero="2200.00"
      totalIngresoBodegaRechazos="570.00"
      pagoTienda="9000.00"
      cobradoSobreRecaudado="0.00"
      ivaFacturado="0.00"
      netoEmpresa="0.00"
      ganaLaTienda="9000.00"
      fleteRechazoYaCobradoATienda={false}
      partesPorTienda={[]}
      modeloNuevo={modeloNuevo}
    />
  );

  it("nuevo: «Ingreso de bodega», en la línea y en la nota", () => {
    render(cascadas(true));
    expect(screen.getByText(NUEVO)).toBeInTheDocument();
    expect(screen.queryByText(VIEJO)).toBeNull();
    expect(
      screen.getByText(
        `Lo que ${EMPRESA.enFrase} facturó, sin el IVA, menos el pago al mensajero y menos el ingreso de bodega.`,
      ),
    ).toBeInTheDocument();
  });

  it("viejo: rótulo y nota, literales", () => {
    render(cascadas());
    expect(screen.getByText(VIEJO)).toBeInTheDocument();
    expect(screen.queryByText(NUEVO)).toBeNull();
    expect(
      screen.getByText(
        `Lo que ${EMPRESA.enFrase} facturó, sin el IVA, menos el pago al mensajero y menos el ingreso de bodega por devoluciones a origen.`,
      ),
    ).toBeInTheDocument();
  });

  it("el desglose por tienda: su nota, en los dos modelos", () => {
    const { rerender } = render(<DesglosePorTienda partes={[]} de="cierre de Beto" modeloNuevo />);
    expect(
      screen.getByText(
        "El pago al mensajero y el ingreso de bodega son del cierre completo: no están repartidos entre las tiendas.",
      ),
    ).toBeInTheDocument();
    rerender(<DesglosePorTienda partes={[]} de="cierre de Beto" />);
    expect(
      screen.getByText(
        "El pago al mensajero y el ingreso de bodega por devoluciones a origen son del cierre completo: no están repartidos entre las tiendas.",
      ),
    ).toBeInTheDocument();
  });
});
