// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DetalleCierre,
  type AccionesPie,
  type DetalleCierreProps,
} from "@/components/private/cierres/detalle/DetalleCierre";
import type {
  Audiencia,
  DetalleBodegaVista,
  DetalleMensajeroVista,
  Modo,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";

// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T2.3) — el detalle único:
// marco, cabecera, franja, pestañas, un solo scroll y pie. Los textos esperados van escritos aquí.

afterEach(cleanup);

const MENSAJERO: DetalleMensajeroVista = {
  mensajeroNombre: "Ana Mensajera",
  destino: "Bodega central · GAM",
  folio: "8F2A11C4",
  estado: "solicitado",
  solicitadoAt: "2026-11-08T00:42:00.000Z",
  resueltoAt: null,
  reprogramadasRetenidasHoy: 2,
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
    partesPorTienda: [],
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
    tiendas: 1,
  },
};

const SIN_ASUNTOS: DetalleMensajeroVista = {
  ...MENSAJERO,
  reprogramadasRetenidasHoy: 0,
  conteos: { ...MENSAJERO.conteos, pagosAjustados: 0, incidentesSinIndemnizar: 0, rechazosDeTienda: 0, paquetesVuelven: 0 },
};

const BODEGA: DetalleBodegaVista = {
  zonaNombre: "Limón",
  solicitadoPorNombre: "Sara Satélite",
  folio: "C07B3E19",
  solicitadoAt: "2026-11-08T01:05:00.000Z",
  conciliado: false,
  faltaPorRecibir: "96500.00",
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
  partesPorTienda: [],
  modeloNuevo: false,
  conteos: { gestiones: 31, mensajeros: 2, pagosAjustados: 2 },
};

const SLOTS_MENSAJERO = {
  gestiones: <p>Lista de gestiones del doble</p>,
  rechazos: <p>Lista de rechazos del doble</p>,
  corregir: <p>Cómo corregir del doble</p>,
};
const SLOTS_BODEGA = {
  gestiones: <p>Lista de gestiones del doble</p>,
  mensajeros: <p>Lista de mensajeros del doble</p>,
  conciliacion: <p>Conciliación del doble</p>,
};

function mensajero(
  audiencia: Audiencia,
  modo: Modo,
  extra: Partial<Extract<DetalleCierreProps, { tipo: "mensajero" }>> = {},
) {
  return render(
    <DetalleCierre
      tipo="mensajero"
      detalle={MENSAJERO}
      audiencia={audiencia}
      modo={modo}
      marco="modal"
      pestanas={SLOTS_MENSAJERO}
      acciones={{}}
      onCerrar={() => {}}
      {...extra}
    />,
  );
}

function bodega(audiencia: "central" | "satelite", modo: "decidir" | "solo lectura", detalle = BODEGA, acciones: AccionesPie = {}) {
  return render(
    <DetalleCierre
      tipo="bodega"
      detalle={detalle}
      audiencia={audiencia}
      modo={modo}
      marco="modal"
      pestanas={SLOTS_BODEGA}
      acciones={acciones}
      onCerrar={() => {}}
    />,
  );
}

/** La cabecera del detalle abierto: donde viven la identidad y el estado (R2). */
async function cabecera(): Promise<HTMLElement> {
  const dialogo = await screen.findByRole("dialog");
  return dialogo.querySelector("header") as HTMLElement;
}

