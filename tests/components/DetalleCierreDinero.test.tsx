// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { DetalleCierre } from "@/components/private/cierres/detalle/DetalleCierre";
import type {
  Audiencia,
  DetalleBodegaVista,
  DetalleMensajeroVista,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";

// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T2.1, T2.2) — las cifras y la
// pestaña «Dinero» LEÍDAS DEL DOM. Los dobles llevan los números de `design.md > Números escritos a
// mano` y cada importe esperado está escrito aquí, tal como lo pinta el formateador compartido
// (sin céntimos cuando valen cero): nunca se compara contra la función que lo produce.

afterEach(cleanup);

const PARTES_DOS_TIENDAS = [
  { tiendaId: "t-norte", tiendaNombre: "Tienda Norte", recaudado: "60000.00", pagoTienda: "56610.00", ganaLaTienda: "55480.00" },
  { tiendaId: "t-sur", tiendaNombre: "Tienda Sur", recaudado: "40000.00", pagoTienda: "37740.00", ganaLaTienda: "36610.00" },
];

const MENSAJERO: DetalleMensajeroVista = {
  mensajeroNombre: "Ana Mensajera",
  destino: "Bodega central · GAM",
  folio: "8F2A11C4",
  estado: "solicitado",
  solicitadoAt: "2026-11-08T00:42:00.000Z",
  resueltoAt: null,
  reprogramadasRetenidasHoy: 0,
  motivoRechazo: null,
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  totalPagoMensajero: "3000.00",
  empresa: {
    pagoTienda: "94350.00",
    cobradoSobreRecaudado: "5650.00",
    ganaLaTienda: "92090.00",
    totalIngresoBodegaRechazos: "500.00",
    ivaFacturado: "910.00",
    netoEmpresa: "3500.00",
    totalesIngreso: { fleteConIva: "4520.00", comisionConIva: "1130.00", fleteDevolucionConIva: "2260.00", total: "7910.00" },
    partesPorTienda: PARTES_DOS_TIENDAS,
    modeloNuevo: false,
  },
  conteos: {
    gestiones: 19,
    entregadas: 12,
    noEntregadas: 7,
    pagosAjustados: 1,
    incidentesSinIndemnizar: 1,
    rechazosDeTienda: 2,
    paquetesVuelven: 6,
    tiendas: 2,
  },
};

const BODEGA: DetalleBodegaVista = {
  zonaNombre: "Limón",
  solicitadoPorNombre: "Sara Satélite",
  folio: "C07B3E19",
  solicitadoAt: "2026-11-08T01:05:00.000Z",
  conciliado: false,
  faltaPorRecibir: "96500.00",
  montoRecibido: null,
  conciliadoAt: null,
  conciliadoPorNombre: null,
  totales: MENSAJERO.totales,
  totalPagoMensajero: "3000.00",
  totalIngresoBodegaRechazos: "500.00",
  paraLaCentral: "96500.00",
  efectivoCubreDescuentos: true,
  pagoTienda: "94350.00",
  cobradoSobreRecaudado: "5650.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  totalesIngreso: MENSAJERO.empresa!.totalesIngreso,
  partesPorTienda: PARTES_DOS_TIENDAS,
  modeloNuevo: false,
  conteos: { gestiones: 31, mensajeros: 2, cierres: 2, pagosAjustados: 2 },
};

const SLOTS = { gestiones: <p>Gestiones del doble</p>, rechazos: <p>Rechazos del doble</p> };

function verMensajero(detalle: DetalleMensajeroVista = MENSAJERO, audiencia: Audiencia = "central") {
  render(
    <DetalleCierre
      tipo="mensajero"
      detalle={detalle}
      audiencia={audiencia}
      modo="solo lectura"
      marco="pagina"
      pestanas={SLOTS}
      acciones={{}}
    />,
  );
}

async function verBodega(detalle: DetalleBodegaVista = BODEGA) {
  render(
    <DetalleCierre
      tipo="bodega"
      detalle={detalle}
      audiencia="central"
      modo="decidir"
      marco="modal"
      pestanas={{ gestiones: null, mensajeros: null, conciliacion: null }}
      acciones={{}}
      onCerrar={() => {}}
    />,
  );
  await screen.findByRole("dialog");
}

/** La cifra que se lee bajo su rótulo. */
function cifra(rotulo: string): string {
  const grupo = screen.getByRole("group", { name: rotulo });
  return grupo.querySelector("[data-cifra]")?.textContent ?? "";
}

/** Cada línea de una cuenta, como se lee: [rótulo con su operador, importe]. */
function lineas(region: string): [string, string][] {
  const cuenta = screen.getByRole("region", { name: region });
  return [...cuenta.querySelectorAll("[data-signo]")].map((l) => [
    l.querySelector("[data-rotulo]")?.textContent ?? "",
    l.querySelector("[data-monto]")?.textContent ?? "",
  ]);
}

describe("mensajero · central: las cuatro cifras y su contexto (R6, R7, R8)", () => {
  it("Recaudado, Se le paga hoy a la tienda, Pago al mensajero y Le queda a la empresa", () => {
    verMensajero();
    const cifras = screen.getByRole("group", { name: "Cifras del cierre" });
    expect(within(cifras).getAllByRole("group").map((g) => g.querySelector("[data-cifra]")?.textContent)).toEqual([
      "₡100.000",
      "₡94.350",
      "₡3.000",
      "₡3.500",
    ]);
    expect(cifra("Recaudado")).toBe("₡100.000");
    expect(cifra("Se le paga hoy a la tienda")).toBe("₡94.350");
    expect(cifra("Pago al mensajero")).toBe("₡3.000");
    expect(cifra("Le queda a la empresa")).toBe("₡3.500");
    expect(screen.getByText("2 tiendas · ganan en total ₡92.090")).toBeTruthy();
    expect(screen.getByText("19 gestiones · 1 ajustada")).toBeTruthy();
  });

  it("bajo Recaudado van efectivo y SINPE; la transferencia en cero no aparece", () => {
    verMensajero();
    const metodos = screen.getByRole("group", { name: "Recaudado" }).querySelector("dl")!;
    expect(metodos.textContent).toBe("Efectivo₡70.000SINPE₡30.000");
    expect(screen.queryByText("Transferencia")).toBeNull();
  });
});

describe("mensajero · «Dinero»: reparto, dos cuentas y por tienda (R14, R15)", () => {
  it("el reparto parte lo recaudado en lo de la tienda y lo que cobra la empresa", () => {
    verMensajero();
    const reparto = screen.getByRole("region", { name: "Reparto de lo recaudado" });
    expect(reparto.textContent).toContain("¿A dónde va lo recaudado?");
    expect(reparto.textContent).toContain("Se le paga hoy a la tienda ₡94.350");
    expect(reparto.textContent).toContain("Sale de lo recaudado ₡5.650");
  });

  it("«Lo que se le factura a la tienda»: partidas, subtotal punteado, «+» y total en negrita", () => {
    verMensajero();
    expect(lineas("Lo que se le factura a la tienda")).toEqual([
      ["Flete por entregado + IVA", "₡4.520"],
      ["Comisión COD + IVA", "₡1.130"],
      ["Sale de lo recaudado", "₡5.650"],
      ["+ Flete por devolución a origen + IVA", "₡2.260"],
      ["Total facturado", "₡7.910"],
    ]);
    const cuenta = screen.getByRole("region", { name: "Lo que se le factura a la tienda" });
    const sub = cuenta.querySelector('[data-tipo="subtotal"]')!;
    const total = cuenta.querySelector('[data-tipo="total"]')!;
    expect(sub.className).toContain("border-dashed");
    expect(total.className).toContain("font-bold");
    expect(total.className).not.toContain("border-dashed");
  });

  it("«De lo facturado, le queda a la empresa»: el «−» va delante de cada resta", () => {
    verMensajero();
    expect(lineas("De lo facturado, le queda a la empresa")).toEqual([
      ["Total facturado", "₡7.910"],
      ["− IVA (no es de la empresa)", "₡910"],
      ["− Pago al mensajero", "₡3.000"],
      ["− Ingreso de bodega por devoluciones a origen", "₡500"],
      ["Le queda a la empresa", "₡3.500"],
    ]);
  });

  it("«Por tienda» con dos tiendas, en el orden del servidor; con una, no se pinta", () => {
    verMensajero();
    const porTienda = screen.getByRole("region", { name: "Por tienda" });
    const filas = within(porTienda)
      .getAllByRole("row")
      .slice(1)
      .map((f) => [...f.children].map((c) => c.textContent));
    expect(filas).toEqual([
      ["Tienda Norte", "₡60.000", "₡56.610", "₡55.480"],
      ["Tienda Sur", "₡40.000", "₡37.740", "₡36.610"],
    ]);
    cleanup();
    verMensajero({
      ...MENSAJERO,
      conteos: { ...MENSAJERO.conteos, tiendas: 1 },
      empresa: { ...MENSAJERO.empresa!, partesPorTienda: PARTES_DOS_TIENDAS.slice(0, 1) },
    });
    expect(screen.queryByRole("region", { name: "Por tienda" })).toBeNull();
  });
});

describe("bodega: «Debe llegar a la central» y las tres cuentas (R6, R16)", () => {
  it("las cuatro cifras de bodega", async () => {
    await verBodega();
    expect(cifra("Recaudado")).toBe("₡100.000");
    expect(cifra("Debe llegar a la central")).toBe("₡96.500");
    expect(cifra("Pago a mensajeros")).toBe("₡3.000");
    expect(cifra("Le queda a la empresa")).toBe("₡3.500");
  });

  it("lo que va a la central, lo que se factura y lo que le queda, con − mensajeros y − satélite", async () => {
    await verBodega();
    const reparto = screen.getByRole("region", { name: "Reparto de lo recaudado" });
    expect(reparto.textContent).toContain("Debe llegar a la central ₡96.500");
    expect(reparto.textContent).toContain("Pago a mensajeros ₡3.000");
    expect(reparto.textContent).toContain("Gana la bodega satélite ₡500");
    expect(lineas("Lo que va a la central")).toEqual([
      ["Total general", "₡100.000"],
      ["− Pago a mensajeros", "₡3.000"],
      ["− Gana la bodega satélite", "₡500"],
      ["Debe llegar a la central", "₡96.500"],
    ]);
    expect(lineas("Lo que se le factura a la tienda").at(-1)).toEqual(["Total facturado", "₡7.910"]);
    expect(lineas("De lo facturado, le queda a la empresa")).toEqual([
      ["Total facturado", "₡7.910"],
      ["− IVA (no es de la empresa)", "₡910"],
      ["− Pago a mensajeros", "₡3.000"],
      ["− Gana la bodega satélite", "₡500"],
      ["Le queda a la empresa", "₡3.500"],
    ]);
    expect(screen.getByRole("region", { name: "Por tienda" })).toBeTruthy();
  });
});

describe("R9 — dentro de «Dinero», una cifra tiene un solo nombre", () => {
  /** Cada importe del panel «Dinero» con TODOS los rótulos bajo los que se lee (reparto y cuentas). */
  function rotulosPorImporte(): Record<string, string[]> {
    const panel = screen.getByRole("tabpanel");
    const vistos: Record<string, Set<string>> = {};
    const anotar = (importe: string, rotulo: string) => (vistos[importe] ??= new Set()).add(rotulo);
    const reparto = within(panel).getByRole("region", { name: "Reparto de lo recaudado" });
    for (const li of reparto.querySelectorAll("li")) {
      const importe = li.querySelector("strong")?.textContent ?? "";
      anotar(importe, (li.textContent ?? "").replace(importe, "").trim());
    }
    for (const linea of panel.querySelectorAll("[data-signo]")) {
      const rotulo = (linea.querySelector("[data-rotulo]")?.textContent ?? "").replace(/^[−+] /, "");
      anotar(linea.querySelector("[data-monto]")?.textContent ?? "", rotulo);
    }
    return Object.fromEntries(Object.entries(vistos).map(([k, v]) => [k, [...v]]));
  }

  it("mensajero: «Se le paga hoy a la tienda» y «Sale de lo recaudado», sin otro rótulo", () => {
    verMensajero();
    const r = rotulosPorImporte();
    expect(r["₡94.350"]).toEqual(["Se le paga hoy a la tienda"]);
    expect(r["₡5.650"]).toEqual(["Sale de lo recaudado"]);
  });

  it("bodega: «Debe llegar a la central», «Pago a mensajeros» y «Gana la bodega satélite», sin otro rótulo", async () => {
    await verBodega();
    const r = rotulosPorImporte();
    expect(r["₡96.500"]).toEqual(["Debe llegar a la central"]);
    expect(r["₡3.000"]).toEqual(["Pago a mensajeros"]);
    expect(r["₡500"]).toEqual(["Gana la bodega satélite"]);
  });
});

describe("lo que NO se pinta (R9)", () => {
  it("audiencia mensajero: tres cifras y ni un importe ni un rótulo del dinero de la empresa", () => {
    // El doble lleva el dinero de la empresa a propósito, como si quien monta se lo hubiera
    // dejado: la pantalla del mensajero no lo pinta igual.
    verMensajero(MENSAJERO, "mensajero");
    const cifras = screen.getByRole("group", { name: "Cifras del cierre" });
    const rotulos = within(cifras)
      .getAllByRole("group")
      .map((g) => document.getElementById(g.getAttribute("aria-labelledby") ?? "")?.textContent);
    expect(rotulos).toEqual(["Recaudado", "Gestiones", "Tu ganancia"]);
    expect(cifra("Gestiones")).toBe("19");
    expect(cifra("Tu ganancia")).toBe("₡3.000");
    const texto = document.body.textContent ?? "";
    for (const ajeno of ["₡94.350", "₡5.650", "₡7.910", "₡910", "₡3.500", "₡500", "₡92.090"]) {
      expect(texto, ajeno).not.toContain(ajeno);
    }
    for (const rotulo of ["Le queda", "facturado", "Se lo cobra", "Se le paga hoy", "Ingreso de bodega", "IVA"]) {
      expect(texto, rotulo).not.toContain(rotulo);
    }
    expect(screen.queryByRole("tab", { name: "Dinero" })).toBeNull();
  });

  it("ningún «Debe» ni «Ganancia» de la empresa en el detalle del mensajero", () => {
    verMensajero();
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/\bDebe\b/);
    expect(texto).not.toMatch(/Ganancia/);
  });

  it("un «Le queda a la empresa» negativo se pinta con su signo, nunca en cero", () => {
    verMensajero({ ...MENSAJERO, empresa: { ...MENSAJERO.empresa!, netoEmpresa: "-250.00" } });
    expect(cifra("Le queda a la empresa")).toBe("-₡250");
    expect(lineas("De lo facturado, le queda a la empresa").at(-1)).toEqual(["Le queda a la empresa", "-₡250"]);
  });
});