describe("R13 — marco: modal con nombre accesible y X, o región sin X", () => {
  it("modal de mensajero: dialog «Detalle del cierre · Cierre de Ana Mensajera» con su X", async () => {
    mensajero("central", "decidir");
    const dialogo = await screen.findByRole("dialog", { name: "Detalle del cierre · Cierre de Ana Mensajera" });
    expect(within(dialogo).getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });

  it("modal de bodega: «Detalle del cierre de bodega · Cierre de bodega · Limón»", async () => {
    bodega("central", "decidir");
    expect(
      await screen.findByRole("dialog", { name: "Detalle del cierre de bodega · Cierre de bodega · Limón" }),
    ).toBeTruthy();
  });

  it("página: una región sin X ni diálogo", () => {
    mensajero("mensajero", "en curso", {
      marco: "pagina",
      onCerrar: undefined,
      detalle: { ...MENSAJERO, estado: null, folio: null, empresa: null },
    });
    expect(screen.getByRole("region", { name: "Detalle del cierre · Tu cierre del día" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
  });
});

describe("R2, R3 — identidad, estado y retención arriba", () => {
  it("el estado de cada modo sale de `EstadoCierreBadge` / `estadoConciliacionDe`", async () => {
    mensajero("central", "decidir");
    expect(await screen.findByText("Solicitado")).toBeTruthy();
    cleanup();
    mensajero("central", "solo lectura", { detalle: { ...MENSAJERO, estado: "aprobado", resueltoAt: "2026-11-08T01:10:00.000Z" } });
    expect(await screen.findByText("Aprobado")).toBeTruthy();
    cleanup();
    mensajero("mensajero", "en curso", { marco: "pagina", detalle: { ...MENSAJERO, estado: null, folio: null, empresa: null } });
    expect(screen.getByText("Sin solicitar")).toBeTruthy();
    expect(screen.getByText("Solicitud nueva")).toBeTruthy();
    cleanup();
    bodega("central", "decidir");
    expect(within(await cabecera()).getByText("Pendiente de conciliar")).toBeTruthy();
    cleanup();
    bodega("central", "solo lectura", { ...BODEGA, conciliado: true, faltaPorRecibir: "0.00" });
    expect(within(await cabecera()).getByText("Recibido")).toBeTruthy();
    cleanup();
    bodega("central", "solo lectura", { ...BODEGA, conciliado: true, faltaPorRecibir: "1234.56" });
    expect(within(await cabecera()).getByText("Recibido incompleto")).toBeTruthy();
  });

  it("cabecera: destino, folio y fecha de solicitud", async () => {
    mensajero("central", "decidir");
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo.textContent).toContain("Bodega central · GAM · 8F2A11C4 · Solicitado 2026-11-07 18:42");
  });

  it("aprobado: la fecha de resolución y quién lo resolvió", async () => {
    mensajero("central", "solo lectura", {
      detalle: { ...MENSAJERO, estado: "aprobado", resueltoAt: "2026-11-08T01:10:00.000Z", resueltoPorNombre: "Carlos R." },
    });
    expect((await cabecera()).textContent).toContain(
      "Bodega central · GAM · 8F2A11C4 · Solicitado 2026-11-07 18:42 · Aprobado 2026-11-07 19:10 por Carlos R.",
    );
  });

  it("rechazado: la fecha del rechazo", async () => {
    mensajero("central", "solo lectura", {
      detalle: { ...MENSAJERO, estado: "rechazado", resueltoAt: "2026-11-08T01:20:00.000Z" },
    });
    expect((await cabecera()).textContent).toContain("Solicitado 2026-11-07 18:42 · Rechazado 2026-11-07 19:20");
  });

  it("vencido: «Del … · venció sin solicitarse»", async () => {
    mensajero("central", "vencido", { detalle: { ...MENSAJERO, estado: "vencido" } });
    expect((await cabecera()).textContent).toContain("8F2A11C4 · Del 2026-11-07 18:42 · venció sin solicitarse");
  });

  it("bodega: quién lo solicitó, cuántos mensajeros, folio y fecha", async () => {
    bodega("central", "decidir");
    expect((await cabecera()).textContent).toContain(
      "Bodega satélite · lo solicitó Sara Satélite · 2 mensajeros · C07B3E19 · Solicitado 2026-11-07 19:05",
    );
  });

  it("bodega recibida: «Recibido … por …»", async () => {
    bodega("central", "solo lectura", {
      ...BODEGA,
      conciliado: true,
      faltaPorRecibir: "0.00",
      conciliadoAt: "2026-11-08T15:12:00.000Z",
      conciliadoPorNombre: "Carlos R.",
    });
    expect((await cabecera()).textContent).toContain(
      "Solicitado 2026-11-07 19:05 · Recibido 2026-11-08 09:12 por Carlos R.",
    );
  });

  it("con 2 reprogramadas retenidas la cabecera lo dice; con 0, nada", async () => {
    mensajero("central", "decidir");
    expect(await screen.findByText("Retiene 2 paquetes reprogramados para hoy")).toBeTruthy();
    cleanup();
    mensajero("central", "decidir", { detalle: SIN_ASUNTOS });
    await screen.findByRole("dialog");
    expect(screen.queryByText(/Retiene/)).toBeNull();
  });
});

describe("R4, R5 — la franja de lo que pide atención", () => {
  it("pinta los conteos del doble y queda fuera del panel con scroll", async () => {
    mensajero("central", "decidir");
    const franja = await screen.findByRole("status");
    expect(franja.textContent).toBe(
      "Por revisar:1 incidente sin indemnizar · 2 rechazados por la tienda · 1 pago al mensajero ajustado · 6 paquetes vuelven a bodega",
    );
    expect(screen.getByRole("tabpanel").contains(franja)).toBe(false);
  });

  it("sin asuntos no se pinta", async () => {
    mensajero("central", "decidir", { detalle: SIN_ASUNTOS });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("R10, R11, R20 — pestañas y un solo scroll", () => {
  it("tablist con sus tabs, abre en la primera y solo el panel desplaza", async () => {
    mensajero("central", "decidir");
    const lista = await screen.findByRole("tablist", { name: "Secciones del cierre" });
    const tabs = within(lista).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Dinero", "Gestiones (19)", "Rechazados por la tienda (2)"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    const paneles = screen.getAllByRole("tabpanel");
    expect(paneles).toHaveLength(1);
    const conScroll = document.body.querySelectorAll(".overflow-auto");
    expect(conScroll).toHaveLength(1);
    expect(conScroll[0]).toBe(paneles[0]);
  });

  it("cambiar de pestaña pinta su cuerpo en el mismo panel", async () => {
    mensajero("central", "decidir");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Gestiones (19)" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Lista de gestiones del doble");
    await user.click(screen.getByRole("tab", { name: "Rechazados por la tienda (2)" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Lista de rechazos del doble");
  });

  it("«Pago al mensajero» solo con el cierre aprobado y su cuerpo puesto", async () => {
    const aprobado = { ...MENSAJERO, estado: "aprobado" as const };
    mensajero("central", "solo lectura", { detalle: aprobado, pestanas: { ...SLOTS_MENSAJERO, pago: <p>Pago</p> } });
    expect(await screen.findByRole("tab", { name: "Pago al mensajero" })).toBeTruthy();
    cleanup();
    mensajero("central", "decidir", { pestanas: { ...SLOTS_MENSAJERO, pago: <p>Pago</p> } });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("tab", { name: "Pago al mensajero" })).toBeNull();
  });
});

describe("R12 — el pie fijo y sus acciones", () => {
  it("decidir: «Rechazar» y «Revisar paquetes y aprobar», cada uno con su callback", async () => {
    const rechazar = vi.fn();
    const aprobar = vi.fn();
    mensajero("satelite", "decidir", { acciones: { rechazar, aprobar } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Revisar paquetes y aprobar" }));
    expect(aprobar).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(rechazar).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Aprobar pide confirmar los 6 paquetes e indemnizar 1 incidente.")).toBeTruthy();
  });

  it("decidir sin paquetes que vuelvan: el botón es «Aprobar»", async () => {
    mensajero("central", "decidir", { detalle: SIN_ASUNTOS, acciones: { aprobar: () => {}, rechazar: () => {} } });
    expect(await screen.findByRole("button", { name: "Aprobar" })).toBeTruthy();
  });

  it("sin el permiso (sin callback) la acción no aparece", async () => {
    mensajero("central", "decidir", { acciones: {} });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    expect(screen.queryByRole("button", { name: /aprobar/i })).toBeNull();
  });

  it("vencido: «Cerrar» y «Destrabar cierre vencido»", async () => {
    const destrabar = vi.fn();
    const onCerrar = vi.fn();
    mensajero("central", "vencido", { acciones: { destrabar }, onCerrar, detalle: { ...MENSAJERO, estado: "vencido" } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Destrabar cierre vencido" }));
    expect(destrabar).toHaveBeenCalledTimes(1);
    // Dos «Cerrar»: la X de arriba y el del pie. El del pie es el último.
    const cerrar = screen.getAllByRole("button", { name: "Cerrar" });
    expect(cerrar).toHaveLength(2);
    await user.click(cerrar[1]);
    expect(onCerrar).toHaveBeenCalled();
  });

  it("solo lectura: solo «Cerrar»", async () => {
    mensajero("central", "solo lectura");
    await screen.findByRole("dialog");
    const pie = screen.getByText(/^Recaudado ₡100\.000 · 19 gestiones$/).parentElement!;
    expect(within(pie).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cerrar"]);
  });

  it("bodega central: las acciones de la conciliación y «Cerrar»; la satélite, solo «Cerrar»", async () => {
    const conciliacion = <button type="button">Marcar recibido</button>;
    bodega("central", "decidir", BODEGA, { conciliacion });
    expect(await screen.findByRole("button", { name: "Marcar recibido" })).toBeTruthy();
    expect(screen.getByText("Declarado ₡96.500 · márcalo recibido cuando llegue")).toBeTruthy();
    cleanup();
    bodega("satelite", "solo lectura", BODEGA, { conciliacion });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Marcar recibido" })).toBeNull();
  });

  it("el mensajero: solicitar, re-solicitar el rechazado y el vencido", async () => {
    const solicitar = vi.fn();
    const solicitarRechazado = vi.fn();
    const solicitarVencido = vi.fn();
    const acciones = { solicitar, solicitarRechazado, solicitarVencido };
    const user = userEvent.setup();
    const sinEmpresa = { ...MENSAJERO, empresa: null };

    mensajero("mensajero", "en curso", { marco: "pagina", acciones, detalle: { ...sinEmpresa, estado: null } });
    await user.click(screen.getByRole("button", { name: "Solicitar cierre" }));
    expect(solicitar).toHaveBeenCalledTimes(1);
    cleanup();

    mensajero("mensajero", "rechazado", { marco: "pagina", acciones, detalle: { ...sinEmpresa, estado: "rechazado" } });
    await user.click(screen.getByRole("button", { name: "Solicitar aprobación del cierre rechazado" }));
    expect(solicitarRechazado).toHaveBeenCalledTimes(1);
    cleanup();

    mensajero("mensajero", "vencido", { marco: "pagina", acciones, detalle: { ...sinEmpresa, estado: "vencido" } });
    await user.click(screen.getByRole("button", { name: "Solicitar aprobación del cierre vencido" }));
    expect(solicitarVencido).toHaveBeenCalledTimes(1);
  });
});

describe("R1 — un componente para todo", () => {
  it("el mismo `DetalleCierre` pinta las nueve combinaciones de R12", async () => {
    const combos: [string, () => void][] = [
      ["mensajero · central · decidir", () => mensajero("central", "decidir")],
      ["mensajero · satélite · vencido", () => mensajero("satelite", "vencido")],
      ["mensajero · central · solo lectura", () => mensajero("central", "solo lectura")],
      ["bodega · central", () => bodega("central", "decidir")],
      ["bodega · satélite", () => bodega("satelite", "solo lectura")],
      ["mensajero · mensajero · en curso", () => mensajero("mensajero", "en curso", { marco: "pagina", detalle: { ...MENSAJERO, estado: null, empresa: null } })],
      ["mensajero · mensajero · rechazado", () => mensajero("mensajero", "rechazado", { marco: "pagina", detalle: { ...MENSAJERO, estado: "rechazado", empresa: null } })],
      ["mensajero · mensajero · vencido", () => mensajero("mensajero", "vencido", { marco: "pagina", detalle: { ...MENSAJERO, estado: "vencido", empresa: null } })],
      ["mensajero · mensajero · solo lectura", () => mensajero("mensajero", "solo lectura", { detalle: { ...MENSAJERO, estado: "aprobado", empresa: null } })],
    ];
    for (const [combo, montar] of combos) {
      montar();
      const marco = screen.queryByRole("dialog") ?? screen.getByRole("region", { name: /^Detalle del cierre/ });
      expect(marco.getAttribute("aria-labelledby") ?? "", combo).not.toBe("");
      expect(screen.getByRole("tablist", { name: "Secciones del cierre" }), combo).toBeTruthy();
      cleanup();
    }
  });
});