// SLT-111 «Cifras del servidor: reparto en % y señales de la cola» (T5.3, R266, R71) — con los
// porcentajes del servidor el bloque «¿A dónde va lo recaudado?» dibuja la barra y el «(n %)» de cada
// entrada, con el entero recibido tal cual; sin ellos, solo la leyenda. Literales escritos a mano
// (MA [94, 6]; BX [97, 3, 0], PA1: la parte de ₡500 queda «(0 %)»).
describe("SLT-111 — la barra del reparto con los porcentajes del servidor (R266)", () => {
  function franjas(): string[] {
    const reparto = screen.getByRole("region", { name: "Reparto de lo recaudado" });
    return [...reparto.querySelectorAll<HTMLElement>('div[aria-hidden="true"] > div')].map((f) => f.style.width);
  }
  function leyenda(): string[] {
    const reparto = screen.getByRole("region", { name: "Reparto de lo recaudado" });
    return [...reparto.querySelectorAll("li")].map((li) => li.textContent ?? "");
  }

  it("mensajero con [94, 6]: dos franjas de 94 % y 6 % y el «(n %)» en la leyenda", () => {
    verMensajero({ ...MENSAJERO, empresa: { ...MENSAJERO.empresa!, porcentajesReparto: [94, 6] } });
    expect(franjas()).toEqual(["94%", "6%"]);
    expect(leyenda()).toEqual(["Se le paga hoy a la tienda ₡94.350 (94 %)", "Sale de lo recaudado ₡5.650 (6 %)"]);
  });

  it("bodega con [97, 3, 0]: tres franjas y «(0 %)» en «Gana la bodega satélite ₡500»", async () => {
    await verBodega({ ...BODEGA, porcentajesReparto: [97, 3, 0] });
    expect(franjas()).toEqual(["97%", "3%", "0%"]);
    expect(leyenda()).toEqual([
      "Debe llegar a la central ₡96.500 (97 %)",
      "Pago a mensajeros ₡3.000 (3 %)",
      "Gana la bodega satélite ₡500 (0 %)",
    ]);
  });

  it("el cliente pinta el entero recibido, sin derivarlo de los importes (R71)", () => {
    // [61, 39] no sale de ₡94.350 / ₡5.650: si el cliente lo recalculara, no aparecería.
    verMensajero({ ...MENSAJERO, empresa: { ...MENSAJERO.empresa!, porcentajesReparto: [61, 39] } });
    expect(franjas()).toEqual(["61%", "39%"]);
    expect(leyenda()).toEqual(["Se le paga hoy a la tienda ₡94.350 (61 %)", "Sale de lo recaudado ₡5.650 (39 %)"]);
  });

  it("con `null` o sin el campo: ninguna franja y ningún «%», solo la leyenda con los importes", async () => {
    verMensajero({ ...MENSAJERO, empresa: { ...MENSAJERO.empresa!, porcentajesReparto: null } });
    expect(franjas()).toEqual([]);
    expect(leyenda()).toEqual(["Se le paga hoy a la tienda ₡94.350", "Sale de lo recaudado ₡5.650"]);
    cleanup();
    await verBodega({ ...BODEGA, porcentajesReparto: null });
    expect(franjas()).toEqual([]);
    expect(screen.getByRole("region", { name: "Reparto de lo recaudado" }).textContent).not.toContain("%");
    cleanup();
    await verBodega();
    expect(franjas()).toEqual([]);
    expect(screen.getByRole("region", { name: "Reparto de lo recaudado" }).textContent).not.toContain("%");
  });
});
